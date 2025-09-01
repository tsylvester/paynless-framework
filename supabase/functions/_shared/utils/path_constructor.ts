import { FileType, type PathContext } from '../types/file_manager.types.ts';

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
    sourceAnchorType,
    sourceAnchorModelSlug,
    sourceAttemptCount,
    pairedModelSlug,
    isContinuation,
    turnIndex,
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
    case FileType.ProjectReadme:
      return { storagePath: projectRoot, fileName: 'project_readme.md' };
    case FileType.MasterPlan:
        return { storagePath: projectRoot, fileName: 'Master_Plan.md' };
    case FileType.ProjectExportZip:
        if (!originalFileName) throw new Error('originalFileName is required for project_export_zip.');
        return { storagePath: projectRoot, fileName: sanitizeForPath(originalFileName) };
    case FileType.PendingFile:
        if (!originalFileName) throw new Error('originalFileName is required for pending_file.');
        return { storagePath: `${projectRoot}/Pending`, fileName: sanitizeForPath(originalFileName) };
    case FileType.CurrentFile:
        if (!originalFileName) throw new Error('originalFileName is required for current_file.');
        return { storagePath: `${projectRoot}/Current`, fileName: sanitizeForPath(originalFileName) };
    case FileType.CompleteFile:
        if (!originalFileName) throw new Error('originalFileName is required for complete_file.');
        return { storagePath: `${projectRoot}/Complete`, fileName: sanitizeForPath(originalFileName) };
    case FileType.InitialUserPrompt:
      if (!originalFileName) throw new Error('originalFileName is required for initial_user_prompt.');
      return { storagePath: projectRoot, fileName: sanitizeForPath(originalFileName) };
    case FileType.ProjectSettingsFile:
      return { storagePath: projectRoot, fileName: 'project_settings.json' };
    case FileType.GeneralResource:
      if (!originalFileName) throw new Error('originalFileName is required for general_resource.');
      return { storagePath: `${projectRoot}/general_resource`, fileName: sanitizeForPath(originalFileName) };
    case FileType.SeedPrompt:
      if (!stageRootPath) throw new Error('Base path context required for seed_prompt.');
      return { storagePath: stageRootPath, fileName: 'seed_prompt.md' };
    case FileType.UserFeedback:
      if (!stageRootPath || !rawStageSlug) throw new Error('Base path context and stageSlug required for user_feedback.');
      return { storagePath: stageRootPath, fileName: `user_feedback_${sanitizeForPath(rawStageSlug)}.md` };
    case FileType.ContributionDocument: {
      if (!stageRootPath || !originalFileName) throw new Error('Base path and originalFileName required for contribution_document.');
      return { storagePath: `${stageRootPath}/documents`, fileName: sanitizeForPath(originalFileName) };
    }

    // --- All Model Contributions (Main, Raw, and Intermediate Types) ---
    case FileType.ModelContributionMain:
    case FileType.ModelContributionRawJson:
    case FileType.PairwiseSynthesisChunk:
    case FileType.ReducedSynthesis:
    case FileType.Synthesis: {
      // For fileType calls, infer contributionType.
      const effectiveContributionType = contributionType ?? fileType;
      const contributionTypeSanitized = sanitizeForPath(effectiveContributionType);
      
      // We must re-validate context with the now-known effectiveContributionType
      if (!stageRootPath || !modelSlugSanitized || !contributionTypeSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for model contribution file.');
      }

      let baseFileName: string;
      const suffix = fileType === FileType.ModelContributionRawJson ? '_raw.json' : '.md';

      switch (effectiveContributionType) {
        case 'antithesis':
          if (!sourceModelSlugs || sourceModelSlugs.length !== 1 || !sourceAnchorType || sourceAttemptCount === undefined) {
            throw new Error('Antithesis requires one sourceModelSlug, a sourceAnchorType, and a sourceAttemptCount.');
          }
          baseFileName = `${modelSlugSanitized}_critiquing_(${sanitizeForPath(sourceModelSlugs[0])}'s_${sanitizeForPath(sourceAnchorType)}_${sourceAttemptCount})_${attemptCount}_${contributionTypeSanitized}`;
          break;
        case FileType.PairwiseSynthesisChunk:
          if (!sourceAnchorType || !sourceAnchorModelSlug || !pairedModelSlug) {
            throw new Error('Required sourceAnchorType, sourceAnchorModelSlug, and pairedModelSlug missing for pairwise_synthesis_chunk.');
          }
          baseFileName = `${modelSlugSanitized}_synthesizing_${sanitizeForPath(sourceAnchorModelSlug)}_with_${sanitizeForPath(pairedModelSlug)}_on_${sanitizeForPath(sourceAnchorType)}_${attemptCount}_${contributionTypeSanitized}`;
          break;
        case FileType.ReducedSynthesis: {
          if (!sourceAnchorType || !sourceAnchorModelSlug) {
            throw new Error('Required sourceAnchorType and sourceAnchorModelSlug missing for reduced_synthesis.');
          }
          baseFileName = `${modelSlugSanitized}_reducing_${sanitizeForPath(sourceAnchorType)}_by_${sanitizeForPath(sourceAnchorModelSlug)}_${attemptCount}_${contributionTypeSanitized}`;
          break;
        }
        default: // Covers thesis, synthesis, parenthesis, paralysis
          baseFileName = `${modelSlugSanitized}_${attemptCount}_${contributionTypeSanitized}`;
          break;
      }
      
      const continuationSuffix = isContinuation ? `_continuation_${turnIndex}` : '';
      const fileName = `${baseFileName}${continuationSuffix}${suffix}`;

      let storagePath: string;
      const isIntermediate = effectiveContributionType === FileType.PairwiseSynthesisChunk || effectiveContributionType === FileType.ReducedSynthesis;

      if (isIntermediate || isContinuation) {
        storagePath = (fileType === FileType.ModelContributionRawJson)
          ? `${stageRootPath}/_work/raw_responses`
          : `${stageRootPath}/_work`;
      } else {
        storagePath = (fileType === FileType.ModelContributionRawJson)
          ? `${stageRootPath}/raw_responses`
          : stageRootPath;
      }

      return { storagePath, fileName };
    }

    case FileType.RagContextSummary: {
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
