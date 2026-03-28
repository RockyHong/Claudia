// Claudia Desktop — Tauri shell
// Spawns the Node SEA server as a sidecar, loads localhost:48901 in webview.
// On window close: kills server process. Job Object handles child cleanup.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct ServerProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_path = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            let server_exe = if cfg!(windows) {
                resource_path.join("binaries").join("claudia-server.exe")
            } else {
                resource_path.join("binaries").join("claudia-server")
            };

            let child = Command::new(&server_exe)
                .spawn()
                .expect("failed to start claudia-server");

            println!("[tauri] Server started (pid={})", child.id());
            app.manage(ServerProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.app_handle().state::<ServerProcess>();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        // Kill server — Job Object cleans up spawned terminals
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Claudia");
}
