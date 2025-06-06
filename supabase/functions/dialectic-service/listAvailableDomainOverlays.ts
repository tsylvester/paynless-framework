import type { DomainOverlayDescriptor } from './dialectic.interface.ts'; 
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'; // Aligned with index.ts and createSupabaseAdminClient
import { logger } from '../_shared/logger.ts'; // Import the shared logger
import type { Json } from '../types_db.ts'; // Import Json type for overlay_values

interface QueryResultItem {
  id: string;
  domain_tag: string;
  description: string | null;
  overlay_values: Json; // Added field, using Json type from db_types
  is_active: boolean; // from domain_specific_prompt_overlays
  // system_prompts will likely be an object here due to the !inner join and specific EQs
  // or it could be an array if there were multiple system_prompts per overlay (not our current case)
  system_prompts: { 
    stage_association: string;
    is_active: boolean;
  } | Array<{ stage_association: string; is_active: boolean; }> | null;
}

export async function listAvailableDomainOverlays(
  stageAssociation: string,
  supabaseClient: SupabaseClient 
): Promise<DomainOverlayDescriptor[]> {
  logger.info(`[listAvailableDomainOverlays] Function started. Stage association: ${stageAssociation}`);

  if (!stageAssociation) {
    logger.warn('[listAvailableDomainOverlays] Called without stageAssociation');
    return [];
  }

  const { data, error } = await supabaseClient
    .from('domain_specific_prompt_overlays')
    .select('id, domain_tag, description, overlay_values, is_active, system_prompts!inner(stage_association, is_active)')
    .eq('is_active', true)
    .eq('system_prompts.is_active', true)
    .eq('system_prompts.stage_association', stageAssociation);

  if (error) {
    logger.error('[listAvailableDomainOverlays] Error fetching from Supabase:', { errorDetails: error });
    return [];
  }

  logger.info('[listAvailableDomainOverlays] Raw data received from DB:', { rawData: data });

  if (!data || data.length === 0) { // Check if data is null or an empty array
    logger.warn('[listAvailableDomainOverlays] No data received from DB query or data array is empty.');
    return [];
  }

  const queryResult = data as QueryResultItem[];

  // Filter out items where system_prompts is null or an empty array
  const filteredQueryResult = queryResult.filter(item => {
    if (!item.system_prompts) { // Handles null or undefined
      logger.warn('[listAvailableDomainOverlays] Filtering out item due to null/undefined system_prompts:', { itemId: item.id });
      return false;
    }
    // The type QueryResultItem allows system_prompts to be an object or an array.
    // If it's an array, check if it's empty.
    if (Array.isArray(item.system_prompts) && item.system_prompts.length === 0) {
      logger.warn('[listAvailableDomainOverlays] Filtering out item due to empty system_prompts array:', { itemId: item.id });
      return false;
    }
    // If it's a single object (expected from !inner join), it's considered valid as long as it exists.
    // The DB query already ensures system_prompts.is_active and system_prompts.stage_association match.
    return true;
  });

  const mappedData = filteredQueryResult.map((item) => {
    logger.info('[listAvailableDomainOverlays] Mapping item:', { item });
    
    // The SQL query already filters by system_prompts.stage_association = stageAssociation.
    // So, we can directly use the input stageAssociation for the mapped object.
    // No need for the complex check and potential filtering here if the query is correct.

    return {
      id: item.id,
      domainTag: item.domain_tag,
      description: item.description,
      overlay_values: item.overlay_values as Record<string, unknown> | string | null, 
      stageAssociation: stageAssociation, // Use the input stageAssociation directly
    };
  }); // No .filter(item => item !== null) needed if we don't return null from map

  logger.info('[listAvailableDomainOverlays] Mapped data being returned:', { mappedData });
  return mappedData;
}

// Removed serve() and addEventListener(). This file now only exports the logic function.
