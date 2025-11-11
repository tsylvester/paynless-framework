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
    DialecticStageRecipe,
    DialecticStageRecipeStep,
    FocusedStageDocumentState,
    StageDocumentChecklistEntry,
    StageRunDocumentDescriptor,
    StageRenderedDocumentDescriptor,
    StagePlannedDocumentDescriptor,
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
  (project) =>  project?.dialectic_sessions
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

// Selector for the active stage slug
export const selectActiveStageSlug = (state: DialecticStateValues): string | null => state.activeStageSlug;

// Memoized selector to get the full active stage object
export const selectActiveStage = createSelector(
  [selectCurrentProcessTemplate, selectActiveStageSlug],
  (processTemplate, activeStageSlug) => {
    if (!processTemplate || !activeStageSlug) {
      return null;
    }
    return processTemplate.stages?.find(s => s.slug === activeStageSlug) || null;
  }
);

export const selectSortedStages = createSelector(
  [selectCurrentProcessTemplate],
  (currentProcessTemplate) => {
    if (!currentProcessTemplate?.stages || !currentProcessTemplate.transitions?.length || !currentProcessTemplate.starting_stage_id) {
      return currentProcessTemplate?.stages || [];
    }
  
    const { stages, transitions, starting_stage_id } = currentProcessTemplate;
    
    const sortedStageIds: string[] = [];
    const transitionMap = new Map(transitions.map(t => [t.source_stage_id, t.target_stage_id]));
  
    let currentStageId: string | null | undefined = starting_stage_id;
  
    while (currentStageId) {
      sortedStageIds.push(currentStageId);
      currentStageId = transitionMap.get(currentStageId);
    }
  
    const sorted = [...stages].sort((a, b) => {
      const indexA = sortedStageIds.indexOf(a.id);
      const indexB = sortedStageIds.indexOf(b.id);
      
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
  
      return indexA - indexB;
    });
  
    return sorted;
  }
);

// Memoized selector to get a specific stage by its ID from the current process template
export const selectStageById = createSelector(
    [selectCurrentProcessTemplate, (_, stageId: string) => stageId],
    (processTemplate, stageId) => processTemplate?.stages?.find(s => s.id === stageId)
);

