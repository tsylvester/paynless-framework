import type { DownloadStorageResult, DownloadFromStorageFn } from './supabase_storage_utils.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Configuration for the mock download function's behavior.
 * You can specify one of four modes:
 * - 'success': The mock will successfully return the provided ArrayBuffer.
 * - 'pathKeyed': The mock will return the ArrayBuffer mapped to the requested path.
 * - 'error': The mock will return null data and the provided Error object.
 * - 'empty': The mock will return null data and a generic "No data" error.
 */
export type MockDownloadConfig =
  | {
      mode: 'success';
      data: ArrayBuffer;
      mimeType?: string;
    }
  | {
      mode: 'pathKeyed';
      pathToData: Record<string, ArrayBuffer>;
      mimeType?: string;
    }
  | {
      mode: 'error';
      error: Error;
    }
  | {
      mode: 'empty';
    };

/**
 * Creates a mock implementation of DownloadFromStorageFn suitable for
 * direct injection into consumers like JobContext.
 *
 * @param config - A configuration object that defines how the mock should behave.
 * @returns A mock function that simulates downloading from storage according to the config.
 */
export function createMockDownloadFromStorage(
  config: MockDownloadConfig
): DownloadFromStorageFn {
  const mockDownloadFn = async (
    _supabase: SupabaseClient,
    _bucket: string,
    _path: string,
  ): Promise<DownloadStorageResult> => {
    switch (config.mode) {
      case 'success':
        return Promise.resolve({
          data: config.data,
          mimeType: config.mimeType,
          error: null,
        });
      case 'pathKeyed': {
        const data = config.pathToData[_path];
        if (data === undefined) {
          return Promise.resolve({
            data: null,
            error: new Error(`No mock data configured for path: ${_path}`),
          });
        }
        return Promise.resolve({
          data,
          mimeType: config.mimeType,
          error: null,
        });
      }
      case 'error':
        return Promise.resolve({
          data: null,
          error: config.error,
        });
      case 'empty':
        return Promise.resolve({
          data: null,
          error: new Error("No data returned from storage download."),
        });
      default:
        // This should be unreachable if config is typed correctly
        throw new Error('Invalid mock configuration for createMockDownloadFromStorage.');
    }
  };
  return mockDownloadFn;
}
