import { assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { shouldContinue } from './continue_util.ts';

Deno.test('shouldContinue: returns true for "length" finish_reason', () => {
    const result = shouldContinue('length', 0, 5);
    assert(result, 'Should return true when finish_reason is "length" and within max continuations');
});

Deno.test('shouldContinue: returns true for "max_tokens" finish_reason', () => {
    const result = shouldContinue('max_tokens', 0, 5);
    assert(result, 'Should return true when finish_reason is "max_tokens" and within max continuations');
});

Deno.test('shouldContinue: returns true for "unknown" finish_reason', () => {
    const result = shouldContinue('unknown', 0, 5);
    assert(result, 'Should return true when finish_reason is "unknown" and within max continuations');
});

Deno.test('shouldContinue: returns false for "stop" finish_reason', () => {
    const result = shouldContinue('stop', 0, 5);
    assert(!result, 'Should return false when finish_reason is "stop"');
});

Deno.test('shouldContinue: returns false for other finish_reasons', () => {
    const result = shouldContinue('tool_calls', 0, 5);
    assert(!result, 'Should return false for any finish_reason other than "length"');
});

Deno.test('shouldContinue: returns false when at max continuation limit', () => {
    const result = shouldContinue('length', 5, 5);
    assert(!result, 'Should return false when continuationCount equals maxContinuations');
});

Deno.test('shouldContinue: returns false when over max continuation limit', () => {
    const result = shouldContinue('length', 6, 5);
    assert(!result, 'Should return false when continuationCount exceeds maxContinuations');
});

Deno.test('shouldContinue: handles zero max continuations', () => {
    const result = shouldContinue('length', 0, 0);
    assert(!result, 'Should return false when maxContinuations is 0');
}); 