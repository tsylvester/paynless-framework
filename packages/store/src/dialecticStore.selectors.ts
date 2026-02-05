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
    StageDocumentContentState,
    EditedDocumentResource,
    UnifiedProjectProgress,
    StepProgressDetail,
    StageProgressDetail,
    UnifiedProjectStatus,
    DialecticProcessTemplate,
    SelectedModels,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
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

// Selector for selected models (id + displayName) for the new session modal
export const selectSelectedModels = (state: DialecticStateValues): SelectedModels[] => state.selectedModels || [];

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
                    const sourceStageSlug = deriveRequirementStageSlug(requirement.slug);
                    const sourceProgressKey = `${sessionId}:${sourceStageSlug}:${iterationNumber}`;
                    const sourceProgressEntry = stageRunProgressMap[sourceProgressKey];

                    if (sourceProgressEntry && sourceProgressEntry.documents && requirement.document_key) {
                        const docs = sourceProgressEntry.documents;
                        const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
                        let hasCompletedDescriptor = false;
                        for (const compositeKey of Object.keys(docs)) {
                            const logicalKey = compositeKey.includes(sep)
                                ? compositeKey.slice(0, compositeKey.indexOf(sep))
                                : compositeKey;
                            if (logicalKey !== requirement.document_key) continue;
                            const descriptor = docs[compositeKey];
                            if (descriptor && descriptor.status === 'completed') {
                                hasCompletedDescriptor = true;
                                break;
                            }
                        }
                        if (hasCompletedDescriptor) continue;
                    }

                    const contributions = Array.isArray(projectSession.dialectic_contributions)
                        ? projectSession.dialectic_contributions
                        : [];
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

/** Extract logical document key from stageRunProgress.documents composite key (documentKey:modelId). */
function extractLogicalDocumentKeyFromComposite(compositeKey: string): string {
  const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
  return compositeKey.includes(sep) ? compositeKey.slice(0, compositeKey.indexOf(sep)) : compositeKey;
}

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

/**
 * Returns status for a document descriptor in stageRunProgress.documents.
 * @param progressKey - Progress bucket key (sessionId:stageSlug:iterationNumber)
 * @param documentKey - Full composite key (documentKey:modelId) for stageRunProgress.documents, not logical document key alone
 */
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

/**
 * Returns latestRenderedResourceId for a document descriptor in stageRunProgress.documents.
 * @param progressKey - Progress bucket key (sessionId:stageSlug:iterationNumber)
 * @param documentKey - Full composite key (documentKey:modelId) for stageRunProgress.documents, not logical document key alone
 */
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
    hasFailed: boolean;
    failedDocuments: number;
    failedDocumentKeys: string[];
} => {
    const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
    if (!progress) {
        return {
            isComplete: false,
            totalDocuments: 0,
            completedDocuments: 0,
            outstandingDocuments: [],
            hasFailed: false,
            failedDocuments: 0,
            failedDocumentKeys: [],
        };
    }

    const documentEntries = progress.documents;
    const validMarkdownKeys = selectValidMarkdownDocumentKeys(state, stageSlug);

    const compositeKeys = Object.keys(documentEntries).filter((compositeKey) => {
        if (!modelId) return true;
        const documentDescriptor = documentEntries[compositeKey];
        return documentDescriptor?.modelId === modelId;
    });

    const documentKeys = compositeKeys.filter((compositeKey) =>
        validMarkdownKeys.has(extractLogicalDocumentKeyFromComposite(compositeKey))
    );

    let completedDocuments = 0;
    const outstandingLogicalKeys = new Set<string>();
    const failedLogicalKeys = new Set<string>();

    for (const compositeKey of documentKeys) {
        const documentDescriptor = documentEntries[compositeKey];
        if (!documentDescriptor) {
            continue;
        }
        const logicalKey = extractLogicalDocumentKeyFromComposite(compositeKey);
        if (documentDescriptor.status === 'completed') {
            completedDocuments += 1;
            continue;
        }

        if (documentDescriptor.status === 'failed') {
            failedLogicalKeys.add(logicalKey);
        } else {
            outstandingLogicalKeys.add(logicalKey);
        }
    }

    const outstandingDocuments: string[] = [...outstandingLogicalKeys].sort();
    const failedDocumentKeys: string[] = [...failedLogicalKeys].sort();

    const totalDocuments = documentKeys.length;
    const isComplete = totalDocuments > 0 && completedDocuments === totalDocuments;

    return {
        isComplete,
        totalDocuments,
        completedDocuments,
        outstandingDocuments,
        hasFailed: failedDocumentKeys.length > 0,
        failedDocuments: failedDocumentKeys.length,
        failedDocumentKeys,
    };
};

