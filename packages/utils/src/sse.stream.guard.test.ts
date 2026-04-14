import { describe, it, expect } from 'vitest';
import { isSseConnection } from './sse.stream.guard';

describe('isSseConnection', () => {
    it('returns true for object with close, addEventListener, removeEventListener, dispatchEvent as functions', () => {
        const value = {
            close: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        expect(isSseConnection(value)).toBe(true);
    });

    it('returns false for null', () => {
        const value: null = null;
        expect(isSseConnection(value)).toBe(false);
    });

    it('returns false for undefined', () => {
        const value: undefined = undefined;
        expect(isSseConnection(value)).toBe(false);
    });

    it('returns false for empty object', () => {
        const value = {};
        expect(isSseConnection(value)).toBe(false);
    });

    it('returns false when close is missing', () => {
        const value = {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        expect(isSseConnection(value)).toBe(false);
    });

    it('returns false when addEventListener is missing', () => {
        const value = {
            close: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        expect(isSseConnection(value)).toBe(false);
    });

    it('returns false when close is not a function', () => {
        const value = {
            close: 'not-a-function',
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true,
        };
        expect(isSseConnection(value)).toBe(false);
    });
});
