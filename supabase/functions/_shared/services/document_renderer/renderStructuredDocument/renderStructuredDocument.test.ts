import { assert, assertEquals } from "jsr:@std/assert@0.225.3";
import { FileType } from "../../../types/file_manager.types.ts";
import { renderStructuredDocument } from "./renderStructuredDocument.ts";

const REAL_THESIS_BUSINESS_CASE_TEMPLATE = Deno.readTextFileSync(
  new URL("../../../../../../docs/templates/thesis/thesis_business_case.md", import.meta.url),
);
const FEATURE_SPEC_TEMPLATE = Deno.readTextFileSync(
  new URL("../../../../../../docs/templates/thesis/thesis_feature_spec.md", import.meta.url),
);
const TECH_STACK_TEMPLATE = Deno.readTextFileSync(
  new URL("../../../../../../docs/templates/synthesis/synthesis_tech_stack.md", import.meta.url),
);

Deno.test("renderStructuredDocument renders section-based template using renderPrompt with structured JSON content", () => {
  const structuredData = {
    executive_summary: "Test executive summary content",
    market_opportunity: "Test market opportunity content",
    // competitive_analysis is intentionally omitted to test section removal
  };

  const rendered = renderStructuredDocument(
    REAL_THESIS_BUSINESS_CASE_TEMPLATE,
    structuredData,
    FileType.business_case,
  );

  assert(rendered.includes("# Executive Summary"), "rendered document should contain Executive Summary section header");
  assert(rendered.includes("Test executive summary content"), "rendered document should contain executive summary content");
  assert(rendered.includes("# Market Opportunity"), "rendered document should contain Market Opportunity section header");
  assert(rendered.includes("Test market opportunity content"), "rendered document should contain market opportunity content");

  assert(!rendered.includes("{{#section:competitive_analysis}}"), "sections without data should be removed");
  assert(!rendered.includes("{{#section:user_problem_validation}}"), "sections without data should be removed");

  assert(!rendered.includes("<!-- Template:"), "template comment should be stripped from output");
  assert(!rendered.includes("thesis_business_case.md -->"), "template filename comment should be stripped");
});

Deno.test("renderStructuredDocument renders template once per array item when content has array structure", () => {
  const arrayContent = {
    features: [
      {
        feature_name: "User Authentication",
        feature_objective: "Enable secure user login and registration",
        user_stories: ["As a user, I want to log in securely"],
        acceptance_criteria: ["Users can register with email and password"],
      },
      {
        feature_name: "Dashboard Display",
        feature_objective: "Show user overview on login",
        user_stories: ["As a user, I want to see my dashboard"],
        acceptance_criteria: ["Dashboard loads within 2 seconds"],
      },
    ],
  };

  const rendered = renderStructuredDocument(
    FEATURE_SPEC_TEMPLATE,
    arrayContent,
    FileType.feature_spec,
  );

  assert(rendered.includes("User Authentication"), "rendered document should contain first feature name");
  assert(rendered.includes("Enable secure user login"), "rendered document should contain first feature objective");
  assert(rendered.includes("Dashboard Display"), "rendered document should contain second feature name");
  assert(rendered.includes("Show user overview on login"), "rendered document should contain second feature objective");
});

Deno.test("renderStructuredDocument concatenates per-item array items with separator", () => {
  const arrayContent = {
    features: [
      { feature_name: "Feature One", feature_objective: "Objective One" },
      { feature_name: "Feature Two", feature_objective: "Objective Two" },
    ],
  };

  const rendered = renderStructuredDocument(
    FEATURE_SPEC_TEMPLATE,
    arrayContent,
    FileType.feature_spec,
  );

  const separatorCount = (rendered.match(/\n\n---\n\n/g) ?? []).length;
  assertEquals(separatorCount, 1, "joined per-item output should contain the separator exactly once");
});

Deno.test("renderStructuredDocument falls back to flat rendering when no per-item condition holds", () => {
  const flatContent = {
    executive_summary: "This is the executive summary.",
    market_opportunity: "This is the market opportunity.",
  };

  const rendered = renderStructuredDocument(
    REAL_THESIS_BUSINESS_CASE_TEMPLATE,
    flatContent,
    FileType.business_case,
  );

  assert(rendered.includes("This is the executive summary."), "flat render should include executive_summary content");
  assert(rendered.includes("This is the market opportunity."), "flat render should include market_opportunity content");
  assert(!rendered.includes("\n\n---\n\n"), "flat render should not contain per-item separator");
});