function getSortedStagesFromTemplate(template: DialecticProcessTemplate | null): DialecticStage[] {
    if (!template?.stages?.length) return [];
    const stages = template.stages;
    if (!template.transitions?.length || !template.starting_stage_id) return stages;
    const transitionMap = new Map(template.transitions.map((t) => [t.source_stage_id, t.target_stage_id]));
    const sortedIds: string[] = [];
    let currentId: string | undefined = template.starting_stage_id;
    while (currentId) {
        sortedIds.push(currentId);
        currentId = transitionMap.get(currentId);
    }
    return [...stages].sort((a, b) => {
        const iA = sortedIds.indexOf(a.id);
        const iB = sortedIds.indexOf(b.id);
        if (iA === -1) return 1;
        if (iB === -1) return -1;
        return iA - iB;
    });
}

function isModelStep(step: DialecticStageRecipeStep): boolean {
    if (step.job_type === 'RENDER') return false;
    const outputs = step.outputs_required;
    if (!outputs?.length) return false;
    const hasDocumentOutput = outputs.some((o: { artifact_class: string; file_type?: string }) =>
        (o.artifact_class === 'rendered_document' || o.artifact_class === 'assembled_document_json') && (o.file_type === 'markdown' || !o.file_type));
    return hasDocumentOutput;
}

