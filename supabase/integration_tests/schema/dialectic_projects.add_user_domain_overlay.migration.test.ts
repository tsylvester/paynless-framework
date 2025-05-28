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
import { 
    initializeSupabaseAdminClient, 
    getTableColumns,
    TableColumnInfo,
} from "../../functions/chat/_integration.test.utils.ts";

describe("Schema Migration: dialectic_projects Table - Add user_domain_overlay_values", () => {
  let supabaseAdmin: SupabaseClient<Database>;

  beforeAll(() => {
    supabaseAdmin = initializeSupabaseAdminClient();
    // It's assumed migrations (including the one that created dialectic_projects)
    // have been run prior to this specific column addition test.
  });

  const tableName = "dialectic_projects";
  const columnName = "user_domain_overlay_values";

  it("dialectic_projects table should exist (pre-requisite)", async () => {
    const columns: TableColumnInfo[] = await getTableColumns(supabaseAdmin, tableName, 'public');
    expect(columns.length, `Table '${tableName}' should exist and have columns.`).to.be.greaterThan(0);
  });

  it(`should have the column '${columnName}' with correct type and properties`, async () => {
    const columns: TableColumnInfo[] = await getTableColumns(supabaseAdmin, tableName, 'public');
    const column = columns.find((c: TableColumnInfo) => c.column_name === columnName);

    expect(column, `Column '${columnName}' not found in table '${tableName}'.`).to.exist;
    if (column) {
      expect(column.data_type, `Column '${columnName}' data type mismatch.`).to.equal("jsonb");
      expect(column.is_nullable, `Column '${columnName}' nullability mismatch.`).to.equal("YES");
      expect(column.column_default, `Column '${columnName}' should have no default value.`).to.be.null;
    }
  });
}); 