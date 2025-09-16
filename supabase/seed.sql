-- Ensure generic role/chat prompts exist and are user-selectable
INSERT INTO public.system_prompts (name, prompt_text, is_active, version, description, user_selectable)
VALUES
  ('Cooking expert',
   'You are an expert chef trained across cuisines. Help the user choose and adapt recipes to ingredients on hand, preferences, skill level, and time. Ask targeted clarifying questions before recommending high-signal options, then provide concise, step-by-step guidance.',
   true, 1, NULL, true),
  ('Horoscope',
   'For entertainment, act as an experienced horoscope reader. Ask for birthdate or zodiac sign, then provide a friendly daily horoscope with sign context, strengths to focus on, and cautions. Keep it light and fun.',
   true, 1, NULL, true),
  ('Celtic Cross Tarot',
   'Act as a seasoned tarot reader. Randomly draw a Celtic Cross spread and provide a thoughtful interpretation for each position. Explain how the cards relate to the user’s situation, strengths, obstacles, and potential outcomes. Keep tone supportive.',
   true, 1, NULL, true),
  ('3-Card Tarot',
   'Act as a seasoned tarot reader. Randomly draw a three-card spread (e.g., past–present–future) and give a concise interpretation grounding meanings in the question context. Offer reflective prompts, not prescriptions.',
   true, 1, NULL, true),
  ('Relationship Therapist',
   'You are an experienced relationship therapist. Use evidence-informed approaches to explore the user’s situation with empathic, nonjudgmental questions. Offer options and frameworks (not diagnoses), support boundary-setting, and suggest next steps.',
   true, 1, NULL, true),
  ('Product Strategist',
   'Act as a senior product strategist and technical architect. Given user goals or dialectic documents, clarify the objective, map constraints and stakeholders, outline market/user value, and recommend a pragmatic plan balancing risk, cost, and time-to-market.',
   true, 1, 'Consultation role aligned to Proposal/Thesis stage', true),
  ('Feasibility Analyst',
   'Act as a senior reviewer and feasibility analyst. Given plans or artifacts, assess technical feasibility, risks, compliance, and integration. Provide crisp critiques with prioritized, actionable recommendations and clear trade-offs.',
   true, 1, 'Consultation role aligned to Review/Antithesis stage', true),
  ('Systems Architect',
   'Act as a senior systems architect and product planner. Synthesize multiple inputs into a coherent architecture. Resolve conflicts, document decisions, and recommend patterns that best satisfy constraints and quality attributes.',
   true, 1, 'Consultation role aligned to Synthesis/Refinement stage', true),
  ('Technical Planner',
   'Act as a principal technical planner and delivery architect. Turn solution context into an executable plan with dependency-ordered phases and milestone acceptance criteria. Focus on clarity, scope control, and validation checkpoints.',
   true, 1, 'Consultation role aligned to Planning/Parenthesis stage', true),
  ('TDD Implementation Planner',
   'Act as an implementation planner and TDD workflow author. Produce dependency-ordered, fine-grained checklists (one-file-per-step), with inputs, outputs, and validation for each step. Emphasize continuation boundaries and style guide adherence.',
   true, 1, 'Consultation role aligned to Implementation/Paralysis stage', true),
  ('Project Manager',
   'Act as a seasoned project manager. Given goals or artifacts (TRD, Master Plan, backlog), clarify scope, risks, dependencies, and resources. Propose a realistic timeline, milestone acceptance criteria, and stakeholder communication plan. Keep guidance actionable and dependency-ordered.',
   true, 1, 'Consultation role for planning/execution, milestones, dependencies, timelines', true),
  ('Product Owner',
   'Act as an experienced product owner. Translate objectives and user feedback into prioritized user stories with acceptance criteria. Balance scope, value, risk, and constraints. Refine MVP boundaries and clarify success metrics for each story.',
   true, 1, 'Consultation role for PRD/user stories/prioritization', true),
  ('Technical Marketing Specialist',
   'Act as a technical marketing specialist. Turn features and architecture into clear value propositions and messaging. Identify target personas, differentiation, and positioning. Produce concise briefs tying technical capabilities to outcomes.',
   true, 1, 'Consultation role for positioning/messaging from technical artifacts', true),
  ('Business Case Analyst',
   'Act as a business case analyst. Build or review a business case: market sizing, assumptions, cost drivers, risks, and ROI. Identify sensitivities and outline decision-ready recommendations with clear rationale and alternatives.',
   true, 1, 'Consultation role for market/ROI/business-case reviews', true),
  ('Financial Analyst',
   'Act as a financial analyst. Model cost/revenue scenarios, budget impacts, and unit economics. Highlight risks, constraints, and compliance considerations. Provide clear, decision-ready comparisons and recommendations.',
   true, 1, 'Consultation role for financial modeling and budget analysis', true)
ON CONFLICT (name) DO UPDATE
SET prompt_text = EXCLUDED.prompt_text,
    is_active = EXCLUDED.is_active,
    user_selectable = EXCLUDED.user_selectable;