export const selectUnifiedProjectProgress = (
    state: DialecticStateValues,
    sessionId: string
): UnifiedProjectProgress => {
    const project = state.currentProjectDetail;
    const template = project?.dialectic_process_templates ?? null;
    const stages = template ? getSortedStagesFromTemplate(template) : [];
    const totalStages = stages.length;
    const session = selectSessionById(state, sessionId);
    const iterationNumber = session?.iteration_count ?? 0;
    const selectedModels = state.selectedModels || [];
    const totalModels = selectedModels.length;
    const selectedModelIdSet = new Set(selectedModels.map((m) => m.id));

    const currentStageId = session?.current_stage_id ?? null;
    const currentStage: DialecticStage | null = currentStageId
        ? (stages.find((s: DialecticStage) => s.id === currentStageId) ?? null)
        : null;
    const currentStageSlug: string | null = currentStage?.slug ?? null;

    if (totalStages === 0) {
        return {
            totalStages: 0,
            completedStages: 0,
            currentStageSlug,
            overallPercentage: 0,
            currentStage,
            projectStatus: 'not_started',
            stageDetails: [],
        };
    }

    const stageDetails: StageProgressDetail[] = [];
    let projectStatus: UnifiedProjectStatus = 'not_started';
    let completedStagesCount = 0;

    for (const stage of stages) {
        const stageSlug = stage.slug;
        const recipe = state.recipesByStageSlug[stageSlug];
        const progress = selectStageRunProgress(state, sessionId, stageSlug, iterationNumber);
        const validMarkdownKeys = selectValidMarkdownDocumentKeys(state, stageSlug);
        const steps = recipe?.steps ?? [];
        const sortedSteps = [...steps].sort((a, b) => {
            if (a.execution_order !== b.execution_order) return a.execution_order - b.execution_order;
            return a.step_key.localeCompare(b.step_key);
        });

        const stepsDetail: StepProgressDetail[] = [];
        let stageStatus: UnifiedProjectStatus = 'not_started';
        let stepSum = 0;

        for (const step of sortedSteps) {
            const stepKey = step.step_key;
            const stepStatusFromProgress = progress?.stepStatuses?.[stepKey];
            const isModel = isModelStep(step);

            let totalModelsForStep: number;
            let completedModelsForStep: number;
            let stepPercentage: number;
            let stepStatus: UnifiedProjectStatus;

            if (isModel) {
                totalModelsForStep = totalModels;
                const outputDocKeys = (step.outputs_required ?? [])
                    .filter((o: { artifact_class: string; file_type?: string }) =>
                        (o.artifact_class === 'rendered_document' || o.artifact_class === 'assembled_document_json') &&
                        (o.file_type === 'markdown' || !o.file_type))
                    .map((o: { document_key: string }) => o.document_key);
                let completed = 0;
                let hasFailed = false;
                let hasInProgress = false;
                const docs = progress?.documents ?? {};
                const sep = STAGE_RUN_DOCUMENT_KEY_SEPARATOR;
                for (const compositeKey of Object.keys(docs)) {
                    const desc = docs[compositeKey];
                    if (!desc) continue;
                    const documentKey = compositeKey.includes(sep)
                        ? compositeKey.slice(0, compositeKey.indexOf(sep))
                        : compositeKey;
                    if (!validMarkdownKeys.has(documentKey)) continue;
                    const matchesOutput = outputDocKeys.length === 0 || outputDocKeys.some((k: string) => documentKey === k);
                    if (!matchesOutput) continue;
                    if (!desc.modelId) throw new Error(`document ${compositeKey} has no modelId`);
                    if (!selectedModelIdSet.has(desc.modelId)) continue;
                    if (desc.status === 'completed') completed += 1;
                    else if (desc.status === 'failed') hasFailed = true;
                    else hasInProgress = true;
                }
                completedModelsForStep = completed;
                stepPercentage = totalModelsForStep > 0 ? (completed / totalModelsForStep) * 100 : 0;
                if (completed === 0 && hasInProgress && stepPercentage === 0) stepPercentage = 0.01;
                stepStatus = hasFailed ? 'failed' : (hasInProgress || completed < totalModelsForStep ? 'in_progress' : 'completed');
            } else {
                totalModelsForStep = 1;
                const done = stepStatusFromProgress === 'completed';
                completedModelsForStep = done ? 1 : 0;
                stepPercentage = done ? 100 : 0;
                stepStatus = stepStatusFromProgress === 'failed' ? 'failed' : (done ? 'completed' : (stepStatusFromProgress === 'in_progress' ? 'in_progress' : 'not_started'));
            }

            stepSum += stepPercentage;
            if (stepStatus === 'failed') stageStatus = 'failed';
            else if (stepStatus === 'in_progress' && stageStatus !== 'failed') stageStatus = 'in_progress';
            else if (stepStatus === 'completed' && stageStatus === 'not_started') stageStatus = 'completed';

            stepsDetail.push({
                stepKey,
                stepName: step.step_name,
                totalModels: totalModelsForStep,
                completedModels: completedModelsForStep,
                stepPercentage,
                status: stepStatus,
            });
        }

        const totalStepsForStage = sortedSteps.length;
        const stagePercentage = totalStepsForStage > 0 ? stepSum / totalStepsForStage : 0;
        const completedStepsForStage = stepsDetail.filter((s: StepProgressDetail) => s.status === 'completed').length;
        if (totalStepsForStage > 0 && stageStatus === 'not_started' && completedStepsForStage === totalStepsForStage) stageStatus = 'completed';

        stageDetails.push({
            stageSlug,
            totalSteps: totalStepsForStage,
            completedSteps: completedStepsForStage,
            stagePercentage,
            stepsDetail,
            stageStatus,
        });

        if (stageStatus === 'completed') completedStagesCount += 1;
        if (stageStatus === 'failed') projectStatus = 'failed';
        else if (stageStatus === 'in_progress' && projectStatus !== 'failed') projectStatus = 'in_progress';
    }

    if (projectStatus === 'not_started' && completedStagesCount === totalStages) projectStatus = 'completed';
    else if (projectStatus === 'not_started' && completedStagesCount > 0 && completedStagesCount < totalStages) projectStatus = 'in_progress';

    const currentStageDetail = stageDetails.find((s: StageProgressDetail) => s.stageSlug === currentStageSlug);
    const currentIsComplete = currentStageDetail?.stageStatus === 'completed';
    const currentStageContribution = currentIsComplete ? 0 : (currentStageDetail?.stagePercentage ?? 0);
    const overallPercentage = totalStages > 0
        ? (completedStagesCount * 100 + currentStageContribution) / totalStages
        : 0;

    return {
        totalStages,
        completedStages: completedStagesCount,
        currentStageSlug,
        overallPercentage: Math.min(100, Math.round(overallPercentage * 100) / 100),
        currentStage,
        projectStatus,
        stageDetails,
    };
};

