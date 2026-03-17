import type {
  GenerateInstallationTokenDeps,
  GenerateInstallationTokenParams,
} from "../../types/github.types.ts";
import { isRecord } from "./type_guards.common.ts";

export function isGenerateInstallationTokenDeps(
  obj: unknown
): obj is GenerateInstallationTokenDeps {
  if (!isRecord(obj)) return false;
  const appId = Object.getOwnPropertyDescriptor(obj, "appId")?.value;
  const privateKey = Object.getOwnPropertyDescriptor(obj, "privateKey")?.value;
  return (
    typeof appId === "string" &&
    appId.length > 0 &&
    typeof privateKey === "string" &&
    privateKey.length > 0
  );
}

export function isGenerateInstallationTokenParams(
  obj: unknown
): obj is GenerateInstallationTokenParams {
  if (!isRecord(obj)) return false;
  const installationId = Object.getOwnPropertyDescriptor(
    obj,
    "installationId"
  )?.value;
  return (
    typeof installationId === "number" &&
    Number.isInteger(installationId) &&
    installationId > 0
  );
}
