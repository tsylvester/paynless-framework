import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy } from "jsr:@std/testing@0.225.1/mock";
import { assemblePlannerPrompt } from "../../functions/_shared/prompt-assembler/assemblePlannerPrompt.ts";
import { render } from "../../functions/_shared/prompt-assembler/render.ts";
import { renderPrompt } from "../../functions/_shared/prompt-renderer.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  DynamicContextVariables,
  RenderFn,
  AssemblerSourceDocument,
} from "../../functions/_shared/prompt-assembler/prompt-assembler.interface.ts";
import {
  createMockSupabaseClient,
  type MockSupabaseDataConfig,
} from "../../functions/_shared/supabase.mock.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../functions/types_db.ts";
import {
  createMockFileManagerService,
} from "../../functions/_shared/services/file_manager.mock.ts";
import {
  FileType,
  type FileRecord,
} from "../../functions/_shared/types/file_manager.types.ts";
import {
  DialecticJobRow,
  DialecticRecipeStep,
  ContextForDocument,
  InputRule,
} from "../../functions/dialectic-service/dialectic.interface.ts";

/**
 * Integration test for assemblePlannerPrompt → render → renderPrompt pipeline.
 *
 * This bounded integration test exercises the REAL render and renderPrompt functions
 * (not mocks) to prove that sourceDocuments gathered from inputs_required are correctly
 * transformed into named template variables and substituted into the rendered prompt.
 *
 * Boundaries:
 *   - REAL: assemblePlannerPrompt, render, renderPrompt
 *   - MOCKED: database client, file manager, gatherContext
 */

// Template using actual planner format with dot-notation placeholders matching
// docs/prompts/antithesis/antithesis_planner_review_v1.md
const REALISTIC_PLANNER_TEMPLATE = `# Planner Prompt

## Project Objective
{{user_objective}}

## Domain
{{domain}}

## Original User Request
{{original_user_request}}

## Prior Work

### Thesis Documents
- Business Case: {{thesis_documents.business_case}}
- Feature Specification: {{thesis_documents.feature_spec}}
{{#section:thesis_feedback}}
### Thesis Feedback
- Business Case Feedback: {{thesis_feedback.business_case}}
- Feature Specification Feedback: {{thesis_feedback.feature_spec}}
{{/section:thesis_feedback}}

## Output Instructions
You must produce a header_context artifact.

### Context for Documents
{{context_for_documents}}
`;

