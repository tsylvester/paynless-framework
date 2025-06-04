import { vi } from 'vitest';
import { DialecticStateValues, DialecticStore } from '@paynless/types';
import * as originalStore from '@paynless/store'; // Import actual store to get original selectors

// Exportable mock functions and state so tests can control them
export const mockFetchContributionContent = vi.fn();
export let mockLocalContributionCache: DialecticStateValues['contributionContentCache'] = {};

// Function to reset mocks, can be called in beforeEach
export const resetDialecticStoreMocks = () => {
  mockFetchContributionContent.mockClear();
  mockLocalContributionCache = {};
  selectOverlay.mockClear();
};

const actualStoreModule = originalStore as unknown as { 
  selectContributionContentCache: (state: DialecticStateValues) => DialecticStateValues['contributionContentCache'];
  selectSelectedDomainTag: (state: DialecticStateValues) => string | null;
  selectSelectedDomainOverlayId: (state: DialecticStateValues) => string | null;
  selectOverlay: (state: DialecticStateValues, domainTag: string | null) => DomainOverlayDescriptor[];
  // Add other selectors if needed by other components using this general mock
};

export const selectContributionContentCache = actualStoreModule.selectContributionContentCache;
export const selectSelectedDomainTag = actualStoreModule.selectSelectedDomainTag;
export const selectSelectedDomainOverlayId = actualStoreModule.selectSelectedDomainOverlayId;
export const selectOverlay = vi.fn();

export const useDialecticStore = vi.fn(<TResult,>(selectorFn: (state: DialecticStore) => TResult): TResult => {
  const mockStateValues: DialecticStateValues = {
    contributionContentCache: mockLocalContributionCache,
    availableDomainTags: [],
    isLoadingDomainTags: false,
    domainTagsError: null,
    selectedDomainTag: null,
    projects: [],
    isLoadingProjects: false,
    projectsError: null,
    currentProjectDetail: null,
    isLoadingProjectDetail: false,
    projectDetailError: null,
    modelCatalog: [],
    isLoadingModelCatalog: false,
    modelCatalogError: null,
    isCreatingProject: false,
    createProjectError: null,
    isStartingSession: false,
    startSessionError: null,
    selectedStageAssociation: null,
    availableDomainOverlays: [],
    isLoadingDomainOverlays: false,
    domainOverlaysError: null,
    selectedDomainOverlayId: null,
    allSystemPrompts: [],
  };

  const mockStoreActions = {
    fetchContributionContent: mockFetchContributionContent,
    fetchAvailableDomainTags: vi.fn(),
    setSelectedDomainTag: vi.fn(),
    fetchDialecticProjects: vi.fn(),
    fetchDialecticProjectDetails: vi.fn(),
    fetchModelCatalog: vi.fn(),
    fetchAIModelCatalog: vi.fn(),
    createDialecticProject: vi.fn(),
    startDialecticSession: vi.fn(),
    updateContributionContentCacheEntry: vi.fn(),
    clearDialecticState: vi.fn(),
    uploadProjectResourceFile: vi.fn(),
    resetCreateProjectError: vi.fn(),
    resetProjectDetailsError: vi.fn(),
  };

  const fullMockStore: DialecticStore = {
    ...mockStateValues,
    ...mockStoreActions,
  };
  return selectorFn(fullMockStore);
});

// If other components also mock '@paynless/store' and need specific selectors,
// those selectors can be imported from '@paynless/store' and re-exported here,
// similar to selectContributionContentCache.
// For now, this mock is tailored to ContributionCard's needs.
