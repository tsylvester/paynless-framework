import type { 
    DialecticStateValues, 
    DialecticProject, 
    AIModelCatalogEntry, 
    ApiError, 
    DomainTagDescriptor,
    DomainOverlayDescriptor
} from '@paynless/types';

// Selector for the list of available domain tags
export const selectAvailableDomainTags = (state: DialecticStateValues): DomainTagDescriptor[] => state.availableDomainTags;

// Selector for the loading state of domain tags
export const selectIsLoadingDomainTags = (state: DialecticStateValues): boolean => state.isLoadingDomainTags;

// Selector for any error related to fetching domain tags
export const selectDomainTagsError = (state: DialecticStateValues): ApiError | null => state.domainTagsError;

// Selector for the currently selected domain tag
export const selectSelectedDomainTag = (state: DialecticStateValues): string | null => state.selectedDomainTag;

// Selector for the selected domain tag
export const selectSelectedStageAssociation = (state: DialecticStateValues): string | null => state.selectedStageAssociation;

// Selector for the available domain overlays
export const selectAvailableDomainOverlays = (state: DialecticStateValues): DomainOverlayDescriptor[] => state.availableDomainOverlays ?? [];

// Selector for the loading state of domain overlays
export const selectIsLoadingDomainOverlays = (state: DialecticStateValues): boolean => state.isLoadingDomainOverlays;

// Selector for any error related to fetching domain overlays
export const selectDomainOverlaysError = (state: DialecticStateValues): ApiError | null => state.domainOverlaysError;

// Selector for the list of projects
export const selectDialecticProjects = (state: DialecticStateValues): DialecticProject[] => state.projects;

// Selector for the loading state of projects
export const selectIsLoadingProjects = (state: DialecticStateValues): boolean => state.isLoadingProjects;

// Selector for any error related to fetching projects
export const selectProjectsError = (state: DialecticStateValues): ApiError | null => state.projectsError;

// Selector for the current project detail
export const selectCurrentProjectDetail = (state: DialecticStateValues): DialecticProject | null => state.currentProjectDetail;

// Selector for the loading state of project detail
export const selectIsLoadingProjectDetail = (state: DialecticStateValues): boolean => state.isLoadingProjectDetail;

// Selector for any error related to fetching project detail
export const selectProjectDetailError = (state: DialecticStateValues): ApiError | null => state.projectDetailError;

// Selector for the model catalog
export const selectModelCatalog = (state: DialecticStateValues): AIModelCatalogEntry[] => state.modelCatalog;

// Selector for the loading state of the model catalog
export const selectIsLoadingModelCatalog = (state: DialecticStateValues): boolean => state.isLoadingModelCatalog;

// Selector for any error related to fetching the model catalog
export const selectModelCatalogError = (state: DialecticStateValues): ApiError | null => state.modelCatalogError;

// Selector for the action status of creating a project
export const selectIsCreatingProject = (state: DialecticStateValues): boolean => state.isCreatingProject;

// Selector for any error related to creating a project
export const selectCreateProjectError = (state: DialecticStateValues): ApiError | null => state.createProjectError;

// Selector for the action status of starting a session
export const selectIsStartingSession = (state: DialecticStateValues): boolean => state.isStartingSession;

// Selector for any error related to starting a session
export const selectStartSessionError = (state: DialecticStateValues): ApiError | null => state.startSessionError;

// Selector for the contribution content cache
export const selectContributionContentCache = (state: DialecticStateValues) => state.contributionContentCache;

// Example of how you might use these with the store hook directly in a component:
// import { useDialecticStore } from './dialecticStore';
// const availableTags = useDialecticStore(selectAvailableDomainTags);
// const isLoading = useDialecticStore(selectIsLoadingDomainTags);
// const error = useDialecticStore(selectDomainTagsError);
// const selectedTag = useDialecticStore(selectSelectedDomainTag); 