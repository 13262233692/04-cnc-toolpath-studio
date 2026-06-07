use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Toolpoint {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub a: f64,
    pub c: f64,
    pub feed: f64,
    pub spindle: f64,
    pub line_number: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
    pub min_z: f64,
    pub max_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolpathData {
    pub points: Vec<Toolpoint>,
    pub total_distance: f64,
    pub estimated_time: f64,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolpathInfo {
    pub num_points: usize,
    pub total_distance: f64,
    pub estimated_time: f64,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineConfig {
    pub a_axis_min: f64,
    pub a_axis_max: f64,
    pub c_axis_min: f64,
    pub c_axis_max: f64,
    pub x_travel: f64,
    pub y_travel: f64,
    pub z_travel: f64,
    pub pivot_distance: f64,
    pub tool_length: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MachineAxes {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub a: f64,
    pub c: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryChunkHeader {
    pub chunk_index: u32,
    pub total_chunks: u32,
    pub point_offset: u32,
    pub point_count: u32,
    pub total_points: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolType {
    BallEnd,
    FlatEnd,
    BullNose,
    Chamfer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolProfile {
    pub tool_type: ToolType,
    pub diameter: f64,
    pub corner_radius: f64,
    pub flute_length: f64,
    pub num_flutes: u32,
    pub rake_angle: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockModel {
    pub min_x: f64,
    pub min_y: f64,
    pub min_z: f64,
    pub max_x: f64,
    pub max_y: f64,
    pub max_z: f64,
    pub resolution: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrrAnalysisConfig {
    pub tool: ToolProfile,
    pub stock: StockModel,
    pub max_mrr: f64,
    pub overload_threshold: f64,
    pub min_feed_override: f64,
    pub smoothing_window: usize,
    pub lookahead_distance: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrrPointData {
    pub engagement_area: f64,
    pub mrr: f64,
    pub feed_override: f64,
    pub axial_depth: f64,
    pub radial_depth: f64,
    pub load_level: LoadLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoadLevel {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrrSummary {
    pub avg_mrr: f64,
    pub max_mrr: f64,
    pub min_feed_override: f64,
    pub critical_points: u32,
    pub high_points: u32,
    pub total_overridden_distance: f64,
    pub estimated_time_with_override: f64,
}

impl ToolProfile {
    pub fn default_ball_end() -> Self {
        ToolProfile {
            tool_type: ToolType::BallEnd,
            diameter: 10.0,
            corner_radius: 5.0,
            flute_length: 50.0,
            num_flutes: 4,
            rake_angle: 12.0,
        }
    }

    pub fn default_flat_end() -> Self {
        ToolProfile {
            tool_type: ToolType::FlatEnd,
            diameter: 12.0,
            corner_radius: 0.0,
            flute_length: 45.0,
            num_flutes: 4,
            rake_angle: 10.0,
        }
    }

    pub fn radius(&self) -> f64 {
        self.diameter / 2.0
    }

    pub fn effective_radius_at_depth(&self, depth: f64) -> f64 {
        match self.tool_type {
            ToolType::BallEnd => {
                if depth <= self.corner_radius {
                    let r = self.corner_radius;
                    (2.0 * r * depth - depth * depth).max(0.0).sqrt()
                } else {
                    self.radius()
                }
            }
            ToolType::FlatEnd => self.radius(),
            ToolType::BullNose => {
                if depth <= self.corner_radius {
                    let r = self.corner_radius;
                    self.radius() - r + (2.0 * r * depth - depth * depth).max(0.0).sqrt()
                } else {
                    self.radius()
                }
            }
            ToolType::Chamfer => self.radius() * (1.0 - depth / self.flute_length * 0.5),
        }
    }

    pub fn cross_section_area_at_depth(&self, depth: f64) -> f64 {
        let r = self.effective_radius_at_depth(depth);
        std::f64::consts::PI * r * r
    }
}

impl StockModel {
    pub fn default_from_bounds(bounds: &Bounds) -> Self {
        let margin = 5.0;
        StockModel {
            min_x: bounds.min_x - margin,
            min_y: bounds.min_y - margin,
            min_z: bounds.min_z - margin,
            max_x: bounds.max_x + margin,
            max_y: bounds.max_y + margin,
            max_z: bounds.max_z + margin,
            resolution: 2.0,
        }
    }

    pub fn contains(&self, x: f64, y: f64, z: f64) -> bool {
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y && z >= self.min_z && z <= self.max_z
    }

    pub fn height_at(&self, _x: f64, _y: f64) -> f64 {
        self.max_z
    }
}

impl MrrAnalysisConfig {
    pub fn default_with_bounds(bounds: &Bounds) -> Self {
        MrrAnalysisConfig {
            tool: ToolProfile::default_ball_end(),
            stock: StockModel::default_from_bounds(bounds),
            max_mrr: 500.0,
            overload_threshold: 0.75,
            min_feed_override: 0.1,
            smoothing_window: 50,
            lookahead_distance: 200,
        }
    }
}

impl Default for MrrAnalysisConfig {
    fn default() -> Self {
        MrrAnalysisConfig {
            tool: ToolProfile::default_ball_end(),
            stock: StockModel {
                min_x: -100.0,
                min_y: -100.0,
                min_z: -100.0,
                max_x: 100.0,
                max_y: 100.0,
                max_z: 100.0,
                resolution: 2.0,
            },
            max_mrr: 500.0,
            overload_threshold: 0.75,
            min_feed_override: 0.1,
            smoothing_window: 50,
            lookahead_distance: 200,
        }
    }
}

impl MrrPointData {
    pub const BYTE_SIZE: usize = 6 * 8 + 4;

    pub fn to_bytes(&self, buf: &mut [u8]) {
        let mut offset = 0;
        buf[offset..offset + 8].copy_from_slice(&self.engagement_area.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.mrr.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.feed_override.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.axial_depth.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.radial_depth.to_le_bytes());
        offset += 8;
        buf[offset..offset + 4].copy_from_slice(&match self.load_level {
            LoadLevel::Low => 0u32,
            LoadLevel::Normal => 1u32,
            LoadLevel::High => 2u32,
            LoadLevel::Critical => 3u32,
        }
        .to_le_bytes());
    }
}

impl MachineConfig {
    pub fn default_ac_axis() -> Self {
        MachineConfig {
            a_axis_min: -120.0,
            a_axis_max: 30.0,
            c_axis_min: -360.0,
            c_axis_max: 360.0,
            x_travel: 800.0,
            y_travel: 600.0,
            z_travel: 500.0,
            pivot_distance: 150.0,
            tool_length: 100.0,
        }
    }
}

impl Default for Bounds {
    fn default() -> Self {
        Bounds {
            min_x: f64::INFINITY,
            max_x: f64::NEG_INFINITY,
            min_y: f64::INFINITY,
            max_y: f64::NEG_INFINITY,
            min_z: f64::INFINITY,
            max_z: f64::NEG_INFINITY,
        }
    }
}

impl Bounds {
    pub fn expand(&mut self, p: &Toolpoint) {
        self.min_x = self.min_x.min(p.x);
        self.max_x = self.max_x.max(p.x);
        self.min_y = self.min_y.min(p.y);
        self.max_y = self.max_y.max(p.y);
        self.min_z = self.min_z.min(p.z);
        self.max_z = self.max_z.max(p.z);
    }
}

impl Toolpoint {
    pub const FIELD_COUNT: usize = 8;
    pub const BYTE_SIZE: usize = 7 * 8 + 4;

    pub fn to_bytes(&self, buf: &mut [u8]) {
        let mut offset = 0;
        buf[offset..offset + 8].copy_from_slice(&self.x.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.y.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.z.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.a.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.c.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.feed.to_le_bytes());
        offset += 8;
        buf[offset..offset + 8].copy_from_slice(&self.spindle.to_le_bytes());
        offset += 8;
        buf[offset..offset + 4].copy_from_slice(&(self.line_number as u32).to_le_bytes());
    }
}
