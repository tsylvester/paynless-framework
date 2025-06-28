import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../_shared/logger.ts';

logger.info("[listAvailableDomains] Function started.");

export interface DomainDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainId: string;
  description: string | null;
  stageAssociation: string | null;
}

// Define a type for the raw item received from Supabase query
interface SupabaseDomainOverlayItem {
  id: string;
  domain_id: string;
  description: string | null;
  // system_prompts is an object if a related system_prompt exists, or null.
  system_prompts: { stage_association: string | null; } | null; 
}

// Define a type for the expected request body or query params if any
// For this modification, we expect an optional stageAssociation in query params
interface ListAvailableDomainsParams {
  stageAssociation?: string;
}

export async function listAvailableDomains(
  dbClient: SupabaseClient, 
  params?: ListAvailableDomainsParams // Accept params, which could come from query string
) {
  logger.info("[listAvailableDomains] Attempting to fetch domain tag descriptors.", { params });
  
  let query = dbClient
    .from('domain_specific_prompt_overlays')
    .select(`
      id,
      domain_id,
      description,
      system_prompts ( stage_association )
    `)
    .eq('is_active', true)
    .neq('domain_id', null);

  // If stageAssociation is provided in params, add it to the query
  if (params?.stageAssociation) {
    logger.info(`[listAvailableDomains] Filtering by stageAssociation: ${params.stageAssociation}`);
    // Attempting to filter on the related table's column.
    // The string 'system_prompts.stage_association' is passed to PostgREST.
    // TypeScript's strictness with column names known at compile time can be an issue here.
    query = query.eq('system_prompts.stage_association', params.stageAssociation);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("[listAvailableDomains] Error fetching domain tag descriptors from DB:", { 
      errorDetails: error.message, 
      errorCode: error.code, 
      errorHint: error.hint 
    });
    return { 
      error: { 
        message: "Failed to fetch domain tag descriptors", 
        details: error.message, 
        status: 500, 
        code: "DB_FETCH_ERROR" 
      } 
    };
  }

  logger.info("[listAvailableDomains] Raw data received from DB for descriptors:", { rawData: data });

  // Transform the data to the desired flat structure
  const mappedDescriptors: DomainDescriptor[] = ((data as unknown as SupabaseDomainOverlayItem[]) || [])
    .map((item) => ({
      id: item.id,
      domainId: item.domain_id,
      description: item.description,
      stageAssociation: item.system_prompts ? item.system_prompts.stage_association : null,
    }))
    // Filter out any items where domain_id might have been null (e.g., if DB constraint changes or for robustness)
    .filter((descriptor): descriptor is DomainDescriptor & { domainId: string } => descriptor.domainId !== null);

  // Deduplicate based on domain, keeping the first occurrence
  const uniqueDescriptors: DomainDescriptor[] = [];
  const seenDomainIds = new Set<string>();

  for (const descriptor of mappedDescriptors) {
    if (!seenDomainIds.has(descriptor.domainId)) {
      uniqueDescriptors.push(descriptor);
      seenDomainIds.add(descriptor.domainId);
    }
  }

  logger.info("[listAvailableDomains] Transformed and deduplicated descriptors:", { descriptors: uniqueDescriptors });

  // Log the exact object/array the function is about to return
  logger.info("[listAvailableDomains] Attempting to return this directly:", { returnValue: uniqueDescriptors });

  // Return the array of descriptors directly. The main router (index.ts) will wrap this in a Response.
  return uniqueDescriptors;
}
  