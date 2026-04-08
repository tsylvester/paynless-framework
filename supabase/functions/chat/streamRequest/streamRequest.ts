import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { ChatApiRequest } from "../../_shared/types.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextParams,
  PrepareChatContextPayload,
  PrepareChatContextReturn,
  PrepareChatContextSuccess,
} from "../prepareChatContext/prepareChatContext.interface.ts";
import {
  StreamChatDeps,
  StreamChatParams,
  StreamChatPayload,
} from "../streamChat/streamChat.interface.ts";
import {
  StreamRewindDeps,
  StreamRewindParams,
  StreamRewindPayload,
} from "../streamRewind/streamRewind.interface.ts";
import { ChatApiRequestSchema } from "../zodSchema.ts";
import {
  StreamRequestDeps,
  StreamRequestParams,
  StreamRequestPayload,
  StreamRequestReturn,
} from "./streamRequest.interface.ts";

export async function streamRequest(
  deps: StreamRequestDeps,
  params: StreamRequestParams,
  payload: StreamRequestPayload,
): Promise<StreamRequestReturn> {
  try {
    let raw: unknown;
    try {
      raw = await payload.req.json();
    } catch {
      return deps.createErrorResponse(
        "Invalid JSON format in request body.",
        400,
        payload.req,
      );
    }

    const parsedResult = ChatApiRequestSchema.safeParse(raw);
    if (!parsedResult.success) {
      const errorMessages: string = parsedResult.error.errors
        .map((e: z.ZodIssue) =>
          `${e.path.join(".") || "body"}: ${e.message}`
        )
        .join(", ");
      return deps.createErrorResponse(
        `Invalid request body: ${errorMessages}`,
        400,
        payload.req,
      );
    }

    const requestBody: ChatApiRequest = parsedResult.data;

    const prepareDeps: PrepareChatContextDeps = {
      logger: deps.logger,
      userTokenWalletService: params.userTokenWalletService,
      getAiProviderAdapter: deps.getAiProviderAdapter,
      supabaseClient: params.supabaseClient,
    };
    const prepareParams: PrepareChatContextParams = {
      userId: params.userId,
    };
    const preparePayload: PrepareChatContextPayload = {
      requestBody,
    };

    const prepareResult: PrepareChatContextReturn =
      await deps.prepareChatContext(
        prepareDeps,
        prepareParams,
        preparePayload,
      );

    if ("error" in prepareResult) {
      return deps.createErrorResponse(
        prepareResult.error.message,
        prepareResult.error.status,
        payload.req,
      );
    }

    const success: PrepareChatContextSuccess = prepareResult;

    const rewindFromMessageId: string | undefined =
      requestBody.rewindFromMessageId;
    if (
      rewindFromMessageId !== undefined &&
      rewindFromMessageId !== ""
    ) {
      const rewindDeps: StreamRewindDeps = {
        logger: deps.logger,
        adminTokenWalletService: deps.adminTokenWalletService,
        countTokens: deps.countTokens,
        debitTokens: deps.debitTokens,
        getMaxOutputTokens: deps.getMaxOutputTokens,
        createErrorResponse: deps.createErrorResponse,
      };
      const rewindParams: StreamRewindParams = {
        supabaseClient: params.supabaseClient,
        userId: params.userId,
        wallet: success.wallet,
        aiProviderAdapter: success.aiProviderAdapter,
        modelConfig: success.modelConfig,
        actualSystemPromptText: success.actualSystemPromptText,
        finalSystemPromptIdForDb: success.finalSystemPromptIdForDb,
      };
      const rewindPayload: StreamRewindPayload = {
        requestBody,
        req: payload.req,
      };
      return await deps.streamRewind(
        rewindDeps,
        rewindParams,
        rewindPayload,
      );
    }

    const chatDeps: StreamChatDeps = {
      logger: deps.logger,
      adminTokenWalletService: deps.adminTokenWalletService,
      countTokens: deps.countTokens,
      debitTokens: deps.debitTokens,
      createErrorResponse: deps.createErrorResponse,
      findOrCreateChat: deps.findOrCreateChat,
      constructMessageHistory: deps.constructMessageHistory,
      getMaxOutputTokens: deps.getMaxOutputTokens,
    };
    const chatParams: StreamChatParams = {
      supabaseClient: params.supabaseClient,
      userId: params.userId,
      wallet: success.wallet,
      aiProviderAdapter: success.aiProviderAdapter,
      modelConfig: success.modelConfig,
      actualSystemPromptText: success.actualSystemPromptText,
      finalSystemPromptIdForDb: success.finalSystemPromptIdForDb,
      apiKey: success.apiKey,
      providerApiIdentifier: success.providerApiIdentifier,
    };
    const chatPayload: StreamChatPayload = {
      requestBody,
      req: payload.req,
    };
    return await deps.streamChat(chatDeps, chatParams, chatPayload);
  } catch (err) {
    const message: string =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred processing the streaming chat request.";
    return deps.createErrorResponse(
      message,
      500,
      payload.req,
    );
  }
}
