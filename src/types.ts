export interface Toolpoint {
  x: number;
  y: number;
  z: number;
  a: number;
  c: number;
  feed: number;
  spindle: number;
  line_number: number;
}

export interface Bounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_z: number;
  max_z: number;
}

export interface ToolpathInfo {
  num_points: number;
  total_distance: number;
  estimated_time: number;
  bounds: Bounds;
}

export interface MachineConfig {
  a_axis_min: number;
  a_axis_max: number;
  c_axis_min: number;
  c_axis_max: number;
  x_travel: number;
  y_travel: number;
  z_travel: number;
  pivot_distance: number;
  tool_length: number;
}

export interface MachineAxes {
  x: number;
  y: number;
  z: number;
  a: number;
  c: number;
}

export type ToolType = "BallEnd" | "FlatEnd" | "BullNose" | "Chamfer";

export interface ToolProfile {
  tool_type: ToolType;
  diameter: number;
  corner_radius: number;
  flute_length: number;
  num_flutes: number;
  rake_angle: number;
}

export interface StockModel {
  min_x: number;
  min_y: number;
  min_z: number;
  max_x: number;
  max_y: number;
  max_z: number;
  resolution: number;
}

export interface MrrAnalysisConfig {
  tool: ToolProfile;
  stock: StockModel;
  max_mrr: number;
  overload_threshold: number;
  min_feed_override: number;
  smoothing_window: number;
  lookahead_distance: number;
}

export interface MrrPointData {
  engagement_area: number;
  mrr: number;
  feed_override: number;
  axial_depth: number;
  radial_depth: number;
  load_level: LoadLevel;
}

export type LoadLevel = "Low" | "Normal" | "High" | "Critical";

export interface MrrSummary {
  avg_mrr: number;
  max_mrr: number;
  min_feed_override: number;
  critical_points: number;
  high_points: number;
  total_overridden_distance: number;
  estimated_time_with_override: number;
}

export interface SimulationState {
  isPlaying: boolean;
  currentPoint: number;
  speed: number;
  toolpath: Toolpoint[];
  info: ToolpathInfo | null;
}
