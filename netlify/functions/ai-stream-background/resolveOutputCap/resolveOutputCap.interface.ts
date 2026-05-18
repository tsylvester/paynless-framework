export interface ResolveOutputCapInputs {
  requestMax: number | undefined;
  hardCap: number | undefined;
  providerMax: number | undefined;
  tierCap: number | null;
}

export type ResolveOutputCapFn = (inputs: ResolveOutputCapInputs) => number | undefined;
