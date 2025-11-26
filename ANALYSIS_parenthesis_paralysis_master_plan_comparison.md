# Cross-Stage Synchronization Analysis: Parenthesis → Paralysis Master Plan

## Problem Statement
The paralysis stage's `updated_master_plan` document **UPDATES** the `master_plan` document from the parenthesis stage. The paralysis stage does NOT recreate the document wholesale - it updates only the fields that CHANGE. We need to identify which fields actually change during the update operation and ensure they are properly included in the paralysis structure.

**Key Understanding**: 
- Parenthesis stage **CREATES** the master_plan (defines full structure)
- Paralysis stage **UPDATES** the master_plan (only modifies changing fields)
- Fields that DON'T change are preserved from the original document
- Fields that DO change must be in `content_to_include` and `assembled_json`

## Comparison: Parenthesis master_plan vs Paralysis updated_master_plan

### 1. PARENTHESIS Stage: master_plan Structure (EXECUTE Step)

#### Document Level Fields (`content_to_include` at document root):
- `index`: []
- `phases`: [array of phase objects]
- `status_summary`: {completed: [], in_progress: [], up_next: []}
- `status_markers`: {unstarted: "[ ]", in_progress: "[🚧]", completed: "[✅]"}
- `dependency_rules`: []
- `generation_limits`: {max_steps: 200, target_steps: "120-180", max_output_lines: "600-800"}
- `feature_scope`: []
- `features`: []
- `mvp_description`: ""
- `market_opportunity`: ""
- `competitive_analysis`: ""
- `technical_context`: ""
- `implementation_context`: ""
- `test_framework`: ""
- `component_mapping`: ""
- `architecture_summary`: ""
- `architecture`: ""
- `services`: []
- `components`: []
- `integration_points`: []
- `dependency_resolution`: []
- `frontend_stack`: {}
- `backend_stack`: {}
- `data_platform`: {}
- `devops_tooling`: {}
- `security_tooling`: {}
- `shared_libraries`: []
- `third_party_services`: []
- `executive_summary`: ""

#### Phase Level Fields (within `phases[]`):
- `name`: ""
- `objective`: ""
- `technical_context`: ""
- `implementation_strategy`: ""
- `milestones`: [array of milestone objects]

#### Milestone Level Fields (within `phases[].milestones[]`):
- `id`: ""
- `title`: ""
- `objective`: ""
- `description`: ""
- `technical_complexity`: ""
- `effort_estimate`: ""
- `implementation_approach`: ""
- `test_strategy`: ""
- `component_labels`: []
- `inputs`: []
- `outputs`: []
- `dependencies`: []
- `acceptance_criteria`: []
- `validation`: []
- `status`: "[ ]"
- `coverage_notes`: ""
- `iteration_delta`: ""

### 2. PARALYSIS Stage: updated_master_plan Structure (EXECUTE Step)

#### Document Level Fields (`content_to_include` at document root):
**ONLY HAS:**
- `preserve_completed`: true
- `set_in_progress`: "[🚧]"
- `future_status`: "[ ]"
- `capture_iteration_delta`: true

**MISSING ALL OTHER FIELDS FROM PARENTHESIS!**

#### assembled_json Fields Listed:
**ONLY HAS:**
- `phases[].name`
- `phases[].milestones[].id`
- `phases[].milestones[].status`
- `phases[].milestones[].objective`
- `phases[].milestones[].dependencies`
- `phases[].milestones[].acceptance_criteria`
- `iteration_delta`

**MISSING ALL OTHER MILESTONE FIELDS AND PHASE FIELDS!**

## CRITICAL FINDINGS: What Fields Actually CHANGE in Paralysis?

### Analysis: Update Operation Scope

The paralysis stage updates milestone statuses based on actionable_checklist completion. The fields that CHANGE are:

1. **Milestone-level fields:**
   - `status`: Changes from "[ ]" → "[🚧]" → "[✅]" as milestones are worked on
   - `iteration_delta`: Updated to track what changed in this iteration
   - `coverage_notes`: May be updated with progress notes

2. **Document-level fields:**
   - `status_summary`: The aggregated arrays (completed[], in_progress[], up_next[]) must be RECALCULATED as milestone statuses change

### Fields That DO NOT Change (correctly omitted from paralysis):

