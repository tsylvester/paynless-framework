import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy, type Spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
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

  // Define mock stage objects first as they are used in mockDownloadFromStorage paths
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
      default_system_prompt_id: testSystemPromptId, 
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

  // Define mockDownloadFromStorage at a higher scope to be accessible in all t.step blocks
  const systemSettingsContentForScope = JSON.stringify({ user_objective: "A test objective" });
  const systemSettingsPathForScope = `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/0_seed_inputs/system_settings.json`;
  const priorStageFeedbackContentForScope = "This is some mock feedback from the prior thesis stage.";
  const priorStageFeedbackPathForScope = `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/${mockThesisStage.slug}/user_feedback_${mockThesisStage.slug}.md`;

  const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
    if (path === systemSettingsPathForScope) {
        const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(systemSettingsContentForScope)).buffer;
        return Promise.resolve({ data: buffer, error: null });
    }
    if (path === 'path/to/content1.md') { // Specific to test 1.1, could be parameterized if more tests need it
        const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode("AI content from ModelA")).buffer;
        return Promise.resolve({ data: buffer, error: null });
    }
    if (path === 'path/to/content2.md') { // Specific to test 1.1
        const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode("AI content from ModelB")).buffer;
        return Promise.resolve({ data: buffer, error: null });
    }
    if (path === priorStageFeedbackPathForScope) {
        const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(priorStageFeedbackContentForScope)).buffer;
        return Promise.resolve({ data: buffer, error: null });
    }
    // Default for any other path not explicitly mocked above
    return Promise.resolve({ data: null, error: new Error(`Mock path not found in global mockDownloadFromStorage: ${path}`) });
  });

  const mockProcessTemplate = {
    id: testProcessTemplateId,
    name: 'Test Template',
    description: 'A test template',
    created_at: new Date().toISOString(),
    starting_stage_id: testThesisStageId,
  };

  await t.step('1.1 Successfully processes responses and transitions to the next stage based on DB', async () => {
    // Note: systemSettingsContent, systemSettingsPath, priorStageFeedbackContent, priorStageFeedbackPath are now using *ForScope versions via the global mockDownloadFromStorage
    const userSubmittedStageFeedbackContent = "This is consolidated stage feedback from the new payload structure via userStageFeedback.";

    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy(
      async (
        context: UploadContext,
      ): Promise<FileManagerResponse> => {
        const { pathContext, fileContent, customMetadata, mimeType } = context;
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
            mime_type: mimeType || 'text/markdown',
            size_bytes: buffer.byteLength,
            resource_description: pathContext.fileType === 'user_feedback'
              ? JSON.stringify(customMetadata?.resourceDescription)
              : 'Mocked response from file manager',
            feedback_type: pathContext.fileType === 'user_feedback' ? customMetadata?.feedbackType : undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
          error: null,
        });
      },
    );

    // 1.1.1 Arrange: Setup payload, mock DB data, and stub return values
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Response to first contribution" },
        { originalContributionId: testContributionId2, responseText: "Response to second contribution" },
      ],
      userStageFeedback: {
        content: userSubmittedStageFeedbackContent,
        feedbackType: "StageReviewSummary_v1_test",
        resourceDescription: { summary: "Test summary for resourceDescription" }
      }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            iteration_count: 1,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, initial_user_prompt: "Initial prompt for testing.", project_name: "Test Project Name" },
            stage: mockThesisStage
          }] },
          update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] },
        },
        dialectic_feedback: {
          insert: { data: [{ id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId, feedback_type: "FileManagerCreatedFeedback_v1" }] }
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
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

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
    assertEquals(data.feedbackRecords.length, 1, "Expected one feedback record to be created from userStageFeedback");
    
    // Check that the file manager was used correctly
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 2, "Expected FileManagerService to be called twice");

    const feedbackCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'user_feedback');
    assertExists(feedbackCall, "Expected a call to save 'user_feedback'");
    
    const seedPromptCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'seed_prompt');
    assertExists(seedPromptCall, "Expected a call to save 'seed_prompt'");

    // Assertions for the 'user_feedback' call
    const feedbackUploadContext = feedbackCall.args[0] as UploadContext;
    assertEquals(feedbackUploadContext.pathContext.projectId, testProjectId);
    assertEquals(feedbackUploadContext.pathContext.sessionId, testSessionId);
    assertEquals(feedbackUploadContext.pathContext.stageSlug, mockThesisStage.slug);
    assertEquals(feedbackUploadContext.pathContext.iteration, 1);
    assertEquals(feedbackUploadContext.pathContext.originalFileName, `user_feedback_${mockThesisStage.slug}.md`);
    assertEquals(feedbackUploadContext.mimeType, 'text/markdown');
    assertEquals(feedbackUploadContext.customMetadata?.feedbackType, "StageReviewSummary_v1_test");
    assertExists(feedbackUploadContext.customMetadata?.resourceDescription, "resourceDescription should exist in customMetadata");
    assertEquals(JSON.parse(feedbackUploadContext.customMetadata?.resourceDescription as string).summary, "Test summary for resourceDescription");

    // 1.4 Verifies content of the consolidated feedback file
    const feedbackFileContent = feedbackUploadContext.fileContent;
    const feedbackContentString = typeof feedbackFileContent === 'string'
        ? feedbackFileContent
        : new TextDecoder().decode(feedbackFileContent as ArrayBuffer);
    assertEquals(feedbackContentString, userSubmittedStageFeedbackContent, "Feedback file content should match userStageFeedback.content");

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
      projectId: testProjectId,
      stageSlug: mockParalysisStage.slug, // Assume this is the last stage for this test
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Final feedback on synthesis" },
      ],
      userStageFeedback: {
        content: "Final feedback on synthesis",
        feedbackType: "StageReviewSummary_v1_test",
        resourceDescription: { summary: "Test summary for resourceDescription" }
      }
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

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

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
      projectId: testProjectId,
      stageSlug: mockParalysisStage.slug, // Assume this is the last stage for this test
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "text" }],
      userStageFeedback: {
        content: "Final feedback on synthesis",
        feedbackType: "StageReviewSummary_v1_test",
        resourceDescription: { summary: "Test summary for resourceDescription" }
      }
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
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    assertEquals(status, 200);
    assertEquals(error, undefined);
    assert(data);
    assertEquals(data.updatedSession?.status, 'iteration_complete_pending_review');
    assertEquals(mockDownloadFromStorage.calls.length, 0, "No seed prompt should be generated");
    assert(data.nextStageSeedPromptPath === null || data.nextStageSeedPromptPath === undefined, "Next stage seed path should be null");
  });

  await t.step('1.2 Handles session completion (no next stage) successfully', async () => {
    // ... (arrange as needed, similar to database.test.ts for completion path) ...
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, projectId: testProjectId, stageSlug: mockParalysisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }], userStageFeedback: { content: "Final feedback on synthesis", feedbackType: "StageReviewSummary_v1_test", resourceDescription: { summary: "Test summary for resourceDescription" } } };
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
      if (context.pathContext.fileType === 'user_feedback') return { record: { storage_path: 'path/to/feedback.md' } as any, error: null };
      return { record: { storage_path: 'path/to/other.md' } as any, error: null };
    });

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockParalysisStage, // Current stage is Paralysis
            iteration_count: 1,
          }] },
          update: { data: [{ id: testSessionId, status: 'completed', current_stage_id: null, completed_at: new Date().toISOString() }] } // Mock successful update to 'completed'
        },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId, iteration_number: 1, stage: 'paralysis', is_latest_edit: true, storage_path: 'path/to/paralysis_A.md', storage_bucket: 'content' }] } },
        dialectic_feedback: { insert: { data: [{ id: crypto.randomUUID(), feedback_value_text: 'text', session_id: testSessionId, user_id: testUserId, contribution_id: testContributionId1, feedback_type: 'text_response', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] } },
        dialectic_stage_transitions: { select: { data: null, error: null } }, // No transition from Paralysis
        dialectic_process_templates: { select: { data: [mockProcessTemplate] } },
        dialectic_stages: { select: { data: [mockParalysisStage] } }
      },
      storageMock: {
        downloadResult: (bucket, path) => {
            if (path === 'path/to/paralysis_A.md') return Promise.resolve({ data: new TextEncoder().encode('Paralysis content by ModelA').buffer as unknown as Blob, error: null });
            return Promise.resolve({data: null, error: new Error('Mock download error for completion test')});
        }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: mockSupabase.client.storage.from('content').download as any, fileManager: mockFileManager });

    assertEquals(status, 200);
    assertEquals(error, undefined);
    assert(data);
    assertEquals(data.updatedSession?.status, 'completed');
    assertEquals(data.nextStageSeedPromptPath, null);
  });

  await t.step("1.2 Handles missing project details gracefully", async () => {
    const mockFileManager = createMockFileManagerService();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: "thesis",
      currentIterationNumber: 1,
      responses: [],
      userStageFeedback: { content: "Test", feedbackType: "test" }
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: null, error: { message: "Not found", code: "PGRST116"} as any } }, // Simulate session/project not found by returning null data
        dialectic_contributions: { // Correctly nested inside genericMockResults
          select: (state: any) => {
            const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
            return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
          }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    assertEquals(status, 404);
    assertExists(error);
    assertEquals(error?.message, "Session not found or access denied.");
    assertEquals(data, undefined);
  });

  await t.step("1.3 Handles missing current stage details gracefully", async () => {
    const mockFileManager = createMockFileManagerService();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: "unknown-stage",
      currentIterationNumber: 1,
      responses: [],
      userStageFeedback: { content: "Test", feedbackType: "test" }
    };
     const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, initial_user_prompt: "Initial prompt for testing.", project_name: "Test Project Name" }, // Project exists
            stage: null // Simulate current stage not found
          }] },
        },
        dialectic_contributions: { // Correctly nested
            select: (state: any) => {
                const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
                return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
            }
        }
      },
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);
    assertEquals(status, 404);
    assertExists(error);
    assertEquals(error?.message, "Session not found or access denied.");
    assertEquals(data, undefined);
  });


  await t.step("1.4 Handles failure when fetching next stage transition", async () => {
    const mockFileManager = createMockFileManagerService();
    // Ensure file manager succeeds for user feedback to test downstream transition error
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
      if (context.pathContext.fileType === 'user_feedback') {
        return Promise.resolve({ 
          record: { 
            id: 'mock-feedback-file-id',
            project_id: context.pathContext.projectId,
            user_id: testUserId,
            storage_bucket: 'test-bucket',
            storage_path: `projects/${context.pathContext.projectId}/sessions/${context.pathContext.sessionId}/iteration_${context.pathContext.iteration}/${context.pathContext.stageSlug}/user_feedback.md`,
            file_name: 'user_feedback.md',
            mime_type: 'text/markdown',
            size_bytes: 100,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any, 
          error: null 
        });
      }
      // Fallback for other file types if any are unexpectedly called
      return Promise.resolve({ record: { id: 'mock-other-file-id' } as any, error: new Error("Unexpected fileManager call in test 1.4") });
    });

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [],
      userStageFeedback: { content: "Test", feedbackType: "test" }
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, initial_user_prompt: "Initial prompt for testing.", project_name: "Test Project Name" },
            stage: mockThesisStage
          }] },
        },
        dialectic_stage_transitions: { select: { data: null, error: {message: "DB error", code: "XX"} as any } }, // Simulate error fetching transition
        dialectic_contributions: { // Correctly nested
            select: (state: any) => {
                const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
                return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
            }
        }
      },
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error?.message, "Failed to look up stage transition.");
    assertEquals(data, undefined);
  });

  await t.step("1.5 Handles scenario where there is no next stage (e.g., end of process)", async () => {
    const mockFileManager = createMockFileManagerService(); 
    // Correctly define the spy to match the expected signature
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
      // Simple mock for this test case, can be expanded if needed
      return Promise.resolve({ record: { id: 'mock-record-id-for-step-1.5' } as any, error: null });
    });

    const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        projectId: testProjectId,
        stageSlug: mockParalysisStage.slug, // Current stage is paralysis
        currentIterationNumber: 1,
        responses: [], // No individual responses for simplicity
        userStageFeedback: { // User provides overall feedback for the paralysis stage
            content: "This is the final feedback for the paralysis stage.",
            feedbackType: "ParalysisReviewSummary_v1",
            resourceDescription: { outcome: "Project conclusion satisfactory." }
        }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: {
                select: { // Mock return for fetching current session and stage
                    data: [{
                        id: testSessionId,
                        project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, initial_user_prompt: "Initial prompt.", project_name: "Test Project Name" },
                        stage: mockParalysisStage // Current stage is paralysis
                    }]
                },
                update: { // Mock return for updating session status (e.g., to 'completed')
                    data: [{ id: testSessionId, status: 'completed' }]
                }
            },
            dialectic_stage_transitions: {
                select: { // No transition from paralysis
                    data: [] // Ensure it's an empty array for "no transition found"
                }
            },
             dialectic_feedback: { // Mock for any feedback insertion (though FileManager handles it now)
                insert: { data: [{ id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId }] }
            },
            dialectic_contributions: { // Correctly nested
                select: (state: any) => {
                    const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
                    // For this test, no specific contribution ID is being validated from responses,
                    // so a generic successful response is fine if the function logic were to reach it.
                    // Since responses is empty, this specific mock won't be hit for ID validation.
                    return Promise.resolve({ data: [{ id: id || crypto.randomUUID(), model_name: `Model for ${id}`, session_id: testSessionId }] });
                }
            }
        }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDownloadFromStorageSpy = spy(async () => Promise.resolve({ data: null, error: null }));
    const mockDependencies = {
        logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        fileManager: mockFileManager
    };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    assertEquals(status, 200, "Expected status 200 for end of process");
    assertExists(data, "Expected data in the response");
    assertEquals(error, undefined, "Expected no error");
    assertEquals(data.message, "Session completed successfully.", "Message should indicate end of process");
    assertExists(data.updatedSession);
    assertEquals(data.updatedSession.status, 'completed', "Session status should be updated to completed or similar");
    assertEquals(data.nextStageSeedPromptPath, null, "No seed prompt should be generated if no next stage");

    // Verify feedback was saved
    const feedbackCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'user_feedback');
    assertExists(feedbackCall, "Expected a call to save 'user_feedback' for the paralysis stage");
    const feedbackUploadContext = feedbackCall.args[0] as UploadContext;
    assertEquals(feedbackUploadContext.fileContent, "This is the final feedback for the paralysis stage.");
    assertEquals(feedbackUploadContext.customMetadata?.feedbackType, "ParalysisReviewSummary_v1");

    // Verify seed prompt was NOT saved
    const seedPromptCall = mockFileManager.uploadAndRegisterFile.calls.find(c => c.args[0].pathContext.fileType === 'seed_prompt');
    assertEquals(seedPromptCall, undefined, "Expected no call to save 'seed_prompt' as it's the end of process");
  });

});