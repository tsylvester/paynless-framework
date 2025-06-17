import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
} from './dialectic.interface.ts';

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
  const mockUser = { id: testUserId } as User;

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
    
    const mockUploadToStorage = spy((client: SupabaseClient, bucket: string, path: string, content: any, options: any) => {
        return Promise.resolve({ path: path as string, error: null });
    });

    const mockUploadAndRegisterResource = spy((..._args: any[]) => {
      // Return a structure that matches DialecticProjectResource
      return Promise.resolve({ 
          data: { 
              id: 'resource-id', 
              storage_path: 'a/path',
              project_id: testProjectId,
              user_id: testUserId,
              file_name: 'test.txt',
              storage_bucket: 'test-bucket',
              mime_type: 'text/plain',
              size_bytes: 100,
              resource_description: 'test',
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
          } as any, 
          error: undefined 
      });
    });
    
    const mockDownloadFromStorage = spy((client: SupabaseClient, bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
        if (path === systemSettingsPath) {
            return Promise.resolve({ data: new TextEncoder().encode(systemSettingsContent).buffer as ArrayBuffer, error: null });
        }
        if (path === 'path/to/content1.md') {
            return Promise.resolve({ data: new TextEncoder().encode("AI content from ModelA").buffer as ArrayBuffer, error: null });
        }
        if (path === 'path/to/content2.md') {
            return Promise.resolve({ data: new TextEncoder().encode("AI content from ModelB").buffer as ArrayBuffer, error: null });
        }
        if (path === priorStageFeedbackPath) {
            return Promise.resolve({ data: new TextEncoder().encode(priorStageFeedbackContent).buffer as ArrayBuffer, error: null });
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
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockThesisStage
          }] },
          update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] },
        },
        dialectic_feedback: {
          insert: { data: mockPayload.responses.map(r => ({ ...r, id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId })) }
        },
        dialectic_contributions: {
          select: (state: any) => {
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
              // For fetching contributions to create the seed prompt
              return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', content_storage_path: 'path/to/content1.md', content_storage_bucket: 'test-bucket' }, { id: testContributionId2, model_name: 'ModelB', content_storage_path: 'path/to/content2.md', content_storage_bucket: 'test-bucket' }] });
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
        }
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        uploadToStorage: mockUploadToStorage,
        downloadFromStorage: mockDownloadFromStorage,
        uploadAndRegisterResource: mockUploadAndRegisterResource
    };

    // 1.1.2 Act: Call the function
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

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
    
    // 1.1.4 & 1.1.8. Uploads files to storage (consolidated feedback and next stage seed)
    assertEquals(mockUploadToStorage.calls.length, 1, "Expected one file to be uploaded to storage via uploadToStorage");
    assertEquals(mockUploadAndRegisterResource.calls.length, 1, "Expected one file to be uploaded via uploadAndRegisterResource");

    // 1.4 Verifies content of the consolidated feedback file
    const feedbackUploadCall = mockUploadToStorage.calls.find(c => c.args[2] && (c.args[2] as string).includes('user_feedback'));
    assertExists(feedbackUploadCall, "Consolidated user feedback file should be uploaded");
    if (feedbackUploadCall.args.length > 3) {
      const feedbackContent = typeof feedbackUploadCall.args[3] === 'string' ? feedbackUploadCall.args[3] : new TextDecoder().decode(feedbackUploadCall.args[3] as ArrayBuffer);
      assertStringIncludes(feedbackContent, "Response to first contribution", "Feedback file content is incorrect");
      assertStringIncludes(feedbackContent, "Response to second contribution", "Feedback file content is incorrect");
    }

    // 1.5 Verifies content of the rendered next stage seed prompt
    const seedPromptUploadCall = mockUploadAndRegisterResource.calls[0];
    assertExists(seedPromptUploadCall, "Next stage seed prompt should be uploaded");
    if (seedPromptUploadCall && seedPromptUploadCall.args.length > 4) {
      const seedPromptBlob = seedPromptUploadCall.args[4] as Blob;
      const seedPromptContent = await seedPromptBlob.text();
      assertStringIncludes(seedPromptContent, "AI content from ModelA", "Seed prompt content is missing AI output");
      assertStringIncludes(seedPromptContent, "AI content from ModelB", "Seed prompt content is missing AI output");
      assertStringIncludes(
        seedPromptContent,
        priorStageFeedbackContent,
        "Seed prompt content is missing prior stage user feedback",
      );
      assert(
        !seedPromptContent.includes("Response to first contribution"),
        "Seed prompt should not contain current stage feedback when template does not explicitly ask for it",
      );
    }

    assert(data?.nextStageSeedPromptPath, "Next stage seed path should be returned");
    if(data?.nextStageSeedPromptPath) {
        assert(data.nextStageSeedPromptPath.includes(mockAntithesisStage.slug), "Next stage seed path should be for antithesis");
    }
  });

  await t.step('1.2 Successfully processes responses for the final stage (no next transition)', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockParalysisStage.slug, // Assume this is the last stage for this test
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Final feedback on synthesis" },
      ],
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
        }
      }
    };
    
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadToStorage = spy((...args: any[]) => Promise.resolve({ path: args[2] as string, error: null }));
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new TextEncoder().encode(JSON.stringify({ user_objective: "A test objective" })).buffer as ArrayBuffer, error: null }));
    const mockUploadAndRegisterResource = spy((..._args: any[]) => {
        // This test doesn't use the result, so a simple mock is fine.
        return Promise.resolve({ data: { id: 'resource-id' } as any, error: undefined });
    });
    const mockDependencies = { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: mockUploadAndRegisterResource };

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

    assertEquals(error, undefined);
    assertEquals(status, 200);
    assertExists(data);

    // In the final stage, we don't generate a seed prompt for the next stage.
    // So uploadAndRegisterResource should NOT have been called.
    assertEquals(mockUploadAndRegisterResource.calls.length, 0, "uploadAndRegisterResource should not be called for the final stage");
    assertEquals(data.nextStageSeedPromptPath, null, "Next stage seed path should be null for the final stage");
    assertEquals(data.updatedSession?.status, 'iteration_complete_pending_review', "Session status should be updated to reflect completion");
    assertEquals(mockUploadToStorage.calls.length, 1, "Only the consolidated feedback file should be uploaded");
  });

  await t.step('2.1 Fails if the user is not authenticated', async () => {
    // 2.1.1 Arrange
    const mockPayload: SubmitStageResponsesPayload = { sessionId: crypto.randomUUID(), currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'id', responseText: 'text'}] };
    const mockSupabase = createMockSupabaseClient(testUserId, {});

    // 2.1.2 Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, null as unknown as User, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });

    // 2.1.3 Assert
    assertEquals(status, 401);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, 'User not authenticated');
  });

  await t.step('2.2 Fails if the user does not own the project', async () => {
    // 2.2.1 Arrange
    const otherUserId = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: 'id', responseText: 'text' }]
    };
    const mockSupabase = createMockSupabaseClient(testUserId, {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            project: { id: testProjectId, user_id: otherUserId }, // Different user
            stage: mockThesisStage
        }] } },
      }
    });

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 403);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error?.message ?? '', "User does not own the project associated with this session.");
  });

  await t.step('3.1 Fails with appropriate error for missing sessionId', async () => {
    const mockPayload: SubmitStageResponsesPayload = { currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'id', responseText: 'text'}] } as any;
    const mockSupabase = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Missing sessionId");
  });

  await t.step('3.2 Fails if sessionId does not correspond to an existing session', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: crypto.randomUUID(), currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'id', responseText: 'text'}] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: null, error: { message: "Not found", code: "PGRST116" } as any } }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });

    assertEquals(status, 404);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Session not found or error fetching it.");
  });

  await t.step('3.3 Fails for missing or invalid currentStageSlug', async () => {
    // 3.3.1 Arrange
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: 'invalid-stage', // Deliberately wrong slug
      currentIterationNumber: 1,
      responses: [{ originalContributionId: 'id', responseText: 'text' }],
    };

    // This mock MUST return a session, so the function can then check
    // for the slug mismatch. The error isn't "not found", it's "bad request".
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: [{
              id: testSessionId,
              project: {
                id: testProjectId,
                user_id: testUserId,
                process_template_id: testProcessTemplateId,
              },
              stage: mockThesisStage, // Correct stage is 'thesis'
            }],
            error: null,
          },
        },
      },
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        uploadToStorage: async () => { throw new Error('should not be called'); },
        downloadFromStorage: async () => { throw new Error('should not be called'); },
        uploadAndRegisterResource: async () => { throw new Error('should not be called'); }
    };

    // 3.3.2 Act
    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as unknown as SupabaseClient,
      mockUser,
      mockDependencies,
    );

    // 3.3.3 Assert
    assertEquals(status, 400);
    assertExists(error);
    assert(
      error.message.includes('Mismatched stage slug'),
      `Expected error message to include 'Mismatched stage slug', but got: "${error.message}"`,
    );
    assertEquals(data, undefined);
  });

  await t.step('3.4 Fails for missing currentIterationNumber', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, responses: [{ originalContributionId: 'id', responseText: 'text'}] } as any;
    const mockSupabase = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Missing currentIterationNumber");
  });

  await t.step('3.5 Fails if responses array is empty or not provided', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [] };
    const mockSupabase = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "responses array must be provided and cannot be empty");
  });

  await t.step('3.6 Fails if items in responses array miss originalContributionId or responseText', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1 } as any] };
    const mockSupabase = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Missing originalContributionId or responseText");
  });

  await t.step('3.7 Fails if an originalContributionId in a response is not found or not linked to the session', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'non-existent-id', responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId },
            stage: mockThesisStage
        }] } },
        dialectic_feedback: { insert: { data: [{ id: crypto.randomUUID() }] } },
        dialectic_contributions: { select: { data: null, error: { message: "not found" } as any } }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid originalContributionId");
  });

  await t.step('4.1 Handles failure when fetching the current DialecticSession', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: null, error: { message: "DB connection failed" } as any } }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });

    assertEquals(status, 404);
    assertExists(error);
    assertStringIncludes(error.message, "Session not found or error fetching it.");
  });

  await t.step('4.2 Handles failure when inserting records into dialectic_feedback', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId },
            stage: mockThesisStage
        }] } },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
        dialectic_feedback: { insert: { data: null, error: { message: "Insert failed" } as any } }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: spy(), downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } });

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to store user responses.");
  });

  await t.step('4.3 Handles failure when fetching system prompt for the next stage', async () => {
     const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
     const mockDbConfig: MockSupabaseDataConfig = {
         genericMockResults: {
            dialectic_sessions: { select: { data: [{ 
                id: testSessionId,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
                stage: mockThesisStage
            }] } },
             dialectic_feedback: { insert: { data: [{id: crypto.randomUUID()}] } },
             dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
             system_prompts: { select: { data: null, error: { message: "DB connection failed" } as any } },
             dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
         }
     };
     const mockUploadToStorage = spy(() => Promise.resolve({ path: 'a/path', error: null }));
     const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new TextEncoder().encode(JSON.stringify({ user_objective: 'test' })).buffer as ArrayBuffer, error: null }));
     const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
     const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: () => { throw new Error('should not be called'); } });
 
     assertEquals(status, 500);
     assertExists(error);
     assertStringIncludes(error.message, "Failed to retrieve system prompt template for next stage.");
  });

  await t.step('4.4 Handles failure when fetching context/previous contributions', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: { select: { data: [{ 
                id: testSessionId,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
                stage: mockThesisStage
            }] } },
            dialectic_feedback: { insert: { data: [{id: crypto.randomUUID()}] } },
            system_prompts: { select: { data: [{ id: testSystemPromptId, prompt_text: "Next prompt" }] } },
            dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
            dialectic_contributions: {
              select: (state: any) => {
                if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
                  return Promise.resolve({ data: null, error: { message: "DB connection failed" } as any });
                }
                return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
              }
            }
        }
    };
    const mockUploadToStorage = spy(() => Promise.resolve({ path: 'a/path', error: null }));
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new TextEncoder().encode(JSON.stringify({ user_objective: 'test' })).buffer as ArrayBuffer, error: null }));
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: () => { throw new Error('should not be called'); } });

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to retrieve AI contributions for prompt assembly.");
  });

  await t.step('4.5 Handles failure when updating the DialecticSession at the end', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockParalysisStage.slug, // Final stage, so it will attempt the final update
      currentIterationNumber: 1,
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
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockFinalStage
          }] },
          update: { data: null, error: { message: 'Update failed', name: 'UpdateFailedError' } }
        },
        dialectic_feedback: {
          insert: { data: [{ id: 'feedback-id' }] }
        },
        dialectic_contributions: {
          select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] }
        },
        dialectic_stage_transitions: {
          select: { data: null } // No next stage
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadToStorage = spy(() => Promise.resolve({ path: 'path/to/file.md', error: null }));
    const mockDownloadFromStorage = spy((..._args: any[]) => {
      throw new Error("Should not be called when finalizing a session");
    });
    const mockDependencies = { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: () => { throw new Error('should not be called'); } };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

    assertEquals(status, 500);
    assert(error, "Error should be returned");
    assertStringIncludes(error.message, 'Failed to update session status at completion');
    assertEquals(data, undefined);
    assertEquals(mockUploadToStorage.calls.length, 1);
  });

  await t.step('5.1 Handles failure when uploading the consolidated user feedback file', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId },
            stage: mockThesisStage
        }] } },
        dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadToStorage = spy(() => Promise.resolve({ error: new Error("Upload failed miserably"), path: null }));
    
    const mockDependencies = {
        logger,
        uploadToStorage: mockUploadToStorage,
        downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({data: null, error: null})),
        uploadAndRegisterResource: () => { throw new Error('should not be called'); }
    };

    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);
    
    // Assert
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Failed to store consolidated user feedback.");
    assertEquals(mockUploadToStorage.calls.length, 1, "uploadToStorage should have been called once and failed");
  });

  await t.step('5.2 Handles failure when uploading the rendered seed prompt for the next stage', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { 
          select: { data: [{ 
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockThesisStage
          }] },
          update: { data: [{ id: testSessionId, status: 'pending_antithesis' }] }
        },
        dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
        dialectic_contributions: {
          select: (state: any) => {
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
                return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', content_storage_path: 'path/to/content1.md', content_storage_bucket: 'test-bucket' }] });
            }
            return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
          }
        },
        system_prompts: { select: { data: [{ id: 'any-id', prompt_text: 'Next prompt' }] } },
        dialectic_stage_transitions: { select: { data: [{ target_stage: {...mockAntithesisStage, default_system_prompt_id: 'any-id'} }]}},
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadToStorage = spy((_client: SupabaseClient, _bucket: string, path: string) => {
      // This spy is for the consolidated feedback, which should succeed.
      return Promise.resolve({ path: 'path/to/feedback.md', error: null });
    });
    const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, path: string) => {
      if (path.includes('system_settings.json')) {
          return Promise.resolve({ data: new TextEncoder().encode(JSON.stringify({ user_objective: "test" })).buffer as ArrayBuffer, mimeType: 'application/json', error: null });
      }
      return Promise.resolve({ data: new TextEncoder().encode("Mocked AI content").buffer as ArrayBuffer, mimeType: 'text/plain', error: null });
    });
    const mockUploadAndRegisterResource = spy((..._args: any[]) => {
      return Promise.resolve({ error: { message: "Simulated upload failure", status: 500 } });
    });

    const mockDependencies = { 
        logger, 
        uploadToStorage: mockUploadToStorage, 
        downloadFromStorage: mockDownloadFromStorage,
        uploadAndRegisterResource: mockUploadAndRegisterResource
    };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

    assertEquals(status, 200);
    assertEquals(error, undefined);
    assertExists(data);

    // Assert that the function completed successfully but the specific path is null
    assertEquals(data.nextStageSeedPromptPath, null, "nextStageSeedPromptPath should be null on upload failure");
    
    // Check that the session status was still updated correctly
    assertEquals(data.updatedSession.status, 'pending_antithesis');
    
    // Check that the upload was attempted
    assertEquals(mockUploadAndRegisterResource.calls.length, 1);
  });

  await t.step('5.3 Handles failure when downloading AI contribution content (for seed prompt context)', async () => {
    const systemSettingsPath = `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/0_seed_inputs/system_settings.json`;
    const contributionPath = 'path/to/content1.md';

    const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
      if (path === systemSettingsPath) {
        const systemSettingsContent = JSON.stringify({ user_objective: "test objective" });
        return Promise.resolve({ data: new TextEncoder().encode(systemSettingsContent).buffer as ArrayBuffer, error: null });
      }
      if (path === contributionPath) {
        return Promise.resolve({ data: null, error: new Error("Download failed miserably") });
      }
      return Promise.resolve({ data: new TextEncoder().encode("Should not be called").buffer as ArrayBuffer, error: null });
    });

    const mockUploadToStorage = spy((_client: SupabaseClient, _bucket: string, path: string, _content: any, _options: any) => {
        return Promise.resolve({ path: path, error: null });
    });

    const mockPayload: SubmitStageResponsesPayload = {
        sessionId: testSessionId,
        currentStageSlug: mockThesisStage.slug,
        currentIterationNumber: 1,
        responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: { 
              select: { data: [{ 
                  id: testSessionId,
                  project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
                  stage: mockThesisStage
              }] },
            },
            dialectic_feedback: { insert: { data: [{ id: crypto.randomUUID() }] } },
            system_prompts: { select: { data: [{ id: testSystemPromptId, prompt_text: "Next prompt" }] } },
            dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
            dialectic_contributions: { 
                select: (state: any) => {
                    if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
                        return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', content_storage_path: contributionPath, content_storage_bucket: 'test-bucket' }] });
                    }
                    return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
                }
            }
        }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        uploadToStorage: mockUploadToStorage,
        downloadFromStorage: mockDownloadFromStorage,
        uploadAndRegisterResource: () => { throw new Error('should not be called'); }
    };
    
    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);
    
    // Assert
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, 'Failed to download content for prompt assembly');
  });

  await t.step('6.2 Successfully finalizes the session after the last stage (PARALYSIS)', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockParalysisStage.slug,
      currentIterationNumber: 1,
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
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadToStorage = spy(() => Promise.resolve({ path: 'path/to/file.md', error: null }));
    const mockDownloadFromStorage = spy((..._args: any[]) => {
      // This spy should not be called because there's no next stage to prepare a seed for.
      throw new Error("Should not be called when finalizing a session");
    });
    const mockDependencies = { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: () => { throw new Error('should not be called'); } };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

    assertEquals(status, 200);
    assertEquals(error, undefined);
    assert(data);
    assertEquals(data.updatedSession?.status, 'iteration_complete_pending_review');
    assertEquals(mockUploadToStorage.calls.length, 1, "Only feedback file should be uploaded");
    assertEquals(mockDownloadFromStorage.calls.length, 0, "No seed prompt should be generated");
    assertEquals(data.nextStageSeedPromptPath, null, "Next stage seed path should be null");
  });

  await t.step('6.3 Handles case where system prompt template for the next stage is not found', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { 
          select: { data: [{ 
              id: testSessionId,
              project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
              stage: mockThesisStage
          }] }
        },
        dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
        dialectic_contributions: {
          select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] },
        },
        system_prompts: {
          select: { data: null, error: new Error('not found'), status: 500 }
        },
        dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, uploadToStorage: spy(() => Promise.resolve({path: 'a/path', error: null})), downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({data: new TextEncoder().encode('{}').buffer as ArrayBuffer, error: null})), uploadAndRegisterResource: () => { throw new Error('should not be called'); } };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to retrieve system prompt template");
  });

  await t.step('6.4 Handles case where no AI contributions (context) are found for current stage', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: { 
              select: { data: [{ 
                  id: testSessionId,
                  project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
                  stage: mockThesisStage
              }] },
              update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] }
            },
            dialectic_feedback: { insert: { data: [{id: crypto.randomUUID()}] } },
            system_prompts: { select: { data: [{ id: testSystemPromptId, prompt_text: "Next prompt with {{prior_stage_ai_outputs}}" }] } },
            dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
            dialectic_contributions: {
              select: (state: any) => {
                if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
                  return Promise.resolve({ data: [] }); // No contributions found
                }
                return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
              }
            }
        }
    };

    const mockUploadToStorage = spy((...args: any[]) => Promise.resolve({ path: args[2] as string, error: null }));
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new TextEncoder().encode(JSON.stringify({ user_objective: "A test objective" })).buffer as ArrayBuffer, error: null }));
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockUploadAndRegisterResource = spy((...args: any[]) => {
      return Promise.resolve({ data: { id: 'resource-id', storage_path: `projects/${args[3]}/resources/some-uuid/${args[5]}` } as any, error: undefined });
    });
    const mockDependencies = { logger, uploadToStorage: mockUploadToStorage, downloadFromStorage: mockDownloadFromStorage, uploadAndRegisterResource: mockUploadAndRegisterResource };

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient, mockUser, mockDependencies);
    
    assertEquals(error, undefined);
    assertEquals(status, 200);
    assertExists(data);
    const seedPromptUploadCall = mockUploadAndRegisterResource.calls[0];
    assertExists(seedPromptUploadCall);
    if (seedPromptUploadCall && seedPromptUploadCall.args.length > 4) {
      const seedPromptBlob = seedPromptUploadCall.args[4] as Blob;
      const seedPromptContent = await seedPromptBlob.text();
      assertStringIncludes(seedPromptContent, `## AI Contributions from ${mockThesisStage.display_name}`);
      assertStringIncludes(seedPromptContent, "No AI-generated content was provided for this stage.", "Should contain the placeholder text for no contributions");
      assert(!seedPromptContent.includes("### Contribution from"), "Should not have any contribution content");
    }
  });

});