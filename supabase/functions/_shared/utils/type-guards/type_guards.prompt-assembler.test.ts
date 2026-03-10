import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    isProjectContext,
    isStageContext,
} from './type_guards.prompt-assembler.ts';
import { ProjectContext, StageContext } from '../../prompt-assembler/prompt-assembler.interface.ts';
import { DialecticStageRecipeStep } from '../../../dialectic-service/dialectic.interface.ts';
import { FileType } from '../../types/file_manager.types.ts';

const mockRecipeStep: DialecticStageRecipeStep = {
    id: 'step1',
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    granularity_strategy: 'all_to_one',
    inputs_required: [],
    inputs_relevance: [],
    outputs_required: [],
    step_slug: 'test-step',
    step_name: 'Test Step',
    execution_order: 1,
    branch_key: 'main',
    parallel_group: 1,
    is_skipped: false,
    config_override: {},
    output_overrides: {},
    object_filter: {},
    instance_id: 'inst1',
    step_key: 'testStep',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    prompt_template_id: null,
    template_step_id: null,
    output_type: FileType.business_case,
    step_description: 'A test step',
};

Deno.test('Type Guard: isProjectContext', async (t) => {
    await t.step('should return true for a valid project context object', () => {
        const context: ProjectContext = {
            id: 'p1',
            project_name: 'Test Project',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: { name: 'Software Engineering' },
            created_at: '',
            initial_prompt_resource_id: null,
            process_template_id: null,
            repo_url: null,
            selected_domain_id: '',
            selected_domain_overlay_id: null,
            status: '',
            updated_at: '',
            user_domain_overlay_values: null,
            user_id: ''
        };
        assert(isProjectContext(context));
    });

    await t.step('should return false if a required field is missing (project_name)', () => {
        const invalidContext = {
            id: 'p2',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: { name: 'Data Science' },
        };
        assert(!isProjectContext(invalidContext));
    });

    await t.step('should return false if a nested required field is missing (dialectic_domains.name)', () => {
        const invalidContext = {
            id: 'p3',
            project_name: 'Test Project 3',
            initial_user_prompt: 'Do a thing',
            dialectic_domains: {},
        };
        assert(!isProjectContext(invalidContext));
    });

    await t.step('should return false for null', () => {
        assert(!isProjectContext(null));
    });
});

Deno.test('Type Guard: isStageContext', async (t) => {
    await t.step('should return true for a valid stage context object', () => {
        const context: StageContext = {
            id: 's1',
            slug: 'thesis',
            system_prompts: { prompt_text: 'test' },
            domain_specific_prompt_overlays: [],
            recipe_step: mockRecipeStep,
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
            active_recipe_instance_id: null,
            expected_output_template_ids: [],
            recipe_template_id: null,
        };
        assert(isStageContext(context));
    });

    await t.step('should return false if recipe_step is missing', () => {
        const invalidContext = {
            id: 's2',
            slug: 'antithesis',
            system_prompts: null,
            domain_specific_prompt_overlays: [{ overlay_values: {} }],
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
        };
        assert(!isStageContext(invalidContext));
    });

    await t.step('should return false if a required field is missing (slug)', () => {
        const invalidContext = {
            id: 's3',
            system_prompts: null,
            domain_specific_prompt_overlays: [],
            recipe_step: mockRecipeStep,
        };
        assert(!isStageContext(invalidContext));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isStageContext('a string'));
    });
});

