// supabase/functions/_shared/utils/type_guards.ts
import {
  FileType,
  CanonicalPathParams,
  ModelContributionUploadContext,
  UserFeedbackUploadContext,
  ResourceUploadContext,
  ModelContributionFileTypes,
  ResourceFileTypes,
  DocumentKey,
  FileManagerError,
} from '../../types/file_manager.types.ts'
import { OutputType } from '../../../dialectic-service/dialectic.interface.ts'
import { StorageError } from '../../../dialectic-service/dialectic.interface.ts'
import { ServiceError } from '../../types.ts'
import { isRecord, isPostgrestError } from './type_guards.common.ts'

export function isModelContributionContext(
  context: unknown,
): context is ModelContributionUploadContext {
  return isRecord(context) && 'contributionMetadata' in context
}

export function isUserFeedbackContext(
  context: unknown,
): context is UserFeedbackUploadContext {
  return isRecord(context) && 'feedbackTypeForDb' in context
}

export function isResourceContext(
  context: unknown,
): context is ResourceUploadContext {
  if (!isRecord(context) || 'contributionMetadata' in context || 'feedbackTypeForDb' in context) {
    return false;
  }

  const requiredKeys: (keyof Omit<ResourceUploadContext, 'resourceTypeForDb' | 'resourceDescriptionForDb' | 'branchKey' | 'parallelGroup'>)[] = [
    'pathContext',
    'fileContent',
    'mimeType',
    'sizeBytes',
    'userId',
    'description',
  ];

  for (const key of requiredKeys) {
    if (!(key in context)) {
      return false;
    }
  }
  
  if (!isRecord(context.pathContext) || typeof context.pathContext.fileType !== 'string') {
    return false;
  }

  return isResourceFileType(context.pathContext.fileType);
}

const RESOURCE_FILE_TYPES_MAP: { [K in ResourceFileTypes]: true } = {
    [FileType.ProjectReadme]: true,
    [FileType.PendingFile]: true,
    [FileType.CurrentFile]: true,
    [FileType.CompleteFile]: true,
    [FileType.InitialUserPrompt]: true,
    [FileType.ProjectSettingsFile]: true,
    [FileType.GeneralResource]: true,
    [FileType.SeedPrompt]: true,
    [FileType.ProjectExportZip]: true,
    [FileType.PlannerPrompt]: true,
    [FileType.TurnPrompt]: true,
    [FileType.AssembledDocumentJson]: true,
    [FileType.RenderedDocument]: true,
    [FileType.RagContextSummary]: true,
};

