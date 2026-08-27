import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { InputRule } from '../../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../types/file_manager.types.ts';
import type {
  ResourceDocument,
  ResourceDocuments,
  CompressibleInputRuleType,
  ResolveCompressionSourceDeps,
  ResolveCompressionSourceParams,
  ResolveCompressionSourcePayload,
  CompressibleSourceReturn,
  NotCompressibleSourceReturn,
  ResolveCompressionSourceSuccessReturn,
  ResolveCompressionSourceErrorReturn,
  ResolveCompressionSourceReturn,
  ResolveCompressionSourceFn,
  BoundResolveCompressionSourceFn,
} from './resolveCompressionSource.interface.ts';

/** Contract: ResourceDocument's required key surface is exactly id, content, document_key, stage_slug, type. */
Deno.test('ResourceDocument has the required surface', () => {
  const surface: Record<keyof ResourceDocument, true> = {
    id: true,
    content: true,
    document_key: true,
    stage_slug: true,
    type: true,
  };
  assertStrictEquals(Object.keys(surface).length, 5);
});

/** Contract: ResourceDocument.type admits 'document'. */
Deno.test("ResourceDocument.type admits 'document'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'document',
  };
  assert(document.type === 'document');
});

/** Contract: ResourceDocument.type admits 'feedback'. */
Deno.test("ResourceDocument.type admits 'feedback'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'feedback',
  };
  assert(document.type === 'feedback');
});

/** Contract: ResourceDocument.type admits 'header_context'. */
Deno.test("ResourceDocument.type admits 'header_context'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'header_context',
  };
  assert(document.type === 'header_context');
});

/** Contract: ResourceDocument.type admits 'seed_prompt'. */
Deno.test("ResourceDocument.type admits 'seed_prompt'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'seed_prompt',
  };
  assert(document.type === 'seed_prompt');
});

/** Contract: ResourceDocument.type admits 'project_resource'. */
Deno.test("ResourceDocument.type admits 'project_resource'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'project_resource',
  };
  assert(document.type === 'project_resource');
});

/** Contract: ResourceDocument.type admits 'contribution'. */
Deno.test("ResourceDocument.type admits 'contribution'", () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'contribution',
  };
  assert(document.type === 'contribution');
});

/** Contract: ResourceDocument.document_key is FileType. */
Deno.test('ResourceDocument.document_key is FileType', () => {
  const documentKey: ResourceDocument['document_key'] = FileType.business_case;
  assert(documentKey === FileType.business_case);
});

/** Contract: ResourceDocuments is the array of ResourceDocument. */
Deno.test('ResourceDocuments is the array of ResourceDocument', () => {
  const document: ResourceDocument = {
    id: 'doc-1',
    content: 'content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'document',
  };
  const documents: ResourceDocuments = [document];
  assertStrictEquals(documents.length, 1);
});

/** Contract: CompressibleInputRuleType admits 'document'. */
Deno.test("CompressibleInputRuleType admits 'document'", () => {
  const value: CompressibleInputRuleType = 'document';
  assert(value === 'document');
});

/** Contract: CompressibleInputRuleType admits 'feedback'. */
Deno.test("CompressibleInputRuleType admits 'feedback'", () => {
  const value: CompressibleInputRuleType = 'feedback';
  assert(value === 'feedback');
});

/** Contract: CompressibleInputRuleType admits 'project_resource'. */
Deno.test("CompressibleInputRuleType admits 'project_resource'", () => {
  const value: CompressibleInputRuleType = 'project_resource';
  assert(value === 'project_resource');
});

/** Contract: ResolveCompressionSourceDeps requires exactly logger. */
Deno.test('ResolveCompressionSourceDeps has the required surface', () => {
  const surface: Record<keyof ResolveCompressionSourceDeps, true> = {
    logger: true,
  };
  assertStrictEquals(Object.keys(surface).length, 1);
});

/** Contract: ResolveCompressionSourceParams carries no member. */
Deno.test('ResolveCompressionSourceParams carries no member', () => {
  const surface: Record<keyof ResolveCompressionSourceParams, true> = {};
  assertStrictEquals(Object.keys(surface).length, 0);
});

/** Contract: ResolveCompressionSourcePayload requires exactly document. */
Deno.test('ResolveCompressionSourcePayload has the required surface', () => {
  const surface: Record<keyof ResolveCompressionSourcePayload, true> = {
    document: true,
  };
  assertStrictEquals(Object.keys(surface).length, 1);
});

/** Contract: CompressibleSourceReturn requires exactly compressible, sourceType, documentKey. */
Deno.test('CompressibleSourceReturn has the required surface', () => {
  const surface: Record<keyof CompressibleSourceReturn, true> = {
    compressible: true,
    sourceType: true,
    documentKey: true,
  };
  assertStrictEquals(Object.keys(surface).length, 3);
});

