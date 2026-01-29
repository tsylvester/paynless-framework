# Processor Requirements vs Planner Outputs - COMPREHENSIVE Field Mapping

## Executive Summary

This document provides a **complete field-by-field mapping** of:
1. **ALL fields** that processors check for, use, or reference from `job.payload`
2. **ALL fields** that each planner actually sets in child job payloads  
3. **Complete gap analysis** mapping every field across all processor-planner combinations

---

## Part 1: Complete Field Inventory

### 1.1 Fields from GenerateContributionsPayload (Base)

**Source:** `DialecticBaseJobPayload extends Omit<GenerateContributionsPayload, 'selectedModelIds' | 'chatId'>`

Inherited fields:
- `sessionId` (string)
- `projectId` (string)
- `stageSlug` (string | undefined)
- `iterationNumber` (number | undefined)
- `walletId` (string)
- `continueUntilComplete` (boolean | undefined)
- `maxRetries` (number | undefined)
- `continuation_count` (number | undefined)
- `target_contribution_id` (string | undefined)
- `user_jwt` (string | undefined)
- `is_test_job` (boolean | undefined)

**Excluded from Base:**
- `selectedModelIds` (excluded)
- `chatId` (excluded)

### 1.2 Fields Added by DialecticBaseJobPayload

- `model_id` (string) - Required
- `sourceContributionId` (string | null | undefined) - Optional

### 1.3 Fields Added by DialecticExecuteJobPayload

- `job_type` ('execute') - Required
- `prompt_template_id` (string) - Required
- `output_type` (ModelContributionFileTypes) - Required
- `canonicalPathParams` (CanonicalPathParams) - Required
- `inputs` (Record<string, string | string[]>) - Required
- `document_key` (string | null | undefined) - Optional
- `branch_key` (string | null | undefined) - Optional
- `parallel_group` (number | null | undefined) - Optional
- `planner_metadata` (DialecticStepPlannerMetadata | null | undefined) - Optional
- `document_relationships` (DocumentRelationships | null | undefined) - Optional
- `isIntermediate` (boolean | undefined) - Optional

### 1.4 Fields NOT in Type Definitions but Used by Processors

- `model_slug` (string) - **Used by processors but NOT in type definition**
- `header_context_resource_id` (string) - **Used by processors**
- `document_specific_data` (Record<string, unknown>) - **Used by assembleTurnPrompt**
- `step_info` (deprecated) - **Forbidden, throws error if present**

---

## Part 2: Processor Field Requirements - Complete Map

### 2.1 `assemblePlannerPrompt` - Field Requirements

**Location:** `supabase/functions/_shared/prompt-assembler/assemblePlannerPrompt.ts`

| Field | Required? | Type | Usage | Line Reference |
|-------|-----------|------|-------|----------------|
| `model_id` | ✅ **REQUIRED** | string | Precondition check, DB query | 47-48, 95 |
| `model_slug` | ✅ **REQUIRED** | string | Precondition check, file upload path | 50-51, 140 |
| `step_info` | ❌ **FORBIDDEN** | any | Throws error if present | 33-40 |
| `payload` (object) | ✅ **REQUIRED** | Record | Must be a valid object | 42-45 |

**Context Fields (NOT in payload, but required):**
- `session.selected_model_ids` - Must have at least one (27-30)
- `stage.recipe_step` - Must exist (53-55)
- `stage.recipe_step.prompt_template_id` - Must exist (63-67)
- `project.initial_user_prompt` - Must be string (56-60)

**Fields Referenced But NOT Checked (may exist):**
- `job.target_contribution_id` - Used as `sourceContributionId` for file upload (108)

---

### 2.2 `assembleTurnPrompt` - Field Requirements

**Location:** `supabase/functions/_shared/prompt-assembler/assembleTurnPrompt.ts`

