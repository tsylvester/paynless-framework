import type { PathContext } from '../types/file_manager.types.ts';
import type { ConstructedPath } from './path_constructor.ts';

export type ConstructStoragePathFn = (context: PathContext) => ConstructedPath;

