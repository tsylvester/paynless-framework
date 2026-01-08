# Bug Investigation: `document_relationships[stageSlug]` conflates **anchor lineage IDs** with **root contribution IDs**

## Summary
We are debugging a pipeline failure in the Thesis → Antithesis → Synthesis chain where a **seed_prompt resource ID** (an *input* artifact identifier) is being written into `document_relationships[stageSlug]` (a slot that downstream code treats as a **root contribution ID** for produced artifacts).  

This breaks JSON-only artifact assembly and can poison downstream identity lookups (RENDER job `documentIdentity`, continuation chain assembly, and later stage consumption).

This doc captures:
- The intended semantics of `document_relationships`
- The concrete code paths that create the conflation
- The fix requirements (planner + producer-side initialization + audit of other planners)
- A TDD plan (RED tests → GREEN implementation) to prove and resolve the flaw

---

## Key Concepts / Intended Semantics

### Artifact chain: input → produced → consumed
The recipe (e.g. `supabase/migrations/20251006194531_thesis_stage.sql`) shows the intended flow:

- **seed_prompt** (input artifact) is used by the Thesis PLAN step to produce:
- **header_context** (JSON-only produced artifact) which is immediately consumed to produce:
- **markdown documents** (e.g. `business_case`, `feature_spec`, etc.) via EXECUTE steps, then rendered by RENDER jobs.

Each stage consumes products of prior stages, so we need a stable and *correctly typed* identity scheme to:
- lookup artifacts by stage provenance
- correlate multi-model and multi-branch variants
- assemble continuation chains into final artifacts

### Two distinct “IDs” that must not be conflated

#### **Anchor / lineage ID**
Used to answer:
- “What input did this set of outputs come from?”
- “Which alternate outputs are variants of the same source input?”

This is represented by:
- `document_relationships.source_group`: “lineage anchor / grouping id”
- sometimes `payload.sourceContributionId`: the anchor document id used for canonical path construction / lineage.

The anchor is often an **upstream artifact id** (e.g. a seed prompt resource id; a prior-stage rendered document id; a grouping id).

#### **Root contribution ID**
Used to answer:
- “What is the root of this continuation chain of produced contributions that need to be assembled?”

This must be a **dialectic_contributions.id** for the produced artifact chain.

This is represented (by current worker logic) as:
- `document_relationships[stageSlug]`: “documentIdentity / produced artifact identity for the stage”

Downstream code treats `document_relationships[stageSlug]` as:
- the **documentIdentity** used to group chunks for RENDER jobs
- the **rootContributionId** used to assemble JSON-only continuations

---

## Evidence: Where the system currently treats `document_relationships[stageSlug]` as a root contribution id

### JSON assembly requires a dialectic contribution id
`FileManagerService.assembleAndSaveFinalDocument(rootContributionId)` looks up the root by id in `dialectic_contributions`:

- File: `supabase/functions/_shared/services/file_manager.ts`
- Behavior: `.from('dialectic_contributions').eq('id', rootContributionId).single()`
- If missing: throws `Could not find root contribution with ID: ${rootContributionId}`

Therefore `rootContributionId` **must** be a `dialectic_contributions.id`, not a seed prompt id / project resource id.

### `executeModelCallAndSave` uses `document_relationships[stageSlug]` as the candidate rootContributionId for JSON-only artifacts
`executeModelCallAndSave` extracts:
- `rootIdFromSaved = contribution.document_relationships?.[stageSlug]`
- If `!shouldRender` (JSON-only) and `rootIdFromSaved !== contribution.id`, it calls `assembleAndSaveFinalDocument(rootIdFromSaved)`

So for JSON-only artifacts, the stage key is treated as “root-of-chain contribution id”.

### `executeModelCallAndSave` already initializes stage-role identity correctly for **document outputs**
For non-continuation document outputs (markdown documents saved as JSON raw responses), `executeModelCallAndSave` performs “root-only relationship initialization”:
- If `document_relationships[stageSlug]` is missing/empty, set it to `contribution.id` and persist.

This is exactly the “producer sets stage identity post-save” pattern we want.

However, this initialization currently only runs when `isDocumentKey(fileType)` is true, so it does **not** run for JSON-only artifacts like `header_context`.

---

## Evidence: Where the conflation is introduced (the bug)

