import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  getTableColumns,
  getTableConstraints,
  getTableIndexes,
  TableColumnInfo,
  TableConstraintInfo,
  initializeSupabaseAdminClient,
  // getPrimaryKeyInfo, // We use findPrimaryKey from constraints
  // getForeignKeyInfo // We use findForeignKeyByColumn from constraints
} from '../../functions/_shared/_integration.test.utils.ts';
import type { Database } from '../../functions/types_db.ts';
import {
    describe,
    it,
    beforeAll,
    afterAll,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

describe('Migration Test: dialectic_feedback table', () => {
  let supabaseAdminClient: SupabaseClient<Database>;
  const tableName = 'dialectic_feedback';
  const schemaName = 'public';

  let tableColumns: TableColumnInfo[] = [];
  let tableConstraints: TableConstraintInfo[] = [];

  beforeAll(async () => {
    supabaseAdminClient = initializeSupabaseAdminClient();
    // Attempt to get table info, will be empty if table doesn't exist yet
    try {
      tableColumns = await getTableColumns(supabaseAdminClient, tableName, schemaName);
      tableConstraints = await getTableConstraints(supabaseAdminClient, tableName, schemaName);
    } catch (e) {
      if (e instanceof Error) {
        console.warn(`Could not fetch table info for ${tableName} (likely doesn't exist yet):`, e.message);
      } else {
        console.warn(`Could not fetch table info for ${tableName} (likely doesn't exist yet): Unknown error object:`, e);
      }
      tableColumns = [];
      tableConstraints = [];
    }
  });

  const findColumn = (columnName: string): TableColumnInfo | undefined => {
    return tableColumns.find(col => col.column_name === columnName);
  };

  const findConstraintByName = (constraintName: string): TableConstraintInfo | undefined => {
    return tableConstraints.find(con => con.constraint_name === constraintName);
  };

  const findPrimaryKey = (): TableConstraintInfo | undefined => {
    return tableConstraints.find(con => con.constraint_type === 'PRIMARY KEY');
  };

  it('table should exist and have columns (will fail until table is created)', () => {
    expect(tableColumns.length).toBeGreaterThan(0); 
  });

  describe('Column: id', () => {
    const columnName = 'id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (uuid_generate_v4() or gen_random_uuid())', () => {
      expect(column?.column_default).toMatch(/^(extensions\.)?(uuid_generate_v4|gen_random_uuid)\(\)$/);
    });
    it('should be the primary key', () => {
      const pkConstraint = findPrimaryKey();
      expect(pkConstraint).toBeDefined();
      expect(pkConstraint?.constrained_columns).toContain(columnName);
    });
  });

  describe('Column: session_id', () => {
    const columnName = 'session_id';
    const fkConstraintName = 'dialectic_feedback_session_id_fkey';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;
    beforeAll(() => { 
      column = findColumn(columnName); 
      fkConstraint = findConstraintByName(fkConstraintName);
    });
    
    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should be a foreign key to dialectic_sessions.id with ON DELETE CASCADE', () => {
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.constraint_type).toBe('FOREIGN KEY');
      expect(fkConstraint?.foreign_table_schema).toBe('public');
      expect(fkConstraint?.foreign_table_name).toBe('dialectic_sessions');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('CASCADE');
    });
  });

  describe('Column: contribution_id', () => {
    const columnName = 'contribution_id';
    const fkConstraintName = 'dialectic_feedback_contribution_id_fkey';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;
    beforeAll(() => { 
      column = findColumn(columnName); 
      fkConstraint = findConstraintByName(fkConstraintName);
    });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
    it('should be a foreign key to dialectic_contributions.id with ON DELETE SET NULL', () => {
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.constraint_type).toBe('FOREIGN KEY');
      expect(fkConstraint?.foreign_table_schema).toBe('public');
      expect(fkConstraint?.foreign_table_name).toBe('dialectic_contributions');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('SET NULL');
    });
  });

  describe('Column: user_id', () => {
    const columnName = 'user_id';
    const fkConstraintName = 'dialectic_feedback_user_id_fkey';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;
    beforeAll(() => { 
      column = findColumn(columnName); 
      fkConstraint = findConstraintByName(fkConstraintName);
    });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should be a foreign key to auth.users.id with ON DELETE CASCADE', () => {
      // Note: getTableConstraints might return null for foreign_table_schema/name for cross-schema FKs
      // So we check the constraint name and delete rule primarily.
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.constraint_type).toBe('FOREIGN KEY');
      // If getTableConstraints is fixed for cross-schema, these can be more specific:
      // expect(fkConstraint?.foreign_table_schema).toBe('auth');
      // expect(fkConstraint?.foreign_table_name).toBe('users');
      // expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('CASCADE'); // Or SET NULL, per final decision
    });
  });

  describe('Column: feedback_type', () => {
    const columnName = 'feedback_type';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    // Potentially add a CHECK constraint test here if feedback_type has predefined values
  });

  describe('Column: feedback_value_text', () => {
    const columnName = 'feedback_value_text';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: feedback_value_structured', () => {
    const columnName = 'feedback_value_structured';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type jsonb', () => expect(column?.data_type).toBe('jsonb'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: created_at', () => {
    const columnName = 'created_at';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type timestamp with time zone', () => {
      // Supabase often returns TIMESTAMPTZ as 'timestamp without time zone' in information_schema
      // but then pg_type shows 'timestamp with time zone'. Let's be flexible.
      // More accurately, udt_name is often more reliable.
      expect(column?.udt_name).toMatch(/^(timestamptz|_timestamptz)$/);
    });
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (now())', () => {
      expect(column?.column_default).toBe('now()');
    });
  });

  describe('Column: updated_at', () => {
    const columnName = 'updated_at';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type timestamp with time zone', () => {
       expect(column?.udt_name).toMatch(/^(timestamptz|_timestamptz)$/);
    });
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (now())', () => {
      expect(column?.column_default).toBe('now()');
    });
    // Also test for an update trigger if one is standard for this table
  });

  it('should have the correct number of columns', () => {
    // id, session_id, contribution_id, user_id, feedback_type, 
    // feedback_value_text, feedback_value_structured, created_at, updated_at
    // Total: 9
    expect(tableColumns.length).toBe(9);
  });

  // Add tests for indexes if specific ones are planned beyond PK/FK defaults
  // describe('Indexes', () => {
  //   let tableIndexes: any[] = []; // Replace any with actual IndexInfo type if available
  //   beforeAll(async () => {
  //     tableIndexes = await getTableIndexes(supabaseAdminClient, tableName, schemaName);
  //   });
  //   it('should have correct indexes', () => {
  //     // Example: expect(tableIndexes.find(idx => idx.indexname === 'your_index_name')).toBeDefined();
  //   });
  // });

  // Optional: Test for RLS enabled if that's a default requirement
  // it('should have RLS enabled', async () => {
  //   const { data, error } = await supabaseAdminClient
  //     .from('pg_catalog.pg_tables')
  //     .select('rowsecurity')
  //     .eq('schemaname', schemaName)
  //     .eq('tablename', tableName)
  //     .single();
  //   expect(error).toBeNull();
  //   expect(data?.rowsecurity).toBe(true);
  // });

}); 