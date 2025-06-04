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
  DomainTagDescriptor,
  UploadProjectResourceFilePayload,
  DialecticProjectResource,
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
            const mockProjects: DialecticProject[] = [{ id: 'proj1', project_name: 'Test Project 1', user_id: 'user1', initial_user_prompt: 'prompt1', selected_domain_tag: null, repo_url: null, status: 'active', created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z' } as DialecticProject];
            const mockResponse: ApiResponse<DialecticProject[]> = { data: mockProjects, status: 200 };
            (mockDialecticApi.listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual(mockProjects);
            expect(state.projectsError).toBeNull();
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set projects to an empty array if API returns success with no data', async () => {
            const mockResponse: ApiResponse<DialecticProject[]> = { data: undefined, status: 200 }; // Or data: null
            (mockDialecticApi.listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toBeNull();
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set error state if listProjects API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'Failed to fetch projects' };
            const mockResponse: ApiResponse<DialecticProject[]> = { error: mockError, status: 500 };
            (mockDialecticApi.listProjects as Mock).mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toEqual(mockError);
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetchProjects', async () => {
            (mockDialecticApi.listProjects as Mock).mockReturnValue(new Promise(() => {})); 
            const { fetchDialecticProjects } = useDialecticStore.getState();
            fetchDialecticProjects(); // Do not await
            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(true);
            expect(state.projectsError).toBeNull();
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if listProjects API call throws', async () => {
            const networkErrorMessage = 'Connection Timeout';
            (mockDialecticApi.listProjects as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });
    });

    // New tests for createDialecticProject
    describe('createDialecticProject action', () => {
        const projectPayload: CreateProjectPayload = { projectName: 'New Proj', initialUserPrompt: 'A prompt' };
        const mockCreatedProject: DialecticProject = {
            id: 'newProjId',
            project_name: projectPayload.projectName,
            initial_user_prompt: projectPayload.initialUserPrompt,
            selected_domain_tag: null,
            selected_domain_overlay_id: null,
            user_id: 'user1',
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z'
        } as DialecticProject;

        it('should create a project and refetch projects list on success', async () => {
            const { createDialecticProject } = useDialecticStore.getState();
            const mockResponse: ApiResponse<DialecticProject> = { data: mockCreatedProject, status: 201 };
            (mockDialecticApi.createProject as Mock).mockResolvedValue(mockResponse);
            // Mock for listProjects, which is called after successful creation
            (mockDialecticApi.listProjects as Mock).mockResolvedValue({ data: [mockCreatedProject], status: 200 });

            const result = await createDialecticProject(projectPayload);

            expect(result.data).toEqual(mockCreatedProject);
            expect(result.status).toBe(201);
            // Verify the payload sent to the API includes selectedDomainTag and selected_domain_overlay_id from the store's initial state (null)
            expect(mockDialecticApi.createProject).toHaveBeenCalledWith({
                ...projectPayload,
                selectedDomainTag: null, 
                selected_domain_overlay_id: null 
            });
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should create a project with a specific selected_domain_tag and selected_domain_overlay_id and refetch', async () => {
            const inputPayload: CreateProjectPayload = { projectName: 'Tagged Project', initialUserPrompt: 'A prompt for a tagged project' };
            const testSelectedDomainTag = 'software_testing';
            const testSelectedDomainOverlayId = 'overlay_abc';

            // Set the store state for selectedDomainTag and selected_domain_overlay_id
            useDialecticStore.getState().setSelectedDomainTag(testSelectedDomainTag);
            useDialecticStore.getState().setSelectedDomainOverlayId(testSelectedDomainOverlayId);
            
            const mockCreatedTaggedProject: DialecticProject = {
                id: 'newTaggedProjId',
                project_name: inputPayload.projectName,
                initial_user_prompt: inputPayload.initialUserPrompt,
                selected_domain_tag: testSelectedDomainTag, // Expecting the value from store state
                selected_domain_overlay_id: testSelectedDomainOverlayId, // Expecting the value from store state
                user_id: 'user1',
                repo_url: null,
                status: 'active',
                created_at: '2023-01-02T00:00:00.000Z',
                updated_at: '2023-01-02T00:00:00.000Z'
            } as DialecticProject;

            const { createDialecticProject } = useDialecticStore.getState();
            const mockResponse: ApiResponse<DialecticProject> = { data: mockCreatedTaggedProject, status: 201 };
            (mockDialecticApi.createProject as Mock).mockResolvedValue(mockResponse);
            (mockDialecticApi.listProjects as Mock).mockResolvedValue({ data: [mockCreatedTaggedProject], status: 200 });

            const result = await createDialecticProject(inputPayload); // Pass the input payload without tag/overlay

            expect(result.data).toEqual(mockCreatedTaggedProject);
            expect(result.status).toBe(201);
            // Verify the API was called with projectName and initialUserPrompt from input,
            // and selectedDomainTag/selected_domain_overlay_id from the store state
            expect(mockDialecticApi.createProject).toHaveBeenCalledWith({
                projectName: inputPayload.projectName,
                initialUserPrompt: inputPayload.initialUserPrompt,
                selectedDomainTag: testSelectedDomainTag,
                selected_domain_overlay_id: testSelectedDomainOverlayId
            });
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set error state if createProject API returns an error', async () => {
            const mockError: ApiError = { code: 'CREATE_FAIL', message: 'Failed to create' };
            const createResponse: ApiResponse<DialecticProject> = { error: mockError, status: 400 };
            mockDialecticApi.createProject.mockResolvedValue(createResponse);

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.createProjectError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
            expect(mockDialecticApi.listProjects).not.toHaveBeenCalled(); // Should not refetch on error
        });

        it('should set loading state during createProject', async () => {
            (mockDialecticApi.createProject as Mock).mockReturnValue(new Promise(() => {})); 

            const { createDialecticProject } = useDialecticStore.getState();
            // For this test, initial store state for tags is fine (null)
            createDialecticProject(projectPayload); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(true);
            expect(state.createProjectError).toBeNull();
            expect(mockDialecticApi.createProject).toHaveBeenCalledWith({
                ...projectPayload,
                selectedDomainTag: null, 
                selected_domain_overlay_id: null
            });
        });

        it('should set network error state if createProject API call throws and not refetch', async () => {
            const networkErrorMessage = 'Server Unreachable';
            mockDialecticApi.createProject.mockRejectedValue(new Error(networkErrorMessage));

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.createProjectError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(result.error).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(result.status).toBe(0);
            expect(mockDialecticApi.listProjects).not.toHaveBeenCalled(); // Should not attempt to refetch
        });
    });

    describe('fetchDialecticProjectDetails action', () => {
        const projectId = 'proj-detail-123';
        const mockProjectDetail: DialecticProject = { 
            id: projectId, 
            project_name: 'Detailed Project', 
            initial_user_prompt: 'Detail prompt',
            selected_domain_tag: 'tech',
            user_id: 'user1',
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00.000Z',
            updated_at: '2023-01-01T00:00:00.000Z',
            sessions: [] 
        };

        it('should fetch and set project details on success', async () => {
            const mockResponse: ApiResponse<DialecticProject> = { data: mockProjectDetail, status: 200 };
            mockDialecticApi.getProjectDetails.mockResolvedValue(mockResponse);

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toEqual(mockProjectDetail);
            expect(state.projectDetailError).toBeNull();
            expect(mockDialecticApi.getProjectDetails).toHaveBeenCalledWith(projectId);
        });

        it('should set error state if getProjectDetails API returns an error', async () => {
            const mockError: ApiError = { code: 'NOT_FOUND', message: 'Project not found' };
            const mockResponse: ApiResponse<DialecticProject> = { error: mockError, status: 404 };
            mockDialecticApi.getProjectDetails.mockResolvedValue(mockResponse);

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toBeNull();
            expect(state.projectDetailError).toEqual(mockError);
        });

        it('should set network error state if getProjectDetails API call throws', async () => {
            const networkErrorMessage = 'Network issue fetching details';
            mockDialecticApi.getProjectDetails.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            await fetchDialecticProjectDetails(projectId);

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjectDetail).toBe(false);
            expect(state.currentProjectDetail).toBeNull();
            expect(state.projectDetailError).toEqual({ message: networkErrorMessage, code: 'NETWORK_ERROR' });
        });

        it('should set loading state during fetchDialecticProjectDetails', () => {
            mockDialecticApi.getProjectDetails.mockReturnValue(new Promise(() => {}));
            const { fetchDialecticProjectDetails } = useDialecticStore.getState();
            fetchDialecticProjectDetails(projectId);
            expect(useDialecticStore.getState().isLoadingProjectDetail).toBe(true);
            expect(useDialecticStore.getState().projectDetailError).toBeNull();
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
            (mockDialecticApi.uploadProjectResourceFile as Mock).mockResolvedValue(mockApiResponse);

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(mockDialecticApi.uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
            expect(result).toEqual(mockApiResponse);
        });

        it('should return API error if uploadProjectResourceFile API returns an error', async () => {
            const mockError: ApiError = { code: 'UPLOAD_FAILED', message: 'File upload failed due to API error' };
            const mockApiResponse: ApiResponse<DialecticProjectResource> = {
                error: mockError,
                status: 500,
            };
            (mockDialecticApi.uploadProjectResourceFile as Mock).mockResolvedValue(mockApiResponse);

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(mockDialecticApi.uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
            expect(result).toEqual(mockApiResponse);
        });

        it('should return network error if uploadProjectResourceFile API call throws', async () => {
            const networkErrorMessage = 'Network connection lost during upload';
            (mockDialecticApi.uploadProjectResourceFile as Mock).mockRejectedValue(new Error(networkErrorMessage));

            const { uploadProjectResourceFile } = useDialecticStore.getState();
            const result = await uploadProjectResourceFile(uploadPayload);

            expect(mockDialecticApi.uploadProjectResourceFile).toHaveBeenCalledWith(uploadPayload);
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
});