import { SupabaseClient } from 'npm:@supabase/supabase-js';
import {
  getTableColumns,
  getTableConstraints,
  TableColumnInfo,
  TableConstraintInfo,
  initializeSupabaseAdminClient
} from '../../functions/chat/_integration.test.utils.ts';
import type { Database } from '../../functions/types_db.ts';
import {
    describe,
    it,
    beforeAll,
    afterAll,
} from 'https://deno.land/std@0.208.0/testing/bdd.ts';
import { expect } from "https://deno.land/x/expect@v0.3.0/mod.ts";

let supabase: SupabaseClient<Database>;

describe('Migration Test: dialectic_contributions table', () => {
  const tableName = 'dialectic_contributions';
  const schemaName = 'public';
  let columns: TableColumnInfo[];
  let constraints: TableConstraintInfo[];

  beforeAll(async () => {
    supabase = initializeSupabaseAdminClient();
    columns = await getTableColumns(supabase, tableName, schemaName);
    constraints = await getTableConstraints(supabase, tableName, schemaName);
  });

  it('table should exist and have some columns', () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  const findColumn = (name: string) => columns.find(c => c.column_name === name);
  const findConstraintByType = (type: TableConstraintInfo['constraint_type']) => constraints.filter(c => c.constraint_type === type);
  const findForeignKeyByColumn = (columnName: string) => 
    constraints.find(c => c.constraint_type === 'FOREIGN KEY' && c.constrained_columns.includes(columnName));

  describe('Column: id', () => {
    const columnName = 'id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have a default value (uuid_generate_v4())', () => expect(column?.column_default).toBe('uuid_generate_v4()'));
    it('should be the primary key', () => {
      const pkConstraint = findConstraintByType('PRIMARY KEY')[0];
      expect(pkConstraint).toBeDefined();
      expect(pkConstraint.constrained_columns).toContain(columnName);
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

  describe('Column: session_model_id', () => {
    const columnName = 'session_model_id';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type uuid', () => expect(column?.data_type).toBe('uuid'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should be a foreign key to dialectic_session_models.id with ON DELETE CASCADE', () => {
      const fkConstraint = findForeignKeyByColumn(columnName);
      expect(fkConstraint).toBeDefined();
      expect(fkConstraint?.foreign_table_name).toBe('dialectic_session_models');
      expect(fkConstraint?.foreign_columns).toContain('id');
      expect(fkConstraint?.delete_rule).toBe('CASCADE');
    });
  });

  describe('Column: stage', () => {
    const columnName = 'stage';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
  });

  describe('Column: content_storage_bucket', () => {
    const columnName = 'content_storage_bucket';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should not be nullable', () => expect(column?.is_nullable).toBe('NO'));
    it('should have default value \'dialectic_contributions\'', () => {
      expect(column?.column_default).toBe("'dialectic_contributions'::text");
    });
  });

  describe('Column: content_storage_path', () => {
    const columnName = 'content_storage_path';
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

  describe('Column: actual_prompt_sent', () => {
    const columnName = 'actual_prompt_sent';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
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

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type numeric', () => expect(column?.data_type).toBe('numeric'));
    it('should have correct precision and scale (10,6)', () => {
      expect(column?.numeric_precision).toBe(10);
      expect(column?.numeric_scale).toBe(6);
    });
    it('should be nullable', () => expect(column?.is_nullable).toBe('YES'));
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

  describe('Column: model_version_details', () => {
    const columnName = 'model_version_details';
    let column: TableColumnInfo | undefined;
    beforeAll(() => { column = findColumn(columnName); });

    it('should exist', () => expect(column).toBeDefined());
    it('should be of type text', () => expect(column?.data_type).toBe('text'));
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

  it('should have the correct number of columns', () => {
    expect(columns.length).toBe(21);
  });

  it('should have correct indexes', async () => {
    const indexQuery = `
      SELECT indexname
      FROM pg_catalog.pg_indexes
      WHERE schemaname = '${schemaName}' AND tablename = '${tableName}'
    `;
    const { data: indexesData, error: indexError } = await supabase.rpc('execute_sql' as any, { query: indexQuery });

    if (indexError) throw indexError;
    // The data from execute_sql might be an array of objects, e.g., [{indexname: 'name1'}, {indexname: 'name2'}]
    // Adjust extraction based on actual structure returned by your execute_sql RPC
    const indexNames = (indexesData as any[])?.map((idx: any) => idx.indexname) || [];

    expect(indexNames).toContain('idx_dialectic_contributions_session_id');
    expect(indexNames).toContain('idx_dialectic_contributions_session_model_id');
    expect(indexNames).toContain('idx_dialectic_contributions_stage');
    expect(indexNames).toContain('idx_dialectic_contributions_target_contribution_id');
    expect(indexNames).toContain('dialectic_contributions_pkey');
  });

}); 