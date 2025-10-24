import { FileType } from '../types/file_manager.types.ts';
import type { ContributionType } from '../../dialectic-service/dialectic.interface.ts';

const fileTypeToContributionTypeMap: Partial<Record<FileType, ContributionType>> = {
    // Direct Mappings
    [FileType.Synthesis]: 'synthesis',
    [FileType.PairwiseSynthesisChunk]: 'pairwise_synthesis_chunk',
    [FileType.ReducedSynthesis]: 'reduced_synthesis',
    [FileType.RagContextSummary]: 'rag_context_summary',

    // Thesis Mappings
    [FileType.business_case]: 'thesis',
    [FileType.feature_spec]: 'thesis',
    [FileType.technical_approach]: 'thesis',
    [FileType.success_metrics]: 'thesis',

    // Antithesis Mappings
    [FileType.business_case_critique]: 'antithesis',
    [FileType.technical_feasibility_assessment]: 'antithesis',
    [FileType.risk_register]: 'antithesis',
    [FileType.non_functional_requirements]: 'antithesis',
    [FileType.dependency_map]: 'antithesis',
    [FileType.comparison_vector]: 'antithesis',

    // Synthesis Document Mappings
    [FileType.synthesis_pairwise_business_case]: 'synthesis',
    [FileType.synthesis_pairwise_feature_spec]: 'synthesis',
    [FileType.synthesis_pairwise_technical_approach]: 'synthesis',
    [FileType.synthesis_pairwise_success_metrics]: 'synthesis',
    [FileType.synthesis_document_business_case]: 'synthesis',
    [FileType.synthesis_document_feature_spec]: 'synthesis',
    [FileType.synthesis_document_technical_approach]: 'synthesis',
    [FileType.synthesis_document_success_metrics]: 'synthesis',
    [FileType.prd]: 'synthesis',
    [FileType.system_architecture_overview]: 'synthesis',
    [FileType.tech_stack_recommendations]: 'synthesis',
    [FileType.SynthesisHeaderContext]: 'synthesis',
    [FileType.header_context_pairwise]: 'synthesis',

    // Parenthesis Mappings
    [FileType.trd]: 'parenthesis',
    [FileType.master_plan]: 'parenthesis',
    [FileType.milestone_schema]: 'parenthesis',

    // Paralysis Mappings
    [FileType.updated_master_plan]: 'paralysis',
    [FileType.actionable_checklist]: 'paralysis',
    [FileType.advisor_recommendations]: 'paralysis',
};

export function getContributionTypeFromFileType(fileType: FileType): ContributionType | null {
    return fileTypeToContributionTypeMap[fileType] ?? null;
}
