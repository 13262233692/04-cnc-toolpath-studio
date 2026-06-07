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

export interface SimulationState {
  isPlaying: boolean;
  currentPoint: number;
  speed: number;
  toolpath: Toolpoint[];
  info: ToolpathInfo | null;
}
