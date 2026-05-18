import type { ResolveOutputCapInputs } from './resolveOutputCap.interface.ts';

/**
 * Domain-approved defaults for ResolveOutputCapInputs:
 * - requestMax, hardCap, providerMax: undefined (caller supplied no numeric cap)
 * - tierCap: null (no tier ceiling)
 *
 * Use `overrides` with `'field' in overrides` to set any field, including explicit
 * `undefined` for the numeric caps or `null` for tierCap.
 */
export function buildResolveOutputCapInputs(
  overrides?: Partial<ResolveOutputCapInputs>,
): ResolveOutputCapInputs {
  let requestMax: number | undefined = undefined;
  let hardCap: number | undefined = undefined;
  let providerMax: number | undefined = undefined;
  let tierCap: number | null = null;

  if (overrides !== undefined) {
    if ('requestMax' in overrides) {
      requestMax = overrides.requestMax;
    }
    if ('hardCap' in overrides) {
      hardCap = overrides.hardCap;
    }
    if ('providerMax' in overrides) {
      providerMax = overrides.providerMax;
    }
    if ('tierCap' in overrides) {
      if (overrides.tierCap === undefined) {
        tierCap = null;
      } else {
        tierCap = overrides.tierCap;
      }
    }
  }

  return {
    requestMax,
    hardCap,
    providerMax,
    tierCap,
  };
}
