import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { deconstructStoragePath, mapDirNameToStageSlug } from './path_deconstructor.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { constructStoragePath, generateShortId, mapStageSlugToDirName, sanitizeForPath } from './path_constructor.ts';
import type { FileType, PathContext } from '../types/file_manager.types.ts';

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

  const storagePath = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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
  const storagePath = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses/${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}_raw.json`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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

  const storagePath = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/seed_prompt.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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
  const storagePath = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/user_feedback_${stageSlugSanitized}.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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
  const storagePath = `${projectId}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents/${sanitizedFileName}`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath, originalFileName);

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
  const storagePath = `${projectId}/project_readme.md`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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
  const storagePath = `${projectId}/project_settings.json`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, 'project_settings.json');
  assertEquals(info.fileTypeGuess, 'project_settings_file');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - general_resource (project root)', () => {
  const projectId = 'gen-res-proj';
  const originalFileName = 'Company Branding Guide.pdf';
  const sanitizedFileName = sanitizeForPath(originalFileName);
  const storagePath = `${projectId}/general_resource/${sanitizedFileName}`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath, originalFileName);

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'general_resource');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] direct - initial_user_prompt', () => {
  const projectId = 'init-prompt-proj';
  const originalFileName = 'My Project Idea - Draft 1.md';
  const sanitizedFileName = sanitizeForPath(originalFileName);
  const storagePath = `${projectId}/${sanitizedFileName}`;
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath, originalFileName);

  assertEquals(info.originalProjectId, projectId);
  assertEquals(info.parsedFileNameFromPath, sanitizedFileName);
  assertEquals(info.fileTypeGuess, 'initial_user_prompt');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor] handles unknown path structure gracefully', () => {
  const storagePath = 'some/completely/unknown/path/structure/file.txt';
  const info: DeconstructedPathInfo = deconstructStoragePath(storagePath);

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
  checkFields: Array<keyof Pick<PathContext, 'sessionId' | 'iteration' | 'stageSlug' | 'modelSlug' | 'attemptCount'> | 'shortSessionId' | 'stageDirName'>;
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
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'claude_model_2_1_antithesis.md'
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
    },
    checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug', 'modelSlug', 'attemptCount'],
    expectedFixedFileNameInPath: 'gpt-x_alpha_0_parenthesis_raw.json'
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
];

constructDeconstructTestCases.forEach((tc) => {
  Deno.test(`[path_deconstructor_inverse C->D] ${tc.name}`, () => {
    const constructedPath = constructStoragePath(tc.context);
    const deconstructedInfo = deconstructStoragePath(constructedPath, tc.context.originalFileName);

    assertEquals(deconstructedInfo.error, undefined, `Deconstruction failed for ${constructedPath} (type: ${tc.context.fileType})`);
    assertEquals(deconstructedInfo.originalProjectId, tc.context.projectId, "Project ID mismatch");
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
      } else if (field === 'stageSlug' || field === 'iteration' || field === 'attemptCount') {
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
  expectedContextParts: Partial<Pick<PathContext, 'iteration' | 'stageSlug' | 'modelSlug' | 'attemptCount'> & { stageDirName?: string, shortSessionId?: string }>;
}

const deconstructReconstructTestCases: DeconstructReconstructTestCase[] = [
  {
    name: 'project_readme',
    samplePath: 'old_proj_alpha/project_readme.md',
    expectedFileType: 'project_readme',
    expectedContextParts: {},
  },
  {
    name: 'initial_user_prompt',
    samplePath: 'old_proj_beta/my_user_prompt_file.md',
    dbOriginalFileName: 'My User Prompt File.md', // This becomes originalFileName in reconstructed context
    expectedFileType: 'initial_user_prompt',
    expectedContextParts: {},
  },
  {
    name: 'project_settings_file',
    samplePath: 'old_proj_gamma/project_settings.json',
    expectedFileType: 'project_settings_file',
    expectedContextParts: {},
  },
  {
    name: 'general_resource (project root)',
    samplePath: 'old_proj_delta/general_resource/asset_library.zip',
    dbOriginalFileName: 'Asset Library.zip',
    expectedFileType: 'general_resource',
    expectedContextParts: {},
  },
  {
    name: 'seed_prompt',
    samplePath: 'proj_epsilon/sessions/sess001/iteration_1/1_thesis/seed_prompt.md',
    expectedFileType: 'seed_prompt',
    expectedContextParts: { shortSessionId: 'sess001', iteration: 1, stageDirName: '1_thesis', stageSlug: 'thesis' },
  },
  {
    name: 'user_feedback',
    samplePath: 'proj_zeta/sessions/sess002/iteration_0/2_antithesis/user_feedback_antithesis.md',
    expectedFileType: 'user_feedback',
    expectedContextParts: { shortSessionId: 'sess002', iteration: 0, stageDirName: '2_antithesis', stageSlug: 'antithesis' },
  },
  {
    name: 'model_contribution_main',
    samplePath: 'proj_eta/sessions/sess003/iteration_2/3_synthesis/claude_v1_2_synthesis.md',
    dbOriginalFileName: 'claude_v1_2_synthesis.md', // For this type, parsedFileName is used for context originalFileName
    expectedFileType: 'model_contribution_main',
    expectedContextParts: { 
      shortSessionId: 'sess003', 
      iteration: 2, 
      stageDirName: '3_synthesis', 
      stageSlug: 'synthesis', 
      modelSlug: 'claude_v1', 
      attemptCount: 2 
    },
  },
  {
    name: 'model_contribution_raw_json',
    samplePath: 'proj_theta/sessions/sess004/iteration_1/4_parenthesis/raw_responses/gpt_4_turbo_1_parenthesis_raw.json',
    dbOriginalFileName: 'gpt_4_turbo_1_parenthesis_raw.json',
    expectedFileType: 'model_contribution_raw_json',
    expectedContextParts: { 
      shortSessionId: 'sess004', 
      iteration: 1, 
      stageDirName: '4_parenthesis', 
      stageSlug: 'parenthesis', 
      modelSlug: 'gpt_4_turbo', 
      attemptCount: 1 
    },
  },
  {
    name: 'contribution_document',
    samplePath: 'proj_iota/sessions/sess005/iteration_0/5_paralysis/documents/Final_Output.pdf',
    dbOriginalFileName: 'Final_Output.pdf', // Used for context.originalFileName
    expectedFileType: 'contribution_document',
    expectedContextParts: { shortSessionId: 'sess005', iteration: 0, stageDirName: '5_paralysis', stageSlug: 'paralysis' },
  },
];

deconstructReconstructTestCases.forEach((tc) => {
  Deno.test(`[path_deconstructor_inverse D->C] ${tc.name}`, () => {
    const deconstructedInfo = deconstructStoragePath(tc.samplePath, tc.dbOriginalFileName);
    assertEquals(deconstructedInfo.error, undefined, `Deconstruction failed for ${tc.samplePath}`);
    assertEquals(deconstructedInfo.fileTypeGuess, tc.expectedFileType, "File type guess mismatch after deconstruction");

    // Verify all expected parts were deconstructed
    for (const key in tc.expectedContextParts) {
      assertEquals(deconstructedInfo[key as keyof DeconstructedPathInfo], tc.expectedContextParts[key as keyof typeof tc.expectedContextParts], `Deconstructed part ${key} mismatch`);
    }

    const newProjectId = 'new_project_zyxw';
    const newFullSessionId = 'new-full-session-id-0987'; // Used if a session context is being reconstructed

    const reconstructedContext: PathContext = {
      projectId: newProjectId,
      fileType: deconstructedInfo.fileTypeGuess!, 
      originalFileName: tc.dbOriginalFileName || deconstructedInfo.parsedFileNameFromPath || '',
    };

    if (deconstructedInfo.shortSessionId) reconstructedContext.sessionId = newFullSessionId;
    if (deconstructedInfo.iteration !== undefined) reconstructedContext.iteration = deconstructedInfo.iteration;
    if (deconstructedInfo.stageSlug) reconstructedContext.stageSlug = deconstructedInfo.stageSlug; // Use directly derived stageSlug
    if (deconstructedInfo.modelSlug) reconstructedContext.modelSlug = deconstructedInfo.modelSlug;
    if (deconstructedInfo.attemptCount !== undefined) reconstructedContext.attemptCount = deconstructedInfo.attemptCount;
    
    // Before constructing, validate that reconstructedContext has all necessary fields for its fileType
    // This is a simplified validation based on common requirements.
    if (['seed_prompt', 'user_feedback', 'model_contribution_main', 'model_contribution_raw_json', 'contribution_document'].includes(reconstructedContext.fileType)) {
      assertExists(reconstructedContext.sessionId, `Reconstruction context missing sessionId for ${reconstructedContext.fileType}`);
      assertExists(reconstructedContext.iteration, `Reconstruction context missing iteration for ${reconstructedContext.fileType}`);
      assertExists(reconstructedContext.stageSlug, `Reconstruction context missing stageSlug for ${reconstructedContext.fileType}`);
    }
    if (['model_contribution_main', 'model_contribution_raw_json'].includes(reconstructedContext.fileType)) {
      assertExists(reconstructedContext.modelSlug, `Reconstruction context missing modelSlug for ${reconstructedContext.fileType}`);
      assertExists(reconstructedContext.attemptCount, `Reconstruction context missing attemptCount for ${reconstructedContext.fileType}`);
    }
    if (['initial_user_prompt', 'general_resource', 'contribution_document'].includes(reconstructedContext.fileType)){
      assertExists(reconstructedContext.originalFileName, `Reconstruction context missing originalFileName for ${reconstructedContext.fileType}`);
      // Ensure it's not empty string if it's required and was derived from parsedFileNameFromPath
      if(reconstructedContext.originalFileName === ''){
        throw new Error(`originalFileName ended up empty for ${reconstructedContext.fileType} on path ${tc.samplePath}`);
      }
    }

    const reconstructedPath = constructStoragePath(reconstructedContext);

    // Build the expected path structure based on the original samplePath, but with new IDs
    let expectedReconstructedPath = tc.samplePath;
    if (deconstructedInfo.originalProjectId) {
      expectedReconstructedPath = expectedReconstructedPath.replace(deconstructedInfo.originalProjectId, newProjectId);
    }
    if (deconstructedInfo.shortSessionId && reconstructedContext.sessionId) { // sessionId would be the newFullSessionId
      expectedReconstructedPath = expectedReconstructedPath.replace(deconstructedInfo.shortSessionId, generateShortId(newFullSessionId));
    }

    // If the file type involves sanitization of the originalFileName in path_constructor for the filename part,
    // ensure the expected path reflects this sanitization.
    if (['initial_user_prompt', 'general_resource', 'contribution_document'].includes(tc.expectedFileType)) {
      if (deconstructedInfo.parsedFileNameFromPath) {
        // deconstructedInfo.parsedFileNameFromPath is the filename from the original tc.samplePath
        const originalFileNameInSample = deconstructedInfo.parsedFileNameFromPath;
        const sanitizedVersionForExpectedPath = sanitizeForPath(originalFileNameInSample);
        
        // Only replace if sanitization actually changes the name (e.g. casing)
        // and if the original filename was indeed part of the expected path (it should be)
        if (originalFileNameInSample !== sanitizedVersionForExpectedPath && expectedReconstructedPath.endsWith(originalFileNameInSample)) {
          expectedReconstructedPath = expectedReconstructedPath.substring(0, expectedReconstructedPath.length - originalFileNameInSample.length) + sanitizedVersionForExpectedPath;
        }
      }
    }
    
    assertEquals(reconstructedPath, expectedReconstructedPath, "Reconstructed path does not match expected structure");
  });
});

