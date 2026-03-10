import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import { Messages } from "../types.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";

export type GatherContinuationInputsFn = (
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  chunkId: string,
) => Promise<Messages[]>;

export async function gatherContinuationInputs(
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  chunkId: string,
): Promise<Messages[]> {
  // 1. Fetch the root chunk to get the stage slug and other base info.
  const { data: rootChunk, error: rootChunkError } = await dbClient
    .from("dialectic_contributions")
    .select("*")
    .eq("id", chunkId)
    .single();

  if (rootChunkError || !rootChunk) {
    console.error(
      `[gatherContinuationInputs] Failed to retrieve root contribution.`,
      { error: rootChunkError, chunkId },
    );
    throw new Error(`Failed to retrieve root contribution for id ${chunkId}.`);
  }

  // 2. Get the stage slug directly from the stage field
  if (
    !rootChunk.stage || typeof rootChunk.stage !== "string" ||
    rootChunk.stage.trim().length === 0
  ) {
    throw new Error(`Root contribution ${chunkId} has no stage information`);
  }

  const stageSlug = rootChunk.stage;

  // 3. Use a .contains query to find all related chunks.
  const queryMatcher = { [stageSlug]: chunkId };
  const { data: allChunks, error: chunksError } = await dbClient
    .from("dialectic_contributions")
    .select("*")
    .contains("document_relationships", queryMatcher);

  if (chunksError) {
    console.error(
      `[gatherContinuationInputs] Failed to retrieve contribution chunks.`,
      { error: chunksError, chunkId },
    );
    throw new Error(`Failed to retrieve contribution chunks for root ${chunkId}.`);
  }

  // It's valid to have zero continuation chunks (non-continuation flows or single-shot completions).
  const chunksForAssembly = Array.isArray(allChunks) ? allChunks : [];

  // Ensure the root chunk is always included for sorting, even if it's the only one.
  const combinedChunks = [...chunksForAssembly];
  if (!combinedChunks.some((c) => c.id === rootChunk.id)) {
    combinedChunks.push(rootChunk);
  }

  // Sort chunks client-side: root first, then by document_relationships.turnIndex, then created_at
  const getTurnIndex = (
    c: Database["public"]["Tables"]["dialectic_contributions"]["Row"],
  ): number => {
    const rel = c && typeof c === "object" ? c.document_relationships : null;
    if (
      rel && typeof rel === "object" && !Array.isArray(rel) && "turnIndex" in rel
    ) {
      const ti = rel.turnIndex;
      if (typeof ti === "number") return ti;
    }
    return Number.POSITIVE_INFINITY;
  };
  const parseTs = (s?: string): number => (s ? Date.parse(s) : 0);
  const allChunksSorted = combinedChunks.slice().sort(
    (
      a: Database["public"]["Tables"]["dialectic_contributions"]["Row"],
      b: Database["public"]["Tables"]["dialectic_contributions"]["Row"],
    ) => {
      if (a.id === chunkId) return -1;
      if (b.id === chunkId) return 1;
      const tiA = getTurnIndex(a);
      const tiB = getTurnIndex(b);
      if (tiA !== tiB) return tiA - tiB;
      return parseTs(a.created_at) - parseTs(b.created_at);
    },
  );

  if (!rootChunk.storage_path) {
    throw new Error(`Root contribution ${rootChunk.id} is missing a storage_path.`);
  }

  // 4. Query for the session's seed_prompt from dialectic_project_resources.
  // The seed prompt is created once per session (at thesis stage) and reused across all stages.
  // It is stored as a project-level resource, not stage-specific.
  const { data: seedPromptResource, error: seedResourceError } = await dbClient
    .from("dialectic_project_resources")
    .select("storage_path, file_name, storage_bucket")
    .eq("resource_type", "seed_prompt")
    .eq("session_id", rootChunk.session_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (seedResourceError || !seedPromptResource) {
    console.error(
      `[gatherContinuationInputs] Failed to query seed prompt resource.`,
      { error: seedResourceError, sessionId: rootChunk.session_id, chunkId },
    );
    throw new Error(`Failed to query seed prompt for session ${rootChunk.session_id}.`);
  }

  if (!seedPromptResource.storage_path || !seedPromptResource.file_name || !seedPromptResource.storage_bucket) {
    console.error(
      `[gatherContinuationInputs] Seed prompt resource missing required fields.`,
      { seedPromptResource, sessionId: rootChunk.session_id, chunkId },
    );
    throw new Error(`Seed prompt resource incomplete for session ${rootChunk.session_id}.`);
  }

  const seedPromptPath = `${seedPromptResource.storage_path}/${seedPromptResource.file_name}`;
  const { data: seedPromptContentData, error: seedDownloadError } =
    await downloadFromStorageFn(seedPromptResource.storage_bucket, seedPromptPath);

  if (seedDownloadError || !seedPromptContentData) {
    console.error(
      `[gatherContinuationInputs] Failed to download seed prompt.`,
      { path: seedPromptPath, error: seedDownloadError },
    );
    throw new Error(`Failed to download seed prompt for root ${chunkId}.`);
  }
  const seedPromptContent = new TextDecoder().decode(seedPromptContentData);

  // 5. Download and create atomic messages for all chunks.
  const messages: Messages[] = [{ role: "user", content: seedPromptContent }];
  for (let i = 0; i < allChunksSorted.length; i++) {
    const chunk = allChunksSorted[i];
    if (chunk.storage_path && chunk.file_name && chunk.storage_bucket) {
      const chunkPath = `${chunk.storage_path}/${chunk.file_name}`;
      const { data: chunkContentData, error: chunkDownloadError } =
        await downloadFromStorageFn(chunk.storage_bucket, chunkPath);

      if (chunkDownloadError || !chunkContentData) {
        console.error(
          `[gatherContinuationInputs] Failed to download chunk content.`,
          { path: chunkPath, error: chunkDownloadError },
        );
        throw new Error(`Failed to download content for chunk ${chunk.id}.`);
      }
      const chunkContent = new TextDecoder().decode(chunkContentData);
      messages.push({
        role: "assistant",
        content: chunkContent,
        id: chunk.id,
      });

      // Only add a "Please continue." message if it's NOT the last chunk.
      if (i < allChunksSorted.length - 1) {
        messages.push({
          role: "user",
          content: "Please continue.",
        });
      }
    }
  }

  // 6. Return formatted messages.
  return messages;
}
