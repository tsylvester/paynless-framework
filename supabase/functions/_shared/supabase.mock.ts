// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// External imports
import {
    createClient,
    type SupabaseClient,
  } from "npm:@supabase/supabase-js@^2.43.4";
  import type { User as SupabaseUser } from "npm:@supabase/gotrue-js@^2.6.3";
  import { spy, stub, type Spy } from "jsr:@std/testing/mock";
  
  // Internal types
  import type {
    IMockQueryBuilder,
    IMockSupabaseAuth,
    IMockSupabaseClient,
    IMockClientSpies,
    MockSupabaseClientSetup,
    User,
  } from "./types.ts";
  
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
  

// Define type for the internal state of the mock query builder
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

/** Configurable data/handlers for the mock Supabase client */
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
    mockUser?: User | null; 
    simulateAuthError?: Error | null;
}

// Type for the resolved query result, to be used internally and by IMockQueryBuilder terminators
// Allowing error to be a more structured object for mock errors like PGRST116
export type MockPGRSTError = { name: string; message: string; code: string; details?: string; hint?: string };
export type MockResolveQueryResult = { 
    data: object | unknown[] | null; // Broadened to cover single object, array of unknowns, or null
    error: Error | MockPGRSTError | null; 
    count: number | null; 
    status: number; 
    statusText: string; 
};

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
        this._initializeSpies(); // Changed from _wrapMethodsWithSpies for clarity
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
        onfulfilled?: ((value: { data: unknown[] | null; error: Error | null; count: number | null; status: number; statusText: string; }) => unknown | PromiseLike<unknown>) | null | undefined,
        onrejected?: ((reason: unknown) => unknown | PromiseLike<unknown>) | null | undefined
    ): Promise<unknown> { 
        // The _resolveQuery method called by _executeMethodLogic already shapes the data for the .then() case
        // to be unknown[] | null. So, the actual value passed to onfulfilled will conform.
        // The type of this.methodSpies.then might need adjustment if it's too specific.
        return this._executeMethodLogic('then', [onfulfilled, onrejected]) as Promise<unknown>;
    }

    private _initializeSpies() {
        const interfaceMethods: Array<keyof IMockQueryBuilder> = [
            'select', 'insert', 'update', 'delete', 'upsert',
            'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
            'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte',
            'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'or', 'filter', 'not',
            'order', 'limit', 'range',
            'single', 'maybeSingle', 'then', 'returns'
        ];
        interfaceMethods.forEach(methodName => {
            if (typeof this[methodName] === 'function') {
                this.methodSpies[methodName] = spy(this, methodName as keyof MockQueryBuilder) as unknown as Spy<(...args: unknown[]) => unknown>;
            } else {
                console.warn(`[Mock QB Initializer] Method ${methodName} not found on MockQueryBuilder instance for spying.`);
            }
        });
    }

    private _executeMethodLogic(methodName: keyof IMockQueryBuilder, args: unknown[]): IMockQueryBuilder | Promise<MockResolveQueryResult> {
        console.log(`[Mock QB ${this._state.tableName}] .${methodName}(${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(', ')}) called`);
        switch(methodName as string) {
            case 'select': 
                this._state.operation = 'select'; 
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
            case 'then': return this._resolveQuery(false, false);
            case 'returns': return this;
            default: {
                console.warn(`[Mock QB ${this._state.tableName}] Method .${methodName} not explicitly in switch. Returning 'this'.`);
                return this;
            }
        }
    }

    private async _resolveQuery(isSingle = false, isMaybeSingle = false): Promise<MockResolveQueryResult> {
        console.log(`[Mock QB ${this._state.tableName}] Resolving query. Operation: ${this._state.operation}, State:`, JSON.stringify(this._state));
        const tableConfig = this._genericMockResultsConfig?.[this._state.tableName];
        const operationConfig = tableConfig?.[this._state.operation];
        let result: MockResolveQueryResult;

        if (typeof operationConfig === 'function') {
            console.log(`[Mock QB ${this._state.tableName}] Using function config for ${this._state.operation}`);
            try {
                 const funcResult = await operationConfig(this._state);
                 result = {
                    data: funcResult.data,
                    error: funcResult.error ?? null,
                    count: funcResult.count ?? null,
                    status: funcResult.status ?? (funcResult.error ? 500 : 200),
                    statusText: funcResult.statusText ?? (funcResult.error ? 'Error from Mock Function' : 'OK')
                 };
            } catch (e) {
                console.error(`[Mock QB ${this._state.tableName}] Error executing function config for ${this._state.operation}:`, e);
                result = { data: null, error: e instanceof Error ? e : new Error(String(e)), count: 0, status: 500, statusText: 'Function Mock Error' };
            }
        } else if (operationConfig && typeof operationConfig === 'object' && 'data' in operationConfig) {
            console.log(`[Mock QB ${this._state.tableName}] Using object config for ${this._state.operation}`);
            result = {
                data: operationConfig.data !== undefined ? operationConfig.data : null,
                error: operationConfig.error !== undefined ? operationConfig.error : null,
                count: operationConfig.count !== undefined ? operationConfig.count : null,
                status: operationConfig.status !== undefined ? operationConfig.status : (operationConfig.error ? 500 : 200),
                statusText: operationConfig.statusText !== undefined ? operationConfig.statusText : (operationConfig.error ? 'Error From Mock Object' : 'OK')
            };
        } else {
            console.warn(`[Mock QB ${this._state.tableName}] No mock config found for operation ${this._state.operation} on table ${this._state.tableName}. Returning empty success.`);
            result = { data: this._state.operation === 'select' ? [] : null, error: null, count: 0, status: 200, statusText: 'OK (No Mock Config)' };
        }

        // Single/MaybeSingle logic affects how data is structured from the raw result
        if (this._state.operation === 'select' || this._state.operation === 'insert' || this._state.operation === 'update' || this._state.operation === 'upsert') {
            if (isSingle || isMaybeSingle) {
                if (result.error) {
                    result.data = null;
                } else if (result.data && Array.isArray(result.data)) {
                    if (result.data.length > 1 && isSingle) {
                        result.error = { name: 'PGRST116', message: 'Query returned more than one row', code: 'PGRST116' }; 
                        result.data = null; result.status = 406; result.statusText = 'Not Acceptable';
                    } else if (result.data.length >= 1) {
                        result.data = result.data[0]; // Data becomes single object
                    } else {
                        result.data = null; // Data becomes null
                        if (isSingle) {
                            // ... (existing PGRST116 for no rows if error not explicitly null)
                            const opConfig = this._genericMockResultsConfig?.[this._state.tableName]?.[this._state.operation];
                            let errorExplicitlyNull = false;
                            if(opConfig && typeof opConfig === 'object' && 'error' in opConfig && opConfig.error === null && ('data' in opConfig && opConfig.data === null)) {
                                errorExplicitlyNull = true;
                            }
                            if (!errorExplicitlyNull) {
                                result.error = { name: 'PGRST116', message: 'Query returned no rows', code: 'PGRST116' }; 
                                result.status = 406; result.statusText = 'Not Acceptable';
                            }
                        }
                    }
                } else if (result.data === null && isSingle) { 
                    // ... (existing PGRST116 for no rows if data was null and error not explicitly null)
                     const opConfig = this._genericMockResultsConfig?.[this._state.tableName]?.[this._state.operation];
                     let errorExplicitlyNull = false;
                     if(opConfig && typeof opConfig === 'object' && 'error' in opConfig && opConfig.error === null) {
                         errorExplicitlyNull = true;
                     }
                     if (!errorExplicitlyNull) {
                        result.error = { name: 'PGRST116', message: 'Query returned no rows (data was null)', code: 'PGRST116' };
                        result.status = 406; result.statusText = 'Not Acceptable';
                     }
                } // If result.data is a single object and (isSingle or isMaybeSingle), it's fine as is.
            } else { // This is for the general .then() case (not single/maybeSingle)
                // IMockQueryBuilder.then expects data: any[] | null
                if (result.data !== null && !Array.isArray(result.data)) {
                    // If data is a single object, wrap it in an array for .then()
                    result.data = [result.data];
                } else if (result.data === undefined) {
                    // If data is undefined, ensure it's null for the interface
                    result.data = null;
                }
                // If result.data is already an array or null, it's fine.
            }
        }

        console.log(`[Mock QB ${this._state.tableName}] Final resolved query result (after single/maybe/then shaping):`, JSON.stringify(result));
        if (result.error) {
            const errorToThrow = typeof result.error === 'string' ? { name: 'PGRST116', message: result.error } : result.error;
            throw {...errorToThrow, data: result.data, count: result.count, status: result.status, statusText: result.statusText };
        }
        return result;
    }
}

