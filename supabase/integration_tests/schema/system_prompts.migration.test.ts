// @deno-types="npm:@types/chai@4.3.1"
import { expect } from "npm:chai@4.3.7";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../functions/types_db.ts";
import { initializeSupabaseAdminClient } from "../../functions/chat/_integration.test.utils.ts";

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
      .rpc('execute_sql', { query: columnsQuery }); // Reverted to query

    expect(columnsError).to.be.null;
    expect(columnsData).to.be.an("array").that.is.not.empty;

    const columnMap = new Map(
      (columnsData as any[]).map((c) => [c.column_name, c]),
    );

    // --- Verify Existing Columns (mostly for sanity check) ---
    const idCol = columnMap.get("id");
    expect(idCol, "Column 'id' should exist").to.exist;
    expect(idCol.data_type).to.equal("uuid");
    expect(idCol.is_nullable).to.equal("NO");

    const nameCol = columnMap.get("name");
    expect(nameCol, "Column 'name' should exist").to.exist;
    expect(nameCol.data_type).to.equal("text");
    expect(nameCol.is_nullable).to.equal("NO");

    const promptTextCol = columnMap.get("prompt_text");
    expect(promptTextCol, "Column 'prompt_text' should exist").to.exist;
    expect(promptTextCol.data_type).to.equal("text");
    expect(promptTextCol.is_nullable).to.equal("NO");
    
    const isActiveCol = columnMap.get("is_active");
    expect(isActiveCol, "Column 'is_active' should exist").to.exist;
    expect(isActiveCol.data_type).to.equal("boolean");
    expect(isActiveCol.is_nullable).to.equal("NO");
    expect(isActiveCol.column_default).to.equal("true");

    const createdAtCol = columnMap.get("created_at");
    expect(createdAtCol, "Column 'created_at' should exist").to.exist;
    // Note: data_type for timestamptz can appear as "timestamp with time zone"
    expect(createdAtCol.data_type).to.equal("timestamp with time zone");

    const updatedAtCol = columnMap.get("updated_at");
    expect(updatedAtCol, "Column 'updated_at' should exist").to.exist;
    expect(updatedAtCol.data_type).to.equal("timestamp with time zone");

    // --- Verify New Columns ---
    const stageAssociationCol = columnMap.get("stage_association");
    expect(stageAssociationCol, "New column 'stage_association' should exist").to.exist;
    expect(stageAssociationCol.data_type).to.equal("text");
    expect(stageAssociationCol.is_nullable).to.equal("YES");

    const versionCol = columnMap.get("version");
    expect(versionCol, "New column 'version' should exist").to.exist;
    expect(versionCol.data_type).to.equal("integer");
    expect(versionCol.is_nullable).to.equal("NO");
    expect(versionCol.column_default).to.equal("1");

    const descriptionCol = columnMap.get("description");
    expect(descriptionCol, "New column 'description' should exist").to.exist;
    expect(descriptionCol.data_type).to.equal("text");
    expect(descriptionCol.is_nullable).to.equal("YES");

    const variablesRequiredCol = columnMap.get("variables_required");
    expect(variablesRequiredCol, "New column 'variables_required' should exist").to.exist;
    expect(variablesRequiredCol.data_type).to.equal("jsonb");
    expect(variablesRequiredCol.is_nullable).to.equal("YES");

    const isStageDefaultCol = columnMap.get("is_stage_default");
    expect(isStageDefaultCol, "New column 'is_stage_default' should exist").to.exist;
    expect(isStageDefaultCol.data_type).to.equal("boolean");
    expect(isStageDefaultCol.is_nullable).to.equal("NO");
    expect(isStageDefaultCol.column_default).to.equal("false");
    
    const contextCol = columnMap.get("context");
    expect(contextCol, "New column 'context' should exist").to.exist;
    expect(contextCol.data_type).to.equal("text");
    expect(contextCol.is_nullable).to.equal("YES");

    // 2. Check UNIQUE constraint on 'name' using RPC call
    const constraintQuery = `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'system_prompts'
        AND table_schema = 'public'
        AND constraint_type = 'UNIQUE'
    `;
    const { data: constraintData, error: constraintError } = await supabaseAdmin
      .rpc('execute_sql', { query: constraintQuery }); // Reverted to query

    expect(constraintError).to.be.null;
    expect(constraintData).to.be.an("array");

    const nameConstraintInfo = (constraintData as any[]).find(c => 
      c.constraint_name.includes("name") && 
      (c.constraint_name.includes("_key") || c.constraint_name.includes("_uq") || c.constraint_name.includes("_unique"))
    );
    expect(nameConstraintInfo, "A unique constraint involving the 'name' column should exist (e.g., system_prompts_name_key)").to.exist;
  });
}); 