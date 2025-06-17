import { assertEquals } from "jsr:@std/assert@0.225.3";
import { spy, stub } from "jsr:@std/testing@0.225.1/mock";
import { 
    PromptAssembler, 
    ProjectContext, 
    SessionContext, 
    StageContext 
} from "./prompt-assembler.ts";
import { createSupabaseClient } from "./auth.ts";

Deno.test("PromptAssembler", async (t) => {
    await t.step("should correctly assemble and render a prompt for the initial stage", async () => {
        // We don't need a real client, just a placeholder object for the constructor.
        const mockDbClient = {} as any;
        const assembler = new PromptAssembler(mockDbClient);

        const project: ProjectContext = {
            id: "proj-123",
            project_name: "Test Project",
            initial_user_prompt: "This is the initial user prompt.",
            selected_domain_id: "domain-123",
            dialectic_domains: { name: "Software Development" },
            created_at: new Date().toISOString(),
            initial_prompt_resource_id: null,
            process_template_id: 'pt-123',
            repo_url: null,
            status: 'active',
            updated_at: new Date().toISOString(),
            user_id: 'user-123',
            selected_domain_overlay_id: null,
            user_domain_overlay_values: null,
        };

        const session: SessionContext = {
            id: "sess-123",
            project_id: "proj-123",
            selected_model_catalog_ids: ["model-1", "model-2"],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            current_stage_id: 'stage-123',
            iteration_count: 1,
            session_description: 'Test session',
            status: 'pending_thesis',
            associated_chat_id: null,
            user_input_reference_url: null
        };

        const stage: StageContext = {
            id: "stage-123",
            system_prompts: {
                prompt_text: "Analyze the following: {user_objective} based on {context_description}. There are {agent_count} agents. Domain standards: {domain_standards}"
            },
            domain_specific_prompt_overlays: [
                { 
                    overlay_values: { 
                        domain_standards: "Code must be SOLID.",
                        compliance_requirements: "Must be GDPR compliant."
                    } 
                }
            ],
            slug: 'initial-hypothesis',
            display_name: 'Initial hypothesis',
            description: 'Initial hypothesis stage',
            created_at: new Date().toISOString(),
            default_system_prompt_id: null,
            expected_output_artifacts: null,
            input_artifact_rules: null
        };

        const result = await assembler.assemble(project, session, stage, project.initial_user_prompt);
        
        assertEquals(result.includes("Analyze the following: Test Project based on This is the initial user prompt."), true);
        assertEquals(result.includes("There are 2 agents."), true);
        assertEquals(result.includes("Domain standards: Code must be SOLID."), true);
        assertEquals(result.includes("{compliance_requirements}"), false); // It's not in the base prompt, so it shouldn't be in the result.
    });
}); 