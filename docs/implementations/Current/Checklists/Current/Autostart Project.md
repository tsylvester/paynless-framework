[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Automate Project Start — One-Click Create-to-Generate Flow**

## Problem Statement

Creating a new project and starting generation requires four separate manual steps across three pages: (1) fill the create form and click "Create Project," (2) click "Start New Session" on the project details page, (3) select AI models on the session page, and (4) click "Generate." This multi-step flow creates unnecessary friction. Additionally, two pre-existing bugs degrade data quality: the backend `StartSessionPayload` uses `selectedModelIds: string[]` while the frontend uses `selectedModels: SelectedModels[]`, and the backend `startSession.ts` response construction maps `displayName` to raw UUIDs instead of actual model names.

## Objectives

1. Enable one-click project creation that automatically creates a session with default models and optionally starts generation
2. Fix end-to-end type alignment from `selectedModelIds: string[]` to `selectedModels: SelectedModels[]` across backend types, handlers, type guards, and all tests
3. Fix broken display name mapping in `startSession.ts` response construction; verify `getSessionDetails.ts` and `updateSessionModels.ts` are already correct
4. Add `is_default_generation` flag to `ai_providers` to enable data-driven automatic model selection
5. Provide progressive UX feedback during the automated multi-step creation flow
6. Maintain the existing manual flow as a user-selectable option via "Configure Manually" checkbox

## Expected Outcome

Users click "Create Project" once and land on a session page with default models selected and generation running. The existing manual flow remains accessible via a "Configure Manually" checkbox. Type alignment is consistent end-to-end (frontend type → API adapter → edge function → database insert → response), display names are correct in all session contexts (creation and detail loading), and the `is_default_generation` flag provides a data-driven mechanism for default model selection.

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Phase 1: Database & Type Alignment

*   `[✅]`   [DB] supabase/migrations **Add `is_default_generation` column to `ai_providers`**
  *   `[✅]`   `objective`
    *   `[✅]`   Add boolean column `is_default_generation` to `ai_providers` to flag models for auto-selection during automated project creation
    *   `[✅]`   Column is `NOT NULL DEFAULT false` — preserves existing rows without manual backfill
    *   `[✅]`   Multiple models may be flagged simultaneously — no unique constraint (distinct from `is_default_embedding` which enforces a single default)
    *   `[✅]`   Seed at least one active model with `is_default_generation = true`
    *   `[✅]`   Regenerate `types_db.ts` so downstream consumers see the new column
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — database schema migration and seed data
  *   `[✅]`   `module`
    *   `[✅]`   Database schema: `ai_providers` table — new boolean column
    *   `[✅]`   Seed data: default generation model designation
    *   `[✅]`   Generated types: `supabase/functions/types_db.ts` — regeneration
  *   `[✅]`   `deps`
    *   `[✅]`   `ai_providers` table — pre-existing, infrastructure layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `supabase/migrations/YYYYMMDDHHMMSS_is_default_generation.sql`
    *   `[✅]`   `ALTER TABLE ai_providers ADD COLUMN is_default_generation BOOLEAN NOT NULL DEFAULT false;`
    *   `[✅]`   Add column comment explaining purpose and distinction from `is_default_embedding`
  *   `[✅]`   Seed data file (locate existing `ai_providers` seed — candidates: `supabase/seed.sql`, `supabase/migrations/20250902153929_seed_sql_update.sql`)
    *   `[✅]`   Set `is_default_generation = true` for at least one active model
    *   `[✅]`   If seed uses `ON CONFLICT ... DO UPDATE`, include `is_default_generation` in the update set
  *   `[✅]`   `supabase/functions/types_db.ts`
    *   `[✅]`   Regenerate from database schema after migration
    *   `[✅]`   Verify `is_default_generation: boolean` appears in `ai_providers` row type
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer
    *   `[✅]`   All dependencies inward (schema definition)
    *   `[✅]`   Provides column to all consumers (backend queries, generated types, store selectors)
  *   `[✅]`   `requirements`
    *   `[✅]`   Migration applies cleanly — existing rows receive `false`
    *   `[✅]`   At least one active model seeded as default generation
    *   `[✅]`   `types_db.ts` includes `is_default_generation` in `ai_providers` type
    *   `[✅]`   Exempt from TDD (database migration / generated types)
  *   `[✅]`   **Commit** `feat(db): add is_default_generation column to ai_providers`
    *   `[✅]`   New migration file adding `is_default_generation` boolean column
    *   `[✅]`   Seed data updated with default generation model flag
    *   `[✅]`   `types_db.ts` regenerated to reflect new column

*   `[✅]`   [BE] supabase/functions/dialectic-service/startSession **Type alignment `selectedModelIds` → `selectedModels` and response construction fix**
  *   `[✅]`   `objective`
    *   `[✅]`   Change `StartSessionPayload.selectedModelIds: string[]` to `selectedModels: SelectedModels[]` in the backend type to match the frontend `StartSessionPayload`
    *   `[✅]`   Update all related backend type references: `DialecticBaseJobPayload` Omit key cleanup, `JobInsert.payload.selectedModelIds` → `selectedModels`
    *   `[✅]`   Fix broken response construction in `startSession.ts` that sets `displayName` to raw UUID instead of actual model name
    *   `[✅]`   Ensure `SelectedModels` type is consistent end-to-end: `{ id: string; displayName: string }`
    *   `[✅]`   Update all type guards that validate `selectedModelIds` to validate `selectedModels: SelectedModels[]`
    *   `[✅]`   Update all backend test files that construct payloads with `selectedModelIds`
  *   `[✅]`   `role`
    *   `[✅]`   Backend adapter — edge function handler for session creation
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic service: session lifecycle — `startSession` handler
    *   `[✅]`   Boundary: receives `StartSessionPayload` from API adapter, inserts session to database, returns session response with `selected_models`
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic.interface.ts` — `StartSessionPayload`, `DialecticBaseJobPayload`, `JobInsert` (edited in this node as support files)
    *   `[✅]`   `type_guards.dialectic.ts` — `isDialecticJobPayload` guard validates `selectedModelIds` (edited in this node)
    *   `[✅]`   `SelectedModels` type from `packages/types/src/dialectic.types.ts` — `{ id: string; displayName: string }` (pre-existing, unchanged)
    *   `[✅]`   Supabase client for DB operations (existing, unchanged)
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `StartSessionPayload.selectedModels: SelectedModels[]` — full model objects with `id` and `displayName`
    *   `[✅]`   DB column `selected_model_ids: UUID[]` — stores only `id` values extracted from `SelectedModels[]`
    *   `[✅]`   Response field `selected_models: SelectedModels[]` — passes through payload objects directly (no reconstruction from UUIDs)
    *   `[✅]`   No concrete imports from higher or lateral layers
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   `StartSessionPayload` (line ~619): rename `selectedModelIds: string[]` to `selectedModels: SelectedModels[]`
    *   `[✅]`   Define `SelectedModels` as `{ id: string; displayName: string }`
    *   `[✅]`   `DialecticBaseJobPayload` (line ~1078): clean up `Omit<GenerateContributionsPayload, "selectedModelIds" | "chatId">` — remove `"selectedModelIds"` from the Omit since `GenerateContributionsPayload` does not have this field (the Omit is currently a no-op for that key)
    *   `[✅]`   `JobInsert` (line ~1985): change `selectedModelIds?: string[]` to `selectedModels?: SelectedModels[]`
  *   `[✅]`   interface/tests/`type_guards.dialectic.test.ts`
    *   `[✅]`   Update `isDialecticJobPayload` tests that validate `selectedModelIds` to validate `selectedModels: SelectedModels[]`
    *   `[✅]`   Test valid `SelectedModels[]` — array of `{ id: string; displayName: string }` passes guard
    *   `[✅]`   Test invalid shapes fail guard: missing `id`, missing `displayName`, wrong types, non-array
    *   `[✅]`   Update test at line ~878: `'should return true for a valid job payload with selectedModelIds'` → update field name and value shape
    *   `[✅]`   Update test at line ~887: `'should return false when selectedModelIds is not an array of strings'` → update for `SelectedModels[]` shape validation
    *   `[✅]`   Update tests at lines ~904, ~1068, ~1089 that construct payloads with `selectedModelIds`
  *   `[✅]`   interface/guards/`type_guards.dialectic.ts`
    *   `[✅]`   Update `isDialecticJobPayload` guard (line ~957): change from validating `selectedModelIds` as `string[]` to validating `selectedModels` as `SelectedModels[]`
    *   `[✅]`   Guard must verify: `'selectedModels' in payload`, `Array.isArray(payload.selectedModels)`, each element has `id: string` and `displayName: string`
  *   `[✅]`   unit/`startSession.happy.test.ts`
    *   `[✅]`   Update all `StartSessionPayload` constructions: `selectedModelIds: ["model-1"]` → `selectedModels: [{ id: "model-1", displayName: "Model One" }]` (at lines ~37, ~196, ~362, ~416)
    *   `[✅]`   Update assertions that expect `displayName: id` (UUID as display name) to expect the correct display name passed in the payload
    *   `[✅]`   Verify session response contains complete `SelectedModels[]` objects passed through from payload
  *   `[✅]`   unit/`startSession.errors.test.ts`
    *   `[✅]`   Update all `StartSessionPayload` constructions: `selectedModelIds` → `selectedModels: SelectedModels[]` (at lines ~32, ~48, ~70, ~117, ~170, ~224, ~302, ~304)
  *   `[✅]`   `construction`
    *   `[✅]`   `startSession` handler destructures `selectedModels` from request body payload (currently destructures `selectedModelIds` at line ~41)
    *   `[✅]`   For DB insert: `selected_model_ids` column receives `selectedModels.map(m => m.id)` or `[]` if empty
    *   `[✅]`   For response: `selected_models` uses `selectedModels` from payload directly — eliminates broken `ids.map((id) => ({ id, displayName: id }))` reconstruction
  *   `[✅]`   `startSession.ts`
    *   `[✅]`   Destructure `selectedModels` instead of `selectedModelIds` from payload (line ~41)
    *   `[✅]`   DB insert (line ~288): change `selected_model_ids: selectedModelIds ?? []` to `selected_model_ids: selectedModels.map(m => m.id)`
    *   `[✅]`   Response construction (lines ~329–334): replace `ids.map((id) => ({ id, displayName: id }))` with direct use of `selectedModels` from payload
  *   `[✅]`   integration/`index.test.ts`
    *   `[✅]`   Update `startSession` test payloads (lines ~558, ~582): `selectedModelIds: ['model-1']` → `selectedModels: [{ id: 'model-1', displayName: 'Model One' }]`
    *   `[✅]`   Update `updateSessionModels` test payload (line ~966): `selectedModelIds: ['model-a', 'model-b']` → `selectedModels: [{ id: 'model-a', displayName: 'Model A' }, { id: 'model-b', displayName: 'Model B' }]`
  *   `[✅]`   unit/`generateContribution.test.ts` (conditional review)
    *   `[✅]`   Review test at line ~437: `"generateContributions - Validation: Fails if selectedModelIds is empty or missing"` — this tests DB-level validation using `selected_model_ids: []` (DB column name, correct)
    *   `[✅]`   If test constructs `JobInsert` or `DialecticBaseJobPayload` objects with `selectedModelIds`, update to `selectedModels: SelectedModels[]`
    *   `[✅]`   DB column mock references (`selected_model_ids`) are unchanged — that is the DB column name
  *   `[✅]`   `directionality`
    *   `[✅]`   Backend adapter layer
    *   `[✅]`   Dependencies inward: `dialectic.interface.ts` types, database types, `SelectedModels` from `packages/types`
    *   `[✅]`   Provides outward: session creation handler to edge function router
  *   `[✅]`   `requirements`
    *   `[✅]`   All `selectedModelIds` references in `dialectic.interface.ts` replaced with `selectedModels: SelectedModels[]`
    *   `[✅]`   `DialecticBaseJobPayload` Omit key cleaned up (removed non-existent `"selectedModelIds"`)
    *   `[✅]`   `JobInsert` payload type updated to `selectedModels?: SelectedModels[]`
    *   `[✅]`   `startSession.ts` extracts IDs for DB column, passes full `SelectedModels[]` in response
    *   `[✅]`   Broken `displayName: id` (UUID as display name) pattern is eliminated
    *   `[✅]`   Type guard `isDialecticJobPayload` validates `selectedModels: SelectedModels[]` shape
    *   `[✅]`   All backend test files updated with correct payload shapes and assertions
    *   `[✅]`   `index.test.ts` updated for both `startSession` and `updateSessionModels` test payloads

*   `[✅]`   [BE] supabase/functions/dialectic-service/updateSessionModels + getSessionDetails **Verify existing type alignment and display name lookup**
  *   `[✅]`   `objective`
    *   `[✅]`   Verify `updateSessionModels.ts` already uses `selectedModels: SelectedModels[]` (confirmed: source destructures `selectedModels` from `UpdateSessionModelsPayload`, maps to `selected_model_ids` for DB)
    *   `[✅]`   Verify `UpdateSessionModelsPayload` in `dialectic.interface.ts` already has `selectedModels: SelectedModels[]` (confirmed at line ~886)
    *   `[✅]`   Verify `getSessionDetails.ts` already correctly reconstructs `SelectedModels[]` by querying `ai_providers` for display names (confirmed: queries `ai_providers` for `id` and `name`, builds `displayNameById` map)
    *   `[✅]`   Document verification results — no source changes expected
  *   `[✅]`   `role`
    *   `[✅]`   Backend adapter — verification of existing alignment in adjacent handlers
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic service: `updateSessionModels` handler — session model update
    *   `[✅]`   Dialectic service: `getSessionDetails` handler — session detail retrieval with `ai_providers` name lookup
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic.interface.ts` — `UpdateSessionModelsPayload` (already aligned in prior verification)
    *   `[✅]`   `ai_providers` table — source of display names for `getSessionDetails` lookup
    *   `[✅]`   `SelectedModels` type (consistent end-to-end)
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `updateSessionModels.ts`: receives `selectedModels: SelectedModels[]`, maps `selectedModels.map(model => model.id)` for DB update
    *   `[✅]`   `getSessionDetails.ts`: reads `selected_model_ids` from DB, queries `ai_providers` for `name`, constructs `SelectedModels[]` with `{ id, displayName: provider.name }`
  *   `[✅]`   `updateSessionModels.ts` — read and verify
    *   `[✅]`   Confirm source destructures `selectedModels` from `UpdateSessionModelsPayload` (line ~12)
    *   `[✅]`   Confirm DB update uses `selectedModels.map(model => model.id)` (line ~54)
    *   `[✅]`   If already correct: document as verified, no changes needed
    *   `[✅]`   If incorrect: stop, report discovery, propose fix as separate node
  *   `[✅]`   `getSessionDetails.ts` — read and verify
    *   `[✅]`   Confirm `selected_model_ids` from DB are mapped via `ai_providers` lookup for display names (lines ~146–201)
    *   `[✅]`   Confirm `SelectedModels[]` is constructed with `{ id, displayName: provider.name }`, not `{ id, displayName: id }`
    *   `[✅]`   Confirm edge case handling: model ID in `selected_model_ids` not found in `ai_providers`
    *   `[✅]`   If already correct: document as verified, no changes needed
    *   `[✅]`   If incorrect: stop, report discovery, propose fix as separate node
  *   `[✅]`   `directionality`
    *   `[✅]`   Backend adapter layer
    *   `[✅]`   Dependencies inward: `dialectic.interface.ts` types, `ai_providers` table
    *   `[✅]`   Provides outward: session update and detail handlers to edge function router
  *   `[✅]`   `requirements`
    *   `[✅]`   `updateSessionModels.ts` confirmed to use `selectedModels: SelectedModels[]` — no source changes
    *   `[✅]`   `UpdateSessionModelsPayload` confirmed to have `selectedModels: SelectedModels[]` — no type changes
    *   `[✅]`   `getSessionDetails.ts` confirmed to look up display names from `ai_providers` — no source changes
    *   `[✅]`   If verification reveals unexpected issues, halt and report before proceeding
    *   `[✅]`   Exempt from TDD — verification-only node, no code changes expected

*   `[✅]`   [UI] apps/web/src/pages/DialecticProjectDetailsPage **Fix `selectedModelIds` → `selectedModels` in `handleStartNewSession`**
  *   `[✅]`   `objective`
    *   `[✅]`   Change `selectedModelIds: []` to `selectedModels: []` in `handleStartNewSession` (line ~60) to conform to the frontend `StartSessionPayload` type
    *   `[✅]`   This is a pre-existing type violation: the code sends `selectedModelIds` which matched the old backend but violates the frontend `StartSessionPayload.selectedModels: SelectedModels[]`
  *   `[✅]`   `role`
    *   `[✅]`   Frontend page component — project detail with manual session creation
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic project details: manual "Start New Session" flow
    *   `[✅]`   Boundary: constructs `StartSessionPayload`, calls `startDialecticSession` store action, navigates to session page
  *   `[✅]`   `deps`
    *   `[✅]`   `StartSessionPayload` type from `packages/types/src/dialectic.types.ts` — `selectedModels: SelectedModels[]` (pre-existing, unchanged)
    *   `[✅]`   `startDialecticSession` store action (existing, unchanged)
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `handleStartNewSession` passes `selectedModels: []` (empty array, typed as `SelectedModels[]`)
    *   `[✅]`   No concrete imports from higher or lateral layers
  *   `[✅]`   unit/`DialecticProjectDetailsPage.test.tsx`
    *   `[✅]`   Update assertion at line ~244: `selectedModelIds: []` → `selectedModels: []`
    *   `[✅]`   Verify `handleStartNewSession` calls `startDialecticSession` with correct `StartSessionPayload` shape
  *   `[✅]`   `construction`
    *   `[✅]`   `handleStartNewSession` constructs payload with `{ projectId, selectedModels: [], stageSlug }`
  *   `[✅]`   `DialecticProjectDetailsPage.tsx`
    *   `[✅]`   `handleStartNewSession` (line ~60): change `selectedModelIds: []` to `selectedModels: []`
  *   `[✅]`   `directionality`
    *   `[✅]`   Frontend page layer
    *   `[✅]`   Dependencies inward: `StartSessionPayload` type, store actions
    *   `[✅]`   Provides outward: user interaction surface for manual session creation
  *   `[✅]`   `requirements`
    *   `[✅]`   `handleStartNewSession` payload conforms to `StartSessionPayload` with `selectedModels: SelectedModels[]`
    *   `[✅]`   Existing manual "Start New Session" flow works unchanged
    *   `[✅]`   Test assertions updated and passing
  *   `[✅]`   **Commit** `fix: align selectedModels type end-to-end and fix startSession display name reconstruction`
    *   `[✅]`   `dialectic.interface.ts` — `StartSessionPayload.selectedModelIds` → `selectedModels: SelectedModels[]`, `DialecticBaseJobPayload` Omit cleanup, `JobInsert` type fix
    *   `[✅]`   `type_guards.dialectic.ts` — `isDialecticJobPayload` guard updated for `selectedModels: SelectedModels[]`
    *   `[✅]`   `startSession.ts` — destructure `selectedModels`, fix DB insert mapping, fix response construction
    *   `[✅]`   `updateSessionModels.ts` — verified already aligned, no changes
    *   `[✅]`   `getSessionDetails.ts` — verified display name lookup already correct, no changes
    *   `[✅]`   `DialecticProjectDetailsPage.tsx` — `selectedModelIds: []` → `selectedModels: []`
    *   `[✅]`   All related test files updated: `startSession.happy.test.ts`, `startSession.errors.test.ts`, `type_guards.dialectic.test.ts`, `index.test.ts`, `DialecticProjectDetailsPage.test.tsx`, `generateContribution.test.ts` (conditional)

## Phase 2: Auto-Start Feature

*   `[ ]`   [STORE] packages/store/src/dialecticStore.selectors **Add `selectDefaultGenerationModels` selector**
  *   `[ ]`   `objective`
    *   `[ ]`   Add selector `selectDefaultGenerationModels` that filters `modelCatalog` for entries where `is_default_generation === true` and `is_active === true`
    *   `[ ]`   Return type is `SelectedModels[]` — maps each matching `AIModelCatalogEntry` to `{ id, displayName }` using the model's name field
    *   `[ ]`   Add `is_default_generation: boolean` to `AIModelCatalogEntry` in `packages/types/src/dialectic.types.ts` (required for the selector to reference this field; the DB column and `types_db.ts` were added in Node 1)
  *   `[ ]`   `role`
    *   `[ ]`   Application layer — derived state selector for default model resolution
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store selectors: model catalog filtering for default generation models
    *   `[ ]`   Boundary: reads from `DialecticStateValues.modelCatalog`, returns `SelectedModels[]`
  *   `[ ]`   `deps`
    *   `[ ]`   `DialecticStateValues` from `@paynless/types` — state shape containing `modelCatalog: AIModelCatalogEntry[]` (pre-existing, unchanged)
    *   `[ ]`   `AIModelCatalogEntry` from `@paynless/types` — needs `is_default_generation: boolean` added (edited in this node)
    *   `[ ]`   `SelectedModels` from `@paynless/types` — `{ id: string; displayName: string }` (pre-existing, already imported in selectors file)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: `state.modelCatalog: AIModelCatalogEntry[]`
    *   `[ ]`   Filter criteria: `is_default_generation === true && is_active === true`
    *   `[ ]`   Output: `SelectedModels[]` mapped from matching entries — `{ id: entry.id, displayName: entry.model_name }`
    *   `[ ]`   No concrete imports from higher or lateral layers
  *   `[ ]`   interface/`packages/types/src/dialectic.types.ts`
    *   `[ ]`   Add `is_default_generation: boolean` to `AIModelCatalogEntry` interface (line ~202, after `is_active: boolean`)
    *   `[ ]`   This field is populated from the `ai_providers.is_default_generation` column added in Node 1 — verify it flows through `types_db.ts` → catalog query → store `modelCatalog`
  *   `[ ]`   unit/`dialecticStore.selectors.autostart.test.ts`
    *   `[ ]`   Test: returns empty array when `modelCatalog` is empty
    *   `[ ]`   Test: returns empty array when no models have `is_default_generation === true`
    *   `[ ]`   Test: returns only models where both `is_default_generation === true` AND `is_active === true`
    *   `[ ]`   Test: excludes models where `is_default_generation === true` but `is_active === false`
    *   `[ ]`   Test: returns correct `SelectedModels` shape `{ id, displayName }` mapped from `AIModelCatalogEntry`
    *   `[ ]`   Test: handles multiple default models correctly (returns all matching)
  *   `[ ]`   `construction`
    *   `[ ]`   Selector signature: `export const selectDefaultGenerationModels = (state: DialecticStateValues): SelectedModels[] => ...`
    *   `[ ]`   Filter: `state.modelCatalog.filter(m => m.is_default_generation === true && m.is_active === true)`
    *   `[ ]`   Map: `{ id: m.id, displayName: m.model_name }` — verify `model_name` corresponds to `ai_providers.name` (the user-facing display name used by `getSessionDetails.ts`; not `provider_name` which is the company name)
  *   `[ ]`   `selectDefaultGenerationModels` in `dialecticStore.selectors.ts`
    *   `[ ]`   Export new selector following existing pattern (simple function, `(state: DialecticStateValues) => SelectedModels[]`)
    *   `[ ]`   Filter `modelCatalog` for `is_default_generation === true` and `is_active === true`
    *   `[ ]`   Map each matching entry to `{ id: entry.id, displayName: entry.model_name }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Application layer (selector)
    *   `[ ]`   Dependencies inward: `DialecticStateValues`, `AIModelCatalogEntry`, `SelectedModels` from `@paynless/types`
    *   `[ ]`   Provides outward: derived state to store actions (`createProjectAndAutoStart`) and UI components (`CreateDialecticProjectForm` auto-uncheck logic)
  *   `[ ]`   `requirements`
    *   `[ ]`   `AIModelCatalogEntry` includes `is_default_generation: boolean`
    *   `[ ]`   Selector correctly filters by both `is_default_generation` and `is_active`
    *   `[ ]`   Selector returns `SelectedModels[]` with correct `displayName` mapping
    *   `[ ]`   All new tests pass
    *   `[ ]`   Existing selector tests unaffected

*   `[ ]`   [STORE] packages/store/src/dialecticStore **Add `createProjectAndAutoStart` orchestration action and `autoStartGeneration` action**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `createProjectAndAutoStart` action: orchestrates catalog load → project creation → fetch details → derive stage → resolve default models → start session, reporting progress step via `autoStartStep` store state
    *   `[ ]`   Add `autoStartGeneration` action: checks wallet/balance/stage/model preconditions then calls `generateContributions` with `continueUntilComplete: true`
    *   `[ ]`   Add new state fields to `DialecticStateValues` in `packages/types/src/dialectic.types.ts`: `autoStartStep: string | null`, `isAutoStarting: boolean`, `autoStartError: ApiError | null`
    *   `[ ]`   Define `CreateProjectAutoStartResult` type in `packages/types/src/dialectic.types.ts` for the orchestration action's return value
  *   `[ ]`   `role`
    *   `[ ]`   Application layer — store actions orchestrating automated project creation and generation
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store: auto-start orchestration and generation trigger
    *   `[ ]`   Boundary: `createProjectAndAutoStart` chains existing store actions in strict sequential order; `autoStartGeneration` reads cross-store wallet state and triggers generation
  *   `[ ]`   `deps`
    *   `[ ]`   `createDialecticProject` — existing action, `(payload: CreateProjectPayload) => Promise<ApiResponse<DialecticProjectRow>>` (line ~655)
    *   `[ ]`   `fetchDialecticProjectDetails` — existing action, `(projectId: string) => Promise<void>`, sets `currentProjectDetail` in state (line ~431)
    *   `[ ]`   `fetchAIModelCatalog` — existing action, `() => Promise<void>`, sets `modelCatalog` in state (line ~784)
    *   `[ ]`   `startDialecticSession` — existing action, `(payload: StartSessionPayload) => Promise<ApiResponse<StartSessionSuccessResponse>>` (line ~703)
    *   `[ ]`   `generateContributions` — existing action, `(payload: GenerateContributionsPayload) => Promise<ApiResponse<GenerateContributionsResponse>>` (line ~1855)
    *   `[ ]`   `selectDefaultGenerationModels` — new selector from node 5
    *   `[ ]`   `selectActiveChatWalletInfo` from `packages/store/src/walletStore.selectors.ts` — cross-store access via `useWalletStore.getState()` for wallet precondition check; takes `(state: WalletStateValues, newChatContext: string | null | undefined)`, returns `ActiveChatWalletInfo`
    *   `[ ]`   `useWalletStore` — for `getState()` access to wallet store from within dialectic store action
    *   `[ ]`   `STAGE_BALANCE_THRESHOLDS` from `@paynless/types` — per-stage balance thresholds (thesis=200k, antithesis=400k, synthesis=1M, parenthesis=250k, paralysis=250k)
    *   `[ ]`   `GenerateContributionsPayload` from `@paynless/types` — `{ sessionId, projectId, stageSlug, iterationNumber, continueUntilComplete, walletId }`
    *   `[ ]`   `ActiveChatWalletInfo` from `@paynless/types` — `{ status, type, walletId, orgId, balance: string | null, ... }` — note `balance` is `string | null`, requires `Number()` conversion for threshold comparison
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `createProjectAndAutoStart`:
          - Input: `CreateProjectPayload` (from form)
          - State reads: `modelCatalog`, `isLoadingModelCatalog`, `currentProjectDetail` (after fetch)
          - State writes: `autoStartStep`, `isAutoStarting`, `autoStartError`
          - Output: `CreateProjectAutoStartResult` — `{ projectId, sessionId, hasDefaultModels, error? }`
    *   `[ ]`   `autoStartGeneration`:
          - Dialectic state reads: `activeSessionDetail`, `currentProjectDetail`, `activeContextSessionId`, `selectedModels`, active stage (via `activeStageSlug` or `activeContextStageSlug`)
          - Cross-store read: `useWalletStore.getState()` → `selectActiveChatWalletInfo(walletState, null)` → `ActiveChatWalletInfo`
          - Output: success/failure object describing the result
    *   `[ ]`   No concrete imports from higher or lateral layers (wallet store access via Zustand `getState()` is the standard cross-store pattern)
  *   `[ ]`   interface/`packages/types/src/dialectic.types.ts`
    *   `[ ]`   Add to `DialecticStateValues` (line ~329–416): `autoStartStep: string | null`, `isAutoStarting: boolean`, `autoStartError: ApiError | null`
    *   `[ ]`   Add to `initialDialecticStateValues`: `autoStartStep: null`, `isAutoStarting: false`, `autoStartError: null`
    *   `[ ]`   Add `CreateProjectAutoStartResult` interface: `{ projectId: string; sessionId: string | null; hasDefaultModels: boolean; error?: ApiError }`
  *   `[ ]`   unit/tests `dialecticStore.autostart.test.ts` following existing test file pattern with vitest, `useDialecticStore`, `resetApiMock`, `_resetForTesting`
    *   `[ ]`   **`createProjectAndAutoStart` tests:**
    *   `[ ]`   Test: calls `fetchAIModelCatalog` if `modelCatalog` is empty and not loading, waits for completion before proceeding
    *   `[ ]`   Test: skips `fetchAIModelCatalog` if catalog is already loaded
    *   `[ ]`   Test: calls `createDialecticProject` with the provided payload and extracts `projectId` from `response.data.id`
    *   `[ ]`   Test: calls `fetchDialecticProjectDetails(projectId)` after project creation and waits for completion
    *   `[ ]`   Test: derives initial stage slug from `currentProjectDetail.dialectic_process_templates.stages[0].slug`
    *   `[ ]`   Test: resolves default models via `selectDefaultGenerationModels` — returns `{ projectId, sessionId: null, hasDefaultModels: false }` when none found
    *   `[ ]`   Test: calls `startDialecticSession` with `{ projectId, stageSlug, selectedModels: defaultModels }`
    *   `[ ]`   Test: returns `{ projectId, sessionId, hasDefaultModels: true }` on full success
    *   `[ ]`   Test: stops and returns error if `createDialecticProject` fails (network/server error)
    *   `[ ]`   Test: returns partial result with `projectId` if `fetchDialecticProjectDetails` fails after project creation
    *   `[ ]`   Test: returns error if `currentProjectDetail` has no stages (`dialectic_process_templates.stages` empty or missing)
    *   `[ ]`   Test: stops and returns error if `startDialecticSession` fails
    *   `[ ]`   Test: updates `autoStartStep` progressively at each stage (`'Loading models…'`, `'Creating project…'`, `'Loading project details…'`, `'Starting session…'`)
    *   `[ ]`   Test: sets `isAutoStarting` to `true` at start, `false` at end (including failure paths)
    *   `[ ]`   Test: sets `autoStartError` on failure
    *   `[ ]`   **`autoStartGeneration` tests:**
    *   `[ ]`   Test: builds `GenerateContributionsPayload` correctly from store state (`sessionId`, `projectId`, `stageSlug`, `iterationNumber`, `continueUntilComplete: true`, `walletId`)
    *   `[ ]`   Test: calls `generateContributions` with the built payload
    *   `[ ]`   Test: returns descriptive error when `selectedModels` is empty
    *   `[ ]`   Test: returns descriptive error when active stage is not set
    *   `[ ]`   Test: returns descriptive error when `walletInfo.status !== 'ok'`
    *   `[ ]`   Test: returns descriptive error when `walletInfo.walletId` is falsy
    *   `[ ]`   Test: returns descriptive error when `Number(walletInfo.balance) < STAGE_BALANCE_THRESHOLDS[stageSlug]`
    *   `[ ]`   Test: returns success when all preconditions met and `generateContributions` succeeds
    *   `[ ]`   Test: returns error when `generateContributions` fails
  *   `[ ]`   `construction`
    *   `[ ]`   **`createProjectAndAutoStart(payload: CreateProjectPayload): Promise<CreateProjectAutoStartResult>`:**
          - Set `{ isAutoStarting: true, autoStartError: null, autoStartStep: null }`
          - Step 1: if `get().modelCatalog.length === 0 && !get().isLoadingModelCatalog`, call `get().fetchAIModelCatalog()` and await; set `autoStartStep: 'Loading models…'`
          - Step 2: `const createResult = await get().createDialecticProject(payload)`; set `autoStartStep: 'Creating project…'`; if `!createResult.data`, set error, return
          - Step 3: `const projectId = createResult.data.id`; `await get().fetchDialecticProjectDetails(projectId)`; set `autoStartStep: 'Loading project details…'`; if `currentProjectDetail` not populated, return partial
          - Step 4: derive `stageSlug = get().currentProjectDetail.dialectic_process_templates.stages[0].slug`; if no stages, return error
          - Step 5: `const defaultModels = selectDefaultGenerationModels(get())`; if empty, return `{ projectId, sessionId: null, hasDefaultModels: false }`
          - Step 6: `const sessionResult = await get().startDialecticSession({ projectId, stageSlug, selectedModels: defaultModels })`; set `autoStartStep: 'Starting session…'`; if `!sessionResult.data`, set error, return
          - Return `{ projectId, sessionId: sessionResult.data.id, hasDefaultModels: true }`
          - Finally: set `{ isAutoStarting: false, autoStartStep: null }`
    *   `[ ]`   **`autoStartGeneration(): Promise<{ success: boolean; error?: string }>`:**
          - Read dialectic state: `activeSessionDetail`, `currentProjectDetail`, `activeContextSessionId`, `selectedModels` (from `get().selectedModels || []`), active stage slug
          - Cross-store: `const walletState = useWalletStore.getState(); const walletInfo = selectActiveChatWalletInfo(walletState, null);`
          - Precondition checks (return descriptive error string if any fail):
              - `selectedModels.length === 0` → `'No models selected'`
              - `!activeStage` → `'No active stage'`
              - `walletInfo.status !== 'ok'` → `'Wallet not ready'`
              - `!walletInfo.walletId` → `'No wallet available'`
              - `Number(walletInfo.balance ?? '0') < STAGE_BALANCE_THRESHOLDS[activeStage.slug]` → `'Wallet balance too low'`
          - Build payload: `{ sessionId: activeContextSessionId, projectId: currentProjectDetail.id, stageSlug: activeStage.slug, iterationNumber: activeSessionDetail.iteration_count, continueUntilComplete: true, walletId: walletInfo.walletId }`
          - `const result = await get().generateContributions(payload)`
          - Return `{ success: !!result.data, error: result.error?.message }`
  *   `[ ]`   `createProjectAndAutoStart` in `dialecticStore.ts`
    *   `[ ]`   Implement orchestration action as described in construction
    *   `[ ]`   Each async step awaits completion before proceeding — strict sequential order
    *   `[ ]`   Error at any step stops the chain and returns descriptive result
    *   `[ ]`   `autoStartStep` updated at each stage for progressive UI feedback
    *   `[ ]`   `isAutoStarting` bookends the entire operation (`true` at start, `false` in finally)
  *   `[ ]`   `autoStartGeneration` in `dialecticStore.ts`
    *   `[ ]`   Implement precondition-checking action as described in construction
    *   `[ ]`   Cross-store wallet access via `useWalletStore.getState()` — Zustand standard pattern for cross-store reads
    *   `[ ]`   `walletInfo.balance` is `string | null` — convert with `Number(walletInfo.balance ?? '0')` for threshold comparison
    *   `[ ]`   Returns descriptive error if any precondition fails — caller (session page) can display feedback
  *   `[ ]`   `directionality`
    *   `[ ]`   Application layer (store actions)
    *   `[ ]`   Dependencies inward: existing store actions, `selectDefaultGenerationModels`, types from `@paynless/types`
    *   `[ ]`   Cross-store dependency: `useWalletStore` (lateral, justified for wallet precondition check — wallet is an independent domain)
    *   `[ ]`   Provides outward: orchestration actions to `CreateDialecticProjectForm` and `DialecticSessionDetailsPage`
  *   `[ ]`   `requirements`
    *   `[ ]`   `createProjectAndAutoStart` orchestrates all steps in strict sequential order, awaiting each before proceeding
    *   `[ ]`   `createProjectAndAutoStart` reports current step via `autoStartStep` state field for progressive UI
    *   `[ ]`   `createProjectAndAutoStart` handles each failure mode: project creation failure, detail fetch failure, no stages, no default models, session creation failure
    *   `[ ]`   `autoStartGeneration` checks all preconditions before calling `generateContributions`
    *   `[ ]`   `autoStartGeneration` converts `walletInfo.balance` (string) to number for threshold comparison
    *   `[ ]`   New state fields (`autoStartStep`, `isAutoStarting`, `autoStartError`) initialized in `initialDialecticStateValues`
    *   `[ ]`   `CreateProjectAutoStartResult` type covers all return paths (success, partial, failure)
    *   `[ ]`   All new tests pass
    *   `[ ]`   Existing store tests unaffected

*   `[ ]`   [UI] apps/web/src/components/dialectic/CreateDialecticProjectForm **Add checkboxes, auto-start flow, and progressive loader states**
  *   `[ ]`   `objective`
    *   `[ ]`   Add "Configure Manually" checkbox (unchecked by default) — when checked, uses legacy flow: `createDialecticProject` → navigate to `/dialectic/${projectId}`
    *   `[ ]`   Add "Start Generation" checkbox (checked by default, visible only when "Configure Manually" unchecked) — controls whether navigation includes `autoStartGeneration: true` state
    *   `[ ]`   Auto-uncheck "Start Generation" if model catalog loaded and no `is_default_generation` models found, or if wallet balance below thesis threshold (200,000)
    *   `[ ]`   Modify `onSubmit`: manual path calls `createDialecticProject` only; auto path calls `createProjectAndAutoStart` then navigates to `/dialectic/${projectId}/session/${sessionId}`
    *   `[ ]`   Show progressive loader states reading `autoStartStep` from store during `createProjectAndAutoStart`
    *   `[ ]`   Call `fetchAIModelCatalog` on mount so catalog is ready by submit time
  *   `[ ]`   `role`
    *   `[ ]`   Frontend component — project creation form with automated flow orchestration
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic project creation: form submission, checkbox-controlled flow branching, progressive feedback
    *   `[ ]`   Boundary: reads store state for UI decisions (selectors), calls store actions, navigates on completion
  *   `[ ]`   `deps`
    *   `[ ]`   `createProjectAndAutoStart` — new store action from node 6 (new import)
    *   `[ ]`   `createDialecticProject` — existing store action (already imported at line ~55)
    *   `[ ]`   `fetchAIModelCatalog` — existing store action (new import from `useDialecticStore`)
    *   `[ ]`   `selectDefaultGenerationModels` — new selector from node 5 (new import from `@paynless/store`)
    *   `[ ]`   `selectActiveChatWalletInfo` from `@paynless/store` or wallet store — for auto-uncheck threshold check (new import)
    *   `[ ]`   `useWalletStore` from `@paynless/store` — for accessing wallet state in auto-uncheck effect
    *   `[ ]`   `STAGE_BALANCE_THRESHOLDS` from `@paynless/types` — thesis threshold (200,000) for auto-uncheck (new import)
    *   `[ ]`   `selectIsCreatingProject`, `selectCreateProjectError` — existing selectors (already imported)
    *   `[ ]`   Store state: `autoStartStep: string | null`, `isAutoStarting: boolean` — new fields from node 6 (read via `useDialecticStore`)
    *   `[ ]`   `useNavigate` — already imported from `react-router-dom` (line ~6)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Local form state: `configureManually: boolean` (default `false`), `startGeneration: boolean` (default `true`)
    *   `[ ]`   Store reads: `selectDefaultGenerationModels(state)` for auto-uncheck check, `autoStartStep` for loader text, `isAutoStarting` for button disable
    *   `[ ]`   Wallet read: `selectActiveChatWalletInfo` for balance-based auto-uncheck
    *   `[ ]`   Store calls: `createProjectAndAutoStart(payload)` or `createDialecticProject(payload)` depending on `configureManually`
    *   `[ ]`   Navigation: `/dialectic/${projectId}/session/${sessionId}` with optional `state: { autoStartGeneration: true }` (auto) or `/dialectic/${projectId}` (manual)
    *   `[ ]`   No concrete imports from higher or lateral layers
  *   `[ ]`   unit/`CreateDialecticProjectForm.test.tsx`
    *   `[ ]`   Test: "Configure Manually" checkbox renders unchecked by default
    *   `[ ]`   Test: "Start Generation" checkbox renders checked by default when "Configure Manually" is unchecked
    *   `[ ]`   Test: "Start Generation" checkbox is hidden/disabled when "Configure Manually" is checked
    *   `[ ]`   Test: submit with "Configure Manually" checked calls `createDialecticProject` (not `createProjectAndAutoStart`) and navigates to `/dialectic/${projectId}`
    *   `[ ]`   Test: submit with "Configure Manually" unchecked calls `createProjectAndAutoStart`
    *   `[ ]`   Test: successful auto-start navigates to `/dialectic/${projectId}/session/${sessionId}`
    *   `[ ]`   Test: successful auto-start with "Start Generation" checked navigates with `state: { autoStartGeneration: true }`
    *   `[ ]`   Test: successful auto-start with "Start Generation" unchecked navigates without auto-start state
    *   `[ ]`   Test: auto-start with `hasDefaultModels: false` navigates to session page without auto-start state
    *   `[ ]`   Test: "Start Generation" auto-unchecks when no default models available (catalog loaded, no `is_default_generation` models)
    *   `[ ]`   Test: "Start Generation" auto-unchecks when wallet balance below thesis threshold (200,000)
    *   `[ ]`   Test: auto-uncheck shows explanatory text next to checkbox
    *   `[ ]`   Test: loader state displays progressive messages from `autoStartStep` during auto-start
    *   `[ ]`   Test: submit button disabled while `isAutoStarting` or `isCreatingProject` is true
    *   `[ ]`   Test: error toast shown on `createProjectAndAutoStart` failure, form remains visible
    *   `[ ]`   Test: `fetchAIModelCatalog` called on mount
    *   `[ ]`   Existing tests continue to pass (current submit behavior matches the "Configure Manually" checked path)
  *   `[ ]`   `construction`
    *   `[ ]`   Add `useState<boolean>(false)` for `configureManually` and `useState<boolean>(true)` for `startGeneration`
    *   `[ ]`   Add `useEffect` on mount: call `fetchAIModelCatalog()` to preload catalog for default model resolution and auto-uncheck logic
    *   `[ ]`   Add `useEffect` watching `defaultModels` and `walletInfo`: if catalog loaded and `defaultModels.length === 0`, set `startGeneration: false` and display `'No default models available'`; if `Number(walletInfo.balance ?? '0') < STAGE_BALANCE_THRESHOLDS['thesis']`, set `startGeneration: false` and display `'Wallet balance too low for auto-start'`
    *   `[ ]`   Modified `onSubmit`:
          - If `configureManually`: call `createDialecticProject(payload)` → on success, `navigate(`/dialectic/${response.data.id}`)`
          - If `!configureManually`: call `createProjectAndAutoStart(payload)` → on success, navigate to `/dialectic/${result.projectId}/session/${result.sessionId}` with `state: { autoStartGeneration: startGeneration && result.hasDefaultModels }` if applicable
    *   `[ ]`   Loader display: when `isAutoStarting`, show `autoStartStep` text in place of or alongside submit button
    *   `[ ]`   Submit button disabled when `isAutoStarting || isCreatingProject`
  *   `[ ]`   `CreateDialecticProjectForm.tsx`
    *   `[ ]`   Add imports: `selectDefaultGenerationModels` from `@paynless/store`, `STAGE_BALANCE_THRESHOLDS` from `@paynless/types`
    *   `[ ]`   Add store reads: `autoStartStep`, `isAutoStarting`, `fetchAIModelCatalog`, `createProjectAndAutoStart` from `useDialecticStore`
    *   `[ ]`   Add wallet read: `selectActiveChatWalletInfo` via `useWalletStore`
    *   `[ ]`   Add default models read: `selectDefaultGenerationModels` from dialectic store
    *   `[ ]`   Add local state: `configureManually`, `startGeneration`
    *   `[ ]`   Add mount effect for `fetchAIModelCatalog`
    *   `[ ]`   Add auto-uncheck effect watching default models and wallet info
    *   `[ ]`   Render "Configure Manually" checkbox with label
    *   `[ ]`   Render "Start Generation" checkbox conditionally with label and auto-uncheck explanation text
    *   `[ ]`   Modify `onSubmit` to branch on `configureManually`
    *   `[ ]`   Add loader state display reading `autoStartStep`
    *   `[ ]`   Disable submit button when `isAutoStarting || isCreatingProject`
  *   `[ ]`   `directionality`
    *   `[ ]`   Frontend component layer
    *   `[ ]`   Dependencies inward: store actions (`createProjectAndAutoStart`, `createDialecticProject`, `fetchAIModelCatalog`), selectors (`selectDefaultGenerationModels`, `selectActiveChatWalletInfo`), types (`STAGE_BALANCE_THRESHOLDS`, `CreateProjectPayload`)
    *   `[ ]`   Provides outward: user interaction surface for project creation with automated or manual flow selection
  *   `[ ]`   `requirements`
    *   `[ ]`   "Configure Manually" checkbox controls flow branching — checked uses legacy, unchecked uses auto-start
    *   `[ ]`   "Start Generation" checkbox controls `autoStartGeneration` flag in navigation state — only visible when auto-start enabled
    *   `[ ]`   Auto-uncheck fires when catalog loaded with no defaults or wallet balance insufficient for thesis stage
    *   `[ ]`   Progressive loader states display `autoStartStep` text during `createProjectAndAutoStart`
    *   `[ ]`   Submit button disabled during async operations
    *   `[ ]`   Error handling: toast on failure, remain on form for retry
    *   `[ ]`   Legacy flow unchanged when "Configure Manually" is checked
    *   `[ ]`   `fetchAIModelCatalog` called on mount for catalog preloading
    *   `[ ]`   All new and existing tests pass

*   `[ ]`   [UI] apps/web/src/pages/DialecticSessionDetailsPage **Add auto-start generation effect**
  *   `[ ]`   `objective`
    *   `[ ]`   Add effect that detects `location.state?.autoStartGeneration === true` after session page mounts and context loads via `activateProjectAndSessionContextForDeepLink`
    *   `[ ]`   Call `autoStartGeneration` store action exactly once, guarded by a `useRef` to prevent double-firing across re-renders
    *   `[ ]`   Clear the auto-start flag via `navigate(location.pathname, { replace: true, state: {} })` regardless of success/failure — prevents re-trigger on page refresh
    *   `[ ]`   On failure, user lands on a functional session page and can retry manually via the Generate button
  *   `[ ]`   `role`
    *   `[ ]`   Frontend page component — session detail view with optional one-time auto-start trigger
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic session details: auto-start generation on first load from automated flow
    *   `[ ]`   Boundary: reads `location.state`, waits for store context hydration, calls store action, clears navigation state
  *   `[ ]`   `deps`
    *   `[ ]`   `autoStartGeneration` — new store action from node 6 (new import via `useDialecticStore`)
    *   `[ ]`   `activateProjectAndSessionContextForDeepLink` — existing store action (already used at line ~27)
    *   `[ ]`   `selectSelectedModels` from `@paynless/store` — for readiness check (new import)
    *   `[ ]`   `useLocation` from `react-router-dom` — for reading `location.state` (new import, currently only `useParams` and `Link` are imported)
    *   `[ ]`   `useNavigate` from `react-router-dom` — for clearing auto-start flag (new import)
    *   `[ ]`   `useRef` from React — for single-fire guard (add to existing `React` import at line ~1)
    *   `[ ]`   Store state: `activeSessionDetail`, `currentProjectDetail`, `activeContextSessionId` — already read via `useDialecticStore` inline selectors
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: `location.state?.autoStartGeneration === true` — set by `CreateDialecticProjectForm` during auto-start navigation
    *   `[ ]`   Readiness check: `activeSessionDetail` populated, `currentProjectDetail` populated, `activeContextSessionId` populated, `selectedModels.length > 0` — all set by `activateProjectAndSessionContextForDeepLink`
    *   `[ ]`   Action: call `autoStartGeneration()` exactly once
    *   `[ ]`   Cleanup: `navigate(location.pathname, { replace: true, state: {} })` — replaces current history entry with cleared state
    *   `[ ]`   No concrete imports from higher or lateral layers
  *   `[ ]`   unit/`DialecticSessionDetailsPage.test.tsx`
    *   `[ ]`   Test: auto-start effect fires `autoStartGeneration` when `location.state.autoStartGeneration === true` and all context is loaded
    *   `[ ]`   Test: auto-start effect does NOT fire when `location.state.autoStartGeneration` is absent or `false`
    *   `[ ]`   Test: auto-start effect fires exactly once — ref guard prevents repeat calls on re-render
    *   `[ ]`   Test: `navigate` called with `{ replace: true, state: {} }` to clear the flag after auto-start attempt
    *   `[ ]`   Test: page remains functional after auto-start failure (session detail renders, Generate button available)
    *   `[ ]`   Test: auto-start does NOT fire if context is not yet loaded (waits for `activeSessionDetail`, `selectedModels`, etc.)
    *   `[ ]`   Existing tests continue to pass (they mock `useParams` without `location.state`, so auto-start is not triggered)
  *   `[ ]`   `construction`
    *   `[ ]`   Add `useLocation` and `useNavigate` to `react-router-dom` import (line ~2, alongside existing `useParams` and `Link`)
    *   `[ ]`   Add `useRef` to React import (line ~1, alongside existing `useEffect`)
    *   `[ ]`   Add `autoStartGeneration` store action access: `const autoStartGeneration = useDialecticStore((state) => state.autoStartGeneration);`
    *   `[ ]`   Add `selectedModels` read: `const selectedModels = useDialecticStore(selectSelectedModels);` or inline selector
    *   `[ ]`   Add `const location = useLocation();` and `const navigate = useNavigate();`
    *   `[ ]`   Add `const autoStartAttemptedRef = useRef<boolean>(false);`
    *   `[ ]`   Add new `useEffect`:
          - Guard: `if (!location.state?.autoStartGeneration || autoStartAttemptedRef.current) return;`
          - Readiness: `if (!activeSessionDetail || !currentProjectDetail || !activeContextSessionId || selectedModels.length === 0) return;`
          - Set `autoStartAttemptedRef.current = true;`
          - Async IIFE: `(async () => { await autoStartGeneration(); navigate(location.pathname, { replace: true, state: {} }); })();`
    *   `[ ]`   Effect dependencies: `location.state`, `activeSessionDetail`, `currentProjectDetail`, `activeContextSessionId`, `selectedModels`, `autoStartGeneration`, `navigate`, `location.pathname`
  *   `[ ]`   `DialecticSessionDetailsPage.tsx`
    *   `[ ]`   Update `react-router-dom` import (line ~2): add `useLocation`, `useNavigate` alongside existing `useParams`, `Link`
    *   `[ ]`   Update React import (line ~1): add `useRef` alongside existing `useEffect`
    *   `[ ]`   Add `autoStartGeneration` from `useDialecticStore`
    *   `[ ]`   Add `selectedModels` read from `useDialecticStore` (via `selectSelectedModels` import from `@paynless/store`)
    *   `[ ]`   Add `const location = useLocation();`
    *   `[ ]`   Add `const navigate = useNavigate();`
    *   `[ ]`   Add `const autoStartAttemptedRef = useRef(false);`
    *   `[ ]`   Add new `useEffect` for auto-start logic as described in construction
    *   `[ ]`   No changes to existing render logic, other effects, or component structure
  *   `[ ]`   `directionality`
    *   `[ ]`   Frontend page layer
    *   `[ ]`   Dependencies inward: store actions (`autoStartGeneration`, `activateProjectAndSessionContextForDeepLink`), selectors (`selectSelectedModels`), store state, `react-router-dom` hooks
    *   `[ ]`   Provides outward: user interaction surface for session detail view with one-time auto-start capability
  *   `[ ]`   `requirements`
    *   `[ ]`   Auto-start effect fires exactly once when `location.state.autoStartGeneration === true` and all context is loaded
    *   `[ ]`   `useRef` guard prevents double-firing across re-renders and React strict mode
    *   `[ ]`   Flag cleared via `navigate(pathname, { replace: true, state: {} })` regardless of outcome
    *   `[ ]`   Page refresh after flag clear does NOT re-trigger generation
    *   `[ ]`   Failure is graceful: user lands on functional session page with Generate button available for manual retry
    *   `[ ]`   Existing page behavior unchanged when auto-start flag is not set
    *   `[ ]`   All new and existing tests pass
  *   `[ ]`   **Commit** `feat: automate project start with one-click create-to-generate flow`
    *   `[ ]`   `packages/types/src/dialectic.types.ts` — `is_default_generation: boolean` added to `AIModelCatalogEntry`; `autoStartStep`, `isAutoStarting`, `autoStartError` added to `DialecticStateValues`; `CreateProjectAutoStartResult` type added; `initialDialecticStateValues` updated
    *   `[ ]`   `packages/store/src/dialecticStore.selectors.ts` — `selectDefaultGenerationModels` selector added
    *   `[ ]`   `packages/store/src/dialecticStore.ts` — `createProjectAndAutoStart` and `autoStartGeneration` actions added
    *   `[ ]`   `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx` — "Configure Manually" and "Start Generation" checkboxes, modified `onSubmit` with flow branching, progressive loader states, `fetchAIModelCatalog` on mount, auto-uncheck logic
    *   `[ ]`   `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — auto-start effect with `useLocation`, `useRef` guard, `autoStartGeneration` call, flag cleanup via `navigate`
    *   `[ ]`   All related test files updated and new tests added: `dialecticStore.selectors.test.ts`, `dialecticStore.autostart.test.ts` (or existing session test file), `CreateDialecticProjectForm.test.tsx`, `DialecticSessionDetailsPage.test.tsx`

# ToDo

- New user sign in banner doesn't display, throws console error  
-- Chase, diagnose, fix 

- Generating spinner stays present until page refresh 
-- Needs to react to actual progress 
-- Stop the spinner when a condition changes 

- Refactor EMCAS to break apart the functions, segment out the tests
-- Move gatherArtifacts call to processSimpleJob
-- Decide where to measure & RAG

- Switch to stream-to-buffer instead of chunking
-- This lets us render the buffer in real time to show document progress 

- Build test fixtures for major function groups 
-- Provide standard mock factories and objects 
  
- Support user-provided API keys for their preferred providers 

- Regenerate existing document from user feedback & edits 

- Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
- Let the user pick/rate their preferred version and drop the others 

- Use a gentle color schema to differentiate model outputs visually / at a glance 

- When doc loads for the first time, position at top 

- Search across documents for key terms 

- Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

- Add optional outputs for selected stages
-- A "landing page" output for the proposal stage
--- Landing page
--- Hero banner
--- Call to action
--- Email sign up 
-- A "financial analysis" output for the "refinement" stage
--- 1/3/5 year 
--- Conservative / base / aggressive
--- IS, BS, CF 
-- A "generate next set of work" for the implementation stage 

- DynamicProgressBar uses formal names instead of friendly names
- SessionContributionsDisplayCard uses formal names instead of friendly names 
- SessionInfoCard uses formal names instead of friendly names 

- Move "Generate" button into StageRunCard left hand side where the icons are 

504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

n/n Done only hydrates on page refresh, not dynamic

Reloading page auto-advances stage, preventing edits & feedback from being submitted 
- But SessionInfoCard and GeneratedContributionsCard still think it's in a prior stage 
- SubmitResponses is never active even when a stage is completed, likely because it's auto-incrementing 

GeneratedContributionCard tries to display header_context, which it should never even acknowledge since it's not a document and isn't available to the FE 

StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
