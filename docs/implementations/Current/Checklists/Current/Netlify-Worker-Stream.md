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
      * Define all shared Node.js streaming types: `NodeChatMessage`, `NodeChatApiRequest`, `NodeModelConfig`, `NodeTokenUsage`, `AiAdapterParams`, `AiAdapterResult`, `AiAdapter`
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
    * `[✅]`   Receives `GetNodeAiAdapterParams`: `{ apiIdentifier: string; apiKey: string }`
    * `[✅]`   Returns `AiAdapter | null`

  * `[✅]`   `ai-adapter.interface.test.ts`
    * `[✅]`   Valid `NodeChatMessage`: `role` is `'user' | 'assistant' | 'system'`, `content` is string
    * `[✅]`   Valid `NodeChatApiRequest`: non-empty messages array, each message is valid `NodeChatMessage`
    * `[✅]`   Valid `NodeModelConfig`: non-empty `model_identifier`, positive integer `max_tokens`
    * `[✅]`   Valid `AiAdapterResult`: `assembled_content` is string (may be empty), `token_usage` is `NodeTokenUsage` or `null`
    * `[✅]`   Valid `NodeTokenUsage`: `prompt_tokens`, `completion_tokens`, `total_tokens` are non-negative integers
    * `[✅]`   Invalid: missing `messages`, null `apiKey`, empty `model_identifier`, non-integer token counts → guard rejects
    * `[✅]`   `AiAdapter`: object with `stream` function — guard accepts; missing `stream` → guard rejects

  * `[✅]`   `ai-adapter.interface.ts`
    * `[✅]`   `NodeChatMessage`: `{ role: 'user' | 'assistant' | 'system'; content: string }`
    * `[✅]`   `NodeChatApiRequest`: `{ messages: NodeChatMessage[]; model: string; max_tokens: number; system?: string }`
    * `[✅]`   `NodeModelConfig`: `{ model_identifier: string; max_tokens: number }`
    * `[✅]`   `NodeTokenUsage`: `{ prompt_tokens: number; completion_tokens: number; total_tokens: number }`
    * `[✅]`   `AiAdapterParams`: `{ chatApiRequest: NodeChatApiRequest; modelConfig: NodeModelConfig; apiKey: string }`
    * `[✅]`   `AiAdapterResult`: `{ assembled_content: string; token_usage: NodeTokenUsage | null }`
    * `[✅]`   `AiAdapter`: `{ stream(params: AiAdapterParams): Promise<AiAdapterResult> }`
    * `[✅]`   `NodeAdapterFactory`: `(apiKey: string) => AiAdapter`
    * `[✅]`   `NodeProviderMap`: `Record<string, NodeAdapterFactory>`
    * `[✅]`   No `any`, no optional fields without explicit justification

  * `[✅]`   `getNodeAiAdapter.interface.test.ts`
    * `[✅]`   Valid `GetNodeAiAdapterDeps`: `providerMap` is a `NodeProviderMap` with at least one entry whose value is a function
    * `[✅]`   Valid `GetNodeAiAdapterParams`: non-empty `apiIdentifier`, non-empty `apiKey`
    * `[✅]`   Invalid: missing `providerMap`, empty `providerMap`, non-function map values → guard rejects
    * `[✅]`   Invalid: empty `apiIdentifier` → guard rejects

  * `[✅]`   `getNodeAiAdapter.interface.ts`
    * `[✅]`   `GetNodeAiAdapterDeps`: `{ providerMap: NodeProviderMap }`
    * `[✅]`   `GetNodeAiAdapterParams`: `{ apiIdentifier: string; apiKey: string }`
    * `[✅]`   `GetNodeAiAdapterFn`: `(deps: GetNodeAiAdapterDeps, params: GetNodeAiAdapterParams) => AiAdapter | null`

  * `[✅]`   `adapter-conformance.test-utils.ts` *(exported — imported by each adapter node's unit test to prove conformance without drift)*
    * `[✅]`   Exports `runAdapterConformanceTests(factory: NodeAdapterFactory): void`
    * `[✅]`   Conformance cases (each adapter's test provides mock SDK, factory produces adapter):
      * `factory('test-key')` returns object satisfying `isAiAdapter`
      * `stream()` called with valid `AiAdapterParams` resolves to `AiAdapterResult`
      * `stream()` with provider SDK error propagates throw (does not swallow)
      * `token_usage` is null when provider returns no usage data

  * `[✅]`   `getNodeAiAdapter.guard.test.ts`
    * `[✅]`   `isNodeProviderMap`: accepts valid map; rejects empty object; rejects non-function values
    * `[✅]`   `isGetNodeAiAdapterDeps`: accepts valid; rejects missing `providerMap`
    * `[✅]`   `isGetNodeAiAdapterParams`: accepts valid; rejects empty strings
    * `[✅]`   `isAiAdapter`: accepts object with `stream` function; rejects non-function or missing `stream`

  * `[✅]`   `getNodeAiAdapter.guard.ts`
    * `[✅]`   `isNodeChatMessage(v: unknown): v is NodeChatMessage`
    * `[✅]`   `isNodeChatApiRequest(v: unknown): v is NodeChatApiRequest`
    * `[✅]`   `isNodeModelConfig(v: unknown): v is NodeModelConfig`
    * `[✅]`   `isNodeTokenUsage(v: unknown): v is NodeTokenUsage`
    * `[✅]`   `isAiAdapterParams(v: unknown): v is AiAdapterParams`
    * `[✅]`   `isAiAdapterResult(v: unknown): v is AiAdapterResult`
    * `[✅]`   `isAiAdapter(v: unknown): v is AiAdapter`
    * `[✅]`   `isNodeProviderMap(v: unknown): v is NodeProviderMap`
    * `[✅]`   `isGetNodeAiAdapterDeps(v: unknown): v is GetNodeAiAdapterDeps`
    * `[✅]`   `isGetNodeAiAdapterParams(v: unknown): v is GetNodeAiAdapterParams`

  * `[✅]`   `getNodeAiAdapter.test.ts`
    * `[✅]`   Known prefix (`'openai-gpt-4o'`) in mock provider map → factory returned and called with `apiKey`
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
    * `[✅]`   Returns `deps.providerMap[prefix](params.apiKey)` or null if no prefix found

  * `[✅]`   `getNodeAiAdapter.mock.ts`
    * `[✅]`   `createMockNodeProviderMap(overrides?: Partial<NodeProviderMap>): NodeProviderMap` — default: `{ 'openai-': () => mockAiAdapter, 'anthropic-': () => mockAiAdapter, 'google-': () => mockAiAdapter }`
    * `[✅]`   `createMockGetNodeAiAdapterDeps(overrides?): GetNodeAiAdapterDeps`
    * `[✅]`   `mockAiAdapter`: satisfies `isAiAdapter`; `stream()` resolves with mock `AiAdapterResult`

  * `[✅]`   `getNodeAiAdapter.provides.ts`
    * `[✅]`   Exports: `getNodeAiAdapter`, `defaultNodeProviderMap`, `GetNodeAiAdapterFn`
    * `[✅]`   Re-exports all shared types from `ai-adapter.interface.ts`: `AiAdapter`, `AiAdapterParams`, `AiAdapterResult`, `NodeTokenUsage`, `NodeChatApiRequest`, `NodeModelConfig`, `NodeAdapterFactory`, `NodeProviderMap`
    * `[✅]`   Re-exports all shared guards: `isAiAdapter`, `isAiAdapterParams`, `isAiAdapterResult`, `isNodeTokenUsage`
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

* `[ ]`   `netlify/functions/ai-stream/adapters/openai/openai-adapter` **[BE] OpenAI Node.js streaming adapter for Netlify Async Workload**

  * `[ ]`   `objective`
    * `[ ]`   Provide a Node.js streaming adapter that calls the OpenAI Chat Completions API, assembles the full response buffer, and returns `{ assembled_content, token_usage }` without Deno dependencies, Supabase access, or finish_reason speculation
    * `[ ]`   Functional goals:
      * Accept a fully-formed chat API request, model config, and API key
      * Stream tokens from OpenAI until the stream closes naturally or errors
      * Return assembled buffer and token usage to the ai-stream workload
    * `[ ]`   Non-functional constraints:
      * Runs in Node.js 18+ (Netlify runtime) — zero Deno APIs
      * No Supabase access — API key injected per-call only
      * No internal soft timeout — Netlify's 15-minute window is the ceiling
      * No finish_reason speculation — raw buffer only; EMCAS back-half determines termination cause
    * `[ ]`   **Infrastructure prerequisite (before any Netlify node can be built or tested):**
      * `netlify/functions/ai-stream/package.json` — Node.js package with `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `@supabase/supabase-js`, `@netlify/async-workloads`, TypeScript, and a test runner (Vitest)
      * `netlify/functions/ai-stream/tsconfig.json` — strict TypeScript config targeting Node.js
      * `netlify.toml` — registers `ai-stream` as an async workload function
      * `.env` / Netlify env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIALECTIC_SAVERESPONSE_URL`
      * These are config artifacts, not source nodes; no TDD required

  * `[ ]`   `role`
    * `[ ]`   Role: infra/adapter — wraps `openai` Node.js SDK to satisfy the shared `AiAdapter` interface
    * `[ ]`   Why appropriate: workload dispatches to provider-specific streaming logic without owning OpenAI implementation details
    * `[ ]`   Must NOT: interact with Supabase, read from DB, call the back-half, manage job state, or determine finish_reason

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `netlify/functions/ai-stream/adapters` — Netlify-side AI streaming adapter layer
    * `[ ]`   Inside boundary: OpenAI stream invocation, chunk accumulation, token usage extraction
    * `[ ]`   Outside boundary: job state, DB access, finish_reason classification, HTTP callback to back-half

  * `[ ]`   `deps`
    * `[ ]`   `openai` npm package — external, infra layer, provides streaming chat SDK
    * `[ ]`   `ai-adapter.interface.ts` — defined in this node, extended by all three provider adapters and the workload
    * `[ ]`   No reverse deps; no lateral violations

  * `[ ]`   `context_slice`
    * `[ ]`   Receives `AiAdapterParams`: `{ chatApiRequest: NodeChatApiRequest, modelConfig: NodeModelConfig, apiKey: string }`
    * `[ ]`   Returns `AiAdapterResult`: `{ assembled_content: string, token_usage: NodeTokenUsage | null }`
    * `[ ]`   No over-fetching — adapter does not receive job_id, user_jwt, or DB handles

  * `[ ]`   `openai.interface.test.ts`
    * `[ ]`   Valid `NodeChatApiRequest`: non-empty messages array, each message has `role` and `content`
    * `[ ]`   Valid `NodeModelConfig`: non-empty `model_identifier`, positive integer `max_tokens`
    * `[ ]`   Valid `AiAdapterResult`: `assembled_content` is string (may be empty), `token_usage` is `NodeTokenUsage` or `null`
    * `[ ]`   Valid `NodeTokenUsage`: `prompt_tokens`, `completion_tokens`, `total_tokens` are non-negative integers
    * `[ ]`   Invalid: missing `messages`, null `apiKey`, empty `model_identifier`, non-integer token counts → guard rejects
    * `[ ]`   `AiAdapter` interface: `stream` property is a function — valid; missing `stream` → guard rejects

  * `[ ]`   `ai-adapter.interface.ts` *(shared interface — lives at adapter root `netlify/functions/ai-stream/adapters/`, defined in this node)*
    * `[ ]`   `NodeChatMessage`: `{ role: 'user' | 'assistant' | 'system'; content: string }`
    * `[ ]`   `NodeChatApiRequest`: `{ messages: NodeChatMessage[]; model: string; max_tokens: number; system?: string }`
    * `[ ]`   `NodeModelConfig`: `{ model_identifier: string; max_tokens: number }`
    * `[ ]`   `NodeTokenUsage`: `{ prompt_tokens: number; completion_tokens: number; total_tokens: number }`
    * `[ ]`   `AiAdapterParams`: `{ chatApiRequest: NodeChatApiRequest; modelConfig: NodeModelConfig; apiKey: string }`
    * `[ ]`   `AiAdapterResult`: `{ assembled_content: string; token_usage: NodeTokenUsage | null }`
    * `[ ]`   `AiAdapter`: `{ stream(params: AiAdapterParams): Promise<AiAdapterResult> }`
    * `[ ]`   No `any`, no optional fields without explicit justification

  * `[ ]`   `openai.interaction.spec`
    * `[ ]`   Called by `ai-stream` workload when `api_identifier` prefix matches `openai-`
    * `[ ]`   Calls `openai.chat.completions.create({ stream: true, model, max_tokens, messages })`
    * `[ ]`   Iterates async stream via `for await`, appends text content deltas to buffer string
    * `[ ]`   Extracts `usage` from final stream chunk when present; maps to `NodeTokenUsage`
    * `[ ]`   On natural stream close: returns `{ assembled_content, token_usage }`
    * `[ ]`   On stream error: throws — caller (workload) catches; Netlify retries the event
    * `[ ]`   No side effects beyond buffer accumulation; no DB writes, no HTTP calls

  * `[ ]`   `openai.guard.test.ts`
    * `[ ]`   `isAiAdapterParams`: accepts full valid object; rejects missing `chatApiRequest`, missing `apiKey`, wrong types
    * `[ ]`   `isAiAdapterResult`: accepts `{ assembled_content: '', token_usage: null }`; rejects missing `assembled_content`
    * `[ ]`   `isNodeTokenUsage`: accepts valid counts; rejects negative numbers, non-integers, missing fields
    * `[ ]`   `isAiAdapter`: accepts object with `stream` function; rejects missing or non-function `stream`
    * `[ ]`   No false positives or negatives against the interface test cases

  * `[ ]`   `openai.guard.ts`
    * `[ ]`   `isNodeChatMessage(v: unknown): v is NodeChatMessage`
    * `[ ]`   `isNodeChatApiRequest(v: unknown): v is NodeChatApiRequest`
    * `[ ]`   `isNodeModelConfig(v: unknown): v is NodeModelConfig`
    * `[ ]`   `isNodeTokenUsage(v: unknown): v is NodeTokenUsage`
    * `[ ]`   `isAiAdapterParams(v: unknown): v is AiAdapterParams`
    * `[ ]`   `isAiAdapterResult(v: unknown): v is AiAdapterResult`
    * `[ ]`   `isAiAdapter(v: unknown): v is AiAdapter`
    * `[ ]`   All guards reference `ai-adapter.interface.ts` types — shared across all adapter nodes

  * `[ ]`   `openai.test.ts`
    * `[ ]`   Mocks `openai` SDK stream: sequence of text delta chunks, then a usage chunk — asserts buffer assembles correctly
    * `[ ]`   Mocks stream with usage present: asserts `token_usage` is populated with correct counts
    * `[ ]`   Mocks stream with no usage: asserts `token_usage` is `null`
    * `[ ]`   Mocks stream that throws mid-iteration: asserts error propagates (not swallowed)
    * `[ ]`   Does NOT test finish_reason — EMCAS back-half's responsibility

  * `[ ]`   `construction`
    * `[ ]`   Factory: `createOpenAINodeAdapter(): AiAdapter`
    * `[ ]`   Stateless — no deps at construction; API key provided per-call in `params.apiKey`
    * `[ ]`   Test framework: Vitest (Node.js); test files use `describe` / `it` / `expect`
    * `[ ]`   Invalid construction context: none — pure factory, no side effects at construction

  * `[ ]`   `openai.ts`
    * `[ ]`   Exports `createOpenAINodeAdapter(): AiAdapter`
    * `[ ]`   Instantiates `OpenAI({ apiKey: params.apiKey })` per call
    * `[ ]`   Calls `client.chat.completions.create({ stream: true, model: params.modelConfig.model_identifier, max_tokens: params.modelConfig.max_tokens, messages: params.chatApiRequest.messages })`
    * `[ ]`   `for await` loop accumulates content deltas into `assembled_content: string`
    * `[ ]`   Extracts `token_usage` from stream usage event; maps to `NodeTokenUsage` or null
    * `[ ]`   Returns `AiAdapterResult` on stream close; throws on stream error

  * `[ ]`   `openai.mock.ts`
    * `[ ]`   `createMockOpenAINodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter`
    * `[ ]`   Default: resolves with `{ assembled_content: 'mock openai response', token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }`
    * `[ ]`   Error override: `stream` throws `new Error('mock openai stream error')`
    * `[ ]`   Conforms to `AiAdapter` interface; validated by `isAiAdapter` guard

  * `[ ]`   `openai.provides.ts`
    * `[ ]`   Exports: `createOpenAINodeAdapter`
    * `[ ]`   Re-exports shared interface types for consumers: `AiAdapter`, `AiAdapterParams`, `AiAdapterResult`, `NodeTokenUsage`, `NodeChatApiRequest`, `NodeModelConfig`
    * `[ ]`   Re-exports guards for consumers: `isAiAdapter`, `isAiAdapterParams`, `isAiAdapterResult`
    * `[ ]`   No external access to adapter internals bypasses this file

  * `[ ]`   `openai.integration.test.ts`
    * `[ ]`   Validates `createOpenAINodeAdapter()` result satisfies `isAiAdapter` at runtime
    * `[ ]`   Simulates workload dispatch: event with `api_identifier: 'openai-gpt-4o'` → adapter selected → `stream()` called with mock params → `AiAdapterResult` returned
    * `[ ]`   Uses mocked `openai` SDK — no live API calls

  * `[ ]`   `directionality`
    * `[ ]`   Layer: infra/adapter (Netlify-side Node.js)
    * `[ ]`   Deps inward: `openai` npm package (external boundary)
    * `[ ]`   Provides outward: `AiAdapter` and all shared Netlify types used by Anthropic adapter, Google adapter, and `ai-stream` workload
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   `stream()` with valid params returns `AiAdapterResult` with assembled content — proven by unit test
    * `[ ]`   `stream()` with OpenAI error throws — proven by unit test
    * `[ ]`   `token_usage` is null when OpenAI returns no usage — proven by unit test
    * `[ ]`   Adapter satisfies `AiAdapter` at runtime — proven by integration test guard check
    * `[ ]`   No Deno APIs present — proven by Node.js TypeScript build
Node 2:


* `[ ]`   `netlify/functions/ai-stream/adapters/anthropic/anthropic-adapter` **[BE] Anthropic Node.js streaming adapter for Netlify Async Workload**

  * `[ ]`   `objective`
    * `[ ]`   Provide a Node.js streaming adapter that calls the Anthropic Messages API, assembles the full response buffer, and returns `AiAdapterResult` — implementing the same `AiAdapter` contract as the OpenAI adapter
    * `[ ]`   Functional goals:
      * Accept `AiAdapterParams` and stream from Anthropic until completion
      * Map Anthropic's streaming event format to `assembled_content` and `NodeTokenUsage`
      * Return result to the ai-stream workload
    * `[ ]`   Non-functional constraints:
      * Node.js 18+ only — no Deno APIs
      * No Supabase access; no job state management; no finish_reason logic
      * Anthropic streaming differs from OpenAI: input tokens come from `message_start`, output tokens from `message_delta` — must handle both

  * `[ ]`   `role`
    * `[ ]`   Role: infra/adapter — wraps `@anthropic-ai/sdk` to satisfy `AiAdapter`
    * `[ ]`   Why appropriate: workload dispatches to this adapter for `anthropic-*` identifiers without owning Anthropic-specific streaming semantics
    * `[ ]`   Must NOT: interact with Supabase, manage job state, determine finish_reason, or call the back-half

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `netlify/functions/ai-stream/adapters` — same adapter layer as OpenAI
    * `[ ]`   Inside boundary: Anthropic stream invocation, event parsing, token usage extraction
    * `[ ]`   Outside boundary: job state, DB, finish_reason, HTTP callback

  * `[ ]`   `deps`
    * `[ ]`   `@anthropic-ai/sdk` npm package — external, provides streaming Messages API
    * `[ ]`   `ai-adapter.interface.ts` — defined in OpenAI adapter node; consumed here (no changes required unless contract expands)
    * `[ ]`   Guards from `openai.guard.ts` — shared; imported, not redefined
    * `[ ]`   No reverse deps

  * `[ ]`   `context_slice`
    * `[ ]`   Receives `AiAdapterParams` — same shape as OpenAI adapter
    * `[ ]`   Returns `AiAdapterResult` — same shape
    * `[ ]`   No over-fetching

  * `[ ]`   `anthropic.interface.test.ts`
    * `[ ]`   Verifies `AiAdapter` contract from OpenAI node applies to Anthropic adapter without modification
    * `[ ]`   Anthropic-specific: confirms token usage mapping from `message_start` (input) + `message_delta` (output) events → `NodeTokenUsage`
    * `[ ]`   Invalid: stream event missing `input_tokens` → `token_usage` is null (not an error)

  * `[ ]`   `anthropic.interaction.spec`
    * `[ ]`   Called by `ai-stream` workload when `api_identifier` prefix matches `anthropic-`
    * `[ ]`   Calls `anthropic.messages.stream({ model, max_tokens, messages, system? })`
    * `[ ]`   Listens to stream events: `text` events accumulate into buffer; `message_start` captures `input_tokens`; `message_delta` captures `output_tokens`
    * `[ ]`   On stream end: constructs `NodeTokenUsage` from captured counts (null if neither event fired)
    * `[ ]`   On stream error: throws

  * `[ ]`   `anthropic.guard.test.ts`
    * `[ ]`   Verifies shared guards (`isAiAdapterParams`, `isAiAdapterResult`) apply correctly to Anthropic adapter inputs/outputs
    * `[ ]`   No new guards required — shared guards from OpenAI node cover all types

  * `[ ]`   `anthropic.test.ts`
    * `[ ]`   Mocks `@anthropic-ai/sdk` stream events: `message_start` with `input_tokens`, `text` deltas, `message_delta` with `output_tokens` — asserts buffer and token_usage correct
    * `[ ]`   Mocks stream with no usage events: asserts `token_usage` is null
    * `[ ]`   Mocks stream error: asserts throws propagates
    * `[ ]`   Does NOT test finish_reason

  * `[ ]`   `construction`
    * `[ ]`   Factory: `createAnthropicNodeAdapter(): AiAdapter`
    * `[ ]`   Stateless — API key provided per-call

  * `[ ]`   `anthropic.ts`
    * `[ ]`   Exports `createAnthropicNodeAdapter(): AiAdapter`
    * `[ ]`   Uses `@anthropic-ai/sdk` `messages.stream()`
    * `[ ]`   Accumulates text from stream `text` events
    * `[ ]`   Captures input tokens from `message_start`, output tokens from `message_delta`
    * `[ ]`   Returns `AiAdapterResult`; throws on error

  * `[ ]`   `anthropic.mock.ts`
    * `[ ]`   `createMockAnthropicNodeAdapter(overrides?)`: satisfies `AiAdapter`
    * `[ ]`   Default: resolves with `{ assembled_content: 'mock anthropic response', token_usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 } }`
    * `[ ]`   Error override supported

  * `[ ]`   `anthropic.provides.ts`
    * `[ ]`   Exports: `createAnthropicNodeAdapter`
    * `[ ]`   No external access bypasses this file

  * `[ ]`   `anthropic.integration.test.ts`
    * `[ ]`   Validates `createAnthropicNodeAdapter()` satisfies `isAiAdapter` at runtime
    * `[ ]`   Simulates dispatch: `api_identifier: 'anthropic-claude-3-5-sonnet'` → adapter selected → `stream()` → result returned
    * `[ ]`   Mocked SDK — no live calls

  * `[ ]`   `directionality`
    * `[ ]`   Layer: infra/adapter (Netlify-side Node.js)
    * `[ ]`   Deps inward: `@anthropic-ai/sdk`, shared interface from OpenAI adapter node
    * `[ ]`   Provides outward: `createAnthropicNodeAdapter` to `ai-stream` workload
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   `stream()` with valid params returns `AiAdapterResult` — proven by unit test
    * `[ ]`   Token usage correctly aggregated from Anthropic event model — proven by unit test
    * `[ ]`   Satisfies `isAiAdapter` at runtime — proven by integration test
Node 3:


* `[ ]`   `netlify/functions/ai-stream/adapters/google/google-adapter` **[BE] Google Gemini Node.js streaming adapter for Netlify Async Workload**

  * `[ ]`   `objective`
    * `[ ]`   Provide a Node.js streaming adapter that calls the Google Gemini API, assembles the full response buffer, and returns `AiAdapterResult` — implementing the same `AiAdapter` contract
    * `[ ]`   Functional goals:
      * Accept `AiAdapterParams` and stream from Gemini until completion
      * Map Google's `generateContentStream` response to `assembled_content` and `NodeTokenUsage`
    * `[ ]`   Non-functional constraints:
      * Node.js 18+ only; no Deno APIs
      * Google's token usage is in `usageMetadata` on the final chunk — must extract correctly
      * `promptTokenCount` maps to `prompt_tokens`; `candidatesTokenCount` maps to `completion_tokens`

  * `[ ]`   `role`
    * `[ ]`   Role: infra/adapter — wraps `@google/generative-ai` to satisfy `AiAdapter`
    * `[ ]`   Why appropriate: workload dispatches here for `google-*` identifiers
    * `[ ]`   Must NOT: interact with Supabase, manage job state, determine finish_reason, call back-half

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `netlify/functions/ai-stream/adapters` — same adapter layer
    * `[ ]`   Inside boundary: Gemini stream invocation, text accumulation, usageMetadata extraction
    * `[ ]`   Outside boundary: job state, DB, finish_reason, HTTP callback

  * `[ ]`   `deps`
    * `[ ]`   `@google/generative-ai` npm package — external, provides streaming generative API
    * `[ ]`   `ai-adapter.interface.ts` — from OpenAI node; consumed here, no changes
    * `[ ]`   Shared guards from OpenAI node — imported, not redefined
    * `[ ]`   No reverse deps

  * `[ ]`   `context_slice`
    * `[ ]`   Receives `AiAdapterParams` — same contract
    * `[ ]`   Returns `AiAdapterResult` — same contract

  * `[ ]`   `google.interface.test.ts`
    * `[ ]`   Confirms `AiAdapter` contract applies without modification
    * `[ ]`   Google-specific: `usageMetadata.promptTokenCount` + `candidatesTokenCount` maps to `NodeTokenUsage`
    * `[ ]`   Missing `usageMetadata` → `token_usage` is null (not an error)

  * `[ ]`   `google.interaction.spec`
    * `[ ]`   Called by `ai-stream` workload when `api_identifier` prefix matches `google-`
    * `[ ]`   Initializes `GoogleGenerativeAI({ apiKey })`, gets model via `getGenerativeModel({ model })`
    * `[ ]`   Calls `model.generateContentStream({ contents })` — iterates response stream
    * `[ ]`   Accumulates text from each chunk's `text()` output
    * `[ ]`   Extracts `usageMetadata` from final chunk for token counts
    * `[ ]`   On stream error: throws

  * `[ ]`   `google.guard.test.ts`
    * `[ ]`   Shared guards apply — no new guards; verify correct behavior on Google-shaped inputs

  * `[ ]`   `google.test.ts`
    * `[ ]`   Mocks `@google/generative-ai` stream: chunks with `text()` returning strings, final chunk with `usageMetadata`
    * `[ ]`   Asserts buffer assembled from all text chunks
    * `[ ]`   Asserts `token_usage` mapped from `usageMetadata` correctly
    * `[ ]`   Missing `usageMetadata`: asserts `token_usage` is null
    * `[ ]`   Stream error: asserts throws

  * `[ ]`   `construction`
    * `[ ]`   Factory: `createGoogleNodeAdapter(): AiAdapter`
    * `[ ]`   Stateless — model name and API key provided per-call

  * `[ ]`   `google.ts`
    * `[ ]`   Exports `createGoogleNodeAdapter(): AiAdapter`
    * `[ ]`   Initializes `GoogleGenerativeAI` per call with `params.apiKey`
    * `[ ]`   Calls `generateContentStream` with mapped message contents
    * `[ ]`   Accumulates text, extracts usageMetadata for token counts
    * `[ ]`   Returns `AiAdapterResult`; throws on error

  * `[ ]`   `google.mock.ts`
    * `[ ]`   `createMockGoogleNodeAdapter(overrides?)`: satisfies `AiAdapter`
    * `[ ]`   Default: resolves with `{ assembled_content: 'mock google response', token_usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 } }`

  * `[ ]`   `google.provides.ts`
    * `[ ]`   Exports: `createGoogleNodeAdapter`

  * `[ ]`   `google.integration.test.ts`
    * `[ ]`   Validates `createGoogleNodeAdapter()` satisfies `isAiAdapter` at runtime
    * `[ ]`   Simulates dispatch: `api_identifier: 'google-gemini-2-5-pro'` → adapter selected → `stream()` → result returned

  * `[ ]`   `directionality`
    * `[ ]`   Layer: infra/adapter (Netlify-side Node.js)
    * `[ ]`   Deps inward: `@google/generative-ai`, shared interface from OpenAI node
    * `[ ]`   Provides outward: `createGoogleNodeAdapter` to `ai-stream` workload
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   `stream()` returns correct `AiAdapterResult` for Gemini — proven by unit test
    * `[ ]`   Satisfies `isAiAdapter` at runtime — proven by integration test
Node 4:


* `[ ]`   `netlify/functions/ai-stream/ai-stream` **[BE] Netlify Async Workload — AI streaming orchestrator**

  * `[ ]`   `objective`
    * `[ ]`   Receive a dialectic stream event from the queue, dispatch to the correct provider adapter, stream the AI response, and POST the assembled result to the EMCAS back-half Edge Function — with no Supabase database access, no finish_reason speculation, and full Netlify retry semantics
    * `[ ]`   Functional goals:
      * Validate the incoming event payload
      * Select the correct `AiAdapter` by `api_identifier` prefix
      * Read provider API key from Netlify env vars
      * Call adapter `stream()` and receive `{ assembled_content, token_usage }`
      * POST `{ job_id, assembled_content, token_usage }` to the back-half URL with `Authorization: Bearer <user_jwt>`
      * Return success; on POST failure let Netlify retry the transmission
    * `[ ]`   Non-functional constraints:
      * Event payload ≤ 500 KB (Netlify limit) — enforced by front-half at enqueue time
      * No Supabase access — workload does not read or write DB
      * No finish_reason in POST body — back-half examines blob locally

  * `[ ]`   `role`
    * `[ ]`   Role: app/orchestrator (Netlify Async Workload handler)
    * `[ ]`   Why appropriate: only this layer has the Netlify runtime context (`AsyncWorkloadEvent`) and bridges the AI provider adapters to the Supabase back-half
    * `[ ]`   Must NOT: access Supabase, modify job state, classify finish_reason, send notifications, or implement streaming logic directly

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `netlify/functions/ai-stream` — Netlify-side async workload
    * `[ ]`   Inside boundary: event validation, adapter dispatch, back-half HTTP POST
    * `[ ]`   Outside boundary: AI streaming internals (in adapters), job state (in Supabase), post-processing (in EMCAS back-half)

  * `[ ]`   `deps`
    * `[ ]`   `createOpenAINodeAdapter` — from OpenAI adapter node; dispatched for `openai-*`
    * `[ ]`   `createAnthropicNodeAdapter` — from Anthropic adapter node; dispatched for `anthropic-*`
    * `[ ]`   `createGoogleNodeAdapter` — from Google adapter node; dispatched for `google-*`
    * `[ ]`   `@netlify/async-workloads` npm package — provides `asyncWorkloadFn`, `AsyncWorkloadEvent`
    * `[ ]`   `node:https` / `fetch` — for HTTP POST to back-half
    * `[ ]`   Env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DIALECTIC_SAVERESPONSE_URL`
    * `[ ]`   No reverse deps; no Supabase client

  * `[ ]`   `context_slice`
    * `[ ]`   From event: `{ job_id: string, api_identifier: string, extended_model_config: NodeModelConfig, chat_api_request: NodeChatApiRequest, user_jwt: string }`
    * `[ ]`   To adapters: `AiAdapterParams`
    * `[ ]`   To back-half: `{ job_id, assembled_content, token_usage }` with `Authorization: Bearer <user_jwt>` header
    * `[ ]`   No over-fetching

  * `[ ]`   `ai-stream.interface.test.ts`
    * `[ ]`   Valid `AiStreamEvent`: all required fields present and typed correctly
    * `[ ]`   Valid `AiStreamPayload`: `job_id`, `assembled_content`, `token_usage` (nullable)
    * `[ ]`   Invalid: missing `job_id`, missing `user_jwt`, empty `api_identifier`, unknown `api_identifier` prefix → guard rejects
    * `[ ]`   `api_identifier` dispatch: `openai-*`, `anthropic-*`, `google-*` → resolves; anything else → error

  * `[ ]`   `ai-stream.interface.ts`
    * `[ ]`   `AiStreamEvent`: `{ job_id: string; api_identifier: string; extended_model_config: NodeModelConfig; chat_api_request: NodeChatApiRequest; user_jwt: string }`
    * `[ ]`   `AiStreamPayload`: `{ job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null }`
    * `[ ]`   `AiStreamDeps`: `{ openaiAdapter: AiAdapter; anthropicAdapter: AiAdapter; googleAdapter: AiAdapter; Url: string; getApiKey(apiIdentifier: string): string }`

  * `[ ]`   `ai-stream.interaction.spec`
    * `[ ]`   Netlify queue delivers event; workload receives it via `asyncWorkloadFn` handler
    * `[ ]`   Workload validates event shape via guard; invalid event → `ErrorDoNotRetry` thrown (malformed event cannot be fixed by retry)
    * `[ ]`   Dispatches to adapter by `api_identifier` prefix; unknown prefix → `ErrorDoNotRetry`
    * `[ ]`   Calls `adapter.stream(params)` — on error, throws (Netlify retries the model call)
    * `[ ]`   On stream success: POSTs `AiStreamPayload` to `DIALECTIC_SAVERESPONSE_URL` with JWT header
    * `[ ]`   POST success (2xx): workload completes successfully
    * `[ ]`   POST failure (non-2xx or network error): throws (Netlify retries the POST, not the model call — step boundary)
    * `[ ]`   Two distinct retry points via `event.step.run`: step-1 wraps adapter call; step-2 wraps back-half POST

  * `[ ]`   `ai-stream.guard.test.ts`
    * `[ ]`   `isAiStreamEvent`: valid, rejects missing fields, rejects unknown prefix
    * `[ ]`   `isAiStreamPayload`: valid, rejects missing `job_id`, accepts null `token_usage`
    * `[ ]`   `isAiStreamDeps`: valid, rejects missing adapters or missing `saveResponseUrl`

  * `[ ]`   `ai-stream.guard.ts`
    * `[ ]`   `isAiStreamEvent(v: unknown): v is AiStreamEvent`
    * `[ ]`   `isAiStreamPayload(v: unknown): v is AiStreamPayload`
    * `[ ]`   `isAiStreamDeps(v: unknown): v is AiStreamDeps`

  * `[ ]`   `ai-stream.test.ts`
    * `[ ]`   Invalid event → `ErrorDoNotRetry` thrown, no adapter called
    * `[ ]`   Unknown `api_identifier` prefix → `ErrorDoNotRetry` thrown
    * `[ ]`   Valid event, `openai-*` → OpenAI mock adapter called; result POSTed to back-half
    * `[ ]`   Valid event, `anthropic-*` → Anthropic mock adapter called
    * `[ ]`   Valid event, `google-*` → Google mock adapter called
    * `[ ]`   Adapter stream error → throws (Netlify retries step-1)
    * `[ ]`   Adapter success, back-half POST returns 4xx → throws (Netlify retries step-2)
    * `[ ]`   Full happy path: adapter returns result → POST body matches `AiStreamPayload` → JWT header present

  * `[ ]`   `construction`
    * `[ ]`   `createAiStreamDeps(): AiStreamDeps` — reads env vars, instantiates adapters
    * `[ ]`   Wired at module load; `asyncWorkloadFn` receives `event: AsyncWorkloadEvent<AiStreamEvent>`
    * `[ ]`   `asyncWorkloadConfig` exports event name `'ai-stream'`, `maxRetries: 4`

  * `[ ]`   `ai-stream.ts`
    * `[ ]`   Exports default `asyncWorkloadFn` handler and `asyncWorkloadConfig`
    * `[ ]`   Validates event data via `isAiStreamEvent` — `ErrorDoNotRetry` on failure
    * `[ ]`   Dispatches adapter by prefix
    * `[ ]`   `step.run('stream-ai', ...)` wraps adapter call
    * `[ ]`   `step.run('post-', ...)` wraps HTTP POST with JWT header
    * `[ ]`   Throws on POST non-2xx

  * `[ ]`   `ai-stream.mock.ts`
    * `[ ]`   `createMockAiStreamDeps(overrides?)`: returns controllable `AiStreamDeps`
    * `[ ]`   Default: all three adapters are mocks; `SaveResponseUrl` is `'http://localhost/mock-saveResponse'`; `getApiKey` returns `'mock-key'`

  * `[ ]`   `ai-stream.provides.ts`
    * `[ ]`   Exports: workload handler (default), `asyncWorkloadConfig`, `createAiStreamDeps`

  * `[ ]`   `ai-stream.integration.test.ts`
    * `[ ]`   Full chain: mock event → workload → mock OpenAI adapter → mock back-half POST server → asserts POST body and headers
    * `[ ]`   Retry semantics: step-1 failure retries without re-entering step-2; step-2 failure does not re-invoke adapter
    * `[ ]`   Uses mocked adapters and mocked HTTP server — no live calls

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/orchestrator (Netlify runtime)
    * `[ ]`   Deps inward: three adapter nodes, `@netlify/async-workloads`, env vars
    * `[ ]`   Provides outward: `ai-stream` event handler consumed by Netlify queue
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   Invalid event never retried — `ErrorDoNotRetry` — proven by unit test
    * `[ ]`   Adapter stream error causes Netlify step-1 retry — proven by unit test
    * `[ ]`   Back-half POST failure causes Netlify step-2 retry without re-calling adapter — proven by integration test
    * `[ ]`   JWT forwarded correctly in Authorization header — proven by unit test
    * `[ ]`   No Supabase access in workload — provable by static analysis (no `@supabase/supabase-js` import in this file)
Node 5:


* `[ ]`   `dialectic-worker/saveResponse/saveResponse` **[BE] EMCAS back-half — post-stream processing, contribution save, token debit, and job completion**

  * `[ ]`   `objective`
    * `[ ]`   Receive the assembled AI response blob from the Netlify workload via HTTP POST, fetch the corresponding job from DB by `job_id`, execute all post-stream processing (finish_reason detection, JSON sanitization, storage upload, contribution save, token debit, continuation dispatch), and update job status from `queued` to the correct terminal or continuation state
    * `[ ]`   Functional goals:
      * Accept and validate `{ job_id, assembled_content, token_usage }` from Netlify with valid user JWT
      * Fetch full job row and derived context from Supabase
      * Execute all logic currently in EMCAS after the `for await` stream loop
      * Update job status to `completed`, `needs_continuation`, `continuation_limit_reached`, or `failed`
    * `[ ]`   Non-functional constraints:
      * Runs in Deno (Supabase Edge Function) — same runtime as existing EMCAS
      * Authenticated via user JWT forwarded from Netlify (validated by Supabase Edge JWT gate)
      * Must complete within Supabase Edge Function limit — post-stream work is fast relative to streaming
      * `execute_completed` notification (previously in processSimpleJob) moves here since completion is now confirmed at this point

  * `[ ]`   `role`
    * `[ ]`   Role: app/domain (Supabase Edge Function handler)
    * `[ ]`   Why appropriate: all post-stream logic requires Supabase access, Deno utilities, and existing shared deps — keeping it in Deno avoids porting the entire shared library to Node.js
    * `[ ]`   Must NOT: invoke the AI provider, receive a stream, set job status to `queued`, or call the Netlify workload

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker/executeModelCallAndSave` — post-stream processing half of EMCAS
    * `[ ]`   Inside boundary: finish_reason resolution, JSON sanitization, storage upload, contribution persistence, token debit, continuation dispatch, job status update, `execute_completed` notification
    * `[ ]`   Outside boundary: AI streaming (Netlify), job queuing (front-half), prompt assembly (prepareModelJob)

  * `[ ]`   `deps`
    * `[ ]`   All deps currently used by EMCAS post-stream: `resolveFinishReason`, `retryJob`, `continueJob`, `debitTokens`, `assembleAndSaveFinalDocument`, `notificationService`, `fileManager`, `sanitizeJsonContent`, `logger`
    * `[ ]`   `SupabaseClient<Database>` — constructed from JWT in request headers
    * `[ ]`   `dialectic-worker/index.ts` — registers the new HTTP route for this function (wiring step, separate file touch; one file per turn during execution)
    * `[ ]`   Existing type guards, interfaces, and helpers remain in Deno — no porting required

  * `[ ]`   `context_slice`
    * `[ ]`   HTTP POST body: `{ job_id: string, assembled_content: string, token_usage: NodeTokenUsage | null }`
    * `[ ]`   HTTP header: `Authorization: Bearer <user_jwt>`
    * `[ ]`   Fetches from DB: full job row, provider row, session data, project owner user ID
    * `[ ]`   Does NOT receive `finish_reason` — determines it locally from `assembled_content`

  * `[ ]`   `saveResponse.interface.test.ts`
    * `[ ]`   Valid `SaveResponseRequestBody`: non-empty `job_id`, non-empty `assembled_content`, `token_usage` is `NodeTokenUsage` or null
    * `[ ]`   Invalid: missing `job_id`, missing `assembled_content`, wrong type for `token_usage` → guard rejects
    * `[ ]`   Valid `SaveResponseSuccessReturn`: `{ status: 'completed' | 'needs_continuation' | 'continuation_limit_reached' }`
    * `[ ]`   Valid `SaveResponseErrorReturn`: `{ error: Error; retriable: boolean }`

  * `[ ]`   `saveResponse.interface.ts`
    * `[ ]`   `SaveResponseRequestBody`: `{ job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null }`
    * `[ ]`   `NodeTokenUsage` imported from shared Netlify adapter interface (or re-declared locally as identical shape to avoid cross-runtime import)
    * `[ ]`   `SaveResponseSuccessReturn`: `{ status: 'completed' | 'needs_continuation' | 'continuation_limit_reached' }`
    * `[ ]`   `SaveResponseErrorReturn`: `{ error: Error; retriable: boolean }`
    * `[ ]`   `SaveResponseReturn`: `SaveResponseSuccessReturn | SaveResponseErrorReturn`
    * `[ ]`   `saveResponseDeps`: carries all existing EMCAS post-stream deps

  * `[ ]`   `saveResponse.interaction.spec`
    * `[ ]`   Receives HTTP POST from Netlify workload with JWT; Supabase Edge validates JWT at gateway
    * `[ ]`   Parses and validates `SaveResponseRequestBody` — invalid → 400, no DB access
    * `[ ]`   Fetches job row by `job_id`; job not found → 404
    * `[ ]`   Executes full post-stream logic (finish_reason, sanitize, parse, upload, save, debit)
    * `[ ]`   Calls `retryJob` on retriable failure; updates job status accordingly
    * `[ ]`   Calls `continueJob` when continuation required; job status → `needs_continuation`
    * `[ ]`   Sends `execute_completed` notification on terminal success (moved from processSimpleJob)
    * `[ ]`   Updates job status from `queued` to terminal state
    * `[ ]`   Returns 200 on success; 500 on unretriable failure; 503 on retriable failure (Netlify retries POST on non-2xx)

  * `[ ]`   `saveResponse.guard.test.ts`
    * `[ ]`   `isSaveResponseRequestBody`: valid; rejects missing fields; rejects wrong types
    * `[ ]`   `isSaveResponseSuccessReturn`: valid; rejects unknown status values
    * `[ ]`   `isSaveResponseErrorReturn`: valid; requires `retriable` boolean

  * `[ ]`   `saveResponse.guard.ts`
    * `[ ]`   `isSaveResponseRequestBody(v: unknown): v is SaveResponseRequestBody`
    * `[ ]`   `isSaveResponseSuccessReturn(v: unknown): v is SaveResponseSuccessReturn`
    * `[ ]`   `isSaveResponseErrorReturn(v: unknown): v is SaveResponseErrorReturn`

  * `[ ]`   `saveResponse.test.ts`
    * `[ ]`   Invalid body → 400, no DB calls
    * `[ ]`   Job not found → 404
    * `[ ]`   Valid body, happy path: finish_reason resolved, sanitization clean, upload succeeds, contribution saved, tokens debited, status → `completed`, `execute_completed` notification sent, 200
    * `[ ]`   Intermediate chunk (continuation): status → `needs_continuation`, `continueJob` called, no final document assembly
    * `[ ]`   Malformed JSON in content after sanitization: `retryJob` called, 503
    * `[ ]`   Error finish_reason: `retryJob` called, 503
    * `[ ]`   Token debit failure: retriable error path
    * `[ ]`   Does NOT test streaming — blob is already assembled on arrival

  * `[ ]`   `construction`
    * `[ ]`   Handler constructed at Edge Function request boundary; `saveResponseDeps` wired from existing `createDialecticWorkerDeps` where shared, plus new back-half-specific wiring
    * `[ ]`   `dialectic-worker/index.ts` wiring: add route matching `POST /execute-model-call-and-save-back-half` → `saveResponse` handler (separate file, one-file-per-turn)

  * `[ ]`   `saveResponse.ts`
    * `[ ]`   Exports `saveResponse(deps, params, payload): Promise<SaveResponseReturn>`
    * `[ ]`   Validates `SaveResponseRequestBody` via guard
    * `[ ]`   Fetches job row, provider row, session, project owner from Supabase
    * `[ ]`   Runs all post-stream logic extracted from existing EMCAS (finish_reason → sanitize → parse → upload → save → debit → continue or complete)
    * `[ ]`   Sends `execute_completed` notification on terminal success
    * `[ ]`   Updates job status from `queued` to outcome

  * `[ ]`   `saveResponse.mock.ts`
    * `[ ]`   `createMockSaveResponseDeps(overrides?)`: controllable `saveResponseDeps`
    * `[ ]`   Mirrors the existing `executeModelCallAndSave.mock.ts` pattern for shared deps

  * `[ ]`   `saveResponse.provides.ts`
    * `[ ]`   Exports: `saveResponse`, `saveResponseDeps`, `SaveResponseReturn`

  * `[ ]`   `saveResponse.integration.test.ts`
    * `[ ]`   Chain: mock Netlify POST → back-half → mock Supabase → mock retryJob/continueJob → asserts job status updated, notification sent
    * `[ ]`   Verifies `execute_completed` notification fires on terminal success (was processSimpleJob's responsibility)

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/domain (Supabase Edge, Deno)
    * `[ ]`   Deps inward: existing shared Deno utilities, Supabase client, notification service
    * `[ ]`   Provides outward: HTTP 200/4xx/5xx response to Netlify workload; job status updates to DB; notifications to users
    * `[ ]`   No cycles; does not call front-half or Netlify

  * `[ ]`   `requirements`
    * `[ ]`   Invalid POST body → 400 without DB access — proven by unit test
    * `[ ]`   Job status transitions from `queued` to correct terminal state — proven by unit test
    * `[ ]`   `execute_completed` notification fires on success — proven by unit test (moved from processSimpleJob)
    * `[ ]`   Non-2xx response on retriable failure causes Netlify to retry POST — proven by interaction spec + integration test
Node 6:


* `[ ]`   `dialectic-worker/enqueueModelCall/enqueueModelCall` **[BE] EMCAS front-half — pre-call validation, job queuing, and Netlify event dispatch**

  * `[ ]`   `objective`
    * `[ ]`   Execute all pre-stream logic from the existing EMCAS (validation, adapter config resolution, API key lookup, preflight token accounting), write job status to `queued`, enqueue a `ai-stream` event to Netlify Async Workloads, await queue ACK, and return — without waiting for stream completion
    * `[ ]`   Functional goals:
      * Validate all params and payload (output_type, model config, adapter resolvability)
      * Resolve the provider API key
      * Write job status → `queued` in `dialectic_generation_jobs`
      * Serialize and enqueue the Netlify event with `{ job_id, api_identifier, extended_model_config, chat_api_request, user_jwt }`
      * Await queue ACK; return success or error to caller (prepareModelJob)
    * `[ ]`   Non-functional constraints:
      * Must NOT initiate the AI stream — stream is Netlify's responsibility
      * Must NOT await stream completion — returns after ACK only
      * Event payload must not exceed 500 KB (Netlify limit)
      * Runs in Deno (Supabase Edge) — same runtime as existing EMCAS

  * `[ ]`   `role`
    * `[ ]`   Role: app/port — bridges the Deno call chain to the Netlify async queue
    * `[ ]`   Why appropriate: validation, config resolution, and event serialization require the Deno shared library; the stream itself does not
    * `[ ]`   Must NOT: perform the AI call, assemble the buffer, save contributions, debit tokens, or update job status beyond `queued`

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker/executeModelCallAndSave` — pre-stream dispatch half of EMCAS
    * `[ ]`   Inside boundary: param validation, model config validation, adapter key resolution, status write to `queued`, Netlify event enqueue
    * `[ ]`   Outside boundary: AI streaming (Netlify), post-stream processing (back-half), prompt assembly (prepareModelJob)

  * `[ ]`   `deps`
    * `[ ]`   `SupabaseClient<Database>` — for writing `queued` status to `dialectic_generation_jobs`
    * `[ ]`   `AsyncWorkloadsClient` from `@netlify/async-workloads` — Node.js client called from Deno via HTTP or compatible bridge; enqueues `ai-stream` event
    * `[ ]`   `isAiModelExtendedConfig`, `isModelContributionFileType` — existing type guards
    * `[ ]`   `apiKeyForProvider` — existing helper (extracted from current EMCAS, or inlined here)
    * `[ ]`   `logger` — injected dep
    * `[ ]`   `NETLIFY_ASYNC_WORKLOADS_TOKEN` env var — for authenticating with Netlify queue API

  * `[ ]`   `context_slice`
    * `[ ]`   Receives: all existing `ExecuteModelCallAndSaveParams` and `ExecuteModelCallAndSavePayload` as `EnqueueModelCall*` (unchanged shape)
    * `[ ]`   Returns: `EnqueueModelCallSuccessReturn` (`{ queued: true }`) or `EnqueueModelCallErrorReturn` (`{ error: Error; retriable: boolean }`)
    * `[ ]`   Writes: `{ status: 'queued' }` to `dialectic_generation_jobs` before enqueue
    * `[ ]`   Emits: `AiStreamEvent` to Netlify queue

  * `[ ]`   `enqueueModelCall.interface.test.ts`
    * `[ ]`   Valid `EnqueueModelCallSuccessReturn`: `{ queued: true }`
    * `[ ]`   Valid `EnqueueModelCallErrorReturn`: `{ error: Error; retriable: boolean }`
    * `[ ]`   Invalid: `queued: false` → guard rejects; missing `error` field → guard rejects
    * `[ ]`   `BoundEnqueueModelCallFn`: callable with `(params, payload) => Promise<Return>`

  * `[ ]`   `enqueueModelCall.interface.ts`
    * `[ ]`   `EnqueueModelCallSuccessReturn`: `{ queued: true }`
    * `[ ]`   `EnqueueModelCallErrorReturn`: `{ error: Error; retriable: boolean }`
    * `[ ]`   `EnqueueModelCallReturn`: union of above
    * `[ ]`   `EnqueueModelCallDeps`: `{ logger: ILogger; enqueueNetlifyEvent(eventName: string, data: AiStreamEvent): Promise<void>; }`
    * `[ ]`   `BoundEnqueueModelCallFn`: pre-bound signature used as dep in `PrepareModelJobDeps`
    * `[ ]`   Re-uses existing `EnqueueModelCallParams` and `EnqueueModelCallPayload` — no change to those types

  * `[ ]`   `enqueueModelCall.interaction.spec`
    * `[ ]`   Called by `prepareModelJob` as `deps.enqueueModelCall` (now bound to front-half)
    * `[ ]`   Validates `output_type` via `isModelContributionFileType`; invalid → `{ error, retriable: false }`
    * `[ ]`   Validates `providerRow.config` via `isAiModelExtendedConfig`; invalid → `{ error, retriable: false }`
    * `[ ]`   Resolves API key via `apiKeyForProvider`; key missing → `{ error, retriable: false }`
    * `[ ]`   Writes `{ status: 'queued' }` to `dialectic_generation_jobs` via DB client
    * `[ ]`   Constructs `AiStreamEvent` and calls `deps.enqueueNetlifyEvent('ai-stream', event)`
    * `[ ]`   On enqueue ACK: returns `{ queued: true }`
    * `[ ]`   On enqueue failure: returns `{ error, retriable: true }`
    * `[ ]`   Does NOT call the AI provider or await stream result

  * `[ ]`   `enqueueModelCall.guard.test.ts`
    * `[ ]`   `isEnqueueModelCallSuccessReturn`: accepts `{ queued: true }`; rejects `{ queued: false }`, rejects missing field
    * `[ ]`   `isEnqueueModelCallErrorReturn`: accepts valid; rejects missing `retriable`

  * `[ ]`   `enqueueModelCall.guard.ts`
    * `[ ]`   `isEnqueueModelCallSuccessReturn(v: unknown): v is EnqueueModelCallSuccessReturn`
    * `[ ]`   `isEnqueueModelCallErrorReturn(v: unknown): v is EnqueueModelCallErrorReturn`

  * `[ ]`   `enqueueModelCall.test.ts`
    * `[ ]`   Invalid `output_type` → error return, no DB write, no enqueue
    * `[ ]`   Invalid model config → error return
    * `[ ]`   Missing API key → error return
    * `[ ]`   Valid inputs → DB status written to `queued`, event enqueued, returns `{ queued: true }`
    * `[ ]`   Enqueue failure → returns `{ error, retriable: true }`
    * `[ ]`   Asserts `enqueueNetlifyEvent` called exactly once on happy path with correct `AiStreamEvent` shape (including `user_jwt` and `chat_api_request`)
    * `[ ]`   Asserts no AI provider call is made

  * `[ ]`   `construction`
    * `[ ]`   `createEnqueueNetlifyEvent(token: string, siteId: string): (eventName: string, data: AiStreamEvent) => Promise<void>`
    * `[ ]`   Constructed at Edge Function boundary; injected into `EnqueueModelCallDeps`

  * `[ ]`   `enqueueModelCall.ts`
    * `[ ]`   Exports `enqueueModelCall(deps, params, payload): Promise<EnqueueModelCallReturn>`
    * `[ ]`   Validates `output_type`, model config, API key
    * `[ ]`   Writes `queued` status to DB
    * `[ ]`   Constructs `AiStreamEvent` from params, payload, and resolved config
    * `[ ]`   Calls `deps.enqueueNetlifyEvent` and awaits ACK
    * `[ ]`   Returns `{ queued: true }` on success; `{ error, retriable }` on failure

  * `[ ]`   `enqueueModelCall.mock.ts`
    * `[ ]`   `createMockEnqueueModelCallDeps(overrides?)`: controllable `EnqueueModelCallDeps`
    * `[ ]`   Default: `enqueueNetlifyEvent` resolves immediately
    * `[ ]`   Error override: `enqueueNetlifyEvent` throws

  * `[ ]`   `enqueueModelCall.provides.ts`
    * `[ ]`   Exports: `enqueueModelCall`, `BoundEnqueueModelCallFn`, return types, guards

  * `[ ]`   `enqueueModelCall.integration.test.ts`
    * `[ ]`   Chain: `prepareModelJob` (mock) calls front-half → front-half writes DB status → enqueues event → returns `{ queued: true }` → prepareModelJob receives and passes through
    * `[ ]`   Asserts DB write precedes enqueue
    * `[ ]`   Uses mock DB client and mock Netlify enqueue

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/port (Deno, Supabase Edge)
    * `[ ]`   Deps inward: existing Deno shared utilities, Supabase client, Netlify queue HTTP client
    * `[ ]`   Provides outward: `BoundEnqueueModelCallFn` consumed by `prepareModelJob`; `queued` status and `AiStreamEvent` emitted to external systems
    * `[ ]`   No cycles; does not call back-half or Netlify adapters

  * `[ ]`   `requirements`
    * `[ ]`   Validation failures return error without DB write or enqueue — proven by unit test
    * `[ ]`   DB status written to `queued` before enqueue — proven by unit test call order assertion
    * `[ ]`   `AiStreamEvent` contains correct `user_jwt` — proven by unit test
    * `[ ]`   Returns `{ queued: true }` on ACK — proven by unit test
    * `[ ]`   Enqueue failure returns retriable error — proven by unit test
Node 7:


* `[ ]`   `dialectic-worker/prepareModelJob/prepareModelJob` **[BE] Update prepareModelJob — swap EMCAS dep to front-half, adapt return handling for queued result**

  * `[ ]`   `objective`
    * `[ ]`   Replace the `executeModelCallAndSave` dep (full EMCAS) with `enqueueModelCall`, update result handling so `{ queued: true }` is a valid success path, and update `PrepareModelJobSuccessReturn` to reflect that `contribution`, `needsContinuation`, and `renderJobId` are no longer available at this point in the call chain
    * `[ ]`   Functional goals:
      * `PrepareModelJobDeps.enqueueModelCall` type changes to `BoundEnqueueModelCallFn`
      * On `{ queued: true }` from front-half: return `PrepareModelJobSuccessReturn` with queued-appropriate shape
      * On front-half error: propagate as `PrepareModelJobErrorReturn` (unchanged behavior)
      * `enqueueRenderJob` call (if any) that depended on the contribution result must be removed or deferred — no contribution exists at this stage
    * `[ ]`   Non-functional constraints:
      * All existing validation logic (Zones A–D) in prepareModelJob remains unchanged
      * Only the EMCAS call site and result handling change
      * No changes to `PrepareModelJobParams` or `PrepareModelJobPayload`

  * `[ ]`   `role`
    * `[ ]`   Role: app/orchestrator — assembles prompt and dispatches to EMCAS front-half
    * `[ ]`   Unchanged from current role; only the EMCAS dep type and result handling change
    * `[ ]`   Must NOT: call AI provider directly, await stream, or handle post-stream logic

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker/prepareModelJob` — unchanged
    * `[ ]`   Inside boundary: Zones A–D prompt assembly, front-half dispatch, queued-result propagation
    * `[ ]`   Outside boundary: streaming, post-stream, contribution persistence, token debit, render job enqueue (render job deferred — no contribution at this stage)

  * `[ ]`   `deps`
    * `[ ]`   `BoundEnqueueModelCallFn` — from `enqueueModelCall.provides.ts`; replaces `BoundExecuteModelCallAndSaveFn`
    * `[ ]`   All other existing deps unchanged
    * `[ ]`   `enqueueRenderJob` dep: render job requires a contribution record; since front-half returns no contribution, `enqueueRenderJob` call is removed from prepareModelJob — render job dispatch moves to back-half

  * `[ ]`   `context_slice`
    * `[ ]`   Receives: unchanged `PrepareModelJobParams` and `PrepareModelJobPayload`
    * `[ ]`   Calls: `deps.enqueueModelCall(emcasParams, { chatApiRequest, preflightInputTokens })` — returns `EnqueueModelCallReturn`
    * `[ ]`   Returns: updated `PrepareModelJobSuccessReturn` — `{ queued: true }` (contribution and continuation data removed; back-half is responsible)

  * `[ ]`   `prepareModelJob.interface.test.ts` *(update existing file)*
    * `[ ]`   Updated: `PrepareModelJobSuccessReturn` valid shape is `{ queued: true }` — test asserts guard accepts it
    * `[ ]`   Removed: test cases asserting `contribution`, `needsContinuation`, `renderJobId` in success return
    * `[ ]`   Updated: `PrepareModelJobDeps` valid shape has `enqueueModelCall: BoundEnqueueModelCallFn`
    * `[ ]`   Existing invalid/error case tests remain unchanged

  * `[ ]`   `prepareModelJob.interface.ts` *(update existing file)*
    * `[ ]`   `PrepareModelJobDeps.enqueueModelCall`: type changes from `BoundEnqueueModelCallFn` to `BoundEnqueueModelCallFn`
    * `[ ]`   `PrepareModelJobSuccessReturn`: changes from `{ contribution, needsContinuation, renderJobId }` to `{ queued: true }`
    * `[ ]`   `PrepareModelJobErrorReturn`: unchanged
    * `[ ]`   `enqueueRenderJob` removed from `PrepareModelJobDeps` — render job is back-half's responsibility

  * `[ ]`   `prepareModelJob.interaction.spec` *(update)*
    * `[ ]`   Zones A–D prompt assembly: unchanged
    * `[ ]`   EMCAS call: now calls front-half; receives `{ queued: true }` or `{ error, retriable }`
    * `[ ]`   On `{ queued: true }`: returns `{ queued: true }` to processSimpleJob
    * `[ ]`   On front-half error: returns `PrepareModelJobErrorReturn`
    * `[ ]`   `enqueueRenderJob` no longer called from prepareModelJob

  * `[ ]`   `prepareModelJob.guard.test.ts` *(update existing file)*
    * `[ ]`   `isPrepareModelJobSuccessReturn`: updated — accepts `{ queued: true }`; rejects old `{ contribution, needsContinuation, renderJobId }` shape
    * `[ ]`   `isPrepareModelJobDeps`: updated — `enqueueModelCall` must be `BoundEnqueueModelCallFn`; `enqueueRenderJob` absent → guard accepts (removed field)
    * `[ ]`   All other guard tests unchanged

  * `[ ]`   `prepareModelJob.guard.ts` *(update existing file)*
    * `[ ]`   `isPrepareModelJobSuccessReturn`: checks `queued === true` instead of `contribution` shape
    * `[ ]`   `isPrepareModelJobDeps`: removes `enqueueRenderJob` check; no change to `enqueueModelCall` check (function type — duck-typed by presence)
    * `[ ]`   All other guards unchanged

  * `[ ]`   `prepareModelJob.test.ts` *(update existing file — add new tests at end, do not modify existing)*
    * `[ ]`   New: front-half returns `{ queued: true }` → prepareModelJob returns `{ queued: true }` — assert propagation
    * `[ ]`   New: front-half returns `{ error, retriable: false }` → prepareModelJob returns `PrepareModelJobErrorReturn`
    * `[ ]`   New: `enqueueRenderJob` is NOT called — assert spy never called
    * `[ ]`   Existing tests: all Zones A–D tests remain unchanged and GREEN

  * `[ ]`   `construction`
    * `[ ]`   `PrepareModelJobDeps` construction at wiring boundary: `enqueueModelCall` bound to `enqueueModelCall`; `enqueueRenderJob` removed from deps object
    * `[ ]`   Context factory (`createDialecticWorkerDeps`) updated in JobContext node — not here

  * `[ ]`   `prepareModelJob.ts` *(update existing file)*
    * `[ ]`   Line 322: call `deps.enqueueModelCall(emcasParams, { chatApiRequest, preflightInputTokens })` — unchanged call shape, return type changes
    * `[ ]`   Lines 345–357: remove `fileType`, `storageFileType`, `documentKey` result extraction (no longer in return)
    * `[ ]`   Remove `enqueueRenderJob` call
    * `[ ]`   On `{ queued: true }`: return `{ queued: true }` to caller
    * `[ ]`   All Zone A–D logic above the EMCAS call: unchanged

  * `[ ]`   `prepareModelJob.mock.ts` *(update existing file)*
    * `[ ]`   `buildBoundEnqueueModelCallStub`: return type changes to `EnqueueModelCallReturn` — default stub returns `{ queued: true }`
    * `[ ]`   Remove `enqueueRenderJob` from mock deps

  * `[ ]`   `prepareModelJob.provides.ts` *(update if exists)*
    * `[ ]`   Export updated `PrepareModelJobSuccessReturn` and `BoundEnqueueModelCallFn`

  * `[ ]`   `prepareModelJob.integration.test.ts` *(update)*
    * `[ ]`   Chain: processSimpleJob mock → prepareModelJob (with mock front-half dep) → front-half returns `{ queued: true }` → prepareModelJob returns `{ queued: true }` → processSimpleJob handles correctly
    * `[ ]`   Existing integration tests updated for new success shape

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/orchestrator — unchanged
    * `[ ]`   Deps inward: front-half (replaces full EMCAS); all other existing deps
    * `[ ]`   Provides outward: `PrepareModelJobSuccessReturn { queued: true }` to processSimpleJob
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   Front-half `{ queued: true }` propagates to caller — proven by updated test
    * `[ ]`   `enqueueRenderJob` is never called from prepareModelJob — proven by spy assertion
    * `[ ]`   Zones A–D remain GREEN — proven by existing tests passing unchanged
Node 8:


* `[ ]`   `dialectic-worker/processSimpleJob` **[BE] Update processSimpleJob — handle queued success shape, remove premature execute_completed notification**

  * `[ ]`   `objective`
    * `[ ]`   Adapt processSimpleJob to handle `PrepareModelJobSuccessReturn { queued: true }` as a valid terminal result for this invocation, and remove the `sendJobNotificationEvent('execute_completed')` call that is no longer appropriate here (completion is now confirmed only when the back-half runs)
    * `[ ]`   Functional goals:
      * `isPrepareModelJobSuccessReturn` now accepts `{ queued: true }` — guard change flows in from prepareModelJob node; processSimpleJob's check at line 355 continues to work
      * Remove lines 359–370: `sendJobNotificationEvent('execute_completed')` and associated `notificationDocumentKey` usage
      * All error paths (ContextWindowError, PrepareModelJobExecutionError) remain unchanged
    * `[ ]`   Non-functional constraints:
      * Minimal change — only the post-prepareModelJob success block changes
      * No changes to Zones A–D equivalent logic, session/stage/provider fetching, or error handling

  * `[ ]`   `role`
    * `[ ]`   Role: app/orchestrator — unchanged; adapts to new EMCAS split contract
    * `[ ]`   Must NOT: send `execute_completed` notification (moved to back-half), await stream, or know about Netlify

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker` — unchanged
    * `[ ]`   Inside boundary: job orchestration up to and including prepareModelJob dispatch
    * `[ ]`   Outside boundary: stream execution (Netlify), post-stream processing (back-half), `execute_completed` notification (back-half)

  * `[ ]`   `deps`
    * `[ ]`   All existing deps unchanged — no new deps added
    * `[ ]`   `notificationDocumentKey` variable: removed (was only used in the `execute_completed` send)

  * `[ ]`   `context_slice`
    * `[ ]`   Receives: unchanged params
    * `[ ]`   Calls: `ctx.prepareModelJob(prepareParams, preparePayload)` — return type now `PrepareModelJobReturn` with updated success shape `{ queued: true }`
    * `[ ]`   Returns: void (processSimpleJob throws or returns; its return is not consumed)

  * `[ ]`   `processSimpleJob.interface.test.ts` *(none exists — processSimpleJob has no interface file; skip)*

  * `[ ]`   `processSimpleJob.interaction.spec` *(update)*
    * `[ ]`   `isPrepareModelJobSuccessReturn` check at line 355: accepts `{ queued: true }` — updated guard handles this
    * `[ ]`   On success: function exits normally — no notification send, no contribution handling
    * `[ ]`   All error paths unchanged

  * `[ ]`   `processSimpleJob.test.ts` *(update existing — add new tests at end)*
    * `[ ]`   New: `prepareModelJob` returns `{ queued: true }` → processSimpleJob returns without throwing, no notification sent
    * `[ ]`   New: assert `sendJobNotificationEvent` is NOT called with `execute_completed` when prepareModelJob returns `{ queued: true }`
    * `[ ]`   Existing error path tests: unchanged and GREEN

  * `[ ]`   `construction`
    * `[ ]`   No construction changes — processSimpleJob is not a class or factory

  * `[ ]`   `processSimpleJob.ts` *(update existing file)*
    * `[ ]`   Lines 359–370: remove `sendJobNotificationEvent('execute_completed')` block entirely
    * `[ ]`   Line 53: remove `notificationDocumentKey` declaration (no longer used)
    * `[ ]`   Line 54: remove `stepKeyForNotification` if only used by the removed block
    * `[ ]`   Line 355: `isPrepareModelJobSuccessReturn` check — no code change needed; updated guard (from prepareModelJob node) handles `{ queued: true }`
    * `[ ]`   All other code: unchanged

  * `[ ]`   `processSimpleJob.integration.test.ts` *(update or add)*
    * `[ ]`   Chain: processSimpleJob → prepareModelJob mock returns `{ queued: true }` → processSimpleJob exits cleanly → asserts no `execute_completed` notification sent
    * `[ ]`   Existing integration tests pass with updated success shape

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/orchestrator — unchanged
    * `[ ]`   No new deps; one removed behavior (`execute_completed` notification)
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   `{ queued: true }` from prepareModelJob causes clean return without notification — proven by unit test
    * `[ ]`   `execute_completed` is never sent from processSimpleJob — proven by spy assertion
    * `[ ]`   All existing error paths remain GREEN — proven by existing tests unchanged
Node 9 (final Phase 1 node — includes commit):


* `[ ]`   `dialectic-worker/createJobContext/JobContext` **[BE] Update JobContext — wire enqueueModelCall, remove enqueueRenderJob from prepareModelJob deps slice**

  * `[ ]`   `objective`
    * `[ ]`   Update `IJobContext` and `createJobContext` to wire `enqueueModelCall` dep in `PrepareModelJobDeps`, and remove `enqueueRenderJob` from the prepareModelJob context slice — reflecting the split architecture
    * `[ ]`   Functional goals:
      * `IJobContext.prepareModelJob` dep factory wires `BoundEnqueueModelCallFn`
      * `enqueueRenderJob` removed from the prepareModelJob context slice (remains available in the back-half context slice)
      * `createEnqueueNetlifyEvent` factory wired from env vars into the front-half deps
      * `DIALECTIC_SAVERESPONSE_URL` env var wired into `AiStreamDeps` for Netlify workload (Netlify side only — noted but not wired here)
    * `[ ]`   Non-functional constraints:
      * IJobContext context factory must set every field explicitly — no optional fields
      * Existing context slices for other functions (render, continue, retry) remain unchanged
      * All JobContext interface tests must pass with updated wiring

  * `[ ]`   `role`
    * `[ ]`   Role: app/infra — wiring boundary; constructs and injects deps into the call chain
    * `[ ]`   Why appropriate: context factory is the single point where runtime deps are assembled; all changes to dep wiring belong here
    * `[ ]`   Must NOT: implement business logic, call AI providers, or access Supabase directly

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker/createJobContext` — unchanged
    * `[ ]`   Inside boundary: dep construction, context factory, wiring of front-half into prepareModelJob slice
    * `[ ]`   Outside boundary: all function implementations; Netlify workload wiring (separate package)

  * `[ ]`   `deps`
    * `[ ]`   `enqueueModelCall` — from front-half node; bound and injected
    * `[ ]`   `createEnqueueNetlifyEvent` — from front-half node; constructed from env vars `NETLIFY_ASYNC_WORKLOADS_TOKEN`, `NETLIFY_SITE_ID`
    * `[ ]`   All existing deps unchanged

  * `[ ]`   `context_slice`
    * `[ ]`   `prepareModelJob` context slice: `enqueueModelCall` → `BoundEnqueueModelCallFn`; `enqueueRenderJob` removed
    * `[ ]`   Back-half context slice: `enqueueRenderJob` present here (back-half dispatches render job after contribution exists)
    * `[ ]`   All other slices: unchanged

  * `[ ]`   `JobContext.interface.test.ts` *(update existing)*
    * `[ ]`   Updated: `IJobContext.prepareModelJob` slice has `enqueueModelCall` typed as `BoundEnqueueModelCallFn`
    * `[ ]`   Updated: `PrepareModelJobDeps` slice does not include `enqueueRenderJob`
    * `[ ]`   New: back-half context slice includes `enqueueRenderJob`
    * `[ ]`   All other interface tests unchanged

  * `[ ]`   `JobContext.interface.ts` *(update existing)*
    * `[ ]`   `IJobContext`: updated prepareModelJob deps slice type
    * `[ ]`   Add back-half deps slice type for `saveResponse` if not already present
    * `[ ]`   `ApplyInputsRequiredScopeFn`, `ValidateWalletBalanceFn`, `ValidateModelCostRatesFn`: unchanged

  * `[ ]`   `JobContext.interaction.spec` *(update)*
    * `[ ]`   `createJobContext` wires `enqueueModelCall` with `enqueueNetlifyEvent` constructed from env
    * `[ ]`   `createJobContext` wires back-half deps with `enqueueRenderJob`

  * `[ ]`   `JobContext.guard.test.ts` *(update)*
    * `[ ]`   Guards for updated context shape — `enqueueModelCall` accepted as `BoundEnqueueModelCallFn`; `enqueueRenderJob` absent from prepareModelJob slice accepted

  * `[ ]`   `JobContext.guard.ts` *(update)*
    * `[ ]`   Update guard for prepareModelJob context slice to reflect removed `enqueueRenderJob` and updated EMCAS type

  * `[ ]`   `JobContext.test.ts` *(update — add new tests at end)*
    * `[ ]`   New: `createJobContext` wires front-half correctly — `ctx.prepareModelJob` receives `BoundEnqueueModelCallFn`
    * `[ ]`   New: `enqueueRenderJob` absent from prepareModelJob context slice
    * `[ ]`   New: `enqueueRenderJob` present in back-half context slice
    * `[ ]`   Existing tests: unchanged and GREEN

  * `[ ]`   `construction`
    * `[ ]`   `createJobContext(env, supabaseClient, ...)`: updated to read `NETLIFY_ASYNC_WORKLOADS_TOKEN` and `NETLIFY_SITE_ID` from env; constructs `enqueueNetlifyEvent` and binds into front-half deps
    * `[ ]`   Context factory must set every field explicitly — no optional fields introduced

  * `[ ]`   `createJobContext.ts` *(update existing)*
    * `[ ]`   Import `enqueueModelCall` and `createEnqueueNetlifyEvent`
    * `[ ]`   In prepareModelJob deps slice: bind `enqueueModelCall` to `enqueueModelCall` (with `enqueueNetlifyEvent` constructed from env)
    * `[ ]`   Remove `enqueueRenderJob` from prepareModelJob deps slice
    * `[ ]`   Add back-half deps slice with `enqueueRenderJob` and back-half-specific deps

  * `[ ]`   `JobContext.mock.ts` *(update)*
    * `[ ]`   Mock context: `enqueueModelCall` in prepareModelJob slice defaults to `createMockEnqueueModelCallDeps` stub
    * `[ ]`   `enqueueRenderJob` present only in back-half mock slice

  * `[ ]`   `JobContext.provides.ts` *(update if exists)*
    * `[ ]`   Export updated `IJobContext`, `createJobContext`

  * `[ ]`   `JobContext.integration.test.ts` *(update)*
    * `[ ]`   Full Phase 1 chain integration: processSimpleJob → prepareModelJob (front-half dep) → front-half writes `queued` to DB → enqueues Netlify event → returns `{ queued: true }` → processSimpleJob exits cleanly
    * `[ ]`   Uses mock Netlify enqueue and mock DB client
    * `[ ]`   Proves end-to-end that the Supabase side of Phase 1 is wired correctly

  * `[ ]`   `directionality`
    * `[ ]`   Layer: app/infra — wiring boundary
    * `[ ]`   Deps inward: front-half, back-half, all existing worker deps
    * `[ ]`   Provides outward: fully wired `IJobContext` to processSimpleJob, processComplexJob, and all other consumers
    * `[ ]`   No cycles

  * `[ ]`   `requirements`
    * `[ ]`   Context wires front-half into prepareModelJob — proven by unit test
    * `[ ]`   `enqueueRenderJob` absent from prepareModelJob slice — proven by unit test
    * `[ ]`   Phase 1 full chain integration passes — proven by integration test
    * `[ ]`   All existing context tests remain GREEN

  * `[ ]`   **Commit** `feat(dialectic-worker): split EMCAS into enqueueModelCall (EMCAS front-half) + Netlify streaming worker + saveResponse (EMCAS back-half)`
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