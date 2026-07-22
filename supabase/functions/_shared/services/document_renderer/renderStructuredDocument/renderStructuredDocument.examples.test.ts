import { assert, assertEquals } from 'jsr:@std/assert@0.225.3';
import { FileType } from '../../../types/file_manager.types.ts';
import { renderStructuredDocument } from './renderStructuredDocument.ts';

const SYSTEM_ARCHITECTURE_TEMPLATE = Deno.readTextFileSync(
  new URL('../../../../../../docs/templates/synthesis/synthesis_system_architecture.md', import.meta.url),
);
const TECH_STACK_TEMPLATE = Deno.readTextFileSync(
  new URL('../../../../../../docs/templates/synthesis/synthesis_tech_stack.md', import.meta.url),
);
const PRODUCT_REQUIREMENTS_TEMPLATE = Deno.readTextFileSync(
  new URL('../../../../../../docs/templates/synthesis/synthesis_product_requirements.md', import.meta.url),
);
const FEATURE_SPEC_TEMPLATE = Deno.readTextFileSync(
  new URL('../../../../../../docs/templates/thesis/thesis_feature_spec.md', import.meta.url),
);

Deno.test('renderStructuredDocument - multi-structure JSON rendering patterns', async (t) => {
  await t.step('renders flat strings and string arrays (system_architecture pattern)', () => {
    const systemArchitectureData = {
      architecture: 'A cloud-native microservices architecture on AWS.',
      services: [
        'User Management Service (UMS): Handles authentication.',
        'Content Catalog Service (CCS): Manages content metadata.',
      ],
      components: [
        'API Gateway (AWS API Gateway): Entry point.',
        'Message Broker (AWS MSK/Kafka): Async communication.',
      ],
      data_flows: [
        'User Login -> API Gateway -> UMS.',
      ],
      interfaces: [
        'RESTful APIs for synchronous communication.',
      ],
      integration_points: [
        'External Identity Providers.',
      ],
      dependency_resolution: [
        'Service-to-service via API Gateway.',
      ],
      conflict_flags: [
        '**Strong vs. Eventual Consistency:** Favor eventual consistency.',
      ],
      sequencing: '1. Foundation services. 2. Content Catalog.',
      risk_mitigations: [
        '**Single Point of Failure:** Multi-AZ deployments.',
      ],
      risk_signals: [
        'Increase in latency for critical API endpoints (>200ms).',
      ],
      security_measures: [
        '**Authentication:** OAuth 2.0, RBAC.',
      ],
      observability_strategy: [
        '**Logging:** Centralized structured logging.',
      ],
      scalability_plan: [
        '**Horizontal Scaling:** Stateless microservices.',
      ],
      resilience_strategy: [
        '**High Availability:** Multi-AZ deployments.',
      ],
      compliance_controls: [
        '**GDPR/CCPA:** Pseudonymization of PII.',
      ],
      open_questions: [
        'Data residency requirements.',
      ],
      rationale: 'The architecture provides a robust foundation.',
      architecture_summary: 'A modular architecture on AWS.',
    };

    const rendered = renderStructuredDocument(
      SYSTEM_ARCHITECTURE_TEMPLATE,
      systemArchitectureData,
      FileType.system_architecture,
    );

    assert(rendered.includes('# Architecture Summary'), 'should contain Architecture Summary header');
    assert(rendered.includes('# Architecture'), 'should contain Architecture header');
    assert(rendered.includes('# Services'), 'should contain Services header');
    assert(rendered.includes('# Components'), 'should contain Components header');
    assert(rendered.includes('# Data Flows'), 'should contain Data Flows header');
    assert(rendered.includes('# Risk Signals'), 'should contain Risk Signals header');
    assert(rendered.includes('# Open Questions'), 'should contain Open Questions header');
    assert(rendered.includes('# Rationale'), 'should contain Rationale header');

    assert(rendered.includes('A cloud-native microservices architecture on AWS.'), 'should contain architecture string');
    assert(rendered.includes('The architecture provides a robust foundation.'), 'should contain rationale string');
    assert(rendered.includes('A modular architecture on AWS.'), 'should contain architecture_summary string');

    assert(rendered.includes('User Management Service (UMS): Handles authentication.'), 'should contain services array item');
    assert(rendered.includes('API Gateway (AWS API Gateway): Entry point.'), 'should contain components array item');
    assert(rendered.includes('Data residency requirements.'), 'should contain open_questions array item');

    assert(!rendered.includes('{"'), 'should NOT contain raw JSON opening brace');
    assert(!rendered.includes('"architecture"'), 'should NOT contain raw JSON key');

    assert(!(rendered.match(/\n---\n/g)?.length), 'should NOT contain --- separator artefacts');
  });

  await t.step('renders mixed flat fields and array-of-objects (tech_stack pattern)', () => {
    const techStackData = {
      continuation_needed: false,
      stop_reason: 'complete',
      frontend_stack: 'React with Next.js, TypeScript, Tailwind CSS.',
      backend_stack: 'Java 17 with Spring Boot, Python for AI/ML.',
      data_platform: 'AWS RDS PostgreSQL, DynamoDB, Neo4j.',
      devops_tooling: 'AWS EKS Kubernetes, Docker, Terraform.',
      security_tooling: 'AWS WAF, AWS Secrets Manager.',
      shared_libraries: [
        'Internal common utility libraries.',
        'Standardized API client libraries.',
      ],
      third_party_services: [
        'Twilio SendGrid for email.',
        'Stripe for payment processing.',
      ],
      components: [
        {
          component_name: 'Recommendation Engine Service',
          recommended_option: 'Python with FastAPI on AWS SageMaker.',
          rationale: 'Python is industry standard for ML development.',
          alternatives: [
            'Java with Deeplearning4j.',
            'Custom Kubernetes deployments.',
          ],
          tradeoffs: [
            'Python GIL limits parallel execution.',
          ],
          risk_signals: [
            'High latency for recommendation requests.',
          ],
          integration_requirements: [
            'API integration with Learning Path Service.',
          ],
          operational_owners: [
            'AI/ML Engineering Team',
          ],
          migration_plan: [
            'Start with rule-based recommendations.',
          ],
        },
        {
          component_name: 'Learning Path Service',
          recommended_option: 'Java 17 with Spring Boot, Neo4j.',
          rationale: 'Neo4j is ideal for knowledge graphs.',
          alternatives: [
            'PostgreSQL with recursive CTEs.',
          ],
          tradeoffs: [
            'Neo4j requires specialized knowledge.',
          ],
          risk_signals: [
            'Slow path generation times.',
          ],
          integration_requirements: [
            'API integration with Content Catalog Service.',
          ],
          operational_owners: [
            'Backend Engineering Team',
          ],
          migration_plan: [
            'Start with simplified knowledge graph.',
          ],
        },
      ],
      open_questions: [
        'Finalize cloud provider for ML needs.',
        'Evaluate content delivery integration strategies.',
      ],
      next_steps: [
        'Conduct a PoC for Neo4j-based Learning Path Service.',
        'Develop a detailed MLOps strategy.',
      ],
    };

    const rendered = renderStructuredDocument(
      TECH_STACK_TEMPLATE,
      techStackData,
      FileType.tech_stack,
    );

    assert(rendered.includes('# Tech Stack Recommendations'), 'should contain main heading');
    assert(rendered.includes('## Frontend Stack'), 'should contain Frontend Stack header');
    assert(rendered.includes('## Backend Stack'), 'should contain Backend Stack header');
    assert(rendered.includes('## Data Platform'), 'should contain Data Platform header');
    assert(rendered.includes('## Shared Libraries'), 'should contain Shared Libraries header');
    assert(rendered.includes('## Third-Party Services'), 'should contain Third-Party Services header');
    assert(rendered.includes('## Component Recommendations'), 'should contain Component Recommendations header');
    assert(rendered.includes('## Open Questions'), 'should contain Open Questions header');
    assert(rendered.includes('## Next Steps'), 'should contain Next Steps header');

    assert(rendered.includes('React with Next.js, TypeScript, Tailwind CSS.'), 'should contain frontend_stack content');
    assert(rendered.includes('Java 17 with Spring Boot, Python for AI/ML.'), 'should contain backend_stack content');
    assert(rendered.includes('AWS RDS PostgreSQL, DynamoDB, Neo4j.'), 'should contain data_platform content');

    assert(rendered.includes('Internal common utility libraries.'), 'should contain shared_libraries item');
    assert(rendered.includes('Stripe for payment processing.'), 'should contain third_party_services item');
    assert(rendered.includes('Finalize cloud provider for ML needs.'), 'should contain open_questions item');
    assert(rendered.includes('Conduct a PoC for Neo4j-based Learning Path Service.'), 'should contain next_steps item');

    assert(rendered.includes('Recommendation Engine Service'), 'should contain first component name');
    assert(rendered.includes('Learning Path Service'), 'should contain second component name');
    assert(rendered.includes('Python with FastAPI on AWS SageMaker.'), 'should contain first component recommended_option');
    assert(rendered.includes('Java 17 with Spring Boot, Neo4j.'), 'should contain second component recommended_option');
    assert(rendered.includes('Python is industry standard for ML development.'), 'should contain first component rationale');

    assert(!rendered.includes('continuation_needed'), 'should NOT contain continuation_needed');
    assert(!rendered.includes('stop_reason'), 'should NOT contain stop_reason');

    assert(!rendered.includes('{"'), 'should NOT contain raw JSON opening brace');

    const separatorMatches = rendered.match(/\n---\n/g);
    assert(!separatorMatches || separatorMatches.length === 0, 'should NOT contain --- separator artefacts');

    const mainHeadingMatches = rendered.match(/# Tech Stack Recommendations/g);
    assert(mainHeadingMatches !== null && mainHeadingMatches.length === 1, 'main heading should appear exactly once');
  });

  await t.step('renders content-wrapped flat fields, SWOT arrays, and features array-of-objects (product_requirements pattern)', () => {
    const productRequirementsData = {
      executive_summary: 'The platform aims to revolutionize online education.',
      mvp_description: 'The MVP delivers core adaptive learning capabilities.',
      user_problem_validation: 'Learners struggle with generic content.',
      market_opportunity: 'The market for personalized education is substantial.',
      competitive_analysis: 'Competitors lack deep AI-driven personalization.',
      'differentiation_&_value_proposition': 'Superior AI-driven personalization engine.',
      'risks_&_mitigation': 'Content acquisition risk mitigated by partnerships.',
      strengths: [
        'Innovative AI-driven personalization engine',
        'Comprehensive real-time feedback',
      ],
      weaknesses: [
        'Initial content library size',
        'Brand recognition challenge',
      ],
      opportunities: [
        'Corporate training expansion',
        'LMS platform integration',
      ],
      threats: [
        'Rapid competitor advancement in AI',
        'Economic downturn impact',
      ],
      feature_scope: [
        'Learner Profile & Goal Management',
        'AI-Powered Content Recommendation',
      ],
      features: [
        {
          feature_name: 'AI-Powered Content Recommendation',
          feature_objective: 'Provide highly relevant learning content.',
          user_stories: [
            'As a learner, I want course suggestions based on my goals.',
            'As a learner, I want supplemental resources when I struggle.',
          ],
          acceptance_criteria: [
            'System recommends at least 5 relevant courses on login.',
            'Recommendation engine achieves >85% satisfaction rate.',
          ],
          dependencies: [
            'Learner Profile Management',
            'Content Management System',
          ],
          success_metrics: [
            'Click-through rate on recommended content',
          ],
          risk_mitigation: 'Hybrid recommendation approach with A/B testing.',
          open_questions: [
            'Optimal balance between exploring and reinforcing?',
          ],
          tradeoffs: [
            'Accuracy vs. diversity of recommendations.',
          ],
        },
        {
          feature_name: 'Adaptive Learning Path Generation',
          feature_objective: 'Dynamically create personalized learning sequences.',
          user_stories: [
            'As a learner, I want a customized learning path.',
          ],
          acceptance_criteria: [
            'System generates initial path within 10 seconds.',
          ],
          dependencies: [
            'Learner Profile & Goal Management',
          ],
          success_metrics: [
            'Learning path completion rate',
          ],
          risk_mitigation: 'Knowledge graph with expert review.',
          open_questions: [
            'How granular should path adaptation be?',
          ],
          tradeoffs: [
            'Algorithmic complexity vs. explainability.',
          ],
        },
      ],
      feasibility_insights: [
        'Microservices architecture supports modular development.',
        'Cloud-native services accelerate AI deployment.',
      ],
      non_functional_alignment: [
        '**Performance:** Sub-second response times.',
        '**Security:** OWASP Top 10, GDPR/CCPA compliance.',
      ],
      score_adjustments: [
        'Prioritized foundational AI features for MVP.',
      ],
      outcome_alignment: 'Directly aligned with empowering learners.',
      north_star_metric: '20% increase in skill mastery within 3 months.',
      primary_kpis: [
        'Monthly Active Learners',
        'Average Course Completion Rate',
      ],
      leading_indicators: [
        'Learner onboarding completion rate',
      ],
      lagging_indicators: [
        'Certification attainment rate',
      ],
      guardrails: [
        'Maintain data privacy compliance with zero critical violations.',
      ],
      measurement_plan: 'Implement analytics with Mixpanel and custom warehouse.',
      risk_signals: [
        'Low onboarding completion rate (<70%)',
      ],
      resolved_positions: [
        'MVP focuses on core personalization.',
      ],
      open_questions: [
        'Finalized content acquisition strategy.',
        'Detailed pricing model for subscription tiers.',
      ],
      next_steps: 'Sprint planning for MVP features, finalize content strategy.',
      release_plan: [
        '**Phase 1 (MVP):** Core personalized learning paths.',
      ],
      assumptions: [
        'High-quality content can be reliably acquired.',
      ],
      open_decisions: [
        'Third-party vendor selection for authoring tools.',
      ],
      implementation_risks: [
        'Integration complexities with diverse content formats.',
      ],
      stakeholder_communications: [
        'Weekly progress reports to leadership.',
      ],
      proposal_references: [
        'Business Case v1.2',
        'Feature Specification v1.5',
      ],
    };

    const rendered = renderStructuredDocument(
      PRODUCT_REQUIREMENTS_TEMPLATE,
      productRequirementsData,
      FileType.product_requirements,
    );

    assert(rendered.includes('# Executive Summary'), 'should contain Executive Summary header');
    assert(rendered.includes('# MVP Description'), 'should contain MVP Description header');
    assert(rendered.includes('# User Problem Validation'), 'should contain User Problem Validation header');
    assert(rendered.includes('# Market Opportunity'), 'should contain Market Opportunity header');
    assert(rendered.includes('# Competitive Analysis'), 'should contain Competitive Analysis header');
    assert(rendered.includes('# Differentiation & Value Proposition'), 'should contain Differentiation header');
    assert(rendered.includes('# Risks & Mitigation'), 'should contain Risks header');

    assert(rendered.includes('# SWOT Overview'), 'should contain SWOT Overview header');
    assert(rendered.includes('## Strengths'), 'should contain Strengths header');
    assert(rendered.includes('## Weaknesses'), 'should contain Weaknesses header');
    assert(rendered.includes('## Opportunities'), 'should contain Opportunities header');
    assert(rendered.includes('## Threats'), 'should contain Threats header');

    assert(rendered.includes('Innovative AI-driven personalization engine'), 'should contain strengths item');
    assert(rendered.includes('Initial content library size'), 'should contain weaknesses item');
    assert(rendered.includes('Corporate training expansion'), 'should contain opportunities item');
    assert(rendered.includes('Rapid competitor advancement in AI'), 'should contain threats item');

    assert(rendered.includes('# Feature Details'), 'should contain Feature Details header');
    assert(rendered.includes('AI-Powered Content Recommendation'), 'should contain first feature name');
    assert(rendered.includes('Adaptive Learning Path Generation'), 'should contain second feature name');
    assert(rendered.includes('Provide highly relevant learning content.'), 'should contain first feature objective');

    assert(rendered.includes('# Outcome Alignment & Success Metrics'), 'should contain Outcome Alignment header');
    assert(rendered.includes('Directly aligned with empowering learners.'), 'should contain outcome_alignment content');
    assert(rendered.includes('20% increase in skill mastery within 3 months.'), 'should contain north_star_metric content');

    assert(rendered.includes('## Primary KPIs'), 'should contain Primary KPIs header');
    assert(rendered.includes('Monthly Active Learners'), 'should contain primary_kpis item');
    assert(rendered.includes('## Leading Indicators'), 'should contain Leading Indicators header');
    assert(rendered.includes('## Lagging Indicators'), 'should contain Lagging Indicators header');

    assert(rendered.includes('# Decisions & Follow-Ups'), 'should contain Decisions header');
    assert(rendered.includes('## Open Questions'), 'should contain Open Questions header');
    assert(rendered.includes('Finalized content acquisition strategy.'), 'should contain open_questions item');

    assert(rendered.includes('The platform aims to revolutionize online education.'), 'should contain executive_summary content');
    assert(rendered.includes('The MVP delivers core adaptive learning capabilities.'), 'should contain mvp_description content');

    assert(!rendered.includes('continuation_needed'), 'should NOT contain continuation_needed');
    assert(!rendered.includes('stop_reason'), 'should NOT contain stop_reason');

    assert(!rendered.includes('{"'), 'should NOT contain raw JSON opening brace');

    const separatorMatches = rendered.match(/\n---\n/g);
    assert(!separatorMatches || separatorMatches.length === 0, 'should NOT contain --- separator artefacts');

    const execSummaryMatches = rendered.match(/# Executive Summary/g);
    assert(execSummaryMatches !== null && execSummaryMatches.length === 1, 'Executive Summary should appear exactly once');
  });

  await t.step('renders per-item template when data is a single array of objects whose fields match template placeholders (feature_spec pattern)', () => {
    const featureSpecData = {
      features: [
        {
          feature_name: 'User Account Management',
          feature_objective: 'Enable users to securely register, log in, and manage their personal profile.',
          user_stories: [
            'As a new user, I want to create an account so I can save my notes and tasks.',
            'As a returning user, I want to log in securely to access my existing data.',
            'As a user, I want to be able to reset my password if I forget it.',
          ],
          acceptance_criteria: [
            'Users can successfully register with a unique email and password.',
            'Registered users can log in using their credentials.',
            'Users can change their password.',
          ],
          dependencies: [],
          success_metrics: [
            'Number of new user registrations per week',
            'Successful login rate',
          ],
        },
        {
          feature_name: 'Basic Note-taking',
          feature_objective: 'Provide users with a simple and efficient way to create, view, edit, and delete text-based notes.',
          user_stories: [
            'As a user, I want to create a new note to record information.',
            'As a user, I want to view all my notes in an organized list.',
            'As a user, I want to edit an existing note to update its content.',
            'As a user, I want to delete a note that is no longer needed.',
          ],
          acceptance_criteria: [
            'Users can create a new note with a title and body.',
            'All notes are listed chronologically or by last modified date.',
            'Users can permanently delete notes with a confirmation prompt.',
          ],
          dependencies: [
            'User Account Management',
          ],
          success_metrics: [
            'Number of notes created per user',
            'Average number of notes per user',
          ],
        },
        {
          feature_name: 'To-Do List Management',
          feature_objective: 'Allow users to create, track, and manage tasks with due dates and completion status.',
          user_stories: [
            'As a user, I want to add a new task to my to-do list.',
            'As a user, I want to mark a task as complete when I finish it.',
          ],
          acceptance_criteria: [
            'Users can add a task with a description and optionally a due date.',
            'Tasks can be toggled between complete and incomplete states.',
          ],
          dependencies: [
            'User Account Management',
          ],
          success_metrics: [
            'Number of tasks created per user',
            'Task completion rate',
          ],
        },
      ],
    };

    const rendered = renderStructuredDocument(
      FEATURE_SPEC_TEMPLATE,
      featureSpecData,
      FileType.feature_spec,
    );

    assert(rendered.includes('User Account Management'), 'should contain first feature name');
    assert(rendered.includes('Basic Note-taking'), 'should contain second feature name');
    assert(rendered.includes('To-Do List Management'), 'should contain third feature name');

    assert(rendered.includes('Enable users to securely register'), 'should contain first feature objective');
    assert(rendered.includes('simple and efficient way to create'), 'should contain second feature objective');
    assert(rendered.includes('create, track, and manage tasks'), 'should contain third feature objective');

    const featureNameHeaders = rendered.match(/# Feature Name/g);
    assert(featureNameHeaders !== null && featureNameHeaders.length === 3, 'should have 3 Feature Name headers (one per feature)');

    const featureObjectiveHeaders = rendered.match(/## Feature Objective/g);
    assert(featureObjectiveHeaders !== null && featureObjectiveHeaders.length === 3, 'should have 3 Feature Objective headers (one per feature)');

    assert(rendered.includes('As a new user, I want to create an account'), 'should contain user story from first feature');
    assert(rendered.includes('As a user, I want to create a new note'), 'should contain user story from second feature');
    assert(rendered.includes('As a user, I want to add a new task'), 'should contain user story from third feature');

    assert(rendered.includes('Users can successfully register'), 'should contain acceptance criteria from first feature');
    assert(rendered.includes('Users can create a new note'), 'should contain acceptance criteria from second feature');

    assert(rendered.includes('Number of new user registrations per week'), 'should contain success metric from first feature');
    assert(rendered.includes('Number of notes created per user'), 'should contain success metric from second feature');

    assert(rendered.includes('User Account Management'), 'should contain dependency');

    assert(!rendered.includes('{"'), 'should NOT contain raw JSON opening brace');

    assert(!rendered.includes('continuation_needed'), 'should NOT contain continuation_needed');

    assert(rendered.length > 500, `should produce substantial output, got ${rendered.length} chars`);
  });
});
