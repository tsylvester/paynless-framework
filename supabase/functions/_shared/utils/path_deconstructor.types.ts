import type { FileType } from '../types/file_manager.types.ts';

export interface DeconstructedPathInfo {
  originalProjectId?: string;    // Project ID parsed directly from the path
  fileTypeGuess?: FileType;      // Best guess of FileType based on path structure/name
  shortSessionId?: string;       // Short session ID parsed from the path
  iteration?: number;            // Iteration number parsed from the path
  stageDirName?: string;         // Stage directory name (e.g., "1_hypothesis") parsed from the path
  stageSlug?: string;            // Stage slug derived from stageDirName (e.g., "hypothesis")
  contributionType?: string;   // Contribution type, if parsable from the filename
  modelSlug?: string;            // Model slug, if parsable from path or filename
  sourceModelSlug?: string;      // Source model slug for derivative works (e.g., antithesis)
  sourceContributionType?: string; // Source contribution type for derivative works
  sourceAttemptCount?: number;   // Source attempt count for derivative works
  attemptCount?: number;         // Attempt count, if parsable from path or filename
  parsedFileNameFromPath?: string; // The filename segment as extracted from the end of the path
  error?: string;                // Optional error message if deconstruction fails or is ambiguous
} 