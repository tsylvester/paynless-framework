import { describe, it } from 'https://deno.land/std@0.224.0/testing/bdd.ts';
import { assertEquals, assert, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createMockSupabaseClient, type MockSupabaseClientSetup } from '../supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import type { Tables } from '../../types_db.ts';
import { shouldEnqueueRenderJob } from './shouldEnqueueRenderJob.ts';
import type { ShouldEnqueueRenderJobDeps, ShouldEnqueueRenderJobParams, ShouldEnqueueRenderJobResult } from '../types/shouldEnqueueRenderJob.interface.ts';
import { logger } from '../logger.ts';

describe('shouldEnqueueRenderJob', () => {
    let mockSupabaseSetup: MockSupabaseClientSetup | null = null;

    const setup = (config: Parameters<typeof createMockSupabaseClient>[1] = {}) => {
        mockSupabaseSetup = createMockSupabaseClient(undefined, config);
        return {
            client: mockSupabaseSetup.client as unknown as SupabaseClient<Database>,
            spies: mockSupabaseSetup.spies,
        };
    };

    const teardown = () => {
        if (mockSupabaseSetup) {
            mockSupabaseSetup.clearAllStubs?.();
        }
    };

    it('should return {shouldRender: false, reason: "is_json"} for header_context output type', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'planner',
            step_slug: 'planner',
            step_name: 'Planner',
            step_description: null,
            job_type: 'PLAN',
            prompt_type: 'Planner',
            prompt_template_id: null,
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                header_context_artifact: {
                    document_key: 'HeaderContext',
                    artifact_class: 'header_context',
                    file_type: 'json',
                },
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'header_context',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: false, reason: 'is_json' });

        teardown();
    });

    it('should return {shouldRender: true, reason: "is_markdown"} for markdown document output type', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                documents: [
                    {
                        document_key: 'business_case',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        teardown();
    });

    it('should return {shouldRender: false, reason: "steps_not_found"} when recipe steps are missing', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result.shouldRender, false);
        assertEquals(result.reason, 'steps_not_found');

        teardown();
    });

    it('should query cloned recipe steps when instance is cloned', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: true,
            cloned_at: '2025-01-01T00:00:00.000Z',
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockClonedStep: Tables<'dialectic_stage_recipe_steps'> = {
            id: 'step-1',
            instance_id: 'instance-1',
            template_step_id: null,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                documents: [
                    {
                        document_key: 'business_case',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
            config_override: {},
            object_filter: {},
            output_overrides: {},
            is_skipped: false,
            execution_order: 1,
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client, spies } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_steps': {
                    select: {
                        data: [mockClonedStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        // Verify that dialectic_stage_recipe_steps was queried (not dialectic_recipe_template_steps)
        const stepQuerySpies = spies.getLatestQueryBuilderSpies('dialectic_stage_recipe_steps');
        assert(stepQuerySpies !== undefined, 'Should query dialectic_stage_recipe_steps when instance is cloned');
        assert(stepQuerySpies.eq !== undefined, 'Should use eq filter for instance_id');

        teardown();
    });

    it('should query template steps when instance is not cloned', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                documents: [
                    {
                        document_key: 'business_case',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client, spies } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        // Verify that dialectic_recipe_template_steps was queried using template_id
        const templateStepQuerySpies = spies.getLatestQueryBuilderSpies('dialectic_recipe_template_steps');
        assert(templateStepQuerySpies !== undefined, 'Should query dialectic_recipe_template_steps when instance is not cloned');
        assert(templateStepQuerySpies.eq !== undefined, 'Should use eq filter for template_id');

        teardown();
    });

    it('should extract document_key from documents array in outputs_required', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                documents: [
                    {
                        document_key: 'business_case',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                    {
                        document_key: 'feature_spec',
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        // Also test with feature_spec
        const params2: ShouldEnqueueRenderJobParams = {
            outputType: 'feature_spec',
            stageSlug: 'thesis',
        };
        const result2 = await shouldEnqueueRenderJob(deps, params2);
        assertEquals(result2, { shouldRender: true, reason: 'is_markdown' });

        teardown();
    });

    it('should extract document_key from files_to_generate array in outputs_required', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                files_to_generate: [
                    {
                        from_document_key: 'business_case',
                        template_filename: 'business_case.md',
                    },
                ],
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        teardown();
    });

    it('should extract document_key from root-level outputs_required', async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'execute_business_case',
            step_slug: 'execute-business-case',
            step_name: 'Execute Business Case',
            step_description: null,
            job_type: 'EXECUTE',
            prompt_type: 'Turn',
            prompt_template_id: null,
            output_type: 'business_case',
            granularity_strategy: 'per_source_document',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: {
                document_key: 'business_case',
                file_type: 'markdown',
            },
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'business_case',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        assertEquals(result, { shouldRender: true, reason: 'is_markdown' });

        teardown();
    });

    it("should return {shouldRender: false, reason: 'stage_not_found', details: ...} when stage query fails", async () => {
        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: null,
                        error: new Error('DB connection failed'),
                    },
                },
            },
        });
    
        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'any_type',
            stageSlug: 'non_existent_stage',
        };
    
        const result = await shouldEnqueueRenderJob(deps, params);
        
        assertEquals(result.shouldRender, false);
        assertEquals(result.reason, 'stage_not_found');
        assertEquals(result.details, 'DB connection failed');
    
        teardown();
    });

    it("should return {shouldRender: false, reason: 'no_active_recipe'} when stage exists but active_recipe_instance_id is NULL", async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: null,
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'any_type',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        
        assertEquals(result, { shouldRender: false, reason: 'no_active_recipe' });

        teardown();
    });

    it("should return {shouldRender: false, reason: 'parse_error', details: ...} when outputs_required contains malformed JSON", async () => {
        const mockStage: Tables<'dialectic_stages'> = {
            id: 'stage-1',
            slug: 'thesis',
            display_name: 'Thesis',
            description: null,
            default_system_prompt_id: null,
            recipe_template_id: 'template-1',
            active_recipe_instance_id: 'instance-1',
            expected_output_template_ids: [],
            created_at: '2025-01-01T00:00:00.000Z',
        };

        const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
            id: 'instance-1',
            stage_id: 'stage-1',
            template_id: 'template-1',
            is_cloned: false,
            cloned_at: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const mockTemplateStep: Tables<'dialectic_recipe_template_steps'> = {
            id: 'step-1',
            template_id: 'template-1',
            step_number: 1,
            step_key: 'planner',
            step_slug: 'planner',
            step_name: 'Planner',
            step_description: null,
            job_type: 'PLAN',
            prompt_type: 'Planner',
            prompt_template_id: null,
            output_type: 'header_context',
            granularity_strategy: 'all_to_one',
            inputs_required: [],
            inputs_relevance: [],
            outputs_required: '{"malformed":, "json"}', // Malformed JSON
            parallel_group: null,
            branch_key: null,
            created_at: '2025-01-01T00:00:00.000Z',
            updated_at: '2025-01-01T00:00:00.000Z',
        };

        const { client } = setup({
            genericMockResults: {
                'dialectic_stages': {
                    select: {
                        data: [mockStage],
                        error: null,
                    },
                },
                'dialectic_stage_recipe_instances': {
                    select: {
                        data: [mockInstance],
                        error: null,
                    },
                },
                'dialectic_recipe_template_steps': {
                    select: {
                        data: [mockTemplateStep],
                        error: null,
                    },
                },
            },
        });

        const deps: ShouldEnqueueRenderJobDeps = { dbClient: client, logger };
        const params: ShouldEnqueueRenderJobParams = {
            outputType: 'any_type',
            stageSlug: 'thesis',
        };

        const result = await shouldEnqueueRenderJob(deps, params);
        
        assertEquals(result.shouldRender, false);
        assertEquals(result.reason, 'parse_error');
        assert(typeof result.details === 'string');

        teardown();
    });
});
