import { assertEquals } from "jsr:@std/assert@0.225.3";
import { ChatApiRequest } from "../../_shared/types.ts";
import {
  buildContractPrepareChatContextPayload,
  buildContractPrepareChatContextSuccess,
  createMockPrepareChatContext,
} from "../prepareChatContext/prepareChatContext.mock.ts";
import { streamRequest } from "./streamRequest.ts";
import { StreamRequestPayload } from "./streamRequest.interface.ts";
import {
  buildContractStreamRequestPostRequest,
  buildStreamRequestDepsWithPathHandlers,
  buildStreamRequestUnitNormalPayload,
  buildStreamRequestUnitParams,
  createRecordingStreamChat,
  createRecordingStreamRewind,
  createThrowingPrepareChatContext,
  STREAM_REQUEST_UNIT_REWIND_MSG_ID,
} from "./streamRequest.mock.ts";

Deno.test(
  "streamRequest normal request req body has no rewindFromMessageId parses req.json calls streamChat with StreamChatPayload requestBody and req same as payload.req",
  async () => {
    const prepareSuccess = buildContractPrepareChatContextSuccess();
    const prepareChatContext = createMockPrepareChatContext({
      returnValue: prepareSuccess,
    });
    const { streamChat, getLastCall } = createRecordingStreamChat();
    const { streamRewind, getLastCall: getRewindLastCall } =
      createRecordingStreamRewind();
    const deps = buildStreamRequestDepsWithPathHandlers({
      prepareChatContext,
      streamChat,
      streamRewind,
    });
    const params = buildStreamRequestUnitParams();
    const requestBody: ChatApiRequest = buildContractPrepareChatContextPayload();
    const req: Request = buildContractStreamRequestPostRequest(requestBody);
    const payload: StreamRequestPayload = { req };

    assertEquals(Object.hasOwn(requestBody, "rewindFromMessageId"), false);

    await streamRequest(deps, params, payload);

    const chatCall = getLastCall();
    assertEquals(chatCall !== null, true);
    if (chatCall !== null) {
      assertEquals(chatCall.deps.logger, deps.logger);
      assertEquals(
        chatCall.deps.adminTokenWalletService,
        deps.adminTokenWalletService,
      );
      assertEquals(chatCall.deps.countTokens, deps.countTokens);
      assertEquals(chatCall.deps.debitTokens, deps.debitTokens);
      assertEquals(chatCall.deps.createErrorResponse, deps.createErrorResponse);
      assertEquals(chatCall.deps.findOrCreateChat, deps.findOrCreateChat);
      assertEquals(
        chatCall.deps.constructMessageHistory,
        deps.constructMessageHistory,
      );
      assertEquals(chatCall.deps.getMaxOutputTokens, deps.getMaxOutputTokens);
      assertEquals(chatCall.params.supabaseClient, params.supabaseClient);
      assertEquals(chatCall.params.userId, params.userId);
      assertEquals(chatCall.params.wallet.walletId, prepareSuccess.wallet.walletId);
      assertEquals(
        chatCall.params.aiProviderAdapter,
        prepareSuccess.aiProviderAdapter,
      );
      assertEquals(
        chatCall.params.modelConfig.api_identifier,
        prepareSuccess.modelConfig.api_identifier,
      );
      assertEquals(
        chatCall.params.actualSystemPromptText,
        prepareSuccess.actualSystemPromptText,
      );
      assertEquals(
        chatCall.params.finalSystemPromptIdForDb,
        prepareSuccess.finalSystemPromptIdForDb,
      );
      assertEquals(chatCall.params.apiKey, prepareSuccess.apiKey);
      assertEquals(
        chatCall.params.providerApiIdentifier,
        prepareSuccess.providerApiIdentifier,
      );
      assertEquals(chatCall.payload.requestBody, requestBody);
      assertEquals(chatCall.payload.req, payload.req);
    }
    assertEquals(getRewindLastCall() === null, true);
  },
);

