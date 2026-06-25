import type { ResolveOutputCapFn, ResolveOutputCapInputs } from './resolveOutputCap.interface.ts';

export const resolveOutputCap: ResolveOutputCapFn = (
  inputs: ResolveOutputCapInputs,
): number | undefined => {
  const positives: number[] = [];
  if (typeof inputs.requestMax === 'number' && inputs.requestMax > 0) {
    positives.push(inputs.requestMax);
  }
  if (typeof inputs.hardCap === 'number' && inputs.hardCap > 0) {
    positives.push(inputs.hardCap);
  }
  if (typeof inputs.providerMax === 'number' && inputs.providerMax > 0) {
    positives.push(inputs.providerMax);
  }
  if (typeof inputs.tierCap === 'number' && inputs.tierCap > 0) {
    positives.push(inputs.tierCap);
  }
  if (positives.length === 0) {
    return undefined;
  }
  return Math.min(...positives);
};