export function isResourceFileType(value: unknown): value is ResourceFileTypes {
    if (typeof value !== 'string') {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(RESOURCE_FILE_TYPES_MAP, value);
}

export function isCanonicalPathParams(obj: unknown): obj is CanonicalPathParams {
    if (!isRecord(obj)) return false;

    if (!('contributionType' in obj) || typeof obj.contributionType !== 'string') {
        return false;
    }
    // This guard can be expanded to check for other required properties if needed,
    // but for now, ensuring the core required property is present is sufficient.
    return true;
}

export function isFileType(value: unknown): value is FileType {
    if (typeof value !== 'string') {
        return false;
    }
    for (const type of Object.values(FileType)) {
        if (type === value) {
            return true;
        }
    }
    return false;
}

// Build a compile-time enforced map of model contribution file types, then derive a Set
const MODEL_CONTRIBUTION_FILE_TYPES_MAP: { [K in ModelContributionFileTypes]: true } = {
    [FileType.ModelContributionRawJson]: true,
    [FileType.HeaderContext]: true,
    [FileType.PairwiseSynthesisChunk]: true,
    [FileType.ReducedSynthesis]: true,
    [FileType.Synthesis]: true,
    [FileType.business_case]: true,
    [FileType.feature_spec]: true,
    [FileType.technical_approach]: true,
    [FileType.success_metrics]: true,
    [FileType.business_case_critique]: true,
    [FileType.technical_feasibility_assessment]: true,
    [FileType.risk_register]: true,
    [FileType.non_functional_requirements]: true,
    [FileType.dependency_map]: true,
    [FileType.comparison_vector]: true,
    [FileType.header_context_pairwise]: true,
    [FileType.synthesis_pairwise_business_case]: true,
    [FileType.synthesis_pairwise_feature_spec]: true,
    [FileType.synthesis_pairwise_technical_approach]: true,
    [FileType.synthesis_pairwise_success_metrics]: true,
    [FileType.synthesis_document_business_case]: true,
    [FileType.synthesis_document_feature_spec]: true,
    [FileType.synthesis_document_technical_approach]: true,
    [FileType.synthesis_document_success_metrics]: true,
    [FileType.SynthesisHeaderContext]: true,
    [FileType.product_requirements]: true,
    [FileType.system_architecture]: true,
    [FileType.tech_stack]: true,
    [FileType.technical_requirements]: true,
    [FileType.master_plan]: true,
    [FileType.milestone_schema]: true,
    [FileType.updated_master_plan]: true,
    [FileType.actionable_checklist]: true,
    [FileType.advisor_recommendations]: true,
};

export function isModelContributionFileType(value: unknown): value is ModelContributionFileTypes {
    if (typeof value !== 'string') {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(MODEL_CONTRIBUTION_FILE_TYPES_MAP, value);
}

// Build a compile-time enforced map of renderable output types (subset of ModelContributionFileTypes)
const OUTPUT_TYPES_MAP: { [K in OutputType]: true } = {
    [FileType.business_case]: true,
    [FileType.feature_spec]: true,
    [FileType.technical_approach]: true,
    [FileType.success_metrics]: true,
    [FileType.business_case_critique]: true,
    [FileType.technical_feasibility_assessment]: true,
    [FileType.risk_register]: true,
    [FileType.non_functional_requirements]: true,
    [FileType.dependency_map]: true,
    [FileType.comparison_vector]: true,
    [FileType.product_requirements]: true,
    [FileType.system_architecture]: true,
    [FileType.tech_stack]: true,
    [FileType.technical_requirements]: true,
    [FileType.master_plan]: true,
    [FileType.milestone_schema]: true,
    [FileType.updated_master_plan]: true,
    [FileType.actionable_checklist]: true,
    [FileType.advisor_recommendations]: true,
};

export function isOutputType(value: ModelContributionFileTypes): value is OutputType {
    return Object.prototype.hasOwnProperty.call(OUTPUT_TYPES_MAP, value);
}

// Build a compile-time enforced map of document key file types (subset of FileType)
const DOCUMENT_KEY_MAP: { [K in DocumentKey]: true } = {
    [FileType.business_case]: true,
    [FileType.feature_spec]: true,
    [FileType.technical_approach]: true,
    [FileType.success_metrics]: true,
    [FileType.business_case_critique]: true,
    [FileType.technical_feasibility_assessment]: true,
    [FileType.risk_register]: true,
    [FileType.non_functional_requirements]: true,
    [FileType.dependency_map]: true,
    [FileType.comparison_vector]: true,
    [FileType.product_requirements]: true,
    [FileType.system_architecture]: true,
    [FileType.tech_stack]: true,
    [FileType.technical_requirements]: true,
    [FileType.master_plan]: true,
    [FileType.milestone_schema]: true,
    [FileType.updated_master_plan]: true,
    [FileType.actionable_checklist]: true,
    [FileType.advisor_recommendations]: true,
    [FileType.synthesis_pairwise_business_case]: true,
    [FileType.synthesis_pairwise_feature_spec]: true,
    [FileType.synthesis_pairwise_technical_approach]: true,
    [FileType.synthesis_pairwise_success_metrics]: true,
    [FileType.synthesis_document_business_case]: true,
    [FileType.synthesis_document_feature_spec]: true,
    [FileType.synthesis_document_technical_approach]: true,
    [FileType.synthesis_document_success_metrics]: true,
};

export function isDocumentKey(value: FileType): value is DocumentKey {
    return Object.prototype.hasOwnProperty.call(DOCUMENT_KEY_MAP, value);
}

export function isStorageError(error: FileManagerError): error is StorageError {
  return isRecord(error) && 
    'message' in error && 
    !isPostgrestError(error) &&
    ('error' in error || 'statusCode' in error);
}

export function isServiceError(error: FileManagerError): error is ServiceError {
  return isRecord(error) && 
    'message' in error && 
    !isPostgrestError(error) && 
    !isStorageError(error);
}