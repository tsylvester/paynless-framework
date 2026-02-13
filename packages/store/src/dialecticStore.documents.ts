import type { Draft } from 'immer';
import type {
	ApiError,
	ApiResponse,
	DialecticStateValues,
	DialecticStore,
	StageDocumentCompositeKey,
	StageDocumentContentState,
	StageDocumentVersionInfo,
	PlannerStartedPayload,
	PlannerCompletedPayload,
	DocumentStartedPayload,
	DocumentChunkCompletedPayload,
	DocumentCompletedPayload,
	RenderCompletedPayload,
	RenderStartedPayload,
	JobFailedPayload,
	GetAllStageProgressPayload,
	ListStageDocumentsPayload,
	SubmitStageDocumentFeedbackPayload,
	StageRunDocumentDescriptor,
	StageRenderedDocumentDescriptor,
	StagePlannedDocumentDescriptor,
	StageRunDocumentStatus,
	StageRunProgressSnapshot,
	JobProgressEntry,
	ExecuteStartedPayload,
	IKeyValueStorage,
} from '@paynless/types';
import { STAGE_RUN_DOCUMENT_KEY_SEPARATOR } from '@paynless/types';
import { api } from '@paynless/api';
import { logger, isStageRenderedDocumentChecklistEntry } from '@paynless/utils';
import { selectValidMarkdownDocumentKeys } from './dialecticStore.selectors';

export const computeVersionHash = (input: string): string => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const createVersionInfo = (resourceId: string): StageDocumentVersionInfo => ({
  resourceId,
  versionHash: computeVersionHash(resourceId),
  updatedAt: new Date().toISOString(),
});

export const deriveDiff = (baseline: string, draft: string): string | null => {
  if (baseline === draft) {
    return null;
  }

  if (draft.startsWith(baseline)) {
    const remainder = draft.slice(baseline.length);
    if (remainder.startsWith('\n')) {
      const trimmed = remainder.slice(1);
      return trimmed.length > 0 ? trimmed : null;
    }
    return remainder.length > 0 ? remainder : null;
  }

  return draft;
};

export const applyDiffToBaseline = (baseline: string, diff: string | null): string => {
  if (!diff || diff.length === 0) {
    return baseline;
  }
  const needsSeparator = !(baseline.endsWith('\n') || diff.startsWith('\n'));
  return `${baseline}${needsSeparator ? '\n' : ''}${diff}`;
};

const isPlannedDescriptor = (
	descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StagePlannedDocumentDescriptor =>
	Boolean(descriptor && descriptor.descriptorType === 'planned');

function isStepStatus(value: string): value is StageRunProgressSnapshot['stepStatuses'][string] {
	return (
		value === 'not_started' ||
		value === 'in_progress' ||
		value === 'waiting_for_children' ||
		value === 'completed' ||
		value === 'failed'
	);
}

/** Build composite key for stageRunProgress.documents (documentKey + separator + modelId). */
export const getStageRunDocumentKey = (documentKey: string, modelId: string): string =>
	`${documentKey}${STAGE_RUN_DOCUMENT_KEY_SEPARATOR}${modelId}`;

const ensureJobProgressEntry = (
	progress: Draft<StageRunProgressSnapshot>,
	stepKey: string,
): JobProgressEntry => {
	const existing = progress.jobProgress[stepKey];
	if (existing) {
		return existing;
	}
	const entry: JobProgressEntry = {
		totalJobs: 0,
		completedJobs: 0,
		inProgressJobs: 0,
		failedJobs: 0,
	};
	progress.jobProgress[stepKey] = entry;
	return entry;
};

const ensureRenderedDocumentDescriptor = (
	progress: Draft<StageRunProgressSnapshot>,
	documentsKey: string,
	seed: {
		status: StageRunDocumentStatus;
		jobId: string;
		latestRenderedResourceId: string;
		modelId: string;
		versionInfo: StageDocumentVersionInfo;
		stepKey: string | undefined;
	},
): StageRenderedDocumentDescriptor => {
	const existing = progress.documents[documentsKey];
	if (existing && !isPlannedDescriptor(existing)) {
		if (existing.descriptorType !== 'rendered') {
			existing.descriptorType = 'rendered';
		}
		return existing;
	}

	const rendered: StageRenderedDocumentDescriptor = {
		descriptorType: 'rendered',
		status: seed.status,
		job_id: seed.jobId,
		latestRenderedResourceId: seed.latestRenderedResourceId,
		modelId: seed.modelId,
		versionHash: seed.versionInfo.versionHash,
		lastRenderedResourceId: seed.latestRenderedResourceId,
		lastRenderAtIso: seed.versionInfo.updatedAt,
	};
	if (seed.stepKey !== undefined) {
		rendered.stepKey = seed.stepKey;
	}

	progress.documents[documentsKey] = rendered;
	return rendered;
};

export const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
	`${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

export const buildFeedbackLocalStorageKey = (userId: string, key: StageDocumentCompositeKey): string =>
	`paynless:feedbackDraft:${userId}:${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

export const upsertStageDocumentVersionLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
  info: StageDocumentVersionInfo,
): void => {
	const serializedKey = getStageDocumentKey(key);
  state.stageDocumentVersions[serializedKey] = info;
};

/** Seed for a new stage document content entry. Both fields are required. */
export type EnsureStageDocumentContentSeed = {
	baselineMarkdown: string;
	version: StageDocumentVersionInfo | null;
};

export const ensureStageDocumentContentLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
	seed: EnsureStageDocumentContentSeed,
): StageDocumentContentState => {
	const serializedKey = getStageDocumentKey(key);
  const existing = state.stageDocumentContent[serializedKey];
  if (existing) {
		console.log(
			'[ensureStageDocumentContentLogic] Found existing entry.',
			JSON.parse(JSON.stringify({ key, seed })),
		);
		if (seed.baselineMarkdown !== '') {
			console.log(
				`[ensureStageDocumentContentLogic] Updating baseline from '${existing.baselineMarkdown}' to '${seed.baselineMarkdown}'`,
			);
			existing.baselineMarkdown = seed.baselineMarkdown;
		}
    if (seed.version !== null) {
      existing.lastBaselineVersion = seed.version;
      if (!existing.lastAppliedVersionHash) {
        existing.lastAppliedVersionHash = seed.version.versionHash;
      }
    }
    return existing;
  }

  const baselineMarkdown: string = seed.baselineMarkdown;
  const version: StageDocumentVersionInfo | null = seed.version;
  const lastAppliedVersionHash: string | null =
    version !== null ? version.versionHash : null;

  const entry: StageDocumentContentState = {
    baselineMarkdown,
    currentDraftMarkdown: baselineMarkdown,
    isDirty: false,
    isLoading: false,
    error: null,
    lastBaselineVersion: version,
    pendingDiff: null,
    lastAppliedVersionHash,
    sourceContributionId: null,
    feedbackDraftMarkdown: undefined,
    feedbackIsDirty: false,
    resourceType: null,
  };

  state.stageDocumentContent[serializedKey] = entry;
  return entry;
};

export const recordStageDocumentFeedbackDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
	feedbackMarkdown: string,
	storage: IKeyValueStorage | null,
	userId: string | null,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key, {
		baselineMarkdown: '',
		version: null,
	});
	entry.feedbackDraftMarkdown = feedbackMarkdown;
	entry.feedbackIsDirty = feedbackMarkdown !== '';
	if (storage && userId) {
		try {
			storage.setItem(buildFeedbackLocalStorageKey(userId, key), feedbackMarkdown);
		} catch (err: unknown) {
			logger.warn('[recordStageDocumentFeedbackDraftLogic] localStorage write failed', { err });
		}
	}
};

export const flushStageDocumentFeedbackDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
	storage: IKeyValueStorage | null,
	userId: string | null,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key, {
		baselineMarkdown: '',
		version: null,
	});
	entry.feedbackDraftMarkdown = undefined;
	entry.feedbackIsDirty = false;
	if (storage && userId) {
		try {
			storage.removeItem(buildFeedbackLocalStorageKey(userId, key));
		} catch (err: unknown) {
			logger.warn('[flushStageDocumentFeedbackDraftLogic] localStorage remove failed', { err });
		}
	}
};

export const recordStageDocumentDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
  draftMarkdown: string,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key, {
		baselineMarkdown: '',
		version: null,
	});
  entry.currentDraftMarkdown = draftMarkdown;
  const diff = deriveDiff(entry.baselineMarkdown, draftMarkdown);
  entry.pendingDiff = diff;
  entry.isDirty = diff !== null;
};

export const flushStageDocumentDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key, {
		baselineMarkdown: '',
		version: null,
	});
  entry.currentDraftMarkdown = entry.baselineMarkdown;
  entry.isDirty = false;
  entry.pendingDiff = null;
  if (entry.lastBaselineVersion) {
    entry.lastAppliedVersionHash = entry.lastBaselineVersion.versionHash;
  }
};

export const reapplyDraftToNewBaselineLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
  newBaseline: string,
  newVersion: StageDocumentVersionInfo,
  sourceContributionId: string | null,
  resourceType: string | null,
): void => {
	console.log(
		'[reapplyDraftToNewBaselineLogic] ENTERING',
		JSON.parse(JSON.stringify({ key, newBaseline, newVersion })),
	);
	const serializedKey = getStageDocumentKey(key);
	const entry = state.stageDocumentContent[serializedKey];
	if (!entry) {
		logger.error(
			'[reapplyDraftToNewBaselineLogic] Could not find document content entry to re-apply draft.',
			{ key },
		);
		return;
	}

	console.log(
		'[reapplyDraftToNewBaselineLogic] Before update:',
		JSON.parse(JSON.stringify(entry)),
	);

  entry.baselineMarkdown = newBaseline;
  entry.lastBaselineVersion = newVersion;
  entry.lastAppliedVersionHash = newVersion.versionHash;
  entry.isLoading = false;
  entry.error = null;
  entry.sourceContributionId = sourceContributionId;
  entry.resourceType = resourceType;

  const diff = entry.pendingDiff;
  if (diff && diff.length > 0) {
    entry.currentDraftMarkdown = applyDiffToBaseline(newBaseline, diff);
    entry.isDirty = true;
  } else {
    entry.currentDraftMarkdown = newBaseline;
    entry.isDirty = false;
  }
	console.log(
		'[reapplyDraftToNewBaselineLogic] After update:',
		JSON.parse(JSON.stringify(entry)),
	);
};

type ImmerHelpers = {
	ensureStageDocumentContent: (
		state: Draft<DialecticStateValues>,
		key: StageDocumentCompositeKey,
		seed: EnsureStageDocumentContentSeed,
	) => StageDocumentContentState;
	recordStageDocumentDraft: (
		state: Draft<DialecticStateValues>,
		key: StageDocumentCompositeKey,
		draftMarkdown: string,
	) => void;
	upsertStageDocumentVersion: (
		state: Draft<DialecticStateValues>,
		key: StageDocumentCompositeKey,
		info: StageDocumentVersionInfo,
	) => void;
	reapplyDraftToNewBaseline: (
		state: Draft<DialecticStateValues>,
		key: StageDocumentCompositeKey,
		newBaseline: string,
		newVersion: StageDocumentVersionInfo,
		sourceContributionId: string | null,
		resourceType: string | null,
	) => void;
};

export const beginStageDocumentEditLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	helpers: ImmerHelpers,
	key: StageDocumentCompositeKey,
	initialDraftMarkdown: string,
): void => {
	const serializedKey = getStageDocumentKey(key);
	const currentState = get();
	const existingEntry = currentState.stageDocumentContent[serializedKey];
	const version = currentState.stageDocumentVersions[serializedKey];

	set((state) => {
		const seed: EnsureStageDocumentContentSeed = existingEntry
			? {
					baselineMarkdown: existingEntry.baselineMarkdown,
					version: existingEntry.lastBaselineVersion,
				}
			: {
					baselineMarkdown: initialDraftMarkdown,
					version: version !== undefined ? version : null,
				};
		const entry = helpers.ensureStageDocumentContent(state, key, seed);
		if (!existingEntry) {
			entry.baselineMarkdown = initialDraftMarkdown;
			entry.currentDraftMarkdown = initialDraftMarkdown;
			entry.isDirty = false;
			entry.pendingDiff = null;
			if (version !== undefined) {
				entry.lastBaselineVersion = version;
				entry.lastAppliedVersionHash = version.versionHash;
			}
		}
		helpers.recordStageDocumentDraft(state, key, initialDraftMarkdown);
	});
};

export const updateStageDocumentDraftLogic = (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	helpers: ImmerHelpers,
	key: StageDocumentCompositeKey,
	draftMarkdown: string,
): void => {
	set((state) => {
		helpers.recordStageDocumentDraft(state, key, draftMarkdown);
	});
};

export const flushStageDocumentDraftActionLogic = (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	helpers: {
		flushStageDocumentDraft: (
			state: Draft<DialecticStateValues>,
			key: StageDocumentCompositeKey,
		) => void;
	},
	key: StageDocumentCompositeKey,
): void => {
	set((state) => {
		helpers.flushStageDocumentDraft(state, key);
	});
};

export const clearStageDocumentDraftLogic = (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	key: StageDocumentCompositeKey,
): void => {
	const serializedKey = getStageDocumentKey(key);
	set((state) => {
		delete state.stageDocumentContent[serializedKey];
	});
};

