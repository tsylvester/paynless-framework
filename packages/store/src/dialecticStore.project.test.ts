import { 
    describe, 
    it, 
    expect, 
    beforeEach, 
    afterEach, 
    vi,
    type Mock
} from 'vitest';
import { 
    useDialecticStore, 
    initialDialecticStateValues 
} from './dialecticStore';
import type { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  CreateProjectPayload,
  ContributionContentSignedUrlResponse,
  AIModelCatalogEntry,
  DialecticSession,
  StartSessionPayload,
  DomainOverlayDescriptor,
  DialecticDomain,
  UploadProjectResourceFilePayload,
  DialecticProjectResource,
  UpdateProjectInitialPromptPayload,
} from '@paynless/types';

// Add the mock call here
vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    // Import the parts of the mock we need
    const { api } = await import('@paynless/api/mocks'); 
    
    return {
        ...original, // Spread original to keep any non-mocked exports
        api, // Provide the mocked api object
        initializeApiClient: vi.fn(), 
        // Provide a mock for initializeApiClient
        // No need to re-import getMockDialecticClient or resetApiMock here as they are test utilities,
        // not part of the @paynless/api module's public interface used by the store.
    };
});

// Import the shared mock setup - these are test utilities, not part of the mocked module itself.
import { resetApiMock, getMockDialecticClient, type MockDialecticApiClient } from '@paynless/api/mocks';
import { api } from '@paynless/api';