export const selectStageDocumentChecklist = (
    state: DialecticStateValues,
    progressKey: string,
    modelId: string
): StageDocumentChecklistEntry[] => {
    const documents = selectDocumentsForStageRun(state, progressKey);
    const checklist: StageDocumentChecklistEntry[] = [];

    for (const compositeKey of Object.keys(documents)) {
        const descriptor = documents[compositeKey];
        if (!descriptor) {
            continue;
        }

        if (descriptor.modelId !== modelId) {
            continue;
        }

        const documentKey = extractLogicalDocumentKeyFromComposite(compositeKey);

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

/**
 * Step 79: Resource-first selectors for document-centric workflows
 * 
 * Component mappings (79.a):
 * - GeneratedContributionCard: Uses selectStageDocumentResource to render edited document content
 *   from stageDocumentContent instead of relying on selectContributionById for editable documents.
 *   Uses selectEditedDocumentByKey for quick document metadata lookups.
 * - SessionContributionsDisplayCard: Uses selectStageDocumentResource to display document summaries
 *   and edited document metadata, ensuring UI never relies on stale dialectic_contributions.
 * 
 * These selectors pull from the normalized resource state (stageDocumentContent) introduced in Step 77,
 * guaranteeing the UI never relies on stale dialectic_contributions for editable documents.
 */

/**
 * Selector to get document resource content from stageDocumentContent.
 * This is the authoritative source for editable document content, replacing
 * dialectic_contributions for document-centric workflows.
 * 
 * The composite key format is: `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`
 * 
 * @param state - The dialectic state values
 * @param sessionId - The session identifier
 * @param stageSlug - The stage slug
 * @param iterationNumber - The iteration number
 * @param modelId - The model identifier
 * @param documentKey - The document key
 * @returns The document resource content state, or undefined if not found
 */
export const selectStageDocumentResource = (
    state: DialecticStateValues,
    sessionId: string,
    stageSlug: string,
    iterationNumber: number,
    modelId: string,
    documentKey: string
): StageDocumentContentState | undefined => {
    const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    return state.stageDocumentContent[compositeKey];
};

/**
 * Selector to get edited document metadata by composite key.
 * Provides quick access to document resources without requiring all key components.
 * 
 * The composite key format is: `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`
 * 
 * @param state - The dialectic state values
 * @param compositeKey - The composite key for the document resource
 * @returns The document resource content state, or undefined if not found
 */
export const selectEditedDocumentByKey = (
    state: DialecticStateValues,
    compositeKey: string
): StageDocumentContentState | undefined => {
    return state.stageDocumentContent[compositeKey];
};

/**
 * Selector to get the complete EditedDocumentResource metadata from stageDocumentResources.
 * This returns the full resource metadata including source_contribution_id, updated_at,
 * resource_type, document_key, id, storage_path, mime_type, size_bytes, created_at,
 * and all other EditedDocumentResource fields.
 * 
 * This is required so UI components (Steps 84-85) can display resource metadata like
 * source_contribution_id and last modified timestamps.
 * 
 * The composite key format is: `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`
 * 
 * @param state - The dialectic state values
 * @param sessionId - The session identifier
 * @param stageSlug - The stage slug
 * @param iterationNumber - The iteration number
 * @param modelId - The model identifier
 * @param documentKey - The document key
 * @returns The complete EditedDocumentResource object, or undefined if not found
 */
export const selectStageDocumentResourceMetadata = (
    state: DialecticStateValues,
    sessionId: string,
    stageSlug: string,
    iterationNumber: number,
    modelId: string,
    documentKey: string
): EditedDocumentResource | undefined => {
    const compositeKey = `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`;
    return state.stageDocumentResources[compositeKey];
};

/**
 * Selector to get the complete EditedDocumentResource metadata by composite key.
 * Provides quick access to document resource metadata without requiring all key components.
 * 
 * The composite key format is: `${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`
 * 
 * @param state - The dialectic state values
 * @param compositeKey - The composite key for the document resource
 * @returns The complete EditedDocumentResource object, or undefined if not found
 */
export const selectStageDocumentResourceMetadataByKey = (
    state: DialecticStateValues,
    compositeKey: string
): EditedDocumentResource | undefined => {
    return state.stageDocumentResources[compositeKey];
};

/**
 * Helper to check if a value is a plain record object
 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Helper to convert a value to a plain array
 */
const toPlainArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined) {
        return [];
    }
    return [value];
};

