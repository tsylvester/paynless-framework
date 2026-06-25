import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import type { ProviderModelInfo, ILogger, AiModelExtendedConfig, FinalAppModelConfig } from '../_shared/types.ts';
import type { Tables } from '../types_db.ts';
import { getCurrentDbModels } from './index.ts';
import { SyncResult, DbAiProvider } from './sync-ai-models.interface.ts';
import { ConfigAssembler } from './config_assembler.ts';
import { diffAndPrepareDbOps, executeDbOps } from './diffAndPrepareDbOps.ts';
import { isJson } from "../_shared/utils/type_guards.ts";
import { logger } from "../_shared/logger.ts";
const PROVIDER_NAME = 'openai';

function selectOpenAIEncoding(modelId: string, isEmbeddingModel: boolean): { encoding: 'o200k_base' | 'cl100k_base' | 'p50k_base'; isChatML: boolean } {
  const id = modelId.toLowerCase();
  if (isEmbeddingModel) {
    return { encoding: 'cl100k_base', isChatML: false };
  }
  if (id === 'text-davinci-003') {
    return { encoding: 'p50k_base', isChatML: false };
  }
  if (id.startsWith('gpt-4o') || id.startsWith('gpt-4.1')) {
    return { encoding: 'o200k_base', isChatML: true };
  }
  if (id.startsWith('gpt-4') || id.startsWith('gpt-3.5-turbo')) {
    return { encoding: 'cl100k_base', isChatML: true };
  }
  return { encoding: 'cl100k_base', isChatML: true };
}

