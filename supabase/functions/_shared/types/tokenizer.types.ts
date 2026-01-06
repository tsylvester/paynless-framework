import type { Messages, ResourceDocuments, AiModelExtendedConfig } from "../types.ts";

export type CountTokensDeps = {
    getEncoding: (encodingName: string) => { encode: (input: string) => number[] };
    countTokensAnthropic: (text: string) => number;
    logger: { warn: (message: string) => void; error: (message: string) => void };
  };

  export type CountableChatPayload = {
    systemInstruction?: string;
    message?: string;
    messages?: Messages[];
    resourceDocuments?: ResourceDocuments;
  };

  export type CountTokensFn = (
    deps: CountTokensDeps,
    payload: CountableChatPayload,
    modelConfig: AiModelExtendedConfig
  ) => number;