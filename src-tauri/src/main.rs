// Claudia Desktop — Tauri shell
// Embeds the Node SEA server binary, extracts to app data on first run / version change,
// spawns it, and loads localhost:48901 in webview.
// Single instance: second launch focuses existing window.
// Close window = kill server + exit.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const SERVER_BINARY: &[u8] = include_bytes!("../binaries/claudia-server.exe");
#[cfg(not(windows))]
const SERVER_BINARY: &[u8] = include_bytes!("../binaries/claudia-server");

const VERSION: &str = env!("CARGO_PKG_VERSION");

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

/// Extract embedded server binary to app data dir if missing or version changed.
/// Returns the path to the extracted executable.
fn ensure_server(app_data: &PathBuf) -> PathBuf {
    let server_name = if cfg!(windows) {
        "claudia-server.exe"
    } else {
        "claudia-server"
    };
    let server_path = app_data.join(server_name);
    let version_path = app_data.join(".server-version");

    let needs_extract = if server_path.exists() {
        // Re-extract if version changed
        fs::read_to_string(&version_path)
            .map(|v| v.trim() != VERSION)
            .unwrap_or(true)
    } else {
        true
    };

    if needs_extract {
        fs::create_dir_all(app_data).expect("failed to create app data dir");
        fs::write(&server_path, SERVER_BINARY).expect("failed to write server binary");
        fs::write(&version_path, VERSION).expect("failed to write version file");

        // Ensure executable permission on non-Windows
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&server_path, fs::Permissions::from_mode(0o755))
                .expect("failed to set server permissions");
        }
    }

    server_path
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
            // --- Extract and start server ---
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let server_exe = ensure_server(&app_data);

            let mut cmd = Command::new(&server_exe);
            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            let child = cmd.spawn().expect("failed to start claudia-server");

            app.manage(ServerProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .on_window_event(|window, event| {
            // Red-cross / Cmd-W: kill server and force full app exit.
            // macOS keeps the process alive after the last window closes by
            // default, which would strand the child server — so we exit explicitly.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                kill_server(app);
                app.exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error running Claudia")
        .run(|app_handle, event| match event {
            // Safety net: Cmd+Q, SIGTERM, or any other exit path.
            // kill_server is idempotent (guard.take() leaves None), so double-calls are safe.
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                kill_server(app_handle);
            }
            _ => {}
        });
}
