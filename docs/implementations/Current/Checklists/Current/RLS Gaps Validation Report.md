# RLS Gaps Validation Report

Validates that enabling RLS on the flagged tables will not break the application. Traces all code paths that touch these tables and verifies client role (admin/service_role vs user JWT).

## Strategy: Authenticated Read for All Dialectic Tables

The dialectic tables form a COW (Copy-on-Write) DAG that will eventually be released to users. Building RLS against admin-only now would require rework later. **Set up RLS with authenticated read policies from the start** so user access works when released.

- **service_role** bypasses RLS → admin/worker operations continue unchanged
- **authenticated** gets SELECT via policy → user clients (getStageRecipe, future user access) work now and later

## Summary

| Table/View | Action Required |
|------------|-----------------|
| `v_pending_membership_requests` | Separate remediation: auth_users_exposed, security_definer |
| `dialectic_document_templates` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_recipe_templates` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_recipe_template_steps` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_recipe_template_edges` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_stage_recipe_instances` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_stage_recipe_steps` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |
| `dialectic_stage_recipe_edges` | Enable RLS + `FOR SELECT TO authenticated USING (true)` |

---

## 1. v_pending_membership_requests (View)

**Linter issues:** auth_users_exposed, security_definer_view

**Usage:**
- `supabase/functions/organizations/invites.ts` → `handleListPending` (lines 617–618)
- Client: **User JWT** (`createSupabaseClient(req)` → anon key + Authorization header)

**RLS impact:** The view is SECURITY DEFINER, so it runs with the view owner's privileges and bypasses RLS on underlying tables. Enabling RLS on `organization_members` does not affect this view.

**Remediation (separate from RLS):**
- auth_users_exposed: View joins `auth.users` and exposes `email` to authenticated. **Preferred fix:** Invite-only lookup backend function that separates the user action from the database action — backend accepts invitee email, performs lookup and send internally, returns generic "invite sent" without revealing whether the user existed. Reduces invite-enumeration risk. (Multi-tenant mothballed for now; implement when re-enabling.)
- security_definer_view: Document why SECURITY DEFINER is required, or refactor to avoid it.

---

## 2. dialectic_document_templates

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `assemblePlannerPrompt.ts` (via PromptAssembler) | Admin | dialectic-worker → adminClient |
| `document_renderer.ts` | Admin | processRenderJob → dialectic-worker → adminClient |
| `seed_prompt_templates.ts` | N/A | Script (not app runtime) |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — reference data, future user access.

---

## 3. dialectic_recipe_templates

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| `handle_job_completion.integration.test.ts` | Admin | adminClient |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, future user access.

---

## 4. dialectic_recipe_template_steps

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| `getAllStageProgress.ts` | Admin | dialectic-service → adminClient |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, future user access.

---

## 5. dialectic_recipe_template_edges

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, future user access.

---

## 6. dialectic_stage_recipe_instances

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| `generateContribution.ts` | Admin | dialectic-service → adminClient |
| `getAllStageProgress.ts` | Admin | dialectic-service → adminClient |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, future user access.

---

## 7. dialectic_stage_recipe_steps

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| `getAllStageProgress.ts` | Admin | dialectic-service → adminClient |
| **`getStageRecipe.ts`** | **User JWT** | **dialectic-service → userClient** |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, getStageRecipe already uses userClient.

**Note:** `getStageRecipe` is not in `actionsRequiringAuth`; it can be called with or without a token. With the authenticated policy, only authenticated callers see rows. If unauthenticated access is needed later, add `TO anon` to the policy.

---

## 8. dialectic_stage_recipe_edges

**Usage:**

| Location | Client | How |
|----------|--------|-----|
| `processComplexJob.ts` | Admin | dialectic-worker → adminClient |
| Migrations | N/A | Direct INSERT |

**Policy:** `FOR SELECT TO authenticated USING (true)` — COW DAG, future user access.

---

## Client Architecture Summary

| Function/Service | Client Type | Creation |
|------------------|-------------|----------|
| dialectic-worker | Admin (service_role) | `createSupabaseAdminClient()` |
| dialectic-service (most handlers) | Admin | `adminClient` |
| dialectic-service (getStageRecipe, fetchProcessTemplate, listProjects, getProjectDetails) | User JWT | `getSupabaseClient(authToken)` → anon key + Bearer token |
| organizations (invites, members, etc.) | User JWT | `createSupabaseClient(req)` → anon key + Authorization header |

---

## Recommended Migration

Create a single migration that:

1. Enables RLS on all 7 dialectic tables.
2. Adds `FOR SELECT TO authenticated USING (true)` on each.

Example per table:

```sql
ALTER TABLE public.dialectic_document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dialectic_document_templates_authenticated_select"
  ON public.dialectic_document_templates FOR SELECT TO authenticated USING (true);
-- Repeat for: dialectic_recipe_templates, dialectic_recipe_template_steps,
-- dialectic_recipe_template_edges, dialectic_stage_recipe_instances,
-- dialectic_stage_recipe_steps, dialectic_stage_recipe_edges
```

**v_pending_membership_requests:** Handle auth_users_exposed and security_definer separately (view definition changes, not RLS).