/** Contract: NotCompressibleSourceReturn requires exactly compressible. */
Deno.test('NotCompressibleSourceReturn has the required surface', () => {
  const surface: Record<keyof NotCompressibleSourceReturn, true> = {
    compressible: true,
  };
  assertStrictEquals(Object.keys(surface).length, 1);
});

/** Contract: ResolveCompressionSourceErrorReturn requires exactly error, retriable. */
Deno.test('ResolveCompressionSourceErrorReturn has the required surface', () => {
  const surface: Record<keyof ResolveCompressionSourceErrorReturn, true> = {
    error: true,
    retriable: true,
  };
  assertStrictEquals(Object.keys(surface).length, 2);
});

/** Contract: CompressibleSourceReturn is a flavor of ResolveCompressionSourceSuccessReturn. */
Deno.test('CompressibleSourceReturn is a member of ResolveCompressionSourceSuccessReturn', () => {
  const compressible: CompressibleSourceReturn = {
    compressible: true,
    sourceType: 'resource',
    documentKey: FileType.business_case,
  };
  const success: ResolveCompressionSourceSuccessReturn = compressible;
  assert(success === compressible);
});

/** Contract: NotCompressibleSourceReturn is a flavor of ResolveCompressionSourceSuccessReturn. */
Deno.test('NotCompressibleSourceReturn is a member of ResolveCompressionSourceSuccessReturn', () => {
  const notCompressible: NotCompressibleSourceReturn = {
    compressible: false,
  };
  const success: ResolveCompressionSourceSuccessReturn = notCompressible;
  assert(success === notCompressible);
});

/** Contract: ResolveCompressionSourceSuccessReturn is a member of ResolveCompressionSourceReturn. */
Deno.test('ResolveCompressionSourceSuccessReturn is a member of ResolveCompressionSourceReturn', () => {
  const success: ResolveCompressionSourceSuccessReturn = {
    compressible: true,
    sourceType: 'resource',
    documentKey: FileType.business_case,
  };
  const returned: ResolveCompressionSourceReturn = success;
  assert(returned === success);
});

/** Contract: ResolveCompressionSourceErrorReturn is a member of ResolveCompressionSourceReturn. */
Deno.test('ResolveCompressionSourceErrorReturn is a member of ResolveCompressionSourceReturn', () => {
  const error: ResolveCompressionSourceErrorReturn = {
    error: new Error('resolveCompressionSource failed'),
    retriable: false,
  };
  const returned: ResolveCompressionSourceReturn = error;
  assert(returned === error);
});

/** Contract: ResolveCompressionSourceFn's declared return admits its success arm. */
Deno.test("ResolveCompressionSourceFn's declared return admits its success arm", () => {
  const success: ResolveCompressionSourceSuccessReturn = {
    compressible: true,
    sourceType: 'resource',
    documentKey: FileType.business_case,
  };
  const returned: ReturnType<ResolveCompressionSourceFn> = success;
  const declared: ResolveCompressionSourceReturn = returned;
  assert(declared === success);
});

/** Contract: ResolveCompressionSourceFn's declared return admits its error arm. */
Deno.test("ResolveCompressionSourceFn's declared return admits its error arm", () => {
  const error: ResolveCompressionSourceErrorReturn = {
    error: new Error('resolveCompressionSource failed'),
    retriable: false,
  };
  const returned: ReturnType<ResolveCompressionSourceFn> = error;
  const declared: ResolveCompressionSourceReturn = returned;
  assert(declared === error);
});

/** Contract: BoundResolveCompressionSourceFn's declared return admits its success arm. */
Deno.test("BoundResolveCompressionSourceFn's declared return admits its success arm", () => {
  const success: ResolveCompressionSourceSuccessReturn = {
    compressible: true,
    sourceType: 'resource',
    documentKey: FileType.business_case,
  };
  const returned: ReturnType<BoundResolveCompressionSourceFn> = success;
  const declared: ResolveCompressionSourceReturn = returned;
  assert(declared === success);
});

/** Contract: BoundResolveCompressionSourceFn's declared return admits its error arm. */
Deno.test("BoundResolveCompressionSourceFn's declared return admits its error arm", () => {
  const error: ResolveCompressionSourceErrorReturn = {
    error: new Error('resolveCompressionSource failed'),
    retriable: false,
  };
  const returned: ReturnType<BoundResolveCompressionSourceFn> = error;
  const declared: ResolveCompressionSourceReturn = returned;
  assert(declared === error);
});
