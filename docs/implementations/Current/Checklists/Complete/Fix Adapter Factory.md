# Fix Adapter Factory

The ai_service adapters do not have a common contract with the factory for how they are built and used. The factory will be refactored to use a single fixed contract for adapter construction and operation. The test suites will be completely aligned to ensure all adapters interactions with the app are abstract and identical.  

This document provides a complete, verified, and end-to-end refactoring to ensure that the ai_service establishes a fixed contract between the factory and adapters and all adapters pass the same suite of tests.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition in `interface.ts`, implementation in `adapter.ts`, and mocks in `mocks.ts`)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, reducers/slices, selectors, and mocks)
*   `[UI]` Frontend Component (e.g., in `apps/web`, following component structure rules)
*   `[CLI]` Command Line Interface component/feature
*   `[IDE]` IDE Plugin component/feature
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update (API-Backend, Store-Component, RLS)
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update (READMEs, API docs, user guides)
*   `[REFACTOR]` Code Refactoring Step
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.

---

## Phase 1: Establish a Unified Adapter Contract

*   `[✅]` 1. **[REFACTOR]** Solidify the Adapter Interface Contract.
    *   `[✅]` 1.a. **[BE]** In `supabase/functions/_shared/types.ts`, update the `AiProviderAdapter` interface. Remove the `apiKey` parameter from the `sendMessage` and `listModels` method signatures. The `apiKey` will become a constructor-only dependency.
    *   `[✅]` 1.b. **[BE]** In `supabase/functions/_shared/types.ts`, create a new `AiAdapterOptions` interface to define the standard constructor arguments for all adapters.
        ```typescript
        export type AiProviderAdapter = new (
        apiKey: string,
        logger: ILogger,
        modelConfig: AiModelExtendedConfig
        ) => {
        sendMessage(
            request: ChatApiRequest,
            modelIdentifier: string, // The specific API identifier for the model (e.g., 'gpt-4o')
        ): Promise<AdapterResponsePayload>;

        listModels(): Promise<ProviderModelInfo[]>;
        };
        ```

## Phase 2: Refactor Factory and Adapters to Adhere to the Contract

*   `[✅]` 2. **[REFACTOR]** Refactor the AI Provider Factory.
    *   `[✅]` 2.a. **[BE]** In `supabase/functions/_shared/ai_service/factory.ts`, rewrite the `getAiProviderAdapter` function to use a provider-to-class map, making it generic and easily extensible.
    *   `[✅]` 2.b. **[BE]** Ensure the factory creates and passes the `AiAdapterOptions` object, including the `providerDbConfig`, to the constructor of the selected adapter class.

*   `[✅]` 3. **[REFACTOR]** Refactor all AI Provider Adapters.
    *   `[✅]` 3.a. **OpenAI Adapter**
        *   `[✅]` 3.a.i. **[BE]** In `openai_adapter.ts`, update the constructor to accept a single `options: AiAdapterOptions` argument.
        *   `[✅]` 3.a.ii. **[BE]** Refactor internal logic to use `this.modelConfig` for all configuration needs (e.g., token limits).
        *   `[✅]` 3.a.iii. **[BE]** Update method signatures to match the revised `AiProviderAdapter` interface.
    *   `[✅]` 3.b. **Anthropic Adapter**
        *   `[✅]` 3.b.i. **[BE]** In `anthropic_adapter.ts`, update the constructor to accept a single `options: AiAdapterOptions` argument.
        *   `[✅]` 3.b.ii. **[BE]** Refactor internal logic to use `this.modelConfig`.
        *   `[✅]` 3.b.iii. **[BE]** Update method signatures.
    *   `[✅]` 3.c. **Google Adapter**
        *   `[✅]` 3.c.i. **[BE]** In `google_adapter.ts`, update the constructor to accept a single `options: AiAdapterOptions` argument.
        *   `[✅]` 3.c.ii. **[BE]** Refactor internal logic to use `this.modelConfig`.
        *   `[✅]` 3.c.iii. **[BE]** Update method signatures.
    *   `[✅]` 3.d. **Dummy Adapter**
        *   `[✅]` 3.d.i. **[BE]** In `dummy_adapter.ts`, update the constructor to accept `options: AiAdapterOptions`.
        *   `[✅]` 3.d.ii. **[BE]** Update method signatures.

