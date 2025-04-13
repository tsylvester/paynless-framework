// src-tauri/src/capabilities.rs

// Read file content as raw bytes
#[tauri::command]
pub fn read_file(path: String) -> Result<Vec<u8>, String> {
    match std::fs::read(&path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Failed to read file '{}': {}", path, e)),
    }
}

// Write raw bytes to a file
#[tauri::command]
pub fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    match std::fs::write(&path, &data) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file '{}': {}", path, e)),
    }
}

// --- Unit Tests ---
#[cfg(test)]
mod tests {
    use super::*; // Import functions from outer module
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_write_and_read_file() {
        // Create a temporary file
        let mut temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let file_path = temp_file.path().to_str().expect("Failed to get path string").to_string();

        // 1. Test writing data
        let write_data: Vec<u8> = vec![10, 20, 30, 255, 0, 55];
        let write_result = write_file(file_path.clone(), write_data.clone());
        assert!(write_result.is_ok());

        // Verify content manually just in case
        let manually_read_data = std::fs::read(&file_path).expect("Manual read failed");
        assert_eq!(manually_read_data, write_data);

        // 2. Test reading the same data back
        let read_result = read_file(file_path.clone());
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), write_data);

        // 3. Test reading non-existent file
        let bad_path = "/path/does/not/exist/surely";
        let read_error_result = read_file(bad_path.to_string());
        assert!(read_error_result.is_err());
        // Check if the error message contains the path (basic check)
        assert!(read_error_result.unwrap_err().contains(bad_path));

        // 4. Test writing to a bad path (e.g., directory, permission denied - hard to test reliably)
        // Skipping complex write error test for now

        // Temp file is automatically deleted when `temp_file` goes out of scope
    }
} 