| Field | Required? | Type | Usage | Line Reference |
|-------|-----------|------|-------|----------------|
| `payload` (object) | ✅ **REQUIRED** | Record | Must be a valid object | 35-38 |
| `model_id` | ✅ **REQUIRED** | string | Precondition check, DB query | 55-56, 66 |
| `model_slug` | ✅ **REQUIRED** | string | Precondition check, file upload path | 156-157, 184 |
| `header_context_resource_id` | ✅ **REQUIRED** | string | Precondition check, downloaded from storage | 47-50, 78-86 |
| `document_key` | ✅ **REQUIRED** | string | Precondition check, finds document in header | 52-53, 111-119 |
| `document_specific_data` | ⚠️ **OPTIONAL** | Record | Merged into render context if present | 143-145 |
| `target_contribution_id` | ⚠️ **OPTIONAL** | string | Used as `sourceContributionId` for file upload | 161-175 |
| `step_info` | ❌ **FORBIDDEN** | any | Throws error if present | 40-45 |

**Context Fields (NOT in payload, but required):**
- `session.selected_model_ids` - Must have at least one (30-33)
- `stage.recipe_step` - Must exist (58-60)

---

### 2.3 `assembleContinuationPrompt` - Field Requirements

**Location:** `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts`

| Field | Required? | Type | Usage | Line Reference |
|-------|-----------|------|-------|----------------|
| `payload` (object) | ✅ **REQUIRED** | Record | Must be a valid object | 58-59 |
| `model_id` | ✅ **REQUIRED** | string | Precondition check, DB query | 61-62, 69 |
| `model_slug` | ⚠️ **OPTIONAL** | string | Defaults to `"unknown-model"` if missing | 124-126, 150 |
| `header_context_resource_id` | ⚠️ **OPTIONAL** | string | Downloaded if present | 82-106 |
| `target_contribution_id` | ⚠️ **OPTIONAL** | string | Used as `sourceContributionId` if present | 129-134 |
| `document_key` | ⚠️ **OPTIONAL** | string | Used in file upload path if present | 151-153 |

**Context Fields (NOT in payload, but required):**
- `continuationContent` - Must be non-empty string (49-52)
- `session.selected_model_ids` - Must have at least one (55-57)

---

### 2.4 `assembleSeedPrompt` - Field Requirements

**Location:** `supabase/functions/_shared/prompt-assembler/assembleSeedPrompt.ts`

**No payload required** - This processor doesn't receive a job (called when `options.job` is `undefined` or `null`)

---

## Part 3: Planner Outputs - Complete Field Map

