import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { ServiceError } from "../_shared/types.ts";
import type { AIModelCatalogEntry } from "./dialectic.interface.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";

type AiProvidersRow = Database["public"]["Tables"]["ai_providers"]["Row"];

function rowToCatalogEntry(row: AiProvidersRow): AIModelCatalogEntry {
  const entireRow: AiProvidersRow = {
    id: row.id,
    name: row.name,
    api_identifier: row.api_identifier,
    provider: row.provider,
    description: row.description,
    config: row.config,
    is_active: row.is_active,
    is_default_embedding: row.is_default_embedding,
    is_default_generation: row.is_default_generation,
    is_enabled: row.is_enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const modelCatalogEntry: AIModelCatalogEntry = {
    id: entireRow.id,
    provider_name: entireRow.provider ?? "",
    model_name: entireRow.name,
    api_identifier: entireRow.api_identifier,
    description: entireRow.description,
    strengths: null,
    weaknesses: null,
    context_window_tokens: null,
    input_token_cost_usd_millionths: null,
    output_token_cost_usd_millionths: null,
    max_output_tokens: null,
    is_active: entireRow.is_active,
    created_at: entireRow.created_at,
    updated_at: entireRow.updated_at,
    is_default_generation: entireRow.is_default_generation,
  };

  return modelCatalogEntry;
}

export async function listModelCatalog(
  dbClient: SupabaseClient<Database>
): Promise<{ data?: AIModelCatalogEntry[]; error?: ServiceError }> {
  logger.info("Fetching AI model catalog.");

  try {
    const { data: rows, error } = await dbClient
      .from("ai_providers")
      .select("*")
      .eq("is_active", true)
      .eq("is_enabled", true)
      .order("name", { ascending: true });

    if (error) {
      logger.error("Error fetching AI model catalog.", { error });
      return {
        error: {
          message: "Could not fetch AI model catalog.",
          status: 500,
          code: "DB_FETCH_FAILED",
          details: error.message,
        },
      };
    }

    const catalog: AIModelCatalogEntry[] = (rows ?? []).map((row: AiProvidersRow) =>
      rowToCatalogEntry(row)
    );
    logger.info(`Successfully fetched ${catalog.length} AI model catalog entries.`);
    return { data: catalog };
  } catch (err) {
    const message = err instanceof Error ? err.message : "List model catalog failed.";
    logger.error("Error in listModelCatalog.", { error: message, err });
    return {
      error: {
        message,
        status: 500,
        code: "LIST_MODEL_CATALOG_FAILED",
        details: message,
      },
    };
  }
}
