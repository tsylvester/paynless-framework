// supabase/functions/_shared/services/file_manager.mock.ts
import { spy, type Spy } from 'https://deno.land/std@0.218.2/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
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
  supabase: SupabaseClient<Database>;
  storageBucket = 'mock-bucket';

  uploadAndRegisterFile: Spy<this, [context: UploadContext], Promise<FileManagerResponse>>;
  getFileSignedUrl: Spy<this, [fileId: string, table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback'], Promise<{ signedUrl: string | null; error: Error | null; }>>;

  constructor() {
    this.supabase = {} as SupabaseClient<Database>; // Mock Supabase client
    this.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
      return await Promise.resolve({ record: null, error: { message: 'Default mock error' } });
    });
    this.getFileSignedUrl = spy(async (_fileId: string, _table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback') => {
        return await Promise.resolve({ signedUrl: 'http://mock.url/file', error: null });
    });
  }

  /**
   * Resets the spies for all methods.
   */
  reset() {
    this.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
        return await Promise.resolve({ record: null, error: { message: 'Default mock error' } });
    });
    this.getFileSignedUrl = spy(async (_fileId: string, _table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback') => {
        return await Promise.resolve({ signedUrl: 'http://mock.url/file', error: null });
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
      this.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
          if(error) return await Promise.resolve({ record: null, error });
          if(record) return await Promise.resolve({ record, error: null });
          return await Promise.resolve({ record: null, error: { message: 'Mock not configured to return a record.' } });
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
