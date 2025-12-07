// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// External imports
import {
    createClient,
    type SupabaseClient,
  } from "npm:@supabase/supabase-js@^2.43.4";
  import type { User } from "npm:@supabase/gotrue-js@^2.6.3";
  // Revert to deno.land/std for spy/stub to diagnose callCount issue
  import { spy, stub, type Spy, type Stub, type MethodSpy } from "https://deno.land/std@0.224.0/testing/mock.ts";
  import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
  import type { Database } from "../types_db.ts";


  // --- Interfaces for Mock Supabase Client (for testing) ---
export interface IMockQueryBuilder {
  select: (columns?: string) => IMockQueryBuilder;
  insert: (data: unknown[] | object) => IMockQueryBuilder;
  update: (data: object) => IMockQueryBuilder;
  delete: () => IMockQueryBuilder;
  upsert: (data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }) => IMockQueryBuilder;

  // Filtering
  eq: (column: string, value: unknown) => IMockQueryBuilder;
  neq: (column: string, value: unknown) => IMockQueryBuilder;
  gt: (column: string, value: unknown) => IMockQueryBuilder;
  gte: (column: string, value: unknown) => IMockQueryBuilder;
  lt: (column: string, value: unknown) => IMockQueryBuilder;
  lte: (column: string, value: unknown) => IMockQueryBuilder;
  like: (column: string, pattern: string) => IMockQueryBuilder;
  ilike: (column: string, pattern: string) => IMockQueryBuilder;
  is: (column: string, value: 'null' | 'not null' | 'true' | 'false') => IMockQueryBuilder;
  in: (column: string, values: unknown[]) => IMockQueryBuilder;
  contains: (column: string, value: string | string[] | object) => IMockQueryBuilder;
  containedBy: (column: string, value: string | string[] | object) => IMockQueryBuilder;
  rangeGt: (column: string, range: string) => IMockQueryBuilder;
  rangeGte: (column: string, range: string) => IMockQueryBuilder;
  rangeLt: (column: string, range: string) => IMockQueryBuilder;
  rangeLte: (column: string, range: string) => IMockQueryBuilder;
  rangeAdjacent: (column: string, range: string) => IMockQueryBuilder;
  overlaps: (column: string, value: string | string[]) => IMockQueryBuilder;
  textSearch: (column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' }) => IMockQueryBuilder;
  match: (query: object) => IMockQueryBuilder;
  or: (filters: string, options?: { referencedTable?: string }) => IMockQueryBuilder;
  filter: (column: string, operator: string, value: unknown) => IMockQueryBuilder;
  not: (column: string, operator: string, value: unknown) => IMockQueryBuilder;

  // Modifiers
  order: (column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }) => IMockQueryBuilder;
  limit: (count: number, options?: { referencedTable?: string }) => IMockQueryBuilder;
  range: (from: number, to: number, options?: { referencedTable?: string }) => IMockQueryBuilder;

  // Terminators
  single: () => Promise<MockResolveQueryResult>;
  maybeSingle: () => Promise<MockResolveQueryResult>;
  then: (
    onfulfilled?: ((value: MockResolveQueryResult) => unknown | PromiseLike<unknown>) | null | undefined, 
    onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
  ) => Promise<unknown>; 
  returns: () => IMockQueryBuilder;
  methodSpies: { [key: string]: Spy<(...args: unknown[]) => unknown> };
}

export interface IMockSupabaseAuth {
  getUser: () => Promise<{ data: { user: User | null }; error: Error | null }>;
  getUserSpy: Spy<IMockSupabaseAuth['getUser']>;
}

export interface IMockSupabaseClient {
  from: (tableName: string) => IMockQueryBuilder;
  auth: IMockSupabaseAuth; 
  rpc: (name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }) => Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  storage: IMockStorageAPI;
  functions?: {
    invoke: (fn: string, opts: unknown) => Promise<{ data: unknown, error: unknown }>
  };
  rpcSpy: Spy<IMockSupabaseClient['rpc']>;
  fromSpy: Spy<IMockSupabaseClient['from']>;
  getLatestBuilder(tableName: string): IMockQueryBuilder | undefined;
  getAllBuildersUsed(): IMockQueryBuilder[];
  getHistoricBuildersForTable(tableName: string): IMockQueryBuilder[] | undefined;
  getTablesWithHistoricBuilders(): string[];
  getAllStorageBucketApiInstances(): IMockStorageBucketAPI[];
  clearAllTrackedBuilders(): void;
  clearAllTrackedStorageAPIs(): void;
  getStorageBucketApiInstance(bucketId: string): IMockStorageBucketAPI | undefined;
  getSpiesForTableQueryMethod: (tableName: string, methodName: keyof IMockQueryBuilder, callIndex?: number) => Spy | undefined;
}

// Helper type for the comprehensive set of spied query builder methods
export type AllQueryBuilderSpyMethods = {
  select?: Spy<IMockQueryBuilder['select']>;
  insert?: Spy<IMockQueryBuilder['insert']>;
  update?: Spy<IMockQueryBuilder['update']>;
  delete?: Spy<IMockQueryBuilder['delete']>;
  upsert?: Spy<IMockQueryBuilder['upsert']>;
  eq?: Spy<IMockQueryBuilder['eq']>;
  neq?: Spy<IMockQueryBuilder['neq']>;
  gt?: Spy<IMockQueryBuilder['gt']>;
  gte?: Spy<IMockQueryBuilder['gte']>;
  lt?: Spy<IMockQueryBuilder['lt']>;
  lte?: Spy<IMockQueryBuilder['lte']>;
  like?: Spy<IMockQueryBuilder['like']>;
  ilike?: Spy<IMockQueryBuilder['ilike']>;
  is?: Spy<IMockQueryBuilder['is']>;
  in?: Spy<IMockQueryBuilder['in']>;
  contains?: Spy<IMockQueryBuilder['contains']>;
  containedBy?: Spy<IMockQueryBuilder['containedBy']>;
  rangeGt?: Spy<IMockQueryBuilder['rangeGt']>;
  rangeGte?: Spy<IMockQueryBuilder['rangeGte']>;
  rangeLt?: Spy<IMockQueryBuilder['rangeLt']>;
  rangeLte?: Spy<IMockQueryBuilder['rangeLte']>;
  rangeAdjacent?: Spy<IMockQueryBuilder['rangeAdjacent']>;
  overlaps?: Spy<IMockQueryBuilder['overlaps']>;
  textSearch?: Spy<IMockQueryBuilder['textSearch']>;
  match?: Spy<IMockQueryBuilder['match']>;
  or?: Spy<IMockQueryBuilder['or']>;
  filter?: Spy<IMockQueryBuilder['filter']>;
  not?: Spy<IMockQueryBuilder['not']>;
  order?: Spy<IMockQueryBuilder['order']>;
  limit?: Spy<IMockQueryBuilder['limit']>;
  range?: Spy<IMockQueryBuilder['range']>;
  single?: Spy<IMockQueryBuilder['single']>;
  maybeSingle?: Spy<IMockQueryBuilder['maybeSingle']>;
  then?: Spy<IMockQueryBuilder['then']>;
  returns?: Spy<IMockQueryBuilder['returns']>; 
};

