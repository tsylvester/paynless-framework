import { assertEquals, assertThrows, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  generateShortId,
} from './path_constructor.ts'
import { FileType, type PathContext } from '../types/file_manager.types.ts'

Deno.test('constructStoragePath', async (t) => {
  const projectId = 'project-uuid-123';
  const sessionId = 'session-uuid-4567890';
  const iteration = 1;
  const modelSlug = 'gpt-4-turbo';
  const sourceModelSlugs = ['claude-3-opus', 'gemini-1.5-pro'].sort();
  const attemptCount = 0;
  const shortSessionId = generateShortId(sessionId);

  const baseContext: Omit<PathContext, 'fileType' | 'stageSlug' | 'contributionType'> = {
    projectId,
    sessionId,
    iteration,
    modelSlug,
    attemptCount,
    sourceModelSlugs,
    sourceAnchorType: 'thesis',
    sourceAnchorModelSlug: 'claude-3-opus',
  };

  await t.step('should handle project-level files correctly', async (t) => {
    await t.step('constructs path for project_readme', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.ProjectReadme });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'project_readme.md');
    });

    await t.step('constructs path for master_plan', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.MasterPlan });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'Master_Plan.md');
    });

    await t.step('constructs path for pending_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.PendingFile, originalFileName: 'task-abc.md' });
      assertEquals(storagePath, `${projectId}/Pending`);
      assertEquals(fileName, 'task-abc.md');
    });

    await t.step('constructs path for current_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.CurrentFile, originalFileName: 'in-progress.md' });
      assertEquals(storagePath, `${projectId}/Current`);
      assertEquals(fileName, 'in-progress.md');
    });

    await t.step('constructs path for complete_file', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.CompleteFile, originalFileName: 'done.md' });
      assertEquals(storagePath, `${projectId}/Complete`);
      assertEquals(fileName, 'done.md');
    });

    await t.step('constructs path for initial_user_prompt', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.InitialUserPrompt, originalFileName: 'My Great Idea.txt' });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'my_great_idea.txt');
    });

    await t.step('constructs path for project_settings_file', () => {
        const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.ProjectSettingsFile });
        assertEquals(storagePath, projectId);
        assertEquals(fileName, 'project_settings.json');
    });

    await t.step('constructs path for general_resource', () => {
        const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.GeneralResource, originalFileName: 'API Docs.pdf' });
        assertEquals(storagePath, `${projectId}/general_resource`);
        assertEquals(fileName, 'api_docs.pdf');
    });

    await t.step('constructs path for project_export_zip', () => {
      const { storagePath, fileName } = constructStoragePath({ projectId, fileType: FileType.ProjectExportZip, originalFileName: 'My Export.zip' });
      assertEquals(storagePath, projectId);
      assertEquals(fileName, 'my_export.zip');
    });
  });

  await t.step('should handle model contributions with correct naming conventions', async (t) => {
    const thesisContext: PathContext = { ...baseContext, stageSlug: 'thesis', contributionType: 'thesis', fileType: FileType.ModelContributionMain };
    const antithesisContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, sourceModelSlugs: ['claude-3-opus'], sourceAttemptCount: 0 };
    const pairwiseContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: FileType.ModelContributionMain };
    const reducedContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain };
    const finalContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'final_synthesis', fileType: FileType.ModelContributionMain };
    const parenthesisContext: PathContext = { ...baseContext, stageSlug: 'parenthesis', contributionType: 'parenthesis', fileType: FileType.ModelContributionMain };
    const paralysisContext: PathContext = { ...baseContext, stageSlug: 'paralysis', contributionType: 'paralysis', fileType: FileType.ModelContributionMain };

    await t.step('constructs path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'gpt-4-turbo_0_thesis.md');
    });

    await t.step('constructs path for antithesis', () => {
      const { storagePath, fileName } = constructStoragePath(antithesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis`);
      assertEquals(fileName, `gpt-4-turbo_critiquing_(claude-3-opus's_thesis_0)_0_antithesis.md`);
    });

    await t.step('constructs path for pairwise_synthesis_chunk', () => {
        const pairwiseContext: PathContext = { 
          ...baseContext, 
          stageSlug: 'synthesis', 
          contributionType: 'pairwise_synthesis_chunk', 
          fileType: FileType.ModelContributionMain,
          sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro'].sort(), // The full set of sources
          sourceAnchorType: 'thesis',
          sourceAnchorModelSlug: 'claude-3-opus', // The anchor
          pairedModelSlug: 'gemini-1.5-pro' // The other document in the pair
        };
        const { storagePath, fileName } = constructStoragePath(pairwiseContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
        assertEquals(fileName, 'gpt-4-turbo_synthesizing_claude-3-opus_with_gemini-1.5-pro_on_thesis_0_pairwise_synthesis_chunk.md');
    });

    await t.step('constructs path for reduced_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(reducedContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
        assertEquals(fileName, 'gpt-4-turbo_reducing_thesis_by_claude-3-opus_0_reduced_synthesis.md');
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
    const thesisRawContext: PathContext = { ...baseContext, stageSlug: 'thesis', contributionType: 'thesis', fileType: FileType.ModelContributionRawJson };
    const antithesisRawContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionRawJson, sourceModelSlugs: ['claude-3-opus'], sourceAttemptCount: 0 };
    const pairwiseRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: FileType.ModelContributionRawJson };
    const reducedRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionRawJson };
    const finalSynthesisRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'final_synthesis', fileType: FileType.ModelContributionRawJson };
    const parenthesisRawContext: PathContext = { ...baseContext, stageSlug: 'parenthesis', contributionType: 'parenthesis', fileType: FileType.ModelContributionRawJson };
    const paralysisRawContext: PathContext = { ...baseContext, stageSlug: 'paralysis', contributionType: 'paralysis', fileType: FileType.ModelContributionRawJson };

    await t.step('constructs raw path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisRawContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`);
      assertEquals(fileName, 'gpt-4-turbo_0_thesis_raw.json');
    });

    await t.step('constructs raw path for antithesis', () => {
        const { storagePath, fileName } = constructStoragePath(antithesisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/raw_responses`);
        assertEquals(fileName, `gpt-4-turbo_critiquing_(claude-3-opus's_thesis_0)_0_antithesis_raw.json`);
    });

    await t.step('constructs raw path for pairwise_synthesis_chunk', () => {
        const pairwiseRawContext: PathContext = { 
          ...baseContext, 
          stageSlug: 'synthesis', 
          contributionType: 'pairwise_synthesis_chunk', 
          fileType: FileType.ModelContributionRawJson,
          sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro'].sort(),
          sourceAnchorType: 'thesis',
          sourceAnchorModelSlug: 'claude-3-opus',
          pairedModelSlug: 'gemini-1.5-pro'
        };
        const { storagePath, fileName } = constructStoragePath(pairwiseRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_synthesizing_claude-3-opus_with_gemini-1.5-pro_on_thesis_0_pairwise_synthesis_chunk_raw.json');
    });

    await t.step('constructs raw path for reduced_synthesis', () => {
        const { storagePath, fileName } = constructStoragePath(reducedRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_reducing_thesis_by_claude-3-opus_0_reduced_synthesis_raw.json');
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
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: FileType.SeedPrompt });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'seed_prompt.md');
    });

    await t.step('Seed prompt path must never include _work', () => {
      const { storagePath } = constructStoragePath({ ...stageContext, fileType: FileType.SeedPrompt });
      assert(!storagePath.includes('/_work'), `Seed prompt path should not be under _work. Got: ${storagePath}`);
    });

    await t.step('constructs path for user_feedback', () => {
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: FileType.UserFeedback });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'user_feedback_thesis.md');
    });

    await t.step('constructs path for contribution_document', () => {
      const { storagePath, fileName } = constructStoragePath({ ...stageContext, fileType: FileType.ContributionDocument, originalFileName: 'Product Spec.docx' });
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'product_spec.docx');
    });

    await t.step('constructs path for rag_context_summary', () => {
      const ragContext: PathContext = { ...baseContext, stageSlug: 'synthesis', fileType: FileType.RagContextSummary };
      const { storagePath, fileName } = constructStoragePath(ragContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_rag_summary.txt');
    });
  });

  await t.step('should throw errors for missing context', async (t) => {
    await t.step('throws if originalFileName is missing for file types that require it', () => {
      assertThrows(() => constructStoragePath({ projectId, fileType: FileType.PendingFile }), Error, 'originalFileName is required for pending_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: FileType.CurrentFile }), Error, 'originalFileName is required for current_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: FileType.CompleteFile }), Error, 'originalFileName is required for complete_file.');
      assertThrows(() => constructStoragePath({ projectId, fileType: FileType.InitialUserPrompt }), Error, 'originalFileName is required for initial_user_prompt.');
      assertThrows(() => constructStoragePath({ projectId, fileType: FileType.GeneralResource }), Error, 'originalFileName is required for general_resource.');
    });

    await t.step('throws if base path context is missing for stage files', () => {
        assertThrows(() => constructStoragePath({ fileType: FileType.SeedPrompt } as PathContext ), Error, 'Base path context required for seed_prompt.');
        assertThrows(() => constructStoragePath({ fileType: FileType.UserFeedback } as PathContext), Error, 'Base path context and stageSlug required for user_feedback.');
        assertThrows(() => constructStoragePath({ fileType: FileType.ContributionDocument, originalFileName: 'test' } as PathContext), Error, 'Base path and originalFileName required for contribution_document.');
    });

    await t.step('throws if context is missing for model contributions', () => {
        const incompleteContext: Partial<PathContext> = { projectId, sessionId, iteration, stageSlug: 'thesis', fileType: FileType.ModelContributionMain };
        assertThrows(() => constructStoragePath(incompleteContext as PathContext), Error, 'Required context missing for model contribution file.');
    });
    
    await t.step('throws if sourceModelSlugs is missing for antithesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, sourceModelSlugs: [] };
        assertThrows(() => constructStoragePath(context), Error, 'Antithesis requires one sourceModelSlug, a sourceAnchorType, and a sourceAttemptCount.');
    });

    await t.step('throws if sourceAnchor properties are missing for pairwise synthesis', () => {
        const context1: PathContext = { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, sourceAnchorType: undefined };
        assertThrows(() => constructStoragePath(context1), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
        const context2: PathContext = { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, sourceAnchorModelSlug: undefined };
        assertThrows(() => constructStoragePath(context2), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
        const context3: PathContext = { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, pairedModelSlug: undefined };
        assertThrows(() => constructStoragePath(context3), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
    });

    await t.step('throws if sourceAnchorType and sourceAnchorModelSlug are missing for reduced synthesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, sourceAnchorType: undefined, sourceAnchorModelSlug: undefined };
        assertThrows(() => constructStoragePath(context), Error, 'Required sourceAnchorType and sourceAnchorModelSlug missing for reduced_synthesis.');
    });
  });

  await t.step('should generate unique filenames for all integration test collision scenarios', async (t) => {
    
    await t.step('should generate unique paths for Antithesis critiques', () => {
        // This test simulates the exact collision scenario: one model critiquing two different
        // source documents that happen to be from the same original author.
        const contexts: PathContext[] = [
            // gpt-4 critiques claude's thesis v0
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 0 },
            // gpt-4 critiques claude's thesis v1
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 1, attemptCount: 0 },
            // claude critiques gpt-4's thesis v0
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, modelSlug: 'claude-3-opus', sourceModelSlugs: ['gpt-4-turbo'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 0 },
            // A different critique type
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'summary', sourceAttemptCount: 0, attemptCount: 0 },
            // A different attempt count for the critique itself
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 1 },
        ];
        const generatedPaths = new Set<string>();
        for (const context of contexts) {
            const { storagePath, fileName } = constructStoragePath(context);
            generatedPaths.add(`${storagePath}/${fileName}`);
        }
        assertEquals(generatedPaths.size, contexts.length, "Antithesis paths should be unique");
    });

    await t.step('should generate unique paths for Pairwise Synthesis chunks', async (t) => {
        const contexts: PathContext[] = [
            // Case 1 & 2: Different generating model, same inputs
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            // Case 3 & 4: Same generating model, different paired model
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-c', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-d', attemptCount: 0 },
            // Case 5 & 6: Same generating model, different anchor model
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-c', pairedModelSlug: 'model-d', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-d', pairedModelSlug: 'model-c', attemptCount: 0 },
            // Case 7 & 8: Same generating model, different anchor type
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.ModelContributionMain, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'summary', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
        ];
        
        const generatedPaths = new Set<string>();

        for (let i = 0; i < contexts.length; i++) {
            const context = contexts[i];
            const description = `Case ${i + 1}: ${context.modelSlug} synthesizing ${context.sourceAnchorModelSlug} with ${context.pairedModelSlug} on ${context.sourceAnchorType}`;

            await t.step(description, () => {
                const initialSize = generatedPaths.size;
                const { storagePath, fileName } = constructStoragePath(context);
                const fullPath = `${storagePath}/${fileName}`;
                generatedPaths.add(fullPath);
                assertEquals(generatedPaths.size, initialSize + 1, `Path "${fullPath}" was a duplicate.`);
            });
        }
    });

    await t.step('should generate unique paths for Reduced Synthesis chunks', async (t) => {
        const contexts: PathContext[] = [
            // Different generating models
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, modelSlug: 'gemini-1.5-pro', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            // Different anchor types
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            // Different anchor model slugs
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'gemini-1.5-pro', attemptCount: 0 },
            // Different attempt counts
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionMain, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 1 },
        ];
        
        const generatedPaths = new Set<string>();
        for (let i = 0; i < contexts.length; i++) {
            const context = contexts[i];
            const description = `Case ${i + 1}: ${context.modelSlug} reducing ${context.sourceAnchorType} by ${context.sourceAnchorModelSlug}`;
            await t.step(description, () => {
                const initialSize = generatedPaths.size;
                const { storagePath, fileName } = constructStoragePath(context);
                const fullPath = `${storagePath}/${fileName}`;
                generatedPaths.add(fullPath);
                assertEquals(generatedPaths.size, initialSize + 1, `Path "${fullPath}" was a duplicate.`);
            });
        }
        assertEquals(generatedPaths.size, contexts.length, "All generated Reduced Synthesis paths should be unique.");
    });
  });

  await t.step('should generate a path with _work directory and _continuation suffix for continuation chunks', () => {
    const context: PathContext = {
      fileType: FileType.ModelContributionMain,
      projectId: 'project-continuation',
      sessionId: 'session-continuation',
      iteration: 1,
      stageSlug: '1_thesis',
      modelSlug: 'claude-opus',
      contributionType: 'thesis',
      attemptCount: 0,
      isContinuation: true,
      turnIndex: 1,
    };

    const result = constructStoragePath(context);

    assert(
      result.storagePath.includes('/_work'),
      `Path should include '/_work'. Got: ${result.storagePath}`,
    );
    assert(
      result.fileName.includes('_continuation_1'),
      `Filename should include '_continuation_1'. Got: ${result.fileName}`,
    );
    assertEquals(
      result.storagePath,
      'project-continuation/session_sessionc/iteration_1/1_thesis/_work',
    );
    // Example expected filename: claude-opus_0_model_contribution_main_continuation_1.md
    assertEquals(
        result.fileName,
        'claude-opus_0_thesis_continuation_1.md',
    );
  });

  await t.step('root model contribution (non-continuation) must not be saved under _work', () => {
    const context: PathContext = {
      fileType: FileType.ModelContributionMain,
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      modelSlug: modelSlug,
      contributionType: 'thesis',
      attemptCount: 0,
      isContinuation: false,
    };
    const result = constructStoragePath(context);
    assert(!result.storagePath.includes('/_work'), `Non-continuation main contribution must not be in _work. Got: ${result.storagePath}`);
  });

  await t.step('only continuations and intermediate artifacts are saved under _work', () => {
    const continuationContext: PathContext = {
      fileType: FileType.ModelContributionMain,
      projectId,
      sessionId,
      iteration,
      stageSlug: 'synthesis',
      modelSlug: modelSlug,
      contributionType: 'synthesis',
      attemptCount: 0,
      isContinuation: true,
      turnIndex: 0,
    };
    const intermediateContext: PathContext = {
      fileType: FileType.PairwiseSynthesisChunk,
      projectId,
      sessionId,
      iteration,
      stageSlug: 'synthesis',
      modelSlug: modelSlug,
      contributionType: 'pairwise_synthesis_chunk',
      attemptCount: 0,
      sourceAnchorType: 'thesis',
      sourceAnchorModelSlug: 'model-a',
      pairedModelSlug: 'model-b',
    };
    const contPath = constructStoragePath(continuationContext);
    const intermPath = constructStoragePath(intermediateContext);
    assert(contPath.storagePath.includes('/_work'), `Continuation must be in _work. Got: ${contPath.storagePath}`);
    assert(intermPath.storagePath.includes('/_work'), `Intermediate artifact must be in _work. Got: ${intermPath.storagePath}`);
  });

  await t.step('should handle document-centric artifacts correctly', async (t) => {
    const docContext: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt, // Placeholder to satisfy type, overwritten in each test.
      stageSlug: 'thesis',
      attemptCount: 1,
      documentKey: 'executive_summary',
    };

    await t.step('constructs path for PlannerPrompt', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.PlannerPrompt });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/prompts`;
      const expectedFileName = `${modelSlug}_1_planner_prompt.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for TurnPrompt', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.TurnPrompt });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/prompts`;
      const expectedFileName = `${modelSlug}_1_executive_summary_prompt.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for HeaderContext', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.HeaderContext });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/context`;
      const expectedFileName = `${modelSlug}_1_header_context.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for AssembledDocumentJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.AssembledDocumentJson });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/assembled_json`;
      const expectedFileName = `${modelSlug}_1_executive_summary_assembled.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for RenderedDocument', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.RenderedDocument });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`;
      const expectedFileName = `${modelSlug}_1_executive_summary.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for continuation TurnPrompt', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.TurnPrompt, isContinuation: true, turnIndex: 2 });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/prompts`;
      const expectedFileName = `${modelSlug}_1_executive_summary_continuation_2_prompt.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for document-specific ModelContributionRawJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.ModelContributionRawJson });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`;
      const expectedFileName = `${modelSlug}_1_executive_summary_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for continuation ModelContributionRawJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.ModelContributionRawJson, isContinuation: true, turnIndex: 3 });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`;
      const expectedFileName = `${modelSlug}_1_executive_summary_continuation_3_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });
  });
});