describe('useDialecticStore', () => {
    let mockDialecticApi: MockDialecticApiClient;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        mockDialecticApi = getMockDialecticClient(); // Get a reference to the dialectic specific mocks
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks(); // resetApiMock should handle this for the api calls
    });

    describe('fetchDialecticProjects action', () => {
        it('should fetch and set projects on success', async () => {
            const mockProjects: DialecticProject[] = [{ 
                id: 'proj1', 
                project_name: 'Test Project 1', 
                user_id: 'user1', 
                initial_user_prompt: 'prompt1', 
                selected_domain_id: 'dom-1',
                domain_name: 'Software Development',
                selected_domain_overlay_id: null,
                repo_url: null, 
                status: 'active', 
                created_at: '2023-01-01T00:00:00Z', 
                updated_at: '2023-01-01T00:00:00Z',
                process_template: {
                    id: 'pt-1',
                    name: 'Standard Process',
                    description: 'A standard process template',
                    created_at: '2023-01-01T00:00:00Z',
                    starting_stage_id: 'stage-1',
                    domain_id: 'dom-1'
                }
            }];
            const mockResponse: ApiResponse<DialecticProject[]> = { data: mockProjects, status: 200 };
            (api.dialectic().listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual(mockProjects);
            expect(state.projectsError).toBeNull();
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set projects to an empty array if API returns success with no data', async () => {
            const mockResponse: ApiResponse<DialecticProject[]> = { data: undefined, status: 200 }; // Or data: null
            (api.dialectic().listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toBeNull();
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set error state if listProjects API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'Failed to fetch projects' };
            const mockResponse: ApiResponse<DialecticProject[]> = { error: mockError, status: 500 };
            (api.dialectic().listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toEqual(mockError);
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetchProjects', async () => {
            (api.dialectic().listProjects as Mock).mockReturnValue(new Promise(() => {})); 
            const { fetchDialecticProjects } = useDialecticStore.getState();
            fetchDialecticProjects(); // Do not await
            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(true);
            expect(state.projectsError).toBeNull();
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if listProjects API call throws', async () => {
            const networkErrorMessage = 'Connection Timeout';
            (api.dialectic().listProjects as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);
        });
    });

    // New tests for createDialecticProject
    describe('createDialecticProject action', () => {
        const projectPayload: CreateProjectPayload = { 
            projectName: 'New Proj', 
            initialUserPrompt: 'A prompt',
            selectedDomainId: 'dom-1',
            selectedDomainOverlayId: 'overlay-1'
        };
        const mockCreatedProject: DialecticProject = {
            id: 'newProjId',
            project_name: projectPayload.projectName,
            initial_user_prompt: projectPayload.initialUserPrompt,
            selected_domain_id: projectPayload.selectedDomainId,
            domain_name: 'Software Development', // This would be set by the backend
            selected_domain_overlay_id: projectPayload.selectedDomainOverlayId ?? null,
            user_id: 'user1',
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            process_template: {
                id: 'pt-1',
                name: 'Standard Process',
                description: 'A standard process template',
                created_at: '2023-01-01T00:00:00Z',
                starting_stage_id: 'stage-1',
                domain_id: 'dom-1'
            }
        };

        it('should create a project and add it to the local state on success', async () => {
            const { createDialecticProject } = useDialecticStore.getState();
            const mockResponse: ApiResponse<DialecticProject> = { data: mockCreatedProject, status: 201 };
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);

            const result = await createDialecticProject(projectPayload);

            expect(result.data).toEqual(mockCreatedProject);
            expect(result.status).toBe(201);
            expect(api.dialectic().createProject).toHaveBeenCalledWith(expect.any(FormData));
            
            const formData = (api.dialectic().createProject as Mock).mock.calls[0][0] as FormData;
            expect(formData.get('projectName')).toBe(projectPayload.projectName);
            expect(formData.get('initialUserPromptText')).toBe(projectPayload.initialUserPrompt as string);
            expect(formData.get('selectedDomainId')).toBe(projectPayload.selectedDomainId); 
            expect(formData.get('selectedDomainOverlayId')).toBe(projectPayload.selectedDomainOverlayId as string);
            expect(formData.get('promptFile')).toBeNull();

            // Verify that the new project is added to the state
            const state = useDialecticStore.getState();
            expect(state.projects).toContainEqual(mockCreatedProject);
            // Verify that the refetch is NOT called
            expect(api.dialectic().listProjects).not.toHaveBeenCalled();
        });

        it('should set error state if createProject API returns an error', async () => {
            const mockError: ApiError = { code: 'CREATE_FAIL', message: 'Failed to create' };
            const createResponse: ApiResponse<DialecticProject> = { error: mockError, status: 400 };
            (api.dialectic().createProject as Mock).mockResolvedValue(createResponse);

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.createProjectError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
            expect(api.dialectic().listProjects).not.toHaveBeenCalled(); // Should not refetch on error
        });

        it('should set loading state during createProject', async () => {
            (api.dialectic().createProject as Mock).mockReturnValue(new Promise(() => {})); 

            const { createDialecticProject } = useDialecticStore.getState();
            // For this test, initial store state for tags is fine (null)
            createDialecticProject(projectPayload); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(true);
            expect(state.createProjectError).toBeNull();
            expect(api.dialectic().createProject).toHaveBeenCalledWith(expect.any(FormData));
            const formData = (api.dialectic().createProject as Mock).mock.calls[0][0] as FormData;
            expect(formData.get('projectName')).toBe(projectPayload.projectName);
            expect(formData.get('initialUserPromptText')).toBe(projectPayload.initialUserPrompt as string);
            expect(formData.get('selectedDomainId')).toBe(projectPayload.selectedDomainId);
            expect(formData.get('selectedDomainOverlayId')).toBe(projectPayload.selectedDomainOverlayId as string);
            expect(formData.get('promptFile')).toBeNull();
        });

        it('should set network error state if createProject API call throws and not refetch', async () => {
            const networkErrorMessage = 'Server Unreachable';
            (api.dialectic().createProject as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.projects).toEqual([]); // Ensure projects list is not modified
            expect(state.createProjectError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(result.error).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(result.data).toBeUndefined();
            // expect(result.status).toBe(0); // Status is not set for network errors in the new return type
            expect(api.dialectic().listProjects).not.toHaveBeenCalled(); // Should not attempt to refetch
        });
    });

    describe('fetchDialecticProjectDetails action', () => {
        const projectId = 'proj-detail-1';
        const mockProjectDetail: DialecticProject = {
            id: projectId,
            project_name: 'Detailed Project',
            user_id: 'user1',
            initial_user_prompt: 'A very detailed prompt',
            selected_domain_id: 'dom-1',
            domain_name: 'Software Development',
            selected_domain_overlay_id: null,
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            process_template: { // This is the key nested object to test
                id: 'pt-1',
                name: 'Standard Process',
                description: 'A standard process template',
                created_at: '2023-01-01T00:00:00Z',
                starting_stage_id: 'stage-1',
                domain_id: 'dom-1'
            }
        };

        it('should fetch and set the current project detail on success', async () => {
            const mockResponse: ApiResponse<DialecticProject> = { data: mockProjectDetail, status: 200 };
            (api.dialectic().getProjectDetails as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toEqual(mockProjectDetail);
            expect(state.projectDetailError).toBeNull();
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(projectId);
        });

        it('should set error state if getProjectDetails API returns an error', async () => {
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockResponse: ApiResponse<DialecticProject> = { error: mockError, status: 404 };
            (api.dialectic().getProjectDetails as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toBeNull();
            expect(state.projectDetailError).toEqual(mockError);
        });

        it('should set loading state during fetch', async () => {
            (api.dialectic().getProjectDetails as Mock).mockReturnValue(new Promise(() => {}));

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            fetchDialecticProjectDetails(projectId); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(true);
            expect(state.projectDetailError).toBeNull();
        });
        
        it('should set network error if getProjectDetails API call throws', async () => {
            const networkErrorMessage = 'Server Down';
            (api.dialectic().getProjectDetails as Mock).mockRejectedValue(new Error(networkErrorMessage));
      
            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);
      
            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toBeNull();
            expect(state.projectDetailError).toEqual({
              message: networkErrorMessage,
              code: 'NETWORK_ERROR',
            });
          });
    });

    describe('uploadProjectResourceFile action', () => {
        const projectId = 'proj-res-123';
        // Mock File object
        const mockFile = new File(['dummy content'], 'dummy.txt', { type: 'text/plain' });
        const uploadPayload: UploadProjectResourceFilePayload = {
            projectId,
            file: mockFile,
            fileName: 'dummy.txt',
            fileSizeBytes: mockFile.size,
            fileType: mockFile.type,
            resourceDescription: 'A dummy file for testing',
        };

        const mockResourceResponse: DialecticProjectResource = {
            id: 'res-xyz',
            project_id: projectId,
            file_name: 'dummy.txt',
            storage_path: 'path/to/dummy.txt',
            mime_type: 'text/plain',
            size_bytes: mockFile.size,
            resource_description: 'A dummy file for testing',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        it('should upload a file and return resource details on success', async () => {
            const mockApiResponse: ApiResponse<DialecticProjectResource> = {
                data: mockResourceResponse,
                status: 201,
            };
            (api.dialectic().uploadProjectResourceFile as Mock).mockResolvedValue(mockApiResponse);

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(api.dialectic().uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
            expect(result).toEqual(mockApiResponse);
        });

        it('should return API error if uploadProjectResourceFile API returns an error', async () => {
            const mockError: ApiError = { code: 'UPLOAD_FAILED', message: 'File upload failed due to API error' };
            const mockApiResponse: ApiResponse<DialecticProjectResource> = {
                error: mockError,
                status: 500,
            };
            (api.dialectic().uploadProjectResourceFile as Mock).mockResolvedValue(mockApiResponse);

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(api.dialectic().uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
            expect(result).toEqual(mockApiResponse);
        });

        it('should return network error if uploadProjectResourceFile API call throws', async () => {
            const networkErrorMessage = 'Network connection lost during upload';
            (api.dialectic().uploadProjectResourceFile as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(api.dialectic().uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
            expect(result).toEqual({
                error: { message: networkErrorMessage, code: 'NETWORK_ERROR' },
                status: 0,
            });
        });
    });

    describe('resetCreateProjectError action', () => {
        it('should set createProjectError to null', () => {
            // Set an initial error
            useDialecticStore.setState({ createProjectError: { code: 'DUMMY_ERROR', message: 'An error occurred' } });

            const { resetCreateProjectError } = useDialecticStore.getState();
            resetCreateProjectError();

            const state = useDialecticStore.getState();
            expect(state.createProjectError).toBeNull();
        });
    });

    describe('resetProjectDetailsError action', () => {
        it('should set projectDetailError to null', () => {
            // Set an initial error
            useDialecticStore.setState({ projectDetailError: { code: 'DUMMY_DETAIL_ERROR', message: 'A detail error occurred' } });

            const { resetProjectDetailsError } = useDialecticStore.getState();
            resetProjectDetailsError();

            const state = useDialecticStore.getState();
            expect(state.projectDetailError).toBeNull();
        });
    });

    describe('deleteDialecticProject action', () => {
        const projectIdToDelete = 'proj1';
        const initialProjects: DialecticProject[] = [
            { id: 'proj1', project_name: 'Test Project 1', user_id: 'user1', /* ...other fields */ } as DialecticProject,
            { id: 'proj2', project_name: 'Test Project 2', user_id: 'user1', /* ...other fields */ } as DialecticProject,
        ];

        beforeEach(() => {
            // Pre-fill the store with some projects
            useDialecticStore.setState({ projects: initialProjects, projectsError: null, isLoadingProjects: false });
        });

        it('should delete a project and remove it from the local state on success', async () => {
            const mockResponse: ApiResponse<void> = { data: undefined, status: 204 };
            (api.dialectic().deleteProject as Mock).mockResolvedValue(mockResponse);

            const { deleteDialecticProject } = useDialecticStore.getState();
            const result = await deleteDialecticProject(projectIdToDelete);

            expect(result.status).toBe(204);
            expect(result.error).toBeUndefined();
            expect(api.dialectic().deleteProject).toHaveBeenCalledWith({ projectId: projectIdToDelete });
            expect(api.dialectic().deleteProject).toHaveBeenCalledTimes(1);

            const state = useDialecticStore.getState();
            expect(state.projects.find(p => p.id === projectIdToDelete)).toBeUndefined();
            expect(state.projects.length).toBe(initialProjects.length - 1);
            expect(state.projectsError).toBeNull(); // Error should be reset if a previous one existed
        });

        it('should not modify local state if API returns an error', async () => {
            const mockError: ApiError = { code: 'DELETE_FAIL', message: 'Failed to delete project' };
            const mockResponse: ApiResponse<void> = { error: mockError, status: 500 };
            (api.dialectic().deleteProject as Mock).mockResolvedValue(mockResponse);

            const { deleteDialecticProject } = useDialecticStore.getState();
            const result = await deleteDialecticProject(projectIdToDelete);

            expect(result.error).toEqual(mockError);
            expect(result.status).toBe(500);
            expect(api.dialectic().deleteProject).toHaveBeenCalledWith({ projectId: projectIdToDelete });
            expect(api.dialectic().deleteProject).toHaveBeenCalledTimes(1);

            const state = useDialecticStore.getState();
            expect(state.projects).toEqual(initialProjects); // State should remain unchanged
            expect(state.projectsError).toEqual(mockError);
        });

        it('should set network error state if deleteProject API call throws', async () => {
            const networkErrorMessage = 'Connection Lost';
            (api.dialectic().deleteProject as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { deleteDialecticProject } = useDialecticStore.getState();
            const result = await deleteDialecticProject(projectIdToDelete);

            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(result.status).toBe(0);
            expect(api.dialectic().deleteProject).toHaveBeenCalledWith({ projectId: projectIdToDelete });
            expect(api.dialectic().deleteProject).toHaveBeenCalledTimes(1);

            const state = useDialecticStore.getState();
            expect(state.projects).toEqual(initialProjects);
            expect(state.projectsError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should reset projectsError when delete is called', async () => {
            // Setup an initial error state
            const initialError: ApiError = { code: 'PREVIOUS_ERROR', message: 'A previous error occurred' };
            useDialecticStore.setState({ projectsError: initialError });
            
            const mockResponse: ApiResponse<void> = { data: undefined, status: 204 };
            (api.dialectic().deleteProject as Mock).mockResolvedValue(mockResponse);

            const { deleteDialecticProject } = useDialecticStore.getState();
            await deleteDialecticProject(projectIdToDelete);

            const state = useDialecticStore.getState();
            expect(state.projectsError).toBeNull();
            expect(useDialecticStore.getState().projectsError).toBeNull();
            expect(api.dialectic().deleteProject).toHaveBeenCalledWith({ projectId: projectIdToDelete });
        });
    });

    describe('cloneDialecticProject action', () => {
        const projectIdToClone = 'proj1';
        const clonedProject: DialecticProject = { id: 'clonedProj', project_name: 'Cloned Project 1', user_id: 'user1', /* ...other fields */ } as DialecticProject;
        const initialProjects: DialecticProject[] = [
            { id: 'proj1', project_name: 'Test Project 1', user_id: 'user1', /* ...other fields */ } as DialecticProject,
        ];

        beforeEach(() => {
            useDialecticStore.setState({ 
                projects: initialProjects, 
                projectsError: null, 
                isLoadingProjects: false,
                isCloningProject: false,
                cloneProjectError: null,
            });
        });

        it('should clone a project, refetch projects list, and update state on success', async () => {
            const mockCloneResponse: ApiResponse<DialecticProject> = { data: clonedProject, status: 201 };
            (api.dialectic().cloneProject as Mock).mockResolvedValue(mockCloneResponse);
            
            const updatedProjectList = [...initialProjects, clonedProject];
            const mockListResponse: ApiResponse<DialecticProject[]> = { data: updatedProjectList, status: 200 };
            (api.dialectic().listProjects as Mock).mockResolvedValue(mockListResponse);

            const { cloneDialecticProject } = useDialecticStore.getState();
            const result = await cloneDialecticProject(projectIdToClone);

            expect(result.data).toEqual(clonedProject);
            expect(result.status).toBe(201);
            expect(api.dialectic().cloneProject).toHaveBeenCalledWith({ projectId: projectIdToClone });
            expect(api.dialectic().cloneProject).toHaveBeenCalledTimes(1);
            expect(api.dialectic().listProjects).toHaveBeenCalledTimes(1);

            const state = useDialecticStore.getState();
            expect(state.isCloningProject).toBe(false);
            expect(state.projects).toEqual(updatedProjectList);
            expect(state.cloneProjectError).toBeNull();
        });

        it('should set loading state during cloneProject', async () => {
            (api.dialectic().cloneProject as Mock).mockReturnValue(new Promise(() => {})); // Keep it pending

            const { cloneDialecticProject } = useDialecticStore.getState();
            cloneDialecticProject(projectIdToClone); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isCloningProject).toBe(true);
            expect(state.cloneProjectError).toBeNull();
            expect(api.dialectic().cloneProject).toHaveBeenCalledWith({ projectId: projectIdToClone });
        });

        it('should set error state if cloneProject API returns an error and not refetch', async () => {
            const mockError: ApiError = { code: 'CLONE_FAIL', message: 'Failed to clone project' };
            const mockResponse: ApiResponse<DialecticProject> = { error: mockError, status: 500 };
            (api.dialectic().cloneProject as Mock).mockResolvedValue(mockResponse);

            const { cloneDialecticProject } = useDialecticStore.getState();
            const result = await cloneDialecticProject(projectIdToClone);

            expect(result.error).toEqual(mockError);
            expect(result.status).toBe(500);
            expect(api.dialectic().cloneProject).toHaveBeenCalledWith({ projectId: projectIdToClone });
            expect(api.dialectic().listProjects).not.toHaveBeenCalled();

            const state = useDialecticStore.getState();
            expect(state.isCloningProject).toBe(false);
            expect(state.projects).toEqual(initialProjects); // Projects list should not change
            expect(state.cloneProjectError).toEqual(mockError);
        });

        it('should set network error state if cloneProject API call throws and not refetch', async () => {
            const networkErrorMessage = 'Clone Server Offline';
            (api.dialectic().cloneProject as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { cloneDialecticProject } = useDialecticStore.getState();
            const result = await cloneDialecticProject(projectIdToClone);
            
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(api.dialectic().cloneProject).toHaveBeenCalledWith({ projectId: projectIdToClone });
            expect(api.dialectic().listProjects).not.toHaveBeenCalled();

            const state = useDialecticStore.getState();
            expect(state.isCloningProject).toBe(false);
            expect(state.projects).toEqual(initialProjects);
            expect(state.cloneProjectError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });
    });

    describe('exportDialecticProject action', () => {
        const projectIdToExport = 'projToExport';
        const mockExportData = { export_url: 'http://example.com/export.zip' };

        beforeEach(() => {
            useDialecticStore.setState({
                isExportingProject: false,
                exportProjectError: null,
            });
        });

        it('should export a project and return data on success', async () => {
            // Assuming exportProject API returns some data, like a URL or file content
            const mockResponse: ApiResponse<{ export_url: string }> = { data: mockExportData, status: 200 };
            (api.dialectic().exportProject as Mock).mockResolvedValue(mockResponse);

            const { exportDialecticProject } = useDialecticStore.getState();
            const result = await exportDialecticProject(projectIdToExport);

            expect(result.data).toEqual(mockExportData);
            expect(result.status).toBe(200);
            expect(api.dialectic().exportProject).toHaveBeenCalledWith({ projectId: projectIdToExport });
            expect(api.dialectic().exportProject).toHaveBeenCalledTimes(1);

            const state = useDialecticStore.getState();
            expect(state.isExportingProject).toBe(false);
            expect(state.exportProjectError).toBeNull();
        });

        it('should set loading state during exportProject', async () => {
            (api.dialectic().exportProject as Mock).mockReturnValue(new Promise(() => {})); // Keep it pending

            const { exportDialecticProject } = useDialecticStore.getState();
            exportDialecticProject(projectIdToExport); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isExportingProject).toBe(true);
            expect(state.exportProjectError).toBeNull();
            expect(api.dialectic().exportProject).toHaveBeenCalledWith({ projectId: projectIdToExport });
        });

        it('should set error state if exportProject API returns an error', async () => {
            const mockError: ApiError = { code: 'EXPORT_FAIL', message: 'Failed to export project' };
            const mockResponse: ApiResponse<{ export_url: string }> = { error: mockError, status: 500 };
            (api.dialectic().exportProject as Mock).mockResolvedValue(mockResponse);

            const { exportDialecticProject } = useDialecticStore.getState();
            const result = await exportDialecticProject(projectIdToExport);

            expect(result.error).toEqual(mockError);
            expect(result.status).toBe(500);
            expect(api.dialectic().exportProject).toHaveBeenCalledWith({ projectId: projectIdToExport });

            const state = useDialecticStore.getState();
            expect(state.isExportingProject).toBe(false);
            expect(state.exportProjectError).toEqual(mockError);
        });

        it('should set network error state if exportProject API call throws', async () => {
            const networkErrorMessage = 'Export Server Offline';
            (api.dialectic().exportProject as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { exportDialecticProject } = useDialecticStore.getState();
            const result = await exportDialecticProject(projectIdToExport);
            
            expect(result.error).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
            expect(api.dialectic().exportProject).toHaveBeenCalledWith({ projectId: projectIdToExport });

            const state = useDialecticStore.getState();
            expect(state.isExportingProject).toBe(false);
            expect(state.exportProjectError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });
    });

    describe('updateDialecticProjectInitialPrompt action', () => {
        const projectId = 'proj123';
        const oldInitialPrompt = 'Old initial prompt';
        const newInitialPrompt = 'New and improved initial prompt';
        const mockExistingProject: DialecticProject = {
            id: 'proj123',
            project_name: 'Existing Project',
            initial_user_prompt: oldInitialPrompt,
            user_id: 'user1',
            selected_domain_id: 'dom-1',
            domain_name: 'Software Development',
            selected_domain_overlay_id: null,
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
            dialectic_sessions: [],
            resources: [],
            process_template: {
                id: 'pt-1',
                name: 'Standard Process',
                description: 'A standard process template',
                created_at: '2023-01-01T00:00:00Z',
                starting_stage_id: 'stage-1',
                domain_id: 'dom-1'
            }
        };
        const mockUpdatedProject: DialecticProject = {
            ...mockExistingProject,
            initial_user_prompt: newInitialPrompt,
            updated_at: '2023-01-02T00:00:00Z',
        };
        const payload: UpdateProjectInitialPromptPayload = { projectId, newInitialPrompt };

        beforeEach(() => {
            // Pre-fill the store with an existing project
            useDialecticStore.setState({
                projects: [mockExistingProject],
                currentProjectDetail: mockExistingProject,
                isLoadingProjectDetail: false,
                projectDetailError: null,
                isUpdatingProjectPrompt: false,
            });
        });

        it('should update project initial prompt, currentProjectDetail, and projects list on success', async () => {
            const mockResponse: ApiResponse<DialecticProject> = { data: mockUpdatedProject, status: 200 };
            (api.dialectic().updateDialecticProjectInitialPrompt as Mock).mockResolvedValue(mockResponse);

            const { updateDialecticProjectInitialPrompt } = useDialecticStore.getState();
            const result = await updateDialecticProjectInitialPrompt(payload);

            expect(result.data).toEqual(mockUpdatedProject);
            expect(result.status).toBe(200);
            expect(api.dialectic().updateDialecticProjectInitialPrompt).toHaveBeenCalledWith(payload);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingProjectPrompt).toBe(false);
            expect(state.projectDetailError).toBeNull();
            expect(state.currentProjectDetail).toEqual(mockUpdatedProject);
            expect(state.projects.find(p => p.id === projectId)).toEqual(mockUpdatedProject);
        });

        it('should update only projects list if currentProjectDetail is different', async () => {
            // Set currentProjectDetail to a different project
            useDialecticStore.setState({
                currentProjectDetail: { ...mockExistingProject, id: 'otherProject' }
            });
            const mockResponse: ApiResponse<DialecticProject> = { data: mockUpdatedProject, status: 200 };
            (api.dialectic().updateDialecticProjectInitialPrompt as Mock).mockResolvedValue(mockResponse);

            const { updateDialecticProjectInitialPrompt } = useDialecticStore.getState();
            await updateDialecticProjectInitialPrompt(payload);
            
            const state = useDialecticStore.getState();
            expect(state.currentProjectDetail?.id).toBe('otherProject'); // Should not change
            expect(state.projects.find(p => p.id === projectId)).toEqual(mockUpdatedProject);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'UPDATE_FAILED', message: 'Failed to update prompt' };
            const mockResponse: ApiResponse<DialecticProject> = { error: mockError, status: 500 };
            (api.dialectic().updateDialecticProjectInitialPrompt as Mock).mockResolvedValue(mockResponse);

            const { updateDialecticProjectInitialPrompt } = useDialecticStore.getState();
            const result = await updateDialecticProjectInitialPrompt(payload);

            expect(result.error).toEqual(mockError);
            expect(result.status).toBe(500);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingProjectPrompt).toBe(false);
            expect(state.projectDetailError).toEqual(mockError);
            // Ensure original project data is not changed
            expect(state.currentProjectDetail?.initial_user_prompt).toBe(oldInitialPrompt);
            expect(state.projects.find(p => p.id === projectId)?.initial_user_prompt).toBe(oldInitialPrompt);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed';
            (api.dialectic().updateDialecticProjectInitialPrompt as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { updateDialecticProjectInitialPrompt } = useDialecticStore.getState();
            const result = await updateDialecticProjectInitialPrompt(payload);
            
            const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
            expect(result.error).toEqual(expectedError);
            expect(result.status).toBe(0);

            const state = useDialecticStore.getState();
            expect(state.isUpdatingProjectPrompt).toBe(false);
            expect(state.projectDetailError).toEqual(expectedError);
        });

        it('should set loading state during the update operation', () => {
            (api.dialectic().updateDialecticProjectInitialPrompt as Mock).mockReturnValue(new Promise(() => {})); // Pending promise

            const { updateDialecticProjectInitialPrompt } = useDialecticStore.getState();
            updateDialecticProjectInitialPrompt(payload); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isUpdatingProjectPrompt).toBe(true);
            expect(state.projectDetailError).toBeNull();
            expect(api.dialectic().updateDialecticProjectInitialPrompt).toHaveBeenCalledWith(payload);
        });
    });
});