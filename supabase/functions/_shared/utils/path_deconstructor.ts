import type { FileType } from '../types/file_manager.types.ts';
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
  const modelContribRawPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/raw_responses/(.+)_(\\d+)_([^_]+)_raw\\.json$";
  const modelContribPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/(.+)_(\\d+)_([^_]+)\\.md$";
  const contributionDocumentPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/documents/([^/]+)$";
  const userFeedbackPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/user_feedback_([^/]+)\\.md$";
  const seedPromptPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/seed_prompt\\.md$";
  const projectReadmePatternString = "^([^/]+)/project_readme\\.md$";
  const projectSettingsFilePatternString = "^([^/]+)/project_settings\\.json$";
  const generalResourcePatternString = "^([^/]+)/general_resource/([^/]+)$";
  const initialUserPromptPatternString = "^([^/]+)/((?!sessions/|general_resource/|project_readme\\.md$|project_settings\\.json$)[^/]+)$";
  const pairwiseSynthesisChunkPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/_work/pairwise_synthesis_chunks/([^/]+)$";
  const reducedSynthesisPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/_work/reduced_synthesis_chunks/([^/]+)$";
  const finalSynthesisPatternString = "^([^/]+)/sessions/([^/]+)/iteration_(\\d+)/([^/]+)/_work/final_synthesis/([^/]+)$";

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/raw_responses/{modelSlugSanitized}_{attemptCount}_{stageSlugSanitized}_raw.json
  let matches = fullPath.match(new RegExp(modelContribRawPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    const modelSlugPart = matches[5];
    info.modelSlug = modelSlugPart;
    info.attemptCount = parseInt(matches[6], 10);
    info.parsedFileNameFromPath = `${modelSlugPart}_${matches[6]}_${matches[7]}_raw.json`;
    info.fileTypeGuess = 'model_contribution_raw_json';
    if (dbOriginalFileName && dbOriginalFileName !== info.parsedFileNameFromPath) {
      console.warn(`[deconstructStoragePath] dbOriginalFileName mismatch for model_contribution_raw_json: ${dbOriginalFileName} vs ${info.parsedFileNameFromPath}`);
    }
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/{modelSlugSanitized}_{attemptCount}_{stageSlugSanitized}.md
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
    info.parsedFileNameFromPath = `${modelSlugPart}_${matches[6]}_${matches[7]}.md`;
    info.fileTypeGuess = 'model_contribution_main';
    if (dbOriginalFileName && dbOriginalFileName !== info.parsedFileNameFromPath) {
        console.warn(`[deconstructStoragePath] dbOriginalFileName mismatch for model_contribution_main: ${dbOriginalFileName} vs ${info.parsedFileNameFromPath}`);
    }
    return info as DeconstructedPathInfo;
  }
  
  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/documents/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(contributionDocumentPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    info.fileTypeGuess = 'contribution_document';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/_work/pairwise_synthesis_chunks/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(pairwiseSynthesisChunkPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    info.fileTypeGuess = 'pairwise_synthesis_chunk';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/_work/reduced_synthesis_chunks/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(reducedSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    info.fileTypeGuess = 'reduced_synthesis';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/_work/final_synthesis/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(finalSynthesisPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = matches[5];
    info.fileTypeGuess = 'final_synthesis';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/user_feedback_{sanitizedStageSlug}.md
  matches = fullPath.match(new RegExp(userFeedbackPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName); 
    info.parsedFileNameFromPath = `user_feedback_${matches[5]}.md`;
    info.fileTypeGuess = 'user_feedback';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/sessions/{shortSessionId}/iteration_{iteration}/{mappedStageDir}/seed_prompt.md
  matches = fullPath.match(new RegExp(seedPromptPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.shortSessionId = matches[2];
    info.iteration = parseInt(matches[3], 10);
    info.stageDirName = matches[4];
    info.stageSlug = mapDirNameToStageSlug(info.stageDirName);
    info.parsedFileNameFromPath = 'seed_prompt.md';
    info.fileTypeGuess = 'seed_prompt';
    return info as DeconstructedPathInfo;
  }

  // --- Project Root Level Files ---

  // Path: {projectId}/project_readme.md
  matches = fullPath.match(new RegExp(projectReadmePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = 'project_readme.md';
    info.fileTypeGuess = 'project_readme';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/project_settings.json
  matches = fullPath.match(new RegExp(projectSettingsFilePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = 'project_settings.json';
    info.fileTypeGuess = 'project_settings_file';
    return info as DeconstructedPathInfo;
  }

  // Path: {projectId}/general_resource/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(generalResourcePatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = matches[2]; 
    info.fileTypeGuess = 'general_resource';
    return info as DeconstructedPathInfo;
  }
  
  // Path: {projectId}/{sanitizedOriginalFileName}
  matches = fullPath.match(new RegExp(initialUserPromptPatternString));
  if (matches) {
    info.originalProjectId = matches[1];
    info.parsedFileNameFromPath = matches[2]; 
    info.fileTypeGuess = 'initial_user_prompt';
    return info as DeconstructedPathInfo;
  }

  info.error = 'Path did not match any known deconstruction patterns.';
  return info as DeconstructedPathInfo;
}