const mockRecipeStep: DialecticRecipeStep = {
  id: "step-plan-123",
  template_id: "rt-plan-123",
  step_number: 1,
  step_key: "prepare-proposal-review-plan",
  step_slug: "prepare-proposal-review-plan",
  step_name: "PrepareProposalReviewPlan",
  job_type: "PLAN",
  prompt_type: "Planner",
  prompt_template_id: "spt-plan-template-123",
  output_type: FileType.HeaderContext,
  granularity_strategy: "all_to_one",
  inputs_required: [
    {
      type: "document",
      slug: "generate-thesis",
      section_header: "Thesis Documents",
      document_key: FileType.business_case,
      required: true,
      multiple: true,
    },
    {
      type: "feedback",
      slug: "user-feedback",
      section_header: "Thesis Feedback",
      document_key: FileType.business_case,
      required: false,
      multiple: true,
    },
  ],
  inputs_relevance: [],
  outputs_required: {
    context_for_documents: [
      {
        document_key: FileType.business_case_critique,
        content_to_include: { analysis_focus: "", key_concerns: [] },
      },
    ],
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  parallel_group: null,
  branch_key: null,
  step_description: "Generate a review plan for the proposal",
};

const defaultProject: ProjectContext = {
  id: "proj-int-123",
  user_id: "user-int-123",
  project_name: "Integration Test Project",
  initial_user_prompt: "Build a SaaS platform for project management.",
  initial_prompt_resource_id: "res-init-123",
  selected_domain_id: "domain-int-123",
  dialectic_domains: { name: "Software Development" },
  process_template_id: "pt-int-123",
  selected_domain_overlay_id: null,
  user_domain_overlay_values: null,
  repo_url: null,
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const defaultSession: SessionContext = {
  id: "sess-int-123",
  project_id: "proj-int-123",
  selected_model_ids: ["model-gemini-flash"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  current_stage_id: "stage-int-123",
  iteration_count: 1,
  session_description: "Integration test session",
  status: "pending_antithesis",
  associated_chat_id: null,
  user_input_reference_url: null,
};

const defaultStage: StageContext = {
  id: "stage-int-123",
  system_prompts: { prompt_text: "This should be overridden by the planner template." },
  domain_specific_prompt_overlays: [],
  slug: "antithesis-review",
  display_name: "Antithesis Review",
  description: "Antithesis review stage",
  created_at: new Date().toISOString(),
  default_system_prompt_id: "prompt-default-antithesis",
  active_recipe_instance_id: "instance-int-123",
  expected_output_template_ids: [],
  recipe_template_id: "recipe-template-int-123",
  recipe_step: mockRecipeStep,
};

const mockPlannerJob: DialecticJobRow = {
  id: "job-plan-int-123",
  job_type: "PLAN",
  payload: {
    model_id: "model-gemini-flash",
    model_slug: "gemini-2.5-flash",
  },
  session_id: defaultSession.id,
  stage_slug: defaultStage.slug,
  iteration_number: 1,
  status: "pending",
  user_id: defaultProject.user_id,
  is_test_job: true,
  created_at: new Date().toISOString(),
  attempt_count: 0,
  completed_at: null,
  error_details: null,
  parent_job_id: null,
  results: null,
  max_retries: 3,
  prerequisite_job_id: null,
  started_at: null,
  target_contribution_id: null,
};

Deno.test("assemblePlannerPrompt sourceDocuments integration", async (t) => {
  await t.step("renders sourceDocuments into the prompt via real render + renderPrompt pipeline", async () => {
    // --- ARRANGE ---

    // sourceDocuments simulating what gatherInputsForStage would return
    // for a recipe step with inputs_required referencing thesis documents and feedback
    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "res-thesis-biz-case-model-a",
        type: "document",
        content: "# Business Case\n\nThe proposed SaaS platform addresses a $2B market opportunity in project management. Key differentiators include AI-powered task prioritization and real-time collaboration features.",
        metadata: {
          displayName: "Thesis - Business Case",
          header: "Thesis Documents",
          modelName: "gemini-2.5-flash",
          documentKey: FileType.business_case,
        },
      },
      {
        id: "res-thesis-biz-case-model-b",
        type: "document",
        content: "# Business Case\n\nMarket analysis shows strong demand for integrated PM solutions. Revenue projections indicate $5M ARR within 18 months based on conservative adoption estimates.",
        metadata: {
          displayName: "Thesis - Business Case",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.business_case,
        },
      },
      {
        id: "res-thesis-feature-spec-model-a",
        type: "document",
        content: "# Feature Specification\n\nCore features include AI task assignment, collaborative workspaces, and integrated timeline management with dependency tracking.",
        metadata: {
          displayName: "Thesis - Feature Spec",
          header: "Thesis Documents",
          modelName: "gemini-2.5-flash",
          documentKey: FileType.feature_spec,
        },
      },
      {
        id: "res-feedback-biz-case",
        type: "feedback",
        content: "The business case needs more detailed competitive analysis. The revenue projections seem optimistic without supporting evidence for the adoption rate assumptions.",
        metadata: {
          displayName: "User Feedback - Business Case",
          header: "Thesis Feedback",
          documentKey: FileType.business_case,
        },
      },
      {
        id: "res-feedback-feature-spec",
        type: "feedback",
        content: "The feature specification should include more detail on accessibility requirements and mobile-first design considerations.",
        metadata: {
          displayName: "User Feedback - Feature Spec",
          header: "Thesis Feedback",
          documentKey: FileType.feature_spec,
        },
      },
    ];

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Review stage for thesis proposal",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: mockSourceDocuments,
    };

    // Mock gatherContext to return our prepared sourceDocuments
    const mockGatherContextFn = spy(async () => mockDynamicContext);

    // Use the REAL render function wired to the REAL renderPrompt
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    // Mock DB: return the realistic template and model details
    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: REALISTIC_PLANNER_TEMPLATE,
              document_template_id: null,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{
              id: "model-gemini-flash",
              name: "Gemini 2.5 Flash",
              provider: "google",
              slug: "gemini-2.5-flash",
            }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-int-456",
      project_id: defaultProject.id,
      file_name: "gemini-2.5-flash_1_PrepareProposalReviewPlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 500,
      resource_description: "Integration test planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    // --- ACT ---
    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    // --- ASSERT ---
    const rendered = result.promptContent;

    // 1. Dot-notation: business case content must appear in rendered prompt
    assert(
      rendered.includes("- Business Case:"),
      "Rendered prompt must have 'Business Case:' label",
    );
    assert(
      rendered.includes("$2B market opportunity"),
      "Business case content from gemini-2.5-flash must appear in rendered prompt",
    );
    assert(
      rendered.includes("$5M ARR within 18 months"),
      "Business case content from claude-3-opus must appear in rendered prompt",
    );
    assert(
      rendered.includes("AI-powered task prioritization"),
      "Business case must include key differentiators from gemini-2.5-flash",
    );

    // 2. Dot-notation: feature spec content must appear in rendered prompt
    assert(
      rendered.includes("- Feature Specification:"),
      "Rendered prompt must have 'Feature Specification:' label",
    );
    assert(
      rendered.includes("AI task assignment"),
      "Feature spec content must include AI task assignment",
    );
    assert(
      rendered.includes("collaborative workspaces"),
      "Feature spec content must include collaborative workspaces",
    );
    assert(
      rendered.includes("dependency tracking"),
      "Feature spec content must include dependency tracking",
    );

    // 3. Model attribution headers must be present for multi-model business case
    assert(
      rendered.includes("### gemini-2.5-flash"),
      "Rendered prompt must attribute business case content to gemini-2.5-flash",
    );
    assert(
      rendered.includes("### claude-3-opus"),
      "Rendered prompt must attribute business case content to claude-3-opus",
    );

    // 4. Conditional section: thesis_feedback section must be retained when feedback provided
    assert(
      rendered.includes("### Thesis Feedback"),
      "Conditional section header must be retained when thesis_feedback exists",
    );
    assert(
      rendered.includes("Business Case Feedback:"),
      "Thesis Feedback section must include Business Case Feedback label",
    );
    assert(
      rendered.includes("Feature Specification Feedback:"),
      "Thesis Feedback section must include Feature Specification Feedback label",
    );
    assert(
      rendered.includes("competitive analysis"),
      "Business case feedback content must appear in rendered prompt",
    );
    assert(
      rendered.includes("accessibility requirements"),
      "Feature spec feedback content must appear in rendered prompt",
    );

    // 5. Standard context variables must still be substituted
    assert(
      rendered.includes("Build a SaaS platform"),
      "Rendered prompt must contain the user_objective",
    );
    assert(
      rendered.includes("Software Development"),
      "Rendered prompt must contain the domain",
    );
    assert(
      rendered.includes("AI-powered project management tool"),
      "Rendered prompt must contain the original_user_request",
    );

    // 6. context_for_documents must be injected (as JSON since it's an object)
    assert(
      rendered.includes("business_case_critique"),
      "Rendered prompt must contain context_for_documents with document keys",
    );

    // 7. No raw {{placeholders}} should remain (outside code blocks)
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(
      leftoverPlaceholders,
      null,
      `No unresolved placeholders should remain in the rendered prompt. Found: ${JSON.stringify(leftoverPlaceholders)}`,
    );

    // 8. Verify the file was saved (upload was called)
    assertEquals(fileManager.uploadAndRegisterFile.calls.length, 1);

    mockSupabaseSetup.clearAllStubs?.();
  });

  await t.step("renders empty sections gracefully when sourceDocuments is empty", async () => {
    // --- ARRANGE ---
    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform",
      domain: "Software Development",
      context_description: "First stage plan with no prior work",
      original_user_request: "I want to build an AI-powered tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: [],
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);

    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{
              prompt_text: REALISTIC_PLANNER_TEMPLATE,
              document_template_id: null,
            }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{
              id: "model-gemini-flash",
              name: "Gemini 2.5 Flash",
              provider: "google",
              slug: "gemini-2.5-flash",
            }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-planner-resource-int-empty",
      project_id: defaultProject.id,
      file_name: "gemini-2.5-flash_1_PrepareProposalReviewPlan_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/mock/planner_prompt.md",
      mime_type: "text/markdown",
      size_bytes: 100,
      resource_description: "Integration test planner prompt (empty docs)",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: defaultProject.user_id,
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    // --- ACT ---
    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    // --- ASSERT ---
    const rendered = result.promptContent;

    // 1. When no sourceDocuments exist, dot-notation placeholders are removed by
    // renderPrompt's cleanup logic (lines with unknown variables are deleted)
    assert(
      !rendered.includes("{{thesis_documents.business_case}}"),
      "Unresolved business case placeholder must be removed",
    );
    assert(
      !rendered.includes("{{thesis_documents.feature_spec}}"),
      "Unresolved feature spec placeholder must be removed",
    );

    // 2. Conditional section {{#section:thesis_feedback}} must be removed entirely when no feedback
    assert(
      !rendered.includes("### Thesis Feedback"),
      "Thesis Feedback section header must be removed when no feedback documents exist",
    );
    assert(
      !rendered.includes("Business Case Feedback:"),
      "Thesis Feedback content labels must be removed when section is removed",
    );
    assert(
      !rendered.includes("{{#section:thesis_feedback}}"),
      "Section opening tag must be removed",
    );
    assert(
      !rendered.includes("{{/section:thesis_feedback}}"),
      "Section closing tag must be removed",
    );

    // 3. Standard context variables must still be substituted
    assert(
      rendered.includes("Build a SaaS platform"),
      "Rendered prompt must still contain the user_objective when sourceDocuments is empty",
    );

    // 4. context_for_documents must still be present
    assert(
      rendered.includes("business_case_critique"),
      "Rendered prompt must still contain context_for_documents when sourceDocuments is empty",
    );

    // 5. No raw {{placeholders}} should remain
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(
      leftoverPlaceholders,
      null,
      `No unresolved placeholders should remain. Found: ${JSON.stringify(leftoverPlaceholders)}`,
    );

    mockSupabaseSetup.clearAllStubs?.();
  });
});