export interface IMockClientSpies {
  auth: {
    getUserSpy: Spy<IMockSupabaseAuth['getUser']>;
  };
  rpcSpy: Spy<IMockSupabaseClient['rpc']>;
  fromSpy: Spy<IMockSupabaseClient['from']>;
  storage: {
    from: (bucketId: string) => {
      uploadSpy: Spy<IMockStorageBucketAPI['upload']>;
      downloadSpy: Spy<IMockStorageBucketAPI['download']>;
      createSignedUrlSpy: Spy<IMockStorageBucketAPI['createSignedUrl']>;
      removeSpy: Spy<IMockStorageBucketAPI['remove']>;
      listSpy: Spy<IMockStorageBucketAPI['list']>;
      copySpy: Spy<IMockStorageBucketAPI['copy']>;
    };
  };
  getLatestQueryBuilderSpies: (tableName: string) => AllQueryBuilderSpyMethods | undefined;
  getAllQueryBuilderSpies: (tableName: string) => Array<AllQueryBuilderSpyMethods> | undefined;
  getHistoricQueryBuilderSpies: (tableName: string, methodName: string) => { callCount: number; callsArgs: unknown[][] } | undefined;
}

  export interface MockSupabaseClientSetup {
    client: IMockSupabaseClient;
    spies: IMockClientSpies;
    clearAllStubs?: () => void;
    genericMockResults: MockSupabaseDataConfig['genericMockResults'];
  }
  

  // --- START: Types moved from supabase.mock.ts ---
  
  export interface MockQueryBuilderState {
      tableName: string;
      operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
      filters: { column?: string; value?: unknown; type: string; criteria?: object; operator?: string; filters?: string; referencedTable?: string }[];
      selectColumns: string | null;
      insertData: object | unknown[] | null;
      updateData: object | null; 
      upsertData: object | unknown[] | null;
      upsertOptions?: { onConflict?: string, ignoreDuplicates?: boolean };
      rangeFrom?: number;
      rangeTo?: number;
      orderBy?: { column: string; options?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string } };
      limitCount?: number;
      orClause?: string; 
      matchQuery?: object;
      textSearchQuery?: { column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' } };
  }
  
  // --- START: Storage Mock Types ---
  export interface IMockStorageFileOptions {
    contentType?: string;
    upsert?: boolean;
    // Add other storage options as needed, e.g., cacheControl
  }
  
  export interface IMockStorageUploadData {
    path: string; 
  }

  export interface IMockStorageBasicResponse { // For operations not returning a path
    data: null; // Typically data is null for non-select/download ops if successful without specific return
    error: Error | null;
  }
  
  export interface IMockStorageUploadResponse {
    data: IMockStorageUploadData | null;
    error: Error | null;
  }

  export interface IMockStorageDownloadResponse {
    data: Blob | null;
    error: Error | null;
  }
  
  export interface IMockStorageSignedUrlResponse {
    data: { signedUrl: string } | null;
    error: Error | null;
  }
  
  export interface IMockStorageListResponse {
    data: { name: string; id?: string; updated_at?: string; created_at?: string; last_accessed_at?: string; metadata?: Record<string, any> }[] | null;
    error: Error | null;
  }
  
  // New response type specifically for the 'remove' operation, which returns FileObject[] on success.
  export interface IMockStorageRemoveResponse {
    data: { name: string; id?: string; updated_at?: string; created_at?: string; last_accessed_at?: string; metadata?: Record<string, any> }[] | null;
    error: Error | null;
  }
  
  // 1. Define IMockStorageCopyResponse
  export interface IMockStorageCopyResponse {
    data: { path: string } | null;
    error: Error | null;
  }
  
  // Interface for the API of a specific bucket (e.g., client.storage.from('avatars'))
  export interface IMockStorageBucketAPI {
    upload: (path: string, body: unknown, options?: IMockStorageFileOptions) => Promise<IMockStorageUploadResponse>;
    download: (path: string) => Promise<IMockStorageDownloadResponse>;
    createSignedUrl: (path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>;
    remove: (paths: string[]) => Promise<IMockStorageRemoveResponse>;
    list: (path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string; }; search?: string; }) => Promise<IMockStorageListResponse>;
    // 2. Add 'copy' to IMockStorageBucketAPI
    copy: (fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>;
  }
  
  // Interface for the top-level storage API (e.g., client.storage)
  export interface IMockStorageAPI {
    from: (bucketId: string) => IMockStorageBucketAPI;
  }
  // --- END: Storage Mock Types ---
  
  export interface MockSupabaseDataConfig {
      getUserResult?: { data: { user: User | null }; error: Error | null }; 
      genericMockResults?: {
          [tableName: string]: {
              select?: { data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string }>);
              insert?: { data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string }>);
              update?: { data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string }>);
              upsert?: { data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string }>);
              delete?: { data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string } | ((state: MockQueryBuilderState) => Promise<{ data: object[] | null; error?: Error | null; count?: number | null; status?: number; statusText?: string }>);
          };
      };
      rpcResults?: {
          [functionName: string]: { data?: object | object[] | null; error?: Error | null } | (() => Promise<{ data?: object | object[] | null; error?: Error | null }>);
      };
      mockRpc?: {
        [functionName: string]: () => Promise<{ data: any; error: any }>;
      };
      storageMock?: { 
        defaultBucket?: string; 
        uploadResult?: IMockStorageUploadResponse | ((bucketId: string, path: string, body: unknown, options?: IMockStorageFileOptions) => Promise<IMockStorageUploadResponse>);
        downloadResult?: IMockStorageDownloadResponse | ((bucketId: string, path: string) => Promise<IMockStorageDownloadResponse>);
        createSignedUrlResult?: IMockStorageSignedUrlResponse | ((bucketId: string, path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>);
        removeResult?: IMockStorageRemoveResponse | ((bucketId: string, paths: string[]) => Promise<IMockStorageRemoveResponse>);
        listResult?: IMockStorageListResponse | ((bucketId: string, path?: string, options?: object) => Promise<IMockStorageListResponse>);
        // 4. Add 'copyResult' to MockSupabaseDataConfig.storageMock
        copyResult?: IMockStorageCopyResponse | ((bucketId: string, fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>);
      };
      mockUser?: User | null; 
      simulateAuthError?: Error | null;
  }
  
  export type PostgresError = { name: string; message: string; code: string; details?: string; hint?: string };
  
  export type MockResolveQueryResult = { 
      data: unknown | unknown[] | null;
      error: Error | PostgresError | null; 
      count: number | null; 
      status: number; 
      statusText: string; 
  };

// Helper function to create a PostgresError object
function createPostgresError(message: string, code: string, details?: string, hint?: string): PostgresError {
    return {
        name: 'PostgresError',
        message,
        code,
        details,
        hint
    };
}

// Helper function to construct a complete User object from partial user data
function constructUserObject(userData: { id: string; [key: string]: unknown }): User {
    const user: User = {
        id: userData.id,
        aud: typeof userData.aud === 'string' ? userData.aud : 'authenticated',
        role: typeof userData.role === 'string' ? userData.role : 'authenticated',
        app_metadata: (userData.app_metadata && typeof userData.app_metadata === 'object' && !Array.isArray(userData.app_metadata))
            ? userData.app_metadata
            : {},
        user_metadata: (userData.user_metadata && typeof userData.user_metadata === 'object' && !Array.isArray(userData.user_metadata))
            ? userData.user_metadata
            : {},
        created_at: typeof userData.created_at === 'string' ? userData.created_at : new Date().toISOString(),
    };
    
    if (typeof userData.email === 'string') {
        user.email = userData.email;
    }
    
    return user;
}

  // Environment variable check
  const envSupabaseUrl = Deno.env.get("SUPABASE_URL");
  const envServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const envAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  
  if (!envSupabaseUrl || !envServiceRoleKey || !envAnonKey) {
    console.warn(
      "WARN: Missing SUPABASE_* env vars. Tests might fail unless globally mocked.",
    );
  } else {
    console.log("Supabase environment variables are present.");
  }
  
  // CLI command helper
  async function runSupabaseCommand(command: string): Promise<void> {
    console.log(`Executing: supabase ${command}...`);
    const cmd = new Deno.Command("supabase", {
      args: [command],
      stdout: "piped",
      stderr: "piped",
    });
  
    const { code, stderr } = await cmd.output();
  
    if (code !== 0) {
      console.error(`Supabase CLI Error (${command}):`);
      console.error(new TextDecoder().decode(stderr));
      throw new Error(`supabase ${command} failed with code ${code}`);
    }
  
    console.log(`Supabase ${command} completed successfully.`);
  
    if (command === "start") {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  
  // Start/Stop wrappers
  export async function startSupabase(): Promise<void> {
    await runSupabaseCommand("start");
  }
  
  export async function stopSupabase(): Promise<void> {
    await runSupabaseCommand("stop");
  }
  
  // Strictly typed env accessor
  function getSupabaseEnvVars(): {
    url: string;
    serviceRoleKey: string;
    anonKey: string;
  } {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  
    if (!url) throw new Error("Missing SUPABASE_URL");
    if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!anonKey) throw new Error("Missing SUPABASE_ANON_KEY");
  
    return { url, serviceRoleKey, anonKey };
  }
  
// Type guard functions to replace type casts
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isUpsertOptions(value: unknown): value is { onConflict?: string; ignoreDuplicates?: boolean } {
  return isObject(value) && (
    !('onConflict' in value) || isString(value.onConflict)
  ) && (
    !('ignoreDuplicates' in value) || typeof value.ignoreDuplicates === 'boolean'
  );
}

function isOrderOptions(value: unknown): value is { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string } {
  return isObject(value) && (
    !('ascending' in value) || typeof value.ascending === 'boolean'
  ) && (
    !('nullsFirst' in value) || typeof value.nullsFirst === 'boolean'
  ) && (
    !('referencedTable' in value) || isString(value.referencedTable)
  );
}

function isIsValue(value: unknown): value is 'null' | 'not null' | 'true' | 'false' {
  return value === 'null' || value === 'not null' || value === 'true' || value === 'false';
}

function isContainsValue(value: unknown): value is string | string[] | object {
  return typeof value === 'string' || isArray(value) || isObject(value);
}

function isOrOptions(value: unknown): value is { referencedTable?: string } {
  return isObject(value) && (!('referencedTable' in value) || isString(value.referencedTable));
}

function isMockQueryBuilderStateFunction(value: unknown): value is (state: MockQueryBuilderState) => Promise<MockResolveQueryResult> {
  return typeof value === 'function';
}

// Helper function to validate that columns used in filters exist in the returned data structure
// This validates against the actual schema by checking the mock data, ensuring queries use only existing columns
// This approach evolves automatically with the database schema since it validates against the mock data structure
function validateFilterColumns(tableName: string, filters: MockQueryBuilderState['filters'], mockData: unknown[] | null): void {
  if (!mockData || mockData.length === 0) {
    // If no mock data is provided, we can't validate - skip validation
    return;
  }
  
  // Get the first row to check column structure
  const firstRow = mockData[0];
  if (typeof firstRow !== 'object' || firstRow === null) {
    return;
  }
  
  const validColumns = new Set(Object.keys(firstRow));
  
  // Validate each filter column exists in the data structure
  for (const filter of filters) {
    if (filter.column && !validColumns.has(filter.column)) {
      const error = createPostgresError(
        `column ${tableName}.${filter.column} does not exist`,
        '42703', // PostgreSQL error code for undefined column
        `The column "${filter.column}" does not exist in table "${tableName}"`,
        `Check the Database type definition for valid columns in ${tableName}`
      );
      throw error;
    }
  }
}

// --- MockQueryBuilder Implementation ---
class MockQueryBuilder implements IMockQueryBuilder {
    public methodSpies: { [key: string]: Spy<(...args: unknown[]) => unknown> } = {};
    private _state: MockQueryBuilderState;
    private _genericMockResultsConfig?: MockSupabaseDataConfig['genericMockResults'];

    constructor(
        tableName: string,
        initialOperation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select',
        config?: MockSupabaseDataConfig['genericMockResults']
    ) {
        this._state = {
            tableName,
            operation: initialOperation,
            filters: [],
            selectColumns: '*', 
            insertData: null,      
            updateData: null,      
            upsertData: null,
        };
        this._genericMockResultsConfig = config;
        this._initializeSpies();
    }

    // Define methods from IMockQueryBuilder directly
    // These will be wrapped by spies in _initializeSpies
    select(columns?: string): IMockQueryBuilder { return this._executeChainableMethod('select', [columns]); }
    insert(data: unknown[] | object): IMockQueryBuilder { return this._executeChainableMethod('insert', [data]); }
    update(data: object): IMockQueryBuilder { return this._executeChainableMethod('update', [data]); }
    delete(): IMockQueryBuilder { return this._executeChainableMethod('delete', []); }
    upsert(data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }): IMockQueryBuilder { return this._executeChainableMethod('upsert', [data, options]); }
    eq(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('eq', [column, value]); }
    neq(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('neq', [column, value]); }
    gt(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('gt', [column, value]); }
    gte(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('gte', [column, value]); }
    lt(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('lt', [column, value]); }
    lte(column: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('lte', [column, value]); }
    like(column: string, pattern: string): IMockQueryBuilder { return this._executeChainableMethod('like', [column, pattern]); }
    ilike(column: string, pattern: string): IMockQueryBuilder { return this._executeChainableMethod('ilike', [column, pattern]); }
    is(column: string, value: 'null' | 'not null' | 'true' | 'false'): IMockQueryBuilder { return this._executeChainableMethod('is', [column, value]); }
    in(column: string, values: unknown[]): IMockQueryBuilder { return this._executeChainableMethod('in', [column, values]); }
    contains(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeChainableMethod('contains', [column, value]); }
    containedBy(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeChainableMethod('containedBy', [column, value]); }
    rangeGt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeChainableMethod('rangeGt', [column, rangeVal]); }
    rangeGte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeChainableMethod('rangeGte', [column, rangeVal]); }
    rangeLt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeChainableMethod('rangeLt', [column, rangeVal]); }
    rangeLte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeChainableMethod('rangeLte', [column, rangeVal]); }
    rangeAdjacent(column: string, rangeVal: string): IMockQueryBuilder { return this._executeChainableMethod('rangeAdjacent', [column, rangeVal]); }
    overlaps(column: string, value: string | string[]): IMockQueryBuilder { return this._executeChainableMethod('overlaps', [column, value]); }
    textSearch(column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' }): IMockQueryBuilder { return this._executeChainableMethod('textSearch', [column, query, options]); }
    match(query: object): IMockQueryBuilder { return this._executeChainableMethod('match', [query]); }
    or(filters: string, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeChainableMethod('or', [filters, options]); }
    filter(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('filter', [column, operator, value]); }
    not(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeChainableMethod('not', [column, operator, value]); }
    order(column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }): IMockQueryBuilder { return this._executeChainableMethod('order', [column, options]); }
    limit(count: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeChainableMethod('limit', [count, options]); }
    range(from: number, to: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeChainableMethod('range', [from, to, options]); }
    returns(): IMockQueryBuilder { return this._executeChainableMethod('returns', []); }

    single(): Promise<MockResolveQueryResult> { return this._resolveQuery(true, false); }
    maybeSingle(): Promise<MockResolveQueryResult> { return this._resolveQuery(false, true); }
    then(
        onfulfilled?: ((value: MockResolveQueryResult) => unknown | PromiseLike<unknown>) | null | undefined,
        onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
    ): Promise<unknown> { 
        console.log(`[Mock QB ${this._state.tableName}] Direct .then() called.`);
        const promise = this._resolveQuery(); // Returns Promise<MockResolveQueryResult>
        
        return promise.then(onfulfilled, onrejected);
    }

    private _initializeSpies() {
        const methodsToSpy: (keyof IMockQueryBuilder)[] = [
            'select', 'insert', 'update', 'delete', 'upsert',
            'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
            'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte',
            'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'or', 'filter', 'not',
            'order', 'limit', 'range', 'single', 'maybeSingle', 'then', 'returns'
        ];

        for (const methodName of methodsToSpy) {
            const method = this[methodName];
            if (typeof method === 'function') {
                // methodName is already keyof IMockQueryBuilder, and since MockQueryBuilder implements IMockQueryBuilder,
                // it's also a valid keyof MockQueryBuilder - no cast needed
                const spiedMethod = spy(this, methodName);
                // Deno spy returns MethodSpy<this, ...> but we need Spy<(...args: unknown[]) => unknown>
                // MethodSpy extends Spy, but TypeScript requires explicit conversion due to 'this' type parameter
                this.methodSpies[methodName] = spiedMethod as unknown as Spy<(...args: unknown[]) => unknown>;
            } else {
                console.warn(`[MockQueryBuilder] Method ${String(methodName)} is not a function on the instance, cannot spy.`);
            }
        }
    }

    private _executeChainableMethod(methodName: keyof IMockQueryBuilder, args: unknown[]): IMockQueryBuilder {
        console.log(`[Mock QB ${this._state.tableName}] .${methodName}(${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(', ')}) called`);
        const methodNameStr = String(methodName);
        switch(methodNameStr) {
            case 'select': 
                // If current operation is a mutation, select just specifies return shape
                if (!['insert', 'update', 'upsert'].includes(this._state.operation)) {
                    this._state.operation = 'select'; 
                }
                this._state.selectColumns = isString(args[0]) ? args[0] : (args[0] === undefined ? '*' : '*'); 
                return this;
            case 'insert': 
                this._state.operation = 'insert'; 
                this._state.insertData = (isObject(args[0]) || isArray(args[0])) ? args[0] : null; 
                return this;
            case 'update': 
                this._state.operation = 'update'; 
                this._state.updateData = isObject(args[0]) ? args[0] : null; 
                return this;
            case 'delete': 
                this._state.operation = 'delete'; 
                return this;
            case 'upsert': 
                this._state.operation = 'upsert'; 
                this._state.upsertData = (isObject(args[0]) || isArray(args[0])) ? args[0] : null; 
                this._state.upsertOptions = (args[1] !== undefined && isUpsertOptions(args[1])) ? args[1] : undefined;
                return this;
            case 'eq': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'eq' });
                }
                return this;
            case 'neq': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'neq' });
                }
                return this;
            case 'gt': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'gt' });
                }
                return this;
            case 'gte': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'gte' });
                }
                return this;
            case 'lt': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'lt' });
                }
                return this;
            case 'lte': 
                if (isString(args[0])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'lte' });
                }
                return this;
            case 'like': 
                if (isString(args[0]) && isString(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'like' });
                }
                return this;
            case 'ilike': 
                if (isString(args[0]) && isString(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'ilike' });
                }
                return this;
            case 'is': 
                if (isString(args[0]) && isIsValue(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'is' });
                }
                return this;
            case 'in': 
                if (isString(args[0]) && isArray(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'in' });
                }
                return this;
            case 'contains': 
                if (isString(args[0]) && isContainsValue(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'contains' });
                }
                return this;
            case 'containedBy': 
                if (isString(args[0]) && isContainsValue(args[1])) {
                    this._state.filters.push({ column: args[0], value: args[1], type: 'containedBy' });
                }
                return this;
            case 'match': 
                if (isObject(args[0])) {
                    this._state.matchQuery = args[0];
                }
                return this;
            case 'or': 
                if (isString(args[0])) {
                    const orOptions = (args[1] !== undefined && isOrOptions(args[1])) ? args[1] : undefined;
                    this._state.filters.push({ filters: args[0], type: 'or', referencedTable: orOptions?.referencedTable });
                }
                return this;
            case 'filter': 
                if (isString(args[0]) && isString(args[1])) {
                    this._state.filters.push({ column: args[0], operator: args[1], value: args[2], type: 'filter' });
                }
                return this;
            case 'not': 
                if (isString(args[0]) && isString(args[1])) {
                    this._state.filters.push({ column: args[0], operator: args[1], value: args[2], type: 'not' });
                }
                return this;
            case 'order': 
                if (isString(args[0])) {
                    const orderOptions = (args[1] !== undefined && isOrderOptions(args[1])) ? args[1] : undefined;
                    this._state.orderBy = { column: args[0], options: orderOptions };
                }
                return this;
            case 'limit': 
                if (isNumber(args[0])) {
                    this._state.limitCount = args[0];
                }
                return this;
            case 'range': 
                if (isNumber(args[0]) && isNumber(args[1])) {
                    this._state.rangeFrom = args[0];
                    this._state.rangeTo = args[1];
                }
                return this;
            case 'returns': 
                return this;
            default: {
                console.warn(`[Mock QB ${this._state.tableName}] Method .${methodName} not explicitly in switch. Returning 'this'.`);
                return this;
            }
        }
    }

    private async _resolveQuery(isSingle = false, isMaybeSingle = false): Promise<MockResolveQueryResult> {
        console.log(`[Mock QB ${this._state.tableName}] Resolving query. Operation: ${this._state.operation}, State: ${JSON.stringify(this._state)}`);

        let result: MockResolveQueryResult = { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
        const tableConfig = this._genericMockResultsConfig?.[this._state.tableName];
        const operationConfig = tableConfig?.[this._state.operation];

        if (isMockQueryBuilderStateFunction(operationConfig)) {
            console.log(`[Mock QB ${this._state.tableName}] Using function config for ${this._state.operation}`);
            try {
                // The mock function is responsible for returning the complete MockResolveQueryResult structure
                const functionResult = await operationConfig(this._state);
                // Normalize all properties to match MockResolveQueryResult exactly
                result = {
                    data: functionResult.data !== undefined ? functionResult.data : null,
                    error: functionResult.error !== undefined ? functionResult.error : null,
                    count: functionResult.count !== undefined ? functionResult.count : null,
                    status: functionResult.status !== undefined ? functionResult.status : 200,
                    statusText: functionResult.statusText !== undefined ? functionResult.statusText : 'OK'
                };
            } catch (e) {
                console.error(`[Mock QB ${this._state.tableName}] Error executing mock function for ${this._state.operation}:`, e);
                result = { 
                    data: null, 
                    error: e instanceof Error ? e : new Error(String(e)), 
                    count: 0, 
                    status: 500, 
                    statusText: 'Error from Mock Function' 
                };
            }
        } else if (typeof operationConfig === 'object' && operationConfig !== null) {
            console.log(`[Mock QB ${this._state.tableName}] Using object config for ${this._state.operation}`);
            // Ensure all parts of MockResolveQueryResult are provided with correct types
            const errorValue: Error | PostgresError | null = operationConfig.error !== undefined && operationConfig.error !== null 
                ? operationConfig.error 
                : null;
            result = {
                data: operationConfig.data !== undefined ? operationConfig.data : null,
                error: errorValue,
                count: operationConfig.count !== undefined ? operationConfig.count : null,
                status: operationConfig.status !== undefined ? operationConfig.status : 200,
                statusText: operationConfig.statusText !== undefined ? operationConfig.statusText : 'OK'
            };
        } else {
            // Default behavior if no specific mock is found for the operation
            console.warn(`[Mock QB ${this._state.tableName}] No specific mock found for operation ${this._state.operation}. Returning default empty success.`);
            // Default result is already initialized
        }
        
        // Validate that selected columns exist in the returned data structure
        // This ensures queries use only columns that exist in the schema
        // This validation evolves automatically with the database schema since it checks against mock data
        // Note: We only validate selected columns, not filter columns, since filters can reference columns
        // that aren't in the SELECT clause (e.g., filtering by 'id' while selecting only 'storage_path')
        if (this._state.operation === 'select' && result.data) {
            try {
                const dataArray = Array.isArray(result.data) ? result.data : [result.data];
                // Only validate if we have data to validate against
                if (dataArray.length > 0) {
                    const firstRow = dataArray[0];
                    if (typeof firstRow === 'object' && firstRow !== null) {
                        const validColumns = new Set(Object.keys(firstRow));
                        // Validate that selected columns (if specified) exist in the data
                        // If selectColumns is '*', we don't validate individual columns
                        if (this._state.selectColumns && this._state.selectColumns !== '*') {
                            const selectedColumns = this._state.selectColumns.split(',').map(col => col.trim());
                            for (const col of selectedColumns) {
                                if (!validColumns.has(col)) {
                                    const error = createPostgresError(
                                        `column ${this._state.tableName}.${col} does not exist`,
                                        '42703',
                                        `The column "${col}" does not exist in table "${this._state.tableName}"`,
                                        `Check the Database type definition for valid columns in ${this._state.tableName}`
                                    );
                                    return {
                                        data: null,
                                        error: error,
                                        count: null,
                                        status: 400,
                                        statusText: 'Bad Request'
                                    };
                                }
                            }
                        }
                    }
                }
            } catch (validationError) {
                // If validation fails, return an error result immediately
                return {
                    data: null,
                    error: validationError instanceof Error ? validationError : new Error(String(validationError)),
                    count: null,
                    status: 400,
                    statusText: 'Bad Request'
                };
            }
        }
        
        // Simulate PostgREST behavior for .single() and .maybeSingle()
        // This shaping happens *after* the mock result is obtained.
        if (isSingle) {
            if (result.data && Array.isArray(result.data) && result.data.length === 1) {
                result.data = result.data[0];
            } else if (result.data && Array.isArray(result.data) && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = createPostgresError('Query returned more than one row', 'PGRST116');
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = createPostgresError('Query returned no rows', 'PGRST116');
                    result.status = 406;
                }
                result.data = null; // Data becomes/stays null if error or 0 rows
            }
        } else if (isMaybeSingle) {
            if (result.data && Array.isArray(result.data) && result.data.length === 1) {
                result.data = result.data[0];
            } else if (result.data && Array.isArray(result.data) && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = createPostgresError('Query returned more than one row', 'PGRST116');
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                // For maybeSingle, if 0 rows, data is null, error remains as is (or null if not set)
                result.data = null; 
            }
        }

        if (result.error && !(result.error instanceof Error)) {
            const errObj: PostgresError = result.error;
            const postgresError = createPostgresError(
                errObj.message,
                errObj.code,
                errObj.details,
                errObj.hint
            );
            result.error = postgresError;
            if (result.status >= 200 && result.status < 300) {
                result.status = postgresError.code === 'PGRST116' ? 406 : 500;
            }
        }
        
        console.log(`[Mock QB ${this._state.tableName}] Final resolved query result (before returning from _resolveQuery):`, JSON.stringify(result));
        return result; // Always return the result object; do not throw from here.
    }
}

