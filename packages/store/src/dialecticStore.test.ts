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
  ContributionContentSignedUrlResponse
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
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    let mockDialecticApi: ReturnType<typeof getMockDialecticClient>;

    beforeEach(() => {
        resetApiMock(); // Resets all mocks defined in @paynless/api/mocks
        mockDialecticApi = getMockDialecticClient(); // Get a reference to the dialectic specific mocks
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks(); // resetApiMock should handle this for the api calls
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
            expect(state.contributionContentCache).toEqual(initialDialecticStateValues.contributionContentCache);
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

    describe('fetchContributionContent action', () => {
        const testContributionId = 'contrib-123';
        const mockSignedUrl = 'https://example.com/signed-url-for-contrib-123';
        const mockContent = 'This is the fetched content.';
        const mockMimeType = 'text/plain';
        const mockSizeBytes = mockContent.length;
        const fourteenMinutesInMs = 14 * 60 * 1000;

        beforeEach(() => {
            vi.useFakeTimers();
            global.fetch = vi.fn(); // Mock global fetch
        });

        afterEach(() => {
            vi.runOnlyPendingTimers();
            vi.useRealTimers();
        });

        it('should fetch signed URL and content if not cached', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: { signedUrl: mockSignedUrl, mimeType: mockMimeType, sizeBytes: mockSizeBytes },
                status: 200,
            });
            (global.fetch as Mock<any, any>).mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            });

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];

            expect(mockDialecticApi.getContributionContentSignedUrl).toHaveBeenCalledWith(testContributionId);
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.content).toBe(mockContent);
            expect(cacheEntry.signedUrl).toBe(mockSignedUrl);
            expect(cacheEntry.mimeType).toBe(mockMimeType);
            expect(cacheEntry.sizeBytes).toBe(mockSizeBytes);
            expect(cacheEntry.error).toBeUndefined();
            expect(cacheEntry.expiry).toBeCloseTo(Date.now() + fourteenMinutesInMs);
        });

        it('should use cached signed URL if valid and fetch content', async () => {
            const initialTime = Date.now();
            vi.setSystemTime(initialTime);

            // Pre-populate cache with a valid signed URL
            useDialecticStore.setState(prevState => ({
                contributionContentCache: {
                    ...prevState.contributionContentCache,
                    [testContributionId]: {
                        signedUrl: mockSignedUrl,
                        mimeType: mockMimeType,
                        sizeBytes: mockSizeBytes,
                        expiry: initialTime + fourteenMinutesInMs,
                        isLoading: false,
                    },
                },
            }));

            (global.fetch as Mock<any, any>).mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            });

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];

            expect(mockDialecticApi.getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            expect(cacheEntry.content).toBe(mockContent);
            expect(cacheEntry.isLoading).toBe(false);
        });

        it('should not fetch if content is cached and not expired', async () => {
            const initialTime = Date.now();
            vi.setSystemTime(initialTime);
            
            useDialecticStore.setState(prevState => ({
                contributionContentCache: {
                    ...prevState.contributionContentCache,
                    [testContributionId]: {
                        signedUrl: mockSignedUrl,
                        content: mockContent,
                        mimeType: mockMimeType,
                        sizeBytes: mockSizeBytes,
                        expiry: initialTime + fourteenMinutesInMs, // Not expired
                        isLoading: false,
                    },
                },
            }));

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            expect(mockDialecticApi.getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
            const state = useDialecticStore.getState();
            expect(state.contributionContentCache[testContributionId].isLoading).toBe(false); // Ensure isLoading is false
        });

        it('should re-fetch signed URL and content if URL is expired', async () => {
            const initialTime = Date.now();
            vi.setSystemTime(initialTime);

            useDialecticStore.setState(prevState => ({
                contributionContentCache: {
                    ...prevState.contributionContentCache,
                    [testContributionId]: {
                        signedUrl: 'expired-url',
                        content: 'stale-content',
                        expiry: initialTime - 1000, // Expired
                        isLoading: false,
                    },
                },
            }));

            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: { signedUrl: mockSignedUrl, mimeType: mockMimeType, sizeBytes: mockSizeBytes },
                status: 200,
            });
            (global.fetch as Mock<any, any>).mockResolvedValueOnce({
                ok: true,
                text: async () => mockContent,
            });

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(mockDialecticApi.getContributionContentSignedUrl).toHaveBeenCalledWith(testContributionId);
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            expect(cacheEntry.content).toBe(mockContent);
        });

        it('should handle error when fetching signed URL', async () => {
            const apiError: ApiError = { code: 'FETCH_ERROR', message: 'Failed to get URL' };
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                error: apiError,
                status: 500,
            });

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toBe(apiError.message);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle error when fetching content from URL', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: { signedUrl: mockSignedUrl, mimeType: mockMimeType, sizeBytes: mockSizeBytes },
                status: 200,
            });
            (global.fetch as Mock<any, any>).mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toBe('Failed to fetch content: 403 Forbidden');
        });

        it('should set isLoading correctly during operations', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockImplementationOnce(() => {
                // Check loading state after API call starts but before it resolves
                const stateBeforeApiResolve = useDialecticStore.getState();
                expect(stateBeforeApiResolve.contributionContentCache[testContributionId]?.isLoading).toBe(true);
                return Promise.resolve({ 
                    data: { signedUrl: mockSignedUrl, mimeType: mockMimeType, sizeBytes: mockSizeBytes }, 
                    status: 200 
                });
            });

            (global.fetch as Mock<any, any>).mockImplementationOnce(async () => {
                // Check loading state after fetch starts but before it resolves
                const stateBeforeFetchResolve = useDialecticStore.getState();
                expect(stateBeforeFetchResolve.contributionContentCache[testContributionId]?.isLoading).toBe(true);
                return { ok: true, text: async () => mockContent };
            });
            
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(testContributionId);

            const finalState = useDialecticStore.getState();
            expect(finalState.contributionContentCache[testContributionId]?.isLoading).toBe(false);
        });
    });

    // --- Tests for fetchContributionContent ---
    describe('fetchContributionContent thunk', () => {
        const contributionId = 'contrib123';
        const mockSignedUrlResponse: ContributionContentSignedUrlResponse = {
            signedUrl: 'https://example.com/signed-url',
            mimeType: 'text/plain',
            sizeBytes: 100,
        };
        const mockContent = 'This is the test content.';

        beforeEach(() => {
            vi.useFakeTimers();
            // Mock global fetch before each test in this describe block
            global.fetch = vi.fn() as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>;
        });

        afterEach(() => {
            vi.runOnlyPendingTimers();
            vi.useRealTimers();
            // No need to restoreAllMocks for global.fetch if it's re-assigned in beforeEach
        });

        it('should first fetch signed URL, then content, and update cache', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: mockSignedUrlResponse,
                status: 200,
            });
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockResolvedValueOnce(
                new Response(mockContent, { 
                    status: 200, 
                    headers: { 'Content-Type': mockSignedUrlResponse.mimeType || 'text/plain' } 
                })
            );

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];

            expect(mockDialecticApi.getContributionContentSignedUrl).toHaveBeenCalledWith(contributionId);
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrlResponse.signedUrl);
            expect(cacheEntry).toBeDefined();
            expect(cacheEntry?.isLoading).toBe(false);
            expect(cacheEntry?.error).toBeUndefined();
            expect(cacheEntry?.signedUrl).toBe(mockSignedUrlResponse.signedUrl);
            expect(cacheEntry?.mimeType).toBe(mockSignedUrlResponse.mimeType);
            expect(cacheEntry?.sizeBytes).toBe(mockSignedUrlResponse.sizeBytes);
            expect(cacheEntry?.content).toBe(mockContent);
            expect(cacheEntry?.expiry).toBeGreaterThan(Date.now());

            vi.advanceTimersByTime(14 * 60 * 1000 + 1000);
            
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: { ...mockSignedUrlResponse, signedUrl: 'https://example.com/signed-url-new' },
                status: 200,
            });
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockResolvedValueOnce(
                new Response('new content', { 
                    status: 200, 
                    headers: { 'Content-Type': mockSignedUrlResponse.mimeType || 'text/plain' } 
                })
            );

            await fetchContributionContent(contributionId);
            const updatedState = useDialecticStore.getState();
            const updatedCacheEntry = updatedState.contributionContentCache[contributionId];

            expect(mockDialecticApi.getContributionContentSignedUrl).toHaveBeenCalledTimes(2);
            expect(global.fetch).toHaveBeenCalledTimes(2);
            expect((global.fetch as Mock<any,any>).mock.calls[1][0]).toBe('https://example.com/signed-url-new');
            expect(updatedCacheEntry?.content).toBe('new content');
        });

        it('should use cached signed URL if valid and content not present', async () => {
            const initialExpiry = Date.now() + 10 * 60 * 1000;
            useDialecticStore.setState(state => ({
                contributionContentCache: {
                    ...state.contributionContentCache,
                    [contributionId]: {
                        signedUrl: mockSignedUrlResponse.signedUrl,
                        mimeType: mockSignedUrlResponse.mimeType,
                        sizeBytes: mockSignedUrlResponse.sizeBytes,
                        expiry: initialExpiry,
                        isLoading: false,
                    }
                }
            }));
        
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockResolvedValueOnce(
                new Response(mockContent, { 
                    status: 200, 
                    headers: { 'Content-Type': mockSignedUrlResponse.mimeType || 'text/plain' } 
                })
            );
        
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
        
            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];
        
            expect(mockDialecticApi.getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrlResponse.signedUrl);
            expect(cacheEntry?.content).toBe(mockContent);
            expect(cacheEntry?.isLoading).toBe(false);
        });

        it('should use cached content if valid and not expired', async () => {
            const initialExpiry = Date.now() + 10 * 60 * 1000;
            useDialecticStore.setState(state => ({
                contributionContentCache: {
                    ...state.contributionContentCache,
                    [contributionId]: {
                        signedUrl: mockSignedUrlResponse.signedUrl,
                        mimeType: mockSignedUrlResponse.mimeType,
                        sizeBytes: mockSignedUrlResponse.sizeBytes,
                        content: mockContent,
                        expiry: initialExpiry,
                        isLoading: false,
                    }
                }
            }));
                
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
                
            expect(mockDialecticApi.getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
            const state = useDialecticStore.getState();
            expect(state.contributionContentCache[contributionId]?.isLoading).toBe(false);
            expect(state.contributionContentCache[contributionId]?.content).toBe(mockContent);
        });

        it('should handle API error when fetching signed URL', async () => {
            const apiError: ApiError = { code: 'API_ERROR', message: 'Failed to fetch signed URL' };
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({ error: apiError, status: 500 });
        
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
        
            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];
        
            expect(cacheEntry?.isLoading).toBe(false);
            expect(cacheEntry?.error).toBe(apiError.message);
            expect(cacheEntry?.content).toBeUndefined();
            expect(global.fetch).not.toHaveBeenCalled();
        });
        
        it('should handle network error when fetching signed URL (rejected promise)', async () => {
            const networkErrorMessage = 'Network connection failed';
            mockDialecticApi.getContributionContentSignedUrl.mockRejectedValueOnce(new Error(networkErrorMessage));
        
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
        
            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];
        
            expect(cacheEntry?.isLoading).toBe(false);
            expect(cacheEntry?.error).toBe(networkErrorMessage);
            expect(cacheEntry?.content).toBeUndefined();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle error when fetching content from signed URL', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: mockSignedUrlResponse,
                status: 200,
            });
            const fetchErrorMessage = 'Forbidden';
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockResolvedValueOnce(
                new Response(fetchErrorMessage, { 
                    status: 403, 
                    statusText: fetchErrorMessage 
                })
            );
        
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
        
            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];
        
            expect(cacheEntry?.isLoading).toBe(false);
            expect(cacheEntry?.error).toContain(fetchErrorMessage);
            expect(cacheEntry?.content).toBeUndefined();
        });

        it('should handle network error when fetching content from signed URL (fetch rejects)', async () => {
            mockDialecticApi.getContributionContentSignedUrl.mockResolvedValueOnce({
                data: mockSignedUrlResponse,
                status: 200,
            });
            const fetchNetworkErrorMessage = 'Simulated network failure during fetch';
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockRejectedValueOnce(new Error(fetchNetworkErrorMessage));

            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[contributionId];

            expect(cacheEntry?.isLoading).toBe(false);
            expect(cacheEntry?.error).toBe(fetchNetworkErrorMessage); 
            expect(cacheEntry?.content).toBeUndefined();
        });

        it('should set isLoading correctly during operations and clear previous error', async () => {
            const initialError = "Previous error";
            useDialecticStore.setState(state => ({
                contributionContentCache: {
                    ...state.contributionContentCache,
                    [contributionId]: {
                        isLoading: false,
                        error: initialError,
                    }
                }
            }));
            
            let checkedLoadingDuringApiCall = false;
            let checkedLoadingDuringFetch = false;

            mockDialecticApi.getContributionContentSignedUrl.mockImplementationOnce(async () => {
                const stateBeforeApiResolve = useDialecticStore.getState();
                expect(stateBeforeApiResolve.contributionContentCache[contributionId]?.isLoading).toBe(true);
                expect(stateBeforeApiResolve.contributionContentCache[contributionId]?.error).toBeUndefined();
                checkedLoadingDuringApiCall = true;
                return { data: mockSignedUrlResponse, status: 200 };
            });
        
            (global.fetch as Mock<[RequestInfo | URL, RequestInit | undefined], Promise<Response>>).mockImplementationOnce(async () => {
                const stateBeforeFetchResolve = useDialecticStore.getState();
                expect(stateBeforeFetchResolve.contributionContentCache[contributionId]?.isLoading).toBe(true);
                checkedLoadingDuringFetch = true;
                return new Response(mockContent, { 
                    status: 200, 
                    headers: { 'Content-Type': mockSignedUrlResponse.mimeType || 'text/plain' } 
                });
            });
        
            const { fetchContributionContent } = useDialecticStore.getState();
            await fetchContributionContent(contributionId);
        
            const finalState = useDialecticStore.getState();
            expect(finalState.contributionContentCache[contributionId]?.isLoading).toBe(false);
            expect(finalState.contributionContentCache[contributionId]?.content).toBe(mockContent);
            expect(finalState.contributionContentCache[contributionId]?.error).toBeUndefined();
            expect(checkedLoadingDuringApiCall).toBe(true);
            expect(checkedLoadingDuringFetch).toBe(true);
        });
    });
}); 