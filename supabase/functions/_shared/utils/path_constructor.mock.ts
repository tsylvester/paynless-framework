import type { ConstructedPath } from "./path_constructor.ts";
import type { ConstructStoragePathFn } from "./path_constructor.types.ts";

export type ConstructedPathOverrides = Partial<ConstructedPath>;

export function buildConstructedPath(overrides?: ConstructedPathOverrides): ConstructedPath {
  const base: ConstructedPath = {
    storagePath: "mock/storage/path",
    fileName: "mock-file.json",
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type ConstructedPathCorruptions = { [K in keyof ConstructedPath]?: unknown };

export function invalidateConstructedPath(corruptions: ConstructedPathCorruptions): unknown {
  return { ...buildConstructedPath(), ...corruptions };
}

export const mockConstructStoragePath: ConstructStoragePathFn = (_context) => {
  return buildConstructedPath();
};
