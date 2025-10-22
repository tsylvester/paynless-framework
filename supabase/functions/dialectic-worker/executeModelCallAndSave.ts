import {
  type UnifiedAIResponse,
  type ModelProcessingResult,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { ModelContributionFileTypes, ModelContributionUploadContext } from '../_shared/types/file_manager.types.ts';
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
} from "../_shared/utils/type_guards.ts";
import { AiModelExtendedConfig, ChatApiRequest, Messages, FinishReason } from '../_shared/types.ts';
import { CountTokensDeps, CountableChatPayload } from '../_shared/types/tokenizer.types.ts';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { ResourceDocuments } from "../_shared/types.ts";
import { getMaxOutputTokens } from '../_shared/utils/affordability_utils.ts';

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
    
    if (!isDialecticExecuteJobPayload(job.payload)) {
        throw new Error(`Job ${job.id} does not have a valid 'execute' payload.`);
    }
    
    const { 
        id: jobId, 
        attempt_count: currentAttempt, 
    } = job;
    
    const { 
        iterationNumber = 1, 
        stageSlug, 
        projectId, 
        model_id,
        sessionId,
        walletId,
        output_type,
    } = job.payload;

    if (!stageSlug) {
        throw new Error(`Job ${jobId} is missing required stageSlug in its payload.`);
    }

    // Enforce wallet presence for ALL requests before any provider calls or sizing
    if (typeof walletId !== 'string' || walletId.trim() === '') {
        throw new Error('Wallet is required to process model calls.');
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
        resourceDocuments,
        currentUserPrompt,
    } = promptConstructionPayload;

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
    let currentResourceDocuments: ResourceDocuments = [...resourceDocuments];

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
        const workingResourceDocs = [...resourceDocuments];
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
        
        const candidates = await compressionStrategy(dbClient, deps, workingResourceDocs, workingHistory, currentUserPrompt);
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

            const ragResult = await ragService.getContextForModel(
                [{ id: victim.id, content: victim.content || '' }], 
                extendedModelConfig, 
                sessionId, 
                stageSlug
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

    // Do not append resourceDocuments into messages; they are not implemented as chat messages

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
    // Enforce presence of user_jwt on the payload (no fallback to function authToken)
    let userAuthToken: string | undefined = undefined;
    {
        const desc = Object.getOwnPropertyDescriptor(job.payload, 'user_jwt');
        const potential = desc ? desc.value : undefined;
        if (typeof potential === 'string' && potential.length > 0) {
            userAuthToken = potential;
        }
    }
    if (!userAuthToken) {
        throw new Error('payload.user_jwt required');
    }

    if (!deps.callUnifiedAIModel) {
        throw new Error("Dependency 'callUnifiedAIModel' is not provided.");
    }

    const startTime = Date.now();
    const aiResponse: UnifiedAIResponse = await deps.callUnifiedAIModel(
        chatApiRequest,
        userAuthToken, 
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
    let parsedContent: unknown;
    try {
        parsedContent = JSON.parse(aiResponse.content);
    } catch (e) {
        // This handles a malformed JSON response, which is a retryable failure.
        deps.logger.warn(`[executeModelCallAndSave] Malformed JSON response for job ${job.id}. Triggering retry.`, { error: e instanceof Error ? e.message : String(e) });
        
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

    const contentForStorage: string = aiResponse.content;
    
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
    }

    if (!aiResponse.rawProviderResponse || !isJson(aiResponse.rawProviderResponse)) {
        throw new Error('Raw provider response is required');
    }
    const uploadContext: ModelContributionUploadContext = {
        pathContext: {
            projectId: job.payload.projectId,
            fileType: fileType,
            sessionId,
            iteration: iterationNumber,
            stageSlug,
            modelSlug: providerDetails.api_identifier,
            attemptCount: job.attempt_count,
            ...restOfCanonicalPathParams,
            contributionType,
            isContinuation: isContinuationForStorage,
            turnIndex: isContinuationForStorage ? job.payload.continuation_count ?? 0 : undefined,
        },
        fileContent: contentForStorage, 
        mimeType: aiResponse.contentType || "text/markdown",
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
            rawJsonResponseContent: aiResponse.rawProviderResponse,
            tokensUsedInput: aiResponse.inputTokens, 
            tokensUsedOutput: aiResponse.outputTokens,
            processingTimeMs: aiResponse.processingTimeMs,
            source_prompt_resource_id: promptConstructionPayload.source_prompt_resource_id,
            target_contribution_id: targetContributionId,
            document_relationships,
            isIntermediate: 'isIntermediate' in job.payload && job.payload.isIntermediate,
        },
    };

    const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    if (savedResult.error || !isDialecticContribution(savedResult.record)) {
        throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
    }

    const contribution = savedResult.record;

    // Persist full document_relationships for continuation saves to avoid initializer self-map
    const payloadRelationships = job.payload.document_relationships;
    if (isContinuationForStorage && isDocumentRelationships(payloadRelationships)) {
        const { error: relUpdateError } = await dbClient
            .from('dialectic_contributions')
            .update({ document_relationships: payloadRelationships })
            .eq('id', contribution.id);

        if (relUpdateError) {
            deps.logger.error(`[executeModelCallAndSave] CRITICAL: Failed to persist continuation document_relationships for contribution ${contribution.id}.`, { relUpdateError });
        } else {
            contribution.document_relationships = payloadRelationships;
        }
    }

    // Initialize root-only relationships when absent (first chunk only)
    if (!contribution.document_relationships && !isContinuationForStorage) {
        const dynamicRelationships: Record<string, string> = {};
        dynamicRelationships[stageSlug] = contribution.id;

        const { error: updateError } = await dbClient
            .from('dialectic_contributions')
            .update({ document_relationships: dynamicRelationships })
            .eq('id', contribution.id);

        if (updateError) {
            deps.logger.error(`[executeModelCallAndSave] CRITICAL: Failed to update document_relationships for contribution ${contribution.id}.`, { updateError });
        } else {
            contribution.document_relationships = dynamicRelationships;
        }
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
            await deps.notificationService.sendContributionGenerationContinuedEvent({
                type: 'contribution_generation_continued',
                sessionId: sessionId,
                contribution: contribution,
                projectId: projectId,
                modelId: model_id,
                continuationNumber: job.payload.continuation_count ?? 1,
                job_id: jobId,
            }, projectOwnerUserId);
        }
    }

    const isFinalChunk = resolvedFinish === 'stop';

    if (isFinalChunk) {
        let rootIdFromSaved: string | undefined = undefined;
        const savedRelationships = contribution.document_relationships;
        if (isRecord(savedRelationships)) {
            const candidateUnknown = savedRelationships[stageSlug];
            if (typeof candidateUnknown === 'string' && candidateUnknown.trim() !== '') {
                rootIdFromSaved = candidateUnknown;
            }
        }
        if (rootIdFromSaved) {
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
