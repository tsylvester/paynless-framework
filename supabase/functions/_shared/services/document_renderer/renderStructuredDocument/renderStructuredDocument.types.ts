import type { FileType } from '../../../types/file_manager.types.ts';

export type RenderStructuredDocumentFn = (
  templateText: string,
  structuredRecord: Record<string, unknown>,
  documentKey: FileType,
) => string;
