// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";
import { 
    DialecticProject 
  } from "./dialectic.interface.ts";
  import { createSupabaseClient } from "../_shared/auth.ts"; // Renamed import
  import { isValidDomainTag } from "../_shared/domain-utils.ts"; // Renamed import
  
  console.log("createProject function started");
  
  // Define a type for the function signature of createSupabaseClient
  type CreateSupabaseClientFn = (req: Request) => SupabaseClient;
  type IsValidDomainTagFn = (dbClient: SupabaseClient, domainTag: string) => Promise<boolean>;

  // Define an options interface for clarity
  export interface CreateProjectOptions {
    createSupabaseClient?: CreateSupabaseClientFn;
    isValidDomainTag?: IsValidDomainTagFn; // Allow injecting isValidDomainTag
  }

export async function createProject(
  req: Request,
  dbAdminClient: SupabaseClient,
  options?: CreateProjectOptions // Optional DI for Supabase client and isValidDomainTag
) {
  console.log("createProject function invoked");

  try {
    const formData = await req.formData();
    const projectName = formData.get('projectName') as string | null;
    const initialUserPromptText = formData.get('initialUserPromptText') as string | null;
    const selectedDomainTag = formData.get('selectedDomainTag') as string | null;
    const selected_domain_overlay_id = formData.get('selectedDomainOverlayId') as string | null;
    const promptFile = formData.get('promptFile') as File | null;

    console.log({ projectName, initialUserPromptText, selectedDomainTag, selected_domain_overlay_id, promptFileExists: !!promptFile });

    if (!projectName) {
      return { error: { message: "projectName is required", status: 400 } };
    }
    if (!initialUserPromptText && !promptFile) {
      return { error: { message: "Either initialUserPromptText or a promptFile must be provided.", status: 400 } };
    }

    const resolvedCreateSupabaseClient = options?.createSupabaseClient || createSupabaseClient;
    const supabaseUserClient = resolvedCreateSupabaseClient(req);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      console.warn("User not authenticated for createProject", userError);
      return { error: { message: "User not authenticated", status: 401 } };
    }
  
    // Use injected isValidDomainTag if provided, otherwise use the original
    const resolvedIsValidDomainTag = options?.isValidDomainTag || isValidDomainTag;
    if (selectedDomainTag) {
      try {
        const tagIsValid = await resolvedIsValidDomainTag(dbAdminClient, selectedDomainTag);
        if (!tagIsValid) {
          return { error: { message: `Invalid selectedDomainTag: "${selectedDomainTag}"`, status: 400 } };
        }
      } catch (e) {
        console.error("Error during domain tag validation:", e);
        const details = e instanceof Error ? e.message : String(e);
        return { error: { message: "Failed to create project", details, status: 500 } };
      }
    }
  
    const { data: newProjectData, error: createError } = await dbAdminClient
      .from('dialectic_projects')
      .insert({
        user_id: user.id,
        project_name: projectName,
        initial_user_prompt: initialUserPromptText || null, // Insert null if initialUserPrompt is empty
        selected_domain_tag: selectedDomainTag,
        selected_domain_overlay_id: selected_domain_overlay_id,
        status: 'new',
        initial_prompt_resource_id: null, // Initially null
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating project (initial insert):", createError);
      if (createError.code === '23503') {
        return { error: { message: "Invalid selected_domain_overlay_id. The specified overlay does not exist.", details: createError.message, status: 400 } };
      }
      return { error: { message: "Failed to create project", details: createError.details || createError.message, status: 500 } };
    }

    if (!newProjectData) {
      return { error: { message: "Failed to create project, no data returned from initial insert.", status: 500 }};
    }

    // 2. If promptFile exists, upload it and create a resource record
    if (promptFile) {
      console.log(`Processing promptFile: ${promptFile.name}, size: ${promptFile.size}, type: ${promptFile.type}`);
      const projectResourceRecordId = crypto.randomUUID();
      const storagePath = `projects/${newProjectData.id}/initial-prompts/${projectResourceRecordId}/${promptFile.name}`;
      
      // Note: uploadToStorage typically uses the user-specific client for RLS, 
      // but here we might need admin to write to a general project assets bucket.
      // Ensure 'uploadToStorage' is flexible or use 'dbAdminClient.storage' directly if appropriate.
      // Using dbAdminClient.storage directly for clarity on permissions.
      const { data: uploadData, error: uploadError } = await dbAdminClient.storage
        .from('dialectic-contributions') // Corrected bucket name
        .upload(storagePath, promptFile, {
          contentType: promptFile.type,
          upsert: false, // Do not upsert, expect unique paths
        });

      if (uploadError) {
        console.error("Error uploading promptFile to storage:", uploadError);
        // Optionally, delete the partially created project record newProjectData.id
        return { error: { message: "Failed to upload initial prompt file.", details: uploadError.message, status: 500 } };
      }
      
      if (!uploadData) {
        return { error: { message: "Failed to upload initial prompt file, no upload data returned.", status: 500 } };
      }
      
      console.log("File uploaded successfully to path:", uploadData.path);

      const { data: resourceData, error: resourceCreateError } = await dbAdminClient
        .from('dialectic_project_resources')
        .insert({
          id: projectResourceRecordId,
          project_id: newProjectData.id,
          user_id: user.id,
          file_name: promptFile.name,
          storage_bucket: 'dialectic-contributions', // Corrected bucket name
          storage_path: uploadData.path, // Use the path returned by storage
          mime_type: promptFile.type,
          size_bytes: promptFile.size,
          resource_description: 'Initial project prompt file',
        })
        .select('id')
        .single();

      if (resourceCreateError) {
        console.error("Error creating dialectic_project_resources record:", resourceCreateError);
        // Attempt to delete the orphaned file from storage
        await dbAdminClient.storage.from('dialectic-contributions').remove([uploadData.path]); // Corrected bucket name
        return { error: { message: "Failed to record prompt file resource.", details: resourceCreateError.message, status: 500 } };
      }

      if (!resourceData) {
        return { error: { message: "Failed to record prompt file resource, no data returned.", status: 500 } };
      }

      
      // 3. Update project with resource_id and adjust initial_user_prompt
      const { data: updatedProjectData, error: updateProjectError } = await dbAdminClient
        .from('dialectic_projects')
        .update({
          initial_prompt_resource_id: projectResourceRecordId,
          initial_user_prompt: "",
        })
        .eq('id', newProjectData.id)
        .select()
        .single();

      if (updateProjectError) {
        console.error("Error updating project with resource ID:", updateProjectError);
        // Potentially rollback: delete resource record and storage file
        return { error: { message: "Failed to finalize project with file resource.", details: updateProjectError.message, status: 500 } };
      }
      if (!updatedProjectData) {
         return { error: { message: "Failed to finalize project with file resource, no data returned from update.", status: 500 }};
      }
       // Use updatedProjectData for the response
       Object.assign(newProjectData, updatedProjectData);
    }
    
    // Map to the DialecticProject interface structure
    const responseData: DialecticProject = {
      id: newProjectData.id,
      user_id: newProjectData.user_id,
      project_name: newProjectData.project_name,
      initial_user_prompt: newProjectData.initial_user_prompt, // This will be the final version
      initial_prompt_resource_id: newProjectData.initial_prompt_resource_id, // This will be the final version
      selected_domain_tag: newProjectData.selected_domain_tag,
      selected_domain_overlay_id: newProjectData.selected_domain_overlay_id,
      repo_url: newProjectData.repo_url,
      status: newProjectData.status,
      created_at: newProjectData.created_at,
      updated_at: newProjectData.updated_at,
      // user_domain_overlay_values: newProjectData.user_domain_overlay_values // Removed due to interface mismatch
    };
    
    console.log("Project created/updated successfully:", responseData.id);
    return { data: responseData };

  } catch (e) {
    console.error("Unexpected error in createProject:", e);
    const details = e instanceof Error ? e.message : String(e);
    return { error: { message: "An unexpected error occurred.", details, status: 500 } };
  }
}
  