import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { deconstructStoragePath } from './path_deconstructor.ts';
import { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { 
    constructStoragePath, 
    generateShortId, 
    sanitizeForPath 
} from './path_constructor.ts';
import { 
    FileType, 
    PathContext 
} from '../types/file_manager.types.ts';

// RED tests for fragment parsing - these tests must initially FAIL because fragment parsing
// has not been implemented in deconstructStoragePath yet (implementation in step 70.d)

Deno.test('[path_deconstructor.fragment] 70.c.i - HeaderContext simple pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/1_thesis/_work/context/gpt-4-turbo_0_a1b2c3d4_header_context.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, 'a1b2c3d4', 'Fragment after attemptCount should be extracted');
  assertEquals(info.modelSlug, 'gpt-4-turbo');
  assertEquals(info.attemptCount, 0);
  assertEquals(info.fileTypeGuess, FileType.HeaderContext);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.ii - HeaderContext antithesis pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/_work/context/claude_critiquing_gpt-4_98765432_0_header_context.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '98765432', 'Fragment between sourceAnchorModelSlug and attemptCount should be extracted');
  assertEquals(info.modelSlug, 'claude');
  assertEquals(info.sourceAnchorModelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 0);
  assertEquals(info.fileTypeGuess, FileType.HeaderContext);
  assertEquals(info.stageSlug, 'antithesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.iii - TurnPrompt simple pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/1_thesis/_work/prompts/claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, 'f5e6d7c8', 'Fragment after documentKey should be extracted');
  assertEquals(info.modelSlug, 'claude-3-5-sonnet');
  assertEquals(info.attemptCount, 1);
  assertEquals(info.documentKey, 'business_case');
  assertEquals(info.fileTypeGuess, FileType.TurnPrompt);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.iv - TurnPrompt antithesis pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/_work/prompts/claude_critiquing_gpt-4_98765432_1_business_case_critique_prompt.md';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '98765432', 'Fragment between sourceAnchorModelSlug and attemptCount should be extracted');
  assertEquals(info.modelSlug, 'claude');
  assertEquals(info.sourceAnchorModelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 1);
  assertEquals(info.documentKey, 'business_case_critique');
  assertEquals(info.fileTypeGuess, FileType.TurnPrompt);
  assertEquals(info.stageSlug, 'antithesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.v - ModelContributionRawJson simple pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/1_thesis/raw_responses/gemini-1.5-pro_2_feature_spec_12345678_raw.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '12345678', 'Fragment after documentKey should be extracted');
  assertEquals(info.modelSlug, 'gemini-1.5-pro');
  assertEquals(info.attemptCount, 2);
  assertEquals(info.documentKey, 'feature_spec');
  assertEquals(info.fileTypeGuess, FileType.ModelContributionRawJson);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.vi - ModelContributionRawJson antithesis pattern with fragment', () => {
  // Antithesis pattern: {modelSlug}_critiquing_({sourceModelSlug}'s_{sourceAnchorType}_{sourceAttemptCount})[_{fragment}]_{attemptCount}_{documentKey}_raw.json
  // Fragment is between closing parenthesis and attemptCount
  const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/raw_responses/claude_critiquing_(gpt-4\'s_thesis_0)_98765432_1_business_case_critique_raw.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '98765432', 'Fragment between sourceAttemptCount segment and attemptCount should be extracted');
  assertEquals(info.modelSlug, 'claude');
  assertEquals(info.sourceModelSlug, 'gpt-4');
  assertEquals(info.sourceContributionType, 'thesis');
  assertEquals(info.sourceAttemptCount, 0);
  assertEquals(info.attemptCount, 1);
  assertEquals(info.documentKey, 'business_case_critique');
  assertEquals(info.fileTypeGuess, FileType.business_case_critique);
  assertEquals(info.stageSlug, 'antithesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.vii - AssembledDocumentJson simple pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/1_thesis/_work/assembled_json/gpt-4_0_technical_approach_abcdef12_assembled.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, 'abcdef12', 'Fragment after documentKey should be extracted');
  assertEquals(info.modelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 0);
  assertEquals(info.documentKey, 'technical_approach');
  assertEquals(info.fileTypeGuess, FileType.AssembledDocumentJson);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.viii - AssembledDocumentJson antithesis pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/_work/assembled_json/claude_critiquing_gpt-4_98765432_1_business_case_critique_assembled.json';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '98765432', 'Fragment between sourceAnchorModelSlug and attemptCount should be extracted');
  assertEquals(info.modelSlug, 'claude');
  assertEquals(info.sourceAnchorModelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 1);
  assertEquals(info.documentKey, 'business_case_critique');
  assertEquals(info.fileTypeGuess, FileType.AssembledDocumentJson);
  assertEquals(info.stageSlug, 'antithesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.ix - RenderedDocument simple pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/1_thesis/documents/gpt-4_0_technical_approach_abcdef12.md';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, 'abcdef12', 'Fragment after documentKey should be extracted');
  assertEquals(info.modelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 0);
  assertEquals(info.documentKey, 'technical_approach');
  assertEquals(info.fileTypeGuess, FileType.technical_approach);
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.x - RenderedDocument antithesis pattern with fragment', () => {
  const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/documents/claude_critiquing_gpt-4_98765432_1_business_case_critique.md';
  const lastSlashIndex = fullPath.lastIndexOf('/');
  const storageDir = fullPath.substring(0, lastSlashIndex);
  const fileName = fullPath.substring(lastSlashIndex + 1);
  
  const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
  
  assertEquals(info.sourceGroupFragment, '98765432', 'Fragment between sourceAnchorModelSlug and attemptCount should be extracted');
  assertEquals(info.modelSlug, 'claude');
  assertEquals(info.sourceAnchorModelSlug, 'gpt-4');
  assertEquals(info.attemptCount, 1);
  assertEquals(info.documentKey, 'business_case_critique');
  assertEquals(info.fileTypeGuess, FileType.business_case_critique);
  assertEquals(info.stageSlug, 'antithesis');
  assertEquals(info.error, undefined);
});

Deno.test('[path_deconstructor.fragment] 70.c.xi - Backward compatibility: paths without fragment still parse correctly', async (t) => {
  await t.step('Simple HeaderContext pattern without fragment', () => {
    const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/_work/context/gpt-4-turbo_0_header_context.json';
    const lastSlashIndex = fullPath.lastIndexOf('/');
    const storageDir = fullPath.substring(0, lastSlashIndex);
    const fileName = fullPath.substring(lastSlashIndex + 1);
    
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
    
    assertEquals(info.sourceGroupFragment, undefined, 'Fragment should be undefined when not present in path');
    assertEquals(info.modelSlug, 'gpt-4-turbo');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.error, undefined);
  });

  await t.step('Antithesis HeaderContext pattern without fragment', () => {
    const fullPath = 'project-123/session_abc12345/iteration_1/2_antithesis/_work/context/claude_critiquing_gpt-4_0_header_context.json';
    const lastSlashIndex = fullPath.lastIndexOf('/');
    const storageDir = fullPath.substring(0, lastSlashIndex);
    const fileName = fullPath.substring(lastSlashIndex + 1);
    
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir, fileName });
    
    assertEquals(info.sourceGroupFragment, undefined, 'Fragment should be undefined when not present in path');
    assertEquals(info.modelSlug, 'claude');
    assertEquals(info.sourceAnchorModelSlug, 'gpt-4');
    assertEquals(info.attemptCount, 0);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.error, undefined);
  });
});