// Tier 3 Data Source: Hardcoded internal map as a failsafe.
// This map must be updated when new models are observed from the provider API. Models without map entries will be inserted as disabled with null costs until configured.
// Canonical pricing (Standard tier, USD per 1M tokens unless noted): https://platform.openai.com/docs/pricing
// `ConfigAssembler.getLongestPrefixInternalMapPartial` matches `api_identifier.startsWith(key)`; define more specific keys before broader ones so longest-prefix resolution stays correct (e.g. `openai-gpt-4o` before `openai-gpt-4`, `openai-gpt-4o-mini` before `openai-gpt-4o`).
// Cost rates are the application's normalized cost for 1 million units (tokens, images, etc.).
const modelMapSource: { [key: string]: Partial<Pick<AiModelExtendedConfig, 'input_token_cost_rate' | 'output_token_cost_rate' | 'context_window_tokens' | 'hard_cap_output_tokens'>> } = {
    // --- ChatGPT branded ---
    'openai-chatgpt-4o-latest': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-chatgpt-image-latest': { input_token_cost_rate: 15.0, output_token_cost_rate: 75.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },

    // --- GPT-3.5 ---
    'openai-gpt-3.5-turbo-instruct-0914': { input_token_cost_rate: 1.5, output_token_cost_rate: 2.0, context_window_tokens: 4096, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo-instruct': { input_token_cost_rate: 1.5, output_token_cost_rate: 2.0, context_window_tokens: 4096, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo-16k': { input_token_cost_rate: 3.0, output_token_cost_rate: 4.0, context_window_tokens: 16385, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo-1106': { input_token_cost_rate: 1.0, output_token_cost_rate: 2.0, context_window_tokens: 16385, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo-0125': { input_token_cost_rate: 0.5, output_token_cost_rate: 1.5, context_window_tokens: 16385, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo-test': { input_token_cost_rate: 0.5, output_token_cost_rate: 1.5, context_window_tokens: 16385, hard_cap_output_tokens: 4096 },
    'openai-gpt-3.5-turbo': { input_token_cost_rate: 0.5, output_token_cost_rate: 1.5, context_window_tokens: 16385, hard_cap_output_tokens: 4096 },

    // --- GPT-4 (non-4o / non-4.1 key roots; longest child prefixes win for dated variants) ---
    'openai-gpt-4-turbo-2024-04-09': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-turbo-preview': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-turbo': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-0125-preview': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-1106-preview': { input_token_cost_rate: 10.0, output_token_cost_rate: 30.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-0613': { input_token_cost_rate: 30.0, output_token_cost_rate: 60.0, context_window_tokens: 8192, hard_cap_output_tokens: 4096 },
    'openai-gpt-4-costly-test': { input_token_cost_rate: 30.0, output_token_cost_rate: 60.0, context_window_tokens: 8192, hard_cap_output_tokens: 4096 },
    'openai-gpt-4': { input_token_cost_rate: 30.0, output_token_cost_rate: 60.0, context_window_tokens: 8192, hard_cap_output_tokens: 4096 },

    // --- GPT-4.1 (prefix longer than `openai-gpt-4`) ---
    'openai-gpt-4.1-nano-2025-04-14': { input_token_cost_rate: 0.1, output_token_cost_rate: 0.4, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.1-nano': { input_token_cost_rate: 0.1, output_token_cost_rate: 0.4, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.1-mini-2025-04-14': { input_token_cost_rate: 0.4, output_token_cost_rate: 1.6, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.1-mini': { input_token_cost_rate: 0.4, output_token_cost_rate: 1.6, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.1-2025-04-14': { input_token_cost_rate: 2.0, output_token_cost_rate: 8.0, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.1': { input_token_cost_rate: 2.0, output_token_cost_rate: 8.0, context_window_tokens: 1047576, hard_cap_output_tokens: 4096 },

    // --- GPT-4.5 preview ---
    'openai-gpt-4.5-preview-2025-02-27': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4.5-preview': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },

    // --- GPT-4o family (prefix longer than `openai-gpt-4`; `openai-gpt-4o-mini` before `openai-gpt-4o`) ---
    'openai-gpt-4o-mini-transcribe-2025-12-15': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-transcribe-2025-03-20': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-transcribe': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-tts-2025-12-15': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-tts-2025-03-20': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-tts': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-search-preview-2025-03-11': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-search-preview': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-realtime-preview-2024-12-17': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-realtime-preview': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-audio-preview-2024-12-17': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-audio-preview': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini-2024-07-18': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-mini': { input_token_cost_rate: 0.15, output_token_cost_rate: 0.6, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-transcribe-diarize': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-transcribe': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-search-preview-2025-03-11': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-search-preview': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-realtime-preview-2025-06-03': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-realtime-preview-2024-12-17': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-realtime-preview-2024-10-01': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-realtime-preview': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-audio-preview-2025-06-03': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-audio-preview-2024-12-17': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-audio-preview-2024-10-01': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-audio-preview': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-2024-11-20': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-2024-08-06': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o-2024-05-13': { input_token_cost_rate: 5.0, output_token_cost_rate: 15.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-4o': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },

    // --- GPT-5.x: minor versions 5.1 → 5.2 → 5.3 → 5.4 → 5.5; then unqualified `openai-gpt-5*` (tests: mini/nano headline rates) ---
    'openai-gpt-5.1-codex-max': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.1-codex-mini': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.1-codex': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.1-chat-latest': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.1-2025-11-13': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.1': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2-pro-2025-12-11': { input_token_cost_rate: 21.0, output_token_cost_rate: 168.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2-pro': { input_token_cost_rate: 21.0, output_token_cost_rate: 168.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2-codex': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2-chat-latest': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2-2025-12-11': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.2': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.3-codex': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.3-chat-latest': { input_token_cost_rate: 1.75, output_token_cost_rate: 14.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-pro-2026-03-05': { input_token_cost_rate: 30.0, output_token_cost_rate: 180.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-pro': { input_token_cost_rate: 30.0, output_token_cost_rate: 180.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-nano-2026-03-17': { input_token_cost_rate: 0.2, output_token_cost_rate: 1.25, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-nano': { input_token_cost_rate: 0.2, output_token_cost_rate: 1.25, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-mini-2026-03-17': { input_token_cost_rate: 0.75, output_token_cost_rate: 4.5, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-mini': { input_token_cost_rate: 0.75, output_token_cost_rate: 4.5, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4-2026-03-05': { input_token_cost_rate: 2.5, output_token_cost_rate: 15.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.4': { input_token_cost_rate: 2.5, output_token_cost_rate: 15.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.5-pro': { input_token_cost_rate: 30.0, output_token_cost_rate: 180.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5.5': { input_token_cost_rate: 5.0, output_token_cost_rate: 30.0, context_window_tokens: 272000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-pro-2025-10-06': { input_token_cost_rate: 15.0, output_token_cost_rate: 120.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-pro': { input_token_cost_rate: 15.0, output_token_cost_rate: 120.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-search-api-2025-10-14': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-search-api': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-codex': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-chat-latest': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-nano-2025-08-07': { input_token_cost_rate: 0.5, output_token_cost_rate: 2.0, context_window_tokens: 128000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-nano': { input_token_cost_rate: 0.5, output_token_cost_rate: 2.0, context_window_tokens: 128000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-mini-2025-08-07': { input_token_cost_rate: 1.0, output_token_cost_rate: 5.0, context_window_tokens: 128000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-mini': { input_token_cost_rate: 1.0, output_token_cost_rate: 5.0, context_window_tokens: 128000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5-2025-08-07': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },
    'openai-gpt-5': { input_token_cost_rate: 1.25, output_token_cost_rate: 10.0, context_window_tokens: 400000, hard_cap_output_tokens: 128000 },

    // --- Audio / image / realtime (Standard text-token rates where distinct SKUs are not tabulated; multimodal surcharges may apply at billing time) ---
    'openai-gpt-audio-mini-2025-12-15': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-audio-mini-2025-10-06': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-audio-mini': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-audio-2025-08-28': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-audio-1.5': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-audio': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-image-1-mini': { input_token_cost_rate: 5.0, output_token_cost_rate: 15.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-image-1.5': { input_token_cost_rate: 5.0, output_token_cost_rate: 15.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-image-1': { input_token_cost_rate: 5.0, output_token_cost_rate: 15.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime-mini-2025-12-15': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime-mini-2025-10-06': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime-mini': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime-2025-08-28': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime-1.5': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },
    'openai-gpt-realtime': { input_token_cost_rate: 2.5, output_token_cost_rate: 10.0, context_window_tokens: 128000, hard_cap_output_tokens: 4096 },

    // --- Embedding Models ---
    // The API does not provide context_window_tokens. We provide them here.
    // Application business logic requires a non-zero output cost.
    'openai-text-embedding-ada-002': { context_window_tokens: 8191, input_token_cost_rate: 0.1, output_token_cost_rate: 1.0 },
    'openai-text-embedding-3-small': { context_window_tokens: 8191, input_token_cost_rate: 0.02, output_token_cost_rate: 1.0 },
    'openai-text-embedding-3-large': { context_window_tokens: 8191, input_token_cost_rate: 0.13, output_token_cost_rate: 1.0 },

};

export const INTERNAL_MODEL_MAP: Map<string, Partial<AiModelExtendedConfig>> = new Map(Object.entries(modelMapSource).map(([key, value]) => {
    const modelId = key.replace(/^openai-/i, '');
    const isEmbeddingModel = modelId.includes('embedding');
    
    // Consistently apply the correct tokenization strategy.
    const { encoding, isChatML } = selectOpenAIEncoding(modelId, isEmbeddingModel);
    const tokenization_strategy: AiModelExtendedConfig['tokenization_strategy'] = {
      type: 'tiktoken',
      tiktoken_encoding_name: encoding,
      is_chatml_model: isChatML,
      api_identifier_for_tokenization: modelId,
    };

    // Link provider_max tokens to context_window, as they are functionally equivalent.
    const providerMaxTokens = value.context_window_tokens ? {
        provider_max_input_tokens: value.context_window_tokens,
        // Default output tokens to a safe value if not explicitly set in the map.
        provider_max_output_tokens: value.hard_cap_output_tokens ?? 4096 
    } : {};
    
    return [key, { ...value, ...providerMaxTokens, tokenization_strategy }];
}));

// --- Dependency Injection Setup ---
export interface SyncOpenAIDeps {
  listProviderModels: (apiKey: string) => Promise<{ models: ProviderModelInfo[], raw: unknown }>;
  getCurrentDbModels: (supabaseClient: SupabaseClient, providerName: string) => Promise<DbAiProvider[]>;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const defaultSyncOpenAIDeps: SyncOpenAIDeps = {
  listProviderModels: async (apiKey: string) => {

    const minimalConfig: AiModelExtendedConfig = {
      api_identifier: 'openai-gpt-4o',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base', is_chatml_model: true, api_identifier_for_tokenization: 'gpt-4o' },
    };

    if(!isJson(minimalConfig)) {
      throw new Error('minimalConfig is not a valid JSON object');
    }
    const dummyProvider: Tables<'ai_providers'> = {
      id: 'sync-openai-dummy',
      api_identifier: 'openai-gpt-4o',
      name: 'OpenAI Sync Dummy',
      description: null,
      is_active: true,
      provider: 'openai',
      config: minimalConfig,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_default_embedding: false,
      is_enabled: true,
      is_default_generation: false,
      min_plan_tier_level: 99,
    };
    const adapter = new OpenAiAdapter(dummyProvider, apiKey, logger);
    const { models, raw } = await adapter.listModels(true);
    return { models, raw };
  },
  getCurrentDbModels: getCurrentDbModels,
  log: console.log,
  error: console.error,
};

/**
 * Syncs OpenAI models with the database using shared assembly and DB operation utilities.
 */
export async function syncOpenAIModels(
  supabaseClient: SupabaseClient, 
  apiKey: string,
  deps: SyncOpenAIDeps = defaultSyncOpenAIDeps
): Promise<SyncResult> {
  const { listProviderModels, getCurrentDbModels, log, error } = deps;
  const logger: ILogger = { info: log, warn: log, error: error, debug: log };

  try {
    // 1. Fetch data
    logger.info(`Fetching models from ${PROVIDER_NAME} API...`);
    const { models: apiModels, raw: rawApiData } = await listProviderModels(apiKey);
    logger.info(`Fetched ${apiModels.length} models from ${PROVIDER_NAME} API.`);
    const dbModels = await getCurrentDbModels(supabaseClient, PROVIDER_NAME);
    logger.info(`Found ${dbModels.length} existing DB models for ${PROVIDER_NAME}.`);

    // 2. Assemble Configurations
    const assembler = new ConfigAssembler({
        apiModels,
        // Tier 2 external source is temporarily disabled due to unreliable/stale data.
        // Re-enable this if a trusted, up-to-date source for model capabilities is found.
        // externalCapabilities: () => getExternalCapabilities(logger), 
        internalModelMap: INTERNAL_MODEL_MAP,
        logger,
    });
    const { models: assembledModels, costProvenance } = await assembler.assemble();

    // Provider-specific hardening: ensure OpenAI chat models never fall back to rough_char_count
    const assembledConfigs: FinalAppModelConfig[] = assembledModels.map((cfg) => {
      const modelId = cfg.api_identifier.replace(/^openai-/i, '');
      const isEmbeddingModel = modelId.includes('embedding');
      const strat = cfg.config.tokenization_strategy;
      if (strat.type !== 'tiktoken' && !isEmbeddingModel) {
        const { encoding, isChatML } = selectOpenAIEncoding(modelId, isEmbeddingModel);
        cfg.config.tokenization_strategy = {
          type: 'tiktoken',
          tiktoken_encoding_name: encoding,
          is_chatml_model: isChatML,
          api_identifier_for_tokenization: modelId,
        };
      }
      return cfg;
    });

    // 3. Diff and Prepare DB Operations
    const ops = diffAndPrepareDbOps(
        assembledConfigs,
        dbModels,
        PROVIDER_NAME,
        logger,
        costProvenance,
    );

    // 4. Execute DB operations
    const { inserted, updated, deactivated } = await executeDbOps(
        supabaseClient,
        PROVIDER_NAME,
        ops,
        logger,
    );

    return { 
      provider: PROVIDER_NAME, 
      inserted, 
      updated, 
      deactivated,
      debug_data: rawApiData 
    };

  } catch (e) { 
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error(`!!! Sync failed for provider ${PROVIDER_NAME}:`, { error: err.message }); 
    return { provider: PROVIDER_NAME, inserted: 0, updated: 0, deactivated: 0, error: err.message };
  }
}
