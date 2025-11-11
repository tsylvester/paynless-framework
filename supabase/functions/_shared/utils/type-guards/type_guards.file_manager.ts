// supabase/functions/_shared/utils/type_guards.ts
import {
  FileType,
  CanonicalPathParams,
  ModelContributionUploadContext,
  UserFeedbackUploadContext,
  ResourceUploadContext,
  type ModelContributionFileTypes,
} from '../../types/file_manager.types.ts'
import { isRecord } from './type_guards.common.ts'

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
  return (
    isRecord(context) &&
    !('contributionMetadata' in context) &&
    !('feedbackTypeForDb' in context)
  )
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