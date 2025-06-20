import type { PathContext } from '../types/file_manager.types.ts'

/**
 * Sanitizes a string to be used as a file or directory name.
 * Replaces spaces with underscores and converts to lowercase.
 * @param input The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeForPath(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '');
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
    sessionId,
    iteration,
    stageSlug,
    modelSlug,
    originalFileName,
  } = context;

  // Use projectId (UUID) for robust internal pathing. project_name_slug can be used for exports.
  const projectRoot = `projects/${projectId}`;

  // Sanitize parts of the filename that come from dynamic data if they are part of originalFileName construction
  // However, originalFileName itself passed in should ideally be the final desired name.
  const sanitizedOriginalFileName = originalFileName; // Assuming originalFileName is already well-formed or sanitized by caller

  switch (fileType) {
    case 'project_readme':
      return `${projectRoot}/project_readme.md`;

    case 'initial_user_prompt': // Project-level initial prompt
      return `${projectRoot}/${sanitizedOriginalFileName}`; // Or a fixed name like "initial_project_prompt.md"

    // Files under session_{sessionId}/iteration_{N}/0_seed_inputs/
    case 'user_prompt': // Iteration-specific user prompt
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for user_prompt file type.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/0_seed_inputs/user_prompt.md`;

    case 'system_settings':
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for system_settings file type.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/0_seed_inputs/system_settings.json`;

    case 'general_resource':
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for general_resource file type.');
      }
      if (!originalFileName) {
        throw new Error('originalFileName is required for general_resource file type.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/0_seed_inputs/general_resource/${sanitizeForPath(originalFileName)}`;
    
    // Files under session_{sessionId}/iteration_{N}/{stageSlug}/
    case 'seed_prompt':
      if (!sessionId || iteration === undefined || !stageSlug) {
        throw new Error('Session ID, iteration, and stageSlug are required for seed_prompt file type.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/seed_prompt.md`;

    case 'user_feedback':
      if (!sessionId || iteration === undefined || !stageSlug) {
        throw new Error('Session ID, iteration, and stageSlug are required for user_feedback file type.');
      }
      // Filename could be fixed (e.g., user_feedback.md) or based on originalFileName if more flexibility is needed.
      // Plan implies: user_feedback_{stage_suffix}.md. Assuming stageSlug contains the suffix.
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/user_feedback_${stageSlug}.md`;

    case 'model_contribution_main':
      if (!sessionId || iteration === undefined || !stageSlug || !modelSlug || !originalFileName) {
        throw new Error('Session ID, iteration, stageSlug, modelSlug, and originalFileName are required for model_contribution_main.');
      }
      // originalFileName here should be the final filename like "claude_opus_hypothesis.md"
      // modelSlug in PathContext is for validation or if the caller wants path_constructor to build the filename, which is not the current assumption.
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/${sanitizeForPath(originalFileName)}`;

    case 'model_contribution_raw_json':
      if (!sessionId || iteration === undefined || !stageSlug || !modelSlug || !originalFileName) {
        throw new Error('Session ID, iteration, stageSlug, modelSlug, and originalFileName are required for model_contribution_raw_json.');
      }
      // originalFileName here should be the final filename like "claude_opus_hypothesis_raw.json"
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/raw_responses/${sanitizeForPath(originalFileName)}`;
      
    case 'contribution_document':
       if (!sessionId || iteration === undefined || !stageSlug || !originalFileName) {
        throw new Error('Session ID, iteration, stageSlug, and originalFileName are required for contribution_document.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/${stageSlug}/documents/${sanitizeForPath(originalFileName)}`;

    // File at the root of session_{sessionId}/iteration_{N}/
    case 'iteration_summary_md':
      if (!sessionId || iteration === undefined) {
        throw new Error('Session ID and iteration are required for iteration_summary_md file type.');
      }
      return `${projectRoot}/sessions/${sessionId}/iteration_${iteration}/iteration_summary.md`;

    default: {
      // This is a safety net. In a strongly-typed system, this should not be reached.
      // We can assert this at compile time using a helper function.
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustiveCheck}`);
    }
  }
} 