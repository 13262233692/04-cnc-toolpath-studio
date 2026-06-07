use crate::models::*;

pub struct MrrAnalyzer {
    config: MrrAnalysisConfig,
    heightmap: Vec<f64>,
    heightmap_width: usize,
    heightmap_height: usize,
    cell_size: f64,
    stock_origin_x: f64,
    stock_origin_y: f64,
}

impl MrrAnalyzer {
    pub fn new(config: MrrAnalysisConfig) -> Self {
        let stock = &config.stock;
        let width = ((stock.max_x - stock.min_x) / stock.resolution).ceil() as usize;
        let height = ((stock.max_y - stock.min_y) / stock.resolution).ceil() as usize;
        let width = width.max(1);
        let height = height.max(1);
        let cell_size = stock.resolution;
        let origin_x = stock.min_x;
        let origin_y = stock.min_y;
        let max_z = stock.max_z;

        let heightmap = vec![max_z; width * height];

        MrrAnalyzer {
            config,
            heightmap,
            heightmap_width: width,
            heightmap_height: height,
            cell_size,
            stock_origin_x: origin_x,
            stock_origin_y: origin_y,
        }
    }

    pub fn analyze(&mut self, points: &[Toolpoint]) -> (Vec<MrrPointData>, MrrSummary) {
        let n = points.len();
        if n == 0 {
            return (
                Vec::new(),
                MrrSummary {
                    avg_mrr: 0.0,
                    max_mrr: 0.0,
                    min_feed_override: 1.0,
                    critical_points: 0,
                    high_points: 0,
                    total_overridden_distance: 0.0,
                    estimated_time_with_override: 0.0,
                },
            );
        }

        let mut raw_results = Vec::with_capacity(n);

        for i in 0..n {
            let prev = if i > 0 { &points[i - 1] } else { &points[i] };
            let curr = &points[i];

            let (axial_depth, radial_depth) = self.compute_engagement(prev, curr);
            let engagement_area = self.compute_engagement_area(axial_depth, radial_depth);
            let feed_rate = curr.feed.max(1.0);
            let mrr = engagement_area * feed_rate / 60.0;

            let load_ratio = mrr / self.config.max_mrr;

            let raw_override = if load_ratio <= self.config.overload_threshold {
                1.0
            } else {
                let excess = load_ratio - self.config.overload_threshold;
                let reduction = excess / (1.0 - self.config.overload_threshold);
                (1.0 - reduction * 0.8).max(self.config.min_feed_override)
            };

            let load_level = if load_ratio < 0.4 {
                LoadLevel::Low
            } else if load_ratio < self.config.overload_threshold {
                LoadLevel::Normal
            } else if load_ratio < 0.9 {
                LoadLevel::High
            } else {
                LoadLevel::Critical
            };

            raw_results.push(MrrPointData {
                engagement_area,
                mrr,
                feed_override: raw_override,
                axial_depth,
                radial_depth,
                load_level,
            });

            self.update_heightmap(curr);
        }

        let smoothed = self.apply_lookahead_smoothing(&raw_results, points);
        let summary = self.compute_summary(&smoothed, points);

        (smoothed, summary)
    }

    fn compute_engagement(&self, prev: &Toolpoint, curr: &Toolpoint) -> (f64, f64) {
        let tool = &self.config.tool;
        let stock = &self.config.stock;

        let dz = prev.z - curr.z;
        let axial_depth = if dz > 0.0 { dz } else { 0.0 };

        let stock_top = stock.height_at(curr.x, curr.y);
        let tool_z = curr.z;
        let actual_axial = if stock_top > tool_z {
            (stock_top - tool_z).min(tool.flute_length)
        } else {
            axial_depth
        };

        let dx = curr.x - prev.x;
        let dy = curr.y - prev.y;
        let step_dist = (dx * dx + dy * dy).sqrt();

        let effective_r = tool.effective_radius_at_depth(actual_axial);
        let radial_depth = if step_dist > 1e-6 {
            let max_engagement = effective_r * 2.0;
            let angle = (step_dist / max_engagement).min(1.0).asin();
            effective_r * (1.0 - angle.cos())
        } else {
            0.0
        };

        (actual_axial, radial_depth)
    }

