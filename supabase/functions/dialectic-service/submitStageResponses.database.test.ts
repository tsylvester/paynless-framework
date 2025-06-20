import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockPGRSTError,
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



  await t.step('3.1 Fails with appropriate error for missing sessionId', async () => {
    const mockPayload: SubmitStageResponsesPayload = { currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'id', responseText: 'text'}], sessionId: '', fileManager: createMockFileManagerService()};
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid payload: missing required fields.");
  });

  await t.step('3.2 Fails if sessionId does not correspond to an existing session', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: crypto.randomUUID(), currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [{ originalContributionId: 'id', responseText: 'text'}] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: null, error: { name: 'PostgrestError', message: "Not found", code: "PGRST116" } as any } }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });

    assertEquals(status, 404);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Session not found or access denied.");
  });

  await t.step('3.3 Fails for missing or invalid currentStageSlug', async () => {
    // 3.3.1 Arrange
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: 'invalid-stage', // Deliberately wrong slug
      currentIterationNumber: 1,
      fileManager: createMockFileManagerService(),
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
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      },
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        downloadFromStorage: async () => { throw new Error('should not be called'); },
        fileManager: createMockFileManagerService(),
    };

    // 3.3.2 Act
    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      mockUser,
      mockDependencies,
    );

    // 3.3.3 Assert
    assertEquals(status, 400);
    assertExists(error);
    assert(
      error.message.includes('Stage slug mismatch'),
      `Expected error message to include 'Stage slug mismatch', but got: "${error.message}"`,
    );
    assertEquals(data, undefined);
  });

  await t.step('3.4 Fails for missing currentIterationNumber', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, responses: [{ originalContributionId: 'id', responseText: 'text'}], fileManager: createMockFileManagerService(), currentIterationNumber: undefined as any};
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid payload: missing required fields.");
  });

  await t.step('3.5 Fails if responses array is empty or not provided', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [] };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid payload: missing required fields");
  });

    await t.step('3.6 Fails if items in responses array miss originalContributionId or responseText', async () => {
      const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [{ originalContributionId: testContributionId1, responseText: undefined as any }] };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid response item: missing fields.");
  });

  await t.step('3.7 Fails if an originalContributionId in a response is not found or not linked to the session', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [{ originalContributionId: 'non-existent-id', responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId, 
            project: { id: testProjectId, user_id: testUserId },
            stage: mockThesisStage
        }] } },
        dialectic_feedback: { insert: { data: [{ id: crypto.randomUUID() }] } },
        dialectic_contributions: { select: { data: null, error: { name: 'PostgrestError', code: '404', message: "not found" } as any } }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertStringIncludes(error.message, "Invalid contribution ID: non-existent-id");
  });

  await t.step('4.1 Handles failure when fetching the current DialecticSession', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: null, error: { name: 'PostgrestError', code: '500', message: "DB connection failed" } as any } }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });

    assertEquals(status, 404);
    assertExists(error);
    assertStringIncludes(error.message, "Session not found or access denied.");
  });

  await t.step('4.2 Handles failure when inserting records into dialectic_feedback', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: createMockFileManagerService(), responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ 
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId },
            stage: mockThesisStage
        }] } },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
        dialectic_feedback: { insert: { data: null, error: { name: 'PostgrestError', code: '500', message: "Insert failed" } as any } }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to insert user feedback records.");
  });

  await t.step('4.3 Handles failure when fetching system prompt for the next stage', async () => {
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
     const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: mockFileManager, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
     const mockDbConfig: MockSupabaseDataConfig = {
         genericMockResults: {
            dialectic_sessions: { select: { data: [{ 
                id: testSessionId,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
                stage: mockThesisStage
            }] } },
             dialectic_feedback: { insert: { data: [{id: crypto.randomUUID()}] } },
             dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
             system_prompts: { select: { data: null, error: { name: 'PostgrestError', code: '500', message: "DB connection failed" } as any } },
             dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }]}},
             dialectic_process_templates: {
               select: { data: [mockProcessTemplate] }
             }
         }
     };
     const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, _path: string) => { const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(JSON.stringify({ user_objective: 'test' }))).buffer; return Promise.resolve({ data: buffer, error: null }); });
     const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
     const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager });
 
     assertEquals(status, 500);
     assertExists(error);
     assertStringIncludes(error.message as string, "Failed to prepare the next stage.");
  });

  await t.step('4.4 Handles failure when fetching context/previous contributions', async () => {
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
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, currentStageSlug: mockThesisStage.slug, currentIterationNumber: 1, fileManager: mockFileManager, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
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
                  return Promise.resolve({ data: null, error: { name: 'PostgrestError', code: '500', message: "DB connection failed" } as any });
                }
                return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] });
              }
            },
            dialectic_process_templates: {
              select: { data: [mockProcessTemplate] }
            }
        }
    };
    const mockDownloadFromStorage = spy((_client: SupabaseClient, _bucket: string, _path: string) => { const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(JSON.stringify({ user_objective: 'test' }))).buffer; return Promise.resolve({ data: buffer, error: null }); });
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to prepare the next stage.");
  });

  await t.step('4.5 Handles failure when updating the DialecticSession at the end', async () => {
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
      currentStageSlug: mockParalysisStage.slug, // Final stage
      currentIterationNumber: 1,
      fileManager: mockFileManager,
      responses: [
        { originalContributionId: testContributionId1, responseText: "text" },
      ],
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
          update: { data: null, error: { name: 'PostgrestError', code: '500', message: 'Update failed' } as any }
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

    assertEquals(status, 500);
    assert(error, "Error should be returned");
    assertStringIncludes(error.message, 'Failed to update session status at completion');
    assertEquals(data, undefined);
    assertEquals(mockDownloadFromStorage.calls.length, 0, "No seed prompt should be generated");
  });

  await t.step('6.3 Handles case where system prompt template for the next stage is not found', async () => {
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
      currentStageSlug: 'thesis',
      currentIterationNumber: 1,
      fileManager: mockFileManager,
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
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new ArrayBuffer(0), error: null }));
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    assertEquals(status, 500);
    assertExists(error);
    assertStringIncludes(error.message, "Failed to prepare the next stage.");
  });

  await t.step('6.4 Handles case where no AI contributions (context) are found for current stage', async () => {
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(
      {
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
      },
      null
    );
    
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      currentStageSlug: 'thesis',
      currentIterationNumber: 1,
      fileManager: mockFileManager,
      responses: [
        { originalContributionId: testContributionId1, responseText: "text" },
      ]
    };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId },
            stage: mockThesisStage
          }] },
          update: { data: [{id: testSessionId, status: `pending_${mockAntithesisStage.slug}`}] }
        },
        dialectic_feedback: { insert: { data: [{id: '0c315a95-0d7d-473d-ab8f-87fc5a1e813c'}] } },
        dialectic_contributions: {
          select: (state: any) => {
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
              // This is the key part of this test: return no contributions
              return Promise.resolve({ data: [] });
            }
            return Promise.resolve({ data: [{ id: state.filters.find((f: any) => f.column === 'id')?.value, model_name: 'ModelA', session_id: testSessionId }] });
          }
        },
        dialectic_stage_transitions: {
          select: { data: [{ target_stage: mockAntithesisStage }] }
        },
        system_prompts: {
          select: { data: [{ id: testSystemPromptId, prompt_text: 'Next prompt with {{prior_stage_ai_outputs}}' }] }
        },
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
      logger,
      downloadFromStorage: spy(() => Promise.resolve({ data: new ArrayBuffer(0), error: null })),
      fileManager: mockFileManager,
    };
    
    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);

    // Assert
    assertEquals(status, 200);
    assert(data);
    assertEquals(error, undefined);
    assert(data.updatedSession?.status === `pending_${mockAntithesisStage.slug}`);

    // Verify the rendered prompt doesn't contain the placeholder but has the "no content" message.
    const uploadCalls = mockFileManager.uploadAndRegisterFile.calls;
    const seedPromptCall = uploadCalls.find(c => c.args[0].pathContext.fileType === 'seed_prompt');
    assertExists(seedPromptCall, 'A seed prompt should still be generated.');
    const seedPromptFileContent = seedPromptCall.args[0].fileContent;
    const seedPromptContent = typeof seedPromptFileContent === 'string'
        ? seedPromptFileContent
        : new TextDecoder().decode(seedPromptFileContent);
    assert(!seedPromptContent.includes('{{prior_stage_ai_outputs}}'), "Placeholder should be replaced.");
    assert(seedPromptContent.includes('No AI-generated content was provided for this stage'), 'Should include the "no content" message.');
  });

});