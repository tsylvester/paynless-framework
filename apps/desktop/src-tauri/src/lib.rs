// Declare the new module
mod capabilities;

use tauri::{Emitter, Manager}; // Re-added Manager for get_webview_window

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Add the new commands to the handler
        .invoke_handler(tauri::generate_handler![
            greet,
            capabilities::read_file,
            capabilities::write_file
            ])
        // Emit an event once the app setup is complete
        .setup(|app| {
            #[cfg(debug_assertions)] // Only include this check in debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            // Emit the custom ready event
            app.emit("app://platform-ready", "Tauri backend ready").unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
