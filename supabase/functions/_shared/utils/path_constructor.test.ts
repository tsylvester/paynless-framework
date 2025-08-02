import { assertEquals, assertThrows } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  generateShortId,
} from './path_constructor.ts'
import type { PathContext } from '../types/file_manager.types.ts'

Deno.test('constructStoragePath', async (t) => {
  const projectId = 'project-uuid-123';
  const sessionId = 'session-uuid-4567890';
  const iteration = 1;
  const modelSlug = 'gpt-4-turbo';
  const sourceModelSlugs = ['claude-3-opus', 'gemini-1.5-pro'].sort();
  const sourceContributionIdShort = 'a1b2c3d4';
  const attemptCount = 0;
  const shortSessionId = generateShortId(sessionId);

  const baseContext: Omit<PathContext, 'fileType' | 'stageSlug' | 'contributionType'> = {
    projectId,
    sessionId,
    iteration,
    modelSlug,
    attemptCount,
    sourceModelSlugs,
    sourceContributionIdShort,
  };

  await t.step('should handle project-level files correctly', async (t) => {
    await t.step('constructs path for project_readme', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'project_readme' });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'project_readme.md');
    });

    await t.step('constructs path for master_plan', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'master_plan' });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'Master_Plan.md');
    });

    await t.step('constructs path for pending_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'pending_file', originalFileName: 'task-abc.md' });
      assertEquals(storagePath, `${projectId}/Pending`);
      assertEquals(fileName, 'task-abc.md');
    });

    await t.step('constructs path for current_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'current_file', originalFileName: 'in-progress.md' });
      assertEquals(storagePath, `${projectId}/Current`);
      assertEquals(fileName, 'in-progress.md');
    });

    await t.step('constructs path for complete_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'complete_file', originalFileName: 'done.md' });
      assertEquals(storagePath, `${projectId}/Complete`);
      assertEquals(fileName, 'done.md');
    });

    await t.step('constructs path for initial_user_prompt', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'initial_user_prompt', originalFileName: 'My Great Idea.txt' });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'my_great_idea.txt');
    });

    await t.step('constructs path for project_settings_file', () => {
        const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'project_settings_file' });
        assertEquals(storagePath, projectId);
        assertEquals(fileName, 'project_settings.json');
    });

    await t.step('constructs path for general_resource', () => {
        const { storagePath, fileName } = constructStoragePath({ projectId, fileType: 'general_resource', originalFileName: 'API Docs.pdf' });
        assertEquals(storagePath, `${projectId}/general_resource`);
        assertEquals(fileName, 'api_docs.pdf');
    });
  });

  await t.step('should handle model contributions with correct naming conventions', async (t) => {
    const thesisContext: PathContext = { ...baseContext, stageSlug: 'thesis', contributionType: 'thesis', fileType: 'model_contribution_main' };
    const antithesisContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: 'model_contribution_main', sourceModelSlugs: ['claude-3-opus'] };
    const pairwiseContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: 'model_contribution_main' };
    const reducedContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: 'model_contribution_main' };
    const finalContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'final_synthesis', fileType: 'model_contribution_main' };
    const parenthesisContext: PathContext = { ...baseContext, stageSlug: 'parenthesis', contributionType: 'parenthesis', fileType: 'model_contribution_main' };
    const paralysisContext: PathContext = { ...baseContext, stageSlug: 'paralysis', contributionType: 'paralysis', fileType: 'model_contribution_main' };

    await t.step('constructs path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'gpt-4-turbo_0_thesis.md');
    });

    await t.step('constructs path for antithesis', () => {
      const { storagePath, fileName } = constructStoragePath(antithesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis`);
      assertEquals(fileName, 'gpt-4-turbo_critiquing_claude-3-opus_0_antithesis.md');
    });

    await t.step('constructs path for pairwise_synthesis_chunk', () => {
        const { storagePath, fileName } = constructStoragePath(pairwiseContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
        assertEquals(fileName, 'gpt-4-turbo_from_claude-3-opus_and_gemini-1.5-pro_0_pairwise_synthesis_chunk.md');
    });

    await t.step('constructs path for reduced_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(reducedContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
        assertEquals(fileName, 'gpt-4-turbo_reducing_a1b2c3d4_0_reduced_synthesis.md');
    });
    
    await t.step('constructs path for final_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(finalContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis`);
        assertEquals(fileName, 'gpt-4-turbo_0_final_synthesis.md');
    });

    await t.step('constructs path for parenthesis', () => {
        const { storagePath, fileName } = constructStoragePath(parenthesisContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis`);
        assertEquals(fileName, 'gpt-4-turbo_0_parenthesis.md');
    });

    await t.step('constructs path for paralysis', () => {
        const { storagePath, fileName } = constructStoragePath(paralysisContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis`);
        assertEquals(fileName, 'gpt-4-turbo_0_paralysis.md');
    });
  });

  await t.step('should handle raw JSON contributions with correct naming conventions', async (t) => {
    const thesisRawContext: PathContext = { ...baseContext, stageSlug: 'thesis', contributionType: 'thesis', fileType: 'model_contribution_raw_json' };
    const antithesisRawContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: 'model_contribution_raw_json', sourceModelSlugs: ['claude-3-opus'] };
    const pairwiseRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: 'model_contribution_raw_json' };
    const reducedRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: 'model_contribution_raw_json' };
    const finalSynthesisRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'final_synthesis', fileType: 'model_contribution_raw_json' };
    const parenthesisRawContext: PathContext = { ...baseContext, stageSlug: 'parenthesis', contributionType: 'parenthesis', fileType: 'model_contribution_raw_json' };
    const paralysisRawContext: PathContext = { ...baseContext, stageSlug: 'paralysis', contributionType: 'paralysis', fileType: 'model_contribution_raw_json' };

    await t.step('constructs raw path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisRawContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`);
      assertEquals(fileName, 'gpt-4-turbo_0_thesis_raw.json');
    });

    await t.step('constructs raw path for antithesis', () => {
        const { storagePath, fileName } = constructStoragePath(antithesisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_critiquing_claude-3-opus_0_antithesis_raw.json');
    });

    await t.step('constructs raw path for pairwise_synthesis_chunk', () => {
        const { storagePath, fileName } = constructStoragePath(pairwiseRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_from_claude-3-opus_and_gemini-1.5-pro_0_pairwise_synthesis_chunk_raw.json');
    });

    await t.step('constructs raw path for reduced_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(reducedRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_reducing_a1b2c3d4_0_reduced_synthesis_raw.json');
    });

    await t.step('constructs raw path for final_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(finalSynthesisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_0_final_synthesis_raw.json');
    });

    await t.step('constructs raw path for parenthesis', () => {
        const { storagePath, fileName } = constructStoragePath(parenthesisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_0_parenthesis_raw.json');
    });

    await t.step('constructs raw path for paralysis', () => {
        const { storagePath, fileName } = constructStoragePath(paralysisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_0_paralysis_raw.json');
    });
  });

  await t.step('should handle other stage-level files', async (t) => {
    const stageContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
    };

    await t.step('constructs path for seed_prompt', () => {
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: 'seed_prompt' });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'seed_prompt.md');
    });

    await t.step('constructs path for user_feedback', () => {
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: 'user_feedback' });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'user_feedback_thesis.md');
    });

    await t.step('constructs path for contribution_document', () => {
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: 'contribution_document', originalFileName: 'Product Spec.docx' });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'product_spec.docx');
    });

    await t.step('constructs path for rag_context_summary', () => {
      const ragContext: PathContext = { ...baseContext, stageSlug: 'synthesis', fileType: 'rag_context_summary' };
      const { storagePath, fileName } = constructStoragePath(ragContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_rag_summary.txt');
    });
  });

  await t.step('should throw errors for missing context', async (t) => {
    await t.step('throws if originalFileName is missing for file types that require it', () => {
      assertThrows(() => constructStoragePath({ projectId, fileType: 'pending_file' } as PathContext), Error, 'originalFileName is required for pending_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: 'current_file' } as PathContext), Error, 'originalFileName is required for current_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: 'complete_file' } as PathContext), Error, 'originalFileName is required for complete_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: 'initial_user_prompt' } as PathContext), Error, 'originalFileName is required for initial_user_prompt.');
      assertThrows(() => constructStoragePath({ projectId, fileType: 'general_resource' } as PathContext), Error, 'originalFileName is required for general_resource.');
    });

    await t.step('throws if base path context is missing for stage files', () => {
        assertThrows(() => constructStoragePath({ fileType: 'seed_prompt' } as PathContext), Error, 'Base path context required for seed_prompt.');
        assertThrows(() => constructStoragePath({ fileType: 'user_feedback' } as PathContext), Error, 'Base path context and stageSlug required for user_feedback.');
        assertThrows(() => constructStoragePath({ fileType: 'contribution_document', originalFileName: 'test' } as PathContext), Error, 'Base path and originalFileName required for contribution_document.');
    });

    await t.step('throws if context is missing for model contributions', () => {
        const incompleteContext: Partial<PathContext> = { projectId, sessionId, iteration, stageSlug: 'thesis', fileType: 'model_contribution_main' };
        assertThrows(() => constructStoragePath(incompleteContext as PathContext), Error, 'Required context missing for model contribution file.');
    });
    
    await t.step('throws if sourceModelSlugs is missing for antithesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: 'model_contribution_main', sourceModelSlugs: [] };
        assertThrows(() => constructStoragePath(context), Error, 'Antithesis requires exactly one sourceModelSlug.');
    });

    await t.step('throws if sourceModelSlugs is missing for pairwise synthesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: 'model_contribution_main', sourceModelSlugs: [] };
        assertThrows(() => constructStoragePath(context), Error, 'Required sourceModelSlugs missing for pairwise_synthesis_chunk.');
    });

    await t.step('throws if sourceContributionIdShort is missing for reduced synthesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: 'model_contribution_main', sourceContributionIdShort: undefined };
        assertThrows(() => constructStoragePath(context), Error, 'Required sourceContributionIdShort missing for reduced_synthesis.');
    });
  });
});
