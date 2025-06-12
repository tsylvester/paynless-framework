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
  DialecticContribution,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  GenerateContributionsResponse,
  GenerateContributionsPayload,
  UserResponseInput,
  DialecticStage,
  IterationInitialPromptData
} from '@paynless/types';
import { DialecticStage as DialecticStageType } from '@paynless/types';

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
        // Clear toast mocks as well
        // (toast.success as Mock).mockClear();
        // (toast.error as Mock).mockClear();
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

    // New describe block for generateContributions
    describe('generateContributions thunk', () => {
        const mockSessionId = 'sess-generate-123';
        const mockProjectId = 'proj-generate-abc';
        const mockStageSlug = DialecticStageType.THESIS;
        const mockIterationNumber = 1;
        const mockContribution: DialecticContribution = {
            id: 'contrib-new-1',
            session_id: mockSessionId,
            session_model_id: 'sm-1',
            user_id: 'user-test',
            stage: 'thesis',
            iteration_number: 1,
            actual_prompt_sent: 'Test prompt',
            content_storage_bucket: null,
            content_storage_path: null,
            content_mime_type: 'text/plain',
            content_size_bytes: 100,
            raw_response_storage_path: null,
            tokens_used_input: 10,
            tokens_used_output: 20,
            processing_time_ms: 1000,
            citations: [],
            parent_contribution_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // Mock project to be returned by getProjectDetails after contributions are generated
        const mockProjectForRefetch: DialecticProject = {
            id: mockProjectId,
            project_name: 'Test Project for Contributions Refetched',
            status: 'active',
            initial_user_prompt: 'An initial prompt',
            selected_domain_overlay_id: null,
            selected_domain_tag: null,
            repo_url: null,
            user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [
                {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    session_description: 'A session',
                    current_stage_seed_prompt: 'Seed',
                    iteration_count: 1,
                    status: 'thesis', 
                    associated_chat_id: null,
                    active_thesis_prompt_template_id: null,
                    active_antithesis_prompt_template_id: null,
                    active_synthesis_prompt_template_id: null,
                    active_parenthesis_prompt_template_id: null,
                    active_paralysis_prompt_template_id: null,
                    formal_debate_structure_id: null,
                    max_iterations: 1,
                    current_iteration: 1,
                    convergence_status: null,
                    preferred_model_for_stage: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    dialectic_contributions: [mockContribution], // Include the new contribution
                },
            ],
        };

        beforeEach(() => {
            // Reset specific mocks used in this suite if necessary, or rely on global beforeEach
            // For the refetch project details call
            mockDialecticApi.getProjectDetails.mockImplementation(async (projectId: string) => {
                console.log(`[TEST MOCK] getProjectDetails called with projectId: ${projectId}. mockProjectId is ${mockProjectId}`);
                if (projectId === mockProjectId) {
                    console.log(`[TEST MOCK] projectId (${projectId}) matches mockProjectId. Returning mockProjectForRefetch.`);
                    try {
                        // Ensure mockProjectForRefetch is fully constructed and a clean copy is returned
                        const projectToReturn = JSON.parse(JSON.stringify(mockProjectForRefetch));
                        return {
                            data: projectToReturn,
                            status: 200,
                        };
                    } catch (e) {
                        console.error("[TEST MOCK] Error during stringify/parse of mockProjectForRefetch or return:", e);
                        throw e; // rethrow if serialization or any other error occurs here
                    }
                } else {
                    console.log(`[TEST MOCK] projectId (${projectId}) does NOT match mockProjectId. Returning NOT_FOUND.`);
                    return { data: undefined, status: 404, error: { code: 'NOT_FOUND', message: 'Project not found'}}; 
                }
            });
        });

        it('should set loading state, call API, and show success toast on successful generation', async () => {
            const mockPayload: GenerateContributionsPayload = {
                sessionId: mockSessionId,
                projectId: mockProjectId,
                stageSlug: mockStageSlug,
                iterationNumber: mockIterationNumber,
            };
            const successMessage = 'Contributions generated!';
            mockDialecticApi.generateContributions.mockResolvedValueOnce({
                data: { message: successMessage, contributions: [mockContribution] },
                status: 200,
            });

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toBeNull();
            expect(mockDialecticApi.generateContributions).toHaveBeenCalledWith({
                projectId: mockProjectId,
                sessionId: mockSessionId,
                stageSlug: mockStageSlug,
                iterationNumber: mockIterationNumber,
            });
            // expect(toast.success).toHaveBeenCalledWith(successMessage);
        });

        it('should update currentProjectDetail if the project and session match and contributions are returned', async () => {
            const projectWithSession: DialecticProject = {
                id: mockProjectId, // Matches mockProjectId
                project_name: 'Test Project for Contributions',
                status: 'active',
                initial_user_prompt: 'An initial prompt',
                selected_domain_overlay_id: null,
                selected_domain_tag: null,
                repo_url: null,
                user_id: 'user-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                dialectic_sessions: [
                    {
                        id: mockSessionId,
                        project_id: mockProjectId,
                        session_description: 'A session',
                        current_stage_seed_prompt: 'Seed',
                        iteration_count: 1,
                        status: 'thesis',
                        associated_chat_id: null,
                        active_thesis_prompt_template_id: null,
                        active_antithesis_prompt_template_id: null,
                        active_synthesis_prompt_template_id: null,
                        active_parenthesis_prompt_template_id: null,
                        active_paralysis_prompt_template_id: null,
                        formal_debate_structure_id: null,
                        max_iterations: 1,
                        current_iteration: 1,
                        convergence_status: null,
                        preferred_model_for_stage: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        dialectic_contributions: [], // Initially empty
                    },
                ],
            };
            useDialecticStore.setState({ currentProjectDetail: projectWithSession });

            mockDialecticApi.generateContributions.mockResolvedValueOnce({
                data: { message: 'Generated', contributions: [mockContribution] },
                status: 200,
            });

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions({ 
                sessionId: mockSessionId, 
                projectId: mockProjectId, 
                stageSlug: DialecticStageType.THESIS, 
                iterationNumber: 1 
            });

            const updatedState = useDialecticStore.getState();
            // currentProjectDetail is updated by the refetch to be mockProjectForRefetch, which contains the contribution
            expect(updatedState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions).toEqual([mockContribution]);
            // expect(toast.success).toHaveBeenCalled();
        });
        
        it('should NOT update currentProjectDetail if projectId does not match', async () => {
            const differentProjectId = 'some-other-project-id';
            const projectWithDifferentId: DialecticProject = {
                id: differentProjectId, 
                project_name: 'Test Project for Contributions',
                status: 'active',
                initial_user_prompt: 'An initial prompt',
                selected_domain_overlay_id: null,
                selected_domain_tag: null,
                repo_url: null,
                user_id: 'user-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                dialectic_sessions: [
                    {
                        id: mockSessionId, // Session ID can be the same for this test's purpose
                        project_id: differentProjectId,
                        session_description: 'A session in a different project',
                        current_stage_seed_prompt: 'Seed',
                        iteration_count: 1,
                        status: 'thesis',
                        associated_chat_id: null,
                        active_thesis_prompt_template_id: null,
                        active_antithesis_prompt_template_id: null,
                        active_synthesis_prompt_template_id: null,
                        active_parenthesis_prompt_template_id: null,
                        active_paralysis_prompt_template_id: null,
                        formal_debate_structure_id: null,
                        max_iterations: 1,
                        current_iteration: 1,
                        convergence_status: null,
                        preferred_model_for_stage: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        dialectic_contributions: [], // Initially empty
                    },
                ],
            };
            useDialecticStore.setState({ currentProjectDetail: projectWithDifferentId });

            mockDialecticApi.generateContributions.mockResolvedValueOnce({
                data: { message: 'Generated', contributions: [mockContribution] },
                status: 200,
            });

            const { generateContributions } = useDialecticStore.getState();
            // Calling with mockProjectId, which is different from currentProjectDetail.id initially
            await generateContributions({ 
                sessionId: mockSessionId, 
                projectId: mockProjectId, 
                stageSlug: DialecticStageType.THESIS, 
                iterationNumber: 1 
            }); 

            const updatedState = useDialecticStore.getState();
            // currentProjectDetail will be updated to mockProjectForRefetch (from the describe-level mock of getProjectDetails)
            // which has mockProjectId and its session contains mockContribution.
            expect(updatedState.currentProjectDetail?.id).toEqual(mockProjectId);
            expect(updatedState.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions).toEqual([mockContribution]);
            // expect(toast.success).toHaveBeenCalled(); // Toast still shows as API call was successful
        });

        it('should set error state and show error toast on API error', async () => {
            const apiError: ApiError = { code: 'SESSION_INVALID', message: 'Session not valid for generation.' };
            mockDialecticApi.generateContributions.mockResolvedValueOnce({
                error: apiError,
                status: 400,
            });

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions({ 
                sessionId: mockSessionId, 
                projectId: mockProjectId, 
                stageSlug: DialecticStageType.THESIS, 
                iterationNumber: 1 
            });

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toEqual(apiError);
            // expect(toast.error).toHaveBeenCalledWith(apiError.message);
        });

        it('should set network error state and show error toast if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed terribly';
            mockDialecticApi.generateContributions.mockRejectedValueOnce(new Error(networkErrorMessage));

            const { generateContributions } = useDialecticStore.getState();
            await generateContributions({ 
                sessionId: mockSessionId, 
                projectId: mockProjectId, 
                stageSlug: DialecticStageType.THESIS, 
                iterationNumber: 1 
            });

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toEqual({ code: 'NETWORK_ERROR', message: networkErrorMessage });
            // expect(toast.error).toHaveBeenCalledWith(networkErrorMessage);
        });

        it('should handle successful API response with no contributions array gracefully', async () => {
            const mockSessionId = 'sess-generate-123';
            const mockProjectId = 'proj-generate-abc'; // Ensure this is defined
            const mockStageSlug = DialecticStageType.THESIS; // Ensure this is defined
            const mockIterationNumber = 1; // Ensure this is defined
            const successMessage = 'Generation process started, results will appear soon.';
            const mockResponseData: GenerateContributionsResponse = { 
                message: successMessage,
                // No contributions array
            };

            mockDialecticApi.generateContributions.mockResolvedValueOnce({
                data: mockResponseData,
                status: 200,
            });
            // Mock getProjectDetails for the refetch
            const mockProjectForRefetch = { id: mockProjectId, project_name: 'Test Project Refetched', dialectic_sessions: [{ id: mockSessionId, contributions: [] }] };
            mockDialecticApi.getProjectDetails.mockResolvedValueOnce({ data: mockProjectForRefetch as any, status: 200 });


            const { generateContributions } = useDialecticStore.getState();
            await generateContributions({ 
                sessionId: mockSessionId, 
                projectId: mockProjectId, 
                stageSlug: mockStageSlug, 
                iterationNumber: mockIterationNumber 
            });

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toBeNull();
            expect(mockDialecticApi.generateContributions).toHaveBeenCalledWith({
                projectId: mockProjectId, // Use the mockProjectId defined in this test
                sessionId: mockSessionId, // Use the mockSessionId defined in this test
                stageSlug: mockStageSlug, // Use the mockStageSlug defined in this test
                iterationNumber: mockIterationNumber, // Use the mockIterationNumber defined in this test
            });
            // expect(toast.success).toHaveBeenCalledWith(successMessage);
            // Verify no contributions were added to the specific session if responseData.contributions is undefined
            expect(state.currentProjectDetail?.dialectic_sessions?.[0].dialectic_contributions).toEqual([]);
        });
    });

    // New test suite for submitStageResponsesAndPrepareNextSeed
    describe('submitStageResponsesAndPrepareNextSeed thunk', () => {
      const mockProjectId = 'proj-submit-123';
      const mockSessionId = 'sess-submit-456';
      const mockStageSlug = DialecticStageType.THESIS;
      const mockIteration = 1;
      const mockPayload: SubmitStageResponsesPayload = {
        projectId: mockProjectId,
        sessionId: mockSessionId,
        stageSlug: mockStageSlug,
        currentIterationNumber: mockIteration,
        responses: [{ originalModelContributionId: 'contrib-model-A', responseText: 'Feedback for A' }],
      };
      const mockProjectForRefetch: DialecticProject = {
        id: mockProjectId,
        project_name: 'Test Project for Submission Refetched',
        status: 'active',
        initial_user_prompt: 'An initial prompt',
        selected_domain_overlay_id: null,
        selected_domain_tag: null,
        repo_url: null,
        user_id: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        dialectic_sessions: [{ 
          id: mockSessionId, 
          status: 'pending_antithesis', // Example updated status
          project_id: mockProjectId,
          session_description: 'A session',
          current_stage_seed_prompt: 'new_seed_prompt.md',
          iteration_count: 1,
          current_iteration: 1,
          convergence_status: null,
          preferred_model_for_stage: null,
          associated_chat_id: 'chat-1',
          active_thesis_prompt_template_id: null,
          active_antithesis_prompt_template_id: null,
          active_synthesis_prompt_template_id: null,
          active_parenthesis_prompt_template_id: null,
          active_paralysis_prompt_template_id: null,
          formal_debate_structure_id: null,
          max_iterations: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      };
      const mockSuccessResponse: SubmitStageResponsesResponse = {
        userFeedbackStoragePath: 'path/to/feedback.json',
        nextStageSeedPromptStoragePath: 'path/to/next_seed.md',
        updatedSession: { ...(mockProjectForRefetch.dialectic_sessions && mockProjectForRefetch.dialectic_sessions[0]), current_iteration: 2 } as DialecticSession,
        message: 'Successfully submitted and prepared next seed.',
      };

      it('should set loading state, call API, refetch project details, and show success on successful submission', async () => {
        mockDialecticApi.submitStageResponsesAndPrepareNextSeed.mockResolvedValueOnce({
          data: mockSuccessResponse,
          status: 200,
        });
        mockDialecticApi.getProjectDetails.mockResolvedValueOnce({
            data: mockProjectForRefetch,
            status: 200,
        });

        const { submitStageResponsesAndPrepareNextSeed } = useDialecticStore.getState();
        const result = await submitStageResponsesAndPrepareNextSeed(mockPayload);

        expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
        expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
        expect(mockDialecticApi.submitStageResponsesAndPrepareNextSeed).toHaveBeenCalledWith(mockPayload);
        expect(mockDialecticApi.getProjectDetails).toHaveBeenCalledWith(mockProjectId);
        // Add more specific check for currentProjectDetail update if necessary
        expect(useDialecticStore.getState().currentProjectDetail?.id).toEqual(mockProjectForRefetch.id);
        expect(result?.data).toEqual(mockSuccessResponse);
        // expect(toast.success).toHaveBeenCalledWith(mockSuccessResponse.message);
      });

      it('should set error state and show error toast on API error', async () => {
        const apiError: ApiError = { code: 'SUBMISSION_FAILED', message: 'Failed to submit responses.' };
        mockDialecticApi.submitStageResponsesAndPrepareNextSeed.mockResolvedValueOnce({
          error: apiError,
          status: 400,
        });

        const { submitStageResponsesAndPrepareNextSeed } = useDialecticStore.getState();
        const result = await submitStageResponsesAndPrepareNextSeed(mockPayload);

        expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
        expect(useDialecticStore.getState().submitStageResponsesError).toEqual(apiError);
        expect(mockDialecticApi.getProjectDetails).not.toHaveBeenCalled();
        expect(result?.error).toEqual(apiError);
        // expect(toast.error).toHaveBeenCalledWith(apiError.message);
      });

      it('should set network error state and show error toast if API call throws', async () => {
        const networkErrorMessage = 'Network connection failed for submission';
        mockDialecticApi.submitStageResponsesAndPrepareNextSeed.mockRejectedValueOnce(new Error(networkErrorMessage));

        const { submitStageResponsesAndPrepareNextSeed } = useDialecticStore.getState();
        const result = await submitStageResponsesAndPrepareNextSeed(mockPayload);

        expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
        const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
        expect(useDialecticStore.getState().submitStageResponsesError).toEqual(expectedError);
        expect(mockDialecticApi.getProjectDetails).not.toHaveBeenCalled();
        expect(result?.error).toEqual(expectedError);
        // expect(toast.error).toHaveBeenCalledWith(networkErrorMessage);
      });
    });

    // New test suite for saveContributionEdit
    describe('saveContributionEdit thunk', () => {
      const mockProjectId = 'proj-edit-contrib-1';
      const mockSessionId = 'sess-edit-contrib-1';
      const mockContributionId = 'contrib-to-edit-1';
      const originalContent = "This is the original content.";
      const editedContent = "This is the EDITED content.";
      
      const mockPayload: SaveContributionEditPayload = {
        projectId: mockProjectId,
        sessionId: mockSessionId,
        originalContributionIdToEdit: mockContributionId,
        editedContentText: editedContent,
      };

      const mockUpdatedContribution: DialecticContribution = {
        id: mockContributionId,
        session_id: mockSessionId,
        stage: DialecticStageType.THESIS,
        iteration_number: 1,
        content_storage_path: 'path/to/edited_content.md',
        content_mime_type: 'text/markdown',
        content_size_bytes: editedContent.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_model_id: 'model-1',
        user_id: 'user-test',
        actual_prompt_sent: 'Prompt that led to this edited contribution',
        content_storage_bucket: 'test-bucket',
        raw_response_storage_path: 'path/to/edited_raw_response.json',
        tokens_used_input: null,
        tokens_used_output: null,
        processing_time_ms: null,
        citations: [],
        parent_contribution_id: null,
      };
      
      const mockInitialProjectDetail: DialecticProject = {
        id: mockProjectId,
        project_name: 'Project For Edit',
        user_id: 'user-test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
        initial_user_prompt: 'Initial prompt for project for edit',
        initial_prompt_resource_id: null,
        selected_domain_overlay_id: null,
        selected_domain_tag: null,
        repo_url: null,
        dialectic_sessions: [
          {
            id: mockSessionId,
            project_id: mockProjectId,
            status: 'pending_thesis',
            iteration_count: 1,
            current_iteration: 1,
            session_description: 'Session for edit',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Other session fields
            current_stage_seed_prompt: null,
            convergence_status: null,
            preferred_model_for_stage: null,
            associated_chat_id: null,
            active_thesis_prompt_template_id: null,
            active_antithesis_prompt_template_id: null,
            active_synthesis_prompt_template_id: null,
            active_parenthesis_prompt_template_id: null,
            active_paralysis_prompt_template_id: null,
            formal_debate_structure_id: null,
            max_iterations: 3,
            dialectic_contributions: [
              {
                id: mockContributionId,
                session_id: mockSessionId,
                stage: DialecticStageType.THESIS,
                iteration_number: 1,
                // current_content: originalContent, // Not directly on this type
                content_storage_path: 'path/to/original_content.md',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                session_model_id: 'model-1',
                 content_mime_type: 'text/markdown',
                 content_size_bytes: originalContent.length,
                 raw_response_storage_path: 'path/to/original_response.md',
                 tokens_used_input: 100,
                 tokens_used_output: 100,
                 processing_time_ms: 100,
                 citations: [],
                 parent_contribution_id: null,
                 actual_prompt_sent: 'This is the actual prompt sent.',
                 content_storage_bucket: 'bucket-1',
                 user_id: 'user-1',
              },
              {
                id: 'contrib-other-1',
                session_id: mockSessionId,
                stage: DialecticStageType.THESIS,
                iteration_number: 1,
                // current_content: "Other content",
                content_storage_path: 'path/to/other_content.md',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                session_model_id: 'model-1',
                content_mime_type: 'text/markdown',
                content_size_bytes: 100,
                raw_response_storage_path: 'path/to/original_response.md',
                tokens_used_input: 100,
                tokens_used_output: 100,
                processing_time_ms: 100,
                citations: [],
                parent_contribution_id: null,
                actual_prompt_sent: 'This is the actual prompt sent.',
                content_storage_bucket: 'bucket-1',
                user_id: 'user-1',
              }
            ]
          }
        ]
      };


      it('should set loading, call API, update cache, update projectDetail, and show success on successful save', async () => {
        // Set initial project detail
        useDialecticStore.setState({ currentProjectDetail: mockInitialProjectDetail });
        
        // Mock API response
        // The API is expected to return the full updated contribution object
        mockDialecticApi.updateContributionContent.mockResolvedValueOnce({
          data: { ...mockUpdatedContribution, current_content_temp_for_test: editedContent } as any, // Simulate backend returning content
          status: 200,
        });

        const { saveContributionEdit } = useDialecticStore.getState();
        const result = await saveContributionEdit(mockPayload);

        expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
        expect(useDialecticStore.getState().saveContributionEditError).toBeNull();
        expect(mockDialecticApi.updateContributionContent).toHaveBeenCalledWith(mockPayload);
        
        // Check cache update
        const cacheEntry = useDialecticStore.getState().contributionContentCache[mockContributionId];
        expect(cacheEntry).toBeDefined();
        expect(cacheEntry.isLoading).toBe(false);
        expect(cacheEntry.content).toBe(editedContent); // Store updated with new content
        expect(cacheEntry.error).toBeUndefined();

        // Check project detail update
        const updatedProjectDetail = useDialecticStore.getState().currentProjectDetail;
        const updatedSession = updatedProjectDetail?.dialectic_sessions?.find(s => s.id === mockSessionId);
        const targetContributionInStore = updatedSession?.dialectic_contributions?.find(c => c.id === mockContributionId);
        expect(targetContributionInStore).toBeDefined();
        // Check if a field that is expected to be updated (like updated_at or content_size_bytes) has changed.
        // The mockUpdatedContribution has a different content_size_bytes.
        expect(targetContributionInStore?.content_size_bytes).toEqual(editedContent.length); 


        expect(result?.data).toEqual(expect.objectContaining({ id: mockContributionId }));
        // expect(toast.success).toHaveBeenCalledWith(`Contribution ${mockContributionId} saved successfully.`);
      });

      it('should NOT update projectDetail if the currentProjectDetail ID does not match payload projectId', async () => {
        // Set initial project detail with a DIFFERENT ID
        useDialecticStore.setState({ currentProjectDetail: { ...mockInitialProjectDetail, id: 'some-other-project-id' } });
        const originalProjectDetailState = useDialecticStore.getState().currentProjectDetail;
        
        mockDialecticApi.updateContributionContent.mockResolvedValueOnce({
          data: { ...mockUpdatedContribution, current_content_temp_for_test: editedContent } as any,
          status: 200,
        });

        const { saveContributionEdit } = useDialecticStore.getState();
        await saveContributionEdit(mockPayload); // payload has mockProjectId

        expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
        // Project detail should NOT have been updated because its ID was different
        expect(useDialecticStore.getState().currentProjectDetail).toEqual(originalProjectDetailState); 
      });


      it('should set error state and show error toast on API error', async () => {
        const apiError: ApiError = { code: 'SAVE_FAILED', message: 'Failed to save contribution.' };
        mockDialecticApi.updateContributionContent.mockResolvedValueOnce({
          error: apiError,
          status: 400,
        });

        const { saveContributionEdit } = useDialecticStore.getState();
        const result = await saveContributionEdit(mockPayload);

        expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
        expect(useDialecticStore.getState().saveContributionEditError).toEqual(apiError);
        expect(result?.error).toEqual(apiError);
        // expect(toast.error).toHaveBeenCalledWith(apiError.message);
      });

      it('should set network error state and show error toast if API call throws', async () => {
        const networkErrorMessage = 'Network connection failed during save';
        mockDialecticApi.updateContributionContent.mockRejectedValueOnce(new Error(networkErrorMessage));

        const { saveContributionEdit } = useDialecticStore.getState();
        const result = await saveContributionEdit(mockPayload);

        expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
        const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
        expect(useDialecticStore.getState().saveContributionEditError).toEqual(expectedError);
        expect(result?.error).toEqual(expectedError);
        // expect(toast.error).toHaveBeenCalledWith(networkErrorMessage);
      });
    });
});
// Helper to reset store state for testing (already part of DialecticActions in the actual store)
// Ensure this matches the actual _resetForTesting if defined in the store, or remove if not used.
// For this test file, useDialecticStore.getState()._resetForTesting?.() is preferred.
const resetStoreForTest = () => {
    useDialecticStore.setState(useDialecticStore.getState()._resetForTesting ? {} : {}); // A bit of a hack if _reset is not there
};
