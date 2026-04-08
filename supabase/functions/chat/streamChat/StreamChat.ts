import {
  ChatApiRequest,
  ChatMessageInsert,
} from "../../_shared/types.ts";
import type { CountTokensDeps } from "../../_shared/types/tokenizer.types.ts";
import { isApiChatMessage } from "../../_shared/utils/type_guards.ts";
import { TokenUsageSchema } from "../zodSchema.ts";
import type { ConstructMessageHistoryReturn } from "../constructMessageHistory/constructMessageHistory.interface.ts";
import type {
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
  StreamChatReturn,
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
    createErrorResponse,
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
  const { requestBody, req } = payload;
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
        return createErrorResponse(
          "Failed to create new chat session for streaming.",
          500,
          req,
        );
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
      return createErrorResponse(
        `Failed to fetch message history: ${historyFetchError.message}`,
        500,
        req,
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
        return createErrorResponse(
          "Internal server error: Provider configuration missing for token calculation.",
          500,
          req,
        );
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
        return createErrorResponse(
          `Your message is too long for streaming. Maximum: ${modelConfig.provider_max_input_tokens} tokens, actual: ${tokensRequiredForStreaming} tokens.`,
          413,
          req,
        );
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
        return createErrorResponse(
          "Insufficient token balance for this streaming request.",
          402,
          req,
        );
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error("Error during token counting for streaming prompt:", {
        error: errorMessage,
        model: providerApiIdentifier,
      });
      return createErrorResponse(
        `Internal server error during token calculation: ${errorMessage}`,
        500,
        req,
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const initData = {
            type: "chat_start",
            chatId: currentChatId,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(initData)}\n\n`),
          );

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
            throw userInsertError ||
              new Error("Failed to save user message for streaming.");
          }

          logger.info(
            `Starting streaming AI request for provider: ${providerApiIdentifier}`,
          );
          if (!apiKey) {
            throw new Error(
              `API key for ${providerApiIdentifier} was not resolved before streaming.`,
            );
          }

          const adapterChatRequest: ChatApiRequest = {
            message: userMessageContent,
            messages: effectiveMessages,
            providerId: requestProviderId,
            promptId: requestPromptId,
            chatId: currentChatId,
            organizationId: organizationId,
            max_tokens_to_generate: Math.min(
              max_tokens_to_generate || Infinity,
              maxAllowedOutputTokens,
            ),
            stream: true,
          };

          const adapterResponse = await aiProviderAdapter.sendMessage(
            adapterChatRequest,
            providerApiIdentifier,
          );

          const content = adapterResponse.content || "";
          const chunkSize = 10;
          let assistantContent = "";

          const assistantMessageId = crypto.randomUUID();

          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            assistantContent += chunk;

            const streamData = {
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

          const parsedTokenUsage = TokenUsageSchema.nullable().safeParse(
            adapterResponse.token_usage,
          );
          if (!parsedTokenUsage.success) {
            logger.error(
              "Streaming: Failed to parse token_usage from adapter.",
              { error: parsedTokenUsage.error },
            );
            throw new Error("Invalid token usage data from AI provider.");
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
                  content: assistantContent,
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
                  throw assistantInsertError ||
                    new Error("Failed to insert assistant message for streaming.");
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
            throw debitTokensResult.error;
          }

          const completionData = {
            type: "chat_complete",
            assistantMessage: {
              id: debitTokensResult.result.assistantMessage.id,
              chat_id: debitTokensResult.result.assistantMessage.chat_id,
              user_id: debitTokensResult.result.assistantMessage.user_id,
              role: debitTokensResult.result.assistantMessage.role,
              content: debitTokensResult.result.assistantMessage.content,
              created_at: debitTokensResult.result.assistantMessage.created_at,
              updated_at: debitTokensResult.result.assistantMessage.updated_at,
            },
            finish_reason: adapterResponse.finish_reason,
            timestamp: new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`),
          );

          controller.close();
          logger.info("SSE streaming completed successfully");
        } catch (error) {
          logger.error("Error during SSE streaming:", {
            error: error instanceof Error ? error.message : String(error),
          });

          const errorData = {
            type: "error",
            message: error instanceof Error
              ? error.message
              : "An error occurred during streaming",
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
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("Unhandled error in streaming normal path:", {
      error: errorMessage,
    });
    return createErrorResponse(errorMessage, 500, req);
  }
}
