import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FileType } from '../types/file_manager.types.ts';
import type { ContributionType } from '../../dialectic-service/dialectic.interface.ts';
import { getContributionTypeFromFileType } from './type_mapper.ts';
import { isFileType } from './type-guards/type_guards.file_manager.ts';

Deno.test('getContributionTypeFromFileType should correctly map all FileType members', () => {
    const mapping: { [key in FileType]?: ContributionType | null } = {
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
        [FileType.SynthesisHeaderContext]: 'synthesis', // This is a context object, but for type mapping, it belongs to synthesis.
        [FileType.header_context_pairwise]: 'synthesis', // Same as above.

        // Parenthesis Mappings
        [FileType.trd]: 'parenthesis',
        [FileType.master_plan]: 'parenthesis',
        [FileType.milestone_schema]: 'parenthesis',

        // Paralysis Mappings
        [FileType.updated_master_plan]: 'paralysis',
        [FileType.actionable_checklist]: 'paralysis',
        [FileType.advisor_recommendations]: 'paralysis',

        // Other Model Contributions
        [FileType.ModelContributionMain]: null, // Too generic, should not be used directly
        [FileType.ModelContributionRawJson]: null, // Metadata, not a semantic contribution
        [FileType.PlannerPrompt]: null, // Process artifact
        [FileType.TurnPrompt]: null, // Process artifact
        [FileType.HeaderContext]: null, // Process artifact
        [FileType.AssembledDocumentJson]: null, // Process artifact
        [FileType.RenderedDocument]: null, // Process artifact
        [FileType.ContributionDocument]: null, // Too generic

        // Non-Model FileTypes that should not map
        [FileType.ProjectReadme]: null,
        [FileType.PendingFile]: null,
        [FileType.CurrentFile]: null,
        [FileType.CompleteFile]: null,
        [FileType.InitialUserPrompt]: null,
        [FileType.UserFeedback]: null,
        [FileType.ProjectSettingsFile]: null,
        [FileType.GeneralResource]: null,
        [FileType.SeedPrompt]: null,
        [FileType.ProjectExportZip]: null,
    };

    for (const fileType of Object.values(FileType)) {
        if(!isFileType(fileType)) {
            throw new Error(`FileType.${fileType} is not a valid FileType`);
        }
        const expected = mapping[fileType];
        const actual = getContributionTypeFromFileType(fileType);
        assertEquals(actual, expected, `FileType.${fileType} should map to ${expected}`);
    }
});
