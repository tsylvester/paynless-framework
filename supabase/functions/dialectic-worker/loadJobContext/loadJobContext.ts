import type {
  DialecticJobRow,
  AiProvidersRow,
  DialecticBaseJobPayload,
} from "../../dialectic-service/dialectic.interface.ts";
import type { AiModelExtendedConfig } from "../../_shared/types.ts";
import type { LoadJobContextFn } from "./loadJobContext.interface.ts";
import {
  LoadJobContextJobReadError,
  LoadJobContextJobNotFoundError,
  LoadJobContextProviderReadError,
  LoadJobContextProviderNotFoundError,
  LoadJobContextProviderInvalidError,
  LoadJobContextConfigInvalidError,
} from "./loadJobContext.interface.ts";
import { isDialecticBaseJobPayload } from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import {
  isSelectedAiProvider,
  isAiModelExtendedConfig,
} from "../../_shared/utils/type-guards/type_guards.chat.ts";

export const loadJobContext: LoadJobContextFn = async (
  _deps,
  params,
  payload,
) => {
  const jobResult = await params.dbClient
    .from("dialectic_generation_jobs")
    .select("*")
    .eq("id", payload.jobId);

  if (jobResult.error) {
    return {
      error: new LoadJobContextJobReadError({
        jobId: payload.jobId,
        driverMessage: jobResult.error.message,
      }),
      retriable: true,
    };
  }

  if (!jobResult.data || jobResult.data.length === 0) {
    return {
      error: new LoadJobContextJobNotFoundError({ jobId: payload.jobId }),
      retriable: false,
    };
  }

  const jobRow: DialecticJobRow = jobResult.data[0];

  let basePayload: DialecticBaseJobPayload;
  try {
    if (!isDialecticBaseJobPayload(jobRow.payload)) {
      throw new Error("isDialecticBaseJobPayload returned false");
    }
    basePayload = jobRow.payload;
  } catch (e) {
    if (e instanceof Error) {
      return { error: e, retriable: false };
    }
    throw e;
  }

  const providerResult = await params.dbClient
    .from("ai_providers")
    .select("*")
    .eq("id", basePayload.model_id);

  if (providerResult.error) {
    return {
      error: new LoadJobContextProviderReadError({
        modelId: basePayload.model_id,
        driverMessage: providerResult.error.message,
      }),
      retriable: true,
    };
  }

  if (!providerResult.data || providerResult.data.length === 0) {
    return {
      error: new LoadJobContextProviderNotFoundError({
        modelId: basePayload.model_id,
      }),
      retriable: false,
    };
  }

  const providerRow: AiProvidersRow = providerResult.data[0];

  if (!isSelectedAiProvider(providerRow)) {
    return {
      error: new LoadJobContextProviderInvalidError({
        modelId: basePayload.model_id,
      }),
      retriable: false,
    };
  }

  if (!isAiModelExtendedConfig(providerRow.config)) {
    return {
      error: new LoadJobContextConfigInvalidError({
        modelId: basePayload.model_id,
      }),
      retriable: false,
    };
  }

  const modelConfig: AiModelExtendedConfig = providerRow.config;

  return {
    job: jobRow,
    providerRow,
    modelConfig,
    walletId: basePayload.walletId,
    projectId: basePayload.projectId,
  };
};
