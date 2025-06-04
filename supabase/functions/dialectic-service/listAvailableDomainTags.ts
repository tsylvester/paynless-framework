import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../_shared/logger.ts';

logger.info("[listAvailableDomainTags] Function started.");

export interface DomainTagDescriptor {
  id: string; // Corresponds to domain_specific_prompt_overlays.id
  domainTag: string;
  description: string | null;
  stageAssociation: string | null;
}

// Define a type for the raw item received from Supabase query
interface SupabaseDomainOverlayItem {
  id: string;
  domain_tag: string;
  description: string | null;
  // system_prompts is an object if a related system_prompt exists, or null.
  system_prompts: { stage_association: string | null; } | null; 
}

export async function listAvailableDomainTags(dbClient: SupabaseClient) {
  logger.info("[listAvailableDomainTags] Attempting to fetch domain tag descriptors.");
  
  const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select(`
      id,
      domain_tag,
      description,
      system_prompts ( stage_association )
    `)
    .eq('is_active', true)
    .neq('domain_tag', null);

  if (error) {
    logger.error("[listAvailableDomainTags] Error fetching domain tag descriptors from DB:", { 
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

  logger.info("[listAvailableDomainTags] Raw data received from DB for descriptors:", { rawData: data });

  // Transform the data to the desired flat structure
  const mappedDescriptors: DomainTagDescriptor[] = ((data as unknown as SupabaseDomainOverlayItem[]) || [])
    .map((item) => ({
      id: item.id,
      domainTag: item.domain_tag,
      description: item.description,
      stageAssociation: item.system_prompts ? item.system_prompts.stage_association : null,
    }))
    // Filter out any items where domain_tag might have been null (e.g., if DB constraint changes or for robustness)
    .filter((descriptor): descriptor is DomainTagDescriptor & { domainTag: string } => descriptor.domainTag !== null);

  // Deduplicate based on domainTag, keeping the first occurrence
  const uniqueDescriptors: DomainTagDescriptor[] = [];
  const seenDomainTags = new Set<string>();

  for (const descriptor of mappedDescriptors) {
    if (!seenDomainTags.has(descriptor.domainTag)) {
      uniqueDescriptors.push(descriptor);
      seenDomainTags.add(descriptor.domainTag);
    }
  }

  logger.info("[listAvailableDomainTags] Transformed and deduplicated descriptors:", { descriptors: uniqueDescriptors });

  // Log the exact object/array the function is about to return
  logger.info("[listAvailableDomainTags] Attempting to return this directly:", { returnValue: uniqueDescriptors });

  // Return the array of descriptors directly. The main router (index.ts) will wrap this in a Response.
  return uniqueDescriptors;
}
  