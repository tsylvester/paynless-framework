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
    documentKey,
    stepName,
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
    case FileType.ContributionDocument: {
      if (!stageRootPath || !originalFileName) throw new Error('Base path and originalFileName required for contribution_document.');
      return { storagePath: `${stageRootPath}/documents`, fileName: sanitizeForPath(originalFileName) };
    }

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
    case FileType.SynthesisPrd: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for synthesis_prd.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_prd.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.SynthesisArchitecture: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for synthesis_architecture.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_architecture.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.SynthesisTechStack: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for synthesis_tech_stack.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_tech_stack.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- Thesis document FileTypes ---
    case FileType.business_case: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for business_case.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_business_case.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.feature_spec: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for feature_spec.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_feature_spec.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.technical_approach: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for technical_approach.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_technical_approach.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.success_metrics: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for success_metrics.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_success_metrics.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- Antithesis document FileTypes ---
    case FileType.business_case_critique: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for business_case_critique.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_business_case_critique.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.technical_feasibility_assessment: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for technical_feasibility_assessment.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_technical_feasibility_assessment.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.risk_register: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for risk_register.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_risk_register.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.non_functional_requirements: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for non_functional_requirements.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_non_functional_requirements.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.dependency_map: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for dependency_map.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_dependency_map.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.comparison_vector: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for comparison_vector.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_comparison_vector.json`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- Parenthesis document FileTypes ---
    case FileType.trd: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for trd.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_trd.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }
    case FileType.milestone_schema: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for milestone_schema.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_milestone_schema.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- Paralysis document FileTypes ---
    case FileType.advisor_recommendations: {
      if (!stageRootPath || !modelSlugSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for advisor_recommendations.');
      }
      const fileName = `${modelSlugSanitized}_${attemptCount}_advisor_recommendations.md`;
      return { storagePath: `${stageRootPath}/documents`, fileName };
    }

    // --- All Model Contributions (Main, Raw, and Intermediate Types) ---
    case FileType.ModelContributionMain:
    case FileType.ModelContributionRawJson:
    case FileType.PairwiseSynthesisChunk:
    case FileType.ReducedSynthesis:
    case FileType.Synthesis:
    case FileType.synthesis_pairwise_business_case:
    case FileType.synthesis_document_business_case: {
      // For fileType calls, infer contributionType.
      const effectiveContributionType = contributionType ?? fileType;
      const contributionTypeSanitized = sanitizeForPath(effectiveContributionType);
      
      // We must re-validate context with the now-known effectiveContributionType
      if (!stageRootPath || !modelSlugSanitized || !contributionTypeSanitized || attemptCount === undefined) {
        throw new Error('Required context missing for model contribution file.');
      }

      // Handle new document-centric raw JSONs first, as they have a simpler naming scheme.
      if (fileType === FileType.ModelContributionRawJson && documentKey) {
        const sanitizedDocumentKey = sanitizeForPath(documentKey);
        const continuationSuffix = isContinuation ? `_continuation_${turnIndex}` : '';
        const fileName = `${modelSlugSanitized}_${attemptCount}_${sanitizedDocumentKey}${continuationSuffix}_raw.json`;
        return { storagePath: `${stageRootPath}/raw_responses`, fileName };
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
      const isIntermediate = effectiveContributionType === FileType.PairwiseSynthesisChunk ||
        effectiveContributionType === FileType.ReducedSynthesis ||
        effectiveContributionType === FileType.synthesis_pairwise_business_case ||
        effectiveContributionType === FileType.synthesis_document_business_case;

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
