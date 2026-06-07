import { Toolpoint, ToolpathInfo, MachineConfig, MachineAxes } from "./types";

export async function parseGCode(content: string): Promise<ToolpathInfo> {
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<ToolpathInfo>("parse_gcode", { content });
  }
  return mockParseGCode(content);
}

export async function getToolpathChunk(
  start: number,
  count: number
): Promise<Toolpoint[]> {
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<Toolpoint[]>("get_toolpath_chunk", { start, count });
  }
  return [];
}

export async function getMachineConfig(): Promise<MachineConfig> {
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<MachineConfig>("get_machine_config");
  }
  return {
    a_axis_min: -120,
    a_axis_max: 30,
    c_axis_min: -360,
    c_axis_max: 360,
    x_travel: 800,
    y_travel: 600,
    z_travel: 500,
    pivot_distance: 150,
    tool_length: 100,
  };
}

export async function setMachineConfig(config: MachineConfig): Promise<void> {
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("set_machine_config", { config });
  }
}

export async function inverseKinematics(
  point: Toolpoint
): Promise<MachineAxes> {
  if (window.__TAURI__) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<MachineAxes>("inverse_kinematics", { point });
  }
  return {
    x: point.x,
    y: point.y,
    z: point.z,
    a: point.a,
    c: point.c,
  };
}

function mockParseGCode(_content: string): ToolpathInfo {
  return {
    num_points: 0,
    total_distance: 0,
    estimated_time: 0,
    bounds: {
      min_x: -100,
      max_x: 100,
      min_y: -100,
      max_y: 100,
      min_z: 0,
      max_z: 100,
    },
  };
}

declare global {
  interface Window {
    __TAURI__?: boolean;
  }
}