    fn compute_engagement_area(&self, axial_depth: f64, radial_depth: f64) -> f64 {
        let tool = &self.config.tool;

        if axial_depth <= 0.0 && radial_depth <= 0.0 {
            return 0.0;
        }

        let effective_r = tool.effective_radius_at_depth(axial_depth);

        match tool.tool_type {
            ToolType::BallEnd => {
                let axial_area = if axial_depth > 0.0 && axial_depth <= tool.corner_radius {
                    let r = tool.corner_radius;
                    let theta = (r - axial_depth) / r;
                    r * r * theta.acos() - (r - axial_depth) * (2.0 * r * axial_depth - axial_depth * axial_depth).max(0.0).sqrt()
                } else if axial_depth > tool.corner_radius {
                    let r = tool.corner_radius;
                    let ball_area = std::f64::consts::PI * r * r / 2.0;
                    let cyl_area = 2.0 * tool.radius() * (axial_depth - r);
                    ball_area + cyl_area
                } else {
                    0.0
                };

                let radial_area = radial_depth * axial_depth.max(1.0);
                axial_area + radial_area * 0.5
            }
            ToolType::FlatEnd => {
                let base_area = axial_depth * effective_r * 2.0;
                if radial_depth > 0.0 {
                    let arc_angle = (radial_depth / effective_r).min(1.0).acos() * 2.0;
                    let sector = 0.5 * effective_r * effective_r * arc_angle;
                    let triangle = effective_r * (effective_r - radial_depth);
                    base_area + sector - triangle
                } else {
                    base_area
                }
            }
            ToolType::BullNose => {
                let flat_area = axial_depth * (tool.radius() - tool.corner_radius) * 2.0;
                let corner_area = if axial_depth <= tool.corner_radius {
                    axial_depth * tool.corner_radius
                } else {
                    tool.corner_radius * tool.corner_radius * std::f64::consts::FRAC_PI_2
                };
                flat_area + corner_area + radial_depth * axial_depth * 0.5
            }
            ToolType::Chamfer => {
                axial_depth * effective_r * 1.5 + radial_depth * axial_depth * 0.6
            }
        }
    }

    fn update_heightmap(&mut self, point: &Toolpoint) {
        let tool = &self.config.tool;
        let radius = tool.radius();
        let tool_z = point.z;

        let cx = ((point.x - self.stock_origin_x) / self.cell_size).round() as isize;
        let cy = ((point.y - self.stock_origin_y) / self.cell_size).round() as isize;
        let cell_radius = (radius / self.cell_size).ceil() as isize;

        for dy in -cell_radius..=cell_radius {
            for dx in -cell_radius..=cell_radius {
                let px = cx + dx;
                let py = cy + dy;
                if px < 0 || py < 0 {
                    continue;
                }
                let px = px as usize;
                let py = py as usize;
                if px >= self.heightmap_width || py >= self.heightmap_height {
                    continue;
                }

                let world_x = self.stock_origin_x + px as f64 * self.cell_size;
                let world_y = self.stock_origin_y + py as f64 * self.cell_size;
                let dist_sq = (world_x - point.x).powi(2) + (world_y - point.y).powi(2);

                if dist_sq <= radius * radius {
                    let dist = dist_sq.sqrt();
                    let cut_z = match tool.tool_type {
                        ToolType::BallEnd => {
                            if dist <= tool.corner_radius {
                                let r = tool.corner_radius;
                                tool_z + r - (r * r - dist * dist).max(0.0).sqrt()
                            } else {
                                tool_z
                            }
                        }
                        _ => tool_z,
                    };

                    let idx = py * self.heightmap_width + px;
                    if cut_z < self.heightmap[idx] {
                        self.heightmap[idx] = cut_z;
                    }
                }
            }
        }
    }

