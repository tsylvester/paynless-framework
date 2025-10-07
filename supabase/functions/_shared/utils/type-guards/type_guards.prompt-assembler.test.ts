import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    isProjectContext,
    isStageContext,
} from './type_guards.prompt-assembler.ts';
import { ProjectContext, StageContext } from '../../prompt-assembler/prompt-assembler.interface.ts';

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
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
            expected_output_artifacts: null,
            input_artifact_rules: null,
        };
        assert(isStageContext(context));
    });

    await t.step('should return true for a stage context with null system_prompts', () => {
        const context: StageContext = {
            id: 's2',
            slug: 'antithesis',
            system_prompts: null,
            domain_specific_prompt_overlays: [{ overlay_values: {} }],
            created_at: '',
            default_system_prompt_id: null,
            description: null,
            display_name: '',
            expected_output_artifacts: null,
            input_artifact_rules: null,
        };
        assert(isStageContext(context));
    });

    await t.step('should return false if a required field is missing (slug)', () => {
        const invalidContext = {
            id: 's3',
            system_prompts: null,
            domain_specific_prompt_overlays: [],
        };
        assert(!isStageContext(invalidContext));
    });

    await t.step('should return false for a non-object', () => {
        assert(!isStageContext('a string'));
    });
});

