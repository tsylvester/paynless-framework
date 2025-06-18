import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { constructStoragePath } from './path_constructor.ts'
import type { PathContext } from '../types/file_manager.types.ts'

Deno.test('constructStoragePath', async (t) => {
  const baseContext: Omit<PathContext, 'fileType' | 'originalFileName'> = {
    projectId: 'project-uuid-123',
    sessionId: 'session-uuid-456',
    iteration: 1,
    stageSlug: '1_hypothesis',
    modelSlug: 'claude-3-opus',
  };

  await t.step('should construct path for project_readme', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'project_readme',
      originalFileName: 'readme.md',
    });
    assertEquals(path, 'projects/project-uuid-123/project_readme.md');
  });

  await t.step('should construct path for general_resource and sanitize file name', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'general_resource',
      originalFileName: 'My File With Spaces.pdf',
    });
    assertEquals(path, 'projects/project-uuid-123/resources/my_file_with_spaces.pdf');
  });

  await t.step('should construct path for user_prompt', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'user_prompt',
      originalFileName: 'prompt.md',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/0_seed_inputs/user_prompt.md');
  });
  
  await t.step('should construct path for system_settings', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'system_settings',
      originalFileName: 'settings.json',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/0_seed_inputs/system_settings.json');
  });

  await t.step('should construct path for seed_prompt', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'seed_prompt',
      originalFileName: 'seed.md',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/1_hypothesis/seed_prompt.md');
  });

  await t.step('should construct path for model_contribution and sanitize model slug', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'model_contribution',
      modelSlug: 'GPT-4 Turbo',
      originalFileName: 'response.md',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/1_hypothesis/gpt-4_turbo/response.md');
  });
  
  await t.step('should construct path for user_feedback', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'user_feedback',
      originalFileName: 'feedback.md',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/1_hypothesis/user_feedback.md');
  });
  
  await t.step('should construct path for contribution_document', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'contribution_document',
      originalFileName: 'prd_document.md',
    });
    assertEquals(path, 'projects/project-uuid-123/sessions/session-uuid-456/iteration_1/1_hypothesis/documents/prd_document.md');
  });

  await t.step('should throw error if required context is missing for user_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        projectId: 'proj-1',
        fileType: 'user_prompt',
        originalFileName: 'prompt.md',
        // Missing sessionId and iteration
      });
    }, Error, 'Session ID and iteration are required for user_prompt file type.');
  });
  
  await t.step('should throw error if required context is missing for seed_prompt', () => {
    assertThrows(() => {
      constructStoragePath({
        ...baseContext,
        fileType: 'seed_prompt',
        originalFileName: 'seed.md',
        stageSlug: undefined, // Missing stageSlug
      });
    }, Error, 'Session ID, iteration, and stageSlug are required for seed_prompt file type.');
  });
  
  await t.step('should throw error if required context is missing for model_contribution', () => {
    assertThrows(() => {
      constructStoragePath({
        ...baseContext,
        fileType: 'model_contribution',
        originalFileName: 'response.md',
        modelSlug: undefined, // Missing modelSlug
      });
    }, Error, 'Session ID, iteration, stageSlug, and modelSlug are required for model_contribution file type.');
  });

  await t.step('should sanitize complex file names', () => {
    const path = constructStoragePath({
      ...baseContext,
      fileType: 'general_resource',
      originalFileName: 'File With ALL CAPS & Special Chars!@#$.zip',
    });
    assertEquals(path, 'projects/project-uuid-123/resources/file_with_all_caps__special_chars.zip');
  });
}); 