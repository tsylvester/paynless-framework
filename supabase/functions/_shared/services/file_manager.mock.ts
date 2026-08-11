// supabase/functions/_shared/services/file_manager.mock.ts
import { spy, type Spy } from 'https://deno.land/std@0.218.2/testing/mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { ServiceError } from '../types.ts';
import { DialecticStageSlug, FileType } from '../types/file_manager.types.ts';
import type {
  CanonicalPathParams,
  ContributionMetadata,
  FileRecord,
  IDownloadContentResult,
  ModelContributionUploadContext,
  PathContext,
  ResourceUploadContext,
  UploadContext,
  UserFeedbackUploadContext,
  IFileManager,
  FileManagerResponse,
} from '../types/file_manager.types.ts';
import type { ContextForDocument, ContributionType } from '../../dialectic-service/dialectic.interface.ts';
import { buildDialecticProjectResourceRow } from '../dialectic.mock.ts';

export type FileRecordOverrides = Partial<Database['public']['Tables']['dialectic_project_resources']['Row']>;

export type FileRecordCorruptions = {
  [K in keyof Database['public']['Tables']['dialectic_project_resources']['Row']]?: unknown;
};


export function buildFileRecord(overrides?: FileRecordOverrides): FileRecord {
  const base = buildDialecticProjectResourceRow({
    resource_type: FileType.RenderedDocument,
    resource_description: { type: FileType.RenderedDocument },
  });
  return { ...base, ...overrides };
}

export function invalidateFileRecord(
  corruptions: FileRecordCorruptions,
): unknown {
  return { ...buildFileRecord(), ...corruptions };
}

export type CanonicalPathParamsOverrides = Partial<CanonicalPathParams>;

