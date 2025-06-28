// supabase/functions/_shared/services/file_manager.mock.ts
import { spy, type Spy } from 'https://deno.land/std@0.218.2/testing/mock.ts';
import type { ServiceError } from '../types.ts';
import type {
  FileRecord,
  UploadContext,
  IFileManager,
  FileManagerResponse,
} from '../types/file_manager.types.ts';

/**
 * A mock implementation of the IFileManager for testing purposes.
 * Its methods are spies that can be configured to return specific values.
 */
export class MockFileManagerService implements IFileManager {
  uploadAndRegisterFile: Spy<
    this,
    [context: UploadContext],
    Promise<FileManagerResponse>
  >;

  constructor() {
    this.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
      // Default mock implementation returns an error to satisfy the new contract.
      return await Promise.resolve({ record: null, error: { message: 'Default mock error' } });
    });
  }

  /**
   * Configures the mock response for the uploadAndRegisterFile method.
   * @param record The FileRecord to return on success, or null.
   * @param error The ServiceError to return on failure, or null.
   */
  setUploadAndRegisterFileResponse(
    record: FileRecord | null,
    error: ServiceError | null,
  ) {
    this.uploadAndRegisterFile = spy((_context: UploadContext) => {
        if (error) {
            return Promise.resolve({ record: null, error });
        }
        if (record) {
            return Promise.resolve({ record, error: null });
        }
        // To satisfy the contract, we must return an error if no record is provided.
        return Promise.resolve({ record: null, error: { message: 'Mock not configured to return a record.' } });
    });
  }
}

/**
 * Factory function to create a new instance of the MockFileManagerService.
 * @returns An instance of MockFileManagerService.
 */
export function createMockFileManagerService() {
  return new MockFileManagerService();
} 