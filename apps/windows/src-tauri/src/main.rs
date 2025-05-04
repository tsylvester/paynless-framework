// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Define modules
mod capabilities;
mod crypto_commands;
mod wallet_commands;

fn main() {
    // Create the mock storage instance (using Default is fine here)
    let mock_storage = wallet_commands::MockSecureStorage::default();

    // Use tauri::Builder to create and run the app
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(mock_storage) // <-- Manage the storage instance
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Crypto commands
            crypto_commands::generate_signing_keypair_hex,
            crypto_commands::sign_hex,
            crypto_commands::verify_hex,
            crypto_commands::generate_nonce_hex,
            crypto_commands::encrypt_symmetric_hex,
            crypto_commands::decrypt_symmetric_hex,
            // Wallet commands
            wallet_commands::import_mnemonic,
            wallet_commands::export_mnemonic
        ])
        .setup(|app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
