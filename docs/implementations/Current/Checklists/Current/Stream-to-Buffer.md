# Stream to Buffer

# Work Breakdown Structure

* `[✅]` `_shared/ai_service/anthropic_adapter` **[BE] Convert Anthropic adapter sendMessage to stream-to-buffer**
  * `[✅]` `objective`
    * `[✅]` Replace `client.messages.create()` batch call with `client.messages.stream()` and buffer the streamed chunks into a single complete response
    * `[✅]` Collect `content` by concatenating text delta events
    * `[✅]` Extract `token_usage` (prompt_tokens, completion_tokens, total_tokens) from the stream's final message event
    * `[✅]` Extract `finish_reason` (stop_reason) from the stream's final message event and map using existing mapping logic
    * `[✅]` Return the identical `AdapterResponsePayload` shape — no callers change
    * `[✅]` Preserve all existing message formatting, role validation, resource document handling, and system prompt extraction unchanged
  * `[✅]` `role`
    * `[✅]` Adapter — wraps the Anthropic SDK streaming transport behind the existing `AiProviderAdapter` contract
  * `[✅]` `module`
    * `[✅]` Anthropic provider communication — converts structured prompt to Anthropic streaming API call and buffers response
    * `[✅]` Boundary: SDK call mechanics only; no prompt assembly, no job queue awareness, no document assembly
  * `[✅]` `deps`
    * `[✅]` `npm:@anthropic-ai/sdk` — Anthropic SDK, provides `client.messages.stream()` and `MessageStream` type; adapter layer; outbound infrastructure
    * `[✅]` `types.ts` — `ChatApiRequest`, `AdapterResponsePayload`, `FinishReason`, `ILogger`; shared types; inward dependency
    * `[✅]` Confirm no reverse dependency introduced — callers still receive `Promise<AdapterResponsePayload>`
  * `[✅]` `context_slice`
    * `[✅]` From Anthropic SDK: `client.messages.stream()`, `MessageStream.finalMessage()`, `MessageStream.on('text')` or async iteration
    * `[✅]` Injection shape unchanged — adapter is constructed via `new AnthropicAdapter(provider, apiKey, logger)`
    * `[✅]` No new imports from higher or lateral layers
  * `[✅]` unit/`anthropic_adapter.test.ts`
    * `[✅]` Update SDK mock: replace `messages.create` mock with `messages.stream` mock that returns an object simulating `MessageStream` (async iterable of text deltas + `finalMessage()` returning complete `Message` with `usage` and `stop_reason`)
    * `[✅]` Test: successful stream-to-buffer returns correct `content` string assembled from multiple text delta events
    * `[✅]` Test: `token_usage` (prompt_tokens, completion_tokens, total_tokens) extracted from `finalMessage().usage`
    * `[✅]` Test: `finish_reason` mapped correctly — `end_turn` → `'stop'`, `max_tokens` → `'length'`
    * `[✅]` Test: empty stream (no text events) throws descriptive error
    * `[✅]` Test: stream error mid-response (SDK throws during iteration) propagates as adapter error
    * `[✅]` Test: existing message formatting tests (role alternation, system prompt extraction, resource document blocks) remain GREEN with streaming mock
    * `[✅]` Verify shared `adapter_test_contract.ts` still passes — external contract unchanged
  * `[✅]` `construction`
    * `[✅]` Constructor unchanged: `new AnthropicAdapter(provider, apiKey, logger)` — `client` field instantiated identically
    * `[✅]` No new construction contexts; no new fields
    * `[✅]` Object completeness: `this.client` is the sole SDK dependency, streaming uses same client instance
  * `[✅]` `anthropic_adapter.ts`
    * `[✅]` Replace `this.client.messages.create({...})` with `this.client.messages.stream({...})` using identical parameter payload (model, max_tokens, system, messages)
    * `[✅]` Buffer streamed text: iterate events or use SDK helper to collect full content string
    * `[✅]` Retrieve final message via `stream.finalMessage()` for `usage` and `stop_reason`
    * `[✅]` Map `stop_reason` using existing mapping logic (no change to mapping code)
    * `[✅]` Construct and return `AdapterResponsePayload` with buffered content, mapped token_usage, mapped finish_reason — identical shape to current return
    * `[✅]` Preserve all existing: message validation, role alternation enforcement, consecutive message merging, resource document → document block conversion, system prompt extraction, `listModels()` unchanged
  * `[✅]` `directionality`
    * `[✅]` Layer: infrastructure adapter
    * `[✅]` All dependencies inward-facing (SDK, shared types)
    * `[✅]` All provides outward-facing (`AdapterResponsePayload` to callers via factory)
  * `[✅]` `requirements`
    * `[✅]` `sendMessage` returns identical `AdapterResponsePayload` — zero caller changes
    * `[✅]` All existing `anthropic_adapter.test.ts` tests pass with updated mocks
    * `[✅]` Shared `adapter_test_contract.ts` passes unchanged
    * `[✅]` Token usage is exact (from provider final event, not estimated)
    * `[✅]` Finish reason mapping preserves continuation detection (`'length'` triggers continuation jobs)

