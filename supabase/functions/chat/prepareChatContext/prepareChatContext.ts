import { PostgrestError } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import {
  AiModelExtendedConfig,
  AiProviderAdapterInstance,
  FactoryDependencies,
} from "../../_shared/types.ts";
import { TokenWallet } from "../../_shared/types/tokenWallet.types.ts";
import { Json, Tables } from "../../types_db.ts";
import {
  PrepareChatContextDeps,
  PrepareChatContextError,
  PrepareChatContextParams,
  PrepareChatContextPayload,
  PrepareChatContextReturn,
} from "./prepareChatContext.interface.ts";
import { AiModelExtendedConfigSchema } from "../zodSchema.ts";

export async function prepareChatContext(
  deps: PrepareChatContextDeps,
  params: PrepareChatContextParams,
  payload: PrepareChatContextPayload,
): Promise<PrepareChatContextReturn> {
  const {
    logger,
    userTokenWalletService,
    getAiProviderAdapter: getAiProviderAdapterDep,
    supabaseClient,
  }: PrepareChatContextDeps = deps;
  const { userId }: PrepareChatContextParams = params;
  const { requestBody }: PrepareChatContextPayload = payload;

  const {
    providerId: requestProviderId,
    promptId: requestPromptId,
    walletId: requestWalletId,
    organizationId,
  } = requestBody;

  try {
    const systemPromptDbId: string | null = requestPromptId === "__none__"
      ? null
      : requestPromptId;

    let actualSystemPromptText: string | null = null;
    let finalSystemPromptIdForDb: string | null = null;

    if (systemPromptDbId) {
      const {
        data: promptData,
        error: promptError,
      }: {
        data: Tables<"system_prompts"> | null;
        error: PostgrestError | null;
      } = await supabaseClient
        .from("system_prompts")
        .select("prompt_text, is_active")
        .eq("id", systemPromptDbId)
        .maybeSingle();

      if (promptError) {
        logger.warn("[SystemPromptFetch] Error fetching system_prompt_text.", {
          error: promptError,
        });
      } else if (promptData && promptData.is_active) {
        actualSystemPromptText = promptData.prompt_text;
        finalSystemPromptIdForDb = systemPromptDbId;
      }
    }

    const {
      data: providerData,
      error: providerError,
    }: {
      data: Tables<"ai_providers"> | null;
      error: PostgrestError | null;
    } = await supabaseClient
      .from("ai_providers")
      .select("*")
      .eq("id", requestProviderId)
      .single();

    if (providerError || !providerData) {
      const providerNotFound: PrepareChatContextError = {
        error: {
          message: `Provider with ID ${requestProviderId} not found.`,
          status: 404,
        },
      };
      return providerNotFound;
    }

    if (!providerData.is_active) {
      const inactiveProvider: PrepareChatContextError = {
        error: {
          message: `Provider '${providerData.name}' is currently inactive.`,
          status: 400,
        },
      };
      return inactiveProvider;
    }

    if (!providerData.provider) {
      const invalidProviderName: PrepareChatContextError = {
        error: {
          message:
            `Configuration for provider ID '${requestProviderId}' has an invalid provider name.`,
          status: 500,
        },
      };
      return invalidProviderName;
    }

    const providerApiIdentifier: string = providerData.api_identifier;

    if (providerData.config === null) {
      const missingConfig: PrepareChatContextError = {
        error: {
          message:
            `Provider configuration is missing for provider ID '${requestProviderId}'.`,
          status: 500,
        },
      };
      return missingConfig;
    }

    const providerConfig: Json = providerData.config;

    logger.info(
      `[prepareChatContext] Provider config JSON for ${requestProviderId}:`,
      { config: providerConfig },
    );

    const parsedModelConfig: z.SafeParseReturnType<
      Json,
      AiModelExtendedConfig
    > = AiModelExtendedConfigSchema.safeParse(providerConfig);

    if (!parsedModelConfig.success) {
      const zodError: z.ZodError = parsedModelConfig.error;
      logger.error("Failed to parse provider config from database", {
        error: zodError,
        config: providerConfig,
      });
      const invalidConfig: PrepareChatContextError = {
        error: {
          message:
            `Invalid configuration for provider ID '${requestProviderId}'.`,
          status: 500,
        },
      };
      return invalidConfig;
    }

    const modelConfig: AiModelExtendedConfig = parsedModelConfig.data;

    const apiKeyEnvVarName: string =
      `${providerData.provider.toUpperCase()}_API_KEY`;
    const apiKey: string | undefined = Deno.env.get(apiKeyEnvVarName);
    if (!apiKey) {
      const missingApiKey: PrepareChatContextError = {
        error: {
          message: `API key for ${providerData.provider} is not configured.`,
          status: 500,
        },
      };
      return missingApiKey;
    }

    const factoryDeps: FactoryDependencies = {
      provider: providerData,
      apiKey,
      logger,
    };
    const aiProviderAdapter: AiProviderAdapterInstance | null =
      getAiProviderAdapterDep(factoryDeps);

    if (!aiProviderAdapter) {
      const adapterFailure: PrepareChatContextError = {
        error: {
          message:
            `Unsupported or misconfigured AI provider: ${providerApiIdentifier}`,
          status: 400,
        },
      };
      return adapterFailure;
    }

    let wallet: TokenWallet | null = null;
    try {
      if (requestWalletId) {
        wallet = await userTokenWalletService.getWalletByIdAndUser(
          requestWalletId,
          userId,
        );
        if (!wallet) {
          const walletDenied: PrepareChatContextError = {
            error: {
              message:
                `Token wallet with ID ${requestWalletId} not found or access denied.`,
              status: 403,
            },
          };
          return walletDenied;
        }
      } else {
        wallet = await userTokenWalletService.getWalletForContext(
          userId,
          organizationId,
        );
        if (!wallet) {
          const walletMissingForContext: PrepareChatContextError = {
            error: {
              message:
                "Token wallet not found for your context. Please set up or fund your wallet.",
              status: 402,
            },
          };
          return walletMissingForContext;
        }
      }
    } catch (caught: unknown) {
      if (caught instanceof Error) {
        const walletServiceError: Error = caught;
        logger.error("Error getting token wallet.", {
          error: walletServiceError,
        });
      } else {
        logger.error("Error getting token wallet.", {
          error: caught,
        });
      }
      const walletCheckFailed: PrepareChatContextError = {
        error: {
          message: "Server error during wallet check.",
          status: 500,
        },
      };
      return walletCheckFailed;
    }

    const success: PrepareChatContextReturn = {
      wallet,
      aiProviderAdapter,
      modelConfig,
      actualSystemPromptText,
      finalSystemPromptIdForDb,
      apiKey,
      providerApiIdentifier,
    };
    return success;
  } catch (caught: unknown) {
    if (caught instanceof Error) {
      const unhandledError: Error = caught;
      logger.error("Unhandled error in prepareChatContext:", {
        error: unhandledError.stack,
      });
      const unhandledResponse: PrepareChatContextError = {
        error: { message: unhandledError.message, status: 500 },
      };
      return unhandledResponse;
    }
    logger.error("Unhandled non-Error rejection in prepareChatContext:", {
      error: caught,
    });
    const unhandledNonError: PrepareChatContextError = {
      error: {
        message: "An unexpected error occurred in prepareChatContext.",
        status: 500,
      },
    };
    return unhandledNonError;
  }
}