### 3.1 `planAllToOne` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 46 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 47 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 48 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 49 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 50 |
| `output_type` | ✅ | From `recipeStep.output_type` | 51 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 52 |
| `sourceContributionId` | ✅ | Set to `anchorDocument.id` | 53 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 55 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 56 |
| `inputs` | ✅ | Object with `document_ids` array | 57-59 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 60 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 61 |
| `model_slug` | ❌ | **NOT SET** | - |
| `user_jwt` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_relationships` | ❌ | **NOT SET** | - |
| `isIntermediate` | ❌ | **NOT SET** | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

### 3.2 `planPerSourceDocument` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 96 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 97 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 98 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 99 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 100 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 103 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 104 |
| `output_type` | ✅ | From `recipeStep.output_type` | 105 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 106 |
| `document_relationships` | ✅ | `{ source_group: doc.id }` | 107 |
| `inputs` | ✅ | Dynamic object based on doc contribution_type | 86-89, 108 |
| `user_jwt` | ✅ | Explicitly extracted from parent job payload | 31-40, 109 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 110 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 111 |
| `sourceContributionId` | ⚠️ | Conditionally set via `deriveSourceContributionId()` | 113-119 |
| `model_slug` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `isIntermediate` | ❌ | **NOT SET** | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

### 3.3 `planPerSourceDocumentByLineage` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 70 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 71 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 72 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 73 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 78 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 74 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 75 |
| `output_type` | ✅ | From `recipeStep.output_type` | 76 |
| `isIntermediate` | ✅ | `recipeStep.output_type !== FileType.Synthesis` | 77 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 60, 79 |
| `inputs` | ✅ | Object with `${anchorDoc.contribution_type}_ids` array | 80-83 |
| `document_relationships` | ✅ | `{ source_group: groupId }` | 84-86 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 87 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 88 |
| `sourceContributionId` | ⚠️ | Conditionally set (Line 61-64) | 89 |
| `model_slug` | ❌ | **NOT SET** | - |
| `user_jwt` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

### 3.4 `planPerSourceGroup` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 56 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 57 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 58 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 59 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 60 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 63 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 64 |
| `output_type` | ✅ | From `recipeStep.output_type` | 65 |
| `isIntermediate` | ✅ | `recipeStep.output_type !== FileType.Synthesis` | 71 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 66 |
| `document_relationships` | ✅ | `{ source_group: groupId }` | 67 |
| `inputs` | ✅ | Object with `document_ids` array | 68-70 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 72 |
| `sourceContributionId` | ✅ | Set to `anchorDoc.id` | 73 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 74 |
| `model_slug` | ❌ | **NOT SET** | - |
| `user_jwt` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

### 3.5 `planPairwiseByOrigin` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 93 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 94 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 95 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 96 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 97 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 100 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 101 |
| `output_type` | ✅ | From `recipeStep.output_type` | 102 |
| `isIntermediate` | ✅ | Hardcoded to `true` | 108 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 64-69, 104 |
| `document_relationships` | ✅ | Object with thesis/antithesis IDs and `source_group` | 77-83, 86, 106 |
| `inputs` | ✅ | Object with `${doc.contribution_type}_id` fields | 76-81, 107 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 109 |
| `sourceContributionId` | ✅ | Set to `antithesisDoc.id` | 110 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 111 |
| `model_slug` | ❌ | **NOT SET** | - |
| `user_jwt` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

### 3.6 `planPerModel` - Complete Field Map

**Location:** `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts`

| Field | Set? | Source/Value | Line Reference |
|-------|------|--------------|----------------|
| `projectId` | ✅ | Inherited from `parentJob.payload.projectId` | 77 |
| `sessionId` | ✅ | Inherited from `parentJob.payload.sessionId` | 78 |
| `stageSlug` | ✅ | Inherited from `parentJob.payload.stageSlug` | 79 |
| `iterationNumber` | ✅ | Inherited from `parentJob.payload.iterationNumber` | 80 |
| `model_id` | ✅ | Inherited from `parentJob.payload.model_id` | 81 |
| `job_type` | ✅ | Hardcoded to `'execute'` | 84 |
| `prompt_template_id` | ✅ | From `recipeStep.prompt_template_id` | 85 |
| `output_type` | ✅ | From `recipeStep.output_type` | 86 |
| `canonicalPathParams` | ✅ | Created by `createCanonicalPathParams()` | 55-60, 87 |
| `document_relationships` | ✅ | `{ synthesis_group: synthesisDocIds.join(',') }` | 64-66, 88 |
| `inputs` | ✅ | Object with `synthesis_ids` | 68-70, 89 |
| `sourceContributionId` | ⚠️ | Conditionally set (Line 51-54) | 90 |
| `walletId` | ✅ | Inherited from `parentJob.payload.walletId` | 91 |
| `planner_metadata` | ✅ | `{ recipe_step_id: recipeStep.id }` | 92 |
| `model_slug` | ❌ | **NOT SET** | - |
| `user_jwt` | ❌ | **NOT SET** | - |
| `header_context_resource_id` | ❌ | **NOT SET** (N/A for planner) | - |
| `document_key` | ❌ | **NOT SET** (N/A for planner) | - |
| `isIntermediate` | ❌ | **NOT SET** | - |
| `document_specific_data` | ❌ | **NOT SET** | - |
| `target_contribution_id` | ❌ | **NOT SET** | - |
| `branch_key` | ❌ | **NOT SET** | - |
| `parallel_group` | ❌ | **NOT SET** | - |
| `continueUntilComplete` | ❌ | **NOT SET** | - |
| `maxRetries` | ❌ | **NOT SET** | - |
| `continuation_count` | ❌ | **NOT SET** | - |
| `is_test_job` | ❌ | **NOT SET** | - |

---

## Part 4: Complete Gap Analysis Matrix

### 4.1 `assemblePlannerPrompt` ← All Planners Gap Analysis

| Field | Required? | planAllToOne | planPerSourceDocument | planPerSourceDocumentByLineage | planPerSourceGroup | planPairwiseByOrigin | planPerModel |
|-------|-----------|--------------|----------------------|-------------------------------|-------------------|---------------------|--------------|
| `model_id` | ✅ **REQUIRED** | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED |
| `model_slug` | ✅ **REQUIRED** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** |
| `step_info` | ❌ **FORBIDDEN** | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET |
| `payload` (object) | ✅ **REQUIRED** | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED |

**Summary:**
- ✅ All planners provide `model_id`
- ❌ **ALL 6 PLANNERS MISSING `model_slug`** ⚠️ **CRITICAL BLOCKER**

---

### 4.2 `assembleTurnPrompt` ← Planners Gap Analysis

**Note:** Planners should NOT route to `assembleTurnPrompt` after routing fix (they route to `assemblePlannerPrompt`). This table shows what would be missing if incorrectly routed.

| Field | Required? | planAllToOne | planPerSourceDocument | planPerSourceDocumentByLineage | planPerSourceGroup | planPairwiseByOrigin | planPerModel |
|-------|-----------|--------------|----------------------|-------------------------------|-------------------|---------------------|--------------|
| `model_id` | ✅ **REQUIRED** | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED |
| `model_slug` | ✅ **REQUIRED** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** |
| `header_context_resource_id` | ✅ **REQUIRED** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** |
| `document_key` | ✅ **REQUIRED** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** |
| `document_specific_data` | ⚠️ **OPTIONAL** | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET |
| `target_contribution_id` | ⚠️ **OPTIONAL** | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET |
| `step_info` | ❌ **FORBIDDEN** | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET |

**Summary:**
- ✅ With routing fix, planners will correctly route to `assemblePlannerPrompt`, not `assembleTurnPrompt`
- ✅ Missing fields are **expected** for planner outputs (not applicable)

---

### 4.3 `assembleContinuationPrompt` ← Planners Gap Analysis

**Note:** Planners don't create continuation jobs. This table shows compatibility if continuation were attempted.

| Field | Required? | planAllToOne | planPerSourceDocument | planPerSourceDocumentByLineage | planPerSourceGroup | planPairwiseByOrigin | planPerModel |
|-------|-----------|--------------|----------------------|-------------------------------|-------------------|---------------------|--------------|
| `model_id` | ✅ **REQUIRED** | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED | ✅ PROVIDED |
| `model_slug` | ⚠️ **OPTIONAL** | ❌ NOT SET (defaults to "unknown-model") | ❌ NOT SET (defaults to "unknown-model") | ❌ NOT SET (defaults to "unknown-model") | ❌ NOT SET (defaults to "unknown-model") | ❌ NOT SET (defaults to "unknown-model") | ❌ NOT SET (defaults to "unknown-model") |
| `header_context_resource_id` | ⚠️ **OPTIONAL** | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET |
| `target_contribution_id` | ⚠️ **OPTIONAL** | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET |
| `document_key` | ⚠️ **OPTIONAL** | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET | ❌ NOT SET |

**Summary:**
- ✅ All required fields provided
- ⚠️ Optional fields missing but acceptable (processor handles defaults)

---

## Part 5: All Fields - Complete Coverage Matrix

### 5.1 Complete Field Coverage Across All Planners

| Field | planAllToOne | planPerSourceDocument | planPerSourceDocumentByLineage | planPerSourceGroup | planPairwiseByOrigin | planPerModel | Required By Processor? |
|-------|--------------|----------------------|-------------------------------|-------------------|---------------------|--------------|----------------------|
| **Base Payload Fields** |
| `projectId` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Inherited from base |
| `sessionId` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Inherited from base |
| `stageSlug` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Inherited from base |
| `iterationNumber` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Inherited from base |
| `walletId` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Inherited from base |
| `model_id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ assemblePlannerPrompt, assembleTurnPrompt, assembleContinuationPrompt |
| `sourceContributionId` | ✅ | ⚠️ (conditional) | ⚠️ (conditional) | ✅ | ✅ | ⚠️ (conditional) | Optional in base |
| **Execute Job Payload Fields** |
| `job_type` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for execute jobs |
| `prompt_template_id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for execute jobs |
| `output_type` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for execute jobs |
| `canonicalPathParams` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for execute jobs |
| `inputs` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for execute jobs |
| `planner_metadata` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Required for recipe step resolution |
| `document_relationships` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | Optional in execute jobs |
| `isIntermediate` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | Optional in execute jobs |
| `document_key` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ assembleTurnPrompt only |
| `branch_key` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Optional in execute jobs |
| `parallel_group` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Optional in execute jobs |
| `user_jwt` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Optional in execute jobs |
| **Processor-Specific Required Fields** |
| `model_slug` | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ❌ **MISSING** | ✅ assemblePlannerPrompt, assembleTurnPrompt |
| `header_context_resource_id` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ assembleTurnPrompt only |
| `document_specific_data` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ assembleTurnPrompt (optional) |
| `target_contribution_id` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ assembleTurnPrompt, assembleContinuationPrompt (optional) |
| **Forbidden Fields** |
| `step_info` | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ✅ NOT SET | ❌ Forbidden (deprecated) |
| **Unused Fields (not checked by processors)** |
| `continueUntilComplete` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Not checked by processors |
| `maxRetries` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Not checked by processors |
| `continuation_count` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Not checked by processors |
| `is_test_job` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Not checked by processors |

---

## Part 6: Critical Gaps Summary

### 6.1 Critical Missing Fields (Block Processors)

#### 6.1.1 `model_slug` - **CRITICAL BLOCKER**

**Status:** ❌ **MISSING FROM ALL 6 PLANNERS**

**Required By:**
- ✅ `assemblePlannerPrompt` - **REQUIRED** (precondition check + file upload path)
- ✅ `assembleTurnPrompt` - **REQUIRED** (precondition check + file upload path)
- ⚠️ `assembleContinuationPrompt` - **OPTIONAL** (defaults to `"unknown-model"`)

**Impact:**
- When planner child jobs route to `assemblePlannerPrompt` (after routing fix), they will **FAIL** with: `PRECONDITION_FAILED: Job payload is missing model_slug.`
- This is the **immediate blocker** preventing the routing fix from working.

**Fix Required:**
1. Update `generateContributions` to fetch model name from `ai_providers` and include `model_slug: model.name` in parent PLAN job payload
2. Update all 6 planners to inherit: `model_slug: parentJob.payload.model_slug`

---

### 6.2 Non-Critical Missing Fields (Expected/Not Applicable)

#### 6.2.1 `header_context_resource_id` - ✅ **EXPECTED TO BE MISSING**

**Status:** ❌ Missing from all planners (but this is **correct**)

**Required By:**
- ✅ `assembleTurnPrompt` - **REQUIRED** for turn jobs (not planner jobs)
- ❌ `assemblePlannerPrompt` - **NOT REQUIRED** (planner jobs don't need header context)

**Impact:** None - Planner outputs should NOT include this field.

---

#### 6.2.2 `document_key` - ✅ **EXPECTED TO BE MISSING**

**Status:** ❌ Missing from all planners (but this is **correct**)

**Required By:**
- ✅ `assembleTurnPrompt` - **REQUIRED** for turn jobs (not planner jobs)
- ❌ `assemblePlannerPrompt` - **NOT REQUIRED** (planner jobs don't need document_key)

**Impact:** None - Planner outputs should NOT include this field.

---

### 6.3 Optional Missing Fields (Not Blockers)

#### 6.3.1 `user_jwt` - ⚠️ **PARTIAL COVERAGE**

**Status:**
- ✅ `planPerSourceDocument` - **PROVIDES** `user_jwt`
- ❌ All other planners - **MISSING**

**Required By:**
- ⚠️ None of the processors explicitly require `user_jwt` in payload checks

**Impact:** Not a blocker for processors, but may be needed for downstream processing.

**Recommendation:** Consider standardizing all planners to inherit `user_jwt` if present in parent job for consistency.

---

#### 6.3.2 `document_relationships` - ⚠️ **PARTIAL COVERAGE**

**Status:**
- ❌ `planAllToOne` - **MISSING**
- ✅ All other planners - **PROVIDE**

**Required By:**
- ⚠️ None of the processors explicitly check for `document_relationships`

**Impact:** Not a blocker, but may be used by downstream processing.

---

#### 6.3.3 `isIntermediate` - ⚠️ **PARTIAL COVERAGE**

**Status:**
- ❌ `planAllToOne` - **MISSING**
- ❌ `planPerSourceDocument` - **MISSING**
- ❌ `planPerModel` - **MISSING**
- ✅ `planPerSourceDocumentByLineage` - **PROVIDES** (Line 77)
- ✅ `planPerSourceGroup` - **PROVIDES** (Line 71)
- ✅ `planPairwiseByOrigin` - **PROVIDES** (Line 108, hardcoded to `true`)

**Required By:**
- ⚠️ None of the processors explicitly check for `isIntermediate`

**Impact:** Not a blocker, but may be used by downstream processing.

---

## Part 7: Implementation Checklist - Complete

### Step 1: Update Parent Job Creation
- [ ] **File:** `supabase/functions/dialectic-service/generateContribution.ts`
- [ ] **Action:** For each `modelId` in `selectedModelIds`, fetch model from `ai_providers` table
- [ ] **Action:** Extract `name` field from model record
- [ ] **Action:** Add `model_slug: model.name` to `jobPayload` before inserting job
- [ ] **Line Reference:** Around line 127-133 where `jobPayload` is constructed

### Step 2: Update All 6 Planners - Add `model_slug`

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 44-62)

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 94-112)

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 69-90)

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 54-75)

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 91-112)

- [ ] **File:** `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts`
  - **Action:** Add `model_slug: parentJob.payload.model_slug` to `newPayload` object (around line 75-93)

### Step 3: Optional Standardization (Recommended But Not Blocking)

- [ ] **Consider:** Standardize `user_jwt` inheritance across all planners
  - `planPerSourceDocument` already provides it
  - Other planners could inherit: `user_jwt: parentJob.payload.user_jwt` (if present)

- [ ] **Consider:** Standardize `isIntermediate` across all planners
  - Some planners provide it, others don't
  - Could use: `isIntermediate: recipeStep.output_type !== FileType.Synthesis`

- [ ] **Consider:** Add `document_relationships` to `planAllToOne` for consistency
  - All other planners provide it

### Step 4: Validation
- [ ] Run tests for all 6 planners to ensure `model_slug` is present in output
- [ ] Run integration test to verify planner child jobs can successfully call `assemblePlannerPrompt`
- [ ] Verify no linter errors

---

## Part 8: Summary

**Critical Blocker:**
- ❌ **ALL 6 planners are missing `model_slug`**, which is **REQUIRED** by `assemblePlannerPrompt`
- ❌ Parent PLAN jobs don't include `model_slug` in their payload

**Required Fix:**
1. Update `generateContributions` to fetch and include `model_slug` in parent PLAN job payloads
2. Update all 6 planners to inherit `model_slug` from parent job payload

**Result:**
- ✅ Planner child jobs will have `model_slug`, enabling successful routing to `assemblePlannerPrompt`
- ✅ All other processor requirements are met or not applicable for planner outputs

**Field Coverage Summary:**
- ✅ **20+ fields** properly provided by planners
- ❌ **1 field** (`model_slug`) missing and **blocking** `assemblePlannerPrompt`
- ⚠️ **3 fields** (`user_jwt`, `document_relationships`, `isIntermediate`) missing from some planners but not blockers

