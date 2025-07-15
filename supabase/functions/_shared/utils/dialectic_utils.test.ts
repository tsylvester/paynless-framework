import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database } from '../../types_db.ts';
import { createMockSupabaseClient } from '../supabase.mock.ts';
import type { DownloadStorageResult } from '../supabase_storage_utils.ts';
import { getSeedPromptForStage } from './dialectic_utils.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockSession = {
  id: 'session-123',
  project_id: 'project-456',
  iteration_count: 1,
};

const mockStage = {
  slug: 'thesis',
};

Deno.test('getSeedPromptForStage - Happy Path', async () => {
    // 1. Mocks
    const mockProjectResources = [
        { 
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/', 
            resource_description: JSON.stringify({
                type: 'seed_prompt',
                session_id: mockSession.id,
                stage_slug: mockStage.slug,
                iteration: mockSession.iteration_count,
            }),
            file_name: 'prompt.md'
        }
    ];

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_project_resources': { select: { data: mockProjectResources } },
        }
    });

    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => {
        const content = new TextEncoder().encode('This is the seed prompt.');
        const buffer = new ArrayBuffer(content.byteLength);
        new Uint8Array(buffer).set(content);
        return { data: buffer, error: null };
    });

    // 2. Execute
    const result = await getSeedPromptForStage(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockSession.project_id,
        mockSession.id,
        mockStage.slug,
        mockSession.iteration_count,
        mockDownloadFromStorage
    );

    // 3. Assert
    assertExists(result);
    assertEquals(result.content, 'This is the seed prompt.');
    assertEquals(result.bucket, 'test-bucket');
    assertEquals(result.path, 'prompts/');
    assertEquals(result.fileName, 'prompt.md');
    assertEquals(result.fullPath, 'prompts/prompt.md');

    assertEquals(mockDownloadFromStorage.calls.length, 1);
    assertEquals(mockDownloadFromStorage.calls[0].args, [
        mockSupabase.client,
        'test-bucket',
        'prompts/prompt.md'
    ]);
});

Deno.test('getSeedPromptForStage - Throws when no matching resource found', async () => {
    // 1. Mocks
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_project_resources': { select: { data: [] } }, // No resources
        }
    });
    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => ({ data: null, error: new Error('Should not be called')}));

    // 2. Execute and Assert
    await assertRejects(
        async () => {
            await getSeedPromptForStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockSession.project_id,
                mockSession.id,
                mockStage.slug,
                mockSession.iteration_count,
                mockDownloadFromStorage
            );
        },
        Error,
        'No specific seed prompt resource found'
    );
    assertEquals(mockDownloadFromStorage.calls.length, 0);
});

Deno.test('getSeedPromptForStage - Throws when resource download fails', async () => {
    // 1. Mocks
    const mockProjectResources = [
        { 
            storage_bucket: 'test-bucket',
            storage_path: 'prompts/', 
            resource_description: JSON.stringify({
                type: 'seed_prompt',
                session_id: mockSession.id,
                stage_slug: mockStage.slug,
                iteration: mockSession.iteration_count,
            }),
            file_name: 'prompt.md'
        }
    ];

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_project_resources': { select: { data: mockProjectResources } },
        }
    });

    const mockDownloadFromStorage = spy(async (): Promise<DownloadStorageResult> => {
        return { data: null, error: new Error('Storage download failed') };
    });

    // 2. Execute and Assert
    await assertRejects(
        async () => {
            await getSeedPromptForStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockSession.project_id,
                mockSession.id,
                mockStage.slug,
                mockSession.iteration_count,
                mockDownloadFromStorage
            );
        },
        Error,
        'Could not retrieve the seed prompt for this stage.'
    );
}); 