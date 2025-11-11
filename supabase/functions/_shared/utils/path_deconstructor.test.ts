import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { deconstructStoragePath, mapDirNameToStageSlug } from './path_deconstructor.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { constructStoragePath, generateShortId, mapStageSlugToDirName, sanitizeForPath } from './path_constructor.ts';
import { FileType, PathContext } from '../types/file_manager.types.ts';
import type { ContributionType } from '../../dialectic-service/dialectic.interface.ts';
import { isContributionType } from './type_guards.ts';

// --- Direct Deconstruction Tests ---
Deno.test('[path_deconstructor] direct - model_contribution_raw_json', () => {
  const projectId = 'proj-mcrj';
  const sessionId = 'sess-mcrj-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 0;
  const stageSlug = 'hypothesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const modelSlug = 'gpt-4-turbo';
  const attemptCount = 0;
  const modelSlugSanitized = sanitizeForPath(modelSlug);
  const stageSlugSanitized = sanitizeForPath(stageSlug);

  const dirPart = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
  const filePart = `${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}_raw.json`;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.modelSlug, modelSlugSanitized);
  assertEquals(info.attemptCount, attemptCount);
  assertEquals(info.parsedFileNameFromPath, `${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}_raw.json`);
  assertEquals(info.fileTypeGuess, 'model_contribution_raw_json');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - seed_prompt', () => {
  const projectId = 'project-seed';
  const sessionId = 'session-seed-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 0;
  const stageSlug = 'antithesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);

  const dirPart = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
  const filePart = 'seed_prompt.md';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, 'seed_prompt.md');
  assertEquals(info.fileTypeGuess, 'seed_prompt');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - user_feedback', () => {
  const projectId = 'proj-uf';
  const sessionId = 'sess-uf-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 3;
  const stageSlug = 'parenthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const stageSlugSanitized = sanitizeForPath(stageSlug);

  const dirPart = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
  const filePart = `user_feedback_${stageSlugSanitized}.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, `user_feedback_${stageSlugSanitized}.md`);
  assertEquals(info.fileTypeGuess, 'user_feedback');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - project_readme', () => {
  const projectId = 'readme-proj';
  const dirPart = projectId;
  const filePart = 'project_readme.md';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, 'project_readme.md');
  assertEquals(info.fileTypeGuess, 'project_readme');
  assertEquals(info.error, undefined);
  assertEquals(info.shortSessionId, undefined);
  assertEquals(info.iteration, undefined);
  assertEquals(info.stageDirName, undefined);
  assertEquals(info.stageSlug, undefined);
});

Deno.test('[path_deconstructor] direct - project_settings_file', () => {
  const projectId = 'settings-proj';
  const dirPart = projectId;
  const filePart = 'project_settings.json';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, 'project_settings.json');
  assertEquals(info.fileTypeGuess, 'project_settings_file');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - general_resource (project root)', () => {
  const projectId = 'gen-res-proj';
  const originalFileName = 'Company Branding Guide.pdf';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/general_resource`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'general_resource');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - initial_user_prompt', () => {
  const projectId = 'init-prompt-proj';
  const originalFileName = 'My Project Idea - Draft 1.md';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = projectId;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'initial_user_prompt');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - pairwise_synthesis_chunk', () => {
  const context: PathContext = {
    projectId: 'proj-psc',
    sessionId: 'sess-psc-uuid',
    iteration: 1,
    stageSlug: 'synthesis',
    fileType: FileType.PairwiseSynthesisChunk,
    modelSlug: 'model-x',
    attemptCount: 0,
    contributionType: 'pairwise_synthesis_chunk',
    sourceAnchorType: 'thesis',
    sourceAnchorModelSlug: 'model-a',
    pairedModelSlug: 'model-b',
  };
  const { storagePath, fileName } = constructStoragePath(context);
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName: fileName });

  assertEquals(info.originalProjectId, context.projectId);
  assertEquals(info.shortSessionId, generateShortId(context.sessionId!));
  assertEquals(info.iteration, context.iteration);
  assertEquals(info.stageSlug, context.stageSlug);
  assertEquals(info.fileTypeGuess, FileType.PairwiseSynthesisChunk);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - reduced_synthesis', () => {
  const context: PathContext = {
    projectId: 'proj-rs',
    sessionId: 'sess-rs-uuid',
    iteration: 2,
    stageSlug: 'synthesis',
    fileType: FileType.ReducedSynthesis,
    modelSlug: 'model-y',
    attemptCount: 1,
    contributionType: 'reduced_synthesis',
    sourceAnchorType: 'thesis',
    sourceAnchorModelSlug: 'model-c',
  };
  const { storagePath, fileName } = constructStoragePath(context);
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName: fileName });

  assertEquals(info.originalProjectId, context.projectId);
  assertEquals(info.shortSessionId, generateShortId(context.sessionId!));
  assertEquals(info.iteration, context.iteration);
  assertEquals(info.stageSlug, context.stageSlug);
  assertEquals(info.fileTypeGuess, FileType.ReducedSynthesis);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - synthesis', () => {
  const context: PathContext = {
    projectId: 'proj-fs',
    sessionId: 'sess-fs-uuid',
    iteration: 3,
    stageSlug: 'synthesis',
    fileType: FileType.Synthesis,
    modelSlug: 'model-z',
    attemptCount: 2,
    contributionType: 'synthesis',
  };
  const { storagePath, fileName } = constructStoragePath(context);
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName: fileName });

  assertEquals(info.originalProjectId, context.projectId);
  assertEquals(info.shortSessionId, generateShortId(context.sessionId!));
  assertEquals(info.iteration, context.iteration);
  assertEquals(info.stageSlug, context.stageSlug);
  assertEquals(info.fileTypeGuess, FileType.Synthesis);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - rag_context_summary', () => {
  const context: PathContext = {
    projectId: 'proj-rcs',
    sessionId: 'sess-rcs-uuid',
    iteration: 1,
    stageSlug: 'synthesis',
    fileType: FileType.RagContextSummary,
    modelSlug: 'model-embed',
    sourceModelSlugs: ['model-a', 'model-b'],
  };
  const { storagePath, fileName } = constructStoragePath(context);
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName: fileName });

  assertEquals(info.originalProjectId, context.projectId);
  assertEquals(info.shortSessionId, generateShortId(context.sessionId!));
  assertEquals(info.iteration, context.iteration);
  assertEquals(info.stageSlug, context.stageSlug);
  assertEquals(info.fileTypeGuess, FileType.RagContextSummary);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - business_case with continuation', () => {
  const context: PathContext = {
    projectId: 'proj-cont',
    sessionId: 'sess-cont-uuid',
    iteration: 2,
    stageSlug: 'synthesis',
    fileType: FileType.business_case,
    documentKey: 'business_case',
    modelSlug: 'claude-3-sonnet',
    attemptCount: 0,
    contributionType: 'synthesis',
    isContinuation: true,
    turnIndex: 2,
  };
  const { storagePath, fileName } = constructStoragePath(context);
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName: fileName });

  assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
  assertEquals(info.originalProjectId, context.projectId);
  assertEquals(info.shortSessionId, generateShortId(context.sessionId!));
  assertEquals(info.iteration, context.iteration);
  assertEquals(info.stageSlug, context.stageSlug);
  assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
  assertEquals(info.attemptCount, context.attemptCount);
  assertEquals(info.contributionType, context.contributionType);
  assertEquals(info.isContinuation, context.isContinuation);
  assertEquals(info.turnIndex, context.turnIndex);
  assertEquals(info.fileTypeGuess, FileType.business_case);
  assertEquals(info.documentKey, context.documentKey);
});