-- Seed base prompt templates for all dialectic stages to the standardized structure
-- Note: The same template body is used across stages; stage-specific behavior comes from overlays.
DO $$
BEGIN
  UPDATE public.system_prompts
  SET prompt_text = $PROMPT$You are a {role}. Your task is to {stage_instructions} produce the required outputs using the provided inputs and references.
{{#section:context_description}}User Input:
{context_description}{{/section:context_description}}
{{#section:domain}}Domain: {domain}{{/section:domain}}
{{#section:deployment_context}}Deployment Context: {deployment_context}{{/section:deployment_context}}
{{#section:reference_documents}}References:
- {reference_documents}{{/section:reference_documents}}
{{#section:constraint_boundaries}}Standards and Constraints:
- {constraint_boundaries}{{/section:constraint_boundaries}}
{{#section:stakeholder_considerations}}Stakeholders:
- {stakeholder_considerations}{{/section:stakeholder_considerations}}
{{#section:prior_stage_ai_outputs}}Prior Stage AI Outputs:
{prior_stage_ai_outputs}{{/section:prior_stage_ai_outputs}}
{{#section:prior_stage_user_feedback}}User Feedback:
{prior_stage_user_feedback}{{/section:prior_stage_user_feedback}}
SYSTEM: Your entire response for this stage MUST be a single, valid JSON object.
Strictly adhere to the JSON structure under 'Expected JSON Output Structure:'.
Populate all placeholders with your generated content. Do not include ANY content outside of the JSON.
The JSON must begin with an opening curly brace and end with a closing curly brace.
{{#section:style_guide_markdown}}{style_guide_markdown}{{/section:style_guide_markdown}}
{{#section:expected_output_artifacts_json}}Expected JSON Output Structure:
{expected_output_artifacts_json}{{/section:expected_output_artifacts_json}}
CRITICAL REMINDER: Ensure your response is ONLY the JSON object detailed above. End of Instructions.$PROMPT$
  WHERE name = 'dialectic_thesis_base_v1';

  UPDATE public.system_prompts
  SET prompt_text = (SELECT prompt_text FROM public.system_prompts WHERE name='dialectic_thesis_base_v1')
  WHERE name IN (
    'dialectic_antithesis_base_v1',
    'dialectic_synthesis_base_v1',
    'dialectic_parenthesis_base_v1',
    'dialectic_paralysis_base_v1'
  );
END $$;

-- Merge per-stage overlay keys for Software Development domain
-- IMPORTANT: Use lowercase keys to match the template: role, stage_instructions, style_guide_markdown, expected_output_artifacts_json

-- Helper CTEs to find IDs once
WITH sp AS (
  SELECT name, id FROM public.system_prompts
  WHERE name IN (
    'dialectic_thesis_base_v1',
    'dialectic_antithesis_base_v1',
    'dialectic_synthesis_base_v1',
    'dialectic_parenthesis_base_v1',
    'dialectic_paralysis_base_v1'
  )
), dom AS (
  SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
)
-- Thesis overlay merge (Software Development)
UPDATE public.domain_specific_prompt_overlays d
SET overlay_values = d.overlay_values
  || jsonb_build_object(
       'role', 'senior product strategist and technical architect',
       'stage_instructions', $TXT$establish the initial, comprehensive baseline; consider distinct perspectives that complement or improve standard practices; recommend the common approach when it clearly meets constraints and provides a superior benefit-cost profile versus alternatives;$TXT$,
       'style_guide_markdown', $SG$
## 1. Purpose & Scope
- Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages.
- These styles are specifically required for the algorithms used by the humans, agents, and parsers. 
- Produce consistently structured, machine- and human-usable documents and plans.
- Ensure exhaustive detail for documents and checklists unless given specific limits; avoid summarization.

## 2.b. Documents
- Do not emit prose outside the required JSON envelope (when present in prompts).
- Process documents sequentially (one document per turn). 
- Stop at boundary if limits are reached. 
- Return continuation flags and do not start the next document until the current one is complete.
- Update the header response to show what documents are finished and which are pending. 
- Diversity rubric: 
    - Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market.
    - Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints.
    - If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation.

## 3. Continuations 
- You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. 
- If completed, set continuation_needed to false and the finish_reason to "stop".
- If continuation is needed, set continuation_needed to true, the reason for stopping, and the resume cursor.
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - finish_reason: "max_tokens" | "length" | "content_truncated" | "next_document"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "finish_reason": "content_truncated",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "1.a.iii" }
}
```

## 8. Prohibited
- Do not emit content outside the required JSON structure when specified.
- Do not rename sections, variables, or references; follow provided keys and artifact names exactly.
- Do not start another document in the same turn if continuation is required.
- Do not substitute summaries where detailed steps are requested.

## 9.b. Document Validation
- Include an Index and Executive Summary for every document to help continuation. 
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 
$SG$,
       'expected_output_artifacts_json', $EOA$
{
  "system_materials": {
    "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "brief, faithful summary of user prompt and referenced materials",
    "stage_rationale": "why these choices align with constraints, standards, and stakeholder needs",
    "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
    "validation_checkpoint": [
      "requirements addressed",
      "best practices applied",
      "feasible & compliant",
      "references integrated"
    ],
    "quality_standards": [
      "security-first",
      "maintainable",
      "scalable",
      "performance-aware"
    ],
    "diversity_rubric": {
      "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
      "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
      "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
    }
  },
  "documents": [
    {
      "key": "business_case",
      "template_filename": "thesis_business_case.md",
      "content_to_include": {
        "market_opportunity": "placeholder",
        "user_problem_validation": "placeholder",
        "competitive_analysis": "placeholder"
      }
    },
    {
      "key": "mvp_feature_spec_with_user_stories",
      "template_filename": "thesis_mvp_feature_spec.md",
      "content_to_include": [
        {
          "feature_name": "placeholder",
          "user_stories": ["As a <role>, I want <goal> so that <reason>."]
        }
      ]
    },
    {
      "key": "high_level_technical_approach_overview",
      "template_filename": "thesis_technical_approach_overview.md",
      "content_to_include": "architecture, components, data, deployment, sequencing"
    },
    {
      "key": "success_metrics",
      "template_filename": "thesis_success_metrics.md",
      "content_to_include": ["placeholder metric 1", "placeholder metric 2"]
    }
  ],
  "files_to_generate": [
    {
      "template_filename": "thesis_product_requirements_document.md",
      "from_document_key": "mvp_feature_spec_with_user_stories"
    },
    {
      "template_filename": "thesis_implementation_plan_proposal.md",
      "from_document_key": "high_level_technical_approach_overview"
    }
  ]
}
$EOA$::jsonb
     )
FROM sp, dom
WHERE d.system_prompt_id = (SELECT id FROM sp WHERE name='dialectic_thesis_base_v1')
  AND d.domain_id = dom.id;

-- Antithesis overlay merge (Software Development)
WITH sp AS (
  SELECT name, id FROM public.system_prompts WHERE name='dialectic_antithesis_base_v1'
), dom AS (
  SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
)
UPDATE public.domain_specific_prompt_overlays d
SET overlay_values = d.overlay_values
  || jsonb_build_object(
       'role', 'senior reviewer and feasibility analyst',
       'stage_instructions', $TXT$for the provided proposal only, critically analyze against constraints, standards, and references; identify gaps, risks, inconsistencies, and integration issues; produce clear, actionable recommendations and normalized comparison signals for downstream synthesis;$TXT$,
       'style_guide_markdown', $SG$
## 1. Purpose & Scope
- Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages.
- These styles are specifically required for the algorithms used by the humans, agents, and parsers. 
- Produce consistently structured, machine- and human-usable documents and plans.
- Ensure exhaustive detail for documents and checklists unless given specific limits; avoid summarization.

## 2.b. Documents
- Do not emit prose outside the required JSON envelope (when present in prompts).
- Process documents sequentially (one document per turn). 
- Stop at boundary if limits are reached. 
- Return continuation flags and do not start the next document until the current one is complete.
- Update the header response to show what documents are finished and which are pending. 
- Diversity rubric: 
    - Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market.
    - Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints.
    - If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation.

## 3. Continuations 
- You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. 
- If completed, set continuation_needed to false and the finish_reason to "stop".
- If continuation is needed, set continuation_needed to true, the reason for stopping, and the resume cursor.
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - finish_reason: "max_tokens" | "length" | "content_truncated" | "next_document"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "finish_reason": "content_truncated",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "1.a.iii" }
}
```

## 8. Prohibited
- Do not emit content outside the required JSON structure when specified.
- Do not rename sections, variables, or references; follow provided keys and artifact names exactly.
- Do not start another document in the same turn if continuation is required.
- Do not substitute summaries where detailed steps are requested.

## 9.b. Document Validation
- Include an Index and Executive Summary for every document to help continuation. 
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 
$SG$,
       'expected_output_artifacts_json', $EOA$
{
  "system_materials": {
    "executive_summary": "concise overview of key findings across all proposals",
    "input_artifacts_summary": "summary of proposals and any user feedback included for review",
    "stage_rationale": "explain the review approach and criteria used",
    "progress_update": "for continuation turns, summarize completed vs pending review areas; omit on first turn",
    "validation_checkpoint": [
      "major technical concerns identified",
      "risk mitigation strategies proposed",
      "alternatives considered where applicable",
      "references and standards checked"
    ],
    "quality_standards": [
      "evidence-based",
      "actionable",
      "balanced",
      "complete"
    ]
  },
  "documents": [
    {
      "key": "per_proposal_critique",
      "template_filename": "antithesis_per_proposal_critique.md",
      "content_to_include": {
        "proposal_id": "placeholder",
        "model_id": "placeholder",
        "strengths": ["placeholder"],
        "weaknesses": ["placeholder"],
        "recommendations": ["placeholder"],
        "notes": ["placeholder"]
      }
    },
    {
      "key": "technical_feasibility_assessment",
      "template_filename": "antithesis_feasibility_assessment.md",
      "content_to_include": "feasibility across constraints (team, timeline, cost), integration with existing systems, and compliance"
    },
    {
      "key": "risk_register",
      "template_filename": "antithesis_risk_register.md",
      "content_to_include": [
        { "risk": "placeholder", "impact": "placeholder", "likelihood": "placeholder", "mitigation": "placeholder" }
      ]
    },
    {
      "key": "non_functional_requirements",
      "template_filename": "antithesis_non_functional_requirements.md",
      "content_to_include": ["security", "performance", "reliability", "scalability", "maintainability", "compliance"]
    },
    {
      "key": "dependency_map",
      "template_filename": "antithesis_dependency_map.md",
      "content_to_include": "mapping of major components and their inter-dependencies; highlight conflicts and sequencing concerns"
    },
    {
      "key": "comparison_vector",
      "template_filename": "antithesis_comparison_vector.json",
      "content_to_include": {
        "proposal_id": "placeholder",
        "dimensions": {
          "feasibility": { "score": 3, "rationale": "placeholder" },
          "complexity": { "score": 3, "rationale": "placeholder" },
          "security": { "score": 3, "rationale": "placeholder" },
          "performance": { "score": 3, "rationale": "placeholder" },
          "maintainability": { "score": 3, "rationale": "placeholder" },
          "scalability": { "score": 3, "rationale": "placeholder" },
          "cost": { "score": 3, "rationale": "placeholder" },
          "time_to_market": { "score": 3, "rationale": "placeholder" },
          "compliance_risk": { "score": 3, "rationale": "placeholder" },
          "alignment_with_constraints": { "score": 3, "rationale": "placeholder" }
        }
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "antithesis_per_proposal_critique.md", "from_document_key": "per_proposal_critique" },
    { "template_filename": "antithesis_feasibility_assessment.md", "from_document_key": "technical_feasibility_assessment" },
    { "template_filename": "antithesis_risk_register.md", "from_document_key": "risk_register" },
    { "template_filename": "antithesis_non_functional_requirements.md", "from_document_key": "non_functional_requirements" },
    { "template_filename": "antithesis_dependency_map.md", "from_document_key": "dependency_map" },
    { "template_filename": "antithesis_comparison_vector.json", "from_document_key": "comparison_vector" }
  ]
}
$EOA$::jsonb
     )
FROM sp, dom
WHERE d.system_prompt_id = sp.id
  AND d.domain_id = dom.id;

-- Synthesis overlay merge (Software Development)
WITH sp AS (
  SELECT name, id FROM public.system_prompts WHERE name='dialectic_synthesis_base_v1'
), dom AS (
  SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
)
UPDATE public.domain_specific_prompt_overlays d
SET overlay_values = d.overlay_values
  || jsonb_build_object(
       'role', 'senior systems architect and product planner',
       'stage_instructions', $TXT$synthesize multiple prior proposals with their per-proposal critiques and comparison vectors plus user feedback into a single, unified and optimized plan; use the normalized signals to drive comparative assessment and selection; resolve conflicts, integrate complementary strengths, fill gaps, and document key trade-offs;$TXT$,
       'style_guide_markdown', $SG$
## 1. Purpose & Scope
- Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages.
- These styles are specifically required for the algorithms used by the humans, agents, and parsers. 
- Produce consistently structured, machine- and human-usable documents and plans.
- Ensure exhaustive detail for documents and checklists unless given specific limits; avoid summarization.

## 2.b. Documents
- Do not emit prose outside the required JSON envelope (when present in prompts).
- Process documents sequentially (one document per turn). 
- Stop at boundary if limits are reached. 
- Return continuation flags and do not start the next document until the current one is complete.
- Update the header response to show what documents are finished and which are pending. 
- Diversity rubric: 
    - Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market.
    - Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints.
    - If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation.

## 3. Continuations 
- You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. 
- If completed, set continuation_needed to false and the finish_reason to "stop".
- If continuation is needed, set continuation_needed to true, the reason for stopping, and the resume cursor.
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - finish_reason: "max_tokens" | "length" | "content_truncated" | "next_document"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "finish_reason": "content_truncated",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "1.a.iii" }
}
```

## 8. Prohibited
- Do not emit content outside the required JSON structure when specified.
- Do not rename sections, variables, or references; follow provided keys and artifact names exactly.
- Do not start another document in the same turn if continuation is required.
- Do not substitute summaries where detailed steps are requested.

## 9.b. Document Validation
- Include an Index and Executive Summary for every document to help continuation. 
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 
$SG$,
       'expected_output_artifacts_json', $EOA$
{
  "system_materials": {
    "executive_summary": "outline/index of all outputs in this response and how they connect to the objective",
    "input_artifacts_summary": "succinct summary of prior proposals, critiques, and user feedback included in this synthesis",
    "stage_rationale": "decision record explaining how signals and critiques informed selections, how conflicts were resolved, gaps were filled, and why chosen approaches best meet constraints",
    "progress_update": "for continuation turns, summarize what is complete vs remaining; omit on first turn",
    "signal_sources": ["per_proposal_critique", "comparison_vector"],
    "decision_criteria": [
      "feasibility",
      "complexity",
      "security",
      "performance",
      "maintainability",
      "scalability",
      "cost",
      "time_to_market",
      "compliance_risk",
      "alignment_with_constraints"
    ],
    "validation_checkpoint": [
      "requirements addressed",
      "best practices applied",
      "feasible & compliant",
      "references integrated"
    ],
    "quality_standards": [
      "security-first",
      "maintainable",
      "scalable",
      "performance-aware"
    ],
    "diversity_rubric": {
      "prefer_standards_when": "meet constraints, well-understood by team, minimize risk/time-to-market",
      "propose_alternates_when": "materially improve performance, security, maintainability, or total cost under constraints",
      "if_comparable": "present 1-2 viable options with concise trade-offs and a clear recommendation"
    }
  },
  "documents": [
    {
      "key": "prd",
      "template_filename": "synthesis_product_requirements_document.md",
      "content_to_include": {
        "mvp_description": "placeholder",
        "user_stories": ["As a <role>, I want <goal> so that <reason>."],
        "feature_specifications": ["placeholder feature spec 1", "placeholder feature spec 2"]
      }
    },
    {
      "key": "system_architecture_overview",
      "template_filename": "synthesis_system_architecture_overview.md",
      "content_to_include": "diagrams/description of services, data flows, storage, auth, and integrations; include rationale for chosen patterns"
    },
    {
      "key": "tech_stack_recommendations",
      "template_filename": "synthesis_tech_stack_recommendations.md",
      "content_to_include": [
        {
          "component": "placeholder (e.g., database)",
          "recommended": "placeholder (e.g., Postgres)",
          "alternatives": ["alt1", "alt2"],
          "tradeoffs": "brief pros/cons with selection rationale"
        }
      ]
    }
  ],
  "files_to_generate": [
    { "template_filename": "synthesis_product_requirements_document.md", "from_document_key": "prd" },
    { "template_filename": "synthesis_system_architecture_overview.md", "from_document_key": "system_architecture_overview" },
    { "template_filename": "synthesis_tech_stack_recommendations.md", "from_document_key": "tech_stack_recommendations" }
  ]
}
$EOA$::jsonb
     )
FROM sp, dom
WHERE d.system_prompt_id = sp.id
  AND d.domain_id = dom.id;

-- Parenthesis overlay merge (Software Development)
WITH sp AS (
  SELECT name, id FROM public.system_prompts WHERE name='dialectic_parenthesis_base_v1'
), dom AS (
  SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
)
UPDATE public.domain_specific_prompt_overlays d
SET overlay_values = d.overlay_values
  || jsonb_build_object(
       'role', 'principal technical planner and delivery architect',
       'stage_instructions', $TXT$formalize the synthesized solution into an executable plan centered on a persistent Master Plan. Create a high-level, dependency-ordered roadmap of milestones and a milestone schema to be expanded next stage;$TXT$,
       'style_guide_markdown', $SG$
## 1. Purpose & Scope
- Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages.
- These styles are specifically required for the algorithms used by the humans, agents, and parsers. 
- Produce consistently structured, machine- and human-usable documents and plans.
- Ensure exhaustive detail for documents and checklists unless given specific limits; avoid summarization.

## 2.a. Checklists
- Tone: explicit, stepwise, implementation-first; avoid hand-waving.
- One-file-per-step prompts when feasible. Include filenames/paths when known.
- Use deterministic, directive language (“Generate”, “Add”, “Write”).
- generation_limits: checklist steps per milestone ≤ 200; target 120–180; max output window ~600–800 lines per checklist; slice checklists into phase/milestone files "Phase 1 {topic} Checklist.md" or similar if the anticipated output will exceed the window.
- Update the header response to show what checklists are finished and which are pending. 

## 2.b. Documents
- Do not emit prose outside the required JSON envelope (when present in prompts).
- Process documents sequentially (one document per turn). 
- Stop at boundary if limits are reached. 
- Return continuation flags and do not start the next document until the current one is complete.
- Update the header response to show what documents are finished and which are pending. 
- Diversity rubric: 
    - Prefer standards when they meet constraints, are well-understood by team, and/or minimize risk and/or time-to-market.
    - Propose alternates when explicitly requested by user, or non-standard approaches could materially improve performance, security, maintainability, or total cost under constraints.
    - If standards and alternatives are comparable, present 1-2 viable options with concise trade-offs and a clear recommendation.

## 3. Continuations 
- You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. 
- If completed, set continuation_needed to false and the finish_reason to "stop".
- If continuation is needed, set continuation_needed to true, the reason for stopping, and the resume cursor.
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - finish_reason: "max_tokens" | "length" | "content_truncated" | "next_document"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "finish_reason": "content_truncated",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "1.a.iii" }
}
```

## 4. Formatting

### 4.1 Status markers
- `[ ]` Unstarted
- `[✅]` Completed
- `[🚧]` In progress / partially completed
- `[⏸️]` Paused / waiting for input
- `[❓]` Uncertainty to resolve
- `[🚫]` Blocked by dependency/issue

Place the marker at the start of every actionable item.

### 4.2 Component labels
When relevant, add ONE label immediately after the marker:
`[DB]` `[RLS]` `[BE]` `[API]` `[STORE]` `[UI]` `[CLI]` `[IDE]` `[TEST-UNIT]` `[TEST-INT]` `[TEST-E2E]` `[DOCS]` `[REFACTOR]` `[PROMPT]` `[CONFIG]` `[COMMIT]` `[DEPLOY]`.

### 4.3 Numbering & indentation (exact)
* `[ ]` 1. [Label] Task instruction for `path/file.name` in `workspace`
    * `[ ]` a. [Label] Level 2 `sub-task instruction` for `file.name` (tab indented under Level 1)
        * `[ ]` i. [Label] Level 3 `detail instruction` for `function` in `file.name` (tab indented under Level 2)
- Avoid deeper nesting. If absolutely necessary, restart numbering appropriately or use a simple bullet `-` for micro-points.
- Maintain proper Markdown indentation so nesting renders correctly.

### 4.4 Required Milestone Fields
- Inputs: what is required to start
- Outputs: what is produced
- Validation: how correctness is verified (tests, scripts, acceptance criteria)
- Dependencies: call out when non-obvious (structure should imply most ordering)

## 6. Master Plan & Milestones
- A persistent, high-level Master Plan drives iterative generation of low-level implementation checklists.
- Milestone schema fields:
  - id, title, objective, dependencies[], acceptance_criteria[], status (`[ ]`, `[🚧]`, `[✅]`)
- Organize Master Plan as phases → milestones; ensure dependency ordering.
- Do not delve into low-level individual work steps in a Master Plan or Milestones. 

## 8. Prohibited
- Do not emit content outside the required JSON structure when specified.
- Do not rename sections, variables, or references; follow provided keys and artifact names exactly.
- Do not start another document in the same turn if continuation is required.
- Do not substitute summaries where detailed steps are requested.

## 9.a Checklist Validation
- Status markers present at every actionable item
- Component labels used where relevant
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- TDD RED→GREEN→REFACTOR sequencing present where applicable
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 

## 9.b. Document Validation
- Include an Index and Executive Summary for every document to help continuation. 
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 

## 10.a. Milestone Skeleton
```markdown
*   `[ ]` 1. [area] Milestone <ID>: <Title>
    *   `[ ]` a. Objective: <objective>
    *   `[ ]` b. Dependencies: <ids or none>
    *   `[ ]` c. Acceptance criteria:
        *   `[ ]` i. <criterion 1>
        *   `[ ]` ii. <criterion 2>
```
$SG$,
       'expected_output_artifacts_json', $EOA$
{
  "system_materials": {
    "executive_summary": "overview of formalization scope and how the Master Plan will drive iterative execution",
    "input_artifacts_summary": "succinct recap of synthesis outputs informing this plan",
    "stage_rationale": "why the chosen milestone breakdown, ordering, and architecture structure best fit constraints and objectives",
    "progress_update": "for continuation turns, summarize Master Plan changes since last iteration; omit on first turn",
    "validation_checkpoint": [
      "complete coverage of synthesized scope",
      "dependency ordering validated",
      "milestone acceptance criteria present",
      "style guide structure applied"
    ],
    "quality_standards": [
      "consistent formatting",
      "explicit ordering",
      "clear acceptance criteria",
      "testability of milestones"
    ]
  },
  "documents": [
    {
      "key": "trd",
      "template_filename": "parenthesis_trd.md",
      "content_to_include": {
        "subsystems": ["placeholder"],
        "apis": ["placeholder"],
        "schemas": ["placeholder"],
        "proposed_file_tree": "placeholder",
        "architecture_overview": "placeholder"
      }
    },
    {
      "key": "master_plan",
      "template_filename": "parenthesis_master_plan.md",
      "content_to_include": {
        "phases": [
          {
            "name": "placeholder",
            "milestones": [
              {
                "id": "M1",
                "title": "placeholder",
                "objective": "placeholder",
                "dependencies": ["none"],
                "acceptance_criteria": ["placeholder"],
                "status": "[ ]"
              }
            ]
          }
        ]
      }
    },
    {
      "key": "milestone_schema",
      "template_filename": "parenthesis_milestone_schema.md",
      "content_to_include": {
        "fields": [
          "id",
          "title",
          "objective",
          "dependencies",
          "acceptance_criteria",
          "status"
        ],
        "style_guide_notes": "Use standardized checklist markers, component labels when relevant, and keep scope at milestone granularity; detailed steps belong to next stage."
      }
    }
  ],
  "files_to_generate": [
    { "template_filename": "parenthesis_trd.md", "from_document_key": "trd" },
    { "template_filename": "parenthesis_master_plan.md", "from_document_key": "master_plan" },
    { "template_filename": "parenthesis_milestone_schema.md", "from_document_key": "milestone_schema" }
  ]
}
$EOA$::jsonb,
       'generation_limits', '{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"}'::jsonb
     )
FROM sp, dom
WHERE d.system_prompt_id = sp.id
  AND d.domain_id = dom.id;

-- Paralysis overlay merge (Software Development)
WITH sp AS (
  SELECT name, id FROM public.system_prompts WHERE name='dialectic_paralysis_base_v1'
), dom AS (
  SELECT id FROM public.dialectic_domains WHERE name = 'Software Development'
)
UPDATE public.domain_specific_prompt_overlays d
SET overlay_values = d.overlay_values
  || jsonb_build_object(
       'role', 'implementation planner and TDD workflow author',
       'stage_instructions', $TXT$using the TRD, Master Plan, and selected milestones, generate a dependency-ordered, fine-grained, high-detail checklist of implementation prompts that follow the style guide;$TXT$,
       'style_guide_markdown', $SG$
## 1. Purpose & Scope
- Outputs are a) consumed by humans for business and technical needs, b) consumed by automated parsers, c) reprocessed by other agents in later stages.
- These styles are specifically required for the algorithms used by the humans, agents, and parsers. 
- Produce consistently structured, machine- and human-usable documents and plans.
- Ensure exhaustive detail for documents and checklists unless given specific limits; avoid summarization.

## 2.a. Checklists
- Tone: explicit, stepwise, implementation-first; avoid hand-waving.
- One-file-per-step prompts when feasible. Include filenames/paths when known.
- Use deterministic, directive language (“Generate”, “Add”, “Write”).
- generation_limits: checklist steps per milestone ≤ 200; target 120–180; max output window ~600–800 lines per checklist; slice checklists into phase/milestone files "Phase 1 {topic} Checklist.md" or similar if the anticipated output will exceed the window.
- Update the header response to show what checklists are finished and which are pending. 

## 3. Continuations 
- You are requested and strongly encouraged to continue as many times as necessary until the full completion is finished. 
- If completed, set continuation_needed to false and the finish_reason to "stop".
- If continuation is needed, set continuation_needed to true, the reason for stopping, and the resume cursor.
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - finish_reason: "max_tokens" | "length" | "content_truncated" | "next_document"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "finish_reason": "content_truncated",
  "resume_cursor": { "document_key": "actionable_checklist", "section_id": "1.a.iii" }
}
```

## 4. Formatting

### 4.1 Status markers
- `[ ]` Unstarted
- `[✅]` Completed
- `[🚧]` In progress / partially completed
- `[⏸️]` Paused / waiting for input
- `[❓]` Uncertainty to resolve
- `[🚫]` Blocked by dependency/issue

Place the marker at the start of every actionable item.

### 4.2 Component labels
When relevant, add ONE label immediately after the marker:
`[DB]` `[RLS]` `[BE]` `[API]` `[STORE]` `[UI]` `[CLI]` `[IDE]` `[TEST-UNIT]` `[TEST-INT]` `[TEST-E2E]` `[DOCS]` `[REFACTOR]` `[PROMPT]` `[CONFIG]` `[COMMIT]` `[DEPLOY]`.

### 4.3 Numbering & indentation (exact)
* `[ ]` 1. [Label] Task instruction for `path/file.name` in `workspace`
    * `[ ]` a. [Label] Level 2 `sub-task instruction` for `file.name` (tab indented under Level 1)
        * `[ ]` i. [Label] Level 3 `detail instruction` for `function` in `file.name` (tab indented under Level 2)
- Avoid deeper nesting. If absolutely necessary, restart numbering appropriately or use a simple bullet `-` for micro-points.
- Maintain proper Markdown indentation so nesting renders correctly.

## 5. TDD Sequencing
Enforce RED → Implement → GREEN → Refactor, and label steps accordingly.

## 6. Master Plan & Milestone
- A persistent, high-level Master Plan drives iterative generation of low-level implementation checklists.
- Milestone schema fields:
  - id, title, objective, dependencies[], acceptance_criteria[], status (`[ ]`, `[🚧]`, `[✅]`)
- Organize Master Plan as phases → milestones; ensure dependency ordering.
- Do not delve into low-level individual work steps in a Master Plan or Milestones. 

## 7. Implementation Checklists
- Extreme detail; no summarization. Each step includes Inputs, Outputs, Validation.
- Use 1/a/i numbering and component labels.
- One-file-per-step prompts when possible; prefer explicit filenames/paths.
- Respect sizing & continuation policy (Section 3).

## 8. Prohibited
- Do not emit content outside the required JSON structure when specified.
- Do not rename sections, variables, or references; follow provided keys and artifact names exactly.
- Do not start another document in the same turn if continuation is required.
- Do not substitute summaries where detailed steps are requested.

## 9.a. Checklist Validation
- Status markers present at every actionable item
- Component labels used where relevant
- Numbering and indentation follow 1/a/i scheme
- Each actionable item includes Inputs, Outputs, Validation
- TDD RED→GREEN→REFACTOR sequencing present where applicable
- Milestone acceptance criteria specified 
- Sizing respected; continuation flags set when needed 

## 10.a. Milestone Skeleton
```markdown
*   `[ ]` 1. [area] Milestone <ID>: <Title>
    *   `[ ]` a. Objective: <objective>
    *   `[ ]` b. Dependencies: <ids or none>
    *   `[ ]` c. Acceptance criteria:
        *   `[ ]` i. <criterion 1>
        *   `[ ]` ii. <criterion 2>
```

## 10.b. Checklist Skeleton
```markdown
*   `[ ]` 1. [COMP] Step title
    *   `[ ]` a. Inputs: <inputs>
    *   `[ ]` b. Outputs: <outputs>
    *   `[ ]` c. Validation: <how verified>
    *   `[ ]` d. [TEST-UNIT] <RED test>
    *   `[ ]` e. [COMP] <implementation>
    *   `[ ]` f. [TEST-UNIT] <GREEN test>
    *   `[ ]` g. [COMMIT] <message>
```
$SG$,
       'expected_output_artifacts_json', $EOA$
{
  "system_materials": {
    "executive_summary": "summary of which milestones are detailed in this iteration and why",
    "input_artifacts_summary": "TRD sections used, Master Plan phase/milestone references",
    "stage_rationale": "explain ordering, TDD emphasis, and how checklist conforms to style guide",
    "progress_update": "summarize completed vs remaining milestones; denote updated statuses in Master Plan",
    "generation_limits": { "max_steps": 200, "target_steps": "120-180", "max_output_lines": "600-800" },
    "document_order": ["actionable_checklist","updated_master_plan"],
    "current_document": "actionable_checklist",
    "continuation_policy": "stop-at-boundary; one-document-per-turn; resume where left off",
    "exhaustiveness_requirement": "extreme detail; no summaries; each step includes inputs, outputs, validation; 1/a/i numbering; component labels",
    "validation_checkpoint": [
      "checklist uses style guide (status, numbering, labels)",
      "steps are atomic and testable",
      "dependency ordering enforced",
      "coverage aligns to milestone acceptance criteria"
    ],
    "quality_standards": [
      "TDD sequence present",
      "no missing dependencies",
      "no speculative steps beyond selected milestones",
      "clear file-by-file prompts"
    ]
  },
  "documents": [
    {
      "key": "actionable_checklist",
      "template_filename": "paralysis_actionable_checklist.md",
      "content_to_include": "full low-level checklist using style guide: status markers, 1/a/i numbering, component labels; each step contains inputs, outputs, validation; one-file-per-step prompts"
    },
    {
      "key": "updated_master_plan",
      "template_filename": "paralysis_updated_master_plan.md",
      "content_to_include": "copy of Master Plan with the detailed milestones set to [🚧], others unchanged"
    }
  ],
  "files_to_generate": [
    { "template_filename": "paralysis_actionable_checklist.md", "from_document_key": "actionable_checklist" },
    { "template_filename": "paralysis_updated_master_plan.md", "from_document_key": "updated_master_plan" }
  ]
}
$EOA$::jsonb,
       'generation_limits', '{"max_steps":200,"target_steps":"120-180","max_output_lines":"600-800"}'::jsonb,
       'continuation_policy', 'stop-at-boundary; one-document-per-turn; resume where left off',
       'document_order', '["actionable_checklist","updated_master_plan"]',
       'current_document', 'actionable_checklist',
       'exhaustiveness_requirement', 'extreme detail; no summaries; each step includes inputs, outputs, validation; 1/a/i numbering; component labels'
     )
FROM sp, dom
WHERE d.system_prompt_id = sp.id
  AND d.domain_id = dom.id;

-- Note: Chats and chat_messages tables are typically populated by user interaction, not seeding. 

-- Seed Test Users needed for RLS policy tests
-- Use well-known UUIDs for consistency with tests
INSERT INTO auth.users (id, email, encrypted_password, role, aud, email_confirmed_at)
VALUES 
  ('a0000000-0000-0000-0000-000000000001', 'user_a@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now()),
  ('b0000000-0000-0000-0000-000000000002', 'user_b@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now()),
  ('c0000000-0000-0000-0000-000000000003', 'user_c@test.com', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now())
ON CONFLICT (id) DO NOTHING; -- Avoid errors if users already exist 

-- Seed data for local development and testing

-- Example: Insert a default organization if needed
-- INSERT INTO public.organizations (id, name) VALUES
-- ('your-default-org-id', 'Default Organization')
-- ON CONFLICT (id) DO NOTHING;

-- Example: Insert default user roles if you have a roles table
-- INSERT INTO public.roles (id, name) VALUES
-- (1, 'admin'),
-- (2, 'member')
-- ON CONFLICT (id) DO NOTHING;

-- START AI PROVIDERS

INSERT INTO "public"."ai_providers" ("name", "api_identifier", "description", "is_active", "config", "provider", "is_enabled", "is_default_embedding")
VALUES
  ('claude-2.0', 'anthropic-claude-2.0', '[SANITIZED/OBSOLETE]: No description.', false, '{"api_identifier":"anthropic-claude-2.0","context_window_tokens":1,"input_token_cost_rate":1,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":1,"output_token_cost_rate":1}', 'anthropic', false, false),
  ('claude-2.1', 'anthropic-claude-2.1', '[SANITIZED/OBSOLETE]: No description.', false, '{"api_identifier":"anthropic-claude-2.1","context_window_tokens":1,"input_token_cost_rate":1,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":1,"output_token_cost_rate":1}', 'anthropic', false, false),
  ('claude-3-5-haiku-20241022', 'anthropic-claude-3-5-haiku-20241022', '', true, '{"api_identifier":"anthropic-claude-3-5-haiku-20241022","context_window_tokens":200000,"input_token_cost_rate":0.8,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3.5-haiku-20241022"},"hard_cap_output_tokens":8192,"output_token_cost_rate":4,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', false, false),
  ('claude-3-5-sonnet-20240620', 'anthropic-claude-3-5-sonnet-20240620', '', true, '{"api_identifier":"anthropic-claude-3-5-sonnet-20240620","context_window_tokens":200000,"input_token_cost_rate":3,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3.5-sonnet-20240620"},"hard_cap_output_tokens":8192,"output_token_cost_rate":15,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', false, false),
  ('claude-3-5-sonnet-20241022', 'anthropic-claude-3-5-sonnet-20241022', '', true, '{"api_identifier":"anthropic-claude-3-5-sonnet-20241022","context_window_tokens":200000,"input_token_cost_rate":3,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3.5-sonnet-20241022"},"hard_cap_output_tokens":8192,"output_token_cost_rate":15,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', false, false),
  ('claude-3-7-sonnet-20250219', 'anthropic-claude-3-7-sonnet-20250219', '', true, '{"api_identifier":"anthropic-claude-3-7-sonnet-20250219","context_window_tokens":200000,"input_token_cost_rate":3,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3-7-sonnet-20250219"},"hard_cap_output_tokens":8192,"output_token_cost_rate":15,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', true, false),
  ('claude-3-haiku-20240307', 'anthropic-claude-3-haiku-20240307', '', true, '{"api_identifier":"anthropic-claude-3-haiku-20240307","context_window_tokens":200000,"input_token_cost_rate":0.25,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3-haiku-20240307"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1.25,"provider_max_input_tokens":200000,"provider_max_output_tokens":4096}', 'anthropic', false, false),
  ('claude-3-opus-20240229', 'anthropic-claude-3-opus-20240229', '', true, '{"api_identifier":"anthropic-claude-3-opus-20240229","context_window_tokens":200000,"input_token_cost_rate":15,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-3-opus-20240229"},"hard_cap_output_tokens":4096,"output_token_cost_rate":75,"provider_max_input_tokens":200000,"provider_max_output_tokens":4096}', 'anthropic', false, false),
  ('claude-3-sonnet-20240229', 'anthropic-claude-3-sonnet-20240229', '[SANITIZED/OBSOLETE]: No description.', false, '{"api_identifier":"anthropic-claude-3-sonnet-20240229","context_window_tokens":1,"input_token_cost_rate":1,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":1,"output_token_cost_rate":1}', 'anthropic', false, false),
  ('claude-opus-4-1-20250805', 'anthropic-claude-opus-4-1-20250805', '', true, '{"api_identifier":"anthropic-claude-opus-4-1-20250805","context_window_tokens":200000,"input_token_cost_rate":20,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-opus-4-1-20250805"},"hard_cap_output_tokens":8192,"output_token_cost_rate":100,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', false, false),
  ('claude-opus-4-20250514', 'anthropic-claude-opus-4-20250514', '', true, '{"api_identifier":"anthropic-claude-opus-4-20250514","context_window_tokens":200000,"input_token_cost_rate":18,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-opus-4-20250514"},"hard_cap_output_tokens":8192,"output_token_cost_rate":90,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', true, false),
  ('claude-sonnet-4-20250514', 'anthropic-claude-sonnet-4-20250514', '', true, '{"api_identifier":"anthropic-claude-sonnet-4-20250514","context_window_tokens":200000,"input_token_cost_rate":4,"tokenization_strategy":{"type":"anthropic_tokenizer","model":"claude-sonnet-4-20250514"},"hard_cap_output_tokens":8192,"output_token_cost_rate":20,"provider_max_input_tokens":200000,"provider_max_output_tokens":8192}', 'anthropic', true, false),
  ('Dummy Echo v1', 'dummy-echo-v1', NULL, true, '{"mode":"echo","modelId":"dummy-echo-v1","api_identifier":"dummy-echo-v1","basePromptTokens":2,"context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","tiktoken_encoding_name":"cl100k_base"},"hard_cap_output_tokens":16000,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":16000}', 'dummy', true, false),
  ('Gemini 1.0 Pro Vision', 'google-gemini-1.0-pro-vision-latest', 'The original Gemini 1.0 Pro Vision model version which was optimized for image understanding. Gemini 1.0 Pro Vision was deprecated on July 12, 2024. Move to a newer Gemini version.', false, '{"api_identifier":"google-gemini-1.0-pro-vision-latest","input_token_cost_rate":5e-7,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":4096,"output_token_cost_rate":0.0000015,"provider_max_input_tokens":12288,"provider_max_output_tokens":4096}', 'google', false, false),
  ('Gemini 1.5 Flash', 'google-gemini-1.5-flash', 'Alias that points to the most recent stable version of Gemini 1.5 Flash, our fast and versatile multimodal model for scaling across diverse tasks.', true, '{"api_identifier":"google-gemini-1.5-flash","context_window_tokens":2000000,"input_token_cost_rate":0.6,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.6,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Flash 002', 'google-gemini-1.5-flash-002', 'Stable version of Gemini 1.5 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in September of 2024.', true, '{"api_identifier":"google-gemini-1.5-flash-002","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Flash-8B', 'google-gemini-1.5-flash-8b', 'Stable version of Gemini 1.5 Flash-8B, our smallest and most cost effective Flash model, released in October of 2024.', true, '{"api_identifier":"google-gemini-1.5-flash-8b","context_window_tokens":2000000,"input_token_cost_rate":0.3,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.3,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Flash-8B 001', 'google-gemini-1.5-flash-8b-001', 'Stable version of Gemini 1.5 Flash-8B, our smallest and most cost effective Flash model, released in October of 2024.', true, '{"api_identifier":"google-gemini-1.5-flash-8b-001","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Flash-8B Latest', 'google-gemini-1.5-flash-8b-latest', 'Alias that points to the most recent production (non-experimental) release of Gemini 1.5 Flash-8B, our smallest and most cost effective Flash model, released in October of 2024.', true, '{"api_identifier":"google-gemini-1.5-flash-8b-latest","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Flash Latest', 'google-gemini-1.5-flash-latest', 'Alias that points to the most recent production (non-experimental) release of Gemini 1.5 Flash, our fast and versatile multimodal model for scaling across diverse tasks.', true, '{"api_identifier":"google-gemini-1.5-flash-latest","context_window_tokens":2000000,"input_token_cost_rate":0.6,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.6,"provider_max_input_tokens":1000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Pro', 'google-gemini-1.5-pro', 'Stable version of Gemini 1.5 Pro, our mid-size multimodal model that supports up to 2 million tokens, released in May of 2024.', true, '{"api_identifier":"google-gemini-1.5-pro","context_window_tokens":2000000,"input_token_cost_rate":2.5,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":10,"provider_max_input_tokens":2000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Pro 002', 'google-gemini-1.5-pro-002', 'Stable version of Gemini 1.5 Pro, our mid-size multimodal model that supports up to 2 million tokens, released in September of 2024.', true, '{"api_identifier":"google-gemini-1.5-pro-002","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":2000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 1.5 Pro Latest', 'google-gemini-1.5-pro-latest', 'Alias that points to the most recent production (non-experimental) release of Gemini 1.5 Pro, our mid-size multimodal model that supports up to 2 million tokens.', true, '{"api_identifier":"google-gemini-1.5-pro-latest","context_window_tokens":2000000,"input_token_cost_rate":2.5,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":10,"provider_max_input_tokens":2000000,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash', 'google-gemini-2.0-flash', 'Gemini 2.0 Flash', true, '{"api_identifier":"google-gemini-2.0-flash","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash 001', 'google-gemini-2.0-flash-001', 'Stable version of Gemini 2.0 Flash, our fast and versatile multimodal model for scaling across diverse tasks, released in January of 2025.', true, '{"api_identifier":"google-gemini-2.0-flash-001","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash Experimental', 'google-gemini-2.0-flash-exp', 'Gemini 2.0 Flash Experimental', true, '{"api_identifier":"google-gemini-2.0-flash-exp","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash (Image Generation) Experimental', 'google-gemini-2.0-flash-exp-image-generation', 'Gemini 2.0 Flash (Image Generation) Experimental', true, '{"api_identifier":"google-gemini-2.0-flash-exp-image-generation","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash-Lite', 'google-gemini-2.0-flash-lite', 'Gemini 2.0 Flash-Lite', true, '{"api_identifier":"google-gemini-2.0-flash-lite","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash-Lite 001', 'google-gemini-2.0-flash-lite-001', 'Stable version of Gemini 2.0 Flash-Lite', true, '{"api_identifier":"google-gemini-2.0-flash-lite-001","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash-Lite Preview', 'google-gemini-2.0-flash-lite-preview', 'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite', true, '{"api_identifier":"google-gemini-2.0-flash-lite-preview","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash-Lite Preview 02-05', 'google-gemini-2.0-flash-lite-preview-02-05', 'Preview release (February 5th, 2025) of Gemini 2.0 Flash-Lite', true, '{"api_identifier":"google-gemini-2.0-flash-lite-preview-02-05","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.0 Flash Preview Image Generation', 'google-gemini-2.0-flash-preview-image-generation', 'Gemini 2.0 Flash Preview Image Generation', true, '{"api_identifier":"google-gemini-2.0-flash-preview-image-generation","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":32768,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 05-20', 'google-gemini-2.0-flash-thinking-exp', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', true, '{"api_identifier":"google-gemini-2.0-flash-thinking-exp","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 05-20', 'google-gemini-2.0-flash-thinking-exp-01-21', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', true, '{"api_identifier":"google-gemini-2.0-flash-thinking-exp-01-21","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 05-20', 'google-gemini-2.0-flash-thinking-exp-1219', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', true, '{"api_identifier":"google-gemini-2.0-flash-thinking-exp-1219","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.0 Pro Experimental', 'google-gemini-2.0-pro-exp', 'Experimental release (March 25th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-2.0-pro-exp","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.0 Pro Experimental 02-05', 'google-gemini-2.0-pro-exp-02-05', 'Experimental release (March 25th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-2.0-pro-exp-02-05","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash', 'google-gemini-2.5-flash', 'Stable version of Gemini 2.5 Flash, our mid-size multimodal model that supports up to 1 million tokens, released in June of 2025.', true, '{"api_identifier":"google-gemini-2.5-flash","context_window_tokens":2000000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":2.5,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', true, false),
  ('Nano Banana', 'google-gemini-2.5-flash-image-preview', 'Gemini 2.5 Flash Preview Image', true, '{"api_identifier":"google-gemini-2.5-flash-image-preview","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":32768,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemini 2.5 Flash-Lite', 'google-gemini-2.5-flash-lite', 'Stable version of Gemini 2.5 Flash-Lite, released in July of 2025', true, '{"api_identifier":"google-gemini-2.5-flash-lite","context_window_tokens":2000000,"input_token_cost_rate":0.3,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.4,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash-Lite Preview 06-17', 'google-gemini-2.5-flash-lite-preview-06-17', 'Preview release (June 11th, 2025) of Gemini 2.5 Flash-Lite', true, '{"api_identifier":"google-gemini-2.5-flash-lite-preview-06-17","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 04-17', 'google-gemini-2.5-flash-preview-04-17', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', false, '{"api_identifier":"google-gemini-2.5-flash-preview-04-17","input_token_cost_rate":5e-7,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.0000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 04-17 for cursor testing', 'google-gemini-2.5-flash-preview-04-17-thinking', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', false, '{"api_identifier":"google-gemini-2.5-flash-preview-04-17-thinking","input_token_cost_rate":5e-7,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.0000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview 05-20', 'google-gemini-2.5-flash-preview-05-20', 'Preview release (April 17th, 2025) of Gemini 2.5 Flash', true, '{"api_identifier":"google-gemini-2.5-flash-preview-05-20","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Flash Preview TTS', 'google-gemini-2.5-flash-preview-tts', 'Gemini 2.5 Flash Preview TTS', true, '{"api_identifier":"google-gemini-2.5-flash-preview-tts","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":8192,"provider_max_output_tokens":16384}', 'google', false, false),
  ('Gemini 2.5 Pro', 'google-gemini-2.5-pro', 'Stable release (June 17th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-2.5-pro","context_window_tokens":2000000,"input_token_cost_rate":2.5,"tokenization_strategy":{"type":"google_gemini_tokenizer"},"hard_cap_output_tokens":65536,"output_token_cost_rate":15,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', true, false),
  ('Gemini 2.5 Pro Preview 03-25', 'google-gemini-2.5-pro-preview-03-25', 'Gemini 2.5 Pro Preview 03-25', true, '{"api_identifier":"google-gemini-2.5-pro-preview-03-25","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemini 2.5 Pro Preview 05-06', 'google-gemini-2.5-pro-preview-05-06', 'Preview release (May 6th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-2.5-pro-preview-05-06","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', true, false),
  ('Gemini 2.5 Pro Preview', 'google-gemini-2.5-pro-preview-06-05', 'Preview release (June 5th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-2.5-pro-preview-06-05","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', true, false),
  ('Gemini 2.5 Pro Preview TTS', 'google-gemini-2.5-pro-preview-tts', 'Gemini 2.5 Pro Preview TTS', true, '{"api_identifier":"google-gemini-2.5-pro-preview-tts","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":8192,"provider_max_output_tokens":16384}', 'google', false, false),
  ('Gemini Experimental 1206', 'google-gemini-exp-1206', 'Experimental release (March 25th, 2025) of Gemini 2.5 Pro', true, '{"api_identifier":"google-gemini-exp-1206","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":65536}', 'google', false, false),
  ('Gemma 3 12B', 'google-gemma-3-12b-it', '', true, '{"api_identifier":"google-gemma-3-12b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":32768,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemma 3 1B', 'google-gemma-3-1b-it', '', true, '{"api_identifier":"google-gemma-3-1b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":32768,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemma 3 27B', 'google-gemma-3-27b-it', '', true, '{"api_identifier":"google-gemma-3-27b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":131072,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemma 3 4B', 'google-gemma-3-4b-it', '', true, '{"api_identifier":"google-gemma-3-4b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":32768,"provider_max_output_tokens":8192}', 'google', false, false),
  ('Gemma 3n E2B', 'google-gemma-3n-e2b-it', '', true, '{"api_identifier":"google-gemma-3n-e2b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":8192,"provider_max_output_tokens":2048}', 'google', false, false),
  ('Gemma 3n E4B', 'google-gemma-3n-e4b-it', '', true, '{"api_identifier":"google-gemma-3n-e4b-it","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":8192,"provider_max_output_tokens":2048}', 'google', false, false),
  ('LearnLM 2.0 Flash Experimental', 'google-learnlm-2.0-flash-experimental', 'LearnLM 2.0 Flash Experimental', true, '{"api_identifier":"google-learnlm-2.0-flash-experimental","context_window_tokens":2000000,"input_token_cost_rate":0.000075,"tokenization_strategy":{"type":"rough_char_count","chars_per_token_ratio":4},"hard_cap_output_tokens":65536,"output_token_cost_rate":0.000015,"provider_max_input_tokens":1048576,"provider_max_output_tokens":32768}', 'google', false, false),
  ('OpenAI chatgpt-4o-latest', 'openai-chatgpt-4o-latest', 'Owned by: system', true, '{"api_identifier":"openai-chatgpt-4o-latest","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo', 'openai-gpt-3.5-turbo', 'Owned by: openai', true, '{"api_identifier":"openai-gpt-3.5-turbo","context_window_tokens":16385,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":16385,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo-0125', 'openai-gpt-3.5-turbo-0125', 'Owned by: system', true, '{"api_identifier":"openai-gpt-3.5-turbo-0125","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo-1106', 'openai-gpt-3.5-turbo-1106', 'Owned by: system', true, '{"api_identifier":"openai-gpt-3.5-turbo-1106","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo-16k', 'openai-gpt-3.5-turbo-16k', 'Owned by: openai-internal', true, '{"api_identifier":"openai-gpt-3.5-turbo-16k","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo-instruct', 'openai-gpt-3.5-turbo-instruct', 'Owned by: system', true, '{"api_identifier":"openai-gpt-3.5-turbo-instruct","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-3.5-turbo-instruct-0914', 'openai-gpt-3.5-turbo-instruct-0914', 'Owned by: system', true, '{"api_identifier":"openai-gpt-3.5-turbo-instruct-0914","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4', 'openai-gpt-4', 'Owned by: openai', true, '{"api_identifier":"openai-gpt-4","context_window_tokens":8192,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":8192,"provider_max_output_tokens":4096}', 'openai', true, false),
  ('OpenAI gpt-4-0125-preview', 'openai-gpt-4-0125-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4-0125-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4-0613', 'openai-gpt-4-0613', 'Owned by: openai', true, '{"api_identifier":"openai-gpt-4-0613","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', true, false),
  ('OpenAI gpt-4.1', 'openai-gpt-4.1', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', true, false),
  ('OpenAI gpt-4-1106-preview', 'openai-gpt-4-1106-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4-1106-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.1-2025-04-14', 'openai-gpt-4.1-2025-04-14', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1-2025-04-14","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.1-mini', 'openai-gpt-4.1-mini', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1-mini","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.1-mini-2025-04-14', 'openai-gpt-4.1-mini-2025-04-14', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1-mini-2025-04-14","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.1-nano', 'openai-gpt-4.1-nano', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1-nano","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.1-nano-2025-04-14', 'openai-gpt-4.1-nano-2025-04-14', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4.1-nano-2025-04-14","context_window_tokens":1047576,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":1047576,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4.5-preview', 'openai-gpt-4.5-preview', 'Owned by: system', false, '{"api_identifier":"openai-gpt-4.5-preview","input_token_cost_rate":0.00003,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4.5-preview"},"output_token_cost_rate":0.00006}', 'openai', true, false),
  ('OpenAI gpt-4.5-preview-2025-02-27', 'openai-gpt-4.5-preview-2025-02-27', 'Owned by: system', false, '{"api_identifier":"openai-gpt-4.5-preview-2025-02-27","input_token_cost_rate":0.00003,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4.5-preview-2025-02-27"},"output_token_cost_rate":0.00006}', 'openai', true, false),
  ('OpenAI gpt-4o', 'openai-gpt-4o', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', true, false),
  ('OpenAI gpt-4o-2024-05-13', 'openai-gpt-4o-2024-05-13', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-2024-05-13","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-2024-08-06', 'openai-gpt-4o-2024-08-06', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-2024-08-06","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-2024-11-20', 'openai-gpt-4o-2024-11-20', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-2024-11-20","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-audio-preview', 'openai-gpt-4o-audio-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-audio-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-audio-preview-2024-10-01', 'openai-gpt-4o-audio-preview-2024-10-01', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-audio-preview-2024-10-01","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-audio-preview-2024-12-17', 'openai-gpt-4o-audio-preview-2024-12-17', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-audio-preview-2024-12-17","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-audio-preview-2025-06-03', 'openai-gpt-4o-audio-preview-2025-06-03', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-audio-preview-2025-06-03","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini', 'openai-gpt-4o-mini', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-2024-07-18', 'openai-gpt-4o-mini-2024-07-18', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-2024-07-18","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-audio-preview', 'openai-gpt-4o-mini-audio-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-audio-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-audio-preview-2024-12-17', 'openai-gpt-4o-mini-audio-preview-2024-12-17', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-audio-preview-2024-12-17","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-realtime-preview', 'openai-gpt-4o-mini-realtime-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-realtime-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-realtime-preview-2024-12-17', 'openai-gpt-4o-mini-realtime-preview-2024-12-17', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-realtime-preview-2024-12-17","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-search-preview', 'openai-gpt-4o-mini-search-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-search-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-search-preview-2025-03-11', 'openai-gpt-4o-mini-search-preview-2025-03-11', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-search-preview-2025-03-11","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-transcribe', 'openai-gpt-4o-mini-transcribe', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-transcribe","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-mini-tts', 'openai-gpt-4o-mini-tts', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-mini-tts","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-realtime-preview', 'openai-gpt-4o-realtime-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-realtime-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-realtime-preview-2024-10-01', 'openai-gpt-4o-realtime-preview-2024-10-01', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-realtime-preview-2024-10-01","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-realtime-preview-2024-12-17', 'openai-gpt-4o-realtime-preview-2024-12-17', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-realtime-preview-2024-12-17","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-realtime-preview-2025-06-03', 'openai-gpt-4o-realtime-preview-2025-06-03', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-realtime-preview-2025-06-03","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-search-preview', 'openai-gpt-4o-search-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-search-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-search-preview-2025-03-11', 'openai-gpt-4o-search-preview-2025-03-11', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-search-preview-2025-03-11","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4o-transcribe', 'openai-gpt-4o-transcribe', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4o-transcribe","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4-turbo', 'openai-gpt-4-turbo', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4-turbo","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4-turbo-2024-04-09', 'openai-gpt-4-turbo-2024-04-09', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4-turbo-2024-04-09","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-4-turbo-preview', 'openai-gpt-4-turbo-preview', 'Owned by: system', true, '{"api_identifier":"openai-gpt-4-turbo-preview","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5', 'openai-gpt-5', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5","context_window_tokens":400000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":400000,"provider_max_output_tokens":4096}', 'openai', true, false),
  ('OpenAI gpt-5-2025-08-07', 'openai-gpt-5-2025-08-07', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-2025-08-07","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5-chat-latest', 'openai-gpt-5-chat-latest', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-chat-latest","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5-mini', 'openai-gpt-5-mini', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-mini","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5-mini-2025-08-07', 'openai-gpt-5-mini-2025-08-07', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-mini-2025-08-07","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5-nano', 'openai-gpt-5-nano', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-nano","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-5-nano-2025-08-07', 'openai-gpt-5-nano-2025-08-07', 'Owned by: system', true, '{"api_identifier":"openai-gpt-5-nano-2025-08-07","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-audio', 'openai-gpt-audio', 'Owned by: system', true, '{"api_identifier":"openai-gpt-audio","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-audio-2025-08-28', 'openai-gpt-audio-2025-08-28', 'Owned by: system', true, '{"api_identifier":"openai-gpt-audio-2025-08-28","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-image-1', 'openai-gpt-image-1', 'Owned by: system', true, '{"api_identifier":"openai-gpt-image-1","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-realtime', 'openai-gpt-realtime', 'Owned by: system', true, '{"api_identifier":"openai-gpt-realtime","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI gpt-realtime-2025-08-28', 'openai-gpt-realtime-2025-08-28', 'Owned by: system', true, '{"api_identifier":"openai-gpt-realtime-2025-08-28","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI text-embedding-3-large', 'openai-text-embedding-3-large', 'Owned by: system', true, '{"api_identifier":"openai-text-embedding-3-large","context_window_tokens":8191,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":8191,"provider_max_output_tokens":4096}', 'openai', false, true),
  ('OpenAI text-embedding-3-small', 'openai-text-embedding-3-small', 'Owned by: system', true, '{"api_identifier":"openai-text-embedding-3-small","context_window_tokens":8191,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":8191,"provider_max_output_tokens":4096}', 'openai', false, false),
  ('OpenAI text-embedding-ada-002', 'openai-text-embedding-ada-002', 'Owned by: openai-internal', true, '{"api_identifier":"openai-text-embedding-ada-002","context_window_tokens":128000,"input_token_cost_rate":1,"tokenization_strategy":{"type":"tiktoken","is_chatml_model":true,"tiktoken_encoding_name":"cl100k_base","api_identifier_for_tokenization":"gpt-4o"},"hard_cap_output_tokens":4096,"output_token_cost_rate":1,"provider_max_input_tokens":128000,"provider_max_output_tokens":4096}', 'openai', false, false)
ON CONFLICT (api_identifier) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  is_active            = EXCLUDED.is_active,
  config               = EXCLUDED.config,
  provider             = EXCLUDED.provider,
  is_enabled           = EXCLUDED.is_enabled,
  is_default_embedding = EXCLUDED.is_default_embedding;

-- END AI PROVIDERS

-- Enable realtime for the notifications table
alter publication supabase_realtime add table notifications;