/**
 * Helper to check if a filename is a markdown template
 */
const isMarkdownTemplate = (value: string): boolean => {
    const lower = value.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
};

/**
 * Extract markdown document keys from a single rule object
 */
const extractMarkdownDocumentKeysFromRule = (
    rawRule: unknown,
    documentKeys: Set<string>
): void => {
    if (!isPlainRecord(rawRule)) {
        return;
    }

    const register = (documentKey: unknown) => {
        if (typeof documentKey === 'string' && documentKey.trim().length > 0) {
            documentKeys.add(documentKey);
        }
    };

    // Handle legacy document_key/file_type at root level
    const legacyDocumentKey = rawRule['document_key'];
    const legacyFileType = rawRule['file_type'];
    if (legacyFileType === 'markdown') {
        register(legacyDocumentKey);
    }

    // Helper to evaluate a document entry
    const evaluateDocumentEntry = (entry: unknown) => {
        if (!isPlainRecord(entry)) {
            return;
        }

        const documentKey = entry['document_key'];
        const fileType = entry['file_type'];
        const templateFilename = entry['template_filename'];

        if (fileType === 'markdown') {
            register(documentKey);
            return;
        }

        if (typeof templateFilename === 'string' && isMarkdownTemplate(templateFilename)) {
            register(documentKey);
        }
    };

    // Handle documents array
    const documents = toPlainArray(rawRule['documents']);
    documents.forEach(evaluateDocumentEntry);

    // Handle assembled_json array
    const assembledJson = toPlainArray(rawRule['assembled_json']);
    assembledJson.forEach(evaluateDocumentEntry);

    // Handle files_to_generate array
    const filesToGenerate = toPlainArray(rawRule['files_to_generate']);
    filesToGenerate.forEach((entry) => {
        if (!isPlainRecord(entry)) {
            return;
        }

        const documentKey = entry['from_document_key'];
        const templateFilename = entry['template_filename'];
        if (
            typeof documentKey === 'string' &&
            documentKey.trim().length > 0 &&
            typeof templateFilename === 'string' &&
            isMarkdownTemplate(templateFilename)
        ) {
            register(documentKey);
        }
    });
};

/**
 * Selector to get valid markdown document keys for a stage.
 * Returns a Set<string> containing all document keys that are markdown files,
 * extracted from the stage's recipe steps outputs_required fields.
 * 
 * This selector filters recipe steps to identify valid markdown document keys,
 * handling both legacy document_key/file_type patterns and modern structured outputs.
 * 
 * @param state - The dialectic state values
 * @param stageSlug - The stage slug to get markdown document keys for
 * @returns A Set<string> containing valid markdown document keys for the stage
 */
export const selectValidMarkdownDocumentKeys = createSelector(
    [selectRecipeSteps],
    (steps): Set<string> => {
        const documentKeys = new Set<string>();

        steps.forEach((step) => {
            if (!step.outputs_required) {
                return;
            }

            let rawOutputs: unknown = step.outputs_required;

            // Handle string JSONB - parse if needed
            if (typeof rawOutputs === 'string') {
                try {
                    rawOutputs = JSON.parse(rawOutputs);
                } catch {
                    // If parsing fails, skip this step
                    return;
                }
            }

            // Convert to array and process each rule
            const rules = toPlainArray(rawOutputs);
            rules.forEach((rule) => {
                extractMarkdownDocumentKeysFromRule(rule, documentKeys);
            });
        });

        return documentKeys;
    }
);