Deno.test("renderStructuredDocument formats nested arrays as bullet lists", () => {
  const arrayContent = {
    features: [
      {
        feature_name: "Test Feature",
        feature_objective: "Test objective",
        user_stories: ["Story one", "Story two", "Story three"],
        acceptance_criteria: ["Criteria A", "Criteria B"],
      },
    ],
  };

  const rendered = renderStructuredDocument(
    FEATURE_SPEC_TEMPLATE,
    arrayContent,
    FileType.feature_spec,
  );

  assert(rendered.includes("- Story one"), "user_stories should be formatted as bullet list");
  assert(rendered.includes("- Story two"), "user_stories should include second item as bullet");
  assert(rendered.includes("- Story three"), "user_stories should include third item as bullet");
  assert(rendered.includes("- Criteria A"), "acceptance_criteria should be formatted as bullet list");
  assert(rendered.includes("- Criteria B"), "acceptance_criteria should include second item as bullet");
  assert(!rendered.includes("Story one, Story two"), "nested arrays should NOT be comma-separated");
});

Deno.test("renderStructuredDocument strips template comments from output", () => {
  const arrayContent = {
    features: [
      { feature_name: "Feature One", feature_objective: "Objective One" },
    ],
  };

  const rendered = renderStructuredDocument(
    FEATURE_SPEC_TEMPLATE,
    arrayContent,
    FileType.feature_spec,
  );

  assert(!rendered.includes("<!-- Template:"), "template comment should be stripped from output");
  assert(!rendered.includes("thesis_feature_spec.md -->"), "template filename comment should be stripped");
  assert(rendered.includes("Feature One"), "feature name should still be present");
  assert(rendered.includes("Objective One"), "feature objective should still be present");
});

