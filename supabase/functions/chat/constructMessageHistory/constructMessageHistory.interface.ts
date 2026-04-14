import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ChatApiRequest,
  ChatMessageRole,
  ILogger,
} from "../../_shared/types.ts";
import { Database } from "../../types_db.ts";

export interface ConstructMessageHistoryDeps {
  logger: ILogger;
  supabaseClient: SupabaseClient<Database>;
}

export interface ConstructMessageHistoryParams {
  existingChatId: string | null | undefined;
  system_prompt_text: string | null;
  rewindFromMessageId: string | null | undefined;
}

export interface ConstructMessageHistoryPayload {
  newUserMessageContent: string;
  selectedMessages: ChatApiRequest["selectedMessages"];
}

export interface ConstructMessageHistorySuccess {
  history: { role: ChatMessageRole; content: string }[];
}

export interface ConstructMessageHistoryError {
  history: { role: ChatMessageRole; content: string }[];
  historyFetchError: Error;
}

export type ConstructMessageHistoryReturn =
  | ConstructMessageHistorySuccess
  | ConstructMessageHistoryError;

export type ConstructMessageHistory = (
  deps: ConstructMessageHistoryDeps,
  params: ConstructMessageHistoryParams,
  payload: ConstructMessageHistoryPayload,
) => Promise<ConstructMessageHistoryReturn>;
