import { expect } from 'https://deno.land/x/expect@v0.4.0/mod.ts';
import { getInitialPromptContent } from './project-initial-prompt.ts';
import type { ProjectContext } from '../prompt-assembler.interface.ts';
import type { ILogger } from '../types.ts';
import type { SupabaseClient, PostgrestSingleResponse } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../../types_db.ts';
import { downloadFromStorage } from '../supabase_storage_utils.ts';

// Mock ILogger
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Mock SupabaseClient
const mockDbClient = {
  from: (table: string) => {
    if (table === 'dialectic_project_resources') {
      return {
        select: (columns: string) => ({
          eq: (column: string, value: string) => ({
            single: async () => {
              // This will be overridden in specific tests
              return { data: null, error: null } as PostgrestSingleResponse<any>; 
            },
          }),
        }),
      };
    }
    return {} as any; // Should not be called for other tables in these tests
  },
} as unknown as SupabaseClient<Database>;

Deno.test('getInitialPromptContent - should return direct initial_user_prompt if available', async () => {
  const project: ProjectContext = {
    id: 'project1',
    initial_user_prompt: 'This is a direct prompt.',
    initial_prompt_resource_id: null,
    project_name: 'Test Project',
    selected_domain_id: 'domain1',
    user_id: 'user1',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_domains: { name: 'Test Domain'},
    process_template_id: null,
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
  };
  const result = await getInitialPromptContent(mockDbClient, project, mockLogger, downloadFromStorage);
  expect(result).toEqual({ content: 'This is a direct prompt.' });
});

Deno.test('getInitialPromptContent - should return content from resource if initial_prompt_resource_id is available and resource exists', async () => {
  const project: ProjectContext = {
    id: 'project2',
    initial_user_prompt: '',
    initial_prompt_resource_id: 'resource1',
    project_name: 'Test Project 2',
    selected_domain_id: 'domain1',
    user_id: 'user1',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_domains: { name: 'Test Domain'},
    process_template_id: null,
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
  };

  const mockResource = { storage_bucket: 'bucket', storage_path: 'path/to', file_name: 'resource.txt' };
  
  const specificMockDbClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockResource, error: null } as PostgrestSingleResponse<any>),
        }),
      }),
    }),
    storage: {
      from: () => ({
        download: async () => {
          return {
            data: new Blob(['This is a test prompt.']),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient<Database>; 

  const result = await getInitialPromptContent(specificMockDbClient, project, mockLogger, downloadFromStorage);
  expect(result).toEqual({ content: 'This is a test prompt.', storagePath: 'path/to/resource.txt' });
});

Deno.test('getInitialPromptContent - should return error if resource fetch fails', async () => {
  const project: ProjectContext = {
    id: 'project3',
    initial_user_prompt: '',
    initial_prompt_resource_id: 'resource_not_found',
    project_name: 'Test Project 3',
    selected_domain_id: 'domain1',
    user_id: 'user1',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_domains: { name: 'Test Domain'},
    process_template_id: null,
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
  };
  const dbError = { message: 'Resource not found', details: '', hint: '', code: 'PGRST116' };

  const specificMockDbClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: dbError } as PostgrestSingleResponse<any>),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;

  const result = await getInitialPromptContent(specificMockDbClient, project, mockLogger, downloadFromStorage);
  expect(result).toEqual({ error: 'Could not find prompt resource details for ID resource_not_found.' });
});

Deno.test('getInitialPromptContent - should return fallback content if no direct prompt and no resource ID', async () => {
  const project: ProjectContext = {
    id: 'project4',
    initial_user_prompt: '',
    initial_prompt_resource_id: null,
    project_name: 'Test Project 4',
    selected_domain_id: 'domain1',
    user_id: 'user1',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dialectic_domains: { name: 'Test Domain'},
    process_template_id: null,
    repo_url: null,
    selected_domain_overlay_id: null,
    user_domain_overlay_values: null,
  };
  const result = await getInitialPromptContent(mockDbClient, project, mockLogger, downloadFromStorage);
  expect(result).toEqual({ error: 'No prompt provided.' });
}); 