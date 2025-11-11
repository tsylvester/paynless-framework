import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database } from '../../types_db.ts';
import { createMockSupabaseClient } from '../supabase.mock.ts';
import type { DownloadStorageResult } from '../supabase_storage_utils.ts';
import { getSeedPromptForStage, getSourceStage } from './dialectic_utils.ts';
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
            resource_description: {
                type: 'seed_prompt',
                session_id: mockSession.id,
                stage_slug: mockStage.slug,
                iteration: mockSession.iteration_count,
            },
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
            resource_description: {
                type: 'seed_prompt',
                session_id: mockSession.id,
                stage_slug: mockStage.slug,
                iteration: mockSession.iteration_count,
            },
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

Deno.test('getSourceStage - Happy Path', async () => {
    // 1. Mocks
    const mockSessionId = 'session-123';
    const mockProjectId = 'project-456';
    const mockProcessTemplateId = 'template-789';
    const mockTargetStageId = 'stage-target-abc';
    const mockSourceStageId = 'stage-source-xyz';

    const mockSourceStageData = {
        id: mockSourceStageId,
        slug: 'thesis',
        display_name: 'Thesis',
        created_at: new Date().toISOString(),
        description: 'The initial stage',
        expected_output_artifacts: {},
        input_artifact_rules: {},
        default_system_prompt_id: null,
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_sessions': { 
                select: { data: [{ project_id: mockProjectId }] }
            },
            'dialectic_projects': { 
                select: { data: [{ process_template_id: mockProcessTemplateId }] } 
            },
            'dialectic_stage_transitions': { 
                select: { data: [{ source_stage_id: mockSourceStageId }] } 
            },
            'dialectic_stages': {
                select: { data: [mockSourceStageData] }
            }
        }
    });

    // 2. Execute
    const result = await getSourceStage(
        mockSupabase.client as unknown as SupabaseClient<Database>,
        mockSessionId,
        mockTargetStageId
    );

    // 3. Assert
    assertExists(result);
    assertEquals(result.id, mockSourceStageId);
    assertEquals(result.slug, 'thesis');
    
    const fromSpy = mockSupabase.spies.fromSpy;
    assertEquals(fromSpy.calls.length, 4);
    assertEquals(fromSpy.calls[0].args, ['dialectic_sessions']);
    assertEquals(fromSpy.calls[1].args, ['dialectic_projects']);
    assertEquals(fromSpy.calls[2].args, ['dialectic_stage_transitions']);
    assertEquals(fromSpy.calls[3].args, ['dialectic_stages']);
});

Deno.test('getSourceStage - Throws when no transition found', async () => {
    // 1. Mocks
    const mockSessionId = 'session-1';
    const mockTargetStageId = 'stage-1';
    const mockProcessTemplateId = 'template-1';
    const mockProjectId = 'proj-1';

    const mockSupabase = createMockSupabaseClient(undefined, {
      genericMockResults: {
          'dialectic_sessions': { 
              select: { data: [{ project_id: mockProjectId }] }
          },
          'dialectic_projects': { 
              select: { data: [{ process_template_id: mockProcessTemplateId }] } 
          },
          'dialectic_stage_transitions': { 
              select: { data: [] } // No transition found
          },
      }
    });

    // 2. Execute and Assert
    await assertRejects(
        async () => {
            await getSourceStage(
                mockSupabase.client as unknown as SupabaseClient<Database>,
                mockSessionId,
                mockTargetStageId
            );
        },
        Error,
        `No source stage found for target stage ${mockTargetStageId} in process template ${mockProcessTemplateId}.`
    );
}); 