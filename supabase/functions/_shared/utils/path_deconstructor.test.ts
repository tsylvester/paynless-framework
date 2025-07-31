import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { deconstructStoragePath, mapDirNameToStageSlug } from './path_deconstructor.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { constructStoragePath, generateShortId, mapStageSlugToDirName, sanitizeForPath } from './path_constructor.ts';
import type { FileType, PathContext } from '../types/file_manager.types.ts';
import type { ContributionType } from '../../dialectic-service/dialectic.interface.ts';
import { isContributionType } from './type_guards.ts';

// --- Direct Deconstruction Tests ---
Deno.test('[path_deconstructor] direct - model_contribution_main', () => {
  const projectId = 'proj-mcm';
  const sessionId = 'sess-mcm-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = 'thesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const modelSlug = 'claude-3-opus';
  const attemptCount = 2;
  const modelSlugSanitized = sanitizeForPath(modelSlug);
  const stageSlugSanitized = sanitizeForPath(stageSlug);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
  const filePart = `${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug); // Verifying stageSlug directly
  assertEquals(info.modelSlug, modelSlugSanitized); 
  assertEquals(info.attemptCount, attemptCount);
  assertEquals(info.parsedFileNameFromPath, `${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}.md`);
  assertEquals(info.fileTypeGuess, 'model_contribution_main');
  assertEquals(info.error, undefined);
});

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

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses`;
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

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
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

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
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

Deno.test('[path_deconstructor] direct - contribution_document', () => {
  const projectId = 'proj-cd';
  const sessionId = 'sess-cd-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 2;
  const stageSlug = 'synthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const originalFileName = 'Detailed Analysis Report.xlsx';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'contribution_document');
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
  const projectId = 'proj-psc';
  const sessionId = 'sess-psc-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = 'synthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const originalFileName = 'pairwise_synthesis_chunk_1_pair_AB.json';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'pairwise_synthesis_chunk');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - reduced_synthesis', () => {
  const projectId = 'proj-rs';
  const sessionId = 'sess-rs-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 2;
  const stageSlug = 'synthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const originalFileName = 'reduced_synthesis_chunk_group_1.json';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'reduced_synthesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - final_synthesis', () => {
  const projectId = 'proj-fs';
  const sessionId = 'sess-fs-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 3;
  const stageSlug = 'synthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const originalFileName = 'final_synthesis_Output.md';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'final_synthesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - rag_context_summary', () => {
  const projectId = 'proj-rcs';
  const sessionId = 'sess-rcs-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const stageSlug = 'synthesis';
  const mappedStageDir = mapStageSlugToDirName(stageSlug);
  const originalFileName = 'rag_summary_for_job_123.txt';
  const sanitizedFileName = sanitizeForPath(originalFileName);

  const dirPart = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/_work`;
  const filePart = sanitizedFileName;
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: dirPart, fileName: filePart, dbOriginalFileName: originalFileName });

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.shortSessionId, shortSessionId);
  assertEquals(info.iteration, iteration);
  assertEquals(info.stageDirName, mappedStageDir);
  assertEquals(info.stageSlug, stageSlug);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'rag_context_summary');
  assertEquals(info.error, undefined);
  assertEquals(info.isWorkInProgress, true);
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
      fileType: 'project_readme',
    },
    checkFields: [],
    expectedFixedFileNameInPath: 'project_readme.md'
  },
  {
    name: 'initial_user_prompt',
    context: {
      projectId: 'yy-iup',
      fileType: 'initial_user_prompt',
      originalFileName: 'My Ideas V1.txt',
    },
    checkFields: [],
    expectedSanitizedFileName: 'my_ideas_v1.txt'
  },
  {
    name: 'project_settings_file',
    context: {
      projectId: 'yy-psf',
      fileType: 'project_settings_file',
    },
    checkFields: [],
    expectedFixedFileNameInPath: 'project_settings.json'
  },
  {
    name: 'general_resource (project root)',
    context: {
      projectId: 'yy-gr',
      fileType: 'general_resource',
      originalFileName: 'Shared Asset.png',
    },
    checkFields: [],
    expectedSanitizedFileName: 'shared_asset.png'
  },
  {
    name: 'seed_prompt',
    context: {
      projectId: 'yy-sp',
      fileType: 'seed_prompt',
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
      fileType: 'user_feedback',
      sessionId: 'session-yy-ufb',
      iteration: 0,
      stageSlug: 'synthesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedFixedFileNameInPath: 'user_feedback_synthesis.md' // constructor sanitizes stageSlug for filename
  },
  {
    name: 'model_contribution_main',
    context: {
      projectId: 'yy-mcm',
      fileType: 'model_contribution_main',
      sessionId: 'session-yy-mcm',
      iteration: 2,
      stageSlug: 'antithesis',
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
      fileType: 'model_contribution_raw_json',
      sessionId: 'session-yy-mcrj',
      iteration: 3,
      stageSlug: 'parenthesis',
      modelSlug: 'GPT-X Alpha',
      attemptCount: 0,
      contributionType: 'antithesis',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount', 'contributionType'],
    expectedFixedFileNameInPath: 'gpt-x_alpha_0_antithesis_raw.json'
  },
  {
    name: 'contribution_document',
    context: {
      projectId: 'yy-cdoc',
      fileType: 'contribution_document',
      sessionId: 'session-yy-cdoc',
      iteration: 1,
      stageSlug: 'paralysis',
      originalFileName: 'Final Output Plan.docx',
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedSanitizedFileName: 'final_output_plan.docx'
  },
  {
    name: 'pairwise_synthesis_chunk',
    context: {
      projectId: 'yy-psc',
      fileType: 'pairwise_synthesis_chunk',
      sessionId: 'session-yy-psc',
      iteration: 0,
      stageSlug: 'synthesis',
      originalFileName: 'pairwise_synthesis_Pair_A_vs_B.json',
      isWorkInProgress: true,
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedSanitizedFileName: 'pairwise_synthesis_pair_a_vs_b.json'
  },
    {
    name: 'reduced_synthesis',
    context: {
      projectId: 'yy-rs',
      fileType: 'reduced_synthesis',
      sessionId: 'session-yy-rs',
      iteration: 1,
      stageSlug: 'synthesis',
      originalFileName: 'reduced_synthesis_Group_1.json',
      isWorkInProgress: true,
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedSanitizedFileName: 'reduced_synthesis_group_1.json'
  },
  {
    name: 'final_synthesis',
    context: {
      projectId: 'yy-fs',
      fileType: 'final_synthesis',
      sessionId: 'session-yy-fs',
      iteration: 2,
      stageSlug: 'synthesis',
      originalFileName: 'final_synthesis_The_Final_Document.md',
      isWorkInProgress: true,
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedSanitizedFileName: 'final_synthesis_the_final_document.md'
  },
  {
    name: 'rag_context_summary',
    context: {
      projectId: 'yy-rcs',
      fileType: 'rag_context_summary',
      sessionId: 'session-yy-rcs',
      iteration: 0,
      stageSlug: 'synthesis',
      originalFileName: 'rag_summary_for_job_xyz.txt',
      isWorkInProgress: true,
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug'],
    expectedSanitizedFileName: 'rag_summary_for_job_xyz.txt'
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
    expectedFileType: 'project_readme',
    expectedContextParts: { originalProjectId: 'old_proj_alpha' },
  },
  {
    name: 'initial_user_prompt',
    samplePath: 'old_proj_beta/my_user_prompt_file.md',
    dbOriginalFileName: 'My User Prompt File.md',
    expectedFileType: 'initial_user_prompt',
    expectedContextParts: { originalProjectId: 'old_proj_beta' },
  },
  {
    name: 'project_settings_file',
    samplePath: 'old_proj_gamma/project_settings.json',
    expectedFileType: 'project_settings_file',
    expectedContextParts: { originalProjectId: 'old_proj_gamma' },
  },
  {
    name: 'general_resource (project root)',
    samplePath: 'old_proj_delta/general_resource/asset_library.zip',
    dbOriginalFileName: 'Asset Library.zip',
    expectedFileType: 'general_resource',
    expectedContextParts: { originalProjectId: 'old_proj_delta' },
  },
  {
    name: 'seed_prompt',
    samplePath: 'proj_epsilon/sessions/sess001/iteration_1/1_thesis/seed_prompt.md',
    expectedFileType: 'seed_prompt',
    expectedContextParts: {
      originalProjectId: 'proj_epsilon',
      shortSessionId: 'sess001',
      iteration: 1,
      stageSlug: 'thesis',
    },
  },
  {
    name: 'user_feedback',
    samplePath: 'proj_zeta/sessions/sess002/iteration_0/2_antithesis/user_feedback_antithesis.md',
    expectedFileType: 'user_feedback',
    expectedContextParts: {
      originalProjectId: 'proj_zeta',
      shortSessionId: 'sess002',
      iteration: 0,
      stageSlug: 'antithesis',
    },
  },
  {
    name: 'model_contribution_main',
    samplePath: 'proj_eta/sessions/sess003/iteration_2/3_synthesis/claude_v1_2_synthesis.md',
    expectedFileType: 'model_contribution_main',
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
    samplePath: 'proj_theta/sessions/sess004/iteration_1/4_parenthesis/raw_responses/gpt_4_turbo_1_parenthesis_raw.json',
    expectedFileType: 'model_contribution_raw_json',
    expectedContextParts: {
      originalProjectId: 'proj_theta',
      shortSessionId: 'sess004',
      iteration: 1,
      stageSlug: 'parenthesis',
      modelSlug: 'gpt_4_turbo', // This should be the sanitized slug from the filename
      attemptCount: 1,
    },
  },
  {
    name: 'contribution_document',
    samplePath: 'proj_iota/sessions/sess005/iteration_0/5_paralysis/documents/final_output.pdf',
    dbOriginalFileName: 'Final Output.pdf',
    expectedFileType: 'contribution_document',
    expectedContextParts: {
      originalProjectId: 'proj_iota',
      shortSessionId: 'sess005',
      iteration: 0,
      stageSlug: 'paralysis',
    },
  },
  {
    name: 'pairwise_synthesis_chunk',
    samplePath: 'proj_kappa/sessions/sess006/iteration_1/3_synthesis/_work/pairwise_synthesis_result.json',
    dbOriginalFileName: 'pairwise_synthesis_Result.json',
    expectedFileType: 'pairwise_synthesis_chunk',
    expectedContextParts: {
      originalProjectId: 'proj_kappa',
      shortSessionId: 'sess006',
      iteration: 1,
      stageSlug: 'synthesis',
    },
  },
    {
    name: 'reduced_synthesis',
    samplePath: 'proj_lambda/sessions/sess007/iteration_2/3_synthesis/_work/reduced_synthesis_output.json',
    dbOriginalFileName: 'reduced_synthesis_Output.json',
    expectedFileType: 'reduced_synthesis',
    expectedContextParts: {
      originalProjectId: 'proj_lambda',
      shortSessionId: 'sess007',
      iteration: 2,
      stageSlug: 'synthesis',
    },
  },
  {
    name: 'final_synthesis',
    samplePath: 'proj_mu/sessions/sess008/iteration_3/3_synthesis/_work/final_synthesis_doc.md',
    dbOriginalFileName: 'final_synthesis_Doc.md',
    expectedFileType: 'final_synthesis',
    expectedContextParts: {
      originalProjectId: 'proj_mu',
      shortSessionId: 'sess008',
      iteration: 3,
      stageSlug: 'synthesis',
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
      isWorkInProgress: deconstructedInfo.isWorkInProgress,
    };
    
    // If the original test case had a dbOriginalFileName (which implies it might be different from parsedFileNameFromPath due to sanitization),
    // prefer that for reconstruction IF the fileType is one that uses originalFileName directly for naming (not fixed names or complex model names)
    if (tc.dbOriginalFileName && (
        reconstructionContext.fileType === 'initial_user_prompt' || 
        reconstructionContext.fileType === 'general_resource' || 
        reconstructionContext.fileType === 'contribution_document')) {
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

