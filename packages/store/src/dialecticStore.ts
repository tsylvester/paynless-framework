import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { 
  type ApiError, 
  type ApiResponse, 
  type DialecticProject, 
  type CreateProjectPayload, 
  type DialecticStateValues, 
  type DialecticStore, 
  type StartSessionPayload,
  type DialecticSession,
  type UpdateProjectInitialPromptPayload,
  type DialecticStage,
  type SubmitStageResponsesPayload,
  type SubmitStageResponsesResponse,
  type SaveContributionEditPayload,
  type SaveContributionEditSuccessResponse,
  type DialecticContribution,
  type DialecticDomain,
  type UpdateSessionModelsPayload,
  type GenerateContributionsPayload,
  type GenerateContributionsResponse,
  type DialecticProjectRow,
  type DialecticLifecycleEvent,
  type StageDocumentCompositeKey,
  type ContributionGenerationStartedPayload,
  type DialecticContributionStartedPayload,
  type ContributionGenerationRetryingPayload,
  type DialecticContributionReceivedPayload,
  type ContributionGenerationFailedPayload,
  type ContributionGenerationCompletePayload,
  type ContributionGenerationContinuedPayload,
  type DialecticProgressUpdatePayload,
  type ProgressData,
  type PlannerStartedPayload,
  type DocumentStartedPayload,
  type DocumentChunkCompletedPayload,
	type DocumentCompletedPayload,
	type RenderCompletedPayload,
	type JobFailedPayload,
	type SetFocusedStageDocumentPayload,
	type ClearFocusedStageDocumentPayload,
  isContributionStatus,
  ExportProjectResponse,
  StageDocumentVersionInfo,
  StageDocumentContentState,
  type SubmitStageDocumentFeedbackPayload,
  type ListStageDocumentsPayload,
  StartSessionSuccessResponse,
  type EditedDocumentResource,
} from '@paynless/types';
import { api } from '@paynless/api';
import { useWalletStore } from './walletStore';
import { useAiStore } from './aiStore';
import { selectActiveChatWalletInfo } from './walletStore.selectors';
import { isAssembledPrompt, logger } from '@paynless/utils';
import {
	ensureStageDocumentContentLogic,
	flushStageDocumentDraftLogic,
	reapplyDraftToNewBaselineLogic,
	recordStageDocumentDraftLogic,
	upsertStageDocumentVersionLogic,
	beginStageDocumentEditLogic,
	updateStageDocumentDraftLogic,
	flushStageDocumentDraftActionLogic,
	clearStageDocumentDraftLogic,
	fetchStageDocumentContentLogic,
	handlePlannerStartedLogic,
	handleDocumentStartedLogic,
	handleDocumentChunkCompletedLogic,
	handleDocumentCompletedLogic,
	handleRenderCompletedLogic,
	handleJobFailedLogic,
	fetchStageDocumentFeedbackLogic,
	submitStageDocumentFeedbackLogic,
	selectStageDocumentFeedbackLogic,
	hydrateStageProgressLogic,
	createVersionInfo,
} from './dialecticStore.documents';

type FocusedDocumentKeyParams = Pick<SetFocusedStageDocumentPayload, 'sessionId' | 'stageSlug' | 'modelId'>;

const buildFocusedDocumentKey = ({ sessionId, stageSlug, modelId }: FocusedDocumentKeyParams): string =>
	`${sessionId}:${stageSlug}:${modelId}`;

export const initialDialecticStateValues: DialecticStateValues = {
	domains: [],
	isLoadingDomains: false,
	domainsError: null,
	selectedDomain: null,

	// New initial state for Domain Overlays
	selectedStageAssociation: null,
	availableDomainOverlays: [],
	isLoadingDomainOverlays: false,
	domainOverlaysError: null,
	selectedDomainOverlayId: null,
	// End new initial state for Domain Overlays

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

	contributionContentCache: {},

	allSystemPrompts: [],

	// Project cloning states
	isCloningProject: false,
	cloneProjectError: null,

	// Project exporting states
	isExportingProject: false,
	exportProjectError: null,

	// Added for IPS update
	isUpdatingProjectPrompt: false,
	isUploadingProjectResource: false,
	uploadProjectResourceError: null,
	selectedModelIds: [],

	// Cache for initial prompt file content, mapping resourceId to its state
	initialPromptContentCache: {},

	// New state for process templates
	currentProcessTemplate: null,
	isLoadingProcessTemplate: false,
	processTemplateError: null,

	// States for generating contributions
	contributionGenerationStatus: "idle",
	generateContributionsError: null,
	generatingSessions: {},

	isSubmittingStageResponses: false,
	submitStageResponsesError: null,

	isSavingContributionEdit: false,
	saveContributionEditError: null,

	activeContextProjectId: null,
	activeContextSessionId: null,
	activeContextStage: null,
	activeStageSlug: null,

	activeSeedPrompt: null,

	// New initial states for single session fetching
	activeSessionDetail: null,
	isLoadingActiveSessionDetail: false,
	activeSessionDetailError: null,

	// States for updating session models
	isUpdatingSessionModels: false,
	updateSessionModelsError: null,

	// ADDED: Initial states for fetching feedback file content
	currentFeedbackFileContent: null,
	isFetchingFeedbackFileContent: false,
	fetchFeedbackFileContentError: null,

  activeDialecticWalletId: null,

	sessionProgress: {},

	// Recipe hydration and per-stage-run progress
	recipesByStageSlug: {},
	stageRunProgress: {},
	focusedStageDocument: {},
	stageDocumentContent: {},
	stageDocumentResources: {},
	stageDocumentVersions: {},
	stageDocumentFeedback: {},
	isLoadingStageDocumentFeedback: false,
	stageDocumentFeedbackError: null,
	isSubmittingStageDocumentFeedback: false,
	submitStageDocumentFeedbackError: null,
};

export type DialecticState = DialecticStateValues & DialecticStore;

export const selectGeneratingSessionsForSession = (state: DialecticState, sessionId: string): string[] => {
  return state.generatingSessions[sessionId] || [];
};

