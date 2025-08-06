import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../types_db.ts";
import { AiModelExtendedConfig, ChatApiRequest, ChatHandlerDeps, AiProviderAdapterInstance } from "../_shared/types.ts";
import { TokenWallet } from "../_shared/types/tokenWallet.types.ts";
import { AiModelExtendedConfigSchema } from "./zodSchema.ts";

export interface PrepareChatContextDeps extends ChatHandlerDeps {
    supabaseClient: SupabaseClient<Database>;
}

export interface SuccessfulChatContext {
    wallet: TokenWallet;
    aiProviderAdapter: AiProviderAdapterInstance;
    modelConfig: AiModelExtendedConfig;
    actualSystemPromptText: string | null;
    finalSystemPromptIdForDb: string | null;
    apiKey: string;
    providerApiIdentifier: string;
}

export interface PathHandlerContext extends SuccessfulChatContext {
    supabaseClient: SupabaseClient<Database>;
    deps: ChatHandlerDeps;
    userId: string;
    requestBody: ChatApiRequest;
}

export interface ErrorChatContext {
    error: {
        message: string;
        status: number;
    };
}

export type ChatContext = SuccessfulChatContext | ErrorChatContext;

export async function prepareChatContext(
    requestBody: ChatApiRequest,
    userId: string,
    deps: PrepareChatContextDeps
): Promise<ChatContext> {
    const {
        logger,
        tokenWalletService,
        getAiProviderAdapterOverride,
        getAiProviderAdapter: getAiProviderAdapterDep,
        supabaseClient,
    } = deps;

    const {
        providerId: requestProviderId,
        promptId: requestPromptId,
        walletId: requestWalletId,
        organizationId,
    } = requestBody;

    try {
        const systemPromptDbId = requestPromptId === '__none__' ? null : requestPromptId;

        let actualSystemPromptText: string | null = null;
        let finalSystemPromptIdForDb: string | null = null;

        if (systemPromptDbId) {
            const { data: promptData, error: promptError } = await supabaseClient
                .from('system_prompts')
                .select('prompt_text, is_active')
                .eq('id', systemPromptDbId)
                .maybeSingle();

            if (promptError) {
                logger.warn('[SystemPromptFetch] Error fetching system_prompt_text.', { error: promptError });
            } else if (promptData && promptData.is_active) {
                actualSystemPromptText = promptData.prompt_text;
                finalSystemPromptIdForDb = systemPromptDbId;
            }
        }

        const { data: providerData, error: providerError } = await supabaseClient
            .from('ai_providers')
            .select('id, provider, api_identifier, config, is_active, name')
            .eq('id', requestProviderId)
            .single();

        if (providerError || !providerData) {
            return { error: { message: `Provider with ID ${requestProviderId} not found.`, status: 404 } };
        }

        if (!providerData.is_active) {
            return { error: { message: `Provider '${providerData.name}' is currently inactive.`, status: 400 } };
        }
        
        if (!providerData.provider) {
            return { error: { message: `Configuration for provider ID '${requestProviderId}' has an invalid provider name.`, status: 500 } };
        }

        const providerApiIdentifier = providerData.api_identifier;
        
        // This is the correct place to parse the config from the DB
        const parsedModelConfig = AiModelExtendedConfigSchema.safeParse(providerData.config);

        if (!parsedModelConfig.success) {
            logger.error('Failed to parse provider config from database', { 
                error: parsedModelConfig.error, 
                config: providerData.config 
            });
            return { error: { message: `Invalid configuration for provider ID '${requestProviderId}'.`, status: 500 } };
        }
        const modelConfig = parsedModelConfig.data;

        const apiKeyEnvVarName = `${providerData.provider.toUpperCase()}_API_KEY`;
        const apiKey = Deno.env.get(apiKeyEnvVarName);
        if (!apiKey) {
            return { error: { message: `API key for ${providerData.provider} is not configured.`, status: 500 } };
        }

        const adapterToUse = getAiProviderAdapterOverride || getAiProviderAdapterDep;
        // Now we pass the *parsed and validated* modelConfig, satisfying the stricter contract
        const aiProviderAdapter = adapterToUse(
            providerApiIdentifier, 
            modelConfig, 
            apiKey, 
            logger
        );

        if (!aiProviderAdapter) {
            return { error: { message: `Unsupported or misconfigured AI provider: ${providerApiIdentifier}`, status: 400 } };
        }
        
        let wallet: TokenWallet | null = null;
        try {
            if (requestWalletId) {
                wallet = await tokenWalletService!.getWalletByIdAndUser(requestWalletId, userId);
                if (!wallet) {
                    return { error: { message: `Token wallet with ID ${requestWalletId} not found or access denied.`, status: 403 } };
                }
            } else {
                wallet = await tokenWalletService!.getWalletForContext(userId, organizationId);
                if (!wallet) {
                    return { error: { message: 'Token wallet not found for your context. Please set up or fund your wallet.', status: 402 } };
                }
            }
        } catch (walletError) {
            logger.error('Error getting token wallet.', { error: walletError });
            return { error: { message: "Server error during wallet check.", status: 500 } };
        }
        

        return {
            wallet,
            aiProviderAdapter,
            modelConfig,
            actualSystemPromptText,
            finalSystemPromptIdForDb,
            apiKey,
            providerApiIdentifier,
        };

    } catch (err) {
        const typedErr = err instanceof Error ? err : new Error(String(err));
        logger.error('Unhandled error in prepareChatContext:', { error: typedErr.stack });
        return { error: { message: typedErr.message, status: 500 } };
    }
}