// --- MockSupabaseAuth Implementation ---
class MockSupabaseAuth implements IMockSupabaseAuth {
    public readonly getUserSpy: Spy<IMockSupabaseAuth['getUser']>;
    private _config: MockSupabaseDataConfig;

    constructor(config: MockSupabaseDataConfig) {
        this._config = config;
        this.getUserSpy = spy(async () => {
            console.log("[Mock Auth] getUser called");
            if (this._config.simulateAuthError) {
                return { data: { user: null }, error: this._config.simulateAuthError };
            }
            const userFromMockUser = this._config.mockUser === undefined ? undefined : (this._config.mockUser as User | null);
            const user = this._config.getUserResult?.data?.user ?? userFromMockUser ?? null;
            const error = this._config.getUserResult?.error ?? null;
            return { data: { user }, error };
        });
    }
    // Method to satisfy interface and call the spy
    getUser: () => Promise<{ data: { user: User | null }; error: Error | null }> = async () => {
         return this.getUserSpy();
    }
}

class MockSupabaseClient implements IMockSupabaseClient {
    public readonly auth: MockSupabaseAuth;
    public readonly rpcSpy: Spy<IMockSupabaseClient['rpc']>;
    public readonly fromSpy: Spy<IMockSupabaseClient['from']>;
    private _config: MockSupabaseDataConfig;
    private _latestBuilders: Map<string, MockQueryBuilder> = new Map();

