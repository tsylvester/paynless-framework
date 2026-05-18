import { describe, expect, it } from 'vitest';
import type { ResolveOutputCapInputs } from './resolveOutputCap.interface.ts';
import { resolveOutputCap } from './resolveOutputCap.ts';

describe('resolveOutputCap', () => {
  it('returns the minimum when all four inputs are positive numbers', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 8000,
      hardCap: 3000,
      providerMax: 5000,
      tierCap: 1000,
    };
    expect(resolveOutputCap(inputs)).toBe(1000);
  });

  it('returns tierCap when it is the smallest among defined caps', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 50000,
      hardCap: 131072,
      providerMax: undefined,
      tierCap: 32768,
    };
    expect(resolveOutputCap(inputs)).toBe(32768);
  });

  it('returns hardCap when requestMax and providerMax are undefined and hardCap is smallest', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: undefined,
      hardCap: 64000,
      providerMax: undefined,
      tierCap: 131072,
    };
    expect(resolveOutputCap(inputs)).toBe(64000);
  });

  it('returns requestMax when tierCap is null and requestMax is the smallest positive', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 50000,
      hardCap: 131072,
      providerMax: 100000,
      tierCap: null,
    };
    expect(resolveOutputCap(inputs)).toBe(50000);
  });

  it('returns undefined when tierCap is null and all numeric caps are undefined', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: undefined,
      hardCap: undefined,
      providerMax: undefined,
      tierCap: null,
    };
    expect(resolveOutputCap(inputs)).toBeUndefined();
  });

  it('excludes zero from the minimum', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 0,
      hardCap: 300,
      providerMax: undefined,
      tierCap: null,
    };
    expect(resolveOutputCap(inputs)).toBe(300);
  });

  it('excludes negative numeric inputs from the minimum', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: -10,
      hardCap: 1000,
      providerMax: 2000,
      tierCap: 500,
    };
    expect(resolveOutputCap(inputs)).toBe(500);
  });

  it('uses providerMax when it is the smallest positive cap', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 100000,
      hardCap: 90000,
      providerMax: 5000,
      tierCap: 80000,
    };
    expect(resolveOutputCap(inputs)).toBe(5000);
  });
});