export const fetchStageDocumentContentLogic = async (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	helpers: ImmerHelpers,
	key: StageDocumentCompositeKey,
	resourceId: string,
): Promise<void> => {
	const versionInfo = createVersionInfo(resourceId);

	set((state) => {
		helpers.upsertStageDocumentVersion(state, key, versionInfo);
		const serializedKey = getStageDocumentKey(key);
		const entry = state.stageDocumentContent[serializedKey];
		if (!entry) {
			const newEntry: StageDocumentContentState = {
				baselineMarkdown: '',
				currentDraftMarkdown: '',
				isDirty: false,
				isLoading: true,
				error: null,
				lastBaselineVersion: versionInfo,
				pendingDiff: null,
				lastAppliedVersionHash: versionInfo.versionHash,
				sourceContributionId: null,
				feedbackDraftMarkdown: undefined,
				feedbackIsDirty: false,
				resourceType: null,
			};
			state.stageDocumentContent[serializedKey] = newEntry;
		} else {
			entry.isLoading = true;
			entry.error = null;
			entry.lastBaselineVersion = versionInfo;
		}
	});

	logger.info('[DialecticStore] Fetching stage document content', {
		sessionId: key.sessionId,
		stageSlug: key.stageSlug,
		iterationNumber: key.iterationNumber,
		modelId: key.modelId,
		documentKey: key.documentKey,
		resourceId,
	});

	try {
		const response = await api
			.dialectic()
			.getProjectResourceContent({ resourceId });

		if (response.error || !response.data) {
			const errorDetails: ApiError =
				response.error || {
					message: 'Failed to fetch stage document content',
					code: 'NO_DATA',
				};
			logger.error('[DialecticStore] Error fetching stage document content', {
				sessionId: key.sessionId,
				stageSlug: key.stageSlug,
				iterationNumber: key.iterationNumber,
				modelId: key.modelId,
				documentKey: key.documentKey,
				error: errorDetails,
			});
			set((state) => {
				const entry = helpers.ensureStageDocumentContent(state, key, {
					baselineMarkdown: '',
					version: null,
				});
				entry.isLoading = false;
				entry.error = errorDetails;
			});
			return;
		}

		const data = response.data;
		const contentValid = typeof data.content === 'string';
		const sourceContributionIdValid =
			data.sourceContributionId === null || typeof data.sourceContributionId === 'string';
		const resourceTypeValid =
			data.resourceType === null || typeof data.resourceType === 'string';
		if (!contentValid || !sourceContributionIdValid || !resourceTypeValid) {
			const errorDetails: ApiError = {
				message: 'Invalid content response: required fields missing or wrong type',
				code: 'VALIDATION_ERROR',
			};
			logger.error('[DialecticStore] Invalid stage document content response', {
				sessionId: key.sessionId,
				stageSlug: key.stageSlug,
				iterationNumber: key.iterationNumber,
				modelId: key.modelId,
				documentKey: key.documentKey,
				error: errorDetails,
			});
			set((state) => {
				const entry = helpers.ensureStageDocumentContent(state, key, {
					baselineMarkdown: '',
					version: null,
				});
				entry.isLoading = false;
				entry.error = errorDetails;
			});
			return;
		}

		const baselineMarkdown: string = data.content;
		const sourceContributionId: string | null = data.sourceContributionId;
		const resourceType: string | null = data.resourceType;
		set((state) => {
			console.log(
				'[fetchStageDocumentContentLogic] Calling reapplyDraftToNewBaseline with:',
				JSON.parse(JSON.stringify({ key, baselineMarkdown, versionInfo, sourceContributionId, resourceType })),
			);
			helpers.reapplyDraftToNewBaseline(state, key, baselineMarkdown, versionInfo, sourceContributionId, resourceType);
		});
	} catch (error: unknown) {
		const networkError: ApiError = {
			message:
				error instanceof Error
					? error.message
					: 'An unknown network error occurred while fetching stage document content',
			code: 'NETWORK_ERROR',
		};
		logger.error(
			'[DialecticStore] Network error fetching stage document content',
			{
				sessionId: key.sessionId,
				stageSlug: key.stageSlug,
				iterationNumber: key.iterationNumber,
				modelId: key.modelId,
				documentKey: key.documentKey,
				error: networkError,
			},
		);
		set((state) => {
			const entry = helpers.ensureStageDocumentContent(state, key, {
				baselineMarkdown: '',
				version: null,
			});
			entry.isLoading = false;
			entry.error = networkError;
		});
	}
};

export const handlePlannerStartedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: PlannerStartedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] planner_started ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] planner_started ignored; progress bucket missing', { progressKey });
		return;
	}
	const stepKey = event.step_key;
	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		if (stepKey !== undefined) {
			progress.stepStatuses[stepKey] = 'in_progress';
			const jobEntry = ensureJobProgressEntry(progress, stepKey);
			jobEntry.totalJobs = 1;
			jobEntry.inProgressJobs = 1;
			jobEntry.completedJobs = 0;
			jobEntry.failedJobs = 0;
		}
	});
};

/** Sets step status for a progress bucket. Used when no document descriptor update is needed. */
export const setStepStatusLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	progressKey: string,
	stepKey: string,
	status: 'not_started' | 'in_progress' | 'waiting_for_children' | 'completed' | 'failed',
): void => {
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] setStepStatusLogic ignored; progress bucket missing', { progressKey });
		return;
	}
	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) return;
		progress.stepStatuses[stepKey] = status;
	});
};

export const handlePlannerCompletedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: PlannerCompletedPayload,
): void => {
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	setStepStatusLogic(get, set, progressKey, event.step_key, 'completed');
	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) return;
		const jobEntry = ensureJobProgressEntry(progress, event.step_key);
		jobEntry.completedJobs = 1;
		jobEntry.inProgressJobs = 0;
	});
};

export const handleExecuteStartedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: ExecuteStartedPayload,
): void => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] execute_started ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] execute_started ignored; progress bucket missing', { progressKey });
		return;
	}
	const stepKey = event.step_key;
	if (stepKey === undefined) {
		logger.warn('[DialecticStore] execute_started ignored; step_key required', {
			stageSlug: event.stageSlug,
		});
		return;
	}
	const modelId = event.modelId;
	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) return;
		const jobEntry = ensureJobProgressEntry(progress, stepKey);
		jobEntry.totalJobs += 1;
		jobEntry.inProgressJobs += 1;
		if (modelId) {
			if (!jobEntry.modelJobStatuses) {
				jobEntry.modelJobStatuses = {};
			}
			jobEntry.modelJobStatuses[modelId] = 'in_progress';
		}
	});
};

export const handleRenderStartedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: RenderStartedPayload,
): void => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] render_started ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] render_started ignored; progress bucket missing', { progressKey });
		return;
	}
	const stepKey = event.step_key;
	if (stepKey === undefined) {
		logger.warn('[DialecticStore] render_started ignored; step_key required', {
			stageSlug: event.stageSlug,
		});
		return;
	}
	setStepStatusLogic(get, set, progressKey, stepKey, 'in_progress');
};

