import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../types_db.ts";
import type { SelectedModels } from "../dialectic-service/dialectic.interface.ts";

export type TierDefinitionRow = Database["public"]["Tables"]["tier_definitions"]["Row"];

export interface ValidateModelTierAccessRow {
	valid: boolean;
	user_tier_level: number;
	max_models_per_project: number | null;
	over_model_limit: boolean;
	disallowed_model_ids: string[];
}

export type ValidateModelTierAccessRpcData = ValidateModelTierAccessRow[];

export type ValidateModelTierAccessRpcResponse = ValidateModelTierAccessRpcData | null;

export interface TestTierIntent {
	minModelsPerProject?: number;
	minOutputCapTokens?: number;
	tierLevel?: number;
	tierName?: string;
}

export interface TestUserWithTierSetup {
	userId: string;
	userClient: SupabaseClient<Database>;
	jwt: string;
	effectiveTier: TierDefinitionRow;
}

export interface CoreSelectModelsForTierResult {
	selectedModels: SelectedModels[];
	modelIds: string[];
}

export interface ValidateModelTierAccessOk {
	kind: "ok";
	row: ValidateModelTierAccessRow;
}

export interface ValidateModelTierAccessMissing {
	kind: "missing";
	reason: string;
}

export type ValidateModelTierAccessParseResult =
	| ValidateModelTierAccessOk
	| ValidateModelTierAccessMissing;