All other fields are preserved from the original master_plan and do NOT need to be in the update structure:
- Document-level: index, status_markers, dependency_rules, generation_limits, feature_scope, features, mvp_description, market_opportunity, competitive_analysis, all architecture/tech stack fields, executive_summary
- Phase-level: name, objective, technical_context, implementation_strategy
- Milestone-level: id, title, objective, description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels, inputs, outputs, dependencies, acceptance_criteria, validation

### MISSING FIELD: status_summary

The `status_summary` field aggregates milestone statuses into three arrays:
- `completed[]`: Milestones with status "[✅]"
- `in_progress[]`: Milestones with status "[🚧]"
- `up_next[]`: Milestones with status "[ ]"

**This field MUST be updated** when milestone statuses change, but it's **MISSING** from paralysis assembled_json.

#### Current Paralysis assembled_json Fields:
- `phases[].name`
- `phases[].milestones[].id`
- `phases[].milestones[].status` ✅ (CHANGES)
- `phases[].milestones[].objective` (doesn't change, but needed to read)
- `phases[].milestones[].dependencies` (doesn't change, but needed to read)
- `phases[].milestones[].acceptance_criteria` (doesn't change, but needed to read)
- `iteration_delta` ✅ (CHANGES)

#### MISSING from Paralysis assembled_json:
- `status_summary.completed[]` ❌ (MUST UPDATE)
- `status_summary.in_progress[]` ❌ (MUST UPDATE)
- `status_summary.up_next[]` ❌ (MUST UPDATE)

#### Fields That SHOULD Be in Paralysis but Are MISSING:

#### Document Level (all dropped):
- `index`
- `status_summary` (completed, in_progress, up_next arrays)
- `status_markers` (unstarted, in_progress, completed)
- `dependency_rules`
- `generation_limits`
- `feature_scope`
- `features`
- `mvp_description`
- `market_opportunity`
- `competitive_analysis`
- `technical_context`
- `implementation_context`
- `test_framework`
- `component_mapping`
- `architecture_summary`
- `architecture`
- `services`
- `components`
- `integration_points`
- `dependency_resolution`
- `frontend_stack`
- `backend_stack`
- `data_platform`
- `devops_tooling`
- `security_tooling`
- `shared_libraries`
- `third_party_services`
- `executive_summary`

#### Phase Level (all dropped):
- `objective`
- `technical_context`
- `implementation_strategy`

#### Milestone Level (many dropped):
- `title`
- `description`
- `technical_complexity`
- `effort_estimate`
- `implementation_approach`
- `test_strategy`
- `component_labels`
- `inputs`
- `outputs`
- `coverage_notes`

### Fields ADDED in Paralysis (new, not in Parenthesis):
- `preserve_completed`: true (metadata for update operation)
- `set_in_progress`: "[🚧]" (metadata for update operation)
- `future_status`: "[ ]" (metadata for update operation)
- `capture_iteration_delta`: true (metadata for update operation)

## ISSUES IDENTIFIED

### Issue 1: Missing status_summary in assembled_json
The `status_summary` field is a document-level aggregation that must be updated when milestone statuses change. It's present in Parenthesis assembled_json (lines 1226-1228) but **MISSING** from Paralysis assembled_json.

**Impact**: The system cannot extract/parse the updated status_summary after paralysis updates milestone statuses.

### Issue 2: Content Structure - Does Agent Need Full Structure in content_to_include?

**Key Finding**: The paralysis EXECUTE step `inputs_required` includes:
- `{"type":"document","slug":"parenthesis","document_key":"master_plan","required":true}` (line 619)

This means the agent **RECEIVES the FULL original master_plan document as an INPUT**.

**Question**: If the agent has the full original document as input, does it still need the full structure in `content_to_include`?

**Current State**: The paralysis `updated_master_plan.content_to_include` only contains update operation metadata (preserve_completed, set_in_progress, etc.).

**Analysis Needed**: 
- The turn prompt template (`paralysis_updated_master_plan_turn_v1.md`) has a hardcoded JSON structure
- The `content_to_include` gets merged into `renderContext` (line 295 of assembleTurnPrompt.ts)
- The prompt template references fields with placeholders like `<extract_from_master_plan>`

**Hypothesis**: If the agent receives the original master_plan document as input, it can:
1. Read the full structure from that input document
2. Use that as the template/structure reference
3. Only update fields specified in `content_to_include` (status, status_summary, iteration_delta)
4. Preserve all other fields from the input document

**CRITICAL ISSUE FOUND**: Comparing the turn prompt templates reveals the real problem:

**Parenthesis turn prompt** (`parenthesis_master_plan_turn_v1.md`): Has FULL structure with all fields (status_markers, dependency_rules, generation_limits, all architecture fields, all tech stack fields, etc.)

**Paralysis turn prompt** (`paralysis_updated_master_plan_turn_v1.md`): Has a SIMPLIFIED structure missing many fields:
- Missing: status_markers, dependency_rules, generation_limits, feature_scope, features, mvp_description, market_opportunity, competitive_analysis
- Missing: architecture_summary, architecture, services, components, integration_points, dependency_resolution
- Missing: frontend_stack, backend_stack, data_platform, devops_tooling, security_tooling, shared_libraries, third_party_services

**Root Cause**: The paralysis templates (both turn prompt template AND document template) have incomplete structures:

1. **Turn Prompt Template** (`paralysis_updated_master_plan_turn_v1.md`): Hardcoded JSON structure missing 20+ fields
2. **Document Template** (`paralysis_updated_master_plan.md`): Only has sections for `phases` and `iteration_delta`, missing all other sections

**Key Insight**: Since the agent receives the original master_plan document as INPUT, the agent can read the full structure from that input. The question is:

**Does the agent need the full structure in `content_to_include`?**

**Analysis**:
- `content_to_include` gets merged into `renderContext` (line 295 of assembleTurnPrompt.ts)
- The turn prompt template uses placeholders like `<extract_from_master_plan>` suggesting the agent should read from input
- The document template only has sections for fields it's supposed to render

**User's Point**: If the agent has the original document as input, it should use that structure. The `content_to_include` might only need to specify:
- Update metadata (preserve_completed, set_in_progress, etc.)
- Which fields to UPDATE (status, status_summary, iteration_delta)

**However**, the templates themselves might still need updating:
- Document template should have sections for all fields to preserve them (or explicitly tell agent to preserve from input)
- Turn prompt template's hardcoded structure should match or reference the input document structure

**Solution**: 
1. Keep `content_to_include` minimal (only update metadata + update instructions) since agent has input document
2. Update document template to include all sections from Parenthesis template (to preserve all fields)
3. Update turn prompt template to reference input document structure instead of hardcoded incomplete structure

### Issue 3: Missing Fields in assembled_json for Context
The assembled_json includes `objective`, `dependencies`, and `acceptance_criteria` even though they don't change. This is CORRECT - these fields are needed to READ the original milestone data for context when updating status. However, `status_summary` is missing and needs to be added.

## PROPOSED SOLUTION: Union Synchronization to Prevent Drift

### Approach: Full Structure Preservation + Update Metadata

The `updated_master_plan` must contain:
1. **FULL structure from Parenthesis master_plan** (prevents drift - agent knows what to preserve)
2. **Update metadata fields** (preserve_completed, set_in_progress, future_status, capture_iteration_delta)
3. **Fields that change** must be clearly identifiable in the structure (status, status_summary, iteration_delta)

**Rationale**: The agent needs the complete structure definition so it can:
- Read the original master_plan document
- Know what fields exist and preserve their values
- Only update the fields that change (status, status_summary, iteration_delta)
- Avoid regenerating fields that shouldn't change (preventing drift)

### Required Changes

#### 1. Update Paralysis EXECUTE Step `content_to_include`:
- **ADD**: Full Parenthesis master_plan structure (from lines 1133-1203 of parenthesis migration)
- **UNION**: Combine full structure with existing update metadata fields:
  - All fields from Parenthesis: index, phases[], status_summary, status_markers, dependency_rules, generation_limits, feature_scope, features, mvp_description, market_opportunity, competitive_analysis, technical_context, implementation_context, test_framework, component_mapping, architecture_summary, architecture, services, components, integration_points, dependency_resolution, frontend_stack, backend_stack, data_platform, devops_tooling, security_tooling, shared_libraries, third_party_services, executive_summary
  - All phase-level fields: name, objective, technical_context, implementation_strategy, milestones[]
  - All milestone-level fields: id, title, objective, description, technical_complexity, effort_estimate, implementation_approach, test_strategy, component_labels, inputs, outputs, dependencies, acceptance_criteria, validation, status, coverage_notes, iteration_delta
  - PLUS existing update metadata: preserve_completed, set_in_progress, future_status, capture_iteration_delta

#### 2. Update Paralysis EXECUTE Step `assembled_json` fields:
- **ADD MISSING**: `status_summary.completed[]`, `status_summary.in_progress[]`, `status_summary.up_next[]`
- These fields are updated when milestone statuses change and must be extractable
- Keep existing fields (phases[].name, milestones[].id, .status, .objective, .dependencies, .acceptance_criteria, iteration_delta)

#### 3. Update PLAN Step `context_for_documents`:
- **ADD**: Full Parenthesis master_plan structure to the PLAN step `context_for_documents` entry for `updated_master_plan`
- This ensures the planner knows the full structure that will be preserved
- UNION with existing update metadata fields

## Detailed Field Mapping

### Fields That CHANGE (must be in assembled_json):
- `phases[].milestones[].status` ✅ (already present)
- `iteration_delta` ✅ (already present)
- `status_summary.completed[]` ❌ (MISSING - must add)
- `status_summary.in_progress[]` ❌ (MISSING - must add)
- `status_summary.up_next[]` ❌ (MISSING - must add)

### Fields Needed for Context (don't change but needed to read):
- `phases[].name` ✅ (already present)
- `phases[].milestones[].id` ✅ (already present)
- `phases[].milestones[].objective` ✅ (already present)
- `phases[].milestones[].dependencies` ✅ (already present)
- `phases[].milestones[].acceptance_criteria` ✅ (already present)

### Update Metadata (in content_to_include):
- `preserve_completed` ✅ (already present)
- `set_in_progress` ✅ (already present)
- `future_status` ✅ (already present)
- `capture_iteration_delta` ✅ (already present)

## Next Steps (REVISED Based on User Input Analysis)

**User's Key Insight**: The agent receives the full original master_plan document as input (via `inputs_required`), so it can use that structure directly. The `content_to_include` might not need the full structure - only update metadata.

**Required Changes**:

1. **Add `status_summary` to paralysis EXECUTE step `assembled_json`**: 
   - Add `status_summary.completed[]`, `status_summary.in_progress[]`, `status_summary.up_next[]` fields
   - This is required so the system can extract/parse the updated status_summary

2. **PROMPT INSTRUCTION QUALITY ANALYSIS**:

   **Actual Prompt Instruction** (line 5 of `paralysis_updated_master_plan_turn_v1.md`):
   > "Replace the placeholder structure in the JSON snippet below with fully written JSON derived from and informed by the HeaderContext plus the Master Plan, TRD, Actionable Checklist, and any prior implementation artifacts."

   **Problems with this instruction**:
   - ❌ Says "Replace" - implies generating NEW content rather than preserving existing
   - ❌ Says "derived from and informed by" - vague, doesn't explicitly say PRESERVE unchanged fields
   - ❌ Mentions "Master Plan" (input document) but doesn't say to USE IT AS BASE STRUCTURE
   - ❌ No explicit instruction to PRESERVE unchanged fields verbatim from input document
   - ❌ No explicit instruction that ONLY status, status_summary, and iteration_delta should change
   - ❌ No explicit instruction that all other fields should be COPIED from input master_plan
   - ❌ Hardcoded JSON structure is incomplete (missing 20+ fields) - will cause field loss

   **What the prompt SHOULD say**:
   - ✅ "Use the input Master Plan document as the base structure"
   - ✅ "PRESERVE all unchanged fields verbatim from the input Master Plan"
   - ✅ "ONLY update the following fields: milestone status, status_summary arrays, iteration_delta"
   - ✅ "Copy all other fields exactly as they appear in the input Master Plan"

   **Conclusion**: The prompt instructions are **INADEQUATE** and will cause drift. The agent will regenerate fields instead of preserving them.

3. **FIX Turn Prompt Template Instructions** (`paralysis_updated_master_plan_turn_v1.md`):
   - Add explicit instructions to PRESERVE unchanged fields from input master_plan document
   - Clarify that ONLY status, status_summary, and iteration_delta should be updated
   - Either include full JSON structure matching Parenthesis, OR explicitly instruct agent to use input document structure as base
   - Remove ambiguous "replace" and "derive" language - use clear "preserve" and "update" language

4. **Update Document Template** (`paralysis_updated_master_plan.md`):
   - Currently only has `phases` and `iteration_delta` sections
   - Should include ALL sections from Parenthesis template to preserve all fields
   - OR the prompt should explicitly instruct agent to preserve all sections from input document

