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
	DocumentStartedPayload,
	DocumentChunkCompletedPayload,
	RenderCompletedPayload,
	JobFailedPayload,
	ListStageDocumentsPayload,
	SubmitStageDocumentFeedbackPayload,
} from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';

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

export const getStageDocumentKey = (key: StageDocumentCompositeKey): string =>
	`${key.sessionId}:${key.stageSlug}:${key.iterationNumber}:${key.modelId}:${key.documentKey}`;

export const upsertStageDocumentVersionLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
  info: StageDocumentVersionInfo,
): void => {
	const serializedKey = getStageDocumentKey(key);
  state.stageDocumentVersions[serializedKey] = info;
};

export const ensureStageDocumentContentLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
	seed?: { baselineMarkdown?: string; version?: StageDocumentVersionInfo },
): StageDocumentContentState => {
	const serializedKey = getStageDocumentKey(key);
  const existing = state.stageDocumentContent[serializedKey];
  if (existing) {
		console.log(
			'[ensureStageDocumentContentLogic] Found existing entry.',
			JSON.parse(JSON.stringify({ key, seed })),
		);
		if (seed?.baselineMarkdown) {
			console.log(
				`[ensureStageDocumentContentLogic] Updating baseline from '${existing.baselineMarkdown}' to '${seed.baselineMarkdown}'`,
			);
			existing.baselineMarkdown = seed.baselineMarkdown;
		}
    if (seed?.version) {
      existing.lastBaselineVersion = seed.version;
      if (!existing.lastAppliedVersionHash) {
        existing.lastAppliedVersionHash = seed.version.versionHash;
      }
    }
    return existing;
  }

  const baselineMarkdown = seed?.baselineMarkdown ?? '';
  const version = seed?.version ?? null;

  const entry: StageDocumentContentState = {
    baselineMarkdown,
    currentDraftMarkdown: baselineMarkdown,
    isDirty: false,
    isLoading: false,
    error: null,
    lastBaselineVersion: version,
    pendingDiff: null,
    lastAppliedVersionHash: version?.versionHash ?? null,
  };

  state.stageDocumentContent[serializedKey] = entry;
  return entry;
};

export const recordStageDocumentDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
  draftMarkdown: string,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key);
  entry.currentDraftMarkdown = draftMarkdown;
  const diff = deriveDiff(entry.baselineMarkdown, draftMarkdown);
  entry.pendingDiff = diff;
  entry.isDirty = diff !== null;
};

