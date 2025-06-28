import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  getTableColumns,
  getTableConstraints,
  TableColumnInfo,
  TableConstraintInfo,
  initializeSupabaseAdminClient,
  getTriggersForTable, // Assuming this is available or we create a similar one
  getTableIndexes, // Assuming this is available or we create a similar one
  getForeignKeyInfo, // Assuming this is available or we create a similar one
  getUniqueConstraintInfo, // Assuming this is available or we create a similar one
  getPrimaryKeyInfo, // Assuming this is available or we create a similar one
  isRLSEnabled // Assuming this is available or we create a similar one
} from '../../functions/_shared/_integration.test.utils.ts';
import type { Database } from '../../functions/types_db.ts';
import {
    describe,
    it,
    beforeAll,
    // afterAll, // Not used in the example for cleanup
} from 'https://deno.land/std@0.208.0/testing/bdd.ts'; // Matched version from example
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts"; // Matched version from example

let supabase: SupabaseClient<Database>;

describe('Migration Test: dialectic_session_prompts table', () => {
  const tableName = 'dialectic_session_prompts';
  const schemaName = 'public';
  let columns: TableColumnInfo[];
  let constraints: TableConstraintInfo[];
  let triggers: any[]; // Define types if available from utils
  let indexes: any[];  // Define types if available from utils
  let fks: any[];
  let uniqueConstraintsInfo: any[];
  let primaryKeyInfo: any[];
  let rlsEnabled: boolean | undefined;


  beforeAll(async () => {
    supabase = initializeSupabaseAdminClient();
    // These might need to be called with `await` if they are async
    columns = await getTableColumns(supabase, tableName, schemaName);
    constraints = await getTableConstraints(supabase, tableName, schemaName); // General constraints
    
    // Specific calls if the generic getTableConstraints doesn't cover all details needed
    // or if we prefer the specific RPC-like calls used in the original test
    triggers = await getTriggersForTable(supabase, tableName, schemaName); 
    indexes = await getTableIndexes(supabase, tableName, schemaName);
    fks = await getForeignKeyInfo(supabase, tableName, schemaName);
    uniqueConstraintsInfo = await getUniqueConstraintInfo(supabase, tableName, schemaName);
    primaryKeyInfo = await getPrimaryKeyInfo(supabase, tableName, schemaName);
    rlsEnabled = await isRLSEnabled(supabase, tableName, schemaName);
  });

  it('table should exist and have correct number of columns', () => {
    expect(columns.length).toBeGreaterThan(0);
    // Add specific column count check if desired, e.g. assertEquals(columns.length, 8)
  });

  const findColumn = (name: string) => columns.find(c => c.column_name === name);
  // const findConstraintByType = (type: TableConstraintInfo['constraint_type']) => constraints.filter(c => c.constraint_type === type);
  // const findForeignKeyByColumn = (columnName: string) => 
  //   constraints.find(c => c.constraint_type === 'FOREIGN KEY' && c.constrained_columns.includes(columnName));

  describe('Column Definitions', () => {
    const expectedColumns: Partial<TableColumnInfo>[] = [
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'uuid_generate_v4()' },
      { column_name: 'session_id', data_type: 'uuid', is_nullable: 'NO', column_default: null },
      { column_name: 'system_prompt_id', data_type: 'uuid', is_nullable: 'YES', column_default: null },
      { column_name: 'stage_association', data_type: 'text', is_nullable: 'NO', udt_name: 'text', column_default: null },
      { column_name: 'rendered_prompt_text', data_type: 'text', is_nullable: 'NO', udt_name: 'text', column_default: null },
      { column_name: 'iteration_number', data_type: 'integer', is_nullable: 'NO', udt_name: 'int4', column_default: '1' },
      { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO', udt_name: 'timestamptz', column_default: 'now()' },
      { column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO', udt_name: 'timestamptz', column_default: 'now()' },
    ];

    it('should have the correct number of columns', () => {
        expect(columns.length).toBe(expectedColumns.length);
    });

    expectedColumns.forEach(expectedCol => {
      it(`Column: ${expectedCol.column_name} - should be correctly defined`, () => {
        const column = findColumn(expectedCol.column_name!);
        expect(column).toBeDefined();
        expect(column?.data_type).toBe(expectedCol.data_type);
        expect(column?.is_nullable).toBe(expectedCol.is_nullable);
        if (expectedCol.column_default !== undefined && expectedCol.column_default !== null) {
            expect(column?.column_default).not.toBeNull();
            // For defaults like now() or uuid_generate_v4(), we check for presence or a substring 
            // as the exact representation can vary.
            if (expectedCol.column_default === 'uuid_generate_v4()' || expectedCol.column_default === 'now()') {
                expect(column?.column_default).toContain(expectedCol.column_default.substring(0, expectedCol.column_default.indexOf('(')));
            } else {
                expect(column?.column_default).toContain(expectedCol.column_default);
            }
        } else {
            expect(column?.column_default).toBeNull();
        }
        if (expectedCol.udt_name) {
          expect(column?.udt_name).toBe(expectedCol.udt_name);
        }
      });
    });
  });

  it('Primary key should be on id', () => {
    // Uses specific info from getPrimaryKeyInfo
    expect(primaryKeyInfo).toBeDefined();
    expect(primaryKeyInfo.length).toBe(1);
    expect(primaryKeyInfo[0].column_name).toBe('id');
  });

  describe('Foreign Keys', () => {
    const expectedFKs = [
      {
        fk_column: 'session_id',
        referenced_table: 'dialectic_sessions',
        referenced_column: 'id',
        delete_rule: 'CASCADE',
      },
      {
        fk_column: 'system_prompt_id',
        referenced_table: 'system_prompts',
        referenced_column: 'id',
        delete_rule: 'SET NULL',
      },
    ];
    it('should have the correct number of foreign keys', () => {
        expect(fks.length).toBe(expectedFKs.length);
    });

    expectedFKs.forEach(expectedFk => {
      it(`FK on ${expectedFk.fk_column} should be correct`, () => {
        const actualFk = fks.find(fk => fk.foreign_key_column === expectedFk.fk_column);
        expect(actualFk).toBeDefined();
        expect(actualFk.referenced_table_name).toBe(expectedFk.referenced_table);
        expect(actualFk.referenced_column_name).toBe(expectedFk.referenced_column);
        expect(actualFk.delete_rule).toBe(expectedFk.delete_rule);
      });
    });
  });

  it('UNIQUE constraint on (session_id, stage_association, iteration_number) should exist', () => {
    expect(uniqueConstraintsInfo).toBeDefined();
    const targetConstraint = uniqueConstraintsInfo.find((uc: any) => 
      uc.constraint_name === 'dialectic_session_prompts_session_id_stage_association_iter_key' &&
      uc.column_names.includes('session_id') &&
      uc.column_names.includes('stage_association') &&
      uc.column_names.includes('iteration_number') &&
      uc.column_names.length === 3
    );
    expect(targetConstraint).toBeDefined();
  });

  it('RLS should be enabled', () => {
    expect(rlsEnabled).toBe(true);
  });

  it('updated_at column should have an update trigger calling handle_updated_at', () => {
    expect(triggers).toBeDefined();
    const updateTrigger = triggers.find(
        (trg: any) => trg.event_manipulation === 'UPDATE' && trg.action_timing === 'BEFORE'
    );
    expect(updateTrigger).toBeDefined();
    expect(updateTrigger.action_statement).toContain('handle_updated_at');
  });

  describe('Indexes', () => {
    it('should have a primary key index', () => {
        const pkIndex = indexes.find((idx: any) => idx.indexname.endsWith('_pkey'));
        expect(pkIndex).toBeDefined();
    });
    it('should have an index for the unique constraint', () => {
        const uniqueConstraintIndex = indexes.find((idx: any) => idx.indexname === 'dialectic_session_prompts_session_id_stage_association_iter_key');
        expect(uniqueConstraintIndex).toBeDefined();
    });
    it('should have an index on session_id (FK)', () => {
        // This checks if an index definition CONTAINS '(session_id)'. 
        // More robustly, one might check pg_indexes.indexdef directly or ensure the first column of an index is session_id.
        // For simplicity with assumed helper: relies on getIndexesForTable providing usable info.
        const sessionIdIndex = indexes.find((idx: any) => idx.indexdef?.includes('(session_id)'));
        expect(sessionIdIndex).toBeDefined();
    });
     it('should have an index on system_prompt_id (FK)', () => {
        const systemPromptIdIndex = indexes.find((idx: any) => idx.indexdef?.includes('(system_prompt_id)'));
        expect(systemPromptIdIndex).toBeDefined();
    });
  });
  
  // No specific check for Stage Association CHECK constraint as it's not in the current SQL migration.
}); 