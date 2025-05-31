import { DomainOverlayItem, extractDistinctDomainTags } from "../_shared/domain-utils.ts";
import type { SupabaseClient } from '@supabase/supabase-js';

console.log("listAvailableDomainTags function started");

export async function listAvailableDomainTags(dbClient: SupabaseClient) {
const { data, error } = await dbClient
    .from('domain_specific_prompt_overlays')
    .select('domain_tag')
    .neq('domain_tag', null);

if (error) {
    // console.error("Error fetching domain tags:", error); // Logging can be handled by the caller or a logger utility if injected
    return { error: { message: "Failed to fetch domain tags", details: error.message, status: 500, code: "DB_FETCH_ERROR" } };
}

// Use the imported utility function
const distinctTags = extractDistinctDomainTags(data as DomainOverlayItem[]);
return { data: distinctTags };
}
  