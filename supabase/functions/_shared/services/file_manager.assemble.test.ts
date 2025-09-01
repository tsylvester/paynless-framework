import {
  assertEquals,
  assertExists,
  assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts'
import { stub, type Stub } from 'https://deno.land/std@0.190.0/testing/mock.ts'
import {
  createMockSupabaseClient,
  type MockSupabaseClientSetup,
  type MockSupabaseDataConfig,
  type MockQueryBuilderState,
} from '../supabase.mock.ts'
import { FileManagerService } from './file_manager.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types_db.ts'
import { DialecticContributionRow, DocumentRelationships } from '../../dialectic-service/dialectic.interface.ts'

Deno.test('FileManagerService', async (t) => {
  let setup: MockSupabaseClientSetup
  let fileManager: FileManagerService
  let envStub: any
  let originalEnvGet: typeof Deno.env.get

  const beforeEach = (config: MockSupabaseDataConfig = {}) => {
    originalEnvGet = Deno.env.get.bind(Deno.env);
    envStub = stub(Deno.env, 'get', (key: string): string | undefined => {
      if (key === 'SB_CONTENT_STORAGE_BUCKET') {
        return 'test-bucket'
      }
      return originalEnvGet(key)
    })

    setup = createMockSupabaseClient('test-user-id', config)
    fileManager = new FileManagerService(setup.client as unknown as SupabaseClient<Database>)
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
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/3_synthesis',
        file_name: 'claude-opus_synthesis_final.md',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: 'session-id-123',
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
      };
      const continuationChunk1: DialecticContributionRow = {
        id: 'continuation-chunk-1',
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/3_synthesis/_work',
        file_name: 'claude-opus_synthesis_continuation_1.md',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: 'session-id-123',
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
      };
      const continuationChunk2: DialecticContributionRow = {
        id: 'continuation-chunk-2',
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/3_synthesis/_work',
        file_name: 'claude-opus_synthesis_continuation_2.md',
        document_relationships: documentRelationships,
        created_at: '2025-01-01T12:02:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id-opus',
        model_name: 'Claude Opus',
        session_id: 'session-id-123',
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
              if (state.filters.some((f) => f.column === 'session_id' && f.value === 'session-id-123')) {
                return Promise.resolve({ data: [rootChunk, continuationChunk1, continuationChunk2], error: null });
              }
              // Default fallback.
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      // Mock the download for each chunk
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
          const fullChunk1Path = `${continuationChunk1.storage_path}/${continuationChunk1.file_name}`;
          const fullChunk2Path = `${continuationChunk2.storage_path}/${continuationChunk2.file_name}`;
          
          if (path === fullRootPath) {
            return { data: new Blob(['Root content. ']), error: null };
          }
          if (path === fullChunk1Path) {
            return { data: new Blob(['Chunk 1 content. ']), error: null };
          }
          if (path === fullChunk2Path) {
            return { data: new Blob(['Chunk 2 content.']), error: null };
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

      assertEquals(
        finalContent,
        'Root content. Chunk 1 content. Chunk 2 content.',
      );
      // Explicitly prove we overwrote the original partial root content
      assert(finalContent !== 'Root content. ', 'Final content must not be the original partial at root');

      // The final path should be the same path as the root contribution.
      const expectedFinalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      assertEquals(uploadSpy.calls[0].args[0], expectedFinalPath);
      assert(!expectedFinalPath.includes('/_work/'), "Final path must not be in a _work directory");
      // And ensure the upload used upsert to overwrite prior content at root
      const uploadOptions = uploadSpy.calls[0].args[2];
      if (uploadOptions && typeof uploadOptions === 'object' && 'upsert' in uploadOptions) {
        assert(uploadOptions.upsert === true, 'Final upload must use upsert to overwrite partial at root');
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
      const rootChunk: DialecticContributionRow = {
        id: rootContributionId,
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/2_parenthesis',
        file_name: 'final.md',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:00:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: 'session-id-123',
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
      };

      const continuationChunk1: DialecticContributionRow = {
        id: 'parenthesis-cont-1',
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/2_parenthesis/_work',
        file_name: 'cont_1.md',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:01:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: 'session-id-123',
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
      };

      const continuationChunk2: DialecticContributionRow = {
        id: 'parenthesis-cont-2',
        storage_bucket: 'test-bucket',
        storage_path: 'projects/p1/sessions/s1/iteration_1/2_parenthesis/_work',
        file_name: 'cont_2.md',
        document_relationships: { parenthesis: rootContributionId },
        created_at: '2025-01-01T10:02:00Z',
        citations: [],
        contribution_type: 'thesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
        model_id: 'model-id',
        model_name: 'Model',
        session_id: 'session-id-123',
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
      };

      const config: MockSupabaseDataConfig = {
        genericMockResults: {
          dialectic_contributions: {
            select: (state: MockQueryBuilderState) => {
              if (state.filters.some((f) => f.column === 'id' && f.value === rootContributionId)) {
                return Promise.resolve({ data: [rootChunk], error: null });
              }
              if (state.filters.some((f) => f.column === 'session_id' && f.value === 'session-id-123')) {
                return Promise.resolve({ data: [rootChunk, continuationChunk1, continuationChunk2], error: null });
              }
              return Promise.resolve({ data: [], error: new Error('Unexpected select query in test') });
            },
          },
        },
      };
      beforeEach(config);

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
          const fullChunk1Path = `${continuationChunk1.storage_path}/${continuationChunk1.file_name}`;
          const fullChunk2Path = `${continuationChunk2.storage_path}/${continuationChunk2.file_name}`;

          if (path === fullRootPath) {
            return { data: new Blob(['Root content. ']), error: null };
          }
          if (path === fullChunk1Path) {
            return { data: new Blob(['Chunk 1 content. ']), error: null };
          }
          if (path === fullChunk2Path) {
            return { data: new Blob(['Chunk 2 content.']), error: null };
          }
          return originalDownload.call(bucket, path);
        };
        return bucket;
      };

      const uploadSpy = setup.spies.storage.from('test-bucket').uploadSpy;

      // 2. Act
      await fileManager.assembleAndSaveFinalDocument(rootContributionId);

      // 3. Assert: continuation chain order (exclude root body content)
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

      assertEquals(finalContent, 'Root content. Chunk 1 content. Chunk 2 content.');

      const expectedFinalPath = `${rootChunk.storage_path}/${rootChunk.file_name}`;
      assertEquals(uploadSpy.calls[0].args[0], expectedFinalPath);
      assert(!expectedFinalPath.includes('/_work/'), 'Final path must not be in a _work directory');
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

      const rootAChunk: DialecticContributionRow = {
        id: rootA,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}`,
        file_name: 'finalA.md',
        document_relationships: { [stageSlug]: rootA },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
      };

      const contA1Chunk: DialecticContributionRow = {
        id: contA1,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}/_work`,
        file_name: 'contA1.md',
        document_relationships: { [stageSlug]: rootA },
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
      };

      const rootBChunk: DialecticContributionRow = {
        id: rootB,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}`,
        file_name: 'finalB.md',
        document_relationships: { [stageSlug]: rootB },
        created_at: '2025-01-01T12:05:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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

      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (path: string) => {
          const fullRootAPath = `${rootAChunk.storage_path}/${rootAChunk.file_name}`;
          const fullContA1Path = `${contA1Chunk.storage_path}/${contA1Chunk.file_name}`;
          if (path === fullRootAPath) return { data: new Blob(['RootA. ']), error: null };
          if (path === fullContA1Path) return { data: new Blob(['ContA1.']), error: null };
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

      const expectedFinalPath = `${rootAChunk.storage_path}/${rootAChunk.file_name}`;
      assertEquals(uploadSpy.calls[0].args[0], expectedFinalPath);
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
  
      const rootChunk: DialecticContributionRow = {
        id: root,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}`,
        file_name: 'final.md',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:00:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
      };
  
      const contA1Chunk: DialecticContributionRow = {
        id: contA1,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}/_work`,
        file_name: 'contA1.md',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:01:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
      };
  
      const contA2Chunk: DialecticContributionRow = {
        id: contA2,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}/_work`,
        file_name: 'contA2.md',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:02:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
      };
  
      const contB1Chunk: DialecticContributionRow = {
        id: contB1,
        storage_bucket: 'test-bucket',
        storage_path: `projects/p1/sessions/${sessionId}/iteration_1/3_${stageSlug}/_work`,
        file_name: 'contB1.md',
        document_relationships: { [stageSlug]: root },
        created_at: '2025-01-01T12:03:00Z',
        citations: [],
        contribution_type: 'synthesis',
        edit_version: 1,
        error: null,
        user_id: 'user-id-123',
        is_latest_edit: true,
        iteration_number: 1,
        mime_type: 'text/markdown',
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
  
      // Stub downloads (content is irrelevant to latest-flag assertions)
      const originalStorageFrom = setup.client.storage.from;
      setup.client.storage.from = (bucketName: string) => {
        const bucket = originalStorageFrom(bucketName);
        const originalDownload = bucket.download;
        bucket.download = async (_path: string) => ({ data: new Blob(['x']), error: null });
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
});