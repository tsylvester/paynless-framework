[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* `[✅]`   `netlify/functions/ai-stream/adapters/getNodeAiAdapter` **[BE] Node.js AI adapter factory — core interface, factory dispatch, and adapter conformance test suite**

  * `[✅]`   `objective`
    * `[✅]`   Provide the core `AiAdapter` interface all provider adapters must implement, a `getNodeAiAdapter` factory function that dispatches to the correct adapter by `api_identifier` prefix, and an exported `runAdapterConformanceTests` utility that each adapter node imports to prove interface compliance without test drift
    * `[✅]`   Functional goals:
      * Define all shared Node.js streaming types mirroring Supabase counterparts: `NodeChatMessage`, `NodeChatApiRequest`, `NodeOutboundDocument`, `NodeModelConfig`, `NodeTokenUsage`, `NodeAdapterStreamChunk`, `NodeAdapterConstructorParams`, `AiAdapter`
      * Implement `getNodeAiAdapter(deps, params)` that selects and returns the correct adapter or null for unknown providers
      * Export `runAdapterConformanceTests(factory: NodeAdapterFactory)` — shared test suite each adapter runs against its own implementation to prevent drift
    * `[✅]`   Non-functional constraints:
      * Integration test with real adapter implementations deferred to Google adapter node (last in dep chain) — this node tests with mock adapters only
      * `defaultNodeProviderMap` is populated incrementally as each adapter node is completed
      * No `any` types; all guards cover every exported type

  * `[✅]`   `role`
    * `[✅]`   Role: infra/factory — defines contract and dispatch mechanism for all Node.js AI provider adapters
    * `[✅]`   Why appropriate: single source of truth for the adapter interface; prevents drift between providers; mirrors the Deno factory pattern in `_shared/ai_service/factory.ts`
    * `[✅]`   Must NOT: implement provider-specific streaming logic, access Supabase, or know about `ai-stream` workload internals

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `netlify/functions/ai-stream/adapters` — Node.js adapter contract layer
    * `[✅]`   Inside boundary: core interface types, factory dispatch logic, conformance test utilities, shared guards
    * `[✅]`   Outside boundary: provider-specific streaming (each adapter node), workload orchestration (`ai-stream`)

  * `[✅]`   `deps`
    * `[✅]`   `NodeProviderMap` — injected at construction; maps `api_identifier` prefix strings to `NodeAdapterFactory` functions
    * `[✅]`   No external npm packages in the factory itself — provider SDKs live in each adapter node
    * `[✅]`   No reverse deps; adapter nodes depend on this node, not the reverse

  * `[✅]`   `context_slice`
    * `[✅]`   Receives `GetNodeAiAdapterDeps`: `{ providerMap: NodeProviderMap }`
    * `[✅]`   Receives `GetNodeAiAdapterParams`: `{ apiIdentifier: string; apiKey: string; modelConfig: NodeModelConfig }`
    * `[✅]`   Returns `AiAdapter | null`

  * `[✅]`   `ai-adapter.interface.test.ts`
    * `[✅]`   Valid `NodeChatMessage`: `role` is `'user' | 'assistant' | 'system'`, `content` is string
    * `[✅]`   Valid `NodeChatApiRequest`: `message` is string, optional `messages` array, optional `resourceDocuments` array, optional `max_tokens_to_generate`, required `providerId`, required `promptId`
    * `[✅]`   Valid `NodeOutboundDocument`: `id` is string, `content` is string, optional `document_key`, optional `stage_slug`
    * `[✅]`   Valid `NodeModelConfig`: `api_identifier` is string, optional `provider_max_input_tokens`, optional `context_window_tokens`, optional `hard_cap_output_tokens`, optional `provider_max_output_tokens`, required `input_token_cost_rate` (number or null), required `output_token_cost_rate` (number or null)
    * `[✅]`   Valid `NodeTokenUsage`: `prompt_tokens`, `completion_tokens`, `total_tokens` are non-negative integers
    * `[✅]`   Valid `NodeAdapterStreamChunk`: discriminated union — `{ type: 'text_delta'; text: string }` or `{ type: 'usage'; tokenUsage: NodeTokenUsage }` or `{ type: 'done'; finish_reason: string }`
    * `[✅]`   Invalid: missing `message` on `NodeChatApiRequest`, missing `api_identifier` on `NodeModelConfig`, non-integer token counts → guard rejects
    * `[✅]`   `AiAdapter`: object with `sendMessageStream` function — guard accepts; missing `sendMessageStream` → guard rejects

  * `[✅]`   `ai-adapter.interface.ts`
    * `[✅]`   `NodeChatMessage`: `{ role: 'user' | 'assistant' | 'system'; content: string }`
    * `[✅]`   `NodeOutboundDocument`: `{ id: string; content: string; document_key?: string; stage_slug?: string }` — mirrors Supabase `OutboundDocument`
    * `[✅]`   `NodeChatApiRequest`: `{ message: string; messages?: NodeChatMessage[]; resourceDocuments?: NodeOutboundDocument[]; max_tokens_to_generate?: number; providerId: string; promptId: string }` — mirrors adapter-consumed fields from Supabase `ChatApiRequest`
    * `[✅]`   `NodeModelConfig`: `{ api_identifier: string; provider_max_input_tokens?: number; context_window_tokens?: number | null; hard_cap_output_tokens?: number; provider_max_output_tokens?: number; input_token_cost_rate: number | null; output_token_cost_rate: number | null }` — mirrors adapter-consumed fields from Supabase `AiModelExtendedConfig`
    * `[✅]`   `NodeTokenUsage`: `{ prompt_tokens: number; completion_tokens: number; total_tokens: number }`
    * `[✅]`   `NodeAdapterStreamChunk`: discriminated union `{ type: 'text_delta'; text: string } | { type: 'usage'; tokenUsage: NodeTokenUsage } | { type: 'done'; finish_reason: string }` — mirrors Supabase `AdapterStreamChunk`
    * `[✅]`   `NodeAdapterConstructorParams`: `{ modelConfig: NodeModelConfig; apiKey: string }`
    * `[✅]`   `AiAdapter`: `{ sendMessageStream(request: NodeChatApiRequest, apiIdentifier: string): AsyncGenerator<NodeAdapterStreamChunk> }` — mirrors Supabase adapter `sendMessageStream` signature
    * `[✅]`   `NodeAdapterFactory`: `(params: NodeAdapterConstructorParams) => AiAdapter`
    * `[✅]`   `NodeProviderMap`: `Record<string, NodeAdapterFactory>`
    * `[✅]`   No `any`, no optional fields without explicit justification

  * `[✅]`   `getNodeAiAdapter.interface.test.ts`
    * `[✅]`   Valid `GetNodeAiAdapterDeps`: `providerMap` is a `NodeProviderMap` with at least one entry whose value is a function
    * `[✅]`   Valid `GetNodeAiAdapterParams`: non-empty `apiIdentifier`, non-empty `apiKey`, valid `modelConfig`
    * `[✅]`   Invalid: missing `providerMap`, empty `providerMap`, non-function map values → guard rejects
    * `[✅]`   Invalid: empty `apiIdentifier`, missing `modelConfig` → guard rejects

  * `[✅]`   `getNodeAiAdapter.interface.ts`
    * `[✅]`   `GetNodeAiAdapterDeps`: `{ providerMap: NodeProviderMap }`
    * `[✅]`   `GetNodeAiAdapterParams`: `{ apiIdentifier: string; apiKey: string; modelConfig: NodeModelConfig }`
    * `[✅]`   `GetNodeAiAdapterFn`: `(deps: GetNodeAiAdapterDeps, params: GetNodeAiAdapterParams) => AiAdapter | null`

  * `[✅]`   `getNodeAiAdapter.guard.test.ts`
    * `[✅]`   `isNodeProviderMap`: accepts valid map; rejects empty object; rejects non-function values
    * `[✅]`   `isGetNodeAiAdapterDeps`: accepts valid; rejects missing `providerMap`
    * `[✅]`   `isGetNodeAiAdapterParams`: accepts valid; rejects empty strings
    * `[✅]`   `isAiAdapter`: accepts object with `sendMessageStream` function; rejects non-function or missing `sendMessageStream`
    * `[✅]`   `isNodeAdapterStreamChunk`: accepts all three discriminated variants; rejects unknown `type` values

  * `[✅]`   `getNodeAiAdapter.guard.ts`
    * `[✅]`   `isNodeChatMessage(v: unknown): v is NodeChatMessage`
    * `[✅]`   `isNodeOutboundDocument(v: unknown): v is NodeOutboundDocument`
    * `[✅]`   `isNodeChatApiRequest(v: unknown): v is NodeChatApiRequest`
    * `[✅]`   `isNodeModelConfig(v: unknown): v is NodeModelConfig`
    * `[✅]`   `isNodeTokenUsage(v: unknown): v is NodeTokenUsage`
    * `[✅]`   `isNodeAdapterStreamChunk(v: unknown): v is NodeAdapterStreamChunk`
    * `[✅]`   `isAiAdapter(v: unknown): v is AiAdapter`
    * `[✅]`   `isNodeProviderMap(v: unknown): v is NodeProviderMap`
    * `[✅]`   `isGetNodeAiAdapterDeps(v: unknown): v is GetNodeAiAdapterDeps`
    * `[✅]`   `isGetNodeAiAdapterParams(v: unknown): v is GetNodeAiAdapterParams`

  * `[✅]`   `adapter-conformance.test-utils.ts` *(exported — imported by each adapter node's unit test to prove conformance without drift)*
    * `[✅]`   Exports `runAdapterConformanceTests(factory: NodeAdapterFactory): void`
    * `[✅]`   Conformance cases (each adapter's test provides mock SDK, factory produces adapter):
      * `factory({ modelConfig, apiKey })` returns object satisfying `isAiAdapter`
      * `sendMessageStream()` called with valid `NodeChatApiRequest` and `apiIdentifier` yields `NodeAdapterStreamChunk` values
      * `sendMessageStream()` yields at least one `text_delta`, one `usage`, and one `done` chunk in happy path
      * `sendMessageStream()` with provider SDK error propagates throw (does not swallow)
      * `usage` chunk `tokenUsage` has correct `NodeTokenUsage` shape
      * `done` chunk `finish_reason` is a non-empty string

  * `[✅]`   `getNodeAiAdapter.test.ts`
    * `[✅]`   Known prefix (`'openai-gpt-4o'`) in mock provider map → factory returned and called with `{ modelConfig, apiKey }`
    * `[✅]`   Known prefix case-insensitive (`'OPENAI-GPT-4O'`) → same result
    * `[✅]`   Unknown prefix → returns null
    * `[✅]`   Empty `apiIdentifier` → returns null
    * `[✅]`   Mock `NodeProviderMap` used — no real provider SDKs imported

  * `[✅]`   `construction`
    * `[✅]`   `defaultNodeProviderMap: NodeProviderMap` — populated as each adapter node is completed; starts empty in this node
    * `[✅]`   Factory is stateless — `deps.providerMap` and `params` injected per call
    * `[✅]`   Test framework: Vitest (Node.js); `describe` / `it` / `expect`

  * `[✅]`   `getNodeAiAdapter.ts`
    * `[✅]`   Exports `getNodeAiAdapter(deps: GetNodeAiAdapterDeps, params: GetNodeAiAdapterParams): AiAdapter | null`
    * `[✅]`   Lowercases `params.apiIdentifier`
    * `[✅]`   Finds matching prefix via `Object.keys(deps.providerMap).find(prefix => lower.startsWith(prefix))`
    * `[✅]`   Returns `deps.providerMap[prefix]({ modelConfig: params.modelConfig, apiKey: params.apiKey })` or null if no prefix found

  * `[✅]`   `getNodeAiAdapter.mock.ts`
    * `[✅]`   `createMockNodeProviderMap(overrides?: Partial<NodeProviderMap>): NodeProviderMap` — default: `{ 'openai-': (params) => mockAiAdapter, 'anthropic-': (params) => mockAiAdapter, 'google-': (params) => mockAiAdapter }`
    * `[✅]`   `createMockGetNodeAiAdapterDeps(overrides?): GetNodeAiAdapterDeps`
    * `[✅]`   `mockAiAdapter`: satisfies `isAiAdapter`; `sendMessageStream()` yields mock `NodeAdapterStreamChunk` sequence (`text_delta`, `usage`, `done`)

  * `[✅]`   `getNodeAiAdapter.provides.ts`
    * `[✅]`   Exports: `getNodeAiAdapter`, `defaultNodeProviderMap`, `GetNodeAiAdapterFn`
    * `[✅]`   Re-exports all shared types from `ai-adapter.interface.ts`: `AiAdapter`, `NodeAdapterStreamChunk`, `NodeAdapterConstructorParams`, `NodeTokenUsage`, `NodeChatApiRequest`, `NodeOutboundDocument`, `NodeModelConfig`, `NodeAdapterFactory`, `NodeProviderMap`
    * `[✅]`   Re-exports all shared guards: `isAiAdapter`, `isNodeAdapterStreamChunk`, `isNodeTokenUsage`
    * `[✅]`   Re-exports: `runAdapterConformanceTests` from `adapter-conformance.test-utils.ts`
    * `[✅]`   No external access to factory internals bypasses this file

  * `[✅]`   `getNodeAiAdapter.integration.test.ts`
    * `[✅]`   NOTE: Integration test with real adapter implementations is in the Google adapter node (last adapter in dep chain)
    * `[✅]`   This file validates factory dispatch with mock provider map: known prefix returns adapter satisfying `isAiAdapter`; unknown prefix returns null

  * `[✅]`   `directionality`
    * `[✅]`   Layer: infra/factory (Node.js)
    * `[✅]`   Deps inward: `NodeProviderMap` injected; no external npm packages in factory itself
    * `[✅]`   Provides outward: `AiAdapter` interface and all shared types to adapter nodes and `ai-stream` workload; `runAdapterConformanceTests` to adapter test files
    * `[✅]`   No cycles: adapter nodes depend on factory; factory does not import adapters

  * `[✅]`   `requirements`
    * `[✅]`   Known prefix returns adapter factory result — proven by unit test
    * `[✅]`   Unknown prefix returns null — proven by unit test
    * `[✅]`   `runAdapterConformanceTests` runs successfully in each of the three adapter test files — proven by adapter nodes
    * `[✅]`   All shared type guards reject invalid inputs — proven by guard unit tests

* `[✅]`   `netlify/functions/ai-stream/adapters/openai/openai-adapter` **[BE] OpenAI Node.js streaming adapter — port of Supabase `openai_adapter.ts` for Netlify Async Workload**

  * ` [✅]`   `objective`
    * ` [✅]`   Port the existing Supabase `openai_adapter.ts` (`_prepareOpenAiStreamingRequest` + `sendMessageStream`) to a Node.js adapter that yields `NodeAdapterStreamChunk` values via `AsyncGenerator`, preserving identical message preparation, resource document injection, token cap resolution, and finish_reason mapping
    * ` [✅]`   Functional goals:
      * Accept `NodeChatApiRequest` and `api_identifier`; prepare the OpenAI request body identically to the Supabase adapter
      * Yield `text_delta`, `usage`, and `done` chunks matching the Supabase `AdapterStreamChunk` discriminated union
      * Map OpenAI finish_reason values (`stop`, `length`, `tool_calls`, `content_filter`, `function_call`) to the same FinishReason strings the Supabase adapter produces; any other/`undefined` → `unknown`
    * ` [✅]`   Non-functional constraints:
      * Runs in Node.js 18+ (Netlify runtime) — zero Deno APIs
      * No Supabase access — model config and API key injected at construction via `NodeAdapterConstructorParams`
      * No internal soft timeout — handler manages timeout
    * ` [✅]`   **Infrastructure prerequisite (before any Netlify node can be built or tested):**
      * `netlify/functions/ai-stream/package.json` — Node.js package with `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `@supabase/supabase-js`, `@netlify/async-workloads`, TypeScript, and a test runner (Vitest)
      * `netlify/functions/ai-stream/tsconfig.json` — strict TypeScript config targeting Node.js
      * `netlify.toml` — registers `ai-stream` as an async workload function
      * `.env` / Netlify env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIALECTIC_SAVERESPONSE_URL`
      * These are config artifacts, not source nodes; no TDD required

  * ` [✅]`   `role`
    * ` [✅]`   Role: infra/adapter — wraps `openai` Node.js SDK to satisfy the shared `AiAdapter` interface via `sendMessageStream` AsyncGenerator
    * ` [✅]`   Why appropriate: workload dispatches to provider-specific streaming logic without owning OpenAI implementation details
    * ` [✅]`   Must NOT: interact with Supabase, read from DB, call the back-half, or manage job state

  * ` [✅]`   `module`
    * ` [✅]`   Bounded context: `netlify/functions/ai-stream/adapters` — Netlify-side AI streaming adapter layer
    * ` [✅]`   Inside boundary: OpenAI request preparation (message mapping, resource doc injection, token cap resolution), stream invocation, chunk yielding, finish_reason mapping
    * ` [✅]`   Outside boundary: job state, DB access, HTTP callback to back-half, stream assembly (handler's job)

  * ` [✅]`   `deps`
    * ` [✅]`   `openai` npm package — external, infra layer, provides streaming chat SDK
    * ` [✅]`   `ai-adapter.interface.ts` — defined in factory node (`getNodeAiAdapter`); imported here, not owned here
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) — imported from factory node, not redefined
    * ` [✅]`   No reverse deps; no lateral violations

  * ` [✅]`   `context_slice`
    * ` [✅]`   Constructed with `NodeAdapterConstructorParams`: `{ modelConfig: NodeModelConfig, apiKey: string }`
    * ` [✅]`   `sendMessageStream` receives `NodeChatApiRequest` and `apiIdentifier: string`
    * ` [✅]`   Yields `NodeAdapterStreamChunk` values (`text_delta`, `usage`, `done`)
    * ` [✅]`   No over-fetching — adapter does not receive job_id, user_jwt, or DB handles

  * ` [✅]`   `openai.interface.test.ts` *(rework — missing `finish_reason`/Choice split)*
    * ` [✅]`   Imports types ONLY from `openai.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * ` [✅]`   Construct `OpenAIDelta` literal with `content: 'text'` — compiles; assert `typeof literal.content === 'string'`
    * ` [✅]`   Construct `OpenAIDelta` literal with `content: null` — compiles (nullable)
    * ` [✅]`   Construct `OpenAIDelta` literal with `content` omitted — compiles (optional)
    * ` [✅]`   Construct `OpenAIChoice` literal for each `OpenAIFinishReason` member (`stop`, `length`, `tool_calls`, `content_filter`, `function_call`) — each compiles; assert `literal.finish_reason` equals the tag
    * ` [✅]`   Construct `OpenAIChoice` literal with `finish_reason: null` (mid-stream choice before completion) — compiles
    * ` [✅]`   Construct `OpenAIUsageDelta` literal with `prompt_tokens: 10, completion_tokens: 20, total_tokens: 30` — compiles; assert each field `typeof === 'number'`
    * ` [✅]`   Construct `OpenAIChatCompletionChunk` literal with non-empty `choices: OpenAIChoice[]` and `usage: OpenAIUsageDelta` — compiles; assert `Array.isArray(literal.choices) && literal.choices.length > 0`
    * ` [✅]`   Construct `OpenAIChatCompletionChunk` literal with empty `choices: []` — compiles (array may be empty mid-stream, e.g. final usage-only chunk)
    * ` [✅]`   Construct `OpenAIChatCompletionChunk` literal with `usage: null` — compiles (nullable)
    * ` [✅]`   Construct `OpenAIChatCompletionChunk` literal with `usage` omitted — compiles (optional)
    * ` [✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern, not a test-time one; runtime accept/reject belongs in `openai.guard.test.ts`

  * ` [✅]`   `openai.interface.ts` *(rework — add `OpenAIFinishReason`, split Choice from Delta)*
    * ` [✅]`   `OpenAIFinishReason`: `'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call'` — exhaustive union of SDK-known values; adapter maps any other/`null` via `_mapOpenAiFinishReason` to `'unknown'`
    * ` [✅]`   `OpenAIDelta`: `{ content?: string | null }` — inner delta object carried on each choice; the adapter reads `choice.delta.content`
    * ` [✅]`   `OpenAIChoice`: `{ delta: OpenAIDelta; finish_reason: OpenAIFinishReason | null }` — the adapter reads `chunk.choices[0].finish_reason` which is `null` until the final choice
    * ` [✅]`   `OpenAIUsageDelta`: `{ prompt_tokens: number; completion_tokens: number; total_tokens: number }` — non-negative integers required at runtime (validated by guard)
    * ` [✅]`   `OpenAIChatCompletionChunk`: `{ choices: OpenAIChoice[]; usage?: OpenAIUsageDelta | null }` — `choices` is always an array (may be empty on usage-only tail chunk); `usage` present on final chunk only
    * ` [✅]`   No `any`, no casts

  * ` [✅]`   `openai.interaction.spec`
    * ` [✅]`   Called by `ai-stream` handler when `api_identifier` prefix matches `openai-`
    * ` [✅]`   `sendMessageStream` ports `_prepareOpenAiStreamingRequest` from Supabase `openai_adapter.ts`:
      * Strips `openai-` prefix from `apiIdentifier` to derive `modelApiName` (e.g. `openai-gpt-4o` → `gpt-4o`)
      * Validates `modelApiName` matches `modelConfig.api_identifier` (also prefix-stripped); throws on mismatch
      * Maps `request.messages` to OpenAI message format (role/content), filters empty content
      * Injects `request.resourceDocuments` as additional user messages with formatted document content (validates `document_key` and `stage_slug` on resource documents)
      * Appends `request.message` as final user message
      * Resolves token cap: `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens` → `modelConfig.provider_max_output_tokens` (takes `Math.min` of available candidates)
      * Branches on `modelApiName` for `max_tokens` vs `max_completion_tokens` parameter (legacy `gpt-3.5-turbo`/`gpt-4-turbo`/`gpt-4` vs newer models)
    * ` [✅]`   Calls `openai.chat.completions.create({ stream: true, stream_options: { include_usage: true }, model: modelApiName, messages, ...tokenParam })`
    * ` [✅]`   Iterates stream via `for await`; yields `{ type: 'text_delta', text }` for each content delta
    * ` [✅]`   Post-stream validation: if assembled content is empty after trimming, throws (Supabase: `'OpenAI response content is empty or missing.'`)
    * ` [✅]`   Post-stream validation: if no usage data received, throws (Supabase: `'OpenAI response did not include usage data.'`)
    * ` [✅]`   Yields `{ type: 'usage', tokenUsage }` from final chunk usage data
    * ` [✅]`   Yields `{ type: 'done', finish_reason }` with mapped finish_reason via `_mapOpenAiFinishReason`: `stop` → `stop`, `length` → `length`, `tool_calls` → `tool_calls`, `content_filter` → `content_filter`, `function_call` → `function_call`, any other value or `undefined` → `unknown`
    * ` [✅]`   On stream error: throws — caller (handler) catches
    * ` [✅]`   No side effects beyond yielding chunks; no DB writes, no HTTP calls

  * ` [✅]`   `openai.guard.test.ts` *(rework — add guards for `OpenAIFinishReason`, `OpenAIDelta`, `OpenAIChoice`)*
    * ` [✅]`   `isOpenAIFinishReason`: accepts each union member (`stop`, `length`, `tool_calls`, `content_filter`, `function_call`); rejects unrecognized strings (e.g. `'foo'`), `null`, `undefined`, non-strings
    * ` [✅]`   `isOpenAIDelta`: accepts `{ content: 'text' }`, `{ content: null }`, `{}`; rejects `{ content: 123 }`, non-object, `null`
    * ` [✅]`   `isOpenAIChoice`: accepts valid choice with each `OpenAIFinishReason` value and with `finish_reason: null`; rejects missing `delta`, invalid `delta`, missing `finish_reason` field, `finish_reason` set to unrecognized string
    * ` [✅]`   `isOpenAIUsageDelta`: accepts valid usage; rejects negative integers, non-integers, missing fields
    * ` [✅]`   `isOpenAIChatCompletionChunk`: accepts valid chunk (with usage, with `usage: null`, with usage omitted, with empty `choices: []`); rejects missing `choices`, non-array `choices`, `choices` containing non-`OpenAIChoice` elements, `usage` present with invalid shape
    * ` [✅]`   No false positives or negatives against the interface test cases

  * ` [✅]`   `openai.guard.ts` *(rework — add `isOpenAIFinishReason`, `isOpenAIDelta`, `isOpenAIChoice`)*
    * ` [✅]`   `isOpenAIFinishReason(v: unknown): v is OpenAIFinishReason`
    * ` [✅]`   `isOpenAIDelta(v: unknown): v is OpenAIDelta`
    * ` [✅]`   `isOpenAIChoice(v: unknown): v is OpenAIChoice` — requires `delta: OpenAIDelta` and `finish_reason: OpenAIFinishReason | null`
    * ` [✅]`   `isOpenAIUsageDelta(v: unknown): v is OpenAIUsageDelta`
    * ` [✅]`   `isOpenAIChatCompletionChunk(v: unknown): v is OpenAIChatCompletionChunk`
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) imported from factory node — not redefined here

  * ` [✅]`   `openai.test.ts`
    * ` [✅]`   Mocks `openai` SDK stream: sequence of text delta chunks — asserts `text_delta` chunks yielded with correct text
    * ` [✅]`   Mocks stream with `stream_options: { include_usage: true }` and usage on final chunk — asserts `usage` chunk yielded with correct `NodeTokenUsage`
    * ` [✅]`   Mocks stream with no usage: asserts adapter **throws** (Supabase throws on missing usage; conformance suite requires a `usage` chunk)
    * ` [✅]`   Mocks stream with empty content (only whitespace deltas): asserts adapter **throws** (Supabase: `'OpenAI response content is empty or missing.'`)
    * ` [✅]`   Asserts `done` chunk yielded with mapped `finish_reason` string for each known case (`stop`, `length`, `tool_calls`, `content_filter`, `function_call`)
    * ` [✅]`   Asserts `done` chunk yielded with `finish_reason: 'unknown'` when provider returns an unrecognized finish reason
    * ` [✅]`   Mocks stream that throws mid-iteration: asserts error propagates (not swallowed)
    * ` [✅]`   Tests prefix stripping: `apiIdentifier: 'openai-gpt-4o'` → SDK called with `model: 'gpt-4o'`; mismatched `modelConfig.api_identifier` → throws
    * ` [✅]`   Tests message preparation: `request.messages` mapped correctly, `request.resourceDocuments` injected (with format/validation), `request.message` appended as final user message
    * ` [✅]`   Tests token cap resolution: `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens` → `modelConfig.provider_max_output_tokens` fallback chain (takes `Math.min` of candidates)
    * ` [✅]`   Tests `max_tokens` vs `max_completion_tokens` branching based on stripped model name

  * ` [✅]`   `construction`
    * ` [✅]`   Factory: `createOpenAINodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   Stores `modelConfig` and `apiKey` from constructor params
    * ` [✅]`   Test framework: Vitest (Node.js); test files use `describe` / `it` / `expect`

  * ` [✅]`   `openai.ts`
    * ` [✅]`   Exports `createOpenAINodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   Instantiates `OpenAI({ apiKey: params.apiKey })`
    * ` [✅]`   `sendMessageStream(request, apiIdentifier)`: ports `_prepareOpenAiStreamingRequest` — strips `openai-` prefix to get `modelApiName`, validates against `modelConfig.api_identifier` (also stripped), maps messages, filters empty content, injects resource documents (validates `document_key`/`stage_slug`), appends current message, resolves token cap (`Math.min` of candidates), branches `max_tokens` vs `max_completion_tokens` on `modelApiName`
    * ` [✅]`   Calls `client.chat.completions.create({ stream: true, stream_options: { include_usage: true }, model: modelApiName, messages, ...tokenParam })`
    * ` [✅]`   `for await` loop yields `text_delta` chunks; captures `finish_reason` from choices; captures usage from final chunk
    * ` [✅]`   Post-stream: throws if assembled content is empty after trimming
    * ` [✅]`   Post-stream: throws if no usage data received
    * ` [✅]`   Yields `usage` chunk, then yields `done` chunk with mapped finish_reason (including `'unknown'` default)
    * ` [✅]`   Throws on stream error

  * ` [✅]`   `openai.mock.ts`
    * ` [✅]`   `createMockOpenAINodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter`
    * ` [✅]`   Default: `sendMessageStream` yields `{ type: 'text_delta', text: 'mock openai response' }`, `{ type: 'usage', tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }`, `{ type: 'done', finish_reason: 'stop' }`
    * ` [✅]`   Error override: `sendMessageStream` throws `new Error('mock openai stream error')`
    * ` [✅]`   Conforms to `AiAdapter` interface; validated by `isAiAdapter` guard

  * ` [✅]`   `openai.provides.ts`
    * ` [✅]`   Exports: `createOpenAINodeAdapter`
    * ` [✅]`   Exports OpenAI-specific types: `OpenAIChatCompletionChunk`, `OpenAIChoice`, `OpenAIDelta`, `OpenAIFinishReason`, `OpenAIUsageDelta`
    * ` [✅]`   Exports OpenAI-specific guards: `isOpenAIChatCompletionChunk`, `isOpenAIChoice`, `isOpenAIDelta`, `isOpenAIFinishReason`, `isOpenAIUsageDelta`
    * ` [✅]`   Does NOT re-export shared factory types or guards — consumers import those from the factory node directly
    * ` [✅]`   No external access to adapter internals bypasses this file

  * ` [✅]`   `openai.integration.test.ts`
    * ` [✅]`   Validates `createOpenAINodeAdapter({ modelConfig, apiKey })` result satisfies `isAiAdapter` at runtime
    * ` [✅]`   Simulates dispatch: `api_identifier: 'openai-gpt-4o'` → adapter constructed → `sendMessageStream()` called with mock `NodeChatApiRequest` → yields `NodeAdapterStreamChunk` values
    * ` [✅]`   Uses mocked `openai` SDK — no live API calls

  * ` [✅]`   `directionality`
    * ` [✅]`   Layer: infra/adapter (Netlify-side Node.js)
    * ` [✅]`   Deps inward: `openai` npm package (external boundary)
    * ` [✅]`   Provides outward: `AiAdapter` and all shared Netlify types used by Anthropic adapter, Google adapter, and `ai-stream` workload
    * ` [✅]`   No cycles

  * ` [✅]`   `requirements`
    * ` [✅]`   `sendMessageStream()` yields correct `text_delta` chunks — proven by unit test
    * ` [✅]`   `sendMessageStream()` yields `usage` chunk with correct `NodeTokenUsage` — proven by unit test
    * ` [✅]`   `sendMessageStream()` yields `done` chunk with mapped finish_reason (including `'unknown'` default) — proven by unit test
    * ` [✅]`   `sendMessageStream()` throws on empty content — proven by unit test
    * ` [✅]`   `sendMessageStream()` throws on missing usage data — proven by unit test
    * ` [✅]`   Prefix stripping: `apiIdentifier` → `modelApiName`; mismatch with `modelConfig.api_identifier` → throws — proven by unit test
    * ` [✅]`   Message preparation matches Supabase `_prepareOpenAiStreamingRequest` behavior — proven by unit test
    * ` [✅]`   Token cap resolution follows fallback chain — proven by unit test
    * ` [✅]`   `sendMessageStream()` with OpenAI error throws — proven by unit test
    * ` [✅]`   Adapter satisfies `AiAdapter` at runtime — proven by integration test guard check
    * ` [✅]`   Passes `runAdapterConformanceTests` — proven by conformance suite (requires `text_delta`, `usage`, and `done` chunks in happy path)
    * ` [✅]`   No Deno APIs present — proven by Node.js TypeScript build

* `[✅]`   `netlify/functions/ai-stream/adapters/anthropic/anthropic-adapter` **[BE] Anthropic Node.js streaming adapter — port of Supabase `anthropic_adapter.ts` for Netlify Async Workload**

  * ` [✅]`   `objective`
    * ` [✅]`   Port the existing Supabase `anthropic_adapter.ts` (`_prepareAnthropicRequest` + `sendMessageStream`) to a Node.js adapter that yields `NodeAdapterStreamChunk` values via `AsyncGenerator`, preserving identical system prompt extraction, message merging, alternating role enforcement, resource document injection, and finish_reason mapping
    * ` [✅]`   Functional goals:
      * Accept `NodeChatApiRequest` and `api_identifier`; prepare the Anthropic request body identically to the Supabase adapter
      * Yield `text_delta`, `usage`, and `done` chunks matching the Supabase `AdapterStreamChunk` discriminated union
      * Map Anthropic `stop_reason` values (`end_turn`/`stop_sequence` → `stop`, `max_tokens` → `max_tokens`, `tool_use` → `tool_use`, any other/absent → `unknown`)
    * ` [✅]`   Non-functional constraints:
      * Node.js 18+ only — no Deno APIs
      * No Supabase access; model config and API key injected at construction via `NodeAdapterConstructorParams`
      * No internal soft timeout — handler manages timeout

  * ` [✅]`   `role`
    * ` [✅]`   Role: infra/adapter — wraps `@anthropic-ai/sdk` to satisfy `AiAdapter` via `sendMessageStream` AsyncGenerator
    * ` [✅]`   Why appropriate: workload dispatches to this adapter for `anthropic-*` identifiers without owning Anthropic-specific streaming semantics
    * ` [✅]`   Must NOT: interact with Supabase, manage job state, or call the back-half

  * ` [✅]`   `module`
    * ` [✅]`   Bounded context: `netlify/functions/ai-stream/adapters` — same adapter layer as OpenAI
    * ` [✅]`   Inside boundary: Anthropic request preparation (system prompt extraction, message merging, alternating role enforcement, resource doc injection), stream invocation, chunk yielding, finish_reason mapping
    * ` [✅]`   Outside boundary: job state, DB, HTTP callback, stream assembly (handler's job)

  * ` [✅]`   `deps`
    * ` [✅]`   `@anthropic-ai/sdk` npm package — external, provides streaming Messages API
    * ` [✅]`   `ai-adapter.interface.ts` — defined in factory node (`getNodeAiAdapter`); imported here, not owned here
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) — imported from factory node, not redefined
    * ` [✅]`   No reverse deps

  * ` [✅]`   `context_slice`
    * ` [✅]`   Constructed with `NodeAdapterConstructorParams`: `{ modelConfig: NodeModelConfig, apiKey: string }`
    * ` [✅]`   `sendMessageStream` receives `NodeChatApiRequest` and `apiIdentifier: string`
    * ` [✅]`   Yields `NodeAdapterStreamChunk` values (`text_delta`, `usage`, `done`)
    * ` [✅]`   No over-fetching

  * ` [✅]`   `anthropic.interface.test.ts`
    * ` [✅]`   Imports types ONLY from `anthropic.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * ` [✅]`   Construct `AnthropicTextDelta` literal with `type: 'text_delta'`, `text: 'chunk'` — compiles; assert `literal.type === 'text_delta'` and `typeof literal.text === 'string'`
    * ` [✅]`   Construct `AnthropicContentBlockDeltaEvent` literal with `type: 'content_block_delta'` and nested `delta: AnthropicTextDelta` — compiles; assert `literal.type === 'content_block_delta'` and `literal.delta.type === 'text_delta'`
    * ` [✅]`   Construct `AnthropicUsage` literal with `input_tokens: 10, output_tokens: 20` — compiles; assert both fields `typeof === 'number'`
    * ` [✅]`   Construct `AnthropicFinalMessage` literal for each `AnthropicStopReason` member (`end_turn`, `stop_sequence`, `max_tokens`, `tool_use`) — each compiles; assert `literal.stop_reason` equals the tag
    * ` [✅]`   Construct `AnthropicFinalMessage` literal with `stop_reason: null` (adapter interprets as `'unknown'`) — compiles
    * ` [✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern, not a test-time one; runtime accept/reject belongs in `anthropic.guard.test.ts`

  * ` [✅]`   `anthropic.interface.ts`
    * ` [✅]`   `AnthropicStopReason`: `'end_turn' | 'stop_sequence' | 'max_tokens' | 'tool_use'` — exhaustive union of SDK-known values; adapter maps any other/`null` to `'unknown'`
    * ` [✅]`   `AnthropicTextDelta`: `{ type: 'text_delta'; text: string }` — the only content-block delta subtype the adapter reads (per `event.delta.type === 'text_delta'` guard in Supabase adapter)
    * ` [✅]`   `AnthropicContentBlockDeltaEvent`: `{ type: 'content_block_delta'; delta: AnthropicTextDelta }` — the only stream event the adapter consumes during `for await`
    * ` [✅]`   `AnthropicUsage`: `{ input_tokens: number; output_tokens: number }` — non-negative integers required at runtime
    * ` [✅]`   `AnthropicFinalMessage`: `{ usage: AnthropicUsage; stop_reason: AnthropicStopReason | null }` — returned by `stream.finalMessage()`; sole source of `usage` and `done.finish_reason` chunks
    * ` [✅]`   No `any`, no casts
    * ` [✅]`   Dead types removed: no `AnthropicMessageStartEvent`, `AnthropicMessageStartUsage`, `AnthropicMessageDeltaEvent`, `AnthropicMessageDeltaUsage` — the streaming adapter never reads `message_start` or `message_delta` events (only `content_block_delta` and `finalMessage()`)

  * ` [✅]`   `anthropic.interaction.spec`
    * ` [✅]`   Called by `ai-stream` handler when `api_identifier` prefix matches `anthropic-`
    * ` [✅]`   `sendMessageStream` ports `_prepareAnthropicRequest` from Supabase `anthropic_adapter.ts`:
      * Strips `anthropic-` prefix from `apiIdentifier` to derive `modelApiName` (e.g. `anthropic-claude-3-5-sonnet` → `claude-3-5-sonnet`)
      * Extracts system prompt from messages array (first `system` role message)
      * Pushes `request.message` as final user message into combined array
      * Merges consecutive same-role messages
      * Enforces alternating user/assistant roles
      * Injects `request.resourceDocuments` as document content blocks prepended to first user message (validates `document_key`/`stage_slug`)
      * Resolves `max_tokens`: `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens`; throws if no `maxTokensForPayload` resolved (Anthropic requires `max_tokens`)
    * ` [✅]`   Calls `client.messages.stream({ model: modelApiName, max_tokens: maxTokensForPayload, messages: anthropicMessages, system: systemPrompt })`
    * ` [✅]`   Yields `{ type: 'text_delta', text }` for each `content_block_delta` text event
    * ` [✅]`   On stream end: yields `{ type: 'usage', tokenUsage }` from `stream.finalMessage()` (`input_tokens` → `prompt_tokens`, `output_tokens` → `completion_tokens`, sum → `total_tokens`); SDK always provides `response.usage`
    * ` [✅]`   Yields `{ type: 'done', finish_reason }` with mapped finish_reason via `stop_reason`: `end_turn`/`stop_sequence` → `stop`, `max_tokens` → `max_tokens`, `tool_use` → `tool_use`, any other value or absent → `unknown`
    * ` [✅]`   On stream error: throws

  * ` [✅]`   `anthropic.guard.test.ts`
    * ` [✅]`   `isAnthropicStopReason`: accepts each union member (`end_turn`, `stop_sequence`, `max_tokens`, `tool_use`); rejects unrecognized strings, `null`, `undefined`, non-strings
    * ` [✅]`   `isAnthropicTextDelta`: accepts `{ type: 'text_delta', text: 'x' }`; rejects wrong `type`, non-string `text`, missing fields
    * ` [✅]`   `isAnthropicContentBlockDeltaEvent`: accepts valid event; rejects wrong `type`, missing `delta`, `delta` that fails `isAnthropicTextDelta`
    * ` [✅]`   `isAnthropicUsage`: accepts valid usage; rejects negative integers, non-integers, missing fields
    * ` [✅]`   `isAnthropicFinalMessage`: accepts valid final message for each `AnthropicStopReason` value AND for `stop_reason: null`; rejects missing `usage`, invalid `usage`, missing `stop_reason` field, `stop_reason` set to unrecognized string
    * ` [✅]`   No false positives or negatives against the interface test cases

  * ` [✅]`   `anthropic.guard.ts`
    * ` [✅]`   `isAnthropicStopReason(v: unknown): v is AnthropicStopReason`
    * ` [✅]`   `isAnthropicTextDelta(v: unknown): v is AnthropicTextDelta`
    * ` [✅]`   `isAnthropicContentBlockDeltaEvent(v: unknown): v is AnthropicContentBlockDeltaEvent`
    * ` [✅]`   `isAnthropicUsage(v: unknown): v is AnthropicUsage`
    * ` [✅]`   `isAnthropicFinalMessage(v: unknown): v is AnthropicFinalMessage` — validates `usage` via `isAnthropicUsage`; requires `stop_reason` to be `null` or pass `isAnthropicStopReason`
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) imported from factory node — not redefined here

  * ` [✅]`   `anthropic.test.ts`
    * ` [✅]`   Mocks `@anthropic-ai/sdk` stream: text deltas → asserts `text_delta` chunks yielded correctly
    * ` [✅]`   Mocks `stream.finalMessage()` returning usage → asserts `usage` chunk yielded with correct `NodeTokenUsage` (`input_tokens` → `prompt_tokens`, `output_tokens` → `completion_tokens`, sum → `total_tokens`)
    * ` [✅]`   Asserts `done` chunk yielded with mapped `finish_reason` for each known `stop_reason` (`end_turn`, `stop_sequence`, `max_tokens`, `tool_use`)
    * ` [✅]`   Asserts `done` chunk yielded with `finish_reason: 'unknown'` when `stop_reason` is absent or unrecognized
    * ` [✅]`   Mocks stream error: asserts throws propagates
    * ` [✅]`   Tests prefix stripping: `apiIdentifier: 'anthropic-claude-3-5-sonnet'` → SDK called with `model: 'claude-3-5-sonnet'`
    * ` [✅]`   Tests `maxTokensForPayload` required: no resolved max_tokens → throws
    * ` [✅]`   Tests message preparation: system prompt extraction, message merging, alternating role enforcement, resource document injection (with validation), current message appending
    * ` [✅]`   Tests `max_tokens` resolution from `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens`

  * ` [✅]`   `construction`
    * ` [✅]`   Factory: `createAnthropicNodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   Stores `modelConfig` and `apiKey` from constructor params

  * ` [✅]`   `anthropic.ts`
    * ` [✅]`   Exports `createAnthropicNodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   `sendMessageStream(request, apiIdentifier)`: ports `_prepareAnthropicRequest` — strips `anthropic-` prefix to get `modelApiName`, extracts system prompt, merges messages, enforces alternating roles, injects resource documents (validates `document_key`/`stage_slug`), resolves max_tokens; throws if no `maxTokensForPayload`
    * ` [✅]`   Calls `client.messages.stream({ model: modelApiName, max_tokens: maxTokensForPayload, messages, system })`
    * ` [✅]`   `for await` yields `text_delta` chunks from `content_block_delta` events
    * ` [✅]`   Post-stream: yields `usage` chunk from `stream.finalMessage()` (`input_tokens` → `prompt_tokens`, `output_tokens` → `completion_tokens`, sum → `total_tokens`)
    * ` [✅]`   Yields `done` chunk with mapped finish_reason (including `'unknown'` default for absent/unrecognized `stop_reason`)
    * ` [✅]`   Throws on stream error

  * ` [✅]`   `anthropic.mock.ts`
    * ` [✅]`   `createMockAnthropicNodeAdapter(overrides?)`: satisfies `AiAdapter`
    * ` [✅]`   Default: `sendMessageStream` yields `{ type: 'text_delta', text: 'mock anthropic response' }`, `{ type: 'usage', tokenUsage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 } }`, `{ type: 'done', finish_reason: 'stop' }`
    * ` [✅]`   Error override supported

  * ` [✅]`   `anthropic.provides.ts`
    * ` [✅]`   Exports: `createAnthropicNodeAdapter`
    * ` [✅]`   Exports Anthropic-specific types: `AnthropicStopReason`, `AnthropicTextDelta`, `AnthropicContentBlockDeltaEvent`, `AnthropicUsage`, `AnthropicFinalMessage`
    * ` [✅]`   Exports Anthropic-specific guards: `isAnthropicStopReason`, `isAnthropicTextDelta`, `isAnthropicContentBlockDeltaEvent`, `isAnthropicUsage`, `isAnthropicFinalMessage`
    * ` [✅]`   Does NOT re-export shared factory types or guards — consumers import those from the factory node directly
    * ` [✅]`   No external access bypasses this file

  * ` [✅]`   `anthropic.integration.test.ts`
    * ` [✅]`   Validates `createAnthropicNodeAdapter({ modelConfig, apiKey })` satisfies `isAiAdapter` at runtime
    * ` [✅]`   Simulates dispatch: `api_identifier: 'anthropic-claude-3-5-sonnet'` → adapter constructed → `sendMessageStream()` called → yields `NodeAdapterStreamChunk` values
    * ` [✅]`   Mocked SDK — no live calls

  * ` [✅]`   `directionality`
    * ` [✅]`   Layer: infra/adapter (Netlify-side Node.js)
    * ` [✅]`   Deps inward: `@anthropic-ai/sdk`, shared interface from OpenAI adapter node
    * ` [✅]`   Provides outward: `createAnthropicNodeAdapter` to `ai-stream` workload
    * ` [✅]`   No cycles

  * ` [✅]`   `requirements`
    * ` [✅]`   `sendMessageStream()` yields correct chunk sequence (`text_delta` → `usage` → `done`) — proven by unit test
    * ` [✅]`   Prefix stripping: `apiIdentifier` → `modelApiName` via `anthropic-` prefix removal — proven by unit test
    * ` [✅]`   `maxTokensForPayload` required: throws if not resolved — proven by unit test
    * ` [✅]`   Message preparation matches Supabase `_prepareAnthropicRequest` behavior — proven by unit test
    * ` [✅]`   Token usage correctly mapped from Anthropic `finalMessage()` — proven by unit test
    * ` [✅]`   Finish_reason correctly mapped from Anthropic `stop_reason` (including `'unknown'` default) — proven by unit test
    * ` [✅]`   `sendMessageStream()` with SDK error throws — proven by unit test
    * ` [✅]`   Satisfies `isAiAdapter` at runtime — proven by integration test
    * ` [✅]`   Passes `runAdapterConformanceTests` — proven by conformance suite (requires `text_delta`, `usage`, and `done` chunks in happy path)
    * ` [✅]`   No Deno APIs present — proven by Node.js TypeScript build

* `[✅]`   `netlify/functions/ai-stream/adapters/google/google-adapter` **[BE] Google Gemini Node.js streaming adapter — port of Supabase `google_adapter.ts` for Netlify Async Workload**

  * ` [✅]`   `objective`
    * ` [✅]`   Port the existing Supabase `google_adapter.ts` (`_prepareGoogleChatAndParts` + `sendMessageStream`) to a Node.js adapter that yields `NodeAdapterStreamChunk` values via `AsyncGenerator`, preserving identical message mapping, resource document injection, token cap resolution, and finish_reason mapping
    * ` [✅]`   Functional goals:
      * Accept `NodeChatApiRequest` and `api_identifier`; prepare the Gemini request identically to the Supabase adapter
      * Yield `text_delta`, `usage`, and `done` chunks matching the Supabase `AdapterStreamChunk` discriminated union
      * Map Google `finishReason` values (`STOP` → `stop`, `MAX_TOKENS` → `length`, `SAFETY`/`RECITATION` → `content_filter`, any other/absent → `unknown`)
    * ` [✅]`   Non-functional constraints:
      * Node.js 18+ only; no Deno APIs
      * No Supabase access; model config and API key injected at construction via `NodeAdapterConstructorParams`
      * No internal soft timeout — handler manages timeout

  * ` [✅]`   `role`
    * ` [✅]`   Role: infra/adapter — wraps `@google/generative-ai` to satisfy `AiAdapter` via `sendMessageStream` AsyncGenerator
    * ` [✅]`   Why appropriate: workload dispatches here for `google-*` identifiers
    * ` [✅]`   Must NOT: interact with Supabase, manage job state, or call back-half

  * ` [✅]`   `module`
    * ` [✅]`   Bounded context: `netlify/functions/ai-stream/adapters` — same adapter layer
    * ` [✅]`   Inside boundary: Gemini request preparation (message mapping, resource doc injection, token cap resolution), stream invocation, chunk yielding, finish_reason mapping
    * ` [✅]`   Outside boundary: job state, DB, HTTP callback, stream assembly (handler's job)

  * ` [✅]`   `deps`
    * ` [✅]`   `@google/generative-ai` npm package — external, provides streaming generative API
    * ` [✅]`   `ai-adapter.interface.ts` — defined in factory node (`getNodeAiAdapter`); imported here, not owned here
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) — imported from factory node, not redefined
    * ` [✅]`   No reverse deps

  * ` [✅]`   `context_slice`
    * ` [✅]`   Constructed with `NodeAdapterConstructorParams`: `{ modelConfig: NodeModelConfig, apiKey: string }`
    * ` [✅]`   `sendMessageStream` receives `NodeChatApiRequest` and `apiIdentifier: string`
    * ` [✅]`   Yields `NodeAdapterStreamChunk` values (`text_delta`, `usage`, `done`)

  * ` [✅]`   `google.interface.test.ts`
    * ` [✅]`   Imports types ONLY from `google.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * ` [✅]`   Construct `GooglePart` literal with `text: 'chunk'` — compiles; assert `typeof literal.text === 'string'`
    * ` [✅]`   Construct `GooglePart` literal with `text` omitted (optional) — compiles
    * ` [✅]`   Construct `GoogleContent` literal with `parts: [{ text: 'x' }]` — compiles; assert `Array.isArray(literal.parts)`
    * ` [✅]`   Construct `GoogleCandidate` literal for each `GoogleFinishReason` member (`STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`) — each compiles; assert `literal.finishReason` equals the tag
    * ` [✅]`   Construct `GoogleCandidate` literal with `content` omitted and `finishReason` omitted — compiles (both optional mid-stream)
    * ` [✅]`   Construct `GoogleUsageMetadata` literal with `promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30` — compiles; assert each field `typeof === 'number'`
    * ` [✅]`   Construct `GoogleStreamChunk` literal with `candidates: [GoogleCandidate]` — compiles
    * ` [✅]`   Construct `GoogleStreamChunk` literal with `candidates` omitted — compiles (optional; adapter tolerates chunks with no candidates via `?.`)
    * ` [✅]`   Construct `GoogleFinalResponse` literal with `candidates` and `usageMetadata` present — compiles
    * ` [✅]`   Construct `GoogleFinalResponse` literal with `usageMetadata: null` — compiles (nullable; adapter throws on null at runtime)
    * ` [✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern, not a test-time one; runtime accept/reject belongs in `google.guard.test.ts`

  * ` [✅]`   `google.interface.ts`
    * ` [✅]`   `GoogleFinishReason`: `'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION'` — exhaustive union of SDK-known values; adapter maps any other/absent to `'unknown'`
    * ` [✅]`   `GooglePart`: `{ text?: string }` — adapter reads `part.text` during stream iteration
    * ` [✅]`   `GoogleContent`: `{ parts: GooglePart[] }` — adapter reads `chunk.candidates[0].content.parts`
    * ` [✅]`   `GoogleCandidate`: `{ content?: GoogleContent; finishReason?: GoogleFinishReason }` — adapter reads `candidate.content.parts[].text` during stream and `candidate.finishReason` post-stream
    * ` [✅]`   `GoogleUsageMetadata`: `{ promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }` — non-negative integers required at runtime
    * ` [✅]`   `GoogleStreamChunk`: `{ candidates?: GoogleCandidate[] }` — iterated via `for await (const chunk of streamResult.stream)`; adapter does NOT call `chunk.text()`
    * ` [✅]`   `GoogleFinalResponse`: `{ candidates?: GoogleCandidate[]; usageMetadata?: GoogleUsageMetadata | null }` — `await streamResult.response`; sole source of `usage` chunk and `done.finish_reason`
    * ` [✅]`   No `any`, no casts

  * ` [✅]`   `google.interaction.spec`
    * ` [✅]`   Called by `ai-stream` handler when `api_identifier` prefix matches `google-`
    * ` [✅]`   `sendMessageStream` ports `_prepareGoogleChatAndParts` from Supabase `google_adapter.ts`:
      * Strips `google-` prefix from `apiIdentifier` to derive `modelApiName` (e.g. `google-gemini-2-5-pro` → `gemini-2-5-pro`)
      * Maps `request.messages` to Google Content format (`assistant` → `model` role); skips `system` role messages (not currently used by Supabase adapter)
      * Pushes `request.message` as final user message, then pops last message as `lastMessage`; validates `lastMessage` is user role
      * Injects `request.resourceDocuments` as text parts prepended to `lastMessage` parts
      * Resolves `maxOutputTokens`: `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens` (single fallback, not `Math.min`)
    * ` [✅]`   Initializes `GoogleGenerativeAI({ apiKey })`, gets model via `getGenerativeModel({ model: modelApiName })`; starts chat with `{ history, generationConfig: { maxOutputTokens } }`
    * ` [✅]`   Calls `chat.sendMessageStream(finalParts)` — iterates `streamResult.stream`
    * ` [✅]`   Yields `{ type: 'text_delta', text }` from `candidates[0].content.parts` text (skips empty text, skips chunks with no parts)
    * ` [✅]`   Post-stream: awaits `streamResult.response`; if assembled content is empty, throws (Supabase: `'Google Gemini stream completed with no assistant text.'`)
    * ` [✅]`   Post-stream: if `response.usageMetadata` is missing or token counts are not numbers, throws (Supabase: `'Google Gemini response did not include usageMetadata.'` / `'...usageMetadata is incomplete.'`)
    * ` [✅]`   Yields `{ type: 'usage', tokenUsage }` from `response.usageMetadata` (`promptTokenCount` → `prompt_tokens`, `candidatesTokenCount` → `completion_tokens`, `totalTokenCount` → `total_tokens`)
    * ` [✅]`   Yields `{ type: 'done', finish_reason }` with mapped finish_reason from `candidate.finishReason`: `STOP` → `stop`, `MAX_TOKENS` → `length`, `SAFETY`/`RECITATION` → `content_filter`, any other value or absent → `unknown`
    * ` [✅]`   On stream error: throws

  * ` [✅]`   `google.guard.test.ts`
    * ` [✅]`   `isGoogleFinishReason`: accepts each union member (`STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`); rejects unrecognized strings, `null`, `undefined`, non-strings
    * ` [✅]`   `isGooglePart`: accepts `{ text: 'x' }` and `{}`; rejects non-string `text`, non-object
    * ` [✅]`   `isGoogleContent`: accepts `{ parts: [] }` and `{ parts: [GooglePart] }`; rejects missing `parts`, non-array `parts`, `parts` containing non-`GooglePart` elements
    * ` [✅]`   `isGoogleCandidate`: accepts candidate with each `GoogleFinishReason` value, with `finishReason` omitted, with `content` omitted; rejects invalid `content`, invalid `finishReason` string
    * ` [✅]`   `isGoogleUsageMetadata`: accepts valid metadata; rejects negative counts, missing fields, non-integers
    * ` [✅]`   `isGoogleStreamChunk`: accepts chunk with `candidates` array of `GoogleCandidate` and with `candidates` omitted; rejects non-array `candidates`, `candidates` containing non-`GoogleCandidate` elements
    * ` [✅]`   `isGoogleFinalResponse`: accepts response with and without `candidates`, with `usageMetadata`, with `usageMetadata: null`, with `usageMetadata` omitted; rejects invalid `usageMetadata` shape
    * ` [✅]`   No false positives or negatives against the interface test cases

  * ` [✅]`   `google.guard.ts`
    * ` [✅]`   `isGoogleFinishReason(v: unknown): v is GoogleFinishReason`
    * ` [✅]`   `isGooglePart(v: unknown): v is GooglePart`
    * ` [✅]`   `isGoogleContent(v: unknown): v is GoogleContent`
    * ` [✅]`   `isGoogleCandidate(v: unknown): v is GoogleCandidate`
    * ` [✅]`   `isGoogleUsageMetadata(v: unknown): v is GoogleUsageMetadata`
    * ` [✅]`   `isGoogleStreamChunk(v: unknown): v is GoogleStreamChunk`
    * ` [✅]`   `isGoogleFinalResponse(v: unknown): v is GoogleFinalResponse`
    * ` [✅]`   Shared guards (`isAiAdapter`, `isNodeAdapterStreamChunk`) imported from factory node — not redefined here

  * ` [✅]`   `google.test.ts`
    * ` [✅]`   Mocks `@google/generative-ai` stream: chunks with text content — asserts `text_delta` chunks yielded correctly
    * ` [✅]`   Mocks `streamResult.response.usageMetadata` — asserts `usage` chunk yielded with correct `NodeTokenUsage` mapping (`promptTokenCount` → `prompt_tokens`, etc.)
    * ` [✅]`   Missing `usageMetadata` on response: asserts adapter **throws** (Supabase: `'Google Gemini response did not include usageMetadata.'`)
    * ` [✅]`   Incomplete `usageMetadata` (non-number token counts): asserts adapter **throws** (Supabase: `'...usageMetadata is incomplete.'`)
    * ` [✅]`   Empty assembled content (no text parts yielded): asserts adapter **throws** (Supabase: `'Google Gemini stream completed with no assistant text.'`)
    * ` [✅]`   Asserts `done` chunk yielded with mapped `finish_reason` for each known case (`STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`)
    * ` [✅]`   Asserts `done` chunk yielded with `finish_reason: 'unknown'` when `finishReason` is absent or unrecognized
    * ` [✅]`   Stream error: asserts throws propagates
    * ` [✅]`   Tests prefix stripping: `apiIdentifier: 'google-gemini-2-5-pro'` → `getGenerativeModel` called with `model: 'gemini-2-5-pro'`
    * ` [✅]`   Tests message preparation: role mapping (`assistant` → `model`), system messages skipped, resource document injection as text parts, current message as final user parts, validates last message is user role
    * ` [✅]`   Tests `maxOutputTokens` resolution from `request.max_tokens_to_generate` → `modelConfig.hard_cap_output_tokens`

  * ` [✅]`   `construction`
    * ` [✅]`   Factory: `createGoogleNodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   Stores `modelConfig` and `apiKey` from constructor params

  * ` [✅]`   `google.ts`
    * ` [✅]`   Exports `createGoogleNodeAdapter(params: NodeAdapterConstructorParams): AiAdapter`
    * ` [✅]`   `sendMessageStream(request, apiIdentifier)`: ports `_prepareGoogleChatAndParts` — strips `google-` prefix to get `modelApiName`, maps messages (`assistant` → `model`), skips `system`, pops last user message, injects resource documents as text parts, resolves `maxOutputTokens`
    * ` [✅]`   Initializes `GoogleGenerativeAI` with `params.apiKey`; `getGenerativeModel({ model: modelApiName })`; `startChat({ history, generationConfig: { maxOutputTokens } })`
    * ` [✅]`   `chat.sendMessageStream(finalParts)` — `for await` yields `text_delta` chunks from candidate parts
    * ` [✅]`   Post-stream: throws if assembled content is empty
    * ` [✅]`   Post-stream: throws if `response.usageMetadata` is missing or token counts are not numbers
    * ` [✅]`   Yields `usage` chunk from validated `usageMetadata`, then yields `done` chunk with mapped finish_reason (including `'unknown'` default)
    * ` [✅]`   Throws on stream error

  * ` [✅]`   `google.mock.ts`
    * ` [✅]`   `createMockGoogleNodeAdapter(overrides?)`: satisfies `AiAdapter`
    * ` [✅]`   Default: `sendMessageStream` yields `{ type: 'text_delta', text: 'mock google response' }`, `{ type: 'usage', tokenUsage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 } }`, `{ type: 'done', finish_reason: 'stop' }`

  * ` [✅]`   `google.provides.ts`
    * ` [✅]`   Exports: `createGoogleNodeAdapter`
    * ` [✅]`   Exports Google-specific types: `GoogleFinishReason`, `GooglePart`, `GoogleContent`, `GoogleCandidate`, `GoogleUsageMetadata`, `GoogleStreamChunk`, `GoogleFinalResponse`
    * ` [✅]`   Exports Google-specific guards: `isGoogleFinishReason`, `isGooglePart`, `isGoogleContent`, `isGoogleCandidate`, `isGoogleUsageMetadata`, `isGoogleStreamChunk`, `isGoogleFinalResponse`
    * ` [✅]`   Does NOT re-export shared factory types or guards — consumers import those from the factory node directly
    * ` [✅]`   No external access bypasses this file

  * ` [✅]`   `google.integration.test.ts`
    * ` [✅]`   Validates `createGoogleNodeAdapter({ modelConfig, apiKey })` satisfies `isAiAdapter` at runtime
    * ` [✅]`   Simulates dispatch: `api_identifier: 'google-gemini-2-5-pro'` → adapter constructed → `sendMessageStream()` called → yields `NodeAdapterStreamChunk` values

  * ` [✅]`   `directionality`
    * ` [✅]`   Layer: infra/adapter (Netlify-side Node.js)
    * ` [✅]`   Deps inward: `@google/generative-ai`, shared interface from OpenAI node
    * ` [✅]`   Provides outward: `createGoogleNodeAdapter` to `ai-stream` workload
    * ` [✅]`   No cycles

  * ` [✅]`   `requirements`
    * ` [✅]`   `sendMessageStream()` yields correct chunk sequence (`text_delta` → `usage` → `done`) — proven by unit test
    * ` [✅]`   Prefix stripping: `apiIdentifier` → `modelApiName` via `google-` prefix removal — proven by unit test
    * ` [✅]`   `sendMessageStream()` throws on empty assembled content — proven by unit test
    * ` [✅]`   `sendMessageStream()` throws on missing/incomplete `usageMetadata` — proven by unit test
    * ` [✅]`   Message preparation matches Supabase `_prepareGoogleChatAndParts` behavior — proven by unit test
    * ` [✅]`   Token usage correctly mapped from `usageMetadata` — proven by unit test
    * ` [✅]`   Finish_reason correctly mapped from Google finish reason (including `'unknown'` default) — proven by unit test
    * ` [✅]`   `sendMessageStream()` with SDK error throws — proven by unit test
    * ` [✅]`   Satisfies `isAiAdapter` at runtime — proven by integration test
    * ` [✅]`   Passes `runAdapterConformanceTests` — proven by conformance suite (requires `text_delta`, `usage`, and `done` chunks in happy path)
    * ` [✅]`   No Deno APIs present — proven by Node.js TypeScript build

* `[✅]`   `netlify/functions/ai-stream/ai-stream` **[BE] Netlify Async Workload — AI streaming orchestrator with finish_reason relay and soft timeout**

  * `[✅]`   `objective`
    * `[✅]`   Receive a dialectic stream event from the queue, dispatch to the correct provider adapter via `sendMessageStream`, iterate the async generator to collect `assembled_content`, `token_usage`, and `finish_reason`, and POST the result to the EMCAS back-half Edge Function — with sub-15-minute soft timeout and full Netlify retry semantics
    * `[✅]`   Functional goals:
      * Validate the incoming `AiStreamEvent` payload (corrected wire types)
      * Select the correct `AiAdapter` by `api_identifier` prefix
      * Read provider API key from Netlify env vars
      * Construct adapter with `{ modelConfig: event.model_config, apiKey }`
      * Call `adapter.sendMessageStream(event.chat_api_request, event.api_identifier)`
      * Iterate async generator, collecting `assembled_content` (from `text_delta`), `token_usage` (from `usage`), `finish_reason` (from `done`)
      * Enforce sub-15-minute soft timeout (14 min); on timeout set `finish_reason = 'length'` and break
      * POST `{ job_id, assembled_content, token_usage, finish_reason }` to the back-half URL with `Authorization: Bearer <user_jwt>`
      * Return success; on POST failure let Netlify retry the transmission
    * `[✅]`   Non-functional constraints:
      * Event payload ≤ 500 KB (Netlify limit) — enforced by front-half at enqueue time
      * No Supabase access — workload does not read or write DB
      * Soft timeout at 14 minutes protects against Netlify 15-minute hard ceiling

  * `[✅]`   `role`
    * `[✅]`   Role: app/orchestrator (Netlify Async Workload handler)
    * `[✅]`   Why appropriate: only this layer has the Netlify runtime context (`AsyncWorkloadEvent`) and bridges the AI provider adapters to the Supabase back-half
    * `[✅]`   Must NOT: access Supabase, modify job state, send notifications, or implement streaming logic directly (adapters own streaming; handler only iterates chunks)

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `netlify/functions/ai-stream` — Netlify-side async workload
    * `[✅]`   Inside boundary: event validation, adapter dispatch, back-half HTTP POST
    * `[✅]`   Outside boundary: AI streaming internals (in adapters), job state (in Supabase), post-processing (in EMCAS back-half)

  * `[✅]`   `deps`
    * `[✅]`   `createOpenAINodeAdapter` — from OpenAI adapter node; dispatched for `openai-*`
    * `[✅]`   `createAnthropicNodeAdapter` — from Anthropic adapter node; dispatched for `anthropic-*`
    * `[✅]`   `createGoogleNodeAdapter` — from Google adapter node; dispatched for `google-*`
    * `[✅]`   `@netlify/async-workloads` npm package — provides `asyncWorkloadFn`, `AsyncWorkloadEvent`
    * `[✅]`   `node:https` / `fetch` — for HTTP POST to back-half
    * `[✅]`   Env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DIALECTIC_SAVERESPONSE_URL`
    * `[✅]`   No reverse deps; no Supabase client

  * `[✅]`   `context_slice`
    * `[✅]`   From event: `AiStreamEvent` — `{ job_id, api_identifier, model_config: NodeModelConfig, chat_api_request: NodeChatApiRequest, user_jwt }`
    * `[✅]`   To adapters: constructs adapter with `{ modelConfig: event.model_config, apiKey }`, calls `sendMessageStream(event.chat_api_request, event.api_identifier)`
    * `[✅]`   To back-half: `AiStreamPayload` — `{ job_id, assembled_content, token_usage, finish_reason }` with `Authorization: Bearer <user_jwt>` header
    * `[✅]`   No over-fetching

  * `[✅]`   `ai-stream.interface.test.ts`
    * `[✅]`   Imports types ONLY from `ai-stream.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * `[✅]`   Construct `AiStreamEvent` literal with all required fields (`job_id`, `api_identifier`, `model_config: NodeModelConfig`, `chat_api_request: NodeChatApiRequest`, `user_jwt`) — compiles; assert field types
    * `[✅]`   Construct `AiStreamPayload` literal with `assembled_content: string`, `token_usage: NodeTokenUsage | null`, `finish_reason: string | null` — compiles; assert field types
    * `[✅]`   Construct `AiStreamPayload` literal with `token_usage: null` and `finish_reason: null` — compiles (both are nullable)
    * `[✅]`   Construct `AiStreamDeps` literal with `providerMap`, `saveResponseUrl`, `getApiKey` — compiles; assert shape
    * `[✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern; runtime accept/reject and `api_identifier` dispatch behavior belong in `ai-stream.guard.test.ts` / `ai-stream.test.ts`

  * `[✅]`   `ai-stream.interface.ts`
    * `[✅]`   `AiStreamEvent`: `{ job_id: string; api_identifier: string; model_config: NodeModelConfig; chat_api_request: NodeChatApiRequest; user_jwt: string }` — corrected field name and types mirroring Supabase originals
    * `[✅]`   `AiStreamPayload`: `{ job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null }` — `finish_reason` relayed from adapter `done` chunk; `null` if stream interrupted (no `done` received)
    * `[✅]`   `AiStreamDeps`: `{ providerMap: NodeProviderMap; saveResponseUrl: string; getApiKey(apiIdentifier: string): string }`

  * `[✅]`   `ai-stream.interaction.spec`
    * `[✅]`   Netlify queue delivers event; workload receives it via `asyncWorkloadFn` handler
    * `[✅]`   Workload validates event shape via `isAiStreamEvent` guard; invalid event → `ErrorDoNotRetry` thrown
    * `[✅]`   Resolves API key from env by `api_identifier` prefix; missing key → `ErrorDoNotRetry`
    * `[✅]`   Constructs adapter via `getNodeAiAdapter({ providerMap }, { apiIdentifier, apiKey, modelConfig: event.model_config })`; unknown prefix → `ErrorDoNotRetry`
    * `[✅]`   Records `startTime = Date.now()`
    * `[✅]`   Calls `adapter.sendMessageStream(event.chat_api_request, event.api_identifier)` — iterates async generator
    * `[✅]`   Collects: `assembledContent` from `text_delta`, `tokenUsage` from `usage`, `finishReason` from `done`
    * `[✅]`   **Soft timeout**: on each `text_delta` chunk, if `Date.now() - startTime > SOFT_TIMEOUT_MS` (14 min), sets `finishReason = 'length'` and breaks
    * `[✅]`   On stream error: throws (Netlify retries the model call)
    * `[✅]`   On stream success: POSTs `AiStreamPayload` (`{ job_id, assembled_content, token_usage, finish_reason }`) to `DIALECTIC_SAVERESPONSE_URL` with `Authorization: Bearer <user_jwt>` header
    * `[✅]`   POST success (2xx): workload completes successfully
    * `[✅]`   POST failure (non-2xx or network error): throws (Netlify retries the POST, not the model call — step boundary)
    * `[✅]`   Two distinct retry points via `event.step.run`: step-1 wraps adapter call + stream iteration; step-2 wraps back-half POST

  * `[✅]`   `ai-stream.guard.test.ts`
    * `[✅]`   `isAiStreamEvent`: valid (with `model_config` and `chat_api_request` in corrected shapes); rejects missing fields; rejects invalid `model_config`; rejects invalid `chat_api_request`
    * `[✅]`   `isAiStreamPayload`: valid; rejects missing `job_id`; accepts null `token_usage`; accepts null `finish_reason`; rejects missing `finish_reason` field entirely
    * `[✅]`   `isAiStreamDeps`: valid; rejects missing `providerMap` or missing `saveResponseUrl`

  * `[✅]`   `ai-stream.guard.ts`
    * `[✅]`   `isAiStreamEvent(v: unknown): v is AiStreamEvent`
    * `[✅]`   `isAiStreamPayload(v: unknown): v is AiStreamPayload`
    * `[✅]`   `isAiStreamDeps(v: unknown): v is AiStreamDeps`

  * `[✅]`   `ai-stream.test.ts`
    * `[✅]`   Invalid event → `ErrorDoNotRetry` thrown, no adapter called
    * `[✅]`   Unknown `api_identifier` prefix → `ErrorDoNotRetry` thrown
    * `[✅]`   Valid event, `openai-*` → OpenAI mock adapter's `sendMessageStream` iterated; result POSTed to back-half with `finish_reason` from `done` chunk
    * `[✅]`   Valid event, `anthropic-*` → Anthropic mock adapter called
    * `[✅]`   Valid event, `google-*` → Google mock adapter called
    * `[✅]`   Adapter stream error → throws (Netlify retries step-1)
    * `[✅]`   Adapter success, back-half POST returns 4xx → throws (Netlify retries step-2)
    * `[✅]`   Full happy path: adapter yields chunks → POST body matches `AiStreamPayload` including `finish_reason` → JWT header present
    * `[✅]`   Soft timeout: mock adapter yields `text_delta` chunks with simulated delay > 14 min → `finish_reason` set to `'length'`, partial `assembled_content` POSTed
    * `[✅]`   Stream interruption (no `done` chunk): `finish_reason` is `null` in POST body

  * `[✅]`   `construction`
    * `[✅]`   `createAiStreamDeps(): AiStreamDeps` — reads env vars, instantiates adapters
    * `[✅]`   Wired at module load; `asyncWorkloadFn` receives `event: AsyncWorkloadEvent<AiStreamEvent>`
    * `[✅]`   `asyncWorkloadConfig` exports event name `'ai-stream'`, `maxRetries: 4`

  * `[✅]`   `ai-stream.ts`
    * `[✅]`   Exports default `asyncWorkloadFn` handler and `asyncWorkloadConfig`
    * `[✅]`   Validates event data via `isAiStreamEvent` — `ErrorDoNotRetry` on failure
    * `[✅]`   Resolves API key from env; constructs adapter via `getNodeAiAdapter`
    * `[✅]`   `step.run('stream-ai', ...)` wraps: records `startTime`, calls `adapter.sendMessageStream`, iterates async generator collecting `assembledContent`/`tokenUsage`/`finishReason`, checks soft timeout on each `text_delta` (14 min → set `finishReason = 'length'`, break)
    * `[✅]`   `step.run('post-result', ...)` wraps: HTTP POST of `AiStreamPayload` (`{ job_id, assembled_content, token_usage, finish_reason }`) with `Authorization: Bearer <user_jwt>` header
    * `[✅]`   Throws on POST non-2xx

  * `[✅]`   `ai-stream.mock.ts`
    * `[✅]`   `createMockAiStreamDeps(overrides?)`: returns controllable `AiStreamDeps`
    * `[✅]`   Default: `providerMap` with mock adapters for all three providers; `saveResponseUrl` is `'http://localhost/mock-saveResponse'`; `getApiKey` returns `'mock-key'`

  * `[✅]`   `ai-stream.provides.ts`
    * `[✅]`   Exports: workload handler (default), `asyncWorkloadConfig`, `createAiStreamDeps`

  * `[✅]`   `ai-stream.integration.test.ts`
    * `[✅]`   External boundary mocks (all via `vi.mock` / `vi.hoisted` / `vi.stubGlobal`):
      * `[✅]`   `@netlify/async-workloads` — `asyncWorkloadFn` passes handler through as callable; `event.step.run` executes callback and tracks step names; `ErrorDoNotRetry` re-exported as real class; `AsyncWorkloadEvent` constructed via cast (external Netlify type)
      * `[✅]`   `openai` — mock `OpenAI` class with controllable `chat.completions.create` returning async iterable of SDK-shaped chunks (pattern from `openai.integration.test.ts`)
      * `[✅]`   `@anthropic-ai/sdk` — mock `Anthropic` class with controllable `messages.stream` returning async iterable + `finalMessage()` (pattern from `anthropic.integration.test.ts`)
      * `[✅]`   `@google/generative-ai` — mock `GoogleGenerativeAI` with controllable `getGenerativeModel` → `startChat` → `sendMessageStream` chain (pattern from `google.integration.test.ts`)
      * `[✅]`   `fetch` — stubbed global returning configurable `Response`
      * `[✅]`   `process.env` — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DIALECTIC_SAVERESPONSE_URL` set before each test
    * `[✅]`   Full chain — OpenAI: valid `AiStreamEvent` with `openai-gpt-4o` prefix → default export handler → real `createAiStreamDeps` → real `getNodeAiAdapter` → real `createOpenAINodeAdapter` → mocked OpenAI SDK stream → real chunk assembly → POST to mocked fetch → assert `AiStreamPayload` body (`assembled_content`, `token_usage`, `finish_reason`) and `Authorization: Bearer <user_jwt>` header
    * `[✅]`   Full chain — Anthropic: valid event with `anthropic-claude-3-5-sonnet` prefix → same real application path → real `createAnthropicNodeAdapter` → mocked Anthropic SDK stream + `finalMessage()` → assert POST body and headers
    * `[✅]`   Full chain — Google: valid event with `google-gemini-2-5-pro` prefix → same real application path → real `createGoogleNodeAdapter` → mocked Google SDK stream + response → assert POST body and headers
    * `[✅]`   Step isolation — adapter error: SDK mock throws during stream → `step.run('stream-ai')` propagates error → `step.run('post-result')` never called (tracked by step mock)
    * `[✅]`   Step isolation — POST failure: fetch returns 400 after successful stream → `step.run('post-result')` throws → adapter factory and `sendMessageStream` were each called exactly once (no re-entry into step-1)
    * `[✅]`   No live calls — all external SDK clients and fetch are mocked; no network traffic

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/orchestrator (Netlify runtime)
    * `[✅]`   Deps inward: three adapter nodes, `@netlify/async-workloads`, env vars
    * `[✅]`   Provides outward: `ai-stream` event handler consumed by Netlify queue
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   Invalid event never retried — `ErrorDoNotRetry` — proven by unit test
    * `[✅]`   Adapter stream error causes Netlify step-1 retry — proven by unit test
    * `[✅]`   Back-half POST failure causes Netlify step-2 retry without re-calling adapter — proven by integration test
    * `[✅]`   JWT forwarded correctly in Authorization header — proven by unit test
    * `[✅]`   No Supabase access in workload — provable by static analysis (no `@supabase/supabase-js` import in this file)

* `[✅]`   `_shared/utils/jsonSanitizer/jsonSanitizer` **[BE] Define `SanitizeJsonContentFn` named injectable type and add `isJsonSanitizationResult` guard**

  * `[✅]`   `objective`
    * `[✅]`   Define `SanitizeJsonContentFn` as a named, exported function type in `jsonSanitizer.interface.ts` so that all consumers (`assembleChunks`, `saveResponse`) replace inline ad-hoc type declarations with the canonical named type
    * `[✅]`   Functional goals:
      * `SanitizeJsonContentFn` added to `jsonSanitizer.interface.ts`
      * `sanitizeJsonContent` in `jsonSanitizer.ts` explicitly typed as `SanitizeJsonContentFn`
      * `isJsonSanitizationResult` guard added to enable runtime narrowing
    * `[✅]`   Non-functional constraints:
      * No change to sanitization logic — typing and export surface only
      * All existing callers continue to compile without modification to their import site

  * `[✅]`   `role`
    * `[✅]`   Role: infra/utility — pure, stateless string transformation
    * `[✅]`   Why appropriate: no external deps; pure input → output; injectable for testability across all consumers
    * `[✅]`   Must NOT: perform I/O, mutate state, or throw

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `_shared/utils/jsonSanitizer`
    * `[✅]`   Inside boundary: JSON sanitization logic, result type, injectable function type, type guard
    * `[✅]`   Outside boundary: all consumers — they reference `SanitizeJsonContentFn`, they do not inline the signature

  * `[✅]`   `deps`
    * `[✅]`   None — pure function, no injected deps

  * `[✅]`   `context_slice`
    * `[✅]`   Input: `content: string`
    * `[✅]`   Output: `JsonSanitizationResult`

  * `[✅]`   `jsonSanitizer.interface.test.ts`
    * `[✅]`   Valid `JsonSanitizationResult`: all six fields present and correctly typed — guard accepts
    * `[✅]`   Invalid: missing `sanitized` → guard rejects; missing `wasSanitized` → guard rejects; missing `duplicateKeysResolved` array → guard rejects; wrong type on any boolean field → guard rejects; `originalLength` not a number → guard rejects
    * `[✅]`   `SanitizeJsonContentFn` type shape: a variable typed as `SanitizeJsonContentFn` is assignable from `(content: string) => JsonSanitizationResult` — compiler proof via typed assignment

  * `[✅]`   `jsonSanitizer.interface.ts` *(update existing)*
    * `[✅]`   Add `export type SanitizeJsonContentFn = (content: string) => JsonSanitizationResult`
    * `[✅]`   `JsonSanitizationResult` unchanged

  * `[✅]`   `jsonSanitizer.interaction.spec`
    * `[✅]`   Pure synchronous function — no side effects, no async, no external calls
    * `[✅]`   Given any string input, returns `JsonSanitizationResult` with all six fields populated
    * `[✅]`   Never throws — all failure modes expressed via result fields

  * `[✅]`   `jsonSanitizer.guard.test.ts`
    * `[✅]`   `isJsonSanitizationResult`: accepts fully valid object; rejects missing `sanitized`; rejects missing `wasSanitized`; rejects missing `wasStructurallyFixed`; rejects missing `hasDuplicateKeys`; rejects `duplicateKeysResolved` that is not an array; rejects missing `originalLength`; rejects `originalLength` that is not a number

  * `[✅]`   `jsonSanitizer.guard.ts`
    * `[✅]`   `isJsonSanitizationResult(v: unknown): v is JsonSanitizationResult`
    * `[✅]`   Checks: `typeof v.sanitized === 'string'`, `typeof v.wasSanitized === 'boolean'`, `typeof v.wasStructurallyFixed === 'boolean'`, `typeof v.hasDuplicateKeys === 'boolean'`, `Array.isArray(v.duplicateKeysResolved)`, `typeof v.originalLength === 'number'`

  * `[✅]`   `jsonSanitizer.test.ts` *(update existing — add new tests at end)*
    * `[✅]`   Existing tests unchanged and GREEN
    * `[✅]`   New: `sanitizeJsonContent` assigned to a `SanitizeJsonContentFn`-typed variable compiles without error — compiler proof of type conformance

  * `[✅]`   `construction`
    * `[✅]`   No construction required — pure exported function

  * `[✅]`   `jsonSanitizer.ts` *(update existing)*
    * `[✅]`   Add explicit type annotation: `export const sanitizeJsonContent: SanitizeJsonContentFn = ...`
    * `[✅]`   No logic changes

  * `[✅]`   `jsonSanitizer.mock.ts`
    * `[✅]`   `createMockSanitizeJsonContent(overrides?: Partial<JsonSanitizationResult>): SanitizeJsonContentFn`
    * `[✅]`   Default: returns `{ sanitized: input, wasSanitized: false, wasStructurallyFixed: false, hasDuplicateKeys: false, duplicateKeysResolved: [], originalLength: input.length }`

  * `[✅]`   `jsonSanitizer.provides.ts`
    * `[✅]`   Exports: `sanitizeJsonContent`, `SanitizeJsonContentFn`, `JsonSanitizationResult`, `isJsonSanitizationResult`, `createMockSanitizeJsonContent`

  * `[✅]`   `jsonSanitizer.integration.test.ts`
    * `[✅]`   Inject `sanitizeJsonContent` as `SanitizeJsonContentFn` into a stub consumer dep struct; assert stub invokes it with a string and receives a valid `JsonSanitizationResult` confirmed by `isJsonSanitizationResult`
    * `[✅]`   Prerequisite: this node must be complete before `assembleChunks` and `saveResponse` nodes

  * `[✅]`   `directionality`
    * `[✅]`   Layer: infra/utility
    * `[✅]`   Deps inward: none
    * `[✅]`   Provides outward: `SanitizeJsonContentFn` consumed by `assembleChunks` and `saveResponse`
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   `SanitizeJsonContentFn` exported and callable — proven by compiler
    * `[✅]`   `sanitizeJsonContent` explicitly typed as `SanitizeJsonContentFn` — proven by compiler
    * `[✅]`   `isJsonSanitizationResult` correct — proven by guard tests
    * `[✅]`   No regression to existing sanitization logic — proven by existing tests GREEN

* `[✅]`   `_shared/utils/assembleChunks/assembleChunks` **[BE] Replace inline ad-hoc `sanitizeJsonContent` type in `AssembleChunksDeps` with named `SanitizeJsonContentFn`**

  * `[✅]`   `objective`
    * `[✅]`   Replace the inline ad-hoc function type `(rawContent: string) => JsonSanitizationResult` in `AssembleChunksDeps.sanitizeJsonContent` with the named `SanitizeJsonContentFn` type from `jsonSanitizer.interface.ts`, eliminating the §5 violation
    * `[✅]`   Functional goals:
      * `AssembleChunksDeps.sanitizeJsonContent` type changes from inline to `SanitizeJsonContentFn`
      * All test mocks and guards updated to reference the named type
    * `[✅]`   Non-functional constraints:
      * No change to `assembleChunks` logic — type reference change only
      * All existing tests remain GREEN

  * `[✅]`   `role`
    * `[✅]`   Role: infra/utility — chunk assembly pipeline, injected deps
    * `[✅]`   Why appropriate: `assembleChunks` is a pure pipeline; `sanitizeJsonContent` is an injected transformation step
    * `[✅]`   Must NOT: import `sanitizeJsonContent` directly — injection only

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `_shared/utils/assembleChunks`
    * `[✅]`   Inside boundary: chunk classification, sanitization, parse, merge
    * `[✅]`   Outside boundary: `sanitizeJsonContent` implementation — injected from `jsonSanitizer`

  * `[✅]`   `deps`
    * `[✅]`   `sanitizeJsonContent: SanitizeJsonContentFn` — from `jsonSanitizer.provides.ts`; previously inline-typed, now named
    * `[✅]`   `isRecord: (item: unknown) => item is Record<PropertyKey, unknown>` — unchanged

  * `[✅]`   `context_slice`
    * `[✅]`   `AssembleChunksDeps.sanitizeJsonContent`: type reference changes from `(rawContent: string) => JsonSanitizationResult` to `SanitizeJsonContentFn`
    * `[✅]`   All other context unchanged

  * `[✅]`   `assembleChunks.interface.test.ts` *(update existing)*
    * `[✅]`   Updated: valid `AssembleChunksDeps` test uses a value typed as `SanitizeJsonContentFn` (not inline) — guard accepts
    * `[✅]`   Invalid: `sanitizeJsonContent` field absent → guard rejects; wrong shape → guard rejects
    * `[✅]`   All other interface tests unchanged and GREEN

  * `[✅]`   `assembleChunks.interface.ts` *(update existing)*
    * `[✅]`   Import `SanitizeJsonContentFn` from `jsonSanitizer.interface.ts`
    * `[✅]`   `AssembleChunksDeps.sanitizeJsonContent`: change from `(rawContent: string) => JsonSanitizationResult` to `SanitizeJsonContentFn`
    * `[✅]`   Remove import of `JsonSanitizationResult` if no longer directly referenced
    * `[✅]`   All other types unchanged

  * `[✅]`   `assembleChunks.interaction.spec` *(update)*
    * `[✅]`   `deps.sanitizeJsonContent` is typed as `SanitizeJsonContentFn`; all call sites unchanged
    * `[✅]`   No behavioral change

  * `[✅]`   `assembleChunks.guard.test.ts` *(update existing)*
    * `[✅]`   `isAssembleChunksDeps`: guard test mock value uses `SanitizeJsonContentFn`-typed function reference instead of inline type
    * `[✅]`   All other guard tests unchanged

  * `[✅]`   `assembleChunks.guard.ts` *(update existing)*
    * `[✅]`   Guard check for `sanitizeJsonContent` field: `typeof deps.sanitizeJsonContent === 'function'` — unchanged behavior; no type import required in guard

  * `[✅]`   `assembleChunks.test.ts` *(update existing)*
    * `[✅]`   All mock dep objects: `sanitizeJsonContent` typed as `SanitizeJsonContentFn` (import named type, replace inline)
    * `[✅]`   All existing tests unchanged and GREEN

  * `[✅]`   `construction`
    * `[✅]`   No construction change — caller wires `sanitizeJsonContent` from `jsonSanitizer.provides.ts`

  * `[✅]`   `assembleChunks.ts` *(update existing)*
    * `[✅]`   No logic changes — only type reference in `AssembleChunksDeps` changes upstream; implementation unchanged

  * `[✅]`   `assembleChunks.mock.ts` *(update existing)*
    * `[✅]`   Mock `sanitizeJsonContent` field: typed as `SanitizeJsonContentFn`; use `createMockSanitizeJsonContent()` from `jsonSanitizer.provides.ts`

  * `[✅]`   `assembleChunks.provides.ts` *(update if exists)*
    * `[✅]`   Re-export `AssembleChunksDeps` reflecting updated type

  * `[✅]`   `assembleChunks.integration.test.ts` *(update existing)*
    * `[✅]`   Integration fixture: inject `createMockSanitizeJsonContent()` as `SanitizeJsonContentFn` — assert `assembleChunks` calls it correctly and returns valid `AssembleChunksSuccess` or `AssembleChunksError`
    * `[✅]`   Prerequisite for `saveResponse` node

  * `[✅]`   `directionality`
    * `[✅]`   Layer: infra/utility
    * `[✅]`   Deps inward: `jsonSanitizer` (via `SanitizeJsonContentFn`)
    * `[✅]`   Provides outward: `AssembleChunksSignature` consumed by `IFileManager` → `saveResponse`
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   `AssembleChunksDeps.sanitizeJsonContent` uses named `SanitizeJsonContentFn` — proven by compiler
    * `[✅]`   No inline ad-hoc types in `assembleChunks.interface.ts` — proven by §5 lint
    * `[✅]`   All existing tests GREEN — no behavioral regression

* `[✅]`   `dialectic-worker/saveResponse/saveResponse` **[BE] EMCAS back-half — post-stream processing, contribution save, token debit, and job completion**

  * `[✅]`   `objective`
    * `[✅]`   Receive the assembled AI response blob from the Netlify workload via HTTP POST, fetch the corresponding job from DB by `job_id`, execute all post-stream processing (finish_reason detection, JSON sanitization, storage upload, contribution save, token debit, continuation dispatch), and update job status from `queued` to the correct terminal or continuation state
    * `[✅]`   Functional goals:
      * Accept and validate `{ job_id, assembled_content, token_usage, finish_reason }` from Netlify with valid user JWT
      * Fetch full job row and derived context from Supabase
      * Execute all logic currently in EMCAS after the `for await` stream loop
      * Update job status to `completed`, `needs_continuation`, `continuation_limit_reached`, or `failed`
    * `[✅]`   Non-functional constraints:
      * Runs in Deno (Supabase Edge Function) — same runtime as existing EMCAS
      * Authenticated via user JWT forwarded from Netlify (validated by Supabase Edge JWT gate)
      * Must complete within Supabase Edge Function limit — post-stream work is fast relative to streaming
      * `execute_completed` notification (previously in processSimpleJob) moves here since completion is now confirmed at this point

  * `[✅]`   `role`
    * `[✅]`   Role: app/domain (Supabase Edge Function handler)
    * `[✅]`   Why appropriate: all post-stream logic requires Supabase access, Deno utilities, and existing shared deps — keeping it in Deno avoids porting the entire shared library to Node.js
    * `[✅]`   Must NOT: invoke the AI provider, receive a stream, set job status to `queued`, or call the Netlify workload

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `dialectic-worker/executeModelCallAndSave` — post-stream processing half of EMCAS
    * `[✅]`   Inside boundary: finish_reason resolution, JSON sanitization, storage upload, contribution persistence, token debit, continuation dispatch, job status update, `execute_completed` notification
    * `[✅]`   Outside boundary: AI streaming (Netlify), job queuing (front-half), prompt assembly (prepareModelJob)

  * `[✅]`   `deps`
    * `[✅]`   `logger: ILogger` — from existing EMCAS deps
    * `[✅]`   `fileManager: IFileManager` — covers `assembleAndSaveFinalDocument` (method on `IFileManager`) and upload/register operations; `assembleAndSaveFinalDocument` is NOT a separate dep
    * `[✅]`   `notificationService: NotificationServiceType` — from existing EMCAS deps
    * `[✅]`   `continueJob: ContinueJobFn` — from existing EMCAS deps
    * `[✅]`   `retryJob: RetryJobFn` — from existing EMCAS deps
    * `[✅]`   `resolveFinishReason: ResolveFinishReasonFn` — from existing EMCAS deps
    * `[✅]`   `isIntermediateChunk: IsIntermediateChunkFn` — from existing EMCAS deps; required for continuation path
    * `[✅]`   `determineContinuation: DetermineContinuationFn` — from existing EMCAS deps; required for continuation path
    * `[✅]`   `buildUploadContext: BuildUploadContextFn` — from existing EMCAS deps; required for storage upload
    * `[✅]`   `debitTokens: BoundDebitTokens` — from existing EMCAS deps; wraps `userTokenWalletService`
    * `[✅]`   `sanitizeJsonContent: SanitizeJsonContentFn` — injected after `jsonSanitizer` node; direct import replaced by injection
    * `[✅]`   `dialectic-worker/index.ts` — registers the new HTTP route for this function (wiring step, separate file touch; one file per turn during execution)
    * `[✅]`   Existing type guards, interfaces, and helpers remain in Deno — no porting required
    * `[✅]`   Note: `dbClient: SupabaseClient<Database>` constructed from JWT at request boundary — placed in `SaveResponseParams` consistent with EMCAS pattern

  * `[✅]`   `context_slice`
    * `[✅]`   HTTP POST body: `{ job_id: string, assembled_content: string, token_usage: NodeTokenUsage | null, finish_reason: string | null }`
    * `[✅]`   HTTP header: `Authorization: Bearer <user_jwt>`
    * `[✅]`   Fetches from DB: full job row, provider row, session data, project owner user ID
    * `[✅]`   Receives `finish_reason` from Netlify handler (explicit outer / provider stream done chunk); `null` when stream interrupted (no done chunk). Narrows to `FinishReason` via type guard with `'unknown'` fallback

  * `[✅]`   `saveResponse.interface.test.ts`
    * `[✅]`   Imports types ONLY from `saveResponse.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * `[✅]`   Construct `SaveResponseParams` literal with `job_id: string` and `dbClient: SupabaseClient<Database>` — compiles; assert `typeof job_id === 'string'`
    * `[✅]`   Construct `SaveResponsePayload` literal with `assembled_content: string`, `token_usage: NodeTokenUsage`, `finish_reason: 'stop'` — compiles; assert field types
    * `[✅]`   Construct `SaveResponsePayload` literal with `token_usage: null` and `finish_reason: null` — compiles (both nullable)
    * `[✅]`   Construct `SaveResponseRequestBody` literal (transport shape) with `{ job_id, assembled_content, token_usage, finish_reason }` — compiles; assert shape
    * `[✅]`   Construct `SaveResponseDeps` literal with all eleven fields of the declared types — compiles; assert shape
    * `[✅]`   Construct `SaveResponseSuccessReturn` literal with each union member (`'completed'`, `'needs_continuation'`, `'continuation_limit_reached'`) — compiles for each
    * `[✅]`   Construct `SaveResponseErrorReturn` literal with `{ error: new Error('x'), retriable: true }` — compiles; assert `error instanceof Error` and `typeof retriable === 'boolean'`
    * `[✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern; runtime accept/reject belongs in `saveResponse.guard.test.ts`

  * `[✅]`   `saveResponse.interface.ts`
    * `[✅]`   `SaveResponseParams`: `{ job_id: string; dbClient: SupabaseClient<Database> }` — identifying information and DB handle constructed from JWT at handler boundary; consistent with EMCAS params pattern
    * `[✅]`   `SaveResponsePayload`: `{ assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null }` — data the function operates on; `finish_reason` relayed from Netlify handler's `done` chunk capture
    * `[✅]`   `SaveResponseRequestBody`: `{ job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null }` — HTTP transport type only; parsed and split into `SaveResponseParams` + `SaveResponsePayload` at handler boundary; not used as function contract
    * `[✅]`   `NodeTokenUsage` imported from shared Netlify adapter interface (or re-declared locally as identical shape to avoid cross-runtime import)
    * `[✅]`   `SaveResponseDeps`: `{ logger: ILogger; fileManager: IFileManager; notificationService: NotificationServiceType; continueJob: ContinueJobFn; retryJob: RetryJobFn; resolveFinishReason: ResolveFinishReasonFn; isIntermediateChunk: IsIntermediateChunkFn; determineContinuation: DetermineContinuationFn; buildUploadContext: BuildUploadContextFn; debitTokens: BoundDebitTokens; sanitizeJsonContent: SanitizeJsonContentFn }`
    * `[✅]`   `SaveResponseSuccessReturn`: `{ status: 'completed' | 'needs_continuation' | 'continuation_limit_reached' }`
    * `[✅]`   `SaveResponseErrorReturn`: `{ error: Error; retriable: boolean }`
    * `[✅]`   `SaveResponseReturn`: `SaveResponseSuccessReturn | SaveResponseErrorReturn`

  * `[✅]`   `saveResponse.interaction.spec`
    * `[✅]`   Receives HTTP POST from Netlify workload with JWT; Supabase Edge validates JWT at gateway
    * `[✅]`   Parses and validates `SaveResponseRequestBody` — invalid → 400, no DB access
    * `[✅]`   Fetches job row by `job_id`; job not found → 404
    * `[✅]`   Executes full post-stream logic (finish_reason, sanitize, parse, upload, save, debit)
    * `[✅]`   Calls `retryJob` on retriable failure; updates job status accordingly
    * `[✅]`   Calls `continueJob` when continuation required; job status → `needs_continuation`
    * `[✅]`   Sends `execute_completed` notification on terminal success (moved from processSimpleJob)
    * `[✅]`   Updates job status from `queued` to terminal state
    * `[✅]`   Returns 200 on success; 500 on unretriable failure; 503 on retriable failure (Netlify retries POST on non-2xx)

  * `[✅]`   `saveResponse.guard.test.ts`
    * `[✅]`   `isSaveResponseRequestBody`: valid; rejects missing `job_id`; rejects missing `assembled_content`; rejects wrong type for `token_usage`; rejects missing `finish_reason` field
    * `[✅]`   `isSaveResponseParams`: valid; rejects missing `job_id`; rejects missing `dbClient`
    * `[✅]`   `isSaveResponsePayload`: valid (with `finish_reason`); rejects missing `assembled_content`; rejects wrong type for `token_usage`; rejects missing `finish_reason` field
    * `[✅]`   `isSaveResponseDeps`: valid full object accepted; any single missing field → guard rejects
    * `[✅]`   `isSaveResponseSuccessReturn`: valid; rejects unknown status values
    * `[✅]`   `isSaveResponseErrorReturn`: valid; requires `retriable` boolean

  * `[✅]`   `saveResponse.guard.ts`
    * `[✅]`   `isSaveResponseRequestBody(v: unknown): v is SaveResponseRequestBody`
    * `[✅]`   `isSaveResponseParams(v: unknown): v is SaveResponseParams`
    * `[✅]`   `isSaveResponsePayload(v: unknown): v is SaveResponsePayload`
    * `[✅]`   `isSaveResponseDeps(v: unknown): v is SaveResponseDeps`
    * `[✅]`   `isSaveResponseSuccessReturn(v: unknown): v is SaveResponseSuccessReturn`
    * `[✅]`   `isSaveResponseErrorReturn(v: unknown): v is SaveResponseErrorReturn`

  * `[✅]`   `saveResponse.test.ts` *(copy post-stream subset from `executeModelCallAndSave.test.ts` and modify)*
    * `[✅]`   Copy all post-stream tests from `executeModelCallAndSave.test.ts`: finish_reason resolution, debitTokens invocation and failure path, fileManager upload and failure path, buildUploadContext ordering, continueJob invocation, retryJob on empty assembled content, sanitizeJsonContent wiring on accumulated content, post-sanitize orchestration, cross-output persistence, document_relationships init failure paths, source_contribution_id update on originating prompt
    * `[✅]`   Exclude pre-stream tests (adapter.sendMessageStream, stream accumulation, text_delta, usage chunk, done chunk, soft-timeout, AI error throws, Throws on AI Error, Database Error on Update) — those belong to `ai-stream` or `enqueueModelCall`
    * `[✅]`   Modify each copied test:
      * Replace `executeModelCallAndSave(deps, params, payload)` with `saveResponse(deps, params, payload)`
      * Replace `ExecuteModelCallAndSaveParams` construction with `SaveResponseParams` (`{ job_id, dbClient }`)
      * Replace `ExecuteModelCallAndSavePayload` construction with `SaveResponsePayload` (`{ assembled_content, token_usage, finish_reason }`)
      * Remove `getAiProviderAdapter` from deps — saveResponse does not call adapters
      * Remove adapter stream setup — blob arrives assembled
      * Replace `createMockExecuteModelCallAndSaveDeps` with `createMockSaveResponseDeps`
    * `[✅]`   New tests (not in EMCAS — specific to HTTP boundary):
      * Invalid HTTP body (`SaveResponseRequestBody` guard fails) → 400, no DB calls
      * Job not found in `dialectic_generation_jobs` → 404
      * Provider row not found for `job_id` → 500 unretriable
      * Session data not found → 500 unretriable

  * `[✅]`   `saveResponse.assembleDocument.test.ts` *(copy from `executeModelCallAndSave.assembleDocument.test.ts` and modify)*
    * `[✅]`   Copy all 4 tests verbatim; apply the standard modifications (function call, params/payload shape, deps, mock factory)
    * `[✅]`   All tests unchanged in behavior — they assert `fileManager.assembleAndSaveFinalDocument` gating rules:
      * NOT called for final markdown with root relationships normalized to contribution id
      * NOT called for final JSON-only chunk when rootIdFromSaved equals contribution id
      * NOT called for non-final chunk (`resolvedFinish !== stop`)
      * NOT called when `document_relationships` on saved record is null

  * `[✅]`   `saveResponse.continue.test.ts` *(copy from `executeModelCallAndSave.continue.test.ts` and modify)*
    * `[✅]`   Copy all ~30 tests; apply the standard modifications
    * `[✅]`   Preserves full continuation contract: Continuation Enqueued, Continuation Handling, `target_contribution_id` forwarding and metadata preservation, first chunk saved as non-continuation with continuation enqueued, final assembly using SAVED relationships when payload is missing, dynamic `document_relationships` key based on stage slug for initial chunk, continuation persists payload `document_relationships` and skips initializer, continuation uses gathered history without duplicating "Please continue.", final document assembly when continuations are exhausted, rejection of continuation without relationships (pre-upload validation), three-chunk finalization uses saved root id and correct chunk order, continuation pathContext flags, content-driven continuation (finish_reason: stop + `continuation_needed: true`), no spacer injection when history already alternates, comprehensive continuation triggers, comprehensive retry triggers, structurally-fixed trigger (Fix 3.4), missing-keys trigger (Fix 3.5), `continuation_count` requirement for continuation chunks (Step 12.b), `continuation_limit_reached` handling (Fix 2), `document_relationships[stageSlug] = contribution.id` enforcement for JSON-only root chunks, enforcement for document root chunks even when planner sets invalid value, no overwrite of `document_relationships[stageSlug]` for continuation chunks

  * `[✅]`   `saveResponse.notifications.test.ts` *(copy from `executeModelCallAndSave.notifications.test.ts` and modify)*
    * `[✅]`   Copy all 5 tests; apply the standard modifications
    * `[✅]`   Preserves: `execute_chunk_completed` emitted for final chunk, `execute_chunk_completed` emitted with all required fields on continuation + document-related, no `sendJobNotificationEvent` when output type is non-document (HeaderContext), no job notification when `projectOwnerUserId` is empty, all `sendJobNotificationEvent` calls include `targetUserId = projectOwnerUserId` as second argument
    * `[✅]`   New test: `execute_completed` emission on terminal success — **moved from `processSimpleJob`** per the split architecture. Assert `execute_completed` is sent exactly once on terminal success
    * `[✅]`   New test: `execute_completed` NOT sent on continuation path (`needs_continuation`)
    * `[✅]`   New test: `execute_completed` NOT sent on retriable error path
    * `[✅]`   New test: `execute_completed` NOT sent on unretriable error path

  * `[✅]`   `saveResponse.pathContext.test.ts` *(copy from `executeModelCallAndSave.pathContext.test.ts` and modify)*
    * `[✅]`   Copy all ~20 tests; apply the standard modifications
    * `[✅]`   Preserves: pathContext validation for document file type (41.b.i), notification `document_key` from payload (41.b.ii), all missing-field error cases (41.b.iii.a–i: `document_key` undefined, `document_key` empty, `projectId` undefined, `sessionId` undefined, `iterationNumber` undefined, `canonicalPathParams` undefined, `canonicalPathParams.stageSlug` undefined, `attempt_count` undefined, `providerDetails.api_identifier` empty), non-document HeaderContext succeeds with `document_key` (41.b.iv), `sourceAnchorModelSlug` propagation for antithesis HeaderContext, `document_key` extraction for `assembled_document_json` (101.c), `documentKey` passed unconditionally for HeaderContext, all `sourceGroupFragment` cases (71.c.i–vi)

  * `[✅]`   `saveResponse.rawJsonOnly.test.ts` *(copy from `executeModelCallAndSave.rawJsonOnly.test.ts` and modify)*
    * `[✅]`   Copy all 5 tests; apply the standard modifications
    * `[✅]`   Preserves: `FileType.ModelContributionRawJson` passed to file manager (not document key fileType) (49.b.i), `mimeType: "application/json"` (not `text/markdown`) (49.b.ii), sanitized JSON string as `fileContent` (49.b.iii), `rawJsonResponseContent` excluded from upload context (49.b.iv), contribution record created with correct `file_name`, `storage_path`, `mime_type` (49.b.v)

  * `[✅]`   `saveResponse.planValidation.test.ts` *(copy from `executeModelCallAndSave.planValidation.test.ts` and modify)*
    * `[✅]`   **Classification note:** despite its name in the existing EMCAS file, all 4 tests in `executeModelCallAndSave.planValidation.test.ts` validate `header_context` shape on the **already-assembled content**. That is post-stream behavior and belongs to `saveResponse`, not to `enqueueModelCall` or `ai-stream`.
    * `[✅]`   Copy all 4 tests; apply the standard modifications (function call → `saveResponse(deps, params, payload)`, params shape → `SaveResponseParams`, payload shape → `SaveResponsePayload` with `assembled_content` carrying the header_context JSON string, deps factory → `createMockSaveResponseDeps`, drop adapter/stream setup)
    * `[✅]`   Preserves header_context post-stream validation contract against `payload.assembled_content`

  * `[✅]`   `construction`
    * `[✅]`   Handler constructed at Edge Function request boundary; `saveResponseDeps` wired from existing `createDialecticWorkerDeps` where shared, plus new back-half-specific wiring
    * `[✅]`   `dialectic-worker/index.ts` wiring: add route matching `POST /execute-model-call-and-save-back-half` → `saveResponse` handler (separate file, one-file-per-turn)

  * `[✅]`   `saveResponse.ts`
    * `[✅]`   Exports `saveResponse(deps, params, payload): Promise<SaveResponseReturn>`
    * `[✅]`   Validates `SaveResponseRequestBody` via guard
    * `[✅]`   Fetches job row, provider row, session, project owner from Supabase
    * `[✅]`   Narrows `payload.finish_reason` (string | null) to `FinishReason` via type guard; `null` falls back to `'unknown'` (triggers continuation — correct for stream interruption)
    * `[✅]`   Runs all post-stream logic extracted from existing `dialectic-worker/executeModelCallAndSave/executeModelCallAndSave.ts` (finish_reason → sanitize → parse → upload → save → debit → continue or complete)
    * `[✅]`   Sends `execute_completed` notification on terminal success
    * `[✅]`   Updates job status from `queued` to outcome

  * `[✅]`   `saveResponse.mock.ts`
    * `[✅]`   `createMockSaveResponseDeps(overrides?)`: controllable `saveResponseDeps`
    * `[✅]`   Mirrors the existing `executeModelCallAndSave.mock.ts` pattern for shared deps

  * `[✅]`   `saveResponse.provides.ts`
    * `[✅]`   Exports: `saveResponse`, `saveResponseDeps`, `SaveResponseReturn`

  * `[✅]`   `saveResponse.integration.test.ts`
    * `[✅]`   Chain: mock Netlify POST → back-half → mock Supabase → mock retryJob/continueJob → asserts job status updated, notification sent
    * `[✅]`   Verifies `execute_completed` notification fires on terminal success (was processSimpleJob's responsibility)

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/domain (Supabase Edge, Deno)
    * `[✅]`   Deps inward: existing shared Deno utilities, Supabase client, notification service
    * `[✅]`   Provides outward: HTTP 200/4xx/5xx response to Netlify workload; job status updates to DB; notifications to users
    * `[✅]`   No cycles; does not call front-half or Netlify

  * `[✅]`   `requirements`
    * `[✅]`   Invalid POST body → 400 without DB access — proven by unit test
    * `[✅]`   Job status transitions from `queued` to correct terminal state — proven by unit test
    * `[✅]`   `execute_completed` notification fires on success — proven by unit test (moved from processSimpleJob)
    * `[✅]`   Non-2xx response on retriable failure causes Netlify to retry POST — proven by interaction spec + integration test

* `[✅]`   `dialectic-worker/enqueueModelCall/enqueueModelCall` **[BE] EMCAS front-half — pre-call validation, job queuing, and Netlify event dispatch**

  * `[✅]`   `objective`
    * `[✅]`   Execute all pre-stream logic from the existing EMCAS (validation, adapter config resolution, API key lookup, preflight token accounting), write job status to `queued`, enqueue a `ai-stream` event to Netlify Async Workloads, await queue ACK, and return — without waiting for stream completion
    * `[✅]`   Functional goals:
      * Validate all params and payload (output_type, model config, adapter resolvability)
      * Resolve the provider API key
      * Write job status → `queued` in `dialectic_generation_jobs`
      * Serialize and enqueue the Netlify `AiStreamEvent` with `{ job_id, api_identifier, model_config, chat_api_request, user_jwt }` — `model_config` maps from `AiModelExtendedConfig` to `NodeModelConfig`; `chat_api_request` maps from `ChatApiRequest` to `NodeChatApiRequest` (translation boundary)
      * Await queue ACK; return success or error to caller (prepareModelJob)
    * `[✅]`   Non-functional constraints:
      * Must NOT initiate the AI stream — stream is Netlify's responsibility
      * Must NOT await stream completion — returns after ACK only
      * Event payload must not exceed 500 KB (Netlify limit)
      * Runs in Deno (Supabase Edge) — same runtime as existing EMCAS

  * `[✅]`   `role`
    * `[✅]`   Role: app/port — bridges the Deno call chain to the Netlify async queue
    * `[✅]`   Why appropriate: validation, config resolution, and event serialization require the Deno shared library; the stream itself does not
    * `[✅]`   Must NOT: perform the AI call, assemble the buffer, save contributions, debit tokens, or update job status beyond `queued`

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `dialectic-worker/executeModelCallAndSave` — pre-stream dispatch half of EMCAS
    * `[✅]`   Inside boundary: param validation, model config validation, adapter key resolution, status write to `queued`, Netlify event enqueue
    * `[✅]`   Outside boundary: AI streaming (Netlify), post-stream processing (back-half), prompt assembly (prepareModelJob)

  * `[✅]`   `deps`
    * `[✅]`   `logger: ILogger` — injected dep
    * `[✅]`   `netlifyQueueUrl: string` — the Netlify async workloads router endpoint (`SITE_ORIGIN/.netlify/functions/async-workloads-router`); injected at construction from env var
    * `[✅]`   `netlifyApiKey: string` — the `AWL_API_KEY` value for `Authorization: Bearer` header; injected at construction from env var
    * `[✅]`   `apiKeyForProvider: ApiKeyForProviderFn` — existing helper (extracted from current EMCAS, or inlined here)
    * `[✅]`   `fetch` — Deno global; used directly to POST the event to Netlify router API; not injected, not in deps
    * `[✅]`   `isAiModelExtendedConfig`, `isModelContributionFileType` — existing type guards; imported directly, not injected

  * `[✅]`   `context_slice`
    * `[✅]`   Params (`EnqueueModelCallParams`): `{ dbClient: SupabaseClient<Database>; job: DialecticJobRow; providerRow: Tables<'ai_providers'>; userAuthToken: string; output_type: string }` — the minimal subset of `ExecuteModelCallAndSaveParams` needed for validation, DB write, and `AiStreamEvent` construction
    * `[✅]`   Payload (`EnqueueModelCallPayload`): `{ chatApiRequest: ChatApiRequest; preflightInputTokens: number }` — the work data to serialize into the `AiStreamEvent`
    * `[✅]`   Returns: `EnqueueModelCallSuccessReturn` (`{ queued: true }`) or `EnqueueModelCallErrorReturn` (`{ error: Error; retriable: boolean }`)
    * `[✅]`   Writes: `{ status: 'queued' }` to `dialectic_generation_jobs` before enqueue
    * `[✅]`   Emits: `AiStreamEvent` to Netlify queue via `fetch` POST

  * `[✅]`   `enqueueModelCall.interface.test.ts`
    * `[✅]`   Imports types ONLY from `enqueueModelCall.interface.ts` — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * `[✅]`   Construct `EnqueueModelCallDeps` literal with all four fields (`logger`, `netlifyQueueUrl`, `netlifyApiKey`, `apiKeyForProvider`) of declared types — compiles; assert shape
    * `[✅]`   Construct `EnqueueModelCallParams` literal with all five fields (`dbClient`, `job`, `providerRow`, `userAuthToken`, `output_type`) of declared types — compiles; assert shape
    * `[✅]`   Construct `EnqueueModelCallPayload` literal with `chatApiRequest` and `preflightInputTokens: number` — compiles; assert `typeof preflightInputTokens === 'number'`
    * `[✅]`   Construct `EnqueueModelCallSuccessReturn` literal `{ queued: true }` — compiles; assert `literal.queued === true`
    * `[✅]`   Construct `EnqueueModelCallErrorReturn` literal `{ error: new Error('x'), retriable: false }` — compiles; assert `error instanceof Error` and `typeof retriable === 'boolean'`
    * `[✅]`   Declare a `BoundEnqueueModelCallFn` variable and assign an `async (params, payload) => Return` function to it — compiles (signature match)
    * `[✅]`   Pure type-shape assertions only — invalid shapes are a compile-time concern; runtime accept/reject belongs in `enqueueModelCall.guard.test.ts`

  * `[✅]`   `enqueueModelCall.interface.ts`
    * `[✅]`   `EnqueueModelCallDeps`: `{ logger: ILogger; netlifyQueueUrl: string; netlifyApiKey: string; apiKeyForProvider: ApiKeyForProviderFn }`
    * `[✅]`   `EnqueueModelCallParams`: `{ dbClient: SupabaseClient<Database>; job: DialecticJobRow; providerRow: Tables<'ai_providers'>; userAuthToken: string; output_type: string }` — new type; minimal subset of `ExecuteModelCallAndSaveParams` fields needed for validation, DB write, and event construction
    * `[✅]`   `EnqueueModelCallPayload`: `{ chatApiRequest: ChatApiRequest; preflightInputTokens: number }` — new type; same shape as `ExecuteModelCallAndSavePayload` but independently defined
    * `[✅]`   `EnqueueModelCallSuccessReturn`: `{ queued: true }`
    * `[✅]`   `EnqueueModelCallErrorReturn`: `{ error: Error; retriable: boolean }`
    * `[✅]`   `EnqueueModelCallReturn`: union of success and error
    * `[✅]`   `EnqueueModelCallFn`: `(deps, params, payload) => Promise<EnqueueModelCallReturn>`
    * `[✅]`   `BoundEnqueueModelCallFn`: `(params, payload) => Promise<EnqueueModelCallReturn>` — pre-bound signature used as dep in `PrepareModelJobDeps`
    * `[✅]`   `ApiKeyForProviderFn` must be located in `_shared` before this node executes — do not define a new type if one already exists

  * `[✅]`   `enqueueModelCall.interaction.spec`
    * `[✅]`   Called by `prepareModelJob` as `deps.enqueueModelCall` (now bound to front-half)
    * `[✅]`   Validates `output_type` via `isModelContributionFileType`; invalid → `{ error, retriable: false }`
    * `[✅]`   Validates `providerRow.config` via `isAiModelExtendedConfig`; invalid → `{ error, retriable: false }`
    * `[✅]`   Resolves API key via `apiKeyForProvider`; key missing → `{ error, retriable: false }`
    * `[✅]`   Writes `{ status: 'queued' }` to `dialectic_generation_jobs` via DB client
    * `[✅]`   Constructs `AiStreamEvent`, serializes to JSON, enforces 500 KB size limit
    * `[✅]`   POSTs to `deps.netlifyQueueUrl` with `Authorization: Bearer ${deps.netlifyApiKey}`, body `{ eventName: 'ai-stream', data: event }`
    * `[✅]`   On 2xx response (`sendStatus: 'succeeded'`): returns `{ queued: true }`
    * `[✅]`   On non-2xx or network error: returns `{ error, retriable: true }`
    * `[✅]`   Does NOT call the AI provider or await stream result

  * `[✅]`   `enqueueModelCall.guard.test.ts`
    * `[✅]`   `isEnqueueModelCallDeps`: accepts valid deps object with all four fields; rejects missing `logger`; rejects missing `netlifyQueueUrl`; rejects missing `netlifyApiKey`; rejects missing `apiKeyForProvider`
    * `[✅]`   `isEnqueueModelCallParams`: accepts valid params with all five fields; rejects missing `dbClient`; rejects missing `job`; rejects missing `providerRow`; rejects missing `userAuthToken`; rejects missing `output_type`
    * `[✅]`   `isEnqueueModelCallPayload`: accepts valid payload with both fields; rejects missing `chatApiRequest`; rejects missing `preflightInputTokens`
    * `[✅]`   `isEnqueueModelCallSuccessReturn`: accepts `{ queued: true }`; rejects `{ queued: false }`; rejects missing field
    * `[✅]`   `isEnqueueModelCallErrorReturn`: accepts valid; rejects missing `retriable`; rejects missing `error`

  * `[✅]`   `enqueueModelCall.guard.ts`
    * `[✅]`   `isEnqueueModelCallDeps(v: unknown): v is EnqueueModelCallDeps`
    * `[✅]`   `isEnqueueModelCallParams(v: unknown): v is EnqueueModelCallParams`
    * `[✅]`   `isEnqueueModelCallPayload(v: unknown): v is EnqueueModelCallPayload`
    * `[✅]`   `isEnqueueModelCallSuccessReturn(v: unknown): v is EnqueueModelCallSuccessReturn`
    * `[✅]`   `isEnqueueModelCallErrorReturn(v: unknown): v is EnqueueModelCallErrorReturn`

  * `[✅]`   `enqueueModelCall.test.ts` *(mostly new tests; one copy-and-modify from `executeModelCallAndSave.test.ts`)*
    * `[✅]`   Copy from `executeModelCallAndSave.test.ts`: parameter handoff test at line 74 (`executeModelCallAndSave calls adapter.sendMessageStream with payload.chatApiRequest and params.providerRow.api_identifier`)
    * `[✅]`   Modify:
      * Replace `executeModelCallAndSave(deps, params, payload)` with `enqueueModelCall(deps, params, payload)`
      * Replace `ExecuteModelCallAndSaveParams` construction with `EnqueueModelCallParams` (re-used shape, includes `dbClient`)
      * Replace `ExecuteModelCallAndSavePayload` construction with `EnqueueModelCallPayload` (same `chatApiRequest`, `preflightInputTokens`)
      * Replace `createMockExecuteModelCallAndSaveDeps` with `createMockEnqueueModelCallDeps`
      * Replace assertion target: instead of asserting `adapter.sendMessageStream` was called, assert `fetch` was called with `deps.netlifyQueueUrl` and a JSON body whose `data` contains an `AiStreamEvent` with `chat_api_request` equal to `payload.chatApiRequest` and `api_identifier` equal to `params.providerRow.api_identifier`
      * Remove adapter mocking — enqueueModelCall does not receive `getAiProviderAdapter` as a dep
    * `[✅]`   Copy from `executeModelCallAndSave.test.ts`: render-job non-insertion test at line 308 (`executeModelCallAndSave does not insert a RENDER job into dialectic_generation_jobs (enqueue is external)`)
    * `[✅]`   Modify (inverse assertion):
      * Apply the standard modifications above
      * Replace negative assertion with positive: `enqueueModelCall` MUST insert a job status update (`{ status: 'queued' }`) into `dialectic_generation_jobs` via `params.dbClient` — the row already exists, this is an update, not an insert of a new row
      * Assert the update targets the correct `job_id` from `params`
    * `[✅]`   New tests — pre-stream validation (no EMCAS equivalent as dedicated tests):
      * Invalid `output_type` (fails `isModelContributionFileType`) → `{ error, retriable: false }`, no DB write, no `fetch` call
      * Invalid `providerRow.config` (fails `isAiModelExtendedConfig`) → `{ error, retriable: false }`, no DB write, no `fetch` call
      * Missing API key (`apiKeyForProvider` returns null/empty) → `{ error, retriable: false }`, no DB write, no `fetch` call
      * All three validation errors occur BEFORE any DB write or `fetch` — proven by spy call order (zero calls)
    * `[✅]`   New tests — DB write ordering and shape:
      * Valid inputs → `params.dbClient` is called with an update setting `status: 'queued'` on the row matching `params.job_id`
      * DB write happens BEFORE `fetch` POST — proven by spy call order assertion
      * DB write failure → `{ error, retriable: true }`, no `fetch` call attempted
    * `[✅]`   New tests — HTTP enqueue behavior:
      * Valid inputs → `fetch` called exactly once with URL `deps.netlifyQueueUrl`, method POST, header `Authorization: Bearer ${deps.netlifyApiKey}`, header `Content-Type: application/json`, body `{ eventName: 'ai-stream', data: <AiStreamEvent> }`
      * `AiStreamEvent` in body contains fully-populated fields: `job_id`, `api_identifier`, `model_config` (mapped from `AiModelExtendedConfig` to `NodeModelConfig`), `chat_api_request` (mapped from `ChatApiRequest` to `NodeChatApiRequest`), `user_jwt`
      * `AiStreamEvent.user_jwt` equals `params.userAuthToken` — proven by assertion on captured body
      * `AiStreamEvent.model_config` contains `{ api_identifier, provider_max_input_tokens, context_window_tokens, hard_cap_output_tokens, provider_max_output_tokens, input_token_cost_rate, output_token_cost_rate }` mapped from `params.providerRow.config` — proven by assertion on captured body
      * `fetch` returns 2xx → returns `{ queued: true }`
      * `fetch` returns non-2xx or throws network error → returns `{ error, retriable: true }`, DB status remains `queued` (not rolled back — retriable retry path handles it)
    * `[✅]`   New tests — separation of concerns:
      * `deps` object does NOT contain `getAiProviderAdapter` — structural proof that enqueueModelCall cannot call AI providers
      * No adapter stream is opened, awaited, or consumed — proven by absence of stream-related spies being called
      * Function returns BEFORE any stream processing could complete — proven by short execution time and no post-stream artifacts (no contribution, no token debit, no notification)
      * Does NOT write any terminal job status (`completed`, `needs_continuation`, `failed`) — only `queued`
    * `[✅]`   New test — payload size constraint:
      * `AiStreamEvent` serialized size stays under 500 KB Netlify limit for a representative large-but-valid `chatApiRequest`
      * Oversized event → `{ error, retriable: false }` with explicit size-limit error message, no `fetch` call attempted

  * `[✅]`   `construction`
    * `[✅]`   At Edge Function boundary: read `NETLIFY_QUEUE_URL` and `AWL_API_KEY` from env vars, inject as `netlifyQueueUrl` and `netlifyApiKey` into `EnqueueModelCallDeps`
    * `[✅]`   No factory function — deps are plain strings; `enqueueModelCall` calls `fetch` directly

  * `[✅]`   `enqueueModelCall.ts`
    * `[✅]`   Exports `enqueueModelCall(deps, params, payload): Promise<EnqueueModelCallReturn>`
    * `[✅]`   Validates `output_type`, model config, API key
    * `[✅]`   Writes `queued` status to DB
    * `[✅]`   Constructs `AiStreamEvent` from params, payload, and resolved config
    * `[✅]`   Serializes event to JSON; checks serialized size ≤ 500 KB; rejects with `{ error, retriable: false }` if oversized
    * `[✅]`   POSTs to `deps.netlifyQueueUrl` via `fetch` with `Authorization: Bearer ${deps.netlifyApiKey}`, `Content-Type: application/json`, body `{ eventName: 'ai-stream', data: event }`
    * `[✅]`   On 2xx response: returns `{ queued: true }`
    * `[✅]`   On non-2xx or network error: returns `{ error, retriable: true }`

  * `[✅]`   `enqueueModelCall.mock.ts`
    * `[✅]`   `createMockEnqueueModelCallDeps(overrides?)`: controllable `EnqueueModelCallDeps`
    * `[✅]`   Default: `netlifyQueueUrl` set to `'https://test.netlify/.netlify/functions/async-workloads-router'`, `netlifyApiKey` set to `'test-awl-api-key'`
    * `[✅]`   Tests mock `fetch` globally to control HTTP responses; no function mock on deps for enqueue behavior

  * `[✅]`   `enqueueModelCall.provides.ts`
    * `[✅]`   Exports: `enqueueModelCall`, `BoundEnqueueModelCallFn`, return types, guards

  * `[✅]`   `enqueueModelCall.integration.test.ts`
    * `[✅]`   Chain: `prepareModelJob` (mock) calls front-half → front-half writes DB status → POSTs to Netlify via `fetch` → returns `{ queued: true }` → prepareModelJob receives and passes through
    * `[✅]`   Asserts DB write precedes `fetch` POST
    * `[✅]`   Uses mock DB client and mock `fetch`

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/port (Deno, Supabase Edge)
    * `[✅]`   Deps inward: existing Deno shared utilities, Supabase client, injected config strings (`netlifyQueueUrl`, `netlifyApiKey`), Deno global `fetch`
    * `[✅]`   Provides outward: `BoundEnqueueModelCallFn` consumed by `prepareModelJob`; `queued` status and `AiStreamEvent` emitted to external systems
    * `[✅]`   No cycles; no external client libraries; no Node.js dependencies

  * `[✅]`   `requirements`
    * `[✅]`   Validation failures return error without DB write or `fetch` call — proven by unit test
    * `[✅]`   DB status written to `queued` before `fetch` POST — proven by unit test call order assertion
    * `[✅]`   `fetch` called with correct URL (`deps.netlifyQueueUrl`), auth header (`Bearer ${deps.netlifyApiKey}`), and JSON body containing `AiStreamEvent` — proven by unit test
    * `[✅]`   `AiStreamEvent` in request body contains correct `user_jwt` — proven by unit test
    * `[✅]`   Returns `{ queued: true }` on 2xx from `fetch` — proven by unit test
    * `[✅]`   Non-2xx or network error returns `{ error, retriable: true }` — proven by unit test
    * `[✅]`   Oversized event (>500 KB serialized) returns `{ error, retriable: false }` without calling `fetch` — proven by unit test

* `[✅]`   `dialectic-worker/prepareModelJob/prepareModelJob` **[BE] Update prepareModelJob — swap EMCAS dep to front-half, adapt return handling for queued result**

  * `[✅]`   `objective`
    * `[✅]`   Replace the `executeModelCallAndSave` dep (full EMCAS) with `enqueueModelCall`, update result handling so `{ queued: true }` is a valid success path, and update `PrepareModelJobSuccessReturn` to reflect that `contribution`, `needsContinuation`, and `renderJobId` are no longer available at this point in the call chain
    * `[✅]`   Functional goals:
      * `PrepareModelJobDeps.enqueueModelCall` type changes to `BoundEnqueueModelCallFn`
      * On `{ queued: true }` from front-half: return `PrepareModelJobSuccessReturn` with queued-appropriate shape
      * On front-half error: propagate as `PrepareModelJobErrorReturn` (unchanged behavior)
      * `enqueueRenderJob` call (if any) that depended on the contribution result must be removed or deferred — no contribution exists at this stage
    * `[✅]`   Non-functional constraints:
      * All existing validation logic (Zones A–D) in prepareModelJob remains unchanged
      * Only the EMCAS call site and result handling change
      * No changes to `PrepareModelJobParams` or `PrepareModelJobPayload`

  * `[✅]`   `role`
    * `[✅]`   Role: app/orchestrator — assembles prompt and dispatches to EMCAS front-half
    * `[✅]`   Unchanged from current role; only the EMCAS dep type and result handling change
    * `[✅]`   Must NOT: call AI provider directly, await stream, or handle post-stream logic

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `dialectic-worker/prepareModelJob` — unchanged
    * `[✅]`   Inside boundary: Zones A–D prompt assembly, front-half dispatch, queued-result propagation
    * `[✅]`   Outside boundary: streaming, post-stream, contribution persistence, token debit, render job enqueue (render job deferred — no contribution at this stage)

  * `[✅]`   `deps`
    * `[✅]`   `BoundEnqueueModelCallFn` — from `enqueueModelCall.provides.ts`; replaces `BoundExecuteModelCallAndSaveFn`
    * `[✅]`   All other existing deps unchanged
    * `[✅]`   `enqueueRenderJob` dep: render job requires a contribution record; since front-half returns no contribution, `enqueueRenderJob` call is removed from prepareModelJob — render job dispatch moves to back-half

  * `[✅]`   `context_slice`
    * `[✅]`   Receives: unchanged `PrepareModelJobParams` and `PrepareModelJobPayload`
    * `[✅]`   Calls: `deps.enqueueModelCall(emcasParams, { chatApiRequest, preflightInputTokens })` — returns `EnqueueModelCallReturn`
    * `[✅]`   Returns: updated `PrepareModelJobSuccessReturn` — `{ queued: true }` (contribution and continuation data removed; back-half is responsible)

  * `[✅]`   `prepareModelJob.interface.test.ts` *(update existing file)*
    * `[✅]`   File tests the type contract ONLY — no guard imports, no runtime validators; mirrors `ai-adapter.interface.test.ts` pattern
    * `[✅]`   Updated: construct `PrepareModelJobSuccessReturn` literal `{ queued: true }` — compiles; assert `literal.queued === true`
    * `[✅]`   Removed: literals/assertions referencing `contribution`, `needsContinuation`, `renderJobId` on the success return
    * `[✅]`   Updated: construct `PrepareModelJobDeps` literal with `enqueueModelCall: BoundEnqueueModelCallFn` — compiles; assert shape
    * `[✅]`   Existing error-return type-shape assertions remain unchanged
    * `[✅]`   Any guard-behavior cases previously in this file move to `prepareModelJob.guard.test.ts` (runtime accept/reject is not the interface test's job)

  * `[✅]`   `prepareModelJob.interface.ts` *(update existing file)*
    * `[✅]`   `PrepareModelJobDeps.enqueueModelCall`: type changes from `BoundEnqueueModelCallFn` to `BoundEnqueueModelCallFn`
    * `[✅]`   `PrepareModelJobSuccessReturn`: changes from `{ contribution, needsContinuation, renderJobId }` to `{ queued: true }`
    * `[✅]`   `PrepareModelJobErrorReturn`: unchanged
    * `[✅]`   `enqueueRenderJob` removed from `PrepareModelJobDeps` — render job is back-half's responsibility

  * `[✅]`   `prepareModelJob.interaction.spec` *(update)*
    * `[✅]`   Zones A–D prompt assembly: unchanged
    * `[✅]`   EMCAS call: now calls front-half; receives `{ queued: true }` or `{ error, retriable }`
    * `[✅]`   On `{ queued: true }`: returns `{ queued: true }` to processSimpleJob
    * `[✅]`   On front-half error: returns `PrepareModelJobErrorReturn`
    * `[✅]`   `enqueueRenderJob` no longer called from prepareModelJob

  * `[✅]`   `prepareModelJob.guard.test.ts` *(update existing file)*
    * `[✅]`   `isPrepareModelJobSuccessReturn`: updated — accepts `{ queued: true }`; rejects old `{ contribution, needsContinuation, renderJobId }` shape
    * `[✅]`   `isPrepareModelJobDeps`: updated — `enqueueModelCall` must be `BoundEnqueueModelCallFn`; `enqueueRenderJob` absent → guard accepts (removed field)
    * `[✅]`   All other guard tests unchanged

  * `[✅]`   `prepareModelJob.guard.ts` *(update existing file)*
    * `[✅]`   `isPrepareModelJobSuccessReturn`: checks `queued === true` instead of `contribution` shape
    * `[✅]`   `isPrepareModelJobDeps`: removes `enqueueRenderJob` check; no change to `enqueueModelCall` check (function type — duck-typed by presence)
    * `[✅]`   All other guards unchanged

  * `[✅]`   `prepareModelJob.test.ts` *(update existing file — add new tests at end, do not modify existing)*
    * `[✅]`   New: front-half returns `{ queued: true }` → prepareModelJob returns `{ queued: true }` — assert propagation
    * `[✅]`   New: front-half returns `{ error, retriable: false }` → prepareModelJob returns `PrepareModelJobErrorReturn`
    * `[✅]`   New: `enqueueRenderJob` is NOT called — assert spy never called
    * `[✅]`   Existing tests: all Zones A–D tests remain unchanged and GREEN

  * `[✅]`   `construction`
    * `[✅]`   `PrepareModelJobDeps` construction at wiring boundary: `enqueueModelCall` bound to `enqueueModelCall`; `enqueueRenderJob` removed from deps object
    * `[✅]`   Context factory (`createDialecticWorkerDeps`) updated in JobContext node — not here

  * `[✅]`   `prepareModelJob.ts` *(update existing file)*
    * `[✅]`   Line 322: call `deps.enqueueModelCall(emcasParams, { chatApiRequest, preflightInputTokens })` — unchanged call shape, return type changes
    * `[✅]`   Lines 345–357: remove `fileType`, `storageFileType`, `documentKey` result extraction (no longer in return)
    * `[✅]`   Remove `enqueueRenderJob` call
    * `[✅]`   On `{ queued: true }`: return `{ queued: true }` to caller
    * `[✅]`   All Zone A–D logic above the EMCAS call: unchanged

  * `[✅]`   `prepareModelJob.mock.ts` *(update existing file)*
    * `[✅]`   `buildBoundEnqueueModelCallStub`: return type changes to `EnqueueModelCallReturn` — default stub returns `{ queued: true }`
    * `[✅]`   Remove `enqueueRenderJob` from mock deps

  * `[✅]`   `prepareModelJob.provides.ts` *(update if exists)*
    * `[✅]`   Export updated `PrepareModelJobSuccessReturn` and `BoundEnqueueModelCallFn`

  * `[✅]`   `prepareModelJob.integration.test.ts` *(update)*
    * `[✅]`   Chain: processSimpleJob mock → prepareModelJob (with mock front-half dep) → front-half returns `{ queued: true }` → prepareModelJob returns `{ queued: true }` → processSimpleJob handles correctly
    * `[✅]`   Existing integration tests updated for new success shape

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/orchestrator — unchanged
    * `[✅]`   Deps inward: front-half (replaces full EMCAS); all other existing deps
    * `[✅]`   Provides outward: `PrepareModelJobSuccessReturn { queued: true }` to processSimpleJob
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   Front-half `{ queued: true }` propagates to caller — proven by updated test
    * `[✅]`   `enqueueRenderJob` is never called from prepareModelJob — proven by spy assertion
    * `[✅]`   Zones A–D remain GREEN — proven by existing tests passing unchanged

* `[✅]`   `dialectic-worker/processSimpleJob` **[BE] Update processSimpleJob — handle queued success shape, remove premature execute_completed notification**

  * `[✅]`   `objective`
    * `[✅]`   Adapt processSimpleJob to handle `PrepareModelJobSuccessReturn { queued: true }` as a valid terminal result for this invocation, and remove the `sendJobNotificationEvent('execute_completed')` call that is no longer appropriate here (completion is now confirmed only when the back-half runs)
    * `[✅]`   Functional goals:
      * `isPrepareModelJobSuccessReturn` now accepts `{ queued: true }` — guard change flows in from prepareModelJob node; processSimpleJob's check at line 355 continues to work
      * Remove lines 359–370: `sendJobNotificationEvent('execute_completed')` and associated `notificationDocumentKey` usage
      * All error paths (ContextWindowError, PrepareModelJobExecutionError) remain unchanged
    * `[✅]`   Non-functional constraints:
      * Minimal change — only the post-prepareModelJob success block changes
      * No changes to Zones A–D equivalent logic, session/stage/provider fetching, or error handling

  * `[✅]`   `role`
    * `[✅]`   Role: app/orchestrator — unchanged; adapts to new EMCAS split contract
    * `[✅]`   Must NOT: send `execute_completed` notification (moved to back-half), await stream, or know about Netlify

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `dialectic-worker` — unchanged
    * `[✅]`   Inside boundary: job orchestration up to and including prepareModelJob dispatch
    * `[✅]`   Outside boundary: stream execution (Netlify), post-stream processing (back-half), `execute_completed` notification (back-half)

  * `[✅]`   `deps`
    * `[✅]`   All existing deps unchanged — no new deps added
    * `[✅]`   `notificationDocumentKey` variable: removed (was only used in the `execute_completed` send)

  * `[✅]`   `context_slice`
    * `[✅]`   Receives: unchanged params
    * `[✅]`   Calls: `ctx.prepareModelJob(prepareParams, preparePayload)` — return type now `PrepareModelJobReturn` with updated success shape `{ queued: true }`
    * `[✅]`   Returns: void (processSimpleJob throws or returns; its return is not consumed)

  * `[✅]`   `processSimpleJob.interface.test.ts` *(none exists — processSimpleJob has no interface file; skip)*

  * `[✅]`   `processSimpleJob.interaction.spec` *(update)*
    * `[✅]`   `isPrepareModelJobSuccessReturn` check at line 355: accepts `{ queued: true }` — updated guard handles this
    * `[✅]`   On success: function exits normally — no notification send, no contribution handling
    * `[✅]`   All error paths unchanged

  * `[✅]`   `processSimpleJob.test.ts` *(update existing — add new tests at end)*
    * `[✅]`   New: `prepareModelJob` returns `{ queued: true }` → processSimpleJob returns without throwing, no notification sent
    * `[✅]`   New: assert `sendJobNotificationEvent` is NOT called with `execute_completed` when prepareModelJob returns `{ queued: true }`
    * `[✅]`   Existing error path tests: unchanged and GREEN

  * `[✅]`   `construction`
    * `[✅]`   No construction changes — processSimpleJob is not a class or factory

  * `[✅]`   `processSimpleJob.ts` *(update existing file)*
    * `[✅]`   Lines 359–370: remove `sendJobNotificationEvent('execute_completed')` block entirely
    * `[✅]`   Line 53: remove `notificationDocumentKey` declaration (no longer used)
    * `[✅]`   Line 54: remove `stepKeyForNotification` if only used by the removed block
    * `[✅]`   Line 355: `isPrepareModelJobSuccessReturn` check — no code change needed; updated guard (from prepareModelJob node) handles `{ queued: true }`
    * `[✅]`   All other code: unchanged

  * `[✅]`   `processSimpleJob.integration.test.ts` *(update or add)*
    * `[✅]`   Chain: processSimpleJob → prepareModelJob mock returns `{ queued: true }` → processSimpleJob exits cleanly → asserts no `execute_completed` notification sent
    * `[✅]`   Existing integration tests pass with updated success shape

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/orchestrator — unchanged
    * `[✅]`   No new deps; one removed behavior (`execute_completed` notification)
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   `{ queued: true }` from prepareModelJob causes clean return without notification — proven by unit test
    * `[✅]`   `execute_completed` is never sent from processSimpleJob — proven by spy assertion
    * `[✅]`   All existing error paths remain GREEN — proven by existing tests unchanged

* `[ ]`   `dialectic-worker/createJobContext/JobContext` **[BE] Update JobContext — wire enqueueModelCall, remove enqueueRenderJob from prepareModelJob deps slice**

  * `[✅]`   `objective`
    * `[✅]`   Update `IJobContext` and `createJobContext` to wire `enqueueModelCall` dep in `PrepareModelJobDeps`, and remove `enqueueRenderJob` from the prepareModelJob context slice — reflecting the split architecture
    * `[✅]`   Functional goals:
      * `IJobContext.prepareModelJob` dep factory wires `BoundEnqueueModelCallFn`
      * `enqueueRenderJob` removed from the prepareModelJob context slice (remains available in the back-half context slice)
      * `netlifyQueueUrl` and `netlifyApiKey` read from env vars and injected into front-half deps
      * `DIALECTIC_SAVERESPONSE_URL` env var wired into `AiStreamDeps` for Netlify workload (Netlify side only — noted but not wired here)
    * `[✅]`   Non-functional constraints:
      * IJobContext context factory must set every field explicitly — no optional fields
      * Existing context slices for other functions (render, continue, retry) remain unchanged
      * All JobContext interface tests must pass with updated wiring

  * `[✅]`   `role`
    * `[✅]`   Role: app/infra — wiring boundary; constructs and injects deps into the call chain
    * `[✅]`   Why appropriate: context factory is the single point where runtime deps are assembled; all changes to dep wiring belong here
    * `[✅]`   Must NOT: implement business logic, call AI providers, or access Supabase directly

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `dialectic-worker/createJobContext` — unchanged
    * `[✅]`   Inside boundary: dep construction, context factory, wiring of front-half into prepareModelJob slice
    * `[✅]`   Outside boundary: all function implementations; Netlify workload wiring (separate package)

  * `[✅]`   `deps`
    * `[✅]`   `enqueueModelCall` — from front-half node; bound and injected
    * `[✅]`   `NETLIFY_QUEUE_URL` and `AWL_API_KEY` — env vars read at boundary; passed as `netlifyQueueUrl` and `netlifyApiKey` strings into front-half deps
    * `[✅]`   All existing deps unchanged

  * `[✅]`   `context_slice`
    * `[✅]`   `prepareModelJob` context slice: `enqueueModelCall` → `BoundEnqueueModelCallFn`; `enqueueRenderJob` removed
    * `[✅]`   Back-half context slice: `enqueueRenderJob` present here (back-half dispatches render job after contribution exists)
    * `[✅]`   All other slices: unchanged

  * `[✅]`   `JobContext.interface.test.ts` *(update existing)*
    * `[✅]`   Updated: `IJobContext.prepareModelJob` slice has `enqueueModelCall` typed as `BoundEnqueueModelCallFn`
    * `[✅]`   Updated: `PrepareModelJobDeps` slice does not include `enqueueRenderJob`
    * `[✅]`   New: back-half context slice includes `enqueueRenderJob`
    * `[✅]`   All other interface tests unchanged

  * `[✅]`   `JobContext.interface.ts` *(update existing)*
    * `[✅]`   `IJobContext`: updated prepareModelJob deps slice type
    * `[✅]`   Add back-half deps slice type for `saveResponse` if not already present
    * `[✅]`   `ApplyInputsRequiredScopeFn`, `ValidateWalletBalanceFn`, `ValidateModelCostRatesFn`: unchanged

  * `[✅]`   `JobContext.interaction.spec` *(update)*
    * `[✅]`   `createJobContext` wires `enqueueModelCall` with `netlifyQueueUrl` and `netlifyApiKey` read from env
    * `[✅]`   `createJobContext` wires back-half deps with `enqueueRenderJob`

  * `[✅]`   `JobContext.guard.test.ts` *(update)*
    * `[✅]`   Guards for updated context shape — `enqueueModelCall` accepted as `BoundEnqueueModelCallFn`; `enqueueRenderJob` absent from prepareModelJob slice accepted

  * `[✅]`   `JobContext.guard.ts` *(update)*
    * `[✅]`   Update guard for prepareModelJob context slice to reflect removed `enqueueRenderJob` and updated EMCAS type

  * `[✅]`   `JobContext.test.ts` *(update — add new tests at end)*
    * `[✅]`   New: `createJobContext` wires front-half correctly — `ctx.prepareModelJob` receives `BoundEnqueueModelCallFn`
    * `[✅]`   New: `enqueueRenderJob` absent from prepareModelJob context slice
    * `[✅]`   New: `enqueueRenderJob` present in back-half context slice
    * `[✅]`   Existing tests: unchanged and GREEN

  * `[✅]`   `construction`
    * `[✅]`   `createJobContext(env, supabaseClient, ...)`: updated to read `NETLIFY_QUEUE_URL` and `AWL_API_KEY` from env; passes as `netlifyQueueUrl` and `netlifyApiKey` into front-half deps
    * `[✅]`   Context factory must set every field explicitly — no optional fields introduced

  * `[✅]`   `createJobContext.ts` *(update existing)*
    * `[✅]`   Import `enqueueModelCall`
    * `[✅]`   In prepareModelJob deps slice: bind `enqueueModelCall` to `enqueueModelCall` (with `netlifyQueueUrl` and `netlifyApiKey` from env)
    * `[✅]`   Remove `enqueueRenderJob` from prepareModelJob deps slice
    * `[✅]`   Add back-half deps slice with `enqueueRenderJob` and back-half-specific deps

  * `[✅]`   `JobContext.mock.ts` *(update)*
    * `[✅]`   Mock context: `enqueueModelCall` in prepareModelJob slice defaults to `createMockEnqueueModelCallDeps` stub
    * `[✅]`   `enqueueRenderJob` present only in back-half mock slice

  * `[✅]`   `JobContext.provides.ts` *(update if exists)*
    * `[✅]`   Export updated `IJobContext`, `createJobContext`

  * `[✅]`   `JobContext.integration.test.ts` *(update)*
    * `[✅]`   Full Phase 1 chain integration: processSimpleJob → prepareModelJob (front-half dep) → front-half writes `queued` to DB → enqueues Netlify event → returns `{ queued: true }` → processSimpleJob exits cleanly
    * `[✅]`   Uses mock `fetch` and mock DB client
    * `[✅]`   Proves end-to-end that the Supabase side of Phase 1 is wired correctly

  * `[ ]`   `ai-stream.integration.test.ts` *(update — add cross-system chain tests)*
    * `[ ]`   Full cross-system chain: mock `AiStreamEvent` → `runAiStreamWorkload` (real) → mock AI adapter (no live model calls) → real Node HTTP server standing in for `saveResponse` → assert POST body matches `AiStreamPayload` and `Authorization: Bearer <user_jwt>` header is present
    * `[ ]`   Invokes `saveResponse` real implementation against the captured POST body via mock Supabase client — assert DB write is attempted with correct `job_id`, `assembled_content`, and `token_usage`
    * `[ ]`   Back-half failure path: `saveResponse` mock Supabase client returns error → assert workload throws (Netlify retries step-2) without re-invoking adapter
    * `[ ]`   Mocked boundaries: AI adapter (no live model calls), Supabase DB client (no live DB), Netlify queue transport (event delivered directly to `runAiStreamWorkload`)
    * `[ ]`   Real implementations: `runAiStreamWorkload`, `executeStreamPhase`, `executePostPhase`, `saveResponse` handler, event validation guards on both sides
    * `[ ]`   Prerequisite: `saveResponse` Edge Function node must be complete before this step can be written

  * `[✅]`   `directionality`
    * `[✅]`   Layer: app/infra — wiring boundary
    * `[✅]`   Deps inward: front-half, back-half, all existing worker deps
    * `[✅]`   Provides outward: fully wired `IJobContext` to processSimpleJob, processComplexJob, and all other consumers
    * `[✅]`   No cycles

  * `[✅]`   `requirements`
    * `[✅]`   Context wires front-half into prepareModelJob — proven by unit test
    * `[✅]`   `enqueueRenderJob` absent from prepareModelJob slice — proven by unit test
    * `[✅]`   Phase 1 Supabase-side chain integration passes — proven by `JobContext.integration.test.ts`
    * `[✅]`   Phase 1 cross-system chain integration passes: workload receives event, calls mock adapter, POSTs to `saveResponse`, `saveResponse` writes to DB — proven by `ai-stream.integration.test.ts` update
    * `[✅]`   All existing context tests remain GREEN

  * `[ ]`   **Commit** `feat(dialectic-worker): split EMCAS into enqueueModelCall (EMCAS pre-stream) + Netlify streaming worker + saveResponse (EMCAS post-stream)`
    * `[ ]`   Structural: new Netlify async workload (`ai-stream`) with OpenAI, Anthropic, Google Node.js adapters; new `saveResponse` Deno Edge Function; new `enqueueModelCall` Deno function
    * `[ ]`   Behavioral: AI stream execution moves from Supabase Edge (4-min timeout) to Netlify Async Workloads (15-min timeout); job status `queued` added; `execute_completed` notification moves to back-half
    * `[ ]`   Contract: `PrepareModelJobSuccessReturn` changes to `{ queued: true }`; `BoundEnqueueModelCallFn` dep replaced by `BoundEnqueueModelCallFn`; `enqueueRenderJob` removed from prepareModelJob context slice

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

## Ensure front end components use friendly names 
- SessionInfoCard uses formal names instead of friendly names 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 

## Swap default model to Gemini Flash

## Let users pick model on "Start Project" page 

## Fix continuation naming to use continuation naming instead of iterations 

## 