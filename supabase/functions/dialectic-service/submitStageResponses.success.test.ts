import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy, type Spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  IMockStorageDownloadResponse,
} from '../_shared/supabase.mock.ts';
import {
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type DialecticProject,
  type DialecticProjectResource,
} from './dialectic.interface.ts';
import { createMockFileManagerService, MockFileManagerService } from "../_shared/services/file_manager.mock.ts";
import type { UploadContext, FileManagerResponse, FileRecord } from "../_shared/types/file_manager.types.ts";
import type { Database, Json } from '../types_db.ts';
import type { ServiceError } from '../_shared/types.ts';
import { PromptAssembler } from '../_shared/prompt-assembler.ts';

// Import the specific action handler we are testing
import { submitStageResponses } from './submitStageResponses.ts';
import { logger } from "../_shared/logger.ts";

// Type guard to verify the shape of resourceDescription for tests without casting.
function isResourceDescriptionWithSummary(
  value: unknown,
): value is { summary: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'summary' in value
  );
}

const MOCK_DEFAULT_DOMAIN = {
  id: "default-domain-id",
  name: "Default Test Domain",
  description: "A default domain for testing success paths."
};

const MOCK_OVERLAY_DOMAIN = {
  id: "mock-domain-with-overlay",
  name: "Mock Domain With Overlay",
  description: "A mock domain for testing overlay features."
};

const MOCK_SUCCESS_TEST_DOMAIN = {
  id: "mock-domain-for-success-test",
  name: "Mock Domain For Success",
  description: "A mock domain for testing."
};