Deno.test("assemblePlannerPrompt: Thesis planner template", async (t) => {
  // Thesis stage has no prior work - only seed prompt and stage info
  const THESIS_PLANNER_TEMPLATE = `# Thesis Planner
  
## Inputs
- **User Objective**: {{original_user_request}}
- **Domain**: {{domain}}

## Expected Output
{{outputs_required}}`;

  await t.step("renders thesis planner without prior work documents", async () => {
    const mockRecipeStep: DialecticRecipeStep = {
      id: "step-thesis-123",
      template_id: "rt-thesis-123",
      step_number: 1,
      step_key: "generate-thesis",
      step_slug: "generate-thesis",
      step_name: "GenerateThesis",
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "spt-thesis-planner-123",
      output_type: FileType.HeaderContext,
      granularity_strategy: "all_to_one",
      inputs_required: [],
      inputs_relevance: [],
      outputs_required: {
        context_for_documents: [
          { document_key: FileType.business_case, content_to_include: {} },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel_group: null,
      branch_key: null,
      step_description: "Generate initial thesis documents",
    };

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Initial thesis generation",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: [], // Thesis has no prior work
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: THESIS_PLANNER_TEMPLATE, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{ id: "model-gemini-flash", name: "Gemini 2.5 Flash", provider: "google", slug: "gemini-2.5-flash" }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-thesis-planner-resource",
      project_id: "project-123",
      file_name: "gemini_1_GenerateThesis_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/thesis/planner.md",
      mime_type: "text/markdown",
      size_bytes: 300,
      resource_description: "Thesis planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: "user-123",
      session_id: "session-123",
      stage_slug: "thesis",
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const defaultProject: ProjectContext = {
      id: "proj-thesis-123",
      user_id: "user-thesis-123",
      project_name: "Thesis Test Project",
      initial_user_prompt: "Build a SaaS platform for project management.",
      initial_prompt_resource_id: "res-thesis-init-123",
      selected_domain_id: "domain-thesis-123",
      dialectic_domains: { name: "Software Development" },
      process_template_id: "pt-thesis-123",
      selected_domain_overlay_id: null,
      user_domain_overlay_values: null,
      repo_url: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
      id: "sess-thesis-123",
      project_id: "proj-thesis-123",
      selected_model_ids: ["model-gemini-flash"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_stage_id: "stage-thesis-123",
      iteration_count: 1,
      session_description: "Thesis test session",
      status: "pending_thesis",
      associated_chat_id: null,
      user_input_reference_url: null,
    };

    const defaultStage: StageContext = {
      id: "stage-thesis-123",
      system_prompts: { prompt_text: THESIS_PLANNER_TEMPLATE },
      domain_specific_prompt_overlays: [],
      slug: "thesis",
      display_name: "Thesis",
      description: "Thesis generation stage",
      created_at: new Date().toISOString(),
      default_system_prompt_id: "prompt-default-thesis",
      active_recipe_instance_id: "instance-thesis-123",
      expected_output_template_ids: [],
      recipe_template_id: "recipe-template-thesis-123",
      recipe_step: mockRecipeStep,
    };

    const mockPlannerJob: DialecticJobRow = {
      id: "job-thesis-planner",
      job_type: "PLAN",
      payload: {
        model_id: "model-gemini-flash",
        model_slug: "gemini-2.5-flash",
      },
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      status: "pending",
      user_id: defaultProject.user_id,
      is_test_job: true,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      parent_job_id: null,
      results: null,
      max_retries: 3,
      prerequisite_job_id: null,
      started_at: null,
      target_contribution_id: null,
    };

    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    const rendered = result.promptContent;

    // Thesis has no prior work, so we just verify standard variables are substituted
    assert(
      rendered.includes("AI-powered project management tool"),
      "Thesis planner must contain original_user_request",
    );
    assert(
      rendered.includes("Software Development"),
      "Thesis planner must contain domain",
    );

    // No unresolved placeholders
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(leftoverPlaceholders, null, "No unresolved placeholders in thesis planner");

    mockSupabaseSetup.clearAllStubs?.();
  });
});

Deno.test("assemblePlannerPrompt: Synthesis Pairwise planner template", async (t) => {
  const SYNTHESIS_PAIRWISE_TEMPLATE = `# Synthesis Pairwise Planner

## Inputs
- **Thesis Documents**:
  - Business Cases: {{thesis_documents.business_case}}
  - Feature Specifications: {{thesis_documents.feature_spec}}
- **Antithesis Documents**:
  - Business Case Critiques: {{antithesis_documents.business_case_critique}}
  - Technical Feasibility Assessments: {{antithesis_documents.technical_feasibility_assessment}}
{{#section:antithesis_feedback}}
- **Antithesis Feedback**:
  - Business Case Critique Feedback: {{antithesis_feedback.business_case_critique}}
{{/section:antithesis_feedback}}

## Output
{{context_for_documents}}`;

  await t.step("renders synthesis pairwise with thesis and antithesis documents", async () => {
    const mockRecipeStep: DialecticRecipeStep = {
      id: "step-synthesis-pairwise-123",
      template_id: "rt-synthesis-pairwise-123",
      step_number: 1,
      step_key: "synthesis-pairwise",
      step_slug: "synthesis-pairwise",
      step_name: "SynthesisPairwise",
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "spt-synthesis-pairwise-123",
      output_type: FileType.HeaderContext,
      granularity_strategy: "all_to_one",
      inputs_required: [
        { type: "document", slug: "thesis", document_key: FileType.business_case, section_header: "Thesis Documents", required: true, multiple: true },
        { type: "document", slug: "antithesis", document_key: FileType.business_case_critique, section_header: "Antithesis Documents", required: true, multiple: true },
        { type: "feedback", slug: "antithesis", document_key: FileType.business_case_critique, section_header: "Antithesis Feedback", required: false, multiple: true },
      ],
      inputs_relevance: [],
      outputs_required: {
        context_for_documents: [
          {
            document_key: FileType.business_case,
            content_to_include: { analysis_focus: "", key_concerns: [] },
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel_group: null,
      branch_key: null,
      step_description: "Pairwise synthesis of thesis and antithesis documents",
    };

    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "thesis-bc",
        type: "document",
        content: "# Business Case\n\nMarket opportunity analysis shows strong demand.",
        metadata: {
          displayName: "Thesis Business Case",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.business_case,
        },
      },
      {
        id: "thesis-fs",
        type: "document",
        content: "# Feature Spec\n\nCore features include AI task management.",
        metadata: {
          displayName: "Thesis Feature Spec",
          header: "Thesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.feature_spec,
        },
      },
      {
        id: "anti-bc-critique",
        type: "document",
        content: "# Business Case Critique\n\nThe market analysis needs more competitive research.",
        metadata: {
          displayName: "Antithesis Business Case Critique",
          header: "Antithesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.business_case_critique,
        },
      },
      {
        id: "anti-tfa",
        type: "document",
        content: "# Technical Feasibility\n\nThe proposed architecture is sound but needs scaling consideration.",
        metadata: {
          displayName: "Antithesis Technical Feasibility",
          header: "Antithesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.technical_feasibility_assessment,
        },
      },
      {
        id: "feedback-bc-critique",
        type: "feedback",
        content: "The business case critique should address pricing strategy more directly.",
        metadata: {
          displayName: "Feedback on Business Case Critique",
          header: "Antithesis Feedback",
          documentKey: FileType.business_case_critique,
        },
      },
    ];

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Pairwise synthesis",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: mockSourceDocuments,
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: SYNTHESIS_PAIRWISE_TEMPLATE, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{ id: "model-claude", name: "Claude", provider: "anthropic", slug: "claude-3-opus" }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-synthesis-pairwise-resource",
      project_id: "project-123",
      file_name: "claude_1_SynthesisPairwise_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/synthesis/planner.md",
      mime_type: "text/markdown",
      size_bytes: 400,
      resource_description: "Synthesis pairwise planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: "user-123",
      session_id: "session-123",
      stage_slug: "synthesis",
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const defaultProject: ProjectContext = {
      id: "proj-synthesis-123",
      user_id: "user-synthesis-123",
      project_name: "Synthesis Pairwise Test Project",
      initial_user_prompt: "Build a SaaS platform for project management.",
      initial_prompt_resource_id: "res-synthesis-init-123",
      selected_domain_id: "domain-synthesis-123",
      dialectic_domains: { name: "Software Development" },
      process_template_id: "pt-synthesis-123",
      selected_domain_overlay_id: null,
      user_domain_overlay_values: null,
      repo_url: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
      id: "sess-synthesis-123",
      project_id: "proj-synthesis-123",
      selected_model_ids: ["model-claude"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_stage_id: "stage-synthesis-123",
      iteration_count: 1,
      session_description: "Synthesis pairwise test session",
      status: "pending_synthesis",
      associated_chat_id: null,
      user_input_reference_url: null,
    };

    const defaultStage: StageContext = {
      id: "stage-synthesis-123",
      system_prompts: { prompt_text: SYNTHESIS_PAIRWISE_TEMPLATE },
      domain_specific_prompt_overlays: [],
      slug: "synthesis",
      display_name: "Synthesis",
      description: "Synthesis pairwise stage",
      created_at: new Date().toISOString(),
      default_system_prompt_id: "prompt-default-synthesis",
      active_recipe_instance_id: "instance-synthesis-123",
      expected_output_template_ids: [],
      recipe_template_id: "recipe-template-synthesis-123",
      recipe_step: mockRecipeStep,
    };

    const mockPlannerJob: DialecticJobRow = {
      id: "job-synthesis-pairwise-planner",
      job_type: "PLAN",
      payload: {
        model_id: "model-claude",
        model_slug: "claude-3-opus",
      },
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      status: "pending",
      user_id: defaultProject.user_id,
      is_test_job: true,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      parent_job_id: null,
      results: null,
      max_retries: 3,
      prerequisite_job_id: null,
      started_at: null,
      target_contribution_id: null,
    };

    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    const rendered = result.promptContent;

    // Verify thesis documents appear
    assert(
      rendered.includes("Market opportunity analysis"),
      "Must include thesis business case content",
    );
    assert(
      rendered.includes("AI task management"),
      "Must include thesis feature spec content",
    );

    // Verify antithesis documents appear
    assert(
      rendered.includes("competitive research"),
      "Must include antithesis business case critique content",
    );
    assert(
      rendered.includes("scaling consideration"),
      "Must include antithesis technical feasibility content",
    );

    // Verify conditional feedback section appears
    assert(
      rendered.includes("Antithesis Feedback"),
      "Must include antithesis feedback section header",
    );
    assert(
      rendered.includes("pricing strategy"),
      "Must include antithesis feedback content",
    );

    // No unresolved placeholders
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(leftoverPlaceholders, null, "No unresolved placeholders in synthesis pairwise planner");

    mockSupabaseSetup.clearAllStubs?.();
  });
});

Deno.test("assemblePlannerPrompt: Synthesis Final planner template", async (t) => {
  // Synthesis Final references consolidated synthesis documents
  const SYNTHESIS_FINAL_TEMPLATE = `# Synthesis Final Planner

## Inputs
- **Consolidated Synthesis Documents**:
  - Business Case: {{synthesis_documents.product_requirements}}
  - System Architecture: {{synthesis_documents.system_architecture}}
  - Tech Stack: {{synthesis_documents.tech_stack}}
{{#section:synthesis_feedback}}
- **Synthesis Feedback**:
  - PRD Feedback: {{synthesis_feedback.product_requirements}}
  - Architecture Feedback: {{synthesis_feedback.system_architecture}}
{{/section:synthesis_feedback}}

## Output
{{context_for_documents}}`;

  await t.step("renders synthesis final with consolidated documents", async () => {
    const mockRecipeStep: DialecticRecipeStep = {
      id: "step-synthesis-final-123",
      template_id: "rt-synthesis-final-123",
      step_number: 1,
      step_key: "synthesis-final",
      step_slug: "synthesis-final",
      step_name: "SynthesisFinal",
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "spt-synthesis-final-123",
      output_type: FileType.HeaderContext,
      granularity_strategy: "all_to_one",
      inputs_required: [
        { type: "document", slug: "synthesis", document_key: FileType.product_requirements, section_header: "Synthesis Documents", required: true, multiple: false },
        { type: "feedback", slug: "synthesis", document_key: FileType.product_requirements, section_header: "Synthesis Feedback", required: false, multiple: true },
      ],
      inputs_relevance: [],
      outputs_required: {
        context_for_documents: [
          {
            document_key: FileType.product_requirements,
            content_to_include: { analysis_focus: "", key_concerns: [] },
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel_group: null,
      branch_key: null,
      step_description: "Final synthesis planning",
    };

    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "synthesis-prd",
        type: "document",
        content: "# Product Requirements\n\nConsolidated requirements from all models.",
        metadata: {
          displayName: "Synthesis PRD",
          header: "Synthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.product_requirements,
        },
      },
      {
        id: "synthesis-arch",
        type: "document",
        content: "# System Architecture\n\nUnified architecture design.",
        metadata: {
          displayName: "Synthesis Architecture",
          header: "Synthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.system_architecture,
        },
      },
      {
        id: "synthesis-tech",
        type: "document",
        content: "# Tech Stack\n\nRecommended technology choices.",
        metadata: {
          displayName: "Synthesis Tech Stack",
          header: "Synthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.tech_stack,
        },
      },
      {
        id: "feedback-prd",
        type: "feedback",
        content: "The PRD needs more detail on non-functional requirements.",
        metadata: {
          displayName: "PRD Feedback",
          header: "Synthesis Feedback",
          documentKey: FileType.product_requirements,
        },
      },
      {
        id: "feedback-arch",
        type: "feedback",
        content: "Architecture should address disaster recovery.",
        metadata: {
          displayName: "Architecture Feedback",
          header: "Synthesis Feedback",
          documentKey: FileType.system_architecture,
        },
      },
    ];

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Final synthesis planning",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: mockSourceDocuments,
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: SYNTHESIS_FINAL_TEMPLATE, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{ id: "model-claude", name: "Claude", provider: "anthropic", slug: "claude-3-opus" }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-synthesis-final-resource",
      project_id: "proj-syn-final-123",
      file_name: "claude_1_SynthesisFinal_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/synthesis-final/planner.md",
      mime_type: "text/markdown",
      size_bytes: 400,
      resource_description: "Synthesis final planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: "user-syn-final-123",
      session_id: "sess-syn-final-123",
      stage_slug: "synthesis",
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const defaultProject: ProjectContext = {
      id: "proj-syn-final-123",
      user_id: "user-syn-final-123",
      project_name: "Synthesis Final Test Project",
      initial_user_prompt: "Build a SaaS platform for project management.",
      initial_prompt_resource_id: "res-syn-final-init-123",
      selected_domain_id: "domain-syn-final-123",
      dialectic_domains: { name: "Software Development" },
      process_template_id: "pt-syn-final-123",
      selected_domain_overlay_id: null,
      user_domain_overlay_values: null,
      repo_url: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
      id: "sess-syn-final-123",
      project_id: "proj-syn-final-123",
      selected_model_ids: ["model-claude"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_stage_id: "stage-syn-final-123",
      iteration_count: 1,
      session_description: "Synthesis final test session",
      status: "pending_synthesis",
      associated_chat_id: null,
      user_input_reference_url: null,
    };

    const defaultStage: StageContext = {
      id: "stage-syn-final-123",
      system_prompts: { prompt_text: SYNTHESIS_FINAL_TEMPLATE },
      domain_specific_prompt_overlays: [],
      slug: "synthesis",
      display_name: "Synthesis Final",
      description: "Synthesis final stage",
      created_at: new Date().toISOString(),
      default_system_prompt_id: "prompt-default-synthesis-final",
      active_recipe_instance_id: "instance-syn-final-123",
      expected_output_template_ids: [],
      recipe_template_id: "recipe-template-syn-final-123",
      recipe_step: mockRecipeStep,
    };

    const mockPlannerJob: DialecticJobRow = {
      id: "job-synthesis-final-planner",
      job_type: "PLAN",
      payload: {
        model_id: "model-claude",
        model_slug: "claude-3-opus",
      },
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      status: "pending",
      user_id: defaultProject.user_id,
      is_test_job: true,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      parent_job_id: null,
      results: null,
      max_retries: 3,
      prerequisite_job_id: null,
      started_at: null,
      target_contribution_id: null,
    };

    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    const rendered = result.promptContent;

    // Verify consolidated synthesis documents appear
    assert(
      rendered.includes("Consolidated requirements from all models"),
      "Must include synthesis PRD content",
    );
    assert(
      rendered.includes("Unified architecture design"),
      "Must include synthesis architecture content",
    );
    assert(
      rendered.includes("Recommended technology choices"),
      "Must include synthesis tech stack content",
    );

    // Verify conditional feedback section appears
    assert(
      rendered.includes("Synthesis Feedback"),
      "Must include synthesis feedback section header",
    );
    assert(
      rendered.includes("non-functional requirements"),
      "Must include PRD feedback content",
    );
    assert(
      rendered.includes("disaster recovery"),
      "Must include architecture feedback content",
    );

    // No unresolved placeholders
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(leftoverPlaceholders, null, "No unresolved placeholders in synthesis final planner");

    mockSupabaseSetup.clearAllStubs?.();
  });
});

Deno.test("assemblePlannerPrompt: Parenthesis planner template", async (t) => {
  const PARENTHESIS_PLANNER_TEMPLATE = `# Parenthesis Planner

## Inputs
- **Synthesis Documents**:
  - PRD: {{synthesis_documents.product_requirements}}
  - System Architecture: {{synthesis_documents.system_architecture}}
{{#section:synthesis_feedback}}
- **Synthesis Feedback**:
  - PRD Feedback: {{synthesis_feedback.product_requirements}}
{{/section:synthesis_feedback}}
{{#section:parenthesis_documents}}
- **Prior Parenthesis Documents**:
  - Master Plan: {{parenthesis_documents.master_plan}}
{{/section:parenthesis_documents}}

## Output
{{context_for_documents}}`;

  await t.step("renders parenthesis planner with synthesis and optional iteration documents", async () => {
    const mockRecipeStep: DialecticRecipeStep = {
      id: "step-parenthesis-123",
      template_id: "rt-parenthesis-123",
      step_number: 1,
      step_key: "parenthesis-planning",
      step_slug: "parenthesis-planning",
      step_name: "ParenthesisPlanning",
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "spt-parenthesis-123",
      output_type: FileType.HeaderContext,
      granularity_strategy: "all_to_one",
      inputs_required: [
        { type: "document", slug: "synthesis", document_key: FileType.product_requirements, section_header: "Synthesis Documents", required: true, multiple: false },
        { type: "document", slug: "synthesis", document_key: FileType.system_architecture, section_header: "Synthesis Documents", required: true, multiple: false },
        { type: "feedback", slug: "synthesis", document_key: FileType.product_requirements, section_header: "Synthesis Feedback", required: false, multiple: true },
        { type: "document", slug: "parenthesis", document_key: FileType.master_plan, section_header: "Parenthesis Documents", required: false, multiple: false },
      ],
      inputs_relevance: [],
      outputs_required: {
        context_for_documents: [
          {
            document_key: FileType.master_plan,
            content_to_include: { analysis_focus: "", key_concerns: [] },
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel_group: null,
      branch_key: null,
      step_description: "Parenthesis stage planning for implementation",
    };

    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "synthesis-prd",
        type: "document",
        content: "# Product Requirements\n\nFinal consolidated requirements document.",
        metadata: {
          displayName: "Synthesis PRD",
          header: "Synthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.product_requirements,
        },
      },
      {
        id: "synthesis-arch",
        type: "document",
        content: "# System Architecture\n\nFinal architecture design with component diagrams.",
        metadata: {
          displayName: "Synthesis Architecture",
          header: "Synthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.system_architecture,
        },
      },
      {
        id: "feedback-prd",
        type: "feedback",
        content: "The PRD should include more specific acceptance criteria for each feature.",
        metadata: {
          displayName: "PRD Feedback",
          header: "Synthesis Feedback",
          documentKey: FileType.product_requirements,
        },
      },
      {
        id: "parenthesis-master-plan",
        type: "document",
        content: "# Master Plan\n\nPhase 1: Foundation\nPhase 2: Core Features\nPhase 3: Advanced Features",
        metadata: {
          displayName: "Master Plan (iteration)",
          header: "Parenthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.master_plan,
        },
      },
    ];

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Parenthesis planning",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: mockSourceDocuments,
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: PARENTHESIS_PLANNER_TEMPLATE, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{ id: "model-claude", name: "Claude", provider: "anthropic", slug: "claude-3-opus" }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-parenthesis-resource",
      project_id: "proj-parent-123",
      file_name: "claude_1_ParenthesisPlanning_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/parenthesis/planner.md",
      mime_type: "text/markdown",
      size_bytes: 400,
      resource_description: "Parenthesis planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: "user-parent-123",
      session_id: "sess-parent-123",
      stage_slug: "parenthesis",
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const defaultProject: ProjectContext = {
      id: "proj-parent-123",
      user_id: "user-parent-123",
      project_name: "Parenthesis Test Project",
      initial_user_prompt: "Build a SaaS platform for project management.",
      initial_prompt_resource_id: "res-parent-init-123",
      selected_domain_id: "domain-parent-123",
      dialectic_domains: { name: "Software Development" },
      process_template_id: "pt-parent-123",
      selected_domain_overlay_id: null,
      user_domain_overlay_values: null,
      repo_url: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
      id: "sess-parent-123",
      project_id: "proj-parent-123",
      selected_model_ids: ["model-claude"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_stage_id: "stage-parent-123",
      iteration_count: 1,
      session_description: "Parenthesis test session",
      status: "pending_parenthesis",
      associated_chat_id: null,
      user_input_reference_url: null,
    };

    const defaultStage: StageContext = {
      id: "stage-parent-123",
      system_prompts: { prompt_text: PARENTHESIS_PLANNER_TEMPLATE },
      domain_specific_prompt_overlays: [],
      slug: "parenthesis",
      display_name: "Parenthesis",
      description: "Parenthesis planning stage",
      created_at: new Date().toISOString(),
      default_system_prompt_id: "prompt-default-parenthesis",
      active_recipe_instance_id: "instance-parent-123",
      expected_output_template_ids: [],
      recipe_template_id: "recipe-template-parent-123",
      recipe_step: mockRecipeStep,
    };

    const mockPlannerJob: DialecticJobRow = {
      id: "job-parenthesis-planner",
      job_type: "PLAN",
      payload: {
        model_id: "model-claude",
        model_slug: "claude-3-opus",
      },
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      status: "pending",
      user_id: defaultProject.user_id,
      is_test_job: true,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      parent_job_id: null,
      results: null,
      max_retries: 3,
      prerequisite_job_id: null,
      started_at: null,
      target_contribution_id: null,
    };

    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    const rendered = result.promptContent;

    // Verify synthesis documents appear
    assert(
      rendered.includes("Final consolidated requirements"),
      "Must include synthesis PRD content",
    );
    assert(
      rendered.includes("component diagrams"),
      "Must include synthesis architecture content",
    );

    // Verify conditional feedback section appears
    assert(
      rendered.includes("Synthesis Feedback"),
      "Must include synthesis feedback section header",
    );
    assert(
      rendered.includes("acceptance criteria"),
      "Must include PRD feedback content",
    );

    // Verify conditional section appears with prior parenthesis documents
    assert(
      rendered.includes("Prior Parenthesis Documents"),
      "Must include parenthesis documents section header",
    );
    assert(
      rendered.includes("Phase 1: Foundation"),
      "Must include master plan content from iteration",
    );

    // No unresolved placeholders
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(leftoverPlaceholders, null, "No unresolved placeholders in parenthesis planner");

    mockSupabaseSetup.clearAllStubs?.();
  });
});

Deno.test("assemblePlannerPrompt: Paralysis planner template", async (t) => {
  const PARALYSIS_PLANNER_TEMPLATE = `# Paralysis Planner

## Inputs
- **Parenthesis Documents**:
  - TRD: {{parenthesis_documents.technical_requirements}}
  - Master Plan: {{parenthesis_documents.master_plan}}
{{#section:parenthesis_feedback}}
- **Parenthesis Feedback**:
  - TRD Feedback: {{parenthesis_feedback.technical_requirements}}
{{/section:parenthesis_feedback}}
{{#section:paralysis_documents}}
- **Prior Paralysis Documents**:
  - Actionable Checklist: {{paralysis_documents.actionable_checklist}}
{{/section:paralysis_documents}}

## Output
{{context_for_documents}}`;

  await t.step("renders paralysis planner with parenthesis and optional iteration documents", async () => {
    const mockRecipeStep: DialecticRecipeStep = {
      id: "step-paralysis-123",
      template_id: "rt-paralysis-123",
      step_number: 1,
      step_key: "paralysis-planning",
      step_slug: "paralysis-planning",
      step_name: "ParalysisPlanning",
      job_type: "PLAN",
      prompt_type: "Planner",
      prompt_template_id: "spt-paralysis-123",
      output_type: FileType.HeaderContext,
      granularity_strategy: "all_to_one",
      inputs_required: [
        { type: "document", slug: "parenthesis", document_key: FileType.technical_requirements, section_header: "Parenthesis Documents", required: true, multiple: false },
        { type: "document", slug: "parenthesis", document_key: FileType.master_plan, section_header: "Parenthesis Documents", required: true, multiple: false },
        { type: "feedback", slug: "parenthesis", document_key: FileType.technical_requirements, section_header: "Parenthesis Feedback", required: false, multiple: true },
        { type: "document", slug: "paralysis", document_key: FileType.actionable_checklist, section_header: "Paralysis Documents", required: false, multiple: false },
      ],
      inputs_relevance: [],
      outputs_required: {
        context_for_documents: [
          {
            document_key: FileType.actionable_checklist,
            content_to_include: { analysis_focus: "", key_concerns: [] },
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel_group: null,
      branch_key: null,
      step_description: "Paralysis stage planning for implementation checklists",
    };

    const mockSourceDocuments: AssemblerSourceDocument[] = [
      {
        id: "parenthesis-trd",
        type: "document",
        content: "# Technical Requirements Document\n\nDetailed technical specifications for all subsystems.",
        metadata: {
          displayName: "TRD",
          header: "Parenthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.technical_requirements,
        },
      },
      {
        id: "parenthesis-master",
        type: "document",
        content: "# Master Plan\n\nMilestone-based implementation roadmap with dependency tracking.",
        metadata: {
          displayName: "Master Plan",
          header: "Parenthesis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.master_plan,
        },
      },
      {
        id: "feedback-trd",
        type: "feedback",
        content: "The TRD should include more specific database schema definitions.",
        metadata: {
          displayName: "TRD Feedback",
          header: "Parenthesis Feedback",
          documentKey: FileType.technical_requirements,
        },
      },
      {
        id: "paralysis-checklist",
        type: "document",
        content: "# Actionable Checklist\n\n## Milestone 1: Database Schema\n- [ ] Design user table\n- [ ] Design project table",
        metadata: {
          displayName: "Actionable Checklist (iteration)",
          header: "Paralysis Documents",
          modelName: "claude-3-opus",
          documentKey: FileType.actionable_checklist,
        },
      },
    ];

    const mockDynamicContext: DynamicContextVariables = {
      user_objective: "Build a SaaS platform for project management",
      domain: "Software Development",
      context_description: "Paralysis planning",
      original_user_request: "I want to build an AI-powered project management tool.",
      recipeStep: mockRecipeStep,
      sourceDocuments: mockSourceDocuments,
    };

    const mockGatherContextFn = spy(async () => mockDynamicContext);
    const realRenderFn: RenderFn = (renderPromptFn, stage, context, userOverlays) => {
      return render(renderPromptFn, stage, context, userOverlays);
    };

    const config: MockSupabaseDataConfig = {
      genericMockResults: {
        system_prompts: {
          select: {
            data: [{ prompt_text: PARALYSIS_PLANNER_TEMPLATE, document_template_id: null }],
            error: null,
          },
        },
        ai_providers: {
          select: {
            data: [{ id: "model-claude", name: "Claude", provider: "anthropic", slug: "claude-3-opus" }],
          },
        },
      },
    };

    const mockSupabaseSetup = createMockSupabaseClient(undefined, config);
    const client = mockSupabaseSetup.client as unknown as SupabaseClient<Database>;
    const fileManager = createMockFileManagerService();

    const mockFileRecord: FileRecord = {
      id: "mock-paralysis-resource",
      project_id: "proj-paralysis-123",
      file_name: "claude_1_ParalysisPlanning_planner_prompt.md",
      storage_bucket: "test-bucket",
      storage_path: "path/to/paralysis/planner.md",
      mime_type: "text/markdown",
      size_bytes: 400,
      resource_description: "Paralysis planner prompt",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: "user-paralysis-123",
      session_id: "sess-paralysis-123",
      stage_slug: "paralysis",
      iteration_number: 1,
      resource_type: "planner_prompt",
      source_contribution_id: null,
    };

    fileManager.setUploadAndRegisterFileResponse(mockFileRecord, null);

    const defaultProject: ProjectContext = {
      id: "proj-paralysis-123",
      user_id: "user-paralysis-123",
      project_name: "Paralysis Test Project",
      initial_user_prompt: "Build a SaaS platform for project management.",
      initial_prompt_resource_id: "res-paralysis-init-123",
      selected_domain_id: "domain-paralysis-123",
      dialectic_domains: { name: "Software Development" },
      process_template_id: "pt-paralysis-123",
      selected_domain_overlay_id: null,
      user_domain_overlay_values: null,
      repo_url: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const defaultSession: SessionContext = {
      id: "sess-paralysis-123",
      project_id: "proj-paralysis-123",
      selected_model_ids: ["model-claude"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_stage_id: "stage-paralysis-123",
      iteration_count: 1,
      session_description: "Paralysis test session",
      status: "pending_paralysis",
      associated_chat_id: null,
      user_input_reference_url: null,
    };

    const defaultStage: StageContext = {
      id: "stage-paralysis-123",
      system_prompts: { prompt_text: PARALYSIS_PLANNER_TEMPLATE },
      domain_specific_prompt_overlays: [],
      slug: "paralysis",
      display_name: "Paralysis",
      description: "Paralysis planning stage",
      created_at: new Date().toISOString(),
      default_system_prompt_id: "prompt-default-paralysis",
      active_recipe_instance_id: "instance-paralysis-123",
      expected_output_template_ids: [],
      recipe_template_id: "recipe-template-paralysis-123",
      recipe_step: mockRecipeStep,
    };

    const mockPlannerJob: DialecticJobRow = {
      id: "job-paralysis-planner",
      job_type: "PLAN",
      payload: {
        model_id: "model-claude",
        model_slug: "claude-3-opus",
      },
      session_id: defaultSession.id,
      stage_slug: defaultStage.slug,
      iteration_number: 1,
      status: "pending",
      user_id: defaultProject.user_id,
      is_test_job: true,
      created_at: new Date().toISOString(),
      attempt_count: 0,
      completed_at: null,
      error_details: null,
      parent_job_id: null,
      results: null,
      max_retries: 3,
      prerequisite_job_id: null,
      started_at: null,
      target_contribution_id: null,
    };

    const result = await assemblePlannerPrompt({
      dbClient: client,
      fileManager,
      job: mockPlannerJob,
      project: defaultProject,
      session: defaultSession,
      stage: defaultStage,
      projectInitialUserPrompt: defaultProject.initial_user_prompt,
      gatherContext: mockGatherContextFn,
      render: realRenderFn,
    });

    const rendered = result.promptContent;

    // Verify parenthesis documents appear
    assert(
      rendered.includes("Detailed technical specifications"),
      "Must include parenthesis TRD content",
    );
    assert(
      rendered.includes("Milestone-based implementation roadmap"),
      "Must include parenthesis master plan content",
    );

    // Verify conditional feedback section appears
    assert(
      rendered.includes("Parenthesis Feedback"),
      "Must include parenthesis feedback section header",
    );
    assert(
      rendered.includes("database schema definitions"),
      "Must include TRD feedback content",
    );

    // Verify conditional section appears with prior paralysis documents
    assert(
      rendered.includes("Prior Paralysis Documents"),
      "Must include paralysis documents section header",
    );
    assert(
      rendered.includes("Milestone 1: Database Schema"),
      "Must include actionable checklist content from iteration",
    );

    // No unresolved placeholders
    const leftoverPlaceholders = rendered.match(/{{[^}]+}}/g);
    assertEquals(leftoverPlaceholders, null, "No unresolved placeholders in paralysis planner");

    mockSupabaseSetup.clearAllStubs?.();
  });
});