export const handleDocumentStartedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: DocumentStartedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] document_started ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] document_started ignored; progress bucket missing', { progressKey });
		return;
	}
	const stepKey = event.step_key;

	// Check if document requires rendering using existing selector logic
	const state = get();
	const markdownDocumentKeys = selectValidMarkdownDocumentKeys(state, event.stageSlug);
	const requiresRendering = markdownDocumentKeys.has(event.document_key);
	const latestRenderedResourceId = event.latestRenderedResourceId;
	const hasLatestRenderedResourceId = typeof latestRenderedResourceId === 'string' && latestRenderedResourceId.length > 0;

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}

		const documentsKey = getStageRunDocumentKey(event.document_key, event.modelId);

		if (stepKey !== undefined) {
			progress.stepStatuses[stepKey] = 'in_progress';
		}

		// Handle planner outputs (JSON artifacts) without rendered resources
		if (!requiresRendering && !hasLatestRenderedResourceId) {
			const existingDescriptor = progress.documents[documentsKey];

			if (!existingDescriptor || isPlannedDescriptor(existingDescriptor)) {
				// Create minimal rendered descriptor for planner output
				const minimalDescriptor: StageRenderedDocumentDescriptor = {
					descriptorType: 'rendered',
					status: 'generating',
					job_id: event.job_id,
					latestRenderedResourceId: event.job_id,
					modelId: event.modelId,
					versionHash: '',
					lastRenderedResourceId: event.job_id,
					lastRenderAtIso: new Date().toISOString(),
				};
				if (stepKey !== undefined) {
					minimalDescriptor.stepKey = stepKey;
				}
				progress.documents[documentsKey] = minimalDescriptor;
			} else {
				// Update existing rendered descriptor
				const renderedDescriptor = existingDescriptor;
				renderedDescriptor.status = 'generating';
				renderedDescriptor.job_id = event.job_id;
				renderedDescriptor.modelId = event.modelId;
				if (stepKey !== undefined) {
					renderedDescriptor.stepKey = stepKey;
				}
			}
			// Do NOT set version info or content state for planner outputs without rendered resources
			return;
		}

		// Handle documents that require rendering
		if (requiresRendering) {
			if (hasLatestRenderedResourceId) {
				// latestRenderedResourceId is available - initialize with version tracking
				const versionInfo = createVersionInfo(latestRenderedResourceId);

				upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
				ensureStageDocumentContentLogic(state, compositeKey, {
					baselineMarkdown: '',
					version: versionInfo,
				});

				const descriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
					status: 'generating',
					jobId: event.job_id,
					latestRenderedResourceId: latestRenderedResourceId,
					modelId: event.modelId,
					versionInfo,
					stepKey,
				});

				descriptor.status = 'generating';
				descriptor.job_id = event.job_id;
				descriptor.latestRenderedResourceId = latestRenderedResourceId;
				descriptor.modelId = event.modelId;
				descriptor.versionHash = versionInfo.versionHash;
				descriptor.lastRenderedResourceId = latestRenderedResourceId;
				descriptor.lastRenderAtIso = versionInfo.updatedAt;
				if (stepKey !== undefined) {
					descriptor.stepKey = stepKey;
				}
			} else {
				// latestRenderedResourceId is missing - initialize basic tracking, defer version tracking
				const existingDescriptor = progress.documents[documentsKey];

				if (!existingDescriptor || isPlannedDescriptor(existingDescriptor)) {
					// Create descriptor with basic tracking info, no version tracking yet
					const descriptor: StageRenderedDocumentDescriptor = {
						descriptorType: 'rendered',
						status: 'generating',
						job_id: event.job_id,
						latestRenderedResourceId: '', // Will be set when render_completed provides it
						modelId: event.modelId,
						versionHash: '', // Will be set when render_completed provides latestRenderedResourceId
						lastRenderedResourceId: '', // Will be set when render_completed provides it
						lastRenderAtIso: new Date().toISOString(),
						stepKey,
					};
					progress.documents[documentsKey] = descriptor;
				} else {
					// Update existing rendered descriptor
					const renderedDescriptor = existingDescriptor;
					renderedDescriptor.status = 'generating';
					renderedDescriptor.job_id = event.job_id;
					renderedDescriptor.modelId = event.modelId;
					if (stepKey !== undefined) {
						renderedDescriptor.stepKey = stepKey;
					}
				}
				// Do NOT call version tracking functions - defer until render_completed provides latestRenderedResourceId
			}
			return;
		}

		// Fallback: documents that don't require rendering but have latestRenderedResourceId
		// This should not happen in practice, but handle it for completeness
		if (hasLatestRenderedResourceId) {
			const versionInfo = createVersionInfo(latestRenderedResourceId);

			upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
			ensureStageDocumentContentLogic(state, compositeKey, {
				baselineMarkdown: '',
				version: versionInfo,
			});

			const descriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
				status: 'generating',
				jobId: event.job_id,
				latestRenderedResourceId: latestRenderedResourceId,
				modelId: event.modelId,
				versionInfo,
				stepKey,
			});

			descriptor.status = 'generating';
			descriptor.job_id = event.job_id;
			descriptor.latestRenderedResourceId = latestRenderedResourceId;
			descriptor.modelId = event.modelId;
			descriptor.versionHash = versionInfo.versionHash;
			descriptor.lastRenderedResourceId = latestRenderedResourceId;
			descriptor.lastRenderAtIso = versionInfo.updatedAt;
			if (stepKey !== undefined) {
				descriptor.stepKey = stepKey;
			}
		}
	});
};

export const handleDocumentChunkCompletedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: DocumentChunkCompletedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] document_chunk_completed ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] document_chunk_completed ignored; progress bucket missing', { progressKey });
		return;
	}
	const latestRenderedResourceId = event.latestRenderedResourceId;
	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};
	const shouldUpdateVersion = typeof latestRenderedResourceId === 'string' && latestRenderedResourceId.length > 0;
	const versionInfo = shouldUpdateVersion ? createVersionInfo(latestRenderedResourceId) : null;

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		const documentsKey = getStageRunDocumentKey(event.document_key, event.modelId);
		const documentEntry = progress.documents[documentsKey];
		if (!documentEntry) {
			logger.warn('[DialecticStore] document_chunk_completed ignored; document not tracked', { progressKey, documentKey: event.document_key });
			return;
		}
		const nextStatus: StageRunDocumentStatus =
			event.isFinalChunk === true ? 'completed' : 'continuing';

		if (isPlannedDescriptor(documentEntry)) {
			if (!shouldUpdateVersion || !versionInfo) {
				return;
			}
			const renderedDescriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
				status: nextStatus,
				jobId: event.job_id,
				latestRenderedResourceId: latestRenderedResourceId,
				modelId: event.modelId,
				versionInfo,
				stepKey: event.step_key,
			});
			renderedDescriptor.job_id = event.job_id;
			renderedDescriptor.status = nextStatus;
			if (!renderedDescriptor.stepKey && event.step_key) {
				renderedDescriptor.stepKey = event.step_key;
			}
			if (shouldUpdateVersion && versionInfo && latestRenderedResourceId) {
				upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
				ensureStageDocumentContentLogic(state, compositeKey, {
					baselineMarkdown: '',
					version: versionInfo,
				});
				renderedDescriptor.latestRenderedResourceId = latestRenderedResourceId;
				renderedDescriptor.versionHash = versionInfo.versionHash;
				renderedDescriptor.lastRenderedResourceId = latestRenderedResourceId;
				renderedDescriptor.lastRenderAtIso = versionInfo.updatedAt;
				renderedDescriptor.modelId = event.modelId;
			}
			return;
		}

		const renderedDescriptor = documentEntry;
		if (renderedDescriptor.descriptorType !== 'rendered') {
			renderedDescriptor.descriptorType = 'rendered';
		}
		renderedDescriptor.job_id = event.job_id;
		renderedDescriptor.status = nextStatus;
		if (!renderedDescriptor.stepKey && event.step_key) {
			renderedDescriptor.stepKey = event.step_key;
		}
		if (shouldUpdateVersion && versionInfo && latestRenderedResourceId) {
			upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
			ensureStageDocumentContentLogic(state, compositeKey, {
				baselineMarkdown: '',
				version: versionInfo,
			});
			renderedDescriptor.latestRenderedResourceId = latestRenderedResourceId;
			renderedDescriptor.versionHash = versionInfo.versionHash;
			renderedDescriptor.lastRenderedResourceId = latestRenderedResourceId;
			renderedDescriptor.lastRenderAtIso = versionInfo.updatedAt;
			renderedDescriptor.modelId = event.modelId;
		}
	});
};

export const handleRenderCompletedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: RenderCompletedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] render_completed ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] render_completed ignored; progress bucket missing', { progressKey });
		return;
	}
	// Validate latestRenderedResourceId BEFORE stepKey check - this is a truly invalid event
	const latestRenderedResourceId = event.latestRenderedResourceId;
	if (typeof latestRenderedResourceId !== 'string' || latestRenderedResourceId.length === 0) {
		logger.warn('[DialecticStore] render_completed ignored; latestRenderedResourceId missing', {
			stageSlug: event.stageSlug,
			documentKey: event.document_key,
			jobId: event.job_id,
		});
		return;
	}
	const stepKey = event.step_key;

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};
	const versionInfo = createVersionInfo(latestRenderedResourceId);
	let shouldFetchContent = false;

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		if (stepKey !== undefined) {
			progress.stepStatuses[stepKey] = 'completed';
		}
		const documentsKey = getStageRunDocumentKey(event.document_key, event.modelId);
		const existingDescriptor = progress.documents[documentsKey];
		const statusToUse: StageRunDocumentStatus =
			stepKey !== undefined
				? 'completed'
				: existingDescriptor && !isPlannedDescriptor(existingDescriptor)
					? existingDescriptor.status
					: 'generating';
		const descriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
			status: statusToUse,
			jobId: event.job_id,
			latestRenderedResourceId,
			modelId: event.modelId,
			versionInfo,
			stepKey: stepKey,
		});
		descriptor.job_id = event.job_id;
		descriptor.latestRenderedResourceId = latestRenderedResourceId;
		descriptor.modelId = event.modelId;
		descriptor.versionHash = versionInfo.versionHash;
		descriptor.lastRenderedResourceId = latestRenderedResourceId;
		descriptor.lastRenderAtIso = versionInfo.updatedAt;
		if (stepKey !== undefined) {
			descriptor.status = 'completed';
			descriptor.stepKey = stepKey;
		}

		const serializedKey = getStageDocumentKey(compositeKey);
		const existingVersion = state.stageDocumentVersions[serializedKey];
		if (!existingVersion || existingVersion.resourceId !== latestRenderedResourceId) {
			upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
			ensureStageDocumentContentLogic(state, compositeKey, {
				baselineMarkdown: '',
				version: versionInfo,
			});
			shouldFetchContent = true;
		}
	});

	if (shouldFetchContent) {
		void get().fetchStageDocumentContent(compositeKey, latestRenderedResourceId);
	}
};

export const handleDocumentCompletedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: DocumentCompletedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] document_completed ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] document_completed ignored; progress bucket missing', { progressKey });
		return;
	}
	const latestRenderedResourceId = event.latestRenderedResourceId;
	const shouldUpdateVersion = typeof latestRenderedResourceId === 'string' && latestRenderedResourceId.length > 0;
	const versionInfo = shouldUpdateVersion ? createVersionInfo(latestRenderedResourceId) : null;

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};

		set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}

		const documentsKey = getStageRunDocumentKey(event.document_key, event.modelId);
		const documentEntry = progress.documents[documentsKey];

		if (!documentEntry) {
			logger.warn('[DialecticStore] document_completed ignored; document not tracked', { progressKey, documentKey: event.document_key });
			return;
		}

		const stepKey = event.step_key;

		// Update jobProgress for EXECUTE step
		if (stepKey !== undefined && event.modelId !== undefined && event.modelId !== '') {
			const jobEntry = ensureJobProgressEntry(progress, stepKey);
			jobEntry.inProgressJobs = Math.max(0, jobEntry.inProgressJobs - 1);
			jobEntry.completedJobs += 1;
			if (!jobEntry.modelJobStatuses) {
				jobEntry.modelJobStatuses = {};
			}
			jobEntry.modelJobStatuses[event.modelId] = 'completed';
		}

		if (stepKey !== undefined) {
			progress.stepStatuses[stepKey] = 'completed';
		}

		// If latestRenderedResourceId is present, update version-related properties
		if (shouldUpdateVersion && versionInfo && latestRenderedResourceId) {
			if (isPlannedDescriptor(documentEntry)) {
				// Convert planned descriptor to rendered descriptor
				const renderedDescriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
					status: 'completed',
					jobId: event.job_id,
					latestRenderedResourceId: latestRenderedResourceId,
					modelId: event.modelId,
					versionInfo,
					stepKey: event.step_key,
				});
				renderedDescriptor.status = 'completed';
				renderedDescriptor.job_id = event.job_id;
				renderedDescriptor.modelId = event.modelId;

				upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
				ensureStageDocumentContentLogic(state, compositeKey, {
					baselineMarkdown: '',
					version: versionInfo,
				});
			} else {
				// Update existing rendered descriptor with version info
				const renderedDescriptor = documentEntry;
				if (renderedDescriptor.descriptorType !== 'rendered') {
					renderedDescriptor.descriptorType = 'rendered';
				}
				renderedDescriptor.status = 'completed';
				renderedDescriptor.job_id = event.job_id;
				renderedDescriptor.modelId = event.modelId;
				renderedDescriptor.latestRenderedResourceId = latestRenderedResourceId;
				renderedDescriptor.versionHash = versionInfo.versionHash;
				renderedDescriptor.lastRenderedResourceId = latestRenderedResourceId;
				renderedDescriptor.lastRenderAtIso = versionInfo.updatedAt;
				if (stepKey !== undefined) {
					renderedDescriptor.stepKey = stepKey;
				}

				upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
				ensureStageDocumentContentLogic(state, compositeKey, {
					baselineMarkdown: '',
					version: versionInfo,
				});
			}
		} else {
			// No latestRenderedResourceId (planner outputs) - mark completed only when we have valid descriptor data
			if (isPlannedDescriptor(documentEntry)) {
				const stepKeyForDescriptor = event.step_key;
				const minimalDescriptor: StageRenderedDocumentDescriptor = {
					descriptorType: 'rendered',
					status: 'completed',
					job_id: event.job_id,
					latestRenderedResourceId: event.job_id,
					modelId: event.modelId,
					versionHash: '',
					lastRenderedResourceId: event.job_id,
					lastRenderAtIso: new Date().toISOString(),
				};
				if (stepKeyForDescriptor !== undefined) {
					minimalDescriptor.stepKey = stepKeyForDescriptor;
				}
				progress.documents[documentsKey] = minimalDescriptor;
			} else {
				const renderedDescriptor = documentEntry;
				renderedDescriptor.status = 'completed';
				renderedDescriptor.job_id = event.job_id;
				renderedDescriptor.modelId = event.modelId;
				if (stepKey !== undefined) {
					renderedDescriptor.stepKey = stepKey;
				}
			}
		}
	});
};

