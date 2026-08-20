import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { deconstructStoragePath, mapDirNameToStageSlug } from './path_deconstructor.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { constructStoragePath, generateShortId, mapStageSlugToDirName, sanitizeForPath } from './path_constructor.ts';
import { FileType, PathContext, DialecticStageSlug } from '../types/file_manager.types.ts';
import type { ContributionType } from '../../dialectic-service/dialectic.interface.ts';
import { isContributionType, isFileType } from './type_guards.ts';
import { isDialecticStageSlug } from './type-guards/type_guards.file_manager.ts';
import { buildPathContext } from '../services/file_manager.mock.ts';

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
  const stageSlug = DialecticStageSlug.Antithesis;
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
  const stageSlug = DialecticStageSlug.Parenthesis;
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
  assertEquals(info.documentKey, FileType.UserFeedback);
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
  const context = buildPathContext({
    projectId: 'proj-psc',
    stageSlug: DialecticStageSlug.Synthesis,
    fileType: FileType.PairwiseSynthesisChunk,
    contributionType: 'pairwise_synthesis_chunk',
    sourceAnchorType: 'thesis',
    sourceAnchorModelSlug: 'model-a',
    pairedModelSlug: 'model-b',
  });
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
  const context = buildPathContext({
    projectId: 'proj-rs',
    iteration: 2,
    stageSlug: DialecticStageSlug.Synthesis,
    fileType: FileType.ReducedSynthesis,
    attemptCount: 1,
    contributionType: 'reduced_synthesis',
    sourceAnchorType: 'thesis',
    sourceAnchorModelSlug: 'model-c',
  });
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
  const context = buildPathContext({
    projectId: 'proj-fs',
    iteration: 3,
    stageSlug: DialecticStageSlug.Synthesis,
    fileType: FileType.Synthesis,
    attemptCount: 2,
    contributionType: 'synthesis',
  });
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
  const context = buildPathContext({
    projectId: 'proj-rcs',
    stageSlug: DialecticStageSlug.Synthesis,
    fileType: FileType.RagContextSummary,
    sourceModelSlugs: ['model-a', 'model-b'],
  });
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
  const context = buildPathContext({
    projectId: 'proj-cont',
    iteration: 2,
    stageSlug: DialecticStageSlug.Synthesis,
    fileType: FileType.business_case,
    documentKey: FileType.business_case,
    contributionType: 'synthesis',
    isContinuation: true,
    turnIndex: 2,
  });
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
    context: buildPathContext({
      projectId: 'yy-pr',
      fileType: FileType.ProjectReadme,
    }),
    checkFields: [],
    expectedFixedFileNameInPath: 'project_readme.md'
  },
  {
    name: 'initial_user_prompt',
    context: buildPathContext({
      projectId: 'yy-iup',
      fileType: FileType.InitialUserPrompt,
      originalFileName: 'My Ideas V1.txt',
    }),
    checkFields: [],
    expectedSanitizedFileName: 'my_ideas_v1.txt'
  },
  {
    name: 'project_settings_file',
    context: buildPathContext({
      projectId: 'yy-psf',
      fileType: FileType.ProjectSettingsFile,
    }),
    checkFields: [],
    expectedFixedFileNameInPath: 'project_settings.json'
  },
  {
    name: 'general_resource (project root)',
    context: buildPathContext({
      projectId: 'yy-gr',
      fileType: FileType.GeneralResource,
      originalFileName: 'Shared Asset.png',
    }),
    checkFields: [],
    expectedSanitizedFileName: 'shared_asset.png'
  },
  {
    name: 'seed_prompt',
    context: buildPathContext({
      projectId: 'yy-sp',
      fileType: FileType.SeedPrompt,
      sessionId: 'session-yy-sp',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'seed_prompt.md'
  },
  {
    name: 'user_feedback',
    context: buildPathContext({
      projectId: 'yy-ufb',
      fileType: FileType.UserFeedback,
      sessionId: 'session-yy-ufb',
      iteration: 0,
      stageSlug: DialecticStageSlug.Synthesis,
      originalStoragePath: `yy-ufb/session_${generateShortId('session-yy-ufb')}/iteration_0/3_synthesis/documents`,
      originalBaseName: 'doc_synthesis',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'doc_synthesis_feedback.md',
  },
  {
    name: 'synthesis',
    context: buildPathContext({
      projectId: 'yy-mcm',
      fileType: FileType.Synthesis,
      sessionId: 'session-yy-mcm',
      iteration: 2,
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'Claude Model 2',
      attemptCount: 1,
      contributionType: 'synthesis',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount', 'contributionType'],
    expectedFixedFileNameInPath: 'claude_model_2_1_synthesis.md'
  },
  {
    name: 'model_contribution_raw_json',
    context: buildPathContext({
      projectId: 'yy-mcrj',
      fileType: FileType.ModelContributionRawJson,
      sessionId: 'session-yy-mcrj',
      iteration: 3,
      stageSlug: DialecticStageSlug.Parenthesis,
      modelSlug: 'GPT-X Alpha',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'gpt-x_alpha_0_business_case_raw.json'
  },
  {
    name: 'pairwise_synthesis_chunk',
    context: buildPathContext({
      projectId: 'yy-psc',
      fileType: FileType.PairwiseSynthesisChunk,
      sessionId: 'session-yy-psc',
      iteration: 0,
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'gpt-4-turbo',
      contributionType: 'pairwise_synthesis_chunk',
      sourceAnchorType: 'thesis',
      sourceAnchorModelSlug: 'model-a',
      pairedModelSlug: 'model-b',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'gpt-4-turbo_synthesizing_model-a_with_model-b_on_thesis_0_pairwise_synthesis_chunk.md'
  },
    {
    name: 'reduced_synthesis',
    context: buildPathContext({
      projectId: 'yy-rs',
      fileType: FileType.ReducedSynthesis,
      sessionId: 'session-yy-rs',
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'claude-3-opus',
      attemptCount: 1,
      contributionType: 'reduced_synthesis',
      sourceAnchorType: 'thesis',
      sourceAnchorModelSlug: 'model-a',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'claude-3-opus_reducing_thesis_by_model-a_1_reduced_synthesis.md'
  },
  {
    name: 'synthesis (from final)',
    context: buildPathContext({
      projectId: 'yy-fs',
      fileType: FileType.Synthesis,
      sessionId: 'session-yy-fs',
      iteration: 2,
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'gemini-1.5-pro',
      contributionType: 'synthesis',
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'gemini-1.5-pro_0_synthesis.md'
  },
  {
    name: 'rag_context_summary',
    context: buildPathContext({
      projectId: 'yy-rcs',
      fileType: FileType.RagContextSummary,
      sessionId: 'session-yy-rcs',
      iteration: 0,
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'text-embedder',
      sourceModelSlugs: ['model-a', 'model-b'],
    }),
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'text-embedder_compressing_model-a_and_model-b_rag_summary.txt'
  },
  {
    name: 'PendingFile',
    context: buildPathContext({ projectId: 'yy-pf', fileType: FileType.PendingFile, originalFileName: 'task-1.md' }),
    checkFields: [],
    expectedSanitizedFileName: 'task-1.md',
  },
  {
    name: 'CurrentFile',
    context: buildPathContext({ projectId: 'yy-cf', fileType: FileType.CurrentFile, originalFileName: 'task-2.md' }),
    checkFields: [],
    expectedSanitizedFileName: 'task-2.md',
  },
  {
    name: 'CompleteFile',
    context: buildPathContext({ projectId: 'yy-cpf', fileType: FileType.CompleteFile, originalFileName: 'task-3.md' }),
    checkFields: [],
    expectedSanitizedFileName: 'task-3.md',
  },
  {
    name: 'SynthesisHeaderContext',
    context: buildPathContext({ projectId: 'yy-shc', fileType: FileType.SynthesisHeaderContext, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm' }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_header_context.json',
  },
  {
    name: 'product_requirements',
    context: buildPathContext({ projectId: 'yy-product_requirements', fileType: FileType.product_requirements, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm', documentKey: FileType.product_requirements }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_product_requirements.md',
  },
  {
    name: 'system_architecture',
    context: buildPathContext({ projectId: 'yy-sa', fileType: FileType.system_architecture, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm', documentKey: FileType.system_architecture }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_system_architecture.md',
  },
  {
    name: 'tech_stack',
    context: buildPathContext({ projectId: 'yy-sts', fileType: FileType.tech_stack, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm', documentKey: FileType.tech_stack }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_tech_stack.md',
  },
  {
    name: 'synthesis_pairwise_business_case',
    context: buildPathContext({ projectId: 'yy-spbc', fileType: FileType.synthesis_pairwise_business_case, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm', documentKey: FileType.synthesis_pairwise_business_case }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_pairwise_business_case.json',
  },
  {
    name: 'synthesis_document_business_case',
    context: buildPathContext({ projectId: 'yy-sdbc', fileType: FileType.synthesis_document_business_case, sessionId: 's', stageSlug: DialecticStageSlug.Synthesis, modelSlug: 'm', documentKey: FileType.synthesis_document_business_case }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_synthesis_document_business_case.json',
  },
  {
    name: 'technical_requirements',
    context: buildPathContext({ projectId: 'yy-technical_requirements', fileType: FileType.technical_requirements, sessionId: 's', stageSlug: DialecticStageSlug.Parenthesis, modelSlug: 'm', documentKey: FileType.technical_requirements }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_technical_requirements.md',
  },
  {
    name: 'milestone_schema',
    context: buildPathContext({ projectId: 'yy-ms', fileType: FileType.milestone_schema, sessionId: 's', stageSlug: DialecticStageSlug.Parenthesis, modelSlug: 'm', documentKey: FileType.milestone_schema }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_milestone_schema.md',
  },
  {
    name: 'master_plan (stage-level)',
    context: buildPathContext({ projectId: 'yy-mp', fileType: FileType.master_plan, sessionId: 's', stageSlug: DialecticStageSlug.Parenthesis, modelSlug: 'm', documentKey: FileType.master_plan }),
    checkFields: ['shortSessionId', 'iteration', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'm_0_master_plan.md',
  },
  {
    name: 'advisor_recommendations',
    context: buildPathContext({ projectId: 'yy-ar', fileType: FileType.advisor_recommendations, sessionId: 's', stageSlug: DialecticStageSlug.Paralysis, modelSlug: 'm', documentKey: FileType.advisor_recommendations }),
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
      stageSlug: DialecticStageSlug.Thesis,
    },
  },
  {
    name: 'user_feedback',
    samplePath: 'proj_zeta/session_sess002/iteration_0/2_antithesis/documents/doc_antithesis_feedback.md',
    expectedFileType: FileType.UserFeedback,
    expectedContextParts: {
      originalProjectId: 'proj_zeta',
      shortSessionId: 'sess002',
      iteration: 0,
      stageSlug: DialecticStageSlug.Antithesis,
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
      stageSlug: DialecticStageSlug.Synthesis,
      modelSlug: 'claude_v1', // This should be the sanitized slug from the filename
      attemptCount: 2,
    },
  },
  {
    name: 'model_contribution_raw_json',
    samplePath: 'proj_theta/session_sess004/iteration_1/4_parenthesis/raw_responses/gpt_4_turbo_1_business_case_raw.json',
    expectedFileType: FileType.ModelContributionRawJson,
    expectedContextParts: {
      originalProjectId: 'proj_theta',
      shortSessionId: 'sess004',
      iteration: 1,
      stageSlug: DialecticStageSlug.Parenthesis,
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

    const reconstructionContext = buildPathContext({
      projectId: newProjectId, // Use a new project ID for reconstruction
      fileType: deconstructedInfo.fileTypeGuess!,
      originalFileName: deconstructedInfo.parsedFileNameFromPath, // Use parsed filename for general cases
      sessionId: deconstructedInfo.shortSessionId ? newFullSessionId : undefined,
      iteration: deconstructedInfo.iteration,
      stageSlug: isDialecticStageSlug(deconstructedInfo.stageSlug) ? deconstructedInfo.stageSlug : undefined,
      // modelSlug and attemptCount are tricky, as they are part of the deconstructed filename for contributions
      // For reconstruction, path_constructor derives them if fileType is model_contribution_*
      // For other types, originalFileName is primary.
      modelSlug: deconstructedInfo.modelSlug,
      attemptCount: deconstructedInfo.attemptCount,
      contributionType: deconstructedInfo.contributionType && isContributionType(deconstructedInfo.contributionType) ? deconstructedInfo.contributionType : null,
    });
    
    // If the original test case had a dbOriginalFileName (which implies it might be different from parsedFileNameFromPath due to sanitization),
    // prefer that for reconstruction IF the fileType is one that uses originalFileName directly for naming (not fixed names or complex model names)
    if (tc.dbOriginalFileName && (
        reconstructionContext.fileType === FileType.InitialUserPrompt || 
        reconstructionContext.fileType === FileType.GeneralResource)) {
      reconstructionContext.originalFileName = tc.dbOriginalFileName;
    }

    if (reconstructionContext.fileType === FileType.UserFeedback) {
      reconstructionContext.originalStoragePath = dirPart
        .replace(tc.expectedContextParts.originalProjectId!, newProjectId)
        .replace(tc.expectedContextParts.shortSessionId!, generateShortId(newFullSessionId));
      reconstructionContext.originalBaseName = (deconstructedInfo.parsedFileNameFromPath ?? '').replace(/_feedback\.md$/, '');
    }

    const reconstructedPath = constructStoragePath(reconstructionContext);

    const originalFullPath = `${dirPart}/${filePart}`;
    const reconstructedFullPath = `${reconstructedPath.storagePath}/${reconstructedPath.fileName}`;
    
    // Replace variable parts for a structural comparison
    const originalComparable = originalFullPath
        .replace(tc.expectedContextParts.originalProjectId!, 'PROJECT_ID')
    const reconstructedComparable = reconstructedFullPath.replace(reconstructionContext.projectId, 'PROJECT_ID');

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

  const testCases: { name: string; context: PathContext; checkFields: Array<keyof DeconstructedPathInfo> }[] = [
    {
      name: 'PlannerPrompt',
      context: buildPathContext({ fileType: FileType.PlannerPrompt, stepName: 'generate_core_components' }),
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'stepName'],
    },
    {
      name: 'TurnPrompt (initial)',
      context: buildPathContext({ fileType: FileType.TurnPrompt, documentKey: FileType.technical_approach }),
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'documentKey'],
    },
    {
      name: 'TurnPrompt (continuation)',
      context: buildPathContext({ fileType: FileType.TurnPrompt, documentKey: FileType.technical_approach, isContinuation: true, turnIndex: 2 }),
      checkFields: ['fileTypeGuess', 'documentKey', 'isContinuation', 'turnIndex'],
    },
    {
      name: 'HeaderContext',
      context: buildPathContext({ fileType: FileType.HeaderContext, documentKey: FileType.HeaderContext }),
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'documentKey'],
    },
    {
      name: 'HeaderContext with header_context_pairwise documentKey',
      context: buildPathContext({ fileType: FileType.HeaderContext, documentKey: FileType.header_context_pairwise }),
      checkFields: ['fileTypeGuess', 'modelSlug', 'attemptCount', 'documentKey'],
    },
    {
      name: 'AssembledDocumentJson',
      context: buildPathContext({ fileType: FileType.AssembledDocumentJson, documentKey: FileType.technical_approach }),
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'AssembledDocumentJson with synthesis_pairwise documentKey uses pairwise pattern',
      context: buildPathContext({
        fileType: FileType.AssembledDocumentJson,
        stageSlug: DialecticStageSlug.Synthesis,
        sourceAnchorType: 'thesis',
        sourceAnchorModelSlug: 'claude-3-opus',
        pairedModelSlug: 'gemini-1.5-pro',
        documentKey: FileType.synthesis_pairwise_technical_approach,
      }),
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount', 'sourceAnchorModelSlug', 'pairedModelSlug', 'sourceAnchorType'],
    },
    {
      name: 'RenderedDocument',
      context: buildPathContext({ fileType: FileType.technical_approach, documentKey: FileType.technical_approach }),
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'ModelContributionRawJson (doc-specific)',
      context: buildPathContext({ fileType: FileType.ModelContributionRawJson, documentKey: FileType.technical_approach }),
      checkFields: ['fileTypeGuess', 'documentKey', 'modelSlug', 'attemptCount'],
    },
    {
      name: 'ModelContributionRawJson (doc-specific, continuation)',
      context: buildPathContext({ fileType: FileType.ModelContributionRawJson, documentKey: FileType.technical_approach, isContinuation: true, turnIndex: 3 }),
      checkFields: ['fileTypeGuess', 'documentKey', 'isContinuation', 'turnIndex'],
    },
  ];

  for (const tc of testCases) {
    await t.step(tc.name, () => {
      const { storagePath, fileName } = constructStoragePath(tc.context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
      assertEquals(info.originalProjectId, tc.context.projectId);
      assertEquals(info.shortSessionId, generateShortId(tc.context.sessionId!));
      assertEquals(info.iteration, tc.context.iteration);
      assertEquals(info.stageSlug, tc.context.stageSlug);

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
          case 'sourceAnchorModelSlug':
          case 'pairedModelSlug':
          case 'sourceAnchorType':
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

  await t.step("should correctly deconstruct antithesis with document key", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/2_antithesis";
    const filePart = "gemini-1.5-pro_critiquing_(claude-3-opus's_thesis_1)_0_business_case_critique.md";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.business_case_critique);
    assertEquals(info.modelSlug, 'gemini-1.5-pro');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'business_case_critique');
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.sourceModelSlug, 'claude-3-opus');
    assertEquals(info.sourceContributionType, 'thesis');
    assertEquals(info.sourceAttemptCount, 1);
  });

  await t.step("ModelContributionRawJson with simple critiquing pattern should extract sourceAnchorModelSlug", () => {
    const dirPart = "project-uuid-123/session_sessionu/iteration_1/2_antithesis/raw_responses";
    const filePart = "claude-3-opus_critiquing_gpt-4_98765432_0_business_case_raw.json";
    const info = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.ModelContributionRawJson);
    assertEquals(info.modelSlug, 'claude-3-opus');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.documentKey, 'business_case');
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(
      info.sourceAnchorModelSlug,
      'gpt-4',
      'deconstructStoragePath should extract sourceAnchorModelSlug from simple critiquing pattern for ModelContributionRawJson'
    );
    assertEquals(
      info.sourceGroupFragment,
      '98765432',
      'deconstructStoragePath should extract sourceGroupFragment from simple critiquing pattern for ModelContributionRawJson'
    );
  });
});

Deno.test('[path_deconstructor] extracts documentKey for header_context JSON-only artifact', () => {
  const projectId = 'proj-header-ctx';
  const sessionId = 'sess-header-ctx-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = DialecticStageSlug.Thesis;
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const modelSlug = 'mock-model';
  const attemptCount = 0;
  const modelSlugSanitized = sanitizeForPath(modelSlug);

  const storageDir = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
  const fileName = `${modelSlugSanitized}_${attemptCount}_header_context_raw.json`;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });

  assertEquals(info.documentKey, 'header_context');
  assertEquals(info.modelSlug, modelSlugSanitized);
  assertEquals(info.attemptCount, attemptCount);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] extracts documentKey for synthesis_header_context JSON-only artifact', () => {
  const projectId = 'proj-synth-header-ctx';
  const sessionId = 'sess-synth-header-ctx-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = DialecticStageSlug.Synthesis;
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const modelSlug = 'mock-model';
  const attemptCount = 0;
  const modelSlugSanitized = sanitizeForPath(modelSlug);

  const storageDir = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
  const fileName = `${modelSlugSanitized}_${attemptCount}_synthesis_header_context_raw.json`;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });

  assertEquals(info.documentKey, 'synthesis_header_context');
  assertEquals(info.modelSlug, modelSlugSanitized);
  assertEquals(info.attemptCount, attemptCount);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] extracts documentKey for other JSON-only artifacts with underscores', () => {
  const projectId = 'proj-json-artifacts';
  const sessionId = 'sess-json-artifacts-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = DialecticStageSlug.Thesis;
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const modelSlug = 'mock-model';
  const attemptCount = 0;
  const modelSlugSanitized = sanitizeForPath(modelSlug);

  const testCases = [
    { documentKey: 'custom_json_artifact', description: 'custom_json_artifact' },
    { documentKey: 'another_json_type', description: 'another_json_type' },
  ];

  for (const testCase of testCases) {
    const storageDir = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
    const fileName = `${modelSlugSanitized}_${attemptCount}_${testCase.documentKey}_raw.json`;
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });

    assertEquals(info.documentKey, testCase.documentKey, `documentKey mismatch for ${testCase.description}`);
    assertEquals(info.modelSlug, modelSlugSanitized, `modelSlug mismatch for ${testCase.description}`);
    assertEquals(info.attemptCount, attemptCount, `attemptCount mismatch for ${testCase.description}`);
    assertEquals(info.stageSlug, stageSlug, `stageSlug mismatch for ${testCase.description}`);
    assertEquals(info.originalProjectId, projectId, `originalProjectId mismatch for ${testCase.description}`);
    assertEquals(info.shortSessionId, shortSessionId, `shortSessionId mismatch for ${testCase.description}`);
    assertEquals(info.iteration, iteration, `iteration mismatch for ${testCase.description}`);
    assertEquals(info.stageDirName, mappedStageDir, `stageDirName mismatch for ${testCase.description}`);
    assertEquals(info.error, undefined, `error should be undefined for ${testCase.description}`);
  }
});

Deno.test('[path_deconstructor] direct - user_feedback alongside original document', () => {
  const projectId = 'proj-uf-doc';
  const sessionId = 'sess-uf-doc-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = DialecticStageSlug.Antithesis;
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const storageDir = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents`;
  const originalBaseName = 'doc_antithesis';
  const filePart = `${originalBaseName}_feedback.md`;

  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, filePart);
  assertEquals(info.fileTypeGuess, FileType.UserFeedback);
  assertEquals(info.documentKey, FileType.UserFeedback);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - compressed_context round-trips', async (t) => {
  const projectId = 'proj-cc';
  const sessionId = 'sess-cc-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 2;
  const stageSlug = DialecticStageSlug.Synthesis;
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const output_type = FileType.business_case;
  const output_typeSanitized = sanitizeForPath(output_type);
  const baseDir = `${projectId}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work`;

  await t.step('round-trips documentKey-sourced final artifact', () => {
    const documentKey = FileType.feature_spec;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'contribution', documentKey,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.documentKey, sanitizeForPath(documentKey));
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContext);
    assertEquals(info.sourceType, 'resource');
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
  });

  await t.step('round-trips sourceId-sourced final artifact', () => {
    const sourceId = '550e8400-e29b-41d4-a716-446655440000';
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'history', sourceId, role: 'assistant',
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.sourceType, 'history');
    assertEquals(info.sourceId, sourceId);
    assertEquals(info.role, 'assistant');
    assertEquals(info.documentKey, undefined);
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContext);
    assertEquals(info.parsedFileNameFromPath, `message_assistant_${sourceId}_compressed_for_${output_typeSanitized}.md`);
  });

  await t.step('round-trips chunked documentKey-sourced artifact', () => {
    const documentKey = FileType.feature_spec;
    const chunkIndex = 1;
    const chunkTotal = 3;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'contribution', documentKey, chunkIndex, chunkTotal,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.documentKey, sanitizeForPath(documentKey));
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, chunkIndex);
    assertEquals(info.chunkTotal, chunkTotal);
    assertEquals(info.fileTypeGuess, FileType.CompressedContext);
    assertEquals(info.parsedFileNameFromPath, `${sanitizeForPath(documentKey)}_compressed_for_${output_typeSanitized}_chunk_${chunkIndex}of${chunkTotal}.md`);
    assertEquals(info.sourceType, 'resource');
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
  });

  await t.step('round-trips documentKey-sourced raw JSON artifact', () => {
    const documentKey = FileType.feature_spec;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContextRawJson,
      output_type, sourceType: 'contribution', documentKey,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.documentKey, sanitizeForPath(documentKey));
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContextRawJson);
    assertEquals(info.sourceType, 'resource');
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
  });

  await t.step('round-trips sourceId-sourced raw JSON artifact', () => {
    const sourceId = '550e8400-e29b-41d4-a716-446655440000';
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContextRawJson,
      output_type, sourceType: 'history', sourceId, role: 'assistant',
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.sourceType, 'history');
    assertEquals(info.sourceId, sourceId);
    assertEquals(info.role, 'assistant');
    assertEquals(info.documentKey, undefined);
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContextRawJson);
    assertEquals(info.parsedFileNameFromPath, `message_assistant_${sourceId}_compressed_for_${output_typeSanitized}_raw.json`);
  });

  await t.step('round-trips chunked documentKey-sourced raw JSON artifact', () => {
    const documentKey = FileType.feature_spec;
    const chunkIndex = 1;
    const chunkTotal = 3;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContextRawJson,
      output_type, sourceType: 'contribution', documentKey, chunkIndex, chunkTotal,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.documentKey, sanitizeForPath(documentKey));
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, chunkIndex);
    assertEquals(info.chunkTotal, chunkTotal);
    assertEquals(info.fileTypeGuess, FileType.CompressedContextRawJson);
    assertEquals(info.parsedFileNameFromPath, `${sanitizeForPath(documentKey)}_compressed_for_${output_typeSanitized}_chunk_${chunkIndex}of${chunkTotal}_raw.json`);
    assertEquals(info.sourceType, 'resource');
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
  });

  await t.step('round-trips a feedback-sourced final artifact', () => {
    const documentKey = FileType.business_case_critique;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'feedback', documentKey,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.sourceType, 'feedback');
    assertEquals(info.documentKey, documentKey);
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContext);
    assertEquals(info.parsedFileNameFromPath, `${documentKey}_feedback_compressed_for_${output_typeSanitized}.md`);
  });

  await t.step('round-trips a feedback-sourced raw JSON artifact', () => {
    const documentKey = FileType.business_case_critique;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContextRawJson,
      output_type, sourceType: 'feedback', documentKey,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.sourceType, 'feedback');
    assertEquals(info.documentKey, documentKey);
    assertEquals(info.sourceId, undefined);
    assertEquals(info.role, undefined);
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, undefined);
    assertEquals(info.chunkTotal, undefined);
    assertEquals(info.fileTypeGuess, FileType.CompressedContextRawJson);
    assertEquals(info.parsedFileNameFromPath, `${documentKey}_feedback_compressed_for_${output_typeSanitized}_raw.json`);
  });

  await t.step('round-trips a chunked history-sourced artifact', () => {
    const sourceId = '550e8400-e29b-41d4-a716-446655440000';
    const chunkIndex = 2;
    const chunkTotal = 3;
    const context = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'history', sourceId, role: 'user', chunkIndex, chunkTotal,
    });
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined, `Deconstruction failed with error: ${info.error}`);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, shortSessionId);
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageDirName, mappedStageDir);
    assertEquals(info.stageSlug, stageSlug);
    assertEquals(info.sourceType, 'history');
    assertEquals(info.sourceId, sourceId);
    assertEquals(info.role, 'user');
    assertEquals(info.documentKey, undefined);
    assertEquals(info.output_type, output_typeSanitized);
    assertEquals(info.chunkIndex, chunkIndex);
    assertEquals(info.chunkTotal, chunkTotal);
    assertEquals(info.fileTypeGuess, FileType.CompressedContext);
  });

  await t.step('a document and its own feedback deconstruct to distinct identities', () => {
    const documentKey = FileType.business_case_critique;
    const resourceContext = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'resource', documentKey,
    });
    const feedbackContext = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'feedback', documentKey,
    });
    const resourceResult = constructStoragePath(resourceContext);
    const feedbackResult = constructStoragePath(feedbackContext);
    const resourceInfo = deconstructStoragePath({ storageDir: resourceResult.storagePath, fileName: resourceResult.fileName });
    const feedbackInfo = deconstructStoragePath({ storageDir: feedbackResult.storagePath, fileName: feedbackResult.fileName });

    assertEquals(resourceInfo.error, undefined);
    assertEquals(feedbackInfo.error, undefined);
    assertEquals(resourceInfo.sourceType, 'resource');
    assertEquals(feedbackInfo.sourceType, 'feedback');
    assertEquals(resourceInfo.documentKey, documentKey);
    assertEquals(feedbackInfo.documentKey, documentKey);
  });

  await t.step('round-trips a compression prompt of each source form', () => {
    const promptModelSlug = 'gpt-4o';
    const promptModelSlugSanitized = sanitizeForPath(promptModelSlug);
    const promptDocumentKey = FileType.feature_spec;
    const promptFeedbackDocumentKey = FileType.business_case_critique;
    const promptSourceId = '550e8400-e29b-41d4-a716-446655440000';

    // Resource form
    {
      const context = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: FileType.CompressionPrompt,
        output_type, sourceType: 'resource', documentKey: promptDocumentKey,
        modelSlug: promptModelSlug,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for compression prompt resource form`);
      assertEquals(info.fileTypeGuess, FileType.CompressionPrompt);
      assertEquals(info.modelSlug, promptModelSlugSanitized);
      assertEquals(info.attemptCount, 0);
      assertEquals(info.output_type, output_typeSanitized);
      assertEquals(info.sourceType, 'resource');
      assertEquals(info.documentKey, sanitizeForPath(promptDocumentKey));
      assertEquals(info.sourceId, undefined);
      assertEquals(info.role, undefined);
      assertEquals(info.chunkIndex, undefined);
      assertEquals(info.chunkTotal, undefined);
      assertEquals(info.isContinuation, undefined);
      assertEquals(info.turnIndex, undefined);
    }

    // Feedback form
    {
      const context = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: FileType.CompressionPrompt,
        output_type, sourceType: 'feedback', documentKey: promptFeedbackDocumentKey,
        modelSlug: promptModelSlug,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for compression prompt feedback form`);
      assertEquals(info.fileTypeGuess, FileType.CompressionPrompt);
      assertEquals(info.modelSlug, promptModelSlugSanitized);
      assertEquals(info.attemptCount, 0);
      assertEquals(info.output_type, output_typeSanitized);
      assertEquals(info.sourceType, 'feedback');
      assertEquals(info.documentKey, promptFeedbackDocumentKey);
      assertEquals(info.sourceId, undefined);
      assertEquals(info.role, undefined);
      assertEquals(info.chunkIndex, undefined);
      assertEquals(info.chunkTotal, undefined);
      assertEquals(info.isContinuation, undefined);
      assertEquals(info.turnIndex, undefined);
    }

    // History form
    {
      const context = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: FileType.CompressionPrompt,
        output_type, sourceType: 'history', sourceId: promptSourceId, role: 'assistant',
        modelSlug: promptModelSlug,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for compression prompt history form`);
      assertEquals(info.fileTypeGuess, FileType.CompressionPrompt);
      assertEquals(info.modelSlug, promptModelSlugSanitized);
      assertEquals(info.attemptCount, 0);
      assertEquals(info.output_type, output_typeSanitized);
      assertEquals(info.sourceType, 'history');
      assertEquals(info.sourceId, promptSourceId);
      assertEquals(info.role, 'assistant');
      assertEquals(info.documentKey, undefined);
      assertEquals(info.chunkIndex, undefined);
      assertEquals(info.chunkTotal, undefined);
      assertEquals(info.isContinuation, undefined);
      assertEquals(info.turnIndex, undefined);
    }

    // Chunked resource variant
    {
      const context = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: FileType.CompressionPrompt,
        output_type, sourceType: 'resource', documentKey: promptDocumentKey,
        modelSlug: promptModelSlug, chunkIndex: 1, chunkTotal: 3,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for compression prompt chunked resource variant`);
      assertEquals(info.fileTypeGuess, FileType.CompressionPrompt);
      assertEquals(info.modelSlug, promptModelSlugSanitized);
      assertEquals(info.attemptCount, 0);
      assertEquals(info.output_type, output_typeSanitized);
      assertEquals(info.sourceType, 'resource');
      assertEquals(info.documentKey, sanitizeForPath(promptDocumentKey));
      assertEquals(info.sourceId, undefined);
      assertEquals(info.role, undefined);
      assertEquals(info.chunkIndex, 1);
      assertEquals(info.chunkTotal, 3);
      assertEquals(info.isContinuation, undefined);
      assertEquals(info.turnIndex, undefined);
    }

    // Continuation history variant
    {
      const context = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: FileType.CompressionPrompt,
        output_type, sourceType: 'history', sourceId: promptSourceId, role: 'assistant',
        modelSlug: promptModelSlug, isContinuation: true, turnIndex: 2,
      });
      const { storagePath, fileName } = constructStoragePath(context);
      const info = deconstructStoragePath({ storageDir: storagePath, fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for compression prompt continuation history variant`);
      assertEquals(info.fileTypeGuess, FileType.CompressionPrompt);
      assertEquals(info.modelSlug, promptModelSlugSanitized);
      assertEquals(info.attemptCount, 0);
      assertEquals(info.output_type, output_typeSanitized);
      assertEquals(info.sourceType, 'history');
      assertEquals(info.sourceId, promptSourceId);
      assertEquals(info.role, 'assistant');
      assertEquals(info.documentKey, undefined);
      assertEquals(info.chunkIndex, undefined);
      assertEquals(info.chunkTotal, undefined);
      assertEquals(info.isContinuation, true);
      assertEquals(info.turnIndex, 2);
    }
  });

  await t.step('a compression prompt is not mistaken for a turn prompt or an artifact', () => {
    const promptModelSlug = 'gpt-4o';
    const promptDocumentKey = FileType.feature_spec;

    // Deconstruct a compression prompt path and prove it is not misread
    const promptContext = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressionPrompt,
      output_type, sourceType: 'resource', documentKey: promptDocumentKey,
      modelSlug: promptModelSlug,
    });
    const promptResult = constructStoragePath(promptContext);
    const promptInfo = deconstructStoragePath({ storageDir: promptResult.storagePath, fileName: promptResult.fileName });

    assertEquals(promptInfo.error, undefined);
    assertEquals(promptInfo.fileTypeGuess, FileType.CompressionPrompt);
    assertEquals(promptInfo.documentKey?.includes('_compressed_for_'), false);
    assertEquals(promptInfo.output_type?.endsWith('_prompt'), false);

    // A real turn prompt still deconstructs as a turn prompt
    const turnPromptContext = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.TurnPrompt,
      modelSlug: promptModelSlug, documentKey: promptDocumentKey,
    });
    const turnPromptResult = constructStoragePath(turnPromptContext);
    const turnPromptInfo = deconstructStoragePath({ storageDir: turnPromptResult.storagePath, fileName: turnPromptResult.fileName });

    assertEquals(turnPromptInfo.error, undefined);
    assertEquals(turnPromptInfo.fileTypeGuess, FileType.TurnPrompt);

    // A real compressed artifact still deconstructs as a compressed artifact
    const compressedContext = buildPathContext({
      projectId, sessionId, iteration, stageSlug,
      fileType: FileType.CompressedContext,
      output_type, sourceType: 'resource', documentKey: promptDocumentKey,
    });
    const compressedResult = constructStoragePath(compressedContext);
    const compressedInfo = deconstructStoragePath({ storageDir: compressedResult.storagePath, fileName: compressedResult.fileName });

    assertEquals(compressedInfo.error, undefined);
    assertEquals(compressedInfo.fileTypeGuess, FileType.CompressedContext);
  });

  await t.step('every source form reconstructs to the identical path', () => {
    const documentKey = FileType.feature_spec;
    const feedbackDocumentKey = FileType.business_case_critique;
    const sourceId = '550e8400-e29b-41d4-a716-446655440000';
    const chunkIndex = 2;
    const chunkTotal = 3;

    const contexts: PathContext[] = [
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContext, output_type, sourceType: 'resource', documentKey }),
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContext, output_type, sourceType: 'feedback', documentKey: feedbackDocumentKey }),
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContext, output_type, sourceType: 'history', sourceId, role: 'assistant' }),
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'resource', documentKey }),
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContextRawJson, output_type, sourceType: 'feedback', documentKey: feedbackDocumentKey }),
      buildPathContext({ projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContext, output_type, sourceType: 'history', sourceId, role: 'user', chunkIndex, chunkTotal }),
    ];

    for (const ctx of contexts) {
      const first = constructStoragePath(ctx);
      const info = deconstructStoragePath({ storageDir: first.storagePath, fileName: first.fileName });

      assertEquals(info.error, undefined, `Deconstruction failed for ${ctx.sourceType}/${ctx.fileType}`);

      const rebuilt = buildPathContext({
        projectId, sessionId, iteration, stageSlug,
        fileType: info.fileTypeGuess!,
        output_type: isFileType(info.output_type) ? info.output_type : undefined,
        sourceType: info.sourceType,
        documentKey: isFileType(info.documentKey) ? info.documentKey : undefined,
        sourceId: info.sourceId,
        role: info.role,
        chunkIndex: info.chunkIndex,
        chunkTotal: info.chunkTotal,
      });

      const second = constructStoragePath(rebuilt);
      assertEquals(second.storagePath, first.storagePath, `storagePath mismatch for ${ctx.sourceType}/${ctx.fileType}`);
      assertEquals(second.fileName, first.fileName, `fileName mismatch for ${ctx.sourceType}/${ctx.fileType}`);
    }
  });
});

