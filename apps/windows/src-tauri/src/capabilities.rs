use tauri::command;
use std::fs;
use std::path::Path;
// Import AppHandle
use tauri::AppHandle;
// Import the plugin's extension trait
use tauri_plugin_dialog::DialogExt;
// Use PathBuf for the final result
use std::path::PathBuf;
// Import FilePath explicitly to match against its variants
use tauri_plugin_fs::FilePath;

// Helper to map std::io::Error to a String
fn map_io_err(err: std::io::Error) -> String {
    format!("Filesystem Error: {}", err)
}

#[command]
pub fn read_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(Path::new(&path)).map_err(map_io_err)
}

#[command]
pub fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(Path::new(&path), data).map_err(map_io_err)
}

// Command to pick one or more directories using BLOCKING dialog
#[command]
pub fn pick_directory(app_handle: AppHandle, multiple: Option<bool>) -> Result<Option<Vec<PathBuf>>, String> {
    let dialog_handle = app_handle.dialog();
    let file_dialog = dialog_handle.file();

    let result_fp = match multiple {
        Some(true) => file_dialog.blocking_pick_folders(), // Returns Option<Vec<FilePath>>
        _ => file_dialog.blocking_pick_folder().map(|fp| vec![fp]), // Returns Option<Vec<FilePath>>
    };

    // Convert Option<Vec<FilePath>> to Option<Vec<PathBuf>>
    match result_fp {
        Some(vec_fp) => {
            // Explicitly match FilePath::Path variant (assuming name)
            let vec_pb: Vec<PathBuf> = vec_fp.clone().into_iter()
                .filter_map(|fp| {
                    match fp {
                        // Assuming the variant holding PathBuf is named `Path`
                        FilePath::Path(pb) => Some(pb),
                        _ => None, // Filter out other variants (e.g., URIs)
                    }
                })
                .collect();

            // Check if we successfully converted paths or if input was non-empty but output is empty
            if !vec_pb.is_empty() || vec_fp.is_empty() {
                 Ok(Some(vec_pb))
            } else {
                 Err("Could not convert selected paths to standard PathBufs (check FilePath variants)".to_string())
            }
        },
        None => Ok(None), // User cancelled
    }
}

// --- Unit Tests ---

#[cfg(test)]
mod tests {
    use super::*; // Import functions from outer module
    use tempfile::NamedTempFile;
    use std::io::Write; // Keep this for test setup

    #[test]
    fn test_read_file_non_existent() {
        // Test reading a file that doesn't exist
        let result = read_file("this_file_should_not_exist_ever.txt".to_string());
        assert!(result.is_err());
        let error_msg = result.unwrap_err();
        // Assert against the actual error format from map_io_err
        assert!(error_msg.starts_with("Filesystem Error:")); 
        // Optionally check for specific error kinds if stable across platforms
        // assert!(error_msg.contains("entity not found")); // Or similar OS-specific detail
    }

    #[test]
    // #[ignore] // <-- Remove ignore
    fn test_read_file_success() {
        let mut temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let content = b"Hello, Tauri!";
        temp_file.write_all(content).expect("Failed to write to temp file");
        let path = temp_file.path().to_str().unwrap().to_string();

        let result = read_file(path);
        assert!(result.is_ok(), "read_file failed: {:?}", result.err());
        assert_eq!(result.unwrap(), content);
    }

    #[test]
    fn test_write_file_invalid_path() {
        // Test writing to an invalid path (e.g., a directory that doesn't exist)
        // Note: Root directory might require special permissions
        let result = write_file("invalid_dir/some_file.txt".to_string(), vec![1, 2, 3]);
        assert!(result.is_err());
        let error_msg = result.unwrap_err();
        // Assert against the actual error format from map_io_err
        assert!(error_msg.starts_with("Filesystem Error:")); 
        // Optionally check for specific error kinds
        // assert!(error_msg.contains("entity not found")); 
    }

    #[test]
    // #[ignore] // <-- Remove ignore
    fn test_write_file_success() {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file for writing");
        let path = temp_file.path().to_str().unwrap().to_string();
        let data_to_write = vec![10, 20, 30, 40, 50];

        let write_result = write_file(path.clone(), data_to_write.clone());
        assert!(write_result.is_ok(), "write_file failed: {:?}", write_result.err());

        // Verify content by reading back using std::fs directly in the test
        let read_data = fs::read(&path).expect("Failed to read back file content for verification");
        assert_eq!(read_data, data_to_write);
    }
} 