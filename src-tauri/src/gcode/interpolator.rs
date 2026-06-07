use super::parser::{BlockData, MotionType};
use super::GCodeError;
use crate::models::*;
use nalgebra::{Point3, Vector3};

struct InterpolatorState {
    x: f64,
    y: f64,
    z: f64,
    a: f64,
    b: f64,
    c: f64,
    feed: f64,
    spindle: f64,
    absolute_mode: bool,
}

impl Default for InterpolatorState {
    fn default() -> Self {
        InterpolatorState {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            a: 0.0,
            b: 0.0,
            c: 0.0,
            feed: 100.0,
            spindle: 0.0,
            absolute_mode: true,
        }
    }
}

pub fn interpolate(blocks: Vec<BlockData>) -> Result<ToolpathData, GCodeError> {
    let mut state = InterpolatorState::default();
    let mut points = Vec::new();
    let mut bounds = Bounds::default();
    let mut total_distance = 0.0;
    let mut estimated_time = 0.0;

    for block in blocks {
        let target_x = if let Some(x) = block.x {
            if state.absolute_mode {
                x
            } else {
                state.x + x
            }
        } else {
            state.x
        };
        let target_y = if let Some(y) = block.y {
            if state.absolute_mode {
                y
            } else {
                state.y + y
            }
        } else {
            state.y
        };
        let target_z = if let Some(z) = block.z {
            if state.absolute_mode {
                z
            } else {
                state.z + z
            }
        } else {
            state.z
        };
        let target_a = if let Some(a) = block.a { a } else { state.a };
        let target_c = if let Some(c) = block.c { c } else { state.c };

        if let Some(f) = block.feed {
            state.feed = f;
        }
        if let Some(s) = block.spindle {
            state.spindle = s;
        }

        let motion = block.motion.clone();

        match motion {
            Some(MotionType::Rapid) => {
                let point = Toolpoint {
                    x: target_x,
                    y: target_y,
                    z: target_z,
                    a: target_a,
                    c: target_c,
                    feed: state.feed,
                    spindle: state.spindle,
                    line_number: block.line_number,
                };
                bounds.expand(&point);
                points.push(point);
            }
            Some(MotionType::Linear) => {
                let start = Point3::new(state.x, state.y, state.z);
                let end = Point3::new(target_x, target_y, target_z);
                let dist = (end - start).norm();

                if dist > 1e-6 {
                    let steps = (dist / 0.1).max(1.0) as usize;
                    for i in 1..=steps {
                        let t = i as f64 / steps as f64;
                        let p = start + (end - start) * t;
                        let a_lerp = state.a + (target_a - state.a) * t;
                        let c_lerp = state.c + (target_c - state.c) * t;
                        let point = Toolpoint {
                            x: p.x,
                            y: p.y,
                            z: p.z,
                            a: a_lerp,
                            c: c_lerp,
                            feed: state.feed,
                            spindle: state.spindle,
                            line_number: block.line_number,
                        };
                        bounds.expand(&point);
                        points.push(point);
                    }
                }

                total_distance += dist;
                if state.feed > 0.0 {
                    estimated_time += dist / state.feed * 60.0;
                }
            }
            Some(MotionType::ClockwiseArc) | Some(MotionType::CounterClockwiseArc) => {
                let ccw = matches!(motion, Some(MotionType::CounterClockwiseArc));
                interpolate_arc(
                    &mut points,
                    &mut bounds,
                    &state,
                    target_x,
                    target_y,
                    target_z,
                    target_a,
                    target_c,
                    block.i,
                    block.j,
                    block.k,
                    block.r,
                    ccw,
                    block.line_number,
                    &mut total_distance,
                    &mut estimated_time,
                )?;
            }
            Some(MotionType::Dwell) => {}
            None => {
                let point = Toolpoint {
                    x: target_x,
                    y: target_y,
                    z: target_z,
                    a: target_a,
                    c: target_c,
                    feed: state.feed,
                    spindle: state.spindle,
                    line_number: block.line_number,
                };
                bounds.expand(&point);
                points.push(point);
            }
        }

        state.x = target_x;
        state.y = target_y;
        state.z = target_z;
        state.a = target_a;
        state.c = target_c;
    }

    if points.is_empty() {
        return Err(GCodeError::InterpolationError(
            "No toolpath points generated".to_string(),
        ));
    }

    Ok(ToolpathData {
        points,
        total_distance,
        estimated_time,
        bounds,
    })
}

