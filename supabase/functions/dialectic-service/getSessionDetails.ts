import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@^2';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';
import type { DialecticSession, DialecticContribution, DialecticSessionModel, AIModelCatalogEntry } from './dialectic.interface.ts';
import type { Database, Json } from '../types_db.ts';

interface GetSessionDetailsPayload {
  sessionId: string;
}

// Define the expected raw row types from the database schema
type SessionTableRow = Database['public']['Tables']['dialectic_sessions']['Row'];
type ProjectAuthLink = { dialectic_projects: { user_id: string } }; // For the auth check from the inner join
type AIProviderCatalogRow = Database['public']['Tables']['ai_providers']['Row'];
type ContributionRow = Database['public']['Tables']['dialectic_contributions']['Row'];

// Define the shape of the data returned by the Supabase query
type RawSessionQueryResult = SessionTableRow & ProjectAuthLink & {
  dialectic_session_models: (DialecticSessionModel & {
    ai_provider: AIProviderCatalogRow | null; // From the aliased join: ai_provider_catalog:ai_provider(*)
  })[] | null;
  dialectic_contributions: ContributionRow[] | null;
};

export async function getSessionDetails(
  payload: GetSessionDetailsPayload,
  dbClient: SupabaseClient,
  user: User
): Promise<{ data?: DialecticSession; error?: ServiceError; status?: number }> {
  const { sessionId } = payload;

  if (!sessionId) {
    logger.warn("getSessionDetails: sessionId not provided in payload");
    return {
      error: {
        message: "sessionId is required for getSessionDetails",
        code: "VALIDATION_ERROR",
      },
      status: 400,
    };
  }

  logger.info(`getSessionDetails: Fetching session details for sessionId: ${sessionId}, userId: ${user.id}`);

  try {
    const { data: sessionData, error: sessionError } = await dbClient
      .from('dialectic_sessions')
      .select<string, RawSessionQueryResult>(`
        *,
        dialectic_projects!inner(user_id),
        dialectic_session_models(*, ai_provider:ai_providers(*)), 
        dialectic_contributions(*)
      `)
      .eq('id', sessionId)
      .eq('dialectic_projects.user_id', user.id)
      .order('created_at', { foreignTable: 'dialectic_contributions', ascending: true })
      .maybeSingle();

    if (sessionError) {
      logger.error(`getSessionDetails: Database error fetching session ${sessionId}`, { error: sessionError });
      return {
        error: {
          message: "Database error fetching session details.",
          code: "DB_FETCH_ERROR",
          details: sessionError.message,
        },
        status: 500,
      };
    }

    if (!sessionData) {
      logger.warn(`getSessionDetails: Session ${sessionId} not found or access denied for user ${user.id}`);
      return {
        error: {
          message: "Session not found or access denied.",
          code: "NOT_FOUND",
        },
        status: 404,
      };
    }

    const { dialectic_projects, ...sessionFieldsFromQuery } = sessionData;

    const mappedSessionModels: DialecticSessionModel[] = (sessionFieldsFromQuery.dialectic_session_models || []).map(sm => {
      // Explicit mapping from AIProviderRow to AIModelCatalogEntry
      let mappedAiProvider: AIModelCatalogEntry | undefined = undefined;
      if (sm.ai_provider) {
        const providerData = sm.ai_provider; // This is AIProviderRow
        mappedAiProvider = {
          id: providerData.id,
          provider_name: providerData.provider || 'UnknownProvider', // Map from providerData.provider
          model_name: providerData.name,         // Map from providerData.name
          api_identifier: providerData.api_identifier,
          description: providerData.description,
          // Fields like strengths, weaknesses, context_window_tokens etc. are not direct columns in ai_providers
          // They might be in providerData.config (Json) or might not be available at this level.
          // For now, setting to null or default. A more robust solution might parse providerData.config.
          strengths: null, 
          weaknesses: null,
          context_window_tokens: null, // Example: providerData.config?.context_window or similar
          input_token_cost_usd_millionths: null,
          output_token_cost_usd_millionths: null,
          max_output_tokens: null,
          is_active: providerData.is_active,
          created_at: providerData.created_at,
          updated_at: providerData.updated_at,
          // supports_image_input, etc., would also likely come from config
        };
      }
      return {
        id: sm.id,
        session_id: sm.session_id,
        model_id: sm.model_id,
        model_role: sm.model_role,
        created_at: sm.created_at,
        ai_provider: mappedAiProvider,
      };
    });

    const mappedContributions: DialecticContribution[] = (sessionFieldsFromQuery.dialectic_contributions || []).map(c => ({
      id: c.id,
      session_id: c.session_id,
      model_id: c.model_id,      
      stage: c.stage,
      iteration_number: c.iteration_number,
      storage_bucket: c.storage_bucket,
      storage_path: c.storage_path,
      mime_type: c.mime_type,
      size_bytes: c.size_bytes,
      raw_response_storage_path: c.raw_response_storage_path,
      tokens_used_input: c.tokens_used_input,
      tokens_used_output: c.tokens_used_output,
      processing_time_ms: c.processing_time_ms,
      citations: c.citations as { text: string; url?: string }[] | null,
      parent_contribution_id: c.target_contribution_id || null,
      created_at: c.created_at,
      updated_at: c.updated_at,
      edit_version: c.edit_version,
      is_latest_edit: c.is_latest_edit,
      original_model_contribution_id: c.original_model_contribution_id,
      error: c.error,
      contribution_type: c.contribution_type,
      model_name: c.model_name, // model_name is in dialectic_contributions table
      user_id: null, // Not directly available from this query, set as null or decide if it should be added
      actual_prompt_sent: null, // Often not a direct DB column here
    }));

    const finalSession: DialecticSession = {
      id: sessionFieldsFromQuery.id,
      project_id: sessionFieldsFromQuery.project_id,
      session_description: sessionFieldsFromQuery.session_description,
      user_input_reference_url: sessionFieldsFromQuery.user_input_reference_url,
      iteration_count: sessionFieldsFromQuery.iteration_count,
      selected_model_catalog_ids: sessionFieldsFromQuery.selected_model_catalog_ids,
      status: sessionFieldsFromQuery.status,
      associated_chat_id: sessionFieldsFromQuery.associated_chat_id,
      current_stage_id: sessionFieldsFromQuery.current_stage_id,
      created_at: sessionFieldsFromQuery.created_at,
      updated_at: sessionFieldsFromQuery.updated_at,
      dialectic_session_models: mappedSessionModels,
      dialectic_contributions: mappedContributions,
    };

    logger.info(`getSessionDetails: Successfully fetched session details for sessionId: ${sessionId}`);
    return { data: finalSession, status: 200 };

  } catch (err) {
    logger.error(`getSessionDetails: Unexpected error for sessionId ${sessionId}`, { error: err });
    return {
      error: {
        message: "An unexpected error occurred.",
        code: "UNEXPECTED_ERROR",
        details: err instanceof Error ? err.message : String(err),
      },
      status: 500,
    };
  }
}