    constructor(config: MockSupabaseDataConfig) {
        this._config = config;
        this.auth = new MockSupabaseAuth(config);
        this.rpcSpy = spy(async (name: string, params?: object, _options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }): Promise<MockResolveQueryResult> => {
            console.log(`[Mock RPC] called: ${name} with params:`, params);
            const rpcConfig = this._config.rpcResults?.[name];
            if (typeof rpcConfig === 'function') {
                const funcResult = await rpcConfig();
                 return { data: funcResult.data ?? null, error: funcResult.error ?? null, count: funcResult.data ? 1:0, status: funcResult.error ? 500:200, statusText: funcResult.error? 'Error' : 'OK' };
            } else if (rpcConfig && typeof rpcConfig === 'object') {
                return { data: rpcConfig.data ?? null, error: rpcConfig.error ?? null, count: rpcConfig.data ? 1:0, status: rpcConfig.error ? 500:200, statusText: rpcConfig.error? 'Error' : 'OK' };
            }
            return { data: null, error: new Error(`RPC function ${name} not mocked (code: RPC_MOCK_ERROR)`), count: 0, status: 404, statusText: 'Not Found' };
        });
        
        this.fromSpy = spy((tableName: string): IMockQueryBuilder => {
            console.log(`[Mock Client] from(${tableName}) called`);
            const newBuilder = new MockQueryBuilder(tableName, 'select', this._config.genericMockResults);
            this._latestBuilders.set(tableName, newBuilder);
            return newBuilder;
        });
    }

    // Methods to satisfy interface and call spies
    from: (tableName: string) => IMockQueryBuilder = (tableName: string): IMockQueryBuilder => { 
        return this.fromSpy(tableName); 
    }
    rpc: (name: string, params?: object, options?: { head?: boolean, count?: 'exact' | 'planned' | 'estimated' }) => Promise<{ data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; }> = async (name, params, options) => {
        // this.rpcSpy returns Promise<MockResolveQueryResult>
        // MockResolveQueryResult is now { data: unknown; error: Error | MockPGRSTError | null; ... }
        // This needs to be compatible with the required return type { data: unknown | null; error: Error | null; ... }
        const result = await this.rpcSpy(name, params, options);
        return result as { data: unknown | null; error: Error | null; count: number | null; status: number; statusText: string; };
    }

    public getLatestBuilder(tableName: string): MockQueryBuilder | undefined { 
        return this._latestBuilders.get(tableName);
    }
}

