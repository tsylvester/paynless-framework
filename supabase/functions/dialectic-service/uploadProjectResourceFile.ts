// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Logger } from "../_shared/logger.ts";
import { DialecticProjectResource } from "./dialectic.interface.ts";

// Define a type for the expected structure of the response
export interface UploadProjectResourceFileResult {
  data?: DialecticProjectResource;
  error?: {
    message: string;
    details?: string;
    status: number;
  };
}

export async function uploadProjectResourceFileHandler(
  payload: FormData,
  dbClient: SupabaseClient,
  user: User,
  logger: Logger,
): Promise<UploadProjectResourceFileResult> {
  logger.info("uploadProjectResourceFileHandler function invoked");

  try {
    const projectId = payload.get("projectId") as string | null;
    const resourceFile = payload.get("resourceFile") as File | null;
    const resourceDescription = payload.get("resourceDescription") as string | null;

    logger.info(
      "Received payload for file upload",
      {
        projectId,
        fileName: resourceFile?.name,
        fileSize: resourceFile?.size,
        fileType: resourceFile?.type,
        resourceDescription,
      }
    );

    if (!projectId) {
      return { error: { message: "projectId is required.", status: 400 } };
    }
    if (!resourceFile) {
      return { error: { message: "resourceFile is required.", status: 400 } };
    }

    // Verify user has permission to upload to this project
    try {
      const { data: projectData, error: projectError } = await dbClient
        .from('dialectic_projects')
        .select('id, user_id') // Select minimal data, user_id for ownership check
        .eq('id', projectId)
        .single(); // Use single to expect one row or an error

      if (projectError) {
        logger.error(
          "Error verifying project ownership or project not found", 
          { projectId, userId: user.id, error: projectError.message }
        );
        // PGRST116 is the code for "zero rows returned by ডান single-row INSERT, UPDATE, or DELETE statement"
        // or " exactamente zero rows returned by a SELECT statement that expected one"
        const status = projectError.code === 'PGRST116' ? 404 : 500;
        const message = projectError.code === 'PGRST116' ? 
          'Project not found or user does not have permission to upload to this project.' :
          'Failed to verify project ownership.';
        return { error: { message, details: projectError.message, status } };
      }

      if (!projectData) { // Should be caught by projectError with PGRST116, but as a safeguard
        logger.warn("Project not found after ownership check (no error, but no data)", { projectId, userId: user.id });
        return { error: { message: 'Project not found.', status: 404 } };
      }

      if (projectData.user_id !== user.id) {
        logger.warn("User permission denied for project resource upload", { projectId, projectOwner: projectData.user_id, requestingUser: user.id });
        return { error: { message: 'Permission denied: You do not own this project.', status: 403 } };
      }

      logger.info("User permission verified for project", { projectId, userId: user.id });

    } catch (e) { // Catch any unexpected errors during permission check phase
      logger.error("Unexpected error during project permission verification", { projectId, userId: user.id, error: e });
      const details = e instanceof Error ? e.message : String(e);
      return { error: { message: "An unexpected error occurred while verifying project permissions.", details, status: 500 } };
    }

    const projectResourceRecordId = crypto.randomUUID();
    const storagePath = `projects/${projectId}/resources/${projectResourceRecordId}/${resourceFile.name}`;
    const storageBucket = "dialectic-contributions"; // Assuming this is your target bucket

    logger.info(`Attempting to upload file to storage: ${storageBucket}/${storagePath}`);

    const { data: uploadData, error: uploadError } = await dbClient.storage
      .from(storageBucket)
      .upload(storagePath, resourceFile, {
        contentType: resourceFile.type || "application/octet-stream", // Default content type
        upsert: false, // Do not overwrite if file already exists (should be unique due to UUID path)
      });

    if (uploadError) {
      logger.error("Error uploading file to Supabase storage", {
        error: uploadError,
        storagePath,
        bucket: storageBucket,
      });
      return {
        error: {
          message: "Failed to upload resource file to storage.",
          details: uploadError.message,
          status: 500,
        },
      };
    }

    if (!uploadData) {
      logger.warn("No data returned from storage upload, though no explicit error.", { storagePath });
      return {
        error: {
          message: "Failed to upload resource file, no upload data returned from storage.",
          status: 500,
        },
      };
    }

    logger.info("File uploaded successfully to storage", { path: uploadData.path });

    const resourceToInsert = {
      id: projectResourceRecordId,
      project_id: projectId,
      user_id: user.id,
      file_name: resourceFile.name,
      storage_bucket: storageBucket,
      storage_path: uploadData.path, // Use the path returned by storage
      mime_type: resourceFile.type || "application/octet-stream",
      size_bytes: resourceFile.size,
      resource_description: resourceDescription || `Resource file: ${resourceFile.name}`, // Default description
      status: "active", // Assuming 'active' is a valid status
    };

    logger.info("Attempting to insert resource record into database", { data: resourceToInsert });

    const { data: dbResourceData, error: dbInsertError } = await dbClient
      .from("dialectic_project_resources")
      .insert(resourceToInsert)
      .select()
      .single();

    if (dbInsertError) {
      logger.error("Error inserting resource record into database", {
        error: dbInsertError,
        resourceData: resourceToInsert,
      });
      // Attempt to clean up the uploaded file if DB insert fails
      logger.info("Attempting to remove uploaded file from storage due to DB error", { path: uploadData.path });
      const { error: removeError } = await dbClient.storage.from(storageBucket).remove([uploadData.path]);
      if (removeError) {
        logger.error("Failed to remove orphaned file from storage", { path: uploadData.path, error: removeError });
      }
      return {
        error: {
          message: "Failed to record resource file metadata in database.",
          details: dbInsertError.message,
          status: 500,
        },
      };
    }

    if (!dbResourceData) {
      logger.warn("No data returned from database insert for resource, though no explicit error.");
      return {
        error: {
          message: "Failed to record resource file metadata, no data returned from database.",
          status: 500,
        },
      };
    }
    
    const typedResourceData = dbResourceData as DialecticProjectResource;

    logger.info("Resource file uploaded and recorded successfully", { resourceId: typedResourceData.id });
    return { data: typedResourceData };

  } catch (e) {
    logger.error("Unexpected error in uploadProjectResourceFileHandler", { error: e });
    const details = e instanceof Error ? e.message : String(e);
    return {
      error: {
        message: "An unexpected error occurred while uploading the resource file.",
        details,
        status: 500,
      },
    };
  }
}
