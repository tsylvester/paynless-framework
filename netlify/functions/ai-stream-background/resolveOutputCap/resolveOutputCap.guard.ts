import type { ResolveOutputCapFn, ResolveOutputCapInputs } from './resolveOutputCap.interface.ts';
import { isPlainRecord } from '../adapters/getNodeAiAdapter.guard.ts';

export function isResolveOutputCapInputs(v: unknown): v is ResolveOutputCapInputs {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('requestMax' in v)) {
    return false;
  }
  if (!('hardCap' in v)) {
    return false;
  }
  if (!('providerMax' in v)) {
    return false;
  }
  if (!('tierCap' in v)) {
    return false;
  }
  const requestMaxValue: unknown = v['requestMax'];
  const hardCapValue: unknown = v['hardCap'];
  const providerMaxValue: unknown = v['providerMax'];
  const tierCapValue: unknown = v['tierCap'];
  if (typeof requestMaxValue !== 'number' && requestMaxValue !== undefined) {
    return false;
  }
  if (typeof hardCapValue !== 'number' && hardCapValue !== undefined) {
    return false;
  }
  if (typeof providerMaxValue !== 'number' && providerMaxValue !== undefined) {
    return false;
  }
  if (typeof tierCapValue !== 'number' && tierCapValue !== null) {
    return false;
  }
  return true;
}

export function isResolveOutputCapFn(v: unknown): v is ResolveOutputCapFn {
  if (typeof v !== 'function') {
    return false;
  }
  return true;
}
