import { assert } from "jsr:@std/assert@0.225.3";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../types_db.ts";
import { createMockSupabaseClient, type MockSupabaseDataConfig } from "../supabase.mock.ts";
import { downloadFromStorage } from "../supabase_storage_utils.ts";
import { renderDocument } from "./document_renderer.ts";
import type { RenderDocumentParams, RenderDocumentResult } from "./document_renderer.interface.ts";
import { FileType, type FileRecord } from "../types/file_manager.types.ts";
import { MockFileManagerService } from "./file_manager.mock.ts";
import { mockNotificationService } from "../utils/notification.service.mock.ts";
import { logger } from "../logger.ts";

// ── Template constants (matching docs/templates/synthesis/) ─────────────

const SYSTEM_ARCHITECTURE_TEMPLATE = `# Architecture Summary
{{#section:architecture_summary}}{architecture_summary}{{/section:architecture_summary}}

{{#section:architecture}}
# Architecture
{architecture}
{{/section:architecture}}

{{#section:services}}
# Services
{services}
{{/section:services}}

{{#section:components}}
# Components
{components}
{{/section:components}}

{{#section:data_flows}}
# Data Flows
{data_flows}
{{/section:data_flows}}

{{#section:interfaces}}
# Interfaces
{interfaces}
{{/section:interfaces}}

{{#section:integration_points}}
# Integration Points
{integration_points}
{{/section:integration_points}}

{{#section:dependency_resolution}}
# Dependency Resolution
{dependency_resolution}
{{/section:dependency_resolution}}

{{#section:conflict_flags}}
# Conflict Flags
{conflict_flags}
{{/section:conflict_flags}}

{{#section:sequencing}}
# Sequencing
{sequencing}
{{/section:sequencing}}

{{#section:risk_mitigations}}
# Risk Mitigations
{risk_mitigations}
{{/section:risk_mitigations}}

{{#section:risk_signals}}
# Risk Signals
{risk_signals}
{{/section:risk_signals}}

{{#section:security_measures}}
# Security Measures
{security_measures}
{{/section:security_measures}}

{{#section:observability_strategy}}
# Observability Strategy
{observability_strategy}
{{/section:observability_strategy}}

{{#section:scalability_plan}}
# Scalability Plan
{scalability_plan}
{{/section:scalability_plan}}

{{#section:resilience_strategy}}
# Resilience Strategy
{resilience_strategy}
{{/section:resilience_strategy}}

{{#section:compliance_controls}}
# Compliance Controls
{compliance_controls}
{{/section:compliance_controls}}

{{#section:open_questions}}
# Open Questions
{open_questions}
{{/section:open_questions}}

{{#section:rationale}}
# Rationale
{rationale}
{{/section:rationale}}

{{#section:_extra_content}}
# Additional Content
{_extra_content}
{{/section:_extra_content}}

`;

const TECH_STACK_TEMPLATE = `# Tech Stack Recommendations

{{#section:frontend_stack}}
## Frontend Stack
{frontend_stack}
{{/section:frontend_stack}}

{{#section:backend_stack}}
## Backend Stack
{backend_stack}
{{/section:backend_stack}}

{{#section:data_platform}}
## Data Platform
{data_platform}
{{/section:data_platform}}

{{#section:devops_tooling}}
## DevOps Tooling
{devops_tooling}
{{/section:devops_tooling}}

{{#section:security_tooling}}
## Security Tooling
{security_tooling}
{{/section:security_tooling}}

{{#section:shared_libraries}}
## Shared Libraries
{shared_libraries}
{{/section:shared_libraries}}

{{#section:third_party_services}}
## Third-Party Services
{third_party_services}
{{/section:third_party_services}}

{{#section:components}}
## Component Recommendations
{components}
{{/section:components}}

{{#section:open_questions}}
## Open Questions
{open_questions}
{{/section:open_questions}}

{{#section:next_steps}}
## Next Steps
{next_steps}
{{/section:next_steps}}

{{#section:_extra_content}}
## Additional Content
{_extra_content}
{{/section:_extra_content}}

`;

