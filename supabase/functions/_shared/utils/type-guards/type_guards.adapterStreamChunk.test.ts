import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { AdapterStreamChunk } from '../../types.ts';
import {
    isAdapterStreamChunk,
    isDoneChunk,
    isTextDeltaChunk,
    isUsageChunk,
} from './type_guards.adapterStreamChunk.ts';

Deno.test('Type Guard: isAdapterStreamChunk', async (t) => {
    await t.step('valid text_delta chunk passes', () => {
        const chunk: AdapterStreamChunk = { type: 'text_delta', text: 'hello' };
        assert(isAdapterStreamChunk(chunk));
    });

    await t.step('valid usage chunk passes', () => {
        const chunk: AdapterStreamChunk = {
            type: 'usage',
            tokenUsage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
            },
        };
        assert(isAdapterStreamChunk(chunk));
    });

    await t.step('valid done chunk passes', () => {
        const chunk: AdapterStreamChunk = { type: 'done', finish_reason: 'stop' };
        assert(isAdapterStreamChunk(chunk));
    });

    await t.step('object missing type fails', () => {
        const value: unknown = { text: 'no type field' };
        assert(!isAdapterStreamChunk(value));
    });

    await t.step('object with unknown type string fails', () => {
        const value: unknown = { type: 'not_a_chunk_kind', payload: 1 };
        assert(!isAdapterStreamChunk(value));
    });

    await t.step('text_delta with non-string text fails', () => {
        const value: unknown = { type: 'text_delta', text: 123 };
        assert(!isAdapterStreamChunk(value));
    });

    await t.step('usage chunk with missing tokenUsage fields fails', () => {
        const incomplete: unknown = {
            type: 'usage',
            tokenUsage: {
                prompt_tokens: 1,
                completion_tokens: 2,
            },
        };
        assert(!isAdapterStreamChunk(incomplete));
    });

    await t.step('done chunk with invalid finish_reason fails', () => {
        const value: unknown = { type: 'done', finish_reason: 'not_a_valid_finish_reason' };
        assert(!isAdapterStreamChunk(value));
    });
});

Deno.test('Type Guard: AdapterStreamChunk variant guards', async (t) => {
    await t.step('isTextDeltaChunk accepts valid text_delta', () => {
        const value: unknown = { type: 'text_delta', text: 'x' };
        assert(isTextDeltaChunk(value));
    });

    await t.step('isUsageChunk narrows usage', () => {
        const value: unknown = {
            type: 'usage',
            tokenUsage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        };
        assert(isUsageChunk(value));
    });

    await t.step('isDoneChunk narrows done', () => {
        const value: unknown = { type: 'done', finish_reason: 'length' };
        assert(isDoneChunk(value));
    });
});
