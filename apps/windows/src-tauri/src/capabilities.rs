use std::fs;

// --- Command Implementations ---

#[tauri::command]
pub fn read_file(path: String) -> Result<Vec<u8>, String> {
    // Use std::fs::read to read the entire file content into a Vec<u8>
    fs::read(&path).map_err(|err| {
        // Map the std::io::Error to a descriptive String for Tauri
        format!("Failed to read file at path '{}': {}", path, err)
    })
}

#[tauri::command]
pub fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    // Use std::fs::write to write the entire slice to the file
    fs::write(&path, &data).map_err(|err| {
        // Map the std::io::Error to a descriptive String for Tauri
        format!("Failed to write file to path '{}': {}", path, err)
    })
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
        assert!(error_msg.contains("Failed to read file"));
        // Check for specific OS error if possible/needed (e.g., "No such file or directory")
        // assert!(error_msg.contains("No such file or directory")); // Behavior might vary
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
        assert!(error_msg.contains("Failed to write file"));
        // Check for specific OS error if possible/needed
        // assert!(error_msg.contains("No such file or directory")); // Behavior might vary
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