const PRODUCT_REQUIREMENTS_TEMPLATE = `{{#section:executive_summary}}
# Executive Summary
{executive_summary}
{{/section:executive_summary}}

{{#section:mvp_description}}
# MVP Description
{mvp_description}
{{/section:mvp_description}}

{{#section:user_problem_validation}}
# User Problem Validation
{user_problem_validation}
{{/section:user_problem_validation}}

{{#section:market_opportunity}}
# Market Opportunity
{market_opportunity}
{{/section:market_opportunity}}

{{#section:competitive_analysis}}
# Competitive Analysis
{competitive_analysis}
{{/section:competitive_analysis}}

{{#section:differentiation_&_value_proposition}}
# Differentiation & Value Proposition
{differentiation_&_value_proposition}
{{/section:differentiation_&_value_proposition}}

{{#section:risks_&_mitigation}}
# Risks & Mitigation
{risks_&_mitigation}
{{/section:risks_&_mitigation}}

# SWOT Overview
{{#section:strengths}}
## Strengths
{strengths}
{{/section:strengths}}
{{#section:weaknesses}}
## Weaknesses
{weaknesses}
{{/section:weaknesses}}
{{#section:opportunities}}
## Opportunities
{opportunities}
{{/section:opportunities}}
{{#section:threats}}
## Threats
{threats}
{{/section:threats}}

{{#section:feature_scope}}
# Feature Scope
{feature_scope}
{{/section:feature_scope}}

{{#section:features}}
# Feature Details
{features}
{{/section:features}}

{{#section:feasibility_insights}}
# Feasibility Insights
{feasibility_insights}
{{/section:feasibility_insights}}

{{#section:non_functional_alignment}}
# Non-Functional Alignment
{non_functional_alignment}
{{/section:non_functional_alignment}}

{{#section:score_adjustments}}
# Score Adjustments & Tradeoffs
{score_adjustments}
{{/section:score_adjustments}}

# Outcome Alignment & Success Metrics
{{#section:outcome_alignment}}
- Outcome Alignment: {outcome_alignment}
{{/section:outcome_alignment}}
{{#section:north_star_metric}}
- North Star Metric: {north_star_metric}
{{/section:north_star_metric}}
{{#section:primary_kpis}}
## Primary KPIs
{primary_kpis}
{{/section:primary_kpis}}
{{#section:leading_indicators}}
## Leading Indicators
{leading_indicators}
{{/section:leading_indicators}}
{{#section:lagging_indicators}}
## Lagging Indicators
{lagging_indicators}
{{/section:lagging_indicators}}
{{#section:guardrails}}
## Guardrails
{guardrails}
{{/section:guardrails}}
{{#section:measurement_plan}}
## Measurement Plan
{measurement_plan}
{{/section:measurement_plan}}
{{#section:risk_signals}}
## Risk Signals
{risk_signals}
{{/section:risk_signals}}

# Decisions & Follow-Ups
{{#section:resolved_positions}}
## Resolved Positions
{resolved_positions}
{{/section:resolved_positions}}
{{#section:open_questions}}
## Open Questions
{open_questions}
{{/section:open_questions}}
{{#section:next_steps}}
## Next Steps
{next_steps}
{{/section:next_steps}}

{{#section:release_plan}}
# Release Plan
{release_plan}
{{/section:release_plan}}

{{#section:assumptions}}
# Assumptions
{assumptions}
{{/section:assumptions}}

{{#section:open_decisions}}
# Open Decisions
{open_decisions}
{{/section:open_decisions}}

{{#section:implementation_risks}}
# Implementation Risks
{implementation_risks}
{{/section:implementation_risks}}

{{#section:stakeholder_communications}}
# Stakeholder Communications
{stakeholder_communications}
{{/section:stakeholder_communications}}

{{#section:proposal_references}}
# References
{proposal_references}
{{/section:proposal_references}}

{{#section:_extra_content}}
# Additional Content
{_extra_content}
{{/section:_extra_content}}

`;

// ── Shared helpers ──────────────────────────────────────────────────────

