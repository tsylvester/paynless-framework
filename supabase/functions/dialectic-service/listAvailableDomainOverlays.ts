import type { DomainOverlayDescriptor } from './dialectic.interface.ts'; 
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'; // Aligned with index.ts and createSupabaseAdminClient
import { logger } from '../_shared/logger.ts'; // Import the shared logger

interface QueryResultItem {
  id: string;
  domain_tag: string;
  description: string | null;
  is_active: boolean; // from domain_specific_prompt_overlays
  system_prompts: Array<{
    stage_association: string;
    is_active: boolean; // from system_prompts
  }> | null; // system_prompts can be null if the join condition is not met, !inner should make it an array with one item if matched.
}

export async function listAvailableDomainOverlays(
  stageAssociation: string,
  supabaseClient: SupabaseClient 
): Promise<DomainOverlayDescriptor[]> {
  if (!stageAssociation) {
    logger.warn('listAvailableDomainOverlays called without stageAssociation');
    return [];
  }

  const { data, error } = await supabaseClient
    .from('domain_specific_prompt_overlays')
    .select('id, domain_tag, description, is_active, system_prompts!inner(stage_association, is_active)')
    .eq('system_prompts.stage_association', stageAssociation)
    .eq('is_active', true) // Filter for active overlays
    .eq('system_prompts.is_active', true); // Filter for active associated system prompts

  if (error) {
    logger.error('Error fetching domain overlay details:', { error });
    // Logic functions should throw errors for the central handler in index.ts to catch and format.
    throw new Error(error.message); 
  }

  if (!data) {
    return [];
  }

  // Ensure system_prompts is not null and has at least one element
  const mappedData: DomainOverlayDescriptor[] = data
    .filter((item: QueryResultItem) => item.system_prompts && item.system_prompts.length > 0) 
    .map((item: QueryResultItem) => ({
      id: item.id,
      domainTag: item.domain_tag,
      description: item.description,
      // Access the first element of the system_prompts array
      stageAssociation: item.system_prompts![0].stage_association, 
    }));

  return mappedData;
}

// Removed serve() and addEventListener(). This file now only exports the logic function.
