// supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.provides.ts
// Public surface for calculateAffordability — consumers should import from this module only.

export { calculateAffordability } from "./calculateAffordability.ts";
export type {
  BoundCalculateAffordabilityFn,
  CalculateAffordabilityCompressedReturn,
  CalculateAffordabilityDeps,
  CalculateAffordabilityDirectReturn,
  CalculateAffordabilityErrorReturn,
  CalculateAffordabilityFn,
  CalculateAffordabilityParams,
  CalculateAffordabilityPayload,
  CalculateAffordabilityReturn,
} from "./calculateAffordability.interface.ts";
export {
  isBoundCalculateAffordabilityFn,
  isCalculateAffordabilityCompressedReturn,
  isCalculateAffordabilityDeps,
  isCalculateAffordabilityDirectReturn,
  isCalculateAffordabilityErrorReturn,
  isCalculateAffordabilityParams,
  isCalculateAffordabilityPayload,
} from "./calculateAffordability.guard.ts";
export {
  buildCalculateAffordabilityCompressedReturn,
  buildCalculateAffordabilityDeps,
  buildCalculateAffordabilityDirectReturn,
  buildCalculateAffordabilityErrorReturn,
  buildCalculateAffordabilityParams,
  buildCalculateAffordabilityPayload,
  buildMockBoundCalculateAffordabilityFn,
  buildMockCalculateAffordabilityFn,
} from "./calculateAffordability.mock.ts";
export type {
  BuildCalculateAffordabilityCompressedReturnOverrides,
  CalculateAffordabilityDepsOverrides,
  CalculateAffordabilityParamsOverrides,
  CalculateAffordabilityPayloadOverrides,
  MockBoundCalculateAffordabilityFnOptions,
  MockCalculateAffordabilityFnOptions,
} from "./calculateAffordability.mock.ts";