## Phase 3: Unify and Standardize Test Suites

*   `[✅]` 4. **[TEST-UNIT]** Create a Shared Adapter Test Suite.
    *   `[✅]` 4.a. **[BE]** Create a new file `supabase/functions/_shared/ai_service/adapter_test_contract.ts`.
    *   `[✅]` 4.b. **[BE]** In this file, implement a generic testing function. Its signature will be `testAdapterContract(adapterClass: AiProviderAdapterClass, mockProviderApi: MockApi, providerModelConfig: AiModelExtendedConfig)`. It will accept a provider-specific model configuration to ensure that it tests the adapter using a realistic tokenization strategy, not a generic or non-functional one. This function will run a standardized suite of Deno tests against any adapter that adheres to the contract.
    *   `[✅]` 4.c. **[BE]** The contract tests will include:
        *   Successful instantiation with valid `AiAdapterOptions`.
        *   **Message Construction & Tokenization:**
            *   `sendMessage` correctly combines message history and the new user message into the final payload.
            *   `sendMessage` correctly handles provider-specific message structuring (e.g., system prompts, alternating roles).
            *   `sendMessage` prevents message duplication when the same content exists in history and the new message.
            *   `sendMessage` respects the `max_tokens_to_generate` property from the `ChatApiRequest`, passing it to the provider.
            *   `sendMessage` throws a critical error if the token count of the final, constructed prompt payload (including all message history, system prompts, and the current user message) exceeds the `context_window_tokens` or `provider_max_input_tokens` from `modelConfig`. It does NOT truncate content.
        *   **Response Handling & Error States:**
            *   `sendMessage` success case (happy path), returning a valid `AdapterResponsePayload`.
            *   `sendMessage` handling of API errors (4xx, 5xx) and returning a standardized error.
            *   `sendMessage` handling of empty or invalid provider responses.
            *   `sendMessage` correctly maps provider-specific `finish_reason` (e.g., `max_tokens`, `stop_sequence`) to our standard reasons (`'length'`, `'stop'`).
            *   `sendMessage` respects `hard_cap_output_tokens` from `modelConfig` (if applicable at the adapter level).
        *   **Model Listing:**
            *   `listModels` success case, returning a valid `ProviderModelInfo[]`.
            *   `listModels` handling of API errors.

*   `[✅]` 5. **[TEST-UNIT]** Refactor Existing Adapter Tests.
    *   `[✅]` 5.a. **OpenAI Tests**
        *   `[✅]` 5.a.i. **[TEST-UNIT]** In `openai_adapter.test.ts`, remove all tests now covered by the shared contract.
        *   `[✅]` 5.a.ii. **[TEST-UNIT]** Import and use `testAdapterContract`, providing a mocked OpenAI API implementation.
        *   `[✅]` 5.a.iii. **[TEST-UNIT]** Retain only tests specific to OpenAI's unique payload formatting.
    *   `[✅]` 5.b. **Anthropic Tests**
        *   `[✅]` 5.b.i. **[TEST-UNIT]** In `anthropic_adapter.test.ts`, remove tests covered by the shared contract.
        *   `[✅]` 5.b.ii. **[TEST-UNIT]** Use `testAdapterContract` with a mocked Anthropic API.
        *   `[✅]` 5.b.iii. **[TEST-UNIT]** Retain tests for Anthropic-specific logic (e.g., alternating role filtering).
    *   `[✅]` 5.c. **Google Tests**
        *   `[✅]` 5.c.i. **[TEST-UNIT]** In `google_adapter.test.ts`, remove tests covered by the shared contract.
        *   `[✅]` 5.c.ii. **[TEST-UNIT]** Use `testAdapterContract` with a mocked Google API (`fetch`).
        *   `[✅]` 5.c.iii. **[TEST-UNIT]** Retain tests for Google-specific logic (e.g., system prompt prepending, `getModelDetails`).
    *   `[✅]` 5.d. **Dummy Adapter Tests**
        *   `[✅]` 5.d.i. **[BE]** First, refactor the `DummyAdapter` itself. It must import and use the application's shared `countTokens` utility to calculate its `token_usage` based on the echoed message content. It must not hardcode token values or use a bespoke counting method.
        *   `[✅]` 5.d.ii. **[TEST-UNIT]** In `dummy_adapter.test.ts`, refactor the test to use the `testAdapterContract`.
        *   `[✅]` 5.d.iii. **[TEST-UNIT]** The test **must not** mock the global `fetch` function, as the `DummyAdapter` does not perform external communication.
        *   `[✅]` 5.d.iv. **[TEST-UNIT]** The `MockApi` implementation for the dummy test will be a simple pass-through that instantiates the real `DummyAdapter` and calls its methods directly.
        *   `[✅]` 5.d.v. **[TEST-UNIT]** Add a separate, specific test case within `dummy_adapter.test.ts` to verify its unique tokenization behavior. This test will call `sendMessage` and then independently use `countTokens` to assert that the token counts returned by the adapter are correct.

