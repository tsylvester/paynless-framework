import { SupabaseClient } from 'npm:@supabase/supabase-js';
import { assert, assertEquals } from "jsr:@std/assert";
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../_shared/supabase.mock.ts';
import { createMockFileManagerService, MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { constructStoragePath, generateShortId } from '../_shared/utils/path_constructor.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { saveContributionEdit } from './saveContributionEdit.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import type { Database } from '../types_db.ts';
import { MockLogger} from '../_shared/logger.mock.ts';
import type { SaveContributionEditDeps } from './saveContributionEdit.ts';

const mockLogger = new MockLogger();

describe('Dialectic Service Action: saveContributionEdit', () => {
  describe('unit (DI): canonical save via FileManager', () => {
    let mockSupabaseSetup: MockSupabaseClientSetup;
    let fm: MockFileManagerService;
    const testUserId = 'user-uuid-editor';

    beforeEach(() => {
      fm = createMockFileManagerService();
    });

    it('saves a user edit using canonical paths and FileManager', async () => {
      const projectId = 'proj-uuid-1234';
      const sessionId = 'sess-uuid-9999';
      const stage = { id: 'stage-thesis-uuid', slug: 'thesis', display_name: 'Thesis', description: null, created_at: new Date().toISOString(), expected_output_artifacts: null, input_artifact_rules: null, default_system_prompt_id: null };
      const originalContributionId = 'contr-orig-0001';
      const iterationNumber = 1;
      const modelId = 'ai_model_id_opus';
      const modelName = 'claude-3-opus';
      const attemptCount = 0;

      // Build canonical original contribution storage path
      const originalPath = constructStoragePath({
        projectId,
        fileType: FileType.ModelContributionMain,
        sessionId,
        iteration: iterationNumber,
        stageSlug: stage.slug,
        modelSlug: modelName,
        attemptCount,
        contributionType: 'thesis',
        originalFileName: `${modelName}_${attemptCount}_thesis.md`,
      });

      const shortSessionId = generateShortId(sessionId);

      const originalRow = {
        id: originalContributionId,
        session_id: sessionId,
        user_id: null,
        stage: stage.id,
        iteration_number: iterationNumber,
        model_id: modelId,
        model_name: modelName,
        prompt_template_id_used: null,
        seed_prompt_url: `${projectId}/session_${shortSessionId}/iteration_${iterationNumber}/1_thesis/seed_prompt.md`,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
      raw_response_storage_path: null,
        target_contribution_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
      processing_time_ms: null,
        error: null,
      citations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        contribution_type: 'thesis',
        file_name: originalPath.fileName,
        storage_bucket: 'dialectic_contributions_content',
        storage_path: originalPath.storagePath,
        size_bytes: 20,
        mime_type: 'text/markdown',
        dialectic_sessions: undefined, // not part of row
        document_relationships: { "thesis": "thesis-id-123" }, // ADDED for test
      };

      const newEditId = 'contr-edit-0002';
      const editedText = 'Edited content goes here';

      // Capture update payloads for verification
      const updatesApplied: Array<{ filters: { column?: string; value?: unknown; type: string }[]; update: Partial<Database['public']['Tables']['dialectic_contributions']['Row']> }> = [];

      mockSupabaseSetup = createMockSupabaseClient(testUserId, {
        genericMockResults: {
          dialectic_contributions: {
            select: async (state) => {
              // Fetch original by id
              if (state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === originalContributionId)) {
                return { data: [{ ...originalRow, dialectic_sessions: { project_id: projectId, dialectic_projects: { user_id: testUserId }, current_stage_id: stage.id } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              // Fetch newly created by id
              if (state.operation === 'select' && state.filters.some(f => f.column === 'id' && f.value === newEditId)) {
                // Simulate that the new edit row mirrors canonical path, version incremented
                const seedPromptPath = constructStoragePath({ projectId, fileType: FileType.SeedPrompt, sessionId, iteration: iterationNumber, stageSlug: stage.slug });
                const newRow = { ...originalRow, id: newEditId, user_id: testUserId, edit_version: 2, is_latest_edit: true, original_model_contribution_id: originalContributionId, target_contribution_id: originalContributionId, seed_prompt_url: `${seedPromptPath.storagePath}/${seedPromptPath.fileName}`, updated_at: new Date().toISOString() };
                return { data: [newRow], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async (state) => {
              updatesApplied.push({ filters: state.filters, update: state.updateData ?? {} });
              return { data: [originalRow], error: null, count: 1, status: 200, statusText: 'OK' };
            },
          },
          dialectic_sessions: {
            select: async (state) => {
              if (state.filters.some(f => f.column === 'id' && f.value === sessionId)) {
                return { data: [{ id: sessionId, project_id: projectId, session_description: 'desc', iteration_count: 1, status: 'active', current_stage_id: stage.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), selected_model_ids: [modelId], user_input_reference_url: null, associated_chat_id: null }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          dialectic_projects: {
            select: async () => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
          },
          dialectic_stages: {
            select: async (state) => {
              if (state.filters.some(f => f.column === 'id' && f.value === stage.id)) {
                return { data: [stage], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            }
          },
        },
      });

      // Configure FileManager to return a new contribution row if called
      fm.setUploadAndRegisterFileResponse({ 
        ...originalRow, 
        id: newEditId, 
        user_id: testUserId, 
        edit_version: 2, 
        is_latest_edit: true, 
        original_model_contribution_id: originalContributionId, 
        target_contribution_id: originalContributionId, 
        document_relationships: null, is_header: false, source_prompt_resource_id: null,
        stage_slug: stage.slug,
        iteration_number: iterationNumber,
        resource_type: null,
        source_contribution_id: null,
      }, null);

      // Call function directly (unit). Note: function currently lacks DI for FileManager; this test will be RED until refactor.
      const { data: { user } } = await mockSupabaseSetup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ 
        originalContributionIdToEdit: originalContributionId, 
        editedContentText: editedText }, 
        mockSupabaseSetup.client as unknown as SupabaseClient<Database>, 
        user!, 
        mockLogger,
        deps);

      // Expect success status
      assertEquals(result.error, undefined);
      assert(result.data);

      // Assert FileManager usage and canonical path context (expected after refactor)
      const calls = fm.uploadAndRegisterFile.calls;
      assertEquals(calls.length, 1, 'uploadAndRegisterFile must be called once to save user edit canonically');
      const ctx = calls[0].args[0];
      assertEquals(ctx.pathContext.projectId, projectId);
      assertEquals(ctx.pathContext.sessionId, sessionId);
      assertEquals(ctx.pathContext.iteration, iterationNumber);
      assertEquals(ctx.pathContext.stageSlug, 'thesis');
      assertEquals(ctx.pathContext.fileType, FileType.ModelContributionMain);
      assertEquals(ctx.pathContext.modelSlug, modelName);
      assertEquals(ctx.pathContext.attemptCount, attemptCount);
      assertEquals(ctx.pathContext.originalFileName, `${modelName}_${attemptCount}_thesis.md`);

      // Contribution metadata assertions
      assert(ctx.contributionMetadata);
      assertEquals(ctx.contributionMetadata!.sessionId, sessionId);
      assertEquals(ctx.contributionMetadata!.modelIdUsed, modelId);
      assertEquals(ctx.contributionMetadata!.modelNameDisplay, modelName);
      assertEquals(ctx.contributionMetadata!.stageSlug, 'thesis');
      assertEquals(ctx.contributionMetadata!.iterationNumber, iterationNumber);
      assertEquals(ctx.contributionMetadata!.rawJsonResponseContent, '');
      // seed prompt path
      const seedPromptPath = constructStoragePath({ projectId, fileType: FileType.SeedPrompt, sessionId, iteration: iterationNumber, stageSlug: 'thesis' });
      assertEquals(ctx.contributionMetadata!.seedPromptStoragePath, `${seedPromptPath.storagePath}/${seedPromptPath.fileName}`);
      // Versioning
      assertEquals(ctx.contributionMetadata!.editVersion, 2);
      assertEquals(ctx.contributionMetadata!.isLatestEdit, true);
      assertEquals(ctx.contributionMetadata!.originalModelContributionId, originalContributionId);
      assertEquals(ctx.contributionMetadata!.target_contribution_id, originalContributionId);

      // Original should be marked not latest
      const updateForOriginal = updatesApplied.find(u => u.filters.some(f => f.column === 'id' && f.value === originalContributionId));
      assert(updateForOriginal, 'Original row should be updated');
      const updated = updateForOriginal!.update;
      assertEquals(updated.is_latest_edit, false);
      assertEquals(updated.document_relationships, undefined, "Update payload must not touch existing document_relationships");
    });

    it('returns 404 when original contribution is not found', async () => {
      const originalContributionId = 'missing-contr-id';
      const projectId = 'proj-x';
      const sessionId = 'sess-x';

      mockSupabaseSetup = createMockSupabaseClient('user-x', {
        genericMockResults: {
          dialectic_contributions: {
            select: async (_state) => ({ data: [], error: null, count: 0, status: 200, statusText: 'OK' }),
          },
        },
      });

      const { data: { user } } = await mockSupabaseSetup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ 
        originalContributionIdToEdit: originalContributionId, 
        editedContentText: 'text' 
      }, 
      mockSupabaseSetup.client as unknown as SupabaseClient<Database>, 
      user!, 
      mockLogger,
      deps);

      assert(result.error);
      assertEquals(result.data, undefined);
      assertEquals(result.error?.message, 'Original contribution not found.');
      assertEquals((result.status ?? result.error?.status), 404);
      assertEquals(fm.uploadAndRegisterFile.calls.length, 0);
    });

    it('returns 403 when user is not project owner', async () => {
      const testUserIdLocal = 'user-uuid-editor-2';
      const originalContributionId = 'contr-unauth-1';
      const projectId = 'proj-unauth';
      const sessionId = 'sess-unauth';
      const stage = { id: 'stage-id', slug: 'thesis', display_name: 'Thesis', description: null, created_at: new Date().toISOString(), expected_output_artifacts: null, input_artifact_rules: null, default_system_prompt_id: null };

      mockSupabaseSetup = createMockSupabaseClient(testUserIdLocal, {
        genericMockResults: {
          dialectic_contributions: {
            select: async (state) => {
              if (state.filters.some(f => f.column === 'id' && f.value === originalContributionId)) {
                // Include nested owner info in the contribution shape
                return { data: [{ id: originalContributionId, session_id: sessionId, stage: stage.id, iteration_number: 1, model_id: 'm', model_name: 'model', edit_version: 1, is_latest_edit: true, original_model_contribution_id: null, target_contribution_id: null, storage_bucket: 'dialectic_contributions_content', storage_path: `${projectId}/session_${generateShortId(sessionId)}/iteration_1/1_thesis`, mime_type: 'text/markdown', size_bytes: 1, file_name: 'model_0_thesis.md', tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, raw_response_storage_path: null, seed_prompt_url: null, contribution_type: 'thesis', document_relationships: null, dialectic_sessions: { project_id: projectId, dialectic_projects: { user_id: 'different-owner' }, current_stage_id: stage.id } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          dialectic_stages: { select: async () => ({ data: [stage], error: null, count: 1, status: 200, statusText: 'OK' }) },
        },
      });

      const { data: { user } } = await mockSupabaseSetup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ originalContributionIdToEdit: originalContributionId, editedContentText: 'text' }, mockSupabaseSetup.client as unknown as SupabaseClient<Database>, user!, mockLogger, deps);

      assert(result.error);
      assertEquals(result.data, undefined);
      assertEquals(result.error?.message, 'Not authorized to edit this contribution.');
      assertEquals((result.status ?? result.error?.status), 403);
      assertEquals(fm.uploadAndRegisterFile.calls.length, 0);
    });

    it('fails fast when original storage path is not canonical (cannot deconstruct)', async () => {
      const testUserIdLocal = 'user-uuid-editor-3';
      const originalContributionId = 'contr-badpath-1';
      const projectId = 'proj-badpath';
      const sessionId = 'sess-badpath';
      const stage = { id: 'stage-id', slug: 'thesis', display_name: 'Thesis', description: null, created_at: new Date().toISOString(), expected_output_artifacts: null, input_artifact_rules: null, default_system_prompt_id: null };

      mockSupabaseSetup = createMockSupabaseClient(testUserIdLocal, {
        genericMockResults: {
          dialectic_contributions: {
            select: async (state) => {
              if (state.filters.some(f => f.column === 'id' && f.value === originalContributionId)) {
                return { data: [{ id: originalContributionId, session_id: sessionId, stage: stage.id, iteration_number: 1, model_id: 'm', model_name: 'model', edit_version: 1, is_latest_edit: true, original_model_contribution_id: null, target_contribution_id: null, storage_bucket: 'dialectic_contributions_content', storage_path: `noncanonical/path`, mime_type: 'text/markdown', size_bytes: 1, file_name: 'file.md', tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, raw_response_storage_path: null, seed_prompt_url: null, contribution_type: 'thesis', document_relationships: null, dialectic_sessions: { project_id: projectId, dialectic_projects: { user_id: testUserIdLocal }, current_stage_id: stage.id } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
          },
          dialectic_sessions: {
            select: async () => ({ data: [{ id: sessionId, project_id: projectId, session_description: null, iteration_count: 1, status: 'active', current_stage_id: stage.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), selected_model_ids: ['m'], user_input_reference_url: null, associated_chat_id: null }], error: null, count: 1, status: 200, statusText: 'OK' })
          },
          dialectic_stages: { select: async () => ({ data: [stage], error: null, count: 1, status: 200, statusText: 'OK' }) },
        },
      });

      const { data: { user } } = await mockSupabaseSetup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ originalContributionIdToEdit: originalContributionId, editedContentText: 'text' }, mockSupabaseSetup.client as unknown as SupabaseClient<Database>, user!, mockLogger, deps);

      assert(result.error);
      assertEquals(result.data, undefined);
      // Message to be implemented in source for canonical failure
      assertEquals((result.status ?? result.error?.status), 500);
      assertEquals(fm.uploadAndRegisterFile.calls.length, 0);
    });

    it('returns 400 on missing originalContributionIdToEdit', async () => {
      const setup = createMockSupabaseClient('user-y');
      const { data: { user } } = await setup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: setup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ originalContributionIdToEdit: '' as unknown as string, editedContentText: 'text' }, setup.client as unknown as SupabaseClient<Database>, user!, mockLogger, deps);
      assert(result.error);
      assertEquals((result.status ?? result.error?.status), 400);
      assertEquals(fm.uploadAndRegisterFile.calls.length, 0);
    });

    it('returns 400 on missing editedContentText', async () => {
      const setup = createMockSupabaseClient('user-z');
      const { data: { user } } = await setup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: setup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ originalContributionIdToEdit: 'some-id', editedContentText: undefined as unknown as string }, setup.client as unknown as SupabaseClient<Database>, user!, mockLogger, deps);
      assert(result.error);
      assertEquals((result.status ?? result.error?.status), 400);
      assertEquals(result.error?.message, 'editedContentText is required.');
      assertEquals(fm.uploadAndRegisterFile.calls.length, 0);
    });
  
    it('maps contribution_type to union type on success', async () => {
      const testUserIdLocal = 'user-uuid-editor-4';
      const originalContributionId = 'contr-maptype-1';
      const projectId = 'proj-maptype';
      const sessionId = 'sess-maptype';
      const stage = { id: 'stage-thesis', slug: 'thesis', display_name: 'Thesis', description: null, created_at: new Date().toISOString(), expected_output_artifacts: null, input_artifact_rules: null, default_system_prompt_id: null };

      const shortSessionId = generateShortId(sessionId);
      const origPath = `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/opus_0_thesis.md`;

      mockSupabaseSetup = createMockSupabaseClient(testUserIdLocal, {
        genericMockResults: {
          dialectic_contributions: {
            select: async (state) => {
              if (state.filters.some(f => f.column === 'id' && f.value === originalContributionId)) {
                return { data: [{ id: originalContributionId, session_id: sessionId, stage: stage.id, iteration_number: 1, model_id: 'mid', model_name: 'opus', edit_version: 1, is_latest_edit: true, original_model_contribution_id: null, target_contribution_id: null, storage_bucket: 'dialectic_contributions_content', storage_path: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis`, mime_type: 'text/markdown', size_bytes: 1, file_name: 'opus_0_thesis.md', tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: null, raw_response_storage_path: null, seed_prompt_url: null, contribution_type: 'thesis', document_relationships: null, dialectic_sessions: { project_id: projectId, dialectic_projects: { user_id: testUserIdLocal }, current_stage_id: stage.id } }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              if (state.filters.some(f => f.column === 'id' && typeof f.value === 'string' && f.value !== originalContributionId)) {
                const newId = String(state.filters.find(f => f.column === 'id')?.value ?? '');
                return { data: [{ id: newId, session_id: sessionId, stage: stage.id, iteration_number: 1, model_id: 'mid', model_name: 'opus', edit_version: 2, is_latest_edit: true, original_model_contribution_id: originalContributionId, target_contribution_id: originalContributionId, storage_bucket: 'dialectic_contributions_content', storage_path: origPath, mime_type: 'text/markdown', size_bytes: 1, file_name: 'opus_0_thesis.md', tokens_used_input: null, tokens_used_output: null, processing_time_ms: null, error: null, citations: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: testUserIdLocal, raw_response_storage_path: null, seed_prompt_url: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/seed_prompt.md`, contribution_type: 'thesis', document_relationships: null }], error: null, count: 1, status: 200, statusText: 'OK' };
              }
              return { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
            },
            update: async () => ({ data: [], error: null, count: 1, status: 200, statusText: 'OK' }),
          },
          dialectic_sessions: { select: async () => ({ data: [{ id: sessionId, project_id: projectId, session_description: null, iteration_count: 1, status: 'active', current_stage_id: stage.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), selected_model_ids: ['mid'], user_input_reference_url: null, associated_chat_id: null }], error: null, count: 1, status: 200, statusText: 'OK' }) },
          dialectic_stages: { select: async () => ({ data: [stage], error: null, count: 1, status: 200, statusText: 'OK' }) },
        },
      });

      fm.setUploadAndRegisterFileResponse({ 
        id: 'new-id-mapped', 
        session_id: sessionId, 
        user_id: testUserIdLocal, 
        stage: stage.id, 
        iteration_number: 1, 
        model_id: 'mid', 
        model_name: 'opus', 
        prompt_template_id_used: null, 
        seed_prompt_url: `${projectId}/session_${shortSessionId}/iteration_1/1_thesis/seed_prompt.md`, 
        edit_version: 2, 
        is_latest_edit: true, 
        original_model_contribution_id: originalContributionId, 
        raw_response_storage_path: null, 
        target_contribution_id: originalContributionId, 
        tokens_used_input: null, 
        tokens_used_output: null, 
        processing_time_ms: null, 
        error: null, citations: null, 
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString(), 
        contribution_type: 'thesis', 
        file_name: 'opus_0_thesis.md', 
        storage_bucket: 'dialectic_contributions_content', 
        storage_path: origPath, size_bytes: 1, 
        mime_type: 'text/markdown', document_relationships: null, 
        is_header: false, source_prompt_resource_id: null, 
        stage_slug: stage.slug, resource_type: null, source_contribution_id: null }, null);

      const { data: { user } } = await mockSupabaseSetup.client.auth.getUser();
      const deps: SaveContributionEditDeps = {
        fileManager: fm,
        logger: mockLogger,
        dbClient: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
        pathDeconstructor: deconstructStoragePath,
        pathConstructor: constructStoragePath,
      };
      const result = await saveContributionEdit({ originalContributionIdToEdit: originalContributionId, editedContentText: 'edited' }, mockSupabaseSetup.client as unknown as SupabaseClient<Database>, user!, mockLogger, deps);
      assert(result.data);
      assertEquals(result.data!.contribution_type, 'thesis');
    });
  });
}); 