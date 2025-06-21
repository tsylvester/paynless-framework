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


  await t.step('5.1 Handles failure when uploading the consolidated user feedback file', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "Response text" }],
      userStageFeedback: {
        content: "This is specific user stage feedback for test 5.1.",
        feedbackType: "TestFeedbackType_5_1",
        resourceDescription: { summary: "Resource description for test 5.1 feedback" }
      }
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
        dialectic_process_templates: {
          select: { data: [mockProcessTemplate] }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockFileManager = createMockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(null, { message: 'Upload failed miserably' });
    
    const mockDependencies = {
        logger,
        downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({data: null, error: null})),
        fileManager: mockFileManager
    };

    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, mockDependencies);
    
    // Assert
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Failed to save user feedback.");
    assertEquals(mockFileManager.uploadAndRegisterFile.calls.length, 1, "FileManager should have been called once and failed");
  });

  await t.step('5.2 Handles failure when uploading the rendered seed prompt for the next stage', async () => {
    // 5.2.1 Arrange
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext) => {
      if (context.pathContext.fileType === 'seed_prompt') {
        return await Promise.resolve({
          record: null,
          error: { message: 'Simulated upload failure' },
        });
      }
      return await Promise.resolve({
        record: {
          id: 'fb-resource-id',
          project_id: testProjectId,
          user_id: testUserId,
          storage_bucket: 'test',
          storage_path: 'path',
          file_name: 'f',
          mime_type: 'm',
          size_bytes: 1,
          created_at: 'c',
          updated_at: 'u',
          resource_description: null,
        },
        error: null,
      });
    });

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: 'thesis',
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Response text" },
      ],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
        genericMockResults: {
            dialectic_sessions: {
                select: {
                    data: [{
                        id: testSessionId,
                        iteration_count: 1,
                        project: {
                            id: testProjectId,
                            user_id: testUserId,
                            process_template_id: testProcessTemplateId,
                        },
                        stage: mockThesisStage,
                    }],
                },
                update: {
                    data: [{
                        id: testSessionId,
                        status: `pending_${mockAntithesisStage.slug}`,
                    }],
                },
            },
            dialectic_feedback: { insert: { data: [{id: 'fb-id'}] } },
            dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
            system_prompts: { select: { data: [{ id: 'any-id', prompt_text: 'Next prompt' }] } },
            dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }] } },
            dialectic_process_templates: {
              select: { data: [mockProcessTemplate] }
            }
        }
    };
    const mockDownloadFromStorage = spy(() => Promise.resolve({ data: new ArrayBuffer(0), error: null }));
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);

    // 5.2.2 Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, {
      logger,
      downloadFromStorage: mockDownloadFromStorage,
      fileManager: mockFileManager,
    });
    
    // 5.2.3 Assert
    assertEquals(status, 500, 'Expected status 500 on seed prompt upload failure');
    assertExists(error, 'Expected an error object to be returned');
    assertStringIncludes(error.message, "Failed to save seed prompt for the next stage", "Error message for seed prompt save failure did not match");
  });

  await t.step('5.3 Handles failure when downloading AI contribution content (for seed prompt context)', async () => {
    // 5.3.1 Arrange
    const mockDownloadFromStorage = spy(
      (_client: SupabaseClient, _bucket: string, path: string): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => {
        // Fail only for a specific path to ensure failure happens at the right point
        if (path === 'path/to/content1.md') {
          return Promise.resolve({ data: null, error: new Error('Download failed') });
        }
        const buffer: ArrayBuffer = Buffer.from(new ArrayBuffer(0)).buffer;
        return Promise.resolve({ data: buffer, error: null });
      }
    );

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: 'thesis',
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: 'text' },
      ],
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ id: testSessionId, iteration_count: 1, project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId }, stage: mockThesisStage }] },
        },
        dialectic_feedback: { insert: { data: [{ id: 'feedback-id' }] } },
        dialectic_contributions: { 
            select: (state: any) => {
                if(state.filters.some((f: any) => f.column === 'is_latest_edit')) {
                    return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', storage_path: 'path/to/content1.md', storage_bucket: 'test-bucket' }] });
                }
                return Promise.resolve({ data: [{ id: state.filters.find((f: any) => f.column === 'id')?.value, session_id: testSessionId }]})
            }
        },
        dialectic_stage_transitions: { select: { data: [{ target_stage: mockAntithesisStage }] } },
        system_prompts: { select: { data: [{ id: 'any-id', prompt_text: 'Next prompt for context' }] } },
        dialectic_process_templates: { select: { data: [mockProcessTemplate] } },
        // Add a mock for when system_prompts select fails, if a test case covers it
        // Example: system_prompts_error_case: { select: { data: null, error: { name: 'PostgrestError', code: '500', message: 'DB error' } as any } }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    
    // Configure the file manager to succeed, so the test can proceed to the download failure
    const successfulFileManager = createMockFileManagerService();
    successfulFileManager.setUploadAndRegisterFileResponse(
      { id: 'resource-id', project_id: testProjectId, user_id: testUserId, storage_bucket: 'test-bucket', storage_path: 'path/to/resource.md', file_name: 'resource.md', mime_type: 'text/markdown', size_bytes: 100, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), resource_description: null },
      null,
    );

    // 5.3.2 Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, {
      logger,
      downloadFromStorage: mockDownloadFromStorage,
      fileManager: successfulFileManager,
    });

    // 5.3.3 Assert
    assertEquals(status, 500, 'Expected status 500');
    assertExists(error, 'Expected error object');
    assertStringIncludes(error.message, "Failed to prepare seed prompt for the next stage", "Error message for seed prompt preparation failure did not match");
    assertStringIncludes(error.message, "Failed to download content for prompt assembly", "Error message for seed prompt download failure did not match");
  });

  await t.step('5.4 Handles failure during fileManager.uploadAndRegisterFile for user feedback, database insertion is rolled back or not committed', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: 'thesis',
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: "text" }],
      userStageFeedback: { content: "Test feedback content", feedbackType: "test_feedback", resourceDescription: { summary: "Test summary" } },
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {
      genericMockResults: {
        dialectic_sessions: { select: { data: [{ id: testSessionId, iteration_count: 1, project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId }, stage: mockThesisStage }] } },
        dialectic_feedback: { insert: { data: [{ id: 'fb-id' }] } },
        dialectic_contributions: { select: { data: [{ id: testContributionId1, model_name: 'ModelA', session_id: testSessionId }] } },
        dialectic_process_templates: { select: { data: [mockProcessTemplate] } }
      }
    });

    // Act
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, {
      logger,
      downloadFromStorage: spy((): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({ data: null, error: new Error('Upload failed') })),
      fileManager: createMockFileManagerService(),
    });
    
    // Assert
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(data, undefined);
    assertStringIncludes(error.message, "Failed to save user feedback.");
  });

});