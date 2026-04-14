import { Tables } from "../../types_db.ts";
import {
  AdapterResponsePayload,
  ChatApiRequest,
  ChatMessageRow,
  ChatMessageRole,
  FinishReason,
  PerformChatRewindArgs,
} from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { isChatMessageRow, isChatMessageRole } from "../../_shared/utils/type_guards.ts";
import { TokenUsageSchema } from "../zodSchema.ts";
import {
  SseChatCompleteEvent,
  SseChatStartEvent,
  SseContentChunkEvent,
  SseErrorEvent,
} from "../streamChat/streamChat.provides.ts";
import type {
  StreamRewindDeps,
  StreamRewindParams,
  StreamRewindPayload,
  StreamRewindReturn,
} from "./streamRewind.interface.ts";
import { DebitTokensReturn } from "../../_shared/utils/debitTokens.interface.ts";

export async function StreamRewind(
  deps: StreamRewindDeps,
  params: StreamRewindParams,
  payload: StreamRewindPayload,
): Promise<StreamRewindReturn> {
  const {
    logger,
    adminTokenWalletService,
    countTokens: countTokensFn,
    debitTokens,
    createErrorResponse,
    getMaxOutputTokens,
  } = deps;
  const {
    supabaseClient,
    userId,
    wallet,
    aiProviderAdapter,
    modelConfig,
    actualSystemPromptText,
    finalSystemPromptIdForDb,
  } = params;
  const { requestBody, req } = payload;
  const {
    message: userMessageContent,
    providerId: requestProviderId,
    promptId: requestPromptId,
    chatId: existingChatId,
    rewindFromMessageId,
    max_tokens_to_generate,
  } = requestBody;

  logger.info(
    `Rewind request detected. Rewinding from message ID: ${rewindFromMessageId}`,
  );

  if (!existingChatId) {
    logger.warn(
      'StreamRewind: Rewind requested but no "chatId" provided.',
    );
    return createErrorResponse(
      'Cannot perform rewind without a "chatId"',
      400,
      req,
    );
  }
  const currentChatId: string = existingChatId;

  const { data: rewindPointData, error: rewindPointError } =
    await supabaseClient
      .from("chat_messages")
      .select("created_at")
      .eq("id", rewindFromMessageId!)
      .eq("chat_id", currentChatId)
      .single();

  if (rewindPointError || !rewindPointData) {
    logger.error(
      `Rewind error: Failed to find rewind point message ${rewindFromMessageId} in chat ${currentChatId}`,
      { error: rewindPointError },
    );
    if (
      rewindPointError &&
      "code" in rewindPointError &&
      rewindPointError.code === "PGRST116"
    ) {
      return createErrorResponse(
        `Rewind point message with ID ${rewindFromMessageId} not found in chat ${currentChatId}`,
        404,
        req,
      );
    }
    return createErrorResponse(
      rewindPointError?.message ||
        "Failed to retrieve rewind point details.",
      500,
      req,
    );
  }
  const rewindPointTimestamp: string = rewindPointData.created_at;
  logger.info(`Found rewind point timestamp: ${rewindPointTimestamp}`);

  const { data: historyData, error: historyError } = await supabaseClient
    .from("chat_messages")
    .select("*")
    .eq("chat_id", currentChatId)
    .eq("is_active_in_thread", true)
    .lte("created_at", rewindPointTimestamp)
    .order("created_at", { ascending: true });

  if (historyError) {
    logger.error(
      "Rewind error: Failed to fetch chat history for AI context.",
      { error: historyError },
    );
    return createErrorResponse(
      historyError.message,
      500,
      req,
    );
  }

  const chatHistoryForAI: Tables<"chat_messages">[] = historyData || [];
  logger.info(
    `Fetched ${chatHistoryForAI.length} messages for AI context (up to rewind point).`,
  );

  const messagesForAdapter: { role: ChatMessageRole; content: string }[] = [];
  if (actualSystemPromptText) {
    messagesForAdapter.push({
      role: "system",
      content: actualSystemPromptText,
    });
  }
  messagesForAdapter.push(
    ...chatHistoryForAI
      .filter(
        (
          msg,
        ): msg is Tables<"chat_messages"> & {
          role: ChatMessageRole;
          content: string;
        } =>
          !!(
            msg.role &&
            isChatMessageRole(msg.role) &&
            typeof msg.content === "string"
          ),
      )
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
  );

  const tokenizerDeps: CountTokensDeps = {
    getEncoding: (_name: string) => ({
      encode: (input: string) => Array.from(input).map((_, i) => i),
    }),
    countTokensAnthropic: (text: string) => text.length,
    logger: logger,
  };

  let maxAllowedOutputTokens: number;
  try {
    if (!modelConfig) {
      logger.error(
        "Critical: modelConfig is null before token counting (rewind path).",
      );
      return createErrorResponse(
        "Internal server error: Provider configuration missing for token calculation.",
        500,
        req,
      );
    }

    const tokensRequiredForRewind: number = await countTokensFn(
      tokenizerDeps,
      {
        systemInstruction: actualSystemPromptText || undefined,
        message: userMessageContent,
        messages: messagesForAdapter,
        resourceDocuments: requestBody.resourceDocuments,
      },
      modelConfig,
    );
    logger.info("Estimated tokens for rewind prompt.", {
      tokensRequiredForRewind,
      model: modelConfig.api_identifier,
    });

    if (
      modelConfig.provider_max_input_tokens &&
      tokensRequiredForRewind > modelConfig.provider_max_input_tokens
    ) {
      logger.warn("Rewind request exceeds provider max input tokens.", {
        tokensRequired: tokensRequiredForRewind,
        providerMaxInput: modelConfig.provider_max_input_tokens,
        model: modelConfig.api_identifier,
      });
      return createErrorResponse(
        `Your message is too long for this rewind request. Maximum: ${modelConfig.provider_max_input_tokens} tokens, actual: ${tokensRequiredForRewind} tokens.`,
        413,
        req,
      );
    }

    maxAllowedOutputTokens = getMaxOutputTokens(
      parseFloat(String(wallet.balance)),
      tokensRequiredForRewind,
      modelConfig,
      logger,
    );

    if (maxAllowedOutputTokens < 1) {
      logger.warn("Insufficient token balance for rewind prompt.", {
        currentBalance: wallet.balance,
        tokensRequired: tokensRequiredForRewind,
        maxAllowedOutput: maxAllowedOutputTokens,
      });
      return createErrorResponse(
        "Insufficient token balance. You cannot generate a response.",
        402,
        req,
      );
    }
  } catch (tokenError) {
    const typedTokenError: Error = tokenError instanceof Error
      ? tokenError
      : new Error(String(tokenError));
    logger.error(
      "Error estimating tokens or checking balance for rewind prompt:",
      {
        error: typedTokenError.message,
        model: modelConfig?.api_identifier,
      },
    );
    return createErrorResponse(
      `Server error: Could not estimate token cost or check balance. ${typedTokenError.message}`,
      500,
      req,
    );
  }

  const encoder: TextEncoder = new TextEncoder();
  const providerApiIdentifier: string = modelConfig!.api_identifier;

  const stream: ReadableStream<Uint8Array> = new ReadableStream<
    Uint8Array
  >({
    async start(controller) {
      try {
        const initData: SseChatStartEvent = {
          type: "chat_start",
          chatId: currentChatId,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initData)}\n\n`),
        );

        logger.info(`Calling AI adapter for rewind...`);
        const adapterChatRequest: ChatApiRequest = {
          message: userMessageContent,
          messages: messagesForAdapter,
          providerId: requestProviderId,
          promptId: requestPromptId,
          chatId: currentChatId,
          max_tokens_to_generate: Math.min(
            max_tokens_to_generate || Infinity,
            maxAllowedOutputTokens,
          ),
        };
        const adapterResponsePayload: AdapterResponsePayload =
          await aiProviderAdapter.sendMessage(
            adapterChatRequest,
            providerApiIdentifier,
          );
        logger.info("AI adapter returned successfully for rewind.");

        const content: string = adapterResponsePayload.content || "";
        const chunkSize: number = 10;
        const newAssistantMessageId: string = crypto.randomUUID();
        const newUserMessageId: string = crypto.randomUUID();

        for (let i: number = 0; i < content.length; i += chunkSize) {
          const chunk: string = content.slice(i, i + chunkSize);

          const streamData: SseContentChunkEvent = {
            type: "content_chunk",
            content: chunk,
            assistantMessageId: newAssistantMessageId,
            timestamp: new Date().toISOString(),
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`),
          );

          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(
          adapterResponsePayload.token_usage,
        );
        if (!parsedTokenUsage.success) {
          logger.error(
            "Rewind path: Failed to parse token_usage from adapter.",
            {
              error: parsedTokenUsage.error,
              payload: adapterResponsePayload.token_usage,
            },
          );
          throw new Error("Invalid token usage data from AI provider.");
        }

        const debitTokensResult: DebitTokensReturn = await debitTokens(
          { logger, tokenWalletService: adminTokenWalletService },
          {
            wallet,
            tokenUsage: parsedTokenUsage.data,
            modelConfig: modelConfig!,
            userId,
            chatId: currentChatId,
            relatedEntityId: newAssistantMessageId,
            databaseOperation: async () => {
              const rpcParams: PerformChatRewindArgs = {
                p_chat_id: currentChatId,
                p_rewind_from_message_id: rewindFromMessageId!,
                p_user_id: userId,
                p_new_user_message_id: newUserMessageId,
                p_new_user_message_content: userMessageContent,
                p_new_user_message_ai_provider_id: requestProviderId,
                p_new_assistant_message_id: newAssistantMessageId,
                p_new_assistant_message_content: adapterResponsePayload.content,
                p_new_assistant_message_token_usage:
                  adapterResponsePayload.token_usage,
                p_new_assistant_message_ai_provider_id: requestProviderId,
                ...(finalSystemPromptIdForDb !== null && {
                  p_new_user_message_system_prompt_id: finalSystemPromptIdForDb,
                  p_new_assistant_message_system_prompt_id:
                    finalSystemPromptIdForDb,
                }),
              };

              const { data: rpcData, error: rpcError } = await supabaseClient
                .rpc("perform_chat_rewind", rpcParams);

              if (rpcError) {
                logger.error(
                  "Rewind error: perform_chat_rewind RPC failed.",
                  { error: rpcError },
                );
                throw new Error(rpcError.message);
              }

              const firstRow: unknown = Array.isArray(rpcData)
                ? rpcData[0]
                : rpcData;

              if (!isChatMessageRow(firstRow)) {
                logger.error("Rewind error: RPC returned invalid data.", {
                  data: firstRow,
                });
                throw new Error(
                  "Invalid data returned from perform_chat_rewind RPC.",
                );
              }
              const newUserMessageData: Tables<"chat_messages"> = {
                id: newUserMessageId,
                chat_id: currentChatId,
                user_id: userId,
                role: "user",
                content: userMessageContent,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_active_in_thread: true,
                token_usage: null,
                ai_provider_id: requestProviderId,
                system_prompt_id: finalSystemPromptIdForDb,
                error_type: null,
                response_to_message_id: null,
              };
              return {
                userMessage: newUserMessageData,
                assistantMessage: firstRow,
              };
            },
          },
          {},
        );

        if ("error" in debitTokensResult) {
          throw debitTokensResult.error;
        }

        const savedAssistant: ChatMessageRow = debitTokensResult.result.assistantMessage;

        let rewindFinishReason: FinishReason;
        if (adapterResponsePayload.finish_reason === undefined) {
          rewindFinishReason = null;
        } else {
          rewindFinishReason = adapterResponsePayload.finish_reason;
        }

        const completionData: SseChatCompleteEvent = {
          type: "chat_complete",
          assistantMessage: savedAssistant,
          finish_reason: rewindFinishReason,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`),
        );

        controller.close();
        logger.info("SSE rewind streaming completed successfully");
      } catch (error) {
        const errMsg: string = error instanceof Error
          ? error.message
          : String(error);
        logger.error("Error during SSE rewind streaming:", {
          error: errMsg,
        });

        const errorData: SseErrorEvent = {
          type: "error",
          message: errMsg.includes("Insufficient funds")
            ? `Insufficient token balance: ${errMsg}`
            : errMsg,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Accept",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
