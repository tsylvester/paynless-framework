// supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts

import { isApiChatMessage } from "../../_shared/utils/type_guards.ts";
import type { ChatApiRequest, Messages, ResourceDocuments } from "../../_shared/types.ts";
import type { CountableChatPayload } from "../../_shared/types/tokenizer.types.ts";
import { CompressionCandidate } from "../../_shared/utils/vector_utils.ts";
import { ContextWindowError } from "../../_shared/utils/errors.ts";
import { getMaxOutputTokens } from "../../_shared/utils/affordability_utils.ts";
import type {
  CompressPromptDeps,
  CompressPromptParams,
  CompressPromptPayload,
  CompressPromptReturn,
} from "./compressPrompt.interface.ts";

export async function compressPrompt(
  deps: CompressPromptDeps,
  params: CompressPromptParams,
  payload: CompressPromptPayload,
): Promise<CompressPromptReturn> {
  for (const doc of payload.resourceDocuments) {
      const hasDocKey: boolean = typeof doc.document_key === "string" && doc.document_key !== "";
      const hasType: boolean = typeof doc.type === "string" && doc.type !== "";
      const hasStage: boolean = typeof doc.stage_slug === "string" && doc.stage_slug !== "";
      if (!(hasDocKey && hasType && hasStage)) {
        return {
          error: new Error(
            "Compression requires document identity: document_key, type, and stage_slug must be present.",
          ),
          retriable: false,
        };
      }
    }

    const modelConfig = params.extendedModelConfig;
    const contextWindowTokens = modelConfig.context_window_tokens;
    if (
      contextWindowTokens === null ||
      contextWindowTokens === undefined ||
      typeof contextWindowTokens !== "number" ||
      !Number.isFinite(contextWindowTokens)
    ) {
      return {
        error: new Error("context_window_tokens is not defined"),
        retriable: false,
      };
    }
    const maxTokens: number = contextWindowTokens;

    if (modelConfig.provider_max_input_tokens === undefined) {
      return {
        error: new Error("Provider max input tokens is not defined"),
        retriable: false,
      };
    }
    const providerMaxInputTokens: number = modelConfig.provider_max_input_tokens;

    const resourceDocuments: ResourceDocuments = payload.resourceDocuments.map((d) => ({ ...d }));
    const workingHistory: Messages[] = [...payload.conversationHistory];

    let chatApiRequest: ChatApiRequest = {
      ...payload.chatApiRequest,
      resourceDocuments,
    };

    const initialCountable: CountableChatPayload = {
      systemInstruction: chatApiRequest.systemInstruction,
      message: chatApiRequest.message,
      messages: chatApiRequest.messages,
      resourceDocuments: chatApiRequest.resourceDocuments,
    };
    let currentTokenCount: number = deps.countTokens(
      payload.tokenizerDeps,
      initialCountable,
      modelConfig,
    );

    const seedMessages: Messages[] = chatApiRequest.messages === undefined ? [] : [...chatApiRequest.messages];
    let currentAssembledMessages: Messages[] = seedMessages;

    let currentBalanceTokens: number = params.balanceAfterCompression;

    const candidates: CompressionCandidate[] = [
      ...await payload.compressionStrategy(
        { dbClient: params.dbClient, embeddingClient: deps.embeddingClient, logger: deps.logger },
        { inputsRelevance: params.inputsRelevance },
        { documents: resourceDocuments, history: workingHistory, currentUserPrompt: payload.currentUserPrompt },
      ),
    ];

    deps.logger.info(`[compressPrompt] Number of compression candidates found: ${candidates.length}`);

    const idsToCheck: string[] = candidates
      .map((c: CompressionCandidate) => c.id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

    let indexedIds: Set<string> = new Set<string>();
    if (idsToCheck.length > 0) {
      const { data: indexedRows, error: indexedErr } = await params.dbClient
        .from("dialectic_memory")
        .select("source_contribution_id")
        .in("source_contribution_id", idsToCheck);

      if (!indexedErr && Array.isArray(indexedRows)) {
        indexedIds = new Set(
          indexedRows
            .map((r) =>
              r && typeof r["source_contribution_id"] === "string" ? r["source_contribution_id"] : undefined,
            )
            .filter((v): v is string => typeof v === "string"),
        );
      }
    }

    const finalTargetThreshold: number = params.finalTargetThreshold;
    const inputRate: number = params.inputRate;
    const jobId: string = params.jobId;
    const sessionId: string = params.sessionId;
    const stageSlug: string = params.stageSlug;
    const walletId: string = params.walletId;
    const projectOwnerUserId: string = params.projectOwnerUserId;
    const isContinuationFlowInitial: boolean = params.isContinuationFlowInitial;
    const tokenizerDeps = payload.tokenizerDeps;

    while (candidates.length > 0) {
      if (!(currentTokenCount > finalTargetThreshold)) {
        break;
      }
      const victim: CompressionCandidate | undefined = candidates.shift();
      if (!victim) {
        break;
      }

      if (typeof victim.id === "string" && indexedIds.has(victim.id)) {
        continue;
      }

      const ragResult = await deps.ragService.getContextForModel(
        [{ id: victim.id, content: victim.content }],
        modelConfig,
        sessionId,
        stageSlug,
        params.inputsRelevance,
      );

      if (ragResult.error !== undefined) {
        return { error: ragResult.error, retriable: false };
      }

      const tokensUsed: number = ragResult.tokensUsedForIndexing || 0;
      deps.logger.info("[compressPrompt] RAG tokensUsedForIndexing observed in-loop", {
        jobId,
        candidateId: victim.id,
        tokensUsed,
        hasWallet: Boolean(walletId),
      });
      if (tokensUsed > 0) {
        const observedCompressionCost: number = tokensUsed * inputRate;
        currentBalanceTokens = Math.max(0, currentBalanceTokens - observedCompressionCost);
      }
      if (tokensUsed > 0 && walletId) {
        deps.logger.info("[compressPrompt] Debiting wallet for RAG compression", {
          jobId,
          candidateId: victim.id,
          amount: tokensUsed,
        });
        try {
          await deps.tokenWalletService.recordTransaction({
            walletId: walletId,
            type: "DEBIT_USAGE",
            amount: tokensUsed.toString(),
            recordedByUserId: projectOwnerUserId,
            idempotencyKey: `rag:${jobId}:${victim.id}`,
            relatedEntityId: victim.id,
            relatedEntityType: "rag_compression",
            notes: `RAG compression for job ${jobId}`,
          });
        } catch (error: unknown) {
          return {
            error: new Error(
              `Insufficient funds for RAG operation. Cost: ${tokensUsed} tokens.`,
              { cause: error },
            ),
            retriable: false,
          };
        }
      }

      const newContent: string | null = ragResult.context;
      if (!newContent) {
        return {
          error: new Error(`RAG context is empty for candidate ${victim.id}`),
          retriable: false,
        };
      }
      if (victim.sourceType === "history") {
        const historyIndex: number = workingHistory.findIndex((h) => h.id === victim.id);
        if (historyIndex > -1) {
          workingHistory[historyIndex].content = newContent;
        }
      } else {
        const docIndex: number = resourceDocuments.findIndex((d) => d.id === victim.id);
        if (docIndex > -1) {
          resourceDocuments[docIndex].content = newContent;
        }
      }

      const enforcedHistory: Messages[] = [];
      if (workingHistory.length > 0) {
        enforcedHistory.push(workingHistory[0]);
        for (let i = 1; i < workingHistory.length; i++) {
          const prevMsg: Messages = enforcedHistory[enforcedHistory.length - 1];
          const currentMsg: Messages = workingHistory[i];
          if (prevMsg.role === currentMsg.role) {
            if (currentMsg.role === "assistant") {
              enforcedHistory.push({ role: "user", content: "Please continue." });
            } else {
              enforcedHistory.push({ role: "assistant", content: "" });
            }
          }
          enforcedHistory.push(currentMsg);
        }
      }

      const loopAssembledMessages: Messages[] = [];
      if (!isContinuationFlowInitial) {
        loopAssembledMessages.push({ role: "user", content: payload.currentUserPrompt });
      }
      for (const msg of enforcedHistory) {
        if (msg.role !== "function") {
          loopAssembledMessages.push({ role: msg.role, content: msg.content });
        }
      }
      currentAssembledMessages = loopAssembledMessages;

      chatApiRequest = {
        ...chatApiRequest,
        message: payload.currentUserPrompt,
        messages: currentAssembledMessages
          .filter(isApiChatMessage)
          .filter((m): m is { role: "user" | "assistant" | "system"; content: string } => m.content !== null),
        resourceDocuments,
      };
      const loopPayload: CountableChatPayload = {
        systemInstruction: chatApiRequest.systemInstruction,
        message: chatApiRequest.message,
        messages: chatApiRequest.messages,
        resourceDocuments: chatApiRequest.resourceDocuments,
      };
      currentTokenCount = deps.countTokens(tokenizerDeps, loopPayload, modelConfig);
    }

    let allowedInputCheck: number;
    try {
      const plannedMaxOutputForCheck: number = getMaxOutputTokens(
        currentBalanceTokens,
        currentTokenCount,
        modelConfig,
        deps.logger,
      );
      const safetyBufferForCheck: number = 32;
      allowedInputCheck = providerMaxInputTokens - (plannedMaxOutputForCheck + safetyBufferForCheck);
    } catch (e: unknown) {
      if (e instanceof Error) {
        return { error: e, retriable: false };
      }
      throw e;
    }
    if (currentTokenCount > Math.min(maxTokens, allowedInputCheck)) {
      return {
        error: new ContextWindowError(
          `Compressed prompt token count (${currentTokenCount}) still exceeds model limit (${maxTokens}) and allowed input (${allowedInputCheck}).`,
        ),
        retriable: false,
      };
    }

    deps.logger.info(
      `[compressPrompt] Prompt successfully compressed. New token count: ${currentTokenCount}`,
    );

    chatApiRequest = {
      ...chatApiRequest,
      message: payload.currentUserPrompt,
      messages: currentAssembledMessages
        .filter(isApiChatMessage)
        .filter((m): m is { role: "user" | "assistant" | "system"; content: string } => m.content !== null),
      resourceDocuments,
    };
    const finalPayloadAfterCompression: CountableChatPayload = {
      systemInstruction: chatApiRequest.systemInstruction,
      message: chatApiRequest.message,
      messages: chatApiRequest.messages,
      resourceDocuments: chatApiRequest.resourceDocuments,
    };
    const finalTokenCountAfterCompression: number = deps.countTokens(
      tokenizerDeps,
      finalPayloadAfterCompression,
      modelConfig,
    );

    let plannedMaxOutputTokensPost: number;
    try {
      plannedMaxOutputTokensPost = getMaxOutputTokens(
        currentBalanceTokens,
        finalTokenCountAfterCompression,
        modelConfig,
        deps.logger,
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        return { error: e, retriable: false };
      }
      throw e;
    }

    const safetyBufferTokensPost: number = 32;
    const allowedInputPost: number =
      providerMaxInputTokens - (plannedMaxOutputTokensPost + safetyBufferTokensPost);

    if (allowedInputPost !== Infinity && allowedInputPost <= 0) {
      return {
        error: new ContextWindowError(
          `No input window remains after reserving output budget (${plannedMaxOutputTokensPost}) and safety buffer (${safetyBufferTokensPost}).`,
        ),
        retriable: false,
      };
    }

    if (allowedInputPost !== Infinity && finalTokenCountAfterCompression > allowedInputPost) {
      return {
        error: new ContextWindowError(
          `Final input tokens (${finalTokenCountAfterCompression}) exceed allowed input (${allowedInputPost}) after reserving output budget.`,
        ),
        retriable: false,
      };
    }

    const estimatedInputCostPost: number = finalTokenCountAfterCompression * params.inputRate;
    const estimatedOutputCostPost: number = plannedMaxOutputTokensPost * params.outputRate;
    const estimatedTotalCostPost: number = estimatedInputCostPost + estimatedOutputCostPost;
    if (estimatedTotalCostPost > params.walletBalance) {
      return {
        error: new Error(
          `Insufficient funds: estimated total cost (${estimatedTotalCostPost}) exceeds wallet balance (${params.walletBalance}) after compression.`,
        ),
        retriable: false,
      };
    }

    const chatApiRequestOut: ChatApiRequest = {
      ...chatApiRequest,
      max_tokens_to_generate: plannedMaxOutputTokensPost,
    };

    return {
      chatApiRequest: chatApiRequestOut,
      resolvedInputTokenCount: finalTokenCountAfterCompression,
      resourceDocuments,
    };
}