export function buildCanonicalPathParams(
  overrides?: CanonicalPathParamsOverrides,
): CanonicalPathParams {
  const base: CanonicalPathParams = {
    contributionType: 'thesis',
    stageSlug: DialecticStageSlug.Thesis,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CanonicalPathParamsCorruptions = {
  [K in keyof CanonicalPathParams]?: unknown;
};

export function invalidateCanonicalPathParams(
  corruptions: CanonicalPathParamsCorruptions,
): unknown {
  return { ...buildCanonicalPathParams(), ...corruptions };
}

export type PathContextOverrides = Partial<PathContext>;

export function buildPathContext(
  overrides?: PathContextOverrides,
): PathContext {
  const base: PathContext = {
    projectId: 'project-uuid-123',
    fileType: FileType.RenderedDocument,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'mock-model',
    attemptCount: 0,
    documentKey: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type PathContextCorruptions = {
  [K in keyof PathContext]?: unknown;
};

export function invalidatePathContext(
  corruptions: PathContextCorruptions,
): unknown {
  return { ...buildPathContext(), ...corruptions };
}

export type ResourcePathContextOverrides = Partial<ResourceUploadContext['pathContext']>;

export function buildResourcePathContext(
  overrides?: ResourcePathContextOverrides,
): ResourceUploadContext['pathContext'] {
  const base: ResourceUploadContext['pathContext'] = {
    projectId: 'project-uuid-123',
    fileType: FileType.RenderedDocument,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'mock-model',
    attemptCount: 0,
    originalFileName: 'mock-resource.txt',
    documentKey: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ModelContributionPathContextOverrides = Partial<ModelContributionUploadContext['pathContext']>;

export function buildModelContributionPathContext(
  overrides?: ModelContributionPathContextOverrides,
): ModelContributionUploadContext['pathContext'] {
  const base: ModelContributionUploadContext['pathContext'] = {
    projectId: 'project-uuid-123',
    fileType: FileType.business_case,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'mock-model',
    attemptCount: 0,
    documentKey: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type UserFeedbackPathContextOverrides = Partial<UserFeedbackUploadContext['pathContext']>;

export function buildUserFeedbackPathContext(
  overrides?: UserFeedbackPathContextOverrides,
): UserFeedbackUploadContext['pathContext'] {
  const base: UserFeedbackUploadContext['pathContext'] = {
    projectId: 'project-uuid-123',
    fileType: FileType.UserFeedback,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'mock-model',
    documentKey: FileType.business_case,
    originalStoragePath: 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/1_thesis',
    originalBaseName: 'mock-resource',
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ContributionMetadataOverrides = Partial<ContributionMetadata>;

export function buildContributionMetadata(
  overrides?: ContributionMetadataOverrides,
): ContributionMetadata {
  const base: ContributionMetadata = {
    sessionId: 'session-uuid-456',
    modelIdUsed: 'mock-model-id',
    modelNameDisplay: 'Mock Model',
    stageSlug: 'thesis',
    iterationNumber: 1,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ContributionMetadataCorruptions = {
  [K in keyof ContributionMetadata]?: unknown;
};

export function invalidateContributionMetadata(
  corruptions: ContributionMetadataCorruptions,
): unknown {
  return { ...buildContributionMetadata(), ...corruptions };
}

export type ModelContributionUploadContextOverrides = Omit<Partial<ModelContributionUploadContext>, 'pathContext'>;

export function buildModelContributionUploadContext(
  pathContext: ModelContributionUploadContext['pathContext'],
  overrides?: ModelContributionUploadContextOverrides,
): ModelContributionUploadContext {
  const base: ModelContributionUploadContext = {
    fileContent: '{"key":"value"}',
    mimeType: 'application/json',
    sizeBytes: 100,
    userId: 'user-123',
    description: 'Mock model contribution upload context',
    pathContext,
    contributionMetadata: buildContributionMetadata(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ModelContributionUploadContextCorruptions = {
  [K in keyof ModelContributionUploadContext]?: unknown;
};

export function invalidateModelContributionUploadContext(
  corruptions: ModelContributionUploadContextCorruptions,
): unknown {
  return { ...buildModelContributionUploadContext({
    projectId: 'project-uuid-123',
    fileType: FileType.ModelContributionRawJson,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'mock-model',
    attemptCount: 0,
  }), ...corruptions };
}

export type UserFeedbackUploadContextOverrides = Omit<Partial<UserFeedbackUploadContext>, 'pathContext'>;

export function buildUserFeedbackUploadContext(
  pathContext: UserFeedbackUploadContext['pathContext'],
  overrides?: UserFeedbackUploadContextOverrides,
): UserFeedbackUploadContext {
  const base: UserFeedbackUploadContext = {
    fileContent: '# Feedback content',
    mimeType: 'text/markdown',
    sizeBytes: 50,
    userId: 'user-123',
    description: 'Mock user feedback upload context',
    pathContext,
    feedbackTypeForDb: 'stage_feedback',
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type UserFeedbackUploadContextCorruptions = {
  [K in keyof UserFeedbackUploadContext]?: unknown;
};

export function invalidateUserFeedbackUploadContext(
  corruptions: UserFeedbackUploadContextCorruptions,
): unknown {
  return { ...buildUserFeedbackUploadContext({
    projectId: 'project-uuid-123',
    fileType: FileType.UserFeedback,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
  }), ...corruptions };
}

export type ResourceUploadContextOverrides = Omit<Partial<ResourceUploadContext>, 'pathContext'>;

export function buildResourceUploadContext(
  pathContext: ResourceUploadContext['pathContext'],
  overrides?: ResourceUploadContextOverrides,
): ResourceUploadContext {
  const base: ResourceUploadContext = {
    fileContent: 'Mock resource content',
    mimeType: 'text/plain',
    sizeBytes: 50,
    userId: 'user-123',
    description: 'Mock resource upload context',
    pathContext,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResourceUploadContextCorruptions = {
  [K in keyof ResourceUploadContext]?: unknown;
};

export function invalidateResourceUploadContext(
  corruptions: ResourceUploadContextCorruptions,
): unknown {
  return { ...buildResourceUploadContext({
    projectId: 'project-uuid-123',
    fileType: FileType.GeneralResource,
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
  }), ...corruptions };
}

export type IDownloadContentResultOverrides = Partial<IDownloadContentResult>;

export function buildIDownloadContentResult(
  overrides?: IDownloadContentResultOverrides,
): IDownloadContentResult {
  const base: IDownloadContentResult = {
    fileName: 'mock-file.md',
    content: 'Mock file content',
    mimeType: 'text/markdown',
    sizeBytes: 100,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type IDownloadContentResultCorruptions = {
  [K in keyof IDownloadContentResult]?: unknown;
};

export function invalidateIDownloadContentResult(
  corruptions: IDownloadContentResultCorruptions,
): unknown {
  return { ...buildIDownloadContentResult(), ...corruptions };
}

/**
 * A mock implementation of the IFileManager for testing purposes.
 * Its methods are spies that can be configured to return specific values.
 */
export class MockFileManagerService implements IFileManager {
  supabase: SupabaseClient<Database>;
  storageBucket = 'mock-bucket';

  uploadAndRegisterFile: Spy<this, [context: UploadContext], Promise<FileManagerResponse>>;
  getFileSignedUrl: Spy<this, [fileId: string, table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback'], Promise<{ signedUrl: string | null; error: Error | null; }>>;
  assembleAndSaveFinalDocument: Spy<this, [rootContributionId: string, expectedSchema?: ContextForDocument], Promise<{ finalPath: string | null; error: Error | null; }>>;

  constructor() {
    this.supabase = {} as SupabaseClient<Database>; // Mock Supabase client
    this.uploadAndRegisterFile = spy(async (_context: UploadContext) => {
      return await Promise.resolve({ record: null, error: { message: 'Default mock error' } });
    });
    this.getFileSignedUrl = spy(async (_fileId: string, _table: 'dialectic_project_resources' | 'dialectic_contributions' | 'dialectic_feedback') => {
        return await Promise.resolve({ signedUrl: 'http://mock.url/file', error: null });
    });
    this.assembleAndSaveFinalDocument = spy(async (_rootContributionId: string, _expectedSchema?: ContextForDocument) => {
        return await Promise.resolve({ finalPath: 'mock/path/final.md', error: null });
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
    this.assembleAndSaveFinalDocument = spy(async (_rootContributionId: string, _expectedSchema?: ContextForDocument) => {
        return await Promise.resolve({ finalPath: 'mock/path/final.md', error: null });
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
