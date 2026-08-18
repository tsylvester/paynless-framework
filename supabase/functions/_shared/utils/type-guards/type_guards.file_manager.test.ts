import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  isFileType,
  isCanonicalPathParams,
  isModelContributionContext,
  isUserFeedbackContext,
  isModelContributionFileType,
  isResourceContext,
  isResourceFileType,
  isOutputType,
  isDocumentKey,
  isDocumentRelated,
  isCompressedContextFileType,
  isCompressedContextRawJsonFileType,
  isCompressionPromptFileType,
  isCompressionSourceType,
  isCompressionMode,
  isCompressionHistoryRole,
  isDialecticStageSlug,
  isFileManagerError
} from './type_guards.file_manager.ts'
import {
  FileType,
  ModelContributionUploadContext,
  ResourceUploadContext,
  UserFeedbackUploadContext,
  DialecticStageSlug,
} from '../../types/file_manager.types.ts'
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts'
import { buildCanonicalPathParams, invalidateCanonicalPathParams } from '../../services/file_manager.mock.ts'

// --- Mocks ---

const mockModelContributionContext: ModelContributionUploadContext = {
  pathContext: {
    fileType: FileType.business_case,
    projectId: 'project-123',
    sessionId: 'session-123',
    iteration: 1,
    stageSlug: DialecticStageSlug.Thesis,
    modelSlug: 'test-model',
    attemptCount: 1,
  },
  contributionMetadata: {
    iterationNumber: 1,
    modelIdUsed: 'model-id-123',
    modelNameDisplay: 'Test Model',
    sessionId: 'session-123',
    stageSlug: 'test-stage',
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
    stageSlug: DialecticStageSlug.Thesis,
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
    /** Contract: case 1 — the builder's valid default (optionals absent) is accepted. */
    await t.step('accepts the builder default', () => {
        assert(isCanonicalPathParams(buildCanonicalPathParams()));
    });

    /** Contract: case 2 — valid overrides supplying every optional member are accepted. */
    await t.step('accepts all optional members supplied', () => {
        assert(isCanonicalPathParams(buildCanonicalPathParams({
            sourceModelSlugs: ['model-1', 'model-2'],
            sourceAnchorType: 'thesis',
            sourceAnchorModelSlug: 'claude-3-opus',
            sourceAttemptCount: 1,
            pairedModelSlug: 'gemini-1.5-pro',
        })));
    });

    /** Contract: case 3 — null, undefined, a primitive, and an array are rejected. */
    await t.step('rejects non-objects', () => {
        assert(!isCanonicalPathParams(null));
        assert(!isCanonicalPathParams(undefined));
        assert(!isCanonicalPathParams('a string'));
        assert(!isCanonicalPathParams([]));
    });

    /** Contract: case 4 — contributionType corrupted is rejected. */
    await t.step('rejects contributionType corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ contributionType: 123 })));
    });

    /** Contract: case 4 — stageSlug corrupted is rejected. */
    await t.step('rejects stageSlug corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ stageSlug: 42 })));
    });

    /** Contract: case 4 — sourceModelSlugs corrupted is rejected. */
    await t.step('rejects sourceModelSlugs corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ sourceModelSlugs: 'not-an-array' })));
    });

    /** Contract: case 4 — sourceAnchorType corrupted is rejected. */
    await t.step('rejects sourceAnchorType corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ sourceAnchorType: 7 })));
    });

    /** Contract: case 4 — sourceAnchorModelSlug corrupted is rejected. */
    await t.step('rejects sourceAnchorModelSlug corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ sourceAnchorModelSlug: false })));
    });

    /** Contract: case 4 — sourceAttemptCount corrupted is rejected. */
    await t.step('rejects sourceAttemptCount corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ sourceAttemptCount: 'not-a-number' })));
    });

    /** Contract: case 4 — pairedModelSlug corrupted is rejected. */
    await t.step('rejects pairedModelSlug corrupted', () => {
        assert(!isCanonicalPathParams(invalidateCanonicalPathParams({ pairedModelSlug: 99 })));
    });

    /** Contract: case 5 — contributionType omitted (rest-destructured away) is rejected. */
    await t.step('rejects contributionType omitted', () => {
        const { contributionType: _omit, ...missing } = buildCanonicalPathParams();
        assert(!isCanonicalPathParams(missing));
    });

    /** Contract: case 5 — stageSlug omitted (rest-destructured away) is rejected. */
    await t.step('rejects stageSlug omitted', () => {
        const { stageSlug: _omit, ...missing } = buildCanonicalPathParams();
        assert(!isCanonicalPathParams(missing));
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

  await t.step('should return true for UserFeedbackUploadContext with originalStoragePath and originalBaseName in pathContext', () => {
    const contextWithOriginalPath: UserFeedbackUploadContext = {
      ...mockUserFeedbackContext,
      pathContext: {
        ...mockUserFeedbackContext.pathContext,
        originalStoragePath: 'project-123/session_abc/iteration_1/1_thesis/documents',
        originalBaseName: 'business_case_0_claude',
      },
    }
    assert(isUserFeedbackContext(contextWithOriginalPath))
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

  await t.step('should return false for an object missing pathContext', () => {
    const { pathContext, ...rest } = mockResourceContext;
    assert(!isResourceContext(rest), "A context without pathContext is not a valid ResourceUploadContext");
  });

  await t.step('should return false for an object with pathContext but missing fileType', () => {
    const invalidContext = {
      ...mockResourceContext,
      pathContext: {
        projectId: 'project-123',
      },
    };
    assert(!isResourceContext(invalidContext), "A context without fileType in pathContext is not valid");
  });

  await t.step('should return false for an object with a fileType that is not a ResourceFileType', () => {
    const invalidContext = {
        ...mockResourceContext,
        pathContext: {
            ...mockResourceContext.pathContext,
            fileType: FileType.business_case, // This is a ModelContributionFileType
        },
    };
    assert(!isResourceContext(invalidContext), "A context with a non-resource fileType is not valid");
  });

  // Test for required properties from UploadContextBase
  const requiredBaseKeys: (keyof typeof mockResourceContext)[] = ['fileContent', 'mimeType', 'sizeBytes', 'userId', 'description'];
  for (const key of requiredBaseKeys) {
    await t.step(`should return false if required property '${key}' is missing`, () => {
        const { [key]: _, ...invalidContext } = mockResourceContext;
        assert(!isResourceContext(invalidContext), `Context missing '${key}' should be invalid`);
    });
  }
})

Deno.test('Type Guard: isModelContributionFileType', async (t) => {
  await t.step('accepts model contribution file types', () => {
    assert(isModelContributionFileType(FileType.HeaderContext))
    assert(isModelContributionFileType(FileType.AssembledDocumentJson))
    assert(isModelContributionFileType(FileType.business_case))
  })

  await t.step('rejects non-model file types', () => {
    assert(!isModelContributionFileType(FileType.ProjectReadme))
    assert(!isModelContributionFileType(FileType.SeedPrompt))
    assert(!isModelContributionFileType(FileType.PlannerPrompt))
  })
})

Deno.test('Type Guard: isOutputType', async (t) => {
  await t.step('returns true for renderable output types', () => {
    assert(isOutputType(FileType.business_case))
    assert(isOutputType(FileType.feature_spec))
    assert(isOutputType(FileType.technical_approach))
    assert(isOutputType(FileType.success_metrics))
    assert(isOutputType(FileType.business_case_critique))
    assert(isOutputType(FileType.technical_feasibility_assessment))
    assert(isOutputType(FileType.risk_register))
    assert(isOutputType(FileType.non_functional_requirements))
    assert(isOutputType(FileType.dependency_map))
    assert(isOutputType(FileType.comparison_vector))
    assert(isOutputType(FileType.product_requirements))
    assert(isOutputType(FileType.system_architecture))
    assert(isOutputType(FileType.tech_stack))
    assert(isOutputType(FileType.technical_requirements))
    assert(isOutputType(FileType.master_plan))
    assert(isOutputType(FileType.milestone_schema))
    assert(isOutputType(FileType.updated_master_plan))
    assert(isOutputType(FileType.actionable_checklist))
    assert(isOutputType(FileType.advisor_recommendations))
  })

  await t.step('returns false for backend-only model contribution file types', () => {
    assert(!isOutputType(FileType.HeaderContext))
    assert(!isOutputType(FileType.ModelContributionRawJson))
    assert(!isOutputType(FileType.PairwiseSynthesisChunk))
    assert(!isOutputType(FileType.ReducedSynthesis))
    assert(!isOutputType(FileType.Synthesis))
    assert(!isOutputType(FileType.header_context_pairwise))
    assert(!isOutputType(FileType.SynthesisHeaderContext))
  })

  await t.step('returns false for intermediate synthesis types', () => {
    assert(!isOutputType(FileType.synthesis_pairwise_business_case))
    assert(!isOutputType(FileType.synthesis_pairwise_feature_spec))
    assert(!isOutputType(FileType.synthesis_pairwise_technical_approach))
    assert(!isOutputType(FileType.synthesis_pairwise_success_metrics))
    assert(!isOutputType(FileType.synthesis_document_business_case))
    assert(!isOutputType(FileType.synthesis_document_feature_spec))
    assert(!isOutputType(FileType.synthesis_document_technical_approach))
    assert(!isOutputType(FileType.synthesis_document_success_metrics))
  })
})

Deno.test('Type Guard: isDocumentKey', async (t) => {
  await t.step('40.c.i: returns true for all DocumentKey file types', () => {
    assert(isDocumentKey(FileType.business_case))
    assert(isDocumentKey(FileType.feature_spec))
    assert(isDocumentKey(FileType.technical_approach))
    assert(isDocumentKey(FileType.success_metrics))
    assert(isDocumentKey(FileType.business_case_critique))
    assert(isDocumentKey(FileType.technical_feasibility_assessment))
    assert(isDocumentKey(FileType.risk_register))
    assert(isDocumentKey(FileType.non_functional_requirements))
    assert(isDocumentKey(FileType.dependency_map))
    assert(isDocumentKey(FileType.comparison_vector))
    assert(isDocumentKey(FileType.product_requirements))
    assert(isDocumentKey(FileType.system_architecture))
    assert(isDocumentKey(FileType.tech_stack))
    assert(isDocumentKey(FileType.technical_requirements))
    assert(isDocumentKey(FileType.master_plan))
    assert(isDocumentKey(FileType.milestone_schema))
    assert(isDocumentKey(FileType.updated_master_plan))
    assert(isDocumentKey(FileType.actionable_checklist))
    assert(isDocumentKey(FileType.advisor_recommendations))
    assert(isDocumentKey(FileType.synthesis_pairwise_business_case))
    assert(isDocumentKey(FileType.synthesis_pairwise_feature_spec))
    assert(isDocumentKey(FileType.synthesis_pairwise_technical_approach))
    assert(isDocumentKey(FileType.synthesis_pairwise_success_metrics))
    assert(isDocumentKey(FileType.synthesis_document_business_case))
    assert(isDocumentKey(FileType.synthesis_document_feature_spec))
    assert(isDocumentKey(FileType.synthesis_document_technical_approach))
    assert(isDocumentKey(FileType.synthesis_document_success_metrics))
  })

  await t.step('40.c.ii: returns false for non-DocumentKey file types', () => {
    assert(!isDocumentKey(FileType.HeaderContext))
    assert(!isDocumentKey(FileType.ModelContributionRawJson))
    assert(!isDocumentKey(FileType.PairwiseSynthesisChunk))
    assert(!isDocumentKey(FileType.ReducedSynthesis))
    assert(!isDocumentKey(FileType.Synthesis))
    assert(!isDocumentKey(FileType.header_context_pairwise))
    assert(!isDocumentKey(FileType.SynthesisHeaderContext))
    assert(!isDocumentKey(FileType.ProjectReadme))
    assert(!isDocumentKey(FileType.SeedPrompt))
    assert(!isDocumentKey(FileType.PlannerPrompt))
    assert(!isDocumentKey(FileType.TurnPrompt))
    assert(!isDocumentKey(FileType.AssembledDocumentJson))
    assert(!isDocumentKey(FileType.RenderedDocument))
  })
})

Deno.test('Type Guard: isDocumentRelated', async (t) => {
    await t.step('returns true for DocumentKey file types', () => {
        assert(isDocumentRelated(FileType.business_case));
        assert(isDocumentRelated(FileType.feature_spec));
        assert(isDocumentRelated(FileType.technical_approach));
    });

    await t.step('returns true for AssembledDocumentJson', () => {
        assert(isDocumentRelated(FileType.AssembledDocumentJson));
    });

    await t.step('returns true for ModelContributionRawJson', () => {
        assert(isDocumentRelated(FileType.ModelContributionRawJson));
    });

    await t.step('returns true for RenderedDocument', () => {
        assert(isDocumentRelated(FileType.RenderedDocument));
    });

    await t.step('returns false for HeaderContext', () => {
        assert(!isDocumentRelated(FileType.HeaderContext));
    });

    await t.step('returns false for ProjectReadme', () => {
        assert(!isDocumentRelated(FileType.ProjectReadme));
    });

    await t.step('returns false for null/undefined/non-strings', () => {
        assert(!isDocumentRelated(null));
        assert(!isDocumentRelated(undefined));
        assert(!isDocumentRelated(123));
    });
});

Deno.test('Type Guard: isCompressedContextFileType', async (t) => {
    await t.step('returns true for CompressedContext enum and string value', () => {
        assert(isCompressedContextFileType(FileType.CompressedContext));
        assert(isCompressedContextFileType('compressed_context'));
    });

    await t.step('returns false for every other FileType value', () => {
        for (const fileType of Object.values(FileType)) {
            if (fileType === FileType.CompressedContext) continue;
            assert(!isCompressedContextFileType(fileType));
        }
    });

    await t.step('returns false for non-string and arbitrary string values', () => {
        assert(!isCompressedContextFileType(null));
        assert(!isCompressedContextFileType(undefined));
        assert(!isCompressedContextFileType(123));
        assert(!isCompressedContextFileType('foo'));
    });
});

Deno.test('Type Guard: isCompressionSourceType', async (t) => {
    await t.step('returns true for all CompressionSourceType values', () => {
        assert(isCompressionSourceType('contribution'));
        assert(isCompressionSourceType('resource'));
        assert(isCompressionSourceType('feedback'));
        assert(isCompressionSourceType('history'));
    });

    await t.step('returns false for invalid values', () => {
        assert(!isCompressionSourceType('foo'));
        assert(!isCompressionSourceType(null));
        assert(!isCompressionSourceType(undefined));
        assert(!isCompressionSourceType(123));
    });
});

Deno.test('Type Guard: isCompressionMode', async (t) => {
    await t.step('returns true for all CompressionMode values', () => {
        assert(isCompressionMode('json'));
        assert(isCompressionMode('text'));
    });

    await t.step('returns false for invalid values', () => {
        assert(!isCompressionMode('foo'));
        assert(!isCompressionMode(null));
        assert(!isCompressionMode(undefined));
        assert(!isCompressionMode(123));
    });
});

Deno.test('Type Guard: isCompressionHistoryRole', async (t) => {
    await t.step('returns true for every Messages role', () => {
        assert(isCompressionHistoryRole('system'));
        assert(isCompressionHistoryRole('user'));
        assert(isCompressionHistoryRole('assistant'));
        assert(isCompressionHistoryRole('function'));
    });

    await t.step('returns false for invalid values', () => {
        assert(!isCompressionHistoryRole('model'));
        assert(!isCompressionHistoryRole('tool'));
        assert(!isCompressionHistoryRole(''));
        assert(!isCompressionHistoryRole('User'));
        assert(!isCompressionHistoryRole(null));
        assert(!isCompressionHistoryRole(undefined));
        assert(!isCompressionHistoryRole(123));
        assert(!isCompressionHistoryRole({}));
    });
});

Deno.test('Type Guard: isResourceFileType recognizes CompressedContext', () => {
    assert(isResourceFileType(FileType.CompressedContext));
});

Deno.test('Type Guard: isResourceFileType recognizes CompressedContextRawJson', () => {
    assert(isResourceFileType(FileType.CompressedContextRawJson));
});

Deno.test('Type Guard: isFileType recognizes compressed_context', () => {
    assert(isFileType('compressed_context'));
});

Deno.test('Type Guard: isFileType recognizes compressed_context_raw_json', () => {
    assert(isFileType('compressed_context_raw_json'));
});

Deno.test('Type Guard: isCompressedContextRawJsonFileType', async (t) => {
    await t.step('returns true for CompressedContextRawJson enum and string value', () => {
        assert(isCompressedContextRawJsonFileType(FileType.CompressedContextRawJson));
        assert(isCompressedContextRawJsonFileType('compressed_context_raw_json'));
    });

    await t.step('returns false for every other FileType value', () => {
        for (const fileType of Object.values(FileType)) {
            if (fileType === FileType.CompressedContextRawJson) continue;
            assert(!isCompressedContextRawJsonFileType(fileType));
        }
    });

    await t.step('returns false for non-string and arbitrary string values', () => {
        assert(!isCompressedContextRawJsonFileType(null));
        assert(!isCompressedContextRawJsonFileType(undefined));
        assert(!isCompressedContextRawJsonFileType(123));
        assert(!isCompressedContextRawJsonFileType('foo'));
    });
});

Deno.test('Type Guard: isCompressionPromptFileType', async (t) => {
    await t.step('returns true for CompressionPrompt enum and string value', () => {
        assert(isCompressionPromptFileType(FileType.CompressionPrompt));
        assert(isCompressionPromptFileType('compression_prompt'));
    });

    await t.step('returns false for other compression FileTypes, prompt FileTypes, and invalid values', () => {
        assert(!isCompressionPromptFileType(FileType.CompressedContext));
        assert(!isCompressionPromptFileType(FileType.CompressedContextRawJson));
        assert(!isCompressionPromptFileType(FileType.TurnPrompt));
        assert(!isCompressionPromptFileType(FileType.PlannerPrompt));
        assert(!isCompressionPromptFileType('compression_prompt '));
        assert(!isCompressionPromptFileType(''));
        assert(!isCompressionPromptFileType(null));
        assert(!isCompressionPromptFileType(undefined));
        assert(!isCompressionPromptFileType(123));
        assert(!isCompressionPromptFileType({}));
    });
});

Deno.test('Type Guard: isDialecticStageSlug', async (t) => {
    await t.step('returns true for all DialecticStageSlug values', () => {
        assert(isDialecticStageSlug(DialecticStageSlug.Thesis));
        assert(isDialecticStageSlug(DialecticStageSlug.Antithesis));
        assert(isDialecticStageSlug(DialecticStageSlug.Synthesis));
        assert(isDialecticStageSlug(DialecticStageSlug.Parenthesis));
        assert(isDialecticStageSlug(DialecticStageSlug.Paralysis));
    });

    await t.step('returns false for invalid strings and non-strings', () => {
        assert(!isDialecticStageSlug('foo'));
        assert(!isDialecticStageSlug(null));
        assert(!isDialecticStageSlug(undefined));
        assert(!isDialecticStageSlug(123));
        assert(!isDialecticStageSlug({}));
        assert(!isDialecticStageSlug([]));
    });
});

Deno.test('Type Guard: isFileManagerError', async (t) => {
    await t.step('returns true for a PostgrestError-shaped value, a { message } service error, and an Error read as a StorageError', () => {
        assert(isFileManagerError({ code: '23505', message: 'duplicate key', details: null, hint: null }));
        assert(isFileManagerError({ message: 'x' }));
        assert(isFileManagerError(new Error('x')));
    });

    await t.step('returns false for empty object, empty/non-string message, null, undefined, string, and array', () => {
        assert(!isFileManagerError({}));
        assert(!isFileManagerError({ message: '' }));
        assert(!isFileManagerError({ message: 7 }));
        assert(!isFileManagerError(null));
        assert(!isFileManagerError(undefined));
        assert(!isFileManagerError('x'));
        assert(!isFileManagerError([]));
    });
});