export const handleJobFailedLogic = (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	event: JobFailedPayload,
) => {
	const recipe = get().recipesByStageSlug[event.stageSlug];
	if (!recipe) {
		logger.warn('[DialecticStore] job_failed ignored; recipe missing', { stageSlug: event.stageSlug });
		return;
	}
	const progressKey = `${event.sessionId}:${event.stageSlug}:${event.iterationNumber}`;
	const progressSnapshot = get().stageRunProgress[progressKey];
	if (!progressSnapshot) {
		logger.warn('[DialecticStore] job_failed ignored; progress bucket missing', { progressKey });
		return;
	}
	const stepKey = event.step_key;

	const documentKey = event.document_key;
	const modelId = event.modelId;
	const hasDocumentKeyAndModelId =
		documentKey != null &&
		documentKey !== '' &&
		modelId != null &&
		modelId !== '';

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		if (stepKey !== undefined) {
			progress.stepStatuses[stepKey] = 'failed';
			const jobEntry = ensureJobProgressEntry(progress, stepKey);
			jobEntry.inProgressJobs = Math.max(0, jobEntry.inProgressJobs - 1);
			jobEntry.failedJobs += 1;
			if (modelId !== undefined && modelId !== null && modelId !== '') {
				if (!jobEntry.modelJobStatuses) {
					jobEntry.modelJobStatuses = {};
				}
				jobEntry.modelJobStatuses[modelId] = 'failed';
			}
		}
		if (!hasDocumentKeyAndModelId) {
			return;
		}
		const compositeKey: StageDocumentCompositeKey = {
			sessionId: event.sessionId,
			stageSlug: event.stageSlug,
			iterationNumber: event.iterationNumber,
			modelId,
			documentKey,
		};
		const documentsKey = getStageRunDocumentKey(documentKey, modelId);
		const hasLatestResource =
			typeof event.latestRenderedResourceId === 'string' &&
			event.latestRenderedResourceId.length > 0;
		const existingDescriptor = progress.documents[documentsKey];
		let descriptorVersionInfo: StageDocumentVersionInfo | null = null;

		const buildVersionInfo = (resourceId: string): StageDocumentVersionInfo =>
			createVersionInfo(resourceId);

		const convertPlannedToRendered = (
			planned: StagePlannedDocumentDescriptor,
			resourceId: string,
			versionInfo: StageDocumentVersionInfo,
		): StageRenderedDocumentDescriptor => {
			const renderedDescriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
				status: 'failed',
				jobId: event.job_id,
				latestRenderedResourceId: resourceId,
				modelId: event.modelId,
				versionInfo,
				stepKey: planned.stepKey,
			});
			descriptorVersionInfo = versionInfo;
			return renderedDescriptor;
		};

		const ensureDescriptor = (): StageRenderedDocumentDescriptor => {
			if (existingDescriptor) {
				if (isPlannedDescriptor(existingDescriptor)) {
					if (hasLatestResource) {
						const versionInfo = buildVersionInfo(event.latestRenderedResourceId!);
						const rendered = convertPlannedToRendered(
							existingDescriptor,
							event.latestRenderedResourceId!,
							versionInfo,
						);
						return rendered;
					}

					const versionInfo = buildVersionInfo(event.job_id);
					const renderedDescriptor: StageRenderedDocumentDescriptor = {
						descriptorType: 'rendered',
						status: 'failed',
						job_id: event.job_id,
						latestRenderedResourceId: event.job_id,
						modelId: event.modelId,
						versionHash: versionInfo.versionHash,
						lastRenderedResourceId: event.job_id,
						lastRenderAtIso: versionInfo.updatedAt,
					};
					if (existingDescriptor.stepKey !== undefined) {
						renderedDescriptor.stepKey = existingDescriptor.stepKey;
					} else if (stepKey !== undefined) {
						renderedDescriptor.stepKey = stepKey;
					}
					progress.documents[documentsKey] = renderedDescriptor;
					descriptorVersionInfo = null;
					return renderedDescriptor;
				}

				return existingDescriptor;
			}

			if (hasLatestResource) {
				const versionInfo = buildVersionInfo(event.latestRenderedResourceId!);
				const renderedDescriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
					status: 'failed',
					jobId: event.job_id,
					latestRenderedResourceId: event.latestRenderedResourceId!,
					modelId: event.modelId,
					versionInfo,
					stepKey,
				});
				descriptorVersionInfo = versionInfo;
				return renderedDescriptor;
			}

			const versionInfo = buildVersionInfo(event.job_id);
			const renderedDescriptor: StageRenderedDocumentDescriptor = {
				descriptorType: 'rendered',
				status: 'failed',
				job_id: event.job_id,
				latestRenderedResourceId: event.job_id,
				modelId: event.modelId,
				versionHash: versionInfo.versionHash,
				lastRenderedResourceId: event.job_id,
				lastRenderAtIso: versionInfo.updatedAt,
			};
			if (stepKey !== undefined) {
				renderedDescriptor.stepKey = stepKey;
			}
			progress.documents[documentsKey] = renderedDescriptor;
			descriptorVersionInfo = null;
			return renderedDescriptor;
		};

		const descriptor = ensureDescriptor();
		descriptor.status = 'failed';
		descriptor.job_id = event.job_id;
		descriptor.modelId = event.modelId;
		descriptor.error = event.error;
		if (descriptor.descriptorType !== 'rendered') {
			descriptor.descriptorType = 'rendered';
		}
		if (stepKey !== undefined) {
			descriptor.stepKey = stepKey;
		}

		if (hasLatestResource) {
			descriptor.latestRenderedResourceId = event.latestRenderedResourceId!;
			if (!descriptorVersionInfo) {
				descriptorVersionInfo = buildVersionInfo(event.latestRenderedResourceId!);
			}
			descriptor.versionHash = descriptorVersionInfo.versionHash;
			descriptor.lastRenderedResourceId = event.latestRenderedResourceId!;
			descriptor.lastRenderAtIso = descriptorVersionInfo.updatedAt;
		}

		if (descriptorVersionInfo) {
			upsertStageDocumentVersionLogic(state, compositeKey, descriptorVersionInfo);
			ensureStageDocumentContentLogic(state, compositeKey, {
				baselineMarkdown: '',
				version: descriptorVersionInfo,
			});
		}

		const contentEntry = ensureStageDocumentContentLogic(state, compositeKey, {
			baselineMarkdown: '',
			version: null,
		});
		contentEntry.error = event.error;
		contentEntry.isLoading = false;
	});
};

