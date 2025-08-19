import { FileType } from '../types/file_manager.types.ts';
import type { DeconstructedPathInfo } from './path_deconstructor.types.ts';

export function mapDirNameToStageSlug(dirName: string): string {
  const lowerCaseDirName = dirName.toLowerCase();
  switch (lowerCaseDirName) {
    case '1_thesis': return 'thesis';
    case '2_antithesis': return 'antithesis';
    case '3_synthesis': return 'synthesis';
    case '4_parenthesis': return 'parenthesis';
    case '5_paralysis': return 'paralysis';
    default: return lowerCaseDirName;
  }
}

export function deconstructStoragePath(
  params: { storageDir: string; fileName: string; dbOriginalFileName?: string },
): DeconstructedPathInfo {
  const { storageDir, fileName, dbOriginalFileName } = params;
  const info: Partial<DeconstructedPathInfo> = {
    // Initialize parsedFileNameFromPath with the input fileName.
    // Regex matches below might refine this for specific structured filenames.
    parsedFileNameFromPath: fileName,
  };

  // If storageDir is empty and fileName itself is a full path (legacy or specific cases),
  // then we use fileName as the fullPath. Otherwise, combine them.
  // For the new system, storageDir and fileName should always be distinct parts.
  const fullPath = storageDir ? `${storageDir}/${fileName}` : fileName;

  // Regex patterns defined as strings
  const antithesisContribRawPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/raw_responses/([^_]+)_critiquing_\\(([^_]+)'s_([^_]+)_(\\d+)\\)_(\\d+)_antithesis_raw\\.json$";
  const antithesisContribPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/([^_]+)_critiquing_\\(([^_]+)'s_([^_]+)_(\\d+)\\)_(\\d+)_antithesis\\.md$";
  
  // New pattern for continuation chunks - must be checked before general model contributions
  const modelContribContinuationPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/(.+)_(\\d+)_(.+)_continuation_(\\d+)(\\.md|_raw\\.json)$";

  const modelContribRawPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/raw_responses/(.+)_(\\d+)_(.+)_raw\\.json$";
  const modelContribPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/(.+)_(\\d+)_(.+)\\.md$";
  const contributionDocumentPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/documents/([^/]+)$";
  const userFeedbackPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/user_feedback_([^/]+)\\.md$";
  const seedPromptPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/seed_prompt\\.md$";
  const projectReadmePatternString = "^([^/]+)/project_readme\\.md$";
  const projectSettingsFilePatternString = "^([^/]+)/project_settings\\.json$";
  const generalResourcePatternString = "^([^/]+)/general_resource/([^/]+)$";
  const initialUserPromptPatternString = "^([^/]+)/((?!session_|general_resource/|project_readme\\.md$|project_settings\\.json$)[^/]+)$";
  // New specific patterns for intermediate files
  const pairwiseSynthesisPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/(?:raw_responses/)?([^_]+_synthesizing_[^_]+_with_[^_]+_on_[^_]+_\\d+_pairwise_synthesis_chunk(?:_raw\\.json|\\.md))$";
  const reducedSynthesisPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/(?:raw_responses/)?([^_]+_reducing_[^_]+_by_[^_]+_\\d+_reduced_synthesis(?:_raw\\.json|\\.md))$";
  const ragSummaryPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/([^_]+_compressing_.+_rag_summary\\.txt)$";
  const genericIntermediateFilePatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/([^/]+)$";

  // Path: .../raw_responses/{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})_{attemptCount}_antithesis_raw.json
  let matches = fullPath.match(new RegExp(antithesisContribRawPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.modelSlug = matches[5];
    info.sourceModelSlug = matches[6];
    info.sourceContributionType = matches[7];
    info.sourceAttemptCount = parseInt(matches[8], 10);
    info.attemptCount = parseInt(matches[9], 10);
    info.contributionType = 'antithesis';
    info.fileTypeGuess = FileType.ModelContributionRawJson;
    return info;
  }

  // Path: .../{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})_{attemptCount}_antithesis.md
  matches = fullPath.match(new RegExp(antithesisContribPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.modelSlug = matches[5];
    info.sourceModelSlug = matches[6];
    info.sourceContributionType = matches[7];
    info.sourceAttemptCount = parseInt(matches[8], 10);
    info.attemptCount = parseInt(matches[9], 10);
    info.contributionType = 'antithesis';
    info.fileTypeGuess = FileType.ModelContributionMain;
    return info;
  }

  // Path: .../{stageDir}/_work/{modelSlug}_{attemptCount}_{contribType}_continuation_{turnIndex}(.md/_raw.json)
  matches = fullPath.match(new RegExp(modelContribContinuationPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    const modelSlugPart = matches[5];
    info.modelSlug = modelSlugPart;
    info.attemptCount = parseInt(matches[6], 10);
    info.contributionType = matches[7];
    info.isContinuation = true;
    info.turnIndex = parseInt(matches[8], 10);
    const extension = matches[9];
    info.parsedFileNameFromPath = `${modelSlugPart}_${matches[6]}_${matches[7]}_continuation_${info.turnIndex}${extension}`;
    info.fileTypeGuess = extension === '_raw.json' ? FileType.ModelContributionRawJson : FileType.ModelContributionMain;
    return info;
  }

  // --- Intermediate _work files ---
  // Must be checked AFTER continuation and BEFORE general model contribution patterns

  // Path: .../_work/{modelSlug}_synthesizing_{sourceAnchorModelSlug}_with_{pairedModelSlug}_on_{sourceAnchorType}_{n}_pairwise_synthesis_chunk(.md/_raw.json)
  matches = fullPath.match(new RegExp(pairwiseSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = fullPath.endsWith('_raw.json') ? FileType.ModelContributionRawJson : FileType.PairwiseSynthesisChunk;
    return info;
  }

  // Path: .../_work/{modelSlug}_reducing_{sourceAnchorType}_by_{sourceAnchorModelSlug}_{n}_reduced_synthesis(.md/_raw.json)
  matches = fullPath.match(new RegExp(reducedSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = fullPath.endsWith('_raw.json') ? FileType.ModelContributionRawJson : FileType.ReducedSynthesis;
    return info;
  }
  
  // Path: .../_work/{modelSlug}_compressing_{source_model_slugs}_rag_summary.txt
  matches = fullPath.match(new RegExp(ragSummaryPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = FileType.RagContextSummary;
    return info;
  }

  // Path: {projectId}/session_{shortSessionId}/iteration_{iteration}/{mappedStageDir}/raw_responses/{modelSlugSanitized}_{attemptCount}_{stageSlugSanitized}_raw.json
  matches = fullPath.match(new RegExp(modelContribRawPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    const modelSlugPart = matches[5];
    info.modelSlug = modelSlugPart;
    info.attemptCount = parseInt(matches[6], 10);
    info.contributionType = matches[7];
    info.parsedFileNameFromPath = `${modelSlugPart}_${matches[6]}_${matches[7]}_raw.json`;
    info.fileTypeGuess = FileType.ModelContributionRawJson;
    if (dbOriginalFileName && dbOriginalFileName !== info.parsedFileNameFromPath) {
      console.warn(`[deconstructStoragePath] dbOriginalFileName mismatch for model_contribution_raw_json: ${dbOriginalFileName} vs ${info.parsedFileNameFromPath}`);
    }
    return info;
  }

  // Path: {projectId}/session_{shortSessionId}/iteration_{iteration}/{mappedStageDir}/{modelSlugSanitized}_{attemptCount}_{stageSlugSanitized}.md
  matches = fullPath.match(new RegExp(modelContribPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    const modelSlugPart = matches[5];
    info.modelSlug = modelSlugPart;
    info.attemptCount = parseInt(matches[6], 10);
    info.contributionType = matches[7];
    info.parsedFileNameFromPath = `${modelSlugPart}_${matches[6]}_${matches[7]}.md`;
    // Guess the file type based on the parsed contribution type
    const fileTypeGuess = Object.values(FileType).find(ft => ft === info.contributionType);
    info.fileTypeGuess = fileTypeGuess || FileType.ModelContributionMain; // Fallback
    if (dbOriginalFileName && dbOriginalFileName !== info.parsedFileNameFromPath) {
        console.warn(`[deconstructStoragePath] dbOriginalFileName mismatch for model_contribution_main: ${dbOriginalFileName} vs ${info.parsedFileNameFromPath}`);
    }
    return info;
  }
  
  // Path: {projectId}/session_{shortSessionId}/iteration_{iteration}/{mappedStageDir}/documents/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(contributionDocumentPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    info.fileTypeGuess = FileType.ContributionDocument;
    return info;
  }

  // --- Intermediate _work files ---

  // Path: .../_work/{modelSlug}_synthesizing_{sourceAnchorModelSlug}_with_{pairedModelSlug}_on_{sourceAnchorType}_{n}_pairwise_synthesis_chunk(.md/_raw.json)
  matches = fullPath.match(new RegExp(pairwiseSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = fullPath.endsWith('_raw.json') ? FileType.ModelContributionRawJson : FileType.PairwiseSynthesisChunk;
    return info;
  }

  // Path: .../_work/{modelSlug}_reducing_{sourceAnchorType}_by_{sourceAnchorModelSlug}_{n}_reduced_synthesis(.md/_raw.json)
  matches = fullPath.match(new RegExp(reducedSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = fullPath.endsWith('_raw.json') ? FileType.ModelContributionRawJson : FileType.ReducedSynthesis;
    return info;
  }
  
  // Path: .../_work/{modelSlug}_compressing_{source_model_slugs}_rag_summary.txt
  matches = fullPath.match(new RegExp(ragSummaryPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5]; // Capture the full file name
    info.modelSlug = info.parsedFileNameFromPath.split('_')[0]; // Best guess for model slug
    info.fileTypeGuess = FileType.RagContextSummary;
    return info;
  }

  // Generic catch-all for any other file in a _work directory
  matches = fullPath.match(new RegExp(genericIntermediateFilePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    
    // Simple guess based on filename. This is less reliable but provides a fallback.
    if (fileName.includes('pairwise_synthesis')) {
        info.fileTypeGuess = FileType.PairwiseSynthesisChunk;
    } else if (fileName.includes('reduced_synthesis')) {
        info.fileTypeGuess = FileType.ReducedSynthesis;
    } else if (fileName.includes('synthesis')) {
        info.fileTypeGuess = FileType.Synthesis;
    }
    // No specific fileTypeGuess if it doesn't match common patterns.
    
    return info;
  }

  // Path: {projectId}/session_{shortSessionId}/iteration_{iteration}/{mappedStageDir}/user_feedback_{sanitizedStageSlug}.md
  matches = fullPath.match(new RegExp(userFeedbackPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName); 
    info.parsedFileNameFromPath = `user_feedback_${matches[5]}.md`;
    info.fileTypeGuess = FileType.UserFeedback;
    return info;
  }

  // Path: {projectId}/session_{shortSessionId}/iteration_{iteration}/{mappedStageDir}/seed_prompt.md
  matches = fullPath.match(new RegExp(seedPromptPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = 'seed_prompt.md';
    info.fileTypeGuess = FileType.SeedPrompt;
    return info;
  }

  // --- Project Root Level Files ---

  // Path: {projectId}/project_readme.md
  matches = fullPath.match(new RegExp(projectReadmePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = 'project_readme.md';
    info.fileTypeGuess = FileType.ProjectReadme;
    return info;
  }

  // Path: {projectId}/project_settings.json
  matches = fullPath.match(new RegExp(projectSettingsFilePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = 'project_settings.json';
    info.fileTypeGuess = FileType.ProjectSettingsFile;
    return info;
  }

  // Path: {projectId}/general_resource/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(generalResourcePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = matches[2]; 
    info.fileTypeGuess = FileType.GeneralResource;
    return info;
  }
  
  // Path: {projectId}/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(initialUserPromptPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = matches[2]; 
    info.fileTypeGuess = FileType.InitialUserPrompt;
    return info;
  }

  info.error = 'Path did not match any known deconstruction patterns.';
  return info;
}