* `[✅]` `_shared/ai_service/google_adapter` **[BE] Convert Google adapter sendMessage to stream-to-buffer**
  * `[✅]` `objective`
    * `[✅]` Replace `chat.sendMessage()` batch call with `chat.sendMessageStream()` and buffer the streamed chunks into a single complete response
    * `[✅]` Collect `content` by concatenating text chunks from the stream
    * `[✅]` Extract `token_usage` from the stream's final `usageMetadata` (promptTokenCount, candidatesTokenCount, totalTokenCount)
    * `[✅]` Extract `finish_reason` from the stream's final candidate `finishReason` and map using existing mapping logic
    * `[✅]` Return the identical `AdapterResponsePayload` shape — no callers change
    * `[✅]` Preserve all existing message history conversion, resource document prepending, and generationConfig handling unchanged
  * `[✅]` `role`
    * `[✅]` Adapter — wraps the Google Generative AI SDK streaming transport behind the existing `AiProviderAdapter` contract
  * `[✅]` `module`
    * `[✅]` Google/Gemini provider communication — converts structured prompt to Google streaming API call and buffers response
    * `[✅]` Boundary: SDK call mechanics only; no prompt assembly, no job queue awareness, no document assembly
  * `[✅]` `deps`
    * `[✅]` `npm:@google/generative-ai` — Google Generative AI SDK, provides `chat.sendMessageStream()` and stream response type; adapter layer; outbound infrastructure
    * `[✅]` `types.ts` — `ChatApiRequest`, `AdapterResponsePayload`, `FinishReason`, `ILogger`; shared types; inward dependency
    * `[✅]` Confirm no reverse dependency introduced — callers still receive `Promise<AdapterResponsePayload>`
  * `[✅]` `context_slice`
    * `[✅]` From Google SDK: `chat.sendMessageStream()`, `stream.response` (final aggregated response), async iteration over `stream.stream` for chunks
    * `[✅]` Injection shape unchanged — adapter is constructed via `new GoogleAdapter(provider, apiKey, logger)`
    * `[✅]` No new imports from higher or lateral layers
  * `[✅]` unit/`google_adapter.test.ts`
    * `[✅]` Update SDK mock: replace `sendMessage` mock with `sendMessageStream` mock that returns `{ stream: AsyncIterable<GenerateContentResponse>, response: Promise<GenerateContentResponse> }`
    * `[✅]` Test: successful stream-to-buffer returns correct `content` string assembled from multiple chunk events
    * `[✅]` Test: `token_usage` extracted from final response's `usageMetadata` (promptTokenCount, candidatesTokenCount, totalTokenCount)
    * `[✅]` Test: `finish_reason` mapped correctly — `STOP` → `'stop'`, `MAX_TOKENS` → `'length'`, `SAFETY` → `'content_filter'`
    * `[✅]` Test: empty stream (no text chunks) throws descriptive error
    * `[✅]` Test: stream error mid-response propagates as adapter error
    * `[✅]` Test: existing message history conversion and resource document prepending tests remain GREEN with streaming mock
    * `[✅]` Verify shared `adapter_test_contract.ts` still passes — external contract unchanged
  * `[✅]` `construction`
    * `[✅]` Constructor unchanged: `new GoogleAdapter(provider, apiKey, logger)` — `genAI` and model fields instantiated identically
    * `[✅]` No new construction contexts; no new fields
    * `[✅]` Object completeness: `this.model` is the sole SDK dependency, streaming uses same model instance via `startChat().sendMessageStream()`
  * `[✅]` `google_adapter.ts`
    * `[✅]` Replace `chat.sendMessage(...)` with `chat.sendMessageStream(...)` using identical message content
    * `[✅]` Buffer streamed text: iterate `stream.stream` async iterable or await `stream.response` for aggregated result
    * `[✅]` Extract `usageMetadata` from final response for token counts
    * `[✅]` Extract `finishReason` from final response's candidate and map using existing mapping logic
    * `[✅]` Construct and return `AdapterResponsePayload` with buffered content, mapped token_usage, mapped finish_reason — identical shape to current return
    * `[✅]` Preserve all existing: message history conversion (role mapping, parts construction), resource document prepending to final message, generationConfig (maxOutputTokens, temperature, topP), safety settings, `listModels()` unchanged
  * `[✅]` `directionality`
    * `[✅]` Layer: infrastructure adapter
    * `[✅]` All dependencies inward-facing (SDK, shared types)
    * `[✅]` All provides outward-facing (`AdapterResponsePayload` to callers via factory)
  * `[✅]` `requirements`
    * `[✅]` `sendMessage` returns identical `AdapterResponsePayload` — zero caller changes
    * `[✅]` All existing `google_adapter.test.ts` tests pass with updated mocks
    * `[✅]` Shared `adapter_test_contract.ts` passes unchanged
    * `[✅]` Token usage is exact (from provider final event, not estimated)
    * `[✅]` Finish reason mapping preserves continuation detection (`'length'` triggers continuation jobs)