export const fetchStageDocumentFeedbackLogic = async (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	key: StageDocumentCompositeKey,
) => {
	const serializedKey = getStageDocumentKey(key);
	set(state => {
		state.isLoadingStageDocumentFeedback = true;
		state.stageDocumentFeedbackError = null;
	});

	try {
		const response = await api.dialectic().getStageDocumentFeedback(key);
		if (response.error || !response.data) {
			const error = response.error || { message: 'No feedback content found.', code: 'NOT_FOUND' };
			set(state => {
				state.isLoadingStageDocumentFeedback = false;
				state.stageDocumentFeedbackError = error;
			});
		} else {
			set(state => {
				state.stageDocumentFeedback[serializedKey] = response.data!;
				state.isLoadingStageDocumentFeedback = false;
			});
		}
	} catch (err: unknown) {
		const error: ApiError = {
			message: err instanceof Error ? err.message : 'An unknown network error occurred.',
			code: 'NETWORK_ERROR',
		};
		set(state => {
			state.isLoadingStageDocumentFeedback = false;
			state.stageDocumentFeedbackError = error;
		});
	}
};

export const submitStageDocumentFeedbackLogic = async (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	payload: SubmitStageDocumentFeedbackPayload,
	storage: IKeyValueStorage | null,
): Promise<ApiResponse<{ success: boolean }>> => {
	set(state => {
		state.isSubmittingStageDocumentFeedback = true;
		state.submitStageDocumentFeedbackError = null;
	});

	try {
		// Locate the normalized document resource associated with the incoming composite key
		const compositeKey: StageDocumentCompositeKey = {
			sessionId: payload.sessionId,
			stageSlug: payload.stageSlug,
			iterationNumber: payload.iterationNumber,
			modelId: payload.modelId,
			documentKey: payload.documentKey,
		};
		const serializedKey = getStageDocumentKey(compositeKey);
		const contentEntry = get().stageDocumentContent[serializedKey];

		const missing: string[] = [];
		if (payload.feedbackContent === undefined || payload.feedbackContent === null) missing.push('feedbackContent');
		if (payload.userId === undefined || payload.userId === null || payload.userId === '') missing.push('userId');
		if (payload.projectId === undefined || payload.projectId === null || payload.projectId === '') missing.push('projectId');
		if (payload.feedbackType === undefined || payload.feedbackType === null || payload.feedbackType === '') missing.push('feedbackType');
		if (contentEntry === undefined) missing.push('stageDocumentContent entry');
		if (missing.length > 0) {
			const error: ApiError = {
				message: `Cannot submit feedback: missing required fields: ${missing.join(', ')}.`,
				code: 'VALIDATION_ERROR',
			};
			logger.error('[submitStageDocumentFeedback] Missing required payload fields', {
				serializedKey,
				missing,
			});
			set(state => {
				state.isSubmittingStageDocumentFeedback = false;
				state.submitStageDocumentFeedbackError = error;
			});
			return { data: undefined, error, status: 400 };
		}

		const sourceContributionId: string | null = contentEntry.sourceContributionId;

		const enrichedPayload: SubmitStageDocumentFeedbackPayload = {
			sessionId: payload.sessionId,
			stageSlug: payload.stageSlug,
			iterationNumber: payload.iterationNumber,
			modelId: payload.modelId,
			documentKey: payload.documentKey,
			feedbackContent: payload.feedbackContent,
			userId: payload.userId,
			projectId: payload.projectId,
			feedbackType: payload.feedbackType,
			...(payload.feedbackId !== undefined && { feedbackId: payload.feedbackId }),
			sourceContributionId,
		};

		const response = await api.dialectic().submitStageDocumentFeedback(enrichedPayload);
		if (response.error) {
			logger.error(
				'[submitStageDocumentFeedback] Failed to submit document feedback',
				{
					error: response.error,
					key: serializedKey,
				},
			);
			set(state => {
				state.isSubmittingStageDocumentFeedback = false;
				state.submitStageDocumentFeedbackError = response.error;
			});
		} else {
			set(state => {
				state.isSubmittingStageDocumentFeedback = false;
				state.submitStageDocumentFeedbackError = null;
				flushStageDocumentFeedbackDraftLogic(state, compositeKey, storage, payload.userId);
			});
		}
		return response;
	} catch (err: unknown) {
		const error: ApiError = {
			message: err instanceof Error ? err.message : 'An unknown network error occurred.',
			code: 'NETWORK_ERROR',
		};
		set(state => {
			state.isSubmittingStageDocumentFeedback = false;
			state.submitStageDocumentFeedbackError = error;
		});
		return { data: undefined, error, status: 500 };
	}
};

export const selectStageDocumentFeedbackLogic = (
	get: () => DialecticStore,
	key: StageDocumentCompositeKey,
) => {
	const serializedKey = getStageDocumentKey(key);
	return get().stageDocumentFeedback[serializedKey];
};

