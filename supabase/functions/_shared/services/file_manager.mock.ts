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
  uploadAndRegisterFileSpy: Spy<
    this,
    [context: UploadContext],
    Promise<FileManagerResponse>
  >;
  private mockResponse: FileManagerResponse = { record: null, error: { message: 'Default mock error' } };

  constructor() {
    this.uploadAndRegisterFileSpy = spy(async (_context: UploadContext) => {
      // The spy now returns the mockResponse property of the instance.
      return await Promise.resolve(this.mockResponse);
    });
  }

  // This is the actual method that will be called by the application code.
  // It's not a spy itself, but it calls the spy.
  async uploadAndRegisterFile(context: UploadContext): Promise<FileManagerResponse> {
    return this.uploadAndRegisterFileSpy(context);
  }

  /**
   * Resets the spy for the uploadAndRegisterFile method.
   * This will still recreate the spy to clear call history.
   */
  reset() {
    this.uploadAndRegisterFileSpy = spy(async (_context: UploadContext) => {
      return await Promise.resolve({ record: null, error: { message: 'Default mock error' } });
    });
  }

  /**
   * Configures the mock response for the uploadAndRegisterFile method.
   * This no longer creates a new spy, preserving the call history.
   * @param record The FileRecord to return on success, or null.
   * @param error The ServiceError to return on failure, or null.
   */
  setUploadAndRegisterFileResponse(
    record: FileRecord | null,
    error: ServiceError | null,
  ) {
    if (error) {
      this.mockResponse = { record: null, error };
    } else if (record) {
      this.mockResponse = { record, error: null };
    } else {
      // To satisfy the contract, we must return an error if no record is provided.
      this.mockResponse = { record: null, error: { message: 'Mock not configured to return a record.' } };
    }
  }
}

/**
 * Factory function to create a new instance of the MockFileManagerService.
 * @returns An instance of MockFileManagerService.
 */
export function createMockFileManagerService() {
  return new MockFileManagerService();
} 