// Claudia Desktop — Tauri shell
// Spawns the Node SEA server as a sidecar, loads localhost:48901 in webview.
// System tray icon with hide-on-close behavior.
// Right-click tray: Show/Quit. Left-click tray: toggle window.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_autostart::AutoLaunchManager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct ServerProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
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

            // --- System tray ---
            let autostart_enabled = app
                .state::<AutoLaunchManager>()
                .is_enabled()
                .unwrap_or(false);

            let show = MenuItemBuilder::with_id("show", "Show Claudia").build(app)?;
            let autostart = CheckMenuItemBuilder::with_id("autostart", "Launch at startup")
                .checked(autostart_enabled)
                .build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &autostart, &quit])
                .build()?;

            let icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| {
                    let png = include_bytes!("../icons/32x32.png");
                    Image::from_bytes(png).expect("failed to load tray icon")
                });

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Claudia")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "autostart" => {
                        let manager = app.state::<AutoLaunchManager>();
                        let enabled = manager.is_enabled().unwrap_or(false);
                        if enabled {
                            let _ = manager.disable();
                        } else {
                            let _ = manager.enable();
                        }
                    }
                    "quit" => {
                        // Kill server before exiting
                        if let Some(state) = app.try_state::<ServerProcess>() {
                            if let Ok(mut guard) = state.0.lock() {
                                if let Some(mut child) = guard.take() {
                                    let _ = child.kill();
                                    let _ = child.wait();
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window instead of closing — server stays alive
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Claudia");
}
