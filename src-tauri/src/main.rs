#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod gcode;
mod kinematics;
mod memory;
mod models;

use models::*;
use std::sync::Mutex;
use tauri::State;

const CHUNK_SIZE: usize = 50000;

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
fn get_toolpath_binary_chunk(
    chunk_index: u32,
    state: State<AppState>,
) -> Result<Vec<u8>, String> {
    let toolpath = state.toolpath.lock().unwrap();
    let toolpath = toolpath.as_ref().ok_or("No toolpath loaded")?;

    let total_points = toolpath.points.len();
    let total_chunks = ((total_points + CHUNK_SIZE - 1) / CHUNK_SIZE) as u32;

    if chunk_index >= total_chunks {
        return Err("Chunk index out of range".to_string());
    }

    let start = chunk_index as usize * CHUNK_SIZE;
    let end = (start + CHUNK_SIZE).min(total_points);
    let point_count = end - start;

    let header = BinaryChunkHeader {
        chunk_index,
        total_chunks,
        point_offset: start as u32,
        point_count: point_count as u32,
        total_points: total_points as u32,
    };

    let header_bytes = serde_json::to_vec(&header).map_err(|e| e.to_string())?;
    let header_len = header_bytes.len() as u32;

    let payload_size = point_count * Toolpoint::BYTE_SIZE;
    let mut result = Vec::with_capacity(4 + header_bytes.len() + payload_size);

    result.extend_from_slice(&header_len.to_le_bytes());
    result.extend_from_slice(&header_bytes);

    let mut point_buf = vec![0u8; Toolpoint::BYTE_SIZE];
    for point in &toolpath.points[start..end] {
        point.to_bytes(&mut point_buf);
        result.extend_from_slice(&point_buf);
    }

    Ok(result)
}

#[tauri::command]
fn batch_inverse_kinematics(
    points: Vec<Toolpoint>,
    state: State<AppState>,
) -> Result<Vec<u8>, String> {
    let config = state.machine_config.lock().unwrap().clone();

    let axes_size = 5 * 8;
    let mut result = Vec::with_capacity(points.len() * axes_size);

    for point in &points {
        let axes = kinematics::inverse_kinematics(point, &config)
            .unwrap_or(MachineAxes {
                x: point.x,
                y: point.y,
                z: point.z,
                a: point.a,
                c: point.c,
            });

        result.extend_from_slice(&axes.x.to_le_bytes());
        result.extend_from_slice(&axes.y.to_le_bytes());
        result.extend_from_slice(&axes.z.to_le_bytes());
        result.extend_from_slice(&axes.a.to_le_bytes());
        result.extend_from_slice(&axes.c.to_le_bytes());
    }

    Ok(result)
}

#[tauri::command]
fn get_machine_config(state: State<AppState>) -> MachineConfig {
    state.machine_config.lock().unwrap().clone()
}

#[tauri::command]
fn set_machine_config(config: MachineConfig, state: State<AppState>) {
    *state.machine_config.lock().unwrap() = config;
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
            get_toolpath_binary_chunk,
            batch_inverse_kinematics,
            get_machine_config,
            set_machine_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