function createMockFileRecord(overrides?: Partial<Database['public']['Tables']['dialectic_project_resources']['Row']>): FileRecord {
  const defaultRecord: Database['public']['Tables']['dialectic_project_resources']['Row'] = {
    id: "resource-id-1",
    project_id: "project_proof",
    session_id: "session_proof",
    user_id: "user_proof",
    stage_slug: "synthesis",
    iteration_number: 1,
    resource_type: FileType.RenderedDocument,
    file_name: "rendered_document.md",
    mime_type: "text/markdown",
    size_bytes: 100,
    storage_bucket: "content",
    storage_path: "proj_x/session_s/iteration_1/synthesis/rendered",
    resource_description: { type: FileType.RenderedDocument },
    source_contribution_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return { ...defaultRecord, ...overrides } as FileRecord;
}

function makeContribution(
  rootId: string,
  sessionId: string,
  stageSlug: string,
  fileName: string,
): Database['public']['Tables']['dialectic_contributions']['Row'] {
  return {
    id: rootId,
    session_id: sessionId,
    stage: stageSlug.toUpperCase(),
    iteration_number: 1,
    model_id: "model-uuid-gemini",
    model_name: "Google Gemini 2.5 Flash",
    storage_bucket: "content",
    storage_path: `proj_x/session_s/iteration_1/${stageSlug}/raw_responses`,
    file_name: fileName,
    raw_response_storage_path: `proj_x/session_s/iteration_1/${stageSlug}/raw_responses/${fileName}`,
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
  };
}

function makeConfig(
  contributions: Array<Database['public']['Tables']['dialectic_contributions']['Row']>,
  templateName: string,
  templateFileName: string,
  jsonContent: string,
  templateContent: string,
  rawFileName: string,
): MockSupabaseDataConfig {
  return {
    genericMockResults: {
      dialectic_contributions: {
        select: { data: contributions, error: null, count: null, status: 200, statusText: "OK" },
      },
      dialectic_projects: {
        select: { data: [{ id: "project_proof", selected_domain_id: "domain-1" }], error: null, count: null, status: 200, statusText: "OK" },
      },
      dialectic_document_templates: {
        select: {
          data: [{
            id: "template-1",
            created_at: "2025-01-01T00:00:00Z",
            description: null,
            domain_id: "domain-1",
            file_name: templateFileName,
            is_active: true,
            name: templateName,
            storage_bucket: "prompt-templates",
            storage_path: "templates/synthesis",
            updated_at: "2025-01-01T00:00:00Z",
          }],
          error: null,
          count: null,
          status: 200,
          statusText: "OK",
        },
      },
    },
    storageMock: {
      downloadResult: async (_bucketId: string, path: string) => {
        if (path.includes(rawFileName)) {
          const blob = new Blob([jsonContent], { type: "application/json" });
          return { data: blob, error: null };
        }
        const blob = new Blob([templateContent], { type: "text/markdown" });
        return { data: blob, error: null };
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

Deno.test("DocumentRenderer - multi-structure JSON rendering patterns", async (t) => {
  const setup = (config: MockSupabaseDataConfig = {}) => {
    const { client, spies, clearAllStubs } = createMockSupabaseClient(undefined, config);
    return { dbClient: client as unknown as SupabaseClient<Database>, spies, clearAllStubs };
  };

  await t.step("renders flat strings and string arrays (system_architecture pattern)", async () => {
    // Pattern: { content: { string_key: "...", array_key: ["...", "..."], ... } }
    // All values are either strings or string arrays. No nested objects.
    const rootId = "root-sysarch-1";
    const sessionId = "session_sysarch";
    const stageSlug = "synthesis";
    const rawFileName = "google-gemini-2.5-flash_0_system_architecture_raw.json";

    const agentResponse = {
      content: {
        architecture: "A cloud-native microservices architecture on AWS.",
        services: [
          "User Management Service (UMS): Handles authentication.",
          "Content Catalog Service (CCS): Manages content metadata.",
        ],
        components: [
          "API Gateway (AWS API Gateway): Entry point.",
          "Message Broker (AWS MSK/Kafka): Async communication.",
        ],
        data_flows: [
          "User Login -> API Gateway -> UMS.",
        ],
        interfaces: [
          "RESTful APIs for synchronous communication.",
        ],
        integration_points: [
          "External Identity Providers.",
        ],
        dependency_resolution: [
          "Service-to-service via API Gateway.",
        ],
        conflict_flags: [
          "**Strong vs. Eventual Consistency:** Favor eventual consistency.",
        ],
        sequencing: "1. Foundation services. 2. Content Catalog.",
        risk_mitigations: [
          "**Single Point of Failure:** Multi-AZ deployments.",
        ],
        risk_signals: [
          "Increase in latency for critical API endpoints (>200ms).",
        ],
        security_measures: [
          "**Authentication:** OAuth 2.0, RBAC.",
        ],
        observability_strategy: [
          "**Logging:** Centralized structured logging.",
        ],
        scalability_plan: [
          "**Horizontal Scaling:** Stateless microservices.",
        ],
        resilience_strategy: [
          "**High Availability:** Multi-AZ deployments.",
        ],
        compliance_controls: [
          "**GDPR/CCPA:** Pseudonymization of PII.",
        ],
        open_questions: [
          "Data residency requirements.",
        ],
        rationale: "The architecture provides a robust foundation.",
        architecture_summary: "A modular architecture on AWS.",
      },
    };

    const contributions = [makeContribution(rootId, sessionId, stageSlug, rawFileName)];
    const jsonContent = JSON.stringify(agentResponse);

    const { dbClient, clearAllStubs } = setup(makeConfig(
      contributions,
      "synthesis_system_architecture",
      "synthesis_system_architecture.md",
      jsonContent,
      SYSTEM_ARCHITECTURE_TEMPLATE,
      rawFileName,
    ));

    const params: RenderDocumentParams = {
      projectId: "project_proof",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.system_architecture,
      sourceContributionId: rootId,
      template_filename: "synthesis_system_architecture.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_proof",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Section headers present
    assert(rendered.includes("# Architecture Summary"), "should contain Architecture Summary header");
    assert(rendered.includes("# Architecture"), "should contain Architecture header");
    assert(rendered.includes("# Services"), "should contain Services header");
    assert(rendered.includes("# Components"), "should contain Components header");
    assert(rendered.includes("# Data Flows"), "should contain Data Flows header");
    assert(rendered.includes("# Risk Signals"), "should contain Risk Signals header");
    assert(rendered.includes("# Open Questions"), "should contain Open Questions header");
    assert(rendered.includes("# Rationale"), "should contain Rationale header");

    // Flat string values rendered
    assert(rendered.includes("A cloud-native microservices architecture on AWS."), "should contain architecture string");
    assert(rendered.includes("The architecture provides a robust foundation."), "should contain rationale string");
    assert(rendered.includes("A modular architecture on AWS."), "should contain architecture_summary string");

    // String array items rendered
    assert(rendered.includes("User Management Service (UMS): Handles authentication."), "should contain services array item");
    assert(rendered.includes("API Gateway (AWS API Gateway): Entry point."), "should contain components array item");
    assert(rendered.includes("Data residency requirements."), "should contain open_questions array item");

    // No raw JSON
    assert(!rendered.includes('{"'), "should NOT contain raw JSON opening brace");
    assert(!rendered.includes('"architecture"'), "should NOT contain raw JSON key");

    // No item-separator artefact
    assert(!(rendered.match(/\n---\n/g)?.length), "should NOT contain --- separator artefacts");

    clearAllStubs?.();
  });

  await t.step("renders mixed flat fields and array-of-objects (tech_stack pattern)", async () => {
    // Pattern: { string_key: "...", array_of_strings: [...], array_of_objects: [{...}], metadata: ... }
    // Top-level strings, string arrays, AND array of objects with nested arrays.
    // No content wrapper. Metadata fields (continuation_needed, stop_reason) at top level.
    const rootId = "root-techstack-1";
    const sessionId = "session_techstack";
    const stageSlug = "synthesis";
    const rawFileName = "google-gemini-2.5-flash_0_tech_stack_raw.json";

    const agentResponse = {
      continuation_needed: false,
      stop_reason: "complete",
      frontend_stack: "React with Next.js, TypeScript, Tailwind CSS.",
      backend_stack: "Java 17 with Spring Boot, Python for AI/ML.",
      data_platform: "AWS RDS PostgreSQL, DynamoDB, Neo4j.",
      devops_tooling: "AWS EKS Kubernetes, Docker, Terraform.",
      security_tooling: "AWS WAF, AWS Secrets Manager.",
      shared_libraries: [
        "Internal common utility libraries.",
        "Standardized API client libraries.",
      ],
      third_party_services: [
        "Twilio SendGrid for email.",
        "Stripe for payment processing.",
      ],
      components: [
        {
          component_name: "Recommendation Engine Service",
          recommended_option: "Python with FastAPI on AWS SageMaker.",
          rationale: "Python is industry standard for ML development.",
          alternatives: [
            "Java with Deeplearning4j.",
            "Custom Kubernetes deployments.",
          ],
          tradeoffs: [
            "Python GIL limits parallel execution.",
          ],
          risk_signals: [
            "High latency for recommendation requests.",
          ],
          integration_requirements: [
            "API integration with Learning Path Service.",
          ],
          operational_owners: [
            "AI/ML Engineering Team",
          ],
          migration_plan: [
            "Start with rule-based recommendations.",
          ],
        },
        {
          component_name: "Learning Path Service",
          recommended_option: "Java 17 with Spring Boot, Neo4j.",
          rationale: "Neo4j is ideal for knowledge graphs.",
          alternatives: [
            "PostgreSQL with recursive CTEs.",
          ],
          tradeoffs: [
            "Neo4j requires specialized knowledge.",
          ],
          risk_signals: [
            "Slow path generation times.",
          ],
          integration_requirements: [
            "API integration with Content Catalog Service.",
          ],
          operational_owners: [
            "Backend Engineering Team",
          ],
          migration_plan: [
            "Start with simplified knowledge graph.",
          ],
        },
      ],
      open_questions: [
        "Finalize cloud provider for ML needs.",
        "Evaluate content delivery integration strategies.",
      ],
      next_steps: [
        "Conduct a PoC for Neo4j-based Learning Path Service.",
        "Develop a detailed MLOps strategy.",
      ],
    };

    const contributions = [makeContribution(rootId, sessionId, stageSlug, rawFileName)];
    const jsonContent = JSON.stringify(agentResponse);

    const { dbClient, clearAllStubs } = setup(makeConfig(
      contributions,
      "synthesis_tech_stack",
      "synthesis_tech_stack.md",
      jsonContent,
      TECH_STACK_TEMPLATE,
      rawFileName,
    ));

    const params: RenderDocumentParams = {
      projectId: "project_proof",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.tech_stack,
      sourceContributionId: rootId,
      template_filename: "synthesis_tech_stack.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_proof",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // All section headers present
    assert(rendered.includes("# Tech Stack Recommendations"), "should contain main heading");
    assert(rendered.includes("## Frontend Stack"), "should contain Frontend Stack header");
    assert(rendered.includes("## Backend Stack"), "should contain Backend Stack header");
    assert(rendered.includes("## Data Platform"), "should contain Data Platform header");
    assert(rendered.includes("## Shared Libraries"), "should contain Shared Libraries header");
    assert(rendered.includes("## Third-Party Services"), "should contain Third-Party Services header");
    assert(rendered.includes("## Component Recommendations"), "should contain Component Recommendations header");
    assert(rendered.includes("## Open Questions"), "should contain Open Questions header");
    assert(rendered.includes("## Next Steps"), "should contain Next Steps header");

    // Flat string fields rendered in their sections
    assert(rendered.includes("React with Next.js, TypeScript, Tailwind CSS."), "should contain frontend_stack content");
    assert(rendered.includes("Java 17 with Spring Boot, Python for AI/ML."), "should contain backend_stack content");
    assert(rendered.includes("AWS RDS PostgreSQL, DynamoDB, Neo4j."), "should contain data_platform content");

    // String arrays rendered
    assert(rendered.includes("Internal common utility libraries."), "should contain shared_libraries item");
    assert(rendered.includes("Stripe for payment processing."), "should contain third_party_services item");
    assert(rendered.includes("Finalize cloud provider for ML needs."), "should contain open_questions item");
    assert(rendered.includes("Conduct a PoC for Neo4j-based Learning Path Service."), "should contain next_steps item");

    // Array-of-objects (components) rendered as formatted markdown within the section
    assert(rendered.includes("Recommendation Engine Service"), "should contain first component name");
    assert(rendered.includes("Learning Path Service"), "should contain second component name");
    assert(rendered.includes("Python with FastAPI on AWS SageMaker."), "should contain first component recommended_option");
    assert(rendered.includes("Java 17 with Spring Boot, Neo4j."), "should contain second component recommended_option");
    assert(rendered.includes("Python is industry standard for ML development."), "should contain first component rationale");

    // No metadata fields
    assert(!rendered.includes("continuation_needed"), "should NOT contain continuation_needed");
    assert(!rendered.includes("stop_reason"), "should NOT contain stop_reason");

    // No raw JSON
    assert(!rendered.includes('{"'), "should NOT contain raw JSON opening brace");

    // No --- separator artefacts (produced by broken per-item array rendering)
    const separatorMatches = rendered.match(/\n---\n/g);
    assert(!separatorMatches || separatorMatches.length === 0, "should NOT contain --- separator artefacts");

    // Main heading appears exactly once (not duplicated per component)
    const mainHeadingMatches = rendered.match(/# Tech Stack Recommendations/g);
    assert(mainHeadingMatches !== null && mainHeadingMatches.length === 1, "main heading should appear exactly once");

    clearAllStubs?.();
  });

  await t.step("renders content-wrapped flat fields, SWOT arrays, and features array-of-objects (product_requirements pattern)", async () => {
    // Pattern: { content: { string_key: "...", string_array: [...], object_array: [{nested_arrays: [...]}] }, continuation_needed: false }
    // Content wrapper present. Mix of strings, string arrays, and array of objects with nested arrays.
    // Outer metadata fields at same level as content.
    const rootId = "root-prodreq-1";
    const sessionId = "session_prodreq";
    const stageSlug = "synthesis";
    const rawFileName = "google-gemini-2.5-flash_0_product_requirements_raw.json";

    const agentResponse = {
      content: {
        executive_summary: "The platform aims to revolutionize online education.",
        mvp_description: "The MVP delivers core adaptive learning capabilities.",
        user_problem_validation: "Learners struggle with generic content.",
        market_opportunity: "The market for personalized education is substantial.",
        competitive_analysis: "Competitors lack deep AI-driven personalization.",
        "differentiation_&_value_proposition": "Superior AI-driven personalization engine.",
        "risks_&_mitigation": "Content acquisition risk mitigated by partnerships.",
        strengths: [
          "Innovative AI-driven personalization engine",
          "Comprehensive real-time feedback",
        ],
        weaknesses: [
          "Initial content library size",
          "Brand recognition challenge",
        ],
        opportunities: [
          "Corporate training expansion",
          "LMS platform integration",
        ],
        threats: [
          "Rapid competitor advancement in AI",
          "Economic downturn impact",
        ],
        feature_scope: [
          "Learner Profile & Goal Management",
          "AI-Powered Content Recommendation",
        ],
        features: [
          {
            feature_name: "AI-Powered Content Recommendation",
            feature_objective: "Provide highly relevant learning content.",
            user_stories: [
              "As a learner, I want course suggestions based on my goals.",
              "As a learner, I want supplemental resources when I struggle.",
            ],
            acceptance_criteria: [
              "System recommends at least 5 relevant courses on login.",
              "Recommendation engine achieves >85% satisfaction rate.",
            ],
            dependencies: [
              "Learner Profile Management",
              "Content Management System",
            ],
            success_metrics: [
              "Click-through rate on recommended content",
            ],
            risk_mitigation: "Hybrid recommendation approach with A/B testing.",
            open_questions: [
              "Optimal balance between exploring and reinforcing?",
            ],
            tradeoffs: [
              "Accuracy vs. diversity of recommendations.",
            ],
          },
          {
            feature_name: "Adaptive Learning Path Generation",
            feature_objective: "Dynamically create personalized learning sequences.",
            user_stories: [
              "As a learner, I want a customized learning path.",
            ],
            acceptance_criteria: [
              "System generates initial path within 10 seconds.",
            ],
            dependencies: [
              "Learner Profile & Goal Management",
            ],
            success_metrics: [
              "Learning path completion rate",
            ],
            risk_mitigation: "Knowledge graph with expert review.",
            open_questions: [
              "How granular should path adaptation be?",
            ],
            tradeoffs: [
              "Algorithmic complexity vs. explainability.",
            ],
          },
        ],
        feasibility_insights: [
          "Microservices architecture supports modular development.",
          "Cloud-native services accelerate AI deployment.",
        ],
        non_functional_alignment: [
          "**Performance:** Sub-second response times.",
          "**Security:** OWASP Top 10, GDPR/CCPA compliance.",
        ],
        score_adjustments: [
          "Prioritized foundational AI features for MVP.",
        ],
        outcome_alignment: "Directly aligned with empowering learners.",
        north_star_metric: "20% increase in skill mastery within 3 months.",
        primary_kpis: [
          "Monthly Active Learners",
          "Average Course Completion Rate",
        ],
        leading_indicators: [
          "Learner onboarding completion rate",
        ],
        lagging_indicators: [
          "Certification attainment rate",
        ],
        guardrails: [
          "Maintain data privacy compliance with zero critical violations.",
        ],
        measurement_plan: "Implement analytics with Mixpanel and custom warehouse.",
        risk_signals: [
          "Low onboarding completion rate (<70%)",
        ],
        resolved_positions: [
          "MVP focuses on core personalization.",
        ],
        open_questions: [
          "Finalized content acquisition strategy.",
          "Detailed pricing model for subscription tiers.",
        ],
        next_steps: "Sprint planning for MVP features, finalize content strategy.",
        release_plan: [
          "**Phase 1 (MVP):** Core personalized learning paths.",
        ],
        assumptions: [
          "High-quality content can be reliably acquired.",
        ],
        open_decisions: [
          "Third-party vendor selection for authoring tools.",
        ],
        implementation_risks: [
          "Integration complexities with diverse content formats.",
        ],
        stakeholder_communications: [
          "Weekly progress reports to leadership.",
        ],
        proposal_references: [
          "Business Case v1.2",
          "Feature Specification v1.5",
        ],
      },
      continuation_needed: false,
      stop_reason: "complete",
    };

    const contributions = [makeContribution(rootId, sessionId, stageSlug, rawFileName)];
    const jsonContent = JSON.stringify(agentResponse);

    const { dbClient, clearAllStubs } = setup(makeConfig(
      contributions,
      "synthesis_product_requirements",
      "synthesis_product_requirements.md",
      jsonContent,
      PRODUCT_REQUIREMENTS_TEMPLATE,
      rawFileName,
    ));

    const params: RenderDocumentParams = {
      projectId: "project_proof",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.product_requirements,
      sourceContributionId: rootId,
      template_filename: "synthesis_product_requirements.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_proof",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // Key section headers present
    assert(rendered.includes("# Executive Summary"), "should contain Executive Summary header");
    assert(rendered.includes("# MVP Description"), "should contain MVP Description header");
    assert(rendered.includes("# User Problem Validation"), "should contain User Problem Validation header");
    assert(rendered.includes("# Market Opportunity"), "should contain Market Opportunity header");
    assert(rendered.includes("# Competitive Analysis"), "should contain Competitive Analysis header");
    assert(rendered.includes("# Differentiation & Value Proposition"), "should contain Differentiation header");
    assert(rendered.includes("# Risks & Mitigation"), "should contain Risks header");

    // SWOT headers present with content
    assert(rendered.includes("# SWOT Overview"), "should contain SWOT Overview header");
    assert(rendered.includes("## Strengths"), "should contain Strengths header");
    assert(rendered.includes("## Weaknesses"), "should contain Weaknesses header");
    assert(rendered.includes("## Opportunities"), "should contain Opportunities header");
    assert(rendered.includes("## Threats"), "should contain Threats header");

    // SWOT string arrays rendered
    assert(rendered.includes("Innovative AI-driven personalization engine"), "should contain strengths item");
    assert(rendered.includes("Initial content library size"), "should contain weaknesses item");
    assert(rendered.includes("Corporate training expansion"), "should contain opportunities item");
    assert(rendered.includes("Rapid competitor advancement in AI"), "should contain threats item");

    // Feature details section present with array-of-objects content
    assert(rendered.includes("# Feature Details"), "should contain Feature Details header");
    assert(rendered.includes("AI-Powered Content Recommendation"), "should contain first feature name");
    assert(rendered.includes("Adaptive Learning Path Generation"), "should contain second feature name");
    assert(rendered.includes("Provide highly relevant learning content."), "should contain first feature objective");

    // Outcome alignment section present
    assert(rendered.includes("# Outcome Alignment & Success Metrics"), "should contain Outcome Alignment header");
    assert(rendered.includes("Directly aligned with empowering learners."), "should contain outcome_alignment content");
    assert(rendered.includes("20% increase in skill mastery within 3 months."), "should contain north_star_metric content");

    // KPIs and indicators
    assert(rendered.includes("## Primary KPIs"), "should contain Primary KPIs header");
    assert(rendered.includes("Monthly Active Learners"), "should contain primary_kpis item");
    assert(rendered.includes("## Leading Indicators"), "should contain Leading Indicators header");
    assert(rendered.includes("## Lagging Indicators"), "should contain Lagging Indicators header");

    // Decisions & Follow-Ups
    assert(rendered.includes("# Decisions & Follow-Ups"), "should contain Decisions header");
    assert(rendered.includes("## Open Questions"), "should contain Open Questions header");
    assert(rendered.includes("Finalized content acquisition strategy."), "should contain open_questions item");

    // Flat string fields rendered
    assert(rendered.includes("The platform aims to revolutionize online education."), "should contain executive_summary content");
    assert(rendered.includes("The MVP delivers core adaptive learning capabilities."), "should contain mvp_description content");

    // No metadata fields
    assert(!rendered.includes("continuation_needed"), "should NOT contain continuation_needed");
    assert(!rendered.includes("stop_reason"), "should NOT contain stop_reason");

    // No raw JSON
    assert(!rendered.includes('{"'), "should NOT contain raw JSON opening brace");

    // No --- separator artefacts (produced by broken per-item array rendering)
    const separatorMatches = rendered.match(/\n---\n/g);
    assert(!separatorMatches || separatorMatches.length === 0, "should NOT contain --- separator artefacts");

    // Executive Summary appears exactly once (not duplicated per feature)
    const execSummaryMatches = rendered.match(/# Executive Summary/g);
    assert(execSummaryMatches !== null && execSummaryMatches.length === 1, "Executive Summary should appear exactly once");

    clearAllStubs?.();
  });

  await t.step("renders per-item template when data is a single array of objects whose fields match template placeholders (feature_spec pattern)", async () => {
    // Pattern: { content: { features: [ { feature_name, feature_objective, user_stories: [...], ... }, ... ] } }
    // After unwrapping content, data has ONE key (features) whose value is an array of objects.
    // The template has placeholders matching the inner object fields ({feature_name}, {feature_objective}, etc.)
    // NOT the array key ({features}).
    // Correct behavior: render the template once per item in the array.
    const rootId = "root-featurespec-1";
    const sessionId = "session_featurespec";
    const stageSlug = "hypothesis";
    const rawFileName = "google-gemini-2.5-flash_0_feature_spec_raw.json";

    const agentResponse = {
      content: {
        features: [
          {
            feature_name: "User Account Management",
            feature_objective: "Enable users to securely register, log in, and manage their personal profile.",
            user_stories: [
              "As a new user, I want to create an account so I can save my notes and tasks.",
              "As a returning user, I want to log in securely to access my existing data.",
              "As a user, I want to be able to reset my password if I forget it.",
            ],
            acceptance_criteria: [
              "Users can successfully register with a unique email and password.",
              "Registered users can log in using their credentials.",
              "Users can change their password.",
            ],
            dependencies: [],
            success_metrics: [
              "Number of new user registrations per week",
              "Successful login rate",
              "User retention rate",
            ],
          },
          {
            feature_name: "Basic Note-taking",
            feature_objective: "Provide users with a simple and efficient way to create, view, edit, and delete text-based notes.",
            user_stories: [
              "As a user, I want to create a new note to record information.",
              "As a user, I want to view all my notes in an organized list.",
              "As a user, I want to edit an existing note to update its content.",
              "As a user, I want to delete a note that is no longer needed.",
            ],
            acceptance_criteria: [
              "Users can create a new note with a title and body.",
              "All notes are listed chronologically or by last modified date.",
              "Users can permanently delete notes with a confirmation prompt.",
            ],
            dependencies: [
              "User Account Management",
            ],
            success_metrics: [
              "Number of notes created per user",
              "Average number of notes per user",
            ],
          },
          {
            feature_name: "To-Do List Management",
            feature_objective: "Allow users to create, track, and manage tasks with due dates and completion status.",
            user_stories: [
              "As a user, I want to add a new task to my to-do list.",
              "As a user, I want to mark a task as complete when I finish it.",
            ],
            acceptance_criteria: [
              "Users can add a task with a description and optionally a due date.",
              "Tasks can be toggled between complete and incomplete states.",
            ],
            dependencies: [
              "User Account Management",
            ],
            success_metrics: [
              "Number of tasks created per user",
              "Task completion rate",
            ],
          },
        ],
      },
    };

    const FEATURE_SPEC_TEMPLATE = `{{#section:feature_name}}
# Feature Name
{feature_name}
{{/section:feature_name}}

{{#section:feature_objective}}
## Feature Objective
{feature_objective}
{{/section:feature_objective}}

{{#section:user_stories}}
## User Stories
{user_stories}
{{/section:user_stories}}

{{#section:acceptance_criteria}}
## Acceptance Criteria
{acceptance_criteria}
{{/section:acceptance_criteria}}

{{#section:dependencies}}
## Dependencies
{dependencies}
{{/section:dependencies}}

{{#section:success_metrics}}
## Success Metrics
{success_metrics}
{{/section:success_metrics}}

{{#section:_extra_content}}
## Additional Content
{_extra_content}
{{/section:_extra_content}}

`;

    const contributions = [makeContribution(rootId, sessionId, stageSlug, rawFileName)];
    const jsonContent = JSON.stringify(agentResponse);

    const { dbClient, clearAllStubs } = setup(makeConfig(
      contributions,
      "thesis_feature_spec",
      "thesis_feature_spec.md",
      jsonContent,
      FEATURE_SPEC_TEMPLATE,
      rawFileName,
    ));

    const params: RenderDocumentParams = {
      projectId: "project_proof",
      sessionId,
      iterationNumber: 1,
      stageSlug,
      documentIdentity: rootId,
      documentKey: FileType.feature_spec,
      sourceContributionId: rootId,
      template_filename: "thesis_feature_spec.md",
    };

    const mockFileManager = new MockFileManagerService();
    mockFileManager.setUploadAndRegisterFileResponse(createMockFileRecord(), null);

    const result: RenderDocumentResult = await renderDocument(
      dbClient,
      {
        downloadFromStorage,
        fileManager: mockFileManager,
        notificationService: mockNotificationService,
        notifyUserId: "user_proof",
        logger: logger,
      },
      params,
    );

    const rendered = new TextDecoder().decode(result.renderedBytes);

    // All three features must be present
    assert(rendered.includes("User Account Management"), "should contain first feature name");
    assert(rendered.includes("Basic Note-taking"), "should contain second feature name");
    assert(rendered.includes("To-Do List Management"), "should contain third feature name");

    // Feature objectives present
    assert(rendered.includes("Enable users to securely register"), "should contain first feature objective");
    assert(rendered.includes("simple and efficient way to create"), "should contain second feature objective");
    assert(rendered.includes("create, track, and manage tasks"), "should contain third feature objective");

    // Template section headers rendered per feature
    const featureNameHeaders = rendered.match(/# Feature Name/g);
    assert(featureNameHeaders !== null && featureNameHeaders.length === 3, "should have 3 Feature Name headers (one per feature)");

    const featureObjectiveHeaders = rendered.match(/## Feature Objective/g);
    assert(featureObjectiveHeaders !== null && featureObjectiveHeaders.length === 3, "should have 3 Feature Objective headers (one per feature)");

    // User stories rendered (not raw JSON)
    assert(rendered.includes("As a new user, I want to create an account"), "should contain user story from first feature");
    assert(rendered.includes("As a user, I want to create a new note"), "should contain user story from second feature");
    assert(rendered.includes("As a user, I want to add a new task"), "should contain user story from third feature");

    // Acceptance criteria rendered
    assert(rendered.includes("Users can successfully register"), "should contain acceptance criteria from first feature");
    assert(rendered.includes("Users can create a new note"), "should contain acceptance criteria from second feature");

    // Success metrics rendered
    assert(rendered.includes("Number of new user registrations per week"), "should contain success metric from first feature");
    assert(rendered.includes("Number of notes created per user"), "should contain success metric from second feature");

    // Dependencies rendered for features that have them
    assert(rendered.includes("User Account Management"), "should contain dependency");

    // No raw JSON
    assert(!rendered.includes('{"'), "should NOT contain raw JSON opening brace");

    // No metadata
    assert(!rendered.includes("continuation_needed"), "should NOT contain continuation_needed");

    // Rendered output is non-trivial (not empty or near-empty)
    assert(rendered.length > 500, `should produce substantial output, got ${rendered.length} chars`);

    clearAllStubs?.();
  });
});