// --- MockSupabaseAuth Implementation ---
class MockSupabaseAuth implements IMockSupabaseAuth {
    // Use the adjusted Spy type from IMockSupabaseAuth for getUserSpy
    public readonly getUserSpy: IMockSupabaseAuth['getUserSpy'];
    private _config: MockSupabaseDataConfig;
    private _currentTestUserId?: string;

    constructor(config: MockSupabaseDataConfig, currentTestUserId?: string) {
        this._config = config;
        this._currentTestUserId = currentTestUserId;
        const spiedGetUser = spy(this, 'getUser');
        // Deno spy returns MethodSpy<this, ...> but we need Spy<IMockSupabaseAuth['getUser']>
        // MethodSpy extends Spy, but TypeScript requires explicit conversion due to 'this' type parameter
        this.getUserSpy = spiedGetUser as unknown as Spy<IMockSupabaseAuth['getUser']>;
    }

    async getUser(): Promise<{ data: { user: User | null }; error: Error | null }> {
        console.log("[Mock Supabase Auth] getUser called.");
        if (this._config.simulateAuthError) {
            return { data: { user: null }, error: this._config.simulateAuthError };
        }

        // Prioritize explicitly provided mockUser in config, even if null
        if (Object.prototype.hasOwnProperty.call(this._config, 'mockUser')) { // Check if mockUser key is present in config
            // If mockUser is explicitly set to null in config, return unauthenticated state
            if (this._config.mockUser === null) {
                return Promise.resolve({ data: { user: null }, error: null });
            }
            // If mockUser is an object, use it (potentially overriding id with currentTestUserId if provided)
            if (typeof this._config.mockUser === 'object' && this._config.mockUser !== null) {
                 const baseUserData: { id: string; [key: string]: unknown } = { 
                     ...this._config.mockUser,
                     id: this._currentTestUserId || this._config.mockUser.id || 'mock-user-id'
                 };
                 const constructedUser = constructUserObject(baseUserData);
                 return Promise.resolve({ data: { user: constructedUser }, error: null });
            }
        }

        // Fallback to currentTestUserId or a default mock user if mockUser is not explicitly in config
        const userIdToReturn = this._currentTestUserId || "mock-user-id"; // Default if no currentTestUserId
        const userToReturn = constructUserObject({
            id: userIdToReturn,
            aud: "authenticated",
            role: "authenticated",
            email: `${userIdToReturn}@example.com`
        });

        return Promise.resolve({ data: { user: userToReturn }, error: null });
    }
}

