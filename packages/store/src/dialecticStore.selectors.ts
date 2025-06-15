import type { 
    DialecticStateValues, 
    DialecticProject, 
    AIModelCatalogEntry, 
    ApiError, 
    DomainOverlayDescriptor,
    DialecticSession,
    DialecticStage,
    DialecticContribution,
    DialecticDomain,
} from '@paynless/types';
import { createSelector } from 'reselect';

// Selectors for Domains
export const selectDomains = (state: DialecticStateValues): DialecticDomain[] => state.domains ?? [];
export const selectIsLoadingDomains = (state: DialecticStateValues): boolean => state.isLoadingDomains;
export const selectDomainsError = (state: DialecticStateValues): ApiError | null => state.domainsError;
export const selectSelectedDomain = (state: DialecticStateValues): DialecticDomain | null => state.selectedDomain;

// Selector for the selected domain overlay ID
export const selectSelectedDomainOverlayId = (state: DialecticStateValues): string | null => state.selectedDomainOverlayId;

// Selector for the selected stage association
export const selectSelectedStageAssociation = (state: DialecticStateValues): DialecticStage | null => state.selectedStageAssociation;

// Selector for the current stage to be used for overlay selection
export const selectCurrentStageForOverlaySelection = (state: DialecticStateValues): DialecticStage | null => state.selectedStageAssociation;

// Selector for the available domain overlays
export const selectAvailableDomainOverlays = (state: DialecticStateValues): DomainOverlayDescriptor[] => state.availableDomainOverlays ?? [];

// Selector for overlay details filtered by domain id and current stage
export const selectOverlay = (
    state: DialecticStateValues,
    domainId: string | null
): DomainOverlayDescriptor[] => {
    const stage = state.selectedStageAssociation;
    if (!domainId || !stage || !state.availableDomainOverlays) {
        return [];
    }
    return state.availableDomainOverlays.filter(
        (overlay) => overlay.domainId === domainId && overlay.stageAssociation === stage.slug
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
  state.currentProjectDetail?.dialectic_sessions;

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

// Input selector for all contributions from the current project's sessions
const selectAllContributionsFromCurrentProject = (state: DialecticStateValues): DialecticContribution[] => {
  const currentProject = state.currentProjectDetail;
  if (!currentProject || !currentProject.dialectic_sessions) {
    return [];
  }
  return currentProject.dialectic_sessions.flatMap(session => session.dialectic_contributions || [] );
};

// Input selector for the contributionId parameter (passed from component props)
const selectContributionIdParam = (_state: DialecticStateValues, contributionId: string): string => contributionId;

// Memoized selector to get a specific contribution by its ID
export const selectContributionById = createSelector(
  [selectAllContributionsFromCurrentProject, selectContributionIdParam],
  (allContributions, contributionId) => 
    allContributions.find(contribution => contribution.id === contributionId)
);

// Selector for any error related to saving a contribution edit
export const selectSaveContributionEditError = (state: DialecticStateValues) => state.saveContributionEditError;

// Selectors for new context states
export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => state.activeContextProjectId;
export const selectActiveContextSessionId = (state: DialecticStateValues): string | null => state.activeContextSessionId;
export const selectActiveContextStageSlug = (state: DialecticStateValues): DialecticStage | null => state.activeContextStageSlug;

// Selectors for Process Template
export const selectCurrentProcessTemplate = (state: DialecticStateValues) => state.currentProcessTemplate;
export const selectIsLoadingProcessTemplate = (state: DialecticStateValues) => state.isLoadingProcessTemplate;
export const selectProcessTemplateError = (state: DialecticStateValues) => state.processTemplateError;
