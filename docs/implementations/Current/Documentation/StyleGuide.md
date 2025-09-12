# Document & Implementation Checklists Style Guide

This guide defines the canonical, model-facing formatting and content rules for structured planning and implementation artifacts. It is injected into prompts for stages that produce plans and checklists (primarily Parenthesis/Planning and Paralysis/Implementation) and must be followed exactly.

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
- Control flags (top-level JSON fields when requested by the prompt):
  - continuation_needed: boolean
  - stop_reason: "continuation" | "token_limit" | "complete"
  - resume_cursor: { document_key: string, section_id?: string, line_hint?: number }

Example control flags:
```json
{
  "continuation_needed": true,
  "stop_reason": "continuation",
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

## 5. TDD Sequencing
Enforce RED → Implement → GREEN → Refactor, and label steps accordingly.

Micro-example:
```markdown
*   `[ ]` 1. [BE] Implement `functions/profile.ts` for profile creation in `supabase/functions`
    *   `[ ]` a. [TEST-UNIT] Write failing tests for `profile.ts` (RED)
        *   `[ ]` i. Define test cases for required fields
*   `[ ]` b. [BE] Implement service logic for `createProfile` in `profile.ts` (GREEN)
        *   `[ ]` i. Persist to DB; return created profile
*   `[ ]` c. [REFACTOR] Improve naming and extract helpers
    (...)
*   `[ ]` n. [COMMIT] feat(be): add and test `createProfile` in `profile.ts`
```

## 6. Master Plan & Milestones
- A persistent, high-level Master Plan drives iterative generation of low-level implementation checklists.
- Milestone schema fields:
  - id, title, objective, dependencies[], acceptance_criteria[], status (`[ ]`, `[🚧]`, `[✅]`)
- Organize Master Plan as phases → milestones; ensure dependency ordering.
- Do not delve into low-level individual work steps in a Master Plan or Milestones. 

Micro-example (milestone):
```markdown
*   `[ ]` 1. [BE] Milestone 1: Subscription Edge Functions
    *   `[ ]` a. Objective: establish Stripe integration baseline
    *   `[ ]` b. Dependencies: none
    *   `[ ]` c. Acceptance criteria:
        *   `[ ]` i. Test keys configured; healthcheck passes
        *   `[ ]` ii. Stripe client injectable via DI
*   `[ ]` 2. [API] Milestone 2: Subscription API 
    *   `[ ]` ...
*   `[ ]` 3. [STORE] Milestone 3: Subscription Store
    *   `[ ]` ... 
*   `[ ]` 4. [UI] Milestone 4: User Interface for Subscriptions
```

## 7. Implementation Checklists
- Extreme detail; no summarization. Each step includes Inputs, Outputs, Validation.
- Use 1/a/i numbering and component labels.
- One-file-per-step prompts when possible; prefer explicit filenames/paths.
- Respect sizing & continuation policy (Section 3).

Micro-example (low-level extract):
```markdown
*   `[ ]` 1. [DB] Create `subscriptions` table
    *   `[ ]` a. Inputs: schema decisions from TRD
    *   `[ ]` b. Outputs: migration file `supabase/migrations/xxxx_create_subscriptions.sql`
    *   `[ ]` c. Validation: migration applied; table introspected; unit test passes
    *   `[ ]` d. [TEST-UNIT] Write migration test (RED)
        *   `[ ]` i. Assert table and columns exist with correct types
    *   `[ ]` e. [DB] Implement migration (GREEN)
    *   `[ ]` f. [TEST-UNIT] Re-run tests (GREEN)
    *   `[ ]` g. [COMMIT] feat(db): add subscriptions table
```

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

## 11. Stage Application Map (Which sections apply per stage)

This map documents which parts of the Style Guide to embed into prompts per dialectic stage. These selections are injected as `style_guide_markdown` in the corresponding overlays.

- Universal (all stages)
  - § 1. Purpose & Scope
  - § 3. Continuation
  - § 8. Prohibited 

- Thesis (Proposal)
  - § 1. Purpose & Scope
  - § 2.b. Documents
  - § 3. Continuation
  - § 8. Prohibited
  - § 9.b. Document Validation

- Antithesis (Review)
  - § 1. Purpose & Scope
  - § 2.b. Documents
  - § 3. Continuation
  - § 8. Prohibited
  - § 9.b. Document Validation

- Synthesis (Refinement)
  - § 1. Purpose & Scope
  - § 2.b. Documents
  - § 3. Continuation
  - § 8. Prohibited
  - § 9.b. Document Validation

- Parenthesis (Planning)
  - § 1. Purpose & Scope
  - § 2.a. Checklists  
  - § 2.b. Documents
  - § 3. Continuation
  - § 4. Formatting
  - § 6. Master Plan & Milestones
  - § 8. Prohibited
  - § 9.a. Checklist Validation 
  - § 9.b. Document Validation
  - § 10.a. Milestone Skeleton

- Paralysis (Implementation)
  - § 1. Purpose & Scope
  - § 2.a. Checklists
  - § 3. Continuation
  - § 4. Formatting
  - § 5. TDD Sequencing
  - § 6. Master Plan & Milestone
  - § 7. Implementation Checklists
  - § 8. Prohibited
  - § 9.a. Checklist Validation  
  - § 10.a. Milestone Skeleton 
  - § 10.b. Checklist Skeleton