## Phase 4: Documentation and Finalization

*   `[✅]` 6. **[DOCS]** Update Documentation.
    *   `[✅]` 6.a. **[DOCS]** Update `supabase/functions/_shared/ai_service/README.md` to reflect the new, unified factory and adapter contract. Detail the new process for adding a provider.

*   `[✅]` 7. **[COMMIT]** Final Commit.
    *   `[✅]` 7.a. Commit all changes with the message `feat: unify AI adapter factory and contracts`.

---

## Phase 5: Correct AI Model Discovery and Synchronization

This phase focuses on fixing the root cause: the failure to sync embedding models from the provider into our database.

*   `[✅]` 8. **[REFACTOR]** Update the OpenAI Adapter to Discover Embedding Models.
    *   `[✅]` 8.a. **[BE]** In `supabase/functions/_shared/ai_service/openai_adapter.ts`, modify the `listModels` function to include `"embedding"` in its model ID filter. This will allow the sync script to see these models.
        *   **Current:** `if (model.id && (model.id.includes('gpt') || model.id.includes('instruct')))`
        *   **Proposed:** `if (model.id && (model.id.includes('gpt') || model.id.includes('instruct') || model.id.includes('embedding')))`

*   `[ ]` 9. **[REFACTOR]** Implement a Modular, Self-Updating, Two-Pass Configuration System.
    *   This step refactors the model synchronization process by abstracting the core logic into a shared, reusable utility. This makes the system more modular, testable, and resilient.
    *   `[✅]` 9.a. **[BE]** **Create a Generic `ConfigAssembler` Utility.**
        *   `[✅]` 9.a.i. **[BE]** Create a new file `supabase/functions/sync-ai-models/config_assembler.ts`.
        *   `[✅]` 9.a.ii. **[BE]** This utility will encapsulate the entire two-pass configuration process, accepting provider-specific data and orchestrating the assembly. The following steps detail the internal logic of this assembler.
    *   `[✅]` 9.b. **[BE]** **Initial Data Fetch & Preparation (within Assembler).**
        *   `[✅]` 9.b.i. **[BE]** The assembler will be initiated with a complete list of all available models for a given provider.
        *   `[✅]` 9.b.ii. **[BE]** It will create a temporary in-memory collection to hold the configuration-in-progress for each of these models.
    *   `[✅]` 9.c. **[BE]** **Pass 1: Configuration Assembly from Authoritative Tiers (within Assembler).**
        *   `[✅]` 9.c.i. **[BE]** The assembler will iterate through every model. For each model, it will attempt to build its configuration by filling in each required parameter (`input_token_cost_rate`, `context_window_tokens`, etc.) using an **element-wise cascade** through a hierarchy of data sources.
        *   `[✅]` 9.c.ii. **[BE]** **Tier 1 (Live API):** First, attempt to get the value from the data returned by the adapter for the specific model.
        *   `[✅]` 9.c.iii. **[BE]** **Tier 2 (External Source):** If unavailable, attempt to get the value from a trusted external database (e.g., a known npm package whose maintainers provide these details for consumers).
        *   `[✅]` 9.c.iv. **[BE]** **Tier 3 (Internal Map):** If still unavailable, attempt to get the value from our own hardcoded `modelInfo` map, which serves as a failsafe. This map file will be updated with final values from each model configured at each run so that the map is always up to date.
        *   `[✅]` 9.c.v. **[BE]** At the end of this pass, the assembler will categorize models into `fullyConfiguredModels` and `modelsNeedingDefaults`.
    *   `[✅]` 9.d. **[BE]** **Dynamic Default Calculation (within Assembler).**
        *   `[✅]` 9.d.i. **[BE]** The assembler will use the `fullyConfiguredModels` list as the dataset for calculating dynamic defaults.
        *   `[✅]` 9.d.ii. **[BE]** **Cost Default (High-Water Mark):** Calculated as the absolute maximum known input/output costs from the `fullyConfiguredModels` set.
        *   `[✅]` 9.d.iii. **[BE]** **Window Default (Dynamic Cohort Average):** Calculated by averaging window sizes from a dynamic sample of the most recent models. The sample size (`k`) will equal the number of new/unknown models (min 3).
        *   `[✅]` 9.d.iv. **[BE]** An absolute, hardcoded "panic" value will be used as a failsafe if the `fullyConfiguredModels` list is empty.
    *   `[✅]` 9.e. **[BE]** **Pass 2: Application of Defaults (within Assembler).**
        *   `[✅]` 9.e.i. **[BE]** The assembler will iterate through `modelsNeedingDefaults` and fill in any missing parameters using the dynamic defaults.
    *   `[✅]` 9.f. **[BE]** **Refactor Provider Sync Scripts to Use the Assembler.**
        *   `[✅]` 9.f.i. **[BE]** Refactor `openai_sync.ts`, `google_sync.ts`, and `anthropic_sync.ts`.
        *   `[✅]` 9.f.ii. **[BE]** Each script's responsibility will be simplified to: gathering its specific data, calling the `ConfigAssembler`, and then performing the final database diff and update operations with the result.
    *   `[✅]` 9.g. **[TEST-UNIT]** **Standardize Sync Function Test Suites with a Shared Contract.**
    *   This step establishes a unified testing framework for all AI model synchronization functions (`syncGoogleModels`, `syncOpenAIModels`, etc.) to ensure consistent behavior, eliminate test drift, and reduce code duplication. It follows the successful pattern established by `adapter_test_contract.ts`.
    *   `[✅]` 9.g.i. **[TEST-UNIT]** **Create the Test Contract File and `MockProviderData` Interface.**
        *   `[✅]` 9.g.i.1. **[TEST-UNIT]** Create a new file named `supabase/functions/sync-ai-models/sync_test_contract.ts`. This file will house the shared testing logic.
        *   `[✅]` 9.g.i.2. **[TEST-UNIT]** Within the new file, define and export a `MockProviderData` interface. This interface serves as a contract for the data each provider-specific test must supply. It standardizes the inputs for the generic tests, abstracting away provider-specific details.
            ```typescript
            export interface MockProviderData {
              // Provides a list of models as they would come from the provider's API.
              apiModels: ProviderModelInfo[];
            
              // Provides a representative DB model that matches an API model,
              // including a fully-formed config object. Crucial for the "no changes needed" test.
              dbModel: DbAiProvider;
            
              // Provides a DB model that is stale (not in the API list) and should be deactivated.
              staleDbModel: DbAiProvider;
            
              // Provides an inactive DB model that should be reactivated because it appears in the API list.
              inactiveDbModel: DbAiProvider;
              
              // Provides an API model that corresponds to the inactiveDbModel to trigger reactivation.
              reactivateApiModel: ProviderModelInfo;
            
              // Provides a new model found in the API list but not the DB, to test insertion.
              newApiModel: ProviderModelInfo;
            }
            ```
    *   `[✅]` 9.g.ii. **[TEST-UNIT]** **Implement the Generic `testSyncContract` Function.**
        *   `[✅]` 9.g.ii.1. **[TEST-UNIT]** In `sync_test_contract.ts`, create and export an async function: `testSyncContract(t: Deno.TestContext, syncFunction: Function, mockProviderData: MockProviderData, providerName: string)`.
        *   `[✅]` 9.g.ii.2. **[TEST-UNIT]** Port the core test cases from `openai_sync.test.ts` (as it is the most complete suite) into this function. Each test will be generic and use the `mockProviderData` object for its inputs. The standard suite must include:
            *   `should insert new models when DB is empty`: Verifies that models from the API are correctly inserted when no corresponding models exist in the database.
            *   `should do nothing if API and DB models match`: The critical test to ensure that when the assembled configuration and the database record are identical, no unnecessary write operations occur.
            *   `should deactivate stale models`: Confirms that models existing in the database but not present in the latest API fetch are marked as inactive.
            *   `should reactivate an inactive model if it reappears in API`: Checks that a model previously marked inactive is correctly updated to `is_active: true` if it's found in the API model list again.
            *   `should update an existing model if its configuration changes`: Verifies that changes to properties like `name`, `description`, or any `config` field trigger an update operation.
            *   `should handle errors from the listProviderModels function`: Ensures the sync process fails gracefully if the initial API call for models fails.
            *   `should handle database errors`: Confirms that errors during `insert`, `update`, or `deactivate` operations are caught and reported correctly.
    *   `[✅]` 9.g.iii. **[TEST-UNIT]** **Refactor Provider-Specific Test Suites to Use the Contract.**
        *   `[✅]` 9.g.iii.1. **[TEST-UNIT]** **Refactor `openai_sync.test.ts`**:
            *   Delete all generic test steps that are now covered by the `testSyncContract`.
            *   Create a `mockOpenAIData: MockProviderData` object containing valid, OpenAI-specific mock data.
            *   The main test body will now be a single call: `await testSyncContract(t, syncOpenAIModels, mockOpenAIData, 'openai');`.
        *   `[✅]` 9.g.iii.2. **[TEST-UNIT]** **Refactor `google_sync.test.ts`**:
            *   Delete all generic test steps.
            *   Create a `mockGoogleData: MockProviderData` object with Google-specific mock models and configurations.
            *   The main test body will be a call to `await testSyncContract(t, syncGoogleModels, mockGoogleData, 'google');`.
        *   `[✅]` 9.g.iii.3. **[TEST-UNIT]** **Refactor `anthropic_sync.test.ts`**:
            *   Delete all generic test steps, adding the missing "no-op" and other standard cases via the contract.
            *   Create a `mockAnthropicData: MockProviderData` object.
            *   The main test body will be a call to `await testSyncContract(t, syncAnthropicModels, mockAnthropicData, 'anthropic');`.

