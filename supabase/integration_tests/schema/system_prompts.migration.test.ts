// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import { initializeSupabaseAdminClient } from "../../functions/_shared/_integration.test.utils.ts";

describe("Migration: Update system_prompts table", () => {
  let supabaseAdmin: SupabaseClient<Database>;

  beforeAll(() => {
    // This test assumes that the necessary migrations (including the one
    // that alters system_prompts) have been applied to the test database
    // prior to running this test suite. This is typically handled by
    // an external script or by ensuring the local dev environment is up-to-date:
    // e.g., supabase start (if it applies all migrations)
    // or: supabase db reset && supabase migration up (or specific migration file)

    supabaseAdmin = initializeSupabaseAdminClient();
  });

  it("should have the system_prompts table with the correct new columns and constraints", async () => {
    // 1. Check Columns using RPC call
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'system_prompts' AND table_schema = 'public'
    `;
    const { data: columnsData, error: columnsError } = await supabaseAdmin
      .rpc('execute_sql', { query: columnsQuery });

    expect(columnsError).toBeNull();
    expect(columnsData).toBeInstanceOf(Array);
    if (columnsData) { // Type guard for columnsData
      expect(columnsData.length).toBeGreaterThan(0);
    }

    const columnMap = new Map(
      (columnsData as any[]).map((c) => [c.column_name, c]),
    );

    // --- Verify Existing Columns (mostly for sanity check) ---
    const idCol = columnMap.get("id");
    expect(idCol).toBeDefined();
    if(idCol) {
        expect(idCol.data_type).toBe("uuid");
        expect(idCol.is_nullable).toBe("NO");
    }

    const nameCol = columnMap.get("name");
    expect(nameCol).toBeDefined();
    if(nameCol) {
        expect(nameCol.data_type).toBe("text");
        expect(nameCol.is_nullable).toBe("NO");
    }

    const promptTextCol = columnMap.get("prompt_text");
    expect(promptTextCol).toBeDefined();
    if(promptTextCol) {
        expect(promptTextCol.data_type).toBe("text");
        expect(promptTextCol.is_nullable).toBe("NO");
    }
    
    const isActiveCol = columnMap.get("is_active");
    expect(isActiveCol).toBeDefined();
    if(isActiveCol) {
        expect(isActiveCol.data_type).toBe("boolean");
        expect(isActiveCol.is_nullable).toBe("NO");
        expect(isActiveCol.column_default).toBe("true");
    }

    const createdAtCol = columnMap.get("created_at");
    expect(createdAtCol).toBeDefined();
    if(createdAtCol) {
        expect(createdAtCol.data_type).toBe("timestamp with time zone");
    }

    const updatedAtCol = columnMap.get("updated_at");
    expect(updatedAtCol).toBeDefined();
    if(updatedAtCol) {
        expect(updatedAtCol.data_type).toBe("timestamp with time zone");
    }

    // --- Verify New Columns ---
    const stageAssociationCol = columnMap.get("stage_association");
    expect(stageAssociationCol).toBeDefined();
    if(stageAssociationCol) {
        expect(stageAssociationCol.data_type).toBe("text");
        expect(stageAssociationCol.is_nullable).toBe("YES");
    }

    const versionCol = columnMap.get("version");
    expect(versionCol).toBeDefined();
    if(versionCol) {
        expect(versionCol.data_type).toBe("integer");
        expect(versionCol.is_nullable).toBe("NO");
        expect(versionCol.column_default).toBe("1");
    }

    const descriptionCol = columnMap.get("description");
    expect(descriptionCol).toBeDefined();
    if(descriptionCol) {
        expect(descriptionCol.data_type).toBe("text");
        expect(descriptionCol.is_nullable).toBe("YES");
    }

    const variablesRequiredCol = columnMap.get("variables_required");
    expect(variablesRequiredCol).toBeDefined();
    if(variablesRequiredCol) {
        expect(variablesRequiredCol.data_type).toBe("jsonb");
        expect(variablesRequiredCol.is_nullable).toBe("YES");
    }

    const isStageDefaultCol = columnMap.get("is_stage_default");
    expect(isStageDefaultCol).toBeDefined();
    if(isStageDefaultCol) {
        expect(isStageDefaultCol.data_type).toBe("boolean");
        expect(isStageDefaultCol.is_nullable).toBe("NO");
        expect(isStageDefaultCol.column_default).toBe("false");
    }
    
    const contextCol = columnMap.get("context");
    expect(contextCol).toBeDefined();
    if(contextCol) {
        expect(contextCol.data_type).toBe("text");
        expect(contextCol.is_nullable).toBe("YES");
    }

    // 2. Check UNIQUE constraint on 'name' using RPC call
    const constraintQuery = `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'system_prompts'
        AND table_schema = 'public'
        AND constraint_type = 'UNIQUE'
    `;
    const { data: constraintData, error: constraintError } = await supabaseAdmin
      .rpc('execute_sql', { query: constraintQuery });

    expect(constraintError).toBeNull();
    expect(constraintData).toBeInstanceOf(Array);

    const nameConstraintInfo = (constraintData as any[]).find(c => 
      c.constraint_name.includes("name") && 
      (c.constraint_name.includes("_key") || c.constraint_name.includes("_uq") || c.constraint_name.includes("_unique"))
    );
    expect(nameConstraintInfo).toBeDefined();
  });
}); 