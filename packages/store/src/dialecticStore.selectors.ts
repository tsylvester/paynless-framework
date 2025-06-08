import type { 
    DialecticStateValues, 
    DialecticProject, 
    AIModelCatalogEntry, 
    ApiError, 
    DomainTagDescriptor,
    DomainOverlayDescriptor,
    DialecticSession,
    DialecticStage,
} from '@paynless/types';

// Selector for the list of available domain tags
export const selectAvailableDomainTags = (state: DialecticStateValues): DomainTagDescriptor[] => {
    // Check if availableDomainTags has a 'data' property (object form)
    if (state.availableDomainTags && typeof state.availableDomainTags === 'object' && 'data' in state.availableDomainTags) {
        // It can also be that data is null or undefined if the API returns that, so we default to []
        return (state.availableDomainTags as { data: DomainTagDescriptor[] | null | undefined }).data || [];
    }
    // Otherwise, it should be DomainTagDescriptor[] already (or null/undefined, which we treat as empty)
    return (state.availableDomainTags as DomainTagDescriptor[]) || [];
};

// Selector for the loading state of domain tags
export const selectIsLoadingDomainTags = (state: DialecticStateValues): boolean => state.isLoadingDomainTags;

// Selector for any error related to fetching domain tags
export const selectDomainTagsError = (state: DialecticStateValues): ApiError | null => state.domainTagsError;

// Selector for the currently selected domain tag
export const selectSelectedDomainTag = (state: DialecticStateValues): string | null => state.selectedDomainTag;

// Selector for the selected domain overlay ID
export const selectSelectedDomainOverlayId = (state: DialecticStateValues): string | null => state.selectedDomainOverlayId;

// Selector for the selected stage association
export const selectSelectedStageAssociation = (state: DialecticStateValues): DialecticStage | null => state.selectedStageAssociation;

// Selector for the current stage to be used for overlay selection
export const selectCurrentStageForOverlaySelection = (state: DialecticStateValues): DialecticStage | null => state.selectedStageAssociation;

// Selector for the available domain overlays
export const selectAvailableDomainOverlays = (state: DialecticStateValues): DomainOverlayDescriptor[] => state.availableDomainOverlays ?? [];

// Selector for overlay details filtered by domain tag and current stage
export const selectOverlay = (
    state: DialecticStateValues,
    domainTag: string | null
): DomainOverlayDescriptor[] => {
    const stage = state.selectedStageAssociation;
    if (!domainTag || !stage || !state.availableDomainOverlays) {
        return [];
    }
    return state.availableDomainOverlays.filter(
        (overlay) => overlay.domainTag === domainTag && overlay.stageAssociation === stage
    );
};

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

// Selector for the current project initial prompt
export const selectCurrentProjectInitialPrompt = (state: DialecticStateValues): string | undefined | null=> 
  state.currentProjectDetail?.initial_user_prompt;

// Selector for the current project sessions
export const selectCurrentProjectSessions = (state: DialecticStateValues): DialecticSession[] | undefined => 
  state.currentProjectDetail?.sessions;

// Selector for the project prompt update status
export const selectIsUpdatingProjectPrompt = (state: DialecticStateValues): boolean => 
  state.isUpdatingProjectPrompt;

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

// Selector for the current project ID
export const selectCurrentProjectId = (state: DialecticStateValues): string | undefined => 
  state.currentProjectDetail?.id;

// Selector for the start new session modal status
export const selectIsStartNewSessionModalOpen = (state: DialecticStateValues): boolean => 
  state.isStartNewSessionModalOpen;

// Selector for selected model IDs for the new session modal
export const selectSelectedModelIds = (state: DialecticStateValues): string[] => state.selectedModelIds || [];

// Example of how you might use these with the store hook directly in a component:
// import { useDialecticStore } from './dialecticStore';
// const availableTags = useDialecticStore(selectAvailableDomainTags);
// const isLoading = useDialecticStore(selectIsLoadingDomainTags);
// const error = useDialecticStore(selectDomainTagsError);
// const selectedTag = useDialecticStore(selectSelectedDomainTag); 