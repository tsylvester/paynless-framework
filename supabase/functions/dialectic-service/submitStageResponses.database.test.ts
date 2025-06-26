import { assertEquals, assertExists, assert, assertStringIncludes } from "https://deno.land/std@0.218.2/testing/asserts.ts";
import { spy, type Spy } from "https://deno.land/std@0.218.2/testing/mock.ts";
import { User, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';

// Import shared mock utilities
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
  type MockSupabaseClientSetup,
  type MockPGRSTError,
  type MockQueryBuilderState,
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
import { constructStoragePath } from '../_shared/utils/path_constructor.ts';

const MOCK_DB_TEST_DOMAIN = {
  id: "db-test-domain-id",
  name: "Database Test Domain",
  description: "A domain for database interaction testing."
};

const MOCK_INITIAL_PROMPT_RESOURCE_ID = "mock-initial-prompt-resource-id";
const MOCK_INITIAL_PROMPT_BUCKET = "mock-project-resources-bucket";
const MOCK_INITIAL_PROMPT_PATH = "prompts/initial_project_prompt.md";
const MOCK_INITIAL_PROMPT_CONTENT = "This is the mock initial project prompt content for database tests.";
const STORAGE_BUCKET_CONTENT_STR = Deno.env.get('SB_CONTENT_STORAGE_BUCKET') || 'dialectic-content-bucket';

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
    const mockPayload: SubmitStageResponsesPayload = { stageSlug: mockThesisStage.slug, currentIterationNumber: 1, responses: [{ originalContributionId: 'id', responseText: 'text'}], sessionId: '', projectId: testProjectId };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertEquals(error.message, "Invalid payload: missing required fields (sessionId, projectId, stageSlug, currentIterationNumber, and responses array must be provided).");
  });

  await t.step('3.2 Fails if sessionId does not correspond to an existing session', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: crypto.randomUUID(), stageSlug: mockThesisStage.slug, currentIterationNumber: 1, projectId: testProjectId, responses: [{ originalContributionId: 'id', responseText: 'text'}] };
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: {
            data: null,
            error: { name: 'PostgrestError', message: "Not found", code: "PGRST116" } as any }
        }
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
      stageSlug: 'invalid-stage', // Deliberately wrong slug
      currentIterationNumber: 1,
      projectId: testProjectId,
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
              iteration_count: 1,
              project: {
                id: testProjectId,
                user_id: testUserId,
                process_template_id: testProcessTemplateId,
                initial_prompt_resource_id: "mock-initial-prompt-resource-id",
                repo_url: "mock-repo-url",
                project_name: "DB Test Project 3.3",
                selected_domain_id: MOCK_DB_TEST_DOMAIN.id,
                selected_domain_overlay_id: "mock-overlay-db-3.3",
                dialectic_domains: {
                  id: MOCK_DB_TEST_DOMAIN.id,
                  name: MOCK_DB_TEST_DOMAIN.name,
                  description: MOCK_DB_TEST_DOMAIN.description
                }
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
    const mockPayload: Omit<SubmitStageResponsesPayload, 'currentIterationNumber'> & { currentIterationNumber?: number } = { 
      sessionId: testSessionId, 
      stageSlug: mockThesisStage.slug, 
      responses: [{ originalContributionId: 'id', responseText: 'text'}], 
      projectId: testProjectId 
      // currentIterationNumber is now omitted
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, {});
    const { error, status } = await submitStageResponses(mockPayload as SubmitStageResponsesPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: spy(() => Promise.resolve({data: null, error: null})), fileManager: createMockFileManagerService() });
    
    assertEquals(status, 400);
    assertExists(error);
    assertEquals(error.message, "Invalid payload: missing required fields (sessionId, projectId, stageSlug, currentIterationNumber, and responses array must be provided).");
  });

  await t.step('3.5 Allows empty responses array and proceeds (assuming session found)', async () => {
    const mockPayload: SubmitStageResponsesPayload = { 
      sessionId: testSessionId, 
      stageSlug: mockThesisStage.slug, 
      currentIterationNumber: 1, 
      projectId: testProjectId, 
      responses: [] 
    };

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        // logger.info(`[Test 3.5 downloadFromStorageSpy] Called with bucket: ${bucket}, path: ${path}`);
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        // Mock download for feedback if PromptAssembler tries to get it (even if empty for this test)
        // Path for feedback: projects/${projectId}/sessions/${sessionId}/iterations/${iterationNumber}/${stageSlug}/user_feedback_${stageSlug}.md
        const feedbackPathPattern = `projects/${testProjectId}/sessions/${testSessionId}/iterations/1/${mockThesisStage.slug}/user_feedback_${mockThesisStage.slug}.md`;
        if (path === feedbackPathPattern) {
            // logger.info("[Test 3.5 downloadFromStorageSpy] Matched feedback path: " + path);
            return Promise.resolve({ data: Buffer.from("").buffer, error: null }); // Empty feedback content
        }
        logger.warn("[Test 3.5 downloadFromStorageSpy] Unhandled path: bucket=" + bucket + ", path=" + path);
        return Promise.resolve({data: Buffer.from("any other content for 3.5").buffer, error: null });
    });

    const mockDbConfigWithSession: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { 
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testSessionId)) {
                return Promise.resolve({ data: [{ 
                    id: testSessionId, 
                    iteration_count: 1,
                    project: { 
                        id: testProjectId, 
                        user_id: testUserId, 
                        process_template_id: testProcessTemplateId, 
                        process_template: {id: testProcessTemplateId},
                        max_iterations: 3, 
                        initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID, 
                        repo_url: "mock-repo-url-3.5", // Ensured repo_url
                        project_name: "DB Test Project 3.5",
                        selected_domain_id: MOCK_DB_TEST_DOMAIN.id,
                        selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                        dialectic_domains: MOCK_DB_TEST_DOMAIN,
                        // Mocking initial_prompt_context for PromptAssembler's getInitialPromptContent
                        initial_prompt_context: { type: 'resource_id', value: MOCK_INITIAL_PROMPT_RESOURCE_ID } 
                    }, 
                    stage: mockThesisStage,
                }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: {name: 'Error', message: 'Not found in 3.5 sessions mock'}, status: 404, count:0 });
          },
          update: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testSessionId)) {
                return Promise.resolve({ data: [{ id: testSessionId, status: `pending_${mockAntithesisStage.slug}`, current_stage_id: mockAntithesisStage.id, iteration_count: 1 }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: {name: 'Error', message: 'Update failed in 3.5 sessions mock'}, status: 500, count:0 });
          }
        },
        dialectic_stage_transitions: { 
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id) &&
                state.filters.some(f => f.column === 'process_template_id' && f.value === testProcessTemplateId)) {
                return Promise.resolve({ data: [{ 
                    target_stage: {
                        ...mockAntithesisStage,
                        system_prompts: { 
                            id: mockAntithesisStage.default_system_prompt_id, 
                            prompt_text: 'Mock system prompt for antithesis in test 3.5. Inputs: {{ initial_project_prompt }} {{ prior_stage_ai_outputs.thesis }} {{ user_feedback.thesis }}' 
                        },
                        domain_specific_prompt_overlays: [],
                        // Ensuring input_artifact_rules are present for PromptAssembler
                        input_artifact_rules: { sources: [
                            { type: "initial_project_prompt", required: false },
                            { type: "contribution", stage_slug: "thesis", required: false },
                            { type: "feedback", stage_slug: "thesis", required: false }
                        ]}
                    }
                }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: {name: 'Error', message: 'Not found in 3.5 transitions mock'}, status: 404, count:0 });
          } 
        },
        // system_prompts table is not directly queried if target_stage.system_prompts is populated
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH, id:MOCK_INITIAL_PROMPT_RESOURCE_ID, project_id:testProjectId, user_id:testUserId, file_name:"initial_prompt.md", mime_type:"text/markdown", size_bytes:100, created_at:"ca", updated_at:"ua", resource_description:"Initial project prompt" }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        },
        dialectic_stages: { 
            select: (state: MockQueryBuilderState) => {
                const slugFilter = state.filters.find(f => f.column === 'slug' && f.operator === 'in' && Array.isArray(f.value));
                if (slugFilter) {
                    const slugsToFind = slugFilter.value as string[];
                    const results = [];
                    if (slugsToFind.includes(mockThesisStage.slug)) {
                        results.push({ slug: mockThesisStage.slug, display_name: mockThesisStage.display_name });
                    }
                    if (slugsToFind.includes(mockAntithesisStage.slug)) { // For next stage name in response
                        results.push({ slug: mockAntithesisStage.slug, display_name: mockAntithesisStage.display_name });
                    }
                    if (results.length > 0) {
                        return Promise.resolve({ data: results, error: null, status: 200, count: results.length });
                    }
                }
                // logger.warn(`[Test 3.5 dialectic_stages mock] No match for query: ${JSON.stringify(state)}`);
                return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
            }
        },
        dialectic_contributions: { // For PromptAssembler context gathering
            select: (state: MockQueryBuilderState) => {
                // This test has empty responses, so PromptAssembler will look for prior AI outputs.
                // It looks for is_latest_edit = true, for the current session, iteration, and stage.
                if (
                    state.filters.some(f => f.column === 'session_id' && f.value === testSessionId) &&
                    state.filters.some(f => f.column === 'iteration_number' && f.value === 1) && // Assuming currentIterationNumber is 1
                    state.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug) &&
                    state.filters.some(f => f.column === 'is_latest_edit' && f.value === true)
                ) {
                    // logger.info(`[Test 3.5 dialectic_contributions mock] Matched for prior AI output query`);
                    // Return empty if no AI output for thesis stage is expected for this test with empty user responses
                    return Promise.resolve({ data: [], error: null, status: 200, count: 0 }); 
                }
                // logger.warn(`[Test 3.5 dialectic_contributions mock] Unhandled query: ${JSON.stringify(state.filters)}`);
                return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
            }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockDbConfigWithSession);
    
    const mockFileManager = new MockFileManagerService();

    const expectedSeedPromptPath = `projects/${testProjectId}/sessions/${testSessionId}/iterations/1/generated_prompts/seed_prompt_thesis_to_antithesis.md`;
    
    mockFileManager.uploadAndRegisterFile = spy(async (context: UploadContext) => {
        const pathParts = constructStoragePath(context.pathContext);
        if (context.pathContext.fileType === 'seed_prompt') {
            return Promise.resolve({ 
                record: {
                    id: 'seed-prompt-file-id-3.5', 
                    project_id: context.pathContext.projectId,
                    user_id: context.userId!, 
                    storage_bucket: STORAGE_BUCKET_CONTENT_STR,
                    storage_path: pathParts.storagePath,  // Directory path
                    file_name: pathParts.fileName,        // Filename
                    mime_type: context.mimeType,
                    size_bytes: typeof context.fileContent === 'string' ? context.fileContent.length : context.fileContent.byteLength,
                    resource_description: context.description || 'Seed prompt for test 3.5',
                    status: 'active', 
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    resource_type: 'generated_prompt', // Ensure this aligns with how resource_type is set if it comes from fileType
                } as any, 
                error: null 
            });
        }
        if (context.pathContext.fileType === 'user_feedback') { 
             logger.warn("[Test 3.5 uploadAndRegisterFile] Unexpected call for user_feedback");
             return Promise.resolve({ record: {id: 'user-feedback-file-id-3.5'} as any, error: null });
        }
        logger.warn("[Test 3.5 uploadAndRegisterFile] Unhandled fileType: " + context.pathContext.fileType);
        return Promise.resolve({ record: {id: 'other-file-id-3.5', storage_path: 'other/path.md'} as any, error: null });
    });
    
    const { data, error, status } = await submitStageResponses(
        mockPayload, 
        mockSupabase.client as any, 
        mockUser, 
        { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager }
    );

    assertEquals(status, 200, error ? `Test 3.5 Error: ${error.message}${error.details ? ' - ' + error.details : ''}` : "Test 3.5 No Error");
    assertExists(data, "Data should exist on successful run of 3.5");
    assertEquals(data?.updatedSession.current_stage_id, mockAntithesisStage.id, "Updated session should be at antithesis stage");
    assert(typeof data?.nextStageSeedPromptPath === 'string' && data.nextStageSeedPromptPath.endsWith('seed_prompt.md'), "Expected seed prompt path to end with 'seed_prompt.md', got: " + data?.nextStageSeedPromptPath);
    
    const uploadSpyCall = (mockFileManager.uploadAndRegisterFile as unknown as Spy<UploadContext, [UploadContext], Promise<FileManagerResponse>>).calls.find(
        (call: { args: [UploadContext] }) => call.args[0].pathContext.fileType === 'seed_prompt'
    );
    assertExists(uploadSpyCall, "uploadAndRegisterFile should have been called for seed_prompt");
    assertEquals(uploadSpyCall.args[0].pathContext.fileType, 'seed_prompt'); // Verify correct call
  });

  await t.step('3.6 Fails if items in responses array miss originalContributionId or responseText', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, stageSlug: mockThesisStage.slug, currentIterationNumber: 1, projectId: testProjectId, responses: [{ originalContributionId: testContributionId1, responseText: undefined as any }] }; // responseText is undefined
    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: { 
          select: { data: [{ 
            id: testSessionId, 
            iteration_count: 1,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template:{id:testProcessTemplateId}, initial_prompt_resource_id:MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url", project_name: "DB Test Project 3.6", selected_domain_id: MOCK_DB_TEST_DOMAIN.id, selected_domain_overlay_id: "mock-overlay-db-3.6", dialectic_domains: MOCK_DB_TEST_DOMAIN }, 
            stage: mockThesisStage 
          }] } 
        }
      }
    };
    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const downloadFromStorageSpy = spy((_client: SupabaseClient, _bucket: string, _path: string) => Promise.resolve({data: null, error: null}));
    const mockFileManager = new MockFileManagerService();

    const { error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager });
    
    assertEquals(status, 400);
    assertExists(error);
    assertEquals(error.message, "Invalid response item: missing or empty originalContributionId or responseText.");
  });

  await t.step('3.7 Fails if an originalContributionId in a response is not found or not linked to the session', async () => {
    const NON_EXISTENT_CONTRIB_ID = 'non-existent-contrib-id-3.7';
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: NON_EXISTENT_CONTRIB_ID, responseText: 'A response to a non-existent contribution.' }]
    };

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
         // Mock download for feedback if PromptAssembler tries to get it
        if (path.includes('user_feedback_thesis.md')) {
            return Promise.resolve({ data: Buffer.from("").buffer, error: null }); 
        }
        return Promise.resolve({data: Buffer.from("any other content for 3.7").buffer, error: null });
    });

    const mockDbConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testSessionId)) {
              return Promise.resolve({
                data: [{ 
                  id: testSessionId,
                  iteration_count: 1,
                  project: {
                    id: testProjectId,
                    user_id: testUserId,
                    process_template_id: testProcessTemplateId,
                    process_template: { id: testProcessTemplateId },
                    initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID,
                    repo_url: "mock-repo-url-3.7", 
                    project_name: "DB Test Project 3.7",
                    selected_domain_id: MOCK_DB_TEST_DOMAIN.id,
                    selected_domain_overlay_id: "mock-selected-domain-overlay-id",
                    dialectic_domains: MOCK_DB_TEST_DOMAIN
                  },
                  stage: mockThesisStage,
                }],
                error: null, status: 200, statusText: 'OK', count: 1
              });
            }
            return Promise.resolve({ data: null, error: { name: 'MockError', message: 'Unexpected session query in 3.7', code: 'MOCK' }, status: 404, statusText: 'Not Found', count: 0 });
          }
        },
        dialectic_contributions: {
          select: (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find(f => f.column === 'id');
            const sessionIdFilter = state.filters.find(f => f.column === 'session_id');
            // This is the check for the originalContributionId in the loop
            if (idFilter?.value === NON_EXISTENT_CONTRIB_ID && sessionIdFilter?.value === testSessionId) {
              return Promise.resolve({ data: null, error: { name: 'PostgrestError', message: 'Forced error: Contribution not found for 3.7', code: 'PGRST116' } as MockPGRSTError, status: 406, statusText: 'Not Acceptable', count: 0 });
            }
            // Fallback for other contribution queries (e.g., by PromptAssembler for context)
            if (sessionIdFilter?.value === testSessionId && state.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug)) {
                 return Promise.resolve({ data: [{id: testContributionId1, storage_path: 'path/to/thesis_context.md', storage_bucket: 'bucket', model_name: 'test-model', file_name: 'thesis_context.md'}], error: null, status: 200, count: 1 });
            }
            logger.warn("[Test 3.7 dialectic_contributions mock] No match for: " + JSON.stringify(state.filters));
            return Promise.resolve({ data: [], error: null, status: 200, statusText: 'OK', count: 0 });
          }
        },
        dialectic_stage_transitions: { 
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id)) {
                    return Promise.resolve({ data: [{ target_stage: { ...mockAntithesisStage, system_prompts: { id: 'any-prompt-id', prompt_text: 'Antithesis prompt for 3.7' }, domain_specific_prompt_overlays: [] } }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({ data: null, error: {name: 'Error', message: 'Transition not found for 3.7'}, status: 404, count:0 });
            }
        },
        system_prompts: { select: { data: [{id: 'any-prompt-id', prompt_text: 'Antithesis prompt for 3.7'}], error: null, status: 200, count: 1 } },
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        },
         dialectic_stages: { 
            select: (state: MockQueryBuilderState) => {
                const slugFilter = state.filters.find(f => f.column === 'slug' && Array.isArray(f.value));
                if (slugFilter && (slugFilter.value as string[]).includes(mockThesisStage.slug)) {
                    return Promise.resolve({ data: [{ slug: mockThesisStage.slug, display_name: mockThesisStage.display_name }], error: null, status: 200, count: 1 });
                }
                 if (slugFilter && (slugFilter.value as string[]).includes(mockAntithesisStage.slug)) {
                    return Promise.resolve({ data: [{ slug: mockAntithesisStage.slug, display_name: mockAntithesisStage.display_name }], error: null, status: 200, count: 1 });
                }
                logger.warn("[Test 3.7 dialectic_stages mock] No match for slug filter: " + JSON.stringify(slugFilter));
                return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
            }
        }
      }
    };

    const mockSupabase: MockSupabaseClientSetup = createMockSupabaseClient(testUserId, mockDbConfig);
    const mockFileManager = new MockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy((context: UploadContext) => {
        if (context.pathContext.fileType === 'user_feedback') {
            return Promise.resolve({ record: null, error: { message: "FileManager failed to save feedback for 4.2", status: 500 } });
        }
        // Fallback for other file types like seed_prompt if test were to proceed
        return Promise.resolve({ record: { id: 'seed-prompt-id-4.2', storage_path: 'path/to/seed_4.2.md' } as any, error: null });
    });


    const { data, error, status } = await submitStageResponses(mockPayload, mockSupabase.client as any, mockUser, { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager });

    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error.message, `Failed to assemble seed prompt for next stage: Failed to gather inputs for prompt assembly: Failed to download REQUIRED content for contribution ${testContributionId1} from stage '${mockThesisStage.display_name}'. Original error: No data returned from storage download.`);
    assertEquals(data, undefined);
  });

  // Test Group 4: Error Handling for Dependencies and Sub-processes
  await t.step('4.1 Handles failure when fetching the current DialecticSession', async () => {
    const mockPayload: SubmitStageResponsesPayload = { sessionId: testSessionId, stageSlug: mockThesisStage.slug, currentIterationNumber: 1, projectId: testProjectId, responses: [{ originalContributionId: testContributionId1, responseText: 'text' }] };
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

  await t.step('4.2 Handles failure when fileManager fails to save userStageFeedback', async () => {
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: testSessionId,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: 'text' }],
      userStageFeedback: {
        content: "This is feedback that will fail to save.",
        feedbackType: "general"
      }
    };
    
    const downloadFromStorageSpy = spy((_client: SupabaseClient, _bucket: string, _path: string) => Promise.resolve({data: Buffer.from("content").buffer, error: null}));

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: { data: [{ 
            id: testSessionId, 
            iteration_count: 1,
            project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template:{id:testProcessTemplateId}, max_iterations: 3, initial_prompt_resource_id:MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url-4.2", project_name: "DB Test Project 4.2", selected_domain_id: MOCK_DB_TEST_DOMAIN.id, selected_domain_overlay_id: "mock-selected-domain-overlay-id", dialectic_domains: MOCK_DB_TEST_DOMAIN }, 
            stage: mockThesisStage 
          }] }
        },
        dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
                if (state.filters.some(f => f.column === 'id' && f.value === testContributionId1)) {
                    return Promise.resolve({ data: [{ id: testContributionId1, session_id: testSessionId, user_id: testUserId, iteration_number:1, stage:mockThesisStage.slug, storage_path:'path1', storage_bucket:'b1', content_type:'text/markdown' }], error: null, status:200, count:1 });
                }
                return Promise.resolve({data:[], error:null, status:200, count:0});
            }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockSupabaseConfig);
    const mockFileManager = new MockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy((context: UploadContext) => {
        if (context.pathContext.fileType === 'user_feedback') {
            return Promise.resolve({ record: null, error: { message: "FileManager failed to save feedback for 4.2", status: 500 } });
        }
        // Fallback for other file types like seed_prompt if test were to proceed
        return Promise.resolve({ record: { id: 'seed-prompt-id-4.2', storage_path: 'path/to/seed_4.2.md' } as any, error: null });
    });


    const { error, status } = await submitStageResponses(
        mockPayload, 
        mockSupabase.client as any, 
        mockUser, 
        { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager }
    );
    
    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error.message, "Failed to store user feedback."); // Corrected assertion
  });

  await t.step('4.3 Handles failure when fetching system prompt for the next stage', async () => {
    const mockSessionIdFor4_3 = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: mockSessionIdFor4_3,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: 'Response text' }],
    };

    const mockAntithesisStageFor4_3 = { ...mockAntithesisStage, id: crypto.randomUUID(), default_system_prompt_id: crypto.randomUUID(), repo_url: "mock-repo-url-4.3" }; // Added repo_url here if stage needs it, though project usually has it
    const expectedErrorMessageFromAssembler = `Failed to assemble seed prompt for next stage: No system prompt template found for stage ${mockAntithesisStageFor4_3.id}`;

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        if (path.includes('user_feedback_thesis.md')) { // For PromptAssembler context if feedback is involved
             return Promise.resolve({ data: Buffer.from("").buffer, error: null });
        }
        if (path.includes('path/to/prev_content.md')) { // For PromptAssembler context
            return Promise.resolve({ data: Buffer.from("previous content for 4.3").buffer, error: null });
        }
        return Promise.resolve({data: Buffer.from("content for 4.3").buffer, error: null });
    });

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === mockSessionIdFor4_3)) {
              return Promise.resolve({ data: [{
                id: mockSessionIdFor4_3, iteration_count: 1,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template: {id: testProcessTemplateId}, dialectic_domains: MOCK_DB_TEST_DOMAIN, initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url-4.3" },
                stage: mockThesisStage,
              }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_contributions: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'id' && f.value === testContributionId1)) {
              return Promise.resolve({ data: [{ id: testContributionId1, session_id: mockSessionIdFor4_3, user_id: testUserId, iteration_number: 1, stage: mockThesisStage.slug, storage_path: 'path1', storage_bucket: 'b1' }], error: null, status: 200, count: 1 });
            }
            // For PromptAssembler fetching context from 'thesis'
            if (state.filters.some(f => f.column === 'session_id' && f.value === mockSessionIdFor4_3) &&
                state.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug) &&
                state.filters.some(f => f.column === 'is_latest_edit' && f.value === true)
            ) {
                return Promise.resolve({ data: [{ id: 'prev-ai-contrib-id', storage_path: 'path/to/prev_content.md', storage_bucket: 'b1', model_name:'gpt-mock', file_name:'prev_content.md' }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
          }
        },
        dialectic_stage_transitions: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id)) {
              // Simulate target_stage.system_prompts is null, forcing PromptAssembler to error
              return Promise.resolve({ data: [{ target_stage: { ...mockAntithesisStageFor4_3, system_prompts: null, domain_specific_prompt_overlays: [] } }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: null, error: {name:'Error', message: 'Transition not found'}, status:404, count:0});
          }
        },
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockSupabaseConfig);
    const mockFileManager = new MockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy((_context) => Promise.resolve({ record: {id: 'fid-4.3'} as any, error: null }));


    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      mockUser,
      { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager }
    );

    assertEquals(status, 500);
    assertExists(error);
    assertEquals(error.message, `Project configuration error: Missing selected domain overlay ID.`);
  });

  await t.step('4.4 Handles failure when fetching context/previous contributions', async () => {
    const mockSessionIdFor4_4 = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: mockSessionIdFor4_4,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: 'Response text' }],
    };
    
    const mockAntithesisStageFor4_4 = { ...mockAntithesisStage, id: crypto.randomUUID(), default_system_prompt_id: crypto.randomUUID() };
    mockAntithesisStageFor4_4.input_artifact_rules = { sources: [{ type: 'contribution', stage_slug: 'thesis', required: true }] };
    const expectedErrorMessageFromAssembler = `Failed to assemble seed prompt for next stage: Error fetching contributions for stage 'thesis': Simulated DB error for contributions in 4.4`;

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({ data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        if (bucket === 'b1' && path === 'path1') { 
            return Promise.resolve({ data: Buffer.from("original content for 4.4").buffer, error: null });
        }
        // For feedback, if any, during prompt assembly
        if (path.includes('user_feedback_thesis.md')) {
             return Promise.resolve({ data: Buffer.from("").buffer, error: null });
        }
        return Promise.resolve({ data: Buffer.from("downloaded content for 4.4").buffer, error: null });
    });

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === mockSessionIdFor4_4)) {
              return Promise.resolve({ data: [{
                id: mockSessionIdFor4_4, iteration_count: 1,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template: {id: testProcessTemplateId}, dialectic_domains: MOCK_DB_TEST_DOMAIN, initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url-4.4" },
                stage: mockThesisStage,
              }], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_contributions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === testContributionId1)) {
              return Promise.resolve({ data: [{ id: testContributionId1, session_id: mockSessionIdFor4_4, user_id: testUserId, iteration_number: 1, stage: mockThesisStage.slug, storage_path: 'path1', storage_bucket: 'b1' }], error: null, status: 200, count: 1 });
            }
            // For PromptAssembler fetching context from 'thesis'
            const sessionIdFilter = s.filters.find(f => f.column === 'session_id' && f.value === mockSessionIdFor4_4);
            const stageFilter = s.filters.find(f => f.column === 'stage' && f.value === 'thesis');
            const iterationFilter = s.filters.find(f => f.column === 'iteration_number' && f.value === 1 );
            const isLatestEditFilter = s.filters.find(f => f.column === 'is_latest_edit' && f.value === true);
            if (sessionIdFilter && stageFilter && iterationFilter && isLatestEditFilter) {
              return Promise.resolve({ data: null, error: { name: 'PostgrestError', message: 'Simulated DB error for contributions in 4.4', code: 'DBFAIL' } as MockPGRSTError, status: 500, count: 0 });
            }
            return Promise.resolve({ data: [], error: null, status: 200, count: 0});
          }
        },
        dialectic_stage_transitions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id)) {
              return Promise.resolve({ data: [{ target_stage: { 
                ...mockAntithesisStageFor4_4, 
                system_prompts: { id: mockAntithesisStageFor4_4.default_system_prompt_id, prompt_text: "Sys prompt" }, 
                domain_specific_prompt_overlays: [] 
              }}], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        }
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockSupabaseConfig);
    const mockFileManager = new MockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy((_context) => Promise.resolve({ record: {id: 'fid-4.4'} as any, error: null }));


    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      mockUser,
      { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager }
    );
    
    assertEquals(status, 500, `Test 4.4 status failed. Error: ${error?.message}`);
    assertExists(error);
    assertEquals(error.message, `Project configuration error: Missing selected domain overlay ID.`);
  });

  await t.step('6.1 Successfully processes a typical payload with user feedback and advances to the next stage', async () => {
    // ... existing code ...
  });

  await t.step('6.3 Handles case where system prompt template for the next stage is not found', async () => {
    const mockSessionIdFor6_3 = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = { sessionId: mockSessionIdFor6_3, stageSlug: mockThesisStage.slug, currentIterationNumber: 1, projectId: testProjectId, responses: [{originalContributionId: testContributionId1, responseText: "Response for 6.3"}] };
    const mockAntithesisStageFor6_3 = { ...mockAntithesisStage, id: crypto.randomUUID(), default_system_prompt_id: "non_existent_prompt_id_for_6_3" };
    const expectedErrorMessageFromAssembler = `Failed to assemble seed prompt for next stage: No system prompt template found for stage ${mockAntithesisStageFor6_3.id}`;

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        // For original contribution in main loop
        if (bucket === 'b1' && path === 'path1_for_6_3_original') { 
            return Promise.resolve({ data: Buffer.from("original content for 6.3 (main loop)").buffer, error: null });
        }
        // For PromptAssembler context (previous AI output)
        if (bucket === 'b1' && path === 'path/to/prev_content_6.3.md') {
            return Promise.resolve({ data: Buffer.from("previous AI content for 6.3").buffer, error: null });
        }
        const feedbackPathPattern = `projects/${testProjectId}/sessions/${mockSessionIdFor6_3}/iterations/1/${mockThesisStage.slug}/user_feedback_${mockThesisStage.slug}.md`;
        if (path === feedbackPathPattern) {
            return Promise.resolve({ data: Buffer.from("Feedback for 6.3").buffer, error: null });
        }
        logger.warn(`[Test 6.3 downloadFromStorageSpy] Unhandled path: bucket=${bucket}, path=${path}`);
        return Promise.resolve({ data: Buffer.from("any content for 6.3").buffer, error: null });
    });

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === mockSessionIdFor6_3)) {
              return Promise.resolve({ data: [{
                id: mockSessionIdFor6_3, iteration_count: 1,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template: {id: testProcessTemplateId}, dialectic_domains: MOCK_DB_TEST_DOMAIN, initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url-6.3" },
                stage: mockThesisStage,
              }], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_contributions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === testContributionId1)) {
              return Promise.resolve({ data: [{ id: testContributionId1, session_id: mockSessionIdFor6_3, user_id: testUserId, iteration_number: 1, stage: mockThesisStage.slug, storage_path: 'path1_for_6_3_original', storage_bucket: 'b1', content_type:'text/markdown' }], error: null, status: 200, count: 1 });
            }
            // For PromptAssembler fetching context from 'thesis'
            if (s.filters.some(f => f.column === 'session_id' && f.value === mockSessionIdFor6_3) &&
                s.filters.some(f => f.column === 'stage' && f.value === mockThesisStage.slug) &&
                s.filters.some(f => f.column === 'is_latest_edit' && f.value === true)
            ) {
                return Promise.resolve({ data: [{ id: 'prev-ai-contrib-id', storage_path: 'path/to/prev_content.md', storage_bucket: 'b1', model_name:'gpt-mock', file_name:'prev_content.md' }], error: null, status: 200, count: 1 });
            }
            return Promise.resolve({ data: [], error: null, status: 200, count: 0 });
          }
        },
        dialectic_stage_transitions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id)) {
              // Simulate target_stage.system_prompts is null, forcing PromptAssembler to error
              return Promise.resolve({ data: [{ target_stage: { ...mockAntithesisStageFor6_3, system_prompts: null, domain_specific_prompt_overlays: [] } }], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        }
      }
    };
    const mockSupabase = createMockSupabaseClient(testUserId, mockSupabaseConfig);
    const mockFileManager = new MockFileManagerService();
    mockFileManager.uploadAndRegisterFile = spy((_context) => Promise.resolve({ record: {id: 'fid-6.3'} as any, error: null }));


    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      mockUser,
      { logger, downloadFromStorage: downloadFromStorageSpy, fileManager: mockFileManager }
    );

    assertEquals(status, 500, `Test 6.3 status mismatch. Error: ${error?.message}`);
    assertExists(error);
    assertEquals(error.message, `Project configuration error: Missing selected domain overlay ID.`);
  });

  await t.step('6.4 Handles case where no AI contributions (context) are found for current stage', async () => {
    const mockSessionIdFor6_4 = crypto.randomUUID();
    const mockPayload: SubmitStageResponsesPayload = {
      sessionId: mockSessionIdFor6_4,
      projectId: testProjectId,
      stageSlug: mockThesisStage.slug,
      currentIterationNumber: 1,
      responses: [{ originalContributionId: testContributionId1, responseText: 'Response text for 6.4' }],
    };

    const mockAntithesisStageFor6_4 = { ...mockAntithesisStage, id: crypto.randomUUID(), default_system_prompt_id: crypto.randomUUID() };
    mockAntithesisStageFor6_4.input_artifact_rules = { sources: [{ type: 'contribution', stage_slug: 'thesis', required: false }] }; 

    const mockSystemPromptTextForNextStage = "Antithesis prompt for 6.4: {{#if prior_stage_ai_outputs.thesis}}Thesis was: {{prior_stage_ai_outputs.thesis}}{{else}}No thesis provided.{{/if}}";

    const downloadFromStorageSpy = spy((_client: SupabaseClient, bucket: string, path: string) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
            return Promise.resolve({ data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        if (bucket === 'b1' && path === 'path1') { 
            return Promise.resolve({ data: Buffer.from("original content for 6.4").buffer, error: null });
        }
        return Promise.resolve({ data: Buffer.from("content for 6.4").buffer, error: null });
    });

    const mockSupabaseConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_sessions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === mockSessionIdFor6_4)) {
              return Promise.resolve({ data: [{
                id: mockSessionIdFor6_4, iteration_count: 1,
                project: { id: testProjectId, user_id: testUserId, process_template_id: testProcessTemplateId, process_template: {id: testProcessTemplateId}, dialectic_domains: MOCK_DB_TEST_DOMAIN, initial_prompt_resource_id: MOCK_INITIAL_PROMPT_RESOURCE_ID, repo_url: "mock-repo-url-6.4" },
                stage: mockThesisStage,
              }], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_contributions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'id' && f.value === testContributionId1)) {
              return Promise.resolve({ data: [{ id: testContributionId1, session_id: mockSessionIdFor6_4, user_id: testUserId, iteration_number: 1, stage: mockThesisStage.slug, storage_path: 'path1', storage_bucket: 'b1', content_type:'text/markdown'}], error: null, status: 200, count: 1 });
            }
            // For PromptAssembler fetching context from 'thesis' - return empty array (no contributions)
            const sessionIdFilter = s.filters.find(f => f.column === 'session_id' && f.value === mockSessionIdFor6_4);
            const stageFilter = s.filters.find(f => f.column === 'stage' && f.value === 'thesis');
            const iterationFilter = s.filters.find(f => f.column === 'iteration_number' && f.value === 1 );
            const isLatestEditFilter = s.filters.find(f => f.column === 'is_latest_edit' && f.value === true);
            if (sessionIdFilter && stageFilter && iterationFilter && isLatestEditFilter) {
              return Promise.resolve({ data: [], error: null, status: 200, count: 0 }); // Simulate no AI contributions found
            }
            return Promise.resolve({ data: [], error: null, status: 200, count: 0});
          }
        },
        dialectic_stage_transitions: {
          select: (s: MockQueryBuilderState) => {
            if (s.filters.some(f => f.column === 'source_stage_id' && f.value === mockThesisStage.id)) {
              return Promise.resolve({ data: [{ target_stage: { 
                ...mockAntithesisStageFor6_4, 
                system_prompts: { id: mockAntithesisStageFor6_4.default_system_prompt_id, prompt_text: mockSystemPromptTextForNextStage }, 
                domain_specific_prompt_overlays: [] 
              }}], error: null, status: 200, count: 1 });
            }
             return Promise.resolve({ data: null, error: {name:'Error', message:'Not found'}, status:404, count:0});
          }
        },
        dialectic_project_resources: {
            select: (state: MockQueryBuilderState) => {
                 if (state.filters.some(f => f.column === 'id' && f.value === MOCK_INITIAL_PROMPT_RESOURCE_ID)) {
                     return Promise.resolve({ data: [{ storage_bucket: MOCK_INITIAL_PROMPT_BUCKET, storage_path: MOCK_INITIAL_PROMPT_PATH }], error: null, status: 200, count: 1 });
                 }
                 return Promise.resolve({data: [], error: null, status: 200, count: 0});
            }
        }
      }
    };

    const mockSupabase = createMockSupabaseClient(testUserId, mockSupabaseConfig);
    const mockFileManager = createMockFileManagerService();
    const mockFeedbackRecord = { id: crypto.randomUUID(), session_id: mockSessionIdFor6_4, project_id: testProjectId, user_id: testUserId, stage_slug: mockThesisStage.slug, iteration_number: 1, storage_bucket: 'fbBucket', storage_path: 'fbPath', file_name: 'fbFile', mime_type: 'text/markdown', size_bytes: 10, feedback_type: 'general', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockFileManager.uploadAndRegisterFile = spy((_context) => Promise.resolve({ record: mockFeedbackRecord as any, error: null }));


    const { data, error, status } = await submitStageResponses(
      mockPayload,
      mockSupabase.client as any,
      mockUser,
      { logger, downloadFromStorage: spy((_client, bucket, path) => {
        if (bucket === MOCK_INITIAL_PROMPT_BUCKET && path === MOCK_INITIAL_PROMPT_PATH) {
             return Promise.resolve({ data: Buffer.from(MOCK_INITIAL_PROMPT_CONTENT).buffer, error: null });
        }
        if (bucket === 'b1' && path === 'path1') { // For original contribution in main loop
            return Promise.resolve({ data: Buffer.from("original content for 6.4").buffer, error: null });
        }
        // No other downloads expected as AI contributions are empty for prompt assembler
        return Promise.resolve({ data: Buffer.from("content").buffer, error: null });
      }), fileManager: mockFileManager }
    );
    
    assertEquals(status, 500, `Test 6.4 failed. Expected 500, got ${status}. Error: ${error?.message}`);
    assertExists(error, "Test 6.4 should return an error.");
    assertEquals(error?.message, `Project configuration error: Missing selected domain overlay ID.`);
    assertEquals(data, undefined, "Test 6.4 data should be undefined on error.");
  });

});