export const useDialecticStore = create<DialecticStore>()(
  immer((set, get) => {


    const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
      `${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

    const upsertStageDocumentVersion = (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
			info: StageDocumentVersionInfo,
		): void => {
			upsertStageDocumentVersionLogic(state, key, info);
		};

		const ensureStageDocumentContent = (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
			seed?: { baselineMarkdown?: string; version?: StageDocumentVersionInfo },
		): StageDocumentContentState => {
			return ensureStageDocumentContentLogic(state, key, seed);
		};

		const recordStageDocumentDraft = (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
			draftMarkdown: string,
		): void => {
			recordStageDocumentDraftLogic(state, key, draftMarkdown);
		};

		const flushStageDocumentDraft = (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
		): void => {
			flushStageDocumentDraftLogic(state, key);
		};

		const reapplyDraftToNewBaseline = (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
			newBaseline: string,
			newVersion: StageDocumentVersionInfo,
		) => {
			reapplyDraftToNewBaselineLogic(state, key, newBaseline, newVersion);
		};

    return {
      ...initialDialecticStateValues,

      _handleProgressUpdate: (event: DialecticProgressUpdatePayload) => {
        logger.info(`[DialecticStore] Handling progress update for session ${event.sessionId}`, { event });
        set(state => {
          const progress: ProgressData = {
            current_step: event.current_step,
            total_steps: event.total_steps,
            message: event.message,
          };
          state.sessionProgress[event.sessionId] = progress;
        });
    },

    fetchDomains: async () => {
    set({ isLoadingDomains: true, domainsError: null });
    logger.info('[DialecticStore] Fetching dialectic domains...');
    try {
      const response = await api.dialectic().listDomains();
      if (response.error) {
        logger.error('[DialecticStore] Error fetching domains:', { errorDetails: response.error });
        set({ domains: [], isLoadingDomains: false, domainsError: response.error });
      } else {
        const domains = response.data || [];
        logger.info('[DialecticStore] Successfully fetched domains:', { domains });
        set({
          domains,
          isLoadingDomains: false,
          domainsError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching domains',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching domains:', { errorDetails: networkError });
      set({ domains: [], isLoadingDomains: false, domainsError: networkError });
    }
  },

	setSelectedDomain: (domain: DialecticDomain | null) => {
		logger.info("[DialecticStore] Setting selected domain", { domain });
		set({ selectedDomain: domain });
	},

	setSelectedDomainOverlayId: (id: string | null) => {
		logger.info(
			`[DialecticStore] Setting selected domain overlay ID to: ${id}`,
		);
		set({ selectedDomainOverlayId: id });
	},

	setSelectedStageAssociation: (stage: DialecticStage | null) => {
		logger.info(
			`[DialecticStore] Setting selected stage association to: ${stage?.slug ?? "null"}`,
		);
		set({
			selectedStageAssociation: stage,
			// When stage selection changes, clear previously fetched overlays and any related errors
			availableDomainOverlays: [],
			domainOverlaysError: null,
			isLoadingDomainOverlays: false, // Reset loading state for overlays
		});
	},

	fetchAvailableDomainOverlays: async (stageAssociation: DialecticStage) => {
		set({
			isLoadingDomainOverlays: true,
			domainOverlaysError: null,
			availableDomainOverlays: [],
			selectedStageAssociation: stageAssociation,
		});
		logger.info(
			`[DialecticStore] Fetching available domain overlays for stage: ${stageAssociation.slug}`,
		);
		try {
			const response = await api
				.dialectic()
				.listAvailableDomainOverlays({
					stageAssociation: stageAssociation.slug,
				});

			if (response.error) {
				logger.error("[DialecticStore] Error fetching domain overlays:", {
					stageAssociation: stageAssociation.slug,
					errorDetails: response.error,
				});
				set({
					availableDomainOverlays: [],
					isLoadingDomainOverlays: false,
					domainOverlaysError: response.error,
				});
			} else {
				const descriptors = response.data || [];
				logger.info("[DialecticStore] Raw descriptors received from API:", {
					descriptors,
				});
				logger.info("[DialecticStore] Successfully fetched domain overlays:", {
					stageAssociation: stageAssociation.slug,
					count: descriptors.length,
				});
				set({
					availableDomainOverlays: descriptors,
					isLoadingDomainOverlays: false,
					domainOverlaysError: null,
				});
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching domain overlays",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error fetching domain overlays:", {
				stageAssociation: stageAssociation.slug,
				errorDetails: networkError,
			});
			set({
				availableDomainOverlays: [],
				isLoadingDomainOverlays: false,
				domainOverlaysError: networkError,
			});
		}
	},

	fetchDialecticProjects: async () => {
		set({ isLoadingProjects: true, projectsError: null });
		logger.info("[DialecticStore] Fetching dialectic projects...");
		try {
			// logger.warn('[DialecticStore] listProjects API method not yet implemented. Simulating empty fetch.');
			const response = await api.dialectic().listProjects();
			if (response.error) {
				logger.error("[DialecticStore] Error fetching projects:", {
					errorDetails: response.error,
				});
				set({
					projects: [],
					isLoadingProjects: false,
					projectsError: response.error,
				});
			} else {
				// response.data is expected to be DialecticProject[] or undefined/null
				const projectsArray = Array.isArray(response.data) ? response.data : []; // Default to empty array if data is not an array (e.g., null/undefined)
				logger.info("[DialecticStore] Successfully fetched projects:", {
					projects: projectsArray,
				});
				set({
					projects: projectsArray,
					isLoadingProjects: false,
					projectsError: null,
				});
			}
			// set({ projects: [], isLoadingProjects: false, projectsError: null });
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching projects",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error fetching projects:", {
				errorDetails: networkError,
			});
			set({
				projects: [],
				isLoadingProjects: false,
				projectsError: networkError,
			});
		}
	},

	fetchDialecticProjectDetails: async (projectId: string) => {
		set({ isLoadingProjectDetail: true, projectDetailError: null });
		logger.info(
			`[DialecticStore] Fetching project details for project ID: ${projectId}`,
		);
		try {
			const response = await api.dialectic().getProjectDetails(projectId);
			if (response.error) {
				logger.error("[DialecticStore] Error fetching project details:", {
					projectId,
					errorDetails: response.error,
				});
				set({
					currentProjectDetail: null,
					isLoadingProjectDetail: false,
					projectDetailError: response.error,
				});
			} else {
				logger.info("[DialecticStore] Successfully fetched project details:", {
					projectId,
					project: response.data,
				});

				const projectData = response.data;
				if (projectData && projectData.dialectic_sessions) {
					projectData.dialectic_sessions = projectData.dialectic_sessions.map(
						(session) => ({
							...session,
							dialectic_contributions: session.dialectic_contributions || [], // Default to empty array
							feedback: session.feedback || [], // Default to empty array for feedback
						}),
					);
				}

				set({
					currentProjectDetail: projectData,
					isLoadingProjectDetail: false,
					projectDetailError: null,
				});

				// Set active context and clear selected models
				get().setActiveDialecticContext({
					projectId: projectData ? projectData.id : null,
					sessionId: null,
					stage: null,
				});
				get().setSelectedModelIds([]);

				if (projectData?.process_template_id) {
					logger.info(
						`[DialecticStore] Project has process template ID. Fetching template...`,
						{ templateId: projectData.process_template_id },
					);
					await get().fetchProcessTemplate(projectData.process_template_id);
				} else {
					logger.warn(
						`[DialecticStore] Project details fetched, but no process template ID found.`,
					);
				}
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching project details",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error fetching project details:", {
				projectId,
				errorDetails: networkError,
			});
			set({
				currentProjectDetail: null,
				isLoadingProjectDetail: false,
				projectDetailError: networkError,
			});
		}
	},

	fetchProcessTemplate: async (templateId: string) => {
		set({ isLoadingProcessTemplate: true, processTemplateError: null });
		logger.info(`[DialecticStore] Fetching process template...`, {
			templateId,
		});
		try {
			const response = await api
				.dialectic()
				.fetchProcessTemplate({ templateId });
			if (response.error) {
				logger.error(`[DialecticStore] Error fetching process template`, {
					templateId,
					error: response.error,
				});
				set({
					isLoadingProcessTemplate: false,
					processTemplateError: response.error,
				});
			} else {
				logger.info(`[DialecticStore] Successfully fetched process template`, {
					templateId,
					template: response.data,
				});
				set({
					isLoadingProcessTemplate: false,
					currentProcessTemplate: response.data || null,
				});

				const { currentProjectDetail } = get();
				const template = response.data;

				if (!currentProjectDetail || !template?.stages) {
					logger.warn(
						"[DialecticStore] Cannot determine active stage without project details or template stages.",
					);
					return;
				}

				const latestSession = (currentProjectDetail.dialectic_sessions || [])
					.slice() // Create a shallow copy before sorting
					.sort(
						(a, b) =>
							new Date(b.created_at).getTime() -
							new Date(a.created_at).getTime(),
					)[0];

				let stageToSet: DialecticStage | undefined = undefined;

				if (latestSession && latestSession.current_stage_id) {
					// Case: An active session exists. Set stage from the session.
					stageToSet = template.stages.find(
						(s) => s.id === latestSession.current_stage_id,
					);
					if (stageToSet) {
						logger.info(
							`[DialecticStore] Active session found. Setting stage to: ${stageToSet.slug}`,
						);
					} else {
						logger.warn(
							`[DialecticStore] Could not find stage with ID ${latestSession.current_stage_id} in the template.`,
						);
					}
				} else {
					// Case: No sessions. Use the template's starting stage.
					if (template.starting_stage_id) {
						stageToSet = template.stages.find(
							(s) => s.id === template.starting_stage_id,
						);
						if (stageToSet) {
							logger.info(
								`[DialecticStore] No active session. Setting initial stage to: ${stageToSet.slug}`,
							);
						} else {
							logger.warn(
								`[DialecticStore] Could not find starting stage with ID ${template.starting_stage_id} in the template.`,
							);
						}
					}
				}

				if (stageToSet) {
					set({ activeContextStage: stageToSet });
				} else if (!get().activeContextStage) {
					// Fallback: if no stage could be determined and none is set, set to the first stage in the template
					const firstStage = template.stages[0];
					if (firstStage) {
						logger.info(
							`[DialecticStore] Fallback: setting stage to the first available stage: ${firstStage.slug}`,
						);
						set({ activeContextStage: firstStage });
					}
				}
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching the process template",
				code: "NETWORK_ERROR",
			};
			logger.error(
				"[DialecticStore] Network error fetching process template:",
				{ templateId, errorDetails: networkError },
			);
			set({
				currentProcessTemplate: null,
				isLoadingProcessTemplate: false,
				processTemplateError: networkError,
			});
		}
	},

  createDialecticProject: async (payload: CreateProjectPayload): Promise<ApiResponse<DialecticProjectRow>> => {
    set({ isCreatingProject: true, createProjectError: null });
    logger.info('[DialecticStore] Creating new dialectic project with payload:', { payload });
    
    // The API client now expects FormData
    const formData = new FormData();
    formData.append('action', 'createProject');
    formData.append('projectName', payload.projectName);
    formData.append('selectedDomainId', payload.selectedDomainId);
    
    if (payload.initialUserPrompt) {
        formData.append('initialUserPromptText', payload.initialUserPrompt);
    }
    if (payload.selectedDomainOverlayId) {
        formData.append('selectedDomainOverlayId', payload.selectedDomainOverlayId);
    }
    if (payload.promptFile) {
        formData.append('promptFile', payload.promptFile);
    }

    try {
        const response: ApiResponse<DialecticProjectRow> = await api.dialectic().createProject(formData);

        if (response.error) {
            logger.error('[DialecticStore] Error creating project:', { errorDetails: response.error });
            set({ isCreatingProject: false, createProjectError: response.error });
        } else {
            logger.info('[DialecticStore] Successfully created project:', { project: response.data });
            // Add the new project to the start of the projects list
            set(state => ({
                projects: [response.data, ...state.projects],
                isCreatingProject: false,
                createProjectError: null,
                currentProjectDetail: response.data, // Also set as current
            }));
        }
        return response;
    } catch (error: unknown) {
        const networkError: ApiError = {
            message: error instanceof Error ? error.message : 'An unknown network error occurred',
            code: 'NETWORK_ERROR',
        };
        logger.error('[DialecticStore] Network error creating project:', { errorDetails: networkError });
        set({ isCreatingProject: false, createProjectError: networkError });
        return { error: networkError, status: 0 };
    }
  },

	startDialecticSession: async (
		payload: StartSessionPayload,
	): Promise<ApiResponse<StartSessionSuccessResponse>> => {
		set({ isStartingSession: true, startSessionError: null });
		logger.info("[DialecticStore] Starting dialectic session...", {
			sessionPayload: payload,
		});
		try {
			const response = await api.dialectic().startSession(payload);
			if (response.error) {
				logger.error("[DialecticStore] Error starting session:", {
					errorDetails: response.error,
				});
				set({ isStartingSession: false, startSessionError: response.error });
				return { error: response.error, status: response.status };
			}

			// The API response is `StartSessionSuccessResponse` which is a `DialecticSession` with an added `seedPrompt`.
			// The `isAssembledPrompt` guard confirms the shape of the nested `seedPrompt` object.
			if (
				response.data &&
				"seedPrompt" in response.data &&
				isAssembledPrompt(response.data.seedPrompt)
			) {
				// Construct a new, correctly typed object to satisfy the linter.
				const successData: StartSessionSuccessResponse = {
					...response.data,
					seedPrompt: response.data.seedPrompt,
				};

				logger.info("[DialecticStore] Successfully started session:", {
					sessionDetails: successData,
				});
				set({
					isStartingSession: false,
					startSessionError: null,
					activeSeedPrompt: successData.seedPrompt,
				});

				// Refetch project details to get updated session list.
				if (successData.project_id) {
					logger.info(
						`[DialecticStore] Session started for project ${successData.project_id}. Refetching project details.`,
					);
					await get().fetchDialecticProjectDetails(successData.project_id);
				} else {
					logger.info(
						"[DialecticStore] Session started, but no project_id in response. Refetching project list.",
					);
					await get().fetchDialecticProjects();
				}
				return { data: successData, status: response.status };
			} else {
				const error: ApiError = {
					message:
						"Invalid or missing seedPrompt in startSession response",
					code: "INVALID_SEED_PROMPT",
				};
				logger.error("[DialecticStore] Invalid session response:", {
					errorDetails: error,
					responseData: response.data,
				});
				set({ isStartingSession: false, startSessionError: error });
				return { error: error, status: response.status || 0 };
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while starting session",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error starting session:", {
				errorDetails: networkError,
			});
			set({ isStartingSession: false, startSessionError: networkError });
			return { error: networkError, status: 0 };
		}
	},

	fetchAIModelCatalog: async () => {
		set({ isLoadingModelCatalog: true, modelCatalogError: null });
		logger.info("[DialecticStore] Fetching AI model catalog...");
		try {
			const response = await api.dialectic().listModelCatalog();
			if (response.error) {
				logger.error("[DialecticStore] Error fetching AI model catalog:", {
					errorDetails: response.error,
				});
				set({
					modelCatalog: [],
					isLoadingModelCatalog: false,
					modelCatalogError: response.error,
				});
			} else {
				logger.info("[DialecticStore] Successfully fetched AI model catalog:", {
					catalog: response.data,
				});
				set({
					modelCatalog: response.data || [],
					isLoadingModelCatalog: false,
					modelCatalogError: null,
				});
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching AI model catalog",
				code: "NETWORK_ERROR",
			};
			logger.error(
				"[DialecticStore] Network error fetching AI model catalog:",
				{ errorDetails: networkError },
			);
			set({
				modelCatalog: [],
				isLoadingModelCatalog: false,
				modelCatalogError: networkError,
			});
		}
	},

	_resetForTesting: () => {
		set(initialDialecticStateValues);
		logger.info("[DialecticStore] Reset for testing.");
	},

	resetCreateProjectError: () => {
		logger.info("[DialecticStore] Resetting createProjectError.");
		set({ createProjectError: null });
	},

	resetProjectDetailsError: () => {
		logger.info("[DialecticStore] Resetting projectDetailError.");
		set({ projectDetailError: null });
	},

  fetchContributionContent: async (contributionId: string) => {
    // A placeholder contribution is generated on the client-side for immediate UI feedback.
    // Its ID will always start with "placeholder-". It does not exist in the backend,
    // so we must prevent any attempt to fetch its content.
    if (contributionId.startsWith('placeholder-')) {
      return;
    }

    const currentCache = get().contributionContentCache;
    const entry = currentCache[contributionId];

		// 1. Check cache for already loaded, non-error content
		if (entry && entry.content && !entry.error) {
			logger.info(
				`[DialecticStore] Content for ${contributionId} found in cache.`,
			);
			if (entry.isLoading) {
				set((state) => ({
					contributionContentCache: {
						...state.contributionContentCache,
						[contributionId]: {
							...state.contributionContentCache[contributionId],
							isLoading: false,
						},
					},
				}));
			}
			return;
		}

		// 2. Set loading state and clear previous error
		logger.info(
			`[DialecticStore] Fetching content data directly for ${contributionId}.`,
		);
		set((state) => {
			const existingEntryForId = state.contributionContentCache[contributionId];
			return {
				contributionContentCache: {
					...state.contributionContentCache,
					[contributionId]: {
						...(existingEntryForId || {}),
						isLoading: true,
						error: null,
						content: undefined,
					},
				},
			};
		});

		try {
			logger.info(
				`[DialecticStore] fetchContributionContent: Attempting API call for ${contributionId}`,
			);
			const response = await api
				.dialectic()
				.getContributionContentData(contributionId);

			if (response.error || !response.data) {
				const errorDetail: ApiError = response.error || {
					message: "Failed to fetch contribution content, no data returned.",
					code: "NO_DATA_RETURNED",
				};
				logger.error(
					"[DialecticStore] Error fetching contribution content data directly:",
					{ contributionId, error: errorDetail },
				);
				set((state) => ({
					contributionContentCache: {
						...state.contributionContentCache,
						[contributionId]: {
							...state.contributionContentCache[contributionId],
							isLoading: false,
							error: errorDetail,
							content: undefined, // Ensure content is undefined on error
						},
					},
				}));
				return;
			}

			// Successfully fetched content
			const { content, mimeType, sizeBytes, fileName } = response.data;
			logger.info(
				`[DialecticStore] Successfully fetched content data directly for ${contributionId}`,
				{ fileName, mimeType },
			);
			set((state) => ({
				contributionContentCache: {
					...state.contributionContentCache,
					[contributionId]: {
						...state.contributionContentCache[contributionId], // Preserve other fields if any, though most are set here
						isLoading: false,
						error: null,
						content: content,
						mimeType: mimeType,
						sizeBytes: sizeBytes,
						fileName: fileName,
					},
				},
			}));
		} catch (e: unknown) {
			const networkError: ApiError = {
				message:
					e instanceof Error
						? e.message
						: "A network error occurred while fetching contribution content.",
				code: "NETWORK_ERROR",
			};
			logger.error(
				"[DialecticStore] Network error fetching contribution content data directly:",
				{ contributionId, error: networkError },
			);
			set((state) => ({
				contributionContentCache: {
					...state.contributionContentCache,
					[contributionId]: {
						...state.contributionContentCache[contributionId], // Preserve other fields if any
						isLoading: false,
						error: networkError,
						content: undefined, // Ensure content is undefined on error
					},
				},
			}));
		}
	},

	deleteDialecticProject: async (
		projectId: string,
	): Promise<ApiResponse<void>> => {
		// Reset any previous global project error, as this operation is specific.
		// Individual errors for this action will be handled by the component using the returned ApiResponse.
		// However, we should clear the main projectsError if it was related to fetching,
		// as a successful delete might change the context.
		set({ projectsError: null });
		logger.info(`[DialecticStore] Deleting project with ID: ${projectId}`);
		try {
			const response = await api.dialectic().deleteProject({ projectId });
			if (response.error) {
				logger.error("[DialecticStore] Error deleting project:", {
					projectId,
					errorDetails: response.error,
				});
				// Set projectsError here so UI can react to a failed delete if needed for global error display
				set({ projectsError: response.error });
			} else {
				logger.info("[DialecticStore] Successfully deleted project:", {
					projectId,
				});
				// Remove the project from the local state
				set((state) => ({
					projects: state.projects.filter((p) => p.id !== projectId),
					projectsError: null, // Clear error on success
				}));
			}
			return response;
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while deleting project",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error deleting project:", {
				projectId,
				errorDetails: networkError,
			});
			set({ projectsError: networkError }); // Set global projects error for network issues
			return { error: networkError, status: 0 };
		}
	},

	cloneDialecticProject: async (
		projectId: string,
	): Promise<ApiResponse<DialecticProject>> => {
		set({ isCloningProject: true, cloneProjectError: null });
		logger.info(`[DialecticStore] Cloning project with ID: ${projectId}`);
		try {
			const response = await api.dialectic().cloneProject({ projectId });
			if (response.error) {
				logger.error("[DialecticStore] Error cloning project:", {
					projectId,
					errorDetails: response.error,
				});
				set({ isCloningProject: false, cloneProjectError: response.error });
			} else {
				logger.info("[DialecticStore] Successfully cloned project:", {
					originalProjectId: projectId,
					newProject: response.data,
				});
				set({ isCloningProject: false, cloneProjectError: null });
				await get().fetchDialecticProjects(); // Refetch projects list
			}
			return response;
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while cloning project",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error cloning project:", {
				projectId,
				errorDetails: networkError,
			});
			set({ isCloningProject: false, cloneProjectError: networkError });
			return { error: networkError, status: 0 };
		}
	},

	exportDialecticProject: async (
		projectId: string,
	): Promise<ApiResponse<ExportProjectResponse>> => {
		set({ isExportingProject: true, exportProjectError: null });
		logger.info(`[DialecticStore] Exporting project with ID: ${projectId}`);
		try {
			const response: ApiResponse<ExportProjectResponse> = await api
				.dialectic()
				.exportProject({ projectId });
			if (response.error) {
				logger.error("[DialecticStore] Error exporting project:", {
					projectId,
					errorDetails: response.error,
				});
				set({ isExportingProject: false, exportProjectError: response.error });
				return { error: response.error, status: response.status };
			}

			const data = response.data;
			const hasUrl = !!data?.export_url;
			const hasName = !!data?.file_name;
			if (!hasUrl || !hasName) {
				const err: ApiError = { code: hasUrl ? 'MISSING_FILE_NAME' : 'MALFORMED_EXPORT_RESPONSE', message: hasUrl ? 'Missing file name' : 'Missing export data' };
				logger.error('[DialecticStore] Malformed export response (missing required fields).', { projectId, exportData: data, errorDetails: err });
				set({ isExportingProject: false, exportProjectError: err });
				return { error: err, status: 500 };
			}

			logger.info("[DialecticStore] Successfully requested project export:", {
				projectId,
				exportDetails: data,
			});
			set({ isExportingProject: false, exportProjectError: null });
			return { data: data, status: response.status || 200 };
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while exporting project",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error exporting project:", {
				projectId,
				errorDetails: networkError,
			});
			set({ isExportingProject: false, exportProjectError: networkError });
			return { error: networkError, status: 503 };
		}
	},

  updateDialecticProjectInitialPrompt: async (payload: UpdateProjectInitialPromptPayload): Promise<ApiResponse<DialecticProjectRow>> => {
    set({ isUpdatingProjectPrompt: true, projectDetailError: null });
    logger.info(`[DialecticStore] Attempting to update initial prompt for project: ${payload.projectId}`);
    try {
      const response: ApiResponse<DialecticProjectRow> = await api.dialectic().updateDialecticProjectInitialPrompt(payload);
      if (response.error || !response.data) {
        const error: ApiError = response.error || { message: 'No data returned from update initial prompt', code: 'UNKNOWN_ERROR' };
        logger.error('[DialecticStore] Failed to update initial prompt:', { errorDetails: error });
        set({ isUpdatingProjectPrompt: false, projectDetailError: error });
        return { data: undefined, error, status: response.status || 0 };
      }
      logger.info(`[DialecticStore] Successfully updated initial prompt for project: ${response.data.id}`);
      set(state => ({
        isUpdatingProjectPrompt: false,
        projectDetailError: null,
        currentProjectDetail: state.currentProjectDetail && state.currentProjectDetail.id === response.data?.id 
          ? response.data 
          : state.currentProjectDetail,
        projects: state.projects.map(p => p.id === response.data?.id ? response.data! : p),
      }));
      return response;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const networkError: ApiError = { message: errMsg, code: 'NETWORK_ERROR' };
      logger.error('[DialecticStore] Network or unexpected error updating initial prompt:', { errorDetails: networkError });
      set({ isUpdatingProjectPrompt: false, projectDetailError: networkError });
      return { data: undefined, error: networkError, status: 0 };
    }
  },

  updateSessionModels: async (payload: UpdateSessionModelsPayload): Promise<ApiResponse<DialecticSession>> => {
    set({ isUpdatingSessionModels: true, updateSessionModelsError: null });
    logger.info('[DialecticStore] Updating session models...', { payload });
    try {
      const response = await api.dialectic().updateSessionModels(payload);
      if (response.error || !response.data) {
        const error: ApiError = response.error || { message: 'No data returned from update session models', code: 'UNKNOWN_ERROR' };
        logger.error('[DialecticStore] Error updating session models:', { errorDetails: error, sessionId: payload.sessionId });
        set({ isUpdatingSessionModels: false, updateSessionModelsError: error });
        return { error, status: response.status || 0, data: undefined };
      } else {
        logger.info('[DialecticStore] Successfully updated session models:', { sessionId: payload.sessionId, updatedSession: response.data });
        const updatedSessionFromApi = response.data;
        set(state => {
          let newCurrentProjectDetail = state.currentProjectDetail;
          if (state.currentProjectDetail && state.currentProjectDetail.dialectic_sessions) {
            const sessionIndex = state.currentProjectDetail.dialectic_sessions.findIndex(
              s => s.id === updatedSessionFromApi.id
            );
            if (sessionIndex !== -1) {
              const newSessions = [...state.currentProjectDetail.dialectic_sessions];
              // Merge: keep existing fields, overwrite with new ones from updatedSessionFromApi
              newSessions[sessionIndex] = {
                ...newSessions[sessionIndex],
                ...updatedSessionFromApi,
              };
              newCurrentProjectDetail = {
                ...state.currentProjectDetail,
                dialectic_sessions: newSessions,
              };
            }
          }
          return {
            currentProjectDetail: newCurrentProjectDetail,
            isUpdatingSessionModels: false,
            updateSessionModelsError: null,
          };
        });
        return { data: updatedSessionFromApi, status: response.status || 200 };
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while updating session models',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error updating session models:', { errorDetails: networkError, sessionId: payload.sessionId });
      set({ isUpdatingSessionModels: false, updateSessionModelsError: networkError });
      return { error: networkError, status: 0, data: undefined };
    }
  },

	setSelectedModelIds: (modelIds: string[]) => {
		logger.info("[DialecticStore] Setting selected model IDs.", { modelIds });
		set({ selectedModelIds: modelIds });
		const activeSessionId = get().activeContextSessionId;
		if (activeSessionId) {
			get()
				.updateSessionModels({
					sessionId: activeSessionId,
					selectedModelIds: modelIds,
				})
				.then((response) => {
					if (response.error) {
						logger.error(
							"[DialecticStore] Post-setSelectedModelIds: Failed to update session models on backend",
							{ sessionId: activeSessionId, error: response.error },
						);
						// Optionally set a specific error for this background update failure if UI needs to react
					}
				})
				.catch((err) => {
					logger.error(
						"[DialecticStore] Post-setSelectedModelIds: Network error during background session model update",
						{ sessionId: activeSessionId, error: err },
					);
				});
		}
	},

	setModelMultiplicity: (modelId: string, count: number) => {
		let newSelectedIds: string[] = [];
		set((state) => {
			const currentSelectedIds = state.selectedModelIds || [];
			const filteredIds = currentSelectedIds.filter((id) => id !== modelId);
			newSelectedIds = [...filteredIds];
			for (let i = 0; i < count; i++) {
				newSelectedIds.push(modelId);
			}
			logger.info(
				`[DialecticStore] Setting multiplicity for model ${modelId} to ${count}.`,
				{ newSelectedIds },
			);
			return { selectedModelIds: newSelectedIds };
		});
		const activeSessionId = get().activeContextSessionId;
		if (activeSessionId) {
			get()
				.updateSessionModels({
					sessionId: activeSessionId,
					selectedModelIds: newSelectedIds,
				})
				.then((response) => {
					if (response.error) {
						logger.error(
							"[DialecticStore] Post-setModelMultiplicity: Failed to update session models on backend",
							{
								sessionId: activeSessionId,
								modelId,
								count,
								error: response.error,
							},
						);
					}
				})
				.catch((err) => {
					logger.error(
						"[DialecticStore] Post-setModelMultiplicity: Network error during background session model update",
						{ sessionId: activeSessionId, modelId, count, error: err },
					);
				});
		}
	},

	resetSelectedModelId: () => {
		logger.info(`[DialecticStore] Resetting selectedModelIds.`);
		set({ selectedModelIds: [] });
	},

	fetchInitialPromptContent: async (resourceId: string) => {
		const cacheEntry = get().initialPromptContentCache[resourceId];

		// Do not fetch if content is already loaded or is currently loading
		if (cacheEntry?.content || cacheEntry?.isLoading) {
			return;
		}

		// Set loading state for this specific resourceId
		set((state) => ({
			initialPromptContentCache: {
				...state.initialPromptContentCache,
				[resourceId]: {
					content: state.initialPromptContentCache[resourceId]?.content, // Preserve existing content
					fileName: state.initialPromptContentCache[resourceId]?.fileName, // Preserve existing fileName
					isLoading: true,
					error: null,
				},
			},
		}));

    logger.info(`[DialecticStore] Fetching initial prompt content for resource ID: ${resourceId}`);
    try {
      const response = await api.dialectic().getProjectResourceContent({ resourceId });
      
      if (response.error || !response.data) {
        const error: ApiError = response.error || { message: 'No data returned while fetching prompt content', code: 'NO_DATA' };
        logger.error('[DialecticStore] Error fetching initial prompt content:', { resourceId, errorDetails: error });
        set(state => ({
          initialPromptContentCache: {
            ...state.initialPromptContentCache,
            [resourceId]: {
              ...state.initialPromptContentCache[resourceId], // Spread existing to keep content/fileName if they were there
              isLoading: false,
              error,
            },
          }
        }));
      } else {
        logger.info('[DialecticStore] Successfully fetched initial prompt content:', { 
          resourceId, 
          fileName: response.data.fileName,
          contentLength: response.data.content?.length 
        });
        set(state => ({
          initialPromptContentCache: {
            ...state.initialPromptContentCache,
            [resourceId]: {
              isLoading: false,
              error: null,
              content: response.data?.content || '',
              fileName: response.data?.fileName || '',
            },
          }
        }));
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching initial prompt content',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching initial prompt content:', { resourceId, errorDetails: networkError });
      set(state => ({
        initialPromptContentCache: {
          ...state.initialPromptContentCache,
          [resourceId]: { // When a network error occurs, create a full entry
            isLoading: false,
            error: networkError,
            content: '', // Provide default empty string for content
            fileName: '', // Provide default empty string for fileName
          },
        }
      }));
    }
  },

	beginStageDocumentEdit: (
		key: StageDocumentCompositeKey,
		initialDraftMarkdown: string,
	) => {
		beginStageDocumentEditLogic(
			get,
			set,
			{
				ensureStageDocumentContent,
				recordStageDocumentDraft,
				upsertStageDocumentVersion,
				reapplyDraftToNewBaseline,
			},
			key,
			initialDraftMarkdown,
		);
	},

	updateStageDocumentDraft: (
		key: StageDocumentCompositeKey,
		draftMarkdown: string,
	) => {
		updateStageDocumentDraftLogic(
			set,
			{
				ensureStageDocumentContent,
				recordStageDocumentDraft,
				upsertStageDocumentVersion,
				reapplyDraftToNewBaseline,
			},
			key,
			draftMarkdown,
		);
	},

	flushStageDocumentDraft: (key: StageDocumentCompositeKey) => {
		flushStageDocumentDraftActionLogic(set, { flushStageDocumentDraft }, key);
	},

	clearStageDocumentDraft: (key: StageDocumentCompositeKey) => {
		clearStageDocumentDraftLogic(set, key);
	},

	fetchStageDocumentContent: async (
		key: StageDocumentCompositeKey,
		resourceId: string,
	) => {
		await fetchStageDocumentContentLogic(
			set,
			{
				ensureStageDocumentContent,
				recordStageDocumentDraft,
				upsertStageDocumentVersion,
				reapplyDraftToNewBaseline,
			},
			key,
			resourceId,
		);
	},

	fetchStageDocumentFeedback: async (key: StageDocumentCompositeKey) => {
		await fetchStageDocumentFeedbackLogic(set, key);
	},

	submitStageDocumentFeedback: async (
		payload: SubmitStageDocumentFeedbackPayload,
	): Promise<ApiResponse<{ success: boolean }>> => {
		return await submitStageDocumentFeedbackLogic(get, set, payload);
	},

	resetSubmitStageDocumentFeedbackError: () => {
		set({ submitStageDocumentFeedbackError: null });
	},

	selectStageDocumentFeedback: (key: StageDocumentCompositeKey) => {
		return selectStageDocumentFeedbackLogic(get, key);
	},

    reset: () => {
		logger.info("[DialecticStore] Resetting store to initial state", {
			storeKeys: Object.keys(initialDialecticStateValues),
		});
		set(initialDialecticStateValues);
	},

  // Internal handler for completion events from notificationStore
  _handleGenerationCompleteEvent: (data: { sessionId: string; projectId: string; [key: string]: unknown }) => {
    logger.info('[DialecticStore] Handling generation complete event', data);
    set(state => {
      // Remove the session from the generating list
      delete state.generatingSessions[data.sessionId];
      
      // If no more sessions are generating, update the overall status
      if (Object.keys(state.generatingSessions).length === 0) {
        state.contributionGenerationStatus = 'idle';
      }
    });
    // Trigger a refetch of the project details to get the new contributions
    get().fetchDialecticProjectDetails(data.projectId);
  },
  
  // NEW: Internal handler for all dialectic lifecycle events from notificationStore
  _handleDialecticLifecycleEvent: (payload: DialecticLifecycleEvent) => {
    logger.info('[DialecticStore] Received lifecycle event from notificationStore:', { payload });
    const handlers = get();
    switch (payload.type) {
        case 'contribution_generation_started':
            handlers._handleContributionGenerationStarted(payload);
            break;
        case 'dialectic_contribution_started':
            handlers._handleDialecticContributionStarted(payload);
            break;
        case 'contribution_generation_retrying':
            handlers._handleContributionGenerationRetrying(payload);
            break;
        case 'dialectic_contribution_received':
            handlers._handleDialecticContributionReceived(payload);
            break;
        case 'contribution_generation_failed':
            handlers._handleContributionGenerationFailed(payload);
            break;
        case 'contribution_generation_complete':
            handlers._handleContributionGenerationComplete(payload);
            break;
        case 'contribution_generation_continued':
            handlers._handleContributionGenerationContinued(payload);
            break;
        case 'dialectic_progress_update':
            handlers._handleProgressUpdate(payload);
            break;
        case 'planner_started':
            handlers._handlePlannerStarted(payload);
            break;
        case 'document_started':
            handlers._handleDocumentStarted(payload);
            break;
        case 'document_chunk_completed':
            handlers._handleDocumentChunkCompleted(payload);
            break;
        case 'document_completed':
            handlers._handleDocumentCompleted(payload);
            break;
        case 'render_completed':
            handlers._handleRenderCompleted(payload);
            break;
        case 'job_failed':
            handlers._handleJobFailed(payload);
            break;
        default:
            logger.warn('[DialecticStore] Received unhandled dialectic lifecycle event', { payload });
    }
  },

  // --- Private Handlers for Lifecycle Events ---
  _handlePlannerStarted: (event: PlannerStartedPayload) => handlePlannerStartedLogic(get, set, event),

  _handleDocumentStarted: (event: DocumentStartedPayload) =>
		handleDocumentStartedLogic(get, set, event),

	_handleDocumentChunkCompleted: (event: DocumentChunkCompletedPayload) =>
		handleDocumentChunkCompletedLogic(get, set, event),

	_handleDocumentCompleted: (event: DocumentCompletedPayload) =>
		handleDocumentCompletedLogic(get, set, event),

	_handleRenderCompleted: (event: RenderCompletedPayload) =>
		handleRenderCompletedLogic(get, set, event),

	_handleJobFailed: (event: JobFailedPayload) => handleJobFailedLogic(get, set, event),

  _handleContributionGenerationStarted: (event: ContributionGenerationStartedPayload) => {
    set({
      contributionGenerationStatus: 'generating',
      generateContributionsError: null,
    });
    // This event is session-wide, but we can also use it to update a specific placeholder
    // if we want immediate feedback per job.
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session?.dialectic_contributions) {
        const placeholder = session.dialectic_contributions.find(c => c.job_id === event.job_id);
        if (placeholder) {
          placeholder.status = 'generating';
        }
      }
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }
    });
  },

  _handleDialecticContributionStarted: (event: DialecticContributionStartedPayload) => {
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session?.dialectic_contributions) {
        // Find placeholder by job_id
        const placeholder = session.dialectic_contributions.find(c => c.job_id === event.job_id);
        if (placeholder) {
          placeholder.status = 'generating';
        }
      }
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }
    });
  },

  _handleContributionGenerationRetrying: (event: ContributionGenerationRetryingPayload) => {
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session?.dialectic_contributions) {
        // Find placeholder by job_id
        const placeholder = session.dialectic_contributions.find(c => c.job_id === event.job_id);
        if (placeholder) {
          placeholder.status = 'retrying';
          placeholder.error = { 
              message: event.error || 'An error occurred during generation. Retrying...',
              code: 'CONTRIBUTION_RETRYING' 
          };
        }
      }
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }
    });
  },

  _handleDialecticContributionReceived: (event: DialecticContributionReceivedPayload) => {
    logger.info('[DialecticStore] Handling contribution received. About to update state.', { event });
    let wasGenerationCompleted = false;
    let projectIdForRefetch: string | null = null;

    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session) {
        projectIdForRefetch = state.currentProjectDetail?.id || null;
      }
      
      if (session?.dialectic_contributions) {
        // Find placeholder by job_id
        const idx = session.dialectic_contributions.findIndex(c => c.job_id === event.job_id);
        
        const newStatus = event.is_continuing ? 'continuing' : 'completed';
        if (isContributionStatus(newStatus)) {
          const newContribution = {
            ...event.contribution,
            status: newStatus,
            job_id: event.job_id,
          };

          if (idx > -1) {
            session.dialectic_contributions[idx] = newContribution;
          } else {
            session.dialectic_contributions.push(newContribution);
          }
        }
      }
      
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }

      // Remove the completed job ID from tracking
      if (state.generatingSessions[event.sessionId] && event.job_id) {
        state.generatingSessions[event.sessionId] = state.generatingSessions[event.sessionId].filter(id => id !== event.job_id);
        
        if (state.generatingSessions[event.sessionId].length === 0) {
          wasGenerationCompleted = true;
          delete state.generatingSessions[event.sessionId];
        }
      }
      
      if (wasGenerationCompleted && Object.keys(state.generatingSessions).length === 0) {
        state.contributionGenerationStatus = 'idle';
      }
    });

    if (wasGenerationCompleted && projectIdForRefetch) {
      logger.info(`[DialecticStore] All jobs for session ${event.sessionId} are complete. Triggering project detail refetch.`);
      get().fetchDialecticProjectDetails(projectIdForRefetch);
    }
  },

  _handleContributionGenerationContinued: (event: ContributionGenerationContinuedPayload) => {
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session?.dialectic_contributions) {
        const placeholderId = `placeholder-${event.sessionId}-${event.contribution.model_id}-${event.contribution.iteration_number}`;
        const idx = session.dialectic_contributions.findIndex(c => c.id.startsWith(placeholderId));

        const continuingStatus = 'continuing';
        if (isContributionStatus(continuingStatus)) {
            let targetContribution: DialecticContribution | undefined;
            if (idx > -1) {
                targetContribution = session.dialectic_contributions[idx];
            } else {
                const realIdx = session.dialectic_contributions.findIndex(c => c.id === event.contribution.id);
                if (realIdx > -1) {
                    targetContribution = session.dialectic_contributions[realIdx];
                }
            }

            if (targetContribution) {
                Object.assign(targetContribution, event.contribution);
                targetContribution.status = continuingStatus;
            } else {
                session.dialectic_contributions.push({
                    ...event.contribution,
                    status: continuingStatus,
                });
            }
        }
      }
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }
      // Do not remove the job_id from tracking, as the generation is still in progress.
    });
  },

  _handleContributionGenerationFailed: (event: ContributionGenerationFailedPayload) => {
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === event.sessionId);
      if (session?.dialectic_contributions) {
        // Find and update placeholder by job_id if a job_id is provided
        if (event.job_id) {
            const placeholder = session.dialectic_contributions.find(c => c.job_id === event.job_id);
            if (placeholder) {
                placeholder.status = 'failed';
                placeholder.error = event.error || { message: 'Generation failed for this specific job.', code: 'JOB_FAILED' };
            }
        } else {
            // Catastrophic failure: Mark all remaining pending/generating placeholders for this session as failed
            session.dialectic_contributions.forEach(c => {
                if (c.status === 'pending' || c.status === 'generating' || c.status === 'retrying') {
                    c.status = 'failed';
                    c.error = event.error || { message: 'Generation failed due to a session-wide error.', code: 'GENERATION_FAILED' };
                }
            });
        }
      }
      // Sync with activeSessionDetail if it's the same session
      if (session && state.activeSessionDetail && state.activeSessionDetail.id === event.sessionId) {
        state.activeSessionDetail = { ...session };
      }
      const sessionJobs = state.generatingSessions[event.sessionId];
      if (event.job_id && Array.isArray(sessionJobs)) {
        state.generatingSessions[event.sessionId] = sessionJobs.filter(jobId => jobId !== event.job_id);
        if (state.generatingSessions[event.sessionId].length === 0) {
          delete state.generatingSessions[event.sessionId];
        }
        state.contributionGenerationStatus = 'failed';
        state.generateContributionsError = event.error || { message: 'Generation failed for this job.', code: 'JOB_FAILED' };
      } else if (!event.job_id) {
        delete state.generatingSessions[event.sessionId];
        state.contributionGenerationStatus = 'failed';
        state.generateContributionsError = event.error || { message: 'Generation failed without a specific error.', code: 'GENERATION_FAILED' };
      }
    });
  },

  _handleContributionGenerationComplete: (event: ContributionGenerationCompletePayload) => {
    set(state => {
      // Remove the session from the generating list
      delete state.generatingSessions[event.sessionId];
      
      // If no more sessions are generating, update the overall status
      if (Object.keys(state.generatingSessions).length === 0) {
        state.contributionGenerationStatus = 'idle';
      }
    });
    // Trigger a refetch of the project details to get the new contributions
    get().fetchDialecticProjectDetails(event.projectId);
  },

  generateContributions: async (payload: GenerateContributionsPayload): Promise<ApiResponse<GenerateContributionsResponse>> => {
    const { sessionId, stageSlug, iterationNumber } = payload;
    logger.info('[DialecticStore] Initiating contributions generation...', { payload });
  
    const { currentProjectDetail, selectedModelIds } = get();
    if (!currentProjectDetail) {
      const error: ApiError = { message: 'No project loaded', code: 'PRECONDITION_FAILED' };
      logger.error('[DialecticStore] Precondition failed: No project loaded.', { payload });
      set({ generateContributionsError: error });
      return { error, status: 400 };
    }
  
    // --- Step 15.b: Immediate UI feedback with placeholders ---
    set(state => {
      const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
      if (session) {
        state.contributionGenerationStatus = 'generating';
        state.generateContributionsError = null;
        if (!session.dialectic_contributions) {
          session.dialectic_contributions = [];
        }
        
        selectedModelIds.forEach((modelId, index) => {
          // Find model details from catalog to get the name
          const modelDetails = state.modelCatalog.find(m => m.id === modelId);
          const tempId = `placeholder-${sessionId}-${modelId}-${iterationNumber}-${index}`;
          const placeholder: DialecticContribution = {
            id: tempId,
            job_id: null, // Initialized to null, will be updated after API call
            session_id: sessionId,
            stage: stageSlug,
            iteration_number: iterationNumber,
            model_id: modelId,
            model_name: modelDetails?.model_name || 'Unknown Model',
            status: 'pending',
            // --- Fill in other required fields with default/null values ---
            user_id: null,
            prompt_template_id_used: null,
            seed_prompt_url: null,
            edit_version: 0,
            is_latest_edit: true,
            original_model_contribution_id: null,
            raw_response_storage_path: null,
            target_contribution_id: null,
            tokens_used_input: null,
            tokens_used_output: null,
            processing_time_ms: null,
            error: null,
            citations: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            contribution_type: null,
            file_name: null,
            storage_bucket: null,
            storage_path: null,
            size_bytes: null,
            mime_type: null,
          };
          if (session.dialectic_contributions) {
            session.dialectic_contributions.push(placeholder);
          }
        });
      }
    });
  
    try {
      // Enrich payload with active walletId from wallet store
      const activeWalletInfo = selectActiveChatWalletInfo(
        useWalletStore.getState(),
        useAiStore.getState().newChatContext
      );
      if (activeWalletInfo && activeWalletInfo.walletId) {
        payload = { ...payload, walletId: activeWalletInfo.walletId };
      }

      const response = await api.dialectic().generateContributions(payload);
  
      if (response.error || !response.data?.job_ids) {
        const error: ApiError = response.error || { message: 'API call succeeded but returned no job_ids', code: 'UNEXPECTED_RESPONSE' };
        logger.error('[DialecticStore] Error generating contributions:', { errorDetails: error });
        set(state => {
          state.contributionGenerationStatus = 'failed';
          state.generateContributionsError = error;
          // --- Mark placeholders as failed ---
          const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
          if (session) {
            session.dialectic_contributions?.forEach(c => {
              if (c.status === 'pending') {
                c.status = 'failed';
                c.error = error;
              }
            });
          }
        });
        return { error, status: response.status };
      }
  
      logger.info('[DialecticStore] Successfully enqueued contributions generation job.', { job_ids: response.data.job_ids });
      set(state => {
        if (!response.data?.job_ids) return;

        // --- Associate job_ids with placeholders ---
        const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
        if (session) {
            const pendingPlaceholders = session.dialectic_contributions?.filter(c => c.status === 'pending' && c.iteration_number === iterationNumber) || [];
            
            // FIX 2: More robust matching
            response.data.job_ids.forEach((jobId, index) => {
                const modelIdForThisJob = selectedModelIds[index];
                const placeholder = pendingPlaceholders.find(p => p.model_id === modelIdForThisJob && !p.job_id);
                if (placeholder) {
                    placeholder.job_id = jobId;
                }
            });
        }
        
        // --- Track the new job IDs ---
        state.generatingSessions = {
          ...state.generatingSessions,
          [sessionId]: [...(state.generatingSessions[sessionId] || []), ...response.data.job_ids],
        };
      });
  
      return { data: response.data, status: response.status };
  
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error generating contributions:', { errorDetails: networkError });
      set(state => {
        state.contributionGenerationStatus = 'failed';
        state.generateContributionsError = networkError;
        // --- Mark placeholders as failed ---
        const session = state.currentProjectDetail?.dialectic_sessions?.find(s => s.id === sessionId);
        if (session) {
          session.dialectic_contributions?.forEach(c => {
            if (c.status === 'pending') {
              c.status = 'failed';
              c.error = networkError;
            }
          });
        }
      });
      return { error: networkError, status: 500 };
    }
  },

	setSubmittingStageResponses: (isSubmitting: boolean) =>
		set({ isSubmittingStageResponses: isSubmitting }),
	setSubmitStageResponsesError: (error: ApiError | null) =>
		set({ submitStageResponsesError: error }),

	setSavingContributionEdit: (isSaving: boolean) =>
		set({ isSavingContributionEdit: isSaving }),
	setSaveContributionEditError: (error: ApiError | null) =>
		set({ saveContributionEditError: error }),

	setActiveContextProjectId: (id: string | null) =>
		set({ activeContextProjectId: id }),
	setActiveContextSessionId: (id: string | null) =>
		set({ activeContextSessionId: id }),
	setActiveContextStage: (stage: DialecticStage | null) =>
		set({ activeContextStage: stage }),

	setActiveDialecticContext: (context: {
		projectId: string | null;
		sessionId: string | null;
		stage: DialecticStage | null;
	}) => {
		logger.info("[DialecticStore] Setting active dialectic context", {
			context,
		});
		set({
			activeContextProjectId: context.projectId,
			activeContextSessionId: context.sessionId,
			activeContextStage: context.stage,
		});
	},

	// Add reset actions for submitStageResponsesError and saveContributionEditError
	resetSubmitStageResponsesError: () =>
		set({ submitStageResponsesError: null }),
	resetSaveContributionEditError: () =>
		set({ saveContributionEditError: null }),

	submitStageResponses: async (
		payload: SubmitStageResponsesPayload,
	): Promise<ApiResponse<SubmitStageResponsesResponse>> => {
		set({ isSubmittingStageResponses: true, submitStageResponsesError: null });
		logger.info("[DialecticStore] Orchestrating final submission for stage...", {
			payload,
		});

		const { stageDocumentContent } = get();
		const dirtyDocuments = Object.entries(stageDocumentContent).filter(
			([_, content]) => content.isDirty,
		);

		if (dirtyDocuments.length > 0) {
			logger.info(
				`[DialecticStore] Found ${dirtyDocuments.length} unsaved document drafts. Saving before advancing stage.`,
			);
			const submissionPromises = dirtyDocuments.map(
				([key, content]) => {
					const [sessionId, stageSlug, iterationStr, modelId, documentKey] =
						key.split(":");
					const iterationNumber = parseInt(iterationStr, 10);
					return get().submitStageDocumentFeedback({
						sessionId,
						stageSlug,
						iterationNumber,
						modelId,
						documentKey,
						feedback: content.currentDraftMarkdown,
					});
				},
			);

			try {
				const submissionResults = await Promise.all(submissionPromises);
				const firstErrorResult = submissionResults.find((res) => res.error);

				if (firstErrorResult?.error) {
					const submissionError: ApiError = {
						message:
							firstErrorResult.error.message ||
							"An unknown error occurred while submitting document feedback",
						code: firstErrorResult.error.code || "SUBMISSION_FAILED",
					};
					logger.error(
						"[DialecticStore] Failed to submit one or more document drafts:",
						{ error: submissionError },
					);
					set({
						isSubmittingStageResponses: false,
						submitStageResponsesError: submissionError,
					});
					return {
						data: undefined,
						error: submissionError,
						status: firstErrorResult.status || 0,
					};
				}

				logger.info(
					"[DialecticStore] All unsaved drafts have been successfully submitted.",
				);
			} catch (error: unknown) {
				const submissionError: ApiError = {
					message:
						error instanceof Error
							? error.message
							: "An unknown network error occurred while submitting document feedback",
					code: "SUBMISSION_FAILED",
				};
				logger.error(
					"[DialecticStore] A network or promise rejection error occurred while submitting document drafts:",
					{ error: submissionError },
				);
				set({
					isSubmittingStageResponses: false,
					submitStageResponsesError: submissionError,
				});
				return { data: undefined, error: submissionError, status: 0 };
			}
		} else {
			logger.info(
				"[DialecticStore] No unsaved drafts found. Proceeding directly to advance stage.",
			);
		}

		try {
			const advancePayload: SubmitStageResponsesPayload = {
				projectId: payload.projectId,
				sessionId: payload.sessionId,
				stageSlug: payload.stageSlug,
				currentIterationNumber: payload.currentIterationNumber,
			};
			const response = await api
				.dialectic()
				.submitStageResponses(advancePayload);

			if (response.error) {
				logger.error("[DialecticStore] Error advancing stage:", {
					error: response.error,
				});
				set({
					isSubmittingStageResponses: false,
					submitStageResponsesError: response.error,
				});
			} else {
				logger.info("[DialecticStore] Successfully advanced stage.", {
					response: response.data,
				});
				set({
					isSubmittingStageResponses: false,
					submitStageResponsesError: null,
				});

				logger.info(
					`[DialecticStore] Stage advanced for project ${payload.projectId}. Refetching project details.`,
				);
				await get().fetchDialecticProjectDetails(payload.projectId);
			}
			return response;
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "A network error occurred while advancing the stage",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error advancing stage:", {
				error: networkError,
			});
			set({
				isSubmittingStageResponses: false,
				submitStageResponsesError: networkError,
			});
			return { data: undefined, error: networkError, status: 0 };
		}
	},

  saveContributionEdit: async (payload: SaveContributionEditPayload): Promise<ApiResponse<SaveContributionEditSuccessResponse>> => {
    set({ isSavingContributionEdit: true, saveContributionEditError: null });

    try {
      const response = await api.dialectic().saveContributionEdit(payload);
      if (response.error) {
        logger.error('[DialecticStore] Error saving contribution edit:', { errorDetails: response.error });
        set({ isSavingContributionEdit: false, saveContributionEditError: response.error });
        return response;
      } else {
        const responseData = response.data;
        if (!responseData) {
          const noDataError: ApiError = {
            message: 'No data returned from saveContributionEdit',
            code: 'NO_DATA_RETURNED',
          };
          logger.error('[DialecticStore] No data returned from saveContributionEdit');
          set({ isSavingContributionEdit: false, saveContributionEditError: noDataError });
          return { data: undefined, error: noDataError, status: 500 };
        }

        const { resource } = responseData;
        logger.info('[DialecticStore] Successfully saved contribution edit.', { resourceId: resource.id });
        
        set(state => {
          if (state.currentProjectDetail && state.currentProjectDetail.dialectic_sessions && resource) {
            const sessionIndex = state.currentProjectDetail.dialectic_sessions.findIndex(
              session => session.id === resource.session_id
            );
            if (sessionIndex !== -1) {
              const session = state.currentProjectDetail.dialectic_sessions[sessionIndex];
              if (session && session.dialectic_contributions) {
                // Find the original contribution to get modelId and toggle isLatestEdit
                const originalContributionIndex = session.dialectic_contributions.findIndex(
                  c => c.id === payload.originalContributionIdToEdit
                );
                if (originalContributionIndex !== -1) {
                  const originalContribution = session.dialectic_contributions[originalContributionIndex];
                  // Toggle isLatestEdit flag on original contribution (don't replace it)
                  originalContribution.is_latest_edit = false;
                  
                  // Derive composite key using resource fields + modelId from original contribution
                  // Extract documentKey - use from resource if available, otherwise derive from payload
                  const documentKey = resource.document_key ?? payload.documentKey ?? originalContribution.contribution_type ?? '';
                  if (!documentKey) {
                    logger.error('[DialecticStore] Cannot determine documentKey for stageDocumentContent update', { resource, payload });
                  } else {
                    const sessionId = resource.session_id ?? payload.sessionId;
                    const stageSlug = resource.stage_slug ?? '';
                    const iterationNumber = resource.iteration_number ?? 1;
                    if (!sessionId || !stageSlug || !documentKey) {
                      logger.error('[DialecticStore] Missing required fields for composite key', { 
                        resource, 
                        payload, 
                        sessionId, 
                        stageSlug, 
                        documentKey 
                      });
                    } else {
                      const modelId = originalContribution.model_id ?? '';
                      if (!modelId) {
                        logger.error('[DialecticStore] Missing modelId for composite key', { 
                          resource, 
                          originalContribution 
                        });
                      } else {
                        const compositeKey: StageDocumentCompositeKey = {
                          sessionId,
                          stageSlug,
                          iterationNumber,
                          modelId,
                          documentKey,
                        };
                        
                        // Update stageDocumentContent with the edited markdown
                        const versionInfo = createVersionInfo(resource.id);
                        const documentEntry = ensureStageDocumentContent(state, compositeKey, {
                          baselineMarkdown: payload.editedContentText,
                          version: versionInfo,
                        });
                        documentEntry.currentDraftMarkdown = payload.editedContentText;
                        documentEntry.isDirty = false;
                        documentEntry.isLoading = false;
                        documentEntry.error = null;
                        
                        // Store the complete EditedDocumentResource metadata in stageDocumentResources
                        // This is required so UI components can access source_contribution_id and updated_at
                        const serializedKey = getStageDocumentKey(compositeKey);
                        state.stageDocumentResources[serializedKey] = resource;
                      }
                    }
                  }
                }
              }
            }
          }
        });
        
        set({ isSavingContributionEdit: false, saveContributionEditError: null });
        return response;
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while saving contribution edit',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error saving contribution edit:', { errorDetails: networkError });
      set({ isSavingContributionEdit: false, saveContributionEditError: networkError });
      return { data: undefined, error: networkError, status: 0 };
    }
  },

  updateStageDocumentResource: (
    key: StageDocumentCompositeKey,
    resource: EditedDocumentResource,
    editedContentText: string,
  ): void => {
    set((state) => {
      const versionInfo = createVersionInfo(resource.id);
      const documentEntry = ensureStageDocumentContent(state, key, {
        baselineMarkdown: editedContentText,
        version: versionInfo,
      });
      documentEntry.currentDraftMarkdown = editedContentText;
      documentEntry.isDirty = false;
      documentEntry.isLoading = false;
      documentEntry.error = null;
      
      // Store the complete EditedDocumentResource metadata in stageDocumentResources
      // This is required so UI components can access source_contribution_id and updated_at
      const serializedKey = getStageDocumentKey(key);
      state.stageDocumentResources[serializedKey] = resource;
    });
  },

	fetchAndSetCurrentSessionDetails: async (sessionId: string) => {
		logger.info(
			`[DialecticStore] Fetching and setting current session details for session ID: ${sessionId}`,
		);
		set({ isLoadingActiveSessionDetail: true, activeSessionDetailError: null });

		try {
			const response = await api.dialectic().getSessionDetails(sessionId); // Expects ApiResponse<GetSessionDetailsResponse>

			if (response.error || !response.data) {
				logger.error("[DialecticStore] Error fetching session details:", {
					sessionId,
					errorDetails: response.error,
				});
				set({
					activeSessionDetail: null,
					isLoadingActiveSessionDetail: false,
					activeSessionDetailError: response.error || {
						code: "FETCH_ERROR",
						message: "No data returned for session",
					},
				});
				return;
			}

			const {
				session: fetchedSession,
				currentStageDetails: fetchedStageDetails,
				activeSeedPrompt,
			} = response.data;

			logger.info(
				`[DialecticStore] Successfully fetched session details and stage:`,
				{
					sessionId: fetchedSession.id,
					stage: fetchedStageDetails?.slug,
					sessionData: fetchedSession,
				},
			);

      set((state) => {
        state.activeSeedPrompt = activeSeedPrompt || null;
        let sessionWithContributions = fetchedSession; // Default to fetchedSession

        if (state.currentProjectDetail && state.currentProjectDetail.dialectic_sessions) {
          const sessionIndex = state.currentProjectDetail.dialectic_sessions.findIndex(s => s.id === fetchedSession.id);
          if (sessionIndex !== -1) {
            const existingSessionData = state.currentProjectDetail.dialectic_sessions[sessionIndex];
            const mergedSession = {
              ...fetchedSession,
              dialectic_contributions: fetchedSession.dialectic_contributions || existingSessionData.dialectic_contributions || [],
              feedback: fetchedSession.feedback || existingSessionData.feedback || [],
              dialectic_session_models: fetchedSession.dialectic_session_models || existingSessionData.dialectic_session_models || [],
            };
            state.currentProjectDetail.dialectic_sessions[sessionIndex] = mergedSession;
            // After merging, this is the session we want for activeSessionDetail
            sessionWithContributions = mergedSession; 
          } else {
            // Session not found in current project, add it. 
            // Ensure the pushed session has at least an empty contributions array if not present.
            const sessionToAdd = {
                ...fetchedSession,
                dialectic_contributions: fetchedSession.dialectic_contributions || [],
                feedback: fetchedSession.feedback || [],
                dialectic_session_models: fetchedSession.dialectic_session_models || [],
            };
            state.currentProjectDetail.dialectic_sessions.push(sessionToAdd);
            sessionWithContributions = sessionToAdd;
          }
        }

        state.isLoadingActiveSessionDetail = false;
        state.activeSessionDetailError = null;
        state.activeSessionDetail = sessionWithContributions; // Use the potentially enriched session
      });
      
      // Set the active context including the stage
      get().setActiveDialecticContext({
        projectId: fetchedSession.project_id,
        sessionId: fetchedSession.id,
        stage: fetchedStageDetails, // This can be null, setActiveDialecticContext should handle it
      });

			// Set selected models based on the session
			if (fetchedSession.selected_model_ids) {
				get().setSelectedModelIds(fetchedSession.selected_model_ids);
			} else {
				get().setSelectedModelIds([]); // Clear if no models are selected for the session
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching session details",
				code: "NETWORK_ERROR",
			};
			logger.error("[DialecticStore] Network error fetching session details:", {
				sessionId,
				errorDetails: networkError,
			});
			set({
				activeSessionDetail: null,
				isLoadingActiveSessionDetail: false,
				activeSessionDetailError: networkError,
			});
		}
	},

	activateProjectAndSessionContextForDeepLink: async (
		projectId: string,
		sessionId: string,
	) => {
		logger.info(
			`[DialecticStore] Activating project and session context for deep link. ProjectID: ${projectId}, SessionID: ${sessionId}`,
		);
		const state = get();

		// Condition to fetch project details:
		// 1. If activeContextProjectId is different from the target projectId.
		// 2. If currentProjectDetail is null (meaning no project is loaded).
		// 3. If currentProjectDetail is loaded but its ID doesn't match the target projectId (consistency check).
		const needsProjectFetch =
			state.activeContextProjectId !== projectId ||
			!state.currentProjectDetail ||
			state.currentProjectDetail.id !== projectId;

    if (needsProjectFetch) {
      logger.info(`[DialecticStore] Project context differs or not set. Fetching project details for ${projectId} before session.`);
      await state.fetchDialecticProjectDetails(projectId);
    }
    
    if (!get().projectDetailError) {
        logger.info(`[DialecticStore] Proceeding to fetch session details for ${sessionId}.`);
        await get().fetchAndSetCurrentSessionDetails(sessionId);

        const finalProjectDetail = get().currentProjectDetail;
        if (finalProjectDetail && finalProjectDetail.dialectic_process_templates?.stages?.length) {
            const firstStageSlug = finalProjectDetail.dialectic_process_templates.stages[0].slug;
            logger.info(`[DialecticStore] Setting initial active stage for deep link: ${firstStageSlug}`);
            get().setActiveStage(firstStageSlug);
        }
    }
  },

	// ADDED: Actions for fetching feedback file content
	fetchFeedbackFileContent: async (payload: {
		projectId: string;
		storagePath: string;
	}) => {
		set({
			isFetchingFeedbackFileContent: true,
			fetchFeedbackFileContentError: null,
			currentFeedbackFileContent: null, // Clear previous content
		});
		logger.info("[DialecticStore] Fetching feedback file content", payload);
		try {
			const response = await api.dialectic().getProjectResourceContent(payload);
			if (response.error) {
				logger.error("[DialecticStore] Error fetching feedback file content:", {
					payload,
					errorDetails: response.error,
				});
				set({
					isFetchingFeedbackFileContent: false,
					fetchFeedbackFileContentError: response.error,
					currentFeedbackFileContent: null,
				});
			} else {
				logger.info(
					"[DialecticStore] Successfully fetched feedback file content:",
					{ payload, data: response.data },
				);
				set({
					currentFeedbackFileContent: response.data || null,
					isFetchingFeedbackFileContent: false,
					fetchFeedbackFileContentError: null,
				});
			}
		} catch (error: unknown) {
			const networkError: ApiError = {
				message:
					error instanceof Error
						? error.message
						: "An unknown network error occurred while fetching feedback file content",
				code: "NETWORK_ERROR",
			};
			logger.error(
				"[DialecticStore] Network error fetching feedback file content:",
				{ payload, errorDetails: networkError },
			);
			set({
				isFetchingFeedbackFileContent: false,
				fetchFeedbackFileContentError: networkError,
				currentFeedbackFileContent: null,
			});
		}
	},

	resetFetchFeedbackFileContentError: () => {
		logger.info("[DialecticStore] Resetting fetchFeedbackFileContentError");
		set({ fetchFeedbackFileContentError: null });
	},

	clearCurrentFeedbackFileContent: () => {
		logger.info("[DialecticStore] Clearing currentFeedbackFileContent");
		set({
			currentFeedbackFileContent: null,
			isFetchingFeedbackFileContent: false,
			fetchFeedbackFileContentError: null,
		}); // Also reset loading/error states
	},

	// Add the implementation for setActiveDialecticWalletId
	setActiveDialecticWalletId: (walletId: string | null) => {
		logger.info(
			`[DialecticStore] Setting active dialectic wallet ID to: ${walletId}`,
		);
		set({ activeDialecticWalletId: walletId });
	},

  setActiveStage: (slug: string | null) => {
    logger.info(`[DialecticStore] Setting active stage slug to: ${slug}`);
    set({ activeStageSlug: slug });
  },

	setFocusedStageDocument: ({ sessionId, stageSlug, modelId, documentKey, iterationNumber }: SetFocusedStageDocumentPayload) => {
		const focusKey = buildFocusedDocumentKey({ sessionId, stageSlug, modelId });
		logger.info('[DialecticStore] Setting focused stage document', {
			sessionId,
			stageSlug,
			modelId,
			documentKey,
			iterationNumber,
		});
		set(state => {
			if (!state.focusedStageDocument) {
				state.focusedStageDocument = {};
			}
			state.focusedStageDocument[focusKey] = { modelId, documentKey };
		});

		const compositeKey: StageDocumentCompositeKey = {
			sessionId,
			stageSlug,
			iterationNumber,
			modelId,
			documentKey,
		};
		const serializedKey = getStageDocumentKey(compositeKey);
		const existingEntry = get().stageDocumentContent[serializedKey];
		const initialDraft = existingEntry ? existingEntry.currentDraftMarkdown : '';
		get().beginStageDocumentEdit(compositeKey, initialDraft);
	},

	clearFocusedStageDocument: ({ sessionId, stageSlug, modelId }: ClearFocusedStageDocumentPayload) => {
		const focusKey = buildFocusedDocumentKey({ sessionId, stageSlug, modelId });
		logger.info('[DialecticStore] Clearing focused stage document', {
			sessionId,
			stageSlug,
			modelId,
		});
		const snapshot = get();
		const focusedEntry = snapshot.focusedStageDocument?.[focusKey] ?? null;
		if (focusedEntry) {
			let iterationNumber: number | null = null;
			for (const [progressKey, progress] of Object.entries(snapshot.stageRunProgress)) {
				const [sessionKey, stageKey, iterationValue] = progressKey.split(':');
				if (sessionKey === sessionId && stageKey === stageSlug && progress.documents[focusedEntry.documentKey]) {
					const parsed = Number(iterationValue);
					if (!Number.isNaN(parsed)) {
						iterationNumber = parsed;
						break;
					}
				}
			}
			if (iterationNumber !== null) {
				get().clearStageDocumentDraft({
					sessionId,
					stageSlug,
					iterationNumber,
					modelId,
					documentKey: focusedEntry.documentKey,
				});
			}
		}
		set(state => {
			if (!state.focusedStageDocument) {
				return;
			}
			state.focusedStageDocument[focusKey] = null;
		});
	},

  // --- Recipes & Stage Run Progress ---
  fetchStageRecipe: async (stageSlug: string): Promise<void> => {
    try {
      const response = await api.dialectic().fetchStageRecipe(stageSlug);
      if (!response.error && response.data) {
        set(state => {
          state.recipesByStageSlug[stageSlug] = response.data!;
        });
      }
    } catch (_e: unknown) {
      // Swallow errors per store pattern; caller tests assert state on success path only
    }
  },

  ensureRecipeForActiveStage: async (sessionId: string, stageSlug: string, iterationNumber: number): Promise<void> => {
    const recipe = get().recipesByStageSlug[stageSlug];
    if (!recipe) {
      return; // Require hydration first; idempotent no-op
    }
    const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;
    set(state => {
      const existing = state.stageRunProgress[progressKey];
      if (!existing) {
        const stepStatuses: Record<string, 'not_started' | 'in_progress' | 'waiting_for_children' | 'completed' | 'failed'> = {};
        for (const step of recipe.steps) {
          stepStatuses[step.step_key] = 'not_started';
        }
        state.stageRunProgress[progressKey] = {
          documents: {},
          stepStatuses,
        };
        return;
      }
      // Idempotent: add missing step keys as not_started; do not reset existing values
      for (const step of recipe.steps) {
        const key = step.step_key;
        if (!(key in existing.stepStatuses)) {
          existing.stepStatuses[key] = 'not_started';
        }
      }
    });
  },

  hydrateStageProgress: async (payload: ListStageDocumentsPayload) => {
    await hydrateStageProgressLogic(set, payload);
  },
    };
  }),
);