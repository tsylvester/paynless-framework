import { assertEquals, assertExists, assertObjectMatch } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.192.0/testing/bdd.ts";
import { spy, stub, type Stub } from "https://deno.land/std@0.192.0/testing/mock.ts";

import { getContributionContentSignedUrlHandler } from './getContributionContent.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { 
    createMockSupabaseClient, 
    type MockSupabaseDataConfig,
    type IMockSupabaseClient,
    type MockSupabaseClientSetup
} from '../_shared/supabase.mock.ts';

// Mock interfaces from getContributionContent.ts
interface User {
  id: string;
}

interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface GetUserFnResult {
  data: { user: User | null };
  error: SupabaseError | Error | null;
}

interface GetUserFn {
  (): Promise<GetUserFnResult>;
}

interface CreateSignedUrlFnResult {
  signedUrl: string | null;
  error: SupabaseError | Error | null;
}

interface CreateSignedUrlFn {
  (client: SupabaseClient, bucket: string, path: string, expiresIn: number): Promise<CreateSignedUrlFnResult>;
}

interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

describe('getContributionContentSignedUrlHandler', () => {
  let mockGetUser: GetUserFn;
  let mockCreateSignedUrl: CreateSignedUrlFn;
  let mockLogger: Logger;
  let loggerWarnSpy: Stub;
  let loggerErrorSpy: Stub;
  let loggerPlaceholder: { 
      warn: (message: string, context?: Record<string, unknown>) => void; 
      error: (message: string, context?: Record<string, unknown>) => void; 
  };

  let mockSupabaseSetup: MockSupabaseClientSetup;
  let mockDbClient: IMockSupabaseClient;

  beforeEach(async () => {
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null });
    mockCreateSignedUrl = async () => ({ signedUrl: 'test-signed-url', error: null });

    const defaultConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' })
            }
        }
    };
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', defaultConfig);
    mockDbClient = mockSupabaseSetup.client;

    loggerPlaceholder = {
        warn: () => {},
        error: () => {}
    };
    loggerWarnSpy = stub(loggerPlaceholder, "warn"); 
    loggerErrorSpy = stub(loggerPlaceholder, "error");
    mockLogger = {
      warn: loggerPlaceholder.warn,
      error: loggerPlaceholder.error,
    };
  });

  afterEach(() => {
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) {
        mockSupabaseSetup.clearAllStubs();
    }
  });

  it('should return an error if contributionId is not provided', async () => {
    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: '' }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, 'contributionId is required');
    assertEquals(result.error?.code, 'VALIDATION_ERROR');
    assertEquals(result.error?.status, 400);
  });

  it('should return an error if user is not authenticated', async () => {
    mockGetUser = async () => ({ data: { user: null }, error: { message: 'Auth error' } });
    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'test-contrib-id' }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, 'User not authenticated');
    assertEquals(result.error?.code, 'AUTH_ERROR');
    assertEquals(result.error?.status, 401);
    assertEquals(loggerWarnSpy.calls.length, 1);
    assertObjectMatch(loggerWarnSpy.calls[0].args[1] as Record<string, unknown>, { error: { message: 'Auth error' } });
  });

  it('should return an error if fetching contribution details fails', async () => {
    const dbError = { name: 'DatabaseError', message: 'DB error', code: 'PGRST116', details: 'details', hint: 'hint' };
    const configWithError: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: null, error: dbError as Error, count: 0, status: 500, statusText: 'Internal Server Error' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', configWithError);
    mockDbClient = mockSupabaseSetup.client;

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'test-contrib-id' }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, 'Failed to fetch contribution details.');
    assertEquals(result.error?.details, dbError.message);
    assertEquals(result.error?.code, 'DB_FETCH_ERROR');
    assertEquals(result.error?.status, 500);
    assertEquals(loggerErrorSpy.calls.length, 1);
    assertObjectMatch(loggerErrorSpy.calls[0].args[1] as Record<string, unknown>, { error: dbError, contributionId: 'test-contrib-id' });
  });

  it('should return an error if contribution is not found', async () => {
    const notFoundConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: null, error: null, count: 0, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', notFoundConfig);
    mockDbClient = mockSupabaseSetup.client;

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'non-existent-id' }
    );
    assertExists(result.error);
    assertEquals(result.error?.message, 'Contribution not found.');
    assertEquals(result.error?.code, 'NOT_FOUND');
    assertEquals(result.error?.status, 404);
    assertEquals(loggerWarnSpy.calls.length, 1); 
    assertObjectMatch(loggerWarnSpy.calls[0].args[1] as Record<string, unknown>, { contributionId: 'non-existent-id' });
  });

  it('should return an error if user is not authorized to access the contribution', async () => {
    const contributionData = {
      id: 'contrib-id-unauthorized',
      content_storage_bucket: 'bucket',
      content_storage_path: 'path',
      content_mime_type: 'text/plain',
      content_size_bytes: 100,
      dialectic_sessions: {
        project_id: 'proj-1',
        dialectic_projects: {
          user_id: 'other-user-id' 
        }
      }
    };
    const authConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                 select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', authConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null }); 

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'contrib-id-unauthorized' }
    );

    assertExists(result.error);
    assertEquals(result.error?.message, 'User not authorized to access this contribution.');
    assertEquals(result.error?.code, 'AUTH_FORBIDDEN');
    assertEquals(result.error?.status, 403);
    assertEquals(loggerWarnSpy.calls.length, 1);
    assertObjectMatch(loggerWarnSpy.calls[0].args[1] as Record<string, unknown>, { 
      contributionId: 'contrib-id-unauthorized', 
      userId: 'test-user-id', 
      projectOwnerUserId: 'other-user-id' 
    });
  });

  it('should return an error if contribution is missing storage information (bucket)', async () => {
    const contributionData = {
      id: 'contrib-id-missing-bucket',
      content_storage_path: 'path/to/file.txt',
      content_mime_type: 'text/plain',
      content_size_bytes: 12345,
      dialectic_sessions: {
        project_id: 'proj-1',
        dialectic_projects: { user_id: 'test-user-id' }
      }
    };
    const missingBucketConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', missingBucketConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null });

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'contrib-id-missing-bucket' }
    );

    assertExists(result.error);
    assertEquals(result.error?.message, 'Contribution is missing storage information.');
    assertEquals(result.error?.code, 'INTERNAL_ERROR');
    assertEquals(result.error?.status, 500);
    assertEquals(loggerErrorSpy.calls.length, 1);
    assertObjectMatch(loggerErrorSpy.calls[0].args[1] as Record<string, unknown>, { contributionId: 'contrib-id-missing-bucket' });
  });

  it('should return an error if contribution is missing storage information (path)', async () => {
    const contributionData = {
      id: 'contrib-id-missing-path',
      content_storage_bucket: 'test-bucket',
      content_mime_type: 'text/plain',
      content_size_bytes: 12345,
      dialectic_sessions: {
        project_id: 'proj-1',
        dialectic_projects: { user_id: 'test-user-id' }
      }
    };
    const missingPathConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', missingPathConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null });

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'contrib-id-missing-path' }
    );

    assertExists(result.error);
    assertEquals(result.error?.message, 'Contribution is missing storage information.');
    assertEquals(result.error?.code, 'INTERNAL_ERROR');
    assertEquals(result.error?.status, 500);
    assertEquals(loggerErrorSpy.calls.length, 1);
    assertObjectMatch(loggerErrorSpy.calls[0].args[1] as Record<string, unknown>, { contributionId: 'contrib-id-missing-path' });
  });

  it('should return an error if createSignedUrl fails', async () => {
    const contributionData = {
      id: 'contrib-id-signed-url-error',
      content_storage_bucket: 'test-bucket',
      content_storage_path: 'path/to/file.txt',
      content_mime_type: 'text/plain',
      content_size_bytes: 12345,
      dialectic_sessions: {
        project_id: 'proj-1',
        dialectic_projects: { user_id: 'test-user-id' }
      }
    };
    const signedUrlErrorConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', signedUrlErrorConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null });
    
    const signedUrlGenerationError = { message: 'Signed URL generation failed' };
    mockCreateSignedUrl = async () => ({ signedUrl: null, error: signedUrlGenerationError });

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'contrib-id-signed-url-error' }
    );

    assertExists(result.error);
    assertEquals(result.error?.message, 'Failed to generate signed URL.');
    assertEquals(result.error?.details, signedUrlGenerationError.message);
    assertEquals(result.error?.code, 'STORAGE_ERROR');
    assertEquals(result.error?.status, 500);
    assertEquals(loggerErrorSpy.calls.length, 1);
    assertObjectMatch(loggerErrorSpy.calls[0].args[1] as Record<string, unknown>, { 
      error: signedUrlGenerationError, 
      contributionId: 'contrib-id-signed-url-error' 
    });
  });

  it('should return an error if createSignedUrl returns null for signedUrl (and no error object)', async () => {
    const contributionData = {
      id: 'contrib-id-null-url',
      content_storage_bucket: 'test-bucket',
      content_storage_path: 'path/to/file.txt',
      content_mime_type: 'text/plain',
      content_size_bytes: 12345,
      dialectic_sessions: {
        project_id: 'proj-1',
        dialectic_projects: { user_id: 'test-user-id' }
      }
    };
    const nullUrlConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient('test-user-id', nullUrlConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: 'test-user-id' } }, error: null });
    mockCreateSignedUrl = async () => ({ signedUrl: null, error: null });

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId: 'contrib-id-null-url' }
    );

    assertExists(result.error);
    assertEquals(result.error?.message, 'Failed to generate signed URL, received null.');
    assertEquals(result.error?.code, 'STORAGE_ERROR');
    assertEquals(result.error?.status, 500);
    assertEquals(loggerErrorSpy.calls.length, 1);
    assertObjectMatch(loggerErrorSpy.calls[0].args[1] as Record<string, unknown>, { contributionId: 'contrib-id-null-url' });
  });

  it('should successfully return a signed URL with mime type and size', async () => {
    const testUserId = 'test-user-id-success';
    const contributionId = 'contrib-id-success';
    const expectedSignedUrl = 'https://example.com/signed/url';
    const expectedMimeType = 'image/png';
    const expectedSizeBytes = 98765;
    const bucket = 'test-bucket';
    const path = 'path/to/image.png';

    const contributionData = {
      id: contributionId,
      content_storage_bucket: bucket,
      content_storage_path: path,
      content_mime_type: expectedMimeType,
      content_size_bytes: expectedSizeBytes,
      dialectic_sessions: {
        project_id: 'proj-success',
        dialectic_projects: { user_id: testUserId }
      }
    };
    const successConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient(testUserId, successConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: testUserId } }, error: null });
    mockCreateSignedUrl = async (client, b, p, exp) => {
      assertEquals(b, bucket);
      assertEquals(p, path);
      assertEquals(exp, 60 * 5);
      return { signedUrl: expectedSignedUrl, error: null };
    };

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId }
    );

    assertEquals(result.error, undefined, `Expected no error, but got: ${JSON.stringify(result.error)}`);
    assertExists(result.data);
    assertEquals(result.data?.signedUrl, expectedSignedUrl);
    assertEquals(result.data?.mimeType, expectedMimeType);
    assertEquals(result.data?.sizeBytes, expectedSizeBytes);
    assertEquals(loggerWarnSpy.calls.length, 0);
    assertEquals(loggerErrorSpy.calls.length, 0);
  });

  it('should use default mime type if not present in contribution data', async () => {
    const testUserId = 'test-user-id-default-mime';
    const contributionId = 'contrib-id-default-mime';
    const expectedSignedUrl = 'https://example.com/signed/default_mime_url';
    const expectedSizeBytes = 12345;
    const bucket = 'default-mime-bucket';
    const path = 'path/to/some_file';

    const contributionData = {
      id: contributionId,
      content_storage_bucket: bucket,
      content_storage_path: path,
      content_mime_type: null,
      content_size_bytes: expectedSizeBytes,
      dialectic_sessions: {
        project_id: 'proj-default-mime',
        dialectic_projects: { user_id: testUserId }
      }
    };
    const defaultMimeConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_contributions: {
                select: async () => ({ data: [contributionData], error: null, count: 1, status: 200, statusText: 'OK' })
            }
        }
    };
    if (mockSupabaseSetup && mockSupabaseSetup.clearAllStubs) mockSupabaseSetup.clearAllStubs();
    mockSupabaseSetup = createMockSupabaseClient(testUserId, defaultMimeConfig);
    mockDbClient = mockSupabaseSetup.client;
    mockGetUser = async () => ({ data: { user: { id: testUserId } }, error: null });
    mockCreateSignedUrl = async () => ({ signedUrl: expectedSignedUrl, error: null });

    const result = await getContributionContentSignedUrlHandler(
      mockGetUser,
      mockDbClient as unknown as SupabaseClient,
      mockCreateSignedUrl,
      mockLogger,
      { contributionId }
    );

    assertExists(result.data);
    assertEquals(result.data?.signedUrl, expectedSignedUrl);
    assertEquals(result.data?.mimeType, 'application/octet-stream');
    assertEquals(result.data?.sizeBytes, expectedSizeBytes);
  });

});