// --- START: MockStorageBucketAPI Implementation ---
class MockStorageBucketAPIImpl implements IMockStorageBucketAPI {
    private bucketId: string;
    private config: MockSupabaseDataConfig;
    
    constructor(bucketId: string, config: MockSupabaseDataConfig) {
        this.bucketId = bucketId;
        this.config = config;
    }

    public async upload(path: string, body: unknown, options?: IMockStorageFileOptions): Promise<IMockStorageUploadResponse> {
        if (typeof this.config.storageMock?.uploadResult === 'function') {
            return this.config.storageMock.uploadResult(this.bucketId, path, body, options);
        } else if (this.config.storageMock?.uploadResult) {
            return this.config.storageMock.uploadResult;
        }
        return { data: { path: path }, error: null }; 
    }

    public async download(path: string): Promise<IMockStorageDownloadResponse> {
        if (typeof this.config.storageMock?.downloadResult === 'function') {
            return this.config.storageMock.downloadResult(this.bucketId, path);
        } else if (this.config.storageMock?.downloadResult) {
            return this.config.storageMock.downloadResult;
        }
        return { data: null, error: null };
    }

    public async createSignedUrl(path: string, expiresIn: number): Promise<IMockStorageSignedUrlResponse> {
        if (typeof this.config.storageMock?.createSignedUrlResult === 'function') {
            return this.config.storageMock.createSignedUrlResult(this.bucketId, path, expiresIn);
        } else if (this.config.storageMock?.createSignedUrlResult) {
            return this.config.storageMock.createSignedUrlResult;
        }
        return { data: { signedUrl: `mocked://signed-url/${this.bucketId}/${path}?expires_in=${expiresIn}` }, error: null };
    }

