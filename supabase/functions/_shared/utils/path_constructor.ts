import { FileType, type PathContext } from '../types/file_manager.types.ts';
import { isDocumentKey } from './type-guards/type_guards.file_manager.ts';

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
    documentKey,
    stepName,
  } = context;

  // Validate ALL required values for document file types BEFORE any path construction logic
  if (isDocumentKey(fileType)) {
    const missingValues: string[] = [];
    
    if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') {
      missingValues.push('projectId (string, non-empty)');
    }
    if (!rawSessionId || typeof rawSessionId !== 'string' || rawSessionId.trim() === '') {
      missingValues.push('sessionId (string, non-empty)');
    }
    if (iteration === undefined || typeof iteration !== 'number') {
      missingValues.push('iteration (number)');
    }
    if (!rawStageSlug || typeof rawStageSlug !== 'string' || rawStageSlug.trim() === '') {
      missingValues.push('stageSlug (string, non-empty)');
    }
    if (!rawModelSlug || typeof rawModelSlug !== 'string' || rawModelSlug.trim() === '') {
      missingValues.push('modelSlug (string, non-empty)');
    }
    if (attemptCount === undefined || typeof attemptCount !== 'number') {
      missingValues.push('attemptCount (number)');
    }
    if (!documentKey || typeof documentKey !== 'string' || documentKey.trim() === '') {
      missingValues.push('documentKey (string, non-empty)');
    }
    
    if (missingValues.length > 0) {
      throw new Error(
        `constructStoragePath requires all of the following values for document file type '${fileType}': projectId (string, non-empty), sessionId (string, non-empty), iteration (number), stageSlug (string, non-empty), modelSlug (string, non-empty), attemptCount (number), documentKey (string, non-empty). Missing or invalid: ${missingValues.join(', ')}`
      );
    }
  }

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
    case FileType.master_plan:
      if (stageRootPath) {
        if (!modelSlugSanitized || attemptCount === undefined) {
          throw new Error('Required context missing for stage-level master_plan.');
        }
        return {
          storagePath: `${stageRootPath}/documents`,
          fileName: `${modelSlugSanitized}_${attemptCount}_master_plan.md`,
        };
      }
      return { storagePath: projectRoot, fileName: 'master_plan.md' };
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
    case FileType.PlannerPrompt: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for planner_prompt.');
      }
      const stepNameSegment = stepName ? `_${sanitizeForPath(stepName)}` : '';
      const fileName = `${modelSlugSanitized}_${attemptCount}${stepNameSegment}_planner_prompt.md`;
      return { storagePath: `${stageRootPath}/_work/prompts`, fileName };
    }
    case FileType.TurnPrompt: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined || !documentKey) {
        throw new Error('Required context missing for turn_prompt.');
      }
      const continuationSuffix = isContinuation ? `_continuation_${turnIndex}` : '';
      const fileName = `${modelSlugSanitized}_${attemptCount}_${sanitizeForPath(documentKey)}${continuationSuffix}_prompt.md`;
      return { storagePath: `${stageRootPath}/_work/prompts`, fileName };
    }
    case FileType.HeaderContext: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for header_context.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_header_context.json`;
      return { storagePath: `${stageRootPath}/_work/context`, fileName };
    }
    case FileType.AssembledDocumentJson: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined || !documentKey) {
        throw new Error('Required context missing for assembled_document_json.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_${sanitizeForPath(documentKey)}_assembled.json`;
      return { storagePath: `${stageRootPath}/_work/assembled_json`, fileName };
    }
    case FileType.RenderedDocument: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined || !documentKey) {
        throw new Error('Required context missing for rendered_document.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_${sanitizeForPath(documentKey)}.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- New Synthesis-specific FileTypes ---
    case FileType.SynthesisHeaderContext: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for synthesis_header_context.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_synthesis_header_context.json`;
      return { storagePath: `${stageRootPath}/_work/context`, fileName };
    }
    case FileType.RagContextSummary: {
      if (!stageRootPath || !modelSlugSanitized || !sourceModelSlugs || sourceModelSlugs.length === 0) {
        throw new Error('Required context missing for rag_context_summary.');
      }
      const sourceModelSlugsSanitized = [...sourceModelSlugs].sort().map(sanitizeForPath).join('_and_');
      const fileName = `${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_rag_summary.txt`;
      return { storagePath: `${stageRootPath}/_work`, fileName };
    }

    // --- All Model Contributions (Main, Raw, and Intermediate Types) ---
    case FileType.ModelContributionRawJson:
    case FileType.PairwiseSynthesisChunk:
    case FileType.ReducedSynthesis:
    case FileType.Synthesis:
    case FileType.synthesis_pairwise_business_case:
    case FileType.synthesis_document_business_case:
    case FileType.header_context_pairwise:
    case FileType.synthesis_pairwise_feature_spec:
    case FileType.synthesis_pairwise_technical_approach:
    case FileType.synthesis_pairwise_success_metrics:
    case FileType.synthesis_document_feature_spec:
    case FileType.synthesis_document_technical_approach:
    case FileType.synthesis_document_success_metrics:
    case FileType.business_case:
    case FileType.feature_spec:
    case FileType.technical_approach:
    case FileType.success_metrics:
    case FileType.business_case_critique:
    case FileType.technical_feasibility_assessment:
    case FileType.risk_register:
    case FileType.non_functional_requirements:
    case FileType.dependency_map:
    case FileType.comparison_vector:
    case FileType.product_requirements:
    case FileType.system_architecture:
    case FileType.tech_stack:
    case FileType.technical_requirements:
    case FileType.milestone_schema:
    case FileType.updated_master_plan:
    case FileType.actionable_checklist:
    case FileType.advisor_recommendations: {
      // For document file types, use documentKey directly (guaranteed present after validation).
      // For non-document file types, determine effectiveContributionType explicitly without fallbacks.
      // Special case: document file types used as antithesis/pairwise/reduced synthesis should use contributionType for switch logic.
      let effectiveContributionType: string;
      if (isDocumentKey(fileType)) {
        // documentKey is guaranteed to be present and non-empty after validation
        // TypeScript doesn't narrow across the validation block, so we assert the validated state
        if (!documentKey || typeof documentKey !== 'string' || documentKey.trim() === '') {
          throw new Error(`constructStoragePath: documentKey validation failed for document file type ${fileType}`);
        }
        // For document file types used as special contribution types (antithesis, pairwise, reduced),
        // use contributionType for the switch logic, but still validate documentKey is present.
        if (contributionType === 'antithesis' || contributionType === 'pairwise_synthesis_chunk' || contributionType === 'reduced_synthesis') {
          effectiveContributionType = contributionType;
        } else {
          effectiveContributionType = documentKey;
        }
      } else {
        // For non-document file types, determine the value explicitly based on fileType
        if (fileType === FileType.PairwiseSynthesisChunk || fileType === FileType.ReducedSynthesis) {
          // These file types use themselves as the contribution type
          effectiveContributionType = fileType;
        } else if (contributionType && typeof contributionType === 'string') {
          // Use contributionType if explicitly provided
          effectiveContributionType = contributionType;
        } else {
          // Use fileType as string (fileType is always available, no fallback needed)
          effectiveContributionType = fileType;
        }
      }
      const contributionTypeSanitized = sanitizeForPath(effectiveContributionType);
      
      // We must re-validate context with the now-known effectiveContributionType
      if (!stageRootPath || !modelSlugSanitized || !contributionTypeSanitized || attemptCount === undefined) {
        throw new Error(`Required context missing for model contribution file of type ${fileType}.`);
      }

      // Handle new document-centric raw JSONs first, as they have a simpler naming scheme.
      if (fileType === FileType.ModelContributionRawJson && documentKey) {
        const sanitizedDocumentKey = sanitizeForPath(documentKey);
        const continuationSuffix = isContinuation ? `_continuation_${turnIndex}` : '';
        const fileName = `${modelSlugSanitized}_${attemptCount}_${sanitizedDocumentKey}${continuationSuffix}_raw.json`;
        const storagePath = isContinuation ? `${stageRootPath}/_work/raw_responses` : `${stageRootPath}/raw_responses`;
        return { storagePath, fileName };
      }

      let baseFileName: string;
      const jsonFileTypes = [
        FileType.comparison_vector,
        FileType.synthesis_document_business_case,
        FileType.synthesis_document_feature_spec,
        FileType.synthesis_document_success_metrics,
        FileType.synthesis_document_technical_approach,
        FileType.synthesis_pairwise_business_case,
        FileType.synthesis_pairwise_feature_spec,
        FileType.synthesis_pairwise_success_metrics,
        FileType.synthesis_pairwise_technical_approach,
      ];
      let suffix: string;
      if (fileType === FileType.ModelContributionRawJson) {
        suffix = '_raw.json';
      } else if (jsonFileTypes.includes(fileType)) {
        suffix = '.json';
      } else {
        suffix = '.md';
      }

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
        default: // Covers thesis, synthesis, parenthesis, paralysis, and all document keys
          // For document file types, use documentKey directly in filename
          if (isDocumentKey(fileType)) {
            // documentKey is guaranteed to be present and non-empty after validation
            // Re-check for TypeScript type narrowing (validation already occurred above)
            if (typeof documentKey !== 'string' || documentKey.trim() === '') {
              throw new Error(`constructStoragePath: documentKey validation failed for document file type ${fileType}`);
            }
            baseFileName = `${modelSlugSanitized}_${attemptCount}_${sanitizeForPath(documentKey)}`;
          } else {
            baseFileName = `${modelSlugSanitized}_${attemptCount}_${contributionTypeSanitized}`;
          }
          break;
      }
      
      const continuationSuffix = isContinuation ? `_continuation_${turnIndex}` : '';
      const fileName = `${baseFileName}${continuationSuffix}${suffix}`;

      let storagePath: string;
      const isIntermediate = effectiveContributionType === FileType.PairwiseSynthesisChunk ||
        effectiveContributionType === FileType.ReducedSynthesis ||
        effectiveContributionType === FileType.synthesis_pairwise_business_case ||
        effectiveContributionType === FileType.synthesis_document_business_case ||
        effectiveContributionType === FileType.header_context_pairwise ||
        effectiveContributionType === FileType.synthesis_pairwise_feature_spec ||
        effectiveContributionType === FileType.synthesis_pairwise_technical_approach ||
        effectiveContributionType === FileType.synthesis_pairwise_success_metrics ||
        effectiveContributionType === FileType.synthesis_document_feature_spec ||
        effectiveContributionType === FileType.synthesis_document_technical_approach ||
        effectiveContributionType === FileType.synthesis_document_success_metrics;

      if (isIntermediate || isContinuation) {
        storagePath = (fileType === FileType.ModelContributionRawJson)
          ? `${stageRootPath}/_work/raw_responses`
          : `${stageRootPath}/_work`;
      } else {
        if (fileType === FileType.ModelContributionRawJson) {
          storagePath = `${stageRootPath}/raw_responses`;
        } else if (isDocumentKey(fileType) || documentKey) {
          storagePath = `${stageRootPath}/documents`;
        } else {
          storagePath = stageRootPath;
        }
      }

      return { storagePath, fileName };
    }

    default: {
      // Use runtime validation instead of TypeScript exhaustive check to allow testing
      const validFileTypes = Object.values(FileType);
      if (!validFileTypes.includes(fileType)) {
        throw new Error(`Unhandled file type: ${fileType}`);
      }
      // This should never be reached if all FileTypes are handled above
      throw new Error(`File type not handled in switch statement: ${fileType}`);
    }
  }
}
