// Claudia Desktop — Tauri shell
// Spawns the Node SEA server as a sidecar, loads localhost:48901 in webview.
// On window close: kills server process.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct ServerProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let exe_dir = std::env::current_exe()
                .expect("failed to get current exe path")
                .parent()
                .expect("exe has no parent dir")
                .to_path_buf();

            let server_exe = exe_dir.join("binaries").join("claudia-server.exe");

            let mut cmd = Command::new(&server_exe);
            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            let child = cmd.spawn()
                .expect("failed to start claudia-server");

            app.manage(ServerProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let child = {
                    let handle = window.app_handle().clone();
                    let state = handle.state::<ServerProcess>();
                    state.0.lock().ok().and_then(|mut guard| guard.take())
                };
                if let Some(mut child) = child {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Claudia");
}