Deno.test('[path_deconstructor] handles unknown path structure gracefully', () => {
  const dirPart = 'some/completely/unknown/path/structure';
  const filePart = 'file.txt';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertExists(info.error);
  assertEquals(info.error, 'Path did not match any known deconstruction patterns.');
  assertEquals(info.originalProjectId, undefined);
  assertEquals(info.fileTypeGuess, undefined);
});

Deno.test('[path_deconstructor] mapDirNameToStageSlug works as expected', () => {
  assertEquals(mapDirNameToStageSlug('1_thesis'), 'thesis');
  assertEquals(mapDirNameToStageSlug('2_antithesis'), 'antithesis');
  assertEquals(mapDirNameToStageSlug('5_paralysis'), 'paralysis');
  assertEquals(mapDirNameToStageSlug('unknown_dir'), 'unknown_dir');
  assertEquals(mapDirNameToStageSlug('THESIS'), 'thesis'); 
});


// --- Defensive: ensure project root .zip is not misclassified ---
Deno.test('[path_deconstructor] defensive - project root zip is classified as project_export_zip (not initial_user_prompt)', () => {
  const projectId = 'proj-zip';
  const dirPart = projectId;
  const filePart = 'my_export.zip';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, filePart);
  assertEquals(info.fileTypeGuess, FileType.ProjectExportZip);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] identifies project root archive as project_export_zip', () => {
  const projectId = 'proj-zip-2';
  const dirPart = projectId;
  const filePart = 'my_export.zip';
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, 'my_export.zip');
  assertEquals(info.fileTypeGuess, FileType.ProjectExportZip);
  assertEquals(info.error, undefined);
});


