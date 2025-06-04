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

    describe('Initial State', () => {
        it('should initialize with default values', () => {
            const state = useDialecticStore.getState();
            expect(state.availableDomainTags).toEqual(initialDialecticStateValues.availableDomainTags);
            expect(state.isLoadingDomainTags).toBe(initialDialecticStateValues.isLoadingDomainTags);
            expect(state.domainTagsError).toBe(initialDialecticStateValues.domainTagsError);
            expect(state.selectedDomainTag).toBe(initialDialecticStateValues.selectedDomainTag);
            
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


}); 