// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// External imports
import {
    createClient,
    type SupabaseClient,
    AuthError as SupabaseAuthError,
    type Session,
    type UserResponse as SupabaseUserResponse,
    type AuthError,
    type User,
} from "npm:@supabase/supabase-js@^2.43.4";
import { 
    // AuthError as GoTrueAuthError -- Avoid using this directly if SupabaseAuthError is preferred
} from "npm:@supabase/gotrue-js@^2.6.3";
import type { Database } from "../types_db.ts";
// Revert to deno.land/std for spy/stub to diagnose callCount issue
import { spy, stub, type Spy, type Stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import type {
    FileObject,
    TransformOptions,
    SearchOptions,
    FileOptions,
    // FileBody is not exported, so we use 'any' below
} from "npm:@supabase/storage-js@^2.5.5"; 

// deno-lint-ignore no-explicit-any
type FileBody = any; // Define FileBody as any for mock purposes - moved to top level after imports

export type MockPGRSTError = { name: string; message: string; code: string; details?: string; hint?: string };

export class PostgrestError extends Error {
    readonly code: string;
    readonly details?: string;
    readonly hint?: string;

    constructor({ message, code, details, hint }: { message: string; code: string; details?: string; hint?: string; }) {
        super(message);
        this.name = 'PostgrestError';
        this.code = code;
        this.details = details;
        this.hint = hint;
    }
}

export type MockResolveQueryResult = { 
    data: unknown[] | object | null;
    error: Error | MockPGRSTError | null; 
    count: number | null; 
    status: number; 
    statusText: string; 
    
};  

interface SupabaseAuthAdminApi {
    admin: {
      createUser(args: {
        email: string;
        password: string;
        email_confirm?: boolean;
        [key: string]: unknown;
      }): Promise<{ data: { user: User | null }; error: Error | null }>;
      listUsers(params?: {
          page?: number;
          perPage?: number;
      }): Promise<{ data: { users: User[]; aud?: string; }; error: Error | null; }>;
      deleteUser(id: string): Promise<{ data: { user: User | null }; error: Error | null }>;
    };
  }

  declare module "npm:@supabase/gotrue-js@^2.6.3" {
    interface GoTrueClient extends SupabaseAuthAdminApi {}
  }

  // --- Interfaces for Mock Supabase Client (for testing) ---
export interface IMockQueryBuilder {
  select: (columns?: string) => IMockQueryBuilder;
  insert: (data: unknown[] | object) => IMockQueryBuilder;
  update: (data: object) => IMockQueryBuilder;
  delete: () => IMockQueryBuilder;
  upsert: (data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }) => IMockQueryBuilder;
  is: (column: string, value: string | boolean | null) => IMockQueryBuilder; // <-- MODIFIED
  in: (column: string, values: readonly unknown[]) => IMockQueryBuilder;
  ilike: (column: string, pattern: string) => IMockQueryBuilder;

  // Filtering
  eq: (column: string, value: unknown) => IMockQueryBuilder;
  neq: (column: string, value: unknown) => IMockQueryBuilder;
  gt: (column: string, value: unknown) => IMockQueryBuilder;
  gte: (column: string, value: unknown) => IMockQueryBuilder;
  lt: (column: string, value: unknown) => IMockQueryBuilder;
  lte: (column: string, value: unknown) => IMockQueryBuilder;
  like: (column: string, pattern: string) => IMockQueryBuilder;
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
  single: () => IMockQueryBuilder; // <<< MODIFIED LINE 105
  maybeSingle: () => IMockQueryBuilder; // <<< MODIFIED LINE 106
  then: (
    onfulfilled?: ((value: MockResolveQueryResult) => unknown | PromiseLike<unknown>) | null | undefined, 
    onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
  ) => Promise<unknown>; 
returns: () => IMockQueryBuilder;
  methodSpies: { [key: string]: Spy };
  url: URL;
  headers: Record<string, string>;
  likeAllOf: (column: string, patterns: string[]) => IMockQueryBuilder;
  likeAnyOf: (column: string, patterns: string[]) => IMockQueryBuilder;
  ilikeAllOf: (column: string, patterns: string[]) => IMockQueryBuilder;
  ilikeAnyOf: (column: string, patterns: string[]) => IMockQueryBuilder;
  csv: () => Promise<string>;
  abortSignal: (signal: AbortSignal) => IMockQueryBuilder;
  geojson: () => Promise<any>;
  explain: (options?: any) => Promise<any>;
  rollback: () => IMockQueryBuilder;
  throwOnError?: boolean;
  setHeader?: (name: string, value: string) => IMockQueryBuilder;
  overrideTypes?: (types: Record<string, string> | string) => IMockQueryBuilder;
  getSpy?: (methodName: keyof IMockQueryBuilder) => Spy | undefined;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  shouldThrowOnError?: boolean;
  fetch?: typeof globalThis.fetch;
  isMaybeSingleQuery?: boolean; // To represent the state for maybeSingle
  isMaybeSingle?: () => Promise<MockResolveQueryResult>;
}

export interface IMockSupabaseAuth {
  getUser: () => Promise<SupabaseUserResponse>;
  getUserSpy: Spy;
  getAllQueryBuilderSpies: (tableName: string) => Array<AllQueryBuilderSpyMethods> | undefined;
  getHistoricQueryBuilderSpies: (tableName: string, methodName: string) => { callCount: number; callsArgs: unknown[][] } | undefined;
}

export interface IMockRealtimeAPI {
    on: (event: string, callback: (data: unknown) => void) => void;
    subscribe: (channel: string, callback: (data: unknown) => void) => void;
    unsubscribe: (channel: string) => void;
    channel: (channel: string) => IMockRealtimeChannelAPI;
}

export interface IMockRealtimeChannelAPI {
    on: (event: string, callback: (data: unknown) => void) => void;
    subscribe: (channel: string, callback: (data: unknown) => void) => void;
    unsubscribe: (channel: string) => void;
}

export interface IMockRestAPI {
    get: (url: string) => Promise<{ data: unknown | null; error: Error | null }>;
    post: (url: string, body: unknown) => Promise<{ data: unknown | null; error: Error | null }>;
    put: (url: string, body: unknown) => Promise<{ data: unknown | null; error: Error | null }>;
    delete: (url: string) => Promise<{ data: unknown | null; error: Error | null }>;
}

export interface IMockFunctionsAPI {
    invoke: (name: string, params?: object) => Promise<{ data: unknown | null; error: Error | null }>;
}


export interface IMockSupabaseClient {
  from: (tableName: string) => IMockQueryBuilder;
  auth: IMockSupabaseAuth;
  rpc: (
    name: string,
    params?: object,
    options?: {
      head?: boolean;
      count?: 'exact' | 'planned' | 'estimated';
    },
  ) => Promise<{
    data: unknown | null;
    error: Error | null;
    count: number | null;
    status: number;
    statusText: string;
  }>;
  storage: IMockStorageAPI;
  getLatestBuilder(tableName: string): IMockQueryBuilder | undefined;
  getHistoricBuildersForTable(
    tableName: string,
  ): IMockQueryBuilder[] | undefined;
  clearAllTrackedBuilders(): void;
  getStorageBucketApiInstance(
    bucketId: string,
  ): IMockStorageBucketAPI | undefined;
  getSpiesForTableQueryMethod: (
    tableName: string,
    methodName: keyof IMockQueryBuilder,
    callIndex?: number,
  ) => Spy | undefined;
  getAllBuildersUsed(): IMockQueryBuilder[];
  getTablesWithHistoricBuilders(): string[];
  getAllStorageBucketApiInstances(): MockStorageBucketAPIImpl[];
  clearAllTrackedStorageAPIs(): void;
  supabaseUrl: string;
  supabaseKey: string;  
  realtimeUrl: string;
  authUrl: string;
  storageUrl: string;
  functionsUrl: string;
  realtime: IMockRealtimeAPI;
  rest: IMockRestAPI;
  storageKey: string;
  headers: Record<string, string>;
  functions: IMockFunctionsAPI;
  schema(schema: 'public' | 'storage' | 'graphql_public' | (string & Record<string, unknown>)): this;
  channel(channel: string): IMockRealtimeChannelAPI;
  getChannels(): IMockRealtimeChannelAPI[];
  removeChannel(channel: IMockRealtimeChannelAPI): void;
  removeAllChannels(): void;
  _getAccessToken(): Promise<string | null>;
  _initSupabaseAuthClient(): void;
  _initSupabaseRealtimeClient(): void;  
  _handleTokenChanged(event: string, session: unknown): void;
  _initAuthEvents(): void;
  _initRealtimeClient(): void;
  _listenForAuthEvents(): void;
}

