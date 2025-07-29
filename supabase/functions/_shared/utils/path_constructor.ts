import type { PathContext } from '../types/file_manager.types.ts'

/**
 * Defines the structure for a constructed path, separating directory and filename.
 */
export interface ConstructedPath {
  storagePath: string; // Directory path leading to the file
  fileName: string;    // The name of the file itself
}

/**
 * Sanitizes a string to be used as a file or directory name.
 * Replaces spaces with underscores and converts to lowercase.
 * @param input The string to sanitize.
 * @returns The sanitized string.
 */
export function sanitizeForPath(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
}

/**
 * Generates a short identifier from a UUID string.
 * @param uuid The UUID string.
 * @param length The desired length of the short ID (default is 8).
 * @returns A short identifier.
 */
export function generateShortId(uuid: string, length: number = 8): string {
  // Remove hyphens and take the first `length` characters.
  // This is a simple approach; for more robust collision avoidance, consider other hashing/encoding.
  return uuid.replace(/-/g, '').substring(0, length);
}

/**
 * Maps a stage slug to its corresponding directory name as per the defined file structure.
 * @param stageSlug The lowercase slug of the stage (e.g., "thesis", "antithesis").
 * @returns The mapped directory name (e.g., "1_hypothesis") or the original slug if no mapping exists.
 */
export function mapStageSlugToDirName(stageSlug: string): string {
  const lowerCaseSlug = stageSlug.toLowerCase();
  switch (lowerCaseSlug) {
    case 'thesis':
      return '1_thesis';
    case 'antithesis':
      return '2_antithesis';
    case 'synthesis':
      return '3_synthesis';
    case 'parenthesis':
      return '4_parenthesis';
    case 'paralysis':
      return '5_paralysis';
    default:
      // If the slug doesn't match a specific mapping, return it as is or handle as an error.
      // For now, returning as is, assuming stageSlug might sometimes already be the dir name.
      // Consider throwing an error if strict mapping is required:
      // throw new Error(`Unknown stage slug for directory mapping: ${stageSlug}`);
      return lowerCaseSlug; 
  }
}

/**
 * Constructs a deterministic storage path for a file based on its context.
 * This function is the single source of truth for all file paths in Supabase Storage,
 * aligning with the structure in "AI Dialectic Implementation Plan Phase 2.md".
 * @param context The context defining the file's place in the project structure.
 * @returns A relative path for the file within the Supabase Storage bucket.
 */
export function constructStoragePath(context: PathContext): ConstructedPath {
  const {
    projectId,
    fileType,
    originalFileName, // Optional in PathContext, validated per case
    sessionId: rawSessionId,
    iteration,
    stageSlug: rawStageSlug,
    modelSlug: rawModelSlug,
    attemptCount,
  } = context;

  const projectRoot = projectId;

  // Helper variables, compute only if relevant context exists
  const shortSessionId = rawSessionId ? generateShortId(rawSessionId) : undefined;
  const mappedStageDir = rawStageSlug ? mapStageSlugToDirName(rawStageSlug) : undefined;

  let basePathForStageFiles = "";
  if (projectRoot && shortSessionId && iteration !== undefined && mappedStageDir) {
    basePathForStageFiles = `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
  }

  switch (fileType) {
    case 'project_readme':
      return { storagePath: projectRoot, fileName: 'project_readme.md' };

    case 'initial_user_prompt':
      if (!originalFileName) {
        throw new Error('originalFileName is required for initial_user_prompt file type.');
      }
      return { storagePath: projectRoot, fileName: sanitizeForPath(originalFileName) };

    case 'project_settings_file':
      return { storagePath: projectRoot, fileName: 'project_settings.json' };

    case 'general_resource':
      if (!originalFileName) {
        throw new Error('originalFileName is required for general_resource file type.');
      }
      return { storagePath: `${projectRoot}/general_resource`, fileName: sanitizeForPath(originalFileName) };
    
    // Session-specific 'user_prompt' and 'system_settings' (using 0_seed_inputs) are removed
    // as they are not in the documented file tree.

    case 'seed_prompt':
      if (!basePathForStageFiles) { 
        throw new Error('projectId, sessionId, iteration, and stageSlug are required for seed_prompt file type.');
      }
      return { storagePath: basePathForStageFiles, fileName: 'seed_prompt.md' };

    case 'user_feedback':
      if (!basePathForStageFiles || !rawStageSlug) { 
        throw new Error('projectId, sessionId, iteration, and stageSlug are required for user_feedback file type.');
      }
      return { storagePath: basePathForStageFiles, fileName: `user_feedback_${sanitizeForPath(rawStageSlug)}.md` };

    case 'model_contribution_main': {
      if (!basePathForStageFiles || !rawModelSlug || !rawStageSlug || attemptCount === undefined || attemptCount === null) {
        throw new Error('projectId, sessionId, iteration, stageSlug, modelSlug, and attemptCount are required for model_contribution_main.');
      }
      const modelSlugSanitized = sanitizeForPath(rawModelSlug);
      const stageSlugSanitized = sanitizeForPath(rawStageSlug);
      return { storagePath: basePathForStageFiles, fileName: `${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}.md` };
    }

    case 'model_contribution_raw_json': {
      if (!basePathForStageFiles || !rawModelSlug || !rawStageSlug || attemptCount === undefined || attemptCount === null) {
        throw new Error('projectId, sessionId, iteration, stageSlug, modelSlug, and attemptCount are required for model_contribution_raw_json.');
      }
      const rawResponsesPath = `${basePathForStageFiles}/raw_responses`;
      const modelSlugSanitizedRaw = sanitizeForPath(rawModelSlug);
      const stageSlugSanitizedRaw = sanitizeForPath(rawStageSlug);
      return { storagePath: rawResponsesPath, fileName: `${modelSlugSanitizedRaw}_${attemptCount}_${stageSlugSanitizedRaw}_raw.json` };
    }
      
    case 'contribution_document': {
       if (!basePathForStageFiles || !originalFileName) {
        throw new Error('projectId, sessionId, iteration, stageSlug, and originalFileName are required for contribution_document.');
      }
      return { storagePath: `${basePathForStageFiles}/documents`, fileName: sanitizeForPath(originalFileName) };
    }

    // --- Intermediate Artifacts ---
    case 'pairwise_synthesis_chunk': {
      if (!basePathForStageFiles || !originalFileName) {
        throw new Error('projectId, sessionId, iteration, stageSlug, and originalFileName are required for pairwise_synthesis_chunk.');
      }
      return { storagePath: `${basePathForStageFiles}/_work/pairwise_synthesis_chunks`, fileName: sanitizeForPath(originalFileName) };
    }

    case 'reduced_synthesis': {
      if (!basePathForStageFiles || !originalFileName) {
        throw new Error('projectId, sessionId, iteration, stageSlug, and originalFileName are required for reduced_synthesis.');
      }
      return { storagePath: `${basePathForStageFiles}/_work/reduced_synthesis_chunks`, fileName: sanitizeForPath(originalFileName) };
    }

    case 'final_synthesis': {
      if (!basePathForStageFiles || !originalFileName) {
        throw new Error('projectId, sessionId, iteration, stageSlug, and originalFileName are required for final_synthesis.');
      }
      // Note: This is still considered a "work" product before becoming a final, user-facing synthesis document.
      return { storagePath: `${basePathForStageFiles}/_work/final_synthesis`, fileName: sanitizeForPath(originalFileName) };
    }

    default: {
      // This will cause a compile-time error if fileType is not exhausted,
      // ensuring all defined FileTypes are handled.
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustiveCheck}`);
    }
  }
} 