    fn apply_lookahead_smoothing(
        &self,
        raw: &[MrrPointData],
        points: &[Toolpoint],
    ) -> Vec<MrrPointData> {
        let n = raw.len();
        let mut smoothed = raw.to_vec();
        let lookahead = self.config.lookahead_distance.min(n);
        let window = self.config.smoothing_window;

        if window > 1 && n > window {
            for i in 0..n {
                let start = if i >= window / 2 { i - window / 2 } else { 0 };
                let end = (i + window / 2 + 1).min(n);

                let mut sum = 0.0;
                let mut count = 0;
                for j in start..end {
                    sum += raw[j].feed_override;
                    count += 1;
                }
                smoothed[i].feed_override = sum / count as f64;
            }
        }

        if lookahead > 1 {
            let mut lookahead_overrides = vec![1.0f64; n];

            for i in 0..n {
                let end = (i + lookahead).min(n);
                for j in i..end {
                    let distance = self.point_distance(points, i, j);
                    if distance < 5.0 {
                        continue;
                    }

                    let future_load = raw[j].mrr / self.config.max_mrr;
                    if future_load > self.config.overload_threshold {
                        let ramp_distance = self.compute_ramp_distance(
                            future_load - self.config.overload_threshold,
                        );
                        if distance <= ramp_distance {
                            let ramp_ratio = distance / ramp_distance;
                            let needed_override = raw[j].feed_override;
                            let ramped_override = 1.0 - (1.0 - needed_override) * ramp_ratio;
                            if ramped_override < lookahead_overrides[i] {
                                lookahead_overrides[i] = ramped_override;
                            }
                        }
                    }
                }
            }

            for i in 0..n {
                smoothed[i].feed_override = smoothed[i].feed_override.min(lookahead_overrides[i]);
                smoothed[i].feed_override = smoothed[i].feed_override.max(self.config.min_feed_override);
            }
        }

        smoothed
    }

    fn compute_ramp_distance(&self, overload_ratio: f64) -> f64 {
        let base_ramp = 20.0;
        base_ramp * (1.0 + overload_ratio * 3.0)
    }

    fn point_distance(&self, points: &[Toolpoint], i: usize, j: usize) -> f64 {
        if i == j {
            return 0.0;
        }
        let pi = &points[i];
        let pj = &points[j];
        ((pj.x - pi.x).powi(2) + (pj.y - pi.y).powi(2) + (pj.z - pi.z).powi(2)).sqrt()
    }

    fn compute_summary(&self, results: &[MrrPointData], points: &[Toolpoint]) -> MrrSummary {
        let n = results.len();
        if n == 0 {
            return MrrSummary {
                avg_mrr: 0.0,
                max_mrr: 0.0,
                min_feed_override: 1.0,
                critical_points: 0,
                high_points: 0,
                total_overridden_distance: 0.0,
                estimated_time_with_override: 0.0,
            };
        }

        let mut total_mrr = 0.0;
        let mut max_mrr = 0.0;
        let mut min_override = 1.0;
        let mut critical = 0u32;
        let mut high = 0u32;
        let mut overridden_dist = 0.0;
        let mut time_with_override = 0.0;

        for i in 0..n {
            let r = &results[i];
            total_mrr += r.mrr;
            if r.mrr > max_mrr {
                max_mrr = r.mrr;
            }
            if r.feed_override < min_override {
                min_override = r.feed_override;
            }
            match r.load_level {
                LoadLevel::Critical => critical += 1,
                LoadLevel::High => high += 1,
                _ => {}
            }

            if r.feed_override < 0.99 {
                let dist = if i > 0 {
                    let prev = &points[i - 1];
                    let curr = &points[i];
                    ((curr.x - prev.x).powi(2) + (curr.y - prev.y).powi(2) + (curr.z - prev.z).powi(2)).sqrt()
                } else {
                    0.0
                };
                overridden_dist += dist;
            }

            let effective_feed = points[i].feed * r.feed_override;
            if effective_feed > 0.0 {
                let dist = if i > 0 {
                    let prev = &points[i - 1];
                    let curr = &points[i];
                    ((curr.x - prev.x).powi(2) + (curr.y - prev.y).powi(2) + (curr.z - prev.z).powi(2)).sqrt()
                } else {
                    0.0
                };
                time_with_override += dist / effective_feed * 60.0;
            }
        }

        MrrSummary {
            avg_mrr: total_mrr / n as f64,
            max_mrr,
            min_feed_override: min_override,
            critical_points: critical,
            high_points: high,
            total_overridden_distance: overridden_dist,
            estimated_time_with_override: time_with_override,
        }
    }
}