// --- Yin/Yang (Inverse Function) Tests: Construct then Deconstruct ---

const constructDeconstructTestCases: Array<{ 
  name: string; 
  context: PathContext; 
  // Fields to check in deconstructedInfo against original context
  checkFields: Array<keyof Pick<PathContext, 'sessionId' | 'iteration' | 'stageSlug' | 'modelSlug' | 'attemptCount' | 'contributionType'> | 'shortSessionId' | 'stageDirName'>;
  expectedSanitizedFileName?: string; // If originalFileName in context leads to a specific sanitized name in path
  expectedFixedFileNameInPath?: string; // If fileType leads to a fixed name in path (e.g. seed_prompt.md)
}> = [
  {
    name: 'project_readme',
    context: {
      projectId: 'yy-pr',
      fileType: FileType.ProjectReadme,
    },
    checkFields: [],
    expectedFixedFileNameInPath: 'project_readme.md'
  },
  {
    name: 'initial_user_prompt',
    context: {
      projectId: 'yy-iup',
      fileType: FileType.InitialUserPrompt,
      originalFileName: 'My Ideas V1.txt',
    },
    checkFields: [],
    expectedSanitizedFileName: 'my_ideas_v1.txt'
  },
  {
    name: 'project_settings_file',
    context: {
      projectId: 'yy-psf',
      fileType: FileType.ProjectSettingsFile,
    },
    checkFields: [],
    expectedFixedFileNameInPath: 'project_settings.json'
  },
  {
    name: 'general_resource (project root)',
    context: {
      projectId: 'yy-gr',
      fileType: FileType.GeneralResource,
      originalFileName: 'Shared Asset.png',
    },
    checkFields: [],
    expectedSanitizedFileName: 'shared_asset.png'
  },
  {
    name: 'seed_prompt',
    context: {
      projectId: 'yy-sp',
      fileType: FileType.SeedPrompt,
      sessionId: 'session-yy-sp',
      iteration: 1,
      stageSlug: 'thesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'seed_prompt.md'
  },
  {
    name: 'user_feedback',
    context: {
      projectId: 'yy-ufb',
      fileType: FileType.UserFeedback,
      sessionId: 'session-yy-ufb',
      iteration: 0,
      stageSlug: 'synthesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'user_feedback_synthesis.md' // constructor sanitizes stageSlug for filename
  },
  {
    name: 'synthesis',
    context: {
      projectId: 'yy-mcm',
      fileType: FileType.Synthesis,
      sessionId: 'session-yy-mcm',
      iteration: 2,
      stageSlug: 'synthesis',
      modelSlug: 'Claude Model 2',
      attemptCount: 1,
      contributionType: 'synthesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount', 'contributionType'],
    expectedFixedFileNameInPath: 'claude_model_2_1_synthesis.md'
  },
  {
    name: 'model_contribution_raw_json',
    context: {
      projectId: 'yy-mcrj',
      fileType: FileType.ModelContributionRawJson,
      sessionId: 'session-yy-mcrj',
      iteration: 3,
      stageSlug: 'parenthesis',
      modelSlug: 'GPT-X Alpha',
      attemptCount: 0,
      contributionType: 'parenthesis', // Corrected: Match the stage slug
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount', 'contributionType'],
    expectedFixedFileNameInPath: 'gpt-x_alpha_0_parenthesis_raw.json'
  },
  {
    name: 'pairwise_synthesis_chunk',
    context: {
      projectId: 'yy-psc',
      fileType: FileType.PairwiseSynthesisChunk,
      sessionId: 'session-yy-psc',
      iteration: 0,
      stageSlug: 'synthesis',
      modelSlug: 'gpt-4-turbo',
      attemptCount: 0,
      contributionType: 'pairwise_synthesis_chunk',
      sourceAnchorType: 'thesis',
      sourceAnchorModelSlug: 'model-a',
      pairedModelSlug: 'model-b',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'gpt-4-turbo_synthesizing_model-a_with_model-b_on_thesis_0_pairwise_synthesis_chunk.md'
  },
    {
    name: 'reduced_synthesis',
    context: {
      projectId: 'yy-rs',
      fileType: FileType.ReducedSynthesis,
      sessionId: 'session-yy-rs',
      iteration: 1,
      stageSlug: 'synthesis',
      modelSlug: 'claude-3-opus',
      attemptCount: 1,
      contributionType: 'reduced_synthesis',
      sourceAnchorType: 'thesis',
      sourceAnchorModelSlug: 'model-a',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'claude-3-opus_reducing_thesis_by_model-a_1_reduced_synthesis.md'
  },
  {
    name: 'synthesis (from final)',
    context: {
      projectId: 'yy-fs',
      fileType: FileType.Synthesis,
      sessionId: 'session-yy-fs',
      iteration: 2,
      stageSlug: 'synthesis',
      modelSlug: 'gemini-1.5-pro',
      attemptCount: 0,
      contributionType: 'synthesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'gemini-1.5-pro_0_synthesis.md'
  },
  {
    name: 'rag_context_summary',
    context: {
      projectId: 'yy-rcs',
      fileType: FileType.RagContextSummary,
      sessionId: 'session-yy-rcs',
      iteration: 0,
      stageSlug: 'synthesis',
      modelSlug: 'text-embedder',
      sourceModelSlugs: ['model-a', 'model-b'],
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'text-embedder_compressing_model-a_and_model-b_rag_summary.txt'
  },
  {
    name: 'PendingFile',
    context: { projectId: 'yy-pf', fileType: FileType.PendingFile, originalFileName: 'task-1.md' },
    checkFields: [],
    expectedSanitizedFileName: 'task-1.md',
  },
  {
    name: 'CurrentFile',
    context: { projectId: 'yy-cf', fileType: FileType.CurrentFile, originalFileName: 'task-2.md' },
    checkFields: [],
    expectedSanitizedFileName: 'task-2.md',
  },
  {
    name: 'CompleteFile',
    context: { projectId: 'yy-cpf', fileType: FileType.CompleteFile, originalFileName: 'task-3.md' },
    checkFields: [],
    expectedSanitizedFileName: 'task-3.md',
  },
  {
    name: 'SynthesisHeaderContext',
    context: { projectId: 'yy-shc', fileType: FileType.SynthesisHeaderContext, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_header_context.json',
  },
  {
    name: 'product_requirements',
    context: { projectId: 'yy-product_requirements', fileType: FileType.product_requirements, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_product_requirements.md',
  },
  {
    name: 'system_architecture',
    context: { projectId: 'yy-sa', fileType: FileType.system_architecture, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_system_architecture.md',
  },
  {
    name: 'tech_stack',
    context: { projectId: 'yy-sts', fileType: FileType.tech_stack, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_tech_stack.md',
  },
  {
    name: 'synthesis_pairwise_business_case',
    context: { projectId: 'yy-spbc', fileType: FileType.synthesis_pairwise_business_case, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_pairwise_business_case.json',
  },
  {
    name: 'synthesis_document_business_case',
    context: { projectId: 'yy-sdbc', fileType: FileType.synthesis_document_business_case, sessionId: 's', iteration: 1, stageSlug: 'synthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_document_business_case.json',
  },
  {
    name: 'technical_requirements',
    context: { projectId: 'yy-technical_requirements', fileType: FileType.technical_requirements, sessionId: 's', iteration: 1, stageSlug: 'parenthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_technical_requirements.md',
  },
  {
    name: 'milestone_schema',
    context: { projectId: 'yy-ms', fileType: FileType.milestone_schema, sessionId: 's', iteration: 1, stageSlug: 'parenthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_milestone_schema.md',
  },
  {
    name: 'master_plan (stage-level)',
    context: { projectId: 'yy-mp', fileType: FileType.master_plan, sessionId: 's', iteration: 1, stageSlug: 'parenthesis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_master_plan.md',
  },
  {
    name: 'advisor_recommendations',
    context: { projectId: 'yy-ar', fileType: FileType.advisor_recommendations, sessionId: 's', iteration: 1, stageSlug: 'paralysis', modelSlug: 'm', attemptCount: 0 },
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_advisor_recommendations.md',
  },
];

constructDeconstructTestCases.forEach((tc) => {
  Deno.test(`[path_deconstructor_inverse C->D] ${tc.name}`, () => {
    const constructedPath = constructStoragePath(tc.context);
    assertExists(constructedPath.storagePath);
    assertExists(constructedPath.fileName);

    // Pass the fileName from constructedPath, and tc.context.originalFileName as dbOriginalFileName
    const deconstructedInfo = deconstructStoragePath({
      storageDir: constructedPath.storagePath,
      fileName: constructedPath.fileName, // Use fileName from the construction output
      dbOriginalFileName: tc.context.originalFileName, // Pass originalFileName from context for db comparison if needed
    });

    assertEquals(deconstructedInfo.error, undefined, `Deconstruction failed for ${JSON.stringify(tc.context)} (type: ${tc.context.fileType})`);
    assertEquals(deconstructedInfo.originalProjectId, tc.context.projectId, "Original Project ID mismatch");
    assertEquals(deconstructedInfo.fileTypeGuess, tc.context.fileType, "FileType guess mismatch");

    tc.checkFields.forEach(field => {
      if (field === 'shortSessionId') {
        assertExists(tc.context.sessionId, `Test case context for ${tc.name} missing sessionId for shortSessionId check`);
        assertEquals(deconstructedInfo.shortSessionId, generateShortId(tc.context.sessionId!), `shortSessionId mismatch for ${tc.name}`);
      } else if (field === 'stageDirName') {
        assertExists(tc.context.stageSlug, `Test case context for ${tc.name} missing stageSlug for stageDirName check`);
        assertEquals(deconstructedInfo.stageDirName, mapStageSlugToDirName(tc.context.stageSlug!), `stageDirName mismatch for ${tc.name}`);
      } else if (field === 'modelSlug' && tc.context.modelSlug) { // modelSlug in context is unsanitized
        assertEquals(deconstructedInfo.modelSlug, sanitizeForPath(tc.context.modelSlug), `modelSlug mismatch for ${tc.name}`);
             } else if (field === 'stageSlug' || field === 'iteration' || field === 'attemptCount' || field === 'contributionType') {
         assertEquals(deconstructedInfo[field], tc.context[field], `${field} mismatch for ${tc.name}`);
      } else {
        // This case should not be reached if checkFields are typed correctly
        throw new Error(`Unknown field to check: ${field} in test ${tc.name}`);
      }
    });
    
    const expectedFileName = tc.expectedFixedFileNameInPath ?? tc.expectedSanitizedFileName;
    if (expectedFileName) {
      assertEquals(deconstructedInfo.parsedFileNameFromPath, expectedFileName, `parsedFileNameFromPath mismatch for ${tc.name}`);
    }
  });
});

// --- Yin/Yang (Inverse Function) Tests: Deconstruct then Construct ---

interface DeconstructReconstructTestCase {
  name: string;
  samplePath: string;
  dbOriginalFileName?: string;
  expectedFileType: FileType;
  // Expected components to be present after deconstruction for reconstructing context
  expectedContextParts: Partial<Pick<PathContext, 'iteration' | 'stageSlug' | 'modelSlug' | 'attemptCount'> & { originalProjectId?: string; stageDirName?: string, shortSessionId?: string }>;
}

const deconstructReconstructTestCases: DeconstructReconstructTestCase[] = [
  {
    name: 'project_readme',
    samplePath: 'old_proj_alpha/project_readme.md',
    expectedFileType: FileType.ProjectReadme,
    expectedContextParts: { originalProjectId: 'old_proj_alpha' },
  },
  {
    name: 'initial_user_prompt',
    samplePath: 'old_proj_beta/my_user_prompt_file.md',
    dbOriginalFileName: 'My User Prompt File.md',
    expectedFileType: FileType.InitialUserPrompt,
    expectedContextParts: { originalProjectId: 'old_proj_beta' },
  },
  {
    name: 'project_settings_file',
    samplePath: 'old_proj_gamma/project_settings.json',
    expectedFileType: FileType.ProjectSettingsFile,
    expectedContextParts: { originalProjectId: 'old_proj_gamma' },
  },
  {
    name: 'general_resource (project root)',
    samplePath: 'old_proj_delta/general_resource/asset_library.zip',
    dbOriginalFileName: 'Asset Library.zip',
    expectedFileType: FileType.GeneralResource,
    expectedContextParts: { originalProjectId: 'old_proj_delta' },
  },
  {
    name: 'seed_prompt',
    samplePath: 'proj_epsilon/session_sess001/iteration_1/1_thesis/seed_prompt.md',
    expectedFileType: FileType.SeedPrompt,
    expectedContextParts: {
      originalProjectId: 'proj_epsilon',
      shortSessionId: 'sess001',
      iteration: 1,
      stageSlug: 'thesis',
    },
  },
  {
    name: 'user_feedback',
    samplePath: 'proj_zeta/session_sess002/iteration_0/2_antithesis/user_feedback_antithesis.md',
    expectedFileType: FileType.UserFeedback,
    expectedContextParts: {
      originalProjectId: 'proj_zeta',
      shortSessionId: 'sess002',
      iteration: 0,
      stageSlug: 'antithesis',
    },
  },
  {
    name: 'synthesis',
    samplePath: 'proj_eta/session_sess003/iteration_2/3_synthesis/claude_v1_2_synthesis.md',
    expectedFileType: FileType.Synthesis,
    expectedContextParts: {
      originalProjectId: 'proj_eta',
      shortSessionId: 'sess003',
      iteration: 2,
      stageSlug: 'synthesis',
      modelSlug: 'claude_v1', // This should be the sanitized slug from the filename
      attemptCount: 2,
    },
  },
  {
    name: 'model_contribution_raw_json',
    samplePath: 'proj_theta/session_sess004/iteration_1/4_parenthesis/raw_responses/gpt_4_turbo_1_parenthesis_raw.json',
    expectedFileType: FileType.ModelContributionRawJson,
    expectedContextParts: {
      originalProjectId: 'proj_theta',
      shortSessionId: 'sess004',
      iteration: 1,
      stageSlug: 'parenthesis',
      modelSlug: 'gpt_4_turbo', // This should be the sanitized slug from the filename
      attemptCount: 1,
    },
  },
];

// Test Deconstruction then Reconstruction (D->C)
deconstructReconstructTestCases.forEach((tc) => {
  Deno.test(`[path_deconstructor_inverse D->C] ${tc.name}`, () => {
    const lastSlashIndex = tc.samplePath.lastIndexOf('/');
    let dirPart = '';
    let filePart = tc.samplePath;
    if (lastSlashIndex !== -1) {
      dirPart = tc.samplePath.substring(0, lastSlashIndex);
      filePart = tc.samplePath.substring(lastSlashIndex + 1);
    }

    const deconstructedInfo = deconstructStoragePath({
      storageDir: dirPart,
      fileName: filePart,
      dbOriginalFileName: tc.dbOriginalFileName,
    });

    assertEquals(deconstructedInfo.error, undefined, `Deconstruction failed for ${tc.samplePath} (DB filename: ${tc.dbOriginalFileName})`);
    assertEquals(deconstructedInfo.fileTypeGuess, tc.expectedFileType, "Initial FileType guess mismatch");

    // Verify all expected parts were deconstructed
    assertEquals(deconstructedInfo.originalProjectId, tc.expectedContextParts.originalProjectId, `Deconstructed part originalProjectId mismatch`);
    assertEquals(deconstructedInfo.shortSessionId, tc.expectedContextParts.shortSessionId, `Deconstructed part shortSessionId mismatch`);
    assertEquals(deconstructedInfo.iteration, tc.expectedContextParts.iteration, `Deconstructed part iteration mismatch`);
    assertEquals(deconstructedInfo.stageSlug, tc.expectedContextParts.stageSlug, `Deconstructed part stageSlug mismatch`);
    assertEquals(deconstructedInfo.modelSlug, tc.expectedContextParts.modelSlug, `Deconstructed part modelSlug mismatch`);
    assertEquals(deconstructedInfo.attemptCount, tc.expectedContextParts.attemptCount, `Deconstructed part attemptCount mismatch`);

    const newProjectId = 'new_project_zyxw';
    const newFullSessionId = 'new-full-session-id-12345';
    const newModelSlugForReconstruction = 'reconstructed_model'; // For types that need it

    if (deconstructedInfo.contributionType && !isContributionType(deconstructedInfo.contributionType)) {
        throw new Error(`Invalid contribution type: ${deconstructedInfo.contributionType}`);
    }

    const reconstructionContext: PathContext = {
      projectId: newProjectId, // Use a new project ID for reconstruction
      fileType: deconstructedInfo.fileTypeGuess!,
      originalFileName: deconstructedInfo.parsedFileNameFromPath, // Use parsed filename for general cases
      sessionId: deconstructedInfo.shortSessionId ? newFullSessionId : undefined,
      iteration: deconstructedInfo.iteration,
      stageSlug: deconstructedInfo.stageSlug,
      // modelSlug and attemptCount are tricky, as they are part of the deconstructed filename for contributions
      // For reconstruction, path_constructor derives them if fileType is model_contribution_*
      // For other types, originalFileName is primary.
      modelSlug: deconstructedInfo.modelSlug,
      attemptCount: deconstructedInfo.attemptCount,
      contributionType: deconstructedInfo.contributionType && isContributionType(deconstructedInfo.contributionType) ? deconstructedInfo.contributionType : null,
    };
    
    // If the original test case had a dbOriginalFileName (which implies it might be different from parsedFileNameFromPath due to sanitization),
    // prefer that for reconstruction IF the fileType is one that uses originalFileName directly for naming (not fixed names or complex model names)
    if (tc.dbOriginalFileName && (
        reconstructionContext.fileType === FileType.InitialUserPrompt || 
        reconstructionContext.fileType === FileType.GeneralResource)) {
      reconstructionContext.originalFileName = tc.dbOriginalFileName;
    }

    const reconstructedPath = constructStoragePath(reconstructionContext);

    const originalFullPath = `${dirPart}/${filePart}`;
    const reconstructedFullPath = `${reconstructedPath.storagePath}/${reconstructedPath.fileName}`;
    
    // Replace variable parts for a structural comparison
    const originalComparable = originalFullPath
        .replace(tc.expectedContextParts.originalProjectId!, 'PROJECT_ID')
        
    const reconstructedComparable = reconstructedFullPath
        .replace(reconstructionContext.projectId, 'PROJECT_ID')

    if (tc.expectedContextParts.shortSessionId && reconstructionContext.sessionId) {
        const originalWithSession = originalComparable.replace(tc.expectedContextParts.shortSessionId!, 'SESSION_ID');
        const reconstructedWithSession = reconstructedComparable.replace(generateShortId(reconstructionContext.sessionId!), 'SESSION_ID');
        assertEquals(reconstructedWithSession, originalWithSession, `Reconstructed path structure mismatch for ${tc.name}`);
    } else {
        assertEquals(reconstructedComparable, originalComparable, `Reconstructed path structure mismatch for ${tc.name}`);
    }
  });
});

Deno.test('[path_deconstructor] inverse C->D - document-centric artifacts', async (t) => {
  const projectId = 'proj-doc-centric';
  const sessionId = 'sess-doc-centric-uuid';
  const iteration = 1;
  const modelSlug = 'gpt-4o';
  const attemptCount = 0;
  const documentKey = 'technical_specification';
  const stepName = 'generate_core_components';
  const stageSlug = 'synthesis';

  const baseDocContext: PathContext = {
    projectId,
    sessionId,
    iteration,
    modelSlug,
    attemptCount,
    documentKey,
    stepName,
    stageSlug,
    fileType: FileType.PlannerPrompt, // Placeholder
  };

  const testCases: { name: string; context: PathContext; checkFields: Array<keyof DeconstructedPathInfo> }[] = [
    {
      name: 'PlannerPrompt',
      context: { ...baseDocContext, fileType: FileType.PlannerPrompt },
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'stepName'],
    },
    {
      name: 'TurnPrompt (initial)',
      context: { ...baseDocContext, fileType: FileType.TurnPrompt },
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'documentKey'],
    },
    {
      name: 'TurnPrompt (continuation)',
      context: { ...baseDocContext, fileType: FileType.TurnPrompt, isContinuation: true, turnIndex: 2 },
      checkFields: ['fileTypeGuess', 'documentKey', 'isContinuation', 'turnIndex'],
    },
    {
      name: 'HeaderContext',
      context: { ...baseDocContext, fileType: FileType.HeaderContext },
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'AssembledDocumentJson',
      context: { ...baseDocContext, fileType: FileType.AssembledDocumentJson },
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'RenderedDocument',
      context: { ...baseDocContext, fileType: FileType.RenderedDocument },
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'ModelContributionRawJson (doc-specific)',
      context: { ...baseDocContext, fileType: FileType.ModelContributionRawJson },
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'ModelContributionRawJson (doc-specific, continuation)',
      context: { ...baseDocContext, fileType: FileType.ModelContributionRawJson, isContinuation: true, turnIndex: 3 },
      checkFields: ['fileTypeGuess', 'documentKey', 'isContinuation', 'turnIndex'],
    },
  ];

  for (const tc of testCases) {
    await t.step(tc.name, () => {
      const { storagePath, fileName } = constructStoragePath(tc.context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
      assertEquals(info.originalProjectId, projectId);
      assertEquals(info.shortSessionId, generateShortId(sessionId));
      assertEquals(info.iteration, iteration);
      assertEquals(info.stageSlug, stageSlug);

      // Check dynamic fields
      for (const field of tc.checkFields) {
        let expectedValue: unknown;
        switch (field) {
          case 'fileTypeGuess':
            expectedValue = tc.context.fileType;
            break;
          case 'modelSlug':
            expectedValue = sanitizeForPath(tc.context.modelSlug!);
            break;
          // Fields with matching names and values on both PathContext and DeconstructedPathInfo
          case 'attemptCount':
          case 'documentKey':
          case 'stepName':
          case 'isContinuation':
          case 'turnIndex':
            expectedValue = tc.context[field];
            break;
          default:
            // This will catch if a new, unhandled field is added to checkFields
            throw new Error(`Unhandled field '${String(field)}' in test case '${tc.name}'. Please add a case for it.`);
        }
        assertEquals(info[field], expectedValue, `Field '${field}' mismatch`);
      }
    });
  }
});


// --- Failing Tests from Yin/Yang exercise to be fixed in deconstructor ---
Deno.test("[path_deconstructor] failing cases - bugs discovered from inverse tests", async (t) => {
  await t.step("should correctly deconstruct 'comparison_vector' (.json in documents)", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/2_antithesis/documents";
    const filePart = "gpt-4-turbo_0_comparison_vector.json";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.comparison_vector);
    assertEquals(info.modelSlug, 'gpt-4-turbo');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'comparison_vector');
    assertEquals(info.stageSlug, 'antithesis');
  });

  await t.step("should correctly deconstruct 'header_context_pairwise' (.md in _work)", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/3_synthesis/_work";
    const filePart = "gpt-4-turbo_0_header_context_pairwise.md";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.header_context_pairwise);
    assertEquals(info.modelSlug, 'gpt-4-turbo'); // Should not include '_work/'
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'header_context_pairwise');
    assertEquals(info.stageSlug, 'synthesis');
  });

  await t.step("should correctly deconstruct 'synthesis_header_context' (.json in _work/context)", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/3_synthesis/_work/context";
    const filePart = "gpt-4-turbo_0_synthesis_header_context.json";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.SynthesisHeaderContext);
    assertEquals(info.modelSlug, 'gpt-4-turbo');
    assertEquals(info.attemptCount, 0);
    // This file type doesn't have a documentKey in the name, it's implicit.
    assertEquals(info.documentKey, undefined);
    assertEquals(info.stageSlug, 'synthesis');
  });

  await t.step("should correctly deconstruct long documentKey 'system_architecture'", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/3_synthesis/documents";
    const filePart = "gpt-4-turbo_0_system_architecture.md";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.system_architecture);
    assertEquals(info.modelSlug, 'gpt-4-turbo');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'system_architecture');
    assertEquals(info.stageSlug, 'synthesis');
  });

  await t.step("should correctly deconstruct long documentKey 'tech_stack'", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/3_synthesis/documents";
    const filePart = "gpt-4-turbo_0_tech_stack.md";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.tech_stack);
    assertEquals(info.modelSlug, 'gpt-4-turbo');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'tech_stack');
    assertEquals(info.stageSlug, 'synthesis');
  });
});


