use crate::models::*;
use nalgebra::{Matrix4, Point3, Rotation3, Vector3};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum KinematicsError {
    #[error("Out of workspace: {0}")]
    OutOfWorkspace(String),
    #[error("Singularity detected")]
    Singularity,
}

pub fn inverse_kinematics(
    point: &Toolpoint,
    config: &MachineConfig,
) -> Result<MachineAxes, KinematicsError> {
    let mut axes = MachineAxes {
        x: point.x,
        y: point.y,
        z: point.z,
        a: point.a,
        c: point.c,
    };

    if axes.a < config.a_axis_min || axes.a > config.a_axis_max {
        return Err(KinematicsError::OutOfWorkspace(format!(
            "A axis {} out of range [{}, {}]",
            axes.a, config.a_axis_min, config.a_axis_max
        )));
    }
    if axes.c < config.c_axis_min || axes.c > config.c_axis_max {
        return Err(KinematicsError::OutOfWorkspace(format!(
            "C axis {} out of range [{}, {}]",
            axes.c, config.c_axis_min, config.c_axis_max
        )));
    }

    let a_rad = axes.a.to_radians();
    let c_rad = axes.c.to_radians();

    let rot_c = Rotation3::from_axis_angle(&Vector3::z_axis(), c_rad);
    let rot_a = Rotation3::from_axis_angle(&Vector3::x_axis(), a_rad);
    let rot = rot_c * rot_a;

    let tool_offset = Vector3::new(0.0, 0.0, config.pivot_distance + config.tool_length);
    let rotated_offset = rot * tool_offset;

    axes.x = point.x - rotated_offset.x;
    axes.y = point.y - rotated_offset.y;
    axes.z = point.z - rotated_offset.z;

    let half_x = config.x_travel / 2.0;
    let half_y = config.y_travel / 2.0;
    let half_z = config.z_travel / 2.0;

    if axes.x < -half_x || axes.x > half_x {
        return Err(KinematicsError::OutOfWorkspace(format!(
            "X axis {} out of travel range [{}, {}]",
            axes.x, -half_x, half_x
        )));
    }
    if axes.y < -half_y || axes.y > half_y {
        return Err(KinematicsError::OutOfWorkspace(format!(
            "Y axis {} out of travel range [{}, {}]",
            axes.y, -half_y, half_y
        )));
    }
    if axes.z < -half_z || axes.z > half_z {
        return Err(KinematicsError::OutOfWorkspace(format!(
            "Z axis {} out of travel range [{}, {}]",
            axes.z, -half_z, half_z
        )));
    }

    Ok(axes)
}

pub fn forward_kinematics(
    axes: &MachineAxes,
    config: &MachineConfig,
) -> Point3<f64> {
    let a_rad = axes.a.to_radians();
    let c_rad = axes.c.to_radians();

    let rot_c = Rotation3::from_axis_angle(&Vector3::z_axis(), c_rad);
    let rot_a = Rotation3::from_axis_angle(&Vector3::x_axis(), a_rad);
    let rot = rot_c * rot_a;

    let tool_offset = Vector3::new(0.0, 0.0, config.pivot_distance + config.tool_length);
    let rotated_offset = rot * tool_offset;

    Point3::new(
        axes.x + rotated_offset.x,
        axes.y + rotated_offset.y,
        axes.z + rotated_offset.z,
    )
}

pub fn compute_transformation_matrix(
    axes: &MachineAxes,
    config: &MachineConfig,
) -> Matrix4<f64> {
    let a_rad = axes.a.to_radians();
    let c_rad = axes.c.to_radians();

    let rot_c = Rotation3::from_axis_angle(&Vector3::z_axis(), c_rad);
    let rot_a = Rotation3::from_axis_angle(&Vector3::x_axis(), a_rad);
    let rot = rot_c * rot_a;

    let pivot = Vector3::new(axes.x, axes.y, axes.z);
    let tool_vec = Vector3::new(0.0, 0.0, config.pivot_distance);
    let pivot_pos = pivot + rot * tool_vec;

    let mut matrix = Matrix4::identity();
    matrix.fixed_view_mut::<3, 3>(0, 0).copy_from(rot.matrix());
    matrix.fixed_view_mut::<3, 1>(0, 3).copy_from(&pivot_pos);
    matrix
}
