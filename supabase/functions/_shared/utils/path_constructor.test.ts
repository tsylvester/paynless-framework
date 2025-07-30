import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  sanitizeForPath,
  generateShortId,
  mapStageSlugToDirName
} from './path_constructor.ts'
import type { PathContext, FileType } from '../types/file_manager.types.ts'

Deno.test('constructStoragePath', async (t) => {
  const projectBaseContext: Pick<PathContext, 'projectId'> = {
    projectId: 'project-uuid-123',
  };

  const sessionBaseContext: Omit<PathContext, 'fileType' | 'originalFileName'> = {
    projectId: 'project-uuid-123',
    sessionId: 'session-uuid-4567890',
    iteration: 1,
    stageSlug: 'test-stage',
    modelSlug: 'test-model',
    attemptCount: 0,
  };

  const expectedShortSessionId = generateShortId(sessionBaseContext.sessionId!);
  const expectedMappedStageDir = mapStageSlugToDirName(sessionBaseContext.stageSlug!);

  await t.step('should construct path for project_readme', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'project_readme',
    });
    assertEquals(path.storagePath, 'project-uuid-123');
    assertEquals(path.fileName, 'project_readme.md');
  });

  await t.step('should construct path for initial_user_prompt and sanitize file name', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'initial_user_prompt',
      originalFileName: 'My Initial Prompt.txt',
    });
    assertEquals(path.storagePath, 'project-uuid-123');
    assertEquals(path.fileName, 'my_initial_prompt.txt');
  });

  await t.step('should construct path for project_settings_file', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'project_settings_file',
    });
    assertEquals(path.storagePath, 'project-uuid-123');
    assertEquals(path.fileName, 'project_settings.json');
  });

  await t.step('should construct path for general_resource at project root and sanitize file name', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'general_resource',
      originalFileName: 'My Shared Document.pdf',
    });
    assertEquals(path.storagePath, 'project-uuid-123/general_resource');
    assertEquals(path.fileName, 'my_shared_document.pdf');
  });

  await t.step('should construct path for seed_prompt', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'seed_prompt',
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}`);
    assertEquals(path.fileName, 'seed_prompt.md');
  });

  await t.step('should construct path for model_contribution_main with attemptCount 0', () => {
    const context: PathContext = {
      ...sessionBaseContext,
      fileType: 'model_contribution_main',
      attemptCount: 0,
    };
    const path = constructStoragePath(context);
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}`);
    assertEquals(path.fileName, `${sanitizeForPath(sessionBaseContext.modelSlug!)}_${context.attemptCount}_${sanitizeForPath(sessionBaseContext.stageSlug!)}.md`);
  });
  
  await t.step('should construct path for model_contribution_main with attemptCount 1', () => {
    const context: PathContext = {
      ...sessionBaseContext,
      fileType: 'model_contribution_main',
      attemptCount: 1,
    };
    const path = constructStoragePath(context);
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}`);
    assertEquals(path.fileName, `${sanitizeForPath(sessionBaseContext.modelSlug!)}_${context.attemptCount}_${sanitizeForPath(sessionBaseContext.stageSlug!)}.md`);
  });

  await t.step('should construct path for model_contribution_raw_json with attemptCount 0', () => {
    const context: PathContext = {
      ...sessionBaseContext,
      fileType: 'model_contribution_raw_json',
      attemptCount: 0,
    };
    const path = constructStoragePath(context);
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/raw_responses`);
    assertEquals(path.fileName, `${sanitizeForPath(sessionBaseContext.modelSlug!)}_${context.attemptCount}_${sanitizeForPath(sessionBaseContext.stageSlug!)}_raw.json`);
  });

  await t.step('should construct path for model_contribution_raw_json with attemptCount 2', () => {
    const context: PathContext = {
      ...sessionBaseContext,
      fileType: 'model_contribution_raw_json',
      attemptCount: 2,
    };
    const path = constructStoragePath(context);
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/raw_responses`);
    assertEquals(path.fileName, `${sanitizeForPath(sessionBaseContext.modelSlug!)}_${context.attemptCount}_${sanitizeForPath(sessionBaseContext.stageSlug!)}_raw.json`);
  });
  
  await t.step('should construct path for user_feedback', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'user_feedback',
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}`);
    assertEquals(path.fileName, `user_feedback_${sanitizeForPath(sessionBaseContext.stageSlug!)}.md`);
  });
  
  await t.step('should construct path with /_work when isWorkInProgress is true', () => {
    const context: PathContext = {
      ...sessionBaseContext,
      fileType: 'model_contribution_main',
      attemptCount: 0,
      isWorkInProgress: true,
    };
    const path = constructStoragePath(context);
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/_work`);
    assertEquals(path.fileName, `${sanitizeForPath(sessionBaseContext.modelSlug!)}_${context.attemptCount}_${sanitizeForPath(sessionBaseContext.stageSlug!)}.md`);
  });

  await t.step('should construct path for contribution_document', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'contribution_document',
      originalFileName: 'prd_document.md',
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/documents`);
    assertEquals(path.fileName, 'prd_document.md');
  });

  await t.step('should construct path for pairwise_synthesis_chunk in _work dir', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'pairwise_synthesis_chunk',
      originalFileName: 'pairwise_chunk_1.json',
      isWorkInProgress: true,
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/_work`);
    assertEquals(path.fileName, 'pairwise_chunk_1.json');
  });

  await t.step('should construct path for reduced_synthesis in _work dir', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'reduced_synthesis',
      originalFileName: 'Reduced Chunk A.json',
      isWorkInProgress: true,
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/_work`);
    assertEquals(path.fileName, 'reduced_chunk_a.json');
  });

  await t.step('should construct path for final_synthesis (not in _work dir)', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'final_synthesis',
      originalFileName: 'Final Synthesis Document.md',
      isWorkInProgress: false, // Explicitly not a work file
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}`);
    assertEquals(path.fileName, 'final_synthesis_document.md');
  });

  await t.step('should throw error if originalFileName is missing for initial_user_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        ...projectBaseContext,
        fileType: 'initial_user_prompt',
      });
    }, Error, 'originalFileName is required for initial_user_prompt file type.');
  });

  await t.step('should throw error if originalFileName is missing for general_resource', () => {
    assertThrows(() => {
      constructStoragePath({
        ...projectBaseContext,
        fileType: 'general_resource',
      });
    }, Error, 'originalFileName is required for general_resource file type.');
  });
  
  await t.step('should throw error if required context is missing for seed_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        fileType: 'seed_prompt',
      });
    }, Error, 'projectId, sessionId, iteration, and stageSlug are required for seed_prompt file type.');
  });
  
  await t.step('should throw error if required context (modelSlug) is missing for model_contribution_main', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        stageSlug: 'test-stage',
        attemptCount: 0,
        fileType: 'model_contribution_main',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, modelSlug, and attemptCount are required for model_contribution_main.');
  });

  await t.step('should throw error if required context (attemptCount) is missing for model_contribution_main', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        stageSlug: 'test-stage',
        modelSlug: 'test-model',
        fileType: 'model_contribution_main',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, modelSlug, and attemptCount are required for model_contribution_main.');
  });

  await t.step('should throw error if originalFileName is missing for contribution_document', () => {
    assertThrows(() => {
      constructStoragePath({
        ...sessionBaseContext,
        fileType: 'contribution_document',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, and originalFileName are required for contribution_document.');
  });

  await t.step('should throw error if originalFileName is missing for pairwise_synthesis_chunk', () => {
    assertThrows(() => {
      constructStoragePath({
        ...sessionBaseContext,
        fileType: 'pairwise_synthesis_chunk',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, and originalFileName are required for synthesis artifacts.');
  });

  await t.step('should throw error if originalFileName is missing for reduced_synthesis', () => {
    assertThrows(() => {
      constructStoragePath({
        ...sessionBaseContext,
        fileType: 'reduced_synthesis',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, and originalFileName are required for synthesis artifacts.');
  });

  await t.step('should throw error if originalFileName is missing for final_synthesis', () => {
    assertThrows(() => {
      constructStoragePath({
        ...sessionBaseContext,
        fileType: 'final_synthesis',
      });
    }, Error, 'projectId, sessionId, iteration, stageSlug, and originalFileName are required for synthesis artifacts.');
  });

  await t.step('should sanitize complex file names for initial_user_prompt', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'initial_user_prompt',
      originalFileName: 'File With ALL CAPS & Special Chars!@#$.zip',
    });
    assertEquals(path.storagePath, 'project-uuid-123');
    assertEquals(path.fileName, 'file_with_all_caps__special_chars.zip');
  });

  await t.step('should sanitize complex file names for general_resource', () => {
    const path = constructStoragePath({
      ...projectBaseContext,
      fileType: 'general_resource',
      originalFileName: 'Another Complex! Name.docx',
    });
    assertEquals(path.storagePath, 'project-uuid-123/general_resource');
    assertEquals(path.fileName, 'another_complex_name.docx');
  });

  await t.step('should sanitize complex file names for contribution_document', () => {
    const path = constructStoragePath({
      ...sessionBaseContext,
      fileType: 'contribution_document',
      originalFileName: 'Documents ! With % Spaces.pdf',
    });
    assertEquals(path.storagePath, `${sessionBaseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${sessionBaseContext.iteration}/${expectedMappedStageDir}/documents`);
    assertEquals(path.fileName, 'documents__with__spaces.pdf');
  });
});

Deno.test('sanitizeForPath', async (t) => {
  await t.step('should convert to lowercase', () => {
    assertEquals(sanitizeForPath('UPPERCASE'), 'uppercase');
  });

  await t.step('should replace spaces with underscores', () => {
    assertEquals(sanitizeForPath('with spaces'), 'with_spaces');
  });

  await t.step('should remove special characters except . - _', () => {
    assertEquals(sanitizeForPath('special!@#$%^&*()+=[]{}|\\:;\'"<>,?/chars.zip'), 'specialchars.zip');
  });

  await t.step('should handle mixed case, spaces, and special chars', () => {
    assertEquals(sanitizeForPath('MixEd CaSe & Chars! 123.txt'), 'mixed_case__chars_123.txt');
  });

  await t.step('should handle leading/trailing spaces by trimming first', () => {
    assertEquals(sanitizeForPath('  leading and trailing  '), 'leading_and_trailing');
  });
});

Deno.test('generateShortId', async (t) => {
  const uuid = 'abcdef12-3456-7890-cdef-1234567890ab';
  await t.step('should generate a short ID of default length 8', () => {
    assertEquals(generateShortId(uuid).length, 8);
    assertEquals(generateShortId(uuid), 'abcdef12');
  });

  await t.step('should generate a short ID of specified length', () => {
    assertEquals(generateShortId(uuid, 4).length, 4);
    assertEquals(generateShortId(uuid, 4), 'abcd');
  });

  await t.step('should remove hyphens', () => {
    assertEquals(generateShortId('abc-def', 6), 'abcdef');
  });
});

Deno.test('mapStageSlugToDirName', async (t) => {
  await t.step('should map thesis to 1_thesis', () => {
    assertEquals(mapStageSlugToDirName('thesis'), '1_thesis');
    assertEquals(mapStageSlugToDirName('THESIS'), '1_thesis');
  });
  await t.step('should map antithesis to 2_antithesis', () => {
    assertEquals(mapStageSlugToDirName('antithesis'), '2_antithesis');
  });
  await t.step('should map synthesis to 3_synthesis', () => {
    assertEquals(mapStageSlugToDirName('synthesis'), '3_synthesis');
  });
  await t.step('should map parenthesis to 4_parenthesis', () => {
    assertEquals(mapStageSlugToDirName('parenthesis'), '4_parenthesis');
  });
  await t.step('should map paralysis to 5_paralysis', () => {
    assertEquals(mapStageSlugToDirName('paralysis'), '5_paralysis');
  });
  await t.step('should return original slug if no mapping exists', () => {
    assertEquals(mapStageSlugToDirName('unknown_stage'), 'unknown_stage');
  });
}); 