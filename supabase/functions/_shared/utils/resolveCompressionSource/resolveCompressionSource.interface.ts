import type { InputRule } from "../../../dialectic-service/dialectic.interface.ts";
import type { ILogger, OutboundDocument } from "../../types.ts";
import type { CompressionSourceType, FileType } from "../../types/file_manager.types.ts";

export interface ResourceDocument extends OutboundDocument {
  document_key: FileType;
  stage_slug: string;
  type: InputRule['type'];
}

export type ResourceDocuments = ResourceDocument[];

export type CompressibleInputRuleType = Exclude<InputRule['type'], 'seed_prompt' | 'header_context' | 'contribution'>;

export interface ResolveCompressionSourceDeps {
  logger: ILogger;
}

export type ResolveCompressionSourceParams = Record<string, never>;

export interface ResolveCompressionSourcePayload {
  document: ResourceDocument;
}

export interface CompressibleSourceReturn {
  compressible: true;
  sourceType: CompressionSourceType;
  documentKey: FileType;
}

export interface NotCompressibleSourceReturn {
  compressible: false;
}

export type ResolveCompressionSourceSuccessReturn = CompressibleSourceReturn | NotCompressibleSourceReturn;

export interface ResolveCompressionSourceErrorReturn {
  error: Error;
  retriable: boolean;
}

export type ResolveCompressionSourceReturn = ResolveCompressionSourceSuccessReturn | ResolveCompressionSourceErrorReturn;

export type ResolveCompressionSourceFn = (
  deps: ResolveCompressionSourceDeps,
  params: ResolveCompressionSourceParams,
  payload: ResolveCompressionSourcePayload,
) => ResolveCompressionSourceReturn;

export type BoundResolveCompressionSourceFn = (
  params: ResolveCompressionSourceParams,
  payload: ResolveCompressionSourcePayload,
) => ResolveCompressionSourceReturn;
