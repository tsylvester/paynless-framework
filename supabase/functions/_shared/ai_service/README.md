# AI Service Adapters

This directory contains the adapter modules responsible for abstracting interactions with various third-party AI model providers (e.g., OpenAI, Google, Anthropic). The primary goal of these adapters is to provide a consistent, unified interface that allows the application to treat all AI providers identically.

## The Adapter Contract

All adapters in this service must adhere to a single, strict contract. This ensures they are interchangeable and that the factory can manage them generically.

### 1. The `AiProviderAdapter` Interface

Every adapter **must** implement the `AiProviderAdapter` interface defined in `supabase/functions/_shared/types.ts`. This interface mandates the following methods:

*   `sendMessage(request: ChatApiRequest, modelIdentifier: string): Promise<AdapterResponsePayload>`
*   `listModels(): Promise<ProviderModelInfo[]>`

The `apiKey` is **not** passed to these methods; it is provided once during the adapter's construction.

### 2. The Constructor

Every adapter class **must** have a constructor that is inherent in the `AiProviderAdapter` definition:

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

The adapter is expected to use the `modelConfig` object as the source of truth for all model-specific configurations, such as token limits, cost rates, and context window sizes. Crucially, before sending a request, the adapter is responsible for calculating the token count of the final, constructed prompt and throwing a critical error if this count exceeds the limits defined in `modelConfig`. The adapter must not silently truncate or modify the content.

## The Factory

A generic factory, `getAiProviderAdapter` located in `factory.ts`, is responsible for instantiating the correct adapter. It uses a simple map to associate a provider's identifying prefix (e.g., 'openai-') with its corresponding adapter class. The factory ensures that the full `AiModelExtendedConfig` from the database is always passed to the adapter's constructor.

## Adding a New Provider

Adding a new provider is now a straightforward and test-driven process:

1.  **Create the Adapter File:**
    *   Create a new file (e.g., `newprovider_adapter.ts`).
    *   Implement a class that conforms to the `AiProviderAdapter` interface and the constructor contract described above.
    *   **Best Practice:** Use the provider's official SDK client library to handle API interactions, rather than making manual `fetch` calls.

2.  **Update the Factory:**
    *   Go to `supabase/functions/_shared/ai_service/factory.ts`.
    *   Import your new adapter class.
    *   Add an entry to the `providerMap` that maps your new provider's prefix (e.g., `'newprovider-'`) to your new adapter class.

3.  **Create the Test Suite:**
    *   Create a new test file (e.g., `newprovider_adapter.test.ts`).
    *   Import the shared `testAdapterContract` function from `adapter_test_contract.ts`.
    *   Create a `MockApi` object that simulates the responses from your provider's API.
    *   Create a parent `Deno.test` block for contract compliance. Inside this block, use the **prototype stubbing** pattern to intercept calls to your real adapter's methods and redirect them to your `MockApi` instance.
    *   Call `await testAdapterContract(...)` from within this block, passing in the test context, your adapter class, the spied-upon `MockApi`, and a mock model config.
    *   Add separate `Deno.test` blocks for any behavior that is truly unique to your provider (e.g., special message formatting).

4.  **Update `sync-ai-models`:**
    *   Follow the existing process in `supabase/functions/sync-ai-models/index.ts` to add a sync function and default configuration creator for your new provider's models. This ensures their configurations are kept up-to-date in the database.
    *   Ensure the corresponding API key environment variable (e.g., `NEWPROVIDER_API_KEY`) is documented and set up in your Supabase project settings.

## Tokenization

Tokenization logic is not handled by these adapters directly. It is managed by utility functions based on the `tokenization_strategy` defined in the `AiModelExtendedConfig`, which is passed to the adapter during construction. The adapters are only responsible for the API interaction.