// --- Refactored createMockSupabaseClient (Phase 3) ---
/** Creates a mocked Supabase client instance for unit testing (Revised & Extended) */
export function createMockSupabaseClient(
    config: MockSupabaseDataConfig = {}
): MockSupabaseClientSetup {
    const mockClientInstance = new MockSupabaseClient(config);

    const spies: IMockClientSpies = {
        auth: {
            getUserSpy: mockClientInstance.auth.getUserSpy,
        },
        rpcSpy: mockClientInstance.rpcSpy,
        fromSpy: mockClientInstance.fromSpy,
        getLatestQueryBuilderSpies: (tableName: string) => {
            const builder = mockClientInstance.getLatestBuilder(tableName); // Already MockQueryBuilder | undefined
            return builder?.methodSpies as ReturnType<IMockClientSpies['getLatestQueryBuilderSpies']> | undefined; 
        }
    };

    return {
        client: mockClientInstance, // mockClientInstance is already IMockSupabaseClient
        spies
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
        console.log(`[Test Env Stub] Deno.env.get called with: ${key}`); // Added log for visibility
        if (key in envVars) {
            return envVars[key];
        }
        // Fallback to original Deno.env.get for unstubbed vars, ensuring it's actually called
        const originalDenoEnvGet = Deno.env.get; 
        return originalDenoEnvGet.call(Deno.env, key);
    });

    try {
        // Store original values for keys we are about to stub
        for (const key in envVars) {
            originalValues[key] = Deno.env.get(key);
        }
        return testFn();
    } finally {
        envGetStubInstance.restore();
    }
}

// Utility to stub global fetch for a test scope and return its spy
export function stubFetchForTestScope(): { spy: Spy<unknown, [string | URL, (RequestInit | undefined)?], Promise<Response>>, stub: Disposable } {
    const fetchSpy = spy(async (_url: string | URL, _options?: RequestInit): Promise<Response> => {
        // Default mock fetch behavior for the stub, can be configured per test
        console.warn("[Fetch Stub] fetch called but no specific mock response provided for this call. Returning default empty 200 OK.");
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const fetchStubInstance = stub(globalThis, "fetch", fetchSpy as (...args: unknown[]) => Promise<Response>); // Cast to satisfy stub
    return { spy: fetchSpy, stub: fetchStubInstance };
}

// Helper to create a Supabase client with Service Role for admin tasks
// This was removed in user's previous changes but is needed for createUser/cleanupUser
function getServiceRoleAdminClient(): SupabaseClient {
    const { url, serviceRoleKey } = getSupabaseEnvVars(); // Relies on existing getSupabaseEnvVars
    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

// Create a test user
export async function createUser(email: string, password: string): Promise<{ user: SupabaseUser | undefined; error: Error | null }> {
    const supabaseAdmin = getServiceRoleAdminClient();
    console.log(`Creating user: ${email}`);
    const { data, error } = await (supabaseAdmin.auth as unknown as { admin: { createUser: (args: { email: string; password: string; email_confirm?: boolean; [key: string]: unknown; }) => Promise<{ data: { user: SupabaseUser | null; }; error: Error | null; }> } }).admin.createUser({
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
    const { data: listData, error: listError } = await (supabaseAdmin.auth as unknown as { admin: { listUsers: (params?: { page?: number; perPage?: number; }) => Promise<{ data: { users: SupabaseUser[]; aud?: string; }; error: Error | null; }> } }).admin.listUsers();

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