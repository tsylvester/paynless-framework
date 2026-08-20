import {
  assertEquals,
  assertThrows,
  assert,
  assertObjectMatch,
  assertNotEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  constructStoragePath,
  generateShortId,
  mapStageSlugToDirName,
  sanitizeForPath,
} from './path_constructor.ts'
import { deconstructStoragePath } from '../utils/path_deconstructor.ts'
import { 
  FileType, 
  PathContext,
  DialecticStageSlug
} from '../types/file_manager.types.ts'
import { DeconstructedPathInfo } from './path_deconstructor.types.ts'
import { isContributionType } from './type_guards.ts'
import { buildPathContext } from '../services/file_manager.mock.ts'

Deno.test('constructStoragePath and deconstructStoragePath should be perfect inverses', async (t) => {
  const projectId = 'project-uuid-123';
  const sessionId = 'session-uuid-4567890';
  const iteration = 1;
  const modelSlug = 'gpt-4-turbo';
  const sourceModelSlugs = ['claude-3-opus', 'gemini-1.5-pro'].sort();
  const attemptCount = 0;
  const shortSessionId = generateShortId(sessionId);
  const documentKey = FileType.business_case;
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
    const baseProjectContext = buildPathContext({ projectId, fileType });
    const baseStageContext = buildPathContext({ projectId, fileType, sessionId });
    const baseDocumentContext = buildPathContext({ projectId, fileType, sessionId, modelSlug, documentKey });

    // Default expected info for most session-based files
    const expectedBaseStageInfo = {
      originalProjectId: projectId,
      shortSessionId: shortSessionId,
      iteration: iteration,
    };

    const fileTypeStr = fileType.toString();
    if (isContributionType(fileTypeStr)) {
      const context = buildPathContext({
        projectId, fileType, sessionId, modelSlug,
        contributionType: fileTypeStr,
      });

      if (fileType === FileType.PairwiseSynthesisChunk) {
        context.stageSlug = DialecticStageSlug.Synthesis;
        context.sourceAnchorType = DialecticStageSlug.Thesis;
        context.sourceAnchorModelSlug = 'model-a';
        context.pairedModelSlug = 'model-b';
      } else if (fileType === FileType.ReducedSynthesis) {
        context.stageSlug = DialecticStageSlug.Synthesis;
        context.sourceAnchorType = DialecticStageSlug.Thesis;
        context.sourceAnchorModelSlug = 'model-a';
      } else if (fileType === FileType.RagContextSummary) {
        context.stageSlug = DialecticStageSlug.Synthesis;
        context.sourceModelSlugs = sourceModelSlugs;
      }

      const baseExpected = {
        ...expectedBaseStageInfo,
        stageSlug: context.stageSlug,
        fileTypeGuess: fileType,
      };
      
      // RagContextSummary does not have contributionType set by deconstructor
      if (fileType === FileType.RagContextSummary) {
        return {
          fileType,
          context,
          expectedDeconstructed: {
            ...baseExpected,
            modelSlug,
            sourceModelSlugs,
          },
        };
      }
      
      // HeaderContext requires documentKey, so handle it in the switch statement instead
      if (fileType === FileType.HeaderContext) {
        // Let it fall through to the switch statement below
      } else {
        return {
          fileType,
          context,
          expectedDeconstructed: {
            ...baseExpected,
            contributionType: fileTypeStr,
          },
        };
      }
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
              context: buildPathContext({ projectId, fileType, originalFileName: 'task-abc.md' }),
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'task-abc.md' },
            };
          }
          break;
        case FileType.CurrentFile:
          if (projectId) {
            return {
              fileType,
              context: buildPathContext({ projectId, fileType, originalFileName: 'in-progress.md' }),
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'in-progress.md' },
            };
          }
          break;
        case FileType.CompleteFile:
          if (projectId) {
            return {
              fileType,
              context: buildPathContext({ projectId, fileType, originalFileName: 'done.md' }),
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'done.md' },
            };
          }
          break;
        case FileType.InitialUserPrompt:
          if (projectId) {
            return {
              fileType,
              context: buildPathContext({ projectId, fileType, originalFileName: 'My Great Idea.txt' }),
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
              context: buildPathContext({ projectId, fileType, originalFileName: 'API Docs.pdf' }),
              expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'api_docs.pdf' },
            };
          }
          break;
        case FileType.ProjectExportZip:
          if (projectId) {
            return {
                fileType,
                context: buildPathContext({ projectId, fileType, originalFileName: 'My Export.zip' }),
                expectedDeconstructed: { originalProjectId: projectId, parsedFileNameFromPath: 'my_export.zip' },
            };
          }
          break;
        
        // --- Stage Level (No Model) ---
        case FileType.SeedPrompt:
          return {
            fileType,
            context: baseStageContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, parsedFileNameFromPath: 'seed_prompt.md' },
          };
        case FileType.UserFeedback:
          return {
            fileType,
            context: buildPathContext({
              projectId, fileType, sessionId,
              originalStoragePath: `${projectId}/session_${shortSessionId}/iteration_${iteration}/2_antithesis/documents`,
              originalBaseName: 'doc_antithesis',
            }),
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Antithesis, parsedFileNameFromPath: 'doc_antithesis_feedback.md' },
          };

        // --- Document-Centric ---
        case FileType.PlannerPrompt:
          return {
            fileType,
            context: buildPathContext({ projectId, fileType, sessionId, modelSlug, stepName }),
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, stepName },
          };
        case FileType.TurnPrompt:
           return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, documentKey },
          };
        case FileType.HeaderContext:
          return {
            fileType,
            context: buildPathContext({ projectId, fileType, sessionId, modelSlug, documentKey: FileType.HeaderContext }),
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, contributionType: FileType.HeaderContext },
          };
        case FileType.SynthesisHeaderContext:
          return {
            fileType,
            context: buildPathContext({ projectId, fileType, sessionId, modelSlug, documentKey: FileType.SynthesisHeaderContext }),
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, contributionType: 'synthesis_header_context' },
          };
        case FileType.comparison_vector:
          return {
            fileType,
            context: buildPathContext({ projectId, fileType, sessionId, modelSlug, documentKey: FileType.comparison_vector }),
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, documentKey: 'comparison_vector' },
          };
        case FileType.AssembledDocumentJson:
          return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, documentKey },
          };
        case FileType.RenderedDocument:
          return {
            fileType,
            context: baseDocumentContext,
            expectedDeconstructed: { ...expectedBaseStageInfo, stageSlug: DialecticStageSlug.Thesis, modelSlug, attemptCount, documentKey },
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
          const specificDocContext = buildPathContext({
            projectId, fileType, sessionId, modelSlug,
            stageSlug: fileType.toString().includes('critique') || fileType.toString().includes('assessment') ? DialecticStageSlug.Synthesis
              : fileType.toString().includes('synthesis') ? DialecticStageSlug.Synthesis
              : fileType.toString().includes(FileType.technical_requirements) || fileType.toString().includes('master_plan') ? DialecticStageSlug.Parenthesis
              : fileType.toString().includes('advisor') ? DialecticStageSlug.Paralysis
              : DialecticStageSlug.Thesis,
            documentKey: fileType,
          });
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
      // The fileTypeGuess can be less specific than the input fileType (e.g., RenderedDocument is a valid guess for FileType.business_case),
      // so we don't assert it for document-key-based file types.
      if (context.documentKey && (context.documentKey === context.fileType || fileType === FileType.RenderedDocument)) {
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
    const thesisContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', documentKey: FileType.business_case, fileType: FileType.business_case });
    const antithesisContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs: ['claude-3-opus'], sourceAnchorModelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, sourceAttemptCount: 0, documentKey: FileType.business_case_critique });
    const pairwiseContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Synthesis, contributionType: FileType.PairwiseSynthesisChunk, fileType: FileType.PairwiseSynthesisChunk });
    const reducedContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis });
    const parenthesisContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Parenthesis, contributionType: 'parenthesis', fileType: FileType.technical_requirements, documentKey: FileType.technical_requirements });
    const paralysisContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Paralysis, contributionType: 'paralysis', fileType: FileType.advisor_recommendations, documentKey: FileType.advisor_recommendations });

    await t.step('handles SynthesisHeaderContext file type', () => {
      const synthesisHeaderContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Synthesis,
        fileType: FileType.SynthesisHeaderContext,
      });
      const { storagePath, fileName } = constructStoragePath(synthesisHeaderContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/context`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_header_context.json');
    });

    await t.step('handles business_case file type', () => {
      const businessCaseContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        fileType: FileType.business_case,
        documentKey: FileType.business_case,
      });
      const { storagePath, fileName } = constructStoragePath(businessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case.md');
    });

    await t.step('handles feature_spec file type', () => {
      const featureSpecContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        fileType: FileType.feature_spec,
        documentKey: FileType.feature_spec,
      });
      const { storagePath, fileName } = constructStoragePath(featureSpecContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_feature_spec.md');
    });

    await t.step('handles technical_approach file type', () => {
      const technicalApproachContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        fileType: FileType.technical_approach,
        documentKey: FileType.technical_approach,
      });
      const { storagePath, fileName } = constructStoragePath(technicalApproachContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_approach.md');
    });

    await t.step('handles success_metrics file type', () => {
      const successMetricsContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        fileType: FileType.success_metrics,
        documentKey: FileType.success_metrics,
      });
      const { storagePath, fileName } = constructStoragePath(successMetricsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_success_metrics.md');
    });

    await t.step('handles business_case_critique file type', () => {
      const businessCaseCritiqueContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.business_case_critique,
        documentKey: FileType.business_case_critique,
      });
      const { storagePath, fileName } = constructStoragePath(businessCaseCritiqueContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case_critique.md');
    });

    await t.step('handles technical_feasibility_assessment file type', () => {
      const technicalFeasibilityContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.technical_feasibility_assessment,
        documentKey: FileType.technical_feasibility_assessment,
      });
      const { storagePath, fileName } = constructStoragePath(technicalFeasibilityContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_feasibility_assessment.md');
    });

    await t.step('handles risk_register file type', () => {
      const riskRegisterContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.risk_register,
        documentKey: FileType.risk_register,
      });
      const { storagePath, fileName } = constructStoragePath(riskRegisterContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_risk_register.md');
    });

    await t.step('handles non_functional_requirements file type', () => {
      const nonFunctionalContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.non_functional_requirements,
        documentKey: FileType.non_functional_requirements,
      });
      const { storagePath, fileName } = constructStoragePath(nonFunctionalContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_non_functional_requirements.md');
    });

    await t.step('handles dependency_map file type', () => {
      const dependencyMapContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.dependency_map,
        documentKey: FileType.dependency_map,
      });
      const { storagePath, fileName } = constructStoragePath(dependencyMapContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_dependency_map.md');
    });

    await t.step('handles comparison_vector file type', () => {
      const comparisonVectorContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Antithesis,
        fileType: FileType.comparison_vector,
        documentKey: FileType.comparison_vector,
      });
      const { storagePath, fileName } = constructStoragePath(comparisonVectorContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_comparison_vector.json');
    });

    await t.step('handles synthesis_pairwise_business_case file type', () => {
      const pairwiseBusinessCaseContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Synthesis,
        fileType: FileType.synthesis_pairwise_business_case,
        documentKey: FileType.synthesis_pairwise_business_case,
      });
      const { storagePath, fileName } = constructStoragePath(pairwiseBusinessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_pairwise_business_case.json');
    });

    await t.step('handles synthesis_document_business_case file type', () => {
      const documentBusinessCaseContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Synthesis,
        fileType: FileType.synthesis_document_business_case,
        documentKey: FileType.synthesis_document_business_case,
      });
      const { storagePath, fileName } = constructStoragePath(documentBusinessCaseContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_0_synthesis_document_business_case.json');
    });

    await t.step('handles advisor_recommendations file type', () => {
      const advisorRecommendationsContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Paralysis,
        fileType: FileType.advisor_recommendations,
        documentKey: FileType.advisor_recommendations,
      });
      const { storagePath, fileName } = constructStoragePath(advisorRecommendationsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_advisor_recommendations.md');
    });

    await t.step('handles technical_requirements file type', () => {
      const technical_requirementsContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Parenthesis,
        fileType: FileType.technical_requirements,
        documentKey: FileType.technical_requirements,
      });
      const { storagePath, fileName } = constructStoragePath(technical_requirementsContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_technical_requirements.md');
    });

    await t.step('handles master_plan file type', () => {
      const masterPlanContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Parenthesis,
        fileType: FileType.master_plan,
        documentKey: FileType.master_plan,
      });
      const { storagePath, fileName } = constructStoragePath(masterPlanContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/4_parenthesis/documents`);
      assertEquals(fileName, 'gpt-4-turbo_0_master_plan.md');
    });

    await t.step('handles milestone_schema file type', () => {
      const milestoneSchemaContext = buildPathContext({
        projectId, sessionId, modelSlug: 'gpt-4-turbo',
        stageSlug: DialecticStageSlug.Parenthesis,
        fileType: FileType.milestone_schema,
        documentKey: FileType.milestone_schema,
      });
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

    await t.step('constructs path for PairwiseSynthesisChunk', () => {
        const pairwiseContext = buildPathContext({ 
          projectId, sessionId, modelSlug, 
          stageSlug: DialecticStageSlug.Synthesis, 
          contributionType: FileType.PairwiseSynthesisChunk, 
          fileType: FileType.PairwiseSynthesisChunk,
          sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro'].sort(),
          sourceAnchorModelSlug: 'claude-3-opus',
          sourceAnchorType: 'thesis',
          pairedModelSlug: 'gemini-1.5-pro',
        });
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
    const thesisRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', contributionType: DialecticStageSlug.Thesis, fileType: FileType.ModelContributionRawJson });
    const antithesisRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs: ['claude-3-opus'], sourceAnchorModelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.ModelContributionRawJson, sourceAttemptCount: 0 });
    const pairwiseRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Synthesis, contributionType: FileType.PairwiseSynthesisChunk, fileType: FileType.ModelContributionRawJson });
    const reducedRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', sourceAnchorType: 'thesis', stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ModelContributionRawJson, documentKey: undefined });
    const parenthesisRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Parenthesis, contributionType: 'parenthesis', fileType: FileType.ModelContributionRawJson });
    const paralysisRawContext = buildPathContext({ projectId, sessionId, modelSlug, sourceModelSlugs, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Paralysis, contributionType: 'paralysis', fileType: FileType.ModelContributionRawJson });

    await t.step('constructs raw path for simple contributions (thesis)', () => {
      const { storagePath, fileName } = constructStoragePath(thesisRawContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`);
      assertEquals(fileName, 'gpt-4-turbo_0_business_case_raw.json');
    });

    await t.step('constructs raw path for antithesis', () => {
        const { storagePath, fileName } = constructStoragePath(antithesisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/raw_responses`);
        assertEquals(fileName, `gpt-4-turbo_critiquing_(claude-3-opus's_thesis_0)_0_business_case_raw.json`);
    });

    await t.step('ModelContributionRawJson with stageSlug=antithesis and sourceAnchorModelSlug should use simple critiquing pattern', () => {
        const context = buildPathContext({
          projectId, sessionId, modelSlug,
          stageSlug: DialecticStageSlug.Antithesis,
          fileType: FileType.ModelContributionRawJson,
          documentKey: FileType.business_case,
          sourceAnchorModelSlug: 'claude-3-opus',
          sourceGroupFragment: '98765432',
        });
        const { storagePath, fileName } = constructStoragePath(context);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/2_antithesis/raw_responses`);
        assertEquals(
          fileName,
          'gpt-4-turbo_critiquing_claude-3-opus_98765432_0_business_case_raw.json',
          'ModelContributionRawJson with stageSlug=antithesis and sourceAnchorModelSlug should use simple critiquing pattern per documentation'
        );
    });

    await t.step('constructs raw path for PairwiseSynthesisChunk', () => {
        const pairwiseRawContext = buildPathContext({
          projectId, sessionId, modelSlug,
          stageSlug: DialecticStageSlug.Synthesis,
          contributionType: FileType.PairwiseSynthesisChunk,
          fileType: FileType.ModelContributionRawJson,
          documentKey: undefined,
          sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro'].sort(),
          sourceAnchorModelSlug: 'claude-3-opus',
          sourceAnchorType: 'thesis',
          pairedModelSlug: 'gemini-1.5-pro',
        });
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
        assertEquals(fileName, 'gpt-4-turbo_0_business_case_raw.json');
    });

    await t.step('constructs raw path for paralysis', () => {
        const { storagePath, fileName } = constructStoragePath(paralysisRawContext);
        assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/5_paralysis/raw_responses`);
        assertEquals(fileName, 'gpt-4-turbo_0_business_case_raw.json');
    });
  });

  await t.step('should handle other stage-level files', async (t) => {
    await t.step('constructs path for seed_prompt', () => {
      const { storagePath, fileName } = constructStoragePath(buildPathContext({ projectId, sessionId, fileType: FileType.SeedPrompt }));
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`);
      assertEquals(fileName, 'seed_prompt.md');
    });

    await t.step('Seed prompt path must never include _work', () => {
      const { storagePath } = constructStoragePath(buildPathContext({ projectId, sessionId, fileType: FileType.SeedPrompt }));
      assert(!storagePath.includes('/_work'), `Seed prompt path should not be under _work. Got: ${storagePath}`);
    });

    await t.step('constructs path for user_feedback', () => {
      const originalStoragePath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`;
      const originalBaseName = 'business_case_thesis';
      const { storagePath, fileName } = constructStoragePath(buildPathContext({
        projectId, fileType: FileType.UserFeedback,
        originalStoragePath,
        originalBaseName,
      }));
      assertEquals(storagePath, originalStoragePath);
      assertEquals(fileName, 'business_case_thesis_feedback.md');
    });

    await t.step('constructs path for rag_context_summary', () => {
      const ragContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.RagContextSummary, sourceModelSlugs });
      const { storagePath, fileName } = constructStoragePath(ragContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_rag_summary.txt');
    });

    await t.step('constructs path for compressed_context (contribution)', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'feature_spec_compressed_for_business_case.md');
    });

    await t.step('constructs path for compressed_context (history)', () => {
      const output_type = FileType.business_case;
      const sourceId = '550e8400-e29b-41d4-a716-446655440000';
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'history', sourceId, role: 'assistant' });
      const { fileName } = constructStoragePath(context);
      assertEquals(fileName, 'message_assistant_550e8400-e29b-41d4-a716-446655440000_compressed_for_business_case.md');
      assert(fileName.includes(sourceId));
      assert(!fileName.startsWith('source_'));
    });

    await t.step('constructs path for compressed_context (feedback)', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'feedback', documentKey: FileType.business_case_critique });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'business_case_critique_feedback_compressed_for_business_case.md');
    });

    await t.step('a document and its own feedback never collide in one working set', () => {
      const output_type = FileType.business_case;
      const resourceContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique });
      const feedbackContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'feedback', documentKey: FileType.business_case_critique });
      const { fileName: resourceFileName } = constructStoragePath(resourceContext);
      const { fileName: feedbackFileName } = constructStoragePath(feedbackContext);
      assertNotEquals(resourceFileName, feedbackFileName);
      assertEquals(feedbackFileName, resourceFileName.replace('_compressed_for_', '_feedback_compressed_for_'));
    });

    await t.step('constructs chunked path for compressed_context (history)', () => {
      const output_type = FileType.business_case;
      const sourceId = '550e8400-e29b-41d4-a716-446655440000';
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'history', sourceId, role: 'user', chunkIndex: 2, chunkTotal: 3 });
      const { fileName } = constructStoragePath(context);
      assertEquals(fileName, 'message_user_550e8400-e29b-41d4-a716-446655440000_compressed_for_business_case_chunk_2of3.md');
    });

    await t.step('constructs path for compressed_context with chunk suffix', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec, chunkIndex: 1, chunkTotal: 3 });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work`);
      assertEquals(fileName, 'feature_spec_compressed_for_business_case_chunk_1of3.md');
    });

    await t.step('constructs path for compressed_context_raw_json (contribution)', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
      assertEquals(fileName, 'feature_spec_compressed_for_business_case_raw.json');
    });

    await t.step('compressed_context and compressed_context_raw_json share identity stem', () => {
      const output_type = FileType.business_case;
      const baseCompressedContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec });
      const rawJsonContext = buildPathContext({ ...baseCompressedContext, fileType: FileType.CompressedContextRawJson });
      const md = constructStoragePath(baseCompressedContext);
      const raw = constructStoragePath(rawJsonContext);
      const mdStem = md.fileName.replace(/\.md$/, '');
      const rawStem = raw.fileName.replace(/_raw\.json$/, '');
      assertEquals(mdStem, rawStem);
      assert(md.storagePath.endsWith('/_work'));
      assert(raw.storagePath.endsWith('/_work/raw_responses'));
      assert(md.fileName.endsWith('.md'));
      assert(raw.fileName.endsWith('_raw.json'));

      const feedbackMdContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'feedback', documentKey: FileType.business_case_critique });
      const feedbackRawContext = buildPathContext({ ...feedbackMdContext, fileType: FileType.CompressedContextRawJson });
      const feedbackMd = constructStoragePath(feedbackMdContext);
      const feedbackRaw = constructStoragePath(feedbackRawContext);
      const feedbackMdStem = feedbackMd.fileName.replace(/\.md$/, '');
      const feedbackRawStem = feedbackRaw.fileName.replace(/_raw\.json$/, '');
      assertEquals(feedbackMdStem, feedbackRawStem);

      const historyMdContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'history', sourceId: '550e8400-e29b-41d4-a716-446655440000', role: 'assistant' });
      const historyRawContext = buildPathContext({ ...historyMdContext, fileType: FileType.CompressedContextRawJson });
      const historyMd = constructStoragePath(historyMdContext);
      const historyRaw = constructStoragePath(historyRawContext);
      const historyMdStem = historyMd.fileName.replace(/\.md$/, '');
      const historyRawStem = historyRaw.fileName.replace(/_raw\.json$/, '');
      assertEquals(historyMdStem, historyRawStem);
    });

    await t.step('constructs path for compressed_context_raw_json with chunk suffix', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec, chunkIndex: 1, chunkTotal: 3 });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
      assertEquals(fileName, 'feature_spec_compressed_for_business_case_chunk_1of3_raw.json');
    });

    await t.step('constructs path for compressed_context_raw_json (history)', () => {
      const output_type = FileType.business_case;
      const sourceId = '550e8400-e29b-41d4-a716-446655440000';
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'history', sourceId, role: 'assistant' });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
      assertEquals(fileName, 'message_assistant_550e8400-e29b-41d4-a716-446655440000_compressed_for_business_case_raw.json');
    });

    await t.step('constructs path for compressed_context_raw_json (feedback)', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'feedback', documentKey: FileType.business_case_critique });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`);
      assertEquals(fileName, 'business_case_critique_feedback_compressed_for_business_case_raw.json');
    });

    await t.step('constructs path for compression_prompt (resource)', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o' });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/prompts`);
      assertEquals(fileName, 'gpt-4o_0_business_case_critique_compressed_for_business_case_prompt.md');
    });

    await t.step('constructs path for compression_prompt (feedback)', () => {
      const output_type = FileType.business_case;
      const resourceContext = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o' });
      const feedbackContext = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'feedback', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o' });
      const { fileName: resourceFileName } = constructStoragePath(resourceContext);
      const { storagePath, fileName } = constructStoragePath(feedbackContext);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/prompts`);
      assertEquals(fileName, 'gpt-4o_0_business_case_critique_feedback_compressed_for_business_case_prompt.md');
      assertNotEquals(resourceFileName, fileName);
    });

    await t.step('constructs path for compression_prompt (history)', () => {
      const output_type = FileType.business_case;
      const sourceId = '550e8400-e29b-41d4-a716-446655440000';
      const context = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'history', sourceId, role: 'assistant', modelSlug: 'gpt-4o' });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/prompts`);
      assertEquals(fileName, 'gpt-4o_0_message_assistant_550e8400-e29b-41d4-a716-446655440000_compressed_for_business_case_prompt.md');
      assert(fileName.includes(sourceId));
    });

    await t.step('constructs continuation path for compression_prompt', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o', isContinuation: true, turnIndex: 2 });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/prompts`);
      assertEquals(fileName, 'gpt-4o_0_business_case_critique_compressed_for_business_case_continuation_2_prompt.md');
    });

    await t.step('constructs chunked path for compression_prompt', () => {
      const output_type = FileType.business_case;
      const context = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o', chunkIndex: 2, chunkTotal: 3 });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/prompts`);
      assertEquals(fileName, 'gpt-4o_0_business_case_critique_compressed_for_business_case_chunk_2of3_prompt.md');

      const continuationContext = buildPathContext({ ...context, isContinuation: true, turnIndex: 1 });
      const { fileName: continuationFileName } = constructStoragePath(continuationContext);
      assertEquals(continuationFileName, 'gpt-4o_0_business_case_critique_compressed_for_business_case_chunk_2of3_continuation_1_prompt.md');
    });

    await t.step('a compression prompt and its artifact share the identity stem', () => {
      const output_type = FileType.business_case;
      const promptContext = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o' });
      const artifactContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique });
      const { fileName: promptFileName } = constructStoragePath(promptContext);
      const { fileName: artifactFileName } = constructStoragePath(artifactContext);
      const promptStem = promptFileName.replace(/_prompt\.md$/, '');
      const artifactStem = artifactFileName.replace(/\.md$/, '');
      const promptIdentity = promptStem.replace(/^gpt-4o_0_/, '');
      const artifactIdentity = artifactStem;
      assertEquals(promptIdentity, artifactIdentity);
    });
  });

  await t.step('should throw errors for missing context', async (t) => {
    await t.step('throws if originalFileName is missing for file types that require it', () => {
      assertThrows(() => constructStoragePath(buildPathContext({ projectId, fileType: FileType.PendingFile })), Error, 'originalFileName is required for pending_file.');
      assertThrows(() => constructStoragePath(buildPathContext({ projectId, fileType: FileType.CurrentFile })), Error, 'originalFileName is required for current_file.');
      assertThrows(() => constructStoragePath(buildPathContext({ projectId, fileType: FileType.CompleteFile })), Error, 'originalFileName is required for complete_file.');
      assertThrows(() => constructStoragePath(buildPathContext({ projectId, fileType: FileType.InitialUserPrompt })), Error, 'originalFileName is required for initial_user_prompt.');
      assertThrows(() => constructStoragePath(buildPathContext({ projectId, fileType: FileType.GeneralResource })), Error, 'originalFileName is required for general_resource.');
    });

    await t.step('throws if base path context is missing for stage files', () => {
        assertThrows(() => constructStoragePath(buildPathContext({ projectId: undefined, fileType: FileType.SeedPrompt })), Error, 'Base path context required for seed_prompt.');
        assertThrows(() => constructStoragePath(buildPathContext({ projectId: undefined, fileType: FileType.UserFeedback })), Error, 'originalStoragePath and originalBaseName are required for user_feedback.');
    });

    await t.step('throws if context is missing for model contributions', () => {
        const incompleteContext = buildPathContext({ projectId, sessionId, fileType: FileType.business_case, modelSlug: undefined });
        assertThrows(() => constructStoragePath(incompleteContext), Error, `constructStoragePath requires all of the following values for document file type '${FileType.business_case}'`);
    });
    
    await t.step('throws if sourceModelSlugs is missing for antithesis', () => {
        const context = buildPathContext({ projectId, sessionId, modelSlug, sourceAnchorModelSlug: 'claude-3-opus', stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, sourceModelSlugs: [], sourceAttemptCount: 0, documentKey: FileType.business_case_critique });
        assertThrows(() => constructStoragePath(context), Error, 'Antithesis requires one sourceModelSlug, a sourceAnchorType, and a sourceAttemptCount.');
    });

    await t.step('throws if sourceAnchor properties are missing for pairwise synthesis', () => {
        const context1 = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, sourceAnchorType: undefined });
        assertThrows(() => constructStoragePath(context1), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
        const context2 = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, sourceAnchorModelSlug: undefined });
        assertThrows(() => constructStoragePath(context2), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
        const context3 = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, pairedModelSlug: undefined });
        assertThrows(() => constructStoragePath(context3), Error, 'Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
    });

    await t.step('throws if sourceAnchorType and sourceAnchorModelSlug are missing for reduced synthesis', () => {
        const context = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, sourceAnchorType: undefined, sourceAnchorModelSlug: undefined });
        assertThrows(() => constructStoragePath(context), Error, 'Required sourceAnchorType and sourceAnchorModelSlug missing for reduced_synthesis.');
    });

    await t.step('throws if required context is missing for compressed_context', () => {
        const output_type = FileType.business_case;
        const validContext = buildPathContext({ projectId, sessionId, modelSlug, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressedContext, output_type, sourceType: 'contribution', documentKey: FileType.feature_spec });

        assertThrows(() => constructStoragePath({ ...validContext, output_type: undefined }), Error, 'output_type');
        assertThrows(() => constructStoragePath({ ...validContext, sourceType: undefined }), Error, 'sourceType');
        assertThrows(() => constructStoragePath({ ...validContext, sourceType: 'resource', sourceId: 'some-id', documentKey: undefined }), Error, 'documentKey');
        assertThrows(() => constructStoragePath({ ...validContext, sourceType: 'history', sourceId: undefined }), Error, 'sourceId');
        assertThrows(() => constructStoragePath({ ...validContext, sourceType: 'feedback', documentKey: undefined, sourceId: 'some-id' }), Error, 'documentKey');
        assertThrows(() => constructStoragePath({ ...validContext, sourceType: 'history', sourceId: 'some-id', role: undefined, documentKey: undefined }), Error, 'role');
        assertThrows(() => constructStoragePath({ ...validContext, chunkIndex: undefined, chunkTotal: 3 }), Error, 'chunkIndex');
        assertThrows(() => constructStoragePath({ ...validContext, chunkIndex: 1, chunkTotal: undefined }), Error, 'chunkTotal');
    });

    await t.step('throws if required context is missing for compression_prompt', () => {
        const output_type = FileType.business_case;
        const validPromptContext = buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.CompressionPrompt, output_type, sourceType: 'resource', documentKey: FileType.business_case_critique, modelSlug: 'gpt-4o' });

        assertThrows(() => constructStoragePath({ ...validPromptContext, modelSlug: undefined }), Error, 'modelSlug');
        assertThrows(() => constructStoragePath({ ...validPromptContext, attemptCount: undefined }), Error, 'attemptCount');
        assertThrows(() => constructStoragePath({ ...validPromptContext, output_type: undefined }), Error, 'output_type');
        assertThrows(() => constructStoragePath({ ...validPromptContext, sourceType: 'feedback', documentKey: undefined, sourceId: 'some-id' }), Error, 'documentKey');
        assertThrows(() => constructStoragePath({ ...validPromptContext, sourceType: 'history', sourceId: 'some-id', role: undefined, documentKey: undefined }), Error, 'role');
        assertThrows(() => constructStoragePath({ ...validPromptContext, isContinuation: true, turnIndex: undefined }), Error, 'turnIndex');
    });
  });

  await t.step('should generate unique filenames for all integration test collision scenarios', async (t) => {
    
    await t.step('should generate unique paths for Antithesis critiques', () => {
        // This test simulates the exact collision scenario: one model critiquing two different
        // source documents that happen to be from the same original author.
        const contexts: PathContext[] = [
            // gpt-4 critiques claude's thesis v0
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: DialecticStageSlug.Thesis, sourceAttemptCount: 0, attemptCount: 0, documentKey: FileType.business_case_critique }),
            // gpt-4 critiques claude's thesis v1
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: DialecticStageSlug.Thesis, sourceAttemptCount: 1, attemptCount: 0, documentKey: FileType.business_case_critique }),
            // claude critiques gpt-4's thesis v0
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'claude-3-opus', sourceModelSlugs: ['gpt-4-turbo'], sourceAnchorType: DialecticStageSlug.Thesis, sourceAttemptCount: 0, attemptCount: 0, documentKey: FileType.business_case_critique }),
            // A different critique type
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: 'summary', sourceAttemptCount: 0, attemptCount: 0, documentKey: FileType.business_case_critique }),
            // A different attempt count for the critique itself
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Antithesis, contributionType: 'antithesis', fileType: FileType.business_case_critique, modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus'], sourceAnchorType: DialecticStageSlug.Thesis, sourceAttemptCount: 0, attemptCount: 1, documentKey: FileType.business_case_critique }),
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
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 }),
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'claude-3-opus', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 }),
            // Case 3 & 4: Same generating model, different paired model
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-c', attemptCount: 0 }),
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-d', attemptCount: 0 }),
            // Case 5 & 6: Same generating model, different anchor model
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-c', pairedModelSlug: 'model-d', attemptCount: 0 }),
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'model-d', pairedModelSlug: 'model-c', attemptCount: 0 }),
            // Case 7 & 8: Same generating model, different anchor type
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 }),
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, fileType: FileType.PairwiseSynthesisChunk, contributionType: FileType.PairwiseSynthesisChunk, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'summary', sourceAnchorModelSlug: 'model-a', pairedModelSlug: 'model-b', attemptCount: 0 }),
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
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 }),
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gemini-1.5-pro', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 }),
            // Different anchor types
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: 'outline', sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 0 }),
            // Different anchor model slugs
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'gemini-1.5-pro', attemptCount: 0 }),
            // Different attempt counts
            buildPathContext({ projectId, sessionId, stageSlug: DialecticStageSlug.Synthesis, contributionType: 'reduced_synthesis', fileType: FileType.ReducedSynthesis, modelSlug: 'gpt-4-turbo', sourceAnchorType: DialecticStageSlug.Thesis, sourceAnchorModelSlug: 'claude-3-opus', attemptCount: 1 }),
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
    const context = buildPathContext({
      fileType: FileType.business_case,
      documentKey: FileType.business_case,
      projectId: 'project-continuation',
      sessionId: 'session-continuation',
      modelSlug: 'claude-opus',
      contributionType: DialecticStageSlug.Thesis,
      isContinuation: true,
      turnIndex: 1,
    });

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
    const context = buildPathContext({
      fileType: FileType.business_case,
      documentKey: FileType.business_case,
      projectId, sessionId, modelSlug,
      contributionType: DialecticStageSlug.Thesis,
      isContinuation: false,
    });
    const result = constructStoragePath(context);
    assert(!result.storagePath.includes('/_work'), `Non-continuation main contribution must not be in _work. Got: ${result.storagePath}`);
  });

  await t.step('only continuations and intermediate artifacts are saved under _work', () => {
    const continuationContext = buildPathContext({
      fileType: FileType.PairwiseSynthesisChunk,
      documentKey: FileType.PairwiseSynthesisChunk,
      projectId, sessionId, modelSlug,
      stageSlug: DialecticStageSlug.Synthesis,
      contributionType: FileType.PairwiseSynthesisChunk,
      sourceAnchorType: DialecticStageSlug.Thesis,
      sourceAnchorModelSlug: 'model-a',
      pairedModelSlug: 'model-b',
    });
    const intermediateContext = buildPathContext({
      fileType: FileType.PairwiseSynthesisChunk,
      documentKey: FileType.PairwiseSynthesisChunk,
      projectId, sessionId, modelSlug,
      stageSlug: DialecticStageSlug.Synthesis,
      contributionType: FileType.PairwiseSynthesisChunk,
      sourceAnchorType: DialecticStageSlug.Thesis,
      sourceAnchorModelSlug: 'model-a',
      pairedModelSlug: 'model-b',
    });
    const contPath = constructStoragePath(continuationContext);
    const intermPath = constructStoragePath(intermediateContext);
    assert(contPath.storagePath.includes('/_work'), `Continuation must be in _work. Got: ${contPath.storagePath}`);
    assert(intermPath.storagePath.includes('/_work'), `Intermediate artifact must be in _work. Got: ${intermPath.storagePath}`);
  });

  await t.step('should handle document-centric artifacts correctly', async (t) => {
    const docContext = buildPathContext({
      projectId, sessionId, modelSlug,
      fileType: FileType.TurnPrompt, // Placeholder to satisfy type, overwritten in each test.
      attemptCount: 1,
      documentKey: FileType.feature_spec,
    });

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
      const expectedFileName = `${modelSlug}_1_feature_spec_prompt.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for HeaderContext', () => {
      const headerContext = buildPathContext({
        projectId, sessionId, modelSlug,
        fileType: FileType.HeaderContext,
        attemptCount: 1,
        documentKey: FileType.HeaderContext,
      });
      const { storagePath, fileName } = constructStoragePath(headerContext);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/context`;
      const expectedFileName = `${modelSlug}_1_header_context.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for HeaderContext with documentKey', () => {
      const headerContext = buildPathContext({
        projectId, sessionId, modelSlug,
        fileType: FileType.HeaderContext,
        attemptCount: 1,
        documentKey: FileType.HeaderContext,
      });
      const { storagePath, fileName } = constructStoragePath(headerContext);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/context`;
      const expectedFileName = `${modelSlug}_1_header_context.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for HeaderContext with HeaderContext_pairwise documentKey', () => {
      const pairwiseContext = buildPathContext({
        projectId, sessionId, modelSlug,
        fileType: FileType.HeaderContext,
        stageSlug: DialecticStageSlug.Synthesis,
        documentKey: FileType.header_context_pairwise,
      });
      const { storagePath, fileName } = constructStoragePath(pairwiseContext);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/context`;
      const expectedFileName = `${modelSlug}_0_header_context_pairwise.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for AssembledDocumentJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.AssembledDocumentJson });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/assembled_json`;
      const expectedFileName = `${modelSlug}_1_feature_spec_assembled.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });
    
    await t.step('constructs path for AssembledDocumentJson with synthesis_pairwise documentKey uses pairwise pattern', () => {
      const pairwiseAssembledContext = buildPathContext({
        projectId, sessionId, modelSlug,
        fileType: FileType.AssembledDocumentJson,
        stageSlug: DialecticStageSlug.Synthesis,
        sourceAnchorType: DialecticStageSlug.Thesis,
        sourceAnchorModelSlug: 'claude-3-opus',
        pairedModelSlug: 'gemini-1.5-pro',
        documentKey: FileType.synthesis_pairwise_technical_approach,
      });
      const { storagePath, fileName } = constructStoragePath(pairwiseAssembledContext);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/assembled_json`;
      // Should match PairwiseSynthesisChunk pattern: ${modelSlug}_synthesizing_${sourceAnchorModelSlug}_with_${pairedModelSlug}_on_${sourceAnchorType}_${attemptCount}_${documentKey}_assembled.json
      const expectedFileName = `${modelSlug}_synthesizing_claude-3-opus_with_gemini-1.5-pro_on_thesis_0_${FileType.synthesis_pairwise_technical_approach}_assembled.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for RenderedDocument', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.RenderedDocument });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`;
      const expectedFileName = `${modelSlug}_1_feature_spec.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for continuation TurnPrompt', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.TurnPrompt, isContinuation: true, turnIndex: 2 });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/prompts`;
      const expectedFileName = `${modelSlug}_1_feature_spec_continuation_2_prompt.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for document-specific ModelContributionRawJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.ModelContributionRawJson });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`;
      const expectedFileName = `${modelSlug}_1_feature_spec_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('constructs path for continuation ModelContributionRawJson', () => {
      const { storagePath, fileName } = constructStoragePath({ ...docContext, fileType: FileType.ModelContributionRawJson, isContinuation: true, turnIndex: 3 });
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/raw_responses`;
      const expectedFileName = `${modelSlug}_1_feature_spec_continuation_3_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
    });
  });

  await t.step('step 40.b: requires ALL required values for document file types', async (t) => {
    const documentKey = FileType.business_case;
    const stageSlug = DialecticStageSlug.Thesis;
    const mappedStageDir = mapStageSlugToDirName(stageSlug);
    const expectedStoragePath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents`;
    const expectedFileName = `${modelSlug}_${attemptCount}_${documentKey}.md`;

    await t.step('40.b.i: succeeds with ALL required values present', () => {
      const context = buildPathContext({
        projectId, fileType: FileType.business_case,
        sessionId, modelSlug, documentKey,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, expectedStoragePath);
      assertEquals(fileName, expectedFileName);
    });

    await t.step('40.b.ii: throws error when documentKey is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug, documentKey: undefined });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when documentKey is null', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug, documentKey: null as unknown as FileType });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when documentKey is empty string', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug, documentKey: '' as FileType });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when sessionId is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId: undefined, modelSlug, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'sessionId (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when iteration is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, iteration: undefined, modelSlug, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'iteration (number)',
      );
    });

    await t.step('40.b.ii: throws error when stageSlug is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, stageSlug: undefined, modelSlug, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'stageSlug (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when modelSlug is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug: undefined, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'modelSlug (string, non-empty)',
      );
    });

    await t.step('40.b.ii: throws error when attemptCount is undefined', () => {
      const context = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug, attemptCount: undefined, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'attemptCount (number)',
      );
    });

    await t.step('40.b.ii: throws error when projectId is undefined', () => {
      const context = buildPathContext({ projectId: undefined, fileType: FileType.business_case, sessionId, modelSlug, documentKey });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'projectId (string, non-empty)',
      );
    });

    await t.step('40.b.iii: HeaderContext requires documentKey', () => {
      const nonDocumentFileType = FileType.HeaderContext;
      const nonDocumentContext = buildPathContext({
        projectId, fileType: nonDocumentFileType,
        sessionId, modelSlug,
        documentKey: FileType.HeaderContext,
      });
      const { storagePath, fileName } = constructStoragePath(nonDocumentContext);
      const expectedNonDocPath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work/context`;
      const expectedNonDocFileName = `${modelSlug}_${attemptCount}_header_context.json`;
      assertEquals(storagePath, expectedNonDocPath);
      assertEquals(fileName, expectedNonDocFileName);
    });

    await t.step('40.b.iii.b: HeaderContext throws error when documentKey is missing', () => {
      const nonDocumentContext = buildPathContext({ projectId, fileType: FileType.HeaderContext, sessionId, modelSlug, documentKey: undefined });
      assertThrows(
        () => constructStoragePath(nonDocumentContext),
        Error,
        'documentKey is required for header_context file type',
      );
    });

    await t.step('40.b.iv: verifies document file types and HeaderContext require documentKey', () => {
      const documentContext = buildPathContext({
        projectId, fileType: FileType.business_case,
        sessionId, modelSlug, documentKey,
      });
      const { storagePath: docPath, fileName: docFileName } = constructStoragePath(documentContext);
      assertEquals(docPath, expectedStoragePath);
      assertEquals(docFileName, expectedFileName);

      const documentContextMissingKey = buildPathContext({ projectId, fileType: FileType.business_case, sessionId, modelSlug, documentKey: undefined });
      assertThrows(
        () => constructStoragePath(documentContextMissingKey),
        Error,
        'documentKey',
      );

      const nonDocumentContext = buildPathContext({
        projectId, fileType: FileType.HeaderContext,
        sessionId, modelSlug,
        documentKey: FileType.HeaderContext,
      });
      const { storagePath: nonDocPath, fileName: nonDocFileName } = constructStoragePath(nonDocumentContext);
      assert(nonDocPath.includes('_work/context'), 'HeaderContext should work with documentKey');
      assert(nonDocFileName.includes(FileType.HeaderContext), 'HeaderContext should include documentKey in filename');

      const nonDocumentContextMissingKey = buildPathContext({ projectId, fileType: FileType.HeaderContext, sessionId, modelSlug, documentKey: undefined });
      assertThrows(
        () => constructStoragePath(nonDocumentContextMissingKey),
        Error,
        'documentKey is required for header_context file type',
      );
    });
  });

  await t.step('step 40.f: requires ALL required values for document file types', async (t) => {
    const documentKey = FileType.business_case;
    const stageSlug = DialecticStageSlug.Thesis;
    const mappedStageDir = mapStageSlugToDirName(stageSlug);
    const expectedStoragePath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents`;
    const expectedFileName = `${modelSlug}_${attemptCount}_${documentKey}.md`;

    await t.step('40.f.i: succeeds with ALL required values present', () => {
      const testProjectId = 'project-123';
      const testSessionId = 'session-123';
      const testIteration = 1;
      const testStageSlug = DialecticStageSlug.Thesis;
      const testModelSlug = 'claude-opus';
      const testAttemptCount = 0;
      const testDocumentKey = FileType.business_case;
      const context = buildPathContext({
        projectId: testProjectId, fileType: FileType.business_case,
        sessionId: testSessionId, modelSlug: testModelSlug, documentKey: testDocumentKey,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const expectedShortSessionId = generateShortId(testSessionId);
      const expectedMappedStageDir = mapStageSlugToDirName(testStageSlug);
      const expectedPath = `${testProjectId}/session_${expectedShortSessionId}/iteration_${testIteration}/${expectedMappedStageDir}/documents`;
      const expectedFile = `${testModelSlug}_${testAttemptCount}_${testDocumentKey}.md`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFile);
    });

    await t.step('40.f.ii.a: throws error when documentKey is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: undefined });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey',
      );
    });

    await t.step('40.f.ii.b: throws error when documentKey is null', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: null as unknown as FileType });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey',
      );
    });

    await t.step('40.f.ii.c: throws error when documentKey is empty string', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: '' as FileType });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'documentKey',
      );
    });

    await t.step('40.f.ii.d: throws error when sessionId is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: undefined, modelSlug: 'claude-opus', documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'sessionId',
      );
    });

    await t.step('40.f.ii.e: throws error when iteration is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', iteration: undefined, modelSlug: 'claude-opus', documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'iteration',
      );
    });

    await t.step('40.f.ii.f: throws error when stageSlug is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', stageSlug: undefined, modelSlug: 'claude-opus', documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'stageSlug',
      );
    });

    await t.step('40.f.ii.g: throws error when modelSlug is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: undefined, documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'modelSlug',
      );
    });

    await t.step('40.f.ii.h: throws error when attemptCount is undefined', () => {
      const context = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', attemptCount: undefined, documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'attemptCount',
      );
    });

    await t.step('40.f.ii.i: throws error when projectId is undefined', () => {
      const context = buildPathContext({ projectId: undefined, fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: FileType.business_case });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'projectId',
      );
    });

    await t.step('40.f.iii: HeaderContext requires documentKey', () => {
      const nonDocumentContext = buildPathContext({
        projectId: 'project-123', fileType: FileType.HeaderContext,
        sessionId: 'session-123', modelSlug: 'claude-opus',
        documentKey: FileType.HeaderContext,
      });
      const { storagePath, fileName } = constructStoragePath(nonDocumentContext);
      assert(storagePath.includes('_work/context'), 'HeaderContext should work with documentKey');
      assert(fileName.includes(FileType.HeaderContext), 'HeaderContext should include documentKey in filename');
    });

    await t.step('40.f.iii.b: HeaderContext throws error when documentKey is missing', () => {
      const nonDocumentContext = buildPathContext({ projectId: 'project-123', fileType: FileType.HeaderContext, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: undefined });
      assertThrows(
        () => constructStoragePath(nonDocumentContext),
        Error,
        'documentKey is required for header_context file type',
      );
    });

    await t.step('40.f.iv: verifies document file types and HeaderContext require ALL required values', () => {
      // (1) Call with ALL required values present, assert it succeeds
      const documentContext = buildPathContext({
        projectId: 'project-123', fileType: FileType.business_case,
        sessionId: 'session-123', modelSlug: 'claude-opus',
        documentKey: FileType.business_case,
      });
      const { storagePath: docPath, fileName: docFileName } = constructStoragePath(documentContext);
      assert(docPath.includes('documents'), 'Document path should be constructed successfully');
      assert(docFileName.includes(FileType.business_case), 'Document filename should include documentKey');

      // (2) Call with missing documentKey, assert it throws an error
      const documentContextMissingKey = buildPathContext({ projectId: 'project-123', fileType: FileType.business_case, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: undefined });
      assertThrows(
        () => constructStoragePath(documentContextMissingKey),
        Error,
        'documentKey',
      );

      // (3) Call with HeaderContext and documentKey, assert it does NOT throw an error
      const nonDocumentContext = buildPathContext({
        projectId: 'project-123', fileType: FileType.HeaderContext,
        sessionId: 'session-123', modelSlug: 'claude-opus',
        documentKey: FileType.HeaderContext,
      });
      const { storagePath: nonDocPath, fileName: nonDocFileName } = constructStoragePath(nonDocumentContext);
      assert(nonDocPath.includes('_work/context'), 'HeaderContext should work with documentKey');
      assert(nonDocFileName.includes(FileType.HeaderContext), 'HeaderContext should include documentKey in filename');

      // (4) Call with HeaderContext without documentKey, assert it DOES throw an error
      const nonDocumentContextMissingKey = buildPathContext({ projectId: 'project-123', fileType: FileType.HeaderContext, sessionId: 'session-123', modelSlug: 'claude-opus', documentKey: undefined });
      assertThrows(
        () => constructStoragePath(nonDocumentContextMissingKey),
        Error,
        'documentKey is required for header_context file type',
      );
    });
  });

  await t.step('step 11.b: path construction prevents collisions between root and continuation chunks', async (t) => {
    const documentKey = FileType.business_case;
    const stageSlug = DialecticStageSlug.Thesis;
    const mappedStageDir = mapStageSlugToDirName(stageSlug);
    const baseRawContext = buildPathContext({
      projectId, sessionId, modelSlug,
      fileType: FileType.ModelContributionRawJson,
      documentKey,
    });

    await t.step('11.b.i: root chunk (isContinuation: false, turnIndex: undefined) does NOT include continuation suffix and uses raw_responses/', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: false, turnIndex: undefined });
      const { storagePath, fileName } = constructStoragePath(context);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
      const expectedFileName = `${modelSlug}_${attemptCount}_${documentKey}_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
      assert(!fileName.includes('_continuation_'), 'Root chunk filename should not include continuation suffix');
    });

    await t.step('11.b.ii: continuation chunk (isContinuation: true, turnIndex: 1) includes _continuation_1 suffix and uses _work/raw_responses/', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 1 });
      const { storagePath, fileName } = constructStoragePath(context);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work/raw_responses`;
      const expectedFileName = `${modelSlug}_${attemptCount}_${documentKey}_continuation_1_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
      assert(fileName.includes('_continuation_1'), 'Continuation chunk filename should include _continuation_1 suffix');
    });

    await t.step('11.b.iii: continuation chunk (isContinuation: true, turnIndex: 2) includes _continuation_2 suffix and uses _work/raw_responses/', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 2 });
      const { storagePath, fileName } = constructStoragePath(context);
      const expectedPath = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work/raw_responses`;
      const expectedFileName = `${modelSlug}_${attemptCount}_${documentKey}_continuation_2_raw.json`;
      assertEquals(storagePath, expectedPath);
      assertEquals(fileName, expectedFileName);
      assert(fileName.includes('_continuation_2'), 'Continuation chunk filename should include _continuation_2 suffix');
    });

    await t.step('11.b.iv: continuation chunk (isContinuation: true, turnIndex: undefined) throws error indicating turnIndex is required and must be > 0', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: undefined });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'turnIndex is required and must be a number > 0 for continuation chunks',
      );
    });

    await t.step('11.b.v: continuation chunk (isContinuation: true, turnIndex: 0) throws error indicating turnIndex must be > 0', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 0 });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'turnIndex is required and must be a number > 0 for continuation chunks',
      );
    });

    await t.step('11.b.vi: continuation chunk (isContinuation: true, turnIndex: -1) throws error indicating turnIndex must be > 0', () => {
      const context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: -1 });
      assertThrows(
        () => constructStoragePath(context),
        Error,
        'turnIndex is required and must be a number > 0 for continuation chunks',
      );
    });

    await t.step('11.b.vii: root chunk path and continuation chunk path (with turnIndex: 1) are different, proving no collision is possible', () => {
      const rootContext = buildPathContext({ ...baseRawContext, isContinuation: false, turnIndex: undefined });
      const continuationContext = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 1 });
      const rootPath = constructStoragePath(rootContext);
      const continuationPath = constructStoragePath(continuationContext);
      const rootFullPath = `${rootPath.storagePath}/${rootPath.fileName}`;
      const continuationFullPath = `${continuationPath.storagePath}/${continuationPath.fileName}`;
      assert(rootFullPath !== continuationFullPath, `Root chunk path (${rootFullPath}) and continuation chunk path (${continuationFullPath}) must be different to prevent collisions`);
      assert(rootPath.storagePath !== continuationPath.storagePath, 'Root chunks and continuation chunks must use different storage directories');
    });

    await t.step('11.b.viii: multiple continuation chunks with different turnIndex values (1, 2, 3) have unique paths, proving no collision between continuation chunks', () => {
      const continuation1Context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 1 });
      const continuation2Context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 2 });
      const continuation3Context = buildPathContext({ ...baseRawContext, isContinuation: true, turnIndex: 3 });
      const path1 = constructStoragePath(continuation1Context);
      const path2 = constructStoragePath(continuation2Context);
      const path3 = constructStoragePath(continuation3Context);
      const fullPath1 = `${path1.storagePath}/${path1.fileName}`;
      const fullPath2 = `${path2.storagePath}/${path2.fileName}`;
      const fullPath3 = `${path3.storagePath}/${path3.fileName}`;
      const uniquePaths = new Set([fullPath1, fullPath2, fullPath3]);
      assertEquals(uniquePaths.size, 3, `All continuation chunk paths must be unique. Got: ${Array.from(uniquePaths).join(', ')}`);
      assert(path1.fileName.includes('_continuation_1'), 'First continuation chunk should have _continuation_1 in filename');
      assert(path2.fileName.includes('_continuation_2'), 'Second continuation chunk should have _continuation_2 in filename');
      assert(path3.fileName.includes('_continuation_3'), 'Third continuation chunk should have _continuation_3 in filename');
    });
  });

  await t.step('UserFeedback original document path', async (t) => {
    await t.step('UserFeedback with originalStoragePath and originalBaseName returns that path as storagePath and baseName_feedback.md as fileName', () => {
      const originalStoragePath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/documents`;
      const originalBaseName = 'business_case_0_claude';
      const context = buildPathContext({
        projectId, fileType: FileType.UserFeedback,
        originalStoragePath,
        originalBaseName,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      assertEquals(storagePath, originalStoragePath);
      assertEquals(fileName, 'business_case_0_claude_feedback.md');
    });

    await t.step('UserFeedback with originalBaseName uses sanitized base name for fileName', () => {
      const context = buildPathContext({
        projectId, fileType: FileType.UserFeedback,
        originalStoragePath: 'proj/session_abc/iteration_0/1_thesis/documents',
        originalBaseName: 'Feature Spec 1',
      });
      const { fileName } = constructStoragePath(context);
      assertEquals(fileName, 'feature_spec_1_feedback.md');
    });
  });
});
