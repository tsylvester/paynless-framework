import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/cors-headers.ts';
import { createSupabaseAdminClient } from '../_shared/auth.ts';
import { deleteFromStorage } from '../_shared/supabase_storage_utils.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js';

interface CleanupPayload {
  bucket: string;
  paths: string[];
}

// Define an interface for the dependencies
export interface StorageCleanupHandlerDependencies {
  handleCorsPreflightRequest: (req: Request) => Response | null;
  createErrorResponse: (message: string, status: number, request: Request, error?: Error | unknown) => Response;
  createSuccessResponse: (data: unknown, status: number, request: Request) => Response;
  createSupabaseAdminClient: () => SupabaseClient;
  deleteFromStorage: (client: SupabaseClient, bucket: string, paths: string[]) => Promise<{ error: Error | null }>;
}

export async function requestHandler(
  req: Request,
  deps: StorageCleanupHandlerDependencies
): Promise<Response> {
  const preflightResponse = deps.handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    const payload = await req.json() as CleanupPayload;
    if (!payload.bucket || !Array.isArray(payload.paths) || payload.paths.length === 0) {
      return deps.createErrorResponse('Missing bucket or paths in payload, or paths array is empty.', 400, req);
    }

    const supabaseAdminClient = deps.createSupabaseAdminClient();
    const { error: deleteError } = await deps.deleteFromStorage(supabaseAdminClient, payload.bucket, payload.paths);

    if (deleteError) {
      console.error('Error deleting files from storage:', deleteError);
      return deps.createErrorResponse(`Failed to delete files: ${deleteError.message}`, 500, req, deleteError);
    }

    return deps.createSuccessResponse(
      { success: true, message: `${payload.paths.length} file(s) scheduled for deletion from bucket ${payload.bucket}.` }, 
      200, 
      req
    );
  } catch (error) {
    console.error('Error in storage-cleanup-service:', error);
    return deps.createErrorResponse(
      error instanceof Error ? error.message : 'An unknown error occurred.',
      500,
      req,
      error
    );
  }
}

// Actual dependencies to be used when serving the function
const liveDependencies: StorageCleanupHandlerDependencies = {
  handleCorsPreflightRequest: handleCorsPreflightRequest,
  createErrorResponse: createErrorResponse,
  createSuccessResponse: createSuccessResponse,
  createSupabaseAdminClient: createSupabaseAdminClient,
  deleteFromStorage: deleteFromStorage,
};

serve((req) => requestHandler(req, liveDependencies)); 