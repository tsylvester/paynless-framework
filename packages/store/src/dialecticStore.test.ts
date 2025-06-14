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
import { resetApiMock } from '@paynless/api/mocks';

describe('useDialecticStore', () => {
    beforeEach(() => {
        resetApiMock();
        useDialecticStore.getState()._resetForTesting?.();
        vi.clearAllMocks();
    });

    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const state = useDialecticStore.getState();
            expect(state.domains).toEqual(initialDialecticStateValues.domains);
            expect(state.isLoadingDomains).toBe(initialDialecticStateValues.isLoadingDomains);
            expect(state.domainsError).toBe(initialDialecticStateValues.domainsError);

            // Check new initial state for Domain Overlays
            expect(state.selectedStageAssociation).toBe(initialDialecticStateValues.selectedStageAssociation);
            expect(state.availableDomainOverlays).toEqual(initialDialecticStateValues.availableDomainOverlays);
            expect(state.isLoadingDomainOverlays).toBe(initialDialecticStateValues.isLoadingDomainOverlays);
            expect(state.domainOverlaysError).toBe(initialDialecticStateValues.domainOverlaysError);
            // End check new initial state for Domain Overlays

            expect(state.projects).toEqual(initialDialecticStateValues.projects);
            expect(state.isLoadingProjects).toBe(initialDialecticStateValues.isLoadingProjects);
            expect(state.projectsError).toBe(initialDialecticStateValues.projectsError);

            expect(state.currentProjectDetail).toBe(initialDialecticStateValues.currentProjectDetail);
            expect(state.isLoadingProjectDetail).toBe(initialDialecticStateValues.isLoadingProjectDetail);
            expect(state.projectDetailError).toBe(initialDialecticStateValues.projectDetailError);

            expect(state.modelCatalog).toEqual(initialDialecticStateValues.modelCatalog);
            expect(state.isLoadingModelCatalog).toBe(initialDialecticStateValues.isLoadingModelCatalog);
            expect(state.modelCatalogError).toBe(initialDialecticStateValues.modelCatalogError);
            
            expect(state.isCreatingProject).toBe(initialDialecticStateValues.isCreatingProject);
            expect(state.createProjectError).toBe(initialDialecticStateValues.createProjectError);

            expect(state.isStartingSession).toBe(initialDialecticStateValues.isStartingSession);
            expect(state.startSessionError).toBe(initialDialecticStateValues.startSessionError);

            expect(state.contributionContentCache).toEqual(initialDialecticStateValues.contributionContentCache);
        });
    });

    describe('fetchDomains thunk', () => {
        const mockDomains: DialecticDomain[] = [
            { id: '1', name: 'Software Development', description: 'All about code', parent_domain_id: null },
            { id: '2', name: 'Finance', description: 'All about money', parent_domain_id: null },
        ];

        it('should fetch domains and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                data: mockDomains,
                status: 200,
            };
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

            const fetchDomains = useDialecticStore.getState().fetchDomains;
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual(mockDomains);
            expect(state.domainsError).toBeNull();
        });

        it('should handle API errors when fetching domains', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to fetch' };
            const mockResponse: ApiResponse<DialecticDomain[]> = {
                error: mockError,
                status: 500,
            };
            (api.dialectic().listDomains as Mock).mockResolvedValue(mockResponse);

            const fetchDomains = useDialecticStore.getState().fetchDomains;
            await fetchDomains();

            const state = useDialecticStore.getState();
            expect(state.isLoadingDomains).toBe(false);
            expect(state.domains).toEqual([]);
            expect(state.domainsError).toEqual(mockError);
        });
    });

    describe('createDialecticProject thunk', () => {
        const mockProject: DialecticProject = {
            id: 'proj-123',
            project_name: 'Test Project',
            selected_domain_id: 'domain-1',
            domain_name: 'Software Development',
            user_id: 'user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            initial_user_prompt: 'Test prompt',
            initial_prompt_resource_id: null,
            selected_domain_overlay_id: null,
            repo_url: null,
        };

        const mockPayload: CreateProjectPayload = {
            projectName: 'Test Project',
            initialUserPrompt: 'Test prompt',
            selectedDomainId: 'domain-1',
        };

        it('should create a project and update state on success', async () => {
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProject,
                status: 201,
            };
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);
            (api.dialectic().listProjects as Mock).mockResolvedValue({
                data: [mockProject],
                status: 200,
            });

            const createProject = useDialecticStore.getState().createDialecticProject;
            const result = await createProject(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.projects).toEqual([mockProject]);
            expect(state.currentProjectDetail).toEqual(mockProject);
            expect(state.createProjectError).toBeNull();
            expect(result.data).toEqual(mockProject);
            
            // Verify that api.dialectic().createProject was called with FormData
            const createProjectCall = (api.dialectic().createProject as Mock).mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            expect(createProjectCall.get('projectName')).toBe(mockPayload.projectName);
            expect(createProjectCall.get('initialUserPromptText')).toBe(mockPayload.initialUserPrompt);
            expect(createProjectCall.get('selectedDomainId')).toBe(mockPayload.selectedDomainId);
        });

        it('should handle API errors when creating a project', async () => {
            const mockError: ApiError = { code: 'SERVER_ERROR', message: 'Failed to create' };
            const mockResponse: ApiResponse<DialecticProject> = {
                error: mockError,
                status: 500,
            };
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);

            const createProject = useDialecticStore.getState().createDialecticProject;
            await createProject(mockPayload);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);
            expect(state.projects).toEqual([]);
            expect(state.createProjectError).toEqual(mockError);
        });

        it('should handle creating a project with a file', async () => {
            const mockFile = new File(['file content'], 'prompt.md', { type: 'text/markdown' });
            const payloadWithFile: CreateProjectPayload = {
                ...mockPayload,
                promptFile: mockFile,
            };
            const mockResponse: ApiResponse<DialecticProject> = {
                data: mockProject,
                status: 201,
            };
            (api.dialectic().createProject as Mock).mockResolvedValue(mockResponse);
            (api.dialectic().listProjects as Mock).mockResolvedValue({
                data: [mockProject],
                status: 200,
            });

            const createProject = useDialecticStore.getState().createDialecticProject;
            await createProject(payloadWithFile);

            const state = useDialecticStore.getState();
            expect(state.isCreatingProject).toBe(false);

            const createProjectCall = (api.dialectic().createProject as Mock).mock.calls[0][0];
            expect(createProjectCall).toBeInstanceOf(FormData);
            expect(createProjectCall.get('promptFile')).toBeInstanceOf(File);
            expect((createProjectCall.get('promptFile') as File).name).toBe('prompt.md');
        });
    });

    describe('setStartNewSessionModalOpen action', () => {
        it('should have isStartNewSessionModalOpen as false initially', () => {
            const state = useDialecticStore.getState();
            expect(state.isStartNewSessionModalOpen).toBe(false);
        });

        it('should set isStartNewSessionModalOpen to true', () => {
            const { setStartNewSessionModalOpen } = useDialecticStore.getState();
            setStartNewSessionModalOpen(true);
            const state = useDialecticStore.getState();
            expect(state.isStartNewSessionModalOpen).toBe(true);
        });

        it('should set isStartNewSessionModalOpen to false after being true', () => {
            const { setStartNewSessionModalOpen } = useDialecticStore.getState();
            // Set to true first
            setStartNewSessionModalOpen(true);
            expect(useDialecticStore.getState().isStartNewSessionModalOpen).toBe(true);

            // Then set to false
            setStartNewSessionModalOpen(false);
            const state = useDialecticStore.getState();
            expect(state.isStartNewSessionModalOpen).toBe(false);
        });
    });
}); 