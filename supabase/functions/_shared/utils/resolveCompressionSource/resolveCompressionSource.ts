import type {
  ResolveCompressionSourceDeps,
  ResolveCompressionSourceParams,
  ResolveCompressionSourcePayload,
  CompressibleSourceReturn,
  NotCompressibleSourceReturn,
  ResolveCompressionSourceReturn,
  ResolveCompressionSourceFn,
  CompressibleInputRuleType,
} from "./resolveCompressionSource.interface.ts";
import { isCompressibleInputRuleType } from "./resolveCompressionSource.guard.ts";
import type { CompressionSourceType } from "../../types/file_manager.types.ts";

const COMPRESSION_SOURCE_BY_RULE_TYPE: Record<CompressibleInputRuleType, CompressionSourceType> = {
  document: 'resource',
  project_resource: 'resource',
  feedback: 'feedback',
};

export const resolveCompressionSource: ResolveCompressionSourceFn = (
  deps: ResolveCompressionSourceDeps,
  _params: ResolveCompressionSourceParams,
  payload: ResolveCompressionSourcePayload,
): ResolveCompressionSourceReturn => {
  const document = payload.document;

  if (!isCompressibleInputRuleType(document.type)) {
    deps.logger.debug(
      `resolveCompressionSource: excluding document ${document.id} of type ${document.type}`,
    );
    const notCompressible: NotCompressibleSourceReturn = { compressible: false };
    return notCompressible;
  }

  const sourceType: CompressionSourceType = COMPRESSION_SOURCE_BY_RULE_TYPE[document.type];
  deps.logger.debug(
    `resolveCompressionSource: admitting document ${document.id} of type ${document.type} as source class ${sourceType}`,
  );
  const compressible: CompressibleSourceReturn = {
    compressible: true,
    sourceType,
    documentKey: document.document_key,
  };
  return compressible;
};
