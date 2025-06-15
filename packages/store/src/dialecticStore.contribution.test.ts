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
  DomainDescriptor,
  DialecticContribution,
  SubmitStageResponsesPayload,
  SubmitStageResponsesResponse,
  SaveContributionEditPayload,
  GenerateContributionsResponse,
  GenerateContributionsPayload,
  IterationInitialPromptData,
  DialecticStage,
} from '@paynless/types';

// We need to import the mock api object and helpers to use in the test
import { 
    api,
    resetApiMock,
} from '@paynless/api/mocks';

vi.mock('@paynless/api', async (importOriginal) => {
    const original = await importOriginal() as Record<string, unknown>;
    const { api } = await import('@paynless/api/mocks'); 
    return {
        ...original,
        api: vi.mocked(api, true), // Use deep mocking
        initializeApiClient: vi.fn(), 
    };
});

describe('useDialecticStore', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchContributionContent action', () => {
        const testContributionId = 'contrib-123';
        const mockSignedUrl = 'https://example.com/some-url';
        const mockContent = 'This is the test content.';

        it('should fetch signed URL and content if not cached', async () => {
            api.dialectic().getContributionContentSignedUrl.mockResolvedValue({
                data: { 
                signedUrl: mockSignedUrl, 
                mimeType: 'text/plain', 
                sizeBytes: 100 
            },
            status: 200
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockContent),
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];

            expect(api.dialectic().getContributionContentSignedUrl).toHaveBeenCalledWith(testContributionId);
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.content).toBe(mockContent);
        });

        it('should use cached signed URL if valid and fetch content', async () => {
            // ... (setup state with cached URL)
             useDialecticStore.setState({ 
                contributionContentCache: {
                    [testContributionId]: { 
                        signedUrl: mockSignedUrl, 
                        isLoading: false, 
                        content: undefined, 
                        error: undefined,
                        expiry: Date.now() + 10000, // Set a valid expiry
                    }
                }
            });
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockContent),
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            expect(api.dialectic().getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            const state = useDialecticStore.getState();
            expect(state.contributionContentCache[testContributionId].content).toBe(mockContent);
        });

        it('should not fetch if content is cached and not expired', async () => {
            useDialecticStore.setState({ 
                contributionContentCache: {
                    [testContributionId]: { 
                        signedUrl: mockSignedUrl, 
                        isLoading: false, 
                        content: mockContent, // Content is cached
                        error: undefined,
                        expiry: Date.now() + 10000, // Set a valid expiry
                    }
                }
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            expect(api.dialectic().getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should re-fetch signed URL and content if URL is expired', async () => {
            useDialecticStore.setState({ 
                contributionContentCache: {
                    [testContributionId]: { 
                        signedUrl: 'https://example.com/expired-url', 
                        isLoading: false, 
                        content: undefined, 
                        error: undefined,
                        expiry: Date.now() - 1000, // Set an expired expiry
                    }
                }
            });

            api.dialectic().getContributionContentSignedUrl.mockResolvedValue({
                data: { 
                signedUrl: mockSignedUrl, 
                mimeType: 'text/plain', 
                sizeBytes: 100 },
            status: 200
            });
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockContent),
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(api.dialectic().getContributionContentSignedUrl).toHaveBeenCalledWith(testContributionId);
            expect(global.fetch).toHaveBeenCalledWith(mockSignedUrl);
            expect(cacheEntry.content).toBe(mockContent);
        });

        it('should handle error when fetching signed URL', async () => {
            const apiError = { message: 'Failed to get URL', code: 'NETWORK_ERROR' };
            api.dialectic().getContributionContentSignedUrl.mockResolvedValue({
                error: apiError,
                status: 500,
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toBe(apiError.message);
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle error when fetching content from URL', async () => {
            api.dialectic().getContributionContentSignedUrl.mockResolvedValue({
                data: { 
                signedUrl: mockSignedUrl, 
                mimeType: 'text/plain', 
                sizeBytes: 100 },
            status: 200
            });
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            const state = useDialecticStore.getState();
            const cacheEntry = state.contributionContentCache[testContributionId];
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.error).toBe('Failed to fetch content: 403 Forbidden');
        });

        it('should set isLoading correctly during operations', async () => {
            let checkedLoading = false;
            api.dialectic().getContributionContentSignedUrl.mockImplementation(async () => {
                expect(useDialecticStore.getState().contributionContentCache[testContributionId].isLoading).toBe(true);
                checkedLoading = true;
                return { data: { signedUrl: mockSignedUrl, 
                mimeType: 'text/plain', 
                sizeBytes: 100 },
                status: 200
                };
            });
            global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('content') });
            
            await useDialecticStore.getState().fetchContributionContent(testContributionId);

            expect(checkedLoading).toBe(true);
            expect(useDialecticStore.getState().contributionContentCache[testContributionId].isLoading).toBe(false);
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
            api.dialectic().getContributionContentSignedUrl.mockResolvedValueOnce({
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

            expect(api.dialectic().getContributionContentSignedUrl).toHaveBeenCalledWith(contributionId);
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
            
            api.dialectic().getContributionContentSignedUrl.mockResolvedValueOnce({
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

            expect(api.dialectic().getContributionContentSignedUrl).toHaveBeenCalledTimes(2);
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
        
            expect(api.dialectic().getContributionContentSignedUrl).not.toHaveBeenCalled();
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
                
            expect(api.dialectic().getContributionContentSignedUrl).not.toHaveBeenCalled();
            expect(global.fetch).not.toHaveBeenCalled();
            const state = useDialecticStore.getState();
            expect(state.contributionContentCache[contributionId]?.isLoading).toBe(false);
            expect(state.contributionContentCache[contributionId]?.content).toBe(mockContent);
        });

        it('should handle API error when fetching signed URL', async () => {
            const apiError: ApiError = { code: 'API_ERROR', message: 'Failed to fetch signed URL' };
            api.dialectic().getContributionContentSignedUrl.mockResolvedValueOnce({ error: apiError, status: 500 });
        
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
            api.dialectic().getContributionContentSignedUrl.mockRejectedValueOnce(new Error(networkErrorMessage));
        
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
            api.dialectic().getContributionContentSignedUrl.mockResolvedValueOnce({
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
            api.dialectic().getContributionContentSignedUrl.mockResolvedValueOnce({
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

            api.dialectic().getContributionContentSignedUrl.mockImplementationOnce(async () => {
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
        const mockStageSlug = 'thesis';
        const mockIterationNumber = 1;
        const mockContribution: DialecticContribution = {
            id: 'contrib-new-1',
            session_id: mockSessionId,
            user_id: 'user-abc',
            stage: { 
                id: 'stage-1', 
                display_name: 'Thesis', 
                slug: 'thesis', 
                description: '', 
                created_at: '', 
                default_system_prompt_id: null, 
                expected_output_artifacts: null,
                input_artifact_rules: null,
            },
            iteration_number: mockIterationNumber,
            model_id: 'gpt-4',
            model_name: 'GPT-4',
            prompt_template_id_used: 'pt-123',
            seed_prompt_url: null,
            content_storage_bucket: 'test-bucket',
            content_storage_path: 'path/to/content',
            content_mime_type: 'text/plain',
            content_size_bytes: 1234,
            edit_version: 1,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: 'path/to/raw',
            target_contribution_id: null,
            tokens_used_input: 100,
            tokens_used_output: 200,
            processing_time_ms: 500,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const mockSuccessResponse: GenerateContributionsResponse = {
            message: 'Contributions generated successfully for thesis stage.',
            contributions: [mockContribution]
        };
        const mockGeneratePayload: GenerateContributionsPayload = {
            sessionId: mockSessionId,
            projectId: mockProjectId,
            iterationNumber: mockIterationNumber,
            stageSlug: mockStageSlug,
        };

        it('should call API with correct payload and update state on success', async () => {
            const mockApiResponse: ApiResponse<GenerateContributionsResponse> = { data: mockSuccessResponse, status: 200 };
            api.dialectic().generateContributions.mockResolvedValue(mockApiResponse);

            const { generateContributions } = useDialecticStore.getState();
            const result = await generateContributions(mockGeneratePayload);

            expect(api.dialectic().generateContributions).toHaveBeenCalledWith(mockGeneratePayload);
            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toBeNull();
            expect(result.data).toEqual(mockSuccessResponse);

            // Assuming successful generation should refetch project details to update contributions
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
        });

        it('should set error state if API returns an error', async () => {
            const mockError: ApiError = { code: 'GENERATION_FAILED', message: 'Failed to generate' };
            const mockApiResponse: ApiResponse<GenerateContributionsResponse> = { error: mockError, status: 500 };
            api.dialectic().generateContributions.mockResolvedValue(mockApiResponse);

            const { generateContributions } = useDialecticStore.getState();
            const result = await generateContributions(mockGeneratePayload);

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toEqual(mockError);
            expect(result.error).toEqual(mockError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set network error state if API call throws', async () => {
            const networkError = new Error('Network failure');
            api.dialectic().generateContributions.mockRejectedValue(networkError);

            const { generateContributions } = useDialecticStore.getState();
            const result = await generateContributions(mockGeneratePayload);

            const state = useDialecticStore.getState();
            expect(state.isGeneratingContributions).toBe(false);
            expect(state.generateContributionsError).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(result.error).toEqual({ message: networkError.message, code: 'NETWORK_ERROR' });
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
        });

        it('should set loading state during the generation process', async () => {
            const { generateContributions } = useDialecticStore.getState();
            const mockGeneratePayload = {
                sessionId: 'sess-generate-123',
                projectId: 'proj-generate-456',
                stageSlug: 'thesis' as DialecticStage['slug'],
                iterationNumber: 1,
            };

            const mockSuccessResponse: GenerateContributionsResponse = {
                message: 'Contributions generated successfully.',
                contributions: [],
            };

            let resolveGeneration: (value: ApiResponse<GenerateContributionsResponse>) => void;
            const generationPromise = new Promise<ApiResponse<GenerateContributionsResponse>>(resolve => {
                resolveGeneration = resolve;
            });
            
            api.dialectic().generateContributions.mockReturnValue(generationPromise);
            
            const generationCall = generateContributions(mockGeneratePayload);
            
            const stateBefore = useDialecticStore.getState();
            expect(stateBefore.isGeneratingContributions).toBe(true);

            resolveGeneration!({ data: mockSuccessResponse, status: 200 });

            await generationCall;

            const stateAfter = useDialecticStore.getState();
            expect(stateAfter.isGeneratingContributions).toBe(false);
        });
    });

    // New test suite for submitStageResponses
    describe('submitStageResponses thunk', () => {
        const mockProjectId = 'proj-submit-123';
        const mockSessionId = 'sess-submit-456';
        const mockStageSlug = 'thesis';
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
            repo_url: null,
            user_id: 'user-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            dialectic_sessions: [{ 
                id: mockSessionId, 
                status: 'pending_antithesis', // Example updated status
                project_id: mockProjectId,
                session_description: 'A session',
                current_stage_id: 'thesis',
                iteration_count: 1,
                dialectic_contributions: [],
                associated_chat_id: null,
                user_input_reference_url: null,
                selected_model_catalog_ids: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }],
            selected_domain_id: 'domain-1',
            domain_name: 'Domain 1',
        };
        const mockSuccessResponse: SubmitStageResponsesResponse = {
            userFeedbackStoragePath: 'path/to/feedback.json',
            nextStageSeedPromptStoragePath: 'path/to/next_seed.md',
            updatedSession: { ...(mockProjectForRefetch.dialectic_sessions && mockProjectForRefetch.dialectic_sessions[0]), current_iteration: 2 } as DialecticSession,
            message: 'Successfully submitted and prepared next seed.',
        };

        it('should set loading state, call API, refetch project details, and show success on successful submission', async () => {
            api.dialectic().submitStageResponses.mockResolvedValueOnce({
                data: mockSuccessResponse,
                status: 200,
            });
            api.dialectic().getProjectDetails.mockResolvedValueOnce({
                data: mockProjectForRefetch,
                status: 200,
            });

            const { submitStageResponses } = useDialecticStore.getState();
            const result = await submitStageResponses(mockPayload);

            expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
            expect(useDialecticStore.getState().submitStageResponsesError).toBeNull();
            expect(api.dialectic().submitStageResponses).toHaveBeenCalledWith(mockPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockProjectId);
            expect(useDialecticStore.getState().currentProjectDetail?.id).toEqual(mockProjectForRefetch.id);
            expect(result?.data).toEqual(mockSuccessResponse);
        });

        it('should set error state and show error toast on API error', async () => {
            const apiError: ApiError = { code: 'SUBMISSION_FAILED', message: 'Failed to submit responses.' };
            api.dialectic().submitStageResponses.mockResolvedValue({ error: apiError, status: 500 });
        
            const { submitStageResponses } = useDialecticStore.getState();
            const result = await submitStageResponses(mockPayload);
        
            expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
            expect(useDialecticStore.getState().submitStageResponsesError).toEqual(apiError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(apiError);
        });
        
        it('should set network error state and show error toast if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed for submission';
            api.dialectic().submitStageResponses.mockRejectedValue(new Error(networkErrorMessage));
        
            const { submitStageResponses } = useDialecticStore.getState();
            const result = await submitStageResponses(mockPayload);
        
            expect(useDialecticStore.getState().isSubmittingStageResponses).toBe(false);
            const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
            expect(useDialecticStore.getState().submitStageResponsesError).toEqual(expectedError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(expectedError);
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
            originalModelContributionId: mockContributionId,
            responseText: 'Feedback for A',
        };

        const mockNewContributionVersion: DialecticContribution = {
            id: 'contrib-1-v2',
            session_id: mockSessionId,
            stage: {
                id: 'stage-1',
                display_name: 'Thesis',
                slug: 'thesis',
                description: '',
                created_at: '',
                default_system_prompt_id: null,
                expected_output_artifacts: null,
                input_artifact_rules: null,
            },
            iteration_number: 1,
            content_storage_path: 'path/to/edited_content.md',
            content_mime_type: 'text/markdown',
            content_size_bytes: editedContent.length,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'user-test',
            content_storage_bucket: 'test-bucket',
            raw_response_storage_path: 'path/to/edited_raw_response.json',
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            citations: [],
            model_id: 'model-1',
            model_name: 'Model 1',
            prompt_template_id_used: 'pt-1',
            seed_prompt_url: 'https://example.com/seed-prompt',
            is_latest_edit: true,
            edit_version: 2,
            original_model_contribution_id: mockContributionId,
            target_contribution_id: null,
            error: null,
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
            selected_domain_id: 'domain-1',
            repo_url: null,
            domain_name: 'Domain 1',
            dialectic_sessions: [
                {
                    id: mockSessionId,
                    project_id: mockProjectId,
                    status: 'pending_thesis',
                    iteration_count: 1,
                    current_stage_id: 'thesis',
                    session_description: 'Session for edit',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    selected_model_catalog_ids: [],
                    user_input_reference_url: null,
                    associated_chat_id: null,
                    dialectic_contributions: [
                        {
                            id: mockContributionId, // The original contribution
                            session_id: mockSessionId,
                            stage: {
                                id: 'stage-1',
                                display_name: 'Thesis',
                                slug: 'thesis',
                                description: '',
                                created_at: '',
                                default_system_prompt_id: null,
                                expected_output_artifacts: null,
                                input_artifact_rules: null,
                            },
                            iteration_number: 1,
                            content_storage_path: 'path/to/original_content.md',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            content_mime_type: 'text/markdown',
                            content_size_bytes: originalContent.length,
                            raw_response_storage_path: 'path/to/original_response.md',
                            tokens_used_input: 100,
                            tokens_used_output: 100,
                            processing_time_ms: 100,
                            citations: [],
                            content_storage_bucket: 'bucket-1',
                            user_id: 'user-1',
                            model_id: 'model-1',
                            model_name: 'Model 1',
                            prompt_template_id_used: 'pt-1',
                            seed_prompt_url: 'https://example.com/seed-prompt',
                            is_latest_edit: true, // It's the latest before the edit
                            edit_version: 1,
                            original_model_contribution_id: null, // It's an original
                            target_contribution_id: null,
                            error: null,
                        },
                    ]
                }
            ]
        };

        // This represents the state of the project *after* the refetch.
        const mockProjectForRefetch: DialecticProject = {
            ...mockInitialProjectDetail,
            dialectic_sessions: mockInitialProjectDetail.dialectic_sessions?.map(s => {
                if (s.id !== mockSessionId) return s;
                const updatedContributions = s.dialectic_contributions
                    ? s.dialectic_contributions.map(c => 
                        c.id === mockContributionId ? { ...c, is_latest_edit: false } : c
                      )
                    : [];
                updatedContributions.push(mockNewContributionVersion);
                return { ...s, dialectic_contributions: updatedContributions };
            })
        };

        it('should call api, refetch project on success, and update project state', async () => {
            api.dialectic().saveContributionEdit.mockResolvedValue({ data: mockNewContributionVersion, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValue({ data: mockProjectForRefetch, status: 200 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isSavingContributionEdit).toBe(false);
            expect(state.saveContributionEditError).toBeNull();
            expect(api.dialectic().saveContributionEdit).toHaveBeenCalledWith(mockPayload);
            expect(api.dialectic().getProjectDetails).toHaveBeenCalledWith(mockPayload.projectId);
            expect(state.currentProjectDetail).toEqual(mockProjectForRefetch);
        });

        it('should also update the content cache with the new edited content', async () => {
            api.dialectic().saveContributionEdit.mockResolvedValue({ data: mockNewContributionVersion, status: 200 });
            api.dialectic().getProjectDetails.mockResolvedValue({ data: mockProjectForRefetch, status: 200 });

            const { saveContributionEdit } = useDialecticStore.getState();
            await saveContributionEdit(mockPayload);

            const cacheEntry = useDialecticStore.getState().contributionContentCache[mockNewContributionVersion.id];
            expect(cacheEntry).toBeDefined();
            expect(cacheEntry.isLoading).toBe(false);
            expect(cacheEntry.content).toBe(editedContent);
            expect(cacheEntry.error).toBeUndefined();
        });

        it('should NOT refetch project details on API error', async () => {
            const apiError: ApiError = { code: 'SAVE_FAILED', message: 'Failed to save contribution.' };
            api.dialectic().saveContributionEdit.mockResolvedValue({ error: apiError, status: 500 });

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
            expect(useDialecticStore.getState().saveContributionEditError).toEqual(apiError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(apiError);
        });

        it('should NOT refetch project details if API call throws', async () => {
            const networkErrorMessage = 'Network connection failed during save';
            api.dialectic().saveContributionEdit.mockRejectedValue(new Error(networkErrorMessage));

            const { saveContributionEdit } = useDialecticStore.getState();
            const result = await saveContributionEdit(mockPayload);

            const expectedError: ApiError = { message: networkErrorMessage, code: 'NETWORK_ERROR' };
            expect(useDialecticStore.getState().isSavingContributionEdit).toBe(false);
            expect(useDialecticStore.getState().saveContributionEditError).toEqual(expectedError);
            expect(api.dialectic().getProjectDetails).not.toHaveBeenCalled();
            expect(result?.error).toEqual(expectedError);
        });
    });
});

// Helper to reset store state for testing (already part of DialecticActions in the actual store)
// Ensure this matches the actual _resetForTesting if defined in the store, or remove if not used.
// For this test file, useDialecticStore.getState()._resetForTesting?.() is preferred.
const resetStoreForTest = () => {
    useDialecticStore.setState(useDialecticStore.getState()._resetForTesting ? {} : {}); // A bit of a hack if _reset is not there
};
