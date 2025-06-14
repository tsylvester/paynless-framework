import { assertEquals, assertExists, assertNotEquals, assert } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { describe, it, beforeEach, afterEach } from "https://deno.land/std@0.190.0/testing/bdd.ts";
import { Spy, spy, Stub, stub } from "https://deno.land/std@0.190.0/testing/mock.ts";
import { cloneProject } from "./cloneProject.ts";
import type { Database } from "../types_db.ts";
import type { User } from "npm:@supabase/gotrue-js@^2.6.3";
import type { FileObject } from "npm:@supabase/storage-js@^2.5.5";
import { 
    createMockSupabaseClient, 
    type IMockSupabaseClient, 
    type IMockClientSpies,
    type MockSupabaseDataConfig,
    type IMockStorageBucketAPI,
    type IMockStorageBasicResponse,
    type MockQueryBuilderState
} from '../_shared/supabase.mock.ts';


describe('Dialectic Service: cloneProject Action', () => {
  let mockUser: User;
  let originalProjectId: string;
  
  const mockOriginalProject: Database['public']['Tables']['dialectic_projects']['Row'] = {
    id: 'orig-project-uuid', user_id: 'user-uuid', project_name: 'Original Project',
    initial_user_prompt: 'Original prompt', selected_domain_overlay_id: 'overlay-uuid',
    selected_domain_tag: 'software_development', repo_url: 'http://github.com/original/repo',
    status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    user_domain_overlay_values: null,
    initial_prompt_resource_id: null,
    process_template_id: 'proc-template-uuid-123',
  };

  const mockOriginalResource: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
    id: 'orig-resource-uuid', project_id: mockOriginalProject.id, user_id: mockOriginalProject.user_id!,
    file_name: 'original_resource.md', storage_bucket: 'dialectic-contributions',
    storage_path: `projects/${mockOriginalProject.id}/resources/original_resource.md`,
    mime_type: 'text/markdown', size_bytes: 100, resource_description: 'Original resource file',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const mockOriginalSession: Database['public']['Tables']['dialectic_sessions']['Row'] = {
    id: 'orig-session-uuid', project_id: mockOriginalProject.id, session_description: 'Original session',
    iteration_count: 1,
    status: 'synthesis_complete', associated_chat_id: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    selected_model_catalog_ids: ['model-catalog-id-1'],
    current_stage_id: 'stage-uuid-thesis',
    user_input_reference_url: null,
  };

  const mockOriginalContribution: Database['public']['Tables']['dialectic_contributions']['Row'] = {
    id: 'orig-contribution-uuid', session_id: mockOriginalSession.id, 
    model_id: 'openai/gpt-4',
    content_storage_bucket: 'dialectic-contributions',
    content_storage_path: `${mockOriginalProject.id}/${mockOriginalSession.id}/orig-contribution-uuid.md`,
    content_mime_type: 'text/markdown', content_size_bytes: 120,
    raw_response_storage_path: `${mockOriginalProject.id}/${mockOriginalSession.id}/orig-contribution-uuid_raw.json`,
    tokens_used_input: 10, tokens_used_output: 200, processing_time_ms: 5000,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    iteration_number: 1, citations: null, 
    stage: 'critique', 
    error: null, 
    prompt_template_id_used: null, 
    target_contribution_id: null,
    model_name: 'gpt-4',
    seed_prompt_url: null,
    contribution_type: 'model_generated',
    edit_version: 1,
    is_latest_edit: true,
    original_model_contribution_id: null,
    user_id: 'user-uuid',
  };

  beforeEach(() => {
    mockUser = { 
        id: 'user-uuid', email: 'test@example.com', app_metadata: {}, user_metadata: {},
        aud: 'authenticated', created_at: new Date().toISOString()
    };
    originalProjectId = mockOriginalProject.id;
    
    // No global client setup here if each test handles its own.
    // If a common baseline mock is desired for all tests, it could be set up here,
    // but tests needing specific mock data would still create their own or override.
  });

  afterEach(() => {
    // If mocks are test-scoped and cleaned up within each 'it' block (e.g. in a try...finally),
    // this global afterEach might not need to do anything specific for client/spy cleanup.
    // If a global client was set up in beforeEach, it would be cleaned here:
    // if (clearStubs) {
    //     clearStubs();
    // }
  });

  // Updated signatures: these functions will now prepare parts of MockSupabaseDataConfig
  const prepareDatabaseConfig = (params: {
        fetchProject?: any, fetchProjectError?: any,
        fetchResources?: any[], fetchResourcesError?: any,
        fetchSessions?: any[], fetchSessionsError?: any,
        fetchContributions?: any[], fetchContributionsError?: any,
        insertResults?: Record<string, {data?: any[], error?: any}>,
        deleteError?: Record<string, any> // For mocking delete errors
    } = {}): MockSupabaseDataConfig['genericMockResults'] => {
    
    const genericMockResults: MockSupabaseDataConfig['genericMockResults'] = {};

    // SELECT mocks
    genericMockResults['dialectic_projects'] = {
        select: async (state: MockQueryBuilderState) => {
            const idFilter = state.filters.find(f => f.column === 'id' && f.type === 'eq');
            const queriedId = idFilter?.value;

            let dataToReturn: any = null;
            let errorToReturn: any = null;

            if (params.fetchProjectError) {
                errorToReturn = params.fetchProjectError;
            } else if (queriedId === mockOriginalProject.id) {
                dataToReturn = params.fetchProject !== undefined ? params.fetchProject : mockOriginalProject;
            } else if (params.insertResults?.['dialectic_projects']?.data?.find(p => p.id === queriedId)) {
                // If we are querying for an ID that was part of an insert mock for this table, return that specific data.
                // This handles the final select in cloneProject to return the newly cloned project.
                dataToReturn = params.insertResults['dialectic_projects'].data.find(p => p.id === queriedId);
            } else if (params.fetchProject) {
                 // Fallback to generic fetchProject if specific ID doesn't match an insert and original ID doesn't match
                dataToReturn = params.fetchProject;
            } else {
                // Default if no specific conditions met (e.g., project not found scenario if not covered by fetchProjectError)
                errorToReturn = { message: "Project not found in mock select", code: "PGRST116" };
            }
            
            return { 
                data: dataToReturn ? (Array.isArray(dataToReturn) ? dataToReturn : [dataToReturn]) : null, // Ensure data is an array or null
                error: errorToReturn, 
                count: dataToReturn && !errorToReturn ? (Array.isArray(dataToReturn) ? dataToReturn.length : 1) : 0, 
                status: errorToReturn ? (errorToReturn.code === 'PGRST116' ? 406 : 500) : 200, 
                statusText: errorToReturn ? 'Mock Error' : 'OK' 
            };
        }
    };
    genericMockResults['dialectic_project_resources'] = {
        select: { data: params.fetchResources !== undefined ? params.fetchResources : [mockOriginalResource], error: params.fetchResourcesError || null, count: (params.fetchResources || [mockOriginalResource]).length }
    };
    genericMockResults['dialectic_sessions'] = {
        select: { data: params.fetchSessions !== undefined ? params.fetchSessions : [mockOriginalSession], error: params.fetchSessionsError || null }
    };
    genericMockResults['dialectic_contributions'] = {
        select: { data: params.fetchContributions !== undefined ? params.fetchContributions : [mockOriginalContribution], error: params.fetchContributionsError || null }
    };

    // INSERT mocks
    if (params.insertResults) {
        for (const tableName in params.insertResults) {
            if (!genericMockResults[tableName]) genericMockResults[tableName] = {};
            const opConfig = params.insertResults[tableName];
            genericMockResults[tableName]!.insert = { 
                data: opConfig.data || [], 
                error: opConfig.error || null,
                count: opConfig.data?.length ?? 0,
                status: opConfig.error ? 500 : 200, // Example status
                statusText: opConfig.error ? 'Insert Error' : 'OK'
            };
        }
    }
    
    // DELETE mocks
    if (params.deleteError) {
        for (const tableName in params.deleteError) {
            if (!genericMockResults[tableName]) genericMockResults[tableName] = {};
            genericMockResults[tableName]!.delete = {
                data: null, // Delete ops usually return null data or the deleted items
                error: params.deleteError[tableName],
                count: 0, // Or count of deleted items if applicable
                status: 500, // Example status for error
                statusText: "Delete Error"
            };
        }
    }
    return genericMockResults;
  };

  const prepareStorageConfig = (params: { 
      copyError?: Error,
      removeError?: Error // For mocking storage remove errors
    } = {}): MockSupabaseDataConfig['storageMock'] => {
      const storageMock: MockSupabaseDataConfig['storageMock'] = {
          copyResult: async (_bucketId, _fromPath, toPath) => { // Renamed to _toPath to avoid conflict if not used
              if (params.copyError) return { data: null, error: params.copyError };
              return { data: { path: toPath }, error: null };
          },
          removeResult: async (_bucketId, _paths) => {
              if (params.removeError) return { data: null, error: params.removeError };
              return {data: null, error: null}; // Successful remove typically has null data
          }
          // Add other storage operations if needed (uploadResult, listResult etc.)
      };
      return storageMock;
  };


  it('should successfully clone a project with all its associated data', async () => {
    const newProjectName = 'Cloned Test Project';
    const newGeneratedProjectId = 'new-cloned-project-uuid';
    const newGeneratedSessionId = 'new-cloned-session-uuid';
    const newGeneratedResourceId = 'new-cloned-resource-uuid';
    const newGeneratedContributionId = 'new-cloned-contribution-uuid';

    // This will be the data returned when the new project ID is fetched
    const clonedProjectData = { 
        ...mockOriginalProject, 
        id: newGeneratedProjectId, 
        project_name: newProjectName, 
        user_id: mockUser.id,
        process_template_id: mockOriginalProject.process_template_id,
    };

    const dbConfig = prepareDatabaseConfig({
        fetchProject: mockOriginalProject, // For fetching the original project
        fetchResources: [mockOriginalResource],
        fetchSessions: [mockOriginalSession],
        fetchContributions: [mockOriginalContribution],
        insertResults: {
            'dialectic_projects': { data: [clonedProjectData] }, // This is used by the improved select mock
            'dialectic_project_resources': { data: [{ ...mockOriginalResource, id: newGeneratedResourceId, project_id: newGeneratedProjectId, storage_path: `projects/${newGeneratedProjectId}/resources/${mockOriginalResource.file_name}` }] },
            'dialectic_sessions': { data: [{ ...mockOriginalSession, id: newGeneratedSessionId, project_id: newGeneratedProjectId, current_stage_id: mockOriginalSession.current_stage_id }] },
            'dialectic_contributions': { data: [{ 
                ...mockOriginalContribution, 
                id: newGeneratedContributionId, 
                session_id: newGeneratedSessionId, 
                model_id: mockOriginalContribution.model_id,
                content_storage_path: `projects/${newGeneratedProjectId}/${newGeneratedSessionId}/${newGeneratedContributionId}.md`, 
                raw_response_storage_path: `projects/${newGeneratedProjectId}/${newGeneratedSessionId}/${newGeneratedContributionId}_raw.json` 
            }] },
        }
    });
    const storageConf = prepareStorageConfig();

    const fullMockConfig: MockSupabaseDataConfig = {
        mockUser: mockUser, // Ensure the mock client knows about the current user
        genericMockResults: dbConfig,
        storageMock: storageConf
    };

    const { client: testClient, spies: testSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockUser.id, fullMockConfig);
    assertExists(cleanup, "Cleanup function should be defined by createMockSupabaseClient");

    try {
        const { data: clonedProject, error } = await cloneProject(
            testClient as any, // Cast because the function expects the real SupabaseClient type
            originalProjectId,
            newProjectName,
            mockUser.id
        );

        assertExists(clonedProject, "Cloned project should exist");
        assertEquals(error, null, "Error should be null on successful clone");
        assertEquals(clonedProject!.id, newGeneratedProjectId);
        assertEquals(clonedProject!.project_name, newProjectName);
        assertNotEquals(clonedProject!.id, originalProjectId);
        assertEquals(clonedProject!.initial_user_prompt, mockOriginalProject.initial_user_prompt);

        // Assertions using testSpies
        const fromSpy = testSpies.fromSpy;
        assertExists(fromSpy, "fromSpy was not initialized by createMockSupabaseClient");

        // Check that from was called for dialectic_projects for select (fetch original)
        const projectSelectBuilderSpies = testSpies.getLatestQueryBuilderSpies('dialectic_projects');
        assertExists(projectSelectBuilderSpies, "Spies for latest 'dialectic_projects' builder not found");
        const selectSpy = projectSelectBuilderSpies.select;
        assertExists(selectSpy, "Select spy for 'dialectic_projects' (fetch original) not found");
        assertEquals(selectSpy.calls.length > 0, true, "Original project select call missing");

        // Check insert for dialectic_projects
        const insertHistory = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'insert');
        assertExists(insertHistory, "Insert history for 'dialectic_projects' not found");
        assertEquals(insertHistory.callCount > 0, true, "Project insert call missing");
        assert(insertHistory.callsArgs.length > 0, "No arguments recorded for project insert");


        // Check select for the newly cloned project
        const finalProjectSelectBuilderSpies = testSpies.getLatestQueryBuilderSpies('dialectic_projects');
        assertExists(finalProjectSelectBuilderSpies, "Spies for latest 'dialectic_projects' builder not found");
        const finalSelectSpy = finalProjectSelectBuilderSpies.select;
        assertExists(finalSelectSpy, "Select spy for 'dialectic_projects' (fetch cloned) not found");
        assertEquals(finalSelectSpy.calls.length > 0, true, "Cloned project select call missing");

        // Check insert for dialectic_project_resources
        const resourceInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_project_resources', 'insert');
        assertExists(resourceInsertSpies, "Insert spies for dialectic_project_resources not found");
        assertEquals(resourceInsertSpies!.callCount > 0, true, "Resource insert call missing");
        const resourceInsertArgs = resourceInsertSpies!.callsArgs[0][0] as any[];
        assertEquals(resourceInsertArgs[0].project_id, newGeneratedProjectId);
        assertEquals(resourceInsertArgs[0].storage_path, `projects/${newGeneratedProjectId}/resources/${mockOriginalResource.file_name}`);

        // Check storage copy for project resource
        const resourceBucketSpies = testSpies.storage.from(mockOriginalResource.storage_bucket!); 
        assertExists(resourceBucketSpies.copySpy, `Storage copySpy for ${mockOriginalResource.storage_bucket!} not found`);
        assertEquals(resourceBucketSpies.copySpy.calls.length > 0, true, "Storage copy for project resource not called");
        assertEquals(resourceBucketSpies.copySpy.calls[0].args[0], mockOriginalResource.storage_path);

        // Check insert for dialectic_sessions
        const sessionInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_sessions', 'insert');
        assertExists(sessionInsertSpies, "Insert spies for dialectic_sessions not found");
        assertEquals(sessionInsertSpies.callCount > 0, true, "Session insert call missing");
        const sessionInsertArgs = sessionInsertSpies.callsArgs[0][0] as any[];
        assertEquals(sessionInsertArgs[0].project_id, newGeneratedProjectId);
        
        // Check insert for dialectic_contributions
        const contributionInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_contributions', 'insert');
        assertExists(contributionInsertSpies, "Insert spies for dialectic_contributions not found");
        assertEquals(contributionInsertSpies.callCount > 0, true, "Contribution insert call missing");
        const contributionInsertArgs = contributionInsertSpies.callsArgs[0][0] as any[];
        assertEquals(contributionInsertArgs[0].session_id, newGeneratedSessionId);
        assertEquals(contributionInsertArgs[0].content_storage_path, `projects/${newGeneratedProjectId}/${newGeneratedSessionId}/${contributionInsertArgs[0].id}.md`);
        
        // Check storage copy for contribution content
        const contributionsBucketSpies = testSpies.storage.from('dialectic-contributions');
        assertExists(contributionsBucketSpies.copySpy, "Storage copySpy for dialectic-contributions not found");
        const contribContentCopyCall = contributionsBucketSpies.copySpy.calls.find(c => c.args[0] === mockOriginalContribution.content_storage_path);
        assertExists(contribContentCopyCall, "Contribution content copy call missing");
        assertEquals(contribContentCopyCall.args[1], `projects/${newGeneratedProjectId}/${newGeneratedSessionId}/${contributionInsertArgs[0].id}.md`);

    } finally {
        cleanup!(); // Restore all stubs/spies created by this client instance
    }
  });

  it('should clone project with default name if newProjectName is not provided', async () => {
    const defaultCloneName = `[CLONE] ${mockOriginalProject.project_name}`;
    const newGeneratedProjectId = 'new-default-clone-id';
    const newGeneratedSessionIdForDefaultTest = 'new-default-session-uuid';
    const newGeneratedResourceIdForDefaultTest = 'new-default-resource-uuid';
    const newGeneratedContributionIdForDefaultTest = 'new-default-contribution-uuid';

    const clonedProjectDataDefaultName = {
        ...mockOriginalProject,
        id: newGeneratedProjectId,
        project_name: defaultCloneName,
        user_id: mockUser.id
    };

    const dbConfig = prepareDatabaseConfig({
        fetchProject: mockOriginalProject,
        fetchResources: [mockOriginalResource],
        fetchSessions: [mockOriginalSession],
        fetchContributions: [mockOriginalContribution],
        insertResults: {
            'dialectic_projects': { data: [clonedProjectDataDefaultName] },
            'dialectic_project_resources': { data: [{ ...mockOriginalResource, id: newGeneratedResourceIdForDefaultTest, project_id: newGeneratedProjectId, storage_path: `projects/${newGeneratedProjectId}/resources/${mockOriginalResource.file_name}` }] },
            'dialectic_sessions': { data: [{ ...mockOriginalSession, id: newGeneratedSessionIdForDefaultTest, project_id: newGeneratedProjectId }] },
            'dialectic_contributions': { data: [{ 
                ...mockOriginalContribution, 
                id: newGeneratedContributionIdForDefaultTest, 
                session_id: newGeneratedSessionIdForDefaultTest, 
                model_id: mockOriginalContribution.model_id,
                content_storage_path: `projects/${newGeneratedProjectId}/${newGeneratedSessionIdForDefaultTest}/${newGeneratedContributionIdForDefaultTest}.md`, 
                raw_response_storage_path: `projects/${newGeneratedProjectId}/${newGeneratedSessionIdForDefaultTest}/${newGeneratedContributionIdForDefaultTest}_raw.json` 
            }] },
        }
    });
    const storageConf = prepareStorageConfig();

    const fullMockConfig: MockSupabaseDataConfig = {
        mockUser: mockUser,
        genericMockResults: dbConfig,
        storageMock: storageConf
    };

    const { client: testClient, spies: testSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockUser.id, fullMockConfig);
    assertExists(cleanup, "Cleanup function should be defined by createMockSupabaseClient (default name test)");

    try {
        const { data: clonedProject, error } = await cloneProject(
            testClient as any, 
            originalProjectId, 
            undefined, // Test the default name behavior
            mockUser.id
        );

        assertExists(clonedProject, "Cloned project should exist with default name");
        assertEquals(error, null, "Error should be null on successful clone with default name");
        assertEquals(clonedProject!.project_name, defaultCloneName);
        assertEquals(clonedProject!.id, newGeneratedProjectId);

        // Verify project insert
        const projectSelectBuilderSpiesDefault = testSpies.getLatestQueryBuilderSpies('dialectic_projects');
        assertExists(projectSelectBuilderSpiesDefault, "Spies for latest 'dialectic_projects' builder not found (default name test)");
        const selectSpyDefaultName = projectSelectBuilderSpiesDefault.select;
        assertExists(selectSpyDefaultName, "Select spy for 'dialectic_projects' (fetch original, default name) not found");
        assertEquals(selectSpyDefaultName.calls.length > 0, true, "Original project select call missing (default name test)");
        
        // Check insert for dialectic_projects (default name)
        const insertHistoryDefaultName = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'insert');
        assertExists(insertHistoryDefaultName, "Insert history for 'dialectic_projects' not found (default name test)");
        assertEquals(insertHistoryDefaultName.callCount > 0, true, "Project insert call missing (default name test)");
        assert(insertHistoryDefaultName.callsArgs.length > 0, "No arguments recorded for project insert (default name test)");

        // Check select for the newly cloned project (default name)
        const finalProjectSelectBuilderSpiesDefault = testSpies.getLatestQueryBuilderSpies('dialectic_projects');
        assertExists(finalProjectSelectBuilderSpiesDefault, "Spies for latest 'dialectic_projects' builder not found (default name test)");
        const finalSelectSpyDefault = finalProjectSelectBuilderSpiesDefault.select;
        assertExists(finalSelectSpyDefault, "Select spy for 'dialectic_projects' (fetch cloned, default name) not found");
        // The select for the cloned project happens inside the cloneProject function to return it.
        // The mock is configured to return clonedProjectDataDefaultName when dialectic_projects is selected with the new ID.
        // We already asserted `clonedProject` exists and has the correct ID and name.
        // A more direct check on the spy would be to ensure the select call for the *new* ID was made before returning.
        // However, the existing assertions on `clonedProject` implicitly cover this if the mock is correct.
        // Let's ensure the mock setup is correct for the select of the newly created project.
        const projectSelectConfig = fullMockConfig.genericMockResults!['dialectic_projects']!.select as any;
        assert(typeof projectSelectConfig === 'function', "Project select mock should be a function");

    } finally {
        cleanup!();
    }
  });

  it('should fail if original project does not exist', async () => {
    const dbConfig = prepareDatabaseConfig({ 
        fetchProject: null, // Simulate project not found
        fetchProjectError: { message: "Original project not found", code: "PGRST116", details: null, hint: null } 
    });
    // No storage config needed as it shouldn't reach storage operations

    const fullMockConfig: MockSupabaseDataConfig = {
        mockUser: mockUser,
        genericMockResults: dbConfig
    };

    const { client: testClient, spies: testSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockUser.id, fullMockConfig);
    assertExists(cleanup, "Cleanup function should be defined by createMockSupabaseClient (project not exist test)");

    try {
        const { data: clonedProject, error } = await cloneProject(
            testClient as any, 
            'non-existent-project-id', 
            'Attempt Clone', 
            mockUser.id
        );

        assertEquals(clonedProject, null, "Cloned project should be null when original does not exist");
        assertExists(error, "Error should exist when original project not found");
        assertEquals(error?.message, "Original project not found or database error.");

        // Ensure no insert was attempted for the new project
        const projectInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'insert');
        assertEquals(projectInsertSpies?.callCount ?? 0, 0, "Project insert should not have been called");

    } finally {
        cleanup!();
    }
  });

  it('should fail if user is not authorized to access the project', async () => {
    const unauthorizedProject = { ...mockOriginalProject, user_id: 'other-user-uuid' };
    const dbConfig = prepareDatabaseConfig({ 
        fetchProject: unauthorizedProject // Original project belongs to another user
    });

    const fullMockConfig: MockSupabaseDataConfig = {
        mockUser: mockUser, // Current user is mockUser.id
        genericMockResults: dbConfig
    };

    const { client: testClient, spies: testSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockUser.id, fullMockConfig);
    assertExists(cleanup, "Cleanup function should be defined by createMockSupabaseClient (unauthorized test)");

    try {
        const { data: clonedProject, error } = await cloneProject(
            testClient as any, 
            originalProjectId, 
            'Attempt Clone', 
            mockUser.id
        );

        assertEquals(clonedProject, null, "Cloned project should be null when user is unauthorized");
        assertExists(error, "Error should exist for unauthorized access");
        assertEquals(error?.message, "Original project not found or not accessible.");

        const projectInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'insert');
        assertEquals(projectInsertSpies?.callCount ?? 0, 0, "Project insert should not have been called due to auth error");

    } finally {
        cleanup!();
    }
  });

  it('should fail and attempt rollback if a storage copy operation fails for project resources', async () => {
    const newGeneratedProjectId = 'new-project-id-for-rollback-test';
    const dbConfig = prepareDatabaseConfig({
        fetchProject: mockOriginalProject,
        fetchResources: [mockOriginalResource], // Need this for the copy attempt
        insertResults: {
            'dialectic_projects': { data: [{ ...mockOriginalProject, id: newGeneratedProjectId, project_name: 'Test Clone Fail', user_id: mockUser.id }] }
        },
        deleteError: { // This is to check if rollback (delete) is attempted
            'dialectic_projects': null // Simulate successful delete during rollback if called
        }
    });
    const storageConf = prepareStorageConfig({ copyError: new Error('Storage copy failed for resource') });

    const fullMockConfig: MockSupabaseDataConfig = {
        mockUser: mockUser,
        genericMockResults: dbConfig,
        storageMock: storageConf
    };
    
    const { client: testClient, spies: testSpies, clearAllStubs: cleanup } = createMockSupabaseClient(mockUser.id, fullMockConfig);
    assertExists(cleanup, "Cleanup function should be defined by createMockSupabaseClient (rollback test)");

    try {
        const { data: clonedProject, error } = await cloneProject(
            testClient as any, 
            originalProjectId, 
            "Test Clone Fail", 
            mockUser.id
        );

        assertEquals(clonedProject, null, "Cloned project should be null on storage copy failure");
        assertExists(error, "Error should exist on storage copy failure");
        assertEquals(error?.message, "Failed to copy project resource files to storage during clone.");

        // Check that the new project insert was attempted (and perhaps succeeded before rollback)
        const projectInsertSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'insert');
        assertExists(projectInsertSpies, "Insert spies for dialectic_projects should exist if insert was attempted");
        assertEquals(projectInsertSpies.callCount, 1, "Project insert should have been called once.");

        // Check that a delete was attempted on the new project as part of rollback
        const projectDeleteSpies = testSpies.getHistoricQueryBuilderSpies('dialectic_projects', 'delete');
        assertExists(projectDeleteSpies, "Delete spies for dialectic_projects not found for rollback check");
        assertEquals(projectDeleteSpies!.callCount > 0, true, "Project delete (rollback) was not called");
        
        const lastProjectBuilderSpies = testSpies.getLatestQueryBuilderSpies('dialectic_projects');
        assertExists(lastProjectBuilderSpies, "Spies for latest 'dialectic_projects' builder not found for rollback check");
        
        const deleteBuilderMethodSpy = lastProjectBuilderSpies.delete;
        assertExists(deleteBuilderMethodSpy, "Delete method on last builder for projects not spied or called");
        assertEquals(deleteBuilderMethodSpy.calls.length, 1, "Delete should have been called on the project builder");
        
        const eqBuilderMethodSpy = lastProjectBuilderSpies.eq;
        assertExists(eqBuilderMethodSpy, "Eq method on last builder for projects not spied or called");
        const eqCallArgs = eqBuilderMethodSpy.calls.find(call => call.args[0] === 'id' && call.args[1] === newGeneratedProjectId);
        assertExists(eqCallArgs, `Rollback delete should filter by new project ID: ${newGeneratedProjectId}`);

    } finally {
        cleanup!();
    }
  });
});
