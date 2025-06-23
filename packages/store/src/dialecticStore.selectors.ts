import type { 
    DialecticStateValues, 
    DialecticProject, 
    AIModelCatalogEntry, 
    ApiError, 
    DomainOverlayDescriptor,
    DialecticStage,
    DialecticContribution,
    DialecticDomain,
    DialecticFeedback,
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
export const selectCurrentProjectInitialPrompt = createSelector(
    [selectCurrentProjectDetail],
    (project) => project?.initial_user_prompt,
);

// Selector for the current project sessions
export const selectCurrentProjectSessions = createSelector(
  [selectCurrentProjectDetail],
  (project) => project?.dialectic_sessions
);

// Selector for the project prompt update status
export const selectIsUpdatingProjectPrompt = (state: DialecticStateValues): boolean => state.isUpdatingProjectPrompt;

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

// New selector for contribution generation status
export const selectContributionGenerationStatus = (state: DialecticStateValues) => state.contributionGenerationStatus;

// Selector for any error related to generating contributions
export const selectGenerateContributionsError = (state: DialecticStateValues): ApiError | null => state.generateContributionsError;

// Selector for the current project ID
export const selectCurrentProjectId = (state: DialecticStateValues): string | undefined => 
  state.currentProjectDetail?.id;

// Selector for selected model IDs for the new session modal
export const selectSelectedModelIds = (state: DialecticStateValues): string[] => state.selectedModelIds || [];

// Input selector for all contributions from the current project's sessions
export const selectAllContributionsFromCurrentProject = (state: DialecticStateValues): DialecticContribution[] => {
  const currentProject = state.currentProjectDetail;
  if (!currentProject || !currentProject.dialectic_sessions) {
    return [];
  }
  return currentProject.dialectic_sessions.flatMap(session => session.dialectic_contributions || [] );
};

// Input selector for the contributionId parameter (passed from component props)
export const selectContributionIdParam = (_state: DialecticStateValues, contributionId: string): string => contributionId;

// Memoized selector to get a specific contribution by its ID
export const selectContributionById = createSelector(
    [selectCurrentProjectSessions, (_, contributionId: string) => contributionId],
    (sessions, contributionId) => {
        if (!sessions) {
            return undefined;
        }
        for (const session of sessions) {
            const contribution = session.dialectic_contributions?.find(c => c.id === contributionId);
            if (contribution) {
                return contribution;
            }
        }
        return undefined;
    }
);

// Selector for any error related to saving a contribution edit
export const selectSaveContributionEditError = (state: DialecticStateValues): ApiError | null => state.saveContributionEditError;

// Selectors for new context states
export const selectActiveContextProjectId = (state: DialecticStateValues): string | null => state.activeContextProjectId;
export const selectActiveContextSessionId = (state: DialecticStateValues): string | null => state.activeContextSessionId;
/**
 * @deprecated Use selectActiveContextStage instead.
 */
export const selectActiveContextStageSlug = (state: DialecticStateValues): DialecticStage | null => state.activeContextStage;
export const selectActiveContextStage = (state: DialecticStateValues): DialecticStage | null => state.activeContextStage;

// Memoized selector to get a specific session by its ID from the current project
export const selectSessionById = createSelector(
  [selectCurrentProjectSessions, (_, sessionId: string) => sessionId],
  (sessions, sessionId) => sessions?.find(s => s.id === sessionId)
);

// Selectors for Process Template
export const selectCurrentProcessTemplate = (state: DialecticStateValues) => state.currentProcessTemplate;
export const selectIsLoadingProcessTemplate = (state: DialecticStateValues) => state.isLoadingProcessTemplate;
export const selectProcessTemplateError = (state: DialecticStateValues) => state.processTemplateError;

// Memoized selector to get a specific stage by its ID from the current process template
export const selectStageById = createSelector(
    [selectCurrentProcessTemplate, (_, stageId: string) => stageId],
    (processTemplate, stageId) => processTemplate?.stages?.find(s => s.id === stageId)
);

export const selectIsStageReadyForSessionIteration = (
    state: DialecticStateValues,
    projectId: string, // This parameter is for ensuring we are looking at the correct project, though currentProjectDetail is already specific
    sessionId: string,
    stageSlug: string,
    iterationNumber: number
): boolean => {
    const project = state.currentProjectDetail;

    if (!project || project.id !== projectId || !project.resources || project.resources.length === 0) {
        return false;
    }

    for (const resource of project.resources) {
        if (typeof resource.resource_description === 'string') {
            try {
                const description = JSON.parse(resource.resource_description);
                if (
                    description.type === 'seed_prompt' &&
                    description.session_id === sessionId &&
                    description.stage_slug === stageSlug &&
                    description.iteration === iterationNumber
                ) {
                    return true;
                }
            } catch (error) {
                // Invalid JSON, ignore this resource
                // console.warn('Failed to parse resource_description:', error, resource.resource_description);
            }
        }
    }

    return false;
};

export const selectFeedbackForStageIteration = (
  state: DialecticStateValues,
  sessionId: string,
  stageSlug: string,
  iterationNumber: number
): DialecticFeedback[] => {
  const project = state.currentProjectDetail;
  if (!project || !project.dialectic_sessions) {
    return [];
  }

  const session = project.dialectic_sessions.find(s => s.id === sessionId);
  if (!session || !session.feedback) {
    return [];
  }

  return session.feedback.filter(
    fb => fb.stage_slug === stageSlug && fb.iteration_number === iterationNumber
  );
};

// Selector for total token usage for a specific stage in a session and iteration
export const selectActiveDialecticStageTotalTokenUsage = createSelector(
  [selectCurrentProjectSessions, (_, sessionId: string) => sessionId, (_, __, stageSlug: string) => stageSlug, (_, __, ___, iterationNumber: number) => iterationNumber],
  (sessions, sessionId, stageSlug, iterationNumber) => {
    if (!sessions) {
      return null;
    }
    const session = sessions.find(s => s.id === sessionId);
    if (!session || !session.dialectic_contributions) {
      return null;
    }

    let totalInput = 0;
    let totalOutput = 0;
    let totalProcessingMs = 0;

    for (const contrib of session.dialectic_contributions) {
      if (contrib.stage && contrib.stage === stageSlug && contrib.iteration_number === iterationNumber) {
        totalInput += contrib.tokens_used_input || 0;
        totalOutput += contrib.tokens_used_output || 0;
        totalProcessingMs += contrib.processing_time_ms || 0;
      }
    }
    return { totalInput, totalOutput, totalProcessingMs };
  }
);

// Selector for the active dialectic wallet ID
export const selectActiveDialecticWalletId = (state: DialecticStateValues): string | null => state.activeDialecticWalletId;
