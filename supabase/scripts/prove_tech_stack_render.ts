/**
 * Proof script: calls the real renderDocument function with real raw JSON
 * artifacts and real document templates read from disk. Writes rendered
 * markdown to the example/ folder and validates structure + formatting
 * for all four document types (three synthesis + one thesis per-item).
 *
 * Usage (from repo root):
 *   deno run --allow-read --allow-write supabase/scripts/prove_tech_stack_render.ts
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../functions/types_db.ts";
import { renderDocument } from "../functions/_shared/services/document_renderer.ts";
import type { RenderDocumentParams } from "../functions/_shared/services/document_renderer.interface.ts";
import { FileType } from "../functions/_shared/types/file_manager.types.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../functions/_shared/supabase.mock.ts";
import { MockFileManagerService } from "../functions/_shared/services/file_manager.mock.ts";
import { mockNotificationService } from "../functions/_shared/utils/notification.service.mock.ts";
import { logger } from "../functions/_shared/logger.ts";

// ── Case definitions ────────────────────────────────────────────────────

type ProofCase = {
  label: string;
  rawJsonPath: string;
  templatePath: string;
  templateName: string;
  templateFileName: string;
  documentKey: FileType;
  stageSlug: string;
  checks: (rendered: string) => Array<[string, boolean]>;
};

const cases: ProofCase[] = [
  {
    label: "System Architecture",
    rawJsonPath: "example/google-gemini-2.5-flash_0_system_architecture_b553d7e2_raw.json",
    templatePath: "docs/templates/synthesis/synthesis_system_architecture.md",
    templateName: "synthesis_system_architecture",
    templateFileName: "synthesis_system_architecture.md",
    documentKey: FileType.system_architecture,
    stageSlug: "synthesis",
    checks: (rendered: string) => [
      // Structure
      ["# Architecture Summary present", rendered.includes("# Architecture Summary")],
      ["# Architecture present", rendered.includes("# Architecture")],
      ["# Services present", rendered.includes("# Services")],
      ["# Components present", rendered.includes("# Components")],
      ["# Data Flows present", rendered.includes("# Data Flows")],
      ["# Interfaces present", rendered.includes("# Interfaces")],
      ["# Integration Points present", rendered.includes("# Integration Points")],
      ["# Risk Mitigations present", rendered.includes("# Risk Mitigations")],
      ["# Risk Signals present", rendered.includes("# Risk Signals")],
      ["# Security Measures present", rendered.includes("# Security Measures")],
      ["# Observability Strategy present", rendered.includes("# Observability Strategy")],
      ["# Scalability Plan present", rendered.includes("# Scalability Plan")],
      ["# Resilience Strategy present", rendered.includes("# Resilience Strategy")],
      ["# Compliance Controls present", rendered.includes("# Compliance Controls")],
      ["# Open Questions present", rendered.includes("# Open Questions")],
      ["# Rationale present", rendered.includes("# Rationale")],
      ["No --- separator artefact", (rendered.match(/\n---\n/g) ?? []).length === 0],

      // Content: flat string
      ["architecture string content present", rendered.includes("cloud-native")],
      ["rationale string content present", rendered.includes("robust, flexible, and scalable")],

      // Content: string arrays rendered as items
      ["services array: UMS present", rendered.includes("User Management Service (UMS)")],
      ["components array: API Gateway present", rendered.includes("API Gateway (AWS API Gateway)")],
      ["risk_signals array: latency item present", rendered.includes("Increase in latency")],
      ["open_questions array: data residency present", rendered.includes("data residency")],

      // No raw JSON
      ['No raw JSON opening brace', !rendered.includes('{"')],
    ],
  },
  {
    label: "Tech Stack",
    rawJsonPath: "example/google-gemini-2.5-flash_0_tech_stack_b553d7e2_raw.json",
    templatePath: "docs/templates/synthesis/synthesis_tech_stack.md",
    templateName: "synthesis_tech_stack",
    templateFileName: "synthesis_tech_stack.md",
    documentKey: FileType.tech_stack,
    stageSlug: "synthesis",
    checks: (rendered: string) => [
      // Structure
      ["Main header appears exactly once",
        (rendered.match(/# Tech Stack Recommendations/g) ?? []).length === 1],
      ["## Frontend Stack present", rendered.includes("## Frontend Stack")],
      ["## Backend Stack present", rendered.includes("## Backend Stack")],
      ["## Data Platform present", rendered.includes("## Data Platform")],
      ["## Shared Libraries present", rendered.includes("## Shared Libraries")],
      ["## Third-Party Services present", rendered.includes("## Third-Party Services")],
      ["## Component Recommendations present", rendered.includes("## Component Recommendations")],
      ["## Open Questions present", rendered.includes("## Open Questions")],
      ["## Next Steps present", rendered.includes("## Next Steps")],
      ["No --- separator artefact", (rendered.match(/\n---\n/g) ?? []).length === 0],

      // Flat string fields
      ["frontend_stack content: React", rendered.includes("React")],
      ["backend_stack content: Spring Boot", rendered.includes("Spring Boot")],
      ["data_platform content: PostgreSQL", rendered.includes("PostgreSQL")],

      // String arrays
      ["shared_libraries content present", rendered.includes("utility libraries")],
      ["third_party_services content: Stripe", rendered.includes("Stripe")],
      ["open_questions content present", rendered.includes("cloud provider")],
      ["next_steps content: proof-of-concept", rendered.includes("proof-of-concept")],

      // Array-of-objects (components) rendered as formatted markdown
      ["component: Recommendation Engine Service", rendered.includes("Recommendation Engine Service")],
      ["component: Learning Path Service", rendered.includes("Learning Path Service")],
      ["component field: Python with FastAPI", rendered.includes("Python with FastAPI")],
      ["component field: Neo4j", rendered.includes("Neo4j")],

      // No raw JSON
      ['No raw JSON opening brace', !rendered.includes('{"')],

      // No metadata
      ["No continuation_needed", !rendered.includes("continuation_needed")],
      ["No stop_reason", !rendered.includes("stop_reason")],
    ],
  },
  {
    label: "Product Requirements",
    rawJsonPath: "example/google-gemini-2.5-flash_0_product_requirements_b553d7e2_raw.json",
    templatePath: "docs/templates/synthesis/synthesis_product_requirements.md",
    templateName: "synthesis_product_requirements",
    templateFileName: "synthesis_product_requirements.md",
    documentKey: FileType.product_requirements,
    stageSlug: "synthesis",
    checks: (rendered: string) => [
      // Structure
      ["# Executive Summary present", rendered.includes("# Executive Summary")],
      ["# MVP Description present", rendered.includes("# MVP Description")],
      ["# Market Opportunity present", rendered.includes("# Market Opportunity")],
      ["# Competitive Analysis present", rendered.includes("# Competitive Analysis")],
      ["# Differentiation & Value Proposition present", rendered.includes("# Differentiation & Value Proposition")],
      ["# Risks & Mitigation present", rendered.includes("# Risks & Mitigation")],
      ["# SWOT Overview present", rendered.includes("# SWOT Overview")],
      ["## Strengths present", rendered.includes("## Strengths")],
      ["## Weaknesses present", rendered.includes("## Weaknesses")],
      ["## Opportunities present", rendered.includes("## Opportunities")],
      ["## Threats present", rendered.includes("## Threats")],
      ["# Feature Details present", rendered.includes("# Feature Details")],
      ["# Outcome Alignment & Success Metrics present", rendered.includes("# Outcome Alignment & Success Metrics")],
      ["## Primary KPIs present", rendered.includes("## Primary KPIs")],
      ["# Decisions & Follow-Ups present", rendered.includes("# Decisions & Follow-Ups")],
      ["## Open Questions present", rendered.includes("## Open Questions")],
      ["No --- separator artefact", (rendered.match(/\n---\n/g) ?? []).length === 0],

      // Executive Summary appears exactly once (not duplicated per feature)
      ["Executive Summary appears once",
        (rendered.match(/# Executive Summary/g) ?? []).length === 1],

      // Flat string content
      ["executive_summary content present", rendered.includes("revolutionize online education")],
      ["mvp_description content present", rendered.includes("Minimum Viable Product")],
      ["outcome_alignment content present", rendered.includes("empowering individuals")],
      ["north_star_metric content present", rendered.includes("Skill Mastery")],

      // SWOT string arrays rendered
      ["strengths item: AI-driven", rendered.includes("AI-driven personalization engine")],
      ["weaknesses item: content library", rendered.includes("Initial content library size")],
      ["opportunities item: corporate", rendered.includes("corporate training")],
      ["threats item: competitors", rendered.includes("competitors")],

      // Features array-of-objects rendered
      ["feature: AI-Powered Content Recommendation", rendered.includes("AI-Powered Content Recommendation")],
      ["feature: Adaptive Learning Path Generation", rendered.includes("Adaptive Learning Path Generation")],

      // KPIs
      ["primary_kpis: Monthly Active Learners", rendered.includes("Monthly Active Learners")],

      // No raw JSON
      ['No raw JSON opening brace', !rendered.includes('{"')],

      // No metadata
      ["No continuation_needed", !rendered.includes("continuation_needed")],
      ["No stop_reason", !rendered.includes("stop_reason")],
    ],
  },
  {
    label: "Feature Spec (per-item)",
    rawJsonPath: "example/google-gemini-2.5-flash_0_feature_spec_1f2f40ac_raw.json",
    templatePath: "docs/templates/thesis/thesis_feature_spec.md",
    templateName: "thesis_feature_spec",
    templateFileName: "thesis_feature_spec.md",
    documentKey: FileType.feature_spec,
    stageSlug: "hypothesis",
    checks: (rendered: string) => [
      // Per-item rendering: template rendered once per feature, joined with ---
      ["Rendered output is non-trivial (>500 chars)", rendered.length > 500],

      // All 6 features present
      ["feature: User Account Management", rendered.includes("User Account Management")],
      ["feature: Basic Note-taking", rendered.includes("Basic Note-taking")],
      ["feature: To-Do List Management", rendered.includes("To-Do List Management")],
      ["feature: Reminder and Notification System", rendered.includes("Reminder and Notification System")],
      ["feature: Event Scheduling", rendered.includes("Event Scheduling")],
      ["feature: Dashboard & Initial Display", rendered.includes("Dashboard & Initial Display")],

      // Template headers rendered per feature (6 features = 6 occurrences)
      ["# Feature Name appears 6 times",
        (rendered.match(/# Feature Name/g) ?? []).length === 6],
      ["## Feature Objective appears 6 times",
        (rendered.match(/## Feature Objective/g) ?? []).length === 6],
      ["## User Stories appears 6 times",
        (rendered.match(/## User Stories/g) ?? []).length === 6],
      ["## Acceptance Criteria appears 6 times",
        (rendered.match(/## Acceptance Criteria/g) ?? []).length === 6],
      ["## Success Metrics appears 6 times",
        (rendered.match(/## Success Metrics/g) ?? []).length === 6],

      // Feature objectives present
      ["objective: securely register", rendered.includes("securely register, log in, and manage")],
      ["objective: simple and efficient", rendered.includes("simple and efficient way to create")],
      ["objective: create, track, and manage tasks", rendered.includes("create, track, and manage tasks")],

      // User stories rendered (not raw JSON)
      ["user story: create an account", rendered.includes("As a new user, I want to create an account")],
      ["user story: create a new note", rendered.includes("As a user, I want to create a new note")],
      ["user story: add a new task", rendered.includes("As a user, I want to add a new task")],
      ["user story: schedule a new event", rendered.includes("As a user, I want to schedule a new event")],
      ["user story: Hello World greeting", rendered.includes("Hello World")],

      // Acceptance criteria rendered
      ["criteria: unique email and password", rendered.includes("unique email and password")],
      ["criteria: calendar view", rendered.includes("calendar view")],

      // Success metrics rendered
      ["metric: user registrations", rendered.includes("Number of new user registrations per week")],
      ["metric: task completion rate", rendered.includes("Task completion rate")],

      // Dependencies rendered
      ["dependency: User Account Management in Note-taking", rendered.includes("User Account Management")],

      // --- separators between features (per-item rendering joins with ---)
      ["--- separators between features", (rendered.match(/\n---\n/g) ?? []).length === 5],

      // No raw JSON
      ['No raw JSON opening brace', !rendered.includes('{"')],
    ],
  },
];

// ── Run each case ───────────────────────────────────────────────────────

let totalPassed = 0;
let totalFailed = 0;

for (const proofCase of cases) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${proofCase.label}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Raw JSON : ${proofCase.rawJsonPath}`);
  console.log(`  Template : ${proofCase.templatePath}`);

  // Read real files from disk
  const rawJsonContent = await Deno.readTextFile(proofCase.rawJsonPath);
  const templateContent = await Deno.readTextFile(proofCase.templatePath);

  // Build mock infrastructure for renderDocument
  const rootId = `root-proof-${proofCase.label.replace(/\s+/g, "-").toLowerCase()}`;
  const sessionId = "session_proof_1";
  const stageSlug = proofCase.stageSlug;
  const storagePath = `proj_proof/session_s/iteration_1/${stageSlug}/raw_responses`;
  const fileName = `google-gemini-2.5-flash_0_${proofCase.documentKey}_raw.json`;
  const rawJsonStoragePath = `${storagePath}/${fileName}`;

  const contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']> = [
    {
      id: rootId,
      session_id: sessionId,
      stage: stageSlug.toUpperCase(),
      iteration_number: 1,
      model_id: "model-uuid-gemini",
      model_name: "Google Gemini 2.5 Flash",
      storage_bucket: "content",
      storage_path: storagePath,
      file_name: fileName,
      raw_response_storage_path: rawJsonStoragePath,
      mime_type: "application/json",
      document_relationships: { [stageSlug]: rootId },
      created_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      updated_at: new Date(2025, 0, 1, 12, 0, 0).toISOString(),
      target_contribution_id: null,
      edit_version: 1,
      is_latest_edit: true,
      user_id: "user_proof",
      contribution_type: null,
      citations: null,
      error: null,
      is_header: false,
      original_model_contribution_id: null,
      processing_time_ms: null,
      prompt_template_id_used: null,
      seed_prompt_url: null,
      size_bytes: null,
      source_prompt_resource_id: null,
      tokens_used_input: null,
      tokens_used_output: null,
    },
  ];

  const config: MockSupabaseDataConfig = {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
      },
      dialectic_projects: {
        select: { data: [{ id: "project_proof", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
      },
      dialectic_document_templates: {
        select: {
          data: [
            {
              id: `template-${proofCase.documentKey}`,
              created_at: "2025-01-01T00:00:00Z",
              description: null,
              domain_id: "domain-1",
              file_name: proofCase.templateFileName,
              is_active: true,
              name: proofCase.templateName,
              storage_bucket: "prompt-templates",
              storage_path: "templates/synthesis",
              updated_at: "2025-01-01T00:00:00Z",
            },
          ],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        },
      },
    },
  };

  const { client } = createMockSupabaseClient(undefined, config);
  const dbClient = client as unknown as SupabaseClient<Database>;

  const mockDownloadFromStorage = async (
    _supabase: SupabaseClient,
    _bucket: string,
    path: string,
  ) => {
    if (path === rawJsonStoragePath) {
      const blob = new Blob([rawJsonContent], { type: "application/json" });
      return { data: await blob.arrayBuffer(), error: null };
    }
    const blob = new Blob([templateContent], { type: "text/markdown" });
    return { data: await blob.arrayBuffer(), error: null };
  };

  const mockFileManager = new MockFileManagerService();
  mockFileManager.setUploadAndRegisterFileResponse(
    {
      id: `resource-proof-${proofCase.documentKey}`,
      project_id: "project_proof",
      session_id: sessionId,
      user_id: "user_proof",
      stage_slug: stageSlug,
      iteration_number: 1,
      resource_type: FileType.RenderedDocument,
      file_name: "rendered.md",
      mime_type: "text/markdown",
      size_bytes: 100,
      storage_bucket: "content",
      storage_path: storagePath,
      resource_description: { type: FileType.RenderedDocument },
      source_contribution_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    null,
  );

  const params: RenderDocumentParams = {
    projectId: "project_proof",
    sessionId,
    iterationNumber: 1,
    stageSlug,
    documentIdentity: rootId,
    documentKey: proofCase.documentKey,
    sourceContributionId: rootId,
    template_filename: proofCase.templateFileName,
  };

  console.log("\n  Calling renderDocument...\n");

  const result = await renderDocument(
    dbClient,
    {
      downloadFromStorage: mockDownloadFromStorage,
      fileManager: mockFileManager,
      notificationService: mockNotificationService,
      notifyUserId: "user_proof",
      logger: logger,
    },
    params,
  );

  const rendered = new TextDecoder().decode(result.renderedBytes);

  // Write rendered output to example/ folder
  const outputPath = proofCase.rawJsonPath.replace(/_raw\.json$/, "_rendered.md");
  await Deno.writeTextFile(outputPath, rendered);
  console.log(`  Output   : ${outputPath}`);
  console.log(`  Size     : ${result.renderedBytes.length} bytes\n`);

  // Run checks
  const checkResults = proofCase.checks(rendered);
  let casePassed = 0;
  let caseFailed = 0;
  for (const [label, ok] of checkResults) {
    const mark = ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${label}`);
    if (ok) casePassed++; else caseFailed++;
  }
  console.log(`\n  ${casePassed} passed, ${caseFailed} failed out of ${checkResults.length} checks.`);
  totalPassed += casePassed;
  totalFailed += caseFailed;
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(70)}`);
console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed out of ${totalPassed + totalFailed} checks.`);
console.log(`${"=".repeat(70)}\n`);

if (totalFailed > 0) {
  console.error("Some checks FAILED. See rendered output files for debugging.");
  Deno.exit(1);
}

console.log("All checks passed across all four document types.");
