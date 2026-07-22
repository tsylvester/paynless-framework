import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../types_db.ts";
import type { DialecticContributionRow } from "../../../../dialectic-service/dialectic.interface.ts";
import type { DialecticStageSlug } from "../../../types/file_manager.types.ts";

export interface AssembleContributionChainDeps {}

export interface AssembleContributionChainParams {
  dbClient: SupabaseClient<Database>;
}

export interface AssembleContributionChainPayload {
  sessionId: string;
  iterationNumber: number;
  stageSlug: DialecticStageSlug;
  documentIdentity: string;
}

export type AssembleContributionChainSuccessReturn = {
  orderedChunks: DialecticContributionRow[];
  modelSlug: string;
  attemptCount: number;
  sourceGroupFragment: string | undefined;
  sourceAnchorModelSlug: string | undefined;
};

export type AssembleContributionChainErrorReturn = {
  error: Error;
  retriable: boolean;
};

export type AssembleContributionChainReturn =
  | AssembleContributionChainSuccessReturn
  | AssembleContributionChainErrorReturn;

export type AssembleContributionChainFn = (
  deps: AssembleContributionChainDeps,
  params: AssembleContributionChainParams,
  payload: AssembleContributionChainPayload,
) => Promise<AssembleContributionChainReturn>;

export type BoundAssembleContributionChainFn = (
  params: AssembleContributionChainParams,
  payload: AssembleContributionChainPayload,
) => Promise<AssembleContributionChainReturn>;