// Helper type for the comprehensive set of spied query builder methods
export type AllQueryBuilderSpyMethods = {
  select?: Spy;
  insert?: Spy;
  update?: Spy;
  delete?: Spy;
  upsert?: Spy;
  eq?: Spy;
  neq?: Spy;
  gt?: Spy;
  gte?: Spy;
  lt?: Spy;
  lte?: Spy;
  like?: Spy;
  ilike?: Spy;
  is?: Spy;
  in?: Spy;
  contains?: Spy;
  containedBy?: Spy;
  rangeGt?: Spy;
  rangeGte?: Spy;
  rangeLt?: Spy;
  rangeLte?: Spy;
  rangeAdjacent?: Spy;
  overlaps?: Spy;
  textSearch?: Spy;
  match?: Spy;
  or?: Spy;
  filter?: Spy;
  not?: Spy;
  order?: Spy;
  limit?: Spy;
  range?: Spy;
  single?: Spy;
  maybeSingle?: Spy;
  then?: Spy;
  returns?: Spy; 
};

export interface IMockClientSpies {
  auth: {
    getUserSpy: Spy;
    getSessionSpy: Spy; // Added getSessionSpy
  };
  rpcSpy: Spy;
  fromSpy: Spy; // Spy for client.from()
  storageFromSpy: Spy; // Added spy for client.storage.from()
  storage: { // This remains for accessing individual bucket method spies
    from: (bucketId: string) => {
      uploadSpy?: Spy;
      downloadSpy?: Spy;
      createSignedUrlSpy?: Spy;
      removeSpy?: Spy;
      listSpy?: Spy;
      copySpy?: Spy;
    };
  };
  getLatestQueryBuilderSpies: (tableName: string) => AllQueryBuilderSpyMethods | undefined;
  getAllQueryBuilderSpies: (tableName: string) => Array<AllQueryBuilderSpyMethods> | undefined;
  getHistoricQueryBuilderSpies: (tableName: string, methodName: string) => { callCount: number; callsArgs: unknown[][] } | undefined;
}

  export interface MockSupabaseClientSetup {
    client: SupabaseClient<Database>;
    clientSpies: IMockClientSpies;
    mockStorageBucketAPIs: Map<string, MockStorageBucketAPIImpl>; // Added to expose the map
    cleanup: () => void;
    get historicBuildersByTable(): ReadonlyMap<string, MockQueryBuilder[]>;
    clearAllStubs?: () => void;
    getLatestBuilder(tableName: string): IMockQueryBuilder | undefined;
    getHistoricBuildersForTable(
      tableName: string,
    ): IMockQueryBuilder[] | undefined;
    clearAllTrackedBuilders(): void;
    getStorageBucketApiInstance(
      bucketId: string,
    ): IMockStorageBucketAPI | undefined;
    getSpiesForTableQueryMethod: (
      tableName: string,
      methodName: keyof IMockQueryBuilder,
      callIndex?: number,
    ) => Spy | undefined;
    getAllBuildersUsed(): IMockQueryBuilder[];
    getTablesWithHistoricBuilders(): string[];
    getAllStorageBucketApiInstances(): MockStorageBucketAPIImpl[];
    clearAllTrackedStorageAPIs(): void;
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
    data: { name: string; id?: string; updated_at?: string; created_at?: string; last_accessed_at?: string; metadata?: Record<string, unknown> }[] | null;
    error: Error | null;
  }
  
  // New response type specifically for the 'remove' operation, which returns FileObject[] on success.
  export interface IMockStorageRemoveResponse {
    data: { name: string; id?: string; updated_at?: string; created_at?: string; last_accessed_at?: string; metadata?: Record<string, unknown> }[] | null;
    error: Error | null;
  }
  
  // 1. Define IMockStorageCopyResponse
  export interface IMockStorageCopyResponse {
    data: { path: string } | null;
    error: Error | null;
  }
  
  // Interface for the API of a specific bucket (e.g., client.storage.from('avatars'))
  export interface IMockStorageBucketAPI {
    upload: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string; } | null; error: Error | null; }>;
    download: (path: string, options?: TransformOptions) => Promise<{ data: Blob | null; error: Error | null; }>;
    createSignedUrl: (path: string, expiresIn: number, options?: { download?: string | boolean; transform?: TransformOptions }) => Promise<{ data: { signedUrl: string; } | null; error: Error | null; }>;
    remove: (paths: string[]) => Promise<{ data: FileObject[] | null; error: Error | null; }>;
    list: (path?: string, options?: SearchOptions, parameters?: { headers?: HeadersInit, signal?: AbortSignal }) => Promise<{ data: FileObject[] | null; error: Error | null; }>;
    copy: (fromPath: string, toPath: string, options?: { destinationBucket?: string }) => Promise<{ data: { path: string; } | null; error: Error | null; }>;
    move: (fromPath: string, toPath: string) => Promise<{ data: { message: string; } | null; error: Error | null; }>;
    update: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string; } | null; error: Error | null; }>;
    createSignedUrls: (paths: string[], expiresIn: number, options?: { download?: boolean }) => Promise<{ data: ({ signedUrl: string; path: string; error: string | null; })[] | null; error: Error | null; }>;
    getPublicUrl: (path: string, options?: { download?: string | boolean; transform?: TransformOptions }) => { data: { publicUrl: string; }; };    
    
    // Properties from StorageFileApi
    url: string;
    headers: Record<string, string>;
    fetch: typeof globalThis.fetch; 

    // Other Methods from StorageFileApi
    // deno-lint-ignore no-explicit-any
    uploadToSignedUrl: (path: string, token: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string; } | null; error: Error | null; }>;
    // deno-lint-ignore no-explicit-any
    createSignedUploadUrl: (path: string) => Promise<{ data: { signedURL: string; path: string; } | null; error: Error | null; }>; 
    // deno-lint-ignore no-explicit-any
    uploadOrUpdate: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string; } | null; error: Error | null; }>; 
    // deno-lint-ignore no-explicit-any
    emptyBucket: () => Promise<{ data: { message: string; } | null; error: Error | null; }>;
    // deno-lint-ignore no-explicit-any
    disableBucketCORS: () => Promise<{ data: { message: string; } | null; error: Error | null; }>;
    // deno-lint-ignore no-explicit-any
    enableBucketCORS: () => Promise<{ data: { message: string; } | null; error: Error | null; }>;
    // deno-lint-ignore no-explicit-any
    info: () => Promise<{ data: any | null; error: Error | null; }>; 
    // deno-lint-ignore no-explicit-any
    exists: (path: string) => Promise<{ data: boolean | null; error: Error | null; }>; 
    // deno-lint-ignore no-explicit-any
    encodeMetadata: (metadata: Record<string, any>) => string;
    // deno-lint-ignore no-explicit-any
    toBase64: (data: string | ArrayBuffer) => string;
    _getFinalPath: (path: string) => string;
    _removeEmptyFolders: (path: string) => string;
    // deno-lint-ignore no-explicit-any
    transformOptsToQueryString: (options: any) => string;

    // Internal perform methods - these are what spies will target if needed for assertion outside the main methods
    // These could also be private to the implementation if spies are managed differently
    performUploadInternal: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string } | null; error: Error | null; }>;
    performDownloadInternal: (path: string, options?: TransformOptions) => Promise<{ data: Blob | null; error: Error | null; }>;
    performCreateSignedUrlInternal: (path: string, expiresIn: number, options?: { download?: string | boolean; transform?: TransformOptions }) => Promise<{ data: { signedUrl: string } | null; error: Error | null; }>;
    performRemoveInternal: (paths: string[]) => Promise<{ data: FileObject[] | null; error: Error | null; }>;
    performListInternal: (path?: string, options?: SearchOptions, parameters?: { headers?: HeadersInit, signal?: AbortSignal }) => Promise<{ data: FileObject[] | null; error: Error | null; }>;
    performCopyInternal: (fromPath: string, toPath: string, options?: { destinationBucket?: string }) => Promise<{ data: { path: string } | null; error: Error | null; }>;
    performMoveInternal: (fromPath: string, toPath: string) => Promise<{ data: { message: string } | null; error: Error | null; }>;
    performUpdateInternal: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string } | null; error: Error | null; }>;
    performCreateSignedUrlsInternal: (paths: string[], expiresIn: number, options?: { download?: boolean }) => Promise<{ data: ({ signedUrl: string; path: string; error: string | null; })[] | null; error: Error | null; }>;
    performGetPublicUrlInternal: (path: string, options?: { download?: string | boolean; transform?: TransformOptions }) => { data: { publicUrl: string; }; };
  }
  
  // Interface for the top-level storage API (e.g., client.storage)
  export interface IMockStorageAPI {
    from: (bucketId: string) => IMockStorageBucketAPI;
  }
  // --- END: Storage Mock Types ---
  
  export interface MockSupabaseDataConfig {
      getUserResult?: SupabaseUserResponse;
      genericMockResults?: {
          [tableName: string]: {
              select?: Partial<MockResolveQueryResult> | ((state: MockQueryBuilderState) => Promise<Partial<MockResolveQueryResult>>);
              insert?: Partial<MockResolveQueryResult> | ((state: MockQueryBuilderState) => Promise<Partial<MockResolveQueryResult>>);
              update?: Partial<MockResolveQueryResult> | ((state: MockQueryBuilderState) => Promise<Partial<MockResolveQueryResult>>);
              upsert?: Partial<MockResolveQueryResult> | ((state: MockQueryBuilderState) => Promise<Partial<MockResolveQueryResult>>);
              delete?: Partial<MockResolveQueryResult> | ((state: MockQueryBuilderState) => Promise<Partial<MockResolveQueryResult>>);
          };
      };
      rpcResults?: {
          [functionName: string]: { data?: object | object[] | null; error?: Error | null } | (() => Promise<{ data?: object | object[] | null; error?: Error | null }>);
      };
      storageConfig?: { // This is where bucket-specific mock functions are defined
        [bucketId: string]: {
            list?: (path?: string | undefined, options?: SearchOptions, parameters?: { headers?: HeadersInit, signal?: AbortSignal }) => Promise<{ data: FileObject[] | null; error: Error | null; }>; // Changed return to use FileObject[]
            remove?: (paths: string[]) => Promise<{ data: FileObject[] | null; error: Error | null; }>; // Changed return to use FileObject[]
            upload?: (path: string, body: FileBody, options?: FileOptions) => Promise<IMockStorageUploadResponse>; 
            download?: (path: string, options?: TransformOptions) => Promise<IMockStorageDownloadResponse>; 
            createSignedUrl?: (path: string, expiresIn: number, options?: { download?: string | boolean; transform?: TransformOptions }) => Promise<IMockStorageSignedUrlResponse>; 
            copy?: (fromPath: string, toPath: string, options?: { destinationBucket?: string }) => Promise<IMockStorageCopyResponse>; 
            move?: (fromPath: string, toPath: string) => Promise<{ data: { message: string } | null; error: Error | null }>;
            update?: (path: string, body: FileBody, options?: FileOptions) => Promise<{ data: { path: string } | null; error: Error | null }>; 
            createSignedUrls?: (paths: string[], expiresIn: number, options?: { download?: boolean }) => Promise<{ data: ({ signedUrl: string; path: string; error: string | null; })[] | null; error: Error | null; }>;
            getPublicUrl?: (path: string, options?: { download?: string | boolean; transform?: TransformOptions }) => { data: { publicUrl: string; }; };
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
    public methodSpies: { [key: string]: Spy } = {};
    private _state: MockQueryBuilderState;
    private _genericMockResultsConfig?: MockSupabaseDataConfig['genericMockResults'];
    public url: URL;
    public headers: Record<string, string>;
    public throwOnError?: boolean;
    public getSpy(methodName: keyof IMockQueryBuilder): Spy | undefined {
        return this.methodSpies[methodName as string];
    }
    // Add these method implementations to the class
    public setHeader(name: string, value: string): IMockQueryBuilder {
        this.headers[name] = value;
        // If you want setHeader calls to be spied like filter methods:
        this._executeMethodLogic('setHeader', [name, value]); 
        return this;
    }

    public overrideTypes(types: Record<string, string> | string): IMockQueryBuilder {
        console.log(`[MockQueryBuilder ${this._state.tableName}] overrideTypes called with:`, types);
        // If you want overrideTypes calls to be spied:
        this._executeMethodLogic('overrideTypes', [types]);
        return this;
    }
    public method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
    public shouldThrowOnError?: boolean;
    public fetch?: typeof globalThis.fetch;
    public isMaybeSingleQuery?: boolean;
    public isMaybeSingle?: () => Promise<MockResolveQueryResult>;


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
        this.url = new URL(`http://localhost/rest/v1/${tableName}`);
        this.headers = {};
        this._initializeSpies();
        this.fetch = globalThis.fetch; // Default fetch
        this.shouldThrowOnError = false; // Default
        this._setMethodFromOperation(initialOperation); // Helper to set method
        this.isMaybeSingleQuery = false; // Default
        
    }

    private _setMethodFromOperation(operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert') {
        switch (operation) {
            case 'select': this.method = 'GET'; break;
            case 'insert': this.method = 'POST'; break; // Typically POST
            case 'update': this.method = 'PATCH'; break; // Typically PATCH
            case 'delete': this.method = 'DELETE'; break;
            case 'upsert': this.method = 'POST'; break; // Typically POST with 'Prefer: resolution=merge-duplicates'
            default: this.method = 'GET';
        }
    }

    // Define methods from IMockQueryBuilder directly
    // These will be wrapped by spies in _initializeSpies
    select(columns?: string): IMockQueryBuilder { return this._executeMethodLogic('select', [columns]); }
    insert(data: unknown[] | object): IMockQueryBuilder { return this._executeMethodLogic('insert', [data]); }
    update(data: object): IMockQueryBuilder { return this._executeMethodLogic('update', [data]); }
    delete(): IMockQueryBuilder { return this._executeMethodLogic('delete', []); }
    upsert(data: unknown[] | object, options?: { onConflict?: string, ignoreDuplicates?: boolean }): IMockQueryBuilder { return this._executeMethodLogic('upsert', [data, options]); }
    eq(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('eq', [column, value]); }
    neq(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('neq', [column, value]); }
    gt(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('gt', [column, value]); }
    gte(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('gte', [column, value]); }
    lt(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('lt', [column, value]); }
    lte(column: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('lte', [column, value]); }
    like(column: string, pattern: string): IMockQueryBuilder { return this._executeMethodLogic('like', [column, pattern]); }
    ilike(column: string, pattern: string): IMockQueryBuilder { return this._executeMethodLogic('ilike', [column, pattern]); }
    is(column: string, value: string | boolean | null): IMockQueryBuilder { return this._executeMethodLogic('is', [column, value]); }
    in(column: string, values: readonly unknown[]): IMockQueryBuilder { return this._executeMethodLogic('in', [column, values]); }
    contains(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeMethodLogic('contains', [column, value]); }
    containedBy(column: string, value: string | string[] | object): IMockQueryBuilder { return this._executeMethodLogic('containedBy', [column, value]); }
    rangeGt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeGt', [column, rangeVal]); }
    rangeGte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeGte', [column, rangeVal]); }
    rangeLt(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeLt', [column, rangeVal]); }
    rangeLte(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeLte', [column, rangeVal]); }
    rangeAdjacent(column: string, rangeVal: string): IMockQueryBuilder { return this._executeMethodLogic('rangeAdjacent', [column, rangeVal]); }
    overlaps(column: string, value: string | string[]): IMockQueryBuilder { return this._executeMethodLogic('overlaps', [column, value]); }
    textSearch(column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' }): IMockQueryBuilder { return this._executeMethodLogic('textSearch', [column, query, options]); }
    match(query: object): IMockQueryBuilder { return this._executeMethodLogic('match', [query]); }
    or(filters: string, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('or', [filters, options]); }
    filter(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('filter', [column, operator, value]); }
    not(column: string, operator: string, value: unknown): IMockQueryBuilder { return this._executeMethodLogic('not', [column, operator, value]); }
    order(column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('order', [column, options]); }
    limit(count: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('limit', [count, options]); }
    range(from: number, to: number, options?: { referencedTable?: string }): IMockQueryBuilder { return this._executeMethodLogic('range', [from, to, options]); }
    returns(): IMockQueryBuilder { return this._executeMethodLogic('returns', []); }
    likeAllOf(column: string, patterns: string[]): IMockQueryBuilder { return this._executeMethodLogic('likeAllOf', [column, patterns]); }
    likeAnyOf(column: string, patterns: string[]): IMockQueryBuilder { return this._executeMethodLogic('likeAnyOf', [column, patterns]); }
    ilikeAllOf(column: string, patterns: string[]): IMockQueryBuilder { return this._executeMethodLogic('ilikeAllOf', [column, patterns]); }
    ilikeAnyOf(column: string, patterns: string[]): IMockQueryBuilder { return this._executeMethodLogic('ilikeAnyOf', [column, patterns]); }
    csv(): Promise<string> {
        this._executeMethodLogic('csv', []);
        return Promise.resolve(""); // Return a dummy CSV string
    }
    abortSignal(signal: AbortSignal): IMockQueryBuilder {
        this._executeMethodLogic('abortSignal', [signal]);
        return this;
    }
    geojson(): Promise<any> {
        this._executeMethodLogic('geojson', []);
        return Promise.resolve({});
    }
    explain(options?: any): Promise<any> {
        this._executeMethodLogic('explain', [options]);
        return Promise.resolve({});
    }
    rollback(): IMockQueryBuilder {
        this._executeMethodLogic('rollback', []);
        return this;
    }

    single(): IMockQueryBuilder { // <<< MODIFIED SIGNATURE
        this._executeMethodLogic('single', []);
        // You'll need to ensure _resolveQuery or then() can know this was called.
        // One way is to set a flag, e.g., on this._state or a new member:
        // this._state.isSingleQuery = true; // Or similar mechanism
        // this._state.isMaybeSingleQuery = false;
        (this as any)._isSingleCall = true; // Add a temporary flag or manage state properly
        (this as any)._isMaybeSingleCall = false;
        return this; // <<< MODIFIED RETURN
    }
    maybeSingle(): IMockQueryBuilder { // <<< MODIFIED SIGNATURE
        this._executeMethodLogic('maybeSingle', []);
        // Set a flag similar to single()
        // this._state.isMaybeSingleQuery = true;
        // this._state.isSingleQuery = false;
        (this as any)._isSingleCall = false;
        (this as any)._isMaybeSingleCall = true; // Add a temporary flag or manage state properly
        return this; // <<< MODIFIED RETURN
    }
    then(
        onfulfilled?: ((value: MockResolveQueryResult) => unknown | PromiseLike<unknown>) | null | undefined,
        onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
    ): Promise<unknown> { 
        console.log(`[Mock QB ${this._state.tableName}] Direct .then() called.`);
        // Determine if single() or maybeSingle() was called before then()
        const isSingle = (this as any)._isSingleCall === true;
        const isMaybeSingle = (this as any)._isMaybeSingleCall === true;
        
        // Reset flags for subsequent calls if necessary
        (this as any)._isSingleCall = false;
        (this as any)._isMaybeSingleCall = false;

        const promise = this._resolveQuery(isSingle, isMaybeSingle); // Pass flags to _resolveQuery
        
        return promise.then(onfulfilled, onrejected);
    }

    private _initializeSpies() {
        const methodsToSpy: (keyof MockQueryBuilder)[] = [
            'select', 'insert', 'update', 'delete', 'upsert',
            'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
            'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte',
            'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'or', 'filter', 'not',
            'order', 'limit', 'range', 'single', 'maybeSingle', 'then', 'returns',
            'likeAllOf', 'likeAnyOf', 'ilikeAllOf', 'ilikeAnyOf', 'csv',
            'abortSignal', 'geojson', 'explain', 'rollback'
        ];

        for (const methodName of methodsToSpy) {
            if (typeof this[methodName] === 'function') {
                this.methodSpies[methodName] = spy(this, methodName);
            } else {
                console.warn(`[MockQueryBuilder] Method ${methodName} is not a function on the instance, cannot spy.`);
            }
        }
    }

    private _executeMethodLogic(methodName: string, args: unknown[]): IMockQueryBuilder {
        console.log(`[Mock QB ${this._state.tableName}] .${methodName}(${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(', ')}) called`);
        switch(methodName) {
            case 'select': {
                const [columns] = args;
                if (typeof columns === 'string' || typeof columns === 'undefined') {
                    if (!['insert', 'update', 'upsert'].includes(this._state.operation)) {
                        this._state.operation = 'select'; 
                    }
                    this._state.selectColumns = columns || '*';
                }
                return this;
            }
            case 'insert': {
                const [data] = args;
                if (data && typeof data === 'object') {
                    this._state.operation = 'insert'; this._state.insertData = data;
                }
                return this;
            }
            case 'update':{
                const [data] = args;
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    this._state.operation = 'update'; this._state.updateData = data;
                }
                return this;
            }
            case 'delete': 
                this._state.operation = 'delete'; 
                return this;
            case 'upsert': {
                const [data, options] = args;
                if (data && typeof data === 'object') {
                    this._state.operation = 'upsert'; 
                    this._state.upsertData = data; 
                    if (options && typeof options === 'object' && options !== null) {
                        this._state.upsertOptions = { 
                            onConflict: 'onConflict' in options ? String(options.onConflict) : undefined,
                            ignoreDuplicates: 'ignoreDuplicates' in options ? Boolean(options.ignoreDuplicates) : undefined,
                         };
                    }
                }
                return this;
            }
            case 'eq': case 'neq': case 'gt': case 'gte': case 'lt': case 'lte': case 'like': case 'ilike': {
                const [column, value] = args;
                if (typeof column === 'string') {
                    this._state.filters.push({ column, value, type: methodName });
                }
                return this;
            }
            case 'is': {
                const [column, value] = args;
                // MODIFIED condition to accept string, boolean, or null for value
                if (typeof column === 'string' && (typeof value === 'string' || typeof value === 'boolean' || value === null)) { 
                    this._state.filters.push({ column, value, type: 'is' });
                }
                return this;
            }
            case 'in': case 'contains': case 'containedBy': case 'overlaps': {
                const [column, value] = args;
                if (typeof column === 'string') {
                    this._state.filters.push({ column, value, type: methodName });
                }
                return this;
            }
            case 'match': {
                const [query] = args;
                if (query && typeof query === 'object' && !Array.isArray(query)) {
                    this._state.matchQuery = query;
                }
                return this;
            }
            case 'or': {
                const [filters, options] = args;
                if (typeof filters === 'string') {
                    let referencedTable: string | undefined;
                    if (options && typeof options === 'object' && options !== null && 'referencedTable' in options && typeof options.referencedTable === 'string') {
                        referencedTable = options.referencedTable;
                    }
                    this._state.filters.push({ filters, type: 'or', referencedTable });
                }
                return this;
            }
            case 'filter': case 'not': {
                const [column, operator, value] = args;
                if (typeof column === 'string' && typeof operator === 'string') {
                    this._state.filters.push({ column, operator, value, type: methodName });
                }
                return this;
            }
            case 'order': {
                const [column, options] = args;
                if (typeof column === 'string') {
                    let orderOptions: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string } | undefined;
                    if (options && typeof options === 'object' && options !== null) {
                        orderOptions = {};
                        if ('ascending' in options && typeof options.ascending === 'boolean') {
                            orderOptions.ascending = options.ascending;
                        }
                        if ('nullsFirst' in options && typeof options.nullsFirst === 'boolean') {
                            orderOptions.nullsFirst = options.nullsFirst;
                        }
                        if ('referencedTable' in options && typeof options.referencedTable === 'string') {
                            orderOptions.referencedTable = options.referencedTable;
                        }
                    }
                    this._state.orderBy = { column, options: orderOptions };
                }
                return this;
            }
            case 'limit': {
                const [count] = args;
                if (typeof count === 'number') {
                    this._state.limitCount = count;
                }
                return this;
            }
            case 'range': {
                const [from, to] = args;
                if (typeof from === 'number' && typeof to === 'number') {
                    this._state.rangeFrom = from; this._state.rangeTo = to;
                }
                return this;
            }
            case 'single': 
            case 'maybeSingle': 
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

        if (typeof operationConfig === 'function') {
            console.log(`[Mock QB ${this._state.tableName}] Using function config for ${this._state.operation}`);
            try {
                // The mock function is responsible for returning the complete MockResolveQueryResult structure
                const partialResult = await operationConfig(this._state);
                result = { ...result, ...partialResult };
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
            result = { ...result, ...operationConfig };
        } else {
            // Default behavior if no specific mock is found for the operation
            console.warn(`[Mock QB ${this._state.tableName}] No specific mock found for operation ${this._state.operation}. Returning default empty success.`);
            // Default result is already initialized
        }
        
        // Simulate PostgREST behavior for .single() and .maybeSingle()
        // This shaping happens *after* the mock result is obtained.
        if (isSingle) {
            if (result.data && Array.isArray(result.data) && result.data.length === 1) {
                result.data = result.data[0]; // Correctly assign the single object
            } else if (result.data && Array.isArray(result.data) && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new PostgrestError({ message: 'Query returned more than one row', code: 'PGRST116' });
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new PostgrestError({ message: 'Query returned no rows', code: 'PGRST116' });
                    result.status = 406;
                }
                result.data = null; // Data becomes/stays null if error or 0 rows
            }
        } else if (isMaybeSingle) {
            if (result.data && Array.isArray(result.data) && result.data.length === 1) {
                result.data = result.data[0]; // Correctly assign the single object
            } else if (result.data && Array.isArray(result.data) && result.data.length > 1) {
                if (!result.error) { // Only set if no error is already provided by the mock config
                    result.error = new PostgrestError({ message: 'Query returned more than one row', code: 'PGRST116' });
                    result.status = 406;
                }
                result.data = null; // Data becomes null if error or multiple rows
            } else { // 0 rows or data was null initially
                // For maybeSingle, if 0 rows, data is null, error remains as is (or null if not set)
                result.data = null; 
            }
        }

        if (result.error && !(result.error instanceof Error)) {
            const errObj = result.error;
            const newError = new PostgrestError({
                message: errObj.message,
                code: errObj.code,
                details: errObj.details,
                hint: errObj.hint,
            });
            result.error = newError;
            if (result.status >= 200 && result.status < 300) {
                result.status = newError.code === 'PGRST116' ? 406 : 500;
            }
        } else if (result.error instanceof PostgrestError) {
             if (result.status >= 200 && result.status < 300) {
                result.status = result.error.code === 'PGRST116' ? 406 : 500;
            }
        }
        
        console.log(`[Mock QB ${this._state.tableName}] Final resolved query result (before returning from _resolveQuery):`, JSON.stringify(result));
        return result; // Always return the result object; do not throw from here.
    }
}

// --- MockSupabaseAuth Implementation ---
class MockSupabaseAuth {
    private _config: MockSupabaseDataConfig;
    private _currentTestUserId?: string;

    constructor(config: MockSupabaseDataConfig, currentTestUserId?: string) {
        this._config = config;
        this._currentTestUserId = currentTestUserId;
    }

    // Method returns Promise<SupabaseUserResponse>
    async getUser(): Promise<SupabaseUserResponse> { // Changed return type
        console.log("[Mock Supabase Auth] getUser called.");
        if (this._config.simulateAuthError) {
            let errorToReturn: SupabaseAuthError;
            if (this._config.simulateAuthError instanceof SupabaseAuthError) {
                errorToReturn = this._config.simulateAuthError;
            } else { // Assuming it's a generic Error
                const message = this._config.simulateAuthError.message || 'Simulated auth error for getUser';
                // SupabaseAuthError constructor takes message and optional status or other error
                if ('status' in this._config.simulateAuthError && typeof (this._config.simulateAuthError as any).status === 'number') {
                    errorToReturn = new SupabaseAuthError(message, (this._config.simulateAuthError as any).status);
                } else {
                    errorToReturn = new SupabaseAuthError(message);
                }
            }
            return { data: { user: null }, error: errorToReturn }; // This matches a part of SupabaseUserResponse union
        }

        if (Object.prototype.hasOwnProperty.call(this._config, 'mockUser')) {
            if (this._config.mockUser === null) {
                // Variant: No user, No error - THIS IS THE PROBLEMATIC STATE for SupabaseUserResponse
                // According to SupabaseUserResponse, if error is null, user must be User.
                // If user is null, there must be an AuthError.
                // So, if we want to simulate "no user", we should also simulate an auth error.
                return { 
                    data: { user: null }, 
                    error: new SupabaseAuthError("Mock: User not found or no active session.", 401) // Simulate a common auth error for no user
                }; 
            }
            // If mockUser is an object, a user exists.
            if (typeof this._config.mockUser === 'object' && this._config.mockUser !== null) {
                const userId = this._currentTestUserId || this._config.mockUser.id || 'default-mock-user-id';
                const baseUser = getMockUser(userId); 
                const finalUser: User = { ...baseUser, ...this._config.mockUser };
                // This matches {data: {user: User}, error: null}
                return { data: { user: finalUser }, error: null }; 
            }
        }

        // Fallback: Default user, No error
        const userIdToReturn = this._currentTestUserId || "mock-user-id";
        const userToReturn = getMockUser(userIdToReturn);
        // This matches {data: {user: User}, error: null}
        return { data: { user: userToReturn }, error: null }; 
    }

    // Method returns Promise<{ data: { session: Session | null }; error: SupabaseAuthError | null; }>
    async getMockedSessionResult(): Promise<{ data: { session: Session; }; error: null; } | { data: { session: null; }; error: AuthError; } | { data: { session: null; }; error: null; }> {
        console.log("[Mock Supabase Auth] getMockedSessionResult called for getSession stub.");
        if (this._config.simulateAuthError) {
            const errorMessage = typeof this._config.simulateAuthError === 'string' 
                ? this._config.simulateAuthError 
                : (this._config.simulateAuthError as Error).message || 'Simulated auth error for getSession';
            
            let errorToReturn: SupabaseAuthError;
            if (this._config.simulateAuthError instanceof SupabaseAuthError) {
                errorToReturn = this._config.simulateAuthError;
            } else {
                 const errorStatus = (this._config.simulateAuthError as SupabaseAuthError)?.status;
                 if (typeof errorStatus === 'number') {
                    errorToReturn = new SupabaseAuthError(errorMessage, errorStatus);
                 } else {
                    errorToReturn = new SupabaseAuthError(errorMessage);
                 }
            }
            // This matches { data: { session: null; }; error: AuthError; }
            return { data: { session: null }, error: errorToReturn };
        }

        let userForSession: User | null = null; // Declare userForSession here
        if (Object.prototype.hasOwnProperty.call(this._config, 'mockUser')) {
            if (this._config.mockUser === null) {
                // No user means no session
                userForSession = null;
            }
            if (typeof this._config.mockUser === 'object' && this._config.mockUser !== null) {
                const userId = this._currentTestUserId || this._config.mockUser.id || 'default-mock-user-id';
                const baseUser = getMockUser(userId);
                userForSession = { ...baseUser, ...this._config.mockUser };
            }
        } else { 
            const userIdToReturn = this._currentTestUserId || "mock-user-id";
            userForSession = getMockUser(userIdToReturn);
        }

        if (!userForSession) {
             // This matches { data: { session: null; }; error: null; }
             return { data: { session: null }, error: null };
        }

        const mockSession: Session = { 
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXN1YiIsImVtYWlsIjoiZXhhbXBsZUB0ZXN0LmNvbSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
            refresh_token: 'mock-refresh', 
            user: userForSession, 
            token_type: 'bearer', 
            expires_in: 3600, 
            expires_at: Math.floor((Date.now() / 1000) + 3600),
            provider_token: null,
            provider_refresh_token: null,
        };
        // This matches { data: { session: Session; }; error: null; }
        return { data: { session: mockSession }, error: null };
    }
}

// --- START: MockStorageBucketAPI Implementation ---
/** Defines the mock implementation for Supabase Storage Bucket API operations. */
export class MockStorageBucketAPIImpl implements IMockStorageBucketAPI {
    public bucketId: string;
    private config: MockSupabaseDataConfig;
    private realSupabaseClientForFallback: SupabaseClient<Database> | null = null;

    // Spies for test assertions - these are the actual Spy properties
    public readonly copy: Spy<this['performCopyInternal']>;
    public readonly download: Spy<this['performDownloadInternal']>;
    public readonly getPublicUrl: Spy<this['performGetPublicUrlInternal']>;
    public readonly list: Spy<this['performListInternal']>;
    public readonly move: Spy<this['performMoveInternal']>;
    public readonly remove: Spy<this['performRemoveInternal']>;
    public readonly createSignedUrl: Spy<this['performCreateSignedUrlInternal']>;
    public readonly createSignedUrls: Spy<this['performCreateSignedUrlsInternal']>;
    public readonly upload: Spy<this['performUploadInternal']>;
    public readonly update: Spy<this['performUpdateInternal']>;
    public readonly _getFinalPath: (path: string) => string = (path: string) => path;
    public readonly _removeEmptyFolders: (path: string) => string = (path: string) => path;
    public readonly transformOptsToQueryString: (options: any) => string = (options: any) => "";

    // Properties from StorageFileApi that are not spies (or are more complex)
    public readonly url: string; // Already public readonly in your version, good.
    public readonly headers: Record<string, string>; // Ensure public readonly
    public readonly fetch: typeof globalThis.fetch; // Ensure public readonly

    // And also for the methods you added:
    constructor(bucketId: string, config: MockSupabaseDataConfig, realSupabaseClientForFallback?: SupabaseClient<Database>) {
        this.bucketId = bucketId;
        this.config = config;
        this.realSupabaseClientForFallback = realSupabaseClientForFallback || null;
        // Use a generic mock URL structure, as supabaseUrl is protected
        this.url = `http://localhost:54321/storage/v1/object/public/${bucketId}`; 
        this.headers = {}; 
        this.fetch = globalThis.fetch; 

        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Initialized. Fallback client: ${!!this.realSupabaseClientForFallback}`);

        // Initialize spies by binding the internal "perform" methods
        this.copy = spy(this.performCopyInternal.bind(this));
        this.download = spy(this.performDownloadInternal.bind(this));
        this.getPublicUrl = spy(this.performGetPublicUrlInternal.bind(this));
        this.list = spy(this.performListInternal.bind(this));
        this.move = spy(this.performMoveInternal.bind(this));
        this.remove = spy(this.performRemoveInternal.bind(this));
        this.createSignedUrl = spy(this.performCreateSignedUrlInternal.bind(this));
        this.createSignedUrls = spy(this.performCreateSignedUrlsInternal.bind(this));
        this.upload = spy(this.performUploadInternal.bind(this));
        this.update = spy(this.performUpdateInternal.bind(this));
    }

    // --- COPY ---
    public async performCopyInternal(fromPath: string, toPath: string, options?: { destinationBucket?: string }): Promise<{ data: { path: string } | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performCopyInternal FROM: ${fromPath} TO: ${toPath}`);
        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.copy;
        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured copy function from storageConfig.${this.bucketId}.copy.`);
            return specificBucketConfig(fromPath, toPath, options);
        }

        const genericMockResult = this.config.storageMock?.copyResult;
        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.copyResult (called with bucketId).`);
                // The genericMockResult function is (bucketId: string, fromPath: string, toPath: string) => Promise<IMockStorageCopyResponse>
                return (genericMockResult as (bucketId: string, fromPath: string, toPath: string, options?: { destinationBucket?: string }) => Promise<IMockStorageCopyResponse>)(this.bucketId, fromPath, toPath, options);
            } else { // It's an IMockStorageCopyResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.copyResult.`);
                return Promise.resolve(genericMockResult);
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for copy (checked storageConfig and storageMock). Returning default success.`);
        return { data: { path: toPath }, error: null };
    }


    // --- DOWNLOAD ---
    public async performDownloadInternal(path: string, options?: TransformOptions): Promise<{ data: Blob | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performDownloadInternal PATH: ${path}`);
        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.download;
        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured download function from storageConfig.${this.bucketId}.download.`);
            return specificBucketConfig(path, options);
        }

        const genericMockResult = this.config.storageMock?.downloadResult;
        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.downloadResult (called with bucketId).`);
                // The genericMockResult function is (bucketId: string, path: string, options?: TransformOptions) => Promise<IMockStorageDownloadResponse>
                return (genericMockResult as (bucketId: string, path: string, options?: TransformOptions) => Promise<IMockStorageDownloadResponse>)(this.bucketId, path, options);
            } else { // It's an IMockStorageDownloadResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.downloadResult.`);
                return Promise.resolve(genericMockResult);
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for download (checked storageConfig and storageMock). Returning default empty blob success.`);
        return { data: new Blob(["mock content for " + path]), error: null };
    }

    // --- GET PUBLIC URL ---
    public performGetPublicUrlInternal(path: string, options?: { download?: string | boolean; transform?: TransformOptions }): { data: { publicUrl: string; }; } {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performGetPublicUrlInternal PATH: ${path}`);
        const funcConfig = this.config.storageConfig?.[this.bucketId]?.getPublicUrl;
        if (funcConfig) {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured getPublicUrl function from storageConfig.${this.bucketId}.getPublicUrl.`);
            return funcConfig(path, options);
        }
        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for getPublicUrl (checked storageConfig). Returning default success.`);
        return { data: { publicUrl: `http://mock.storage.com/${this.bucketId}/${path}` } };
    }


    // --- LIST ---
    public async performListInternal(path?: string, options?: SearchOptions, parameters?: { headers?: HeadersInit, signal?: AbortSignal }): Promise<{ data: FileObject[] | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performListInternal PATH: ${path}`);
        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.list;
        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured list function from storageConfig.${this.bucketId}.list.`);
            return specificBucketConfig(path, options, parameters);
        }

        const genericMockResult = this.config.storageMock?.listResult;
        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.listResult (called with bucketId).`);
                // The genericMockResult function is (bucketId: string, path?: string, options?: object) => Promise<IMockStorageListResponse>
                // Cast to any to handle potential type difference between IMockStorageListResponse.data and FileObject[]
                return (genericMockResult as (bucketId: string, path?: string, options?: SearchOptions, parameters?: { headers?: HeadersInit, signal?: AbortSignal }) => Promise<any>)(this.bucketId, path, options, parameters) as Promise<{ data: FileObject[] | null; error: Error | null; }>;
            } else { // It's an IMockStorageListResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.listResult.`);
                // Cast to any to handle potential type difference
                return Promise.resolve(genericMockResult as any as { data: FileObject[] | null; error: Error | null; });
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for list (checked storageConfig and storageMock). Returning default empty success.`);
        return { data: [], error: null };
    }

    // --- MOVE ---
    public async performMoveInternal(fromPath: string, toPath: string): Promise<{ data: { message: string } | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performMoveInternal FROM: ${fromPath} TO: ${toPath}`);
        const funcConfig = this.config.storageConfig?.[this.bucketId]?.move;
        if (funcConfig) {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured move function from storageConfig.${this.bucketId}.move.`);
            return funcConfig(fromPath, toPath);
        }
        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for move (checked storageConfig). Returning default success.`);
        return { data: { message: "Successfully moved" }, error: null };
    }

    // --- REMOVE ---
    public async performRemoveInternal(paths: string[]): Promise<{ data: FileObject[] | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performRemoveInternal PATHS: ${paths.join(', ')}`);
        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.remove;
        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured remove function from storageConfig.${this.bucketId}.remove.`);
            return specificBucketConfig(paths);
        }

        const genericMockResult = this.config.storageMock?.removeResult;
        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.removeResult (called with bucketId).`);
                // The genericMockResult function is (bucketId: string, paths: string[]) => Promise<IMockStorageRemoveResponse>
                // Cast to any to handle the type difference between IMockStorageRemoveResponse.data and FileObject[]
                return (genericMockResult as (bucketId: string, paths: string[]) => Promise<any>)(this.bucketId, paths) as Promise<{ data: FileObject[] | null; error: Error | null; }>;
            } else { // It's an IMockStorageRemoveResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.removeResult.`);
                // Cast to any to handle the type difference
                return Promise.resolve(genericMockResult as any as { data: FileObject[] | null; error: Error | null; });
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for remove (checked storageConfig and storageMock). Returning default empty success.`);
        return { data: [], error: null };
    }

    // --- CREATE SIGNED URL ---
    public async performCreateSignedUrlInternal(path: string, expiresIn: number, options?: { download?: string | boolean; transform?: TransformOptions }): Promise<{ data: { signedUrl: string } | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performCreateSignedUrlInternal PATH: ${path}`);
        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.createSignedUrl;
        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured createSignedUrl function from storageConfig.${this.bucketId}.createSignedUrl.`);
            return specificBucketConfig(path, expiresIn, options);
        }

        const genericMockResult = this.config.storageMock?.createSignedUrlResult;
        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.createSignedUrlResult (called with bucketId).`);
                // The genericMockResult function is (bucketId: string, path: string, expiresIn: number) => Promise<IMockStorageSignedUrlResponse>
                return (genericMockResult as (bucketId: string, path: string, expiresIn: number, options?: { download?: string | boolean; transform?: TransformOptions }) => Promise<IMockStorageSignedUrlResponse>)(this.bucketId, path, expiresIn, options);
            } else { // It's an IMockStorageSignedUrlResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.createSignedUrlResult.`);
                return Promise.resolve(genericMockResult);
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for createSignedUrl (checked storageConfig and storageMock). Returning default success.`);
        return { data: { signedUrl: `http://mock.storage.com/${this.bucketId}/${path}?signed=true` }, error: null };
    }

    // --- CREATE SIGNED URLS ---
    public async performCreateSignedUrlsInternal(paths: string[], expiresIn: number, options?: { download?: boolean }): Promise<{ data: ({ signedUrl: string; path: string; error: string | null; })[] | null; error: Error | null; }> {
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performCreateSignedUrlsInternal PATHS: ${paths.join(', ')}`);
        const funcConfig = this.config.storageConfig?.[this.bucketId]?.createSignedUrls;
        if (funcConfig) {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured createSignedUrls function from storageConfig.${this.bucketId}.createSignedUrls.`);
            return funcConfig(paths, expiresIn, options);
        }
        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for createSignedUrls (checked storageConfig). Returning default success.`);
        const signedUrlsData = paths.map(p => ({ signedUrl: `http://mock.storage.com/${this.bucketId}/${p}?signed=true`, path: p, error: null }));
        return { data: signedUrlsData, error: null };
    }

    // --- UPLOAD ---
    public async performUploadInternal(path: string, body: FileBody, options?: FileOptions): Promise<{ data: { path: string } | null; error: Error | null; }> { 
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performUploadInternal PATH: ${path}`);
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Full this.config:`, JSON.stringify(this.config, null, 2));
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] this.config.storageConfig for bucket:`, JSON.stringify(this.config.storageConfig?.[this.bucketId], null, 2));
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] this.config.storageMock:`, JSON.stringify(this.config.storageMock, null, 2));

        const specificBucketConfig = this.config.storageConfig?.[this.bucketId]?.upload;
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] specificBucketConfig (upload fn): ${typeof specificBucketConfig}`);

        if (typeof specificBucketConfig === 'function') {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured upload function from storageConfig.${this.bucketId}.upload.`);
            return specificBucketConfig(path, body, options);
        }

        const genericMockResult = this.config.storageMock?.uploadResult;
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] genericMockResult (uploadResult):`, JSON.stringify(genericMockResult));

        if (genericMockResult) {
            if (typeof genericMockResult === 'function') {
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using function from storageMock.uploadResult (called with bucketId).`);
                return (genericMockResult as (bucketId: string, path: string, body: FileBody, options?: any) => Promise<IMockStorageUploadResponse>)(this.bucketId, path, body, options);
            } else { // It's an IMockStorageUploadResponse object
                console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using object from storageMock.uploadResult.`);
                return Promise.resolve(genericMockResult);
            }
        }

        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for upload (checked storageConfig and storageMock). Returning default success.`);
        return { data: { path: path }, error: null };
    }

    // --- UPDATE ---
    public async performUpdateInternal(path: string, body: FileBody, options?: FileOptions): Promise<{ data: { path: string } | null; error: Error | null; }> { 
        console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] performUpdateInternal PATH: ${path}`);
        const funcConfig = this.config.storageConfig?.[this.bucketId]?.update;
        if (funcConfig) {
            console.log(`[Mock StorageBucketAPI Impl - ${this.bucketId}] Using configured update function from storageConfig.${this.bucketId}.update.`);
            return funcConfig(path, body, options);
        }
        console.warn(`[Mock StorageBucketAPI Impl - ${this.bucketId}] No mock config for update (checked storageConfig). Returning default success.`);
        return { data: { path: path }, error: null };
    }

    // Method to get a spy for a specific method, might be useful if not all spies are predefined
    getSpy<K extends keyof this>(methodName: K): Spy | undefined { 
        const prop = this[methodName];
        if (prop && typeof prop === 'function' && 'calls' in prop) {
            return prop as unknown as Spy;
        }
        return undefined;
    }

    // --- Implementations for other StorageFileApi methods ---
    // These are not spied by default but are part of the interface for compatibility
    // deno-lint-ignore no-explicit-any
    async uploadToSignedUrl(path: string, token: string, body: FileBody, options?: FileOptions): Promise<{ data: { path: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.uploadToSignedUrl not spied, calling perform logic if any or default", path, token, options); 
        // Potentially, these could also have perform...Internal methods if complex mocking or spying is needed
        return { data: { path }, error: new Error("Not implemented (mock)") }; 
    }
    // deno-lint-ignore no-explicit-any
    async createSignedUploadUrl(path: string): Promise<{ data: { signedURL: string; path: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.createSignedUploadUrl not spied", path); 
        return { data: { signedURL: `http://mockupload.com/${this.bucketId}/${path}`, path }, error: null }; 
    }
    // deno-lint-ignore no-explicit-any
    async uploadOrUpdate(path: string, body: FileBody, options?: FileOptions): Promise<{ data: { path: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.uploadOrUpdate not spied", path, options); 
        return this.performUploadInternal(path, body, {...options, upsert: true }); // Example delegation
    }
    // deno-lint-ignore no-explicit-any
    async emptyBucket(): Promise<{ data: { message: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.emptyBucket not spied"); 
        return { data: { message: "Bucket emptied (mock)" }, error: null }; 
    }
    // deno-lint-ignore no-explicit-any
    async disableBucketCORS(): Promise<{ data: { message: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.disableBucketCORS not spied"); 
        return { data: { message: "CORS disabled (mock)" }, error: null }; 
    }
    // deno-lint-ignore no-explicit-any
    async enableBucketCORS(): Promise<{ data: { message: string; } | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.enableBucketCORS not spied"); 
        return { data: { message: "CORS enabled (mock)" }, error: null }; 
    }
    // deno-lint-ignore no-explicit-any
    async info(): Promise<{ data: any | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.info not spied"); 
        return { data: { id: this.bucketId, name: this.bucketId, public: false }, error: null }; 
    }
    // deno-lint-ignore no-explicit-any
    async exists(path: string): Promise<{ data: boolean | null; error: Error | null; }> { 
        console.warn("MockStorageBucketAPIImpl.exists not spied", path); 
        return { data: false, error: null }; // Default mock behavior
    }
    // deno-lint-ignore no-explicit-any
    encodeMetadata(metadata: Record<string, any>): string { 
        console.warn("MockStorageBucketAPIImpl.encodeMetadata not spied", metadata); 
        return btoa(JSON.stringify(metadata)); 
    }
    // deno-lint-ignore no-explicit-any
    toBase64(data: string | ArrayBuffer): string { 
        console.warn("MockStorageBucketAPIImpl.toBase64 not spied"); 
        if (typeof data === 'string') return btoa(data);
        // Basic ArrayBuffer to base64, proper handling is more complex
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // --- Internal "perform" methods for core mock logic, targeted by spies ---
    // ... existing code ...
}


// --- Refactored createMockSupabaseClient (Phase 3) ---
/** Creates a mocked Supabase client instance for unit testing (Revised & Extended) */
export function createMockSupabaseClient(
    currentTestUserId?: string,
    config: MockSupabaseDataConfig = {}
): MockSupabaseClientSetup {
    console.log(`[Mock Supabase] Creating mock client. TestUserId: ${currentTestUserId || 'N/A (will use default or config)'}`);

    const client = createClient<Database>('http://localhost:54321', 'test-key', {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const latestBuilders: Map<string, MockQueryBuilder> = new Map();
    const historicBuildersByTable: Map<string, MockQueryBuilder[]> = new Map();
    const mockStorageBucketAPIs: Map<string, MockStorageBucketAPIImpl> = new Map();

    const fromSpy = stub(client, 'from', ((tableName: string): MockQueryBuilder => {
        console.log(`[Mock Supabase Client] from('${tableName}') called`);
        const builder = new MockQueryBuilder(tableName, 'select', config.genericMockResults);
        latestBuilders.set(tableName, builder);

        if (!historicBuildersByTable.has(tableName)) {
            historicBuildersByTable.set(tableName, []);
        }
        historicBuildersByTable.get(tableName)!.push(builder);
        
        return builder;
    }) as any); // <<< ADDED 'as any' HERE

    const rpcSpy = stub(client, 'rpc', async (name: string, params?: object) => {
        console.log(`[Mock Supabase Client] rpc('${name}', ${JSON.stringify(params)}) called`);
        const rpcConfig = config.rpcResults?.[name];
        if (typeof rpcConfig === 'function') {
            const result = await rpcConfig();
            return { data: result.data ?? null, error: result.error ?? null, count: null, status: result.error ? 500 : 200, statusText: result.error ? 'Error' : 'OK' };
        } else if (rpcConfig) {
            return { data: rpcConfig.data ?? null, error: rpcConfig.error ?? null, count: null, status: rpcConfig.error ? 500 : 200, statusText: rpcConfig.error ? 'Error' : 'OK' };
        }
        return { data: null, error: new Error(`RPC function ${name} not mocked.`), count: null, status: 404, statusText: 'Not Found' };
    });

    const mockAuthHelper: MockSupabaseAuth = new MockSupabaseAuth(config, currentTestUserId);
    
    // Stub for client.auth.getUser() - directly uses GoTrueUserResponse type from helper
    const getUserSpy = stub(client.auth, 'getUser', () => mockAuthHelper.getUser()); 

    // Stub for client.auth.getSession() - directly uses the specific session response type from helper
    const getSessionSpy = stub(client.auth, 'getSession', () => mockAuthHelper.getMockedSessionResult());

    // --- Storage Mocking Strategy ---
    // Log the client.storage object itself before trying to stub its 'from' method
    console.log("[DEBUG] client.storage before stubbing .from:", client.storage);
    
    const storageFromSpy = stub(client.storage, 'from', ((bucketId: string): IMockStorageBucketAPI => { 
        console.log(`[Mock Supabase Client] storage.from('${bucketId}') called - returning full mock bucket API.`);

        if (!mockStorageBucketAPIs.has(bucketId)) {
            mockStorageBucketAPIs.set(bucketId, new MockStorageBucketAPIImpl(bucketId, config));
        }
        const mockBucketApiToReturn = mockStorageBucketAPIs.get(bucketId)!;
        return mockBucketApiToReturn; 
    }) as any); // <<< ADDED 'as any' HERE
    
    // ---->>>> NEW DIAGNOSTIC CALL <<<<----
    try {
        console.log("[DEBUG] Attempting client.storage.from('test-bucket-immediately-after-stub')");
        client.storage.from('test-bucket-immediately-after-stub');
    } catch (e) {
        console.error("[DEBUG] Error calling client.storage.from immediately after stubbing:", e);
    }
    // ---->>>> END NEW DIAGNOSTIC CALL <<<<----

    const clientSpies: IMockClientSpies = {
        auth: {
            getUserSpy: getUserSpy,
            getSessionSpy: getSessionSpy, // Populate getSessionSpy
        },
        rpcSpy: rpcSpy,
        fromSpy: fromSpy, // This is client.from()
        storageFromSpy: storageFromSpy, // Populate storageFromSpy (client.storage.from())
        storage: {
            from: (bucketId: string) => {
                let bucketAPI = mockStorageBucketAPIs.get(bucketId);
                if (!bucketAPI) {
                    console.warn(`[Mock Supabase Spies] Storage bucket API not found for ${bucketId} during spy access. Proactively creating one.`);
                    // Create and store the mock bucket API instance if it doesn't exist
                    // It uses the main 'config' passed to createMockSupabaseClient
                    bucketAPI = new MockStorageBucketAPIImpl(bucketId, config);
                    mockStorageBucketAPIs.set(bucketId, bucketAPI);
                }
                // bucketAPI is now guaranteed to be defined here
                return {
                    uploadSpy: bucketAPI.upload,
                    downloadSpy: bucketAPI.download,
                    createSignedUrlSpy: bucketAPI.createSignedUrl,
                    removeSpy: bucketAPI.remove,
                    listSpy: bucketAPI.list,
                    copySpy: bucketAPI.copy,
                };
            }
        },
        getLatestQueryBuilderSpies: (tableName: string) => {
            const builder = latestBuilders.get(tableName);
            return builder?.methodSpies || undefined;
        },
        getAllQueryBuilderSpies: (tableName: string) => {
            const historicBuilders = historicBuildersByTable.get(tableName);
            if (!historicBuilders || historicBuilders.length === 0) {
                return undefined;
            }
            return historicBuilders.map(builder =>
                builder.methodSpies
            );
        },
        getHistoricQueryBuilderSpies: (tableName: string, methodName: string): { callCount: number; callsArgs: unknown[][] } | undefined => {
            const historicBuilders = historicBuildersByTable.get(tableName);
            if (!historicBuilders || historicBuilders.length === 0) {
                return { callCount: 0, callsArgs: [] };
            }

            let totalCallCount = 0;
            const allCallsArgs: unknown[][] = [];

            historicBuilders.forEach((builder) => {
                const methodSpy = builder.methodSpies[methodName];

                if (methodSpy && methodSpy.calls) { 

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
            if (allCallsArgs.length > 0) {
              console.log("[Mock Supabase Spies] Call args for spy:", allCallsArgs);
            }
            return { callCount: totalCallCount, callsArgs: allCallsArgs };
        }
    };

    const clearAllTrackedBuilders = () => {
        latestBuilders.clear();
        historicBuildersByTable.clear();
        console.log('[MockSupabaseClient] Cleared all tracked query builders.');
    };

    const clearAllTrackedStorageAPIs = () => {
        mockStorageBucketAPIs.clear();
        console.log('[MockSupabaseClient] Cleared all tracked storage bucket APIs.');
    };

    const getSpiesForTableQueryMethod = (tableName: string, methodName: keyof IMockQueryBuilder, callIndex = -1): Spy | undefined => {
        const historicBuilders = historicBuildersByTable.get(tableName) || [];
        if (!historicBuilders || historicBuilders.length === 0) {
            console.warn(`[MockSupabaseClient getSpiesForTableQueryMethod] No historic builders found for table: ${tableName}`);
            return undefined;
        }

        let targetBuilder: IMockQueryBuilder | undefined;

        if (callIndex === -1) {
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
    };

    const clearAllStubs = () => {
        if (fromSpy && fromSpy.restore) fromSpy.restore();
        if (rpcSpy && rpcSpy.restore) rpcSpy.restore();
        if (getUserSpy && getUserSpy.restore) getUserSpy.restore();
        if (getSessionSpy && getSessionSpy.restore) getSessionSpy.restore();
        if (storageFromSpy && storageFromSpy.restore) storageFromSpy.restore();

        // It is crucial to also restore any stubs created on the realBucketApi instances
        // As these are created dynamically, we need to iterate over them.
        for (const bucketApi of mockStorageBucketAPIs.values()) {
            // Assuming we stubbed 'copy' and 'remove'. Add any other stubbed methods here.
            const copySpy = bucketApi.copy;
            if (copySpy && copySpy.restore) {
                copySpy.restore();
            }
            const removeSpy = bucketApi.remove;
            if (removeSpy && removeSpy.restore) {
                removeSpy.restore();
            }
        }

        clearAllTrackedBuilders();
        clearAllTrackedStorageAPIs();
    };

    // --- Return the client, all spies, and cleanup function ---
    return {
        client: client,
        clientSpies: clientSpies,
        mockStorageBucketAPIs: mockStorageBucketAPIs, // Expose the map
        cleanup: () => {
            console.log("[MockSupabaseClient] Cleanup called. Restoring all stubs.");
            // Restore all general client spies
            getUserSpy.restore();
            getSessionSpy.restore();
            rpcSpy.restore();
            fromSpy.restore(); // for client.from()
            storageFromSpy.restore(); // for client.storage.from()
            
            // Clear internal tracking
            latestBuilders.clear();
            historicBuildersByTable.clear();
            // mockStorageBucketAPIs.clear(); // We might not want to clear this here if tests need to inspect it after cleanup
            console.log("[MockSupabaseClient] All general stubs restored and tracking cleared.");
        },
        get historicBuildersByTable(): ReadonlyMap<string, MockQueryBuilder[]> {
            return historicBuildersByTable;
        },
        getLatestBuilder: (tableName: string) => latestBuilders.get(tableName),
        getHistoricBuildersForTable: (tableName: string) => historicBuildersByTable.get(tableName) || [],
        clearAllTrackedBuilders: () => {
            latestBuilders.clear();
            historicBuildersByTable.clear();
            console.log("[MockSupabaseClient] Cleared all tracked query builders.");
        },
        clearAllTrackedStorageAPIs: () => {
            mockStorageBucketAPIs.clear(); // Provide a specific method to clear this if needed
            console.log("[MockSupabaseClient] Cleared all tracked storage bucket APIs.");
        },
        getStorageBucketApiInstance: (bucketId: string): MockStorageBucketAPIImpl => {
            return mockStorageBucketAPIs.get(bucketId)!;
        },
        getSpiesForTableQueryMethod: (tableName: string, methodName: string): Spy | undefined => {
            return latestBuilders.get(tableName)?.getSpy(methodName as keyof IMockQueryBuilder);
        },
        getAllBuildersUsed: (): MockQueryBuilder[] => {
            return Array.from(latestBuilders.values());
        },
        getTablesWithHistoricBuilders: (): string[] => {
            return Array.from(historicBuildersByTable.keys());
        },
        getAllStorageBucketApiInstances: (): MockStorageBucketAPIImpl[] => {
            return Array.from(mockStorageBucketAPIs.values());
        },
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
        unsubscribe: spy(() => Promise.resolve('ok')),
        topic: topic,
    };
    return mockChannel;
}

// --- Helper for Fetch Mocking (if not using Deno.fetch mock directly) ---
// These are less relevant now with Deno.fetch stubbing being more common.
// Retaining for context if some tests use this pattern.

interface MockResponseConfig {
    response: Response;
    jsonData?: unknown;
}

let fetchResponses: Array<Response | Promise<Response> | MockResponseConfig> = [];
let originalFetch: typeof fetch | undefined = undefined;

function isPromise(p: unknown): p is Promise<unknown> {
    return p instanceof Promise;
}

export function mockFetch(
    config: Response | Promise<Response> | MockResponseConfig | Array<Response | Promise<Response> | MockResponseConfig>
) {
    if (!originalFetch) {
        originalFetch = globalThis.fetch;
    }
    fetchResponses = Array.isArray(config) ? config : [config];
    
    globalThis.fetch = spy((input: RequestInfo | URL, _options?: RequestInit): Promise<Response> => {
        console.log(`[Mock Fetch] Called: ${input.toString()}`, _options);
        if (fetchResponses.length === 0) {
            throw new Error("Mock fetch called but no mock responses remaining.");
        }
        
        const nextResponseConfig = fetchResponses.shift()!;
        
        if (nextResponseConfig instanceof Response || isPromise(nextResponseConfig)) {
            return Promise.resolve(nextResponseConfig);
        }

        const mockConfig = nextResponseConfig;
        if (mockConfig.jsonData) {
            // Create a response with JSON data
            return Promise.resolve(new Response(JSON.stringify(mockConfig.jsonData), {
                status: mockConfig.response.status || 200,
                headers: mockConfig.response.headers || new Headers({ 'Content-Type': 'application/json' }),
            }));
        }
        return Promise.resolve(mockConfig.response);
    });
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
export function stubFetchForTestScope(): { spy: Spy, stub: Stub } {
    const fetchSpy = spy((_url: RequestInfo | URL, _options?: RequestInit): Promise<Response> => {
        console.warn("[Fetch Stub] fetch called but no specific mock response provided for this call. Returning default empty 200 OK.");
        return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    const fetchStubInstance = stub(globalThis, "fetch", fetchSpy);
    return { spy: fetchSpy, stub: fetchStubInstance };
}

// Helper to create a Supabase client with Service Role for admin tasks
// This was removed in user's previous changes but is needed for createUser/cleanupUser
function getServiceRoleAdminClient(): SupabaseClient<Database> {
    const { url, serviceRoleKey } = getSupabaseEnvVars();
    return createClient<Database>(url, serviceRoleKey, {
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
    const supabaseAdmin = adminClient || getServiceRoleAdminClient();
    console.log(`Attempting to clean up user: ${email}`);

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

    // Cast auth to any for deleteUser
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
        console.error(`Error deleting user ${email} (ID: ${userId}):`, deleteError);
    } else {
        console.log(`User ${email} (ID: ${userId}) deleted successfully.`);
    }
}

// Helper to create spies for storage bucket methods for test assertions
export function getStorageSpies(mockSupabaseClient: IMockSupabaseClient, bucketId: string) {
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

// Helper to get a default mock user (can be customized)
// Moved this definition before MockSupabaseAuth
export function getMockUser(userId = 'default-user-id', overrides: Partial<User> = {}): User {
    const baseUser: User = { // Ensure all required User fields are present
        id: userId,
        app_metadata: { provider: 'email', providers: ['email'] }, // Add providers for completeness
        user_metadata: { name: "Test User" },
        aud: 'authenticated',
        confirmation_sent_at: new Date().toISOString(),
        recovery_sent_at: undefined, // Use undefined for optional fields if not set
        email_change_sent_at: undefined,
        new_email: undefined,
        new_phone: undefined,
        invited_at: undefined,
        action_link: undefined,
        email: `${userId}@example.com`,
        phone: undefined,
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString(),
        phone_confirmed_at: undefined,
        last_sign_in_at: new Date().toISOString(),
        role: undefined, // role can be undefined
        updated_at: new Date().toISOString(),
        identities: [],
        factors: undefined, // factors can be undefined
        is_anonymous: false, // Add is_anonymous
    };
    return {
        ...baseUser,
        ...overrides,
    };
}