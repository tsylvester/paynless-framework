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
import { 
    initializeSupabaseAdminClient, 
    getTableColumns,
    TableColumnInfo,
} from "../../functions/_shared/_integration.test.utils.ts";

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
    expect(columns.length).toBeGreaterThan(0);
  });

  it(`should have the column '${columnName}' with correct type and properties`, async () => {
    const columns: TableColumnInfo[] = await getTableColumns(supabaseAdmin, tableName, 'public');
    const column = columns.find((c: TableColumnInfo) => c.column_name === columnName);

    expect(column).toBeDefined();
    if (column) {
      expect(column.data_type).toBe("jsonb");
      expect(column.is_nullable).toBe("YES");
      expect(column.column_default).toBeNull();
    }
  });
}); 