    public async remove(paths: string[]): Promise<IMockStorageRemoveResponse> {
        console.log(`[MockStorageBucketAPI ${this.bucketId}] performRemoveInternal called with paths:`, paths);
        if (this.config.storageMock?.removeResult) {
            if (typeof this.config.storageMock.removeResult === 'function') {
                try {
                    return await this.config.storageMock.removeResult(this.bucketId, paths);
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Error executing removeResult hook';
                    console.error(`[MockStorageBucketAPI ${this.bucketId}] Error in removeResult hook:`, message);
                    return { data: null, error: new Error(message) };
                }
            } else {
                return this.config.storageMock.removeResult;
            }
        }
        console.warn(`[MockStorageBucketAPI ${this.bucketId}] No removeResult configured for paths: ${paths.join(', ')}. Returning default success.`);
        return { data: null, error: null };
    }

    public async list(path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string; }; search?: string; }): Promise<IMockStorageListResponse> {
        console.log(`[MockStorageBucketAPI ${this.bucketId}] performListInternal called with path: ${path}, options:`, options);
        if (this.config.storageMock?.listResult) {
            if (typeof this.config.storageMock.listResult === 'function') {
                try {
                    return await this.config.storageMock.listResult(this.bucketId, path, options);
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Error executing listResult hook';
                    console.error(`[MockStorageBucketAPI ${this.bucketId}] Error in listResult hook:`, message);
                    return { data: null, error: new Error(message) };
                }
            } else {
                return this.config.storageMock.listResult;
            }
        }
        console.warn(`[MockStorageBucketAPI ${this.bucketId}] No listResult configured for path: ${path}. Returning default empty array.`);
        return { data: [], error: null };
    }

    public async copy(fromPath: string, toPath: string): Promise<IMockStorageCopyResponse> {
        console.log(`[MockStorage] Copying from ${this.bucketId}/${fromPath} to ${this.bucketId}/${toPath}`);
        if (this.config.storageMock?.copyResult) {
            if (typeof this.config.storageMock.copyResult === 'function') {
                return await this.config.storageMock.copyResult(this.bucketId, fromPath, toPath);
            }
            return this.config.storageMock.copyResult;
        }
        // Default mock behavior if no specific result is configured
        if (fromPath === "FAIL_COPY") { // Example failure condition
            return { data: null, error: new Error("Mock: Forced copy failure") };
        }
        return { data: { path: toPath }, error: null };
    }
}
// --- END: MockStorageBucketAPI Implementation ---

