import { describe, expect, it } from 'vitest';
import { isResolveOutputCapInputs } from './resolveOutputCap.guard.ts';

describe('resolveOutputCap.guard', () => {
    it('accepts a fully populated object', () => {
      const value = {
        requestMax: 50000,
        hardCap: 131072,
        providerMax: 100000,
        tierCap: 32768,
      };
      expect(isResolveOutputCapInputs(value)).toBe(true);
    });
    it('accepts requestMax, hardCap, and providerMax as undefined', () => {
      const value = {
        requestMax: undefined,
        hardCap: undefined,
        providerMax: undefined,
        tierCap: 32768,
      };
      expect(isResolveOutputCapInputs(value)).toBe(true);
    });
    it('accepts tierCap null', () => {
      const value = {
        requestMax: 1000,
        hardCap: 2000,
        providerMax: 3000,
        tierCap: null,
      };
      expect(isResolveOutputCapInputs(value)).toBe(true);
    });

    it('rejects object missing any of the four required fields', () => {
        const missingRequestMax = { hardCap: 1, providerMax: 1, tierCap: null };
        const missingHardCap = { requestMax: 1, providerMax: 1, tierCap: null };
        const missingProviderMax = { requestMax: 1, hardCap: 1, tierCap: null };
        const missingTierCap = { requestMax: 1, hardCap: 1, providerMax: 1 };
        expect(isResolveOutputCapInputs(missingRequestMax)).toBe(false);
        expect(isResolveOutputCapInputs(missingHardCap)).toBe(false);
        expect(isResolveOutputCapInputs(missingProviderMax)).toBe(false);
        expect(isResolveOutputCapInputs(missingTierCap)).toBe(false);
      });
      it('rejects when tierCap is undefined', () => {
        const value = {
          requestMax: undefined,
          hardCap: undefined,
          providerMax: undefined,
          tierCap: undefined,
        };
        expect(isResolveOutputCapInputs(value)).toBe(false);
      });
      it('rejects when requestMax is null', () => {
        const value = {
          requestMax: null,
          hardCap: 1,
          providerMax: 1,
          tierCap: null,
        };
        expect(isResolveOutputCapInputs(value)).toBe(false);
      });
    });