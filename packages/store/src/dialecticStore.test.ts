import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import type { 
  ApiError, 
  ApiResponse, 
  DialecticProject, 
  CreateProjectPayload 
} from '@paynless/types';

// Add the mock call here
vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    // Import the parts of the mock we need
    const { api } = await import('@paynless/api/mocks'); 
    
    return {
        ...original, // Spread original to keep any non-mocked exports
        api, // Provide the mocked api object
        initializeApiClient: vi.fn(), // Provide a mock for initializeApiClient
        // No need to re-import getMockDialecticClient or resetApiMock here as they are test utilities,
        // not part of the @paynless/api module's public interface used by the store.
    };
});

// Import the shared mock setup - these are test utilities, not part of the mocked module itself.
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    let mockDialecticApi: ReturnType<typeof getMockDialecticClient>;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        mockDialecticApi = getMockDialecticClient(); // Get a reference to the dialectic specific mocks
        useDialecticStore.getState()._resetForTesting?.();
        // vi.clearAllMocks(); // resetApiMock should handle this for the api calls
    });

    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const state = useDialecticStore.getState();
            expect(state.availableDomainTags).toEqual(initialDialecticStateValues.availableDomainTags);
            expect(state.isLoadingDomainTags).toBe(initialDialecticStateValues.isLoadingDomainTags);
            expect(state.domainTagsError).toBe(initialDialecticStateValues.domainTagsError);
            expect(state.selectedDomainTag).toBe(initialDialecticStateValues.selectedDomainTag);
            // New initial state checks
            expect(state.projects).toEqual(initialDialecticStateValues.projects);
            expect(state.isLoadingProjects).toBe(initialDialecticStateValues.isLoadingProjects);
            expect(state.projectsError).toBe(initialDialecticStateValues.projectsError);
            expect(state.isCreatingProject).toBe(initialDialecticStateValues.isCreatingProject);
            expect(state.createProjectError).toBe(initialDialecticStateValues.createProjectError);
        });
    });

    describe('setSelectedDomainTag action', () => {
        it('should update selectedDomainTag in the state', () => {
            const { setSelectedDomainTag } = useDialecticStore.getState();
            setSelectedDomainTag('new_domain');
            let state = useDialecticStore.getState();
            expect(state.selectedDomainTag).toBe('new_domain');

            setSelectedDomainTag(null);
            state = useDialecticStore.getState();
            expect(state.selectedDomainTag).toBeNull();
        });
    });

    describe('fetchAvailableDomainTags action', () => {
        it('should fetch and set domain tags on success', async () => {
            const mockTags = ['tagA', 'tagB'];
            const mockResponse: ApiResponse<string[]> = { data: mockTags, status: 200 };
            mockDialecticApi.listAvailableDomainTags.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual(mockTags);
            expect(state.domainTagsError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'API failed' };
            const mockResponse: ApiResponse<string[]> = { error: mockError, status: 500 };
            mockDialecticApi.listAvailableDomainTags.mockResolvedValue(mockResponse);

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual(mockError);
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set network error state if API call throws', async () => {
            const networkErrorMessage = 'Network connection lost';
            mockDialecticApi.listAvailableDomainTags.mockRejectedValue(new Error(networkErrorMessage));

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            await fetchAvailableDomainTags();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(false);
            expect(state.availableDomainTags).toEqual([]);
            expect(state.domainTagsError).toEqual({
                message: networkErrorMessage,
                code: 'NETWORK_ERROR',
            });
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetch', async () => {
            mockDialecticApi.listAvailableDomainTags.mockReturnValue(new Promise(() => {})); // Non-resolving promise

            const { fetchAvailableDomainTags } = useDialecticStore.getState();
            fetchAvailableDomainTags(); // Do not await

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomainTags).toBe(true);
            expect(state.domainTagsError).toBeNull();
            expect(mockDialecticApi.listAvailableDomainTags).toHaveBeenCalledTimes(1);
        });
    });

    // New tests for fetchDialecticProjects
    describe('fetchDialecticProjects action', () => {
        it('should fetch and set projects on success', async () => {
            const mockProjects: DialecticProject[] = [{ id: 'proj1', project_name: 'Test Project 1' } as DialecticProject];
            const mockResponse: ApiResponse<DialecticProject[]> = { data: mockProjects, status: 200 };
            mockDialecticApi.listProjects.mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual(mockProjects);
            expect(state.projectsError).toBeNull();
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set error state if listProjects API returns an error', async () => {
            const mockError: ApiError = { code: 'API_FAIL', message: 'Failed to fetch projects' };
            const mockResponse: ApiResponse<DialecticProject[]> = { error: mockError, status: 500 };
            mockDialecticApi.listProjects.mockResolvedValue(mockResponse);

            const { fetchDialecticProjects } = useDialecticStore.getState();
            await fetchDialecticProjects();

            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.projectsError).toEqual(mockError);
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should set loading state during fetchProjects', async () => {
            mockDialecticApi.listProjects.mockReturnValue(new Promise(() => {})); 
            const { fetchDialecticProjects } = useDialecticStore.getState();
            fetchDialecticProjects();
            const state = useDialecticStore.getState();
            expect(state.isLoadingProjects).toBe(true);
            expect(state.projectsError).toBeNull();
        });

        it('should set network error state if listProjects API call throws', async () => {
            const networkErrorMessage = 'Connection Timeout';
            mockDialecticApi.listProjects.mockRejectedValue(new Error(networkErrorMessage));

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
            selected_domain_tag: projectPayload.selectedDomainTag !== undefined ? projectPayload.selectedDomainTag : null,
            user_id: 'user1',
            repo_url: null,
            status: 'active',
            created_at: '2023-01-01T00:00:00.000Z', // Example ISO string
            updated_at: '2023-01-01T00:00:00.000Z', // Example ISO string
            // Ensure all required fields of DialecticProject are present
        };

        it('should create a project and refetch projects list on success', async () => {
            const createResponse: ApiResponse<DialecticProject> = { data: mockCreatedProject, status: 201 };
            mockDialecticApi.createProject.mockResolvedValue(createResponse);

            // Adjust mock for the fetchDialecticProjects call
            const fetchResponse: ApiResponse<DialecticProject[]> = { data: [mockCreatedProject], status: 200 };
            mockDialecticApi.listProjects.mockResolvedValueOnce(fetchResponse); // Simulate listProjects returning the new project

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.createProjectError).toBeNull();
            expect(state.projects).toEqual([mockCreatedProject]); // Expect the fetched project
            expect(result.data).toEqual(mockCreatedProject);
            expect(result.status).toBe(201);
            expect(mockDialecticApi.createProject).toHaveBeenCalledWith(projectPayload);
            expect(mockDialecticApi.listProjects).toHaveBeenCalledTimes(1);
        });

        it('should create a project with a specific selected_domain_tag and refetch', async () => {
            const projectPayloadWithTag: CreateProjectPayload = {
                projectName: 'Tagged Project',
                initialUserPrompt: 'A prompt for a tagged project',
                selectedDomainTag: 'software_testing',
            };
            const mockCreatedTaggedProject: DialecticProject = {
                id: 'newTaggedProjId',
                project_name: projectPayloadWithTag.projectName,
                initial_user_prompt: projectPayloadWithTag.initialUserPrompt,
                selected_domain_tag: projectPayloadWithTag.selectedDomainTag !== undefined ? projectPayloadWithTag.selectedDomainTag : null,
                user_id: 'user1',
                repo_url: null,
                status: 'active',
                created_at: '2023-01-02T00:00:00.000Z',
                updated_at: '2023-01-02T00:00:00.000Z',
            };
            const createResponse: ApiResponse<DialecticProject> = { data: mockCreatedTaggedProject, status: 201 };
            mockDialecticApi.createProject.mockResolvedValue(createResponse);

            // Adjust mock for the fetchDialecticProjects call
            const fetchResponse: ApiResponse<DialecticProject[]> = { data: [mockCreatedTaggedProject], status: 200 };
            mockDialecticApi.listProjects.mockResolvedValueOnce(fetchResponse); // Simulate listProjects returning the new project

            const { createDialecticProject } = useDialecticStore.getState();
            const result = await createDialecticProject(projectPayloadWithTag);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.createProjectError).toBeNull();
            expect(state.projects).toEqual([mockCreatedTaggedProject]); // Expect the fetched project
            expect(result.data).toEqual(mockCreatedTaggedProject);
            expect(result.status).toBe(201);
            expect(mockDialecticApi.createProject).toHaveBeenCalledWith(projectPayloadWithTag);
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
            mockDialecticApi.createProject.mockReturnValue(new Promise(() => {}));
            const { createDialecticProject } = useDialecticStore.getState();
            createDialecticProject(projectPayload);
            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(true);
            expect(state.createProjectError).toBeNull();
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
}); 