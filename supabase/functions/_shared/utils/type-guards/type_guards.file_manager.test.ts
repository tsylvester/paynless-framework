import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  isFileType,
  isCanonicalPathParams,
  isModelContributionContext,
  isUserFeedbackContext,
  isModelContributionFileType,
  isResourceContext,
} from './type_guards.file_manager.ts'
import {
  CanonicalPathParams,
  FileType,
  ModelContributionUploadContext,
  ResourceUploadContext,
  UserFeedbackUploadContext,
} from '../../types/file_manager.types.ts'
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'

// --- Mocks ---

const mockModelContributionContext: ModelContributionUploadContext = {
  pathContext: {
    fileType: FileType.business_case,
    projectId: 'project-123',
    sessionId: 'session-123',
    iteration: 1,
    stageSlug: 'test-stage',
    modelSlug: 'test-model',
    attemptCount: 1,
  },
  contributionMetadata: {
    iterationNumber: 1,
    modelIdUsed: 'model-id-123',
    modelNameDisplay: 'Test Model',
    sessionId: 'session-123',
    stageSlug: 'test-stage',
    rawJsonResponseContent: '{}',
  },
  fileContent: Buffer.from('test'),
  mimeType: 'text/plain',
  sizeBytes: 4,
  userId: 'user-123',
  description: 'A model contribution',
}

const mockUserFeedbackContext: UserFeedbackUploadContext = {
  pathContext: {
    fileType: FileType.UserFeedback,
    projectId: 'project-123',
    sessionId: 'session-123',
    iteration: 1,
    stageSlug: 'feedback-stage',
  },
  feedbackTypeForDb: 'general-feedback',
  fileContent: Buffer.from('feedback'),
  mimeType: 'text/plain',
  sizeBytes: 8,
  userId: 'user-123',
  description: 'User feedback',
}

const mockResourceContext: ResourceUploadContext = {
  pathContext: {
    fileType: FileType.ProjectReadme,
    projectId: 'project-123',
  },
  fileContent: Buffer.from('readme'),
  mimeType: 'text/markdown',
  sizeBytes: 6,
  userId: 'user-123',
  description: 'A project readme',
}

Deno.test('Type Guard: isCanonicalPathParams', async (t) => {
  await t.step('should return true for a valid CanonicalPathParams object', () => {
    const params: CanonicalPathParams = {
            contributionType: 'thesis',
            sourceModelSlugs: ['model-1', 'model-2'],
            stageSlug: 'test-stage',
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return true for a minimal CanonicalPathParams object', () => {
        const params: CanonicalPathParams = {
            contributionType: 'synthesis',
            stageSlug: 'test-stage',
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is missing', () => {
        const params = {
            sourceModelSlugs: ['model-1'],
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is not a string', () => {
        const params = {
            contributionType: 123,
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isCanonicalPathParams(null));
        assert(!isCanonicalPathParams('a string'));
        assert(!isCanonicalPathParams([]));
    });
});

Deno.test('Type Guard: isFileType', async (t) => {
    for (const type of Object.values(FileType)) {
        await t.step(`should return true for valid file type: ${type}`, () => {
            assert(isFileType(type));
        });
    }

    await t.step('should return false for an invalid file type string', () => {
        assert(!isFileType('invalid_file_type'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isFileType(null));
        assert(!isFileType(undefined));
        assert(!isFileType(123));
        assert(!isFileType({}));
        assert(!isFileType([]));
    });

    await t.step('should return false for a string that is a valid ContributionType but not a FileType', () => {
        assert(!isFileType('thesis'));
        assert(!isFileType('antithesis'));
    });
});

Deno.test('Type Guard: isModelContributionContext', async (t) => {
  await t.step('should return true for a valid ModelContributionUploadContext', () => {
    assert(isModelContributionContext(mockModelContributionContext))
  })

  await t.step('should return false for a UserFeedbackUploadContext', () => {
    assert(!isModelContributionContext(mockUserFeedbackContext))
  })

  await t.step('should return false for a ResourceUploadContext', () => {
    assert(!isModelContributionContext(mockResourceContext))
  })

  await t.step('should return false for an object that looks like a resource', () => {
    const context = {
      pathContext: { fileType: FileType.ProjectReadme },
    }
    assert(!isModelContributionContext(context))
  })

  await t.step('should return false for non-object inputs', () => {
    assert(!isModelContributionContext(null))
    assert(!isModelContributionContext('a string'))
  })
})

Deno.test('Type Guard: isUserFeedbackContext', async (t) => {
  await t.step('should return true for a valid UserFeedbackUploadContext', () => {
    assert(isUserFeedbackContext(mockUserFeedbackContext))
  })

  await t.step('should return false for a ModelContributionUploadContext', () => {
    assert(!isUserFeedbackContext(mockModelContributionContext))
  })

  await t.step('should return false for an object without feedbackTypeForDb', () => {
    const { feedbackTypeForDb, ...rest } = mockUserFeedbackContext
    assert(!isUserFeedbackContext(rest))
  })
})

Deno.test('Type Guard: isResourceContext', async (t) => {
  await t.step('should return true for a valid ResourceUploadContext', () => {
    assert(isResourceContext(mockResourceContext))
  })

  await t.step('should return false for a ModelContributionUploadContext', () => {
    assert(!isResourceContext(mockModelContributionContext))
  })

  await t.step('should return false for a UserFeedbackUploadContext', () => {
    assert(!isResourceContext(mockUserFeedbackContext))
  })
})

Deno.test('Type Guard: isModelContributionFileType', async (t) => {
  await t.step('accepts model contribution file types', () => {
    assert(isModelContributionFileType(FileType.HeaderContext))
    assert(isModelContributionFileType(FileType.business_case))
  })

  await t.step('rejects non-model file types', () => {
    assert(!isModelContributionFileType(FileType.ProjectReadme))
    assert(!isModelContributionFileType(FileType.SeedPrompt))
    assert(!isModelContributionFileType(FileType.PlannerPrompt))
  })
})