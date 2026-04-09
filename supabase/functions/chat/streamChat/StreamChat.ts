import {
  AdapterResponsePayload,
  ChatApiRequest,
  ChatMessageInsert,
  FinishReason,
} from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { isChatMessageRow } from "../../_shared/utils/type-guards/type_guards.chat.ts";
import { isApiChatMessage } from "../../_shared/utils/type_guards.ts";
import { TokenUsageSchema } from "../zodSchema.ts";
import type { ConstructMessageHistoryReturn } from "../constructMessageHistory/constructMessageHistory.interface.ts";
import type {
  SseChatCompleteEvent,
  SseChatStartEvent,
  SseContentChunkEvent,
  StreamChatDeps,
  StreamChatError,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
  StreamChatSuccess,
} from "./streamChat.interface.ts";

export async function StreamChat(
  deps: StreamChatDeps,
  params: StreamChatParams,
  payload: StreamChatPayload,
): Promise<StreamChatReturn> {
  const {
    logger,
    adminTokenWalletService,
    countTokens: countTokensFn,
    debitTokens,
    findOrCreateChat,
    constructMessageHistory,
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
    apiKey,
    providerApiIdentifier,
  } = params;
  const { requestBody } = payload;
  const {
    message: userMessageContent,
    providerId: requestProviderId,
    promptId: requestPromptId,
    chatId: existingChatId,
    organizationId,
    selectedMessages,
    rewindFromMessageId,
    max_tokens_to_generate,
  } = requestBody;

  logger.info("Starting SSE streaming chat request processing");

  try {
    let currentChatId = await findOrCreateChat(
      { supabaseClient, logger },
      {
        userId,
        existingChatId,
        organizationId,
        finalSystemPromptIdForDb,
        userMessageContent,
      },
    );

    const historyResult: ConstructMessageHistoryReturn =
      await constructMessageHistory(
        { logger, supabaseClient },
        {
          existingChatId: currentChatId,
          system_prompt_text: actualSystemPromptText,
          rewindFromMessageId,
        },
        {
          newUserMessageContent: userMessageContent,
          selectedMessages,
        },
      );
    let messagesForProvider = historyResult.history;
    let historyFetchError: Error | undefined =
      "historyFetchError" in historyResult
        ? historyResult.historyFetchError
        : undefined;

    if (
      historyFetchError && existingChatId && existingChatId === currentChatId
    ) {
      logger.warn(
        `Error fetching message history for client-provided chatId ${existingChatId}. Creating new chat for streaming.`,
      );

      const newChatIdAfterHistoryError = crypto.randomUUID();
      const { data: newChatData, error: newChatError } = await supabaseClient
        .from("chats")
        .insert({
          id: newChatIdAfterHistoryError,
          user_id: userId,
          organization_id: organizationId || null,
          system_prompt_id: finalSystemPromptIdForDb,
          title: userMessageContent.substring(0, 50),
        })
        .select("id")
        .single();

      if (newChatError || !newChatData) {
        logger.error("Error creating new chat for streaming:", {
          error: newChatError,
        });
        const failure: StreamChatError = new Error(
          "Failed to create new chat session for streaming.",
        );
        return failure;
      }

      currentChatId = newChatIdAfterHistoryError;
      messagesForProvider = [];
      if (actualSystemPromptText) {
        messagesForProvider.push({
          role: "system",
          content: actualSystemPromptText,
        });
      }
      messagesForProvider.push({ role: "user", content: userMessageContent });
      historyFetchError = undefined;
    } else if (historyFetchError) {
      logger.error(
        `Error fetching message history for streaming chat ${currentChatId}:`,
        { error: historyFetchError },
      );
      return new Error(
        `Failed to fetch message history: ${historyFetchError.message}`,
      );
    }

    const tokenizerDeps: CountTokensDeps = {
      getEncoding: (_name: string) => ({
        encode: (input: string) => Array.from(input).map((_, i) => i),
      }),
      countTokensAnthropic: (text: string) => text.length,
      logger: logger,
    };

    const effectiveMessages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = (messagesForProvider || []).filter(
      (m): m is { role: "system" | "user" | "assistant"; content: string } =>
        isApiChatMessage(m) && typeof m.content === "string",
    );

    if (effectiveMessages.length === 0) {
      effectiveMessages.push({ role: "user", content: userMessageContent });
    }

    let maxAllowedOutputTokens: number;
    try {
      if (!modelConfig) {
        logger.error(
          "Critical: modelConfig is null before token counting (streaming path).",
        );
        const failure: StreamChatError = new Error(
          "Internal server error: Provider configuration missing for token calculation.",
        );
        return failure;
      }

      const tokensRequiredForStreaming = await countTokensFn(tokenizerDeps, {
        systemInstruction: actualSystemPromptText || undefined,
        message: userMessageContent,
        messages: effectiveMessages,
        resourceDocuments: requestBody.resourceDocuments,
      }, modelConfig);

      logger.info("Estimated tokens for streaming prompt.", {
        tokensRequiredForStreaming,
        model: providerApiIdentifier,
      });

      if (
        modelConfig.provider_max_input_tokens &&
        tokensRequiredForStreaming > modelConfig.provider_max_input_tokens
      ) {
        logger.warn("Streaming request exceeds provider max input tokens.", {
          tokensRequired: tokensRequiredForStreaming,
          providerMaxInput: modelConfig.provider_max_input_tokens,
          model: providerApiIdentifier,
        });
        const failure: StreamChatError = new Error(
          `Your message is too long for streaming. Maximum: ${modelConfig.provider_max_input_tokens} tokens, actual: ${tokensRequiredForStreaming} tokens.`,
        );
        return failure;
      }

      maxAllowedOutputTokens = getMaxOutputTokens(
        parseFloat(String(wallet.balance)),
        tokensRequiredForStreaming,
        modelConfig,
        logger,
      );

      if (maxAllowedOutputTokens < 1) {
        logger.warn("Insufficient balance for streaming request.", {
          walletId: wallet.walletId,
          balance: wallet.balance,
          estimatedCost: tokensRequiredForStreaming,
          maxAllowedOutput: maxAllowedOutputTokens,
        });
        const failure: StreamChatError = new Error(
          "Insufficient token balance for this streaming request.",
        );
        return failure;
      }
    } catch (e) {
      let errorMessage: string;
      if (e instanceof Error) {
        errorMessage = e.message;
      } else {
        errorMessage = String(e);
      }
      logger.error("Error during token counting for streaming prompt:", {
        error: errorMessage,
        model: providerApiIdentifier,
      });
      const failure: StreamChatError = new Error(
        `Internal server error during token calculation: ${errorMessage}`,
      );
      return failure;
    }

    const userMessageInsert: ChatMessageInsert = {
      chat_id: currentChatId,
      user_id: userId,
      role: "user",
      content: userMessageContent,
      is_active_in_thread: true,
      ai_provider_id: requestProviderId,
      system_prompt_id: finalSystemPromptIdForDb,
    };

    const { data: savedUserMessage, error: userInsertError } =
      await supabaseClient
        .from("chat_messages")
        .insert(userMessageInsert)
        .select()
        .single();

    if (userInsertError || !savedUserMessage) {
      let message: string;
      if (userInsertError) {
        message = userInsertError.message;
      } else {
        message = "Failed to save user message for streaming.";
      }
      logger.error("Failed to save user message for streaming.", {
        error: userInsertError,
      });
      const failure: StreamChatError = new Error(message);
      return failure;
    }

    logger.info(
      `Starting streaming AI request for provider: ${providerApiIdentifier}`,
    );
    if (!apiKey) {
      const message: string =
        `API key for ${providerApiIdentifier} was not resolved before streaming.`;
      logger.error(message);
      const failure: StreamChatError = new Error(message);
      return failure;
    }

    let capFromRequest: number;
    if (max_tokens_to_generate === undefined) {
      capFromRequest = Infinity;
    } else {
      capFromRequest = max_tokens_to_generate;
    }

    const adapterChatRequest: ChatApiRequest = {
      message: userMessageContent,
      messages: effectiveMessages,
      providerId: requestProviderId,
      promptId: requestPromptId,
      chatId: currentChatId,
      organizationId: organizationId,
      max_tokens_to_generate: Math.min(
        capFromRequest,
        maxAllowedOutputTokens,
      ),
      stream: true,
    };

    let adapterResponse: AdapterResponsePayload;
    try {
      adapterResponse = await aiProviderAdapter.sendMessage(
        adapterChatRequest,
        providerApiIdentifier,
      );
    } catch (caught) {
      let message: string;
      if (caught instanceof Error) {
        message = caught.message;
      } else {
        message = String(caught);
      }
      logger.error("Error during SSE streaming:", {
        error: message,
      });
      const failure: StreamChatError = new Error(message);
      return failure;
    }

    let content: string;
    if (
      adapterResponse.content === undefined ||
      adapterResponse.content === null
    ) {
      content = "";
    } else {
      content = adapterResponse.content;
    }

    const chunkSize = 10;
    const assistantMessageId: string = crypto.randomUUID();

    const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(
      adapterResponse.token_usage,
    );
    if (!parsedTokenUsage.success) {
      logger.error(
        "Streaming: Failed to parse token_usage from adapter.",
        { error: parsedTokenUsage.error },
      );
      const failure: StreamChatError = new Error(
        "Invalid token usage data from AI provider.",
      );
      return failure;
    }

    const debitTokensResult = await debitTokens(
      { logger, tokenWalletService: adminTokenWalletService },
      {
        wallet,
        tokenUsage: parsedTokenUsage.data,
        modelConfig,
        userId,
        chatId: currentChatId,
        relatedEntityId: assistantMessageId,
        databaseOperation: async () => {
          const assistantMessageInsert: ChatMessageInsert = {
            id: assistantMessageId,
            chat_id: currentChatId,
            role: "assistant",
            content: content,
            ai_provider_id: adapterResponse.ai_provider_id,
            system_prompt_id: finalSystemPromptIdForDb,
            token_usage: adapterResponse.token_usage,
            is_active_in_thread: true,
            error_type: null,
            response_to_message_id: savedUserMessage.id,
          };

          const { data: insertedAssistantMessage, error: assistantInsertError } =
            await supabaseClient
              .from("chat_messages")
              .insert(assistantMessageInsert)
              .select()
              .single();

          if (assistantInsertError || !insertedAssistantMessage) {
            if (assistantInsertError) {
              throw assistantInsertError;
            }
            throw new Error(
              "Failed to insert assistant message for streaming.",
            );
          }

          return {
            userMessage: savedUserMessage,
            assistantMessage: insertedAssistantMessage,
          };
        },
      },
      {},
    );
    if ("error" in debitTokensResult) {
      const message: string = debitTokensResult.error.message;
      logger.error("Streaming: debitTokens failed.", {
        error: debitTokensResult.error,
      });
      const failure: StreamChatError = new Error(message);
      return failure;
    }

    const assistantMessageForSse = debitTokensResult.result.assistantMessage;
    if (!isChatMessageRow(assistantMessageForSse)) {
      const failure: StreamChatError = new Error(
        "Streaming: persisted assistant message was not a valid chat_messages row.",
      );
      return failure;
    }

    let streamingFinishReason: FinishReason;
    if (adapterResponse.finish_reason === undefined) {
      streamingFinishReason = null;
    } else {
      streamingFinishReason = adapterResponse.finish_reason;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const initData: SseChatStartEvent = {
          type: "chat_start",
          chatId: currentChatId,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initData)}\n\n`),
        );

        for (let i = 0; i < content.length; i += chunkSize) {
          const chunk: string = content.slice(i, i + chunkSize);

          const streamData: SseContentChunkEvent = {
            type: "content_chunk",
            content: chunk,
            assistantMessageId: assistantMessageId,
            timestamp: new Date().toISOString(),
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(streamData)}\n\n`),
          );

          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const completionData: SseChatCompleteEvent = {
          type: "chat_complete",
          assistantMessage: assistantMessageForSse,
          finish_reason: streamingFinishReason,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`),
        );

        controller.close();
        logger.info("SSE streaming completed successfully");
      },
    });

    const success: StreamChatSuccess = new Response(stream, {
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
    return success;
  } catch (err) {
    let errorMessage: string;
    if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }
    logger.error("Unhandled error in streaming normal path:", {
      error: errorMessage,
    });
    const failure: StreamChatError = new Error(errorMessage);
    return failure;
  }
}
