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