export const selectIsStageReadyForSessionIteration = createSelector(
    [
        (state: DialecticStateValues) => state.recipesByStageSlug,
        (state: DialecticStateValues) => state.stageRunProgress,
        selectCurrentProjectDetail,
        selectCurrentProcessTemplate,
        (state: DialecticStateValues) => state.activeSeedPrompt,
        (_state, projectId: string) => projectId,
        (_state, _projectId, sessionId: string) => sessionId,
        (_state, _projectId, _sessionId, stageSlug: string) => stageSlug,
        (_state, _projectId, _sessionId, _stageSlug, iterationNumber: number) => iterationNumber
    ],
    (recipesByStageSlug, stageRunProgressMap, project, processTemplate, activeSeedPrompt, projectId, sessionId, stageSlug, iterationNumber): boolean => {
        if (!project || project.id !== projectId || !processTemplate) {
            return false;
        }

        const stage = processTemplate.stages?.find(s => s.slug === stageSlug);
        if (!stage) return false;

        const projectResources = Array.isArray(project.resources) ? project.resources : [];
        const projectSession = project.dialectic_sessions?.find((candidateSession) => candidateSession.id === sessionId);
        if (!projectSession) {
            return false;
        }

        const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
        const progressEntry = stageRunProgressMap[progressKey];
        const stepStatuses = progressEntry?.stepStatuses ?? {};

        const recipe = recipesByStageSlug?.[stageSlug];
        const steps = recipe?.steps ?? [];
        const stepsWithInputs = steps
            .filter((step) => Array.isArray(step.inputs_required) && step.inputs_required.length > 0);

        const orderForStep = (step: DialecticStageRecipeStep): number => {
            if (typeof step.execution_order === 'number') {
                return step.execution_order;
            }
            return Number.MAX_SAFE_INTEGER;
        };

        const orderedSteps = [...stepsWithInputs].sort((left, right) => {
            const orderDifference = orderForStep(left) - orderForStep(right);
            if (orderDifference !== 0) {
                return orderDifference;
            }
            return left.step_key.localeCompare(right.step_key);
        });

        const stepsByOrder = new Map<number, DialecticStageRecipeStep[]>();
        for (const step of orderedSteps) {
            const orderValue = orderForStep(step);
            const existing = stepsByOrder.get(orderValue);
            if (existing) {
                existing.push(step);
            } else {
                stepsByOrder.set(orderValue, [step]);
            }
        }

        let pendingSteps: DialecticStageRecipeStep[] = [];
        for (const [_orderValue, stepsAtOrder] of stepsByOrder.entries()) {
            const pendingAtOrder = stepsAtOrder.filter((step) => stepStatuses[step.step_key] !== 'completed');
            if (pendingAtOrder.length === 0) {
                continue;
            }
            pendingSteps = pendingAtOrder;
            break;
        }

        const deriveRequirementStageSlug = (slugValue: string | undefined): string => {
            if (typeof slugValue === 'string' && slugValue.length > 0) {
                const separatorIndex = slugValue.indexOf('.');
                if (separatorIndex > 0) {
                    return slugValue.slice(0, separatorIndex);
                }
                return slugValue;
            }
            return stageSlug;
        };

        if (pendingSteps.length === 0) {
            return true;
        }

        for (const step of pendingSteps) {
            const stepStatus = stepStatuses[step.step_key];
            if (stepStatus && stepStatus !== 'not_started') {
                return false;
            }

            const stepRequirements = step.inputs_required ?? [];
            if (stepRequirements.length === 0) {
                continue;
            }

            for (const requirement of stepRequirements) {
                if (requirement.required === false) {
                    continue;
                }

                if (requirement.type === 'seed_prompt') {
                    if (!activeSeedPrompt) {
                        return false;
                    }
                    continue;
                }

                if (requirement.type === 'feedback') {
                    const feedbackEntries = Array.isArray(projectSession.feedback) ? projectSession.feedback : [];
                    const sourceStageSlug = deriveRequirementStageSlug(requirement.slug);
                    const hasFeedback = feedbackEntries.some((entry) => {
                        if (entry.iteration_number !== iterationNumber) {
                            return false;
                        }
                        if (entry.stage_slug !== sourceStageSlug) {
                            return false;
                        }
                        if (requirement.document_key && entry.feedback_type !== requirement.document_key) {
                            return false;
                        }
                        return true;
                    });
                    if (!hasFeedback) {
                        return false;
                    }
                    continue;
                }

                if (requirement.type === 'document') {
                    const contributions = Array.isArray(projectSession.dialectic_contributions)
                        ? projectSession.dialectic_contributions
                        : [];
                    const sourceStageSlug = deriveRequirementStageSlug(requirement.slug);
                    const hasDocument = contributions.some((contribution) => {
                        if (contribution.iteration_number !== iterationNumber) {
                            return false;
                        }
                        if (typeof contribution.stage !== 'string' || contribution.stage !== sourceStageSlug) {
                            return false;
                        }
                        if (requirement.document_key && contribution.contribution_type !== requirement.document_key) {
                            return false;
                        }
                        return true;
                    });
                    if (!hasDocument) {
                        return false;
                    }
                    continue;
                }

                if (requirement.type === 'header_context') {
                    const sourceStageSlug = deriveRequirementStageSlug(requirement.slug);
                    const producingStep = steps.find((candidateStep) => candidateStep.outputs_required?.some((output) => {
                        if (output.artifact_class !== 'header_context') {
                            return false;
                        }
                        if (requirement.document_key && output.document_key !== requirement.document_key) {
                            return false;
                        }
                        return true;
                    }));

                    if (!producingStep) {
                        return false;
                    }

                    const producingStatus = stepStatuses[producingStep.step_key];
                    if (producingStatus !== 'completed') {
                        return false;
                    }

                    let hasHeaderContext = false;
                    for (const resource of projectResources) {
                        let descriptorCandidate: unknown = resource.resource_description;
                        if (typeof descriptorCandidate === 'string') {
                            try {
                                const parsed: unknown = JSON.parse(descriptorCandidate);
                                descriptorCandidate = parsed;
                            } catch {
                                continue;
                            }
                        }
                        if (typeof descriptorCandidate !== 'object' || descriptorCandidate === null) {
                            continue;
                        }
                        const typeDescriptor = Object.getOwnPropertyDescriptor(descriptorCandidate, 'type');
                        const typeValue = typeDescriptor?.value;
                        if (typeof typeValue !== 'string' || typeValue !== 'header_context') {
                            continue;
                        }
                        const sessionDescriptor = Object.getOwnPropertyDescriptor(descriptorCandidate, 'session_id');
                        const sessionValue = sessionDescriptor?.value;
                        if (typeof sessionValue === 'string' && sessionValue !== sessionId) {
                            continue;
                        }
                        const stageDescriptor = Object.getOwnPropertyDescriptor(descriptorCandidate, 'stage_slug');
                        const stageValue = stageDescriptor?.value;
                        if (typeof stageValue === 'string' && stageValue !== sourceStageSlug) {
                            continue;
                        }
                        if (requirement.document_key) {
                            const documentDescriptor = Object.getOwnPropertyDescriptor(descriptorCandidate, 'document_key');
                            const documentKeyValue = documentDescriptor?.value;
                            if (typeof documentKeyValue === 'string' && documentKeyValue !== requirement.document_key) {
                                continue;
                            }
                        }
                        const iterationDescriptor = Object.getOwnPropertyDescriptor(descriptorCandidate, 'iteration');
                        const iterationValue = iterationDescriptor?.value;
                        if (typeof iterationValue === 'number' && iterationValue !== iterationNumber) {
                            continue;
                        }
                        hasHeaderContext = true;
                        break;
                    }
                    if (!hasHeaderContext) {
                        return false;
                    }
                    continue;
                }
            }
        }

        return true;
    }
);

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