* `[✅]` `_shared/ai_service/openai_adapter` **[BE] Convert OpenAI adapter sendMessage to stream-to-buffer**
  * `[✅]` `objective`
    * `[✅]` Replace `client.chat.completions.create()` batch call with `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })` and buffer the streamed chunks into a single complete response
    * `[✅]` Collect `content` by concatenating `choices[0].delta.content` from each chunk event
    * `[✅]` Extract `token_usage` from the final chunk's `usage` field (enabled by `stream_options.include_usage`)
    * `[✅]` Extract `finish_reason` from the chunk where `choices[0].finish_reason` is non-null and map using existing mapping logic
    * `[✅]` Return the identical `AdapterResponsePayload` shape — no callers change
    * `[✅]` Preserve all existing message formatting, resource document appending, max_tokens vs max_completion_tokens logic, and embedding support unchanged
  * `[✅]` `role`
    * `[✅]` Adapter — wraps the OpenAI SDK streaming transport behind the existing `AiProviderAdapter` contract
  * `[✅]` `module`
    * `[✅]` OpenAI provider communication — converts structured prompt to OpenAI streaming API call and buffers response
    * `[✅]` Boundary: SDK call mechanics only; no prompt assembly, no job queue awareness, no document assembly
  * `[✅]` `deps`
    * `[✅]` `npm:openai` — OpenAI SDK, provides streaming via `client.chat.completions.create({ stream: true })` returning `Stream<ChatCompletionChunk>`; adapter layer; outbound infrastructure
    * `[✅]` `types.ts` — `ChatApiRequest`, `AdapterResponsePayload`, `FinishReason`, `ILogger`; shared types; inward dependency
    * `[✅]` Confirm no reverse dependency introduced — callers still receive `Promise<AdapterResponsePayload>`
  * `[✅]` `context_slice`
    * `[✅]` From OpenAI SDK: `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })` returns `Stream<ChatCompletionChunk>`; async iterable; `chunk.choices[0].delta.content` for text; `chunk.usage` on final chunk for token counts
    * `[✅]` Injection shape unchanged — adapter is constructed via `new OpenAIAdapter(provider, apiKey, logger)`
    * `[✅]` No new imports from higher or lateral layers
  * `[✅]` unit/`openai_adapter.test.ts`
    * `[✅]` Update SDK mock: replace `chat.completions.create` mock returning `ChatCompletion` with mock returning async iterable of `ChatCompletionChunk` objects (multiple content deltas + final chunk with `finish_reason` and `usage`)
    * `[✅]` Test: successful stream-to-buffer returns correct `content` string assembled from multiple delta.content events
    * `[✅]` Test: `token_usage` (prompt_tokens, completion_tokens, total_tokens) extracted from final chunk's `usage` field
    * `[✅]` Test: `finish_reason` mapped correctly — `'stop'` → `'stop'`, `'length'` → `'length'`, `'content_filter'` → `'content_filter'`
    * `[✅]` Test: chunks with `null` or missing `delta.content` are skipped without error
    * `[✅]` Test: empty stream (no content deltas) throws descriptive error
    * `[✅]` Test: stream error mid-response (SDK throws during iteration) propagates as adapter error
    * `[✅]` Test: `stream_options.include_usage` is set to `true` in the create call
    * `[✅]` Test: legacy model detection (gpt-3.5-turbo, gpt-4-turbo) still uses `max_tokens`; newer models use `max_completion_tokens` — both with `stream: true`
    * `[✅]` Test: existing resource document appending and embedding tests remain GREEN with streaming mock
    * `[✅]` Verify shared `adapter_test_contract.ts` still passes — external contract unchanged
  * `[✅]` `construction`
    * `[✅]` Constructor unchanged: `new OpenAIAdapter(provider, apiKey, logger)` — `client` field instantiated identically
    * `[✅]` No new construction contexts; no new fields
    * `[✅]` Object completeness: `this.client` is the sole SDK dependency, streaming uses same client instance
  * `[✅]` `openai_adapter.ts`
    * `[✅]` Add `stream: true` and `stream_options: { include_usage: true }` to the `client.chat.completions.create()` payload
    * `[✅]` Iterate the returned `Stream<ChatCompletionChunk>` async iterable, concatenating `chunk.choices[0]?.delta?.content` when present
    * `[✅]` Capture `finish_reason` from the chunk where `chunk.choices[0]?.finish_reason` is non-null
    * `[✅]` Capture `usage` from the final chunk (where `chunk.usage` is non-null)
    * `[✅]` Map `finish_reason` using existing mapping logic (no change to mapping code)
    * `[✅]` Construct and return `AdapterResponsePayload` with buffered content, mapped token_usage, mapped finish_reason — identical shape to current return
    * `[✅]` Preserve all existing: message formatting, resource document → user message appending, legacy vs modern max_tokens logic, `getEmbedding()` unchanged, `listModels()` unchanged
  * `[✅]` integration/`adapter_test_contract.ts`
    * `[✅]` Verify shared contract passes for all three updated adapters — external behavior identical
    * `[✅]` No changes expected to the contract itself; if mock shape in contract needs updating, update here
  * `[✅]` `directionality`
    * `[✅]` Layer: infrastructure adapter
    * `[✅]` All dependencies inward-facing (SDK, shared types)
    * `[✅]` All provides outward-facing (`AdapterResponsePayload` to callers via factory)
  * `[✅]` `requirements`
    * `[✅]` `sendMessage` returns identical `AdapterResponsePayload` — zero caller changes
    * `[✅]` All existing `openai_adapter.test.ts` tests pass with updated mocks
    * `[✅]` Shared `adapter_test_contract.ts` passes unchanged for all three adapters
    * `[✅]` Token usage is exact (from provider final event, not estimated)
    * `[✅]` Finish reason mapping preserves continuation detection (`'length'` triggers continuation jobs)
    * `[✅]` `getEmbedding()` is unaffected (not a streaming endpoint)
  * `[✅]` **Commit** `feat(be): convert Anthropic, Google, and OpenAI adapters to stream-to-buffer — streaming is internal, AdapterResponsePayload contract unchanged, all continuation and job queue logic unaffected`
    * `[✅]` `anthropic_adapter.ts` — `sendMessage` uses `client.messages.stream()` with buffer collection
    * `[✅]` `anthropic_adapter.test.ts` — SDK mocks updated to return streaming responses
    * `[✅]` `google_adapter.ts` — `sendMessage` uses `chat.sendMessageStream()` with buffer collection
    * `[✅]` `google_adapter.test.ts` — SDK mocks updated to return streaming responses
    * `[✅]` `openai_adapter.ts` — `sendMessage` uses `create({ stream: true, stream_options: { include_usage: true } })` with buffer collection
    * `[✅]` `openai_adapter.test.ts` — SDK mocks updated to return streaming responses
    * `[✅]` `adapter_test_contract.ts` — verified passing for all three adapters