*   `[✅]` 10. **[OPS]** Execute the Sync Process and Update Seed Data.
    *   `[✅]` 10.a. **[OPS]** Run the `sync-ai-models` Edge Function to populate the local database using the new resilient sync logic.
    *   `[✅]` 10.b. **[DB]** After the sync is successful, update the `supabase/seed.sql` file from the database to include the new and correctly configured model entries.

## Phase 6: Refactor Application Code to Use Synced Configuration

This phase focuses on fixing the application code that broke due to the missing model configurations.

*   `[✅]` 11. **[REFACTOR]** Update `startSession` to Use a Valid Embedding Model.
    *   `[✅]` 11.a. **[BE]** In `supabase/functions/dialectic-service/startSession.ts`, change the hardcoded database query for `text-embedding-ada-002` to query for a valid, synced embedding model, such as `'openai-text-embedding-3-small'`.
    *   `[✅]` 11.b. **[TEST-INT]** Review `dialectic_pipeline.integration.test.ts` to ensure that if it mocks the `ai_providers` table, the mock data includes a valid embedding model to prevent the test from failing for the same reason as the e2e test.

*   `[✅]` 12. **[REFACTOR]** Update `OpenAiAdapter` to Use Provided Configuration.
    *   `[✅]` 12.a. **[BE]** In `supabase/functions/_shared/ai_service/openai_adapter.ts`, refactor the `getEmbedding` method. It must use the `api_identifier` from `this.modelConfig` instead of its own hardcoded default parameter.
    *   `[✅]` 12.b. **[TEST-UNIT]** Update `openai_adapter.test.ts` to include a test case that verifies the `getEmbedding` method correctly uses the `modelConfig` passed during instantiation.

## Phase 7: Finalization

*   `[✅]` 13. **[COMMIT]** Commit all changes with the message `fix: Correctly sync and utilize AI embedding models`.

    