export const flushStageDocumentDraftLogic = (
	state: Draft<DialecticStateValues>,
	key: StageDocumentCompositeKey,
): void => {
	const entry = ensureStageDocumentContentLogic(state, key);
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
		seed?: { baselineMarkdown?: string; version?: StageDocumentVersionInfo },
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
		const entry = helpers.ensureStageDocumentContent(
			state,
			key,
			existingEntry
				? undefined
				: version
					? { baselineMarkdown: initialDraftMarkdown, version }
					: { baselineMarkdown: initialDraftMarkdown },
		);
		if (!existingEntry) {
			entry.baselineMarkdown = initialDraftMarkdown;
			entry.currentDraftMarkdown = initialDraftMarkdown;
			entry.isDirty = false;
			entry.pendingDiff = null;
			if (version) {
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
			state.stageDocumentContent[serializedKey] = {
				baselineMarkdown: '',
				currentDraftMarkdown: '',
				isDirty: false,
				isLoading: true,
				error: null,
				lastBaselineVersion: versionInfo,
				pendingDiff: null,
				lastAppliedVersionHash: versionInfo.versionHash,
			};
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
				const entry = helpers.ensureStageDocumentContent(state, key);
				entry.isLoading = false;
				entry.error = errorDetails;
			});
			return;
		}

		const baselineMarkdown = response.data.content ?? '';
		set((state) => {
			console.log(
				'[fetchStageDocumentContentLogic] Calling reapplyDraftToNewBaseline with:',
				JSON.parse(JSON.stringify({ key, baselineMarkdown, versionInfo })),
			);
			helpers.reapplyDraftToNewBaseline(state, key, baselineMarkdown, versionInfo);
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
			const entry = helpers.ensureStageDocumentContent(state, key);
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
	const stepKey = event.step_key ?? recipe.steps.find((step) => step.job_type === 'PLAN')?.step_key;
	if (!stepKey) {
		logger.warn('[DialecticStore] planner_started ignored; step not found', { stageSlug: event.stageSlug, providedStepKey: event.step_key });
		return;
	}
	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		progress.stepStatuses[stepKey] = 'in_progress';
	});
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
	const stepKey = event.step_key ?? recipe.steps.find((step) => step.job_type === 'EXECUTE')?.step_key;
	if (!stepKey) {
		logger.warn('[DialecticStore] document_started ignored; step not found', { stageSlug: event.stageSlug, providedStepKey: event.step_key });
		return;
	}
	const latestRenderedResourceId = event.latestRenderedResourceId;
	if (typeof latestRenderedResourceId !== 'string' || latestRenderedResourceId.length === 0) {
		logger.warn('[DialecticStore] document_started ignored; latestRenderedResourceId missing', {
			stageSlug: event.stageSlug,
			documentKey: event.document_key,
			jobId: event.job_id,
		});
		return;
	}

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};
	const versionInfo = createVersionInfo(latestRenderedResourceId);

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
		ensureStageDocumentContentLogic(state, compositeKey, {
			baselineMarkdown: '',
			version: versionInfo,
		});
		progress.stepStatuses[stepKey] = 'in_progress';
		const documentKeyValue = event.document_key;
		const existingDocument = progress.documents[documentKeyValue];
		if (existingDocument) {
			existingDocument.status = 'generating';
			existingDocument.job_id = event.job_id;
			existingDocument.latestRenderedResourceId = latestRenderedResourceId;
			existingDocument.modelId = event.modelId;
			existingDocument.versionHash = versionInfo.versionHash;
			existingDocument.lastRenderedResourceId = latestRenderedResourceId;
			existingDocument.lastRenderAtIso = versionInfo.updatedAt;
		} else {
			progress.documents[documentKeyValue] = {
				status: 'generating',
				job_id: event.job_id,
				latestRenderedResourceId,
				modelId: event.modelId,
				versionHash: versionInfo.versionHash,
				lastRenderedResourceId: latestRenderedResourceId,
				lastRenderAtIso: versionInfo.updatedAt,
			};
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
		const documentEntry = progress.documents[event.document_key];
		if (!documentEntry) {
			logger.warn('[DialecticStore] document_chunk_completed ignored; document not tracked', { progressKey, documentKey: event.document_key });
			return;
		}
		documentEntry.job_id = event.job_id;
		if (event.isFinalChunk === true) {
			documentEntry.status = 'completed';
		} else {
			documentEntry.status = 'continuing';
		}
		if (shouldUpdateVersion && versionInfo) {
			upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
			ensureStageDocumentContentLogic(state, compositeKey, {
				baselineMarkdown: '',
				version: versionInfo,
			});
			documentEntry.latestRenderedResourceId = latestRenderedResourceId;
			documentEntry.versionHash = versionInfo.versionHash;
			documentEntry.lastRenderedResourceId = latestRenderedResourceId;
			documentEntry.lastRenderAtIso = versionInfo.updatedAt;
			documentEntry.modelId = event.modelId;
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
	const stepKey = event.step_key ?? recipe.steps.find((step) => step.job_type === 'RENDER')?.step_key;
	if (!stepKey) {
		logger.warn('[DialecticStore] render_completed ignored; step not found', { stageSlug: event.stageSlug, providedStepKey: event.step_key });
		return;
	}
	const latestRenderedResourceId = event.latestRenderedResourceId;
	if (typeof latestRenderedResourceId !== 'string' || latestRenderedResourceId.length === 0) {
		logger.warn('[DialecticStore] render_completed ignored; latestRenderedResourceId missing', {
			stageSlug: event.stageSlug,
			documentKey: event.document_key,
			jobId: event.job_id,
		});
		return;
	}

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
		progress.stepStatuses[stepKey] = 'completed';
		const documentKeyValue = event.document_key;
		const existingDocument = progress.documents[documentKeyValue];
		if (existingDocument) {
			existingDocument.status = 'completed';
			existingDocument.job_id = event.job_id;
			existingDocument.latestRenderedResourceId = latestRenderedResourceId;
			existingDocument.modelId = event.modelId;
			existingDocument.versionHash = versionInfo.versionHash;
			existingDocument.lastRenderedResourceId = latestRenderedResourceId;
			existingDocument.lastRenderAtIso = versionInfo.updatedAt;
		} else {
			progress.documents[documentKeyValue] = {
				status: 'completed',
				job_id: event.job_id,
				latestRenderedResourceId,
				modelId: event.modelId,
				versionHash: versionInfo.versionHash,
				lastRenderedResourceId: latestRenderedResourceId,
				lastRenderAtIso: versionInfo.updatedAt,
			};
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
	const stepKey = event.step_key ?? recipe.steps.find((step) => step.job_type === 'EXECUTE' || step.job_type === 'PLAN')?.step_key;
	if (!stepKey) {
		logger.warn('[DialecticStore] job_failed ignored; step not found', { stageSlug: event.stageSlug, providedStepKey: event.step_key });
		return;
	}
	const latestRenderedResourceId = event.latestRenderedResourceId;
	if (typeof latestRenderedResourceId !== 'string' || latestRenderedResourceId.length === 0) {
		logger.warn('[DialecticStore] job_failed ignored; latestRenderedResourceId missing', {
			stageSlug: event.stageSlug,
			documentKey: event.document_key,
			jobId: event.job_id,
		});
		return;
	}

	const compositeKey: StageDocumentCompositeKey = {
		sessionId: event.sessionId,
		stageSlug: event.stageSlug,
		iterationNumber: event.iterationNumber,
		modelId: event.modelId,
		documentKey: event.document_key,
	};
	const versionInfo = createVersionInfo(latestRenderedResourceId);

	set((state) => {
		const progress = state.stageRunProgress[progressKey];
		if (!progress) {
			return;
		}
		progress.stepStatuses[stepKey] = 'failed';
		const documentKeyValue = event.document_key;
		const existingDocument = progress.documents[documentKeyValue];
		if (existingDocument) {
			existingDocument.status = 'failed';
			existingDocument.job_id = event.job_id;
			existingDocument.latestRenderedResourceId = latestRenderedResourceId;
			existingDocument.modelId = event.modelId;
			existingDocument.versionHash = versionInfo.versionHash;
			existingDocument.lastRenderedResourceId = latestRenderedResourceId;
			existingDocument.lastRenderAtIso = versionInfo.updatedAt;
		} else {
			progress.documents[documentKeyValue] = {
				status: 'failed',
				job_id: event.job_id,
				latestRenderedResourceId,
				modelId: event.modelId,
				versionHash: versionInfo.versionHash,
				lastRenderedResourceId: latestRenderedResourceId,
				lastRenderAtIso: versionInfo.updatedAt,
			};
		}
		upsertStageDocumentVersionLogic(state, compositeKey, versionInfo);
		ensureStageDocumentContentLogic(state, compositeKey, {
			baselineMarkdown: '',
			version: versionInfo,
		});
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
	set: (fn: (draft: Draft<DialecticStateValues>) => void) => void,
	payload: SubmitStageDocumentFeedbackPayload,
): Promise<ApiResponse<{ success: boolean }>> => {
	set(state => {
		state.isSubmittingStageDocumentFeedback = true;
		state.submitStageDocumentFeedbackError = null;
	});

	try {
		const response = await api.dialectic().submitStageDocumentFeedback(payload);
		if (response.error) {
			logger.error(
				'[submitStageDocumentFeedback] Failed to submit document feedback',
				{
					error: response.error,
					key: getStageDocumentKey(payload),
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
				// On success, flush the draft
				const key: StageDocumentCompositeKey = {
					sessionId: payload.sessionId,
					stageSlug: payload.stageSlug,
					iterationNumber: payload.iterationNumber,
					modelId: payload.modelId,
					documentKey: payload.documentKey,
				};
				flushStageDocumentDraftLogic(state, key);
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

		set((state) => {
			if (!state.stageRunProgress[progressKey]) {
				state.stageRunProgress[progressKey] = {
					documents: {},
					stepStatuses: {},
				};
			}

			const progress = state.stageRunProgress[progressKey];
			response.data?.forEach((doc) => {
				const { documentKey, modelId, status, jobId, latestRenderedResourceId } =
					doc;
				
				const versionInfo = createVersionInfo(latestRenderedResourceId);

				if (!jobId) {
					logger.warn('[hydrateStageProgress] Job ID missing for document', { documentKey, modelId, status, latestRenderedResourceId });
					return;
				}
				progress.documents[documentKey] = {
					status,
					job_id: jobId,
					latestRenderedResourceId,
					modelId,
					versionHash: versionInfo.versionHash,
					lastRenderedResourceId: latestRenderedResourceId,
					lastRenderAtIso: versionInfo.updatedAt,
				};
			});
		});
	} catch (err: unknown) {
		const error: ApiError = {
			message:
				err instanceof Error ? err.message : 'An unknown network error occurred.',
			code: 'NETWORK_ERROR',
		};
		logger.error('[hydrateStageProgress] Network error', { error, ...payload });
		// Optionally set an error state here
	}
};

