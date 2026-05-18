import { describe, expect, it } from 'vitest';
import type { ResolveOutputCapFn, ResolveOutputCapInputs } from './resolveOutputCap.interface.ts';

describe('resolveOutputCap.interface contract', () => {
  it('accepts ResolveOutputCapInputs with numeric requestMax, hardCap, providerMax and numeric tierCap', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: 50000,
      hardCap: 131072,
      providerMax: 100000,
      tierCap: 32768,
    };
    expect(typeof inputs.requestMax).toBe('number');
    expect(typeof inputs.hardCap).toBe('number');
    expect(typeof inputs.providerMax).toBe('number');
    expect(typeof inputs.tierCap).toBe('number');
  });

  it('accepts ResolveOutputCapInputs with undefined requestMax, hardCap, providerMax and null tierCap', () => {
    const inputs: ResolveOutputCapInputs = {
      requestMax: undefined,
      hardCap: undefined,
      providerMax: undefined,
      tierCap: null,
    };
    expect(inputs.requestMax).toBeUndefined();
    expect(inputs.hardCap).toBeUndefined();
    expect(inputs.providerMax).toBeUndefined();
    expect(inputs.tierCap).toBeNull();
  });

  it('allows ResolveOutputCapFn implementations that return a number', () => {
    const fn: ResolveOutputCapFn = (_inputs: ResolveOutputCapInputs): number | undefined => 32768;
    const inputs: ResolveOutputCapInputs = {
      requestMax: undefined,
      hardCap: undefined,
      providerMax: undefined,
      tierCap: null,
    };
    expect(fn(inputs)).toBe(32768);
  });

  it('allows ResolveOutputCapFn implementations that return undefined', () => {
    const fn: ResolveOutputCapFn = (_inputs: ResolveOutputCapInputs): number | undefined =>
      undefined;
    const inputs: ResolveOutputCapInputs = {
      requestMax: undefined,
      hardCap: undefined,
      providerMax: undefined,
      tierCap: null,
    };
    expect(fn(inputs)).toBeUndefined();
  });
});
