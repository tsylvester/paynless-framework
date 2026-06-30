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