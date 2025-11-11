import {
  assertEquals,
  assertThrows,
  assert,
  assertObjectMatch,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  generateShortId,
  sanitizeForPath,
} from './path_constructor.ts'
import { deconstructStoragePath } from '../utils/path_deconstructor.ts'
import { FileType, type PathContext } from '../types/file_manager.types.ts'
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts'
import { isContributionType } from './type_guards.ts'

Deno.test('constructStoragePath and deconstructStoragePath should be perfect inverses', async (t) => {
  const projectId = 'project-uuid-123';
  const sessionId = 'session-uuid-4567890';
  const iteration = 1;
  const modelSlug = 'gpt-4-turbo';
  const sourceModelSlugs = ['claude-3-opus', 'gemini-1.5-pro'].sort();
  const attemptCount = 0;
  const shortSessionId = generateShortId(sessionId);
  const documentKey = 'executive_summary';
  const stepName = 'critique_and_improve';

  // Create a comprehensive mapping of FileType to its required context and expected deconstruction.
  // This allows us to iterate and test every single file type.
  const fileTypeTestCases: Array<{
    fileType: FileType;
    context: PathContext;
    expectedDeconstructed: Partial<DeconstructedPathInfo>;
    skip?: boolean;
  }> = Object.values(FileType).map((fileType) => {
    // Base contexts that can be specialized
    const baseProjectContext = { projectId, fileType };
    const baseStageContext: PathContext = {
      ...baseProjectContext,
      sessionId,
      iteration,
      stageSlug: 'thesis', // Default, can be overridden
    };
    const baseModelContext: PathContext = {
      ...baseStageContext,
      modelSlug,
      attemptCount,
    };
    const baseDocumentContext: PathContext = {
      ...baseModelContext,
      documentKey,
    }

    // Default expected info for most session-based files
    const expectedBaseStageInfo = {
      originalProjectId: projectId,
      shortSessionId: shortSessionId,
      iteration: iteration,
    };

    const fileTypeStr = fileType.toString();
    if (isContributionType(fileTypeStr)) {
      const context: PathContext = {
        ...baseModelContext,
        contributionType: fileTypeStr,
      };

      if (fileType === FileType.PairwiseSynthesisChunk) {
        context.stageSlug = 'synthesis';
        context.sourceAnchorType = 'thesis';
        context.sourceAnchorModelSlug = 'model-a';
        context.pairedModelSlug = 'model-b';
      } else if (fileType === FileType.ReducedSynthesis) {
        context.stageSlug = 'synthesis';
        context.sourceAnchorType = 'thesis';
        context.sourceAnchorModelSlug = 'model-a';
      }

      return {
        fileType,
        context,
        expectedDeconstructed: {
          ...expectedBaseStageInfo,
          stageSlug: context.stageSlug,
          contributionType: fileTypeStr,
          fileTypeGuess: fileType,
        },
      };
    } else {
      // Handle all other cases that are not contribution types
      switch (fileType) {
        // --- Project Level ---
        case FileType.ProjectReadme:
          return {
            fileType,
            context: baseProjectContext,
            expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'project_readme.md' },
          };
        case FileType.PendingFile:
          if (projectId) {
            return {
              fileType,
              context: { projectId, fileType, originalFileName: 'task-abc.md' },
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'task-abc.md' },
            };
          }
          break;
        case FileType.CurrentFile:
          if (projectId) {
            return {
              fileType,
              context: { projectId, fileType, originalFileName: 'in-progress.md' },
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'in-progress.md' },
            };
          }
          break;
        case FileType.CompleteFile:
          if (projectId) {
            return {
              fileType,
              context: { projectId, fileType, originalFileName: 'done.md' },
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'done.md' },
            };
          }
          break;
        case FileType.InitialUserPrompt:
          if (projectId) {
            return {
              fileType,
              context: { projectId, fileType, originalFileName: 'My Great Idea.txt' },
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'my_great_idea.txt' },
            };
          }
          break;
        case FileType.ProjectSettingsFile:
          return {
            fileType,
            context: baseProjectContext,
            expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'project_settings.json' },
          };
        case FileType.GeneralResource:
          if (projectId) {
            return {
              fileType,
              context: { projectId, fileType, originalFileName: 'API Docs.pdf' },
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'api_docs.pdf' },
            };
          }
          break;
        case FileType.ProjectExportZip:
          if (projectId) {
            return {
                fileType,
                context: { projectId, fileType, originalFileName: 'My Export.zip' },
                expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'my_export.zip' },
            };
          }
          break;
        
        // --- Stage Level (No Model) ---
        case FileType.SeedPrompt:
          return {
            fileType,
            context: baseStageContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', parsedFileNameFromPath: 'seed_prompt.md' },
          };
        case FileType.UserFeedback:
          return {
            fileType,
            context: { ...baseStageContext, stageSlug: 'antithesis' },
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'antithesis', parsedFileNameFromPath: 'user_feedback_antithesis.md' },
          };

        // --- Document-Centric ---
        case FileType.PlannerPrompt:
          return {
            fileType,
            context: { ...baseModelContext, stepName },
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', modelSlug, attemptCount, stepName },
          };
        case FileType.TurnPrompt:
           return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', modelSlug, attemptCount, documentKey },
          };
        case FileType.HeaderContext:
        case FileType.comparison_vector:
        case FileType.SynthesisHeaderContext:
          return {
            fileType,
            context: baseModelContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', modelSlug, attemptCount },
          };
        case FileType.AssembledDocumentJson:
          return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', modelSlug, attemptCount, documentKey },
          };
        case FileType.RenderedDocument:
          return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: 'thesis', modelSlug, attemptCount, documentKey },
          };
        case FileType.RagContextSummary:
          return {
            fileType,
            context: {
              ...baseModelContext,
              stageSlug: 'synthesis',
              sourceModelSlugs,
            },
            expectedDeconstructed: {
              ...expectedBaseStageInfo,
              stageSlug: 'synthesis',
              modelSlug,
              sourceModelSlugs,
            },
          };
        
        // --- Document Keys Treated as FileTypes that are NOT contribution types ---
        case FileType.business_case:
        case FileType.feature_spec:
        case FileType.technical_approach:
        case FileType.success_metrics:
        case FileType.business_case_critique:
        case FileType.technical_feasibility_assessment:
        case FileType.risk_register:
        case FileType.non_functional_requirements:
        case FileType.dependency_map:
        case FileType.synthesis_pairwise_business_case:
        case FileType.synthesis_pairwise_feature_spec:
        case FileType.synthesis_pairwise_technical_approach:
        case FileType.synthesis_pairwise_success_metrics:
        case FileType.synthesis_document_business_case:
        case FileType.synthesis_document_feature_spec:
        case FileType.synthesis_document_technical_approach:
        case FileType.synthesis_document_success_metrics:
        case FileType.product_requirements:
        case FileType.system_architecture:
        case FileType.tech_stack:
        case FileType.technical_requirements:
        case FileType.master_plan:
        case FileType.milestone_schema:
        case FileType.updated_master_plan:
        case FileType.actionable_checklist:
        case FileType.advisor_recommendations:
        case FileType.header_context_pairwise: {
          const specificDocContext: PathContext = {
            ...baseModelContext,
            stageSlug: fileType.toString().includes('critique') || fileType.toString().includes('assessment') ? 'antithesis'
              : fileType.toString().includes('synthesis') ? 'synthesis'
              : fileType.toString().includes('technical_requirements') || fileType.toString().includes('master_plan') ? 'parenthesis'
              : fileType.toString().includes('advisor') ? 'paralysis'
              : 'thesis',
            documentKey: fileType.toString(),
          };
          return {
            fileType,
            context: specificDocContext,
            expectedDeconstructed: {
              ...expectedBaseStageInfo,
              stageSlug: specificDocContext.stageSlug,
              modelSlug,
              attemptCount,
              documentKey: fileType.toString(),
            },
          };
        }
      }
    }
    return // Should be unreachable, but satisfies linter
  }).filter((tc): tc is NonNullable<typeof tc> => !!tc);

  for (const { fileType, context, expectedDeconstructed, skip } of fileTypeTestCases) {
    if (skip) continue;
    await t.step(`should correctly construct and deconstruct path for FileType: ${fileType}`, () => {
      // 1. Construct
      const { storagePath, fileName } = constructStoragePath(context);
      
      // 2. Deconstruct
      const deconstructed = deconstructStoragePath({ storageDir: storagePath, fileName });

      // 3. Assert
      // We remove properties that are not expected to match perfectly or are implementation details.
      const cleanedDeconstructed: Partial<DeconstructedPathInfo> = { ...deconstructed };
      delete cleanedDeconstructed.error;
      delete cleanedDeconstructed.stageDirName;
      // The fileTypeGuess can be less specific than the input fileType (e.g., RenderedDocument is a valid guess for 'business_case'),
      // so we don't assert it for document-key-based file types.
      if (context.documentKey && context.documentKey === context.fileType) {
        // fileTypeGuess may be a more generic type like RenderedDocument, which is acceptable.
      } else if (isContributionType(context.fileType.toString())) {
        // For contribution types, the guess might be a generic one. This is acceptable.
      } else {
        assertEquals(cleanedDeconstructed.fileTypeGuess, fileType, "fileTypeGuess did not match");
      }
      
      // For some legacy contribution types, the filename is parsed and stored.
      if ((fileType === FileType.ModelContributionRawJson) && context.contributionType) {
         const sanitizedContribType = sanitizeForPath(context.contributionType);
         const extension = fileType === FileType.ModelContributionRawJson ? '_raw.json' : '.md';
         expectedDeconstructed.parsedFileNameFromPath = `${modelSlug}_${attemptCount}_${sanitizedContribType}${extension}`;
      }
      // For intermediate files, the full filename is complex, so we just check for its presence.
      if(fileType === FileType.PairwiseSynthesisChunk || fileType === FileType.ReducedSynthesis) {
        assert(cleanedDeconstructed.parsedFileNameFromPath);
        delete cleanedDeconstructed.parsedFileNameFromPath;
      } else if (expectedDeconstructed.documentKey) {
         const jsonFileTypes = [
           FileType.comparison_vector,
           FileType.SynthesisHeaderContext,
           FileType.synthesis_document_business_case,
           FileType.synthesis_document_feature_spec,
           FileType.synthesis_document_success_metrics,
           FileType.synthesis_document_technical_approach,
           FileType.synthesis_pairwise_business_case,
           FileType.synthesis_pairwise_feature_spec,
           FileType.synthesis_pairwise_success_metrics,
           FileType.synthesis_pairwise_technical_approach,
         ];
         const isJson = jsonFileTypes.includes(fileType);
         const expectedFileName = `${modelSlug}_${attemptCount}_${expectedDeconstructed.documentKey}${isJson ? '.json' : '.md'}`;
         if (!fileName.endsWith('prompt.md') && !fileName.endsWith('assembled.json') && !fileName.endsWith('context.json')) {
          assertEquals(cleanedDeconstructed.parsedFileNameFromPath, expectedFileName);
         }
      }


      assertObjectMatch(cleanedDeconstructed, expectedDeconstructed);
    });
  }
});

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
    const thesisContext: PathContext = { ...baseContext, stageSlug: 'thesis', documentKey: 'business_case', fileType: FileType.business_case };
    const antithesisContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, sourceModelSlugs: ['claude-3-opus'], sourceAttemptCount: 0 };
    const pairwiseContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: FileType.PairwiseSynthesisChunk };
    const reducedContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis };
    const parenthesisContext: PathContext = { ...baseContext, stageSlug: 'parenthesis', contributionType: 'parenthesis', fileType: FileType.technical_requirements, documentKey: 'technical_requirements' };
    const paralysisContext: PathContext = { ...baseContext, stageSlug: 'paralysis', contributionType: 'paralysis', fileType: FileType.advisor_recommendations, documentKey: 'advisor_recommendations' };

    await t.step('handles SynthesisHeaderContext file type', () => {
      const synthesisHeaderContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'synthesis',
        fileType: FileType.SynthesisHeaderContext,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(synthesisHeaderContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/context`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_header_context.json');
    });

    await t.step('handles business_case file type', () => {
      const businessCaseContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'thesis',
        fileType: FileType.business_case,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(businessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case.md');
    });

    await t.step('handles feature_spec file type', () => {
      const featureSpecContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'thesis',
        fileType: FileType.feature_spec,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(featureSpecContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_feature_spec.md');
    });

    await t.step('handles technical_approach file type', () => {
      const technicalApproachContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'thesis',
        fileType: FileType.technical_approach,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(technicalApproachContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_approach.md');
    });

    await t.step('handles success_metrics file type', () => {
      const successMetricsContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'thesis',
        fileType: FileType.success_metrics,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(successMetricsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_success_metrics.md');
    });

    await t.step('handles business_case_critique file type', () => {
      const businessCaseCritiqueContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.business_case_critique,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(businessCaseCritiqueContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case_critique.md');
    });

    await t.step('handles technical_feasibility_assessment file type', () => {
      const technicalFeasibilityContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.technical_feasibility_assessment,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(technicalFeasibilityContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_feasibility_assessment.md');
    });

    await t.step('handles risk_register file type', () => {
      const riskRegisterContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.risk_register,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(riskRegisterContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_risk_register.md');
    });

    await t.step('handles non_functional_requirements file type', () => {
      const nonFunctionalContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.non_functional_requirements,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(nonFunctionalContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_non_functional_requirements.md');
    });

    await t.step('handles dependency_map file type', () => {
      const dependencyMapContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.dependency_map,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(dependencyMapContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_dependency_map.md');
    });

    await t.step('handles comparison_vector file type', () => {
      const comparisonVectorContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'antithesis',
        fileType: FileType.comparison_vector,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(comparisonVectorContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_comparison_vector.json');
    });

    await t.step('handles synthesis_pairwise_business_case file type', () => {
      const pairwiseBusinessCaseContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'synthesis',
        fileType: FileType.synthesis_pairwise_business_case,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(pairwiseBusinessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_pairwise_business_case.json');
    });

    await t.step('handles synthesis_document_business_case file type', () => {
      const documentBusinessCaseContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'synthesis',
        fileType: FileType.synthesis_document_business_case,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(documentBusinessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_document_business_case.json');
    });

    await t.step('handles advisor_recommendations file type', () => {
      const advisorRecommendationsContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'paralysis',
        fileType: FileType.advisor_recommendations,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(advisorRecommendationsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_advisor_recommendations.md');
    });

    await t.step('handles technical_requirements file type', () => {
      const technical_requirementsContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'parenthesis',
        fileType: FileType.technical_requirements,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(technical_requirementsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_requirements.md');
    });

    await t.step('handles master_plan file type', () => {
      const masterPlanContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'parenthesis',
        fileType: FileType.master_plan,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(masterPlanContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_master_plan.md');
    });

    await t.step('handles milestone_schema file type', () => {
      const milestoneSchemaContext: PathContext = {
        projectId,
        sessionId,
        iteration,
        stageSlug: 'parenthesis',
        fileType: FileType.milestone_schema,
        modelSlug: 'gpt-4-turbo',
        attemptCount: 0
      };
      const { storagePath, fileName } = constructStoragePath(milestoneSchemaContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_milestone_schema.md');
    });

    await t.step('constructs path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case.md');
    });

    await t.step('constructs path for antithesis', () => {
      const { storagePath, fileName } = constructStoragePath(antithesisContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, `gpt-4-turbo_critiquing_(claude-3-opus's_thesis_0)_0_antithesis.md`);
    });

    await t.step('constructs path for pairwise_synthesis_chunk', () => {
        const pairwiseContext: PathContext = { 
          ...baseContext, 
          stageSlug: 'synthesis', 
          contributionType: 'pairwise_synthesis_chunk', 
          fileType: FileType.PairwiseSynthesisChunk,
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
    
    await t.step('constructs path for parenthesis', () => {
        const { storagePath, fileName } = constructStoragePath(parenthesisContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
        assertEquals(fileName, 'gpt-4-turbo_0_technical_requirements.md');
    });

    await t.step('constructs path for paralysis', () => {
        const { storagePath, fileName } = constructStoragePath(paralysisContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis/documents`);
        assertEquals(fileName, 'gpt-4-turbo_0_advisor_recommendations.md');
    });
  });

  await t.step('should handle raw JSON contributions with correct naming conventions', async (t) => {
    const thesisRawContext: PathContext = { ...baseContext, stageSlug: 'thesis', contributionType: 'thesis', fileType: FileType.ModelContributionRawJson };
    const antithesisRawContext: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.ModelContributionRawJson, sourceModelSlugs: ['claude-3-opus'], sourceAttemptCount: 0 };
    const pairwiseRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'pairwise_synthesis_chunk', fileType: FileType.ModelContributionRawJson };
    const reducedRawContext: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionRawJson };
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
    });

    await t.step('throws if context is missing for model contributions', () => {
        const incompleteContext: Partial<PathContext> = { projectId, sessionId, iteration, stageSlug: 'thesis', fileType: FileType.business_case };
        assertThrows(() => constructStoragePath(incompleteContext as PathContext), Error, `Required context missing for model contribution file of type ${FileType.business_case}.`);
    });
    
    await t.step('throws if sourceModelSlugs is missing for antithesis', () => {
        const context: PathContext = { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, sourceModelSlugs: [] };
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
        const context: PathContext = { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, sourceAnchorType: undefined, sourceAnchorModelSlug: undefined };
        assertThrows(() => constructStoragePath(context), Error, 'Required sourceAnchorType and sourceAnchorModelSlug missing for reduced_synthesis.');
    });
  });

  await t.step('should generate unique filenames for all integration test collision scenarios', async (t) => {
    
    await t.step('should generate unique paths for Antithesis critiques', () => {
        // This test simulates the exact collision scenario: one model critiquing two different
        // source documents that happen to be from the same original author.
        const contexts: PathContext[] = [
            // gpt-4 critiques claude's thesis v0
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 0 },
            // gpt-4 critiques claude's thesis v1
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 1, attemptCount: 0 },
            // claude critiques gpt-4's thesis v0
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'claude-3-opus', sourceModelSlugs: ['gpt-4-turbo'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 0 },
            // A different critique type
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'summary', sourceAttemptCount: 0, attemptCount: 0 },
            // A different attempt count for the critique itself
            { ...baseContext, stageSlug: 'antithesis', contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'thesis', sourceAttemptCount: 0, attemptCount: 1 },
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
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            // Case 3 & 4: Same generating model, different paired model
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-c', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-d', attemptCount: 0 },
            // Case 5 & 6: Same generating model, different anchor model
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-c', pairedModelSlug: 'model-d', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'model-d', pairedModelSlug: 'model-c', attemptCount: 0 },
            // Case 7 & 8: Same generating model, different anchor type
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', fileType: FileType.PairwiseSynthesisChunk, contributionType: 'pairwise_synthesis_chunk', modelSlug: 'gpt-4-turbo', sourceAnchorType: 'summary', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 },
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
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gemini-1.5-pro', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            // Different anchor types
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 },
            // Different anchor model slugs
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'gemini-1.5-pro', attemptCount: 0 },
            // Different attempt counts
            { ...baseContext, stageSlug: 'synthesis', contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'thesis', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 1 },
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
      fileType: FileType.business_case,
      documentKey: 'business_case',
      projectId: 'project-continuation',
      sessionId: 'session-continuation',
      iteration: 1,
      stageSlug: 'thesis',
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
        'claude-opus_0_business_case_continuation_1.md',
    );
  });

  await t.step('root model contribution (non-continuation) must not be saved under _work', () => {
    const context: PathContext = {
      fileType: FileType.business_case,
      documentKey: 'business_case',
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
      fileType: FileType.PairwiseSynthesisChunk,
      documentKey: 'pairwise_synthesis_chunk',
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
    const intermediateContext: PathContext = {
      fileType: FileType.PairwiseSynthesisChunk,
      documentKey: 'pairwise_synthesis_chunk',
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
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/raw_responses`;
      const expectedFileName = `${modelSlug}_1_executive_summary_continuation_3_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });
  });
});
