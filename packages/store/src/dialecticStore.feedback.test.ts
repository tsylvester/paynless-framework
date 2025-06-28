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
  DialecticProcessTemplate,
  DialecticStage,
  GenerateContributionsPayload,
  GenerateContributionsResponse,
  ContributionGenerationStatus,
  GetProjectResourceContentResponse,
  GetProjectResourceContentPayload
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
import { api } from '@paynless/api';
import { resetApiMock, getMockDialecticClient } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    // ADDED: Test suite for Feedback File Content Actions
    describe('Feedback File Content Actions', () => {
        const mockProjectId = 'proj-feedback-123';
        const mockStoragePath = 'path/to/feedback.md';
        const mockFeedbackContentResponse: GetProjectResourceContentResponse = {
            content: '## Markdown Feedback\n\nThis is the feedback content.',
            fileName: 'feedback.md',
            mimeType: 'text/markdown',
        };

        describe('fetchFeedbackFileContent', () => {
            it('should fetch content, update state on success, and set loading states correctly', async () => {
                const mockSuccess: ApiResponse<GetProjectResourceContentResponse> = {
                    data: mockFeedbackContentResponse,
                    status: 200,
                };
                (api.dialectic().getProjectResourceContent as Mock).mockResolvedValue(mockSuccess);

                const { fetchFeedbackFileContent } = useDialecticStore.getState();
                
                // Check initial state
                expect(useDialecticStore.getState().isFetchingFeedbackFileContent).toBe(false);
                expect(useDialecticStore.getState().currentFeedbackFileContent).toBeNull();
                expect(useDialecticStore.getState().fetchFeedbackFileContentError).toBeNull();

                const fetchPromise = fetchFeedbackFileContent({ projectId: mockProjectId, storagePath: mockStoragePath });

                // Check loading state immediately after call
                expect(useDialecticStore.getState().isFetchingFeedbackFileContent).toBe(true);

                await fetchPromise;

                const state = useDialecticStore.getState();
                expect(state.isFetchingFeedbackFileContent).toBe(false);
                expect(state.currentFeedbackFileContent).toEqual(mockFeedbackContentResponse);
                expect(state.fetchFeedbackFileContentError).toBeNull();
                expect(api.dialectic().getProjectResourceContent).toHaveBeenCalledWith({ 
                    projectId: mockProjectId, 
                    storagePath: mockStoragePath 
                });
            });

            it('should handle API error and update state accordingly', async () => {
                const mockError: ApiError = { code: 'NOT_FOUND', message: 'File not found' };
                const mockFailure: ApiResponse<GetProjectResourceContentResponse> = {
                    error: mockError,
                    status: 404,
                };
                (api.dialectic().getProjectResourceContent as Mock).mockResolvedValue(mockFailure);

                const { fetchFeedbackFileContent } = useDialecticStore.getState();
                await fetchFeedbackFileContent({ projectId: mockProjectId, storagePath: 'invalid/path.md' });

                const state = useDialecticStore.getState();
                expect(state.isFetchingFeedbackFileContent).toBe(false);
                expect(state.currentFeedbackFileContent).toBeNull();
                expect(state.fetchFeedbackFileContentError).toEqual(mockError);
            });

            it('should handle network/exception and update state accordingly', async () => {
                const networkError = new Error('Network connection failed');
                (api.dialectic().getProjectResourceContent as Mock).mockRejectedValue(networkError);

                const { fetchFeedbackFileContent } = useDialecticStore.getState();
                await fetchFeedbackFileContent({ projectId: mockProjectId, storagePath: mockStoragePath });

                const state = useDialecticStore.getState();
                expect(state.isFetchingFeedbackFileContent).toBe(false);
                expect(state.currentFeedbackFileContent).toBeNull();
                expect(state.fetchFeedbackFileContentError).toEqual({
                    code: 'NETWORK_ERROR',
                    message: 'Network connection failed',
                });
            });
        });

        describe('resetFetchFeedbackFileContentError', () => {
            it('should set fetchFeedbackFileContentError to null', () => {
                useDialecticStore.setState({ 
                    fetchFeedbackFileContentError: { code: 'PREV_ERROR', message: 'Previous error' } 
                });
                expect(useDialecticStore.getState().fetchFeedbackFileContentError).not.toBeNull();

                const { resetFetchFeedbackFileContentError } = useDialecticStore.getState();
                resetFetchFeedbackFileContentError();

                expect(useDialecticStore.getState().fetchFeedbackFileContentError).toBeNull();
            });
        });

        describe('clearCurrentFeedbackFileContent', () => {
            it('should set currentFeedbackFileContent to null', () => {
                useDialecticStore.setState({ 
                    currentFeedbackFileContent: mockFeedbackContentResponse 
                });
                expect(useDialecticStore.getState().currentFeedbackFileContent).not.toBeNull();

                const { clearCurrentFeedbackFileContent } = useDialecticStore.getState();
                clearCurrentFeedbackFileContent();

                expect(useDialecticStore.getState().currentFeedbackFileContent).toBeNull();
            });
        });
    });
}); 