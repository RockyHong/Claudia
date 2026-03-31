// Claudia Desktop — Tauri shell
// Spawns the Node SEA server as a sidecar, loads localhost:48901 in webview.
// Single instance: second launch focuses existing window.
// Close window = kill server + exit.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct ServerProcess(Mutex<Option<Child>>);

fn kill_server(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        // Single instance — must be registered first
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // --- Start server sidecar ---
            let exe_dir = std::env::current_exe()
                .expect("failed to get current exe path")
                .parent()
                .expect("exe has no parent dir")
                .to_path_buf();

            let server_exe = exe_dir.join("binaries").join("claudia-server.exe");

            let mut cmd = Command::new(&server_exe);
            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            let child = cmd.spawn().expect("failed to start claudia-server");

            app.manage(ServerProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill server when the window is destroyed (app closing)
            if let tauri::WindowEvent::Destroyed = event {
                kill_server(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Claudia");
}
