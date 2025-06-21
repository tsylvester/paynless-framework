import type { PathContext } from '../types/file_manager.types.ts'

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
      return '1_hypothesis';
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
 * This function is the single source of truth for all file paths in Supabase Storage.
 * @param context The context defining the file's place in the project structure.
 * @returns A relative path for the file within the Supabase Storage bucket.
 */
export function constructStoragePath(context: PathContext): string {
  const {
    projectId,
    fileType,
    sessionId: rawSessionId, // Renamed to avoid confusion
    iteration,
    stageSlug: rawStageSlug, // Renamed to avoid confusion
    modelSlug: rawModelSlug, // Renamed to avoid confusion
    attemptCount,
    originalFileName,
  } = context;

  const projectRoot = `projects/${projectId}`;
  const shortSessionId = rawSessionId ? generateShortId(rawSessionId) : undefined;
  const mappedStageDir = rawStageSlug ? mapStageSlugToDirName(rawStageSlug) : undefined;

  // Sanitize parts of the filename that come from dynamic data if they are part of originalFileName construction
  // However, originalFileName itself passed in should ideally be the final desired name.
  const sanitizedOriginalFileName = originalFileName; // Assuming originalFileName is already well-formed or sanitized by caller

  switch (fileType) {
    case 'project_readme':
      return `${projectRoot}/project_readme.md`;

    case 'initial_user_prompt':
      return `${projectRoot}/${sanitizeForPath(originalFileName)}`;

    case 'user_prompt':
      if (!shortSessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for user_prompt file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/0_seed_inputs/user_prompt.md`;

    case 'system_settings':
      if (!shortSessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for system_settings file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/0_seed_inputs/system_settings.json`;

    case 'general_resource':
      if (!shortSessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for general_resource file type.');
      }
      if (!originalFileName) {
        throw new Error('originalFileName is required for general_resource file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/0_seed_inputs/general_resource/${sanitizeForPath(originalFileName)}`;
    
    case 'seed_prompt':
      if (!shortSessionId || iteration === undefined || !mappedStageDir) {
        throw new Error('Session ID, iteration, and stageSlug are required for seed_prompt file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/seed_prompt.md`;

    case 'user_feedback':
      if (!shortSessionId || iteration === undefined || !mappedStageDir || !rawStageSlug) { // rawStageSlug needed for filename
        throw new Error('Session ID, iteration, and stageSlug are required for user_feedback file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/user_feedback_${sanitizeForPath(rawStageSlug)}.md`;

    case 'model_contribution_main':
      if (!shortSessionId || iteration === undefined || !mappedStageDir || !rawModelSlug || !rawStageSlug) {
        throw new Error('Session ID, iteration, stageSlug, and modelSlug are required for model_contribution_main.');
      }
      if (attemptCount !== undefined && attemptCount !== null) {
        const modelSlugSanitized = sanitizeForPath(rawModelSlug);
        const stageSlugSanitized = sanitizeForPath(rawStageSlug);
        return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}.md`;
      } else {
        if (!originalFileName) throw new Error('originalFileName is required for model_contribution_main when attemptCount is not provided.');
        return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/${sanitizeForPath(originalFileName)}`;
      }

    case 'model_contribution_raw_json':
      if (!shortSessionId || iteration === undefined || !mappedStageDir || !rawModelSlug || !rawStageSlug) {
        throw new Error('Session ID, iteration, stageSlug, and modelSlug are required for model_contribution_raw_json.');
      }
      if (attemptCount !== undefined && attemptCount !== null) {
        const modelSlugSanitized = sanitizeForPath(rawModelSlug);
        const stageSlugSanitized = sanitizeForPath(rawStageSlug);
        return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/${modelSlugSanitized}_${attemptCount}_${stageSlugSanitized}_raw.json`;
      } else {
        if (!originalFileName) throw new Error('originalFileName is required for model_contribution_raw_json when attemptCount is not provided.');
        // Original logic for raw json was placing it in a subfolder 'raw_responses'
        // The new naming convention with attemptCount does not specify this subfolder.
        // For consistency with the non-attemptCount case, let's decide if it should be there.
        // The test cases written for attemptCount place it in the mappedStageDir directly.
        // So, if attemptCount IS NOT USED, we revert to originalFileName in a 'raw_responses' subfolder.
        // If attemptCount IS USED, it is in mappedStageDir directly.
        // This might be slightly inconsistent. Let's follow the TDD approach: test implies it's in mappedStageDir for attemptCount.
        // What should it do if attemptCount is NOT defined? The old tests would expect 'raw_responses' subfolder.
        // The new test `model_contribution_main should still use originalFileName if attemptCount is undefined`
        // implies for main it's `.../${mappedStageDir}/custom_filename_for_main.md`
        // Let's assume raw_json without attemptCount follows its original pattern.
        return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/raw_responses/${sanitizeForPath(originalFileName)}`;
      }
      
    case 'contribution_document':
       if (!shortSessionId || iteration === undefined || !mappedStageDir || !originalFileName) {
        throw new Error('Session ID, iteration, stageSlug, and originalFileName are required for contribution_document.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/${mappedStageDir}/documents/${sanitizeForPath(originalFileName)}`;

    case 'iteration_summary_md':
      if (!shortSessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for iteration_summary_md file type.');
      }
      return `${projectRoot}/sessions/${shortSessionId}/iteration_${iteration}/iteration_summary.md`;

    default: {
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustiveCheck}`);
    }
  }
} 