### `planAllToOne` (PLAN → EXECUTE for header_context) sets the stage-role value to the anchor input id
In the PLAN branch, `planAllToOne` builds the EXECUTE payload for the `header_context` step and sets:

- `sourceContributionId: anchorDocument.id` (OK: anchor)
- `document_relationships: { source_group: anchorDocument.id, [stageSlug]: anchorDocument.id }` (**BUG**: stage key points at anchor)

This writes a seed prompt id (input) into the stage-role slot (produced artifact identity).

This matches observed logs where:
- `payload.document_relationships.thesis === seed_prompt_resource_id`
- later `assembleAndSaveFinalDocument` tries to find that id in `dialectic_contributions` and fails.

---

## Bug Pattern / Scope: Other planners have the same conflation

The following planners assign `document_relationships` in a way that conflates "anchor/group" with "stage identity":

### `planAllToOne.ts`
- **PLAN branch (line 152)**: Sets `document_relationships: { source_group: anchorDocument.id, [stageSlug]: anchorDocument.id }`. **BUG EXISTS**: The stage key is set to `anchorDocument.id`, which is an input artifact identifier (e.g., seed_prompt resource id). This violates the requirement that `document_relationships[stageSlug]` must be a produced artifact's root contribution id.
- **EXECUTE branch (line 278)**: Sets `document_relationships: { source_group: anchorDocument.id, [stageSlug]: anchorDocument.id }`. **BUG EXISTS**: Same conflation as PLAN branch. The stage key is set to the anchor document id (input), not the produced contribution id.

### `planPerSourceDocument.ts`
- **PLAN branch**: Does not set `document_relationships` (only creates PLAN payloads). **NO BUG**: Not applicable.
- **EXECUTE branch (line 285)**: Sets `document_relationships: { source_group: doc.id, [stageSlug]: doc.id }`. **BUG EXISTS**: The stage key is set to `doc.id`, which is a source document id (often a prior-stage contribution id), not the produced artifact's root contribution id. This prevents `executeModelCallAndSave` from initializing `document_relationships[stageSlug] = contribution.id` for root chunks because it sees an existing non-empty value, which contradicts the worker's own root-initialization logic.

### `planPerSourceGroup.ts`
- **PLAN branch**: Does not set `document_relationships` (only creates PLAN payloads). **NO BUG**: Not applicable.
- **EXECUTE branch (lines 244-247)**: Sets `document_relationships: { source_group: groupId, [stageSlug]: groupId }`. **BUG EXISTS**: The stage key is set to `groupId`, which is extracted from `doc.document_relationships?.source_group` (line 162). This is a grouping key for lineage tracking, not a produced artifact's root contribution id. The `groupId` may reference a prior-stage contribution or anchor document, not the contribution that will be produced by this EXECUTE job.

### `planPerSourceDocumentByLineage.ts`
- **PLAN branch**: Does not set `document_relationships` (only creates PLAN payloads). **NO BUG**: Not applicable.
- **EXECUTE branch (lines 265-268)**: Sets `document_relationships: { source_group: groupId, [stageSlug]: groupId }`. **BUG EXISTS**: The stage key is set to `groupId`, which is derived from the source documents' `document_relationships?.source_group` (lines 41-56). This `groupId` is a lineage grouping identifier, not a produced artifact's root contribution id. It may be a prior-stage contribution id or anchor document id, violating the requirement that the stage key must reference the produced contribution chain root.

### `planPairwiseByOrigin.ts`
- **PLAN branch**: Does not set `document_relationships` (only creates PLAN payloads). **NO BUG**: Not applicable.
- **EXECUTE branch (lines 295-296)**: Sets `document_relationships[stageSlug] = anchorDoc.id` where `anchorDoc` is identified as a document whose id appears as `source_group` in other documents (lines 76-80). **BUG EXISTS**: The stage key is set to the anchor document id (an input artifact), not the produced artifact's root contribution id. This conflation breaks JSON-only artifact assembly when `assembleAndSaveFinalDocument` tries to look up the root contribution by this id.