Deno.test(
  "streamRequest rewind request req body has rewindFromMessageId parses req.json calls streamRewind with StreamRewindPayload requestBody and req same as payload.req",
  async () => {
    const prepareSuccess = buildContractPrepareChatContextSuccess();
    const prepareChatContext = createMockPrepareChatContext({
      returnValue: prepareSuccess,
    });
    const { streamChat, getLastCall: getChatLastCall } =
      createRecordingStreamChat();
    const { streamRewind, getLastCall } = createRecordingStreamRewind();
    const deps = buildStreamRequestDepsWithPathHandlers({
      prepareChatContext,
      streamChat,
      streamRewind,
    });
    const params = buildStreamRequestUnitParams();
    const requestBody: ChatApiRequest = {
      ...buildContractPrepareChatContextPayload(),
      rewindFromMessageId: STREAM_REQUEST_UNIT_REWIND_MSG_ID,
    };
    const req: Request = buildContractStreamRequestPostRequest(requestBody);
    const payload: StreamRequestPayload = { req };

    assertEquals(
      requestBody.rewindFromMessageId,
      STREAM_REQUEST_UNIT_REWIND_MSG_ID,
    );

    await streamRequest(deps, params, payload);

    const rewindCall = getLastCall();
    assertEquals(rewindCall !== null, true);
    if (rewindCall !== null) {
      assertEquals(rewindCall.deps.logger, deps.logger);
      assertEquals(
        rewindCall.deps.adminTokenWalletService,
        deps.adminTokenWalletService,
      );
      assertEquals(rewindCall.deps.countTokens, deps.countTokens);
      assertEquals(rewindCall.deps.debitTokens, deps.debitTokens);
      assertEquals(
        rewindCall.deps.getMaxOutputTokens,
        deps.getMaxOutputTokens,
      );
      assertEquals(
        rewindCall.deps.createErrorResponse,
        deps.createErrorResponse,
      );
      assertEquals(rewindCall.params.supabaseClient, params.supabaseClient);
      assertEquals(rewindCall.params.userId, params.userId);
      assertEquals(
        rewindCall.params.wallet.walletId,
        prepareSuccess.wallet.walletId,
      );
      assertEquals(
        rewindCall.params.aiProviderAdapter,
        prepareSuccess.aiProviderAdapter,
      );
      assertEquals(
        rewindCall.params.modelConfig.api_identifier,
        prepareSuccess.modelConfig.api_identifier,
      );
      assertEquals(
        rewindCall.params.actualSystemPromptText,
        prepareSuccess.actualSystemPromptText,
      );
      assertEquals(
        rewindCall.params.finalSystemPromptIdForDb,
        prepareSuccess.finalSystemPromptIdForDb,
      );
      assertEquals(rewindCall.payload.requestBody, requestBody);
      assertEquals(rewindCall.payload.req, payload.req);
    }
    assertEquals(getChatLastCall() === null, true);
  },
);

Deno.test(
  "streamRequest returns error Response with status from PrepareChatContextError",
  async () => {
    const prepareChatContext = createMockPrepareChatContext({
      returnValue: {
        error: { message: "stream-request-unit prepare error", status: 418 },
      },
    });
    const { streamChat, getLastCall } = createRecordingStreamChat();
    const { streamRewind } = createRecordingStreamRewind();
    const deps = buildStreamRequestDepsWithPathHandlers({
      prepareChatContext,
      streamChat,
      streamRewind,
    });
    const params = buildStreamRequestUnitParams();
    const payload = buildStreamRequestUnitNormalPayload();

    const out = await streamRequest(deps, params, payload);

    assertEquals(out instanceof Response, true);
    if (out instanceof Response) {
      assertEquals(out.status, 418);
    }
    assertEquals(getLastCall() === null, true);
  },
);

Deno.test(
  "streamRequest returns 500 Response when prepareChatContext throws",
  async () => {
    const prepareChatContext = createThrowingPrepareChatContext();
    const { streamChat, getLastCall } = createRecordingStreamChat();
    const { streamRewind } = createRecordingStreamRewind();
    const deps = buildStreamRequestDepsWithPathHandlers({
      prepareChatContext,
      streamChat,
      streamRewind,
    });
    const params = buildStreamRequestUnitParams();
    const payload = buildStreamRequestUnitNormalPayload();

    const out = await streamRequest(deps, params, payload);

    assertEquals(out instanceof Response, true);
    if (out instanceof Response) {
      assertEquals(out.status, 500);
    }
    assertEquals(getLastCall() === null, true);
  },
);