export const initializeFeedbackDraftLogic = async (
	get: () => DialecticStore,
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	key: StageDocumentCompositeKey,
	storage: IKeyValueStorage | null,
	userId: string | null,
): Promise<void> => {
	const serializedKey = getStageDocumentKey(key);
	const existingEntry = get().stageDocumentContent[serializedKey];
	if (existingEntry && existingEntry.feedbackIsDirty) {
		return;
	}

	set(state => {
		state.isInitializingFeedbackDraft = true;
		state.initializeFeedbackDraftError = null;
	});

	const response = await api.dialectic().getStageDocumentFeedback(key);

	let savedFeedbackContent: string | null = null;
	if (!response.error && response.data && response.data.length > 0) {
		savedFeedbackContent = response.data[0].content;
	} else if (response.error) {
		set(state => {
			state.isInitializingFeedbackDraft = false;
			state.initializeFeedbackDraftError = response.error;
		});
		// Do not return here, still check for local draft
	}

	let localDraft: string | null = null;
	if (storage && userId) {
		try {
			localDraft = storage.getItem(buildFeedbackLocalStorageKey(userId, key));
		} catch (err: unknown) {
			logger.warn('[initializeFeedbackDraftLogic] localStorage read failed', { err });
		}
	}

	set((state) => {
		const draftToUse = localDraft ?? savedFeedbackContent ?? '';
		const isDirty = localDraft !== null;

		const entry = ensureStageDocumentContentLogic(state, key, {
			baselineMarkdown: '',
			version: null,
		});
		entry.feedbackDraftMarkdown = draftToUse;
		entry.feedbackIsDirty = isDirty;

		state.isInitializingFeedbackDraft = false;
		if (!response.error) {
			state.initializeFeedbackDraftError = null;
		}
	});
};

export const hydrateStageProgressLogic = async (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	payload: ListStageDocumentsPayload,
) => {
	const { sessionId, stageSlug, iterationNumber } = payload;
	const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

	try {
		const response = await api.dialectic().listStageDocuments(payload);

		if (response.error || !response.data) {
			const error = response.error || {
				message: 'No documents found for this stage.',
				code: 'NOT_FOUND',
			};
			logger.error('[hydrateStageProgress] Failed to list stage documents', {
				error,
				...payload,
			});
			// Optionally set an error state here if the store is designed to track it
			return;
		}

		const data = response.data;
		if (!data) return;

		const allValid = data.every(isStageRenderedDocumentChecklistEntry);
		if (!allValid) {
			logger.error('[hydrateStageProgress] Invalid response: every document must have documentKey, modelId, jobId, and latestRenderedResourceId as non-empty strings', {
				sessionId,
				stageSlug,
				iterationNumber,
			});
			return;
		}

		set((state) => {
			if (!state.stageRunProgress[progressKey]) {
				state.stageRunProgress[progressKey] = {
					documents: {},
					stepStatuses: {},
					jobProgress: {},
				};
			}

			const progress = state.stageRunProgress[progressKey];
			data.forEach((doc) => {
				if (!isStageRenderedDocumentChecklistEntry(doc)) return;

				const versionInfo = createVersionInfo(doc.latestRenderedResourceId);
				const descriptorStatus: StageRunDocumentStatus = doc.status;
				const documentsKey = getStageRunDocumentKey(doc.documentKey, doc.modelId);
				const descriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
					status: descriptorStatus,
					jobId: doc.jobId,
					latestRenderedResourceId: doc.latestRenderedResourceId,
					modelId: doc.modelId,
					versionInfo,
					stepKey: doc.stepKey,
				});
				descriptor.status = descriptorStatus;
				descriptor.job_id = doc.jobId;
				descriptor.latestRenderedResourceId = doc.latestRenderedResourceId;
				descriptor.modelId = doc.modelId;
				descriptor.versionHash = versionInfo.versionHash;
				descriptor.lastRenderedResourceId = doc.latestRenderedResourceId;
				descriptor.lastRenderAtIso = versionInfo.updatedAt;
				if (doc.stepKey !== undefined) {
					descriptor.stepKey = doc.stepKey;
				}
			});
		});
	} catch (err: unknown) {
		const error: ApiError = {
			message:
				err instanceof Error ? err.message : 'An unknown network error occurred.',
			code: 'NETWORK_ERROR',
		};
		logger.error('[hydrateStageProgress] Network error', { error, ...payload });
	}
};

export const hydrateAllStageProgressLogic = async (
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	payload: GetAllStageProgressPayload,
): Promise<void> => {
	const { sessionId, iterationNumber } = payload;

	try {
		const response = await api.dialectic().getAllStageProgress(payload);

		if (response.error || response.data === undefined) {
			const error = response.error || {
				message: 'Failed to get all stage progress.',
				code: 'NOT_FOUND',
			};
			logger.error('[hydrateAllStageProgress] Failed to get all stage progress', {
				error,
				...payload,
			});
			return;
		}

		if (response.data.length === 0) {
			return;
		}

		const entries = response.data;

		let responseValid = true;
		for (const entry of entries) {
			for (const doc of entry.documents) {
				if (!isStageRenderedDocumentChecklistEntry(doc)) {
					responseValid = false;
					break;
				}
			}
			if (!responseValid) break;
		}
		if (!responseValid) {
			logger.error('[hydrateAllStageProgress] Invalid response: every document must have documentKey, modelId, jobId, and latestRenderedResourceId as non-empty strings', {
				sessionId,
				iterationNumber,
			});
			return;
		}

		set((state) => {
			for (const entry of entries) {
				const progressKey = `${sessionId}:${entry.stageSlug}:${iterationNumber}`;

				if (!state.stageRunProgress[progressKey]) {
					state.stageRunProgress[progressKey] = {
						documents: {},
						stepStatuses: {},
						jobProgress: {},
					};
				}

				const progress = state.stageRunProgress[progressKey];
				if (entry.jobProgress) {
					for (const [stepKey, jobEntry] of Object.entries(entry.jobProgress)) {
						progress.jobProgress[stepKey] = { ...jobEntry };
					}
				}
				for (const [key, value] of Object.entries(entry.stepStatuses)) {
					if (isStepStatus(value)) {
						progress.stepStatuses[key] = value;
					}
				}

				for (const doc of entry.documents) {
					if (!isStageRenderedDocumentChecklistEntry(doc)) continue;

					const descriptorStatus: StageRunDocumentStatus = doc.status;
					const documentsKey = getStageRunDocumentKey(doc.documentKey, doc.modelId);
					const versionInfo = createVersionInfo(doc.latestRenderedResourceId);
					const descriptor = ensureRenderedDocumentDescriptor(progress, documentsKey, {
						status: descriptorStatus,
						jobId: doc.jobId,
						latestRenderedResourceId: doc.latestRenderedResourceId,
						modelId: doc.modelId,
						versionInfo,
						stepKey: doc.stepKey,
					});
					descriptor.status = descriptorStatus;
					descriptor.job_id = doc.jobId;
					descriptor.latestRenderedResourceId = doc.latestRenderedResourceId;
					descriptor.modelId = doc.modelId;
					descriptor.versionHash = versionInfo.versionHash;
					descriptor.lastRenderedResourceId = doc.latestRenderedResourceId;
					descriptor.lastRenderAtIso = versionInfo.updatedAt;
					if (doc.stepKey !== undefined) {
						descriptor.stepKey = doc.stepKey;
					}
				}
			}
		});
	} catch (err: unknown) {
		const error: ApiError = {
			message:
				err instanceof Error ? err.message : 'An unknown network error occurred.',
			code: 'NETWORK_ERROR',
		};
		logger.error('[hydrateAllStageProgress] Network error', { error, ...payload });
	}
};

