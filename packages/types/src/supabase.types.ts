import type { PostgrestSingleResponse } from '@supabase/postgrest-js';
// Assuming 'Database' is the root type exported from your db-types package or similar.
// This import might need adjustment based on how 'Database' is actually exposed.
import type { Database } from '@paynless/db-types'; // Or './db.types' if local

// Helper to extract Row and Update types from the Database definition
type TableName = keyof Database['public']['Tables'];
type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
type TableUpdateDTO<T extends TableName> = Database['public']['Tables'][T]['Update'];

export interface IQueryBuilder<
    TN extends TableName,
    TRow = TableRow<TN>,
    TUpdate = TableUpdateDTO<TN>
> {
  update: (values: TUpdate) => IQueryBuilder<TN, TRow, TUpdate>;
  eq: <K extends keyof TRow>(column: K, value: TRow[K]) => IQueryBuilder<TN, TRow, TUpdate>;
  select: (columns?: string) => {
    single: () => Promise<PostgrestSingleResponse<TRow>>;
    // maybeSingle?: () => Promise<PostgrestSingleResponse<TRow | null>>; // For .maybeSingle()
  };
}

export interface ISupabaseDataClient {
  from: <TN extends TableName>(table: TN) => IQueryBuilder<TN>;
  // rpc?: <T = any>(fn: string, args?: object) => Promise<PostgrestSingleResponse<T>>; // For future use
} 