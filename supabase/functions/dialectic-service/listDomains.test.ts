import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import { listDomains, DialecticDomain } from './listDomains.ts';

Deno.test('listDomains should fetch and return a list of domains successfully', async () => {
  // Arrange
  const mockDomains: DialecticDomain[] = [
    { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null, is_enabled: true },
    { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null, is_enabled: true },
    { id: '3', name: 'Web Development', description: 'A subset of software', parent_domain_id: '1', is_enabled: true },
  ];

  const mockSupabaseClient = {
    from: (table: string) => {
      assertEquals(table, 'dialectic_domains');
      return {
        select: (query: string) => {
          assertEquals(query, 'id, name, description, parent_domain_id, is_enabled');
          return {
            eq: (field: string, value: boolean) => {
              assertEquals(field, 'is_enabled');
              assertEquals(value, true);
              return {
                order: (field: string, options: { ascending: boolean }) => {
                  assertEquals(field, 'name');
                  assertEquals(options.ascending, true);
                  const sortedDomains = [...mockDomains].sort((a, b) => a.name.localeCompare(b.name));
                  return Promise.resolve({ data: sortedDomains, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  // Act
  const { data, error } = await listDomains(mockSupabaseClient);

  // Assert
  assert(error === undefined, 'Expected no error');
  assertExists(data, 'Expected data to be returned');
  assertEquals(data?.length, 3);
  assertEquals(data?.[0].name, 'Finance');
});

Deno.test('listDomains should return an error if the database call fails', async () => {
  // Arrange
  const dbError = { message: 'Connection failed', code: '500', details: 'some details', hint: '' };
  const mockSupabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: null, error: dbError }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  // Act
  const { data, error } = await listDomains(mockSupabaseClient);

  // Assert
  assert(data === undefined, 'Expected no data to be returned');
  assertExists(error, 'Expected an error to be returned');
  assertEquals(error?.status, 500);
  assertEquals(error?.code, 'DB_FETCH_FAILED');
  assertEquals(error?.message, 'Could not fetch dialectic domains.');
}); 