Deno.test("renderStructuredDocument renders tech_stack JSON with nested objects and subordinate arrays", () => {
  const techStackData = {
    document_key: "tech_stack",
    continuation_needed: false,
    stop_reason: "complete",
    frontend_stack: {
      recommended_option: "React with TypeScript",
      rationale: "React offers a strong component-based architecture.",
      alternatives: [
        { name: "Vue.js", tradeoffs: "Smaller ecosystem than React." },
      ],
      risk_signals: ["Excessive bundle sizes impacting load times."],
      integration_requirements: ["GraphQL client for data fetching."],
      operational_owners: ["Frontend Development Team"],
      migration_plan: [],
    },
    backend_stack: {
      recommended_option: "Node.js and Java/Kotlin Spring Boot",
      rationale: "Polyglot approach leverages strengths of each language.",
      alternatives: [
        { name: "Go", tradeoffs: "Team familiarity is lower." },
      ],
      risk_signals: ["Memory leaks in Node.js under sustained load."],
      integration_requirements: ["GraphQL server implementation."],
      operational_owners: ["Backend Development Team"],
      migration_plan: [],
    },
    data_platform: {
      recommended_option: "Kafka + Flink + ClickHouse + PostgreSQL",
      rationale: "Robust real-time data pipeline.",
      alternatives: [],
      risk_signals: ["Data loss in Kafka topics."],
      integration_requirements: ["Kafka Connectors for data sources."],
      operational_owners: ["Data Engineering Team"],
      migration_plan: [],
    },
    shared_libraries: [
      "Internal common utility libraries for logging and error handling.",
      "Data validation libraries for enforcing data integrity.",
    ],
    third_party_services: [
      { service_name: "E-commerce Platform APIs", purpose: "Primary data source.", vendor: "Shopify" },
      { service_name: "Email Service", purpose: "Sending alerts.", vendor: "AWS SES" },
    ],
    components: [
      {
        component_name: "Frontend Framework",
        recommended_option: "React with TypeScript",
        rationale: "Excellent balance of productivity and performance.",
        alternatives: [{ name: "Vue.js", tradeoffs: "Smaller ecosystem." }],
        risk_signals: ["Performance issues on initial load."],
        integration_requirements: ["GraphQL client."],
        operational_owners: ["Frontend Development Team"],
        migration_plan: [],
      },
    ],
    open_questions: [
      "What are the final performance benchmarks for Flink and ClickHouse?",
      "What are the data retention policies?",
    ],
    next_steps: [
      "Conduct proof-of-concept for Flink-ClickHouse integration.",
      "Define deployment topologies for EKS clusters.",
    ],
  };

  const rendered = renderStructuredDocument(
    TECH_STACK_TEMPLATE,
    techStackData,
    FileType.tech_stack,
  );

  const mainHeaderCount = (rendered.match(/# Tech Stack Recommendations/g) ?? []).length;
  assertEquals(mainHeaderCount, 1, `Main header should appear once, found ${mainHeaderCount} times`);

  assert(rendered.includes("## Frontend Stack"), "section header: Frontend Stack");
  assert(rendered.includes("## Backend Stack"), "section header: Backend Stack");
  assert(rendered.includes("## Data Platform"), "section header: Data Platform");
  assert(rendered.includes("## Shared Libraries"), "section header: Shared Libraries");
  assert(rendered.includes("## Third-Party Services"), "section header: Third-Party Services");
  assert(rendered.includes("## Component Recommendations"), "section header: Component Recommendations");
  assert(rendered.includes("## Open Questions"), "section header: Open Questions");
  assert(rendered.includes("## Next Steps"), "section header: Next Steps");

  const separatorCount = (rendered.match(/\n---\n/g) ?? []).length;
  assertEquals(separatorCount, 0, `Should not contain item separators, found ${separatorCount}`);

  assert(!rendered.includes('"recommended_option"'), "raw JSON key recommended_option must not appear");
  assert(!rendered.includes('"rationale"'), "raw JSON key rationale must not appear");
  assert(!rendered.includes('"alternatives"'), "raw JSON key alternatives must not appear");
  assert(!rendered.includes('"risk_signals"'), "raw JSON key risk_signals must not appear");
  assert(!rendered.includes('"service_name"'), "raw JSON key service_name must not appear");
  assert(!rendered.includes('{"'), "opening JSON brace must not appear in rendered output");

  assert(rendered.includes("**Recommended option:** React with TypeScript"), "frontend_stack.recommended_option formatted as labelled field");
  assert(rendered.includes("**Recommended option:** Node.js and Java/Kotlin Spring Boot"), "backend_stack.recommended_option formatted as labelled field");
  assert(rendered.includes("**Recommended option:** Kafka + Flink + ClickHouse + PostgreSQL"), "data_platform.recommended_option formatted as labelled field");
  assert(rendered.includes("**Rationale:** React offers a strong component-based architecture."), "frontend_stack.rationale formatted as labelled field");
  assert(rendered.includes("**Rationale:** Polyglot approach leverages strengths of each language."), "backend_stack.rationale formatted as labelled field");

  assert(rendered.includes("**Risk signals:**"), "risk_signals array rendered with label");
  assert(rendered.includes("- Excessive bundle sizes impacting load times."), "risk_signals items rendered as bullets");
  assert(rendered.includes("- Memory leaks in Node.js under sustained load."), "backend risk_signals rendered as bullets");
  assert(rendered.includes("**Integration requirements:**"), "integration_requirements array rendered with label");
  assert(rendered.includes("- GraphQL client for data fetching."), "integration_requirements items rendered as bullets");

  assert(rendered.includes("**Alternatives:**"), "alternatives array rendered with label");
  assert(rendered.includes("**Name:** Vue.js"), "alternatives sub-object name formatted");
  assert(rendered.includes("**Tradeoffs:** Smaller ecosystem than React."), "alternatives sub-object tradeoffs formatted");
  assert(rendered.includes("**Name:** Go"), "backend alternatives name formatted");
  assert(rendered.includes("**Tradeoffs:** Team familiarity is lower."), "backend alternatives tradeoffs formatted");

  assert(rendered.includes("**Service name:** E-commerce Platform APIs"), "third_party_services item formatted");
  assert(rendered.includes("**Purpose:** Primary data source."), "third_party_services purpose formatted");
  assert(rendered.includes("**Vendor:** Shopify"), "third_party_services vendor formatted");
  assert(rendered.includes("**Service name:** Email Service"), "second third_party_services item formatted");

  assert(rendered.includes("**Component name:** Frontend Framework"), "components item formatted");
  assert(rendered.includes("**Recommended option:** React with TypeScript"), "components recommended_option formatted");

  assert(rendered.includes("common utility libraries"), "shared_libraries content present");
  assert(rendered.includes("performance benchmarks"), "open_questions content present");
  assert(rendered.includes("proof-of-concept"), "next_steps content present");

  assert(!rendered.includes("**Migration plan:**"), "empty migration_plan arrays should be skipped");
});
