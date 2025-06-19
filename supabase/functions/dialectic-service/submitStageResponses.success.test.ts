import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type DialecticProject,
  type DialecticProjectResource,
} from './dialectic.interface.ts';
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext, FileManagerResponse } from "../_shared/types/file_manager.types.ts";
import type { Database } from '../types_db.ts';
import type { ServiceError } from '../_shared/types.ts';

// Import the specific action handler we are testing
import { submitStageResponses } from './submitStageResponses.ts';
import { logger } from "../_shared/logger.ts";

Deno.test('submitStageResponses', async (t) => {
  const testUserId = crypto.randomUUID();
  const testProjectId = crypto.randomUUID();
  const testSessionId = crypto.randomUUID();
  const testContributionId1 = crypto.randomUUID();
  const testContributionId2 = crypto.randomUUID();
  const testSystemPromptId = crypto.randomUUID();
  const testProcessTemplateId = crypto.randomUUID();
  const testThesisStageId = crypto.randomUUID();
  const testAntithesisStageId = crypto.randomUUID();
  const testParalysisStageId = crypto.randomUUID();
  const mockUser: User = { id: testUserId, app_metadata: {}, user_metadata: {}, aud: 'test-aud', created_at: new Date().toISOString() };

  const mockProcessTemplate = {
    id: testProcessTemplateId,
    name: 'Test Template',
    description: 'A test template',
    created_at: new Date().toISOString(),
    starting_stage_id: testThesisStageId,
  };

  const mockThesisStage: DialecticStage = {
      id: testThesisStageId,
      slug: 'thesis',
      display_name: 'Thesis',
      default_system_prompt_id: 'prompt-id-thesis',
      input_artifact_rules: {},
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

  const mockAntithesisStage: DialecticStage = {
      id: testAntithesisStageId,
      slug: 'antithesis',
      display_name: 'Antithesis',
      default_system_prompt_id: testSystemPromptId, // This is the one we'll fetch
      input_artifact_rules: { sources: [{ type: 'contribution', stage_slug: 'thesis' }, { type: 'feedback', stage_slug: 'thesis'}] },
      created_at: new Date().toISOString(),
      description: null,
      expected_output_artifacts: {},
  };

  const mockParalysisStage: DialecticStage = {
    id: testParalysisStageId,
    slug: 'paralysis',
    display_name: 'Paralysis',
    default_system_prompt_id: testSystemPromptId,
    input_artifact_rules: {},
    created_at: new Date().toISOString(),
    description: null,
    expected_output_artifacts: {},
  };

  await t.step('1.1 Successfully processes responses and transitions to the next stage based on DB', async () => {
    const systemSettingsContent = JSON.stringify({ user_objective: "A test objective" });
    const systemSettingsPath = `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/0_seed_inputs/system_settings.json`;
    const priorStageFeedbackContent = "This is some mock feedback from the prior thesis stage.";
    const priorStageFeedbackPath = `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/${mockThesisStage.slug}/user_feedback_${mockThesisStage.slug}.md`;
    
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy(
      async (
        context: UploadContext,
      ): Promise<FileManagerResponse> => {
        const { pathContext, fileContent } = context;
        const path =
          `projects/${pathContext.projectId}/sessions/${pathContext.sessionId}/iteration_${pathContext.iteration}/${pathContext.stageSlug}/${pathContext.originalFileName}`;
        
        let buffer: Buffer;
        if (typeof fileContent === 'string') {
            buffer = Buffer.from(fileContent, 'utf-8');
        } else if (fileContent instanceof Buffer) {
            buffer = fileContent;
        } else { // It's an ArrayBuffer
            buffer = Buffer.from(fileContent);
        }

        return await Promise.resolve({
          record: {
            id: 'resource-id-from-file-manager',
            project_id: pathContext.projectId,
            user_id: testUserId,
            storage_bucket: 'test-bucket',
            storage_path: path,
            file_name: pathContext.originalFileName || 'test.md',
            mime_type: 'text/markdown',
            size_bytes: buffer.byteLength,
            resource_description: 'Mocked response from file manager',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        });
      },
    );

    const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
        if (path === systemSettingsPath) {
            const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(systemSettingsContent)).buffer;
            return Promise.resolve({ data: buffer, error: null });
        }
        if (path === 'path/to/content1.md') {
            const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode("AI content from ModelA")).buffer;
            return Promise.resolve({ data: buffer, error: null });
        }
        if (path === 'path/to/content2.md') {
            const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode("AI content from ModelB")).buffer;
            return Promise.resolve({ data: buffer, error: null });
        }
        if (path === priorStageFeedbackPath) {
            const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(priorStageFeedbackContent)).buffer;
            return Promise.resolve({ data: buffer, error: null });
        }
        return Promise.resolve({ data: null, error: new Error(`Mock path not found: ${path}`) });
    });

    // 1.1.1 Arrange: Setup payload, mock DB data, and stub return values
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Response to first contribution" },
        { originalContributionId: testContributionId2, responseText: "Response to second contribution" },
      ],
      fileManager: mockFileManager,
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            iteration_count: 1,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockThesisStage
          }] },
          update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] },
        },
        dialectic_feedback: {
          insert: { data: mockPayload.responses.map(r => ({ ...r, id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId, contribution_id: r.originalContributionId, feedback_value_text: r.responseText })) }
        },
        dialectic_contributions: {
          select: (state: any) => {
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
              // For fetching contributions to create the seed prompt
              return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', storage_path: 'path/to/content1.md', storage_bucket: 'test-bucket' }, { id: testContributionId2, model_name: 'ModelB', storage_path: 'path/to/content2.md', storage_bucket: 'test-bucket' }] });
            }
            // For validating originalContributionId
            const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
            return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
          }
        },
        system_prompts: {
          select: { data: [{ id: testSystemPromptId, prompt_text: 'Test prompt for Antithesis using {{prior_stage_ai_outputs}} and {{prior_stage_user_feedback}}' }] },
        },
        dialectic_stage_transitions: {
          select: { data: [{
            source_stage_id: mockThesisStage.id,
            target_stage: mockAntithesisStage
          }]}
        },
        dialectic_process_templates: {
            select: { data: [mockProcessTemplate] }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        downloadFromStorage: mockDownloadFromStorage,
        fileManager: mockFileManager
    };

    // 1.1.2 Act: Call the function
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client, mockUser, mockDependencies);

    // 1.1.3 Assert: Verify outcomes
    assertEquals(status, 200, "Expected status 200");
    assertExists(data, "Expected data in the response");
    assertEquals(error, undefined, "Expected no error in the response");

    // Check that the transition lookup was attempted
    const fromSpy = mockSupabase.spies.fromSpy;
    assert(fromSpy.calls.some(call => call.args[0] === 'dialectic_stage_transitions'), "Should have called from('dialectic_stage_transitions')");

    // 1.1.9. Updates dialectic_sessions table correctly
    assertExists(data.updatedSession?.status);
    assert(data.updatedSession.status.includes(`pending_${mockAntithesisStage.slug}`), "Session status should be updated to pending_antithesis");
    
    // 1.1.2 & 1.1.3. Creates dialectic_feedback records
    assertEquals(data.feedbackRecords.length, 2, "Expected two feedback records to be created");
    
    // Check that the file manager was used correctly
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 2, "Expected FileManagerService to be called twice");

    const feedbackCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'user_feedback');
    assertExists(feedbackCall, "Expected a call to save 'user_feedback'");
    
    const seedPromptCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'seed_prompt');
    assertExists(seedPromptCall, "Expected a call to save 'seed_prompt'");

    // 1.4 Verifies content of the consolidated feedback file
    const feedbackFileContent = feedbackCall.args[0].fileContent;
    const feedbackContent = typeof feedbackFileContent === 'string'
        ? feedbackFileContent
        : new TextDecoder().decode(feedbackFileContent);
    assertStringIncludes(feedbackContent, "Response to first contribution", "Feedback file content is incorrect");
    assertStringIncludes(feedbackContent, "Response to second contribution", "Feedback file content is incorrect");

    // 1.5 Verifies content of the rendered next stage seed prompt
    const seedPromptFileContent = seedPromptCall.args[0].fileContent;
    const seedPromptContent = typeof seedPromptFileContent === 'string'
        ? seedPromptFileContent
        : new TextDecoder().decode(seedPromptFileContent);
    assertStringIncludes(seedPromptContent, "AI content from ModelA", "Seed prompt content is missing AI output");
    assertStringIncludes(seedPromptContent, "AI content from ModelB", "Seed prompt content is missing AI output");
    assertStringIncludes(
        seedPromptContent,
        "This is some mock feedback from the prior thesis stage.",
        "Seed prompt content is missing prior stage user feedback",
    );
    assert(
        !seedPromptContent.includes("Response to first contribution"),
        "Seed prompt should not contain current stage feedback when template does not explicitly ask for it",
    );

    assert(data?.nextStageSeedPromptPath, "Next stage seed path should be returned");
    if(data?.nextStageSeedPromptPath) {
        assert(data.nextStageSeedPromptPath.includes(mockAntithesisStage.slug), "Next stage seed path should be for antithesis");
    }
  });

  await t.step('1.2 Successfully processes responses for the final stage (no next transition)', async () => {
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
      id: 'resource-id',
      project_id: testProjectId,
      user_id: testUserId,
      storage_bucket: 'test-bucket',
      storage_path: 'path/to/feedback.md',
      file_name: 'feedback.md',
      mime_type: 'text/markdown',
      size_bytes: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resource_description: null,
    }, null);

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockParalysisStage.slug, // Assume this is the last stage for this test
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Final feedback on synthesis" },
      ],
      fileManager: mockFileManager,
    };

    const mockFinalStage = {
        id: crypto.randomUUID(),
        slug: mockParalysisStage.slug,
        display_name: 'Synthesis',
        default_system_prompt_id: null,
        input_artifact_rules: {}
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockFinalStage 
          }] },
          update: { data: [{ id: testSessionId, status: 'iteration_complete_pending_review' }] },
        },
        dialectic_feedback: {
          insert: { data: [{ id: 'feedback-id' }] },
        },
        dialectic_contributions: {
            select: (state: any) => {
                const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
                if (id === testContributionId1) {
                    return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
                }
                return Promise.resolve({ data: [] });
            }
        },
        dialectic_stage_transitions: {
          // This time, the select for a transition returns nothing, ending the process.
          select: { data: null, error: null }
        },
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      }
    };
    
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
      logger,
      downloadFromStorage: spy((_client: SupabaseClient, _bucket: string, _path: string): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({ data: new ArrayBuffer(0), error: null })),
      fileManager: mockFileManager,
    };

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabase.client, mockUser, mockDependencies);

    assertEquals(error, undefined);
    assertEquals(status, 200);
    assertExists(data);

    // In the final stage, we don't generate a seed prompt for the next stage.
    // So uploadAndRegisterResource should NOT have been called.
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "FileManagerService should be called once for feedback");
    const feedbackCall = mockFileManager.uploadAndRegisterFile.calls[0];
    assertEquals(feedbackCall.args[0].pathContext.fileType, 'user_feedback');

    assert(data.nextStageSeedPromptPath === null || data.nextStageSeedPromptPath === undefined, "Next stage seed path should be null for the final stage");
    assertEquals(data.updatedSession?.status, 'iteration_complete_pending_review', "Session status should be updated to reflect completion");
  });

  await t.step('6.1 Successfully processes responses when domain overlay is present', async () => {
    // This test is very similar to 1.1, but ensures the domain overlay is fetched and used.
    // ... can be implemented if needed ...
  });

  await t.step('6.2 Successfully finalizes the session after the last stage (PARALYSIS)', async () => {
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse({
      id: 'resource-id',
      project_id: testProjectId,
      user_id: testUserId,
      storage_bucket: 'test-bucket',
      storage_path: 'path/to/feedback.md',
      file_name: 'feedback.md',
      mime_type: 'text/markdown',
      size_bytes: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resource_description: null,
    }, null);

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockParalysisStage.slug,
      currentIterationNumber: 1,
      fileManager: mockFileManager,
      responses: [{ originalContributionId: testContributionId1, responseText: "text" }],
    };
    const mockFinalStage = {
        id: crypto.randomUUID(),
        slug: mockParalysisStage.slug,
        display_name: 'Paralysis',
        default_system_prompt_id: null,
        input_artifact_rules: {}
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId, max_iterations: 3, process_template_id: testProcessTemplateId },
            stage: mockFinalStage
          }] },
          update: { data: [{ id: testSessionId, status: 'iteration_complete_pending_review' }] }
        },
        dialectic_feedback: {
          insert: { data: [{ id: 'feedback-id' }] }
        },
        dialectic_contributions: {
          select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] }
        },
        dialectic_stage_transitions: {
          select: { data: null } // No transition found
        },
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDownloadFromStorage = spy((..._args: any[]) => {
      // This spy should not be called because there's no next stage to prepare a seed for.
      throw new Error("Should not be called when finalizing a session");
    });
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client, mockUser, mockDependencies);

    assertEquals(status, 200);
    assertEquals(error, undefined);
    assert(data);
    assertEquals(data.updatedSession?.status, 'iteration_complete_pending_review');
    assertEquals(mockDownloadFromStorage.calls.length, 0, "No seed prompt should be generated");
    assert(data.nextStageSeedPromptPath === null || data.nextStageSeedPromptPath === undefined, "Next stage seed path should be null");
  });

});