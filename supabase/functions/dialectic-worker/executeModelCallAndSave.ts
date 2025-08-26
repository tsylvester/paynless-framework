import {
  type UnifiedAIResponse,
  type ModelProcessingResult,
  type ExecuteModelCallAndSaveParams,
} from '../dialectic-service/dialectic.interface.ts';
import { UploadContext, FileType } from '../_shared/types/file_manager.types.ts';
import { isDialecticContribution, isAiModelExtendedConfig, isDialecticExecuteJobPayload, isContributionType, isFileType, isApiChatMessage, isContinueReason } from "../_shared/utils/type_guards.ts";
import { AiModelExtendedConfig, ChatApiRequest, Messages } from '../_shared/types.ts';
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
        authToken, 
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
        max_context_window_tokens: modelConfig.max_context_window_tokens,
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
    const initialAssembledMessages: Messages[] = [];
    if (!isContinuationFlowInitial) {
        initialAssembledMessages.push({ role: 'user', content: sanitizedCurrentUserPrompt });
    }
    conversationHistory.forEach(msg => {
        if (msg.role !== 'function') {
            initialAssembledMessages.push({ role: msg.role, content: msg.content });
        }
    });
    // Enforce strict alternation (user/assistant) ignoring 'system' by inserting empty user spacers only when necessary
    const enforceStrictTurnOrder = (
        input: { role: 'system'|'user'|'assistant'; content: string }[],
    ): { role: 'system'|'user'|'assistant'; content: string }[] => {
        const output: { role: 'system'|'user'|'assistant'; content: string }[] = [];
        let lastNonSystemRole: 'user' | 'assistant' | null = null;
        for (const m of input) {
            if (m.role === 'system') {
                output.push(m);
                continue;
            }
            if (lastNonSystemRole !== null && lastNonSystemRole === m.role) {
                // Insert an empty user spacer to maintain alternation without affecting token counts
                const spacer: { role: 'user'|'assistant'; content: string } = {
                    role: lastNonSystemRole === 'assistant' ? 'user' : 'assistant',
                    content: '',
                };
                // Only insert if it actually flips the role to alternate
                output.push(spacer);
                lastNonSystemRole = spacer.role;
            }
            output.push(m);
            lastNonSystemRole = m.role;
        }
        return output;
    };
    // Track the single source of truth for what we size and what we send
    let currentAssembledMessages: Messages[] = initialAssembledMessages;
    let currentResourceDocuments: ResourceDocuments = [...resourceDocuments];

    // Build normalized messages for initial sizing
    const initialEffectiveMessages: { role: 'system'|'user'|'assistant'; content: string }[] = initialAssembledMessages
        .filter(isApiChatMessage)
        .filter((m): m is { role: 'system'|'user'|'assistant'; content: string } => m.content !== null);
    const normalizedInitialMessages = enforceStrictTurnOrder(initialEffectiveMessages);

    const fullPayload: CountableChatPayload = {
        systemInstruction,
        message: sanitizedCurrentUserPrompt,
        messages: normalizedInitialMessages,
        resourceDocuments: currentResourceDocuments.map(d => ({ id: d.id, content: d.content })),
    };
    const initialTokenCount = deps.countTokens(tokenizerDeps, fullPayload, extendedModelConfig);
    const maxTokens = extendedModelConfig.max_context_window_tokens || extendedModelConfig.context_window_tokens;
    
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

        // Reserve headroom for output + safety buffer from the input window
        const providerMaxInputTokens = (typeof (extendedModelConfig).provider_max_input_tokens === 'number'
            && (extendedModelConfig).provider_max_input_tokens! > 0)
            ? (extendedModelConfig).provider_max_input_tokens!
            : (typeof extendedModelConfig.context_window_tokens === 'number' ? extendedModelConfig.context_window_tokens : 0);

        const safetyBufferTokens = 32;
        const allowedInput = providerMaxInputTokens > 0
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
        messages: enforceStrictTurnOrder(
            currentAssembledMessages
                .filter(isApiChatMessage)
                .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
        ),
        providerId: providerDetails.id,
        promptId: '__none__',
        systemInstruction: systemInstruction,
        walletId: walletId,
        resourceDocuments: currentResourceDocuments.map((d) => ({ id: d.id, content: d.content })),
        continue_until_complete: job.payload.continueUntilComplete,
        isDialectic: true,
    };

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
        
        const currentUserBalance: number = walletBalance;
        
        // Stage 1: Absolute Affordability Check
        if (currentUserBalance < totalEstimatedInputCost) {
            throw new Error(`Insufficient funds for the entire operation. Estimated cost: ${totalEstimatedInputCost}, Balance: ${currentUserBalance}`);
        }

        // Stage 2: Rationality Check
        const rationalityThreshold = 0.20; // 20%
        if (totalEstimatedInputCost > currentUserBalance * rationalityThreshold) {
            throw new Error(`Estimated cost (${totalEstimatedInputCost}) exceeds 20% of the user's balance (${currentUserBalance}).`);
        }

        deps.logger.info(
            `Initial prompt token count (${initialTokenCount}) exceeds model limit (${maxTokens}) for job ${jobId}. Attempting compression.`,
        );

        const workingHistory = [...conversationHistory];
        const workingResourceDocs = [...resourceDocuments];
        let currentTokenCount = initialTokenCount;
        
        const candidates = await compressionStrategy(dbClient, deps, workingResourceDocs, workingHistory, currentUserPrompt);
        console.log(`[DEBUG] Number of compression candidates found: ${candidates.length}`);
        
        while (currentTokenCount > maxTokens && candidates.length > 0) {
            const victim = candidates.shift(); // Takes the lowest-value item and removes it from the array
            if (!victim) break; // Should not happen with the loop condition, but good for safety

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
            
            const loopAssembledMessages: Messages[] = [];
            if (!isContinuationFlowInitial) {
                loopAssembledMessages.push({ role: 'user', content: currentUserPrompt });
            }
            workingHistory.forEach(msg => {
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
                messages: enforceStrictTurnOrder(
                    currentAssembledMessages
                        .filter(isApiChatMessage)
                        .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
                ),
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

        if (currentTokenCount > maxTokens) {
            throw new ContextWindowError(
                `Compressed prompt token count (${currentTokenCount}) still exceeds model limit (${maxTokens}).`,
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
            messages: enforceStrictTurnOrder(
                currentAssembledMessages
                    .filter(isApiChatMessage)
                    .filter((m): m is { role: 'user' | 'assistant' | 'system', content: string } => m.content !== null),
            ),
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
            walletBalance,
            finalTokenCountAfterCompression,
            extendedModelConfig,
            deps.logger,
        );

        const providerMaxInputTokensPost =
            (typeof extendedModelConfig.provider_max_input_tokens === 'number' && extendedModelConfig.provider_max_input_tokens > 0)
                ? extendedModelConfig.provider_max_input_tokens
                : (typeof extendedModelConfig.context_window_tokens === 'number' ? extendedModelConfig.context_window_tokens : 0);

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
    }

    // Do not append resourceDocuments into messages; they are not implemented as chat messages

    // chatApiRequest already constructed and kept in sync above; use it directly for the adapter call

    const userAuthToken = 'user_jwt' in job.payload && job.payload.user_jwt ? job.payload.user_jwt : authToken;

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

    if (!aiResponse) {
        throw new Error('No response from AI adapter');
    }

    if (aiResponse.error || !aiResponse.content) {
        throw new Error(aiResponse.error || 'AI response was empty.');
    }

    const isContinuation = !!aiResponse.finish_reason && isContinueReason(aiResponse.finish_reason);

    const contentForStorage: string = aiResponse.content;
    
    // This is the correct implementation. The semantic relationships are inherited
    // directly from the job payload. The structural link for continuations is
    // handled by the `target_contribution_id` field on the contribution record,
    // not by adding a non-standard property to this JSON blob.
    const document_relationships = job.payload.document_relationships;

    const fileType: FileType = isFileType(output_type) 
        ? output_type
        : FileType.ModelContributionMain;

    const description = fileType === FileType.ModelContributionMain
        ? `Contribution for stage '${stageSlug}' by model ${providerDetails.name}`
        : `Intermediate artifact '${output_type}' for stage '${stageSlug}' by model ${providerDetails.name}`;

    const {
        contributionType: rawContributionType,
        ...restOfCanonicalPathParams
    } = job.payload.canonicalPathParams;

    const contributionType = isContributionType(rawContributionType)
        ? rawContributionType
        : undefined;

    const uploadContext: UploadContext = {
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
        },
        fileContent: contentForStorage, 
        mimeType: aiResponse.contentType || "text/markdown",
        sizeBytes: contentForStorage.length, 
        userId: projectOwnerUserId,
        description,
        resourceTypeForDb: job.payload.output_type || stageSlug,
        contributionMetadata: {
            sessionId, 
            modelIdUsed: providerDetails.id, 
            modelNameDisplay: providerDetails.name,
            stageSlug, 
            iterationNumber, 
            contributionType: contributionType,
            rawJsonResponseContent: JSON.stringify(aiResponse.rawProviderResponse || {}),
            tokensUsedInput: aiResponse.inputTokens, 
            tokensUsedOutput: aiResponse.outputTokens,
            processingTimeMs: aiResponse.processingTimeMs, 
            seedPromptStoragePath: 'file/location',
            target_contribution_id: job.payload.target_contribution_id,
            document_relationships: document_relationships,
            isIntermediate: 'isIntermediate' in job.payload && job.payload.isIntermediate,
            isContinuation: isContinuation,
            turnIndex: isContinuation ? job.payload.continuation_count ?? 0 : undefined,
        },
    };

    const savedResult = await deps.fileManager.uploadAndRegisterFile(uploadContext);

    if (savedResult.error || !isDialecticContribution(savedResult.record)) {
        throw new Error(`Failed to save contribution: ${savedResult.error?.message || 'Invalid record returned.'}`);
    }

    const contribution = savedResult.record;

    if (contribution.contribution_type === 'thesis' && !contribution.document_relationships) {
        const { error: updateError } = await dbClient
            .from('dialectic_contributions')
            .update({ document_relationships: { thesis: contribution.id } })
            .eq('id', contribution.id);

        if (updateError) {
            deps.logger.error(`[executeModelCallAndSave] CRITICAL: Failed to update document_relationships for thesis contribution ${contribution.id}.`, { updateError });
        } else {
            contribution.document_relationships = { thesis: contribution.id };
        }
    }
    
    const needsContinuation = job.payload.continueUntilComplete && aiResponse.finish_reason && isContinueReason(aiResponse.finish_reason);

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

    const isFinalChunk = aiResponse.finish_reason === 'stop';

    if (isFinalChunk && job.payload.document_relationships) {
        await deps.fileManager.assembleAndSaveFinalDocument(job.payload.document_relationships.thesis!);
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





