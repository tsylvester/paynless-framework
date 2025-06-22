import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  sanitizeForPath,
  generateShortId,
  mapStageSlugToDirName
} from './path_constructor.ts'
import type { PathContext } from '../types/file_manager.types.ts'

Deno.test('constructStoragePath', async (t) => {
  const baseContext: Omit<PathContext, 'fileType' | 'originalFileName'> = {
    projectId: 'project-uuid-123',
    sessionId: 'session-uuid-4567890',
    iteration: 1,
    stageSlug: 'test-stage',
    modelSlug: 'test-model',
  };
  const expectedShortSessionId = generateShortId(baseContext.sessionId!);
  const expectedMappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);

  await t.step('should construct path for project_readme', () => {
    const path = constructStoragePath({
      projectId: baseContext.projectId,
      fileType: 'project_readme',
      originalFileName: 'README.md',
    });
    assertEquals(path, 'projects/project-uuid-123/project_readme.md');
  });

  await t.step('should construct path for general_resource and sanitize file name', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'general_resource',
      originalFileName: 'My File With Spaces.pdf',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/0_seed_inputs/general_resource/my_file_with_spaces.pdf`);
  });

  await t.step('should construct path for user_prompt', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'user_prompt',
      originalFileName: 'prompt.md',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/0_seed_inputs/user_prompt.md`);
  });
  
  await t.step('should construct path for system_settings', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'system_settings',
      originalFileName: 'settings.json',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/0_seed_inputs/system_settings.json`);
  });

  await t.step('should construct path for seed_prompt', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'seed_prompt',
      originalFileName: 'seed.md',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/${expectedMappedStageDir}/seed_prompt.md`);
  });

  await t.step('should construct path for model_contribution_main with attemptCount 0', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: 'model_contribution_main',
      attemptCount: 0,
      originalFileName: 'ignored_if_attempt_count_used.md',
    };
    const shortSessionId = generateShortId(baseContext.sessionId!);
    const mappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);
    const path = constructStoragePath(context);
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${shortSessionId}/iteration_${baseContext.iteration}/${mappedStageDir}/${baseContext.modelSlug}_0_${baseContext.stageSlug}.md`);
  });
  
  await t.step('should construct path for model_contribution_main with attemptCount 1', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: 'model_contribution_main',
      attemptCount: 1,
      originalFileName: 'ignored.md',
    };
    const shortSessionId = generateShortId(baseContext.sessionId!);
    const mappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);
    const path = constructStoragePath(context);
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${shortSessionId}/iteration_${baseContext.iteration}/${mappedStageDir}/${baseContext.modelSlug}_1_${baseContext.stageSlug}.md`);
  });

  await t.step('should construct path for model_contribution_raw_json with attemptCount 0', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: 'model_contribution_raw_json',
      attemptCount: 0,
      originalFileName: 'ignored.json',
    };
    const shortSessionId = generateShortId(baseContext.sessionId!);
    const mappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);
    const path = constructStoragePath(context);
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${shortSessionId}/iteration_${baseContext.iteration}/${mappedStageDir}/raw_responses/${baseContext.modelSlug}_0_${baseContext.stageSlug}_raw.json`);
  });

  await t.step('should construct path for model_contribution_raw_json with attemptCount 2', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: 'model_contribution_raw_json',
      attemptCount: 2,
      originalFileName: 'ignored.json',
    };
    const shortSessionId = generateShortId(baseContext.sessionId!);
    const mappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);
    const path = constructStoragePath(context);
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${shortSessionId}/iteration_${baseContext.iteration}/${mappedStageDir}/raw_responses/${baseContext.modelSlug}_2_${baseContext.stageSlug}_raw.json`);
  });
  
  await t.step('model_contribution_main should still use originalFileName if attemptCount is undefined', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: 'model_contribution_main',
      originalFileName: 'custom_filename_for_main.md',
    };
    const shortSessionId = generateShortId(baseContext.sessionId!);
    const mappedStageDir = mapStageSlugToDirName(baseContext.stageSlug!);
    const path = constructStoragePath(context);
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${shortSessionId}/iteration_${baseContext.iteration}/${mappedStageDir}/custom_filename_for_main.md`);
  });

  await t.step('should construct path for user_feedback', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'user_feedback',
      originalFileName: 'feedback.md',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/${expectedMappedStageDir}/user_feedback_${sanitizeForPath(baseContext.stageSlug!)}.md`);
  });
  
  await t.step('should construct path for contribution_document', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'contribution_document',
      originalFileName: 'prd_document.md',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/${expectedMappedStageDir}/documents/prd_document.md`);
  });

  await t.step('should throw error if required context is missing for user_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        iteration: 1,
        fileType: 'user_prompt',
        originalFileName: 'prompt.md',
      });
    }, Error, 'Session ID and iteration are required for user_prompt file type.');
  });
  
  await t.step('should throw error if required context is missing for seed_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        fileType: 'seed_prompt',
        originalFileName: 'seed.md',
      });
    }, Error, 'Session ID, iteration, and stageSlug are required for seed_prompt file type.');
  });
  
  await t.step('should throw error if required context is missing for model_contribution', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'project-uuid-123',
        sessionId: 'session-uuid-456',
        iteration: 1,
        stageSlug: 'test-stage',
        fileType: 'model_contribution_main',
        originalFileName: 'filename.md',
      });
    }, Error, 'Session ID, iteration, stageSlug, and modelSlug are required for model_contribution_main.');
  });

  await t.step('should sanitize complex file names', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'general_resource',
      originalFileName: 'File With ALL CAPS & Special Chars!@#$.zip',
    });
    assertEquals(path, `projects/${baseContext.projectId}/sessions/${expectedShortSessionId}/iteration_${baseContext.iteration}/0_seed_inputs/general_resource/file_with_all_caps__special_chars.zip`);
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
  await t.step('should map thesis to 1_hypothesis', () => {
    assertEquals(mapStageSlugToDirName('thesis'), '1_hypothesis');
    assertEquals(mapStageSlugToDirName('THESIS'), '1_hypothesis');
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