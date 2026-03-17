import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { constructStoragePath, generateShortId } from './path_constructor.ts';
import { FileType, PathContext } from '../types/file_manager.types.ts';

const projectId = 'project-uuid-cont';
const sessionId = 'session-uuid-4567890';
const iteration = 1;
const modelSlug = 'gpt-4-turbo';
const attemptCount = 0;
const shortSessionId = generateShortId(sessionId);

Deno.test('HeaderContext and SynthesisHeaderContext continuation suffix', async (t) => {
  await t.step('HeaderContext antithesis pattern with isContinuation: true, turnIndex: 3 produces filename containing _continuation_3', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      sourceAnchorModelSlug: 'claude-3-opus',
      modelSlug,
      attemptCount,
      documentKey: 'header_context',
      fileType: FileType.HeaderContext,
      isContinuation: true,
      turnIndex: 3,
    };
    const { fileName } = constructStoragePath(context);
    assert(
      fileName.includes('_continuation_3'),
      `Filename should include '_continuation_3'. Got: ${fileName}`,
    );
    assertEquals(fileName.endsWith('.json'), true);
  });

  await t.step('HeaderContext simple pattern with isContinuation: true, turnIndex: 2 produces filename containing _continuation_2', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      modelSlug,
      attemptCount,
      documentKey: 'header_context',
      fileType: FileType.HeaderContext,
      isContinuation: true,
      turnIndex: 2,
    };
    const { fileName } = constructStoragePath(context);
    assert(
      fileName.includes('_continuation_2'),
      `Filename should include '_continuation_2'. Got: ${fileName}`,
    );
    assertEquals(fileName.endsWith('.json'), true);
  });

  await t.step('HeaderContext antithesis pattern with isContinuation: false produces filename without _continuation_ suffix (regression guard)', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      sourceAnchorModelSlug: 'claude-3-opus',
      modelSlug,
      attemptCount,
      documentKey: 'header_context',
      fileType: FileType.HeaderContext,
      isContinuation: false,
    };
    const { fileName } = constructStoragePath(context);
    assert(
      !fileName.includes('_continuation_'),
      `Filename should not include '_continuation_' suffix. Got: ${fileName}`,
    );
    assertEquals(fileName, 'gpt-4-turbo_critiquing_claude-3-opus_0_header_context.json');
  });

  await t.step('HeaderContext simple pattern with isContinuation: undefined produces filename without _continuation_ suffix (regression guard)', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      modelSlug,
      attemptCount,
      documentKey: 'header_context',
      fileType: FileType.HeaderContext,
    };
    const { fileName } = constructStoragePath(context);
    assert(
      !fileName.includes('_continuation_'),
      `Filename should not include '_continuation_' suffix. Got: ${fileName}`,
    );
    assertEquals(fileName, 'gpt-4-turbo_0_header_context.json');
  });

  await t.step('SynthesisHeaderContext with isContinuation: true, turnIndex: 1 produces filename containing _continuation_1', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'synthesis',
      modelSlug,
      attemptCount,
      fileType: FileType.SynthesisHeaderContext,
      isContinuation: true,
      turnIndex: 1,
    };
    const { storagePath, fileName } = constructStoragePath(context);
    assert(
      fileName.includes('_continuation_1'),
      `Filename should include '_continuation_1'. Got: ${fileName}`,
    );
    assertEquals(fileName.endsWith('.json'), true);
    assertEquals(
      storagePath,
      `${projectId}/session_${shortSessionId}/iteration_${iteration}/3_synthesis/_work/context`,
    );
  });

  await t.step('SynthesisHeaderContext with isContinuation: false produces filename without _continuation_ suffix (regression guard)', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'synthesis',
      modelSlug,
      attemptCount,
      fileType: FileType.SynthesisHeaderContext,
      isContinuation: false,
    };
    const { fileName } = constructStoragePath(context);
    assert(
      !fileName.includes('_continuation_'),
      `Filename should not include '_continuation_' suffix. Got: ${fileName}`,
    );
    assertEquals(fileName, 'gpt-4-turbo_0_synthesis_header_context.json');
  });
});
