import { MockLogger } from "../../logger.mock.ts";
import { FileType } from "../../types/file_manager.types.ts";
import type {
  ResourceDocument,
  ResolveCompressionSourceDeps,
  ResolveCompressionSourceParams,
  ResolveCompressionSourcePayload,
  CompressibleSourceReturn,
  NotCompressibleSourceReturn,
  ResolveCompressionSourceErrorReturn,
  ResolveCompressionSourceFn,
  BoundResolveCompressionSourceFn,
} from "./resolveCompressionSource.interface.ts";

export type ResourceDocumentOverrides = Partial<ResourceDocument>;

export function buildResourceDocument(overrides?: ResourceDocumentOverrides): ResourceDocument {
  const base: ResourceDocument = {
    id: 'doc-1',
    content: 'document content',
    document_key: FileType.business_case,
    stage_slug: 'thesis',
    type: 'document',
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResourceDocumentCorruptions = { [K in keyof ResourceDocument]?: unknown };

export function invalidateResourceDocument(corruptions: ResourceDocumentCorruptions): unknown {
  return { ...buildResourceDocument(), ...corruptions };
}

export type ResolveCompressionSourceDepsOverrides = Partial<ResolveCompressionSourceDeps>;

export function buildResolveCompressionSourceDeps(overrides?: ResolveCompressionSourceDepsOverrides): ResolveCompressionSourceDeps {
  const base: ResolveCompressionSourceDeps = {
    logger: new MockLogger(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveCompressionSourceDepsCorruptions = { [K in keyof ResolveCompressionSourceDeps]?: unknown };

export function invalidateResolveCompressionSourceDeps(corruptions: ResolveCompressionSourceDepsCorruptions): unknown {
  return { ...buildResolveCompressionSourceDeps(), ...corruptions };
}

export type ResolveCompressionSourceParamsOverrides = Partial<ResolveCompressionSourceParams>;

export function buildResolveCompressionSourceParams(_overrides?: ResolveCompressionSourceParamsOverrides): ResolveCompressionSourceParams {
  return {};
}

export type ResolveCompressionSourceParamsCorruptions = { [K in keyof ResolveCompressionSourceParams]?: unknown };

export function invalidateResolveCompressionSourceParams(_corruptions: ResolveCompressionSourceParamsCorruptions): unknown {
  return { unexpected: true };
}

export type ResolveCompressionSourcePayloadOverrides = Partial<ResolveCompressionSourcePayload>;

export function buildResolveCompressionSourcePayload(overrides?: ResolveCompressionSourcePayloadOverrides): ResolveCompressionSourcePayload {
  const base: ResolveCompressionSourcePayload = {
    document: buildResourceDocument(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveCompressionSourcePayloadCorruptions = { [K in keyof ResolveCompressionSourcePayload]?: unknown };

export function invalidateResolveCompressionSourcePayload(corruptions: ResolveCompressionSourcePayloadCorruptions): unknown {
  return { ...buildResolveCompressionSourcePayload(), ...corruptions };
}

export type CompressibleSourceReturnOverrides = Partial<CompressibleSourceReturn>;

export function buildCompressibleSourceReturn(overrides?: CompressibleSourceReturnOverrides): CompressibleSourceReturn {
  const base: CompressibleSourceReturn = {
    compressible: true,
    sourceType: 'resource',
    documentKey: FileType.business_case,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CompressibleSourceReturnCorruptions = { [K in keyof CompressibleSourceReturn]?: unknown };

export function invalidateCompressibleSourceReturn(corruptions: CompressibleSourceReturnCorruptions): unknown {
  return { ...buildCompressibleSourceReturn(), ...corruptions };
}

export type NotCompressibleSourceReturnOverrides = Partial<NotCompressibleSourceReturn>;

export function buildNotCompressibleSourceReturn(overrides?: NotCompressibleSourceReturnOverrides): NotCompressibleSourceReturn {
  const base: NotCompressibleSourceReturn = {
    compressible: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type NotCompressibleSourceReturnCorruptions = { [K in keyof NotCompressibleSourceReturn]?: unknown };

export function invalidateNotCompressibleSourceReturn(corruptions: NotCompressibleSourceReturnCorruptions): unknown {
  return { ...buildNotCompressibleSourceReturn(), ...corruptions };
}

export type ResolveCompressionSourceErrorReturnOverrides = Partial<ResolveCompressionSourceErrorReturn>;

export function buildResolveCompressionSourceErrorReturn(overrides?: ResolveCompressionSourceErrorReturnOverrides): ResolveCompressionSourceErrorReturn {
  const base: ResolveCompressionSourceErrorReturn = {
    error: new Error('resolveCompressionSource failed'),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ResolveCompressionSourceErrorReturnCorruptions = { [K in keyof ResolveCompressionSourceErrorReturn]?: unknown };

export function invalidateResolveCompressionSourceErrorReturn(corruptions: ResolveCompressionSourceErrorReturnCorruptions): unknown {
  return { ...buildResolveCompressionSourceErrorReturn(), ...corruptions };
}

export const mockResolveCompressionSource: ResolveCompressionSourceFn = (_deps, _params, _payload) => {
  return buildCompressibleSourceReturn();
};

export const mockBoundResolveCompressionSource: BoundResolveCompressionSourceFn = (_params, _payload) => {
  return buildCompressibleSourceReturn();
};
