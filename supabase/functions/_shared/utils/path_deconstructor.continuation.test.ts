import {
  assertEquals,
} from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { constructStoragePath, generateShortId } from './path_constructor.ts';
import { deconstructStoragePath } from './path_deconstructor.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';
import { FileType, PathContext } from '../types/file_manager.types.ts';

const projectId = 'project-uuid-cont';
const sessionId = 'session-uuid-4567890';
const iteration = 1;
const attemptCount = 0;

const modelSlug = 'gpt-4-turbo';
const headerContextDocumentKey = 'header_context';

Deno.test('[path_deconstructor.continuation] HeaderContext + SynthesisHeaderContext', async (t) => {
  await t.step('HeaderContext antithesis - continuation parses isContinuation + turnIndex', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      sourceAnchorModelSlug: 'claude-3-opus',
      modelSlug,
      attemptCount,
      documentKey: headerContextDocumentKey,
      fileType: FileType.HeaderContext,
      isContinuation: true,
      turnIndex: 3,
    };

    const { storagePath, fileName } = constructStoragePath(context);
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, generateShortId(sessionId));
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageSlug, 'antithesis');
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.documentKey, headerContextDocumentKey);
    assertEquals(info.isContinuation, true);
    assertEquals(info.turnIndex, 3);
  });

  await t.step('HeaderContext simple - continuation parses isContinuation + turnIndex', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      modelSlug,
      attemptCount,
      documentKey: headerContextDocumentKey,
      fileType: FileType.HeaderContext,
      isContinuation: true,
      turnIndex: 2,
    };

    const { storagePath, fileName } = constructStoragePath(context);
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, generateShortId(sessionId));
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageSlug, 'thesis');
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.documentKey, headerContextDocumentKey);
    assertEquals(info.isContinuation, true);
    assertEquals(info.turnIndex, 2);
  });

  await t.step('HeaderContext antithesis - non-continuation keeps isContinuation/turnIndex unset', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'antithesis',
      sourceAnchorModelSlug: 'claude-3-opus',
      modelSlug,
      attemptCount,
      documentKey: headerContextDocumentKey,
      fileType: FileType.HeaderContext,
      isContinuation: false,
    };

    const { storagePath, fileName } = constructStoragePath(context);
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.documentKey, headerContextDocumentKey);
    assertEquals(info.isContinuation, undefined);
    assertEquals(info.turnIndex, undefined);
  });

  await t.step('HeaderContext simple - undefined isContinuation keeps isContinuation/turnIndex unset', () => {
    const context: PathContext = {
      projectId,
      sessionId,
      iteration,
      stageSlug: 'thesis',
      modelSlug,
      attemptCount,
      documentKey: headerContextDocumentKey,
      fileType: FileType.HeaderContext,
    };

    const { storagePath, fileName } = constructStoragePath(context);
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.HeaderContext);
    assertEquals(info.documentKey, headerContextDocumentKey);
    assertEquals(info.isContinuation, undefined);
    assertEquals(info.turnIndex, undefined);
  });

  await t.step('SynthesisHeaderContext - continuation parses isContinuation + turnIndex', () => {
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
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.originalProjectId, projectId);
    assertEquals(info.shortSessionId, generateShortId(sessionId));
    assertEquals(info.iteration, iteration);
    assertEquals(info.stageSlug, 'synthesis');
    assertEquals(info.fileTypeGuess, FileType.SynthesisHeaderContext);
    assertEquals(info.isContinuation, true);
    assertEquals(info.turnIndex, 1);
  });

  await t.step('SynthesisHeaderContext - non-continuation keeps isContinuation/turnIndex unset', () => {
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

    const { storagePath, fileName } = constructStoragePath(context);
    const info: DeconstructedPathInfo = deconstructStoragePath({ storageDir: storagePath, fileName });

    assertEquals(info.error, undefined);
    assertEquals(info.fileTypeGuess, FileType.SynthesisHeaderContext);
    assertEquals(info.isContinuation, undefined);
    assertEquals(info.turnIndex, undefined);
  });
});