class MockSupabaseClient implements IMockSupabaseClient {
    public readonly auth: MockSupabaseAuth;
    public readonly storage: IMockStorageAPI;
    public readonly rpcSpy: Spy<IMockSupabaseClient['rpc']>;
    public readonly fromSpy: Spy<IMockSupabaseClient['from']>;
    public functions?: { invoke: (fn: string, opts: unknown) => Promise<{ data: unknown, error: unknown }> };
    private _config: MockSupabaseDataConfig;
    private _latestBuilders: Map<string, MockQueryBuilder> = new Map();
    private _historicBuildersByTable: Map<string, MockQueryBuilder[]> = new Map();
    private _mockStorageBucketAPIs: Map<string, MockStorageBucketAPIImpl> = new Map();


    constructor(config: MockSupabaseDataConfig, auth: MockSupabaseAuth) {
        this._config = config;
        this.auth = auth;
        const spiedRpc = spy(this, 'rpc');
        // Deno spy returns MethodSpy<this, ...> but we need Spy<IMockSupabaseClient['rpc']>
        // MethodSpy extends Spy, but TypeScript requires explicit conversion due to 'this' type parameter
        this.rpcSpy = spiedRpc as unknown as Spy<IMockSupabaseClient['rpc']>;
        const spiedFrom = spy(this, 'from');
        // Deno spy returns MethodSpy<this, ...> but we need Spy<IMockSupabaseClient['from']>
        // MethodSpy extends Spy, but TypeScript requires explicit conversion due to 'this' type parameter
        this.fromSpy = spiedFrom as unknown as Spy<IMockSupabaseClient['from']>;

        // Initialize storage
        this.storage = {
            from: (bucketId: string): IMockStorageBucketAPI => {
                console.log(`[Mock Supabase Client] storage.from('${bucketId}') called`);
                if (!this._mockStorageBucketAPIs.has(bucketId)) {
                    this._mockStorageBucketAPIs.set(bucketId, new MockStorageBucketAPIImpl(bucketId, this._config));
                }
                return this._mockStorageBucketAPIs.get(bucketId)!;
            }
            // listBuckets: spy(async () => { ... }) // if implementing listBuckets
        };
    }

    from(tableName: string): IMockQueryBuilder { 
        console.log(`[Mock Supabase Client] from('${tableName}') called`);
        const builder = new MockQueryBuilder(tableName, 'select', this._config.genericMockResults);
        this._latestBuilders.set(tableName, builder);

        // Store for historic tracking
        if (!this._historicBuildersByTable.has(tableName)) {
            this._historicBuildersByTable.set(tableName, []);
        }
        this._historicBuildersByTable.get(tableName)!.push(builder);
        
        return builder;
    }

    async rpc(name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }): Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }> {
        console.log(`[Mock Supabase Client] rpc('${name}', ${JSON.stringify(params)}, ${JSON.stringify(options)}) called`);
        const rpcConfig = this._config.rpcResults?.[name];
        if (typeof rpcConfig === 'function') {
            const result = await rpcConfig();
            return { data: result.data ?? null, error: result.error ?? null, count: null, status: result.error ? 500 : 200, statusText: result.error ? 'Error' : 'OK' };
        } else if (rpcConfig) {
            return { data: rpcConfig.data ?? null, error: rpcConfig.error ?? null, count: null, status: rpcConfig.error ? 500 : 200, statusText: rpcConfig.error ? 'Error' : 'OK' };
        }
        return { data: null, error: new Error(`RPC function ${name} not mocked.`), count: null, status: 404, statusText: 'Not Found' };
    }

    public getLatestBuilder(tableName: string): MockQueryBuilder | undefined { 
        return this._latestBuilders.get(tableName);
    }

    public getAllBuildersUsed(): MockQueryBuilder[] { 
        // This method's utility might need re-evaluation if _latestBuilders only stores one per table.
        // For now, its usage in clearAllStubs might be okay if stubs are per-instance.
        return Array.from(this._latestBuilders.values());
    }

    public getHistoricBuildersForTable(tableName: string): MockQueryBuilder[] {
        return this._historicBuildersByTable.get(tableName) || [];
    }

    // New helper method to get all table names that have historic builders
    public getTablesWithHistoricBuilders(): string[] {
        return Array.from(this._historicBuildersByTable.keys());
    }

    // New helper method to get all created storage bucket API instances
    public getAllStorageBucketApiInstances(): MockStorageBucketAPIImpl[] {
        return Array.from(this._mockStorageBucketAPIs.values());
    }

    public clearAllTrackedBuilders(): void {
        this._latestBuilders.clear();
        this._historicBuildersByTable.clear();
        console.log('[MockSupabaseClient] Cleared all tracked query builders.');
    }
     public clearAllTrackedStorageAPIs(): void { // New method
        this._mockStorageBucketAPIs.clear();
        console.log('[MockSupabaseClient] Cleared all tracked storage bucket APIs.');
    }

    public getStorageBucketApiInstance(bucketId: string): IMockStorageBucketAPI | undefined {
        return this._mockStorageBucketAPIs.get(bucketId);
    }

    public getSpiesForTableQueryMethod(tableName: string, methodName: keyof IMockQueryBuilder, callIndex = -1): Spy | undefined {
        const historicBuilders = this.getHistoricBuildersForTable(tableName);
        if (!historicBuilders || historicBuilders.length === 0) {
            console.warn(`[MockSupabaseClient getSpiesForTableQueryMethod] No historic builders found for table: ${tableName}`);
            return undefined;
        }

        let targetBuilder: IMockQueryBuilder | undefined;

        if (callIndex === -1) {
            // Default to the latest builder instance for this table if callIndex is -1
            targetBuilder = historicBuilders[historicBuilders.length - 1];
        } else if (callIndex >= 0 && callIndex < historicBuilders.length) {
            targetBuilder = historicBuilders[callIndex];
        } else {
            console.warn(`[MockSupabaseClient getSpiesForTableQueryMethod] Invalid callIndex ${callIndex} for table ${tableName}. Max index: ${historicBuilders.length - 1}`);
            return undefined;
        }

        if (!targetBuilder) {
            console.warn(`[MockSupabaseClient getSpiesForTableQueryMethod] Could not determine target builder for table ${tableName} with callIndex ${callIndex}`);
            return undefined;
        }

        const spy = targetBuilder.methodSpies[methodName];
        if (!spy) {
            console.warn(`[MockSupabaseClient getSpiesForTableQueryMethod] Spy for method '${String(methodName)}' not found on builder for table '${tableName}'. Available spies: ${Object.keys(targetBuilder.methodSpies).join(', ')}`);
        }
        return spy;
    }
}

