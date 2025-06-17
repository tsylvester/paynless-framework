// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// External imports
import {
    createClient,
    type SupabaseClient,
  } from "npm:@supabase/supabase-js@^2.43.4";
  import type { User } from "npm:@supabase/gotrue-js@^2.6.3";
  // Revert to deno.land/std for spy/stub to diagnose callCount issue
  import { spy, stub, type Spy } from "https://deno.land/std@0.190.0/testing/mock.ts";
  import { assert, assertEquals, assertRejects } from "jsr:@std/assert";


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
  single: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  maybeSingle: () => Promise<{ data: object | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  then: (
    onfulfilled?: ((value: { data: unknown[] | null; error: Error | null; count: number | null; status: number; statusText: string; }) => unknown | PromiseLike<unknown>) | null | undefined, 
    onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
  ) => Promise<unknown>; 
  returns: () => IMockQueryBuilder;
  methodSpies: { [key: string]: Spy<(...args: unknown[]) => unknown> };
}

export interface IMockSupabaseAuth {
  getUser: () => Promise<{ data: { user: User | null }; error: Error | null }>;
  getUserSpy: Spy<any, any[], Promise<{ data: { user: User | null }; error: Error | null }>>;
}

export interface IMockSupabaseClient {
  from: (tableName: string) => IMockQueryBuilder;
  auth: IMockSupabaseAuth; 
  rpc: (name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }) => Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }>;
  storage: IMockStorageAPI;
  getLatestBuilder(tableName: string): IMockQueryBuilder | undefined;
  getHistoricBuildersForTable(tableName: string): IMockQueryBuilder[] | undefined;
  clearAllTrackedBuilders(): void;
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
      storageConfig?: {
        [bucketId: string]: {
            list?: (path: string, options: any) => Promise<IMockStorageListResponse>;
            remove?: (paths: string[]) => Promise<IMockStorageRemoveResponse>;
            upload?: (path: string, body: unknown, options?: IMockStorageFileOptions) => Promise<IMockStorageUploadResponse>;
            download?: (path: string) => Promise<IMockStorageDownloadResponse>;
            createSignedUrl?: (path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>;
            copy?: (fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>;
        }
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
  
  export type MockPGRSTError = { name: string; message: string; code: string; details?: string; hint?: string };
  
  export type MockResolveQueryResult = { 
      data: unknown[] | null;
      error: Error | MockPGRSTError | null; 
      count: number | null; 
      status: number; 
      statusText: string; 
  };  

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
    select(columns?: string): IMockQueryBuilder { return this._executeMethodLogic('select', [columns]) as IMockQueryBuilder; }
    insert(data: unknown[] | object): IMockQueryBuilder { return this._executeMethodLogic('insert', [data]) as IMockQueryBuilder; }
    update(data: object): IMockQueryBuilder { return this._executeMethodLogic('update', [data]) as IMockQueryBuilder; }
    delete(): IMockQueryBuilder { return this._executeMethodLogic('delete', []) as IMockQueryBuilder; }
    upsert(data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }): IMockQueryBuilder { return this._executeMethodLogic('upsert', [data, options]) as IMockQueryBuilder; }
    eq(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('eq', [column, value]) as IMockQueryBuilder; }
    neq(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('neq', [column, value]) as IMockQueryBuilder; }
    gt(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('gt', [column, value]) as IMockQueryBuilder; }
    gte(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('gte', [column, value]) as IMockQueryBuilder; }
    lt(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('lt', [column, value]) as IMockQueryBuilder; }
    lte(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('lte', [column, value]) as IMockQueryBuilder; }
    like(column: string, pattern: string): IMockQueryBuilder { return this._executeMethodLogic('like', [column, pattern]) as IMockQueryBuilder; }
    ilike(column: string, pattern: string): IMockQueryBuilder { return this._executeMethodLogic('ilike', [column, pattern]) as IMockQueryBuilder; }
    is(column: string, value: 'null' | 'not null' | 'true' | 'false'): IMockQueryBuilder { return this._executeMethodLogic('is', [column, value]) as IMockQueryBuilder; }
    in(column: string, values: unknown[]): IMockQueryBuilder { return this._executeMethodLogic('in', [column, values]) as IMockQueryBuilder; }
    contains(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeMethodLogic('contains', [column, value]) as IMockQueryBuilder; }
    containedBy(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeMethodLogic('containedBy', [column, value]) as IMockQueryBuilder; }
    rangeGt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeGt', [column, rangeVal]) as IMockQueryBuilder; }
    rangeGte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeGte', [column, rangeVal]) as IMockQueryBuilder; }
    rangeLt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeLt', [column, rangeVal]) as IMockQueryBuilder; }
    rangeLte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeLte', [column, rangeVal]) as IMockQueryBuilder; }
    rangeAdjacent(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeAdjacent', [column, rangeVal]) as IMockQueryBuilder; }
    overlaps(column: string, value: string | string[]): IMockQueryBuilder { return this._executeMethodLogic('overlaps', [column, value]) as IMockQueryBuilder; }
    textSearch(column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' }): IMockQueryBuilder { return this._executeMethodLogic('textSearch', [column, query, options]) as IMockQueryBuilder; }
    match(query: object): IMockQueryBuilder { return this._executeMethodLogic('match', [query]) as IMockQueryBuilder; }
    or(filters: string, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('or', [filters, options]) as IMockQueryBuilder; }
    filter(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('filter', [column, operator, value]) as IMockQueryBuilder; }
    not(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('not', [column, operator, value]) as IMockQueryBuilder; }
    order(column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('order', [column, options]) as IMockQueryBuilder; }
    limit(count: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('limit', [count, options]) as IMockQueryBuilder; }
    range(from: number, to: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('range', [from, to, options]) as IMockQueryBuilder; }
    returns(): IMockQueryBuilder { return this._executeMethodLogic('returns', []) as IMockQueryBuilder; }

    single(): Promise<MockResolveQueryResult> { return this._executeMethodLogic('single', []) as Promise<MockResolveQueryResult>; }
    maybeSingle(): Promise<MockResolveQueryResult> { return this._executeMethodLogic('maybeSingle', []) as Promise<MockResolveQueryResult>; }
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
            if (typeof this[methodName as keyof this] === 'function') {
                this.methodSpies[methodName] = spy(this, methodName as keyof MockQueryBuilder) as unknown as Spy<(...args: unknown[]) => unknown>;
            } else {
                console.warn(`[MockQueryBuilder] Method ${methodName} is not a function on the instance, cannot spy.`);
            }
        }
    }

    private _executeMethodLogic(methodName: keyof IMockQueryBuilder, args: unknown[]): IMockQueryBuilder | Promise<MockResolveQueryResult> {
        console.log(`[Mock QB ${this._state.tableName}] .${methodName}(${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(', ')}) called`);
        switch(methodName as string) {
            case 'select': 
                // If current operation is a mutation, select just specifies return shape
                if (!['insert', 'update', 'upsert'].includes(this._state.operation)) {
                    this._state.operation = 'select'; 
                }
                this._state.selectColumns = typeof args[0] === 'string' || args[0] === undefined ? (args[0] as string | undefined) || '*' : '*'; 
                return this;
            case 'insert': this._state.operation = 'insert'; this._state.insertData = args[0] as (object | unknown[]); return this;
            case 'update': this._state.operation = 'update'; this._state.updateData = args[0] as object; return this;
            case 'delete': this._state.operation = 'delete'; return this;
            case 'upsert': 
                this._state.operation = 'upsert'; 
                this._state.upsertData = args[0] as (object | unknown[]); 
                this._state.upsertOptions = args[1] as { onConflict?: string, ignoreDuplicates?: boolean } | undefined;
                return this;
            case 'eq': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'eq' }); return this;
            case 'neq': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'neq' }); return this;
            case 'gt': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'gt' }); return this;
            case 'gte': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'gte' }); return this;
            case 'lt': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'lt' }); return this;
            case 'lte': this._state.filters.push({ column: args[0] as string, value: args[1], type: 'lte' }); return this;
            case 'like': this._state.filters.push({ column: args[0] as string, value: args[1] as string, type: 'like' }); return this;
            case 'ilike': this._state.filters.push({ column: args[0] as string, value: args[1] as string, type: 'ilike' }); return this;
            case 'is': this._state.filters.push({ column: args[0] as string, value: args[1] as 'null' | 'not null' | 'true' | 'false', type: 'is' }); return this;
            case 'in': this._state.filters.push({ column: args[0] as string, value: args[1] as unknown[], type: 'in' }); return this;
            case 'contains': this._state.filters.push({ column: args[0] as string, value: args[1] as string | string[] | object, type: 'contains' }); return this;
            case 'containedBy': this._state.filters.push({ column: args[0] as string, value: args[1] as string | string[] | object, type: 'containedBy' }); return this;
            case 'match': this._state.matchQuery = args[0] as object; return this;
            case 'or': this._state.filters.push({ filters: args[0] as string, type: 'or', referencedTable: (args[1] as { referencedTable?: string } | undefined)?.referencedTable }); return this;
            case 'filter': this._state.filters.push({ column: args[0] as string, operator: args[1] as string, value: args[2], type: 'filter' }); return this;
            case 'not': this._state.filters.push({ column: args[0] as string, operator: args[1] as string, value: args[2], type: 'not' }); return this;
            case 'order': this._state.orderBy = { column: args[0] as string, options: args[1] as { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string } | undefined }; return this;
            case 'limit': this._state.limitCount = args[0] as number; return this;
            case 'range': this._state.rangeFrom = args[0] as number; this._state.rangeTo = args[1] as number; return this;
            case 'single': return this._resolveQuery(true, false);
            case 'maybeSingle': return this._resolveQuery(false, true);
            case 'returns': return this;
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

        if (typeof operationConfig === 'function') {
            console.log(`[Mock QB ${this._state.tableName}] Using function config for ${this._state.operation}`);
            try {
                // The mock function is responsible for returning the complete MockResolveQueryResult structure
                result = await (operationConfig as (state: MockQueryBuilderState) => Promise<MockResolveQueryResult>)(this._state);
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
            result = { // Ensure all parts of MockResolveQueryResult are provided
                data: operationConfig.data !== undefined ? operationConfig.data : null,
                error: operationConfig.error !== undefined ? operationConfig.error : null,
                count: operationConfig.count !== undefined ? operationConfig.count : null,
                status: operationConfig.status !== undefined ? operationConfig.status : 200,
                statusText: operationConfig.statusText !== undefined ? operationConfig.statusText : 'OK'
            };
        } else {
            // Default behavior if no specific mock is found for the operation
            console.warn(`[Mock QB ${this._state.tableName}] No specific mock found for operation ${this._state.operation}. Returning default empty success.`);
            // Default result is already initialized
        }
        
        // Simulate PostgREST behavior for .single() and .maybeSingle()
        // This shaping happens *after* the mock result is obtained.
        if (isSingle) {
            if (result.data && result.data.length === 1) {
                result.data = result.data[0] as unknown[] | null; // Correctly assign the single object
            } else if (result.data && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new Error('Query returned more than one row') as Error & MockPGRSTError;
                    (result.error as MockPGRSTError).code = 'PGRST116';
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new Error('Query returned no rows') as Error & MockPGRSTError;
                    (result.error as MockPGRSTError).code = 'PGRST116';
                    result.status = 406;
                }
                result.data = null; // Data becomes/stays null if error or 0 rows
            }
        } else if (isMaybeSingle) {
            if (result.data && result.data.length === 1) {
                result.data = result.data[0] as unknown[] | null; // Correctly assign the single object
            } else if (result.data && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new Error('Query returned more than one row') as Error & MockPGRSTError;
                    (result.error as MockPGRSTError).code = 'PGRST116'; 
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                // For maybeSingle, if 0 rows, data is null, error remains as is (or null if not set)
                result.data = null; 
            }
        }

        if (result.error && !(result.error instanceof Error)) {
            const errObj = result.error as { message: string, name?: string, code?: string, details?: string, hint?: string };
            result.error = new Error(errObj.message) as Error & MockPGRSTError;
            if (errObj.name) (result.error as MockPGRSTError).name = errObj.name;
            if (errObj.code) (result.error as MockPGRSTError).code = errObj.code;
            if (errObj.details) (result.error as MockPGRSTError).details = errObj.details;
            if (errObj.hint) (result.error as MockPGRSTError).hint = errObj.hint;
            if (result.status >= 200 && result.status < 300) result.status = (result.error as MockPGRSTError).code === 'PGRST116' ? 406 : 500; 
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
        // Cast the spy to the specific type defined in the interface
        this.getUserSpy = spy(this, 'getUser') as IMockSupabaseAuth['getUserSpy'];
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
                 const baseUser = { ...this._config.mockUser };
                 if (this._currentTestUserId) { // currentTestUserId can override the id in mockUser if both are present
                     baseUser.id = this._currentTestUserId;
                 }
                 return Promise.resolve({ data: { user: baseUser as User }, error: null });
            }
        }

        // Fallback to currentTestUserId or a default mock user if mockUser is not explicitly in config
        const userIdToReturn = this._currentTestUserId || "mock-user-id"; // Default if no currentTestUserId
        const userToReturn = {
            id: userIdToReturn,
            aud: "authenticated",
            role: "authenticated",
            email: `${userIdToReturn}@example.com` 
        };

        return Promise.resolve({ data: { user: userToReturn as User }, error: null });
    }
}

