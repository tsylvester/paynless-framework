import {
  UnifiedAIResponse,
  ModelProcessingResult,
  ExecuteModelCallAndSaveParams,
  SourceDocument,
  DialecticRenderJobPayload,
  DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { 
    FileType, 
    ModelContributionFileTypes, 
    ModelContributionUploadContext 
} from '../_shared/types/file_manager.types.ts';
import { 
    isDialecticContribution, 
    isAiModelExtendedConfig, 
    isDialecticExecuteJobPayload, 
    isContributionType, 
    isApiChatMessage, 
    isDialecticContinueReason, 
    isRecord, 
    isFinishReason, 
    isDocumentRelationships,
    isJson,
    isDialecticRenderJobPayload,
} from "../_shared/utils/type_guards.ts";
import { 
    AiModelExtendedConfig, 
    ChatApiRequest, 
    Messages, 
    FinishReason 
} from '../_shared/types.ts';
import { 
    CountTokensDeps, 
    CountableChatPayload 
} from '../_shared/types/tokenizer.types.ts';
import { 
    ContextWindowError, 
    RenderJobValidationError, 
    RenderJobEnqueueError 
} from '../_shared/utils/errors.ts';
import { ResourceDocuments } from "../_shared/types.ts";
import { getMaxOutputTokens } from '../_shared/utils/affordability_utils.ts';
import { deconstructStoragePath } from '../_shared/utils/path_deconstructor.ts';
import { extractSourceGroupFragment } from '../_shared/utils/path_utils.ts';
import { TablesInsert } from '../types_db.ts';
import { sanitizeJsonContent } from '../_shared/utils/jsonSanitizer.ts';
import { isJsonSanitizationResult } from '../_shared/utils/type-guards/type_guards.jsonSanitizer.ts';
import { JsonSanitizationResult } from '../_shared/types/jsonSanitizer.interface.ts';
import { 
    isDocumentKey, 
    isFileType,
    isDocumentRelated
} from '../_shared/utils/type-guards/type_guards.file_manager.ts';

export async function executeModelCallAndSave(
    params: ExecuteModelCallAndSaveParams,
) {
    const { 
        dbClient, 
        deps, 
        job, 
        projectOwnerUserId, 
        providerDetails, 
        promptConstructionPayload,
        compressionStrategy,
    } = params;
    
    //console.log('[executeModelCallAndSave] Received job payload:', JSON.stringify(job.payload, null, 2));
    
    const { 
        id: jobId, 
        attempt_count: currentAttempt, 
    } = job;
    
    // Validate user_jwt before type guard to ensure correct error message when missing
    let userAuthTokenEarly: string | undefined = undefined;
    {
        const desc = Object.getOwnPropertyDescriptor(job.payload, 'user_jwt');
        if (desc) {
            const potential = desc.value;
            if (typeof potential === 'string' && potential.length > 0) {
                userAuthTokenEarly = potential;
            }
        }
    }
    if (!userAuthTokenEarly) {
        throw new Error('payload.user_jwt required');
    }
    
    if (!isDialecticExecuteJobPayload(job.payload)) {
        throw new Error(`Job ${job.id} does not have a valid 'execute' payload.`);
    }
    
    const { 
        iterationNumber: iterationNumberRaw, 
        stageSlug: stageSlugRaw, 
        projectId: projectIdRaw, 
        model_id: model_idRaw,
        sessionId: sessionIdRaw,
        walletId: walletIdRaw,
        output_type,
    } = job.payload;

    deps.logger.info('[executeModelCallAndSave] Validating payload fields', {
        jobId,
        hasStageSlug: !!stageSlugRaw,
        stageSlugType: typeof stageSlugRaw,
        hasWalletId: !!walletIdRaw,
        walletIdType: typeof walletIdRaw,
        hasIterationNumber: iterationNumberRaw !== undefined,
        iterationNumberType: typeof iterationNumberRaw,
        hasProjectId: !!projectIdRaw,
        projectIdType: typeof projectIdRaw,
        hasSessionId: !!sessionIdRaw,
        sessionIdType: typeof sessionIdRaw,
        hasModelId: !!model_idRaw,
        modelIdType: typeof model_idRaw,
    });

    if (!stageSlugRaw || typeof stageSlugRaw !== 'string' || stageSlugRaw.trim() === '') {
        throw new Error(`Job ${jobId} is missing required stageSlug in its payload.`);
    }
    const stageSlug: string = stageSlugRaw;

    // Enforce wallet presence for ALL requests before any provider calls or sizing
    if (typeof walletIdRaw !== 'string' || walletIdRaw.trim() === '') {
        throw new Error('Wallet is required to process model calls.');
    }
    const walletId: string = walletIdRaw;

    let iterationNumber: number;
    if (typeof iterationNumberRaw === 'number') {
        iterationNumber = iterationNumberRaw;
    } else {
        deps.logger.error('[executeModelCallAndSave] iterationNumber validation failed', {
            jobId,
            iterationNumberRaw,
            iterationNumberType: typeof iterationNumberRaw,
        });
        throw new Error(`Job ${jobId} is missing required iterationNumber in its payload.`);
    }
    
    let projectId: string;
    if (typeof projectIdRaw === 'string' && projectIdRaw.trim() !== '') {
        projectId = projectIdRaw;
    } else {
        deps.logger.error('[executeModelCallAndSave] projectId validation failed', {
            jobId,
            projectIdRaw,
            projectIdType: typeof projectIdRaw,
        });
        throw new Error(`Job ${jobId} is missing required projectId in its payload.`);
    }
    
    let sessionId: string;
    if (typeof sessionIdRaw === 'string' && sessionIdRaw.trim() !== '') {
        sessionId = sessionIdRaw;
    } else {
        deps.logger.error('[executeModelCallAndSave] sessionId validation failed', {
            jobId,
            sessionIdRaw,
            sessionIdType: typeof sessionIdRaw,
        });
        throw new Error(`Job ${jobId} is missing required sessionId in its payload.`);
    }
    
    let model_id: string;
    if (typeof model_idRaw === 'string' && model_idRaw.trim() !== '') {
        model_id = model_idRaw;
    } else {
        deps.logger.error('[executeModelCallAndSave] model_id validation failed', {
            jobId,
            model_idRaw,
            modelIdType: typeof model_idRaw,
        });
        throw new Error(`Job ${jobId} is missing required model_id in its payload.`);
    }

    const { data: fullProviderData, error: providerError } = await dbClient
        .from('ai_providers')
        .select('*')
        .eq('id', providerDetails.id)
        .single();
    
    if (providerError || !fullProviderData) {
        throw new Error(`Could not fetch full provider details for ID ${providerDetails.id}.`);
    }

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Executing model call for job ID: ${jobId}`);

    const modelConfig = fullProviderData.config;
    if (!isAiModelExtendedConfig(modelConfig)) {
        throw new Error(`Model ${fullProviderData.id} has invalid or missing configuration.`);
    }

    const extendedModelConfig: AiModelExtendedConfig = {
        model_id: fullProviderData.id,
        api_identifier: fullProviderData.api_identifier,
        input_token_cost_rate: modelConfig.input_token_cost_rate,
        output_token_cost_rate: modelConfig.output_token_cost_rate,
        tokenization_strategy: modelConfig.tokenization_strategy,
        context_window_tokens: modelConfig.context_window_tokens,
        provider_max_output_tokens: modelConfig.provider_max_output_tokens,
        provider_max_input_tokens: modelConfig.provider_max_input_tokens,
    };

    const {
        systemInstruction,
        conversationHistory,
        currentUserPrompt,
    } = promptConstructionPayload;

    // 8.h.i: Gather prior artifacts from contributions, resources, and feedback
    type IdentityDoc = { id: string; content: string } & Record<string, unknown>;
    const gatherArtifacts = async (): Promise<IdentityDoc[]> => {
        // Require explicit inputsRequired; if absent, gather nothing
        const rulesUnknown = (params && Array.isArray(params.inputsRequired)) ? params.inputsRequired : [];
        if (rulesUnknown.length === 0) return [];

        const gathered: IdentityDoc[] = [];

        // Helper: pick latest by created_at
        const pickLatest = <T extends Record<string, unknown>>(rows: T[]): T | undefined => {
            let latest: T | undefined = undefined;
            let bestTs = -Infinity;
            for (const row of rows) {
                const tsRaw = typeof row['created_at'] === 'string' ? row['created_at'] : undefined;
                const ts = tsRaw ? Date.parse(tsRaw) : NaN;
                const score = Number.isFinite(ts) ? ts : -Infinity;
                if (score > bestTs) { bestTs = score; latest = row; }
            }
            return latest;
        };

        for (const ru of rulesUnknown) {
            const rType = isRecord(ru) && typeof ru['type'] === 'string' ? ru['type'] : undefined; // 'document' | 'feedback'
            const rStage = isRecord(ru) && typeof ru['slug'] === 'string' ? ru['slug'] : undefined;
            const rKey = isRecord(ru) && typeof ru['document_key'] === 'string' ? ru['document_key'] : undefined;
            const rRequired = isRecord(ru) && typeof ru['required'] === 'boolean' ? ru['required'] : true; // Default to required if not specified
            if (!rType || !rStage || !rKey) continue;

            try {
                if (rType === 'document') {
                    // Query dialectic_project_resources for finished rendered documents (fail loud and hard if not found)
                    deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
                    const { data, error } = await dbClient
                        .from('dialectic_project_resources')
                        .select('*')
                        .eq('project_id', projectId)
                        .eq('session_id', sessionId)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage_slug', rStage)
                        .eq('resource_type', 'rendered_document');
                    if (error) {
                        deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`, { error });
                        if (rRequired === false) {
                            deps.logger.info(`[gatherArtifacts] Error querying optional document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping optional input.`);
                            continue;
                        }
                        throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
                    }
                    if (!Array.isArray(data) || data.length === 0) {
                        deps.logger.warn(`[gatherArtifacts] No resources found in dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
                        if (rRequired === false) {
                            deps.logger.info(`[gatherArtifacts] No rendered documents found for optional input rule type 'document' with stage '${rStage}' and document_key '${rKey}'. Skipping optional input.`);
                            continue;
                        }
                        throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
                    }
                    const filtered = (data).filter((row) => {
                        const fileName = isRecord(row) && typeof row['file_name'] === 'string' ? row['file_name'] : '';
                        const storageDir = isRecord(row) && typeof row['storage_path'] === 'string' ? row['storage_path'] : '';
                        const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                        const rowStage = (isRecord(row) && typeof row['stage_slug'] === 'string') ? row['stage_slug']
                            : (typeof parsed.stageSlug === 'string' ? parsed.stageSlug : undefined);
                        const parsedKey = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                        return rowStage === rStage && parsedKey === rKey;
                    });
                    const latest = pickLatest(filtered);
                    if (latest && isRecord(latest)) {
                        const u: unknown = latest;
                        const id = isRecord(u) && typeof u['id'] === 'string' ? u['id'] : undefined;
                        const fileName = isRecord(u) && typeof u['file_name'] === 'string' ? u['file_name'] : '';
                        const storageDir = isRecord(u) && typeof u['storage_path'] === 'string' ? u['storage_path'] : '';
                        const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                        const stageSlugEff = isRecord(u) && typeof u['stage_slug'] === 'string' ? u['stage_slug'] : (parsed.stageSlug || undefined);
                        const docKeyEff = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                        const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';
                        if (id && stageSlugEff && docKeyEff) {
                            deps.logger.info(`[gatherArtifacts] Found rendered document in dialectic_project_resources: id='${id}', stage='${stageSlugEff}', document_key='${docKeyEff}'`);
                            gathered.push({ id, content, document_key: docKeyEff, stage_slug: stageSlugEff, type: 'document' });
                        } else {
                            deps.logger.warn(`[gatherArtifacts] Resource found but missing required fields: id='${id}', stageSlugEff='${stageSlugEff}', docKeyEff='${docKeyEff}'`);
                            if (rRequired === false) {
                                deps.logger.info(`[gatherArtifacts] Resource found but missing required fields for optional input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping optional input.`);
                                continue;
                            }
                            throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
                        }
                    } else {
                        deps.logger.warn(`[gatherArtifacts] No matching resource found after filtering for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
                        if (rRequired === false) {
                            deps.logger.info(`[gatherArtifacts] No matching resource found after filtering for optional input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping optional input.`);
                            continue;
                        }
                        throw new Error(`Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`);
                    }
                }
                if (rType === 'feedback') {
                    const { data, error } = await dbClient
                        .from('dialectic_feedback')
                        .select('*')
                        .eq('project_id', projectId)
                        .eq('session_id', sessionId)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage_slug', rStage);
                    if (!error && Array.isArray(data) && data.length > 0) {
                        const filtered = (data).filter((row) => {
                            const fileName = isRecord(row) && typeof row['file_name'] === 'string' ? row['file_name'] : '';
                            const storageDir = isRecord(row) && typeof row['storage_path'] === 'string' ? row['storage_path'] : '';
                            const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                            const rowStage = (isRecord(row) && typeof row['stage_slug'] === 'string') ? row['stage_slug']
                                : (typeof parsed.stageSlug === 'string' ? parsed.stageSlug : undefined);
                            const parsedKey = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                            return rowStage === rStage && parsedKey === rKey;
                        });
                        const latest = pickLatest(filtered);
                        if (latest && isRecord(latest)) {
                            const u: unknown = latest;
                            const id = isRecord(u) && typeof u['id'] === 'string' ? u['id'] : undefined;
                            const fileName = isRecord(u) && typeof u['file_name'] === 'string' ? u['file_name'] : '';
                            const storageDir = isRecord(u) && typeof u['storage_path'] === 'string' ? u['storage_path'] : '';
                            const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                            const stageSlugEff = isRecord(u) && typeof u['stage_slug'] === 'string' ? u['stage_slug'] : (parsed.stageSlug || undefined);
                            const docKeyEff = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                            const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';
                            if (id && stageSlugEff && docKeyEff) {
                                gathered.push({ id, content, document_key: docKeyEff, stage_slug: stageSlugEff, type: 'feedback' });
                            }
                        }
                    }
                }
                if (rType === 'seed_prompt') {
                    deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for seed_prompt input rule: stage='${rStage}', document_key='${rKey}'`);
                    const { data, error } = await dbClient
                        .from('dialectic_project_resources')
                        .select('*')
                        .eq('project_id', projectId)
                        .eq('session_id', sessionId)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage_slug', rStage)
                        .eq('resource_type', 'seed_prompt');
                    if (error) {
                        deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for seed_prompt: stage='${rStage}', document_key='${rKey}'`, { error });
                        if (rRequired === false) continue;
                        throw new Error(`Required seed_prompt for input rule with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                    if (!Array.isArray(data) || data.length === 0) {
                        deps.logger.warn(`[gatherArtifacts] No seed_prompt resources found for stage='${rStage}', document_key='${rKey}'`);
                        if (rRequired === false) continue;
                        throw new Error(`Required seed_prompt for input rule with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                    const latest = pickLatest(data);
                    if (latest && isRecord(latest)) {
                        const u: unknown = latest;
                        const id = isRecord(u) && typeof u['id'] === 'string' ? u['id'] : undefined;
                        const stageSlugEff = isRecord(u) && typeof u['stage_slug'] === 'string' ? u['stage_slug'] : rStage;
                        const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';
                        if (id && stageSlugEff) {
                            deps.logger.info(`[gatherArtifacts] Found seed_prompt in dialectic_project_resources: id='${id}', stage='${stageSlugEff}', document_key='${rKey}'`);
                            gathered.push({ id, content, document_key: rKey, stage_slug: stageSlugEff, type: 'seed_prompt' });
                        } else if (rRequired) {
                            throw new Error(`Required seed_prompt for input rule with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`);
                        }
                    } else if (rRequired) {
                        throw new Error(`Required seed_prompt for input rule with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                }
                if (rType === 'project_resource') {
                    const isInitialUserPrompt = rKey === 'initial_user_prompt';
                    const resourceTypeForQuery = isInitialUserPrompt ? 'initial_user_prompt' : 'project_resource';
                    deps.logger.info(`[gatherArtifacts] Querying dialectic_project_resources for project_resource: document_key='${rKey}', resource_type='${resourceTypeForQuery}'`);
                    const { data, error } = await dbClient
                        .from('dialectic_project_resources')
                        .select('*')
                        .eq('project_id', projectId)
                        .eq('resource_type', resourceTypeForQuery);
                    if (error) {
                        deps.logger.error(`[gatherArtifacts] Error querying dialectic_project_resources for project_resource: document_key='${rKey}'`, { error });
                        if (rRequired === false) continue;
                        throw new Error(`Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                    if (!Array.isArray(data) || data.length === 0) {
                        deps.logger.warn(`[gatherArtifacts] No project_resource found for document_key='${rKey}'`);
                        if (rRequired === false) continue;
                        throw new Error(`Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                    const latest = pickLatest(data);
                    if (latest && isRecord(latest)) {
                        const u: unknown = latest;
                        const id = isRecord(u) && typeof u['id'] === 'string' ? u['id'] : undefined;
                        const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';
                        if (id) {
                            deps.logger.info(`[gatherArtifacts] Found project_resource in dialectic_project_resources: id='${id}', document_key='${rKey}'`);
                            gathered.push({ id, content, document_key: rKey, stage_slug: rStage, type: 'project_resource' });
                        } else if (rRequired) {
                            throw new Error(`Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`);
                        }
                    } else if (rRequired) {
                        throw new Error(`Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`);
                    }
                } else if (rType === 'header_context' || (rType !== 'document' && rType !== 'feedback' && rType !== 'seed_prompt')) {
                    deps.logger.info(`[gatherArtifacts] Querying dialectic_contributions for intermediate artifact: type='${rType}', stage='${rStage}', document_key='${rKey}'`);
                    const { data, error } = await dbClient
                        .from('dialectic_contributions')
                        .select('*')
                        .eq('session_id', sessionId)
                        .eq('iteration_number', iterationNumber)
                        .eq('stage', rStage);
                    if (!error && Array.isArray(data) && data.length > 0) {
                        const filtered = (data).filter((row) => {
                            const fileName = isRecord(row) && typeof row['file_name'] === 'string' ? row['file_name'] : '';
                            const storageDir = isRecord(row) && typeof row['storage_path'] === 'string' ? row['storage_path'] : '';
                            const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                            const rowStage = (isRecord(row) && typeof row['stage'] === 'string') ? row['stage']
                                : (typeof parsed.stageSlug === 'string' ? parsed.stageSlug : undefined);
                            const parsedKey = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                            return rowStage === rStage && parsedKey === rKey;
                        });
                        const latest = pickLatest(filtered);
                        if (latest && isRecord(latest)) {
                            const u: unknown = latest;
                            const id = isRecord(u) && typeof u['id'] === 'string' ? u['id'] : undefined;
                            const fileName = isRecord(u) && typeof u['file_name'] === 'string' ? u['file_name'] : '';
                            const storageDir = isRecord(u) && typeof u['storage_path'] === 'string' ? u['storage_path'] : '';
                            const parsed = deconstructStoragePath({ storageDir, fileName, dbOriginalFileName: fileName });
                            const stageSlugEff = isRecord(u) && typeof u['stage'] === 'string' ? u['stage'] : (parsed.stageSlug || undefined);
                            const docKeyEff = typeof parsed.documentKey === 'string' ? parsed.documentKey : undefined;
                            const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';
                            if (id && stageSlugEff && docKeyEff) {
                                deps.logger.info(`[gatherArtifacts] Found intermediate artifact in dialectic_contributions: id='${id}', stage='${stageSlugEff}', document_key='${docKeyEff}', type='${rType}'`);
                                gathered.push({ id, content, document_key: docKeyEff, stage_slug: stageSlugEff, type: rType });
                            }
                        }
                    }
                }
            } catch (err) {
                // For document, seed_prompt, project_resource inputs, errors indicate missing required resources - re-throw to fail loud and hard
                if (rType === 'document' || rType === 'seed_prompt' || rType === 'project_resource') {
                    throw err;
                }
                // For other types (feedback, header_context, etc.), errors are non-fatal - continue processing other rules
            }
        }

        // Dedupe by id to handle multiple input rules returning the same document
        const unique = new Map<string, IdentityDoc>();
        for (const d of gathered) {
            const rec: unknown = d;
            const id = isRecord(rec) && typeof rec['id'] === 'string' ? rec['id'] : undefined;
            if (id && !unique.has(id)) unique.set(id, d);
        }
        return Array.from(unique.values());
    };

    // 8.h.ii: Scope selection strictly to inputsRequired
    const applyInputsRequiredScope = (docs: IdentityDoc[]): IdentityDoc[] => {
        const rulesUnknown = (params && Array.isArray(params.inputsRequired)) ? params.inputsRequired : undefined;
        if (!rulesUnknown || rulesUnknown.length === 0) return [];
        const filtered: IdentityDoc[] = [];
        for (const d of docs) {
            const rec: unknown = d;
            const dk = isRecord(rec) && typeof rec['document_key'] === 'string' ? rec['document_key'] : undefined;
            const ss = isRecord(rec) && typeof rec['stage_slug'] === 'string' ? rec['stage_slug'] : undefined;
            const tp = isRecord(rec) && typeof rec['type'] === 'string' ? rec['type'] : undefined;
            if (!dk || !ss || !tp) continue;
            let match = false;
            for (const ru of rulesUnknown) {
                const ruUnknown: unknown = ru;
                const rType = isRecord(ruUnknown) && typeof ruUnknown['type'] === 'string' ? ruUnknown['type'] : undefined;
                const rStage = isRecord(ruUnknown) && typeof ruUnknown['slug'] === 'string' ? ruUnknown['slug'] : undefined;
                const rKey = isRecord(ruUnknown) && typeof ruUnknown['document_key'] === 'string' ? ruUnknown['document_key'] : undefined;
                if (rType && rStage && rKey && rType === tp && rStage === ss && rKey === dk) {
                    match = true;
                    break;
                }
            }
            if (match) filtered.push(d);
        }
        return filtered;
    };

    const gatheredDocs = await gatherArtifacts();
    const scopedDocs = applyInputsRequiredScope(gatheredDocs);

    // Fail-fast: validate each required inputsRequired rule has a matching doc before expensive API call
    const rulesUnknown = (params && Array.isArray(params.inputsRequired)) ? params.inputsRequired : [];
    for (const ru of rulesUnknown) {
        const ruUnknown: unknown = ru;
        const rRequired = isRecord(ruUnknown) && ruUnknown['required'] === true;
        if (!rRequired) continue;
        const rType = isRecord(ruUnknown) && typeof ruUnknown['type'] === 'string' ? ruUnknown['type'] : undefined;
        const rSlug = isRecord(ruUnknown) && typeof ruUnknown['slug'] === 'string' ? ruUnknown['slug'] : undefined;
        const rKey = isRecord(ruUnknown) && typeof ruUnknown['document_key'] === 'string' ? ruUnknown['document_key'] : undefined;
        if (!rType || !rSlug || !rKey) continue;
        const found = scopedDocs.some((d) => {
            const rec: unknown = d;
            const dk = isRecord(rec) && typeof rec['document_key'] === 'string' ? rec['document_key'] : undefined;
            const ss = isRecord(rec) && typeof rec['stage_slug'] === 'string' ? rec['stage_slug'] : undefined;
            const tp = isRecord(rec) && typeof rec['type'] === 'string' ? rec['type'] : undefined;
            return rType === tp && rSlug === ss && rKey === dk;
        });
        if (!found) {
            throw new Error(`Required input document missing: document_key=${rKey}, stage=${rSlug}`);
        }
    }

    // Build identity-rich view required for compression and an id/content-only view for sizing/send
    type IdentitySourceDoc = { id: string; content: string; document_key: string; stage_slug: string; type: string };
    const identityRichDocs: IdentitySourceDoc[] = [];
    for (const d of scopedDocs) {
        const rec: unknown = d;
        const id = isRecord(rec) && typeof rec['id'] === 'string' ? rec['id'] : undefined;
        const content = isRecord(rec) && typeof rec['content'] === 'string' ? rec['content'] : undefined;
        const dk = isRecord(rec) && typeof rec['document_key'] === 'string' ? rec['document_key'] : undefined;
        const ss = isRecord(rec) && typeof rec['stage_slug'] === 'string' ? rec['stage_slug'] : undefined;
        const tp = isRecord(rec) && typeof rec['type'] === 'string' ? rec['type'] : undefined;
        if (typeof id === 'string' && id !== '' && typeof content === 'string' && typeof dk === 'string' && dk !== '' && typeof ss === 'string' && ss !== '' && typeof tp === 'string' && tp !== '') {
            identityRichDocs.push({ id, content, document_key: dk, stage_slug: ss, type: tp });
        }
    }
    const idContentDocs: ResourceDocuments = identityRichDocs.map(d => ({ id: d.id, content: d.content }));
    // 8.h.iv/8.h.ix: Always use executor-gathered + inputsRequired-scoped documents; no assembler fallback
    const initialResourceDocuments: ResourceDocuments = [...idContentDocs];

    const {
        countTokens,
        embeddingClient,
        ragService,
        tokenWalletService,
    } = deps;

    if (!deps.countTokens) {
        throw new Error("Dependency 'countTokens' is not provided.");
    }

    const tokenizerDeps: CountTokensDeps = {
        getEncoding: (_name: string) => ({ encode: (input: string) => Array.from(input ?? '').map((_, i) => i) }),
        countTokensAnthropic: (text: string) => (text ?? '').length,
        logger: deps.logger,
    };
    const isContinuationFlowInitial = Boolean(job.target_contribution_id || job.payload.target_contribution_id);
    // Rendering hygiene: sanitize placeholder braces in the primary user message we send to the model
    const sanitizeMessage = (text: string | undefined): string | undefined => {
        if (typeof text !== 'string') return text;
        return text.replace(/[{}]/g, '');
    };
    const sanitizedCurrentUserPrompt = sanitizeMessage(currentUserPrompt) ?? '';
    
    // The conversation history from the prompt assembler is the source of truth for the `messages` array.
    // It must not be mutated.
    const initialAssembledMessages: Messages[] = conversationHistory
        .filter(msg => msg.role !== 'function');

    // Track the single source of truth for what we size and what we send
    let currentAssembledMessages: Messages[] = initialAssembledMessages;
    let currentResourceDocuments: ResourceDocuments = [...initialResourceDocuments];

    // Build normalized messages for initial sizing
    const initialEffectiveMessages: { role: 'system'|'user'|'assistant'; content: string }[] = initialAssembledMessages
        .filter(isApiChatMessage)
        .filter((m): m is { role: 'system'|'user'|'assistant'; content: string } => m.content !== null);
    const normalizedInitialMessages = initialEffectiveMessages;

    const fullPayload: CountableChatPayload = {
        systemInstruction,
        message: sanitizedCurrentUserPrompt,
        messages: normalizedInitialMessages,
        resourceDocuments: currentResourceDocuments.map(d => ({ id: d.id, content: d.content })),
    };
    const initialTokenCount = deps.countTokens(tokenizerDeps, fullPayload, extendedModelConfig);
    const maxTokens = extendedModelConfig.context_window_tokens || extendedModelConfig.context_window_tokens;
    
    console.log(`[DEBUG] Initial Token Count: ${initialTokenCount}`);
    console.log(`[DEBUG] Max Tokens: ${maxTokens}`);
    console.log(`[DEBUG] Condition will be: ${!!maxTokens && initialTokenCount > maxTokens}`);

    // Wallet presence is already enforced above; implement universal preflight (non-oversized included)
    if (!tokenWalletService) {
        throw new Error('Token wallet service is required for affordability preflight');
    }

    // Fetch and parse wallet balance
    const walletBalanceStr = await tokenWalletService.getBalance(walletId);
    const walletBalance = parseFloat(walletBalanceStr);
    if (!Number.isFinite(walletBalance) || walletBalance < 0) {
        throw new Error(`Could not parse wallet balance for walletId: ${walletId}`);
    }

    // Validate model cost rates
    const inputRate = extendedModelConfig.input_token_cost_rate;
    const outputRate = extendedModelConfig.output_token_cost_rate;
    if (typeof inputRate !== 'number' || inputRate < 0 || typeof outputRate !== 'number' || outputRate <= 0) {
        throw new Error('Model configuration is missing valid token cost rates.');
    }

    const isOversized = Boolean(maxTokens && initialTokenCount > maxTokens);
    let ssotMaxOutputNonOversized: number | undefined = undefined;
    if (!isOversized) {
        // Compute planned output budget using balance and model configuration
        const plannedMaxOutputTokens = getMaxOutputTokens(
            walletBalance,
            initialTokenCount,
            extendedModelConfig,
            deps.logger,
        );
        if (plannedMaxOutputTokens < 0) {
            throw new Error('Insufficient funds to cover the input prompt cost.');
        }
        ssotMaxOutputNonOversized = plannedMaxOutputTokens;

        // Reserve headroom only if provider_max_input_tokens is defined
        const providerMaxInputTokens = (typeof extendedModelConfig.provider_max_input_tokens === 'number'
            && extendedModelConfig.provider_max_input_tokens > 0)
            ? extendedModelConfig.provider_max_input_tokens
            : undefined;

        const safetyBufferTokens = 32;
        const allowedInput = typeof providerMaxInputTokens === 'number'
            ? providerMaxInputTokens - (plannedMaxOutputTokens + safetyBufferTokens)
            : Infinity;

        if (allowedInput !== Infinity && allowedInput <= 0) {
            throw new ContextWindowError(
                `No input window remains after reserving output budget (${plannedMaxOutputTokens}) and safety buffer (${safetyBufferTokens}).`
            );
        }

        if (allowedInput !== Infinity && initialTokenCount > allowedInput) {
            // Safety-margin violation: input too large once output budget is reserved
            throw new ContextWindowError(
                `Initial input tokens (${initialTokenCount}) exceed allowed input (${allowedInput}) after reserving output budget.`
            );
        }

        // NSF guard: input + output estimated cost must not exceed balance
        const estimatedInputCost = initialTokenCount * inputRate;
        const estimatedOutputCost = plannedMaxOutputTokens * outputRate;
        const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;

        if (estimatedTotalCost > walletBalance) {
            throw new Error(
                `Insufficient funds: estimated total cost (${estimatedTotalCost}) exceeds wallet balance (${walletBalance}).`
            );
        }
    }

    // Build a single ChatApiRequest instance early and keep it in sync; use it to drive both sizing and send
    let chatApiRequest: ChatApiRequest = {
        message: sanitizedCurrentUserPrompt,
        messages: currentAssembledMessages
                .filter(isApiChatMessage)
                .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
        providerId: providerDetails.id,
        promptId: '__none__',
        systemInstruction: systemInstruction,
        walletId: walletId,
        resourceDocuments: currentResourceDocuments.map((d) => ({ id: d.id, content: d.content })),
        continue_until_complete: job.payload.continueUntilComplete,
        isDialectic: true,
    };

    // Apply SSOT cap for non-oversized path
    if (!isOversized && typeof ssotMaxOutputNonOversized === 'number' && ssotMaxOutputNonOversized >= 0) {
        chatApiRequest = {
            ...chatApiRequest,
            max_tokens_to_generate: ssotMaxOutputNonOversized,
        };
    }

    if (maxTokens && initialTokenCount > maxTokens) {
        if (!ragService || !embeddingClient || !tokenWalletService || !countTokens) {
            throw new Error('Required services for prompt compression (RAG, Embedding, Wallet, Token Counter) are not available.');
        }

        // --- 3. Implement Holistic Pre-Flight Sanity Check ---
        const tokensToBeRemoved = initialTokenCount - maxTokens;
        
        if (typeof modelConfig.input_token_cost_rate !== 'number') {
            throw new Error(`Model ${fullProviderData.id} is missing a valid 'input_token_cost_rate' in its configuration and cannot be used for operations that require cost estimation.`);
        }
        const inputCostRate = modelConfig.input_token_cost_rate;
        
        // Cost is per token
        const estimatedTotalRagCost = tokensToBeRemoved * inputCostRate;
        const estimatedFinalPromptCost = maxTokens * inputCostRate;
        const totalEstimatedInputCost = estimatedTotalRagCost + estimatedFinalPromptCost;

        // Include a deterministic estimate for embedding costs in preflight.
        // To trim tokensToBeRemoved from the prompt, we must process at least that
        // many tokens through RAG/indexing. Bill embeddings 1:1 at input rate.
        const estimatedEmbeddingTokens = Math.max(0, tokensToBeRemoved);
        const estimatedEmbeddingCost = estimatedEmbeddingTokens * inputCostRate;
        const totalEstimatedInputCostWithEmbeddings = totalEstimatedInputCost + estimatedEmbeddingCost;
        
        const currentUserBalance: number = walletBalance;
        
        // Stage 1: Absolute Affordability Check
        if (currentUserBalance < totalEstimatedInputCostWithEmbeddings) {
            throw new Error(`Insufficient funds for the entire operation (including embeddings). Estimated cost: ${totalEstimatedInputCostWithEmbeddings}, Balance: ${currentUserBalance}`);
        }

        // Stage 2: Rationality Check (80%)
        const rationalityThreshold = 0.80;
        if (totalEstimatedInputCostWithEmbeddings > currentUserBalance * rationalityThreshold) {
            throw new Error(`Estimated cost (${totalEstimatedInputCostWithEmbeddings}) exceeds ${rationalityThreshold * 100}% of the user's balance (${currentUserBalance}).`);
        }

        deps.logger.info(
            `Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokens}) for job ${jobId}. Attempting compression.`,
        );

        const workingHistory = [...conversationHistory];
        // For compression scoring, use identity-rich documents gathered/scoped from the database (mapped to full SourceDocument shape)
        const workingResourceDocsSourceFull: SourceDocument[] = identityRichDocs.map((d) => ({
            id: d.id,
            session_id: job.session_id,
            user_id: null,
            stage: d.stage_slug,
            iteration_number: job.iteration_number,
            model_id: null,
            model_name: null,
            prompt_template_id_used: null,
            seed_prompt_url: null,
            edit_version: 1,
            is_latest_edit: true,
            is_header: false,
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
            storage_bucket: '',
            storage_path: '',
            size_bytes: null,
            mime_type: '',
            source_prompt_resource_id: null,
            // Identity and content
            content: d.content,
            document_key: d.document_key,
            type: d.type,
            stage_slug: d.stage_slug,
            document_relationships: null,
        }));
        // For sizing and sending, maintain a simple list of id/content paired to the above
        const workingResourceDocs: ResourceDocuments = [...idContentDocs];
        // Validation before compression: all identity fields must be present and non-empty
        for (const doc of workingResourceDocsSourceFull) {
            const hasDocKey = typeof doc.document_key === 'string' && doc.document_key !== '';
            const hasType = typeof doc.type === 'string' && doc.type !== '';
            const hasStage = typeof doc.stage_slug === 'string' && doc.stage_slug !== '';
            if (!(hasDocKey && hasType && hasStage)) {
                throw new Error('Compression requires document identity: document_key, type, and stage_slug must be present.');
            }
        }
        let currentTokenCount = initialTokenCount;

        // --- Preflight: estimate if we can compress to a feasible target and still afford final call ---
        const safetyBufferTokensPre = 32;

        const providerMaxInputForPre = (typeof extendedModelConfig.provider_max_input_tokens === 'number' && extendedModelConfig.provider_max_input_tokens > 0)
            ? extendedModelConfig.provider_max_input_tokens
            : 0;

        const getAllowedInputFor = (balanceTokens: number, tokenCount: number): number => {
            const plannedOut = getMaxOutputTokens(
                balanceTokens,
                tokenCount,
                extendedModelConfig,
                deps.logger,
            );
            return providerMaxInputForPre > 0
                ? providerMaxInputForPre - (plannedOut + safetyBufferTokensPre)
                : Infinity;
        };

        const solveTargetForBalance = (balanceTokens: number): number => {
            let t = Math.min(
                typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : Infinity,
                initialTokenCount,
            );
            // Small fixed-point iteration to converge t <= allowedInputFor(t)
            for (let i = 0; i < 5; i++) {
                const allowed = getAllowedInputFor(balanceTokens, t);
                const next = Math.min(
                    typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : Infinity,
                    allowed,
                );
                if (!(next < t - 1)) break; // Stop when close enough or expanding
                t = Math.max(0, Math.floor(next));
            }
            return Math.max(0, Math.floor(t));
        };

        // First, solve ignoring compression spend to get a preliminary target
        const prelimTarget = solveTargetForBalance(walletBalance);
        const prelimTokensToRemove = Math.max(0, initialTokenCount - prelimTarget);
        const estimatedCompressionCost = prelimTokensToRemove * inputRate;
        const balanceAfterCompression = walletBalance - estimatedCompressionCost;
        if (!Number.isFinite(balanceAfterCompression) || balanceAfterCompression <= 0) {
            throw new Error(`Insufficient funds: compression requires ${estimatedCompressionCost} tokens, balance is ${walletBalance}.`);
        }

        // Re-solve with post-compression balance
        const finalTargetThreshold = solveTargetForBalance(balanceAfterCompression);
        if (!(finalTargetThreshold >= 0)) {
            throw new ContextWindowError(`Unable to determine a feasible input size target given current balance.`);
        }

        // Ensure the total plan (compression + final input + output) is affordable
        const plannedMaxOutPostPrecheck = getMaxOutputTokens(
            balanceAfterCompression,
            finalTargetThreshold,
            extendedModelConfig,
            deps.logger,
        );
        const estimatedFinalInputCost = finalTargetThreshold * inputRate;
        const estimatedFinalOutputCost = plannedMaxOutPostPrecheck * outputRate;
        const totalEstimatedCost = estimatedCompressionCost + estimatedFinalInputCost + estimatedFinalOutputCost;
        if (totalEstimatedCost > walletBalance) {
            throw new Error(
                `Insufficient funds: total estimated cost (compression + final I/O) ${totalEstimatedCost} exceeds balance ${walletBalance}.`
            );
        }
        const rationalityThresholdTotal = 0.80; // 80%
        if (totalEstimatedCost > walletBalance * rationalityThresholdTotal) {
            throw new Error(`Estimated cost (${totalEstimatedCost}) exceeds ${rationalityThresholdTotal*100}% of the user's balance (${walletBalance}).`);
        }
        
        // Track live balance during compression so SSOT reflects actual debits
        let currentBalanceTokens = walletBalance;

        // Compute dynamic allowed input headroom given a candidate input size
        const computeAllowedInput = (tokenCount: number): number => {
            const plannedMaxOutput = getMaxOutputTokens(
                currentBalanceTokens,
                tokenCount,
                extendedModelConfig,
                deps.logger,
            );
            const providerMaxInput = (typeof extendedModelConfig.provider_max_input_tokens === 'number' && extendedModelConfig.provider_max_input_tokens > 0)
                ? extendedModelConfig.provider_max_input_tokens
                : 0;
            const safetyBuffer = 32;
            return providerMaxInput > 0
                ? providerMaxInput - (plannedMaxOutput + safetyBuffer)
                : Infinity;
        };
        
        const candidates = await compressionStrategy(dbClient, deps, workingResourceDocsSourceFull, workingHistory, currentUserPrompt, params.inputsRelevance);
        console.log(`[DEBUG] Number of compression candidates found: ${candidates.length}`);

        // Prefetch which candidates are already indexed so we don't re-index them during compression
        const idsToCheck = candidates
            .map((c) => c.id)
            .filter((id) => typeof id === 'string' && id.length > 0);

        let indexedIds = new Set<string>();
        if (idsToCheck.length > 0) {
            const { data: indexedRows, error: indexedErr } = await dbClient
                .from('dialectic_memory')
                .select('source_contribution_id')
                .in('source_contribution_id', idsToCheck);

            if (!indexedErr && Array.isArray(indexedRows)) {
                indexedIds = new Set(
                    indexedRows
                        .map((r) => (r && typeof (r)['source_contribution_id'] === 'string' ? (r)['source_contribution_id'] : undefined))
                        .filter((v): v is string => typeof v === 'string'),
                );
            }
        }
        
        while (candidates.length > 0) {
            // Compress until we reach the preflight-computed final target threshold
            if (!(currentTokenCount > finalTargetThreshold)) {
                break;
            }
            const victim = candidates.shift(); // Takes the lowest-value item and removes it from the array
            if (!victim) break; // Should not happen with the loop condition, but good for safety

            // Skip re-indexing for already-indexed candidates to avoid double billing and re-summarization
            if (typeof victim.id === 'string' && indexedIds.has(victim.id)) {
                continue;
            }

            if (!params.inputsRelevance) {
                throw new Error('inputsRelevance is required');
            }
            const ragResult = await ragService.getContextForModel(
                [{ id: victim.id, content: victim.content || '' }], 
                extendedModelConfig, 
                sessionId, 
                stageSlug,
                params.inputsRelevance
            );
            
            if (ragResult.error) throw ragResult.error;

            const tokensUsed = ragResult.tokensUsedForIndexing || 0;
            // Persistent diagnostics for per-turn debit visibility
            deps.logger.info('[executeModelCallAndSave] RAG tokensUsedForIndexing observed in-loop', {
                jobId,
                candidateId: victim.id,
                tokensUsed,
                hasWallet: Boolean(walletId),
            });
            // Adjust live balance so SSOT uses the actual remaining budget
            if (tokensUsed > 0) {
                const observedCompressionCost = tokensUsed * inputRate;
                currentBalanceTokens = Math.max(0, currentBalanceTokens - observedCompressionCost);
            }
            if (tokensUsed > 0 && walletId) {
                deps.logger.info('[executeModelCallAndSave] Debiting wallet for RAG compression', {
                    jobId,
                    candidateId: victim.id,
                    amount: tokensUsed,
                });
                try {
                    await tokenWalletService.recordTransaction({
                        walletId: walletId,
                        type: 'DEBIT_USAGE',
                        amount: tokensUsed.toString(),
                        recordedByUserId: projectOwnerUserId,
                        idempotencyKey: `rag:${jobId}:${victim.id}`,
                        relatedEntityId: victim.id,
                        relatedEntityType: 'rag_compression',
                        notes: `RAG compression for job ${jobId}`,
                    });
                } catch (error) {
                    throw new Error(`Insufficient funds for RAG operation. Cost: ${tokensUsed} tokens.`, { cause: error });
                }
            }
            
            const newContent = ragResult.context || '';
            if (victim.sourceType === 'history') {
                const historyIndex = workingHistory.findIndex(h => h.id === victim.id);
                if (historyIndex > -1) workingHistory[historyIndex].content = newContent;
            } else {
                const docIndex = workingResourceDocs.findIndex(d => d.id === victim.id);
                if (docIndex > -1) workingResourceDocs[docIndex].content = newContent;
                const srcIdx = workingResourceDocsSourceFull.findIndex(d => d.id === victim.id);
                if (srcIdx > -1) workingResourceDocsSourceFull[srcIdx].content = newContent;
            }
            
            // Enforce strict user/assistant alternation after each compression
            const enforcedHistory: Messages[] = [];
            if (workingHistory.length > 0) {
                enforcedHistory.push(workingHistory[0]);
                for (let i = 1; i < workingHistory.length; i++) {
                    const prevMsg = enforcedHistory[enforcedHistory.length - 1];
                    const currentMsg = workingHistory[i];
                    if (prevMsg.role === currentMsg.role) {
                        if (currentMsg.role === 'assistant') {
                            enforcedHistory.push({ role: 'user', content: 'Please continue.' });
                        } else {
                            enforcedHistory.push({ role: 'assistant', content: '' });
                        }
                    }
                    enforcedHistory.push(currentMsg);
                }
            }
            
            const loopAssembledMessages: Messages[] = [];
            if (!isContinuationFlowInitial) {
                loopAssembledMessages.push({ role: 'user', content: currentUserPrompt });
            }
            enforcedHistory.forEach(msg => {
                if (msg.role !== 'function') {
                    loopAssembledMessages.push({ role: msg.role, content: msg.content });
                }
            });
            // Rebuild the entire payload after each compression step
            // Keep the sized payload components as the ones we will send when it fits
            currentAssembledMessages = loopAssembledMessages;
            currentResourceDocuments = [...workingResourceDocs];

            // Keep ChatApiRequest in sync and size based on the same object
            chatApiRequest = {
                ...chatApiRequest,
                message: sanitizedCurrentUserPrompt,
                messages: currentAssembledMessages
                        .filter(isApiChatMessage)
                        .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
                resourceDocuments: currentResourceDocuments.map((d) => ({ id: d.id, content: d.content })),
            };
            const loopPayload: CountableChatPayload = {
                systemInstruction: chatApiRequest.systemInstruction,
                message: chatApiRequest.message,
                messages: chatApiRequest.messages,
                resourceDocuments: chatApiRequest.resourceDocuments,
            };
            currentTokenCount = deps.countTokens(tokenizerDeps, loopPayload, extendedModelConfig);
        }

        // If still above either constraint, fail clearly
        const allowedInputCheck = computeAllowedInput(currentTokenCount);
        if (currentTokenCount > Math.min(
            typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : Infinity,
            allowedInputCheck,
        )) {
            throw new ContextWindowError(
                `Compressed prompt token count (${currentTokenCount}) still exceeds model limit (${maxTokens}) and allowed input (${allowedInputCheck}).`,
            );
        }
        
        deps.logger.info(
            `[executeModelCallAndSave] Prompt successfully compressed. New token count: ${currentTokenCount}`,
        );

        // When compression succeeds, currentAssembledMessages/currentResourceDocuments already
        // reflect the last sized state and will be used to build the final ChatApiRequest below.

        //Final headroom and affordability checks on the exact payload we will send
        // Ensure chatApiRequest reflects final compressed state and size using the same object
        chatApiRequest = {
            ...chatApiRequest,
            message: sanitizedCurrentUserPrompt,
            messages: currentAssembledMessages
                    .filter(isApiChatMessage)
                    .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
            resourceDocuments: currentResourceDocuments.map((d) => ({ id: d.id, content: d.content })),
        };
        const finalPayloadAfterCompression: CountableChatPayload = {
            systemInstruction: chatApiRequest.systemInstruction,
            message: chatApiRequest.message,
            messages: chatApiRequest.messages,
            resourceDocuments: chatApiRequest.resourceDocuments,
        };
        const finalTokenCountAfterCompression = deps.countTokens(tokenizerDeps, finalPayloadAfterCompression, extendedModelConfig);

        const plannedMaxOutputTokensPost = getMaxOutputTokens(
            currentBalanceTokens,
            finalTokenCountAfterCompression,
            extendedModelConfig,
            deps.logger,
        );

        const providerMaxInputTokensPost =
            (typeof extendedModelConfig.provider_max_input_tokens === 'number' && extendedModelConfig.provider_max_input_tokens > 0)
                ? extendedModelConfig.provider_max_input_tokens
                : 0;

        const safetyBufferTokensPost = 32;
        const allowedInputPost = providerMaxInputTokensPost > 0
            ? providerMaxInputTokensPost - (plannedMaxOutputTokensPost + safetyBufferTokensPost)
            : Infinity;

        if (allowedInputPost !== Infinity && allowedInputPost <= 0) {
            throw new ContextWindowError(
                `No input window remains after reserving output budget (${plannedMaxOutputTokensPost}) and safety buffer (${safetyBufferTokensPost}).`
            );
        }

        if (allowedInputPost !== Infinity && finalTokenCountAfterCompression > allowedInputPost) {
            throw new ContextWindowError(
                `Final input tokens (${finalTokenCountAfterCompression}) exceed allowed input (${allowedInputPost}) after reserving output budget.`
            );
        }

        const estimatedInputCostPost = finalTokenCountAfterCompression * inputRate;
        const estimatedOutputCostPost = plannedMaxOutputTokensPost * outputRate;
        const estimatedTotalCostPost = estimatedInputCostPost + estimatedOutputCostPost;
        if (estimatedTotalCostPost > walletBalance) {
            throw new Error(
                `Insufficient funds: estimated total cost (${estimatedTotalCostPost}) exceeds wallet balance (${walletBalance}) after compression.`
            );
        }

        // Apply SSOT cap for post-compression send
        chatApiRequest = {
            ...chatApiRequest,
            max_tokens_to_generate: plannedMaxOutputTokensPost,
        };
    }

    // chatApiRequest already constructed and kept in sync above; use it directly for the adapter call
    // Diagnostics without casting: observe payload user_jwt presence before guard
    {
        const p = job && job.payload;
        let hasJwtKey = false;
        let jwtType: string = 'undefined';
        let jwtLen = 0;
        if (isRecord(p) && 'user_jwt' in p) {
            const v = p['user_jwt'];
            jwtType = typeof v;
            if (typeof v === 'string') {
                jwtLen = v.length;
            }
            hasJwtKey = true;
        }
        deps.logger.info('[executeModelCallAndSave] DIAGNOSTIC: payload user_jwt presence before guard', {
            jobId,
            hasJwtKey,
            jwtType,
            jwtLen,
            continueUntilComplete: job.payload.continueUntilComplete,
            target_contribution_id: job.payload.target_contribution_id,
        });
    }
    // user_jwt already validated above; use the early validation result
    const userAuthTokenStrict: string = userAuthTokenEarly;

    if (!deps.callUnifiedAIModel) {
        throw new Error("Dependency 'callUnifiedAIModel' is not provided.");
    }

    const startTime = Date.now();
    const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
        chatApiRequest,
        userAuthTokenStrict, 
        { fetch: globalThis.fetch }
    );

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] AI call completed for job ${job.id} in ${processingTimeMs}ms.`);

    deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Full AI Response for job ${job.id}:`, { aiResponse });

    if (aiResponse.error || !aiResponse.content) {
        // This handles cases where the AI provider itself returned an error.
        // This is a candidate for a retry.
        await deps.retryJob(
            { logger: deps.logger, notificationService: deps.notificationService },
            dbClient,
            job,
            job.attempt_count + 1,
            [{
                modelId: providerDetails.id,
                api_identifier: providerDetails.api_identifier,
                error: aiResponse.error || 'AI response was empty.',
                processingTimeMs: processingTimeMs,
            }],
            projectOwnerUserId
        );
        return;
    }

    // Unconditionally validate the response is parsable JSON before any other logic.
    // First sanitize the content to handle common wrapper patterns (quotes, backticks, whitespace).
    const sanitizationResult: JsonSanitizationResult = sanitizeJsonContent(aiResponse.content);
    
    if (!isJsonSanitizationResult(sanitizationResult)) {
        // Type guard failure - log and retry
        deps.logger.warn(`[executeModelCallAndSave] Invalid sanitization result for job ${job.id}. Triggering retry.`);
        await deps.retryJob(
            { logger: deps.logger, notificationService: deps.notificationService },
            dbClient,
            job,
            job.attempt_count + 1,
            [{
                modelId: providerDetails.id,
                api_identifier: providerDetails.api_identifier,
                error: 'Invalid JSON sanitization result',
                processingTimeMs: processingTimeMs,
            }],
            projectOwnerUserId
        );
        return;
    }
    
    // Log sanitization event if sanitization was performed
    if (sanitizationResult.wasSanitized) {
        deps.logger.info(`[executeModelCallAndSave] JSON content sanitized for job ${job.id}`, { 
            originalLength: sanitizationResult.originalLength, 
            sanitizedLength: sanitizationResult.sanitized.length,
            wasStructurallyFixed: sanitizationResult.wasStructurallyFixed
        });
    }
    
    // Attempt to parse the sanitized content
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(sanitizationResult.sanitized);
    } catch (e) {
        // This handles a malformed JSON response that cannot be fixed by sanitization, which is a retryable failure.
        deps.logger.warn(`[executeModelCallAndSave] Malformed JSON response for job ${job.id} after sanitization. Triggering retry.`, { error: e instanceof Error ? e.message : String(e) });
        
        await deps.retryJob(
            { logger: deps.logger, notificationService: deps.notificationService },
            dbClient,
            job,
            job.attempt_count + 1,
            [{
                modelId: providerDetails.id,
                api_identifier: providerDetails.api_identifier,
                error: `Malformed JSON response: ${e instanceof Error ? e.message : String(e)}`,
                processingTimeMs: processingTimeMs,
            }],
            projectOwnerUserId
        );
        
        // Halt processing immediately.
        return;
    }

    // Determine finish reason from either top-level or raw provider response
    let resolvedFinish: FinishReason = null;
    if (isFinishReason(aiResponse.finish_reason)) {
        resolvedFinish = aiResponse.finish_reason;
    } else if (isRecord(aiResponse.rawProviderResponse) && isFinishReason(aiResponse.rawProviderResponse['finish_reason'])) {
        resolvedFinish = aiResponse.rawProviderResponse['finish_reason'];
    }

    if (resolvedFinish === 'error') {
        await deps.retryJob(
            { logger: deps.logger, notificationService: deps.notificationService },
            dbClient,
            job,
            job.attempt_count + 1,
            [{
                modelId: providerDetails.id,
                api_identifier: providerDetails.api_identifier,
                error: 'AI provider signaled error via finish_reason.',
                processingTimeMs: processingTimeMs,
            }],
            projectOwnerUserId
        );
        return;
    }

    let shouldContinue = isDialecticContinueReason(resolvedFinish);

    // Check the content for a continuation flag if the finish_reason doesn't already indicate it.
    if (!shouldContinue && isRecord(parsedContent)) {
        if (
            parsedContent.continuation_needed === true ||
            parsedContent.stop_reason === 'continuation' ||
            parsedContent.stop_reason === 'token_limit'
        ) {
            shouldContinue = true;
        }
    }

    const contentForStorage: string = sanitizationResult.sanitized;
    
    // This is the correct implementation. The semantic relationships are inherited
    // directly from the job payload. The structural link for continuations is
    // handled by the `target_contribution_id` field on the contribution record,
    // not by adding a non-standard property to this JSON blob.
    const document_relationships = job.payload.document_relationships ?? null;

    const fileType: ModelContributionFileTypes = output_type; 

    const description = `${output_type} for stage '${stageSlug}' by model ${providerDetails.name}`;

    const {
        contributionType: rawContributionType,
        ...restOfCanonicalPathParams
    } = job.payload.canonicalPathParams;

    const contributionType = isContributionType(rawContributionType)
        ? rawContributionType
        : undefined;

    const targetContributionId =
        (typeof job.payload.target_contribution_id === 'string' && job.payload.target_contribution_id.length > 0)
            ? job.payload.target_contribution_id
            : (typeof job.target_contribution_id === 'string' && job.target_contribution_id.length > 0)
                ? job.target_contribution_id
                : undefined;

    const isContinuationForStorage = typeof targetContributionId === 'string' && targetContributionId.trim() !== '';

    // Validate continuation relationships before persisting (hard-fail if invalid/missing)
    if (isContinuationForStorage) {
        const relsUnknown = job.payload.document_relationships;
        if (!isDocumentRelationships(relsUnknown)) {
            throw new Error('Continuation save requires valid document_relationships');
        }
        
        // Validate continuation_count is required and > 0 for continuation chunks
        const continuationCount = job.payload.continuation_count;
        if (continuationCount === undefined || continuationCount === null) {
            throw new Error('continuation_count is required and must be a number > 0 for continuation chunks');
        }
        if (typeof continuationCount !== 'number') {
            throw new Error('continuation_count is required and must be a number > 0 for continuation chunks');
        }
        if (continuationCount <= 0) {
            throw new Error('continuation_count is required and must be a number > 0 for continuation chunks');
        }
    }

    if (!aiResponse.rawProviderResponse || !isJson(aiResponse.rawProviderResponse)) {
        throw new Error('Raw provider response is required');
    }

    // Validate ALL required values for document file types BEFORE constructing pathContext
    if (isDocumentRelated(fileType)) {
        const missingValues: string[] = [];
        
        if (!job.payload.projectId || typeof job.payload.projectId !== 'string' || job.payload.projectId.trim() === '') {
            missingValues.push('job.payload.projectId (string, non-empty)');
        }
        if (!job.payload.sessionId || typeof job.payload.sessionId !== 'string' || job.payload.sessionId.trim() === '') {
            missingValues.push('job.payload.sessionId (string, non-empty)');
        }
        if (job.payload.iterationNumber === undefined || typeof job.payload.iterationNumber !== 'number') {
            missingValues.push('job.payload.iterationNumber (number)');
        }
        if (!job.payload.canonicalPathParams || !isRecord(job.payload.canonicalPathParams)) {
            missingValues.push('job.payload.canonicalPathParams (object)');
        } else if (!job.payload.canonicalPathParams.stageSlug || typeof job.payload.canonicalPathParams.stageSlug !== 'string' || job.payload.canonicalPathParams.stageSlug.trim() === '') {
            missingValues.push('job.payload.canonicalPathParams.stageSlug (string, non-empty)');
        }
        if (job.attempt_count === undefined || typeof job.attempt_count !== 'number') {
            missingValues.push('job.attempt_count (number)');
        }
        if (!providerDetails.api_identifier || typeof providerDetails.api_identifier !== 'string' || providerDetails.api_identifier.trim() === '') {
            missingValues.push('providerDetails.api_identifier (string, non-empty)');
        }
        if (!job.payload.document_key || typeof job.payload.document_key !== 'string' || job.payload.document_key.trim() === '') {
            missingValues.push('job.payload.document_key (string, non-empty)');
        }
        
        if (missingValues.length > 0) {
            throw new Error(
                `executeModelCallAndSave requires all of the following values for document file type '${output_type}': job.payload.projectId (string, non-empty), job.payload.sessionId (string, non-empty), job.payload.iterationNumber (number), job.payload.canonicalPathParams.stageSlug (string, non-empty), job.attempt_count (number), providerDetails.api_identifier (string, non-empty), job.payload.document_key (string, non-empty). Missing or invalid: ${missingValues.join(', ')}`
            );
        }
    }

    // For document outputs, use FileType.ModelContributionRawJson to save to raw_responses/ folder
    // For non-document outputs (e.g., header_context), use the original fileType
    const storageFileType = isDocumentKey(fileType) 
        ? FileType.ModelContributionRawJson 
        : fileType;

    // Extract source_group fragment for filename disambiguation
    // Fragment is extracted from document_relationships.source_group UUID (first 8 chars after hyphen removal)
    // source_group is required for document outputs to enable filename disambiguation
    // Exception: consolidation jobs (per_model granularity) use source_group = null to signal new lineage root
    const sourceGroup = job.payload.document_relationships?.source_group ?? undefined;
    const sourceGroupIsNull = job.payload.document_relationships?.source_group === null;
    
    if (isDocumentRelated(fileType) && !sourceGroup) {
        // Check if this is a consolidation job (per_model granularity) that allows source_group = null
        if (sourceGroupIsNull && job.payload.planner_metadata?.recipe_step_id) {
            const recipeStepId = job.payload.planner_metadata.recipe_step_id;
            
            // Look up the recipe step to check granularity_strategy
            // Try dialectic_stage_recipe_steps first (cloned instances)
            let recipeStep: unknown = null;
            const { data: clonedStep, error: clonedError } = await dbClient
                .from('dialectic_stage_recipe_steps')
                .select('granularity_strategy')
                .eq('id', recipeStepId)
                .maybeSingle();
            
            if (!clonedError && clonedStep && isRecord(clonedStep)) {
                recipeStep = clonedStep;
            } else {
                // Try dialectic_recipe_template_steps (template instances)
                const { data: templateStep, error: templateError } = await dbClient
                    .from('dialectic_recipe_template_steps')
                    .select('granularity_strategy')
                    .eq('id', recipeStepId)
                    .maybeSingle();
                
                if (!templateError && templateStep && isRecord(templateStep)) {
                    recipeStep = templateStep;
                }
            }
            
            // If recipe step found and granularity_strategy is 'per_model', allow null source_group
            if (recipeStep && isRecord(recipeStep) && typeof recipeStep.granularity_strategy === 'string' && recipeStep.granularity_strategy === 'per_model') {
                // Consolidation job: source_group = null is allowed, will be set to self.id after save
            } else {
                throw new Error('source_group is required for document outputs');
            }
        } else {
            throw new Error('source_group is required for document outputs');
        }
    }
    const sourceGroupFragment = extractSourceGroupFragment(sourceGroup);

    // Verify sourceAnchorModelSlug propagates correctly for antithesis patterns
    // restOfCanonicalPathParams (spread from job.payload.canonicalPathParams) already includes sourceAnchorModelSlug
    // when present, enabling antithesis pattern detection in constructStoragePath
    if (restOfCanonicalPathParams.sourceAnchorModelSlug) {
        deps.logger.info('[executeModelCallAndSave] sourceAnchorModelSlug present in canonicalPathParams, will propagate to pathContext for antithesis pattern detection', {
            sourceAnchorModelSlug: restOfCanonicalPathParams.sourceAnchorModelSlug,
            stageSlug: restOfCanonicalPathParams.stageSlug,
            outputType: output_type,
        });
    }

    const documentKey = job.payload.document_key;
    if (!documentKey) {
        throw new Error('document_key is required');
    }
    const uploadContext: ModelContributionUploadContext = {
        pathContext: {
            projectId: job.payload.projectId,
            fileType: storageFileType,
            sessionId,
            iteration: iterationNumber,
            modelSlug: providerDetails.api_identifier,
            attemptCount: job.attempt_count,
            ...restOfCanonicalPathParams,
            documentKey: documentKey,
            contributionType,
            isContinuation: isContinuationForStorage,
            turnIndex: isContinuationForStorage ? job.payload.continuation_count : undefined,
            ...(sourceGroupFragment ? { sourceGroupFragment } : {}),
        },
        fileContent: contentForStorage, 
        mimeType: "application/json",
        sizeBytes: contentForStorage.length, 
        userId: projectOwnerUserId,
        description,
        contributionMetadata: {
            sessionId, 
            modelIdUsed: providerDetails.id, 
            modelNameDisplay: providerDetails.name,
            stageSlug, 
            iterationNumber, 
            contributionType: contributionType,
            tokensUsedInput: aiResponse.inputTokens, 
            tokensUsedOutput: aiResponse.outputTokens,
            processingTimeMs: aiResponse.processingTimeMs,
            source_prompt_resource_id: promptConstructionPayload.source_prompt_resource_id,
            target_contribution_id: targetContributionId,
            document_relationships,
            isIntermediate: 'isIntermediate' in job.payload && job.payload.isIntermediate,
        },
    };

    deps.logger.info('[executeModelCallAndSave] Saving validated JSON to raw file', { 
        jobId, 
        documentKey: documentKey, 
        fileType: storageFileType 
    });

    const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    if (savedResult.error || !isDialecticContribution(savedResult.record)) {
        throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
    }

    const contribution = savedResult.record;

    // Persist full document_relationships for continuation saves IMMEDIATELY after save (before RENDER job creation)
    const payloadRelationships = job.payload.document_relationships;
    if (isContinuationForStorage && isDocumentRelationships(payloadRelationships)) {
        const { error: relUpdateError } = await dbClient
            .from('dialectic_contributions')
            .update({ document_relationships: payloadRelationships })
            .eq('id', contribution.id);

        if (relUpdateError) {
            throw new RenderJobValidationError(
                `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`
            );
        }

        // Validate stageSlug value exists and is valid - isDocumentRelationships already validated it's a record
        // Use Object.entries().find() to validate the specific key value type-safely
        const stageSlugEntry = Object.entries(payloadRelationships).find(([key]) => key === stageSlug);
        if (!stageSlugEntry || typeof stageSlugEntry[1] !== 'string' || stageSlugEntry[1].trim() === '') {
            throw new Error(`document_relationships[${stageSlug}] is required and must be a non-empty string after persistence for continuation chunks`);
        }

        contribution.document_relationships = payloadRelationships;
    }

    // Initialize root-only relationships IMMEDIATELY after save (before RENDER job creation)
    if (!isContinuationForStorage) {
        const existing = contribution.document_relationships;
        const existingStageValue = isRecord(existing) ? existing[stageSlug] : undefined;

        const needsInit =
            !isRecord(existing) ||
            typeof existingStageValue !== 'string' ||
            existingStageValue.trim() === '' ||
            existingStageValue !== contribution.id;

        if (needsInit) {
            // Type-safe construction: build DocumentRelationships using validated keys
            const merged: DocumentRelationships = {};
            
            // Copy existing valid RelationshipRole keys (ContributionType or 'source_group')
            if (isRecord(existing) && isDocumentRelationships(existing)) {
                for (const [key, value] of Object.entries(existing)) {
                    if (typeof value === 'string') {
                        // Validate key is a valid RelationshipRole: either ContributionType or 'source_group'
                        if (isContributionType(key) || key === 'source_group') {
                            // Type-safe: key is validated as RelationshipRole
                            if (isContributionType(key)) {
                                merged[key] = value;
                            } else if (key === 'source_group') {
                                merged.source_group = value;
                            }
                        }
                    }
                }
            }
            
            // For consolidation jobs (per_model granularity), if source_group was null in payload, set it to self.id
            const payloadSourceGroup = job.payload.document_relationships?.source_group;
            if (payloadSourceGroup === null) {
                // Consolidation job: set source_group to contribution's own ID (new lineage root)
                merged.source_group = contribution.id;
            }
            
            // Validate stageSlug is a valid ContributionType, then set it
            if (!isContributionType(stageSlug)) {
                throw new RenderJobValidationError(
                    `Invalid stageSlug for document_relationships: ${stageSlug} is not a valid ContributionType. Contribution ID: ${contribution.id}`
                );
            }
            merged[stageSlug] = contribution.id;

            const { error: updateError } = await dbClient
                .from('dialectic_contributions')
                .update({ document_relationships: merged })
                .eq('id', contribution.id);

            if (updateError) {
                throw new RenderJobValidationError(
                    `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`
                );
            }

            // Validate initialization succeeded using type-safe access pattern
            const stageSlugEntry = Object.entries(merged).find(([key]) => key === stageSlug);
            if (
                !stageSlugEntry ||
                typeof stageSlugEntry[1] !== 'string' ||
                stageSlugEntry[1].trim() === '' ||
                stageSlugEntry[1] !== contribution.id
            ) {
                throw new RenderJobValidationError(
                    `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`
                );
            }

            contribution.document_relationships = merged;
        }
    }

    // Validate document_relationships presence for document outputs before render decision
    // Use type-safe access pattern: Object.entries().find() instead of direct indexing
    const stageRelationshipForStage = isRecord(contribution.document_relationships) && isDocumentRelationships(contribution.document_relationships)
        ? Object.entries(contribution.document_relationships).find(([key]) => key === stageSlug)?.[1]
        : undefined;

    if (
        isDocumentRelated(fileType) &&
        (
            typeof stageRelationshipForStage !== 'string' ||
            stageRelationshipForStage.trim() === ''
        )
    ) {
        throw new RenderJobValidationError(
            `document_relationships[${stageSlug}] is required and must be persisted before RENDER job creation. Contribution ID: ${contribution.id}`
        );
    }

    // Conditionally enqueue RENDER job for markdown document outputs on every chunk completion
    const { shouldRender, reason, details } = await deps.shouldEnqueueRenderJob(
        { dbClient, logger: deps.logger },
        { outputType: output_type, stageSlug }
    );

    // Handle error reasons: fail the EXECUTE job for transient/config errors
    if (!shouldRender && ['stage_not_found', 'instance_not_found', 'steps_not_found', 'parse_error', 'query_error', 'no_active_recipe'].includes(reason)) {
        deps.logger.error('[executeModelCallAndSave] Failed to determine if RENDER job required due to query/config error', { reason, details, outputType: output_type, stageSlug });
        throw new Error(`Cannot determine render requirement: ${reason}${details ? ` - ${details}` : ''}`);
    }

    // Log successful skip for JSON outputs (normal flow, not an error)
    if (!shouldRender && reason === 'is_json') {
        deps.logger.info('[executeModelCallAndSave] Skipping RENDER job for JSON output', { outputType: output_type });
    }

    // Proceed with RENDER job creation only for markdown documents
    if (shouldRender && reason === 'is_markdown') {
        deps.logger.info('[executeModelCallAndSave] Preparing to enqueue RENDER job', {
            jobId,
            output_type,
            fileType,
            storageFileType,
            documentKey,
        });
        // Extract documentIdentity from document_relationships[stageSlug] specifically (must be persisted by now)
        const documentIdentityValue = stageRelationshipForStage;
        if (typeof documentIdentityValue !== 'string' || documentIdentityValue.trim() === '') {
            throw new RenderJobValidationError(`document_relationships[${stageSlug}] is required and must be a non-empty string before RENDER job creation. Contribution ID: ${contribution.id}`);
        }
        const documentIdentity: string = documentIdentityValue;

        // Validate required fields before creating RENDER job payload
        if (!documentKey || typeof documentKey !== 'string' || documentKey.trim() === '') {
            deps.logger.error('[executeModelCallAndSave] Cannot enqueue RENDER job: documentKey is missing or invalid', {
                jobId,
                fileType,
                documentKey
            });
            throw new RenderJobValidationError('documentKey is required for RENDER job but is missing or invalid');
        }
        const documentKeyStrict: string = documentKey;
        if (!isFileType(documentKeyStrict)) {
            throw new RenderJobValidationError('documentKey is not a valid FileType');
        }
        const documentKeyAsFileType: FileType = documentKeyStrict;

        if (!documentIdentity || typeof documentIdentity !== 'string' || documentIdentity.trim() === '') {
            deps.logger.error('[executeModelCallAndSave] Cannot enqueue RENDER job: documentIdentity is missing or invalid', {
                jobId,
                documentIdentity
            });
            throw new RenderJobValidationError('documentIdentity is required for RENDER job but is missing or invalid');
        }
        const documentIdentityStrict: string = documentIdentity;

        if (!contribution.id || typeof contribution.id !== 'string' || contribution.id.trim() === '') {
            throw new RenderJobValidationError('contribution.id is required for RENDER job but is missing or invalid');
        }
        const sourceContributionIdStrict: string = contribution.id;

        // Query recipe step to extract template_filename from outputs_required.files_to_generate[]
        // CRITICAL: Use the same stage/iteration context as the EXECUTE job to ensure correct recipe instance is retrieved
        let templateFilename: string | undefined = undefined;

        try {
            // 1. Query dialectic_stages to get active_recipe_instance_id for the stageSlug
            const { data: stageData, error: stageError } = await dbClient
                .from('dialectic_stages')
                .select('active_recipe_instance_id')
                .eq('slug', stageSlug)
                .single();

            if (stageError || !stageData) {
                throw new RenderJobValidationError(`Failed to query stage for template_filename extraction: ${stageError?.message || 'Stage not found'}`);
            }
            if (!stageData.active_recipe_instance_id) {
                throw new RenderJobValidationError(`Stage '${stageSlug}' has no active recipe instance`);
            }

            // 2. Query dialectic_stage_recipe_instances to check if is_cloned
            const { data: instance, error: instanceError } = await dbClient
                .from('dialectic_stage_recipe_instances')
                .select('*')
                .eq('id', stageData.active_recipe_instance_id)
                .single();

            if (instanceError || !instance) {
                throw new RenderJobValidationError(`Failed to query recipe instance for template_filename extraction: ${instanceError?.message || 'Instance not found'}`);
            }

            // 3. Query recipe steps based on whether instance is cloned
            let steps: unknown[] = [];

            if (instance.is_cloned === true) {
                // If cloned, query dialectic_stage_recipe_steps where instance_id = active_recipe_instance_id
                const { data: stepRows, error: stepErr } = await dbClient
                    .from('dialectic_stage_recipe_steps')
                    .select('*')
                    .eq('instance_id', instance.id);

                if (stepErr || !stepRows || stepRows.length === 0) {
                    throw new RenderJobValidationError(`Failed to query cloned recipe steps for template_filename extraction: ${stepErr?.message || 'Steps not found'}`);
                }

                steps = stepRows;
            } else {
                // If not cloned, query dialectic_recipe_template_steps where template_id = instance.template_id
                const { data: stepRows, error: stepErr } = await dbClient
                    .from('dialectic_recipe_template_steps')
                    .select('*')
                    .eq('template_id', instance.template_id);

                if (stepErr || !stepRows || stepRows.length === 0) {
                    throw new RenderJobValidationError(`Failed to query template recipe steps for template_filename extraction: ${stepErr?.message || 'Steps not found'}`);
                }

                steps = stepRows;
            }

            // 4. Find the step where output_type matches the job's output_type
            const matchingStep = steps.find((step) => {
                if (!isRecord(step)) return false;
                return step.output_type === output_type;
            });

            if (!matchingStep || !isRecord(matchingStep)) {
                throw new RenderJobValidationError(`No recipe step found with output_type '${output_type}' for stage '${stageSlug}'`);
            }

            // 5. Extract template_filename from outputs_required.files_to_generate[] where from_document_key matches documentKey
            const outputsRequired = matchingStep.outputs_required;
            if (!outputsRequired || !isRecord(outputsRequired)) {
                throw new RenderJobValidationError(`Recipe step with output_type '${output_type}' has missing or invalid outputs_required`);
            }

            const filesToGenerate = outputsRequired.files_to_generate;
            if (!Array.isArray(filesToGenerate) || filesToGenerate.length === 0) {
                throw new RenderJobValidationError(`Recipe step with output_type '${output_type}' has missing or empty files_to_generate array`);
            }

            // Find the entry where from_document_key matches documentKeyAsFileType
            const matchingFileEntry = filesToGenerate.find((entry) => {
                if (!isRecord(entry)) return false;
                return entry.from_document_key === documentKeyAsFileType;
            });

            if (!matchingFileEntry || !isRecord(matchingFileEntry)) {
                throw new RenderJobValidationError(`No files_to_generate entry found with from_document_key '${documentKeyAsFileType}' in recipe step with output_type '${output_type}'`);
            }

            // 6. Extract and validate template_filename
            const extractedTemplateFilename = matchingFileEntry.template_filename;
            if (typeof extractedTemplateFilename !== 'string' || extractedTemplateFilename.trim() === '') {
                throw new RenderJobValidationError(`template_filename is missing or invalid in files_to_generate entry for from_document_key '${documentKeyAsFileType}'`);
            }

            templateFilename = extractedTemplateFilename.trim();
        } catch (error) {
            if (error instanceof RenderJobValidationError) {
                throw error;
            }
            throw new RenderJobValidationError(`Failed to extract template_filename from recipe step: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Validate template_filename is a non-empty string (should never happen after extraction, but double-check)
        if (!templateFilename || typeof templateFilename !== 'string' || templateFilename.trim() === '') {
            throw new RenderJobValidationError('template_filename must be a non-empty string');
        }

        const renderPayload: DialecticRenderJobPayload = {
            projectId,
            sessionId,
            iterationNumber,
            stageSlug,
            documentIdentity: documentIdentityStrict,
            documentKey: documentKeyAsFileType,
            sourceContributionId: sourceContributionIdStrict,
            template_filename: templateFilename,
            user_jwt: userAuthTokenStrict,
            model_id,
            walletId,
        };

        if (!isDialecticRenderJobPayload(renderPayload)) {
            throw new RenderJobValidationError('renderPayload is not a valid DialecticRenderJobPayload');
        }
        if(!isJson(renderPayload)) {
            throw new RenderJobValidationError('renderPayload is not a valid JSON object');
        }

        const insertObj: TablesInsert<'dialectic_generation_jobs'> = {
            job_type: 'RENDER',
            session_id: job.session_id,
            stage_slug: stageSlug,
            iteration_number: iterationNumber,
            parent_job_id: jobId,
            payload: renderPayload,
            is_test_job: job.is_test_job ?? false,
            status: 'pending',
            user_id: projectOwnerUserId,
        };

        const { data: renderInsertData, error: renderInsertError } = await dbClient
            .from('dialectic_generation_jobs')
            .insert(insertObj)
            .select('*')
            .single();

        if (renderInsertError) {
            const errorMessage = renderInsertError.message || '';
            const errorCode = renderInsertError.code || '';

            // Categorize programmer errors (FK violations, constraint violations, RLS)
            const isProgrammerError =
                errorMessage.includes('foreign key constraint') ||
                errorMessage.includes('unique constraint') ||
                errorMessage.includes('violates') ||
                errorCode === '42501' || // RLS policy violation
                errorCode === '23503' || // FK constraint violation
                errorCode === '23505';   // Unique constraint violation

            if (isProgrammerError) {
                deps.logger.error('[executeModelCallAndSave] Programmer error during RENDER job insert', {
                    renderInsertError,
                    insertObj,
                    errorMessage,
                    errorCode
                });
                throw new RenderJobEnqueueError(
                    `Failed to insert RENDER job due to database constraint violation: ${errorMessage} (code: ${errorCode})`
                );
            }

            // Transient errors - throw to trigger job-level retry
            deps.logger.error('[executeModelCallAndSave] Transient error during RENDER job insert - will retry', {
                renderInsertError,
                insertObj
            });
            throw new RenderJobEnqueueError(
                `Failed to insert RENDER job due to transient error: ${errorMessage}`
            );
        } else {
            const newId = isRecord(renderInsertData) && typeof renderInsertData['id'] === 'string' ? renderInsertData['id'] : undefined;
            deps.logger.info('[executeModelCallAndSave] Enqueued RENDER job', { parent_job_id: jobId, render_job_id: newId });
        }
    }

    if (typeof promptConstructionPayload.source_prompt_resource_id === 'string' && promptConstructionPayload.source_prompt_resource_id.trim().length > 0) {
        const { error: promptLinkUpdateError } = await dbClient
            .from('dialectic_project_resources')
            .update({ source_contribution_id: contribution.id })
            .eq('id', promptConstructionPayload.source_prompt_resource_id);

        if (promptLinkUpdateError) {
            deps.logger.error(
                '[executeModelCallAndSave] Failed to update source_contribution_id for originating prompt resource.',
                {
                    promptResourceId: promptConstructionPayload.source_prompt_resource_id,
                    contributionId: contribution.id,
                    error: promptLinkUpdateError,
                },
            );
        }
    }

    // Emit chunk completion for continuation jobs immediately after save (EXECUTE lifecycle)
    if (projectOwnerUserId && isContinuationForStorage && isDocumentRelated(fileType)) {
        if (!job.payload.document_key || typeof job.payload.document_key !== 'string') {
            throw new Error('document_key is required for execute_chunk_completed notification but is missing or invalid');
        }
        const stepKeyForChunk = job.payload.document_key ?? output_type;
        await deps.notificationService.sendJobNotificationEvent({
            type: 'execute_chunk_completed',
            sessionId: sessionId,
            stageSlug: stageSlug,
            iterationNumber: iterationNumber,
            job_id: jobId,
            step_key: stepKeyForChunk,
            modelId: model_id,
            document_key: job.payload.document_key,
        }, projectOwnerUserId);
    }
    
    const needsContinuation = job.payload.continueUntilComplete && shouldContinue;

    const modelProcessingResult: ModelProcessingResult = { 
        modelId: model_id, 
        status: needsContinuation ? 'needs_continuation' : 'completed', 
        attempts: currentAttempt + 1, 
        contributionId: contribution.id 
    };

    
    if (needsContinuation) {
        deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Preparing to check for continuation for job ${job.id}.`, {
          finish_reason: aiResponse.finish_reason,
          payload_continuation_count: job.payload.continuation_count,
          continueUntilComplete: job.payload.continueUntilComplete
        });

        const continueResult = await deps.continueJob({ logger: deps.logger }, dbClient, job, aiResponse, contribution, projectOwnerUserId);

        deps.logger.info(`[executeModelCallAndSave] DIAGNOSTIC: Result from continueJob for job ${job.id}:`, { continueResult });

        if (continueResult.error) {
          deps.logger.error(`[dialectic-worker] [executeModelCallAndSave] Failed to enqueue continuation for job ${job.id}.`, { error: continueResult.error.message });
        }
        if (projectOwnerUserId) {
            // Calculate continuation number for the newly enqueued job (matches continueJob.ts logic)
            const continuationNumber = (job.payload.continuation_count ?? 0) + 1;
            await deps.notificationService.sendContributionGenerationContinuedEvent({
                type: 'contribution_generation_continued',
                sessionId: sessionId,
                contribution: contribution,
                projectId: projectId,
                modelId: model_id,
                continuationNumber: continuationNumber,
                job_id: jobId,
            }, projectOwnerUserId);
        }
    }

    const isFinalChunk = resolvedFinish === 'stop';

    if (isFinalChunk) {
        // Emit execute_chunk_completed for final chunk (EXECUTE lifecycle); execute_completed is emitted only by processSimpleJob when the EXECUTE job finishes.
        if (projectOwnerUserId && isDocumentRelated(fileType)) {
            if (!job.payload.document_key || typeof job.payload.document_key !== 'string') {
                throw new Error('document_key is required for execute_chunk_completed notification but is missing or invalid');
            }
            const stepKeyForCompleted = job.payload.document_key ?? output_type;
            await deps.notificationService.sendJobNotificationEvent({
                type: 'execute_chunk_completed',
                sessionId: sessionId,
                stageSlug: stageSlug,
                iterationNumber: iterationNumber,
                job_id: jobId,
                step_key: stepKeyForCompleted,
                modelId: model_id,
                document_key: job.payload.document_key,
            }, projectOwnerUserId);
        }

        let rootIdFromSaved: string | undefined = undefined;
        const savedRelationships = contribution.document_relationships;
        if (isRecord(savedRelationships)) {
            const candidateUnknown = savedRelationships[stageSlug];
            if (typeof candidateUnknown === 'string' && candidateUnknown.trim() !== '') {
                rootIdFromSaved = candidateUnknown;
            }
        }
        // Only call assembleAndSaveFinalDocument for JSON-only artifacts (shouldRender === false)
        // Rendered documents (shouldRender === true) are handled by RENDER jobs via renderDocument
        // Only assemble if rootIdFromSaved exists AND is different from current contribution ID
        // (meaning there are multiple chunks; single-chunk artifacts don't need assembly)
        if (rootIdFromSaved && rootIdFromSaved !== contribution.id && !shouldRender) {
            await deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved);
        }
    }

    const { error: finalUpdateError } = await dbClient
        .from('dialectic_generation_jobs')
        .update({
            status: 'completed',
            results: JSON.stringify({ modelProcessingResult }),
            completed_at: new Date().toISOString(),
            attempt_count: currentAttempt + 1,
        })
        .eq('id', jobId);
    
    if (finalUpdateError) {
        deps.logger.error(`[dialectic-worker] [executeModelCallAndSave] CRITICAL: Failed to mark job as 'completed'.`, { finalUpdateError });
    }
    
    if (!needsContinuation) {
        if (projectOwnerUserId) {
            await deps.notificationService.sendContributionReceivedEvent({ 
                contribution,
                type: 'dialectic_contribution_received',
                sessionId: sessionId,
                job_id: jobId,
                is_continuing: false,
            }, projectOwnerUserId);
            await deps.notificationService.sendContributionGenerationCompleteEvent({
                type: 'contribution_generation_complete',
                sessionId: sessionId,
                projectId: projectId,
                job_id: jobId,
            }, projectOwnerUserId);
        }
    }

    deps.logger.info(`[dialectic-worker] [executeModelCallAndSave] Job ${jobId} finished successfully. Results: ${JSON.stringify(modelProcessingResult)}. Final Status: completed`);
}