### `planPerModel.ts`
- **PLAN branch**: Does not set `document_relationships` (only creates PLAN payloads). **NO BUG**: Not applicable.
- **EXECUTE branch (lines 204-207)**: Sets `document_relationships: { source_group: anchorDoc.id, [stageSlug]: anchorDoc.id }` where `anchorDoc = sourceDocs[0]` (line 192). **BUG EXISTS**: The stage key is set to `anchorDoc.id`, which is the first source document's id (an input artifact), not the produced artifact's root contribution id. This prevents correct root contribution identity tracking for continuation chains.

**Conclusion**: The pattern "set `[stageSlug]` to the lineage anchor/group id at planning time" appears in all EXECUTE-branch planners and in the PLAN branch of `planAllToOne`. This is incorrect because the worker uses `document_relationships[stageSlug]` as the produced artifact identity/root id (for JSON assembly and RENDER job documentIdentity), which must be a `dialectic_contributions.id`, not an input artifact id or grouping key.

---

## Fix Requirements (What must change)

### 1) Stop setting `document_relationships[stageSlug]` to anchor/group ids in planners for root jobs
Planners should preserve the anchor lineage, but must not populate the stage-role identity slot with an input id:

- **Allowed / expected** in planner output:
  - `document_relationships.source_group = <anchor/group id>`
  - any other non-stage roles needed for lineage grouping

- **Not allowed** in planner output for root jobs:
  - `document_relationships[stageSlug] = <anchor/group id>`

Reason: the stage key is later treated as produced artifact identity/root id.

### 2) Ensure the stage-role identity IS set in the right place (producer-side, post-save) for ALL root chunks (unified system)
**Analysis**: Both JSON-only artifacts and markdown documents use `document_relationships[stageSlug]` for the same semantic purpose: identifying the root contribution id of the produced artifact chain. There is no justification for treating them differently:
- **Documents** (`isDocumentKey(fileType) === true`): Use `document_relationships[stageSlug]` as `documentIdentity` for RENDER job chunk grouping (line 1397)
- **JSON-only artifacts** (`isDocumentKey(fileType) === false`): Use `document_relationships[stageSlug]` as `rootContributionId` for `assembleAndSaveFinalDocument` (line 1614)

Both require the exact same value: `contribution.id` for root chunks.

**Current state**:
- `executeModelCallAndSave` only initializes `document_relationships[stageSlug] = contribution.id` for documents (line 1307: `if (!isContinuationForStorage && isDocumentKey(fileType))`).
- Even for documents, the initialization is guarded by a “missing/empty” check; if a planner pre-populates `document_relationships[stageSlug]` with a non-empty but semantically invalid value (e.g. an anchor/group id), the producer will currently **not** correct it.
- JSON-only root chunks (e.g. `header_context`) never get initialized at all, so they retain the incorrect anchor/input id set by planners.

**Proposed fix** (two-part, “correct at first-write of the produced artifact”):
1. **Planner-side**: do not set `document_relationships[stageSlug]` for root jobs (only set lineage keys like `source_group`). This prevents known-bad values from being written into the stage-role slot in the first place.
2. **Producer-side**: for **all root chunks** (documents and JSON-only artifacts), enforce `document_relationships[stageSlug] = contribution.id` immediately post-save. This is the first point at which the correct value exists, and it guarantees correctness even if some upstream job payload still supplies a non-empty but invalid stage value (e.g. legacy jobs, tests, or other enqueue paths).

Continuation chunks must continue to preserve `document_relationships[stageSlug] = rootContributionId` (already handled at lines 1284–1303).

**Where to implement**: `executeModelCallAndSave` around the existing “Initialize root-only relationships” block (~line 1307):
- Remove the `isDocumentKey(fileType)` restriction so JSON-only root chunks are covered.
- Replace the “missing/empty” gating with an “incorrect-for-root” gating (i.e., ensure the stage-role value equals `contribution.id` for root chunks).

**Rationale for unified approach**:
1. Both artifact types need identical semantics: root contribution identity
2. Eliminates inconsistency that allows the bug to persist for JSON-only artifacts
3. Simpler, more maintainable code (one initialization path instead of two)
4. The `isDocumentKey` check is only needed later for RENDER job validation (line 1358), not for identity initialization

**Alternative considered**: Adding a separate initialization block for JSON-only artifacts. **Rejected** because it duplicates logic and maintains an unnecessary distinction between artifact types that have identical requirements.