// Selector for total token usage for an entire session
export const selectDialecticSessionTotalTokenUsage = createSelector(
  [selectCurrentProjectSessions, (_, sessionId: string) => sessionId],
  (sessions, sessionId) => {
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
      totalInput += contrib.tokens_used_input || 0;
      totalOutput += contrib.tokens_used_output || 0;
      totalProcessingMs += contrib.processing_time_ms || 0;
    }
    return { totalInput, totalOutput, totalProcessingMs };
  }
);

// Selector for the active dialectic wallet ID
export const selectActiveDialecticWalletId = (state: DialecticStateValues): string | null => state.activeDialecticWalletId;

type StageRunProgressEntry = NonNullable<DialecticStateValues['stageRunProgress'][string]>;
type StageRunDocuments = StageRunProgressEntry['documents'];
type StepStatus = StageRunProgressEntry['stepStatuses'][string];
type StageRunDocumentEntry = StageRunDocuments[string];
type DocumentStatus = StageRunDocumentEntry['status'];

const isPlannedDescriptor = (
    descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StagePlannedDocumentDescriptor =>
    Boolean(descriptor && descriptor.descriptorType === 'planned');

const isRenderedDescriptor = (
    descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StageRenderedDocumentDescriptor =>
    Boolean(descriptor && descriptor.descriptorType !== 'planned');

const emptyDocuments: StageRunDocuments = {};

const selectRecipeSteps = (
    state: DialecticStateValues,
    stageSlug: string
): DialecticStageRecipeStep[] => {
    const recipe = state.recipesByStageSlug[stageSlug];
    if (!recipe) {
        return [];
    }
    return recipe.steps;
};

export const selectStageRecipe = (
    state: DialecticStateValues,
    stageSlug: string
): DialecticStageRecipe | undefined => state.recipesByStageSlug[stageSlug];

export const selectStepList = createSelector(
    [selectRecipeSteps],
    (steps): DialecticStageRecipeStep[] => {
        if (steps.length === 0) {
            return steps;
        }
        const sortedSteps = [...steps].sort((a, b) => {
            if (a.execution_order === b.execution_order) {
                return a.step_key.localeCompare(b.step_key);
            }
            return a.execution_order - b.execution_order;
        });
        return sortedSteps;
    }
);

export const selectStageRunProgress = (
    state: DialecticStateValues,
    sessionId: string,
    stageSlug: string,
    iterationNumber: number
): StageRunProgressEntry | undefined => {
    const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
    return state.stageRunProgress[progressKey];
};

export const selectStepStatus = (
    state: DialecticStateValues,
    progressKey: string,
    stepKey: string
): StepStatus | undefined => {
    const progress = state.stageRunProgress[progressKey];
    if (!progress) {
        return undefined;
    }
    return progress.stepStatuses[stepKey];
};

export const selectDocumentsForStageRun = (
    state: DialecticStateValues,
    progressKey: string
): StageRunDocuments => {
    const progress = state.stageRunProgress[progressKey];
    if (!progress) {
        return emptyDocuments;
    }
    return progress.documents;
};

export const selectDocumentStatus = (
    state: DialecticStateValues,
    progressKey: string,
    documentKey: string
): DocumentStatus | undefined => {
    const documents = selectDocumentsForStageRun(state, progressKey);
    const descriptor = documents[documentKey];
    if (!descriptor) {
        return undefined;
    }
    return descriptor.status;
};

export const selectLatestRenderedRef = (
    state: DialecticStateValues,
    progressKey: string,
    documentKey: string
): string | null | undefined => {
    const documents = selectDocumentsForStageRun(state, progressKey);
    const descriptor = documents[documentKey];
    if (!descriptor || !isRenderedDescriptor(descriptor)) {
        return undefined;
    }
    return descriptor.latestRenderedResourceId;
};

export const selectStageProgressSummary = (
    state: DialecticStateValues,
    sessionId: string,
    stageSlug: string,
    iterationNumber: number,
    modelId?: string
): {
    isComplete: boolean;
    totalDocuments: number;
    completedDocuments: number;
    outstandingDocuments: string[];
} => {
    const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
    if (!progress) {
        return {
            isComplete: false,
            totalDocuments: 0,
            completedDocuments: 0,
            outstandingDocuments: [],
        };
    }

    const documentEntries = progress.documents;

    const documentKeys = Object.keys(documentEntries).filter((key) => {
        if (!modelId) return true;
        const documentDescriptor = documentEntries[key];
        return documentDescriptor?.modelId === modelId;
    });

    let completedDocuments = 0;
    const outstandingDocuments: string[] = [];

    for (const key of documentKeys) {
        const documentDescriptor = documentEntries[key];
        if (!documentDescriptor) {
            continue;
        }
        if (documentDescriptor.status === 'completed') {
            completedDocuments += 1;
        } else {
            outstandingDocuments.push(key);
        }
    }

    const totalDocuments = documentKeys.length;
    const isComplete = totalDocuments > 0 && completedDocuments === totalDocuments;

    outstandingDocuments.sort();

    return {
        isComplete,
        totalDocuments,
        completedDocuments,
        outstandingDocuments,
    };
};

export const selectStageDocumentChecklist = (
    state: DialecticStateValues,
    progressKey: string,
    modelId: string
): StageDocumentChecklistEntry[] => {
    const documents = selectDocumentsForStageRun(state, progressKey);
    const checklist: StageDocumentChecklistEntry[] = [];

    for (const documentKey of Object.keys(documents)) {
        const descriptor = documents[documentKey];
        if (!descriptor) {
            continue;
        }

        if (descriptor.modelId !== modelId) {
            continue;
        }

        if (isPlannedDescriptor(descriptor)) {
            checklist.push({
                descriptorType: 'planned',
                documentKey,
                status: descriptor.status,
                jobId: null,
                latestRenderedResourceId: null,
                modelId: descriptor.modelId,
                stepKey: descriptor.stepKey,
            });
        } else {
            checklist.push({
                descriptorType: 'rendered',
                documentKey,
                status: descriptor.status,
                jobId: descriptor.job_id,
                latestRenderedResourceId: descriptor.latestRenderedResourceId,
                modelId: descriptor.modelId,
                stepKey: descriptor.stepKey,
            });
        }
    }

    return checklist;
};

export const selectFocusedStageDocument = (
    state: DialecticStateValues,
    sessionId: string,
    stageSlug: string,
    modelId: string,
): FocusedStageDocumentState | null => {
    const key = `${sessionId}:${stageSlug}:${modelId}`;
    const focusMap = state.focusedStageDocument;
    if (!focusMap) {
        return null;
    }
    const entry = focusMap[key] ?? null;
    if (!entry) {
        return null;
    }
    return entry;
};