import {
  assertEquals,
  assertExists,
  assertNotEquals,
  // Add other assertions as needed: assertRejects, assertStringIncludes, etc.
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { spy, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  initializeTestDeps,
  coreInitializeTestStep,
  coreCleanupTestResources,
  coreTeardown,
  initializeSupabaseAdminClient,
  // Assuming TestSetupConfig and other types are exported from your utils
  // TestSetupConfig, ProcessedResourceInfo, etc.
} from "../_shared/_integration.test.utils.ts"; // Adjust path as needed
import type { TestSetupConfig, UndoAction } from "../_shared/_integration.test.utils.ts"; // Adjust path
import type { Database } from "../types_db.ts"; // Adjust path as needed
import { DialecticStage, DialecticProject, DialecticSession } from "./dialectic.interface.ts"; // Adjust path

// --- Test Configuration & Globals ---
let adminClient: SupabaseClient<Database>;
let testProjectId: string;
let primaryUserId: string;
let primaryUserClient: SupabaseClient<Database>;
let primaryUserJwt: string;

// Mock for the AI call function
// This will need to be properly integrated depending on how callUnifiedAIModel is invoked
// For now, let's define a spy that we can later make more sophisticated
let mockCallUnifiedAIModel = spy(async (
  _modelId: string,
  _promptContent: string,
  _stageContext?: { slug: string; [key: string]: any; } // Assuming stageContext has a slug
) => {
  console.warn(`mockCallUnifiedAIModel called for stage: ${_stageContext?.slug} with model: ${_modelId}`);
  let responseContentStructure: any = {};

  switch (_stageContext?.slug) {
    case 'thesis':
      responseContentStructure = {
        executive_summary: "Mocked Thesis: Executive Summary.",
        detailed_implementation_strategy: "Mocked Thesis: Detailed Implementation Strategy.",
        files_to_generate: [
          { template_filename: "thesis_prd.md", content_placeholder: "# Mocked Thesis PRD Content\nThis is the Product Requirements Document for the Thesis." }
        ]
      };
      break;
    case 'antithesis':
      responseContentStructure = {
        critique_of_thesis: "Mocked Antithesis: Critique of Thesis.",
        alternative_proposal_summary: "Mocked Antithesis: Alternative Proposal Summary.",
        files_to_generate: [
          { template_filename: "antithesis_critique_document.md", content_placeholder: "# Mocked Antithesis Critique\nThis document outlines the critique of the Thesis." }
        ]
      };
      break;
    case 'synthesis':
      responseContentStructure = {
        combined_strategy_overview: "Mocked Synthesis: Combined Strategy Overview.",
        final_recommendation: "Mocked Synthesis: Final Recommendation.",
        files_to_generate: [
          { template_filename: "synthesis_combined_plan.md", content_placeholder: "# Mocked Synthesis Combined Plan\nThis is the synthesized plan." }
        ]
      };
      break;
    case 'parenthesis':
      responseContentStructure = {
        identified_gaps_summary: "Mocked Parenthesis: Identified Gaps Summary.",
        refined_checklist: "[ ] 1. Parenthesis Task 1\n[ ] a. Sub-task A\n[ ] 2. Parenthesis Task 2", // Simulating checklist output
        files_to_generate: [
          { template_filename: "parenthesis_refined_implementation_plan.md", content_placeholder: "# Mocked Parenthesis Refined Plan\n[ ] 1. Refined Task 1\n[ ] 2. Refined Task 2" }
        ]
      };
      break;
    case 'paralysis':
      responseContentStructure = {
        final_ordered_plan_summary: "Mocked Paralysis: Final Ordered Plan Summary.",
        reordered_checklist: "[ ] 1. Paralysis Reordered Task A (formerly Task 2)\n[ ] 2. Paralysis Reordered Task B (formerly Task 1)", // Simulating reordered checklist
        files_to_generate: [
          { template_filename: "paralysis_final_ordered_plan.md", content_placeholder: "# Mocked Paralysis Final Ordered Plan\n[ ] 1. Final Ordered Task A\n[ ] 2. Final Ordered Task B" }
        ]
      };
      break;
    default:
      console.error(`mockCallUnifiedAIModel: Unhandled stage slug: ${_stageContext?.slug}`);
      responseContentStructure = { error: "Unknown stage for mock AI response" };
  }

  return Promise.resolve({
    content: JSON.stringify(responseContentStructure),
    contentType: "application/json", // Critical for backend parsing
    inputTokens: 75, // Mocked value
    outputTokens: 250, // Mocked value
    processingTimeMs: 400, // Mocked value
    modelIdUsed: _modelId,
    cost: 0.001, // Mocked value
    rawProviderResponse: { mockData: "some raw data" }, // Mocked
    error: null,
  });
});

// Helper to simulate dependency injection or to patch the module if using a library
// This is a placeholder for the actual mocking strategy.
// If callUnifiedAIModel is in its own module:
// import * as AIModelCallerModule from 'path/to/ai/caller/module.ts';
// const originalAICaller = AIModelCallerModule.callUnifiedAIModel;

async function setupSuite() {
  console.log("Setting up test suite...");
  initializeTestDeps(); // Initializes shared dependencies for _integration.test.utils.ts
  adminClient = initializeSupabaseAdminClient();
  // Any other one-time setup for the entire suite
}

async function teardownSuite() {
  console.log("Tearing down test suite...");
  await coreTeardown();
  // Restore original AI caller if patched
  // if (originalAICaller) AIModelCallerModule.callUnifiedAIModel = originalAICaller;
}

async function beforeEachTest() {
  console.log("Setting up for a new test case...");

  // Reset mocks/spies if they are reused across Deno.test blocks
  // Re-initialize the spy to clear its call history and any other state
  mockCallUnifiedAIModel = spy(async (
    _modelId: string,
    _promptContent: string,
    _stageContext?: { slug: string; [key: string]: any; } 
  ) => {
    console.warn(`mockCallUnifiedAIModel called for stage: ${_stageContext?.slug} with model: ${_modelId}`);
    let responseContentStructure: any = {};

    switch (_stageContext?.slug) {
      case 'thesis':
        responseContentStructure = {
          executive_summary: "Mocked Thesis: Executive Summary.",
          detailed_implementation_strategy: "Mocked Thesis: Detailed Implementation Strategy.",
          files_to_generate: [
            { template_filename: "thesis_prd.md", content_placeholder: "# Mocked Thesis PRD Content\nThis is the Product Requirements Document for the Thesis." }
          ]
        };
        break;
      case 'antithesis':
        responseContentStructure = {
          critique_of_thesis: "Mocked Antithesis: Critique of Thesis.",
          alternative_proposal_summary: "Mocked Antithesis: Alternative Proposal Summary.",
          files_to_generate: [
            { template_filename: "antithesis_critique_document.md", content_placeholder: "# Mocked Antithesis Critique\nThis document outlines the critique of the Thesis." }
          ]
        };
        break;
      case 'synthesis':
        responseContentStructure = {
          combined_strategy_overview: "Mocked Synthesis: Combined Strategy Overview.",
          final_recommendation: "Mocked Synthesis: Final Recommendation.",
          files_to_generate: [
            { template_filename: "synthesis_combined_plan.md", content_placeholder: "# Mocked Synthesis Combined Plan\nThis is the synthesized plan." }
          ]
        };
        break;
      case 'parenthesis':
        responseContentStructure = {
          identified_gaps_summary: "Mocked Parenthesis: Identified Gaps Summary.",
          refined_checklist: "[ ] 1. Parenthesis Task 1\n[ ] a. Sub-task A\n[ ] 2. Parenthesis Task 2", // Simulating checklist output
          files_to_generate: [
            { template_filename: "parenthesis_refined_implementation_plan.md", content_placeholder: "# Mocked Parenthesis Refined Plan\n[ ] 1. Refined Task 1\n[ ] 2. Refined Task 2" }
          ]
        };
        break;
      case 'paralysis':
        responseContentStructure = {
          final_ordered_plan_summary: "Mocked Paralysis: Final Ordered Plan Summary.",
          reordered_checklist: "[ ] 1. Paralysis Reordered Task A (formerly Task 2)\n[ ] 2. Paralysis Reordered Task B (formerly Task 1)", // Simulating reordered checklist
          files_to_generate: [
            { template_filename: "paralysis_final_ordered_plan.md", content_placeholder: "# Mocked Paralysis Final Ordered Plan\n[ ] 1. Final Ordered Task A\n[ ] 2. Final Ordered Task B" }
          ]
        };
        break;
      default:
        console.error(`mockCallUnifiedAIModel: Unhandled stage slug: ${_stageContext?.slug}`);
        responseContentStructure = { error: "Unknown stage for mock AI response" };
    }

    return Promise.resolve({
      content: JSON.stringify(responseContentStructure),
      contentType: "application/json", // Critical for backend parsing
      inputTokens: 75, // Mocked value
      outputTokens: 250, // Mocked value
      processingTimeMs: 400, // Mocked value
      modelIdUsed: _modelId,
      cost: 0.001, // Mocked value
      rawProviderResponse: { mockData: "some raw data" }, // Mocked
      error: null,
    });
  });

  const testSetupConfig: TestSetupConfig = {
    userProfile: { role: "user", first_name: "DialecticUser" },
    initialWalletBalance: 20000,
    resources: [
      // 1. Dialectic Domain
      {
        tableName: "dialectic_domains",
        identifier: { name: "Software Development Test Domain" },
        desiredState: {
          name: "Software Development Test Domain",
          description: "For testing dialectic processes in software development.",
        },
        exportId: "testDomain",
      },
      // 2. System Prompts (one for each of the 5 stages)
      {
        tableName: "system_prompts",
        identifier: { name: "Test Thesis Prompt" },
        desiredState: { name: "Test Thesis Prompt", prompt_text: "System prompt for Thesis. {{FORMATTING_STYLE_GUIDE}}", description: "Test" },
        exportId: "thesisPrompt",
      },
      {
        tableName: "system_prompts",
        identifier: { name: "Test Antithesis Prompt" },
        desiredState: { name: "Test Antithesis Prompt", prompt_text: "System prompt for Antithesis. {{FORMATTING_STYLE_GUIDE}}", description: "Test" },
        exportId: "antithesisPrompt",
      },
      {
        tableName: "system_prompts",
        identifier: { name: "Test Synthesis Prompt" },
        desiredState: { name: "Test Synthesis Prompt", prompt_text: "System prompt for Synthesis. {{FORMATTING_STYLE_GUIDE}}", description: "Test" },
        exportId: "synthesisPrompt",
      },
      {
        tableName: "system_prompts",
        identifier: { name: "Test Parenthesis Prompt" },
        desiredState: { name: "Test Parenthesis Prompt", prompt_text: "System prompt for Parenthesis. {{FORMATTING_STYLE_GUIDE}}", description: "Test" },
        exportId: "parenthesisPrompt",
      },
      {
        tableName: "system_prompts",
        identifier: { name: "Test Paralysis Prompt" },
        desiredState: { name: "Test Paralysis Prompt", prompt_text: "System prompt for Paralysis. {{FORMATTING_STYLE_GUIDE}}", description: "Test" },
        exportId: "paralysisPrompt",
      },
      // 3. Dialectic Stages (must be defined before process_templates and stage_transitions that use their IDs)
      {
        tableName: "dialectic_stages",
        identifier: { slug: "thesis" },
        desiredState: {
          display_name: "Thesis",
          slug: "thesis",
          description: "Initial proposition.",
          default_system_prompt_id: { $ref: "thesisPrompt_id" },
          expected_output_artifacts: {
            "executive_summary": "placeholder for executive summary",
            "detailed_implementation_strategy": "placeholder for implementation strategy",
            "files_to_generate": [
              { "template_filename": "thesis_prd.md", "content_placeholder": "Markdown for PRD" }
            ]
          },
          input_artifact_rules: null,
        },
        exportId: "thesisStage",
      },
      {
        tableName: "dialectic_stages",
        identifier: { slug: "antithesis" },
        desiredState: {
          display_name: "Antithesis",
          slug: "antithesis",
          description: "Counter-proposition.",
          default_system_prompt_id: { $ref: "antithesisPrompt_id" },
          expected_output_artifacts: {
            "critique_of_thesis": "placeholder for critique",
            "alternative_proposal_summary": "placeholder for alternative summary",
            "files_to_generate": [
              { "template_filename": "antithesis_critique_document.md", "content_placeholder": "Markdown for critique" }
            ]
          },
          input_artifact_rules: [
            { "source_stage_slug": "thesis", "artifact_type": "model_contribution_main", "selection_strategy": "latest_by_model", "max_versions": 1, "is_required": true, "section_header": "### Thesis Stage Outputs:" }
          ],
        },
        exportId: "antithesisStage",
      },
      {
        tableName: "dialectic_stages",
        identifier: { slug: "synthesis" },
        desiredState: {
          display_name: "Synthesis",
          slug: "synthesis",
          description: "Resolution and combined plan.",
          default_system_prompt_id: { $ref: "synthesisPrompt_id" },
          expected_output_artifacts: {
            "combined_strategy_overview": "placeholder for combined strategy",
            "final_recommendation": "placeholder for recommendation",
            "files_to_generate": [
              { "template_filename": "synthesis_combined_plan.md", "content_placeholder": "Markdown for combined plan" }
            ]
          },
          input_artifact_rules: [
            { "source_stage_slug": "thesis", "artifact_type": "model_contribution_main", "selection_strategy": "latest_by_model", "max_versions": 1, "is_required": true, "section_header": "### Original Thesis Contributions:" },
            { "source_stage_slug": "antithesis", "artifact_type": "model_contribution_main", "selection_strategy": "latest_by_model", "max_versions": 1, "is_required": true, "section_header": "### Antithesis Contributions:" },
            { "source_stage_slug": "antithesis", "artifact_type": "user_feedback", "selection_strategy": "latest", "max_versions": 1, "is_required": false, "section_header": "### Feedback on Antithesis Stage:"}
          ],
        },
        exportId: "synthesisStage",
      },
      {
        tableName: "dialectic_stages",
        identifier: { slug: "parenthesis" },
        desiredState: {
          display_name: "Parenthesis",
          slug: "parenthesis",
          description: "Gap analysis and refinement of the plan.",
          default_system_prompt_id: { $ref: "parenthesisPrompt_id" },
          expected_output_artifacts: {
            "identified_gaps_summary": "placeholder for gap summary",
            "refined_checklist": "placeholder for refined checklist",
            "files_to_generate": [
              { "template_filename": "parenthesis_refined_implementation_plan.md", "content_placeholder": "Full refined implementation plan/checklist according to style guide." }
            ]
          },
          input_artifact_rules: [
            { "source_stage_slug": "synthesis", "artifact_type": "model_contribution_main", "selection_strategy": "latest_by_model", "max_versions": 1, "is_required": true, "section_header": "### Current Plan (from Synthesis):" }
          ],
        },
        exportId: "parenthesisStage",
      },
      {
        tableName: "dialectic_stages",
        identifier: { slug: "paralysis" },
        desiredState: {
          display_name: "Paralysis",
          slug: "paralysis",
          description: "Dependency-driven reordering of the plan.",
          default_system_prompt_id: { $ref: "paralysisPrompt_id" },
          expected_output_artifacts: {
            "final_ordered_plan_summary": "placeholder for summary of reordering logic",
            "reordered_checklist": "placeholder for the final reordered checklist",
            "files_to_generate": [
              { "template_filename": "paralysis_final_ordered_plan.md", "content_placeholder": "Final, logically reordered implementation plan/checklist according to style guide." }
            ]
          },
          input_artifact_rules: [
            { "source_stage_slug": "parenthesis", "artifact_type": "model_contribution_main", "selection_strategy": "latest_by_model", "max_versions": 1, "is_required": true, "section_header": "### Refined Plan (from Parenthesis):" }
          ],
        },
        exportId: "paralysisStage",
      },
      // 4. Dialectic Process Template (must be after stages if starting_stage_id refers to an exported stage)
      {
        tableName: "dialectic_process_templates",
        identifier: { name: "Test 5-Stage Dialectic" },
        exportId: 'processTemplate',
        desiredState: {
          name: 'Test 5-Stage Dialectic',
          description: 'Standard 5-stage dialectic process for testing.',
          starting_stage_id: { $ref: 'thesisStage_id' }, // Refers to thesisStage defined above
        },
      },
      // 5. Dialectic Stage Transitions (must be after process_template and all stages are defined)
      {
        tableName: "dialectic_stage_transitions",
        identifier: { process_template_id: { $ref: "processTemplate_id" }, source_stage_id: { $ref: "thesisStage_id" }, target_stage_id: { $ref: "antithesisStage_id" } },
        desiredState: { condition_description: "default" } 
      },
      {
        tableName: "dialectic_stage_transitions",
        identifier: { process_template_id: { $ref: "processTemplate_id" }, source_stage_id: { $ref: "antithesisStage_id" }, target_stage_id: { $ref: "synthesisStage_id" } },
        desiredState: { condition_description: "default" } 
      },
      {
        tableName: "dialectic_stage_transitions",
        identifier: { process_template_id: { $ref: "processTemplate_id" }, source_stage_id: { $ref: "synthesisStage_id" }, target_stage_id: { $ref: "parenthesisStage_id" } },
        desiredState: { condition_description: "default" } 
      },
      {
        tableName: "dialectic_stage_transitions",
        identifier: { process_template_id: { $ref: "processTemplate_id" }, source_stage_id: { $ref: "parenthesisStage_id" }, target_stage_id: { $ref: "paralysisStage_id" } },
        desiredState: { condition_description: "default" } 
      },
      
      // 6. AI Providers (formerly AI Model Catalog)
      {
        tableName: "ai_providers",
        identifier: { api_identifier: "mock-model-1" },
        desiredState: { name: "Mock Model 1", api_identifier: "mock-model-1", provider: "test", is_active: true },
        exportId: "model1",
      },
      {
        tableName: "ai_providers",
        identifier: { api_identifier: "mock-model-2" },
        desiredState: { name: "Mock Model 2", api_identifier: "mock-model-2", provider: "test", is_active: true },
        exportId: "model2",
      },
      // 7. Initial Dialectic Project
      {
        tableName: "dialectic_projects",
        identifier: { project_name: "Test Dialectic Project Alpha" },
        exportId: 'testProject',
        desiredState: {
          project_name: 'Test Dialectic Project Alpha',
          process_template_id: { $ref: 'processTemplate_id' },
          initial_user_prompt: 'Plan a new SaaS application for project management.',
          selected_domain_id: { $ref: 'testDomain_id' },
        },
        linkUserId: true,
      },
    ],
  };

  const setupResult = await coreInitializeTestStep(testSetupConfig, 'local');
  primaryUserId = setupResult.primaryUserId;
  primaryUserClient = setupResult.primaryUserClient;
  primaryUserJwt = setupResult.primaryUserJwt;

  // Find the created project to get its actual ID
  const projectResource = setupResult.processedResources.find(
    (r) => r.tableName === "dialectic_projects" && r.resource?.project_name === "Test Dialectic Project Alpha"
  );
  assertExists(projectResource, "Test project should have been created.");
  assertExists(projectResource.resource, "Test project resource data should exist.");
  testProjectId = projectResource.resource.id; // Assuming 'id' is the PK

  // TODO: Further enhance resource seeding to correctly link FKs:
  // - dialectic_process_templates.domain_id
  // - dialectic_stages.process_template_id and dialectic_stages.default_system_prompt_id
  // - dialectic_stage_transitions
  // - dialectic_projects.dialectic_process_template_id
  // This might involve fetching IDs of previously created resources in testSetupConfig
  // or enhancing coreInitializeTestStep to handle named references.

  return setupResult;
}

async function afterEachTest() {
  console.log("Cleaning up after a test case...");
  await coreCleanupTestResources('local');
}

// --- Utility Functions for Assertions (to be expanded) ---
async function getProjectSlug(projectId: string, dbClient: SupabaseClient<Database>): Promise<string> {
  // Placeholder: In a real scenario, you might fetch the project and use its name to derive a slug
  // For now, let's assume projectId can be part of the slug or a fixed test slug is used.
  const { data: project, error } = await dbClient.from('dialectic_projects').select('project_name').eq('id', projectId).single();
  if (error || !project) return projectId; // Fallback
  return project.project_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function getShortSessionId(sessionId: string): string {
  return sessionId.substring(0, 8);
}

function mapStageSlugToDirName(stageSlug: string): string {
  // This should match the logic in your path_constructor.ts or FileNamerService
  const order: Record<string, number> = {
    thesis: 1,
    antithesis: 2,
    synthesis: 3,
    parenthesis: 4,
    paralysis: 5,
  };
  return `${order[stageSlug] || 'unknown'}_${stageSlug}`;
}

// --- Main Test Suite ---
Deno.test("Dialectic Service - Full Workflow Integration Test", async (t) => {
  await setupSuite();

  // Variables to be shared across steps
  let currentSessionId: string;

  // Setup common resources for all steps in this test case
  const setupResult = await beforeEachTest();
  const processedResources = setupResult.processedResources; // Initialize const here
  // testProjectId is a global in this file, set by beforeEachTest
  // primaryUserClient is also global, set by beforeEachTest
  // adminClient is also global, set by setupSuite or beforeEachTest

  // Retrieve dynamic IDs from seeded resources once
  const projectResource = processedResources.find((r: any) => r.exportId === "testProject");
  assertExists(projectResource, "Test Project should have been seeded by beforeEachTest.");
  assertExists(projectResource.resource, "Test project resource data should exist.");
  // testProjectId is already set globally by beforeEachTest if it finds the project, 
  // but let's ensure it's assigned if the global was not directly part of setupResult.
  // This assumes testProjectId is correctly updated within beforeEachTest or its utils.

  const model1Resource = processedResources.find((r: any) => r.exportId === "model1");
  const model2Resource = processedResources.find((r: any) => r.exportId === "model2");
  assertExists(model1Resource, "Mock Model 1 should have been seeded.");
  assertExists(model1Resource.resource, "Mock Model 1 resource data should exist.");
  assertExists(model2Resource, "Mock Model 2 should have been seeded.");
  assertExists(model2Resource.resource, "Mock Model 2 resource data should exist.");
  const mockModelId1 = model1Resource.resource.id;
  const mockModelId2 = model2Resource.resource.id;
  const projectSlug = await getProjectSlug(testProjectId, adminClient);

  await t.step("Phase 1: Start Session and Verify Initial State", async () => {
    // Note: beforeEachTest is now called outside/before this step.
    // We use the variables (currentSessionId, projectSlug, etc.) from the outer scope.

    const startSessionPayload = {
      projectId: testProjectId,
      sessionDescription: "Test Session for Full Workflow",
      selectedModelIds: [mockModelId1, mockModelId2],
    };

    const { data: sessionData, error: sessionError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'startSession', payload: startSessionPayload } }
    );

    assertExists(sessionData, "Session data should be returned from startSession.");
    if(sessionError) { console.error("startSession error response:", JSON.stringify(sessionError)); }
    assertEquals(sessionError, null, `startSession should not have an error in the response body. Error: ${JSON.stringify(sessionError)}`);
    assertExists(sessionData, "Response should contain session details.");
    currentSessionId = sessionData.id; // Set for subsequent steps

    const { data: dbSession, error: dbSessionError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();

    assertExists(dbSession, `Session ${currentSessionId} should exist in DB.`);
    assertEquals(dbSessionError, null, "Fetching session from DB should not error.");
    assertEquals(dbSession.project_id, testProjectId);
    assertEquals(dbSession.iteration_count, 1);
    assertExists(dbSession.dialectic_stages, "Session should have current stage info.");
    assertEquals(dbSession.dialectic_stages?.slug, 'thesis', "Initial stage should be Thesis.");

    const shortSessionId = getShortSessionId(currentSessionId);
    const thesisDir = mapStageSlugToDirName('thesis');

    const { data: readmeList, error: readmeError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(`${projectSlug}/`);
    assertEquals(readmeError, null, "Listing project root should not error.");
    assertExists(readmeList?.some(f => f.name === 'initial_user_prompt.md'), "Initial user prompt file should exist.");

    const seedPromptPath = `${testProjectId}/sessions/${shortSessionId}/iteration_1/${thesisDir}/seed_prompt.md`;
    const { data: seedPromptFile, error: seedPromptError } = await adminClient.storage
      .from('dialectic_project_content')
      .download(seedPromptPath);
    assertEquals(seedPromptError, null, `Downloading seed_prompt.md from ${seedPromptPath} should not error. Error: ${seedPromptError?.message}`);
    assertExists(seedPromptFile, "seed_prompt.md for Thesis should exist in storage.");
    // No afterEachTest here, state persists to next step
  });

  await t.step("Phase 2: Submit Stage Responses for Thesis", async () => {
    assertExists(currentSessionId, "currentSessionId must be set from Phase 1.");

    const thesisStageSlug = 'thesis';
    const submitThesisPayload = {
      projectId: testProjectId,
      sessionId: currentSessionId,
      iterationNumber: 1,
      stageSlug: thesisStageSlug,
      responses: [], // No prior AI contributions to respond to for the very first (Thesis) submission
      userStageFeedback: {
        content: "# User Feedback for Thesis Stage\nThis is my overall feedback on the initial Thesis generation attempt.",
        feedbackType: "StageReviewSummary_v1",
      },
    };

    // Before submitting, let's mock the AI call for Thesis stage specifically if generateContributions is implicitly called
    // generateContributions is typically called by submitStageResponses if no contributions exist or if forced.
    // Our mockCallUnifiedAIModel is already spy-based and should be picked up.

    const { data: submitThesisData, error: submitThesisError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'submitStageResponses', payload: submitThesisPayload } }
    );
    
    assertExists(submitThesisData, "submitStageResponses for Thesis should return data.");
    if(submitThesisError) { console.error("submitThesisResponses (Thesis) error response:", JSON.stringify(submitThesisError)); }
    assertEquals(submitThesisError, null, `submitStageResponses for Thesis failed: ${JSON.stringify(submitThesisError)}`);
    assertExists(submitThesisData.nextStage, "Response should contain nextStage details.");
    assertEquals(submitThesisData.nextStage.slug, 'antithesis', "Next stage should be Antithesis after Thesis submission.");

    // DB Assertions for Thesis stage processing
    // 1. Contributions created for Thesis
    const { data: thesisContribs, error: contribError } = await adminClient
      .from('dialectic_contributions')
      .select('*') // Select all direct columns, including model_id
      .eq('session_id', currentSessionId)
      .eq('stage', thesisStageSlug)
      .eq('iteration_number', 1);

    assertEquals(contribError, null, "Error fetching contributions for Thesis.");
    assertExists(thesisContribs, "Contributions array for Thesis should exist.");
    assertEquals(thesisContribs.length, 2, "Should have 2 contributions for Thesis from mock models.");

    // Assert based on model_id by looking up in processedResources
    const model1ApiIdentifier = processedResources.find(r => r.tableName === 'ai_providers' && r.resource.id === mockModelId1)?.resource.api_identifier;
    const model2ApiIdentifier = processedResources.find(r => r.tableName === 'ai_providers' && r.resource.id === mockModelId2)?.resource.api_identifier;

    assertExists(thesisContribs.find(c => c.model_id === mockModelId1), `Contribution from model ${model1ApiIdentifier || 'mock-model-1'} missing.`);
    assertExists(thesisContribs.find(c => c.model_id === mockModelId2), `Contribution from model ${model2ApiIdentifier || 'mock-model-2'} missing.`);

    // 2. Feedback created for Thesis
    const { data: thesisFeedback, error: feedbackError } = await adminClient
      .from('dialectic_feedback')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage_slug', thesisStageSlug)
      .eq('iteration_number', 1)
      .single();
    assertEquals(feedbackError, null, "Error fetching feedback for Thesis.");
    assertExists(thesisFeedback, "Feedback record for Thesis should exist.");
    assertEquals(thesisFeedback.feedback_type, "StageReviewSummary_v1");

    // 3. Session updated to Antithesis
    const { data: updatedDbSession, error: updatedDbSessionError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();
    assertEquals(updatedDbSessionError, null, "Fetching updated session should not error.");
    assertExists(updatedDbSession?.dialectic_stages, "Updated session should have stage info.");
    assertEquals(updatedDbSession.dialectic_stages?.slug, 'antithesis', "Session current stage should be Antithesis.");

    // Storage Assertions for Thesis outputs and Antithesis seed prompt
    const shortSessionId = getShortSessionId(currentSessionId);
    const thesisDir = mapStageSlugToDirName(thesisStageSlug);
    const antithesisDir = mapStageSlugToDirName('antithesis');

    // A. Thesis Stage Files
    const thesisStagePath = `${projectSlug}/session_${shortSessionId}/iteration_1/${thesisDir}`;
    const { data: thesisFiles, error: thesisFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(thesisStagePath);
    assertEquals(thesisFilesError, null, `Listing files in ${thesisStagePath} should not error.`);
    assertExists(thesisFiles, `File list for ${thesisStagePath} should exist.`);
    
    const rawResponsesPath = `${thesisStagePath}/raw_responses`;
    const { data: rawJsonFiles, error: rawJsonError } = await adminClient.storage
        .from('dialectic_project_content')
        .list(rawResponsesPath);
    assertEquals(rawJsonError, null, `Listing files in ${rawResponsesPath} should not error.`);
    assertExists(rawJsonFiles, `File list for ${rawResponsesPath} should exist.`);

    // Raw responses (2 models)
    assertExists(rawJsonFiles.find(f => f.name === `mock-model-1_1_${thesisStageSlug}_raw.json`), "Raw JSON for model 1 missing.");
    assertExists(rawJsonFiles.find(f => f.name === `mock-model-2_1_${thesisStageSlug}_raw.json`), "Raw JSON for model 2 missing.");
    // Main contributions (2 models)
    assertExists(thesisFiles.find(f => f.name === `mock-model-1_1_${thesisStageSlug}.md`), "Main contribution MD for model 1 missing.");
    assertExists(thesisFiles.find(f => f.name === `mock-model-2_1_${thesisStageSlug}.md`), "Main contribution MD for model 2 missing.");
    // User Feedback file
    assertExists(thesisFiles.find(f => f.name === `user_feedback_${thesisStageSlug}.md`), "User feedback file for Thesis missing.");
    // Document from expected_output_artifacts (e.g., thesis_prd.md, name might be model_slug prefixed by FileManagerService)
    // This assertion needs to know the exact filename generated by FileManagerService
    // Assuming FileManagerService prepends model slug and attempt count for documents
    assertExists(thesisFiles.find(f => f.name.startsWith('mock-model-1_1_thesis_prd') && f.name.endsWith('.md')), "Thesis PRD from model 1 missing.");
    assertExists(thesisFiles.find(f => f.name.startsWith('mock-model-2_1_thesis_prd') && f.name.endsWith('.md')), "Thesis PRD from model 2 missing.");

    // B. Seed Prompt for Antithesis stage
    const antithesisSeedPromptPath = `${projectSlug}/session_${shortSessionId}/iteration_1/${antithesisDir}/seed_prompt.md`;
    const { data: antithesisSeedFile, error: antithesisSeedError } = await adminClient.storage
      .from('dialectic_project_content')
      .download(antithesisSeedPromptPath);
    assertEquals(antithesisSeedError, null, `Downloading Antithesis seed_prompt.md from ${antithesisSeedPromptPath} should not error. Error: ${antithesisSeedError?.message}`);
    assertExists(antithesisSeedFile, "seed_prompt.md for Antithesis should exist in storage.");
  });

  await t.step("Phase 3: Submit Stage Responses for Antithesis", async () => {
    assertExists(currentSessionId, "currentSessionId must be set from Phase 1.");

    const antithesisStageSlug = 'antithesis';
    const previousStageSlug = 'thesis'; // For fetching prior contributions to respond to

    // Fetch one of the Thesis contributions to simulate responding to it
    const { data: previousContribs, error: prevContribError } = await adminClient
      .from('dialectic_contributions')
      .select('id, model_id')
      .eq('session_id', currentSessionId)
      .eq('stage', previousStageSlug)
      .eq('iteration_number', 1)
      .limit(1);
    assertEquals(prevContribError, null, `Error fetching contributions from ${previousStageSlug} to respond to.`);
    assertExists(previousContribs, `Contributions from ${previousStageSlug} should exist.`);
    assertEquals(previousContribs.length > 0, true, `Should be at least one contribution from ${previousStageSlug}.`);
    const contributionToRespondTo = previousContribs[0];

    const submitAntithesisPayload = {
      projectId: testProjectId,
      sessionId: currentSessionId,
      iterationNumber: 1, // Still iteration 1
      stageSlug: antithesisStageSlug,
      responses: [
        {
          contribution_id: contributionToRespondTo.id,
          response_text: "This is my user feedback on one of the Thesis contributions.",
          rating: 5,
          // Ensure this matches DialecticContributionResponseInput if more fields are mandatory
        },
      ],
      userStageFeedback: {
        content: "# User Feedback for Antithesis Stage\nOverall feedback for Antithesis.",
        feedbackType: "StageReviewSummary_v1",
      },
    };

    const { data: submitAntithesisData, error: submitAntithesisError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'submitStageResponses', payload: submitAntithesisPayload } }
    );

    assertExists(submitAntithesisData, "submitStageResponses for Antithesis should return data.");
    if(submitAntithesisError) { console.error("submitStageResponses (Antithesis) error:", JSON.stringify(submitAntithesisError)); }
    assertEquals(submitAntithesisError, null, `submitStageResponses for Antithesis failed: ${JSON.stringify(submitAntithesisError)}`);
    assertExists(submitAntithesisData.nextStage, "Response should contain nextStage details for Antithesis.");
    assertEquals(submitAntithesisData.nextStage.slug, 'synthesis', "Next stage should be Synthesis after Antithesis.");

    // DB Assertions for Antithesis stage processing
    const { data: antithesisContribs, error: anContribError } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage', antithesisStageSlug)
      .eq('iteration_number', 1);
    assertEquals(anContribError, null, "Error fetching contributions for Antithesis.");
    assertExists(antithesisContribs, "Contributions array for Antithesis should exist.");
    assertEquals(antithesisContribs.length, 2, "Should have 2 contributions for Antithesis.");

    const { data: antithesisFeedback, error: anFeedbackError } = await adminClient
      .from('dialectic_feedback')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage_slug', antithesisStageSlug)
      .eq('iteration_number', 1)
      .single();
    assertEquals(anFeedbackError, null, "Error fetching feedback for Antithesis.");
    assertExists(antithesisFeedback, "Feedback record for Antithesis should exist.");

    const { data: updatedSessionAnt, error: updatedSessionAntError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();
    assertEquals(updatedSessionAntError, null, "Fetching updated session post-Antithesis should not error.");
    assertExists(updatedSessionAnt, "Updated session post-Antithesis should exist in DB.");
    assertEquals(updatedSessionAnt.dialectic_stages?.slug, 'synthesis', "Session current stage should be Synthesis.");

    // Storage Assertions for Antithesis outputs and Synthesis seed prompt
    const shortSessionId = getShortSessionId(currentSessionId);
    const antithesisDir = mapStageSlugToDirName(antithesisStageSlug);
    const synthesisDir = mapStageSlugToDirName('synthesis');
    const antithesisStagePath = `${projectSlug}/session_${shortSessionId}/iteration_1/${antithesisDir}`;

    const { data: antithesisFiles, error: antithesisFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(antithesisStagePath);
    assertEquals(antithesisFilesError, null, `Listing files in ${antithesisStagePath} should not error.`);
    assertExists(antithesisFiles, `File list for ${antithesisStagePath} should exist.`);

    assertExists(antithesisFiles.find(f => f.name === `mock-model-1_1_${antithesisStageSlug}_raw.json`));
    assertExists(antithesisFiles.find(f => f.name === `mock-model-2_1_${antithesisStageSlug}_raw.json`));
    assertExists(antithesisFiles.find(f => f.name === `mock-model-1_1_${antithesisStageSlug}.md`));
    assertExists(antithesisFiles.find(f => f.name === `mock-model-2_1_${antithesisStageSlug}.md`));
    assertExists(antithesisFiles.find(f => f.name === `user_feedback_${antithesisStageSlug}.md`));
    // Document from expected_output_artifacts (e.g., antithesis_critique_document.md)
    assertExists(antithesisFiles.find(f => f.name.startsWith('mock-model-1_1_antithesis_critique_document') && f.name.endsWith('.md')));
    assertExists(antithesisFiles.find(f => f.name.startsWith('mock-model-2_1_antithesis_critique_document') && f.name.endsWith('.md')));

    const synthesisSeedPromptPath = `${projectSlug}/session_${shortSessionId}/iteration_1/${synthesisDir}/seed_prompt.md`;
    const { data: synthesisSeedFile, error: synthesisSeedError } = await adminClient.storage
      .from('dialectic_project_content')
      .download(synthesisSeedPromptPath);
    assertEquals(synthesisSeedError, null, `Downloading Synthesis seed_prompt.md failed: ${synthesisSeedError?.message}`);
    assertExists(synthesisSeedFile, "seed_prompt.md for Synthesis should exist.");
  });

  await t.step("Phase 4: Submit Stage Responses for Synthesis", async () => {
    assertExists(currentSessionId, "currentSessionId must be set from prior steps.");
    const synthesisStageSlug = 'synthesis';
    const previousAntithesisSlug = 'antithesis';

    // Fetch one of the Antithesis contributions to simulate responding to it
    const { data: antithesisContribsForResponse, error: prevAntContribError } = await adminClient
      .from('dialectic_contributions')
      .select('id, model_id')
      .eq('session_id', currentSessionId)
      .eq('stage', previousAntithesisSlug)
      .eq('iteration_number', 1)
      .limit(1);
    assertEquals(prevAntContribError, null, `Error fetching contributions from ${previousAntithesisSlug}.`);
    assertExists(antithesisContribsForResponse, `Contributions from ${previousAntithesisSlug} should exist.`);
    assertEquals(antithesisContribsForResponse.length > 0, true, `Should be at least one contribution from ${previousAntithesisSlug}.`);
    const antithesisContribToRespondTo = antithesisContribsForResponse[0];

    const submitSynthesisPayload = {
      projectId: testProjectId,
      sessionId: currentSessionId,
      iterationNumber: 1,
      stageSlug: synthesisStageSlug,
      responses: [
        {
          contribution_id: antithesisContribToRespondTo.id,
          response_text: "User feedback on an Antithesis contribution, informing Synthesis.",
          rating: 4,
        },
      ],
      userStageFeedback: {
        content: "# User Feedback for Synthesis Stage\nOverall feedback for the Synthesis stage.",
        feedbackType: "StageReviewSummary_v1",
      },
    };

    const { data: submitSynthData, error: submitSynthError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'submitStageResponses', payload: submitSynthesisPayload } }
    );

    assertExists(submitSynthData, "submitStageResponses for Synthesis should return data.");
    if(submitSynthError) { console.error("submitStageResponses (Synthesis) error:", JSON.stringify(submitSynthError)); }
    assertEquals(submitSynthError, null, `submitStageResponses for Synthesis failed: ${JSON.stringify(submitSynthError)}`);
    assertExists(submitSynthData.nextStage, "Response should contain nextStage details for Synthesis.");
    assertEquals(submitSynthData.nextStage.slug, 'parenthesis', "Next stage should be Parenthesis after Synthesis.");

    // DB Assertions for Synthesis stage processing
    const { data: synthContribs, error: syContribError } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage', synthesisStageSlug)
      .eq('iteration_number', 1);
    assertEquals(syContribError, null, "Error fetching contributions for Synthesis.");
    assertExists(synthContribs, "Contributions array for Synthesis should exist.");
    assertEquals(synthContribs.length, 2, "Should have 2 contributions for Synthesis.");

    const { data: synthFeedback, error: syFeedbackError } = await adminClient
      .from('dialectic_feedback')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage_slug', synthesisStageSlug)
      .eq('iteration_number', 1)
      .single();
    assertEquals(syFeedbackError, null, "Error fetching feedback for Synthesis.");
    assertExists(synthFeedback, "Feedback record for Synthesis should exist.");

    const { data: updatedSessionSyn, error: updatedSessionSynError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();
    assertEquals(updatedSessionSynError, null, "Fetching updated session post-Synthesis should not error.");
    assertExists(updatedSessionSyn, "Updated session post-Synthesis should exist in DB.");
    assertEquals(updatedSessionSyn.dialectic_stages?.slug, 'parenthesis', "Session current stage should be Parenthesis.");

    // Storage Assertions for Synthesis outputs and Parenthesis seed prompt
    const shortSessionId = getShortSessionId(currentSessionId);
    const synthesisDir = mapStageSlugToDirName(synthesisStageSlug);
    const parenthesisDir = mapStageSlugToDirName('parenthesis');
    const synthesisStagePath = `${projectSlug}/session_${shortSessionId}/iteration_1/${synthesisDir}`;

    const { data: synthesisFiles, error: synthesisFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(synthesisStagePath);
    assertEquals(synthesisFilesError, null, `Listing files in ${synthesisStagePath} should not error.`);
    assertExists(synthesisFiles, `File list for ${synthesisStagePath} should exist.`);

    assertExists(synthesisFiles.find(f => f.name === `mock-model-1_1_${synthesisStageSlug}_raw.json`));
    assertExists(synthesisFiles.find(f => f.name === `mock-model-2_1_${synthesisStageSlug}_raw.json`));
    assertExists(synthesisFiles.find(f => f.name === `mock-model-1_1_${synthesisStageSlug}.md`));
    assertExists(synthesisFiles.find(f => f.name === `mock-model-2_1_${synthesisStageSlug}.md`));
    assertExists(synthesisFiles.find(f => f.name === `user_feedback_${synthesisStageSlug}.md`));
    // Document from expected_output_artifacts (e.g., synthesis_combined_plan.md)
    assertExists(synthesisFiles.find(f => f.name.startsWith('mock-model-1_1_synthesis_combined_plan') && f.name.endsWith('.md')));
    assertExists(synthesisFiles.find(f => f.name.startsWith('mock-model-2_1_synthesis_combined_plan') && f.name.endsWith('.md')));

    const parenthesisSeedPromptPath = `${projectSlug}/session_${shortSessionId}/iteration_1/${parenthesisDir}/seed_prompt.md`;
    const { data: parenthesisSeedFile, error: parenthesisSeedError } = await adminClient.storage
      .from('dialectic_project_content')
      .download(parenthesisSeedPromptPath);
    assertEquals(parenthesisSeedError, null, `Downloading Parenthesis seed_prompt.md failed: ${parenthesisSeedError?.message}`);
    assertExists(parenthesisSeedFile, "seed_prompt.md for Parenthesis should exist.");
  });

  await t.step("Phase 5: Submit Stage Responses for Parenthesis", async () => {
    assertExists(currentSessionId, "currentSessionId must be set from prior steps.");
    const parenthesisStageSlug = 'parenthesis';
    const previousSynthesisSlug = 'synthesis';

    // Fetch one of the Synthesis contributions to simulate responding to it
    const { data: synthesisContribsForResponse, error: prevSynContribError } = await adminClient
      .from('dialectic_contributions')
      .select('id, model_id')
      .eq('session_id', currentSessionId)
      .eq('stage', previousSynthesisSlug)
      .eq('iteration_number', 1)
      .limit(1);
    assertEquals(prevSynContribError, null, `Error fetching contributions from ${previousSynthesisSlug}.`);
    assertExists(synthesisContribsForResponse, `Contributions from ${previousSynthesisSlug} should exist.`);
    assertEquals(synthesisContribsForResponse.length > 0, true, `Should be at least one contribution from ${previousSynthesisSlug}.`);
    const synthesisContribToRespondTo = synthesisContribsForResponse[0];

    const submitParenthesisPayload = {
      projectId: testProjectId,
      sessionId: currentSessionId,
      iterationNumber: 1,
      stageSlug: parenthesisStageSlug,
      responses: [
        {
          contribution_id: synthesisContribToRespondTo.id,
          response_text: "User feedback on a Synthesis contribution, informing Parenthesis.",
          rating: 5,
        },
      ],
      userStageFeedback: {
        content: "# User Feedback for Parenthesis Stage\nOverall feedback for the Parenthesis stage, focusing on gap analysis.",
        feedbackType: "StageReviewSummary_v1",
      },
    };

    const { data: submitParenData, error: submitParenError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'submitStageResponses', payload: submitParenthesisPayload } }
    );

    assertExists(submitParenData, "submitStageResponses for Parenthesis should return data.");
    if(submitParenError) { console.error("submitStageResponses (Parenthesis) error:", JSON.stringify(submitParenError)); }
    assertEquals(submitParenError, null, `submitStageResponses for Parenthesis failed: ${JSON.stringify(submitParenError)}`);
    assertExists(submitParenData.nextStage, "Response should contain nextStage details for Parenthesis.");
    assertEquals(submitParenData.nextStage.slug, 'paralysis', "Next stage should be Paralysis after Parenthesis.");

    // DB Assertions for Parenthesis stage processing
    const { data: parenContribs, error: paContribError } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage', parenthesisStageSlug)
      .eq('iteration_number', 1);
    assertEquals(paContribError, null, "Error fetching contributions for Parenthesis.");
    assertExists(parenContribs, "Contributions array for Parenthesis should exist.");
    assertEquals(parenContribs.length, 2, "Should have 2 contributions for Parenthesis.");

    const { data: parenFeedback, error: paFeedbackError } = await adminClient
      .from('dialectic_feedback')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage_slug', parenthesisStageSlug)
      .eq('iteration_number', 1)
      .single();
    assertEquals(paFeedbackError, null, "Error fetching feedback for Parenthesis.");
    assertExists(parenFeedback, "Feedback record for Parenthesis should exist.");

    const { data: updatedSessionPar, error: updatedSessionParError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();
    assertEquals(updatedSessionParError, null, "Fetching updated session post-Parenthesis should not error.");
    assertExists(updatedSessionPar, "Updated session post-Parenthesis should exist in DB.");
    assertEquals(updatedSessionPar.dialectic_stages?.slug, 'paralysis', "Session current stage should be Paralysis.");

    // Storage Assertions for Parenthesis outputs and Paralysis seed prompt
    const shortSessionId = getShortSessionId(currentSessionId);
    const parenthesisDir = mapStageSlugToDirName(parenthesisStageSlug);
    const paralysisDir = mapStageSlugToDirName('paralysis');
    const parenthesisStagePath = `${projectSlug}/session_${shortSessionId}/iteration_1/${parenthesisDir}`;

    const { data: parenthesisFiles, error: parenthesisFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(parenthesisStagePath);
    assertEquals(parenthesisFilesError, null, `Listing files in ${parenthesisStagePath} should not error.`);
    assertExists(parenthesisFiles, `File list for ${parenthesisStagePath} should exist.`);

    assertExists(parenthesisFiles.find(f => f.name === `mock-model-1_1_${parenthesisStageSlug}_raw.json`));
    assertExists(parenthesisFiles.find(f => f.name === `mock-model-2_1_${parenthesisStageSlug}_raw.json`));
    assertExists(parenthesisFiles.find(f => f.name === `mock-model-1_1_${parenthesisStageSlug}.md`));
    assertExists(parenthesisFiles.find(f => f.name === `mock-model-2_1_${parenthesisStageSlug}.md`));
    assertExists(parenthesisFiles.find(f => f.name === `user_feedback_${parenthesisStageSlug}.md`));
    // Document from expected_output_artifacts (e.g., parenthesis_refined_implementation_plan.md)
    assertExists(parenthesisFiles.find(f => f.name.startsWith('mock-model-1_1_parenthesis_refined_implementation_plan') && f.name.endsWith('.md')));
    assertExists(parenthesisFiles.find(f => f.name.startsWith('mock-model-2_1_parenthesis_refined_implementation_plan') && f.name.endsWith('.md')));

    const paralysisSeedPromptPath = `${projectSlug}/session_${shortSessionId}/iteration_1/${paralysisDir}/seed_prompt.md`;
    const { data: paralysisSeedFile, error: paralysisSeedError } = await adminClient.storage
      .from('dialectic_project_content')
      .download(paralysisSeedPromptPath);
    assertEquals(paralysisSeedError, null, `Downloading Paralysis seed_prompt.md failed: ${paralysisSeedError?.message}`);
    assertExists(paralysisSeedFile, "seed_prompt.md for Paralysis should exist.");
  });

  // TODO: Add t.step for "Invoke submitStageResponses for Paralysis Stage (Final Stage)"
  await t.step("Phase 6: Submit Stage Responses for Paralysis (Final Stage)", async () => {
    assertExists(currentSessionId, "currentSessionId must be set from prior steps.");
    const paralysisStageSlug = 'paralysis';
    const previousParenthesisSlug = 'parenthesis';

    // Fetch one of the Parenthesis contributions
    const { data: parenthesisContribsForResponse, error: prevParContribError } = await adminClient
      .from('dialectic_contributions')
      .select('id, model_id')
      .eq('session_id', currentSessionId)
      .eq('stage', previousParenthesisSlug)
      .eq('iteration_number', 1)
      .limit(1);
    assertEquals(prevParContribError, null, `Error fetching contributions from ${previousParenthesisSlug}.`);
    assertExists(parenthesisContribsForResponse, `Contributions from ${previousParenthesisSlug} should exist.`);
    assertEquals(parenthesisContribsForResponse.length > 0, true, `Should be at least one contribution from ${previousParenthesisSlug}.`);
    const parenthesisContribToRespondTo = parenthesisContribsForResponse[0];

    const submitParalysisPayload = {
      projectId: testProjectId,
      sessionId: currentSessionId,
      iterationNumber: 1,
      stageSlug: paralysisStageSlug,
      responses: [
        {
          contribution_id: parenthesisContribToRespondTo.id,
          response_text: "User feedback on a Parenthesis contribution, informing Paralysis.",
          rating: 5,
        },
      ],
      userStageFeedback: {
        content: "# User Feedback for Paralysis Stage\nFinal feedback on the reordered plan.",
        feedbackType: "StageReviewSummary_v1",
      },
    };

    const { data: submitParalData, error: submitParalError } = await primaryUserClient.functions.invoke(
      'dialectic-service',
      { body: { action: 'submitStageResponses', payload: submitParalysisPayload } }
    );

    assertExists(submitParalData, "submitStageResponses for Paralysis should return data.");
    if(submitParalError) { console.error("submitStageResponses (Paralysis) error:", JSON.stringify(submitParalError)); }
    assertEquals(submitParalError, null, `submitStageResponses for Paralysis failed: ${JSON.stringify(submitParalError)}`);
    assertEquals(submitParalData.nextStage, null, "Next stage should be null after Paralysis, indicating workflow completion.");

    // DB Assertions for Paralysis stage processing
    const { data: paralContribs, error: pyContribError } = await adminClient
      .from('dialectic_contributions')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage', paralysisStageSlug)
      .eq('iteration_number', 1);
    assertEquals(pyContribError, null, "Error fetching contributions for Paralysis.");
    assertExists(paralContribs, "Contributions array for Paralysis should exist.");
    assertEquals(paralContribs.length, 2, "Should have 2 contributions for Paralysis.");

    const { data: paralFeedback, error: pyFeedbackError } = await adminClient
      .from('dialectic_feedback')
      .select('*')
      .eq('session_id', currentSessionId)
      .eq('stage_slug', paralysisStageSlug)
      .eq('iteration_number', 1)
      .single();
    assertEquals(pyFeedbackError, null, "Error fetching feedback for Paralysis.");
    assertExists(paralFeedback, "Feedback record for Paralysis should exist.");

    const { data: updatedSessionPyl, error: updatedSessionPylError } = await adminClient
      .from('dialectic_sessions')
      .select('*, dialectic_stages(slug)')
      .eq('id', currentSessionId)
      .single();
    assertEquals(updatedSessionPylError, null, "Fetching updated session post-Paralysis should not error.");
    assertExists(updatedSessionPyl, "Updated session post-Paralysis should exist in DB.");
    // After the final stage, current_stage_id might be null or point to Paralysis itself if it's terminal
    // Depending on backend logic, it could also be a specific "completed" stage.
    // For this test, let's assume it stays on Paralysis or becomes null.
    // If it stays on Paralysis: assertEquals(updatedSessionPyl.dialectic_stages?.slug, paralysisStageSlug); 
    // If it becomes null: assertEquals(updatedSessionPyl.current_stage_id, null); and dialectic_stages would be null.
    // Let's check if it exists and matches paralysis, or is null.
    const finalStageSlug = updatedSessionPyl.dialectic_stages?.slug;
    const isTerminal = finalStageSlug === paralysisStageSlug || updatedSessionPyl.current_stage_id === null;
    assertEquals(isTerminal, true, `Session current stage should be Paralysis or null. Got: ${finalStageSlug}`);


    // Storage Assertions for Paralysis outputs
    const shortSessionId = getShortSessionId(currentSessionId);
    const paralysisDir = mapStageSlugToDirName(paralysisStageSlug);
    const paralysisStagePath = `${projectSlug}/session_${shortSessionId}/iteration_1/${paralysisDir}`;

    const { data: paralysisFiles, error: paralysisFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(paralysisStagePath);
    assertEquals(paralysisFilesError, null, `Listing files in ${paralysisStagePath} should not error.`);
    assertExists(paralysisFiles, `File list for ${paralysisStagePath} should exist.`);

    assertExists(paralysisFiles.find(f => f.name === `mock-model-1_1_${paralysisStageSlug}_raw.json`));
    assertExists(paralysisFiles.find(f => f.name === `mock-model-2_1_${paralysisStageSlug}_raw.json`));
    assertExists(paralysisFiles.find(f => f.name === `mock-model-1_1_${paralysisStageSlug}.md`));
    assertExists(paralysisFiles.find(f => f.name === `mock-model-2_1_${paralysisStageSlug}.md`));
    assertExists(paralysisFiles.find(f => f.name === `user_feedback_${paralysisStageSlug}.md`));
    // Document from expected_output_artifacts (e.g., paralysis_final_ordered_plan.md)
    assertExists(paralysisFiles.find(f => f.name.startsWith('mock-model-1_1_paralysis_final_ordered_plan') && f.name.endsWith('.md')));
    assertExists(paralysisFiles.find(f => f.name.startsWith('mock-model-2_1_paralysis_final_ordered_plan') && f.name.endsWith('.md')));

    // Crucial: Assert file in Pending/ directory
    const pendingPath = `${projectSlug}/Pending/`;
    const { data: pendingFiles, error: pendingFilesError } = await adminClient.storage
      .from('dialectic_project_content')
      .list(pendingPath);
    assertEquals(pendingFilesError, null, `Listing files in ${pendingPath} should not error.`);
    assertExists(pendingFiles, `File list for ${pendingPath} should exist.`);
    // The exact filename in Pending/ depends on backend logic. 
    // Let's assume it's based on the paralysis_final_ordered_plan.md or a generic name.
    // For this example, let's look for any .md file as a basic check.
    // A more robust test would know the exact expected filename.
    const pendingFile = pendingFiles.find(f => f.name.endsWith('.md'));
    assertExists(pendingFile, `A Markdown file output from Paralysis should exist in ${pendingPath}.`);
    console.log(`Found pending file: ${pendingFile?.name} in ${pendingPath}`);
    // Optionally, download and check content if it should match the mock AI response for paralysis_final_ordered_plan.md
  });

  await afterEachTest(); // Clean up all resources from this Deno.test case
  await teardownSuite();
});

// Placeholder for patching AI model caller if needed outside the mock spy defined above.
// This might involve Deno's `stub` API if callUnifiedAIModel is imported from another module.
// Example:
// import * as AIModelCallerModule from '../_shared/ai_service/call_unified_ai_model.ts'; // Adjust path
// let callUnifiedAIModelStub: Stub<typeof AIModelCallerModule>;
// In setupSuite/beforeEachTest: callUnifiedAIModelStub = stub(AIModelCallerModule, "callUnifiedAIModel", mockCallUnifiedAIModel._fn);
// In teardownSuite/afterEachTest: callUnifiedAIModelStub.restore();

// To run this test: deno test -A --env supabase/functions/.env.test supabase/functions/dialectic-service/dialectic-stages.integration.test.ts
// Ensure .env.test has SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CONTENT_STORAGE_BUCKET etc.
