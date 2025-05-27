# AI Model Synchronization (`sync-ai-models`)

This Supabase Edge Function is responsible for synchronizing AI model information from various providers (OpenAI, Anthropic, Google, etc.) with your application's database. It fetches model lists from provider APIs, augments them with default configurations (including token costs and operational parameters), and stores this information in the `ai_providers` table.

## Functionality

1.  **Fetches Models:** For each configured provider, it calls the respective adapter in `supabase/functions/_shared/ai_service/` to get a list of available models.
2.  **Generates Default Configuration:** For each model, it generates a default `AiModelExtendedConfig` (defined in `packages/types/src/ai.types.ts`). This config includes:
    *   `input_token_cost_rate`: Cost per input token.
    *   `output_token_cost_rate`: Cost per output token.
    *   `context_window_tokens`: Maximum context window size.
    *   `hard_cap_output_tokens`: A practical limit on the number of output tokens the application will request, often derived from the provider's max but can be lower.
    *   `tokenization_strategy`: Defines how tokens should be counted for this model (e.g., using `tiktoken` with a specific encoding, a rough character count, or relying on the provider's API).
    *   `provider_max_input_tokens`: Maximum input tokens as specified by the provider (if available from the API).
    *   `provider_max_output_tokens`: Maximum output tokens as specified by the provider (if available from the API).
    Default values, especially costs, are defined in helper functions within each provider-specific sync file (e.g., `createDefaultOpenAIConfig` in `openai_sync.ts`).
3.  **Database Operations:**
    *   **Inserts New Models:** If a model from the API doesn't exist in the `ai_providers` table, it's inserted along with its generated `config`.
    *   **Updates Existing Models:** If a model exists, its `name`, `description`, and `config` are updated. The update logic for `config` is designed to:
        *   Merge new default values (e.g., if our cost information is updated in the code).
        *   Incorporate values fetched directly from the provider's API via the adapter (e.g., `provider_max_input_tokens`).
        *   **Preserve Manual Overrides:** Critically, if a user has manually modified fields within the `config` JSONB column in the database (e.g., to set a custom cost rate or a lower `hard_cap_output_tokens`), these manual changes are generally preserved unless the underlying provider API data for a field like `provider_max_output_tokens` changes, which might then also adjust our `hard_cap_output_tokens` if it was previously based on that provider limit.
    *   **Deactivates Missing Models:** Models present in the database but no longer reported by the provider's API are marked as `is_active = false`.

## `config` JSONB Column

The `ai_providers.config` column (type `JSONB`) is central to this system. It stores the `AiModelExtendedConfig` for each model. Example structure:

```json
{
  "input_token_cost_rate": 0.0000005, // Cost per single input token
  "output_token_cost_rate": 0.0000015, // Cost per single output token
  "context_window_tokens": 16385,
  "hard_cap_output_tokens": 4096,     // App-level max generation limit for this model
  "tokenization_strategy": {
    "type": "tiktoken",
    "tiktoken_encoding_name": "cl100k_base",
    "is_chatml_model": true,
    "api_identifier_for_tokenization": "gpt-3.5-turbo-0125" // Model ID for tiktoken library
  },
  "provider_max_input_tokens": 16385,  // Max input from provider API
  "provider_max_output_tokens": 4096    // Max output from provider API
}
```

### Important Notes on `config`:

*   **Cost Rates:** `input_token_cost_rate` and `output_token_cost_rate` are per *single token*. Pricing from providers is often given per 1,000 or 1 million tokens; ensure these are converted correctly in the `createDefault...Config` helper functions.
*   **Manual Updates:** Token costs and other parameters can change. While this sync function provides defaults, **it is crucial to verify and manually update the `config` field in the `ai_providers` table directly in your Supabase database if the defaults are incorrect or outdated.** The sync process will respect most manual changes.
*   **Tokenization:** The `tokenization_strategy` tells other parts of the application (e.g., `packages/utils/src/tokenCostUtils.ts`) how to estimate token counts for prompts.

## Configuration

### API Keys

This function requires API keys for each provider it syncs. These keys must be set as environment variables in your Supabase project's Edge Function settings:

*   `OPENAI_API_KEY`
*   `ANTHROPIC_API_KEY`
*   `GOOGLE_API_KEY`
*   *(Add others as new providers are integrated)*

If a key is missing, the sync for that provider will be skipped.

### Adding a New Provider

1.  **Create an Adapter:** Follow the instructions in `supabase/functions/_shared/ai_service/README.md` to create an adapter for the new provider.
2.  **Create a Sync File:** In this directory (`sync-ai-models`), create a new file (e.g., `newprovider_sync.ts`).
    *   Import `AiModelExtendedConfig` and other necessary types.
    *   Implement a `createDefaultNewProviderConfig(modelApiIdentifier: string): AiModelExtendedConfig` function to set default costs, tokenization, etc.
    *   Implement a `syncNewProviderModels(...)` function, using `openai_sync.ts` or `anthropic_sync.ts` as a template. This function will handle fetching models via the adapter, merging configs, and preparing DB operations.
3.  **Integrate into Main Sync Logic (`index.ts`):
    *   Import your new `syncNewProviderModels` function into `supabase/functions/sync-ai-models/index.ts`.
    *   Add it to the `PROVIDER_SYNC_FUNCTIONS` map, associating it with the provider's name (e.g., `'newprovider': syncNewProviderModels`).
    *   Ensure the new API key (e.g., `NEWPROVIDER_API_KEY`) is documented here and users know to set it.

## Invoking the Function

This function is designed to be invoked manually or on a schedule.

*   **Manual Invocation:** You can invoke it via the Supabase Dashboard (Edge Functions > sync-ai-models > Invoke) or using a cURL command against its HTTP endpoint.
    ```bash
    curl -X POST \
      'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/sync-ai-models' \
      -H 'Authorization: Bearer <YOUR_SERVICE_ROLE_KEY>' \
      -H 'Content-Type: application/json' \
      -d '{}'
    ```
    (Replace placeholders. Using the `service_role_key` is recommended for admin tasks.)
*   **Scheduled Invocation:** You can set up a cron job (e.g., using Supabase's built-in pg_cron or an external scheduler) to call this function periodically to keep model data fresh.

Regularly running this function ensures your application has the latest list of models and up-to-date (default) configurations. Remember to manually verify and adjust costs in the database as needed. 