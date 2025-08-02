import type { PathContext } from '../types/file_manager.types.ts';

/**
 * Defines the structure for a constructed path, separating directory and filename.
 */
export interface ConstructedPath {
  storagePath: string; // Directory path leading to the file
  fileName: string;    // The name of the file itself
}

/**
 * Sanitizes a string to be used as a file or directory name.
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
  return uuid.replace(/-/g, '').substring(0, length);
}

/**
 * Maps a stage slug to its corresponding directory name.
 * @param stageSlug The lowercase slug of the stage.
 * @returns The mapped directory name.
 */
export function mapStageSlugToDirName(stageSlug: string): string {
  const lowerCaseSlug = stageSlug.toLowerCase();
  switch (lowerCaseSlug) {
    case 'thesis': return '1_thesis';
    case 'antithesis': return '2_antithesis';
    case 'synthesis': return '3_synthesis';
    case 'parenthesis': return '4_parenthesis';
    case 'paralysis': return '5_paralysis';
    default: return lowerCaseSlug;
  }
}

/**
 * Constructs a deterministic storage path for a file based on its context.
 */
export function constructStoragePath(context: PathContext): ConstructedPath {
  const {
    projectId,
    fileType,
    originalFileName,
    sessionId: rawSessionId,
    iteration,
    stageSlug: rawStageSlug,
    modelSlug: rawModelSlug,
    attemptCount,
    contributionType,
    sourceModelSlugs,
    sourceContributionIdShort,
  } = context;

  const projectRoot = projectId;
  const shortSessionId = rawSessionId ? generateShortId(rawSessionId) : undefined;
  const mappedStageDir = rawStageSlug ? mapStageSlugToDirName(rawStageSlug) : undefined;
  const modelSlugSanitized = rawModelSlug ? sanitizeForPath(rawModelSlug) : undefined;

  // This is the root path for all stage-related files.
  // Specific subdirectories like `_work` or `raw_responses` will be appended later.
  let stageRootPath = "";
  if (projectRoot && shortSessionId && iteration !== undefined && mappedStageDir) {
    stageRootPath = `${projectRoot}/session_${shortSessionId}/iteration_${iteration}/${mappedStageDir}`;
  }



  switch (fileType) {
    case 'project_readme':
      return { storagePath: projectRoot, fileName: 'project_readme.md' };
    case 'master_plan':
        return { storagePath: projectRoot, fileName: 'Master_Plan.md' };
    case 'pending_file':
        if (!originalFileName) throw new Error('originalFileName is required for pending_file.');
        return { storagePath: `${projectRoot}/Pending`, fileName: sanitizeForPath(originalFileName) };
    case 'current_file':
        if (!originalFileName) throw new Error('originalFileName is required for current_file.');
        return { storagePath: `${projectRoot}/Current`, fileName: sanitizeForPath(originalFileName) };
    case 'complete_file':
        if (!originalFileName) throw new Error('originalFileName is required for complete_file.');
        return { storagePath: `${projectRoot}/Complete`, fileName: sanitizeForPath(originalFileName) };
    case 'initial_user_prompt':
      if (!originalFileName) throw new Error('originalFileName is required for initial_user_prompt.');
      return { storagePath: projectRoot, fileName: sanitizeForPath(originalFileName) };
    case 'project_settings_file':
      return { storagePath: projectRoot, fileName: 'project_settings.json' };
    case 'general_resource':
      if (!originalFileName) throw new Error('originalFileName is required for general_resource.');
      return { storagePath: `${projectRoot}/general_resource`, fileName: sanitizeForPath(originalFileName) };
    case 'seed_prompt':
      if (!stageRootPath) throw new Error('Base path context required for seed_prompt.');
      return { storagePath: stageRootPath, fileName: 'seed_prompt.md' };
    case 'user_feedback':
      if (!stageRootPath || !rawStageSlug) throw new Error('Base path context and stageSlug required for user_feedback.');
      return { storagePath: stageRootPath, fileName: `user_feedback_${sanitizeForPath(rawStageSlug)}.md` };
    case 'contribution_document': {
      if (!stageRootPath || !originalFileName) throw new Error('Base path and originalFileName required for contribution_document.');
      return { storagePath: `${stageRootPath}/documents`, fileName: sanitizeForPath(originalFileName) };
    }

    // --- All Model Contributions (Main, Raw, and Intermediate Types) ---
    case 'model_contribution_main':
    case 'model_contribution_raw_json':
    case 'pairwise_synthesis_chunk':
    case 'reduced_synthesis':
    case 'final_synthesis': {
      // For fileType calls, infer contributionType.
      const effectiveContributionType = contributionType ?? fileType;
      const contributionTypeSanitized = sanitizeForPath(effectiveContributionType);
      
      // We must re-validate context with the now-known effectiveContributionType
      if (!stageRootPath || !modelSlugSanitized || !contributionTypeSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for model contribution file.');
      }

      let fileName: string;
      const suffix = fileType === 'model_contribution_raw_json' ? '_raw.json' : '.md';

      switch (effectiveContributionType) {
        case 'antithesis':
          if (!sourceModelSlugs || sourceModelSlugs.length !== 1) throw new Error('Antithesis requires exactly one sourceModelSlug.');
          fileName = `${modelSlugSanitized}_critiquing_${sanitizeForPath(sourceModelSlugs[0])}_${attemptCount}_${contributionTypeSanitized}${suffix}`;
          break;
        case 'pairwise_synthesis_chunk':
          if (!sourceModelSlugs || sourceModelSlugs.length === 0) throw new Error('Required sourceModelSlugs missing for pairwise_synthesis_chunk.');
          fileName = `${modelSlugSanitized}_from_${
            [...sourceModelSlugs].sort().map(sanitizeForPath).join('_and_')
          }_${attemptCount}_${contributionTypeSanitized}${suffix}`;
          break;
        case 'reduced_synthesis':
          if (!sourceContributionIdShort) throw new Error('Required sourceContributionIdShort missing for reduced_synthesis.');
          fileName = `${modelSlugSanitized}_reducing_${sourceContributionIdShort}_${attemptCount}_${contributionTypeSanitized}${suffix}`;
          break;
        default: // Covers thesis, final_synthesis, parenthesis, paralysis
          fileName = `${modelSlugSanitized}_${attemptCount}_${contributionTypeSanitized}${suffix}`;
          break;
      }
      
      let storagePath: string;
      const isIntermediate = effectiveContributionType === 'pairwise_synthesis_chunk' || effectiveContributionType === 'reduced_synthesis';

      if (isIntermediate) {
        storagePath = (fileType === 'model_contribution_raw_json')
          ? `${stageRootPath}/_work/raw_responses`
          : `${stageRootPath}/_work`;
      } else {
        storagePath = (fileType === 'model_contribution_raw_json')
          ? `${stageRootPath}/raw_responses`
          : stageRootPath;
      }

      return { storagePath, fileName };
    }

    case 'rag_context_summary': {
      if (!stageRootPath || !modelSlugSanitized || !sourceModelSlugs || sourceModelSlugs.length === 0) {
        throw new Error('Required context missing for rag_context_summary.');
      }
      const sourceModelSlugsSanitized = [...sourceModelSlugs].sort().map(sanitizeForPath).join('_and_');
      const fileName = `${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_rag_summary.txt`;
      return { storagePath: `${stageRootPath}/_work`, fileName };
    }

    default: {
      // This will cause a TypeScript error if any FileType is not handled.
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustiveCheck}`);
    }
  }
}
