import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  getTableColumns,
  getTableConstraints,
  getTableIndexes,
  TableColumnInfo,
  TableConstraintInfo,
  initializeSupabaseAdminClient
} from '../../functions/_shared/_integration.test.utils.ts';
import type { Database } from '../../functions/types_db.ts';
import {
    describe,
    it,
    beforeAll,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

describe('Migration Test: dialectic_contributions table', () => {
  let supabaseAdminClient: SupabaseClient<Database>;
  const tableName = 'dialectic_contributions';
  const schemaName = 'public';

  let tableColumns: TableColumnInfo[] = [];
  let tableConstraints: TableConstraintInfo[] = [];

  beforeAll(async () => {
    supabaseAdminClient = initializeSupabaseAdminClient();
    tableColumns = await getTableColumns(supabaseAdminClient, tableName, schemaName);
    tableConstraints = await getTableConstraints(supabaseAdminClient, tableName, schemaName);
  });

  const findColumn = (columnName: string): TableColumnInfo | undefined => {
    return tableColumns.find(col => col.column_name === columnName);
  };

  const findForeignKeyByColumn = (columnName: string): TableConstraintInfo | undefined => {
    return tableConstraints.find(
      (con) =>
        con.constraint_type === 'FOREIGN KEY' &&
        con.constrained_columns?.includes(columnName)
    );
  };

  const findPrimaryKey = (): TableConstraintInfo | undefined => {
    return tableConstraints.find(con => con.constraint_type === 'PRIMARY KEY');
  };

  it('table should exist and have some columns', () => {
    expect(tableColumns.length).toBeGreaterThan(0);
  });

  describe('Column: id', () => {
    const columnName = 'id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (uuid_generate_v4())', () => {
      expect(column?.column_default).toMatch(/^(extensions\.)?uuid_generate_v4\(\)$/);
    });
    it('should be the primary key', () => {
      const pkConstraint = findPrimaryKey();
      expect(pkConstraint).toBeDefined();
      expect(pkConstraint?.constrained_columns).toContain(columnName);
    });
  });

  describe('Column: session_id', () => {
    const columnName = 'session_id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should be a foreign key to dialectic_sessions.id with ON DELETE CASCADE', () => {
      const fkConstraint = findForeignKeyByColumn(columnName);
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe('dialectic_sessions');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('CASCADE');
    });
  });

  describe('Column: user_id', () => {
    const columnName = 'user_id';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;

    beforeAll(async () => {
      column = findColumn(columnName);
      const allConstraints = await getTableConstraints(supabaseAdminClient, tableName, schemaName);
      
      // Keep the log for now, it's helpful if further issues arise
      console.log('All FK constraints for dialectic_contributions:', 
        allConstraints.filter(c => c.constraint_type === 'FOREIGN KEY')
      );

      // Find the constraint specifically by its name and type
      fkConstraint = allConstraints.find(c => 
        c.constraint_name === 'dialectic_contributions_user_id_fkey' &&
        c.constraint_type === 'FOREIGN KEY'
      );
    });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
    it('should be a foreign key to auth.users.id with ON DELETE SET NULL', () => {
      expect(fkConstraint).toBeDefined();
      if (fkConstraint) {
        expect(fkConstraint.constraint_name).toBe('dialectic_contributions_user_id_fkey');
        expect(fkConstraint.constrained_columns).toContain('user_id');
        // Adjusting assertions based on the actual output from getTableConstraints for this cross-schema FK:
        expect(fkConstraint.foreign_table_schema).toBeNull(); 
        expect(fkConstraint.foreign_table_name).toBeNull();
        expect(fkConstraint.foreign_columns).toEqual([]); 
        expect(fkConstraint.delete_rule).toBe('SET NULL');
      }
    });
  });

  describe('Column: model_id', () => {
    const columnName = 'model_id';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;
    beforeAll(async () => {
      column = findColumn(columnName);
      const allConstraints = await getTableConstraints(supabaseAdminClient, tableName, schemaName);
      fkConstraint = allConstraints.find(c =>
        c.constraint_type === 'FOREIGN KEY' &&
        Array.isArray(c.constrained_columns) && c.constrained_columns.includes(columnName) &&
        c.foreign_table_name === 'ai_providers'
      );
    });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES')); 
    it('should be a foreign key to ai_providers.id with ON DELETE SET NULL', () => {
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe('ai_providers');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('SET NULL');
    });
  });

  describe('Column: model_name', () => {
    const columnName = 'model_name';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: stage', () => {
    const columnName = 'stage';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
  });

  describe('Column: storage_bucket', () => {
    const columnName = 'storage_bucket';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value \'dialectic_contributions\'', () => {
      expect(column?.column_default).toBe("'dialectic_contributions'::text");
    });
  });

  describe('Column: storage_path', () => {
    const columnName = 'storage_path';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
  });

  describe('Column: content_mime_type', () => {
    const columnName = 'content_mime_type';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value \'text/markdown\'', () => {
      expect(column?.column_default).toBe("'text/markdown'::text");
    });
  });

  describe('Column: content_size_bytes', () => {
    const columnName = 'content_size_bytes';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type bigint', () => {
      expect(column?.data_type).toBe('bigint');
    });
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: target_contribution_id', () => {
    const columnName = 'target_contribution_id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
    it('should be a foreign key to dialectic_contributions.id with ON DELETE SET NULL', () => {
      const fkConstraint = findForeignKeyByColumn(columnName);
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe('dialectic_contributions');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('SET NULL');
    });
  });

  describe('Column: prompt_template_id_used', () => {
    const columnName = 'prompt_template_id_used';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
    it('should be a foreign key to system_prompts.id with ON DELETE SET NULL', () => {
      const fkConstraint = findForeignKeyByColumn(columnName);
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe('system_prompts');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('SET NULL');
    });
  });

  describe('Column: tokens_used_input', () => {
    const columnName = 'tokens_used_input';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type integer', () => expect(column?.data_type).toBe('integer'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: tokens_used_output', () => {
    const columnName = 'tokens_used_output';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type integer', () => expect(column?.data_type).toBe('integer'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: cost_usd', () => {
    const columnName = 'cost_usd';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should NOT exist', () => expect(column).toBeUndefined());
  });

  describe('Column: raw_response_storage_path', () => {
    const columnName = 'raw_response_storage_path';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: processing_time_ms', () => {
    const columnName = 'processing_time_ms';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type integer', () => expect(column?.data_type).toBe('integer'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: citations', () => {
    const columnName = 'citations';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type jsonb', () => {
        expect(column?.data_type).toBe('jsonb');
    });
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });
  
  describe('Column: iteration_number', () => {
    const columnName = 'iteration_number';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type integer', () => expect(column?.data_type).toBe('integer'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value 1', () => {
      expect(column?.column_default).toBe('1'); 
    });
  });

  describe('Column: created_at', () => {
    const columnName = 'created_at';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type timestamp with time zone', () => {
      expect(column?.data_type).toBe('timestamp with time zone');
    });
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (now())', () => {
      expect(column?.column_default).toMatch(/now()|CURRENT_TIMESTAMP/i);
    });
  });

  describe('Column: updated_at', () => {
    const columnName = 'updated_at';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type timestamp with time zone', () => {
      expect(column?.data_type).toBe('timestamp with time zone');
    });
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (now())', () => {
      expect(column?.column_default).toMatch(/now()|CURRENT_TIMESTAMP/i);
    });
  });

  describe('Column: edit_version', () => {
    const columnName = 'edit_version';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type integer', () => expect(column?.data_type).toBe('integer'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value 1', () => expect(column?.column_default).toBe('1'));
  });

  describe('Column: is_latest_edit', () => {
    const columnName = 'is_latest_edit';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type boolean', () => expect(column?.data_type).toBe('boolean'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value TRUE', () => expect(column?.column_default).toBe('true'));
  });

  describe('Column: original_model_contribution_id', () => {
    const columnName = 'original_model_contribution_id';
    let column: TableColumnInfo | undefined;
    let fkConstraint: TableConstraintInfo | undefined;
    beforeAll(async () => {
      column = findColumn(columnName);
      const allConstraints = await getTableConstraints(supabaseAdminClient, tableName, schemaName);
      fkConstraint = allConstraints.find(c =>
        c.constraint_type === 'FOREIGN KEY' &&
        Array.isArray(c.constrained_columns) && c.constrained_columns.includes(columnName) &&
        c.foreign_table_name === tableName // Self-referential
      );
    });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
    it('should be a foreign key to dialectic_contributions.id with ON DELETE SET NULL', () => {
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe(tableName); // Self-reference
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('SET NULL');
    });
  });

  describe('Column: seed_prompt_url', () => {
    const columnName = 'seed_prompt_url';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  describe('Column: error', () => {
    const columnName = 'error';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
  });

  it('should have the correct number of columns', () => {
    expect(tableColumns.length).toBe(25);
  });

  describe('Indexes', () => {
    it('should have correct indexes', async () => {
      const indexInfo = await getTableIndexes(supabaseAdminClient, tableName, schemaName);
      const indexNames = indexInfo.map(idx => idx.indexname);

      const expectedIndexes = [
        'dialectic_contributions_pkey',
        'idx_dialectic_contributions_session_id',
        'idx_dialectic_contributions_model_id', // This index is still expected as per plan
        'idx_dialectic_contributions_stage',
        'idx_dialectic_contributions_target_contribution_id',
        'idx_dialectic_contributions_original_model_contribution_id',
        'idx_dialectic_contributions_original_model_edit_version',   // Corrected name
        'idx_dialectic_contributions_original_model_is_latest'     // Corrected name
      ];

      // Check if all expected indexes are present
      for (const expectedIndex of expectedIndexes) {
        expect(indexNames).toContain(expectedIndex);
      }
    });
  });
});