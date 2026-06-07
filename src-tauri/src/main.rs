#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gcode;
mod kinematics;
mod memory;
mod models;

use models::*;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    toolpath: Mutex<Option<ToolpathData>>,
    machine_config: Mutex<MachineConfig>,
}

#[tauri::command]
fn parse_gcode(content: String, state: State<AppState>) -> Result<ToolpathInfo, String> {
    let toolpath = gcode::parse_gcode(&content).map_err(|e| e.to_string())?;
    let info = ToolpathInfo {
        num_points: toolpath.points.len(),
        total_distance: toolpath.total_distance,
        estimated_time: toolpath.estimated_time,
        bounds: toolpath.bounds.clone(),
    };
    *state.toolpath.lock().unwrap() = Some(toolpath);
    Ok(info)
}

#[tauri::command]
fn get_toolpath_chunk(
    start: usize,
    count: usize,
    state: State<AppState>,
) -> Result<Vec<Toolpoint>, String> {
    let toolpath = state.toolpath.lock().unwrap();
    let toolpath = toolpath.as_ref().ok_or("No toolpath loaded")?;
    let end = (start + count).min(toolpath.points.len());
    Ok(toolpath.points[start..end].to_vec())
}

#[tauri::command]
fn get_machine_config(state: State<AppState>) -> MachineConfig {
    state.machine_config.lock().unwrap().clone()
}

#[tauri::command]
fn set_machine_config(config: MachineConfig, state: State<AppState>) {
    *state.machine_config.lock().unwrap() = config;
}

#[tauri::command]
fn inverse_kinematics(
    point: Toolpoint,
    state: State<AppState>,
) -> Result<MachineAxes, String> {
    let config = state.machine_config.lock().unwrap();
    kinematics::inverse_kinematics(&point, &config).map_err(|e| e.to_string())
}

fn main() {
    env_logger::init();
    
    let default_config = MachineConfig::default_ac_axis();
    
    tauri::Builder::default()
        .manage(AppState {
            toolpath: Mutex::new(None),
            machine_config: Mutex::new(default_config),
        })
        .invoke_handler(tauri::generate_handler![
            parse_gcode,
            get_toolpath_chunk,
            get_machine_config,
            set_machine_config,
            inverse_kinematics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