### 2.b) Why anchor-based stage identity breaks rendering (and can select the wrong root)
`renderDocument` groups chunks using `document_relationships[stageSlug] === documentIdentity` and selects the root chunk as the one with `target_contribution_id === null`. It does **not** filter by `document_key` when selecting the root.  
Therefore, if multiple documents share the same `documentIdentity` because planners set it to a shared anchor (e.g. `header_context` id), the renderer can select the wrong root chunk and assemble the wrong document chain. This makes it essential that `document_relationships[stageSlug]` be a per-produced-document-chain identity (the root contribution id), not a family-wide anchor.

### 3) Audit and fix other planners proactively
We must scan all planner strategies that set `document_relationships` and ensure:
- `source_group` remains correct for lineage grouping
- stage-role identity is not set to input/group ids for root jobs
- continuation jobs preserve stage-role identity as root contribution id

Files to audit (non-exhaustive):
- `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`
- `.../planPerSourceDocument.ts`
- `.../planPerSourceGroup.ts`
- `.../planPerSourceDocumentByLineage.ts`
- `.../planPerModel.ts`
- `.../planPairwiseByOrigin.ts`
- Any helper that constructs payloads with `document_relationships`

---

## TDD Plan (How we will prove and fix it)

### RED: Unit tests that prove the planner is writing the wrong value
Add a unit test in `planAllToOne.test.ts` covering the PLAN→EXECUTE `header_context` payload:
- `document_relationships.source_group === anchorDocument.id` (must remain)
- `document_relationships[stageSlug]` must be **absent/undefined** (or explicitly null) for root header_context jobs  
  (depending on the chosen contract)

This should fail today because the planner sets `[stageSlug] = anchorDocument.id`.

Add similar tests for other planners currently setting `[stageSlug]` from input/group ids (as appropriate).

### RED: Unit test that proves JSON-only root chunks get correct stage identity post-save
Add/extend a unit test in the `executeModelCallAndSave` test suite (there is already coverage around:
- extracting `documentIdentity` from `document_relationships[stageSlug]`
- persisting relationships for continuation chunks

We need an explicit test for a JSON-only artifact (e.g. `header_context`):
- root chunk save: after `uploadAndRegisterFile` returns `contribution.id`, `executeModelCallAndSave` must ensure `document_relationships[stageSlug] === contribution.id`
- continuation chunk save: must preserve `document_relationships[stageSlug] === rootContributionId` and allow JSON assembly to find the root contribution.

### GREEN: Source changes
Implement the minimal changes:
- Planner(s): stop populating `[stageSlug]` from anchor/group ids for root jobs; keep `source_group` and other explicit lineage keys.
- Producer (`executeModelCallAndSave`): for root chunks (all artifact types), enforce `document_relationships[stageSlug] = contribution.id` post-save (not just “when missing”).

### GREEN: Integration test should progress
With the identity semantics corrected, the E2E integration test (`executeModelCallAndSave.document.integration.test.ts`) should move past:
- `assembleAndSaveFinalDocument` failing with “Could not find root contribution…”
and reveal the next genuine correctness issue (if any).

---

## Proposed Checklist Insert (high-level outline; to be refined after full audit)
When we convert this into a checklist insert, it should include:

1. **RED planner unit test**: `planAllToOne` PLAN→EXECUTE for header_context must not set `document_relationships[stageSlug]` from anchor.
2. **GREEN planner fix**: adjust `planAllToOne` accordingly.
3. **RED producer unit test**: JSON-only root chunks must get `document_relationships[stageSlug] = contribution.id` post-save.
4. **GREEN producer fix**: implement identity initialization for JSON-only artifacts in `executeModelCallAndSave`.
5. **Audit planners**: verify/fix all planners that set `[stageSlug]` to input/group ids.
6. **Re-run integration tests**: confirm the E2E suite progresses.

---

## Notes / Open Questions (to resolve during audit)
- Should `document_relationships[stageSlug]` be **required** for all artifacts, or only for:
  - continuation chains
  - render-grouping identity
  - stage provenance lookups
- Are there cases where stage identity should be something other than `contribution.id` for root chunks (e.g., multi-model aggregation)? If so, where is that identity minted and persisted?
- For pairwise/synthesis planners that operate on grouped inputs, what is the correct mapping:
  - `source_group` = lineage group id
  - `[stageSlug]` = produced root id (minted post-save)