const MOCK_MODEL_ID = 'model-id-1';

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

  // This global spy is less critical if tests provide specific mocks in dependencies.
  const mockDownloadFromStorageGlobalSpy = spy(async (_client: SupabaseClient, _bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
    if (path === systemSettingsPathForScope) {
        const buffer: ArrayBuffer = Buffer.from(new TextEncoder().encode(systemSettingsContentForScope)).buffer;
        return Promise.resolve({ data: buffer, error: null, mimeType: 'application/json' });
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
    return Promise.resolve({ data: null, error: new Error(`Path not found in global spy: ${path}`), mimeType: undefined });
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
    mockFileManager.uploadAndRegisterFileSpy = spy(
      async (
        context: UploadContext,
      ): Promise<FileManagerResponse> => {
        const { pathContext, fileContent, mimeType } = context;
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
            resource_description: context.resourceDescriptionForDb ?? null,
            feedback_type: context.feedbackTypeForDb ?? '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: pathContext.iteration!,
            session_id: pathContext.sessionId!,
            stage_slug: pathContext.stageSlug!,
          },
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
            current_stage_id: testThesisStageId,
            project: {
              id: testProjectId,
              user_id: testUserId,
              process_template_id: testProcessTemplateId,
              initial_user_prompt: "Initial prompt for testing.",
              initial_prompt_resource_id: "mock-initial-prompt-resource-id",
              project_name: "Test Project Name",
              repo_url: "mock-repo-url",
              selected_domain_overlay_id: "mock-selected-domain-overlay-id",
              selected_domain_id: MOCK_SUCCESS_TEST_DOMAIN.id,
              dialectic_domains: {
                id: MOCK_SUCCESS_TEST_DOMAIN.id,
                name: MOCK_SUCCESS_TEST_DOMAIN.name,
                description: MOCK_SUCCESS_TEST_DOMAIN.description
              }
            },
            stage: mockThesisStage,
            selected_model_ids: [MOCK_MODEL_ID],
          }] },
          update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] },
        },
        dialectic_projects: {
          select: (state: any) => {
            const idFilter = state.filters.find((f: any) => f.column === 'id');
            if (idFilter && idFilter.value === testProjectId) {
              return Promise.resolve({
                data: [{
                  id: testProjectId,
                  user_id: testUserId,
                  process_template_id: testProcessTemplateId,
                  initial_user_prompt: "Initial prompt for testing.",
                  initial_prompt_resource_id: "mock-initial-prompt-resource-id",
                  project_name: "Test Project Name",
                  repo_url: "mock-repo-url",
                  selected_domain_id: "mock-domain-for-success-test",
                  selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                  dialectic_domains: [
                    { id: "mock-domain-for-success-test", name: "Mock Domain For Success", description: "A mock domain for testing" },
                    { id: "another-mock-domain", name: "Another Mock Domain", description: "Another one" }
                  ],
                  process_template: {
                    id: testProcessTemplateId,
                    name: "Mock Process Template Name",
                  }
                }],
                error: null,
              });
            }
            // Fallback for other project ID lookups if any
            return Promise.resolve({ data: null, error: { name: 'PostgrestError', message: "No dialectic_projects mock for this ID", code: "PGRST116" }});
          }
        },
        dialectic_feedback: {
          select: { data: [{
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/${mockThesisStage.slug}`,
            file_name: `user_feedback_${mockThesisStage.slug}.md`
          }]},
          insert: { data: [{ id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId, feedback_type: "FileManagerCreatedFeedback_v1" }] }
        },
        dialectic_stages: {
          select: { data: [{ slug: 'thesis', display_name: 'Thesis' }] }
        },
        dialectic_contributions: {
          select: (state: any) => {
            // For fetching contributions for seed prompt assembly
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
              return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelA', storage_path: 'path/to/content1.md', storage_bucket: 'test-bucket' }, { id: testContributionId2, model_name: 'ModelB', storage_path: 'path/to/content2.md', storage_bucket: 'test-bucket' }] });
            }
            // For validating originalContributionIds at the start of the function
            if (state.selectColumns === 'id') {
              return Promise.resolve({ data: [{ id: testContributionId1 }, { id: testContributionId2 }] });
            }
            // Fallback to catch unhandled cases
            return Promise.resolve({ data: [], error: { message: `Unhandled dialectic_contributions select mock in test 1.1`, details: JSON.stringify(state) } });
          }
        },
        system_prompts: {
          select: { data: [{ id: testSystemPromptId, prompt_text: 'Test prompt for Antithesis using {{prior_stage_ai_outputs}} and {{prior_stage_user_feedback}}' }] },
        },
        dialectic_stage_transitions: {
          select: { data: [{
            source_stage_id: mockThesisStage.id,
            target_stage: {
              id: mockAntithesisStage.id,
              slug: mockAntithesisStage.slug,
              display_name: mockAntithesisStage.display_name,
              default_system_prompt_id: mockAntithesisStage.default_system_prompt_id,
              input_artifact_rules: mockAntithesisStage.input_artifact_rules,
              expected_output_artifacts: mockAntithesisStage.expected_output_artifacts,
              description: mockAntithesisStage.description,
              created_at: mockAntithesisStage.created_at,
              system_prompts: {
                id: testSystemPromptId,
                prompt_text: 'Test prompt for Antithesis using {{prior_stage_ai_outputs}} and {{prior_stage_user_feedback}}'
              },
              domain_specific_prompt_overlays: []
            }
          }]}
        },
        dialectic_process_templates: {
            select: { data: [mockProcessTemplate] }
        },
        'ai_providers': {
            select: { data: [{ id: MOCK_MODEL_ID, config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      },
      storageMock: {
        downloadResult: async (bucket: string, path: string) => {
          const normalizedPath = path.replace(/\\/g, "/");
          if (bucket === 'test-bucket' && normalizedPath === 'path/to/content1.md') {
            return { data: new Blob([new TextEncoder().encode("AI content from ModelA")]), error: null };
          }
          if (bucket === 'test-bucket' && normalizedPath === 'path/to/content2.md') {
            return { data: new Blob([new TextEncoder().encode("AI content from ModelB")]), error: null };
          }
          if (bucket === 'dialectic-contributions' && normalizedPath === priorStageFeedbackPathForScope) {
             return { data: new Blob([new TextEncoder().encode(priorStageFeedbackContentForScope)]), error: null };
          }
          logger.error(`[Test 1.1 storageMock] Unhandled path: bucket '${bucket}', path '${path}'`);
          return { data: null, error: new Error(`Mock path not found in storageMock (Test 1.1): ${bucket}/${path}`) };
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    
    const mockDependencies = {
        logger,
        fileManager: mockFileManager,
        downloadFromStorage: async (client: SupabaseClient, bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
            const { data: blob, error: downloadError } = await client.storage.from(bucket).download(path);
            if (downloadError) {
                logger.error(`[Test 1.1 - mockDependencies.downloadFromStorage] Error downloading ${bucket}/${path}`, { error: downloadError });
                return { data: null, error: downloadError, mimeType: undefined };
            }
            if (!blob) {
                logger.warn(`[Test 1.1 - mockDependencies.downloadFromStorage] No blob from ${bucket}/${path}`, { pathDetails: `${bucket}/${path}` });
                return { data: null, error: new Error(`No data returned from storage download for ${path}`), mimeType: undefined };
            }
            const arrayBuffer = await blob.arrayBuffer();
            return { data: arrayBuffer, error: null, mimeType: blob.type };
        },
        indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
        embeddingClient: { createEmbedding: () => Promise.resolve([]) }
    };

    const assembleSpy = spy(PromptAssembler.prototype, "assemble");

    try {
      // 1.1.2 Act: Call the function
      const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

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
      assertEquals(mockFileManager.uploadAndRegisterFileSpy.calls.length, 2, "Expected FileManagerService to be called twice");

      const feedbackCall = mockFileManager.uploadAndRegisterFileSpy.calls.find((c: { args: [UploadContext] }) => c.args[0].pathContext.fileType === 'user_feedback');
      assertExists(feedbackCall, "Expected a call to save 'user_feedback'");
      
      const seedPromptCall = mockFileManager.uploadAndRegisterFileSpy.calls.find((c: { args: [UploadContext] }) => c.args[0].pathContext.fileType === 'seed_prompt');
      assertExists(seedPromptCall, "Expected a call to save 'seed_prompt'");

      // Assertions for the 'user_feedback' call
      const feedbackUploadContext = feedbackCall.args[0];
      assertEquals(feedbackUploadContext.pathContext.projectId, testProjectId);
      assertEquals(feedbackUploadContext.pathContext.sessionId, testSessionId);
      assertEquals(feedbackUploadContext.pathContext.stageSlug, mockThesisStage.slug);
      assertEquals(feedbackUploadContext.pathContext.iteration, 1);
      assertEquals(feedbackUploadContext.pathContext.originalFileName, `user_feedback_${mockThesisStage.slug}.md`);
      assertEquals(feedbackUploadContext.mimeType, 'text/markdown');
      assertEquals(feedbackUploadContext.feedbackTypeForDb, "StageReviewSummary_v1_test");
      
      const resourceDesc = feedbackUploadContext.resourceDescriptionForDb;
      assertExists(resourceDesc, "resourceDescriptionForDb should exist in feedbackUploadContext");
      assert(isResourceDescriptionWithSummary(resourceDesc), "resourceDescriptionForDb should be an object with a summary property");
      assertEquals(resourceDesc.summary, "Test summary for resourceDescription");

      // 1.4 Verifies content of the consolidated feedback file
      const feedbackFileContent = feedbackUploadContext.fileContent;
      const feedbackContentString = typeof feedbackFileContent === 'string'
          ? feedbackFileContent
          : new TextDecoder().decode(feedbackFileContent);
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

      // Assertions for PromptAssembler.assemble
      assertEquals(assembleSpy.calls.length, 1, "PromptAssembler.assemble should be called once");
      const assembleArgs = assembleSpy.calls[0].args;
      
      // projectContext
      assertExists(assembleArgs[0], "projectContextForAssembler should be provided");
      assertEquals(assembleArgs[0].id, testProjectId, "Incorrect projectId in projectContext");
      assertEquals(assembleArgs[0].initial_user_prompt, "Initial prompt for testing.", "Incorrect projectInitialUserPrompt");
      assertEquals(assembleArgs[0].selected_domain_id, MOCK_SUCCESS_TEST_DOMAIN.id, "Incorrect selectedDomain id");
      assertEquals(assembleArgs[0].user_domain_overlay_values, null, "user_domain_overlay_values should be null as not provided in this test's project mock");


      // sessionContext
      assertExists(assembleArgs[1], "sessionContextForAssembler should be provided");
      assertEquals(assembleArgs[1].id, testSessionId, "Incorrect sessionId in sessionContext");
      assertEquals(assembleArgs[1].iteration_count, 1, "Incorrect currentIterationNumber in sessionContext");
      assertEquals(assembleArgs[1].current_stage_id, mockThesisStage.id, "Incorrect currentStageId in sessionContext"); // Current stage at the time of assembly for NEXT stage's seed.

      // stageContext (for the NEXT stage)
      assertExists(assembleArgs[2], "stageContextForAssembler (for next stage) should be provided");
      assertEquals(assembleArgs[2].slug, mockAntithesisStage.slug, "Incorrect stageSlug for next stage in stageContext");
      assertEquals(assembleArgs[2].display_name, mockAntithesisStage.display_name, "Incorrect stageDisplayName for next stage");
      assertExists(assembleArgs[2].input_artifact_rules, "inputArtifactRules for next stage should exist");
      
      // seedPromptTemplate (content of the system_prompt for the NEXT stage)
      assertExists(assembleArgs[3], "seedPromptTemplate for next stage should be provided");
      assertEquals(assembleArgs[3], 'Initial prompt for testing.', "Incorrect seedPromptTemplate content");
      
      // iterationNumber (for the NEXT stage's seed prompt, which is still part of the current iteration's lifecycle)
      assertEquals(assembleArgs[4], 1, "Incorrect iterationNumber for assemble call");
    } finally {
      assembleSpy.restore();
    }
  });

  await t.step('1.2 Successfully processes responses for the final stage (no next transition)', async () => {
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFileSpy = spy(
      async (
        context: UploadContext,
      ): Promise<FileManagerResponse> => {
        const { pathContext, fileContent, mimeType } = context;
        const path = `projects/${pathContext.projectId}/sessions/${pathContext.sessionId}/iteration_${pathContext.iteration}/${pathContext.stageSlug}/${pathContext.originalFileName}`;
        
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
            id: 'resource-id',
            project_id: pathContext.projectId,
            user_id: testUserId,
            storage_bucket: 'test-bucket',
            storage_path: path,
            file_name: pathContext.originalFileName || 'test.md',
            mime_type: mimeType || 'text/markdown',
            size_bytes: buffer.byteLength,
            resource_description: context.resourceDescriptionForDb ?? null,
            feedback_type: context.feedbackTypeForDb ?? '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: pathContext.iteration!,
            session_id: pathContext.sessionId!,
            stage_slug: pathContext.stageSlug!,
          },
          error: null,
        });
      },
    );

    // 1.2.1 Arrange
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockParalysisStage.slug, // Final stage
      currentIterationNumber: 1,
      responses: [], // No AI responses for final user feedback submission
      userStageFeedback: {
        content: "This is the final feedback for the paralysis stage.",
        feedbackType: "StageReviewSummary_v1_final_test",
        resourceDescription: { summary: "Final thoughts summary" }
      }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            iteration_count: 1,
            selected_model_ids: [MOCK_MODEL_ID],
            project: {
              id: testProjectId,
              user_id: testUserId,
              process_template_id: testProcessTemplateId,
              initial_prompt_resource_id: "mock-initial-prompt-resource-id",
              project_name: "Test Project Name Final Stage",
              repo_url: "mock-repo-url-final",
              selected_domain_overlay_id: "mock-selected-domain-overlay-id-final",
              selected_domain_id: MOCK_DEFAULT_DOMAIN.id,
              dialectic_domains: {
                id: MOCK_DEFAULT_DOMAIN.id,
                name: MOCK_DEFAULT_DOMAIN.name,
                description: MOCK_DEFAULT_DOMAIN.description
              }
            },
            stage: mockParalysisStage // This is the final stage
          }] },
          update: { data: [{ id: testSessionId, status: `completed_${mockParalysisStage.slug}` }] },
        },
        dialectic_stage_transitions: {
          // No transition expected from the final stage
          select: { data: null } 
        },
        // No dialectic_contributions needed if responses array is empty
        // No system_prompts needed if no next stage
        'ai_providers': {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      }
    };
    
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
      logger,
      downloadFromStorage: spy((_client: SupabaseClient, _bucket: string, _path: string): Promise<{ data: ArrayBuffer | null; error: Error | null; }> => Promise.resolve({ data: new ArrayBuffer(0), error: null })),
      fileManager: mockFileManager,
      indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
      embeddingClient: { createEmbedding: () => Promise.resolve([]) }
    };

    const { data, status, error } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

    assertEquals(error, undefined);
    assertEquals(status, 200);
    assertExists(data);

    // In the final stage, we don't generate a seed prompt for the next stage.
    // So uploadAndRegisterResource should NOT have been called.
    assertEquals(mockFileManager.uploadAndRegisterFileSpy.calls.length, 1, "FileManagerService should be called once for feedback");
    const feedbackCall = mockFileManager.uploadAndRegisterFileSpy.calls[0];
    assertEquals(feedbackCall.args[0].pathContext.fileType, 'user_feedback');

    assert(data.nextStageSeedPromptPath === null || data.nextStageSeedPromptPath === undefined, "Next stage seed path should be null for the final stage");
    assertEquals(data.updatedSession?.status, 'completed_paralysis', "Session status should be updated to reflect completion");
  });

  await t.step('6.1 Successfully processes responses when domain overlay is present', async () => {
    const userSubmittedStageFeedbackContent = "Feedback content for domain overlay test.";
    const mockFileManager = createMockFileManagerService();
    mockFileManager.uploadAndRegisterFileSpy = spy(
      async (
        context: UploadContext,
      ): Promise<FileManagerResponse> => {
        const { pathContext, fileContent, mimeType } = context;
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
            id: 'resource-id-fm-overlay-test',
            project_id: pathContext.projectId,
            user_id: testUserId,
            storage_bucket: 'test-bucket',
            storage_path: path,
            file_name: pathContext.originalFileName || 'test.md',
            mime_type: mimeType || 'text/markdown',
            size_bytes: buffer.byteLength,
            resource_description: context.resourceDescriptionForDb ?? null,
            feedback_type: context.feedbackTypeForDb ?? '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            iteration_number: pathContext.iteration!,
            session_id: pathContext.sessionId!,
            stage_slug: pathContext.stageSlug!,
          },
          error: null,
        });
      },
    );

    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [
        { originalContributionId: testContributionId1, responseText: "Response for overlay test 1" },
      ],
      userStageFeedback: {
        content: userSubmittedStageFeedbackContent,
        feedbackType: "StageReviewSummary_v1_overlay_test",
        resourceDescription: { summary: "Overlay test summary" }
      }
    };

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{
            id: testSessionId,
            iteration_count: 1,
            project: {
              id: testProjectId,
              user_id: testUserId,
              process_template_id: testProcessTemplateId,
              initial_user_prompt: "Initial prompt for overlay testing.",
              initial_prompt_resource_id: "mock-initial-prompt-resource-id-overlay",
              project_name: "Test Project With Overlay",
              repo_url: "mock-repo-url-overlay",
              selected_domain_id: MOCK_OVERLAY_DOMAIN.id,
              selected_domain_overlay_id: "overlay-id-for-6.1",
              user_domain_overlay_values: { custom_instruction: "Apply this overlay specific instruction." },
              dialectic_domains: {
                id: MOCK_OVERLAY_DOMAIN.id,
                name: MOCK_OVERLAY_DOMAIN.name,
                description: MOCK_OVERLAY_DOMAIN.description
              }
            },
            stage: mockThesisStage,
            selected_model_ids: [MOCK_MODEL_ID],
          }] },
          update: { data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}` }] },
        },
        dialectic_projects: { // This mock might need to be adjusted if the function queries it directly with overlay specifics
          select: (state: any) => {
            const idFilter = state.filters.find((f: any) => f.column === 'id');
            if (idFilter && idFilter.value === testProjectId) {
              return Promise.resolve({
                data: [{
                  id: testProjectId,
                  user_id: testUserId,
                  process_template_id: testProcessTemplateId,
                  initial_user_prompt: "Initial prompt for overlay testing.",
                  initial_prompt_resource_id: "mock-initial-prompt-resource-id-overlay",
                  project_name: "Test Project With Overlay",
                  repo_url: "mock-repo-url-overlay",
                  selected_domain_id: MOCK_OVERLAY_DOMAIN.id,
                  selected_domain_overlay_id: "overlay-id-for-6.1",
                  user_domain_overlay_values: { custom_instruction: "Apply this overlay specific instruction." },
                  dialectic_domains: { // Embedded as per the join simulation
                    id: MOCK_OVERLAY_DOMAIN.id, 
                    name: MOCK_OVERLAY_DOMAIN.name, 
                    description: MOCK_OVERLAY_DOMAIN.description 
                  },
                  process_template: {
                    id: testProcessTemplateId,
                    name: "Mock Process Template Name",
                  }
                }],
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: { name: 'PostgrestError', message: "No dialectic_projects mock for this ID in 6.1", code: "PGRST116" }});
          }
        },
        dialectic_feedback: {
          select: { data: [{
            storage_bucket: 'dialectic-contributions',
            storage_path: `projects/${testProjectId}/sessions/${testSessionId}/iteration_1/${mockThesisStage.slug}`,
            file_name: `user_feedback_${mockThesisStage.slug}.md`
          }]},
          insert: { data: [{ id: crypto.randomUUID(), session_id: testSessionId, user_id: testUserId, feedback_type: "FileManagerCreatedFeedback_v1_overlay" }] }
        },
        dialectic_stages: {
          select: { data: [{ slug: 'thesis', display_name: 'Thesis' }] }
        },
        dialectic_contributions: {
          select: (state: any) => {
            // For fetching contributions for seed prompt assembly
            if (state.filters.some((f: any) => f.column === 'is_latest_edit')) {
              return Promise.resolve({ data: [{ id: testContributionId1, model_name: 'ModelOverlay', storage_path: 'path/to/overlay_content.md', storage_bucket: 'test-bucket' }] });
            }
            // For validating originalContributionId at the start of the function
            if (state.selectColumns === 'id') {
                return Promise.resolve({ data: [{ id: testContributionId1 }] });
            }
            // Fallback to catch unhandled cases
            return Promise.resolve({ data: [], error: { message: `Unhandled dialectic_contributions select mock in test 6.1`, details: JSON.stringify(state) } });
          }
        },
        system_prompts: { // Ensure this prompt can utilize overlay values
          select: { data: [{ id: testSystemPromptId, prompt_text: 'Overlay test prompt for Antithesis. Overlay: {{custom_instruction}} Prior: {{prior_stage_ai_outputs}} Feedback: {{prior_stage_user_feedback}}' }] },
        },
        dialectic_stage_transitions: {
          select: { data: [{
            source_stage_id: mockThesisStage.id,
            target_stage: {
              id: mockAntithesisStage.id,
              slug: mockAntithesisStage.slug,
              display_name: mockAntithesisStage.display_name,
              default_system_prompt_id: mockAntithesisStage.default_system_prompt_id,
              input_artifact_rules: mockAntithesisStage.input_artifact_rules,
              expected_output_artifacts: mockAntithesisStage.expected_output_artifacts,
              description: mockAntithesisStage.description,
              created_at: mockAntithesisStage.created_at,
              system_prompts: {
                id: testSystemPromptId,
                prompt_text: 'Overlay test prompt for Antithesis. Overlay: {{custom_instruction}} Prior: {{prior_stage_ai_outputs}} Feedback: {{prior_stage_user_feedback}}'
              },
              domain_specific_prompt_overlays: []
            }
          }]}
        },
        dialectic_process_templates: {
            select: { data: [mockProcessTemplate] }
        },
        'ai_providers': {
            select: { data: [{ id: MOCK_MODEL_ID, config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      },
      storageMock: {
        downloadResult: async (bucket: string, path: string) => {
          const normalizedPath = path.replace(/\\/g, "/");
          if (bucket === 'test-bucket' && normalizedPath === 'path/to/overlay_content.md') {
            return { data: new Blob([new TextEncoder().encode("AI content specific to overlay test")]), error: null };
          }
          if (bucket === 'dialectic-contributions' && normalizedPath === priorStageFeedbackPathForScope) {
             return { data: new Blob([new TextEncoder().encode(priorStageFeedbackContentForScope)]), error: null };
          }
          logger.error(`[Test 6.1 storageMock] Unhandled path: bucket '${bucket}', path '${path}'`);
          return { data: null, error: new Error(`Mock path not found in storageMock for 6.1: ${bucket}/${path}`) };
        }
      }
    };
    
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = {
        logger,
        fileManager: mockFileManager,
        downloadFromStorage: async (client: SupabaseClient, bucket: string, path: string): Promise<{ data: ArrayBuffer | null; mimeType?: string; error: Error | null; }> => {
            const { data: blob, error: downloadError } = await client.storage.from(bucket).download(path);
            if (downloadError) {
                logger.error(`[Test 6.1 - mockDependencies.downloadFromStorage] Error downloading ${bucket}/${path}`, { error: downloadError });
                return { data: null, error: downloadError, mimeType: undefined };
            }
            if (!blob) {
                logger.warn(`[Test 6.1 - mockDependencies.downloadFromStorage] No blob from ${bucket}/${path}`, { pathDetails: `${bucket}/${path}` });
                return { data: null, error: new Error(`No data returned from storage download for ${path}`), mimeType: undefined };
            }
            const arrayBuffer = await blob.arrayBuffer();
            return { data: arrayBuffer, error: null, mimeType: blob.type };
          },
        indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
        embeddingClient: { createEmbedding: () => Promise.resolve([]) }
    };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

    assertEquals(status, 200, "[6.1] Expected status 200");
    assertExists(data, "[6.1] Expected data in the response");
    assertEquals(error, undefined, "[6.1] Expected no error in the response");
    
    assertExists(data.updatedSession, "[6.1] updatedSession should exist in the response data");
    assertExists(data.updatedSession.status, "[6.1] updatedSession.status should exist and be a string");
    assert(typeof data.updatedSession.status === 'string', "[6.1] updatedSession.status should be a string type");
    assert(data.updatedSession.status.includes(`pending_${mockAntithesisStage.slug}`), "[6.1] Session status should be updated");
    assertEquals(data.feedbackRecords.length, 1, "[6.1] Expected one feedback record");
    assertEquals(mockFileManager.uploadAndRegisterFileSpy.calls.length, 2, "[6.1] Expected FileManagerService to be called twice");

    const seedPromptCall = mockFileManager.uploadAndRegisterFileSpy.calls.find((c: { args: [UploadContext] }) => c.args[0].pathContext.fileType === 'seed_prompt');
    assertExists(seedPromptCall, "[6.1] Expected a call to save 'seed_prompt'");
    const seedPromptFileContent = seedPromptCall.args[0].fileContent;
    const seedPromptContent = typeof seedPromptFileContent === 'string'
        ? seedPromptFileContent
        : new TextDecoder().decode(seedPromptFileContent);
    
    assertStringIncludes(seedPromptContent, "AI content specific to overlay test", "[6.1] Seed prompt missing AI output for overlay");
    assertStringIncludes(seedPromptContent, "Apply this overlay specific instruction.", "[6.1] Seed prompt missing overlay custom instruction");
    assertStringIncludes(seedPromptContent, priorStageFeedbackContentForScope, "[6.1] Seed prompt missing prior stage user feedback");
    
    assert(data?.nextStageSeedPromptPath, "[6.1] Next stage seed path should be returned");
    if(data?.nextStageSeedPromptPath) {
        assert(data.nextStageSeedPromptPath.includes(mockAntithesisStage.slug), "[6.1] Next stage seed path should be for antithesis");
    }
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
            iteration_count: 1,
            project: {
              id: testProjectId,
              user_id: testUserId,
              max_iterations: 3,
              process_template_id: testProcessTemplateId,
              initial_prompt_resource_id: "mock-initial-prompt-resource-id",
              project_name: "Test Project Name",
              repo_url: "mock-repo-url",
              selected_domain_overlay_id: "mock-selected-domain-overlay-id-final",
              selected_domain_id: MOCK_DEFAULT_DOMAIN.id,
              dialectic_domains: {
                id: MOCK_DEFAULT_DOMAIN.id,
                name: MOCK_DEFAULT_DOMAIN.name,
                description: MOCK_DEFAULT_DOMAIN.description
              }
            },
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
        },
        'ai_providers': {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDownloadFromStorage = spy((..._args: any[]) => {
      // This spy should not be called because there's no next stage to prepare a seed for.
      throw new Error("Should not be called when finalizing a session");
    });
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorage, fileManager: mockFileManager, indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) } };
    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

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
    const mockRecord: FileRecord = {
      id: 'mock-record-id',
      project_id: testProjectId,
      user_id: testUserId,
      session_id: testSessionId,
      storage_bucket: 'test-bucket',
      storage_path: 'path/to/file.md',
      file_name: 'test.md',
      mime_type: 'text/markdown',
      size_bytes: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resource_description: null
    }
    mockFileManager.uploadAndRegisterFileSpy = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
      if (context.pathContext.fileType === 'user_feedback') return { record: { ...mockRecord, storage_path: 'path/to/feedback.md' }, error: null };
      return { record: { ...mockRecord, storage_path: 'path/to/other.md' }, error: null };
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
        dialectic_stages: { select: { data: [mockParalysisStage] } },
        'ai_providers': {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      },
      storageMock: {
        downloadResult: (bucket, path) => {
            if (path === 'path/to/paralysis_A.md') return Promise.resolve({ data: new Blob([new TextEncoder().encode('Paralysis content by ModelA')]), error: null });
            return Promise.resolve({data: null, error: new Error('Mock download error for completion test')});
        }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const { data, error, status } = await submitStageResponses(
      mockPayload, 
      mockSupabase.client as unknown as SupabaseClient<Database>, 
      mockUser, 
      { 
        logger, 
        downloadFromStorage: async (client: SupabaseClient, bucket: string, path: string) => {
          const { data, error } = await client.storage.from(bucket).download(path);
          if (error) {
            return { data: null, error, mimeType: undefined };
          }
          if (!data) {
            return { data: null, error: new Error('no data'), mimeType: undefined };
          }
          const ab = await data.arrayBuffer();
          return { data: ab, error: null, mimeType: data.type };
        },
        fileManager: mockFileManager,
        indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
        embeddingClient: { createEmbedding: () => Promise.resolve([]) }
      });

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
        dialectic_sessions: { select: { data: null, error: new Error("Not found")} }, // Simulate session/project not found by returning null data
        dialectic_contributions: { // Correctly nested inside genericMockResults
          select: (state: any) => {
            const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
            return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
          }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorageGlobalSpy, fileManager: mockFileManager, indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) }  };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

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
        },
        'ai_providers': {
          select: { data: [{ config: { provider_max_input_tokens: 8000, tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' } }, api_identifier: 'mock-api-id' }], error: null }
        },
      },
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorageGlobalSpy, fileManager: mockFileManager, indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) } };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error?.message, "Session data is incomplete.");
    assertExists(error?.details, "Error details should exist");
    assertEquals(error?.details, "Project or stage details missing from session.", "Error details message mismatch");
    assertEquals(data, undefined);
  });


  await t.step("1.4 Handles failure when fetching next stage transition", async () => {
    const mockFileManager = createMockFileManagerService();
    // Ensure file manager succeeds for user feedback to test downstream transition error
    mockFileManager.uploadAndRegisterFileSpy = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
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
            resource_description: null,
          }, 
          error: null 
        });
      }
      // Fallback for other file types if any are unexpectedly called
      return Promise.resolve({ record: null, error: new Error("Unexpected fileManager call in test 1.4") });
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
        dialectic_stage_transitions: { select: { data: null, error: new Error("DB error") } }, // Simulate error fetching transition
        dialectic_contributions: { // Correctly nested
            select: (state: any) => {
                const id = state.filters.find((f: { column: string; value: any; }) => f.column === 'id')?.value;
                return Promise.resolve({ data: [{ id: id, model_name: `Model for ${id}`, session_id: testSessionId }] });
            }
        }
      },
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDependencies = { logger, downloadFromStorage: mockDownloadFromStorageGlobalSpy, fileManager: mockFileManager, indexingService: { indexDocument: () => Promise.resolve({ success: true }) }, embeddingClient: { createEmbedding: () => Promise.resolve([]) } };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error?.message, "Failed to determine next process stage.");
    assertEquals(data, undefined);
  });

  await t.step("1.5 Handles scenario where there is no next stage (e.g., end of process)", async () => {
    const mockFileManager = createMockFileManagerService(); 
    // Correctly define the spy to match the expected signature
    mockFileManager.uploadAndRegisterFileSpy = spy(async (context: UploadContext): Promise<FileManagerResponse> => {
      // Simple mock for this test case, can be expanded if needed
      const record: FileRecord = { 
          id: 'mock-record-id-for-step-1.5',
          project_id: testProjectId,
          user_id: testUserId,
          session_id: testSessionId,
          storage_bucket: 'test-bucket',
          storage_path: 'path/to/some/file.md',
          file_name: 'file.md',
          mime_type: 'text/markdown',
          size_bytes: 123,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          resource_description: null
      };
      return Promise.resolve({ record: record, error: null });
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
                        project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, initial_user_prompt: "Initial prompt.", project_name: "Test Project Name", repo_url: "mock-repo-url" },
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
                    return Promise.resolve({ data: [{ id: id || crypto.randomUUID(), model_name: `Model for ${id || 'unknown-id'}`, session_id: testSessionId }] });
                }
            }
        }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockDownloadFromStorageSpy = spy(async () => Promise.resolve({ data: null, error: null }));
    const mockDependencies = {
        logger,
        downloadFromStorage: mockDownloadFromStorageSpy,
        fileManager: mockFileManager,
        indexingService: { indexDocument: () => Promise.resolve({ success: true }) },
        embeddingClient: { createEmbedding: () => Promise.resolve([]) }
    };

    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as unknown as SupabaseClient<Database>, mockUser, mockDependencies);

    assertEquals(status, 200, "Expected status 200 for end of process");
    assertExists(data, "Expected data in the response");
    assertEquals(error, undefined, "Expected no error");
    assertEquals(data.message, "Stage responses submitted. Current stage is terminal.", "Message should indicate end of process");
    assertExists(data.updatedSession);
    assertEquals(data.updatedSession.status, 'completed', "Session status should be updated to completed or similar");
    assertEquals(data.nextStageSeedPromptPath, null, "No seed prompt should be generated if no next stage");

    // Verify feedback was saved
    const feedbackCall = mockFileManager.uploadAndRegisterFileSpy.calls.find((c: { args: [UploadContext] }) => c.args[0].pathContext.fileType === 'user_feedback');
    assertExists(feedbackCall, "Expected a call to save 'user_feedback' for the paralysis stage");
    const feedbackUploadContext = feedbackCall.args[0];
    assertEquals(feedbackUploadContext.fileContent, "This is the final feedback for the paralysis stage.");
    assertEquals(feedbackUploadContext.feedbackTypeForDb, "ParalysisReviewSummary_v1");

    // Verify seed prompt was NOT saved
    const seedPromptCall = mockFileManager.uploadAndRegisterFileSpy.calls.find((c: { args: [UploadContext] }) => c.args[0].pathContext.fileType === 'seed_prompt');
    assertEquals(seedPromptCall, undefined, "Expected no call to save 'seed_prompt' as it's the end of process");
  });

}); // This closes the Deno.test block
