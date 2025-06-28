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
    getTableConstraints, 
    getTableIndexes, 
    TableColumnInfo, 
    TableConstraintInfo, 
    // IndexInfo, // Not strictly used in the active part of this test yet
} from "../../functions/_shared/_integration.test.utils.ts";

describe("Schema Migration: domain_specific_prompt_overlays Table", () => {
  let supabaseAdmin: SupabaseClient<Database>;

  beforeAll(() => {
    supabaseAdmin = initializeSupabaseAdminClient();
    // Note: It's assumed that migrations will be run SEPARATELY by the developer 
    // before running this test suite, or as part of a CI/CD step.
    // This test suite VALIDATES the result of the migration.
  });

  const tableName = "domain_specific_prompt_overlays";

  it("should have the correct columns and types", async () => {
    const columns: TableColumnInfo[] = await getTableColumns(supabaseAdmin, tableName, 'public');

    // Define a type for the expected structure to satisfy TypeScript
    type ExpectedColumnsSpec = {
        [key: string]: {
            type: string;
            is_nullable: "YES" | "NO";
            default: string | null;
        }
    };

    const expectedColumns: ExpectedColumnsSpec = {
      id: { type: "uuid", is_nullable: "NO", default: "gen_random_uuid()" },
      system_prompt_id: { type: "uuid", is_nullable: "NO", default: null },
      domain_tag: { type: "text", is_nullable: "NO", default: null },
      overlay_values: { type: "jsonb", is_nullable: "NO", default: null },
      description: { type: "text", is_nullable: "YES", default: null },
      is_active: { type: "boolean", is_nullable: "NO", default: "true" },
      version: { type: "integer", is_nullable: "NO", default: "1" },
      created_at: { type: "timestamp with time zone", is_nullable: "NO", default: "now()" },
      updated_at: { type: "timestamp with time zone", is_nullable: "NO", default: "now()" },
    };

    for (const columnName in expectedColumns) {
      const column = columns.find((c: TableColumnInfo) => c.column_name === columnName);
      expect(column).toBeDefined();
      if (column) {
        const expectedSpec = expectedColumns[columnName];
        expect(column.data_type).toBe(expectedSpec.type);
        expect(column.is_nullable).toBe(expectedSpec.is_nullable);
        if (expectedSpec.default !== null) {
          expect(column.column_default).toBe(expectedSpec.default);
        }
      }
    }
  });

  it("should have correct foreign key constraints", async () => {
    const constraints: TableConstraintInfo[] = await getTableConstraints(supabaseAdmin, tableName, 'public');
    const fkConstraints = constraints.filter((c: TableConstraintInfo) => c.constraint_type === 'FOREIGN KEY');

    const expectedFKs = [
      {
        foreign_table_name: "system_prompts",
        constrained_columns: ["system_prompt_id"],
      },
    ];

    expect(fkConstraints.length).toBe(expectedFKs.length);

    for (const expectedFK of expectedFKs) {
      const fk = fkConstraints.find((k: TableConstraintInfo) => 
        k.foreign_table_name === expectedFK.foreign_table_name &&
        k.constrained_columns &&
        JSON.stringify(k.constrained_columns.sort()) === JSON.stringify(expectedFK.constrained_columns.sort())
      );
      expect(fk).toBeDefined();
    }
  });

  it("should have correct unique constraints", async () => {
    const constraints: TableConstraintInfo[] = await getTableConstraints(supabaseAdmin, tableName, 'public');
    const uqConstraints = constraints.filter((c: TableConstraintInfo) => c.constraint_type === 'UNIQUE');

    const expectedUQ = {
      name_suffix: "system_prompt_id_domain_tag_version_key",
      columns: ["system_prompt_id", "domain_tag", "version"].sort()
    };

    const uniqueConstraint = uqConstraints.find((c: TableConstraintInfo) => 
        (c.constraint_name.endsWith(expectedUQ.name_suffix) || 
        (c.constrained_columns && JSON.stringify(c.constrained_columns.sort()) === JSON.stringify(expectedUQ.columns)))
    );
    
    expect(uniqueConstraint).toBeDefined();
    if (uniqueConstraint && uniqueConstraint.constrained_columns) {
        expect(uniqueConstraint.constrained_columns.sort()).toEqual(expectedUQ.columns);
    }
  });

  it("should have a primary key constraint on id", async () => {
    const constraints: TableConstraintInfo[] = await getTableConstraints(supabaseAdmin, tableName, 'public');
    const pkConstraint = constraints.find((c: TableConstraintInfo) => c.constraint_type === 'PRIMARY KEY');

    expect(pkConstraint).toBeDefined();
    if (pkConstraint && pkConstraint.constrained_columns) {
      expect(pkConstraint.constrained_columns).toEqual(["id"]);
    }
  });

  // Optional: Test for specific indexes if they are critical beyond FK/UQ/PK
  // it("should have specific indexes", async () => {
  //   const indexes = await getTableIndexes(supabaseAdmin, tableName, 'public');
  //   // console.log("Indexes found:", JSON.stringify(indexes, null, 2));
    
  //   const expectedIndexes = [
  //     { name_suffix: "_pkey", columns: ["id"] }, // Primary key index
  //     { name_suffix: "_system_prompt_id_domain_tag_version_key", columns: ["system_prompt_id", "domain_tag", "version"] }, // Unique constraint index
  //     { name_suffix: "_system_prompt_id_idx", columns: ["system_prompt_id"] }, // Index for FK
  //     { name_suffix: "_domain_tag_idx", columns: ["domain_tag"] } // Index for filtering by domain_tag
  //   ];

  //   for (const expectedIndex of expectedIndexes) {
  //     const index = indexes.find(idx => 
  //       idx.indexname.endsWith(expectedIndex.name_suffix) &&
  //       JSON.stringify(idx.column_names.sort()) === JSON.stringify(expectedIndex.columns.sort())
  //     );
  //     expect(index).toBeDefined();
  //   }
  // });
}); 