import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { constructStoragePath } from './path_constructor.ts';
import { 
    FileType, 
    PathContext 
} from '../types/file_manager.types.ts';
import { extractSourceGroupFragment } from './path_utils.ts';

Deno.test('path_constructor fragment support', async (t) => {
  const projectId = 'project-123';
  const sessionId = 'session-abc12345';
  const iteration = 1;
  const baseContext: Omit<PathContext, 'fileType' | 'sourceGroupFragment'> = {
    projectId,
    sessionId,
    iteration,
    stageSlug: 'thesis',
    modelSlug: 'gpt-4-turbo',
    attemptCount: 0,
  };

  await t.step('69.c.i: HeaderContext filename includes fragment for simple pattern (non-antithesis)', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      sourceGroupFragment: 'a1b2c3d4',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gpt-4-turbo_0_a1b2c3d4_header_context.json', 'Fragment should appear after attemptCount in simple pattern');
  });

  await t.step('69.c.ii: TurnPrompt simple pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude-3-5-sonnet',
      attemptCount: 1,
      documentKey: 'business_case',
      sourceGroupFragment: 'f5e6d7c8',
      stageSlug: 'thesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md', 'Fragment should appear after documentKey in simple pattern');
  });

  await t.step('69.c.iii: TurnPrompt antithesis pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: 'f5e6d7c8',
      stageSlug: 'antithesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'claude_critiquing_gpt-4_f5e6d7c8_1_business_case_critique_prompt.md', 'Fragment should appear between sourceAnchorModelSlug and attemptCount in antithesis pattern');
  });

  await t.step('69.c.iv: ModelContributionRawJson simple pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.ModelContributionRawJson,
      modelSlug: 'gemini-1.5-pro',
      attemptCount: 2,
      documentKey: 'feature_spec',
      sourceGroupFragment: '12345678',
      stageSlug: 'thesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gemini-1.5-pro_2_feature_spec_12345678_raw.json', 'Fragment should appear after documentKey in simple pattern');
  });

  await t.step('69.c.v: ModelContributionRawJson antithesis pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.ModelContributionRawJson,
      modelSlug: 'claude',
      sourceModelSlugs: ['gpt-4'], // Antithesis requires sourceModelSlugs array
      sourceAnchorType: 'thesis',
      sourceAttemptCount: 0,
      contributionType: 'antithesis',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
      stageSlug: 'antithesis',
    };
    const { fileName } = constructStoragePath(context);
    // Pattern: ${modelSlug}_critiquing_(${sourceModelSlug}'s_${sourceAnchorType}_${sourceAttemptCount})_${fragment}_${attemptCount}_${documentKey}_raw.json
    assertEquals(fileName, 'claude_critiquing_(gpt-4\'s_thesis_0)_98765432_1_business_case_critique_raw.json', 'Fragment should appear between sourceAnchorModelSlug segment and attemptCount in antithesis pattern');
  });

  await t.step('69.c.vi: AssembledDocumentJson simple pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.AssembledDocumentJson,
      modelSlug: 'gpt-4',
      attemptCount: 0,
      documentKey: 'technical_approach',
      sourceGroupFragment: 'abcdef12',
      stageSlug: 'thesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gpt-4_0_technical_approach_abcdef12_assembled.json', 'Fragment should appear after documentKey in simple pattern');
  });

  await t.step('69.c.vii: AssembledDocumentJson antithesis pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.AssembledDocumentJson,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
      stageSlug: 'antithesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'claude_critiquing_gpt-4_98765432_1_business_case_critique_assembled.json', 'Fragment should appear between sourceAnchorModelSlug and attemptCount in antithesis pattern');
  });

  await t.step('69.c.viii: RenderedDocument simple pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.RenderedDocument,
      modelSlug: 'gpt-4',
      attemptCount: 0,
      documentKey: 'technical_approach',
      sourceGroupFragment: 'abcdef12',
      stageSlug: 'thesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gpt-4_0_technical_approach_abcdef12.md', 'Fragment should appear after documentKey in simple pattern');
  });

  await t.step('69.c.ix: RenderedDocument antithesis pattern filename includes fragment', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.RenderedDocument,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: '98765432',
      stageSlug: 'antithesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'claude_critiquing_gpt-4_98765432_1_business_case_critique.md', 'Fragment should appear between sourceAnchorModelSlug and attemptCount in antithesis pattern');
  });

  await t.step('69.c.x: antithesis header_context pattern includes fragment between sourceAnchorModelSlug and attemptCount', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 0,
      sourceGroupFragment: '98765432',
      stageSlug: 'antithesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'claude_critiquing_gpt-4_98765432_0_header_context.json', 'Fragment should appear between sourceAnchorModelSlug and attemptCount in antithesis pattern');
  });

  await t.step('69.c.xi: HeaderContext uses simple pattern for non-antithesis stages', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'gpt-4-turbo',
      attemptCount: 0,
      sourceGroupFragment: 'a1b2c3d4',
      stageSlug: 'thesis',
    };
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gpt-4-turbo_0_a1b2c3d4_header_context.json', 'Fragment should appear after attemptCount in simple pattern, no critiquing pattern');
  });

  await t.step('69.c.xii: all file types work without fragment (backward compatibility)', () => {
    const headerContextSimple: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'gpt-4-turbo',
      attemptCount: 0,
      stageSlug: 'thesis',
      // sourceGroupFragment is undefined
    };
    const { fileName: headerSimpleFileName } = constructStoragePath(headerContextSimple);
    assertEquals(headerSimpleFileName, 'gpt-4-turbo_0_header_context.json', 'HeaderContext without fragment should use existing pattern');

    const headerContextAntithesis: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 0,
      stageSlug: 'antithesis',
      // sourceGroupFragment is undefined
    };
    const { fileName: headerAntithesisFileName } = constructStoragePath(headerContextAntithesis);
    assertEquals(headerAntithesisFileName, 'claude_critiquing_gpt-4_0_header_context.json', 'Antithesis HeaderContext without fragment should use existing pattern');
  });

  await t.step('69.c.xiii: fragment is sanitized correctly', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'gpt-4-turbo',
      attemptCount: 0,
      sourceGroupFragment: 'A1-B2-C3', // Contains hyphens - should be sanitized
      stageSlug: 'thesis',
    };
    // The fragment should be sanitized by extractSourceGroupFragment helper
    // 'A1-B2-C3' -> remove hyphens -> 'A1B2C3' -> first 8 chars -> 'A1B2C3' -> lowercase -> 'a1b2c3'
    const sanitizedFragment = extractSourceGroupFragment('A1-B2-C3');
    assertEquals(sanitizedFragment, 'a1b2c3', 'Fragment should be sanitized (hyphens removed, lowercase)');
    
    // Verify the sanitized fragment appears in the filename
    const { fileName } = constructStoragePath(context);
    assertEquals(fileName, 'gpt-4-turbo_0_a1b2c3_header_context.json', 'Fragment in filename should be sanitized (hyphens removed, lowercase)');
  });

  await t.step('69.e.ii: fragment handling with empty string is handled gracefully', () => {
    const contextEmptyString: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      sourceGroupFragment: '', // Empty string should result in undefined fragment
    };
    const { fileName: fileNameEmpty } = constructStoragePath(contextEmptyString);
    assertEquals(fileNameEmpty, 'gpt-4-turbo_0_header_context.json', 'Empty string fragment should result in no fragment in filename');

    const contextUndefined: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      sourceGroupFragment: undefined,
    };
    const { fileName: fileNameUndefined } = constructStoragePath(contextUndefined);
    assertEquals(fileNameUndefined, 'gpt-4-turbo_0_header_context.json', 'Undefined fragment should result in no fragment in filename');

    // Also test with TurnPrompt to ensure consistency across file types
    const turnPromptContextEmpty: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt,
      documentKey: 'business_case',
      sourceGroupFragment: '',
    };
    const { fileName: turnPromptFileNameEmpty } = constructStoragePath(turnPromptContextEmpty);
    assertEquals(turnPromptFileNameEmpty, 'gpt-4-turbo_0_business_case_prompt.md', 'TurnPrompt with empty string fragment should result in no fragment in filename');
  });

  await t.step('69.e.iii: antithesis pattern detection when stageSlug is not antithesis but sourceAnchorModelSlug exists', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4', // Exists but stageSlug is 'thesis'
      attemptCount: 0,
      sourceGroupFragment: '98765432',
      stageSlug: 'thesis', // NOT 'antithesis'
    };
    const { fileName } = constructStoragePath(context);
    // Should use simple pattern, NOT critiquing pattern (both conditions must be met)
    assertEquals(fileName, 'claude_0_98765432_header_context.json', 'Simple pattern should be used when stageSlug is not antithesis even if sourceAnchorModelSlug exists');

    // Also test with TurnPrompt for consistency
    const turnPromptContext: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude',
      sourceAnchorModelSlug: 'gpt-4',
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: 'f5e6d7c8',
      stageSlug: 'thesis', // NOT 'antithesis'
    };
    const { fileName: turnPromptFileName } = constructStoragePath(turnPromptContext);
    assertEquals(turnPromptFileName, 'claude_1_business_case_critique_f5e6d7c8_prompt.md', 'TurnPrompt should use simple pattern when stageSlug is not antithesis even if sourceAnchorModelSlug exists');
  });

  await t.step('69.e.iv: simple pattern is used when stageSlug === antithesis but sourceAnchorModelSlug is missing', () => {
    const context: PathContext = {
      ...baseContext,
      fileType: FileType.HeaderContext,
      documentKey: 'header_context',
      modelSlug: 'claude',
      sourceAnchorModelSlug: undefined, // Missing even though stageSlug is 'antithesis'
      attemptCount: 0,
      sourceGroupFragment: '98765432',
      stageSlug: 'antithesis', // Is 'antithesis' but sourceAnchorModelSlug is missing
    };
    const { fileName } = constructStoragePath(context);
    // Should use simple pattern, NOT critiquing pattern (both conditions must be met)
    assertEquals(fileName, 'claude_0_98765432_header_context.json', 'Simple pattern should be used when sourceAnchorModelSlug is missing even if stageSlug is antithesis');

    // Also test with TurnPrompt for consistency
    const turnPromptContext: PathContext = {
      ...baseContext,
      fileType: FileType.TurnPrompt,
      modelSlug: 'claude',
      sourceAnchorModelSlug: undefined,
      attemptCount: 1,
      documentKey: 'business_case_critique',
      sourceGroupFragment: 'f5e6d7c8',
      stageSlug: 'antithesis', // Is 'antithesis' but sourceAnchorModelSlug is missing
    };
    const { fileName: turnPromptFileName } = constructStoragePath(turnPromptContext);
    assertEquals(turnPromptFileName, 'claude_1_business_case_critique_f5e6d7c8_prompt.md', 'TurnPrompt should use simple pattern when sourceAnchorModelSlug is missing even if stageSlug is antithesis');
  });
});
