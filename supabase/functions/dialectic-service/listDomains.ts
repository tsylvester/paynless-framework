import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { ServiceError } from '../_shared/types.ts';
import { logger } from '../_shared/logger.ts';

// Matches the structure of the dialectic_domains table
export interface DialecticDomain {
  id: string;
  name: string;
  description: string | null;
  parent_domain_id: string | null;
}

export async function listDomains(
  dbClient: SupabaseClient
): Promise<{ data?: DialecticDomain[]; error?: ServiceError }> {
  logger.info('Fetching all dialectic domains.');

  const { data, error } = await dbClient
    .from('dialectic_domains')
    .select('id, name, description, parent_domain_id')
    .order('name', { ascending: true });

  if (error) {
    logger.error('Error fetching dialectic domains:', { error });
    return {
      error: {
        message: 'Could not fetch dialectic domains.',
        status: 500,
        code: 'DB_FETCH_FAILED',
        details: error.message,
      },
    };
  }

  logger.info(`Successfully fetched ${data.length} dialectic domains.`);
  return { data: data as DialecticDomain[] };
} 