#[allow(clippy::too_many_arguments)]
fn interpolate_arc(
    points: &mut Vec<Toolpoint>,
    bounds: &mut Bounds,
    state: &InterpolatorState,
    target_x: f64,
    target_y: f64,
    target_z: f64,
    target_a: f64,
    target_c: f64,
    i: Option<f64>,
    j: Option<f64>,
    k: Option<f64>,
    r: Option<f64>,
    ccw: bool,
    line_number: usize,
    total_distance: &mut f64,
    estimated_time: &mut f64,
) -> Result<(), GCodeError> {
    let start = Point3::new(state.x, state.y, state.z);
    let end = Point3::new(target_x, target_y, target_z);

    let center = if let (Some(i), Some(j)) = (i, j) {
        Point3::new(state.x + i, state.y + j, state.z + k.unwrap_or(0.0))
    } else if let Some(radius) = r {
        let mid = Point3::new(
            (start.x + end.x) / 2.0,
            (start.y + end.y) / 2.0,
            (start.z + end.z) / 2.0,
        );
        let perp = Vector3::new(-(end.y - start.y), end.x - start.x, 0.0);
        let perp_len = perp.norm();
        if perp_len < 1e-10 {
            return Err(GCodeError::InterpolationError(
                "Invalid arc: start and end are the same".to_string(),
            ));
        }
        let perp = perp / perp_len;
        let chord_len = (end - start).norm();
        let h_sq = radius * radius - (chord_len / 2.0) * (chord_len / 2.0);
        if h_sq < 0.0 {
            return Err(GCodeError::InterpolationError(
                "Invalid arc: radius too small".to_string(),
            ));
        }
        let h = h_sq.sqrt();
        let sign = if ccw { 1.0 } else { -1.0 };
        Point3::new(mid.x + perp.x * h * sign, mid.y + perp.y * h * sign, mid.z)
    } else {
        return Err(GCodeError::InterpolationError(
            "Arc requires I,J or R parameter".to_string(),
        ));
    };

    let v1 = start - center;
    let v2 = end - center;
    let radius = v1.norm();

    if radius < 1e-10 {
        return Err(GCodeError::InterpolationError(
            "Arc radius is zero".to_string(),
        ));
    }

    let angle_start = v1.x.atan2(v1.y);
    let angle_end = v2.x.atan2(v2.y);
    let mut delta_angle = angle_end - angle_start;

    if ccw {
        if delta_angle < 0.0 {
            delta_angle += 2.0 * std::f64::consts::PI;
        }
    } else {
        if delta_angle > 0.0 {
            delta_angle -= 2.0 * std::f64::consts::PI;
        }
    }

    let arc_length = radius * delta_angle.abs();
    let num_steps = (arc_length / 0.1).max(1.0) as usize;

    for step in 1..=num_steps {
        let t = step as f64 / num_steps as f64;
        let angle = angle_start + delta_angle * t;
        let x = center.x + radius * angle.sin();
        let y = center.y + radius * angle.cos();
        let z = start.z + (end.z - start.z) * t;
        let a_lerp = state.a + (target_a - state.a) * t;
        let c_lerp = state.c + (target_c - state.c) * t;

        let point = Toolpoint {
            x,
            y,
            z,
            a: a_lerp,
            c: c_lerp,
            feed: state.feed,
            spindle: state.spindle,
            line_number,
        };
        bounds.expand(&point);
        points.push(point);
    }

    *total_distance += arc_length;
    if state.feed > 0.0 {
        *estimated_time += arc_length / state.feed * 60.0;
    }

    Ok(())
}
