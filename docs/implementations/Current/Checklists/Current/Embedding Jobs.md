[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 

# Work Breakdown Structure

* **Embedding Jobs Implementation** 

* `[ ]`   netlify/functions/ai-stream-background/adapters/openai/openai.ts **[BE] Add embedding operation support to the OpenAI adapter while preserving chat stream behavior**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing provider-adapter embedding capability so embedding workloads can execute through the same adapter boundary as chat workloads.
      * `[ ]`   Functional goals:
         * `[ ]`   Add adapter-level embedding request and response contracts.
         * `[ ]`   Implement `getEmbedding` in the OpenAI adapter using the OpenAI embeddings API.
         * `[ ]`   Preserve existing `sendMessageStream` behavior and output chunk semantics.
         * `[ ]`   Keep embedding support additive so existing adapters remain valid while this node is completed.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No behavior regressions in existing OpenAI stream tests.
         * `[ ]`   Deterministic runtime validation and explicit error signaling for malformed embedding responses.
         * `[ ]`   No handler, queue, or Supabase worker changes in this node.
      * `[ ]`   Each goal is atomic and testable through existing and added adapter tests.

   * `[ ]`   `role`
      * `[ ]`   Node role is provider adapter implementation plus immediate contract support files consumed by that implementation.
      * `[ ]`   This role is correct because `openai.ts` is the first source file that must consume embedding contracts, guards, and mocks.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit handler routing (`ai-stream-background.ts`) in this node.
         * `[ ]`   Do not edit enqueue/callback schemas in this node.
         * `[ ]`   Do not edit non-OpenAI provider source files in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `netlify/functions/ai-stream-background/adapters` and OpenAI adapter internals.
      * `[ ]`   Inside boundary:
         * `[ ]`   Adapter contracts used by provider adapters.
         * `[ ]`   OpenAI request shaping and response normalization.
         * `[ ]`   OpenAI runtime guards, mocks, and tests.
      * `[ ]`   Outside boundary:
         * `[ ]`   Workload dispatch mode selection.
         * `[ ]`   Netlify callback persistence behavior.
         * `[ ]`   Supabase worker orchestration.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `openai` package client.
         * `[ ]`   Layer classification: external adapter dependency.
         * `[ ]`   Direction: inbound to adapter implementation.
         * `[ ]`   Purpose: invoke `chat.completions.create` and `embeddings.create`.
      * `[ ]`   Provider: `../ai-adapter.interface.ts`.
         * `[ ]`   Layer classification: internal adapter contract.
         * `[ ]`   Direction: producer contract consumed by OpenAI adapter.
         * `[ ]`   Purpose: `AiAdapter`, constructor params, stream chunk, and embedding contract types.
      * `[ ]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[ ]`   Layer classification: shared runtime guard utility.
         * `[ ]`   Direction: producer guard consumed by OpenAI adapter.
         * `[ ]`   Purpose: validate usage records and plain records safely.
      * `[ ]`   Provider: `../resolveOutputCap.ts`.
         * `[ ]`   Layer classification: shared helper.
         * `[ ]`   Direction: producer helper consumed by chat path only.
         * `[ ]`   Purpose: preserve existing output-cap behavior.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   OpenAI client methods for streaming chat and embeddings only.
         * `[ ]`   Adapter contract method signatures and token usage shape.
         * `[ ]`   Runtime record/token-usage guard helpers.
      * `[ ]`   Injection shape remains `NodeAdapterConstructorParams` and no new constructor dependencies are added.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of dependency surfaces.
         * `[ ]`   No hidden coupling to queue payload structures.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/ai-adapter.interface.test.ts`
      * `[ ]`   Add valid and invalid contract assertions for new embedding boundary types:
         * `[ ]`   Valid `NodeEmbeddingRequest` with non-empty `input`.
         * `[ ]`   Invalid request with non-string `input`.
         * `[ ]`   Valid `NodeEmbeddingResponse` with numeric `embedding` vector and token usage.
         * `[ ]`   Invalid response with non-numeric vector elements.
      * `[ ]`   Add contract assertions for `AiAdapter` compatibility:
         * `[ ]`   Adapter with `sendMessageStream` only remains valid.
         * `[ ]`   Adapter with both `sendMessageStream` and optional `getEmbedding` remains valid.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/ai-adapter.interface.ts`
      * `[ ]`   Add `NodeEmbeddingRequest` with `input: string`.
      * `[ ]`   Add `NodeEmbeddingResponse` with:
         * `[ ]`   `embedding: number[]`
         * `[ ]`   `tokenUsage: NodeTokenUsage`
      * `[ ]`   Extend `AiAdapter` interface with optional method:
         * `[ ]`   `getEmbedding?(request: NodeEmbeddingRequest, apiIdentifier: string): Promise<NodeEmbeddingResponse>`
      * `[ ]`   Keep existing stream method signatures unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interaction.spec`
      * `[ ]`   Define OpenAI adapter interactions for both supported operations.
      * `[ ]`   Chat stream interaction constraints:
         * `[ ]`   Preserve current request shaping.
         * `[ ]`   Preserve `text_delta` then `usage` then `done` stream semantics.
         * `[ ]`   Preserve output-cap resolution.
      * `[ ]`   Embedding interaction constraints:
         * `[ ]`   Validate OpenAI model suffix resolution from `apiIdentifier`.
         * `[ ]`   Call `embeddings.create` with resolved model and request input.
         * `[ ]`   Require non-empty embedding data.
         * `[ ]`   Require usage object with `prompt_tokens` and `total_tokens`.
         * `[ ]`   Normalize returned usage into `NodeTokenUsage` with `completion_tokens` fixed to `0`.
      * `[ ]`   Failure modes:
         * `[ ]`   Model mismatch throws explicit adapter error.
         * `[ ]`   Missing usage throws explicit adapter error.
         * `[ ]`   Empty embedding data throws explicit adapter error.
         * `[ ]`   SDK APIError is surfaced through existing adapter error normalization.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.test.ts`
      * `[ ]`   Add coverage for optional embedding method validation:
         * `[ ]`   Accept adapter object with only valid `sendMessageStream`.
         * `[ ]`   Accept adapter object with valid `sendMessageStream` and function `getEmbedding`.
         * `[ ]`   Reject adapter object with non-function `getEmbedding`.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.ts`
      * `[ ]`   Keep `sendMessageStream` function requirement unchanged.
      * `[ ]`   Add optional `getEmbedding` runtime function check.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interface.test.ts`
      * `[ ]`   Add embedding interface contract tests:
         * `[ ]`   Accept embedding datum with numeric `embedding` array.
         * `[ ]`   Accept embedding response with non-empty `data` and valid `usage`.
         * `[ ]`   Reject malformed usage fields by type contract fixtures.
         * `[ ]`   Reject malformed embedding vector element types by type contract fixtures.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interface.ts`
      * `[ ]`   Add `OpenAIEmbeddingDatum` containing `embedding: number[]`.
      * `[ ]`   Add `OpenAIEmbeddingUsage` containing `prompt_tokens: number` and `total_tokens: number`.
      * `[ ]`   Add `OpenAIEmbeddingResponse` containing `data: OpenAIEmbeddingDatum[]` and `usage: OpenAIEmbeddingUsage`.
      * `[ ]`   Preserve existing chat interface types unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.guard.test.ts`
      * `[ ]`   Add guard tests for embedding runtime validation:
         * `[ ]`   Accept valid embedding response.
         * `[ ]`   Reject missing usage.
         * `[ ]`   Reject empty data array.
         * `[ ]`   Reject non-array embedding field.
         * `[ ]`   Reject embedding arrays containing non-number elements.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.guard.ts`
      * `[ ]`   Add type guards for:
         * `[ ]`   embedding usage object
         * `[ ]`   embedding datum vector
         * `[ ]`   embedding response object
      * `[ ]`   Preserve all existing chat chunk guards unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.mock.ts`
      * `[ ]`   Add embedding fixtures and factories:
         * `[ ]`   Valid embedding response fixture.
         * `[ ]`   Valid embedding usage fixture.
         * `[ ]`   Override-capable factory for malformed usage and malformed vectors.
      * `[ ]`   Extend adapter mock factory to optionally provide deterministic `getEmbedding` implementation.
      * `[ ]`   Preserve existing stream mock defaults unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for new `getEmbedding` behavior:
         * `[ ]`   Calls `embeddings.create` with resolved model and request input.
         * `[ ]`   Returns first embedding vector and normalized token usage.
         * `[ ]`   Throws on model mismatch before API call.
         * `[ ]`   Throws on missing usage.
         * `[ ]`   Throws on empty embedding data.
         * `[ ]`   Surfaces normalized API errors consistently with existing style.
      * `[ ]`   Keep current stream tests and assertions unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.ts`
      * `[ ]`   Implement `getEmbedding` on the returned adapter object using the new interface contract.
      * `[ ]`   Resolve and validate model identifier in the same style as stream path.
      * `[ ]`   Call OpenAI embeddings API, validate guard-safe response, and map to `NodeEmbeddingResponse`.
      * `[ ]`   Keep `sendMessageStream` behavior unchanged.
      * `[ ]`   Keep constructor shape and dependency injection unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.provides.ts`
      * `[ ]`   Export newly added embedding types, guards, and mock helpers introduced by this node.
      * `[ ]`   Preserve all existing exports used by current tests and consumers.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/openai/openai.integration.test.ts`
      * `[ ]`   Add integration assertions covering provider -> selector -> adapter chain for embeddings:
         * `[ ]`   Construct a real provider map that registers the OpenAI factory.
         * `[ ]`   Resolve the adapter through `getNodeAiAdapter` (do not construct OpenAI adapter directly in the embedding integration path).
         * `[ ]`   Invoke embedding through the returned `AiAdapter` boundary and assert normalized `NodeEmbeddingResponse` output.
         * `[ ]`   Assert the selected adapter still satisfies runtime adapter guard checks.
         * `[ ]`   Keep existing stream integration behavior valid in the same test file.
      * `[ ]`   Use only mocked external SDK interactions.

   * `[ ]`   `construction`
      * `[ ]`   `createOpenAINodeAdapter` returns a fully constructed adapter object with required stream function and optional embedding function implemented for OpenAI.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order keeps existing client construction before method use.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is provider adapter implementation.
      * `[ ]`   Dependencies remain inward-facing from shared contracts/guards/helpers and external SDK.
      * `[ ]`   Exposed API remains outward-facing through provides exports.
      * `[ ]`   No cycles with handler or worker layers.

   * `[ ]`   `requirements`
      * `[ ]`   Embedding operation is available at OpenAI adapter boundary through typed optional adapter contract.
      * `[ ]`   OpenAI adapter embedding behavior is fully validated and test-covered for success and failure paths.
      * `[ ]`   Existing chat stream behavior remains unchanged and passing.
      * `[ ]`   Guard and interface layers cover embedding shapes and reject malformed data.
      * `[ ]`   Integration test confirms provider map -> adapter selector -> OpenAI adapter embedding chain with mocked external provider interaction.
      * `[ ]`   No non-node-scope source files are modified.

* `[ ]`   netlify/functions/ai-stream-background/adapters/google/google.ts **[BE] Add embedding operation support to Google adapter while preserving Gemini stream semantics**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing Google provider embedding capability so embedding workloads can execute through the same adapter boundary used by generation workloads.
      * `[ ]`   Functional goals:
         * `[ ]`   Add Google embedding response/request contract coverage at interface and guard layers.
         * `[ ]`   Implement `getEmbedding` in Google adapter using Google embeddings API surface.
         * `[ ]`   Preserve current `sendMessageStream` behavior, output-cap handling, and finish-reason mapping.
         * `[ ]`   Keep adapter return shape compatible with optional embedding contract introduced in shared adapter interface.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regressions to existing stream unit and integration assertions.
         * `[ ]`   Deterministic runtime validation of embedding responses prior to normalization.
         * `[ ]`   No workload-handler, selector-source, or Supabase source edits in this node.
      * `[ ]`   Each goal is atomic and testable via contract, unit, and integration files in Google adapter scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is provider adapter implementation plus immediate Google support files (interface, guards, mocks, tests, provides).
      * `[ ]`   This role is correct because `google.ts` is the source file that must consume shared adapter embedding capability and produce Google-specific behavior.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit selector source (`getNodeAiAdapter.ts`) in this node.
         * `[ ]`   Do not edit handler source (`ai-stream-background.ts`) in this node.
         * `[ ]`   Do not edit OpenAI/Anthropic source files in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is Google adapter implementation under `netlify/functions/ai-stream-background/adapters/google`.
      * `[ ]`   Inside boundary:
         * `[ ]`   Google request preparation and response normalization.
         * `[ ]`   Google runtime guards for chunk/final/embedding payloads.
         * `[ ]`   Google mock factories and tests proving stream and embedding behavior.
      * `[ ]`   Outside boundary:
         * `[ ]`   Workload mode routing.
         * `[ ]`   Provider selection logic.
         * `[ ]`   Callback persistence and wallet/debit logic.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `@google/generative-ai` client.
         * `[ ]`   Layer classification: external provider SDK dependency.
         * `[ ]`   Direction: inbound to adapter implementation.
         * `[ ]`   Purpose: stream chat completions and compute embeddings.
      * `[ ]`   Provider: `../ai-adapter.interface.ts`.
         * `[ ]`   Layer classification: shared adapter contract producer.
         * `[ ]`   Direction: consumed by Google adapter.
         * `[ ]`   Purpose: stream chunk contract plus optional embedding contract types.
      * `[ ]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[ ]`   Layer classification: shared runtime guard helpers.
         * `[ ]`   Direction: consumed by Google guard layer.
         * `[ ]`   Purpose: plain record and token usage validation helpers.
      * `[ ]`   Provider: `../../resolveOutputCap/resolveOutputCap.provides.ts`.
         * `[ ]`   Layer classification: shared helper producer.
         * `[ ]`   Direction: consumed by Google stream request preparation.
         * `[ ]`   Purpose: enforce token cap policy for stream requests.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   SDK calls for stream and embedding operations only.
         * `[ ]`   Shared adapter stream and embedding output shapes.
         * `[ ]`   Shared validation helpers for record/token checks.
      * `[ ]`   Injection shape remains `NodeAdapterConstructorParams` with existing `modelConfig`, `apiKey`, and `userConfig`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of SDK/client surfaces.
         * `[ ]`   No hidden coupling to handler event payloads.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.interface.test.ts`
      * `[ ]`   Add contract tests for Google embedding payload shapes:
         * `[ ]`   Valid embedding value with numeric vector output.
         * `[ ]`   Valid embedding response with non-empty embedding container and usage metadata.
         * `[ ]`   Invalid embedding response fixtures for missing vector and invalid usage numeric fields.
      * `[ ]`   Preserve all current stream contract assertions.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.interface.ts`
      * `[ ]`   Add Google embedding interfaces required by runtime validation and adapter normalization:
         * `[ ]`   embedding vector item type.
         * `[ ]`   embedding response type.
         * `[ ]`   embedding usage metadata type.
      * `[ ]`   Preserve existing stream-related Google interface definitions unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.interaction.spec`
      * `[ ]`   Define stream operation interactions:
         * `[ ]`   prepare history and final parts.
         * `[ ]`   send stream request.
         * `[ ]`   emit `text_delta`, then `usage`, then `done`.
      * `[ ]`   Define embedding operation interactions:
         * `[ ]`   resolve model identifier from `google-` API identifier.
         * `[ ]`   invoke Google embedding API call with request input.
         * `[ ]`   validate embedding response and usage metadata.
         * `[ ]`   normalize usage to `NodeTokenUsage` (`completion_tokens` fixed to `0`).
      * `[ ]`   Failure modes:
         * `[ ]`   empty or malformed embedding payload throws explicit adapter error.
         * `[ ]`   missing or malformed embedding usage metadata throws explicit adapter error.
         * `[ ]`   SDK errors are surfaced through adapter error path without swallowing.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.guard.test.ts`
      * `[ ]`   Add embedding guard tests:
         * `[ ]`   accept valid embedding response shape.
         * `[ ]`   reject missing embedding vector.
         * `[ ]`   reject non-array embedding vector.
         * `[ ]`   reject embedding arrays with non-number elements.
         * `[ ]`   reject missing/invalid embedding usage metadata.
      * `[ ]`   Preserve existing stream guard coverage.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.guard.ts`
      * `[ ]`   Add runtime guards for Google embedding response and usage metadata.
      * `[ ]`   Reuse shared plain-record validation patterns.
      * `[ ]`   Preserve existing stream chunk/final response guards unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.mock.ts`
      * `[ ]`   Add deterministic Google embedding fixtures and factory overrides:
         * `[ ]`   success embedding response fixture with numeric vector + usage.
         * `[ ]`   malformed embedding response fixtures for negative tests.
      * `[ ]`   Extend adapter mock creation to optionally provide `getEmbedding` implementation.
      * `[ ]`   Preserve current stream mock defaults and helpers.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for `getEmbedding`:
         * `[ ]`   invokes SDK embedding API with resolved model and input text.
         * `[ ]`   returns normalized `NodeEmbeddingResponse` with first embedding vector and token usage.
         * `[ ]`   throws on malformed embedding payload.
         * `[ ]`   throws on missing/invalid usage metadata.
         * `[ ]`   surfaces SDK embedding failures.
      * `[ ]`   Preserve all current stream tests and assertions.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.ts`
      * `[ ]`   Implement `getEmbedding` on returned adapter object.
      * `[ ]`   Resolve model name for embedding path with same identifier normalization style used by stream path.
      * `[ ]`   Call Google embedding API, validate with Google embedding guards, and map to `NodeEmbeddingResponse`.
      * `[ ]`   Keep `sendMessageStream` behavior unchanged.
      * `[ ]`   Keep constructor/dependency injection shape unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.provides.ts`
      * `[ ]`   Export new embedding interfaces/guards/mocks added in this node.
      * `[ ]`   Preserve all existing exports used by tests and consumers.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/google/google.integration.test.ts`
      * `[ ]`   Add integration assertions covering provider -> selector -> adapter chain for Google embedding path:
         * `[ ]`   register a real provider map entry for Google factory.
         * `[ ]`   resolve adapter through selector boundary (`getNodeAiAdapter`) for Google identifier.
         * `[ ]`   invoke embedding through returned `AiAdapter` boundary and assert normalized `NodeEmbeddingResponse`.
         * `[ ]`   preserve and reassert existing stream integration behavior in same file.
      * `[ ]`   Use mocks only for external SDK interactions.

   * `[ ]`   `construction`
      * `[ ]`   `createGoogleNodeAdapter` returns fully-constructed adapter object with required stream method and embedding method.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains client construction before operation methods are executed.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is provider adapter implementation.
      * `[ ]`   Dependencies remain inward-facing from shared contracts/helpers and Google SDK.
      * `[ ]`   Outward API remains through Google provides surface and `AiAdapter` contract.
      * `[ ]`   No cycles with selector or handler layers introduced.

   * `[ ]`   `requirements`
      * `[ ]`   Google adapter exposes embedding capability through optional adapter contract.
      * `[ ]`   Google embedding path is validated and normalized with deterministic error handling.
      * `[ ]`   Existing Google stream behavior remains intact and fully covered.
      * `[ ]`   Integration path verifies selector-resolved Google adapter embedding behavior with external SDK mocked.
      * `[ ]`   Node changes remain scoped to Google source file and its support system.

* `[ ]`   netlify/functions/ai-stream-background/adapters/anthropic/anthropic.ts **[BE] Add embedding operation support to Anthropic adapter while preserving Claude stream semantics**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing Anthropic provider embedding capability so embedding workloads can execute through the shared adapter boundary without bypassing provider adapters.
      * `[ ]`   Functional goals:
         * `[ ]`   Add Anthropic embedding contract coverage in interface and guard layers.
         * `[ ]`   Implement `getEmbedding` in Anthropic adapter using Anthropic embedding API surface.
         * `[ ]`   Preserve existing `sendMessageStream` behavior, message preparation rules, and stop-reason mapping.
         * `[ ]`   Keep return shape compatible with optional embedding contract from shared adapter interface.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regressions to existing stream unit and integration tests.
         * `[ ]`   Deterministic runtime validation before embedding normalization.
         * `[ ]`   No edits to selector source, handler source, or Supabase source files in this node.
      * `[ ]`   Each goal is atomic and testable via Anthropic contract, guard, unit, and integration tests.

   * `[ ]`   `role`
      * `[ ]`   Node role is provider adapter implementation and complete immediate support system for Anthropic adapter.
      * `[ ]`   This role is correct because `anthropic.ts` is the source file that consumes shared embedding contract and provides Anthropic-specific runtime behavior.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `getNodeAiAdapter.ts` in this node.
         * `[ ]`   Do not edit `ai-stream-background.ts` in this node.
         * `[ ]`   Do not edit OpenAI or Google source files in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `netlify/functions/ai-stream-background/adapters/anthropic`.
      * `[ ]`   Inside boundary:
         * `[ ]`   Anthropic request shaping and stream/embedding response normalization.
         * `[ ]`   Anthropic runtime guards for stream and embedding payload shapes.
         * `[ ]`   Anthropic test and mock fixtures for stream and embedding paths.
      * `[ ]`   Outside boundary:
         * `[ ]`   Workload mode routing and queue event contracts.
         * `[ ]`   Adapter selection and provider-map dispatch.
         * `[ ]`   Save-response callback persistence.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `@anthropic-ai/sdk` client.
         * `[ ]`   Layer classification: external provider SDK dependency.
         * `[ ]`   Direction: inbound to adapter implementation.
         * `[ ]`   Purpose: run stream generation and compute embeddings.
      * `[ ]`   Provider: `../ai-adapter.interface.ts`.
         * `[ ]`   Layer classification: shared adapter contract producer.
         * `[ ]`   Direction: consumed by Anthropic adapter.
         * `[ ]`   Purpose: stream chunk and embedding request/response contract types.
      * `[ ]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[ ]`   Layer classification: shared runtime guard helper producer.
         * `[ ]`   Direction: consumed by Anthropic guard layer.
         * `[ ]`   Purpose: plain record validation utility reuse.
      * `[ ]`   Provider: `../../resolveOutputCap/resolveOutputCap.provides.ts`.
         * `[ ]`   Layer classification: shared helper producer.
         * `[ ]`   Direction: consumed by stream request preparation.
         * `[ ]`   Purpose: output-cap enforcement for stream calls.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   SDK stream and embedding calls.
         * `[ ]`   Shared adapter contract types.
         * `[ ]`   Shared plain-record validation helper.
      * `[ ]`   Injection shape remains `NodeAdapterConstructorParams` (`modelConfig`, `apiKey`, `userConfig`).
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of SDK surfaces.
         * `[ ]`   No hidden coupling to handler event payloads.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interface.test.ts`
      * `[ ]`   Add contract tests for Anthropic embedding payload shapes:
         * `[ ]`   valid embedding vector response with numeric values.
         * `[ ]`   valid embedding usage payload.
         * `[ ]`   invalid embedding fixtures for missing vector and malformed usage fields.
      * `[ ]`   Preserve all current stream contract assertions.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interface.ts`
      * `[ ]`   Add Anthropic embedding interfaces required by guards and adapter normalization:
         * `[ ]`   embedding vector item type.
         * `[ ]`   embedding response container type.
         * `[ ]`   embedding usage metadata type.
      * `[ ]`   Preserve existing stream-related interface types unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interaction.spec`
      * `[ ]`   Define stream operation interactions:
         * `[ ]`   prepare Anthropic messages and caps.
         * `[ ]`   iterate stream deltas and emit `text_delta` chunks.
         * `[ ]`   emit `usage` then `done` with mapped stop reason.
      * `[ ]`   Define embedding operation interactions:
         * `[ ]`   resolve Anthropic model identifier from `anthropic-` API identifier.
         * `[ ]`   invoke Anthropic embedding API with request input.
         * `[ ]`   validate response embedding vector and usage metadata.
         * `[ ]`   normalize to `NodeEmbeddingResponse` with `completion_tokens` fixed to `0`.
      * `[ ]`   Failure modes:
         * `[ ]`   malformed embedding response throws explicit adapter error.
         * `[ ]`   missing/invalid usage metadata throws explicit adapter error.
         * `[ ]`   Anthropic SDK APIError is surfaced through normalized adapter error path.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.guard.test.ts`
      * `[ ]`   Add embedding guard tests:
         * `[ ]`   accept valid embedding response and usage.
         * `[ ]`   reject missing embedding vector.
         * `[ ]`   reject non-array embedding vector.
         * `[ ]`   reject non-number embedding vector elements.
         * `[ ]`   reject missing or malformed embedding usage metadata.
      * `[ ]`   Preserve existing stream guard coverage.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.guard.ts`
      * `[ ]`   Add runtime guards for Anthropic embedding response and usage metadata.
      * `[ ]`   Reuse existing plain-record validation style.
      * `[ ]`   Preserve existing stream guards unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.mock.ts`
      * `[ ]`   Add deterministic embedding fixtures and override-capable factories:
         * `[ ]`   success embedding response fixture.
         * `[ ]`   malformed embedding fixtures for negative tests.
      * `[ ]`   Extend adapter mock builder to optionally provide `getEmbedding` implementation.
      * `[ ]`   Preserve current stream mock behavior.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for `getEmbedding`:
         * `[ ]`   invokes Anthropic embedding SDK call with resolved model and input.
         * `[ ]`   maps embedding response to `NodeEmbeddingResponse`.
         * `[ ]`   throws on malformed embedding payload.
         * `[ ]`   throws on missing/invalid embedding usage metadata.
         * `[ ]`   surfaces SDK embedding failures and normalized APIError path.
      * `[ ]`   Preserve all existing stream tests and assertions.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.ts`
      * `[ ]`   Implement `getEmbedding` on returned adapter object.
      * `[ ]`   Resolve embedding model name using existing Anthropic identifier normalization pattern.
      * `[ ]`   Call Anthropic embedding API, validate with new Anthropic embedding guards, and map to `NodeEmbeddingResponse`.
      * `[ ]`   Keep `sendMessageStream` behavior unchanged.
      * `[ ]`   Keep constructor and dependency injection shape unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.provides.ts`
      * `[ ]`   Export newly added embedding interfaces/guards/mock helpers.
      * `[ ]`   Preserve all existing exports consumed by tests and consumers.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.integration.test.ts`
      * `[ ]`   Add integration assertions covering provider -> selector -> adapter chain for Anthropic embedding path:
         * `[ ]`   register provider map entry with Anthropic factory.
         * `[ ]`   resolve adapter via selector boundary (`getNodeAiAdapter`) for Anthropic identifier.
         * `[ ]`   invoke embedding via returned `AiAdapter` and assert normalized `NodeEmbeddingResponse`.
         * `[ ]`   preserve and reassert current stream integration behavior in same file.
      * `[ ]`   Use mocks only for external SDK interactions.

   * `[ ]`   `construction`
      * `[ ]`   `createAnthropicNodeAdapter` returns fully constructed adapter object with stream and embedding methods.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains client construction before operation execution.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is provider adapter implementation.
      * `[ ]`   Dependencies remain inward-facing from shared contracts/helpers and Anthropic SDK.
      * `[ ]`   Outward API remains via Anthropic provides exports and `AiAdapter` contract.
      * `[ ]`   No selector or handler cycles are introduced.

   * `[ ]`   `requirements`
      * `[ ]`   Anthropic adapter exposes embedding capability through optional adapter contract.
      * `[ ]`   Anthropic embedding path is validated and normalized with deterministic error handling.
      * `[ ]`   Existing stream behavior remains unchanged and fully covered.
      * `[ ]`   Integration path verifies selector-resolved Anthropic embedding behavior with external SDK mocked.
      * `[ ]`   Node changes remain scoped to Anthropic source file and its support system.

* `[ ]`   netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.ts **[BE] Make selector operation-aware and enforce embedding capability compatibility**

   * `[ ]`   `objective`
      * `[ ]`   Solve selector ambiguity where provider prefix matching alone can return adapters that do not support the requested operation.
      * `[ ]`   Functional goals:
         * `[ ]`   Add explicit operation intent to selector params (`stream` or `embedding`).
         * `[ ]`   Preserve existing stream selection behavior for current workloads.
         * `[ ]`   Reject embedding selection when resolved adapter lacks embedding capability.
         * `[ ]`   Keep provider-prefix matching and factory invocation deterministic.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regression in case-insensitive prefix matching.
         * `[ ]`   No silent fallback from embedding intent to stream-only adapters.
         * `[ ]`   No handler source edits in this node.
      * `[ ]`   Each goal is atomic and testable via selector contract, guard, unit, and integration tests.

   * `[ ]`   `role`
      * `[ ]`   Node role is adapter selector implementation plus immediate selector support system files.
      * `[ ]`   This role is correct because `getNodeAiAdapter.ts` composes provider adapters and is the runtime gate between handler intent and provider capability.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit provider adapter source files in this node.
         * `[ ]`   Do not edit `ai-stream-background.ts` workload routing in this node.
         * `[ ]`   Do not edit Supabase source files in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is selector composition under `netlify/functions/ai-stream-background/adapters`.
      * `[ ]`   Inside boundary:
         * `[ ]`   provider prefix resolution.
         * `[ ]`   factory invocation with model/user/api-key inputs.
         * `[ ]`   operation-capability validation for resolved adapter.
      * `[ ]`   Outside boundary:
         * `[ ]`   provider-specific request/response logic.
         * `[ ]`   workload mode parsing in handler.
         * `[ ]`   callback persistence.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./ai-adapter.interface.ts`.
         * `[ ]`   Layer classification: shared adapter contract producer.
         * `[ ]`   Direction: consumed by selector implementation/guards/tests.
         * `[ ]`   Purpose: adapter shape and provider factory contracts.
      * `[ ]`   Provider: `./getNodeAiAdapter.interface.ts`.
         * `[ ]`   Layer classification: selector contract producer.
         * `[ ]`   Direction: consumed by selector implementation and tests.
         * `[ ]`   Purpose: selector params/deps with operation intent.
      * `[ ]`   Provider: `./getNodeAiAdapter.guard.ts`.
         * `[ ]`   Layer classification: selector runtime guard producer.
         * `[ ]`   Direction: consumed by selector implementation and tests.
         * `[ ]`   Purpose: validate params and adapter capabilities.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   provider map lookup by prefix.
         * `[ ]`   factory constructor payload.
         * `[ ]`   runtime capability check for embedding support.
      * `[ ]`   Injection shape remains `GetNodeAiAdapterDeps` and `GetNodeAiAdapterParams`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of handler event fields.
         * `[ ]`   No hidden coupling to provider internals.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interface.test.ts`
      * `[ ]`   Add contract tests for operation-aware selector params:
         * `[ ]`   valid params include `operation: 'stream'`.
         * `[ ]`   valid params include `operation: 'embedding'`.
         * `[ ]`   invalid params reject unknown operation value.
      * `[ ]`   Preserve current deps/model/user/api-key contract coverage.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interface.ts`
      * `[ ]`   Add selector operation type:
         * `[ ]`   `NodeAdapterOperation = 'stream' | 'embedding'`
      * `[ ]`   Extend `GetNodeAiAdapterParams` with required `operation` field.
      * `[ ]`   Preserve selector return contract (`AiAdapter | null`).

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interaction.spec`
      * `[ ]`   Define selector interaction semantics:
         * `[ ]`   normalize `apiIdentifier` to lowercase.
         * `[ ]`   resolve prefix match from provider map.
         * `[ ]`   instantiate candidate adapter from factory.
         * `[ ]`   gate adapter by requested operation capability.
      * `[ ]`   Failure modes:
         * `[ ]`   empty identifier returns `null`.
         * `[ ]`   unknown prefix returns `null`.
         * `[ ]`   embedding operation with stream-only adapter returns `null`.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.test.ts`
      * `[ ]`   Add guard coverage for operation-aware params and embedding capability:
         * `[ ]`   `isGetNodeAiAdapterParams` accepts `operation: 'stream'`.
         * `[ ]`   `isGetNodeAiAdapterParams` accepts `operation: 'embedding'`.
         * `[ ]`   `isGetNodeAiAdapterParams` rejects unknown operation.
         * `[ ]`   embedding-capability guard accepts adapter with function `getEmbedding`.
         * `[ ]`   embedding-capability guard rejects adapter without `getEmbedding`.
      * `[ ]`   Preserve existing provider map and stream chunk guard coverage.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.ts`
      * `[ ]`   Add runtime guard for selector operation value.
      * `[ ]`   Add runtime guard that validates embedding capability (`getEmbedding` function presence).
      * `[ ]`   Keep current `isAiAdapter` semantics for stream path unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.mock.ts`
      * `[ ]`   Extend selector params mock factory with default `operation: 'stream'`.
      * `[ ]`   Add embedding-capable adapter mock helper.
      * `[ ]`   Add explicit stream-only adapter mock helper for negative embedding selection tests.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.test.ts`
      * `[ ]`   Add unit tests for operation-aware selection:
         * `[ ]`   stream selection resolves adapter for matching provider prefix.
         * `[ ]`   embedding selection resolves adapter when provider adapter has `getEmbedding`.
         * `[ ]`   embedding selection returns `null` when resolved adapter lacks `getEmbedding`.
         * `[ ]`   unknown prefix and empty identifier behavior remains unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.ts`
      * `[ ]`   Read `operation` from params.
      * `[ ]`   Preserve current lowercased prefix matching and factory call payload.
      * `[ ]`   Add operation capability gating:
         * `[ ]`   for `stream`, preserve existing acceptance behavior.
         * `[ ]`   for `embedding`, return `null` unless resolved adapter is embedding-capable.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.provides.ts`
      * `[ ]`   Export new selector operation type and embedding-capability guard.
      * `[ ]`   Preserve existing exports used by adapter consumers and tests.

   * `[ ]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.integration.test.ts`
      * `[ ]`   Create selector integration test file to validate composed selector behavior:
         * `[ ]`   real provider-map entry + embedding-capable adapter resolves for embedding operation.
         * `[ ]`   real provider-map entry + stream-only adapter returns `null` for embedding operation.
         * `[ ]`   stream operation remains resolvable with existing provider map behavior.
      * `[ ]`   Use mocks only for external SDK interactions.

   * `[ ]`   `construction`
      * `[ ]`   Selector remains pure function over deps and params.
      * `[ ]`   No partial params accepted; operation is required.
      * `[ ]`   Initialization order remains normalize identifier -> prefix resolve -> factory call -> capability gate.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is adapter selection/composition.
      * `[ ]`   Dependencies remain inward-facing from shared contracts and guards.
      * `[ ]`   Output remains outward-facing `AiAdapter | null` boundary for handler consumers.
      * `[ ]`   No cycles introduced with provider adapter implementations.

   * `[ ]`   `requirements`
      * `[ ]`   Selector params include explicit operation intent.
      * `[ ]`   Stream selection remains backward-compatible.
      * `[ ]`   Embedding selection is capability-safe and does not silently degrade.
      * `[ ]`   Selector contract, guard, unit, and integration tests prove operation-aware behavior.
      * `[ ]`   Node scope remains limited to selector source file and its support system.

* `[ ]`   netlify/functions/ai-stream-background/ai-stream-background.ts **[BE] Add workload operation routing for stream and embedding paths with deterministic callback payload shaping**

   * `[ ]`   `objective`
      * `[ ]`   Solve handler single-mode execution where every workload is treated as streaming chat and cannot execute embedding jobs through the same queue worker.
      * `[ ]`   Functional goals:
         * `[ ]`   Extend workload event handling to include explicit operation mode selection.
         * `[ ]`   Route stream mode through existing chunk assembly behavior unchanged.
         * `[ ]`   Route embedding mode through adapter embedding call and build callback payload with embedding output semantics.
         * `[ ]`   Preserve saveResponse POST boundary and signature propagation.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Keep existing generation path behavior stable.
         * `[ ]`   Fail fast with deterministic `ErrorDoNotRetry` for unsupported operation or capability mismatch.
         * `[ ]`   No Supabase callback/schema source edits in this node.
      * `[ ]`   Each goal is atomic and testable via interface/guard/unit/integration coverage in this module.

   * `[ ]`   `role`
      * `[ ]`   Node role is workload orchestrator implementation and immediate support files for event/payload contracts, guards, mocks, tests, and provides.
      * `[ ]`   This role is correct because `ai-stream-background.ts` consumes selector output and publishes normalized callback payloads for downstream persistence.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit provider adapter source files in this node.
         * `[ ]`   Do not edit selector source logic in this node.
         * `[ ]`   Do not edit Supabase response handlers in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is Netlify async workload handler under `netlify/functions/ai-stream-background`.
      * `[ ]`   Inside boundary:
         * `[ ]`   environment dependency construction and API-key resolution.
         * `[ ]`   selector invocation with operation intent.
         * `[ ]`   mode-specific payload assembly and callback POST.
      * `[ ]`   Outside boundary:
         * `[ ]`   provider implementation internals.
         * `[ ]`   Supabase callback persistence decisions.
         * `[ ]`   queue enqueue event emission.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./ai-stream-background.interface.ts`.
         * `[ ]`   Layer classification: local contract producer.
         * `[ ]`   Direction: consumed by handler and tests.
         * `[ ]`   Purpose: event/deps/payload shape with operation-aware fields.
      * `[ ]`   Provider: `./ai-stream-background.guard.ts`.
         * `[ ]`   Layer classification: local runtime validation producer.
         * `[ ]`   Direction: consumed by handler entrypoint and tests.
         * `[ ]`   Purpose: validate operation-aware incoming event and outgoing payload.
      * `[ ]`   Provider: `./adapters/getNodeAiAdapter.ts`.
         * `[ ]`   Layer classification: adapter selector producer.
         * `[ ]`   Direction: consumed by handler.
         * `[ ]`   Purpose: resolve provider adapter by identifier and requested operation.
      * `[ ]`   Provider: provider adapter factories (openai/anthropic/google).
         * `[ ]`   Layer classification: provider adapter producers.
         * `[ ]`   Direction: consumed by dependency factory map.
         * `[ ]`   Purpose: runtime adapter creation for stream and embedding operations.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   selector returns `AiAdapter | null` for requested operation.
         * `[ ]`   adapter stream and optional embedding calls.
         * `[ ]`   callback POST endpoint and auth key.
      * `[ ]`   Injection shape remains `AiStreamDeps` with provider map, save URL, and API-key resolver.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of event payload fields.
         * `[ ]`   No hidden coupling to Supabase database schema.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.interface.test.ts`
      * `[ ]`   Add contract tests for operation-aware event and payload semantics:
         * `[ ]`   stream event contract includes required mode marker and chat request fields.
         * `[ ]`   embedding event contract includes required mode marker and embedding input fields.
         * `[ ]`   payload contract covers stream output fields and embedding output fields without ambiguity.
      * `[ ]`   Preserve existing baseline event/payload contract assertions.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.interface.ts`
      * `[ ]`   Extend `AiStreamEvent` with explicit workload operation field.
      * `[ ]`   Add operation-specific request shape for embedding input.
      * `[ ]`   Extend `AiStreamPayload` with operation-aware output fields for embedding results while preserving stream fields.
      * `[ ]`   Keep `AiStreamDeps` constructor shape unchanged.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.interaction.spec`
      * `[ ]`   Define stream operation interactions:
         * `[ ]`   resolve adapter with stream operation.
         * `[ ]`   iterate stream chunks and assemble content/usage/done finish reason.
         * `[ ]`   post stream payload to saveResponse.
      * `[ ]`   Define embedding operation interactions:
         * `[ ]`   resolve adapter with embedding operation.
         * `[ ]`   call adapter embedding path.
         * `[ ]`   build embedding payload with normalized usage and no text assembly.
         * `[ ]`   post embedding payload to saveResponse.
      * `[ ]`   Failure modes:
         * `[ ]`   invalid event shape throws `ErrorDoNotRetry`.
         * `[ ]`   missing adapter or operation mismatch throws `ErrorDoNotRetry`.
         * `[ ]`   callback non-OK response throws retryable error.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.guard.test.ts`
      * `[ ]`   Add guard tests for operation-aware event and payload:
         * `[ ]`   accept valid stream event shape.
         * `[ ]`   accept valid embedding event shape.
         * `[ ]`   reject event missing operation discriminator.
         * `[ ]`   accept payload variants for stream and embedding outputs.
         * `[ ]`   reject payload with mixed/invalid operation output fields.
      * `[ ]`   Preserve existing deps and baseline payload guard coverage.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.guard.ts`
      * `[ ]`   Add runtime validation for new operation discriminator.
      * `[ ]`   Add operation-aware validation of required request fields.
      * `[ ]`   Add operation-aware payload guard validation.
      * `[ ]`   Preserve existing deps guard behavior.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.mock.ts`
      * `[ ]`   Extend event mock factory with operation-aware defaults and overrides.
      * `[ ]`   Add embedding event fixtures and payload fixtures.
      * `[ ]`   Preserve existing stream mock fixtures and dependency factory helpers.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for operation routing:
         * `[ ]`   stream operation uses selector stream mode and preserves existing stream POST payload behavior.
         * `[ ]`   embedding operation uses selector embedding mode and posts embedding payload variant.
         * `[ ]`   embedding mode with non-embedding-capable adapter fails deterministically.
         * `[ ]`   invalid operation/event shape fails with `ErrorDoNotRetry`.
      * `[ ]`   Preserve existing stream behavior assertions and environment-key failure tests.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.ts`
      * `[ ]`   Read operation discriminator from validated event.
      * `[ ]`   Pass operation intent into selector call.
      * `[ ]`   Branch execution:
         * `[ ]`   stream branch preserves current collect loop and payload fields.
         * `[ ]`   embedding branch invokes adapter embedding method and maps embedding output payload fields.
      * `[ ]`   Keep callback POST/auth boundary unchanged.
      * `[ ]`   Keep dependency factory wiring for providers unchanged except operation-aware selector call requirements.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.provides.ts`
      * `[ ]`   Export new operation-aware contract types and guard symbols.
      * `[ ]`   Preserve existing exports used by tests and consumers.

   * `[ ]`   `netlify/functions/ai-stream-background/ai-stream-background.integration.test.ts`
      * `[ ]`   Extend integration coverage to operation-aware full chain:
         * `[ ]`   stream path: real deps factory -> selector -> provider adapter -> mocked SDK -> callback POST.
         * `[ ]`   embedding path: real deps factory -> selector -> provider adapter embedding call -> callback POST.
         * `[ ]`   verify posted payload variant matches operation.
      * `[ ]`   Use mocks only for external SDK and network boundaries.

   * `[ ]`   `construction`
      * `[ ]`   `createAiStreamDeps` remains explicit dependency factory with provider map, save URL, and API-key resolver.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains dependency creation -> event validation -> operation dispatch -> callback post.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is workload orchestration/adapter consumer.
      * `[ ]`   Dependencies remain inward-facing from selector/contracts/providers.
      * `[ ]`   Output remains outward-facing callback payload boundary.
      * `[ ]`   No cycles introduced with provider adapter modules.

   * `[ ]`   `requirements`
      * `[ ]`   Worker supports explicit stream and embedding operation routing.
      * `[ ]`   Stream behavior remains backward-compatible.
      * `[ ]`   Embedding behavior is capability-safe and produces deterministic callback payload.
      * `[ ]`   Unit and integration tests prove operation-aware routing and payload correctness.
      * `[ ]`   Node scope remains limited to worker source file and its support system.

   * `[ ]`   **Commit** `feat(ai-stream-background): add operation-aware adapter routing for stream and embedding workloads`
      * `[ ]`   Structural changes:
         * `[ ]`   Provider adapters (OpenAI, Google, Anthropic) include embedding-capable adapter contract support.
         * `[ ]`   Selector and worker contracts are operation-aware for stream vs embedding execution.
      * `[ ]`   Behavioral changes:
         * `[ ]`   Stream workloads preserve existing behavior.
         * `[ ]`   Embedding workloads route through provider adapters and produce deterministic callback payloads.
      * `[ ]`   Contract changes:
         * `[ ]`   Adapter, selector, and worker interface/guard layers include explicit operation and embedding payload semantics.

* `[ ]`   supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts **[BE] Align Supabase enqueue contract to operation-aware Netlify worker payloads while preserving queued-job guarantees**

   * `[ ]`   `objective`
      * `[ ]`   Solve the enqueue contract mismatch where Supabase currently emits chat-only queue payloads and cannot enqueue embedding workloads with explicit operation semantics.
      * `[ ]`   Functional goals:
         * `[ ]`   Add operation-aware enqueue payload contracts that support stream and embedding requests.
         * `[ ]`   Preserve existing queued state transition (`dialectic_generation_jobs.status = 'queued'`) before queue POST.
         * `[ ]`   Preserve job signature generation and event size enforcement semantics.
         * `[ ]`   Emit deterministic Netlify event body shape that matches `ai-stream-background` operation routing contract.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Keep stream enqueue behavior backward-compatible for existing generation jobs.
         * `[ ]`   Keep invalid-contract failures deterministic and explicitly non-retriable.
         * `[ ]`   Keep transient queue/network failures retriable.
         * `[ ]`   Do not edit callback ingest or response persistence source files in this node.
      * `[ ]`   Each goal is atomic and testable through interface, guard, unit, and integration updates in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is Supabase queue-emitter implementation plus immediate enqueue support files (interfaces, guards, mocks, tests, provides).
      * `[ ]`   This role is correct because `enqueueModelCall.ts` is the first Supabase source file that consumes Workstream A queue/worker operation contract outputs.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `netlifyResponseHandler.ts` source behavior in this node.
         * `[ ]`   Do not edit `saveResponse.ts` source behavior in this node.
         * `[ ]`   Do not edit Netlify worker source files in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/enqueueModelCall`.
      * `[ ]`   Inside boundary:
         * `[ ]`   Queue event contract assembly and validation.
         * `[ ]`   Job signature and queue-post sequencing.
         * `[ ]`   Runtime guard coverage for enqueue params/payload/return and event shape.
      * `[ ]`   Outside boundary:
         * `[ ]`   Upstream prompt-scoping and affordability logic.
         * `[ ]`   Downstream callback ingest branching and artifact persistence.
         * `[ ]`   Provider adapter execution internals.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../prepareModelJob/prepareModelJob.ts` enqueue caller contract.
         * `[ ]`   Layer classification: immediate producer for enqueue params/payload.
         * `[ ]`   Direction: producer input consumed by enqueue function.
         * `[ ]`   Purpose: provide operation-specific payload data for queue emission.
      * `[ ]`   Provider: `../../_shared/utils/type-guards/type_guards.chat.ts` and `type_guards.file_manager.ts`.
         * `[ ]`   Layer classification: shared runtime guard utilities.
         * `[ ]`   Direction: inbound dependency to enqueue runtime validation.
         * `[ ]`   Purpose: validate provider config and output-type compatibility before queue POST.
      * `[ ]`   Provider: Netlify queue endpoint contract (`eventName: 'ai-stream-background'` + operation-aware data).
         * `[ ]`   Layer classification: external consumer boundary.
         * `[ ]`   Direction: outbound payload emitted by enqueue implementation.
         * `[ ]`   Purpose: ensure queued events are consumable by operation-aware worker routing.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from enqueue into callback handler/persistence source modules.
         * `[ ]`   No lateral layer violations across Supabase workstream boundaries.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `computeJobSig(job.id, job.user_id, job.created_at)` returning deterministic signature string.
         * `[ ]`   Provider-row extended model config guard-safe shape.
         * `[ ]`   Queue payload discriminator and request payload fields required by Netlify worker operation routing.
      * `[ ]`   Injection shape remains `EnqueueModelCallDeps`, `EnqueueModelCallParams`, and `EnqueueModelCallPayload` with additive operation-aware fields only.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of producer-only fields not required for queue emission.
         * `[ ]`   No hidden coupling to callback persistence tables.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interface.test.ts`
      * `[ ]`   Add contract assertions for operation-aware enqueue payload shape:
         * `[ ]`   stream payload variant includes required `chatApiRequest` and excludes embedding-only fields.
         * `[ ]`   embedding payload variant includes required embedding input contract and excludes stream-only fields.
         * `[ ]`   unknown operation discriminator is rejected by contract fixtures.
      * `[ ]`   Add contract assertions for operation-aware `AiStreamEventData`:
         * `[ ]`   includes operation discriminator.
         * `[ ]`   includes exactly one request variant payload per operation.
         * `[ ]`   preserves `sig` and `user_config` requirements.
      * `[ ]`   Preserve existing queued success/error return contract assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interface.ts`
      * `[ ]`   Extend `EnqueueModelCallPayload` to an explicit operation-discriminated union consumed by enqueue source.
      * `[ ]`   Extend `AiStreamEventData` to operation-discriminated union aligning with Netlify worker event expectations.
      * `[ ]`   Keep `EnqueueModelCallReturn` success/error union unchanged.
      * `[ ]`   Keep dependency and params interfaces stable except strictly required additive fields.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interaction.spec`
      * `[ ]`   Add interaction-spec file for enqueue sequencing and branch semantics:
         * `[ ]`   validate output/provider/api-key/job-user-id prerequisites.
         * `[ ]`   compute signature.
         * `[ ]`   update job to queued.
         * `[ ]`   build operation-aware event payload.
         * `[ ]`   enforce 500 KB serialized payload guard.
         * `[ ]`   POST to Netlify queue with authorization header.
      * `[ ]`   Define operation branch constraints:
         * `[ ]`   stream operation serializes stream request fields only.
         * `[ ]`   embedding operation serializes embedding request fields only.
      * `[ ]`   Failure modes:
         * `[ ]`   contract/validation failures return non-retriable errors.
         * `[ ]`   DB update failure returns retriable error and aborts fetch.
         * `[ ]`   non-2xx queue response and network errors return retriable errors.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.guard.test.ts`
      * `[ ]`   Add guard tests for operation-aware payload and event shape:
         * `[ ]`   accept valid stream payload/event variant.
         * `[ ]`   accept valid embedding payload/event variant.
         * `[ ]`   reject mixed stream+embedding fields in a single variant.
         * `[ ]`   reject unknown operation discriminator.
      * `[ ]`   Add regression tests for event name literal consistency:
         * `[ ]`   guard accepts `eventName: 'ai-stream-background'`.
         * `[ ]`   guard rejects stale literal values.
      * `[ ]`   Preserve existing deps/params/return guard coverage.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.guard.ts`
      * `[ ]`   Update payload and event guards to enforce operation-discriminated union semantics.
      * `[ ]`   Correct `isAiStreamEventBody` event-name literal to `ai-stream-background`.
      * `[ ]`   Preserve strict validation for `sig` and `user_config.tier_output_cap_tokens`.
      * `[ ]`   Preserve deps and params guard behavior except required operation-aware additions.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.mock.ts`
      * `[ ]`   Add operation-aware payload/event mock factories:
         * `[ ]`   stream payload/event defaults.
         * `[ ]`   embedding payload/event defaults.
         * `[ ]`   override-capable malformed variants for negative tests.
      * `[ ]`   Preserve existing typed defaults for deps/params and queued return fixtures.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.test.ts`
      * `[ ]`   Add RED/GREEN unit coverage for operation-aware enqueue behavior:
         * `[ ]`   stream payload path posts stream event variant and remains queued-success compatible.
         * `[ ]`   embedding payload path posts embedding event variant and remains queued-success compatible.
         * `[ ]`   invalid operation payload is rejected before DB update/fetch.
         * `[ ]`   oversized payload handling remains non-retriable and fetch is not called.
      * `[ ]`   Preserve sequencing assertions that DB queued update occurs before queue fetch on success.
      * `[ ]`   Preserve retriable vs non-retriable classification assertions for failure paths.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts`
      * `[ ]`   Implement operation-aware event-body construction from discriminated enqueue payload.
      * `[ ]`   Keep prerequisite validation order unchanged:
         * `[ ]`   output type validity.
         * `[ ]`   provider config validity.
         * `[ ]`   API key availability.
         * `[ ]`   `job.user_id` presence.
         * `[ ]`   signature compute.
         * `[ ]`   queued DB update before fetch.
      * `[ ]`   Keep event size limit enforcement and queue POST auth/header semantics unchanged.
      * `[ ]`   Preserve existing retriable/non-retriable error mapping semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.provides.ts`
      * `[ ]`   Export operation-aware contract and guard symbols introduced by this node.
      * `[ ]`   Preserve existing exports consumed by prepareModelJob tests and enqueue module consumers.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.integration.test.ts`
      * `[ ]`   Extend integration coverage for producer -> enqueue -> consumer-boundary payload correctness:
         * `[ ]`   stream variant integration path verifies queued DB update and posted stream event shape.
         * `[ ]`   embedding variant integration path verifies queued DB update and posted embedding event shape.
         * `[ ]`   both variants verify event name, signature presence, and operation-consistent request fields.
      * `[ ]`   Keep external boundaries mocked (network + external provider dependencies) while exercising real enqueue implementation and Supabase mock client behavior.

   * `[ ]`   `construction`
      * `[ ]`   Enqueue remains a pure DI function (`deps`, `params`, `payload`) with no hidden singleton dependencies.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains deterministic and preserved by tests.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is Supabase orchestration-to-queue boundary adapter.
      * `[ ]`   Dependencies remain inward-facing from shared guards, signatures, DB client, and env-backed queue config.
      * `[ ]`   Outbound interface remains Netlify event payload boundary.
      * `[ ]`   No new dependency cycles with callback ingest or persistence modules.

   * `[ ]`   `requirements`
      * `[ ]`   Enqueue supports operation-aware stream and embedding queue payload emission.
      * `[ ]`   Existing stream enqueue behavior stays backward-compatible and fully covered.
      * `[ ]`   Queued-state DB transition, signature generation, and payload-size guard remain deterministic.
      * `[ ]`   Guard/interface/mock/unit/integration files prove operation-discriminated contract correctness and failure classification behavior.
      * `[ ]`   Node scope remains limited to `enqueueModelCall.ts` and its immediate support system.

* `[ ]`   supabase/functions/netlifyResponse/netlifyResponseHandler.ts **[BE] Add operation-aware callback ingest branching and typed handoff into saveResponse boundary**

   * `[ ]`   `objective`
      * `[ ]`   Solve callback ingest mismatch where `netlifyResponseHandler` only accepts stream-shaped payloads and cannot safely ingest embedding callback payload variants.
      * `[ ]`   Functional goals:
         * `[ ]`   Extend callback body contracts to explicit operation-discriminated variants.
         * `[ ]`   Preserve HMAC signature verification and job TTL authorization semantics.
         * `[ ]`   Branch request-to-saveResponse payload mapping by operation with deterministic field ownership.
         * `[ ]`   Preserve existing HTTP status semantics for method/JSON/body validation/auth/saveResponse outcomes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Stream callback behavior remains backward-compatible.
         * `[ ]`   Invalid operation/body combinations fail fast with 400 responses before saveResponse invocation.
         * `[ ]`   saveResponse source implementation is not changed in this node.
         * `[ ]`   Boundary wiring in `netlifyResponse/index.ts` remains unchanged in this node.
      * `[ ]`   Each goal is atomic and testable via interface, guard, mock, unit, and integration updates.

   * `[ ]`   `role`
      * `[ ]`   Node role is Supabase callback-ingest handler implementation plus immediate callback support files.
      * `[ ]`   This role is correct because `netlifyResponseHandler.ts` is the first Supabase callback consumer that must interpret operation-aware Netlify payloads before saveResponse source execution.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `saveResponse.ts` source behavior in this node.
         * `[ ]`   Do not edit Netlify worker source behavior in this node.
         * `[ ]`   Do not edit enqueue source behavior in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/netlifyResponse` callback verification and handoff.
      * `[ ]`   Inside boundary:
         * `[ ]`   HTTP body parsing and operation-aware request validation.
         * `[ ]`   Job lookup, signature verification, and TTL authorization.
         * `[ ]`   Operation-specific payload mapping into `SaveResponsePayload` contract variants.
      * `[ ]`   Outside boundary:
         * `[ ]`   Queue payload construction and enqueue state transitions.
         * `[ ]`   saveResponse persistence, debit, continuation, and render-enqueue logic.
         * `[ ]`   Provider adapter execution internals.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../dialectic-worker/saveResponse/saveResponse.interface.ts` and `SaveResponseFn` boundary.
         * `[ ]`   Layer classification: immediate consumer contract.
         * `[ ]`   Direction: callback handler passes validated payload into saveResponse boundary.
         * `[ ]`   Purpose: preserve strict handoff typing for operation-specific callback semantics.
      * `[ ]`   Provider: `../_shared/utils/computeJobSig/computeJobSig.interface.ts`.
         * `[ ]`   Layer classification: shared auth/security utility contract.
         * `[ ]`   Direction: inbound dependency consumed by callback handler.
         * `[ ]`   Purpose: deterministic HMAC verification over persisted job row identity.
      * `[ ]`   Provider: `netlify/functions/ai-stream-background` callback payload contract output.
         * `[ ]`   Layer classification: external producer boundary.
         * `[ ]`   Direction: inbound request consumed by callback handler.
         * `[ ]`   Purpose: ensure operation-aware stream and embedding payload variants are accepted and mapped correctly.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from callback handler into saveResponse source internals.
         * `[ ]`   No lateral layer violations across Supabase workstream B nodes.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `computeJobSig(job.id, job.user_id, job.created_at)` for authorization.
         * `[ ]`   `SaveResponseFn` accepting operation-aware payload union.
         * `[ ]`   `adminClient` read access to `dialectic_generation_jobs` identity fields.
      * `[ ]`   Injection shape remains `NetlifyResponseDeps` with additive operation-aware type support only.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of non-identity DB columns during signature verification.
         * `[ ]`   No hidden coupling to persistence internals beyond `SaveResponseFn` contract.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.test.ts`
      * `[ ]`   Extend contract assertions for operation-aware save-response payload variants consumed by `netlifyResponseHandler`:
         * `[ ]`   valid stream payload variant (assembled content + token usage + finish reason).
         * `[ ]`   valid embedding payload variant (embedding output + embedding token usage + operation discriminator).
         * `[ ]`   reject mixed variant fixtures in type-level contract coverage.
      * `[ ]`   Preserve existing status/dep contract assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.ts`
      * `[ ]`   Introduce explicit operation-discriminated payload union for `SaveResponsePayload`.
      * `[ ]`   Keep `SaveResponseParams`, return union, and dependency contract unchanged.
      * `[ ]`   Preserve existing stream variant field names to maintain backward compatibility.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interface.test.ts`
      * `[ ]`   Add operation-aware callback body contract assertions:
         * `[ ]`   valid stream callback body variant.
         * `[ ]`   valid embedding callback body variant.
         * `[ ]`   invalid unknown operation discriminator variant.
         * `[ ]`   invalid mixed variant fields.
      * `[ ]`   Preserve dependency-surface and handler-signature contract assertions.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interface.ts`
      * `[ ]`   Convert `NetlifyResponseBody` into explicit operation-discriminated union.
      * `[ ]`   Keep `NetlifyResponseDeps` and `NetlifyResponseHandlerFn` signatures stable.
      * `[ ]`   Ensure callback body union aligns to updated `SaveResponsePayload` contract variants.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interaction.spec`
      * `[ ]`   Add interaction-spec file capturing callback flow and branching:
         * `[ ]`   method gate and JSON parse gate.
         * `[ ]`   operation-aware body guard gate.
         * `[ ]`   job lookup and signature/TTL authorization.
         * `[ ]`   stream-to-saveResponse payload mapping.
         * `[ ]`   embedding-to-saveResponse payload mapping.
      * `[ ]`   Define failure modes:
         * `[ ]`   invalid method/JSON/body shape -> deterministic 4xx.
         * `[ ]`   signature mismatch or expired job -> deterministic 401.
         * `[ ]`   saveResponse error return -> 503 for retriable, 500 for non-retriable.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.guard.test.ts`
      * `[ ]`   Add guard coverage for operation-aware body variants:
         * `[ ]`   accept valid stream callback body.
         * `[ ]`   accept valid embedding callback body.
         * `[ ]`   reject missing operation discriminator.
         * `[ ]`   reject unknown operation discriminator.
         * `[ ]`   reject mixed stream and embedding fields in one payload.
      * `[ ]`   Preserve dependency guard coverage for computeJobSig/adminClient/saveResponse/saveResponseDeps.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.guard.ts`
      * `[ ]`   Update callback body guard to enforce operation-discriminated union semantics.
      * `[ ]`   Keep dependency guard semantics unchanged.
      * `[ ]`   Preserve strict object-shape gating and null/non-object rejection behavior.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.mock.ts`
      * `[ ]`   Add operation-aware callback body fixtures and factories:
         * `[ ]`   stream callback body default fixture.
         * `[ ]`   embedding callback body default fixture.
         * `[ ]`   malformed mixed/unknown-operation fixtures for negative tests.
      * `[ ]`   Preserve dependency mock factory behavior and saveResponse default mock.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponseHandler.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for operation-aware handler branching:
         * `[ ]`   valid stream callback body -> maps stream variant to saveResponse and returns 200 on success.
         * `[ ]`   valid embedding callback body -> maps embedding variant to saveResponse and returns 200 on success.
         * `[ ]`   invalid operation/mixed fields -> returns 400 and does not call saveResponse.
      * `[ ]`   Preserve existing tests for method, JSON parsing, signature mismatch, TTL expiration, and saveResponse retriable classification.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponseHandler.ts`
      * `[ ]`   Implement operation-aware callback body handling after guard validation.
      * `[ ]`   Preserve existing authorization flow order:
         * `[ ]`   DB identity lookup.
         * `[ ]`   compute expected signature.
         * `[ ]`   constant-time signature mismatch check.
         * `[ ]`   TTL expiry check.
      * `[ ]`   Build and pass operation-specific `SaveResponsePayload` variant to `saveResponse`.
      * `[ ]`   Preserve existing HTTP response mapping for saveResponse success/retriable/non-retriable returns.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.integration.test.ts`
      * `[ ]`   Extend integration coverage for producer-callback-consumer boundary behavior:
         * `[ ]`   valid stream callback path verifies 200 and saveResponse invocation.
         * `[ ]`   valid embedding callback path verifies 200 and saveResponse invocation.
         * `[ ]`   invalid signature path verifies 401 and no saveResponse invocation.
         * `[ ]`   invalid body variant path verifies 400 and no saveResponse invocation.
      * `[ ]`   Keep external boundaries mocked while exercising real callback handler logic and mock Supabase client behavior.

   * `[ ]`   `construction`
      * `[ ]`   `netlifyResponseHandler` remains a pure DI function over `NetlifyResponseDeps` and `Request`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization and execution order remain deterministic and test-covered.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is callback boundary adapter between Netlify worker output and saveResponse input.
      * `[ ]`   Dependencies remain inward-facing from shared security utility, admin DB client, and saveResponse contract.
      * `[ ]`   Outbound boundary remains saveResponse invocation plus HTTP response semantics.
      * `[ ]`   No dependency cycle is introduced with enqueue source or saveResponse source.

   * `[ ]`   `requirements`
      * `[ ]`   Callback handler accepts and validates operation-aware stream and embedding callback payload variants.
      * `[ ]`   Signature verification and TTL authorization behavior remain unchanged and fully covered.
      * `[ ]`   Handler maps each valid operation variant into the updated saveResponse payload contract without mixed-field ambiguity.
      * `[ ]`   Interface/guard/mock/unit/integration files prove deterministic 200/400/401/503/500 behavior remains correct.
      * `[ ]`   Node scope remains limited to `netlifyResponseHandler.ts` and immediate support contracts; `saveResponse.ts` source work remains in the next node.

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveResponse.ts **[BE] Implement operation-aware persistence branching for stream and embedding results with canonical artifact identity preservation**

   * `[ ]`   `objective`
      * `[ ]`   Solve persistence mismatch where `saveResponse.ts` is stream-content-centric and cannot correctly persist embedding callback payload variants without ambiguous field interpretation.
      * `[ ]`   Functional goals:
         * `[ ]`   Add operation-aware processing branch so stream and embedding payload variants are interpreted deterministically.
         * `[ ]`   Preserve existing stream continuation/retry/finalization behavior and canonical file identity contracts.
         * `[ ]`   Persist embedding outputs in a deterministic, typed form consumable by downstream retrieval/indexing paths.
         * `[ ]`   Preserve token debit semantics and job status transitions for both operation paths.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Keep existing stream regression surface stable (continuation, path context, plan validation, notifications, raw-json paths).
         * `[ ]`   Reject malformed operation payload variants with explicit non-retriable errors at guard/validation boundary.
         * `[ ]`   Do not modify callback handler authorization logic in this node.
         * `[ ]`   Do not modify enqueue source behavior in this node.
      * `[ ]`   Each goal is atomic and testable through interface, guard, mock, unit, and integration coverage within saveResponse scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is persistence orchestration implementation and complete immediate support system for `saveResponse.ts`.
      * `[ ]`   This role is correct because `saveResponse.ts` is the Workstream B consumer of operation-aware callback payload contracts and producer of persisted contribution state.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `netlifyResponseHandler.ts` source behavior in this node.
         * `[ ]`   Do not edit Netlify worker source behavior in this node.
         * `[ ]`   Do not edit gatherArtifacts/applyInputs/processComplexJob sources in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/saveResponse` persistence, continuation, and completion orchestration.
      * `[ ]`   Inside boundary:
         * `[ ]`   Payload validation and operation-specific transformation into persistence artifacts.
         * `[ ]`   Debit/retry/continue/finalization control flow.
         * `[ ]`   Contribution upload context assembly and canonical-path-safe artifact persistence.
      * `[ ]`   Outside boundary:
         * `[ ]`   Callback request authorization and signature validation.
         * `[ ]`   Queue enqueue event construction.
         * `[ ]`   Later resume-consumption overlay logic in downstream workstreams.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./saveResponse.interface.ts` and `./saveResponse.guard.ts`.
         * `[ ]`   Layer classification: local contract and runtime boundary producer.
         * `[ ]`   Direction: consumed by `saveResponse.ts` and its tests.
         * `[ ]`   Purpose: enforce operation-discriminated payload shape before persistence orchestration.
      * `[ ]`   Provider: `../createJobContext/JobContext.interface.ts` deps (`continueJob`, `retryJob`, `determineContinuation`, etc.).
         * `[ ]`   Layer classification: orchestration dependency contracts.
         * `[ ]`   Direction: inbound dependencies consumed by saveResponse implementation.
         * `[ ]`   Purpose: preserve existing continuation and retry behavior for stream path.
      * `[ ]`   Provider: `_shared` file manager/path/type guards/json sanitizer/debit utilities.
         * `[ ]`   Layer classification: shared infrastructure utilities.
         * `[ ]`   Direction: inbound dependencies consumed by persistence implementation.
         * `[ ]`   Purpose: canonical pathing, safe parse/sanitize, debit accounting, and contribution registration.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from saveResponse into callback handler source logic.
         * `[ ]`   No lateral layer violations with enqueue module boundaries.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `SaveResponsePayload` operation-discriminated union from prior node.
         * `[ ]`   `fileManager.uploadAndRegisterFile` + `assembleAndSaveFinalDocument` canonical persistence boundary.
         * `[ ]`   debit/retry/continue function contracts with existing return semantics.
      * `[ ]`   Injection shape remains `SaveResponseDeps`, `SaveResponseParams`, `SaveResponsePayload` with additive operation fields only.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB/project state beyond existing validated requirements.
         * `[ ]`   No hidden coupling to netlifyResponse request envelope.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.test.ts`
      * `[ ]`   Finalize operation-aware contract assertions for `SaveResponsePayload` and `SaveResponseRequestBody`:
         * `[ ]`   valid stream payload variant contract.
         * `[ ]`   valid embedding payload variant contract.
         * `[ ]`   invalid mixed-field and unknown-operation fixtures rejected at contract level.
      * `[ ]`   Preserve existing deps and return-contract assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.ts`
      * `[ ]`   Keep operation-discriminated `SaveResponsePayload` contract aligned with callback node updates.
      * `[ ]`   Add any strictly required embedding payload subtypes used by saveResponse implementation.
      * `[ ]`   Preserve `SaveResponseDeps`, params, and return unions unchanged unless required by operation-specific persistence behavior.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interaction.spec`
      * `[ ]`   Add interaction-spec file defining operation-aware saveResponse semantics:
         * `[ ]`   shared preconditions (job/provider/session validation).
         * `[ ]`   stream branch continuation/retry/finalization sequencing.
         * `[ ]`   embedding branch persistence sequencing and completion semantics.
         * `[ ]`   debit and notification side-effect expectations per branch.
      * `[ ]`   Define failure modes:
         * `[ ]`   contract invalidity -> non-retriable error return.
         * `[ ]`   DB/provider/session lookup failures -> non-retriable error return.
         * `[ ]`   debit transient failure -> retriable error return.
         * `[ ]`   malformed content in stream branch -> retry path with existing semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.guard.test.ts`
      * `[ ]`   Extend payload/request guard coverage for operation-discriminated variants:
         * `[ ]`   accept valid stream payload variant.
         * `[ ]`   accept valid embedding payload variant.
         * `[ ]`   reject mixed stream+embedding fields.
         * `[ ]`   reject missing/unknown operation discriminator.
      * `[ ]`   Preserve dependency and return guard coverage.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.guard.ts`
      * `[ ]`   Implement operation-aware request/payload guard logic consistent with updated interface contracts.
      * `[ ]`   Preserve strict type checks for token usage and return guards.
      * `[ ]`   Keep `SaveResponseDeps` guard semantics unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.mock.ts`
      * `[ ]`   Add operation-aware payload/request mock builders:
         * `[ ]`   stream defaults used by existing tests.
         * `[ ]`   embedding defaults for new branch coverage.
         * `[ ]`   malformed override fixtures for negative guard/unit tests.
      * `[ ]`   Preserve existing dependency and contribution fixture factories.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.test.ts`
      * `[ ]`   Add RED/GREEN unit coverage for operation-aware core behavior:
         * `[ ]`   stream branch remains backward-compatible with existing success/retry/continuation expectations.
         * `[ ]`   embedding branch persists embedding result path with deterministic completion semantics.
         * `[ ]`   invalid operation payload returns non-retriable error before persistence side effects.
      * `[ ]`   Preserve existing enqueueRenderJob dispatch gating coverage.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.continue.test.ts`
      * `[ ]`   Keep stream continuation regression suite green with operation-aware payload defaults.
      * `[ ]`   Add targeted assertions that embedding payload variants do not enter stream continuation branch logic.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.pathContext.test.ts`
      * `[ ]`   Preserve canonical path/deconstructor behavior for stream document artifacts.
      * `[ ]`   Assert operation-aware branching does not mutate stream path-context semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.planValidation.test.ts`
      * `[ ]`   Preserve plan-validation behavior for header-context/document artifact stream paths.
      * `[ ]`   Add operation-branch assertions ensuring embedding payloads bypass stream-plan JSON validation paths where not applicable.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.rawJsonOnly.test.ts`
      * `[ ]`   Preserve raw-json stream behavior and sanitization/retry semantics.
      * `[ ]`   Ensure embedding branch does not regress raw-json stream-only expectations.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.notifications.test.ts`
      * `[ ]`   Preserve existing notification semantics for stream completion/continuation/retry.
      * `[ ]`   Add explicit notification expectations for embedding completion path (or explicit no-op where required by current product semantics).

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.assembleDocument.test.ts`
      * `[ ]`   Preserve terminal assembly behavior for stream document artifacts.
      * `[ ]`   Verify embedding branch does not call stream-only final-document assembly paths.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.integration.test.ts`
      * `[ ]`   Extend integration coverage for operation-aware persistence boundary behavior:
         * `[ ]`   stream integration path remains green for completion/retry/continuation.
         * `[ ]`   embedding integration path validates deterministic persistence and status behavior.
         * `[ ]`   malformed operation payload integration path returns non-retriable error and avoids side effects.
      * `[ ]`   Keep external boundaries mocked while exercising real saveResponse orchestration.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.ts`
      * `[ ]`   Implement operation-aware branching after payload guard pass.
      * `[ ]`   Preserve current stream sequencing for validation, sanitization, continuation determination, debit, and finalization.
      * `[ ]`   Add embedding processing path that:
         * `[ ]`   validates embedding payload fields.
         * `[ ]`   persists embedding-related contribution output using canonical identity-safe pathing.
         * `[ ]`   applies debit/status/notification handling deterministically.
      * `[ ]`   Preserve existing success/error return union semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.provides.ts`
      * `[ ]`   Export any new operation-aware payload/request types, guards, and mock builders introduced by this node.
      * `[ ]`   Preserve existing public exports consumed by `netlifyResponse` and test surfaces.

   * `[ ]`   `construction`
      * `[ ]`   `saveResponse` remains a pure DI function over deps/params/payload.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Branch initialization order is deterministic and test-covered.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is persistence orchestration boundary between callback ingest contract and contribution storage domain.
      * `[ ]`   Dependencies remain inward-facing from shared utilities and continuation/retry/debit interfaces.
      * `[ ]`   Outbound effects remain DB/file-manager/notification side effects behind existing dependency interfaces.
      * `[ ]`   No new dependency cycle introduced with enqueue or callback handler modules.

   * `[ ]`   `requirements`
      * `[ ]`   saveResponse supports operation-aware stream and embedding payload variants with deterministic branch semantics.
      * `[ ]`   Existing stream continuation and canonical artifact identity behavior remains intact and fully covered.
      * `[ ]`   Embedding persistence path is explicitly typed, validated, and integration-tested.
      * `[ ]`   Guard/interface/mock/unit/integration surfaces are synchronized to operation-aware contracts.
      * `[ ]`   Node scope remains limited to `saveResponse.ts` and its immediate support system in this module.

   * `[ ]`   **Commit** `feat(supabase-worker): complete operation-aware callback ingest and save-response persistence routing`
      * `[ ]`   Structural changes:
         * `[ ]`   `enqueueModelCall`, `netlifyResponseHandler`, and `saveResponse` contract surfaces are operation-aware and aligned across Supabase callback boundaries.
         * `[ ]`   Interface, guard, mock, unit, and integration files for Workstream B source nodes are synchronized to operation-discriminated payload semantics.
      * `[ ]`   Behavioral changes:
         * `[ ]`   Supabase callback flow accepts operation-aware payloads, authorizes deterministically, and maps branch-specific payloads into persistence orchestration.
         * `[ ]`   saveResponse persistence and completion paths now support stream and embedding branches while preserving existing stream continuation/retry behavior.
      * `[ ]`   Contract changes:
         * `[ ]`   Supabase queue event and callback payload shapes now encode explicit operation discrimination and branch-safe field ownership.
         * `[ ]`   saveResponse payload and runtime guards enforce operation-specific shape validity and reject mixed/invalid variants.

* `[ ]`   supabase/functions/_shared/services/file_manager.ts **[BE] Persist compression summary artifacts as first-class resources with canonical identity metadata and deterministic registration semantics**

   * `[ ]`   `objective`
      * `[ ]`   Solve the artifact-registration gap where compression summaries can be uploaded as generic resources but are not enforced as a strict, queryable contract for resume/overlay workflows.
      * `[ ]`   Functional goals:
         * `[ ]`   Introduce explicit upload-context contract for `FileType.RagContextSummary` in `file_manager` type layer, including required metadata fields for downstream resolution.
         * `[ ]`   Enforce runtime validation in `uploadAndRegisterFile` so rag summary uploads are rejected unless required identity metadata is present.
         * `[ ]`   Persist deterministic `dialectic_project_resources` rows for rag summaries with stable `resource_type` and structured `resource_description` keys consumed by later nodes.
         * `[ ]`   Preserve existing behavior for `GeneralResource`, `SeedPrompt`, `ProjectExportZip`, and model contribution upload paths.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regressions to upload retry behavior (`MAX_TRANSIENT_RETRIES`) and collision handling (`MAX_UPLOAD_ATTEMPTS`) already covered by `file_manager.errors.test.ts` and `file_manager.upload.test.ts`.
         * `[ ]`   No changes to path-construction algorithms in `path_constructor.ts` or path parsing in `path_deconstructor.ts` in this node.
         * `[ ]`   No callback/enqueue/netlify worker edits in this node.
      * `[ ]`   Each goal is atomic and testable through updated type-guard, unit, and integration coverage for `file_manager` boundaries.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared storage-registration boundary implementation and immediate support system for `file_manager.ts`.
      * `[ ]`   This role is correct because `file_manager.ts` is the first Workstream C source file that writes storage objects and DB metadata rows used later by compression writer and resume overlay consumers.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not implement artifact consume/overlay logic (`gatherArtifacts`, `applyInputsRequiredScope`, `processComplexJob`) in this node.
         * `[ ]`   Do not implement compression prompt production logic (`compressPrompt.ts`) in this node.
         * `[ ]`   Do not alter render decision semantics (`shouldEnqueueRenderJob`) beyond required non-regression assertions.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/services/file_manager.ts` and its immediate type/guard/test support files.
      * `[ ]`   Inside boundary:
         * `[ ]`   upload input typing and runtime narrowing for resource uploads.
         * `[ ]`   resource row persistence payload shaping (`resource_type`, `resource_description`, `storage_path`, `file_name`).
         * `[ ]`   service-level error behavior for missing/invalid compression artifact metadata.
      * `[ ]`   Outside boundary:
         * `[ ]`   canonical path segment construction details (handled by `path_constructor.ts` node).
         * `[ ]`   canonical path parsing/deconstruction details (handled by `path_deconstructor.ts` node).
         * `[ ]`   orchestration of compression attempts and parent resume.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/types/file_manager.types.ts`.
         * `[ ]`   Layer classification: local contract producer.
         * `[ ]`   Direction: consumed by `file_manager.ts`, guards, and tests.
         * `[ ]`   Purpose: define strict metadata shape for rag summary upload context.
      * `[ ]`   Provider: `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts`.
         * `[ ]`   Layer classification: runtime boundary guard producer.
         * `[ ]`   Direction: consumed by `file_manager.ts` and tests.
         * `[ ]`   Purpose: narrow resource upload contexts and enforce compression-artifact-specific contract.
      * `[ ]`   Provider: `supabase/functions/_shared/utils/path_constructor.ts` (read-only in this node).
         * `[ ]`   Layer classification: shared infra helper dependency.
         * `[ ]`   Direction: consumed unchanged by `file_manager.ts`.
         * `[ ]`   Purpose: preserve canonical storage path construction while registration contract is strengthened.
      * `[ ]`   Provider: Supabase storage + `dialectic_project_resources` persistence boundary.
         * `[ ]`   Layer classification: external infrastructure dependency.
         * `[ ]`   Direction: inbound dependency used by `uploadAndRegisterFile`.
         * `[ ]`   Purpose: persist artifact files and metadata rows deterministically.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `_shared/services/file_manager.ts` into dialectic-worker orchestration modules.
         * `[ ]`   No lateral coupling introduced with netlify worker adapters.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   existing `constructStoragePath` signature and return shape (`storagePath`, `fileName`) only.
         * `[ ]`   existing Supabase storage upload/remove and table upsert interfaces only.
         * `[ ]`   existing shared type-guard helpers (`isRecord`, context guards) with additive rag-summary guard coverage.
      * `[ ]`   Injection shape remains `new FileManagerService(supabaseClient, { constructStoragePath, logger, assembleChunks })` with no constructor-surface expansion.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB tables for rag summary persistence.
         * `[ ]`   No hidden coupling to downstream enqueue/callback payload formats.

   * `[ ]`   `supabase/functions/_shared/types/file_manager.types.ts`
      * `[ ]`   Add `FileType.RagContextSummary` as a discriminated union variant of `ResourceUploadContext` that requires `resourceDescriptionForDb` with the following fields:
         * `[ ]`   `target_document_id: string` — the `dialectic_project_resources.id` of the exact source document row that was compressed; matched against `gathered_doc.id` by the overlay consumer.
         * `[ ]`   `target_document_key: string` — the `document_key` of the source document; used for human-readable diagnostics.
         * `[ ]`   `source_fingerprint: string` — SHA-256 hex digest of the source document content at compression time; used by the overlay consumer to verify the artifact is still fresh before applying; must be a non-empty string.         
         * `[ ]`   `compressed_by_model_id: string` — the `api_identifier` of the model that produced the compression.
         * `[ ]`   `compressed_for_job_id: string` — the `id` of the job that triggered compression.
      * `[ ]`   Add/extend resource upload context union so `FileType.RagContextSummary` requires this metadata contract at type level.
      * `[ ]`   Preserve existing `UploadContext` behavior for non-rag resource file types.

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.test.ts`
      * `[ ]`   Add guard coverage for new rag summary context/type contract:
         * `[ ]`   accept valid rag summary context with complete required metadata.
         * `[ ]`   reject rag summary context missing `target_document_id` equivalent identity field.
         * `[ ]`   reject rag summary context missing source fingerprint metadata.
         * `[ ]`   reject rag summary context with empty string `source_fingerprint`.         
         * `[ ]`   reject malformed metadata primitive types (non-string identity, non-object metadata container).
      * `[ ]`   Preserve existing guard assertions for non-rag resource/model/feedback contexts.

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts`
      * `[ ]`   Implement runtime guard logic for rag summary metadata completeness and primitive-type correctness.
      * `[ ]`   Ensure `isResourceContext` narrowing remains backward-compatible for non-rag resource types.
      * `[ ]`   Keep `isModelContributionContext`, `isUserFeedbackContext`, `isModelContributionFileType`, and document-key guards unchanged except strictly required additive type compatibility.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.mock.ts`
      * `[ ]`   Add rag summary upload fixture factory helpers with override support for required metadata fields.
      * `[ ]`   Add malformed rag summary fixtures used by negative tests (missing identity, missing fingerprint, invalid metadata types).
      * `[ ]`   Preserve existing default mock behavior for `uploadAndRegisterFile`, `getFileSignedUrl`, and `assembleAndSaveFinalDocument`.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.upload.test.ts`
      * `[ ]`   Add RED/GREEN unit tests for rag summary registration path:
         * `[ ]`   valid rag summary upload writes storage object and upserts `dialectic_project_resources` row with expected `resource_type` and metadata keys.
         * `[ ]`   valid rag summary upload preserves caller-provided canonical identity fields verbatim in persisted `resource_description`.
         * `[ ]`   rag summary missing required metadata returns explicit `FileManagerError` and removes uploaded blob when DB insert is blocked.
         * `[ ]`   rag summary malformed metadata type returns explicit error before successful registration side effects.
      * `[ ]`   Preserve existing tests for project resources, seed prompt resources, model contribution uploads, and feedback flows.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.errors.test.ts`
      * `[ ]`   Extend transient/non-transient retry regression suite to include rag summary registration failure surfaces:
         * `[ ]`   transient storage failure on rag summary upload retries bounded times then errors.
         * `[ ]`   non-transient validation failure for rag summary metadata does not retry.
         * `[ ]`   transient DB insert error for rag summary row retries bounded times then errors.
      * `[ ]`   Preserve existing retry count contracts and constants alignment assertions.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.getFile.test.ts`
      * `[ ]`   Add signed URL retrieval assertion for rag summary resource table rows to prove retrieval contract parity with other resource types.
      * `[ ]`   Preserve existing not-found and storage-signing error behavior assertions.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.assemble.test.ts`
      * `[ ]`   Add non-regression assertion that rag summary registration changes do not alter `assembleAndSaveFinalDocument` JSON assembly path semantics.
      * `[ ]`   Preserve existing chunk chain, merged JSON object, upload destination, and `is_latest_edit` update behavior assertions.

   * `[ ]`   `supabase/integration_tests/services/file_manager.integration.test.ts`
      * `[ ]`   Add integration scenario proving end-to-end rag summary persistence:
         * `[ ]`   upload rag summary via `FileManagerService.uploadAndRegisterFile`.
         * `[ ]`   assert storage object exists at returned canonical path.
         * `[ ]`   assert `dialectic_project_resources` row contains expected `resource_type` and structured identity/fingerprint metadata.
         * `[ ]`   assert non-rag resource and contribution persistence scenarios remain green.

   * `[ ]`   `supabase/integration_tests/services/file_manager.assemble.integration.test.ts`
      * `[ ]`   Add non-regression assertion that introducing rag summary registration contract does not break final document assembly integration workflow.
      * `[ ]`   Preserve existing execute/continue/assemble call chain semantics and output assertions.

   * `[ ]`   `supabase/integration_tests/services/file_manager.assembleChunks.integration.test.ts`
      * `[ ]`   Add non-regression assertion that real `assembleChunks` integration behavior remains unchanged after rag summary registration additions.
      * `[ ]`   Preserve existing schema-fill placeholder and merged JSON parity checks.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.ts`
      * `[ ]`   Implement strict rag summary upload validation and registration branch within `uploadAndRegisterFile` resource path:
         * `[ ]`   reject rag summary uploads missing required identity/fingerprint metadata.
         * `[ ]`   persist normalized rag summary metadata keys in `resource_description` for downstream deterministic lookup.
         * `[ ]`   keep existing resource upsert key (`storage_bucket,storage_path,file_name`) and cleanup-on-failure behavior.
      * `[ ]`   Preserve existing upload retry/collision logic, contribution insert/update logic, feedback upsert logic, and signed URL/assembly method behavior.

   * `[ ]`   `construction`
      * `[ ]`   `FileManagerService` construction remains unchanged: explicit dependencies (`constructStoragePath`, `logger`, `assembleChunks`) and env bucket requirement.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains env bucket validation before storage operations.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared infrastructure service boundary.
      * `[ ]`   Dependencies remain inward-facing from shared types/guards/path utils and Supabase clients.
      * `[ ]`   Outbound effects remain storage/database writes via existing interfaces.
      * `[ ]`   No cycles introduced with dialectic-worker orchestration sources.

   * `[ ]`   `requirements`
      * `[ ]`   Rag context summary artifacts are first-class typed uploads with mandatory canonical identity and freshness metadata.
      * `[ ]`   Runtime validation rejects incomplete/malformed rag summary metadata before successful registration.
      * `[ ]`   Persisted resource rows expose deterministic metadata fields required by later overlay-consumer nodes.
      * `[ ]`   Existing file manager behavior for non-rag resource uploads, model contributions, feedback, signed URLs, and assembly remains unchanged and covered by regression tests.
      * `[ ]`   Node scope remains limited to `file_manager.ts` and its immediate support system; path constructor/deconstructor source changes remain in subsequent Workstream C nodes.

* `[ ]`   supabase/functions/_shared/utils/path_constructor.ts **[BE] Extend RagContextSummary path construction to encode target document identity and prevent cross-document filename collisions within a stage**

   * `[ ]`   `objective`
      * `[ ]`   Solve the RagContextSummary filename collision gap where multiple compression artifacts targeting different documents within the same session/iteration/stage produce identical storage paths, making per-target artifact lookup and stale-artifact freshness enforcement impossible.
      * `[ ]`   Functional goals:
         * `[ ]`   Require `documentKey` in `constructStoragePath` for `FileType.RagContextSummary` so the target document identity is encoded in every compression artifact filename.
         * `[ ]`   Update the RagContextSummary filename pattern from `{modelSlug}_compressing_{sourceModelSlugs}_rag_summary.txt` to `{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt`.
         * `[ ]`   Produce a deterministic, descriptive error when `documentKey` is absent or empty from a `RagContextSummary` path context, before any path string concatenation.
         * `[ ]`   Apply `sanitizeForPath` to `documentKey` using the same mechanism already applied to `modelSlug` and `sourceModelSlugs`.
         * `[ ]`   Preserve all existing non-RagContextSummary path construction behavior unchanged.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regressions to any existing file type path construction or round-trip assertions in `path_constructor.test.ts`, `path_constructor.fragment.test.ts`, or `path_constructor.continuation.test.ts`.
         * `[ ]`   No changes to `path_deconstructor.ts` in this node; the RagContextSummary round-trip integration test covering the new filename format will be RED until the next Workstream C node updates the deconstructor.
         * `[ ]`   No changes to `file_manager.types.ts` PathContext interface; the existing optional `documentKey: string` field is reused as the target document identity carrier for RagContextSummary.
         * `[ ]`   No changes to `file_manager.ts` upload logic in this node.
      * `[ ]`   Each goal is atomic and testable through updated and new test coverage in `path_constructor.test.ts` and the new `path_constructor.integration.test.ts`.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared path-construction utility implementation update and its immediate test and documentation files.
      * `[ ]`   This role is correct because `path_constructor.ts` is the single canonical source of truth for deterministic storage path and filename generation; all artifact identity encoding must originate here before any upload, row registration, or downstream lookup.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not update `path_deconstructor.ts` to parse the new `_for_{documentKey}` filename segment in this node.
         * `[ ]`   Do not update `compressPrompt.ts` to supply `documentKey` in its `PathContext` in this node.
         * `[ ]`   Do not update `file_manager.ts` upload validation or registration logic in this node.
         * `[ ]`   Do not update `gatherArtifacts.ts` or `prepareModelJob.ts` artifact lookup logic in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/path_constructor.ts` and its immediate test and documentation files.
      * `[ ]`   Inside boundary:
         * `[ ]`   Canonical filename pattern for every `FileType` including the updated `RagContextSummary` pattern.
         * `[ ]`   Validation rules enforcing required `PathContext` fields per file type, including the new `documentKey` requirement for `RagContextSummary`.
         * `[ ]`   Path-segment construction helpers: `sanitizeForPath`, `generateShortId`, `mapStageSlugToDirName`.
      * `[ ]`   Outside boundary:
         * `[ ]`   Storage upload execution and retry logic.
         * `[ ]`   Path parsing and deconstruction logic (`path_deconstructor.ts`).
         * `[ ]`   Orchestration, artifact retrieval, and overlay logic in worker nodes.
         * `[ ]`   Database row registration and resource metadata persistence.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../types/file_manager.types.ts` (`FileType`, `PathContext`).
         * `[ ]`   Layer classification: shared type contract producer.
         * `[ ]`   Direction: inbound; consumed by path constructor for type discriminants and context field access.
         * `[ ]`   Purpose: `FileType.RagContextSummary` case discriminant; `PathContext.documentKey` field reused as target document identity for the updated filename pattern.
      * `[ ]`   Provider: `./path_utils.ts` (`extractSourceGroupFragment`).
         * `[ ]`   Layer classification: shared utility helper.
         * `[ ]`   Direction: inbound; consumed unchanged by non-RagContextSummary path cases.
         * `[ ]`   Purpose: source group fragment extraction for antithesis and synthesis intermediate artifact paths.
      * `[ ]`   Provider: `./type-guards/type_guards.file_manager.ts` (`isDocumentKey`).
         * `[ ]`   Layer classification: shared runtime guard.
         * `[ ]`   Direction: inbound; consumed unchanged for document-key file type validation.
         * `[ ]`   Purpose: identify document file types that require `documentKey` for the top-of-function validation block.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required from `PathContext` for the RagContextSummary case:
         * `[ ]`   `documentKey: string` — non-empty; reused as the canonical target document identity in the updated filename.
         * `[ ]`   `sourceModelSlugs: string[]` — non-empty array sorted alphabetically before sanitization and join.
         * `[ ]`   `modelSlug: string` — the compression model producing the summary.
         * `[ ]`   `sessionId`, `iteration`, `stageSlug`, `projectId` — unchanged; supply the `stageRootPath` segment that prefixes the `_work` storage directory.
      * `[ ]`   No new PathContext fields introduced; all required fields already exist on the interface.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of PathContext fields beyond what is required for RagContextSummary path construction.
         * `[ ]`   No hidden coupling to upload context, database row structures, or orchestration payloads.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.test.ts`
      * `[ ]`   Update the existing `FileType.RagContextSummary` entry in the `fileTypeTestCases` array:
         * `[ ]`   Add `documentKey: documentKey` (the file-scoped constant `'executive_summary'`) to the context object built for `RagContextSummary`.
         * `[ ]`   The expected `fileName` in the round-trip assertion must now match `{modelSlug}_compressing_{sourceModelSlugs}_for_executive_summary_rag_summary.txt` where `{sourceModelSlugs}` is the sorted, sanitized, `_and_`-joined result of the file-scoped `sourceModelSlugs` constant.
      * `[ ]`   Add standalone unit test: `RagContextSummary with documentKey produces identity-encoded filename`:
         * `[ ]`   `context`: `projectId: 'proj-1'`, `sessionId: 'session-uuid-4567890'`, `iteration: 1`, `stageSlug: 'synthesis'`, `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro']`, `documentKey: 'business_case'`, `fileType: FileType.RagContextSummary`.
         * `[ ]`   Assert `fileName === 'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_for_business_case_rag_summary.txt'`.
         * `[ ]`   Assert `storagePath` ends with `/_work` (full value: `proj-1/session_{shortId}/iteration_1/3_synthesis/_work`).
      * `[ ]`   Add standalone unit test: `RagContextSummary without documentKey throws descriptive error`:
         * `[ ]`   `context`: valid synthesis stage context with `modelSlug`, non-empty `sourceModelSlugs`, and all session fields, but `documentKey` omitted entirely.
         * `[ ]`   Assert `constructStoragePath` throws an error whose message contains both the string `'documentKey'` and the string `'rag_context_summary'`.
      * `[ ]`   Add standalone unit test: `RagContextSummary with empty string documentKey throws descriptive error`:
         * `[ ]`   `context`: same as above but `documentKey: ''`.
         * `[ ]`   Assert `constructStoragePath` throws with message containing `'documentKey'` and `'rag_context_summary'`.
      * `[ ]`   Add standalone unit test: `RagContextSummary documentKey is sanitized before insertion into filename`:
         * `[ ]`   `context`: valid RagContextSummary context with `documentKey: 'My Complex Key!!'`.
         * `[ ]`   Assert the resulting `fileName` contains `'_for_my_complex_key_'` (the output of `sanitizeForPath('My Complex Key!!')` is `'my_complex_key'`).
      * `[ ]`   Add standalone unit test: `Two RagContextSummary contexts identical except documentKey produce distinct filenames`:
         * `[ ]`   Construct `contextA` with `documentKey: 'business_case'` and `contextB` with `documentKey: 'feature_spec'`, all other fields identical.
         * `[ ]`   Assert `constructStoragePath(contextA).fileName !== constructStoragePath(contextB).fileName`.
      * `[ ]`   Preserve all existing assertions and the full `fileTypeTestCases` array round-trip test loop for all other file types unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.ts`
      * `[ ]`   In the `FileType.RagContextSummary` switch case body:
         * `[ ]`   Confirm `documentKey` is already destructured from `context` at the top of `constructStoragePath`; it is — no new destructuring is needed.
         * `[ ]`   Extend the existing guard condition from:
            `if (!stageRootPath || !modelSlugSanitized || !sourceModelSlugs || sourceModelSlugs.length === 0)`
            to:
            `if (!stageRootPath || !modelSlugSanitized || !sourceModelSlugs || sourceModelSlugs.length === 0 || !documentKey || typeof documentKey !== 'string' || documentKey.trim() === '')`
         * `[ ]`   Update the thrown error message to: `'Required context missing for rag_context_summary: stageRootPath, modelSlug, sourceModelSlugs (non-empty array), and documentKey (non-empty string) are all required.'`
         * `[ ]`   Add `const documentKeySanitized = sanitizeForPath(documentKey);` immediately after the guard block, before the `sourceModelSlugsSanitized` derivation line.
         * `[ ]`   Update the `fileName` construction from:
            `` const fileName = `${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_rag_summary.txt`; ``
            to:
            `` const fileName = `${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_for_${documentKeySanitized}_rag_summary.txt`; ``
         * `[ ]`   Keep the `return { storagePath: \`${stageRootPath}/_work\`, fileName }` statement unchanged.
      * `[ ]`   Keep all other switch cases, the top-of-function `isDocumentKey` validation block, and all helper functions (`sanitizeForPath`, `generateShortId`, `mapStageSlugToDirName`) unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.readme.md`
      * `[ ]`   In the `RAG Context Summary` subsection under `### Utility Artifacts`:
         * `[ ]`   Update `Primitive` line from `{model_slug}_compressing_{source_model_slugs}_rag_summary.txt` to `{model_slug}_compressing_{source_model_slugs}_for_{document_key}_rag_summary.txt`.
         * `[ ]`   Update `Example` line from `gpt-4-turbo_compressing_claude-3-opus_and_gpt-4-turbo_rag_summary.txt` to `gpt-4-turbo_compressing_claude-3-opus_and_gpt-4-turbo_for_business_case_rag_summary.txt`.
         * `[ ]`   Update `Rationale` to: `Describes the action (compressing) and the sources being compressed. The \`_for_{document_key}\` segment encodes the target document identity so that multiple compression artifacts for different documents within the same session/iteration/stage have distinct filenames and can be individually retrieved and freshness-checked. Placed in the \`_work\` directory as it is a machine-only artifact.`
      * `[ ]`   Preserve all other sections of the readme unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.integration.test.ts`
      * `[ ]`   Create this new file to prove the `constructStoragePath` → `deconstructStoragePath` round-trip for the updated RagContextSummary filename pattern.
      * `[ ]`   This test file will be in RED state until `path_deconstructor.ts` is updated in the next Workstream C node to parse the `_for_{documentKey}` segment.
      * `[ ]`   Test: `RagContextSummary constructStoragePath and deconstructStoragePath are inverses for new filename pattern`:
         * `[ ]`   Call `constructStoragePath` with `projectId: 'proj-abc'`, `sessionId: 'session-uuid-4567890'`, `iteration: 1`, `stageSlug: 'synthesis'`, `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro']`, `documentKey: 'business_case'`, `fileType: FileType.RagContextSummary`.
         * `[ ]`   Assemble the full storage path as `${storagePath}/${fileName}`.
         * `[ ]`   Call `deconstructStoragePath` on the assembled full path.
         * `[ ]`   Assert `deconstructedInfo.fileTypeGuess === FileType.RagContextSummary`.
         * `[ ]`   Assert `deconstructedInfo.originalProjectId === 'proj-abc'`.
         * `[ ]`   Assert `deconstructedInfo.modelSlug === 'gpt-4-turbo'`.
         * `[ ]`   Assert `deconstructedInfo.sourceModelSlugs` deep-equals `['claude-3-opus', 'gemini-1.5-pro']` (sorted).
         * `[ ]`   Assert `deconstructedInfo.documentKey === 'business_case'` (this assertion drives the RED state until path_deconstructor is updated).
      * `[ ]`   Test: `RagContextSummary round-trip preserves different documentKey values distinctly`:
         * `[ ]`   Run the same round-trip for `documentKey: 'feature_spec'` and assert `deconstructedInfo.documentKey === 'feature_spec'`.
      * `[ ]`   Import `constructStoragePath` from `./path_constructor.ts` and `deconstructStoragePath` from `./path_deconstructor.ts`; no external service calls.

   * `[ ]`   `construction`
      * `[ ]`   `constructStoragePath` remains a pure function; it accepts a `PathContext` value object and returns a `ConstructedPath` value object with no side effects.
      * `[ ]`   No partial construction paths are introduced.
      * `[ ]`   `documentKey` must be a non-empty string for `FileType.RagContextSummary`; an absent or empty value causes an explicit throw before any path string concatenation.
      * `[ ]`   Initialization order within the RagContextSummary case: guard check → `documentKeySanitized` derivation → `sourceModelSlugsSanitized` derivation → `fileName` assembly → return.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared path-construction utility (`_shared/utils`).
      * `[ ]`   Dependencies remain inward-facing from shared type contracts, path utilities, and runtime guards.
      * `[ ]`   Outputs remain outward-facing `ConstructedPath` values consumed upstream by `file_manager.ts` for upload path construction and downstream by `path_deconstructor.ts` for round-trip parsing.
      * `[ ]`   No cycles introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `constructStoragePath` for `FileType.RagContextSummary` with a valid `documentKey` produces a `fileName` matching `{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKeySanitized}_rag_summary.txt` and a `storagePath` of `{stageRootPath}/_work`.
      * `[ ]`   `constructStoragePath` for `FileType.RagContextSummary` with absent or empty `documentKey` throws an error whose message contains both `'documentKey'` and `'rag_context_summary'`.
      * `[ ]`   `sanitizeForPath` is applied to `documentKey` before filename assembly, producing the same safety guarantees as for `modelSlug` and each `sourceModelSlug`.
      * `[ ]`   Two `RagContextSummary` contexts with identical model/sources/session/stage fields but different `documentKey` values produce distinct `fileName` values.
      * `[ ]`   All existing `path_constructor.test.ts`, `path_constructor.fragment.test.ts`, and `path_constructor.continuation.test.ts` assertions remain GREEN.
      * `[ ]`   The new `path_constructor.integration.test.ts` round-trip assertions are RED until `path_deconstructor.ts` is updated in the next Workstream C node.
      * `[ ]`   Node scope remains limited to `path_constructor.ts` and its immediate test and documentation files; `path_deconstructor.ts` source changes remain in the next Workstream C node.

* `[ ]`   supabase/functions/_shared/utils/path_deconstructor.ts **[BE] Update RagContextSummary path parsing to extract target document identity from the new `_for_{documentKey}` filename segment**

   * `[ ]`   `objective`
      * `[ ]`   Solve the RagContextSummary deconstruction gap where the existing regex cannot parse the new `{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt` filename format introduced by the path_constructor node, leaving `documentKey` unparsed and the `path_constructor.integration.test.ts` round-trip assertions in RED state.
      * `[ ]`   Functional goals:
         * `[ ]`   Update `ragSummaryPatternString` to add a `_for_(.+)` capture group between the sourceModelSlugs segment and `_rag_summary.txt` so that `documentKey` is extracted as a distinct named result.
         * `[ ]`   Populate `info.documentKey` from the new capture group in the RagContextSummary matching block.
         * `[ ]`   Keep `info.sourceModelSlugs` split from `matches[6]` using the existing `_and_` delimiter (group index shifts by one new group).
         * `[ ]`   Turn the `path_constructor.integration.test.ts` round-trip assertions GREEN by correctly parsing the new format.
         * `[ ]`   Preserve all other file-type matching behavior unchanged.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No regressions to any existing non-RagContextSummary deconstruction assertions in `path_deconstructor.test.ts`, `path_deconstructor.fragment.test.ts`, or `path_deconstructor.continuation.test.ts`.
         * `[ ]`   Old-format RagContextSummary paths (without `_for_{documentKey}`) will no longer match the new regex and will fall through to a generic `_work` pattern; this is intentional because path_constructor now requires documentKey for all new RagContextSummary artifacts and no old-format artifacts are in scope for resume/overlay consumption.
         * `[ ]`   No changes to `path_deconstructor.types.ts`; `DeconstructedPathInfo.documentKey?: string` already exists.
         * `[ ]`   No changes to `path_constructor.ts` in this node.
      * `[ ]`   Each goal is atomic and testable through updated and new assertions in `path_deconstructor.test.ts` and the now-GREEN `path_constructor.integration.test.ts`.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared path-parsing utility implementation update and its immediate test files.
      * `[ ]`   This role is correct because `path_deconstructor.ts` is the single canonical source of truth for parsing storage paths back into structured identity fields; only it can resolve the new `_for_{documentKey}` segment into `DeconstructedPathInfo.documentKey`.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not update `compressPrompt.ts` or any consumer that supplies `documentKey` to the path context in this node.
         * `[ ]`   Do not update `gatherArtifacts.ts` or `prepareModelJob.ts` artifact lookup logic in this node.
         * `[ ]`   Do not alter `path_constructor.ts` in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/path_deconstructor.ts` and its immediate test files.
      * `[ ]`   Inside boundary:
         * `[ ]`   All regex pattern strings and their corresponding `matches` blocks.
         * `[ ]`   The `ragSummaryPatternString` regex and its match handler.
         * `[ ]`   Population of `DeconstructedPathInfo` fields from captured regex groups.
      * `[ ]`   Outside boundary:
         * `[ ]`   Storage upload execution and path construction algorithms.
         * `[ ]`   Artifact retrieval, overlay, and resume logic in worker nodes.
         * `[ ]`   Database row registration and metadata persistence.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../types/file_manager.types.ts` (`FileType`).
         * `[ ]`   Layer classification: shared type contract producer.
         * `[ ]`   Direction: inbound; consumed by deconstructor for `FileType.RagContextSummary` assignment in `info.fileTypeGuess`.
         * `[ ]`   Purpose: unchanged; `FileType.RagContextSummary` enum value assigned to `fileTypeGuess` after a successful match.
      * `[ ]`   Provider: `./path_deconstructor.types.ts` (`DeconstructedPathInfo`).
         * `[ ]`   Layer classification: local type contract producer.
         * `[ ]`   Direction: inbound; defines the output shape populated by the deconstructor.
         * `[ ]`   Purpose: `documentKey?: string` field already present; no additions required.
      * `[ ]`   Provider: `./type_guards.ts` (`isContributionType`).
         * `[ ]`   Layer classification: shared runtime guard helper.
         * `[ ]`   Direction: inbound; consumed unchanged by non-RagContextSummary path branches.
         * `[ ]`   Purpose: unchanged; contribution type validation for intermediate work file branches.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal interface required from `DeconstructedPathInfo` for the RagContextSummary case:
         * `[ ]`   `documentKey?: string` — populated from new regex group 7 (the value between `_for_` and `_rag_summary.txt`).
         * `[ ]`   `sourceModelSlugs?: string[]` — populated from regex group 6, split by `'_and_'` (unchanged semantics, group index remains 6).
         * `[ ]`   `modelSlug?: string`, `originalProjectId?`, `shortSessionId?`, `iteration?`, `stageDirName?`, `stageSlug?`, `fileTypeGuess?` — populated unchanged from groups 1–5.
      * `[ ]`   No new fields required on `DeconstructedPathInfo`; all fields already exist.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of path segments beyond the updated RagContextSummary pattern.
         * `[ ]`   No hidden coupling to upload context or orchestration payloads.

   * `[ ]`   `supabase/functions/_shared/utils/path_deconstructor.test.ts`
      * `[ ]`   Update the `'[path_deconstructor] direct - rag_context_summary'` test:
         * `[ ]`   Add `documentKey: 'executive_summary'` to the `context` object so that `constructStoragePath` generates the new `_for_executive_summary` format.
         * `[ ]`   Add assertion: `assertEquals(info.documentKey, 'executive_summary')`.
         * `[ ]`   Add assertion: `assertEquals(info.sourceModelSlugs, ['model-a', 'model-b'])`.
         * `[ ]`   Keep all existing assertions (`originalProjectId`, `shortSessionId`, `iteration`, `stageSlug`, `fileTypeGuess`, `error`) unchanged.
      * `[ ]`   Update the parameterized `'rag_context_summary'` case in the test matrix:
         * `[ ]`   Add `documentKey: 'business_case'` to the context object.
         * `[ ]`   Update `expectedFixedFileNameInPath` from `'text-embedder_compressing_model-a_and_model-b_rag_summary.txt'` to `'text-embedder_compressing_model-a_and_model-b_for_business_case_rag_summary.txt'`.
      * `[ ]`   Add standalone unit test: `RagContextSummary direct parse extracts documentKey from new format`:
         * `[ ]`   Construct `fullPath` directly as: `'proj-rcs/session_sessrcsuu/iteration_1/3_synthesis/_work/model-embed_compressing_model-a_and_model-b_for_business_case_rag_summary.txt'` (using `generateShortId('sess-rcs-uuid')` for the short session ID segment).
         * `[ ]`   Split into `storageDir` and `fileName` at the last `/`.
         * `[ ]`   Call `deconstructStoragePath({ storageDir, fileName })`.
         * `[ ]`   Assert `info.fileTypeGuess === FileType.RagContextSummary`.
         * `[ ]`   Assert `info.documentKey === 'business_case'`.
         * `[ ]`   Assert `info.sourceModelSlugs` deep-equals `['model-a', 'model-b']`.
         * `[ ]`   Assert `info.modelSlug === 'model-embed'`.
         * `[ ]`   Assert `info.error === undefined`.
      * `[ ]`   Add standalone unit test: `RagContextSummary extracts multi-part documentKey containing underscores`:
         * `[ ]`   Construct `fullPath` with `documentKey: 'business_case_critique'` by calling `constructStoragePath` with a valid context including `documentKey: 'business_case_critique'` and `fileType: FileType.RagContextSummary`.
         * `[ ]`   Call `deconstructStoragePath` on the assembled path.
         * `[ ]`   Assert `info.documentKey === 'business_case_critique'`.
         * `[ ]`   Assert `info.fileTypeGuess === FileType.RagContextSummary`.
      * `[ ]`   Add standalone unit test: `RagContextSummary old format (without _for_ segment) does not match as RagContextSummary`:
         * `[ ]`   Construct `fullPath` in the OLD format: `'proj-old/session_sessolduu/iteration_1/3_synthesis/_work/model-embed_compressing_model-a_and_model-b_rag_summary.txt'` (no `_for_` segment).
         * `[ ]`   Call `deconstructStoragePath({ storageDir, fileName })`.
         * `[ ]`   Assert `info.fileTypeGuess !== FileType.RagContextSummary` (old format no longer parsed as RagContextSummary; it falls through to a generic `_work` pattern).
         * `[ ]`   Assert `info.documentKey === undefined`.
      * `[ ]`   Preserve all other direct and parameterized test assertions unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_deconstructor.ts`
      * `[ ]`   Update the `ragSummaryPatternString` declaration from:
         `"^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/([^_]+)_compressing_(.+)_rag_summary\\.txt$"`
         to:
         `"^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/([^_]+)_compressing_(.+)_for_(.+)_rag_summary\\.txt$"`
         so that group 6 captures sourceModelSlugs (everything between `_compressing_` and `_for_`) and group 7 captures documentKey (everything between `_for_` and `_rag_summary.txt`).
      * `[ ]`   In the `ragSummaryPatternString` match block, update the comment from:
         `// Path: .../_work/{modelSlug}_compressing_{source_model_slugs}_rag_summary.txt`
         to:
         `// Path: .../_work/{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt`
      * `[ ]`   In the `ragSummaryPatternString` match block, add the following line after `info.sourceModelSlugs = matches[6].split('_and_');`:
         `info.documentKey = matches[7]; // Target document identity encoded in the filename`
      * `[ ]`   Keep all other lines in the RagContextSummary match block (`originalProjectId`, `shortSessionId`, `iteration`, `stageDirName`, `stageSlug`, `modelSlug`, `sourceModelSlugs`, `fileTypeGuess`, and `return info`) unchanged; only the regex string and the new `documentKey` assignment are modified.
      * `[ ]`   Keep all other pattern strings and match blocks unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `deconstructStoragePath` remains a pure function over `{ storageDir, fileName, dbOriginalFileName? }` returning `DeconstructedPathInfo` with no side effects.
      * `[ ]`   No partial construction paths are introduced.
      * `[ ]`   Initialization order within the RagContextSummary match block: project/session/iteration/stage fields from groups 1–4 → modelSlug from group 5 → sourceModelSlugs from group 6 split by `'_and_'` → documentKey from group 7 → fileTypeGuess assignment → return.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared path-parsing utility (`_shared/utils`).
      * `[ ]`   Dependencies remain inward-facing from shared type contracts and guards.
      * `[ ]`   Outputs remain outward-facing `DeconstructedPathInfo` values consumed by artifact retrieval and overlay logic in later Workstream C and D nodes.
      * `[ ]`   No cycles introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `deconstructStoragePath` for a RagContextSummary path in the new `_for_{documentKey}` format correctly populates `info.documentKey`, `info.sourceModelSlugs`, `info.modelSlug`, `info.fileTypeGuess`, and all session/stage fields.
      * `[ ]`   `info.sourceModelSlugs` is produced by splitting group 6 on `'_and_'`, preserving the existing split semantics; only the group index changes because a new capture group was inserted.
      * `[ ]`   `info.documentKey` correctly round-trips for documentKey values containing underscores (e.g., `'business_case_critique'`).
      * `[ ]`   Old-format RagContextSummary paths (without `_for_`) do not match the updated regex and produce `fileTypeGuess !== FileType.RagContextSummary`.
      * `[ ]`   All existing `path_deconstructor.test.ts`, `path_deconstructor.fragment.test.ts`, and `path_deconstructor.continuation.test.ts` assertions remain GREEN.
      * `[ ]`   The `path_constructor.integration.test.ts` assertions introduced in the prior node — including `deconstructedInfo.documentKey === 'business_case'` — are now GREEN.
      * `[ ]`   Node scope remains limited to `path_deconstructor.ts` and its immediate test files; `compressPrompt.ts` and `prepareModelJob.ts` changes remain in subsequent Workstream C nodes.

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Persist each successful RAG context summary to canonical artifact storage and include resource identity references in the compression return value**

   * `[ ]`   `objective`
      * `[ ]`   Solve the compression artifact persistence gap where `compressPrompt.ts` produces a RAG context summary string in memory but does not write it to canonical storage or register a `dialectic_project_resources` row, leaving the compressed summary unreachable by any parent-resume overlay consumer.
      * `[ ]`   Functional goals:
         * `[ ]`   After each successful `ragService.getContextForModel()` call for a `sourceType === "document"` victim, call `deps.fileManager.uploadAndRegisterFile()` with a `ResourceUploadContext` whose `pathContext.fileType` is `FileType.RagContextSummary`, `pathContext.documentKey` is the victim document's `document_key`, `pathContext.sourceModelSlugs` is `[params.extendedModelConfig.api_identifier]` (the model being compressed for), and `pathContext.modelSlug` is `params.embeddingModelSlug` (the embedding model generating the summary).
         * `[ ]`   Collect each persisted artifact's `resourceId` (from `uploadResult.record.id`) and `documentKey` into a `ragArtifacts: RagArtifactRef[]` array and include it in the `CompressPromptSuccessReturn`.
         * `[ ]`   If `fileManager.uploadAndRegisterFile()` returns an error for any document victim, return a `CompressPromptErrorReturn` immediately, aborting the compression loop.
         * `[ ]`   Do not call `uploadAndRegisterFile` for `sourceType === "history"` victims; their content is already ephemeral session context and has no stable document identity.
         * `[ ]`   Add `projectId: string`, `iteration: number`, and `embeddingModelSlug: string` to `CompressPromptParams` so the `PathContext` for each artifact can be fully constructed.
         * `[ ]`   Add `fileManager: IFileManager` to `CompressPromptDeps` as the injection point for artifact storage.
         * `[ ]`   Export a `RagArtifactRef` interface from `compressPrompt.interface.ts` and from `compressPrompt.provides.ts`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No changes to `path_constructor.ts`, `path_deconstructor.ts`, `file_manager.ts`, `prepareModelJob.ts`, or `IFileManager`.
         * `[ ]`   All existing `compressPrompt.test.ts`, `compressPrompt.interface.test.ts`, `compressPrompt.guard.test.ts` assertions remain GREEN (no regressions); existing tests that use `buildCompressPromptDeps` and `buildCompressPromptParams` adopt new defaults via updated builders.
         * `[ ]`   The wallet debit idempotency key `rag:{jobId}:{candidateId}` and its semantics are unchanged.
         * `[ ]`   No silent swallow of persist errors; every file manager failure surfaces as a `CompressPromptErrorReturn` with `retriable: false`.
      * `[ ]`   Each goal is atomic and testable through updated and new assertions in `compressPrompt.test.ts` and `compressPrompt.guard.test.ts`.

   * `[ ]`   `role`
      * `[ ]`   Node role is compression worker implementation update and its full bounded-context file set (interface, guard, mock, test, source, provides).
      * `[ ]`   This role is correct because `compressPrompt.ts` is the sole execution site where a RAG summary string is produced; only it can initiate artifact persistence at the canonical point of production.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify `prepareModelJob.ts` to consume `ragArtifacts` in this node; that is the next Workstream C node.
         * `[ ]`   Do not modify `gatherArtifacts.ts` or overlay resolution logic in this node.
         * `[ ]`   Do not modify `file_manager.ts` or its interface in this node.
         * `[ ]`   Do not add `model_slug` to `ResourceDocument` in this node; `sourceModelSlugs` is derived from the injected `extendedModelConfig.api_identifier`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/compressPrompt/` (all seven files in that directory).
      * `[ ]`   Inside boundary:
         * `[ ]`   The `CompressPromptDeps`, `CompressPromptParams`, `CompressPromptSuccessReturn`, and `RagArtifactRef` type contracts.
         * `[ ]`   The `isCompressPromptDeps`, `isCompressPromptParams`, and `isCompressPromptSuccessReturn` runtime guards.
         * `[ ]`   The `buildCompressPromptDeps`, `buildCompressPromptParams`, and `buildCompressPromptSuccessReturn` mock builders.
         * `[ ]`   The `compressPrompt` function and its artifact-persistence loop.
      * `[ ]`   Outside boundary:
         * `[ ]`   File manager upload logic, storage bucket configuration, and transient retry handling.
         * `[ ]`   Parent-resume overlay resolution in `prepareModelJob.ts`.
         * `[ ]`   Embedding model selection and indexing strategy.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../../_shared/services/file_manager.mock.ts` (`MockFileManagerService`, `createMockFileManagerService`).
         * `[ ]`   Layer classification: test-only mock producer.
         * `[ ]`   Direction: inbound; used in `compressPrompt.mock.ts` and `compressPrompt.test.ts` to provide a configurable `IFileManager` spy for artifact persistence assertions.
         * `[ ]`   Purpose: allows tests to spy on `uploadAndRegisterFile` calls and configure success/error responses per test case.
      * `[ ]`   Provider: `../../_shared/types/file_manager.types.ts` (`IFileManager`, `ResourceUploadContext`, `FileType`).
         * `[ ]`   Layer classification: shared type contract producer.
         * `[ ]`   Direction: inbound; `IFileManager` is added to `CompressPromptDeps`; `ResourceUploadContext` is constructed in the compression loop; `FileType.RagContextSummary` is the `pathContext.fileType`.
         * `[ ]`   Purpose: defines the storage abstraction interface and the upload context shape that `compressPrompt.ts` constructs before calling `fileManager.uploadAndRegisterFile`.
      * `[ ]`   Provider: `../../_shared/types.ts` (`AiModelExtendedConfig`).
         * `[ ]`   Layer classification: shared type contract producer.
         * `[ ]`   Direction: inbound; `extendedModelConfig.api_identifier` is read to populate `pathContext.sourceModelSlugs`.
         * `[ ]`   Purpose: unchanged consumer; `api_identifier` is a new read site for the embedding model path context.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.
         * `[ ]`   `compressPrompt.ts` does not import from `path_constructor.ts` or `path_deconstructor.ts` directly; path construction is fully encapsulated inside `fileManager.uploadAndRegisterFile`.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal interface required from `IFileManager` for this node:
         * `[ ]`   `uploadAndRegisterFile(context: UploadContext): Promise<FileManagerResponse>` — called once per `sourceType === "document"` victim after successful RAG; returns `{ record: FileRecord; error: null }` on success or `{ record: null; error: FileManagerError }` on failure.
      * `[ ]`   Minimal fields read from `dialectic_project_resources.Row` (via `FileRecord`):
         * `[ ]`   `id: string` — the `resourceId` stored in `RagArtifactRef`; common to all `FileRecord` union members.
      * `[ ]`   Minimal new fields on `CompressPromptParams`:
         * `[ ]`   `projectId: string` — used as `pathContext.projectId`.
         * `[ ]`   `iteration: number` — used as `pathContext.iteration`.
         * `[ ]`   `embeddingModelSlug: string` — used as `pathContext.modelSlug`; identifies the embedding model generating the summary.
      * `[ ]`   Minimal new field on `CompressPromptDeps`:
         * `[ ]`   `fileManager: IFileManager`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of schema fields beyond `id`.
         * `[ ]`   No hidden coupling to job results or payload shape of calling contexts.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.test.ts`
      * `[ ]`   Update `buildCompressPromptSuccessReturn` calls to include `ragArtifacts: []` in the value argument (via the updated builder).
      * `[ ]`   Add assertion in the `'valid single candidate compressed outcome shape'` test: `assertEquals(Array.isArray(result.ragArtifacts), true)`.
      * `[ ]`   Preserve all other contract assertions unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.interface.ts`
      * `[ ]`   Add import: `import type { IFileManager } from "../../_shared/types/file_manager.types.ts";`
      * `[ ]`   Add `fileManager: IFileManager` to `CompressPromptDeps`.
      * `[ ]`   Add `projectId: string`, `iteration: number`, `embeddingModelSlug: string` to `CompressPromptParams`.
      * `[ ]`   Add new exported interface:
         ```typescript
         export interface RagArtifactRef {
           documentKey: string;
           resourceId: string | null;
         }
         ```
      * `[ ]`   Extend `CompressPromptSuccessReturn` with `ragArtifacts: RagArtifactRef[]`.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.ts`
      * `[ ]`   Add `isRecord(value.fileManager)` check to `isCompressPromptDeps` (after the existing `tokenWalletService` check) so that a missing or non-object `fileManager` causes the guard to return `false`.
      * `[ ]`   Add string checks for `projectId`, `iteration` (number), and `embeddingModelSlug` (string) to `isCompressPromptParams` (after the existing `walletBalance` check).
      * `[ ]`   Add `ragArtifacts` array check to `isCompressPromptSuccessReturn`: `if (!("ragArtifacts" in value) || !Array.isArray(value.ragArtifacts)) { return false; }`.
      * `[ ]`   Keep all other checks in all three guards unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.guard.test.ts`
      * `[ ]`   Update the `isCompressPromptDeps` test: the existing negative case that omits `countTokens` should also omit `fileManager`; add a new negative case that includes all existing fields plus `countTokens` but omits `fileManager` (assert returns `false`).
      * `[ ]`   Update the `isCompressPromptParams` test: the existing negative case supplying all-but-walletBalance should also include `projectId`, `iteration`, `embeddingModelSlug`; add a new negative case that includes all existing plus new fields but sets `projectId` to a number (assert returns `false`).
      * `[ ]`   Update the `isCompressPromptSuccessReturn` test: update `buildCompressPromptSuccessReturn` call (via mock) to include `ragArtifacts: []`; add a negative case that omits `ragArtifacts` (assert returns `false`).
      * `[ ]`   Preserve all existing positive-case and negative-case assertions; add the new negative cases alongside.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.mock.ts`
      * `[ ]`   Add import: `import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";`
      * `[ ]`   Extend `CompressPromptDepsOverrides` type with `fileManager?: IFileManager`.
      * `[ ]`   In `buildCompressPromptDeps`: add `fileManager` to the returned object, defaulting to a `createMockFileManagerService()` instance configured via `setUploadAndRegisterFileResponse({ id: 'mock-rag-resource-id', ... }, null)` for a success response (providing a minimal `dialectic_project_resources.Row`-compatible object with at least `id: 'mock-rag-resource-id'`).
      * `[ ]`   Extend `CompressPromptParamsOverrides` type with `projectId?: string`, `iteration?: number`, `embeddingModelSlug?: string`.
      * `[ ]`   In `buildCompressPromptParams`: add `projectId`, `iteration`, `embeddingModelSlug` to the returned object with defaults `'contract-project-id'`, `1`, and `'text-embedding-3-small'` respectively.
      * `[ ]`   In `buildCompressPromptSuccessReturn`: add `ragArtifacts: value.ragArtifacts ?? []` to the returned object.
      * `[ ]`   Keep all existing exported symbols and their signatures unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.test.ts`
      * `[ ]`   Add import: `import { createMockFileManagerService } from "../../_shared/services/file_manager.mock.ts";`
      * `[ ]`   All existing tests continue to pass because `buildCompressPromptDeps` now includes a default mock `fileManager` that returns a success response.
      * `[ ]`   Add standalone test: `document victim artifact is persisted via fileManager after successful RAG compression`:
         * `[ ]`   Create `MockFileManagerService` via `createMockFileManagerService()`; call `setUploadAndRegisterFileResponse` with a minimal record object containing `id: 'rag-res-1'`.
         * `[ ]`   Configure `MockRagService` with `mockContextResult: "compressed-text"`, `mockTokensUsed: 50`.
         * `[ ]`   Set up one document victim whose `document_key` is `'business_case'` and `sourceType` is `"document"`.
         * `[ ]`   Call `compressPrompt` with these deps, a params object including `projectId: 'proj-test'`, `iteration: 1`, `embeddingModelSlug: 'text-embedding-3-small'`, and a strategy returning the one victim.
         * `[ ]`   Assert result is `CompressPromptSuccessReturn`.
         * `[ ]`   Assert `fileManagerMock.uploadAndRegisterFile.calls.length === 1`.
         * `[ ]`   Assert the call argument's `pathContext.fileType === FileType.RagContextSummary`.
         * `[ ]`   Assert the call argument's `pathContext.documentKey === 'business_case'`.
         * `[ ]`   Assert the call argument's `pathContext.modelSlug === 'text-embedding-3-small'`.
         * `[ ]`   Assert `fileManagerMock.uploadAndRegisterFile.calls[0].args[0].resourceDescriptionForDb.target_document_id === victimDoc.id`.
         * `[ ]`   Assert `fileManagerMock.uploadAndRegisterFile.calls[0].args[0].resourceDescriptionForDb.target_document_key === 'business_case'`.
         * `[ ]`   Assert `typeof fileManagerMock.uploadAndRegisterFile.calls[0].args[0].resourceDescriptionForDb.source_fingerprint === 'string'` and the value is a non-empty 64-character lowercase hex string.         
         * `[ ]`   Assert `result.ragArtifacts.length === 1`.
         * `[ ]`   Assert `result.ragArtifacts[0].documentKey === 'business_case'`.
         * `[ ]`   Assert `result.ragArtifacts[0].resourceId === 'rag-res-1'`.
      * `[ ]`   Add standalone test: `history victim does not trigger fileManager call and ragArtifacts is empty`:
         * `[ ]`   Create `MockFileManagerService` via `createMockFileManagerService()`.
         * `[ ]`   Set up one history victim with `sourceType: "history"` (construct a `Messages` entry in `conversationHistory` matching the victim's `id`).
         * `[ ]`   Call `compressPrompt` with `MockRagService` returning `"compressed-history"`.
         * `[ ]`   Assert result is `CompressPromptSuccessReturn`.
         * `[ ]`   Assert `fileManagerMock.uploadAndRegisterFile.calls.length === 0`.
         * `[ ]`   Assert `result.ragArtifacts.length === 0`.
      * `[ ]`   Add standalone test: `fileManager failure on document victim returns CompressPromptErrorReturn`:
         * `[ ]`   Create `MockFileManagerService` via `createMockFileManagerService()`; call `setUploadAndRegisterFileResponse(null, { message: 'storage unavailable' })` to simulate failure.
         * `[ ]`   Set up one document victim.
         * `[ ]`   Call `compressPrompt` with `MockRagService` returning a valid context string.
         * `[ ]`   Assert result is `CompressPromptErrorReturn`.
         * `[ ]`   Assert `result.retriable === false`.
         * `[ ]`   Assert `result.error.message` includes the victim document's `document_key`.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts`
      * `[ ]`   Add imports:
         * `[ ]`   `import type { IFileManager, ResourceUploadContext, FileType as FileTypePkg } from "../../_shared/types/file_manager.types.ts";` (import `FileType` directly from `file_manager.types.ts` as the canonical enum; use existing `FileType` import if already present in the file, otherwise add it).
         * `[ ]`   Add `RagArtifactRef` to the import from `"./compressPrompt.interface.ts"`.
      * `[ ]`   At the top of the `compressPrompt` function body (after existing variable declarations), declare `const collectedArtifacts: RagArtifactRef[] = [];`.
      * `[ ]`   In the `payload.compressionStrategy(...)` call, change the second argument from `{ inputsRelevance: params.inputsRelevance }` to `{ inputsRelevance: params.inputsRelevance, embeddingModelApiIdentifier: params.embeddingModelSlug }`.
      * `[ ]`   In the compression `while` loop, inside the `victim.sourceType !== "history"` branch where `docIndex > -1`, immediately BEFORE `resourceDocuments[docIndex].content = newContent;`:
         * `[ ]`   Look up the victim document: `const victimDoc = resourceDocuments.find((d) => d.id === victim.id);`
         * `[ ]`   If `victimDoc` is defined, compute the source fingerprint from the original content before it is overwritten: `const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(victimDoc.content)))).map(b => b.toString(16).padStart(2, '0')).join('');`
         * `[ ]`   Then execute `resourceDocuments[docIndex].content = newContent;` to apply the compressed content.
         * `[ ]`   If `victimDoc` is defined (reuse the already-resolved reference):
            ```typescript
            const uploadCtx: ResourceUploadContext = {
              pathContext: {
                fileType: FileType.RagContextSummary,
                projectId: params.projectId,
                sessionId: params.sessionId,
                iteration: params.iteration,
                stageSlug: params.stageSlug,
                modelSlug: params.embeddingModelSlug,
                sourceModelSlugs: [params.extendedModelConfig.api_identifier],
                documentKey: victimDoc.document_key,
              },
              fileContent: newContent,
              mimeType: 'text/plain',
              sizeBytes: new TextEncoder().encode(newContent).length,
              userId: params.projectOwnerUserId,
              description: `RAG context summary for ${victimDoc.document_key} (job ${params.jobId})`,
              resourceDescriptionForDb: {
                target_document_id: victimDoc.id,
                target_document_key: victimDoc.document_key,
                source_fingerprint: sourceHash,
                compressed_by_model_id: params.extendedModelConfig.api_identifier,
                compressed_for_job_id: params.jobId,
              },
            };
      * `[ ]`   In the final success `return` statement, extend the return object with `ragArtifacts: collectedArtifacts`.
      * `[ ]`   Keep all existing logic (wallet debit, history enforcement, message assembly, token counting, context window checks, affordability checks) exactly as-is; only the document persist block and the final return shape change.

   * `[ ]`   `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.provides.ts`
      * `[ ]`   Add `RagArtifactRef` to the `export type { ... }` block from `"./compressPrompt.interface.ts"`.
      * `[ ]`   Keep all other exports unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `compressPrompt` remains a pure async function over `(deps, params, payload)` with no global state; all new state lives in `collectedArtifacts` within the function scope.
      * `[ ]`   Artifact persistence is attempted strictly AFTER the content replacement in `resourceDocuments[docIndex]`, so if persist fails, the in-memory content has been replaced but we abort immediately with an error — the caller is responsible for not using a partial success.
      * `[ ]`   Initialization order for each document victim: RAG call → wallet debit → content replacement → persistence → ref collection → loop continue.
      * `[ ]`   History victims still undergo RAG call and wallet debit but skip persistence; their compression loop body is unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker execution utility.
      * `[ ]`   `IFileManager` is a shared-service dependency; consuming it from a worker utility is a downward call through the shared layer.
      * `[ ]`   `compressPrompt.ts` does not import from `prepareModelJob.ts` or any other worker utility; no peer-layer lateral coupling is introduced.
      * `[ ]`   The `ragArtifacts` on `CompressPromptSuccessReturn` flows outward to callers; the next consumer (`prepareModelJob.ts`) will read these references in the subsequent Workstream C node.

   * `[ ]`   `requirements`
      * `[ ]`   After successful RAG compression of a document victim, `fileManager.uploadAndRegisterFile` is called exactly once with `pathContext.fileType === FileType.RagContextSummary`, `pathContext.documentKey` equal to the victim's `document_key`, `pathContext.modelSlug` equal to `params.embeddingModelSlug`, and `pathContext.sourceModelSlugs` equal to `[params.extendedModelConfig.api_identifier]`.
      * `[ ]`   History victims do not trigger `uploadAndRegisterFile`; `ragArtifacts` is empty when only history victims are compressed.
      * `[ ]`   A `fileManager.uploadAndRegisterFile` failure for any document victim causes `compressPrompt` to return a `CompressPromptErrorReturn` with `retriable: false` and an error message including the victim's `document_key`.
      * `[ ]`   The `ragArtifacts` array in `CompressPromptSuccessReturn` has one entry per successfully persisted document victim, each containing `documentKey` and `resourceId`.
      * `[ ]`   `isCompressPromptDeps` returns `false` when `fileManager` is absent or non-object.
      * `[ ]`   `isCompressPromptParams` returns `false` when `projectId`, `iteration`, or `embeddingModelSlug` is absent or of the wrong type.
      * `[ ]`   `isCompressPromptSuccessReturn` returns `false` when `ragArtifacts` is absent or not an array.
      * `[ ]`   All previously passing tests in `compressPrompt.test.ts`, `compressPrompt.guard.test.ts`, and `compressPrompt.interface.test.ts` remain GREEN; no regression to existing compression, debit, token-count, or context-window behavior.
      * `[ ]`   Node scope covers all seven files in `supabase/functions/dialectic-worker/compressPrompt/`; `prepareModelJob.ts` changes remain in the next Workstream C node.

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Thread projectId, iteration, and embeddingModelSlug from CalculateAffordabilityParams into CompressPromptParams construction to satisfy the updated compression artifact persistence contract**

   * `[ ]`   `objective`
      * `[ ]`   Solve the `calculateAffordability` params gap where `calculateAffordability.ts` constructs `CompressPromptParams` and calls `deps.compressPrompt` but does not supply `projectId`, `iteration`, or `embeddingModelSlug` — fields now required by `compressPrompt.ts` for artifact path construction and embedding model identification.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `projectId: string`, `iteration: number`, and `embeddingModelSlug: string` to `CalculateAffordabilityParams`.
         * `[ ]`   Thread the three new fields from `params` into the `compressParams` object constructed in the oversized execution path before `deps.compressPrompt` is called.
         * `[ ]`   Add runtime guards for the three new fields in `isCalculateAffordabilityParams`.
         * `[ ]`   Add default values for the three new fields in `buildCalculateAffordabilityParams` so all existing callers compile and run without changes.
         * `[ ]`   Add unit test coverage asserting the three new fields are passed to `deps.compressPrompt` in the oversized path.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No change to affordability logic: NSF detection, rationality thresholds, context window checks, token counting, `getMaxOutputTokens` calls, and direct-return paths are unchanged.
         * `[ ]`   All existing tests in `calculateAffordability.test.ts`, `calculateAffordability.guard.test.ts`, `calculateAffordability.interface.test.ts`, and `calculateAffordability.integration.test.ts` remain GREEN.
         * `[ ]`   No edits to `compressPrompt.ts`, `prepareModelJob.ts`, or any file outside the `calculateAffordability/` folder in this node.
      * `[ ]`   Each goal is atomic and testable through updated interface, guard, mock, unit, and integration assertions in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is consumer params update: `calculateAffordability.ts` is a cross-cutting consumer of `BoundCompressPromptFn` and must supply the updated `CompressPromptParams` contract established by the prior Workstream C node.
      * `[ ]`   This role is correct because `calculateAffordability.ts` is the only site where `CompressPromptParams` is constructed and `deps.compressPrompt` is invoked; the interface, guard, mock, and tests must be updated to reflect the new required fields.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify how `compressPrompt.ts` persists artifacts in this node.
         * `[ ]`   Do not modify `prepareModelJob.ts` bindings or params in this node.
         * `[ ]`   Do not add new dependencies to `CalculateAffordabilityDeps`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/calculateAffordability/` (all nine files in that directory).
      * `[ ]`   Inside boundary:
         * `[ ]`   The three new fields in `CalculateAffordabilityParams` and their guard/mock/test coverage.
         * `[ ]`   The `compressParams` construction inside `calculateAffordability.ts` that passes the new fields to `deps.compressPrompt`.
      * `[ ]`   Outside boundary:
         * `[ ]`   What `compressPrompt.ts` does with `projectId`, `iteration`, and `embeddingModelSlug` internally.
         * `[ ]`   File manager persistence, path construction, and artifact registration details.
         * `[ ]`   How `prepareModelJob.ts` binds and supplies these fields to `calculateAffordability`.

   * `[ ]`   `deps`
      * `[ ]`   No new dependencies added to `CalculateAffordabilityDeps`.
      * `[ ]`   Provider: `../compressPrompt/compressPrompt.interface.ts` (`CompressPromptParams`).
         * `[ ]`   Layer classification: peer-module contract producer.
         * `[ ]`   Direction: inbound; `calculateAffordability.ts` constructs `CompressPromptParams` which now requires `projectId`, `iteration`, and `embeddingModelSlug`.
         * `[ ]`   Purpose: the three new fields in `CalculateAffordabilityParams` exist solely to satisfy the updated `CompressPromptParams` contract from the prior Workstream C node.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal new interface required from dependencies:
         * `[ ]`   `CompressPromptParams.projectId: string` — threaded from `CalculateAffordabilityParams.projectId`.
         * `[ ]`   `CompressPromptParams.iteration: number` — threaded from `CalculateAffordabilityParams.iteration`.
         * `[ ]`   `CompressPromptParams.embeddingModelSlug: string` — threaded from `CalculateAffordabilityParams.embeddingModelSlug`.
      * `[ ]`   Injection shape remains `CalculateAffordabilityDeps`, `CalculateAffordabilityParams`, `CalculateAffordabilityPayload`; only `CalculateAffordabilityParams` gains three additive required fields.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; no field beyond the three is newly required from any dependency.
         * `[ ]`   No hidden coupling to job results, wallet state, or file storage schema.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.test.ts`
      * `[ ]`   Add imports: `import { createMockSupabaseClient } from "../../_shared/supabase.mock.ts"` and `import { DbClient } from "../compressPrompt/compressPrompt.mock.ts"` to support params builder calls.
      * `[ ]`   Add contract assertion `CalculateAffordabilityParams shape includes projectId, iteration, embeddingModelSlug`:
         * `[ ]`   Call `buildCalculateAffordabilityParams(DbClient(client), { projectId: 'proj-abc', iteration: 3, embeddingModelSlug: 'text-embedding-3-small' })`.
         * `[ ]`   Assert `typeof params.projectId === 'string'` and `params.projectId === 'proj-abc'`.
         * `[ ]`   Assert `typeof params.iteration === 'number'` and `params.iteration === 3`.
         * `[ ]`   Assert `typeof params.embeddingModelSlug === 'string'` and `params.embeddingModelSlug === 'text-embedding-3-small'`.
      * `[ ]`   Preserve all existing return-shape contract assertions (DirectReturn, CompressedReturn, ErrorReturn) unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.ts`
      * `[ ]`   Add `projectId: string` to `CalculateAffordabilityParams` after `sessionId: string`.
      * `[ ]`   Add `iteration: number` to `CalculateAffordabilityParams` after `projectId: string`.
      * `[ ]`   Add `embeddingModelSlug: string` to `CalculateAffordabilityParams` after `iteration: number`.
      * `[ ]`   Keep all other fields and all other interfaces (`CalculateAffordabilityDeps`, `CalculateAffordabilityPayload`, all return types, `UserConfig`, `GetMaxOutputTokensFn`, `TierOutputCapTokens`, `CalculateAffordabilityFn`, `BoundCalculateAffordabilityFn`) unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.test.ts`
      * `[ ]`   Update the existing positive-case `isCalculateAffordabilityParams` test: the `buildCalculateAffordabilityParams` call already supplies the three new fields via updated defaults; no assertion change needed for the positive case.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params missing projectId`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `iteration: 1` and `embeddingModelSlug: 'text-embedding-3-small'` but omitting `projectId`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params where iteration is a string`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `projectId: 'test'` and `embeddingModelSlug: 'text-embedding-3-small'` but with `iteration: 'not-a-number'`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params missing embeddingModelSlug`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `projectId: 'test'` and `iteration: 1` but omitting `embeddingModelSlug`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Preserve all other existing positive and negative guard test assertions unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.ts`
      * `[ ]`   Add the following three checks to `isCalculateAffordabilityParams` after the existing `userConfig` / `tier_output_cap_tokens` check:
         * `[ ]`   `if (!("projectId" in value) || typeof value.projectId !== "string") { return false; }`
         * `[ ]`   `if (!("iteration" in value) || typeof value.iteration !== "number") { return false; }`
         * `[ ]`   `if (!("embeddingModelSlug" in value) || typeof value.embeddingModelSlug !== "string") { return false; }`
      * `[ ]`   Keep all other guards (`isCalculateAffordabilityDeps`, `isCalculateAffordabilityPayload`, `isCalculateAffordabilityDirectReturn`, `isCalculateAffordabilityCompressedReturn`, `isCalculateAffordabilityErrorReturn`, `isBoundCalculateAffordabilityFn`) completely unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.mock.ts`
      * `[ ]`   Add `projectId?: string`, `iteration?: number`, `embeddingModelSlug?: string` to `CalculateAffordabilityParamsOverrides`.
      * `[ ]`   In `buildCalculateAffordabilityParams`, add to the `base` object:
         * `[ ]`   `projectId: overrides?.projectId !== undefined ? overrides.projectId : 'contract-project-id',`
         * `[ ]`   `iteration: overrides?.iteration !== undefined ? overrides.iteration : 1,`
         * `[ ]`   `embeddingModelSlug: overrides?.embeddingModelSlug !== undefined ? overrides.embeddingModelSlug : 'text-embedding-3-small',`
      * `[ ]`   Keep all other exported symbols, existing defaults, and override patterns unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.test.ts`
      * `[ ]`   All existing tests pass without modification because `buildCalculateAffordabilityParams` now supplies default values for the three new fields.
      * `[ ]`   Add unit test `Oversized: compressPrompt is called with projectId, iteration, and embeddingModelSlug threaded from calculateAffordability params`:
         * `[ ]`   Use `createCompressPromptMock` configured to return `buildCompressPromptSuccessReturn({ chatApiRequest: buildChatApiRequest(resourceDocuments, 'prompt'), resolvedInputTokenCount: 42, resourceDocuments })`.
         * `[ ]`   Call `buildCalculateAffordabilityParams(DbClient(client), { projectId: 'threading-test-project', iteration: 5, embeddingModelSlug: 'text-embedding-ada-002', walletBalance: 10_000_000, extendedModelConfig: buildExtendedModelConfig({ context_window_tokens: 50_000, provider_max_input_tokens: 128000 }), inputRate: 0.01, outputRate: 0.01, inputsRelevance: [{ document_key: 'thesis_plan', relevance: 1 }] })`.
         * `[ ]`   Use `createMockCountTokens` returning `100_000` to force the oversized path.
         * `[ ]`   Assert `calls.length >= 1`.
         * `[ ]`   Assert `calls[0].params.projectId === 'threading-test-project'`.
         * `[ ]`   Assert `calls[0].params.iteration === 5`.
         * `[ ]`   Assert `calls[0].params.embeddingModelSlug === 'text-embedding-ada-002'`.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts`
      * `[ ]`   In the `compressParams: CompressPromptParams` object construction in the oversized path (after the existing `walletBalance` field), add:
         * `[ ]`   `projectId: params.projectId,`
         * `[ ]`   `iteration: params.iteration,`
         * `[ ]`   `embeddingModelSlug: params.embeddingModelSlug,`
      * `[ ]`   Keep all other implementation logic unchanged: token counting, NSF checks, rationality threshold evaluations, `solveTargetForBalance`, `balanceAfterCompression` computation, `compressPayload` construction, and `compressResult` success/error handling.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.integration.test.ts`
      * `[ ]`   Existing integration test scenarios pass without modification because `buildCalculateAffordabilityParams` now includes defaults for the three new fields, which flow through to the real `compressPrompt` call.
      * `[ ]`   Add assertion in the oversized integration scenario: after `calculateAffordability` returns, assert `isCalculateAffordabilityCompressedReturn(result) === true` and `result.resolvedInputTokenCount > 0` — proving the three new fields flowed through the real `calculateAffordability` → real `compressPrompt` call chain without type or runtime error.
      * `[ ]`   Confirm that `buildCalculateAffordabilityDeps` consumes the updated `buildCompressPromptDeps` from the prior node, which now includes a default mock `fileManager`; no explicit `fileManager` injection is required in this integration test.

   * `[ ]`   `construction`
      * `[ ]`   `calculateAffordability` remains a pure async function over `(deps, params, payload)` with no global state or constructor.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   The three new params fields are required at call time; no lazy defaults or optional fallbacks are used in the source implementation.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker execution utility.
      * `[ ]`   The three new fields flow inward from the calling context (`prepareModelJob.ts`) through `CalculateAffordabilityParams` and outward into `CompressPromptParams` via the existing `deps.compressPrompt` call.
      * `[ ]`   No new dependency cycles or layer violations are introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `CalculateAffordabilityParams` includes required `projectId: string`, `iteration: number`, and `embeddingModelSlug: string` fields.
      * `[ ]`   `isCalculateAffordabilityParams` returns `false` when any of `projectId`, `iteration`, or `embeddingModelSlug` is absent or of the wrong primitive type.
      * `[ ]`   `calculateAffordability` passes `params.projectId`, `params.iteration`, and `params.embeddingModelSlug` into the `compressParams` object in the oversized execution path before calling `deps.compressPrompt`.
      * `[ ]`   The new unit test proves the three fields are threaded through by asserting on `calls[0].params` captured from the `compressPrompt` mock.
      * `[ ]`   All previously passing tests in `calculateAffordability.test.ts`, `calculateAffordability.guard.test.ts`, `calculateAffordability.interface.test.ts`, and `calculateAffordability.integration.test.ts` remain GREEN.
      * `[ ]`   Node scope is limited to the nine files in `calculateAffordability/`; `prepareModelJob.ts` changes remain in the next Workstream C node.

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Supply projectId, iteration, and embeddingModelSlug to CalculateAffordabilityParams by resolving the default embedding provider from the database before affordability preflight**

   * `[ ]`   `objective`
      * `[ ]`   Solve the `affordParams` construction gap where `prepareModelJob.ts` builds `CalculateAffordabilityParams` without the `projectId`, `iteration`, and `embeddingModelSlug` fields now required by `calculateAffordability.ts` for artifact-safe compression.
      * `[ ]`   Functional goals:
         * `[ ]`   Query `ai_providers` for the single row where `is_default_embedding = true` and `is_active = true` before building `affordParams`, and extract its `api_identifier` as `embeddingModelSlug`.
         * `[ ]`   Return a retriable error if the embedding provider DB query fails.
         * `[ ]`   Return a non-retriable error if no default embedding provider row is found or `api_identifier` is not a string.
         * `[ ]`   Add `projectId: projectIdRaw`, `iteration: iterationNumberRaw`, and `embeddingModelSlug` to the `affordParams: CalculateAffordabilityParams` object construction.
         * `[ ]`   Preserve all existing validation steps, field extraction, wallet query, cost-rate validation, and enqueue call behavior unchanged.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No new fields added to `PrepareModelJobDeps`, `PrepareModelJobParams`, or `PrepareModelJobPayload`; the embedding model slug is resolved from the DB using the existing `params.dbClient`.
         * `[ ]`   All existing tests in `prepareModelJob.test.ts`, `prepareModelJob.inputsRequired.test.ts`, and `prepareModelJob.integration.test.ts` remain GREEN after mock client is updated to return embedding provider data.
         * `[ ]`   No edits to `calculateAffordability.ts`, `compressPrompt.ts`, `index.ts`, or any file outside `prepareModelJob/` in this node.
      * `[ ]`   Each goal is atomic and testable through updated mock setup and new unit assertions in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is orchestration implementation update: `prepareModelJob.ts` is the call-site that constructs `CalculateAffordabilityParams` and must supply the three fields now required by the prior Workstream C nodes.
      * `[ ]`   This role is correct because `prepareModelJob.ts` is the only file that builds and passes `affordParams` to `deps.calculateAffordability`, and it already has access to `projectId` and `iteration` from `job.payload`; `embeddingModelSlug` is the only new runtime resolution needed.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not change how `calculateAffordability.ts` builds or passes `compressParams` in this node.
         * `[ ]`   Do not add `embeddingModelSlug` or embedding model resolution to `PrepareModelJobDeps`.
         * `[ ]`   Do not change the `enqueueModelCall` invocation shape in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/prepareModelJob/` (all ten files in that directory).
      * `[ ]`   Inside boundary:
         * `[ ]`   The new `ai_providers` DB query and its error handling.
         * `[ ]`   The three additive fields in the `affordParams` object literal.
         * `[ ]`   Mock helper for a default embedding provider row.
         * `[ ]`   Test coverage for the two new error paths and for field threading.
      * `[ ]`   Outside boundary:
         * `[ ]`   How `calculateAffordability.ts` or `compressPrompt.ts` uses `embeddingModelSlug` internally.
         * `[ ]`   `index.ts` DI wiring for `calculateAffordability` deps.
         * `[ ]`   Artifact lifecycle management and parent-resume overlay resolution.

   * `[ ]`   `deps`
      * `[ ]`   No new fields added to `PrepareModelJobDeps`.
      * `[ ]`   Provider: `params.dbClient` (`SupabaseClient<Database>`).
         * `[ ]`   Layer classification: existing injected infrastructure dependency.
         * `[ ]`   Direction: inbound; already present in `PrepareModelJobParams`.
         * `[ ]`   Purpose: execute the new `ai_providers` query for the default embedding provider alongside the existing `user_subscriptions` tier-cap query.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal new interface required from dependencies:
         * `[ ]`   `ai_providers.api_identifier: string` — the only field selected from the embedding provider row; used as `embeddingModelSlug` in `affordParams`.
      * `[ ]`   All other injected interfaces (`BoundCalculateAffordabilityFn`, `BoundEnqueueModelCallFn`, wallet service, cost-rate validator, scope filter) remain unchanged.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; only `api_identifier` is selected from `ai_providers`.
         * `[ ]`   No hidden coupling to artifact DB rows or file storage schema.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.interface.test.ts`
      * `[ ]`   Preserve all existing contract assertions unchanged.
      * `[ ]`   Add assertion `PrepareModelJobDeps still declares exactly seven dependency keys after embedding resolution is moved to source implementation` to confirm no new dep is added:
         * `[ ]`   Build `surface: Record<keyof PrepareModelJobDeps, true>` with the same seven keys as before.
         * `[ ]`   Assert `Object.keys(surface).length === 7`.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts`
      * `[ ]`   Add `mockDefaultEmbeddingProviderRow()` factory that returns a minimal `ai_providers`-compatible object with `{ api_identifier: 'text-embedding-3-small', is_default_embedding: true, is_active: true }` plus any required non-nullable DB columns from `Tables<'ai_providers'>` defaulted to inert values.
      * `[ ]`   Keep all existing mock factory functions and override types unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call's `genericMockResults` to add or replace the `ai_providers.select` mock so it returns `{ data: mockDefaultEmbeddingProviderRow(), error: null }` (single object, matching the `maybeSingle()` return shape) alongside the existing `token_wallets` and `user_subscriptions` mocks, so existing tests continue to resolve `embeddingModelSlug` without error.
      * `[ ]`   Add unit test `prepareModelJob returns retriable error when embedding provider query fails`:
         * `[ ]`   Mock `ai_providers.select` to return `{ data: null, error: { message: 'db-down', code: '500' } }`.
         * `[ ]`   Assert `isPrepareModelJobErrorReturn(result) === true`.
         * `[ ]`   Assert `result.retriable === true`.
      * `[ ]`   Add unit test `prepareModelJob returns non-retriable error when no default embedding provider row exists`:
         * `[ ]`   Mock `ai_providers.select` to return `{ data: null, error: null }`.
         * `[ ]`   Assert `isPrepareModelJobErrorReturn(result) === true`.
         * `[ ]`   Assert `result.retriable === false`.
         * `[ ]`   Assert `result.error.message` includes `'No default embedding provider'`.
      * `[ ]`   Add unit test `prepareModelJob passes projectId, iteration, embeddingModelSlug to calculateAffordability`:
         * `[ ]`   Use a capturing `BoundCalculateAffordabilityFn` spy (`spy(async () => buildCalculateAffordabilityDirectReturn(0))`).
         * `[ ]`   Build a job with `mockDialecticExecuteJobPayload({ projectId: 'threading-proj', iterationNumber: 3 })`.
         * `[ ]`   Mock `ai_providers.select` to return `{ data: { api_identifier: 'text-embedding-ada-002' }, error: null }`.
         * `[ ]`   Assert the spy was called at least once.
         * `[ ]`   Assert `spy.calls[0].args[0].projectId === 'threading-proj'`.
         * `[ ]`   Assert `spy.calls[0].args[0].iteration === 3`.
         * `[ ]`   Assert `spy.calls[0].args[0].embeddingModelSlug === 'text-embedding-ada-002'`.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.inputsRequired.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call to include `ai_providers.select` returning `{ data: mockDefaultEmbeddingProviderRow(), error: null }` so all existing inputsRequired tests pass without change to their assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts`
      * `[ ]`   After the `tierCapQueryResult` block (the `user_subscriptions` query and its error/data handling, ending at the `userConfig` declaration), add a new DB query block for the default embedding provider:
         * `[ ]`   `const embeddingProviderResult = await dbClient.from('ai_providers').select('api_identifier').eq('is_default_embedding', true).eq('is_active', true).maybeSingle();`
         * `[ ]`   `if (embeddingProviderResult.error !== null) { deps.logger.warn('[prepareModelJob] Failed to load default embedding provider', { jobId: job.id, message: embeddingProviderResult.error.message }); return { error: embeddingProviderResult.error, retriable: true }; }`
         * `[ ]`   `if (embeddingProviderResult.data === null || typeof embeddingProviderResult.data.api_identifier !== 'string') { return { error: new Error('No default embedding provider configured; cannot build compression artifact paths.'), retriable: false }; }`
         * `[ ]`   `const embeddingModelSlug: string = embeddingProviderResult.data.api_identifier;`
      * `[ ]`   In the `affordParams: CalculateAffordabilityParams` object construction, add alongside existing fields:
         * `[ ]`   `projectId: projectIdRaw,`
         * `[ ]`   `iteration: iterationNumberRaw,`
         * `[ ]`   `embeddingModelSlug,`
      * `[ ]`   Keep all other implementation logic unchanged: tier-cap query, payload extraction, model config validation, wallet balance load, cost-rate validation, scope application, base chat request construction, affordability call, enqueue call, and error-catch boundary.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.provides.ts`
      * `[ ]`   Add `mockDefaultEmbeddingProviderRow` to the value exports from `"./prepareModelJob.mock.ts"` so consumers that build full test setups can use the factory without importing the mock file directly.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call to return `{ data: mockDefaultEmbeddingProviderRow(), error: null }` from the `ai_providers.select` mock so existing integration paths resolve the embedding provider without error.
      * `[ ]`   Add assertion in the `calculateAffordability direct return flows through enqueueModelCall to success` integration path: capture the `calculateAffordability` spy call and assert `spy.calls[0].args[0].projectId === executePayload.projectId`, `spy.calls[0].args[0].iteration === executePayload.iterationNumber`, and `spy.calls[0].args[0].embeddingModelSlug === 'text-embedding-3-small'` (matching the mock embedding provider `api_identifier`).

   * `[ ]`   `construction`
      * `[ ]`   `prepareModelJob` remains a pure async function over `(deps, params, payload)` with no global state.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order: tier-cap query → embedding provider query → payload extraction → validation → model config → wallet balance → cost rates → scope application → `baseChatApiRequest` → `affordParams` → affordability call → enqueue call.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker orchestration.
      * `[ ]`   The new `ai_providers` query is an inward infrastructure call (db → local variable); `embeddingModelSlug` then flows outward into `affordParams` passed to `deps.calculateAffordability`.
      * `[ ]`   No new dependency cycles or layer violations introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `prepareModelJob` queries `ai_providers` for `is_default_embedding = true` before building `affordParams` and extracts `api_identifier` as `embeddingModelSlug`.
      * `[ ]`   `prepareModelJob` returns a retriable error if the `ai_providers` query returns a DB error.
      * `[ ]`   `prepareModelJob` returns a non-retriable error with message including `'No default embedding provider'` if the query returns no row or `api_identifier` is not a string.
      * `[ ]`   `deps.calculateAffordability` is called with `affordParams` that includes `projectId`, `iteration`, and `embeddingModelSlug` matching the values from `job.payload` and the resolved embedding provider.
      * `[ ]`   All previously passing tests in `prepareModelJob.test.ts`, `prepareModelJob.inputsRequired.test.ts`, and `prepareModelJob.integration.test.ts` remain GREEN after the mock client is updated to return embedding provider data.
      * `[ ]`   Node scope is limited to the ten files in `prepareModelJob/`; `index.ts` DI wiring changes remain in the next Workstream C node.

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] Wire fileManager into compressPrompt DI closure to complete compression artifact persistence chain**

   * `[ ]`   `objective`
      * `[ ]`   Solve the `boundCompressPrompt` closure gap where `createDialecticWorkerDeps` builds `boundCompressPrompt` with `{ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens }` but omits `fileManager`, leaving the updated `CompressPromptDeps.fileManager: IFileManager` requirement from the prior Workstream C node (`compressPrompt.ts`) unsatisfied at the call site and producing a type error at compile time.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `fileManager` to the deps object literal inside the `boundCompressPrompt` closure in `createDialecticWorkerDeps`, making the call read `compressPrompt({ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens, fileManager }, cpParams, cpPayload)`.
         * `[ ]`   Add `embeddingModelApiIdentifier: modelProvider.api_identifier` to the `RagService` constructor deps object so the call reads `new RagService({ dbClient: adminClient, logger, indexingService, embeddingClient, tokenWalletService: adminTokenWalletService, embeddingModelApiIdentifier: modelProvider.api_identifier })`.
         * `[ ]`   Keep all existing DI bindings and construction order in `createDialecticWorkerDeps` unchanged except the two additions above.
         * `[ ]`   Keep the `serve()` HTTP handler body unchanged.
         * `[ ]`   Update `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts` to mock the `ai_providers.select('api_identifier').eq('is_default_embedding', true).eq('is_active', true).maybeSingle()` call added by the prior `prepareModelJob.ts` node so all existing test scenarios continue to pass.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No new imports added to `index.ts`; `fileManager` is already declared in `createDialecticWorkerDeps` scope before the `prepareModelJob` factory lambda is defined.
         * `[ ]`   No changes to `compressPrompt.ts`, `calculateAffordability.ts`, `prepareModelJob.ts`, `file_manager.ts`, or any file outside the four root files listed above.
         * `[ ]`   The `boundCompressPrompt` variable type remains `BoundCompressPromptFn`; the updated deps object must satisfy `CompressPromptDeps` without any cast or type assertion.
      * `[ ]`   Each goal is atomic and testable through the unit and integration test updates in this node.

   * `[ ]`   `role`
      * `[ ]`   Node role is DI factory entrypoint update plus the three immediate test files that prove the wiring is correct.
      * `[ ]`   This role is correct because `index.ts` owns `createDialecticWorkerDeps`, which is the only file that constructs `boundCompressPrompt` and is therefore the canonical wiring site for supplying the updated `CompressPromptDeps.fileManager` dependency.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not change the `compressPrompt.ts` implementation or its `CompressPromptDeps` interface in this node.
         * `[ ]`   Do not change the `prepareModelJob.ts` embedding provider query or `affordParams` construction in this node.
         * `[ ]`   Do not change the `calculateAffordability.ts` compression params threading in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/` root: `index.ts`, `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   DI factory construction in `createDialecticWorkerDeps`: `FileManagerService` instantiation, closure assembly for `boundCompressPrompt` and `boundCalculateAffordability`, and the full `createJobContext` call.
         * `[ ]`   HTTP serve handler: method gate, job payload parse, `adminClient` construction, `createDialecticWorkerDeps` invocation, and `processJob` dispatch.
      * `[ ]`   Outside boundary:
         * `[ ]`   Compression algorithm logic, artifact persistence, and RAG context construction inside `compressPrompt.ts`.
         * `[ ]`   Affordability calculation and token counting inside `calculateAffordability.ts`.
         * `[ ]`   Model job orchestration, embedding provider DB query, and `affordParams` construction inside `prepareModelJob.ts`.
         * `[ ]`   File upload, retry, and path construction logic inside `file_manager.ts`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./compressPrompt/compressPrompt.provides.ts` (`compressPrompt`, `BoundCompressPromptFn`).
         * `[ ]`   Layer classification: dialectic-worker utility producer.
         * `[ ]`   Direction: inbound; already imported and invoked in `index.ts`.
         * `[ ]`   Purpose: `compressPrompt` receives the updated deps closure now including `fileManager`.
      * `[ ]`   Provider: `../_shared/services/file_manager.ts` (`FileManagerService`).
         * `[ ]`   Layer classification: shared infrastructure service producer.
         * `[ ]`   Direction: inbound; already imported at line 24 of `index.ts` and instantiated as `const fileManager = new FileManagerService(adminClient, { constructStoragePath, logger, assembleChunks })`.
         * `[ ]`   Purpose: `fileManager` satisfies the `IFileManager` field now required in `CompressPromptDeps`.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interface required from `fileManager` in the `boundCompressPrompt` closure: `IFileManager` in its entirety, passed through to `compressPrompt`; no methods are invoked on `fileManager` directly in `index.ts`.
      * `[ ]`   The `fileManager` variable is already in scope at the point where `boundCompressPrompt` is constructed inside the `prepareModelJob` factory lambda; the only change is adding it to the deps object literal passed to `compressPrompt`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; no new methods or fields on `fileManager` are accessed in `index.ts`.
         * `[ ]`   No hidden coupling to Netlify worker payloads or callback handler state.

   * `[ ]`   `supabase/functions/dialectic-worker/index.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` invocation whose mock results are consumed by the `createDialecticWorkerDeps` code path to add an `ai_providers.select('api_identifier').eq('is_default_embedding', true).eq('is_active', true).maybeSingle()` mock returning `{ data: { api_identifier: 'text-embedding-3-small' }, error: null }` so that the embedding slug query added by the prior `prepareModelJob.ts` node does not throw in existing test scenarios.
      * `[ ]`   Add unit test `createDialecticWorkerDeps constructs fileManager and exposes it on the returned IJobContext`:
         * `[ ]`   Construct a minimal `mockAdminClient` whose `from('ai_providers').select('*').eq('is_default_embedding', true).single()` returns `{ data: { id: 'emb-provider-1', api_identifier: 'text-embedding-3-small', is_default_embedding: true, is_active: true, config: {}, provider: 'openai', model: 'text-embedding-3-small' }, error: null }`.
         * `[ ]`   Set `Deno.env.get('OPENAI_API_KEY')`, `HMAC_SECRET`, `NETLIFY_QUEUE_URL`, and `AWL_API_KEY` to non-empty test strings before the call.
         * `[ ]`   Call `const ctx = await createDialecticWorkerDeps(mockAdminClient)`.
         * `[ ]`   Assert `ctx.fileManager instanceof FileManagerService`.
         * `[ ]`   Assert `typeof ctx.prepareModelJob === 'function'`.

   * `[ ]`   `supabase/functions/dialectic-worker/index.ts`
      * `[ ]`   Locate the `boundCompressPrompt` closure in the `prepareModelJob` factory lambda inside `createDialecticWorkerDeps`. The closure currently reads: `compressPrompt({ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens }, cpParams, cpPayload)`.
      * `[ ]`   Add `fileManager` to the deps object so the closure reads: `compressPrompt({ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens, fileManager }, cpParams, cpPayload)`.
      * `[ ]`   In the `RagService` constructor call at `const ragService = new RagService(...)`, add `embeddingModelApiIdentifier: modelProvider.api_identifier` to the deps object so the call reads: `new RagService({ dbClient: adminClient, logger, indexingService, embeddingClient, tokenWalletService: adminTokenWalletService, embeddingModelApiIdentifier: modelProvider.api_identifier })`.
      * `[ ]`   Keep all other lines in `createDialecticWorkerDeps` unchanged: the outer `ai_providers` query and `modelProvider` extraction for `EmbeddingClient` construction, `embeddingAdapter`, `EmbeddingClient`, `IndexingService`, `PromptAssembler`, `documentRenderer`, `boundGatherArtifacts`, queue env reads, `computeJobSig`, `apiKeyForProvider`, `boundEnqueueModelCall`, and the full `createJobContext` call with all its fields.
      * `[ ]`   Keep all import statements unchanged; no new imports are required.
      * `[ ]`   Keep the `serve()` HTTP handler body unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/index.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call in this file to add an `ai_providers.select('api_identifier').eq('is_default_embedding', true).eq('is_active', true).maybeSingle()` mock returning `{ data: mockDefaultEmbeddingProviderRow(), error: null }` (importing `mockDefaultEmbeddingProviderRow` from `./prepareModelJob/prepareModelJob.provides.ts`) so that all existing integration scenarios resolve the embedding slug without error.
      * `[ ]`   Add integration test `createDialecticWorkerDeps + prepareModelJob: fileManager.uploadAndRegisterFile is called through the wired DI closure when compression is triggered`:
         * `[ ]`   Construct `mockAdminClient` with: `ai_providers.select('*').eq('is_default_embedding', true).single()` returning the full embedding provider row; `ai_providers.select('api_identifier')...maybeSingle()` returning `{ api_identifier: 'text-embedding-3-small' }`; `ai_providers.select('*').eq('id', modelId).single()` returning a model config row where the `config` field encodes a `contextWindowTokens: 100`; `token_wallets` returning `{ balance: 10000 }`; `user_subscriptions` returning the tier mock from `mockDefaultEmbeddingProviderRow`.
         * `[ ]`   Call `const ctx = await createDialecticWorkerDeps(mockAdminClient)`.
         * `[ ]`   Add spy: `const uploadSpy = vi.spyOn(ctx.fileManager, 'uploadAndRegisterFile').mockResolvedValue({ success: true, ragResourceId: 'integration-rag-1', filePath: 'tenant/project/iter/model/context.json', fileSize: 200 })`.
         * `[ ]`   Build `mockUserDbClient` (mock Supabase client with same `ai_providers` and wallet mocks, used as `params.dbClient` for the `prepareModelJob` call).
         * `[ ]`   Build `mockParams` with `dbClient: mockUserDbClient` and `job` set to a `dialectic_generation_jobs` row with `modelId: 'model-1'`, `projectId: 'project-1'`, `iterationNumber: 2`.
         * `[ ]`   Build `mockPayload` as a `DialecticExecuteJobPayload` with `userPrompt` set to a 200-token string (exceeding the 100-token mock `contextWindowTokens`), so `calculateAffordability` routes to `compressPrompt`.
         * `[ ]`   Call `await ctx.prepareModelJob(mockParams, mockPayload)`.
         * `[ ]`   Assert `uploadSpy.mock.calls.length >= 1`, proving `fileManager.uploadAndRegisterFile` is reachable through the complete DI chain wired in `createDialecticWorkerDeps`.

   * `[ ]`   `supabase/functions/dialectic-worker/index.nsf-pause.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call in this file to add the `ai_providers.select('api_identifier').eq('is_default_embedding', true).eq('is_active', true).maybeSingle()` mock returning `{ data: mockDefaultEmbeddingProviderRow(), error: null }` so all existing NSF-pause integration scenarios pass without change to their assertions.

   * `[ ]`   `construction`
      * `[ ]`   `createDialecticWorkerDeps` remains an async factory function with signature `(adminClient: SupabaseClient<Database>) => Promise<IJobContext>` with no global state.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Construction order within `createDialecticWorkerDeps` is preserved: `NotificationService` → outer `ai_providers` query (for `EmbeddingClient`) → `OPENAI_API_KEY` env read → `fileManager` construction → `embeddingAdapter` → `EmbeddingClient` → `AdminTokenWalletService` / `UserTokenWalletService` → `IndexingService` → `RagService` → `PromptAssembler` → `documentRenderer` → `boundGatherArtifacts` → queue env reads → `computeJobSig` → `apiKeyForProvider` → `boundEnqueueModelCall` → `createJobContext` with the updated `prepareModelJob` lambda that now includes `fileManager` in the `boundCompressPrompt` deps.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is DI entrypoint / composition root.
      * `[ ]`   `fileManager` flows inward from the `FileManagerService` constructor (infrastructure) and then outward through the `boundCompressPrompt` closure into `compressPrompt.ts` (worker utility).
      * `[ ]`   No new imports introduce cycles; all dependencies remain in the existing inward direction from shared infrastructure and utilities toward the entrypoint.
      * `[ ]`   No new dependency cycles with any Workstream B or C producer are introduced.

   * `[ ]`   `requirements`
      * `[ ]`   After this node, the `boundCompressPrompt` closure in `createDialecticWorkerDeps` satisfies the updated `CompressPromptDeps` contract including `fileManager: IFileManager` without any type cast or assertion.
      * `[ ]`   `RagService` is constructed with `embeddingModelApiIdentifier: modelProvider.api_identifier`, satisfying the updated `IRagServiceDependencies.embeddingModelApiIdentifier` contract added by the Workstream E `rag_service.ts` node.
      * `[ ]`   `index.ts` compiles without type errors on the `compressPrompt({ ..., fileManager }, ...)` call and `new RagService({ ..., embeddingModelApiIdentifier: modelProvider.api_identifier })` call after the prior Workstream C and Workstream E nodes have updated their respective interfaces.
      * `[ ]`   All existing assertions in `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts` remain GREEN after adding the `ai_providers.select('api_identifier')...maybeSingle()` mock to each file's Supabase client setup.
      * `[ ]`   The new unit test in `index.test.ts` asserts `ctx.fileManager instanceof FileManagerService` and `typeof ctx.prepareModelJob === 'function'` after calling `createDialecticWorkerDeps`.
      * `[ ]`   The new integration test in `index.integration.test.ts` asserts `uploadSpy.mock.calls.length >= 1` after calling `ctx.prepareModelJob` with an oversized prompt, proving the full `createDialecticWorkerDeps → ctx.prepareModelJob → calculateAffordability → compressPrompt → fileManager.uploadAndRegisterFile` chain executes end-to-end.
      * `[ ]`   Node scope remains limited to `index.ts` and its three immediate test files.

   * `[ ]`   **Commit** `feat(dialectic-worker): complete Workstream C — wire fileManager through DI closure to close artifact-persistence chain`
      * `[ ]`   Structural changes:
         * `[ ]`   `index.ts` `boundCompressPrompt` closure now includes `fileManager` in the deps object, satisfying the updated `CompressPromptDeps` interface from the `compressPrompt.ts` node.
         * `[ ]`   `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts` add the `ai_providers.select('api_identifier')...maybeSingle()` mock to align with the embedding slug query added by the `prepareModelJob.ts` node.
      * `[ ]`   Behavioral changes:
         * `[ ]`   RAG context summary artifacts produced during compression are now persisted to storage via `fileManager.uploadAndRegisterFile` during live execution because `fileManager` is correctly wired at the DI factory boundary.
         * `[ ]`   All existing HTTP handler behavior, DI bindings, and job dispatch logic remain unchanged.
      * `[ ]`   Contract changes:
         * `[ ]`   The `compressPrompt` deps closure in `createDialecticWorkerDeps` is fully aligned with the updated `CompressPromptDeps` interface from the prior Workstream C node.
         * `[ ]`   Workstream C exit condition is satisfied: the artifact-persistence chain `file_manager.ts → path_constructor.ts → path_deconstructor.ts → compressPrompt.ts → calculateAffordability.ts → prepareModelJob.ts → index.ts` is complete, coherent, and proven by the integration test in this node.


# To-Do List

* **Subscription checkout deep links — prepopulate cart from upgrade and top-up CTAs**

  Implement after the **Dynamic cost ceiling** ticket above. Cost ceiling supplies `stage_ceiling`, `project_ceiling`, and token shortfalls for NSF and pre-project surfaces; this ticket wires every `/subscription` CTA to the cart using those values (where applicable) plus tier-aware plan resolution for feature-gate upgrades. Do this in **one pass** once `selectCostCeiling` / `selectPreProjectCostCeiling` exist — do not ship another round of naked `/subscription` links.

  ### Problem

  Multiple tickets (FE Ticket 1 dashboard/sidebar, FE2 model selector gating, FE3 output-cap slider and cost-ceiling NSF) added upgrade and top-up CTAs that navigate to `/subscription` with no cart context. The user lands on the subscription page and must manually find the right plan or token pack. The original FE plan (**Multi-item checkout cart**, now implemented) specified `prefillCart`, URL query params (`?plan=` / `?otp=`), and CTA consumers — but consumers were left as placeholders (`Link to="/subscription"` or `navigate("/subscription")`).

  ### What already exists (no reinvention)

  - **`packages/store/src/cartStore/cartStore.ts`**: `prefillCart({ subscriptionPlanId?, otpPlanIds? })` clears the cart, resolves plans from `useSubscriptionStore.getState().availablePlans` by `plan.id` or `plan.stripe_price_id`, then populates `subscriptionItem` / `otpItems`.
  - **`apps/web/src/pages/Subscription.tsx`**: On load, if `?plan=` or `?otp=` query params are present and `availablePlans` is loaded, calls `prefillCart` and clears params from the URL (`setSearchParams({}, { replace: true })`).
  - **Cart checkout**: `checkoutCart()` builds multi-item `PurchaseRequest` and redirects to Stripe.

  **Gaps in existing infrastructure:**
  - No shared helper maps **tier level** or **token shortfall** → plan IDs; each CTA would duplicate lookup logic.
  - `prefillCart` does not match `item_id_internal` (only `id` and `stripe_price_id`); extend if production plans are keyed internally.
  - Subscription page tabs (`monthly` / `annual` / `top-up`) are local state only; NSF/top-up CTAs need **`?tab=top-up`** (or equivalent) read on mount so the Top-Up tab is visible after navigation.

  ### Resolution helpers (new — shared by all CTAs)

  Add a small pure module (location TBD during node planning — e.g. `apps/web/src/utils/subscriptionCta.ts`) that operates on `SubscriptionPlan[]` from `availablePlans`:

  1. **`subscriptionPlanForTierLevel(targetLevel, plans, preferInterval?)`**
     - Filter: `plan_type === 'subscription'`, `active`, `tier_level === targetLevel`, exclude free/zero-amount plans.
     - Prefer monthly vs annual by name or interval when multiple plans share a tier (default: monthly).
     - Return `SubscriptionPlan | null` (use `.id` in URLs and `prefillCart`).

  2. **`smallestOtpPlanForShortfall(shortfallTokens, plans)`**
     - Filter: `plan_type === 'one_time_purchase'`, `tokens_to_award` not null.
     - Sort ascending by `tokens_to_award`; return first plan where `tokens_to_award >= shortfallTokens`.

  3. **`buildSubscriptionCtaUrl(intent)`** (or equivalent)
     - Inputs: `{ subscriptionPlanId?: string; otpPlanIds?: string[]; tab?: 'top-up' }`.
     - Output: `/subscription?plan=...&otp=...&tab=top-up` with repeated `otp` params when needed.
     - Use **runtime plan UUIDs** from `availablePlans` — do not hardcode doc examples like `premium-monthly`.

  CTAs may use **URL-only** deep links (preferred for `<Link>`) or **prefillCart + navigate** for buttons; URL prefill on `SubscriptionPage` must remain the single source of truth on arrival so refresh and shared links work.

  ### CTA inventory — current naked links and intended prefill

  **Tier / feature-gate upgrades (subscription plan only)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Tier-locked model | `AIModelSelector.tsx` | `min_plan_tier_level > userTier.level` | `plan` = subscription for `provider.min_plan_tier_level` |
  | Model-count cap | `AIModelSelector.tsx` | at cap on multiplicity | `plan` = subscription for tier from `resolveNextTierName` → that tier's `level` |
  | Tier-locked row | `AIModelSelectorList.tsx` | same as selector | same |
  | Count-cap row | `AIModelSelectorList.tsx` | same | same |
  | Output cap upgrade | `OutputCapSlider.tsx` | locked marker / drag past thumb max | `plan` = subscription for tier matching `upgradeTargetName` (`availableTiers` by name → `level`) |

  **Account / navigation (tier upgrade or browse)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Plan card | `Dashboard.tsx` | `nextTierName` | `plan` = next tier's `level` |
  | Plan card fallback | `Dashboard.tsx` | `userTier === null` | no plan (generic `/subscription`) |
  | Quick action "Upgrade" | `Dashboard.tsx` | marketing | next tier `plan`, or OTP-only if product decides ultra users need tokens only |
  | Sidebar upgrade | `nav-user.tsx` | `nextTierName` | same as dashboard |
  | Sidebar "Billing" | `nav-user.tsx` | manage billing | no prefill (portal on page) |
  | Profile | `Profile.tsx` | "Manage subscription" | no prefill |
  | Header / Help / Pricing (logged in) | `Header.tsx`, `Help.tsx`, `PricingPage.tsx` | browse | no prefill |

  **Token top-up (OTP only — often `tab=top-up`)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Wallet | `WalletBalanceDisplay.tsx` | "Purchase Tokens" | optional smallest OTP or none; `tab=top-up` |
  | Generate callout | `GenerateContributionButton.tsx` | wallet below stage `minimum_balance` | `otp` = pack covering `stageThreshold - balance` (interim until cost ceiling ships) |
  | Session NSF (this ticket + cost ceiling) | `DialecticSessionDetailsPage.tsx`, `GenerateContributionButton` / session controls | `stage_ceiling > wallet_balance` | `otp` = `smallestOtpPlanForShortfall(stage_ceiling - wallet_balance)`; `tab=top-up` |
  | Project warning (cost ceiling) | session / `SessionInfoCard.tsx` | `project_ceiling > wallet_balance` | `otp` for `project_ceiling - wallet_balance`; informational, do not block create |
  | Pre-project autostart (cost ceiling) | `CreateDialecticProjectForm.tsx` | first-stage `stage_ceiling > wallet` | same OTP shortfall for first stage; disable Autostart, allow Create |

  **Dual intent (upgrade + top-up):** When a surface needs both a higher tier and tokens (e.g. locked premium model with insufficient wallet for estimated run), pass both `plan` and `otp` in one URL. FE cart ticket Pattern 1 applies.

  ### Implementation sequence (single pass, after cost ceiling)

  1. **Cost ceiling** — `@paynless/utils` `computeCostCeiling`, selector-derived ceilings, UI hooks for estimates and shortfalls (per Dynamic cost ceiling ticket above).
  2. **Subscription CTA helpers** — `subscriptionPlanForTierLevel`, `smallestOtpPlanForShortfall`, `buildSubscriptionCtaUrl`; unit tests with `SubscriptionPlan` fixtures from `PlanCard.mock.ts`.
  3. **`Subscription.tsx`** — honor `?tab=top-up` on mount (set `activeTab`); optionally extend `prefillCart` lookup to `item_id_internal`.
  4. **Wire all CTAs** in one change set: replace naked `to="/subscription"` / `navigate("/subscription")` with URLs from helpers; dialectic components first (`AIModelSelector`, `AIModelSelectorList`, `OutputCapSlider`, `GenerateContributionButton`, `CreateDialecticProjectForm`, session page / `SessionInfoCard`), then account surfaces (`Dashboard`, `nav-user`, `WalletBalanceDisplay`).
  5. **Tests** — update existing tests that assert `href === '/subscription'` to assert query strings when prefill applies; add helper unit tests.

  ### Known files in dependency order

  **Helpers (new):**
  1. `packages/store/src/subscriptionCta.ts` (new) — plan resolution and URL builder (or `apps/web/src/utils/subscriptionCta.ts` if web-only; prefer store package if dialectic store will import shortfall helpers)
  2. `packages/store/src/subscriptionCta.test.ts` (new)

  **Subscription page:**
  3. `apps/web/src/pages/Subscription.tsx` — `?tab=` query handling; confirm prefill runs after `loadSubscriptionData`
  4. `apps/web/src/pages/Subscription.test.tsx` — tab param + combined `plan` + `otp` prefill

  **Optional cart store:**
  5. `packages/store/src/cartStore/cartStore.ts` — optional `item_id_internal` in `prefillCart` lookup

  **CTA consumers (modify — replace naked links):**
  6. `apps/web/src/components/dialectic/AIModelSelector.tsx`
  7. `apps/web/src/components/dialectic/AIModelSelector.test.tsx`
  8. `apps/web/src/components/dialectic/AIModelSelectorList.tsx`
  9. `apps/web/src/components/dialectic/AIModelSelectorList.test.tsx`
  10. `apps/web/src/components/dialectic/OutputCapSlider.tsx`
  11. `apps/web/src/components/dialectic/OutputCapSlider.test.tsx`
  12. `apps/web/src/components/dialectic/OutputCapSlider.integration.test.tsx`
  13. `apps/web/src/components/dialectic/GenerateContributionButton.tsx`
  14. `apps/web/src/components/dialectic/GenerateContributionButton.nsf.test.tsx`
  15. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — NSF + cost display (depends on cost ceiling)
  16. `apps/web/src/components/dialectic/SessionInfoCard.tsx`
  17. `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx`
  18. `apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx`
  19. `apps/web/src/pages/Dashboard.tsx`
  20. `apps/web/src/pages/Dashboard.test.tsx`
  21. `apps/web/src/components/sidebar/nav-user.tsx`
  22. `apps/web/src/components/sidebar/nav-user.test.tsx`
  23. `apps/web/src/components/wallet/WalletBalanceDisplay.tsx`

  **No prefill required (leave generic `/subscription` or document explicitly):**
  - `Profile.tsx`, `Header.tsx`, `Help.tsx`, `PricingPage.tsx`, `nav-user` Billing button

  ### Dependencies

  - **Depends on Dynamic cost ceiling** (same FE3 doc): OTP shortfalls for NSF, pre-project autostart, and project-level warnings require `costCeilingEstimate` / `stage_ceiling` / `project_ceiling`. Tier-only CTAs (model lock, output cap, dashboard upgrade) can be implemented with helpers alone but should ship in the same pass to avoid duplicate churn.
  - **Depends on FE cart ticket (complete)**: `cartStore`, `Subscription.tsx` URL prefill, multi-item checkout.
  - **Depends on Ticket 1**: `userTier`, `availableTiers`, `availablePlans` / `loadSubscriptionData`.
  - **Depends on Output clamp slider (complete)**: `maxOutputTokens` for cost ceiling `output_cap` input.
  - **Ops (deferred)**: `subscription_plans.tier_level` must match `tier_definitions.level` in production data for `subscriptionPlanForTierLevel` to resolve correctly (see Stripe plans ops task below).

  ### Scope split — FE vs BE

  FE-only. No BE changes unless plan catalog fetch is incomplete before navigation (ensure `loadSubscriptionData` runs for authenticated users hitting deep links).

  ### Open questions for node planning

  1. **Helper package location:** `packages/store` (shared with dialectic recompute) vs `apps/web` only?
  2. **Billing interval preference:** Default monthly for tier upgrades, or infer from `userSubscription` / current plan?
  3. **Ultra users on Dashboard quick action:** Next tier is null — link to top-up tab only, or hide?
  4. **GenerateContributionButton:** Retain `minimum_balance` shortfall until cost ceiling is wired on session page, then unify on `stage_ceiling` shortfall.
  5. **Bundle cards** (FE cart ticket §E): Optional follow-up — static bundle config calling same `prefillCart` / URL builder; not required for CTA pass.



## Netlify-Worker-Stream Phase 2 and Phase 3 — deferred detail

### Phase 2 (backend notification and status adaptation):

* getAllStageProgress.ts and its consumers need to understand queued as a distinct in-flight status (currently it would fall through to an unclassified state)
* The notification service needs updated event types for the new async lifecycle (stream_queued, stream_started, stream_complete) to give the frontend accurate real-time signals
* deriveStepStatuses and related step-progress logic need to account for jobs in queued state without treating them as failed or not-started

### Phase 3 (frontend):

* Status display components consuming UnifiedStageStatus need a new streaming or queued visual state
* Real-time subscription handlers need to act on the new job status transitions
* The user-facing progress indicators need to reflect the two-phase async lifecycle rather than a single blocking operation


## StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
- Update StageDAGProgressDialog to use notifications to change color too 

## Highlight the chosen Chat or Project in the left sidebar 
- Currently the sidebar gives no indication of which Chat or Project the user has focused
- Outline and/or highlight the chosen Chat or Project in the left sidebar

## New user sign in banner doesn't display, throws console error  
- Chase, diagnose, fix 

## Refactor EMCAS to break apart the functions, segment out the tests
- Move gatherArtifacts call to processSimpleJob
- Decide where to measure & RAG

## Switch to stream-to-buffer instead of chunking
- This lets us render the buffer in real time to show document progress 

## Build test fixtures for major function groups 
- Provide standard mock factories and objects 
- dialectic-worker, dialectic-service, document_renderer, anything else that has huge test files  

## Support user-provided API keys for their preferred providers 

## Regenerate existing document from user feedback & edits 

## Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
## Let the user pick/rate their preferred version and drop the others 

## Use a gentle color schema to differentiate model outputs visually / at a glance 

## When doc loads for the first time, position at top 

## Search across documents for key terms 

## Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

## Add optional outputs for selected stages
- A "landing page" output for the proposal stage
-- Landing page
-- Hero banner
-- Call to action
-- Email sign up 
- A "financial analysis" output for the "refinement" stage
-- 1/3/5 year 
-- Conservative / base / aggressive
-- IS, BS, CF 
- A "generate next set of work" for the implementation stage 

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 

## Fix continuation naming to use continuation naming instead of iterations 

## 