import { ChatMessageRole } from "../../_shared/types.ts";
import { isChatMessageRole } from "../../_shared/utils/type_guards.ts";
import {
  ConstructMessageHistoryDeps,
  ConstructMessageHistoryParams,
  ConstructMessageHistoryPayload,
  ConstructMessageHistoryReturn,
} from "./constructMessageHistory.interface.ts";

export async function constructMessageHistory(
  deps: ConstructMessageHistoryDeps,
  params: ConstructMessageHistoryParams,
  payload: ConstructMessageHistoryPayload,
): Promise<ConstructMessageHistoryReturn> {
  const { logger, supabaseClient } = deps;
  const { existingChatId, system_prompt_text, rewindFromMessageId } = params;
  const { newUserMessageContent, selectedMessages } = payload;

  const history: { role: ChatMessageRole; content: string }[] = [];
  let historyFetchError: Error | undefined = undefined;

  if (system_prompt_text) {
    history.push({ role: "system", content: system_prompt_text });
  }

  if (selectedMessages && selectedMessages.length > 0) {
    logger.info(
      "constructMessageHistory: Using provided selectedMessages for history.",
      { count: selectedMessages.length },
    );
    const formattedSelectedMessages = selectedMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    history.push(...formattedSelectedMessages);
  } else if (existingChatId && !rewindFromMessageId) {
    logger.info(
      `constructMessageHistory: No selectedMessages, fetching history for chatId: ${existingChatId}`,
    );
    const { data: dbMessages, error: dbError } = await supabaseClient
      .from("chat_messages")
      .select("role, content")
      .eq("chat_id", existingChatId)
      .eq("is_active_in_thread", true)
      .order("created_at", { ascending: true });

    if (dbError) {
      logger.error(
        "constructMessageHistory: Error fetching existing chat messages:",
        { error: dbError },
      );
      if (dbError instanceof Error) {
        historyFetchError = dbError;
      } else if (
        dbError !== null &&
        typeof dbError === "object" &&
        "message" in dbError
      ) {
        const msg: unknown = Reflect.get(dbError, "message");
        historyFetchError =
          typeof msg === "string"
            ? new Error(msg)
            : new Error("Error fetching existing chat messages");
      } else {
        historyFetchError = new Error(
          "Error fetching existing chat messages",
        );
      }
    } else if (dbMessages) {
      logger.info(
        `constructMessageHistory: Fetched ${dbMessages.length} messages from DB.`,
      );
      for (const msg of dbMessages) {
        if (
          msg &&
          typeof msg.role === "string" &&
          isChatMessageRole(msg.role) &&
          typeof msg.content === "string"
        ) {
          history.push({
            role: msg.role,
            content: msg.content,
          });
        } else {
          logger.warn(
            "constructMessageHistory: Filtered out invalid message from DB history",
            { problematicMessage: msg },
          );
        }
      }
    }
  } else if (rewindFromMessageId) {
    logger.info(
      "constructMessageHistory: Rewind active, history construction handled by rewind path logic.",
    );
  } else {
    logger.info(
      "constructMessageHistory: No selectedMessages, no existingChatId, and no rewind. History will be minimal.",
    );
  }

  history.push({ role: "user", content: newUserMessageContent });
  logger.info("constructMessageHistory: Final history constructed:", {
    length: history.length,
    lastMessageRole: history[history.length - 1]?.role,
  });

  if (historyFetchError !== undefined) {
    const out: ConstructMessageHistoryReturn = {
      history,
      historyFetchError,
    };
    return out;
  }
  const success: ConstructMessageHistoryReturn = { history };
  return success;
}
