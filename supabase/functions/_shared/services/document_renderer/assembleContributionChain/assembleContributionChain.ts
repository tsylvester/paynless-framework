import type { DialecticContributionRow } from "../../../../dialectic-service/dialectic.interface.ts";
import type {
  AssembleContributionChainDeps,
  AssembleContributionChainParams,
  AssembleContributionChainPayload,
  AssembleContributionChainReturn,
} from "./assembleContributionChain.interface.ts";
import { deconstructStoragePath } from "../../../utils/path_deconstructor.ts";
import { extractSourceGroupFragment } from "../../../utils/path_utils.ts";
import { isRecord } from "../../../utils/type_guards.ts";
import {
  isAssembleContributionChainParams,
  isAssembleContributionChainPayload,
} from "./assembleContributionChain.guard.ts";

export class ContributionChainAssemblyError extends Error {}

export async function assembleContributionChain(
  _deps: AssembleContributionChainDeps,
  params: AssembleContributionChainParams,
  payload: AssembleContributionChainPayload,
): Promise<AssembleContributionChainReturn> {
  if (!isAssembleContributionChainParams(params)) {
    return { error: new ContributionChainAssemblyError("Invalid params"), retriable: false };
  }
  if (!isAssembleContributionChainPayload(payload)) {
    return { error: new ContributionChainAssemblyError("Invalid payload"), retriable: false };
  }

  const { dbClient } = params;

  // 1) Load contribution rows for this document chain using DB-side filtering and ordering
  const { data: rows, error: selectError } = await dbClient
    .from("dialectic_contributions")
    .select("*")
    .eq("session_id", payload.sessionId)
    .eq("iteration_number", payload.iterationNumber)
    .contains("document_relationships", { [payload.stageSlug]: payload.documentIdentity })
    .order("edit_version", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<DialecticContributionRow[]>();

  if (selectError) {
    return { error: selectError, retriable: false };
  }

  if (rows.length === 0) {
    return { error: new ContributionChainAssemblyError("No contribution chunks found for requested document"), retriable: false };
  }

  // 2) Filter chunks to only those that match the document identity
  // The DB query should have filtered, but we double-check here for safety
  const matchingChunks = rows.filter(row => {
    if (!isRecord(row.document_relationships)) {
      return false;
    }
    const relationships = row.document_relationships;
    const stageValue = relationships[payload.stageSlug];
    return stageValue === payload.documentIdentity;
  });

  if (matchingChunks.length === 0) {
    return { error: new ContributionChainAssemblyError("No matching contribution chunks found for requested document"), retriable: false };
  }

  // 3) Prefer latest user edits over model chunks when duplicates exist (by file_name)
  const dedupedByFile: Record<string, DialecticContributionRow> = {};
  for (const row of matchingChunks) {
    if (typeof row.file_name !== "string") {
      return { error: new ContributionChainAssemblyError("Invalid file name type"), retriable: false };
    }
    const existing = dedupedByFile[row.file_name];
    if (!existing) {
      dedupedByFile[row.file_name] = row;
    } else {
      const preferCurrent = Boolean(row.original_model_contribution_id) || (!existing.original_model_contribution_id && row.is_latest_edit);
      if (preferCurrent) dedupedByFile[row.file_name] = row;
    }
  }
  const dedupedChunks = Object.values(dedupedByFile);

  // 4) Find the root contribution (the one with documentIdentity and null target_contribution_id)
  const rootChunk = dedupedChunks.find(chunk => {
    if (!isRecord(chunk.document_relationships)) {
      return false;
    }
    const relationships = chunk.document_relationships;
    const stageValue = relationships[payload.stageSlug];
    return stageValue === payload.documentIdentity && chunk.target_contribution_id === null;
  });

  if (!rootChunk) {
    return { error: new ContributionChainAssemblyError(`No root contribution found for document identity ${payload.documentIdentity}`), retriable: false };
  }

  // 5) Build ordered chain by traversing target_contribution_id links starting from root
  // This follows the same pattern as assembleAndSaveFinalDocument in file_manager.ts
  const chunkMap = new Map(dedupedChunks.map(c => [c.id, c]));
  const orderedChunks: DialecticContributionRow[] = [];
  let currentId: string | null = rootChunk.id;

  while (currentId) {
    const currentChunk = chunkMap.get(currentId);
    if (!currentChunk) {
      // Chain is broken - this shouldn't happen if data is consistent
      break;
    }
    orderedChunks.push(currentChunk);
    // Find the next chunk in the chain (one that has target_contribution_id pointing to current)
    const nextChunk = dedupedChunks.find(c => c.target_contribution_id === currentId);
    currentId = nextChunk ? nextChunk.id : null;
  }

  if (orderedChunks.length === 0) {
    return { error: new ContributionChainAssemblyError("No ordered chunks found for document chain"), retriable: false };
  }

  const uniqueChunks = orderedChunks;

  // 6) Parse model slug and attempt from the first/base chunk
  const base = uniqueChunks[0];
  if (typeof base.file_name !== "string") {
    return { error: new ContributionChainAssemblyError("Invalid file name type"), retriable: false };
  }
  const info = deconstructStoragePath({ storageDir: base.storage_path, fileName: base.file_name });
  if (!info.modelSlug || typeof info.attemptCount !== "number") {
    return { error: new ContributionChainAssemblyError("Unable to parse model slug and attempt count from path"), retriable: false };
  }
  const modelSlug = info.modelSlug;
  const attemptCount = info.attemptCount;

  // Extract sourceGroupFragment from base chunk's document_relationships.source_group
  // Extract sourceAnchorModelSlug from deconstructed path info (if available for antithesis patterns)
  const sourceGroup = isRecord(base.document_relationships) && typeof base.document_relationships.source_group === 'string'
    ? base.document_relationships.source_group
    : undefined;
  const sourceGroupFragment = extractSourceGroupFragment(sourceGroup);
  const sourceAnchorModelSlug = info.sourceAnchorModelSlug;

  return { orderedChunks: uniqueChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug };
}