// --- Refactored createMockSupabaseClient (Phase 3) ---
/** Creates a mocked Supabase client instance for unit testing (Revised & Extended) */
export function createMockSupabaseClient(
    currentTestUserId?: string,
    config: MockSupabaseDataConfig = {}
): MockSupabaseClientSetup {
    console.log(`[Mock Supabase] Creating mock client. TestUserId: ${currentTestUserId || 'N/A (will use default or config)'}`);

    const mockAuth = new MockSupabaseAuth(config, currentTestUserId);
    const mockClientInstance = new MockSupabaseClient(config, mockAuth);

    const clientSpies: IMockClientSpies = {
        auth: {
            getUserSpy: mockAuth.getUserSpy,
        },
        rpcSpy: mockClientInstance.rpcSpy,
        fromSpy: mockClientInstance.fromSpy,
        storage: { 
            from: (bucketId: string) => {
                const bucketAPI = mockClientInstance.storage.from(bucketId);
                if (!bucketAPI) {
                    throw new Error(`[Mock Supabase Spies] Storage bucket API not found for ${bucketId}. Ensure storage.from('${bucketId}') was called first.`);
                }
                // bucketAPI is already IMockStorageBucketAPI, which is implemented by MockStorageBucketAPIImpl
                // We can spy on it directly since it implements the interface
                const spiedUpload = spy(bucketAPI, 'upload');
                const spiedDownload = spy(bucketAPI, 'download');
                const spiedCreateSignedUrl = spy(bucketAPI, 'createSignedUrl');
                const spiedRemove = spy(bucketAPI, 'remove');
                const spiedList = spy(bucketAPI, 'list');
                const spiedCopy = spy(bucketAPI, 'copy');
                // Deno spy returns MethodSpy<IMockStorageBucketAPI, ...> but we need Spy<method>
                // MethodSpy extends Spy, but TypeScript requires explicit conversion due to 'this' type parameter
                return {
                    uploadSpy: spiedUpload as unknown as Spy<IMockStorageBucketAPI['upload']>,
                    downloadSpy: spiedDownload as unknown as Spy<IMockStorageBucketAPI['download']>,
                    createSignedUrlSpy: spiedCreateSignedUrl as unknown as Spy<IMockStorageBucketAPI['createSignedUrl']>,
                    removeSpy: spiedRemove as unknown as Spy<IMockStorageBucketAPI['remove']>,
                    listSpy: spiedList as unknown as Spy<IMockStorageBucketAPI['list']>,
                    copySpy: spiedCopy as unknown as Spy<IMockStorageBucketAPI['copy']>,
                };
            }
        },
        getLatestQueryBuilderSpies: (tableName: string) => {
            const builder = mockClientInstance.getLatestBuilder(tableName);
            return builder?.methodSpies;
        },
        getAllQueryBuilderSpies: (tableName: string) => {
            const historicBuilders = mockClientInstance.getHistoricBuildersForTable(tableName);
            if (!historicBuilders || historicBuilders.length === 0) {
                return undefined;
            }
            return historicBuilders.map(builder =>
                builder.methodSpies
            );
        },
        getHistoricQueryBuilderSpies: (tableName: string, methodName: string): { callCount: number; callsArgs: unknown[][] } | undefined => {
            const historicBuilders = mockClientInstance.getHistoricBuildersForTable(tableName);
            if (!historicBuilders || historicBuilders.length === 0) {
                return { callCount: 0, callsArgs: [] };
            }

            let totalCallCount = 0;
            const allCallsArgs: unknown[][] = [];

            historicBuilders.forEach((builder, index) => {
                const methodSpy = builder.methodSpies[methodName];

                if (methodSpy && methodSpy.calls) { // Ensure methodSpy and methodSpy.calls exist

                    const currentSpyCallCount = methodSpy.calls.length;

                    if (currentSpyCallCount > 0) {
                        totalCallCount += currentSpyCallCount;
                        methodSpy.calls.forEach(call => {
                            if (call && call.args) { 
                                allCallsArgs.push(call.args);
                            }
                        });
                    }
                }
            });
            return { callCount: totalCallCount, callsArgs: allCallsArgs };
        }
    };

    const clearAllStubs = () => {
        const spiesToRestore: Array<Spy<any, any[], any> | undefined> = [
            clientSpies.auth.getUserSpy,
            clientSpies.rpcSpy,
            clientSpies.fromSpy,
        ];

        spiesToRestore.forEach(s => {
            if (s && typeof s.restore === 'function' && !s.restored) {
                try {
                    s.restore();
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.warn(`[MockSupabaseClientSetup] Failed to restore client spy:`, errorMessage);
                }
            }
        });

        const client = mockClientInstance;

        // Iterate through all historic builders for all tables and restore their spies
        client.getTablesWithHistoricBuilders().forEach(tableName => {
            client.getHistoricBuildersForTable(tableName).forEach(builder => {
                Object.values(builder.methodSpies).forEach(spyInstance => {
                    const s = spyInstance;
                    if (s && typeof s.restore === 'function' && !s.restored) {
                        try {
                            s.restore();
                        } catch (e) {
                            const errorMessage = e instanceof Error ? e.message : String(e);
                            console.warn(`[MockSupabaseClientSetup] Failed to restore builder spy for table ${tableName} method:`, errorMessage);
                        }
                    }
                });
            });
        });

        // Iterate through all storage bucket API instances and restore their method spies
        client.getAllStorageBucketApiInstances().forEach(bucketApiInstance => {
            const methodsToRestore: Array<keyof IMockStorageBucketAPI> = ['upload', 'download', 'createSignedUrl', 'remove', 'list', 'copy'];
            methodsToRestore.forEach(methodName => {
                const spiedMethod = bucketApiInstance[methodName];
                if (spiedMethod && 'restore' in spiedMethod && typeof spiedMethod.restore === 'function' && 'restored' in spiedMethod && !spiedMethod.restored) {
                    try {
                        spiedMethod.restore();
                    } catch (e) {
                        // It's possible the method was never called, so the spy might not be fully "active"
                        // Or it might be a legitimate issue during restoration.
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        // console.warn(`[MockSupabaseClientSetup] Failed to restore storage spy ${methodName} for bucket ${(bucketApiInstance as any).bucketId}:`, errorMessage);
                    }
                }
            });
        });
        
        mockClientInstance.clearAllTrackedBuilders();
        mockClientInstance.clearAllTrackedStorageAPIs();

    };

    return {
        client: mockClientInstance,
        spies: clientSpies,
        clearAllStubs,
        genericMockResults: config.genericMockResults,
    };
}


// --- Test Utils for managing Supabase instance (if doing integration tests) ---
// These are not directly related to the mock client but are useful for integration tests.
// Keeping them separate for clarity if this file is primarily for unit test mocks.

// Example: Minimal RealtimeChannel mock if needed
type MockChannel = {
    on: Spy<MockChannel, [unknown, unknown]>;
    subscribe: Spy<MockChannel, [((status: string, err?: Error) => void)?], MockChannel>;
    unsubscribe: Spy<Promise<'ok' | 'error' | 'timed out'>, []>;
    topic: string;
};

export function createMockChannel(topic: string): MockChannel {
    const mockChannel: MockChannel = {
        on: spy((_event: unknown, _callback: unknown) => mockChannel),
        subscribe: spy((callback?: (status: string, err?: Error) => void) => {
            if (callback) setTimeout(() => callback('SUBSCRIBED'), 0);
            return mockChannel;
        }),
        unsubscribe: spy(async () => 'ok'),
        topic: topic,
    };
    return mockChannel;
}

