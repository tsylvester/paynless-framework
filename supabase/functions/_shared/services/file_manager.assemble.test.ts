import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import {
  createMockSupabaseClient,
  MockSupabaseClientSetup,
  MockSupabaseDataConfig,
  MockQueryBuilderState,
  IMockStorageFileOptions,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../../types_db.ts'
import { 
  DialecticContributionRow, 
  DocumentRelationships 
} from '../../dialectic-service/dialectic.interface.ts'
import { 
  constructStoragePath, 
  generateShortId 
} from '../utils/path_constructor.ts'
import { FileType } from '../types/file_manager.types.ts'
import { MockLogger } from '../logger.mock.ts'

Deno.test('FileManagerService', async (t) => {
  let setup: MockSupabaseClientSetup
  let fileManager: FileManagerService
  let envStub: any
  let originalEnvGet: typeof Deno.env.get
  let logger: MockLogger

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    const jsonOnlyRecipeInstanceId = 'recipe-instance-json-only';
    const jsonOnlyTemplateId = 'template-json-only';

    const defaultRenderDecisionConfig: MockSupabaseDataConfig = {
      genericMockResults: {
        dialectic_stages: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'slug')) {
              return Promise.resolve({
                data: [{ active_recipe_instance_id: jsonOnlyRecipeInstanceId }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: new Error('Unexpected select query in defaultRenderDecisionConfig') });
          },
        },
        dialectic_stage_recipe_instances: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'id' && f.value === jsonOnlyRecipeInstanceId)) {
              return Promise.resolve({
                data: [{
                  id: jsonOnlyRecipeInstanceId,
                  is_cloned: false,
                  template_id: jsonOnlyTemplateId,
                }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: new Error('Unexpected select query in defaultRenderDecisionConfig') });
          },
        },
        dialectic_recipe_template_steps: {
          select: (state: MockQueryBuilderState) => {
            if (state.filters.some((f) => f.column === 'template_id' && f.value === jsonOnlyTemplateId)) {
              return Promise.resolve({
                data: [{
                  id: 'step-json-only',
                  outputs_required: {
                    documents: [{
                      document_key: 'some_other_markdown_document_key',
                      file_type: 'markdown',
                    }],
                  },
                }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: new Error('Unexpected select query in defaultRenderDecisionConfig') });
          },
        },
      },
    };

    const mergedConfig: MockSupabaseDataConfig = {
      ...config,
      genericMockResults: {
        ...(defaultRenderDecisionConfig.genericMockResults ?? {}),
        ...(config.genericMockResults ?? {}),
      },
    };

    originalEnvGet = Deno.env.get.bind(Deno.env);
    envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
      if (key === 'SB_CONTENT_STORAGE_BUCKET') {
        return 'test-bucket'
      }
      return originalEnvGet(key)
    })

    setup = createMockSupabaseClient('test-user-id', mergedConfig)
    logger = new MockLogger()
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>, { constructStoragePath, logger })
  }

  const afterEach = () => {
    if (envStub && typeof envStub.restore === 'function') {
      try {
        envStub.restore()
      } catch (e: any) {
        if (e.message !== "instance method already restored") throw e;
      }
    }
    if (originalEnvGet && Deno.env.get !== originalEnvGet) {
        Deno.env.get = originalEnvGet;
    }
  }

  await t.step('assembleAndSaveFinalDocument should query for chunks, concatenate them, and upload the final document', async () => {
    try {
      // 1. Arrange
      const rootContributionId = 'root-contrib-id-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/raw_responses`,
        file_name: 'claude-opus_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'synthesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
      const continuationChunk1: DialecticContributionRow = {
        id: 'continuation-chunk-1',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`,
        file_name: 'claude-opus_0_business_case_continuation_1_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'synthesis',
        target_contribution_id: rootContributionId,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
      const continuationChunk2: DialecticContributionRow = {
        id: 'continuation-chunk-2',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_synthesis/_work/raw_responses`,
        file_name: 'claude-opus_0_business_case_continuation_2_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:02:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'synthesis',
        target_contribution_id: 'continuation-chunk-1',
        updated_at: '2025-01-01T12:02:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            // This mock is now more specific to handle the two calls.
            select: (state: MockQueryBuilderState) => {
              // First call: get the root contribution by ID.
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              // Second call: get all contributions for the session.
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk, continuationChunk1, continuationChunk2], error: null });
              }
              // Default fallback.
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Mock the download for each chunk - use JSON content
      const rootJsonContent = '{"content":"Root content"}';
      const chunk1JsonContent = '{"content":"Chunk 1 content"}';
      const chunk2JsonContent = '{"content":"Chunk 2 content"}';
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
          const fullChunk1Path = `${continuationChunk1.storage_path}/${continuationChunk1.file_name}`;
          const fullChunk2Path = `${continuationChunk2.storage_path}/${continuationChunk2.file_name}`;
          
          if (path === fullRootPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          if (path === fullChunk1Path) {
            return { data: new Blob([chunk1JsonContent]), error: null };
          }
          if (path === fullChunk2Path) {
            return { data: new Blob([chunk2JsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      // Spy on the final upload
      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      // 2. Act
      // This will fail because the method doesn't exist. We cast to any to bypass TS compilation errors.
      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      // 3. Assert
      assertExists(uploadSpy, "Upload spy should exist");
      assertEquals(uploadSpy.calls.length, 1, 'A single final document should be uploaded');

      const finalContentResult = uploadSpy.calls[0].args[1];
      
      // CORRECTED: The upload body might be a Blob, not a string or ArrayBuffer. 
      // We need to handle it correctly to prevent the TextDecoder error.
      let finalContent = '';
      if (typeof finalContentResult === 'string') {
        finalContent = finalContentResult;
      } else if (finalContentResult instanceof Blob) {
        finalContent = await finalContentResult.text(); // .text() is the correct way to read a Blob's content.
      } else {
        // Failsafe for ArrayBuffer just in case, which was the original logic.
        finalContent = new TextDecoder().decode(finalContentResult);
      }

      // Verify the assembled content is a valid merged JSON object
      const parsedContent = JSON.parse(finalContent);
      assert(!Array.isArray(parsedContent), 'Assembled content should be a valid JSON object, not an array');
      assert(typeof parsedContent === 'object' && parsedContent !== null, 'Assembled content should be an object');
      assertEquals(parsedContent, { content: 'Root contentChunk 1 contentChunk 2 content' }, 'Merged object should contain concatenated content from all chunks in order');

      // The final path should be in _work/assembled_json/, not the root contribution path
      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should be in _work/assembled_json/ directory');
      assert(!uploadPath.includes(`${rootChunk.storage_path}/${rootChunk.file_name}`), 'Upload path should not match root canonical path');
      // And ensure the upload used upsert
      const uploadOptions = uploadSpy.calls[0].args[2];
      if (uploadOptions && typeof uploadOptions === 'object' && 'upsert' in uploadOptions) {
        assert(uploadOptions.upsert === true, 'Final upload must use upsert');
      }

      // assembling final document updates latest-edit flags correctly
      const updateHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      assertExists(updateHistory, 'Expected to track updates to dialectic_contributions during final assembly');
      const inHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'in');
      assertExists(inHistory, 'Expected to find an in() call to clear latest-edit on all chunks');

      // Ensure we cleared latest on all chunk IDs (root + continuations) using runtime narrowing (no casts)
      const inCall = inHistory!.callsArgs.find(args => args[0] === 'id' && Array.isArray(args[1]));
      assertExists(inCall, 'Expected an in("id", [...]) call with chunk IDs');
      if (!Array.isArray(inCall)) {
        assert(false, 'Expected in() call args to be an array');
      } else {
        const idsCandidate = inCall[1];
        if (!Array.isArray(idsCandidate) || !idsCandidate.every((v): v is string => typeof v === 'string')) {
          assert(false, 'Expected second arg to be string[] of lineage ids');
        } else {
          const idArray = idsCandidate;
          assert(
            idArray.includes(rootContributionId) &&
            idArray.includes('continuation-chunk-1') &&
            idArray.includes('continuation-chunk-2'),
            'Expected all chunk IDs to be present in the in("id", [...]) call'
          );
        }
      }

      // Ensure there is an update call setting is_latest_edit=false
      const hasLatestFalseUpdate = updateHistory!.callsArgs.some(args => {
        const payload = args[0];
        return payload && typeof payload === 'object' && payload !== null && 'is_latest_edit' in payload && (payload).is_latest_edit === false;
      });
      assert(hasLatestFalseUpdate, 'Expected an update({ is_latest_edit: false }) during final assembly');

      // Ensure the root contribution is set back to latest=true
      const hasLatestTrueUpdate = updateHistory!.callsArgs.some(args => {
        const payload = args[0];
        return payload && typeof payload === 'object' && payload !== null && 'is_latest_edit' in payload && (payload).is_latest_edit === true;
      });
      assert(hasLatestTrueUpdate, 'Expected an update({ is_latest_edit: true }) for the root contribution');

      const eqHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'eq');
      assertExists(eqHistory, 'Expected to find an eq("id", rootContributionId) call when setting latest=true on root');
      const eqHasRoot = eqHistory!.callsArgs.some(args => args[0] === 'id' && args[1] === rootContributionId);
      assert(eqHasRoot, 'Expected eq("id", rootContributionId) for setting latest=true on the final document');

    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument assembles continuation chain in order for non-thesis stage using target_contribution_id', async () => {
    try {
      // 1. Arrange a non-"thesis" stage chain using target_contribution_id
      const stageSlug = 'parenthesis';
      const rootContributionId = 'root-parenthesis-id-1';
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/2_parenthesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T10:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const continuationChunk1: DialecticContributionRow = {
        id: 'parenthesis-cont-1',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/2_parenthesis/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:01:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: rootContributionId,
        updated_at: '2025-01-01T10:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const continuationChunk2: DialecticContributionRow = {
        id: 'parenthesis-cont-2',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/2_parenthesis/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_2_raw.json',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:02:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: 'parenthesis-cont-1',
        updated_at: '2025-01-01T10:02:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk, continuationChunk1, continuationChunk2], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Mock downloads with JSON content
      const rootJsonContent = '{"content":"Root content"}';
      const chunk1JsonContent = '{"content":"Chunk 1 content"}';
      const chunk2JsonContent = '{"content":"Chunk 2 content"}';
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
          const fullChunk1Path = `${continuationChunk1.storage_path}/${continuationChunk1.file_name}`;
          const fullChunk2Path = `${continuationChunk2.storage_path}/${continuationChunk2.file_name}`;

          if (path === fullRootPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          if (path === fullChunk1Path) {
            return { data: new Blob([chunk1JsonContent]), error: null };
          }
          if (path === fullChunk2Path) {
            return { data: new Blob([chunk2JsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      // 2. Act
      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      // 3. Assert: continuation chain order
      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single final document should be uploaded');

      const finalContentResult = uploadSpy.calls[0].args[1];
      let finalContent = '';
      if (typeof finalContentResult === 'string') {
        finalContent = finalContentResult;
      } else if (finalContentResult instanceof Blob) {
        finalContent = await finalContentResult.text();
      } else {
        finalContent = new TextDecoder().decode(finalContentResult);
      }

      // Verify the assembled content is a valid merged JSON object in correct order
      const parsedContent = JSON.parse(finalContent);
      assert(!Array.isArray(parsedContent), 'Assembled content should be a valid JSON object, not an array');
      assert(typeof parsedContent === 'object' && parsedContent !== null, 'Assembled content should be an object');
      assertEquals(parsedContent, { content: 'Root contentChunk 1 contentChunk 2 content' }, 'Merged object should contain concatenated content from all chunks in order');

      // The final path should be in _work/assembled_json/
      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should be in _work/assembled_json/ directory');
      assert(!uploadPath.includes(`${rootChunk.storage_path}/${rootChunk.file_name}`), 'Upload path should not match root canonical path');
    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument clears latest only for its own lineage, not other roots', async () => {
    try {
      const stageSlug = 'synthesis';
      const sessionId = 'session-lineage-1';
      const rootA = 'rootA-id';
      const contA1 = 'contA1-id';
      const rootB = 'rootB-id';
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const shortSessionId = generateShortId(sessionId);

      const rootAChunk: DialecticContributionRow = {
        id: rootA,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/raw_responses`,
        file_name: 'model-A_0_business_case_raw.json',
        document_relationships: { [stageSlug]: rootA },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-A',
        model_name: 'Model A',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const contA1Chunk: DialecticContributionRow = {
        id: contA1,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/_work/raw_responses`,
        file_name: 'model-A_0_business_case_continuation_1_raw.json',
        document_relationships: { [stageSlug]: rootA },
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-A',
        model_name: 'Model A',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: rootA,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const rootBChunk: DialecticContributionRow = {
        id: rootB,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/raw_responses`,
        file_name: 'model-B_0_business_case_raw.json',
        document_relationships: { [stageSlug]: rootB },
        created_at: '2025-01-01T12:05:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-B',
        model_name: 'Model B',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:05:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootA)) {
                return Promise.resolve({ data: [rootAChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootAChunk, contA1Chunk, rootBChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Mock downloads with JSON content
      const rootAJsonContent = '{"content":"RootA"}';
      const contA1JsonContent = '{"content":"ContA1"}';
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootAPath = `${rootAChunk.storage_path}/${rootAChunk.file_name}`;
          const fullContA1Path = `${contA1Chunk.storage_path}/${contA1Chunk.file_name}`;
          if (path === fullRootAPath) return { data: new Blob([rootAJsonContent]), error: null };
          if (path === fullContA1Path) return { data: new Blob([contA1JsonContent]), error: null };
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      await fileManager.assembleAndSaveFinalDocument(rootA);

      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single final document should be uploaded');

      const updateSpiesUpdate = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      const updateSpiesIn = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'in');
      assertExists(updateSpiesUpdate, 'Expected updates on dialectic_contributions');
      assertExists(updateSpiesIn, 'Expected an in() call to clear latest-edit on lineage');

      const inCall = updateSpiesIn!.callsArgs.find(args => args[0] === 'id' && Array.isArray(args[1]));
      assertExists(inCall, 'Expected an in("id", [...]) call');
      if (!Array.isArray(inCall)) {
        assert(false, 'Expected in() call args to be an array');
      } else {
        const idsCandidate = inCall[1];
        if (!Array.isArray(idsCandidate) || !idsCandidate.every((v): v is string => typeof v === 'string')) {
          assert(false, 'Expected second arg to be string[] of lineage ids');
        } else {
          const idArray = idsCandidate;
          assert(idArray.includes(rootA) && idArray.includes(contA1), 'Lineage ids should include rootA and contA1');
          assert(!idArray.includes(rootB), 'Lineage ids must NOT include unrelated rootB');
        }
      }

      // The final path should be in _work/assembled_json/, not the root contribution path
      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should be in _work/assembled_json/ directory');
      assert(!uploadPath.includes(`${rootAChunk.storage_path}/${rootAChunk.file_name}`), 'Upload path should not match rootA canonical path');
    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument updates latest flags only for selected branch when siblings share the same root', async () => {
    try {
      const stageSlug = 'synthesis';
      const sessionId = 'session-branch-1';
      const root = 'root-id';
      const contA1 = 'contA1-id';  // branch A first
      const contA2 = 'contA2-id';  // branch A second
      const contB1 = 'contB1-id';  // sibling branch B first (no further)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const shortSessionId = generateShortId(sessionId);
  
      const rootChunk: DialecticContributionRow = {
        id: root,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
  
      const contA1Chunk: DialecticContributionRow = {
        id: contA1,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: root,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
  
      const contA2Chunk: DialecticContributionRow = {
        id: contA2,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_2_raw.json',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:02:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: contA1,
        updated_at: '2025-01-01T12:02:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
  
      const contB1Chunk: DialecticContributionRow = {
        id: contB1,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/3_${stageSlug}/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:03:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 0,
        tokens_used_output: 0,
        processing_time_ms: 0,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: root, // sibling branch diverging from the same root
        updated_at: '2025-01-01T12:03:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };
  
      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === root)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk, contA1Chunk, contA2Chunk, contB1Chunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);
  
      // Mock downloads with JSON content (content structure is irrelevant to latest-flag assertions, but must be valid JSON)
      const rootJsonContent = '{"content":"Root"}';
      const contA1JsonContent = '{"content":"ContA1"}';
      const contA2JsonContent = '{"content":"ContA2"}';
      const contB1JsonContent = '{"content":"ContB1"}';
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
          const fullContA1Path = `${contA1Chunk.storage_path}/${contA1Chunk.file_name}`;
          const fullContA2Path = `${contA2Chunk.storage_path}/${contA2Chunk.file_name}`;
          const fullContB1Path = `${contB1Chunk.storage_path}/${contB1Chunk.file_name}`;
          if (path === fullRootPath) return { data: new Blob([rootJsonContent]), error: null };
          if (path === fullContA1Path) return { data: new Blob([contA1JsonContent]), error: null };
          if (path === fullContA2Path) return { data: new Blob([contA2JsonContent]), error: null };
          if (path === fullContB1Path) return { data: new Blob([contB1JsonContent]), error: null };
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };
  
      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
  
      await fileManager.assembleAndSaveFinalDocument(root);
  
      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single final document should be uploaded');
  
      const updateSpiesUpdate = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
      const updateSpiesIn = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'in');
      assertExists(updateSpiesUpdate, 'Expected updates on dialectic_contributions');
      assertExists(updateSpiesIn, 'Expected an in() call to clear latest-edit on lineage');
  
      const inCall = updateSpiesIn!.callsArgs.find(args => args[0] === 'id' && Array.isArray(args[1]));
      assertExists(inCall, 'Expected an in("id", [...]) call');
      if (!Array.isArray(inCall)) {
        assert(false, 'Expected in() call args to be an array');
      } else {
        const idsCandidate = inCall[1];
        if (!Array.isArray(idsCandidate) || !idsCandidate.every((v): v is string => typeof v === 'string')) {
          assert(false, 'Expected second arg to be string[] of lineage ids');
        } else {
          const idArray = idsCandidate;
          // Only root + branch A should be cleared; sibling B must remain latest
          assert(idArray.includes(root) && idArray.includes(contA1) && idArray.includes(contA2), 'Lineage ids should include root and branch A');
          assert(!idArray.includes(contB1), 'Lineage ids must NOT include sibling branch B');
        }
      }
  
      // Root should be set back to latest=true via an eq(id, root) update
      const eqHistory = setup.spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'eq');
      assertExists(eqHistory, 'Expected an eq("id", root) when setting latest=true on root');
      const hasRootEq = eqHistory!.callsArgs.some(args => args[0] === 'id' && args[1] === root);
      assert(hasRootEq, 'Expected eq("id", root) call for setting latest=true on the final document');
  
    } finally {
      afterEach();
    }
  });

  await t.step('assembles JSON chunks into valid merged JSON object', async () => {
    try {
      const rootContributionId = 'root-json-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      const rootJsonContent = '{"content":"# Root"}';
      const continuationJsonContent = '{"content":"\\n\\n## Continuation"}';

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: 'session-id-123',
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const continuationChunk: DialecticContributionRow = {
        id: 'continuation-json-1',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: rootContributionId,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk, continuationChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      const continuationCanonicalPath = `${continuationChunk.storage_path}/${continuationChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          if (path === continuationCanonicalPath) {
            return { data: new Blob([continuationJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single assembled JSON should be uploaded');

      const finalContentResult = uploadSpy.calls[0].args[1];
      let finalContent = '';
      if (typeof finalContentResult === 'string') {
        finalContent = finalContentResult;
      } else if (finalContentResult instanceof Blob) {
        finalContent = await finalContentResult.text();
      } else {
        finalContent = new TextDecoder().decode(finalContentResult);
      }

      const parsedContent = JSON.parse(finalContent);
      assert(!Array.isArray(parsedContent), 'Assembled content should be a valid JSON object, not an array');
      assert(typeof parsedContent === 'object' && parsedContent !== null, 'Assembled content should be an object');
      assertEquals(parsedContent, { content: '# Root\n\n## Continuation' }, 'Merged object should contain concatenated content from root and continuation chunks');

      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should be in _work/assembled_json/ directory');
      assert(!uploadPath.includes(rootCanonicalPath), 'Upload path should not match root canonical path');
    } finally {
      afterEach();
    }
  });

  await t.step('assembles JSON chunks into valid merged JSON object when chunks contain compatible keys', async () => {
    try {
      const rootContributionId = 'root-merge-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      const rootJsonContent = '{"title":"Document","content":"# Root"}';
      const continuationJsonContent = '{"content":"\\n\\n## Continuation","metadata":{"author":"AI"}}';

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const continuationChunk: DialecticContributionRow = {
        id: 'continuation-merge-1',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: rootContributionId,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === 'session-id-123')) {
                return Promise.resolve({ data: [rootChunk, continuationChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      const continuationCanonicalPath = `${continuationChunk.storage_path}/${continuationChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          if (path === continuationCanonicalPath) {
            return { data: new Blob([continuationJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single assembled JSON should be uploaded');

      const finalContentResult = uploadSpy.calls[0].args[1];
      let finalContent = '';
      if (typeof finalContentResult === 'string') {
        finalContent = finalContentResult;
      } else if (finalContentResult instanceof Blob) {
        finalContent = await finalContentResult.text();
      } else {
        finalContent = new TextDecoder().decode(finalContentResult);
      }

      const parsedContent = JSON.parse(finalContent);
      assert(!Array.isArray(parsedContent), 'Assembled content should be a valid JSON object, not an array');
      assert(typeof parsedContent === 'object' && parsedContent !== null, 'Assembled content should be an object');
      assertEquals(parsedContent, { title: 'Document', content: '# Root\n\n## Continuation', metadata: { author: 'AI' } }, 'Merged object should contain concatenated content and deep-merged metadata');
    } finally {
      afterEach();
    }
  });

  await t.step('saves assembled JSON to AssembledDocumentJson path, not raw JSON path', async () => {
    try {
      const rootContributionId = 'root-path-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      const rootJsonContent = '{"content":"# Root"}';
      const continuationJsonContent = '{"content":"\\n\\n## Continuation"}';

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: 'session-id-123',
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const continuationChunk: DialecticContributionRow = {
        id: 'continuation-path-1',
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/_work/raw_responses`,
        file_name: 'model_0_business_case_continuation_1_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: rootContributionId,
        updated_at: '2025-01-01T12:01:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === 'session-id-123')) {
                return Promise.resolve({ data: [rootChunk, continuationChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      const continuationCanonicalPath = `${continuationChunk.storage_path}/${continuationChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          if (path === continuationCanonicalPath) {
            return { data: new Blob([continuationJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single assembled JSON should be uploaded');

      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should include /_work/assembled_json/ directory');
      assert(!uploadPath.includes(rootCanonicalPath), 'Upload path should not match root canonical path');
      assert(!uploadPath.includes(continuationCanonicalPath), 'Upload path should not match continuation canonical path');

      const uploadOptions = uploadSpy.calls[0].args[2];
      if (uploadOptions && typeof uploadOptions === 'object' && 'contentType' in uploadOptions) {
        assertEquals(uploadOptions.contentType, 'application/json', 'Content type should be application/json');
      }
    } finally {
      afterEach();
    }
  });

  await t.step('handles single chunk (root only, no continuations)', async () => {
    try {
      const rootContributionId = 'root-single-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      const rootJsonContent = '{"content":"# Root"}';

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assertExists(uploadSpy, 'Upload spy should exist');
      assertEquals(uploadSpy.calls.length, 1, 'A single assembled JSON should be uploaded');

      const finalContentResult = uploadSpy.calls[0].args[1];
      let finalContent = '';
      if (typeof finalContentResult === 'string') {
        finalContent = finalContentResult;
      } else if (finalContentResult instanceof Blob) {
        finalContent = await finalContentResult.text();
      } else {
        finalContent = new TextDecoder().decode(finalContentResult);
      }

      const parsedContent = JSON.parse(finalContent);
      assert(!Array.isArray(parsedContent), 'Assembled content should be a valid JSON object, not an array');
      assert(typeof parsedContent === 'object' && parsedContent !== null, 'Assembled content should be an object');
      assertEquals(parsedContent, { content: '# Root' }, 'Merged object should match root chunk when no continuations exist');

      const uploadPath = uploadSpy.calls[0].args[0];
      assert(uploadPath.includes('/_work/assembled_json/'), 'Upload path should be in _work/assembled_json/ directory');
    } finally {
      afterEach();
    }
  });

  await t.step('throws error when storage_path or file_name is missing', async () => {
    try {
      const rootContributionId = 'root-missing-path-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };

      // Test case: storage_path is null
      const rootChunkMissingStoragePath: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: null as unknown as string,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: 'session-id-123',
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunkMissingStoragePath], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === 'session-id-123')) {
                return Promise.resolve({ data: [rootChunkMissingStoragePath], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error !== null, 'Function should return an error when storage_path is missing');
      assert(result.error instanceof Error, 'Error should be an Error instance');
      assert(result.error.message.includes('storage_path') || result.error.message.includes('Storage path'), 'Error message should mention storage_path');
    } finally {
      afterEach();
    }
  });

  await t.step('throws error when raw JSON file cannot be downloaded', async () => {
    try {
      const rootContributionId = 'root-download-error-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: null, error: new Error('File not found') };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error !== null, 'Function should return an error when download fails');
      assert(result.error instanceof Error, 'Error should be an Error instance');
      assert(result.error.message.includes('download') || result.error.message.includes('Failed'), 'Error message should mention download failure');
    } finally {
      afterEach();
    }
  });

  await t.step('throws error when raw JSON content is invalid JSON', async () => {
    try {
      const rootContributionId = 'root-invalid-json-123';
      const documentRelationships: DocumentRelationships = { thesis: rootContributionId };
      const invalidJsonContent = 'not json';

      // For JSON-only artifacts, storage_path/file_name points to the raw JSON file (canonical access method)
      // Use real path format: projectId/session_shortSessionId/iteration_N/stageDir/raw_responses
      const projectId = 'p1';
      const sessionId = 'session-id-123';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Canonical access method: ${chunk.storage_path}/${chunk.file_name}
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([invalidJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error !== null, 'Function should return an error when JSON is invalid');
      assert(result.error instanceof Error, 'Error should be an Error instance');
      assert(result.error.message.includes('JSON') || result.error.message.includes('parse'), 'Error message should mention JSON parsing failure');
    } finally {
      afterEach();
    }
  });

  await t.step('throws error when called with rendered document contribution', async () => {
    try {
      // 1. Arrange: Create root chunk contribution with rendered document type (business_case)
      const rootContributionId = 'root-rendered-doc-id';
      const sessionId = 'session-rendered-doc';
      const projectId = 'proj-rendered-doc';
      const shortSessionId = generateShortId(sessionId);
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: { thesis: rootContributionId },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 100,
        tokens_used_output: 100,
        processing_time_ms: 100,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 100,
        stage: 'thesis',
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const rootJsonContent = '{"content":"# Business Case Root Content"}';

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
          dialectic_stages: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'slug' && f.value === 'thesis')) {
                return Promise.resolve({
                  data: [{ active_recipe_instance_id: 'recipe-instance-123' }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' } });
            },
          },
          dialectic_stage_recipe_instances: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === 'recipe-instance-123')) {
                return Promise.resolve({
                  data: [{
                    id: 'recipe-instance-123',
                    is_cloned: false,
                    template_id: 'template-123',
                  }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' } });
            },
          },
          dialectic_recipe_template_steps: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'template_id' && f.value === 'template-123')) {
                return Promise.resolve({
                  data: [{
                    id: 'step-123',
                    outputs_required: {
                      documents: [{
                        document_key: 'business_case',
                        file_type: 'markdown',
                      }],
                    },
                  }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            },
          },
        },
      };
      beforeEach(config);

      // Mock storage download and upload
      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      let assembledFileUploaded = false;
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        const originalUpload = bucket.upload;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob([rootJsonContent]), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        bucket.upload = async (path: string, file: unknown, options?: IMockStorageFileOptions) => {
          if (typeof path === 'string' && path.includes('assembled_json')) {
            assembledFileUploaded = true;
          }
          return originalUpload.call(bucket, path, file, options);
        };
        return bucket;
      };

      // 2. Act: Call assembleAndSaveFinalDocument with rendered document
      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      // 3. Assert: Function should return an error
      assert(result.error !== null, 'Function should return an error when called with rendered document');
      assert(result.error instanceof Error, 'Error should be an Error instance');
      assert(
        result.error.message.includes('JSON-only artifacts') || 
        result.error.message.includes('rendered documents') ||
        result.error.message.includes('RENDER jobs'),
        'Error message should indicate that assembleAndSaveFinalDocument should only be called for JSON-only artifacts, not rendered documents'
      );

      // 4. Assert: No assembled JSON file should be created
      assert(!assembledFileUploaded, 'No assembled JSON file should be created for rendered documents');
    } finally {
      afterEach();
    }
  });

  await t.step('throws error when documentKey corresponds to a rendered document type', async () => {
    try {
      const sessionId = 'session-rendered-types';
      const projectId = 'proj-rendered-types';
      const shortSessionId = generateShortId(sessionId);
      const renderedDocumentTypes = [
        FileType.business_case,
        FileType.feature_spec,
        FileType.technical_approach,
      ];

      for (const documentKey of renderedDocumentTypes) {
        const rootContributionId = `root-${documentKey}-id`;
        const rootChunk: DialecticContributionRow = {
          id: rootContributionId,
          storage_bucket: 'test-bucket',
          storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
          file_name: `model_0_${documentKey}_raw.json`,
          document_relationships: { thesis: rootContributionId },
          created_at: '2025-01-01T12:00:00Z',
          citations: [],
          contribution_type: 'thesis',
          edit_version: 1,
          error: null,
          user_id: 'user-id-123',
          is_latest_edit: true,
          iteration_number: 1,
          mime_type: 'application/json',
          model_id: 'model-id',
          model_name: 'Model',
          session_id: sessionId,
          tokens_used_input: 100,
          tokens_used_output: 100,
          processing_time_ms: 100,
          original_model_contribution_id: null,
          prompt_template_id_used: null,
          raw_response_storage_path: null,
          seed_prompt_url: null,
          size_bytes: 100,
          stage: 'thesis',
          target_contribution_id: null,
          updated_at: '2025-01-01T12:00:00Z',
          is_header: false,
          source_prompt_resource_id: null,
        };

        const rootJsonContent = `{"content":"# ${documentKey} Content"}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              select: (state: MockQueryBuilderState) => {
                if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                  return Promise.resolve({ data: [rootChunk], error: null });
                }
                if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                  return Promise.resolve({ data: [rootChunk], error: null });
                }
                return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
              },
            },
            dialectic_stages: {
              select: (state: MockQueryBuilderState) => {
                if (state.filters.some((f) => f.column === 'slug' && f.value === 'thesis')) {
                  return Promise.resolve({
                    data: [{ active_recipe_instance_id: 'recipe-instance-123' }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' } });
              },
            },
            dialectic_stage_recipe_instances: {
              select: (state: MockQueryBuilderState) => {
                if (state.filters.some((f) => f.column === 'id' && f.value === 'recipe-instance-123')) {
                  return Promise.resolve({
                    data: [{
                      id: 'recipe-instance-123',
                      is_cloned: false,
                      template_id: 'template-123',
                    }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' } });
              },
            },
            dialectic_recipe_template_steps: {
              select: (state: MockQueryBuilderState) => {
                if (state.filters.some((f) => f.column === 'template_id' && f.value === 'template-123')) {
                  return Promise.resolve({
                    data: [{
                      id: 'step-123',
                      outputs_required: {
                        documents: [{
                          document_key: documentKey,
                          file_type: 'markdown',
                        }],
                      },
                    }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
            },
          },
        };
        beforeEach(config);

        const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
        let assembledFileUploaded = false;
        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
          const bucket = originalStorageFrom(bucketName);
          const originalDownload = bucket.download;
          const originalUpload = bucket.upload;
          bucket.download = async (path: string) => {
            if (path === rootCanonicalPath) {
              return { data: new Blob([rootJsonContent]), error: null };
            }
            return originalDownload.call(bucket, path);
          };
          bucket.upload = async (path: string, file: unknown, options?: IMockStorageFileOptions) => {
            if (typeof path === 'string' && path.includes('assembled_json')) {
              assembledFileUploaded = true;
            }
            return originalUpload.call(bucket, path, file, options);
          };
          return bucket;
        };

        const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

        assert(result.error !== null, `Function should return an error for rendered document type: ${documentKey}`);
        assert(result.error instanceof Error, 'Error should be an Error instance');
        assert(
          result.error.message.includes('JSON-only artifacts') || 
          result.error.message.includes('rendered documents') ||
          result.error.message.includes('RENDER jobs'),
          `Error message should indicate rendered documents are not allowed for documentKey: ${documentKey}`
        );
        assert(!assembledFileUploaded, `No assembled JSON file should be created for rendered document type: ${documentKey}`);

        afterEach();
      }
    } finally {
      afterEach();
    }
  });

  await t.step('allows JSON-only artifact documentKeys', async () => {
    try {
      const sessionId = 'session-json-only';
      const projectId = 'proj-json-only';
      const shortSessionId = generateShortId(sessionId);
      const jsonOnlyArtifactTypes = [
        FileType.HeaderContext,
        FileType.SynthesisHeaderContext,
      ];

      for (const documentKey of jsonOnlyArtifactTypes) {
        const rootContributionId = `root-${documentKey}-id`;
        const rootChunk: DialecticContributionRow = {
          id: rootContributionId,
          storage_bucket: 'test-bucket',
          storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/raw_responses`,
          file_name: `model_0_${documentKey}_raw.json`,
          document_relationships: { thesis: rootContributionId },
          created_at: '2025-01-01T12:00:00Z',
          citations: [],
          contribution_type: 'thesis',
          edit_version: 1,
          error: null,
          user_id: 'user-id-123',
          is_latest_edit: true,
          iteration_number: 1,
          mime_type: 'application/json',
          model_id: 'model-id',
          model_name: 'Model',
          session_id: sessionId,
          tokens_used_input: 100,
          tokens_used_output: 100,
          processing_time_ms: 100,
          original_model_contribution_id: null,
          prompt_template_id_used: null,
          raw_response_storage_path: null,
          seed_prompt_url: null,
          size_bytes: 100,
          stage: 'thesis',
          target_contribution_id: null,
          updated_at: '2025-01-01T12:00:00Z',
          is_header: false,
          source_prompt_resource_id: null,
        };

        const rootJsonContent = `{"header":"${documentKey} Header","context":{"key":"value"}}`;

        const config: MockSupabaseDataConfig = {
          genericMockResults: {
            dialectic_contributions: {
              select: (state: MockQueryBuilderState) => {
                if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                  return Promise.resolve({ data: [rootChunk], error: null });
                }
                if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                  return Promise.resolve({ data: [rootChunk], error: null });
                }
                return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
              },
            },
          },
        };
        beforeEach(config);

        const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
        let assembledFileUploaded = false;
        let assembledFilePath = '';
        let assembledFileContent = '';

        const originalStorageFrom = setup.client.storage.from;
        setup.client.storage.from = (bucketName: string) => {
          const bucket = originalStorageFrom(bucketName);
          const originalDownload = bucket.download;
          const originalUpload = bucket.upload;
          bucket.download = async (path: string) => {
            if (path === rootCanonicalPath) {
              return { data: new Blob([rootJsonContent]), error: null };
            }
            return originalDownload.call(bucket, path);
          };
          bucket.upload = async (path: string, file: unknown, options?: IMockStorageFileOptions) => {
            if (typeof path === 'string' && path.includes('assembled_json')) {
              assembledFileUploaded = true;
              assembledFilePath = path;
              if (file instanceof Blob) {
                assembledFileContent = await file.text();
              } else if (file instanceof Uint8Array) {
                assembledFileContent = new TextDecoder().decode(file);
              } else if (typeof file === 'string') {
                assembledFileContent = file;
              }
              return { data: { path }, error: null };
            }
            return originalUpload.call(bucket, path, file, options);
          };
          return bucket;
        };

        const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

        assert(result.error === null, `Function should succeed for JSON-only artifact type: ${documentKey}`);
        assert(assembledFileUploaded, `Assembled JSON file should be created for JSON-only artifact type: ${documentKey}`);
        assert(assembledFilePath.includes('assembled_json'), `Assembled file path should include 'assembled_json' for: ${documentKey}`);
        
        // Verify the assembled content is valid JSON object
        try {
          const parsed = JSON.parse(assembledFileContent);
          assert(!Array.isArray(parsed), `Assembled JSON should be an object, not an array for: ${documentKey}`);
          assert(typeof parsed === 'object' && parsed !== null, `Assembled JSON should be an object for: ${documentKey}`);
          // For single chunk, the merged object should match the root chunk
          assert('header' in parsed && 'context' in parsed, `Assembled JSON object should contain expected keys for: ${documentKey}`);
        } catch (parseError) {
          assert(false, `Assembled JSON content should be valid JSON for: ${documentKey}. Error: ${parseError}`);
        }

        afterEach();
      }
    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument proceeds when shouldEnqueueRenderJob returns { shouldRender: false, reason: is_json }', async () => {
    try {
      const rootContributionId = 'root-json-only-1';
      const stageSlug = 'thesis';
      const projectId = 'proj-json-only-2';
      const sessionId = 'session-json-only-2';
      const shortSessionId = generateShortId(sessionId);

      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_${stageSlug}/raw_responses`,
        file_name: 'model_0_header_context_raw.json',
        document_relationships: { [stageSlug]: rootContributionId },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: stageSlug,
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 1,
        tokens_used_output: 1,
        processing_time_ms: 1,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob(['{"header":"Header","context":{"k":"v"}}']), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error === null);
      assertExists(uploadSpy);
      assertEquals(uploadSpy.calls.length, 1);
    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument rejects when shouldEnqueueRenderJob returns { shouldRender: true, reason: is_markdown }', async () => {
    try {
      const rootContributionId = 'root-renderable-1';
      const stageSlug = 'thesis';
      const projectId = 'proj-renderable-1';
      const sessionId = 'session-renderable-1';
      const shortSessionId = generateShortId(sessionId);

      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_${stageSlug}/raw_responses`,
        file_name: 'model_0_business_case_raw.json',
        document_relationships: { [stageSlug]: rootContributionId },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: stageSlug,
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 1,
        tokens_used_output: 1,
        processing_time_ms: 1,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
          dialectic_stages: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'slug' && typeof f.value === 'string')) {
                return Promise.resolve({
                  data: [{ active_recipe_instance_id: 'recipe-instance-renderable' }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
          dialectic_stage_recipe_instances: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === 'recipe-instance-renderable')) {
                return Promise.resolve({
                  data: [{
                    id: 'recipe-instance-renderable',
                    is_cloned: false,
                    template_id: 'template-renderable',
                  }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
          dialectic_recipe_template_steps: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'template_id' && f.value === 'template-renderable')) {
                return Promise.resolve({
                  data: [{
                    id: 'step-renderable',
                    outputs_required: {
                      documents: [{
                        document_key: 'business_case',
                        file_type: 'markdown',
                      }],
                    },
                  }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error !== null);
      assertExists(uploadSpy);
      assertEquals(uploadSpy.calls.length, 0);
    } finally {
      afterEach();
    }
  });

  await t.step('assembleAndSaveFinalDocument rejects when shouldEnqueueRenderJob cannot determine render requirement (stage_not_found etc)', async () => {
    try {
      const rootContributionId = 'root-config-error-1';
      const stageSlug = 'thesis';
      const projectId = 'proj-config-error-1';
      const sessionId = 'session-config-error-1';
      const shortSessionId = generateShortId(sessionId);

      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_${stageSlug}/raw_responses`,
        file_name: 'model_0_header_context_raw.json',
        document_relationships: { [stageSlug]: rootContributionId },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: stageSlug,
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'application/json',
        model_id: 'model-id-1',
        model_name: 'Model',
        session_id: sessionId,
        tokens_used_input: 1,
        tokens_used_output: 1,
        processing_time_ms: 1,
        original_model_contribution_id: null,
        prompt_template_id_used: null,
        raw_response_storage_path: null,
        seed_prompt_url: null,
        size_bytes: 1,
        stage: stageSlug,
        target_contribution_id: null,
        updated_at: '2025-01-01T12:00:00Z',
        is_header: false,
        source_prompt_resource_id: null,
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === sessionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
          dialectic_stages: {
            select: () => {
              return Promise.resolve({ data: [], error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' } });
            },
          },
        },
      };
      beforeEach(config);

      const rootCanonicalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          if (path === rootCanonicalPath) {
            return { data: new Blob(['{"header":"Header","context":{"k":"v"}}']), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;
      const result = await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      assert(result.error !== null);
      assertExists(uploadSpy);
      assertEquals(uploadSpy.calls.length, 0);
      assert(result.error instanceof Error);
      assert(result.error.message.includes('could not determine render requirement'));
    } finally {
      afterEach();
    }
  });
});