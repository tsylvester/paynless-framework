import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { ServiceError } from "../_shared/types.ts";
import type { Database } from "../types_db.ts";
import { logger } from "../_shared/logger.ts";
import type { AiProvidersRow } from "./dialectic.interface.ts";

export async function listModelCatalog(
  dbClient: SupabaseClient<Database>,
): Promise<{ data?: AiProvidersRow[]; error?: ServiceError }> {
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

    const catalog: AiProvidersRow[] = rows ?? [];
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