// --- Helper for Fetch Mocking (if not using Deno.fetch mock directly) ---
// These are less relevant now with Deno.fetch stubbing being more common.
// Retaining for context if some tests use this pattern.

interface MockResponseConfig {
    response: Response | Promise<Response>;
    jsonData?: unknown;
}

let fetchResponses: Array<Response | Promise<Response> | MockResponseConfig> = [];
let originalFetch: typeof fetch | undefined = undefined;

export function mockFetch(
    config: Response | Promise<Response> | MockResponseConfig | Array<Response | Promise<Response> | MockResponseConfig>
) {
    if (!originalFetch) {
        originalFetch = globalThis.fetch;
    }
    fetchResponses = Array.isArray(config) ? config : [config];
    
    const fetchSpyImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof URL ? input : (typeof input === 'string' ? new URL(input) : new URL(input.url));
        console.log(`[Mock Fetch] Called: ${url.toString()}`, init);
        if (fetchResponses.length === 0) {
            throw new Error("Mock fetch called but no mock responses remaining.");
        }
        const nextResponseConfig = fetchResponses.shift()!;
        if (nextResponseConfig instanceof Response) {
            return nextResponseConfig;
        }
        if (nextResponseConfig instanceof Promise) {
            return await nextResponseConfig;
        }
        const mockConfig: MockResponseConfig = nextResponseConfig;
        if (mockConfig.jsonData !== undefined) {
            const responseValue = mockConfig.response instanceof Promise ? await mockConfig.response : mockConfig.response;
            // Create a response with JSON data
            return new Response(JSON.stringify(mockConfig.jsonData), {
                status: responseValue.status || 200,
                headers: responseValue.headers || new Headers({ 'Content-Type': 'application/json' }),
            });
        }
        const responseValue = mockConfig.response instanceof Promise ? await mockConfig.response : mockConfig.response;
        return responseValue;
    };
    globalThis.fetch = spy(fetchSpyImpl) as typeof fetch;
}

export function restoreFetch() {
    if (originalFetch) {
        globalThis.fetch = originalFetch;
        originalFetch = undefined;
        fetchResponses = [];
    }
}

// Utility to stub Deno.env.get for a test scope
export async function withMockEnv(envVars: Record<string, string>, testFn: () => Promise<void>) {
    const originalValues: Record<string, string | undefined> = {};
    const envGetStubInstance = stub(Deno.env, 'get', (key: string): string | undefined => {
        console.log(`[Test Env Stub] Deno.env.get called with: ${key}`);
        if (key in envVars) {
            return envVars[key];
        }
        const originalDenoEnvGet = Deno.env.get;
        if (originalDenoEnvGet) {
            return originalDenoEnvGet.call(Deno.env, key);
        }
        return undefined;
    });

    try {
        for (const key in envVars) {
            originalValues[key] = Deno.env.get(key);
        }
        await testFn();
    } finally {
        envGetStubInstance.restore();
    }
}

// Type for stub function signature
type StubFunction = (obj: unknown, prop: string, func: unknown) => { restore: () => void };

// Utility to stub global fetch for a test scope and return its spy
export function stubFetchForTestScope(): { spy: Spy<typeof fetch>, stub: { restore: () => void } } {
    const fetchImpl: typeof fetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        console.warn("[Fetch Stub] fetch called but no specific mock response provided for this call. Returning default empty 200 OK.");
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const fetchSpy = spy(fetchImpl);
    const stubFn: StubFunction = stub;
    const fetchStubInstance = stubFn(globalThis, "fetch", fetchSpy);
    return { spy: fetchSpy as Spy<typeof fetch>, stub: fetchStubInstance };
}

// Interface for Supabase Admin Auth API
interface SupabaseAdminAuth {
    createUser: (args: { email: string; password: string; email_confirm?: boolean; [key: string]: unknown }) => Promise<{ data: { user: User | null }; error: Error | null }>;
    listUsers: (params?: { page?: number; perPage?: number }) => Promise<{ data: { users: User[]; aud?: string }; error: Error | null }>;
    deleteUser: (id: string) => Promise<{ data: Record<string, never>; error: Error | null }>;
}

interface SupabaseClientWithAdminAuth extends SupabaseClient {
    auth: SupabaseClient['auth'] & {
        admin: SupabaseAdminAuth;
    };
}

// Type guard to check if auth has admin property
function hasAdminAuth(auth: SupabaseClient['auth']): auth is SupabaseClientWithAdminAuth['auth'] {
    if (!('admin' in auth)) {
        return false;
    }
    const adminProperty = (auth as unknown as Record<string, unknown>).admin;
    return typeof adminProperty === 'object' && adminProperty !== null;
}

// Helper to create a Supabase client with Service Role for admin tasks
// This was removed in user's previous changes but is needed for createUser/cleanupUser
function getServiceRoleAdminClient(): SupabaseClientWithAdminAuth {
    const { url, serviceRoleKey } = getSupabaseEnvVars();
    const client = createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
    return client as SupabaseClientWithAdminAuth;
}

// Create a test user
export async function createUser(email: string, password: string): Promise<{ user: User | undefined; error: Error | null }> {
    const supabaseAdmin = getServiceRoleAdminClient();
    console.log(`Creating user: ${email}`);
    if (!hasAdminAuth(supabaseAdmin.auth)) {
        return { user: undefined, error: new Error('Admin auth not available') };
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Automatically confirm email for testing
    });
    if (error) {
        console.error(`Error creating user ${email}:`, error);
    } else {
        console.log(`User ${email} created successfully.`);
    }
    return { user: data?.user ?? undefined, error: error ? new Error(error.message) : null };
}

// Clean up (delete) a test user
export async function cleanupUser(email: string, adminClient?: SupabaseClient): Promise<void> {
    const client = adminClient || getServiceRoleAdminClient();
    const supabaseAdmin = client as SupabaseClientWithAdminAuth;
    console.log(`Attempting to clean up user: ${email}`);

    if (!hasAdminAuth(supabaseAdmin.auth)) {
        console.error(`Admin auth not available for cleanup of ${email}`);
        return;
    }

    // Find user by email first
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
        console.error(`Error listing users to find ${email} for cleanup:`, listError);
        return;
    }

    const userToDelete = listData.users.find(user => user.email === email);
    if (!userToDelete) {
        console.warn(`User ${email} not found for cleanup.`);
        return;
    }

    const userId = userToDelete.id;
    console.log(`Found user ID ${userId} for ${email}. Proceeding with deletion.`);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error(`Error deleting user ${email} (ID: ${userId}):`, deleteError);
    } else {
        console.log(`User ${email} (ID: ${userId}) deleted successfully.`);
    }
}

// Helper to create spies for storage bucket methods for test assertions
export function getStorageSpies(mockSupabaseClient: IMockSupabaseClient, bucketId: string) {
  // Check if the client has the internal method (it should since MockSupabaseClient implements IMockSupabaseClient)
  if (!('getStorageBucketApiInstance' in mockSupabaseClient) || typeof mockSupabaseClient.getStorageBucketApiInstance !== 'function') {
    throw new Error(`[getStorageSpies] Client does not support getStorageBucketApiInstance method`);
  }
  
  const bucketApiInstance = mockSupabaseClient.getStorageBucketApiInstance(bucketId);

  if (!bucketApiInstance) {
    throw new Error(`[getStorageSpies] MockStorageBucketAPIImpl instance not found for bucketId: ${bucketId}. Ensure storage.from('${bucketId}') was called.`);
  }

  return {
    uploadSpy: bucketApiInstance.upload,
    downloadSpy: bucketApiInstance.download,
    createSignedUrlSpy: bucketApiInstance.createSignedUrl,
    removeSpy: bucketApiInstance.remove,
    listSpy: bucketApiInstance.list,
    copySpy: bucketApiInstance.copy,
  };
}