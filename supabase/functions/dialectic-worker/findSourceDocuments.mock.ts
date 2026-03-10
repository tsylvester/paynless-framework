import { FindSourceDocumentsFn } from './JobContext.interface.ts';
import { SourceDocument } from '../dialectic-service/dialectic.interface.ts';

export type MockFindSourceDocumentsConfig =
  | {
      mode: 'success';
      documents: SourceDocument[];
    }
  | {
      mode: 'error';
      error: Error;
    }
  | {
      mode: 'empty';
    };

/**
 * Creates a mock implementation of FindSourceDocumentsFn suitable for
 * direct injection into consumers like JobContext.
 *
 * @param config - A configuration object that defines how the mock should behave.
 * @returns A mock function that simulates finding source documents according to the config.
 */
export function createMockFindSourceDocuments(
  config: MockFindSourceDocumentsConfig,
): FindSourceDocumentsFn {
  const mockFindSourceDocuments: FindSourceDocumentsFn = async (
    _dbClient,
    _parentJob,
    _inputsRequired,
  ) => {
    switch (config.mode) {
      case 'success':
        return config.documents.slice();
      case 'error':
        throw config.error;
      case 'empty':
        return [];
      default:
        // This should be unreachable if config is typed correctly
        throw new Error('Invalid mock configuration for createMockFindSourceDocuments.');
    }
  };

  return mockFindSourceDocuments;
}