// --- START: MockStorageBucketAPI Implementation ---
class MockStorageBucketAPIImpl implements IMockStorageBucketAPI {
    private bucketId: string;
    private config: MockSupabaseDataConfig;
    public upload: (path: string, body: unknown, options?: IMockStorageFileOptions) => Promise<IMockStorageUploadResponse>;
    public download: (path: string) => Promise<IMockStorageDownloadResponse>;
    public createSignedUrl: (path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>;
    public remove: (paths: string[]) => Promise<IMockStorageRemoveResponse>;
    public list: (path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string; }; search?: string; }) => Promise<IMockStorageListResponse>;
    public copy: (fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>;
    
    constructor(bucketId: string, config: MockSupabaseDataConfig) {
        this.bucketId = bucketId;
        this.config = config;
        this.upload = spy(this, 'performUploadInternal') as unknown as (path: string, body: unknown, options?: IMockStorageFileOptions) => Promise<IMockStorageUploadResponse>;
        this.download = spy(this, 'performDownloadInternal') as unknown as (path: string) => Promise<IMockStorageDownloadResponse>;
        this.createSignedUrl = spy(this, 'performCreateSignedUrlInternal') as unknown as (path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>;
        this.remove = spy(this, 'performRemoveInternal') as unknown as (paths: string[]) => Promise<IMockStorageRemoveResponse>;
        this.list = spy(this, 'performListInternal') as unknown as (path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string; }; search?: string; }) => Promise<IMockStorageListResponse>;
        this.copy = spy(this, 'performCopyInternal') as unknown as (fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>;
    }

    public async performUploadInternal(path: string, body: unknown, options?: IMockStorageFileOptions): Promise<IMockStorageUploadResponse> {
        if (typeof this.config.storageMock?.uploadResult === 'function') {
            return this.config.storageMock.uploadResult(this.bucketId, path, body, options);
        } else if (this.config.storageMock?.uploadResult) {
            return this.config.storageMock.uploadResult;
        }
        return { data: { path: path }, error: null }; 
    }

    public async performDownloadInternal(path: string): Promise<IMockStorageDownloadResponse> {
        if (typeof this.config.storageMock?.downloadResult === 'function') {
            return this.config.storageMock.downloadResult(this.bucketId, path);
        } else if (this.config.storageMock?.downloadResult) {
            return this.config.storageMock.downloadResult;
        }
        return { data: null, error: null };
    }

    public async performCreateSignedUrlInternal(path: string, expiresIn: number): Promise<IMockStorageSignedUrlResponse> {
        if (typeof this.config.storageMock?.createSignedUrlResult === 'function') {
            return this.config.storageMock.createSignedUrlResult(this.bucketId, path, expiresIn);
        } else if (this.config.storageMock?.createSignedUrlResult) {
            return this.config.storageMock.createSignedUrlResult;
        }
        return { data: { signedUrl: `mocked://signed-url/${this.bucketId}/${path}?expires_in=${expiresIn}` }, error: null };
    }

    public async performRemoveInternal(paths: string[]): Promise<IMockStorageRemoveResponse> {
        console.log(`[MockStorageBucketAPI ${this.bucketId}] performRemoveInternal called with paths:`, paths);
        if (this.config.storageMock?.removeResult) {
            if (typeof this.config.storageMock.removeResult === 'function') {
                try {
                    return await (this.config.storageMock.removeResult as (bucketId: string, paths: string[]) => Promise<IMockStorageRemoveResponse>)(this.bucketId, paths);
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

    public async performListInternal(path?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string; }; search?: string; }): Promise<IMockStorageListResponse> {
        console.log(`[MockStorageBucketAPI ${this.bucketId}] performListInternal called with path: ${path}, options:`, options);
        if (this.config.storageMock?.listResult) {
            if (typeof this.config.storageMock.listResult === 'function') {
                try {
                    return await (this.config.storageMock.listResult as (bucketId: string, path?: string, options?: object) => Promise<IMockStorageListResponse>)(this.bucketId, path, options);
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

    public async performCopyInternal(fromPath: string, toPath: string): Promise<IMockStorageCopyResponse> {
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
    public readonly storage: IMockStorageAPI; // Implement this
    public readonly rpcSpy: Spy<IMockSupabaseClient['rpc']>;
    public readonly fromSpy: Spy<IMockSupabaseClient['from']>;
    private _config: MockSupabaseDataConfig;
    private _latestBuilders: Map<string, MockQueryBuilder> = new Map();
    private _historicBuildersByTable: Map<string, MockQueryBuilder[]> = new Map();
    private _mockStorageBucketAPIs: Map<string, MockStorageBucketAPIImpl> = new Map();


    constructor(config: MockSupabaseDataConfig, auth: MockSupabaseAuth) {
        this._config = config;
        this.auth = auth;
        this.rpcSpy = spy(this, 'rpc') as unknown as Spy<IMockSupabaseClient['rpc']>;
        this.fromSpy = spy(this, 'from') as unknown as Spy<IMockSupabaseClient['from']>;

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
                const bucketAPI = mockClientInstance.storage.from(bucketId) as MockStorageBucketAPIImpl | undefined;
                if (!bucketAPI) {
                    // This case should ideally not happen if 'from' is called on existing buckets
                    // or if getStorageBucketApiInstance auto-creates. For now, throw or return undefined spies.
                    console.warn(`[Mock Supabase Spies] Storage bucket API not found for ${bucketId} when creating spies.`);
                    // Return an object with undefined spies or throw an error
                    return {
                        uploadSpy: undefined as any, downloadSpy: undefined as any, createSignedUrlSpy: undefined as any,
                        removeSpy: undefined as any, listSpy: undefined as any, copySpy: undefined as any,
                    };
                }
                return {
                    uploadSpy: bucketAPI.upload as Spy<IMockStorageBucketAPI['upload']>,
                    downloadSpy: bucketAPI.download as Spy<IMockStorageBucketAPI['download']>,
                    createSignedUrlSpy: bucketAPI.createSignedUrl as Spy<IMockStorageBucketAPI['createSignedUrl']>,
                    removeSpy: bucketAPI.remove as Spy<IMockStorageBucketAPI['remove']>,
                    listSpy: bucketAPI.list as Spy<IMockStorageBucketAPI['list']>,
                    copySpy: bucketAPI.copy as Spy<IMockStorageBucketAPI['copy']>,
                };
            }
        },
        getLatestQueryBuilderSpies: (tableName: string) => {
            const builder = mockClientInstance.getLatestBuilder(tableName);
            return builder?.methodSpies as AllQueryBuilderSpyMethods | undefined;
        },
        getAllQueryBuilderSpies: (tableName: string) => {
            const historicBuilders = mockClientInstance.getHistoricBuildersForTable(tableName);
            if (!historicBuilders || historicBuilders.length === 0) {
                return undefined;
            }
            return historicBuilders.map(builder =>
                builder.methodSpies as AllQueryBuilderSpyMethods
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
            clientSpies.auth.getUserSpy as Spy<any, any[], any> | undefined,
            clientSpies.rpcSpy as Spy<any, any[], any> | undefined,
            clientSpies.fromSpy as Spy<any, any[], any> | undefined,
        ];

        spiesToRestore.forEach(s => {
            if (s && typeof s.restore === 'function' && !s.restored) {
                try {
                    s.restore();
                } catch (e) {
                    console.warn(`[MockSupabaseClientSetup] Failed to restore client spy:`, (e as Error).message);
                }
            }
        });

        const client = mockClientInstance as unknown as MockSupabaseClient;

        // Iterate through all historic builders for all tables and restore their spies
        client.getTablesWithHistoricBuilders().forEach(tableName => {
            client.getHistoricBuildersForTable(tableName).forEach(builder => {
                Object.values(builder.methodSpies).forEach(spyInstance => {
                    const s = spyInstance as Spy<any, any[], any>;
                    if (s && typeof s.restore === 'function' && !s.restored) {
                        try {
                            s.restore();
                        } catch (e) {
                            console.warn(`[MockSupabaseClientSetup] Failed to restore builder spy for table ${tableName} method:`, (e as Error).message);
                        }
                    }
                });
            });
        });

        // Iterate through all storage bucket API instances and restore their method spies
        client.getAllStorageBucketApiInstances().forEach(bucketApiInstance => {
            const methodsToRestore: Array<keyof IMockStorageBucketAPI> = ['upload', 'download', 'createSignedUrl', 'remove', 'list', 'copy'];
            methodsToRestore.forEach(methodName => {
                const spiedMethod = bucketApiInstance[methodName] as unknown as Spy<any,any[],any>;
                if (spiedMethod && typeof spiedMethod.restore === 'function' && !spiedMethod.restored) {
                    try {
                        spiedMethod.restore();
                    } catch (e) {
                        // It's possible the method was never called, so the spy might not be fully "active"
                        // Or it might be a legitimate issue during restoration.
                        // console.warn(`[MockSupabaseClientSetup] Failed to restore storage spy ${methodName} for bucket ${(bucketApiInstance as any).bucketId}:`, (e as Error).message);
                    }
                }
            });
        });
        
        mockClientInstance.clearAllTrackedBuilders();
        mockClientInstance.clearAllTrackedStorageAPIs();

    };

    return {
        client: mockClientInstance as unknown as IMockSupabaseClient,
        spies: clientSpies,
        clearAllStubs,
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
        unsubscribe: spy(async () => 'ok' as const),
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
    
    globalThis.fetch = spy(async (url: string | URL, options?: RequestInit): Promise<Response> => {
        console.log(`[Mock Fetch] Called: ${url.toString()}`, options);
        if (fetchResponses.length === 0) {
            throw new Error("Mock fetch called but no mock responses remaining.");
        }
        const nextResponseConfig = fetchResponses.shift()!;
        if (nextResponseConfig instanceof Response || typeof (nextResponseConfig as Promise<Response>).then === 'function') {
            return nextResponseConfig as Response | Promise<Response>;
        }
        const mockConfig = nextResponseConfig as MockResponseConfig;
        if (mockConfig.jsonData) {
            // Create a response with JSON data
            return new Response(JSON.stringify(mockConfig.jsonData), {
                status: (mockConfig.response as Response).status || 200,
                headers: (mockConfig.response as Response).headers || new Headers({ 'Content-Type': 'application/json' }),
            });
        }
        return mockConfig.response;
    }) as typeof fetch;
}

export function restoreFetch() {
    if (originalFetch) {
        globalThis.fetch = originalFetch;
        originalFetch = undefined;
        fetchResponses = [];
    }
}

// Utility to stub Deno.env.get for a test scope
export function withMockEnv(envVars: Record<string, string>, testFn: () => Promise<void>) {
    const originalValues: Record<string, string | undefined> = {};
    const envGetStubInstance = stub(Deno.env, 'get', (key: string): string | undefined => {
        console.log(`[Test Env Stub] Deno.env.get called with: ${key}`);
        if (key in envVars) {
            return envVars[key];
        }
        const originalDenoEnvGet = Deno.env.get; 
        return originalDenoEnvGet.call(Deno.env, key);
    });

    try {
        for (const key in envVars) {
            originalValues[key] = Deno.env.get(key);
        }
        return testFn();
    } finally {
        envGetStubInstance.restore();
    }
}

// Utility to stub global fetch for a test scope and return its spy
export function stubFetchForTestScope(): { spy: Spy<unknown, [string | URL, (RequestInit | undefined)?], Promise<Response>>, stub: any } {
    const fetchSpy = spy(async (_url: string | URL, _options?: RequestInit): Promise<Response> => {
        console.warn("[Fetch Stub] fetch called but no specific mock response provided for this call. Returning default empty 200 OK.");
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const fetchStubInstance = stub(globalThis, "fetch", fetchSpy as (...args: unknown[]) => Promise<Response>);
    return { spy: fetchSpy, stub: fetchStubInstance };
}

// Helper to create a Supabase client with Service Role for admin tasks
// This was removed in user's previous changes but is needed for createUser/cleanupUser
function getServiceRoleAdminClient(): SupabaseClient {
    const { url, serviceRoleKey } = getSupabaseEnvVars();
    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

// Create a test user
export async function createUser(email: string, password: string): Promise<{ user: User | undefined; error: Error | null }> {
    const supabaseAdmin = getServiceRoleAdminClient();
    console.log(`Creating user: ${email}`);
    const { data, error } = await (supabaseAdmin.auth as unknown as { admin: { createUser: (args: { email: string; password: string; email_confirm?: boolean; [key: string]: unknown; }) => Promise<{ data: { user: User | null; }; error: Error | null; }> } }).admin.createUser({
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
    const supabaseAdmin = adminClient || getServiceRoleAdminClient();
    console.log(`Attempting to clean up user: ${email}`);

    // Find user by email first
    const { data: listData, error: listError } = await (supabaseAdmin.auth as unknown as { admin: { listUsers: (params?: { page?: number; perPage?: number; }) => Promise<{ data: { users: User[]; aud?: string; }; error: Error | null; }> } }).admin.listUsers();

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

    // Cast auth to any for deleteUser
    const { error: deleteError } = await (supabaseAdmin.auth as unknown as { admin: { deleteUser: (id: string) => Promise<{ data: Record<string, never>; error: Error | null; }> } }).admin.deleteUser(userId);

    if (deleteError) {
        console.error(`Error deleting user ${email} (ID: ${userId}):`, deleteError);
    } else {
        console.log(`User ${email} (ID: ${userId}) deleted successfully.`);
    }
}

// Helper to create spies for storage bucket methods for test assertions
export function getStorageSpies(mockSupabaseClient: IMockSupabaseClient, bucketId: string) {
  const clientWithDetails = mockSupabaseClient as unknown as MockSupabaseClient; // Cast to access internal details
  const bucketApiInstance = clientWithDetails.getStorageBucketApiInstance(bucketId) as MockStorageBucketAPIImpl | undefined;

  if (!bucketApiInstance) {
    throw new Error(`[getStorageSpies] MockStorageBucketAPIImpl instance not found for bucketId: ${bucketId}. Ensure storage.from('${bucketId}') was called.`);
  }

  return {
    uploadSpy: bucketApiInstance.upload as Spy<MockStorageBucketAPIImpl['performUploadInternal']>,
    downloadSpy: bucketApiInstance.download as Spy<MockStorageBucketAPIImpl['performDownloadInternal']>,
    createSignedUrlSpy: bucketApiInstance.createSignedUrl as Spy<MockStorageBucketAPIImpl['performCreateSignedUrlInternal']>,
    removeSpy: bucketApiInstance.remove as Spy<MockStorageBucketAPIImpl['performRemoveInternal']>,
    listSpy: bucketApiInstance.list as Spy<MockStorageBucketAPIImpl['performListInternal']>,
    copySpy: bucketApiInstance.copy as Spy<MockStorageBucketAPIImpl['performCopyInternal']>,
  };
}

export function getMockUser(id: string): User {
  return {
    id,
    app_metadata: { provider: "email" },
    user_metadata: { name: "Test User" },
    aud: "authenticated",
    confirmation_sent_at: new Date().toISOString(),
    recovery_sent_at: "",
    email_change_sent_at: "",
    new_email: "",
    new_phone: "",
    invited_at: "",
    action_link: "",
    email: `${id}@example.com`,
    phone: "",
    created_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    phone_confirmed_at: "",
    last_sign_in_at: new Date().toISOString(),
    role: "authenticated",
    updated_at: new Date().toISOString(),
    identities: [],
    factors: [],
  };
}