Deno.test('[path_deconstructor.fragment] 70.c.xii - Round-trip consistency: construct → deconstruct preserves fragment', async (t) => {
  const projectId = 'proj-roundtrip';
  const sessionId = 'sess-roundtrip-uuid';
  const shortSessionId = generateShortId(sessionId);
  const iteration = 1;
  const fragment = 'a1b2c3d4';

  await t.step('HeaderContext simple pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      fileType: FileType.HeaderContext,
      modelSlug: 'gpt-4-turbo',
      attemptCount: 0,
      sourceGroupFragment: fragment,
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, fragment, 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.error, undefined);
  });

  await t.step('HeaderContext antithesis pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      fileType: FileType.HeaderContext,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 0,
      sourceGroupFragment: '98765432',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, '98765432', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.sourceAnchorModelSlug, sanitizeForPath(context.sourceAnchorModelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.error, undefined);
  });

  await t.step('TurnPrompt simple pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude-3-5-sonnet',
      attemptCount: 1,
      documentKey: 'business_case',
      sourceGroupFragment: 'f5e6d7c8',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, 'f5e6d7c8', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.TurnPrompt);
    assertEquals(info.error, undefined);
  });

  await t.step('TurnPrompt antithesis pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, '98765432', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.sourceAnchorModelSlug, sanitizeForPath(context.sourceAnchorModelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.TurnPrompt);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.error, undefined);
  });

  await t.step('ModelContributionRawJson simple pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      fileType: FileType.ModelContributionRawJson,
      modelSlug: 'gemini-1.5-pro',
      attemptCount: 2,
      documentKey: 'feature_spec',
      sourceGroupFragment: '12345678',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, '12345678', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.ModelContributionRawJson);
    assertEquals(info.error, undefined);
  });

  await t.step('AssembledDocumentJson simple pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      fileType: FileType.AssembledDocumentJson,
      modelSlug: 'gpt-4',
      attemptCount: 0,
      documentKey: 'technical_approach',
      sourceGroupFragment: 'abcdef12',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, 'abcdef12', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.AssembledDocumentJson);
    assertEquals(info.error, undefined);
  });

  await t.step('AssembledDocumentJson antithesis pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      fileType: FileType.AssembledDocumentJson,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, '98765432', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.sourceAnchorModelSlug, sanitizeForPath(context.sourceAnchorModelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.AssembledDocumentJson);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.error, undefined);
  });

  await t.step('RenderedDocument simple pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      fileType: FileType.RenderedDocument,
      modelSlug: 'gpt-4',
      attemptCount: 0,
      documentKey: 'technical_approach',
      sourceGroupFragment: 'abcdef12',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, 'abcdef12', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.technical_approach);
    assertEquals(info.error, undefined);
  });

  await t.step('RenderedDocument antithesis pattern round-trip', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      fileType: FileType.RenderedDocument,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
    };
    const { storagePath, fileName } = constructStoragePath(context);
    const info = deconstructStoragePath({ storageDir: storagePath, fileName });
    
    assertEquals(info.sourceGroupFragment, '98765432', 'Fragment should be preserved in round-trip');
    assertEquals(info.modelSlug, sanitizeForPath(context.modelSlug!));
    assertEquals(info.sourceAnchorModelSlug, sanitizeForPath(context.sourceAnchorModelSlug!));
    assertEquals(info.attemptCount, context.attemptCount);
    assertEquals(info.documentKey, context.documentKey);
    assertEquals(info.fileTypeGuess, FileType.business_case_critique);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.error, undefined);
  });
});
