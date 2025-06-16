// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { 
    DialecticProject 
  } from "./dialectic.interface.ts";

  console.log("createProject function started");
  
  // Define a type for the function signature of createSupabaseClient
  type CreateSupabaseClientFn = (req: Request) => SupabaseClient;
  type IsValidDomainIdFn = (dbClient: SupabaseClient, domainId: string) => Promise<boolean>;

  // Define an options interface for clarity
  export interface CreateProjectOptions {
    createSupabaseClient?: CreateSupabaseClientFn;
    isValidDomainId?: IsValidDomainIdFn; // Allow injecting isValidDomainId
  }

export async function createProject(
  payload: FormData,
  dbAdminClient: SupabaseClient,
  user: User,
  options?: CreateProjectOptions
) {
  console.log("createProject function invoked");

  try {
    const projectName = payload.get('projectName') as string | null;
    const initialUserPromptText = payload.get('initialUserPromptText') as string | null;
    const selectedDomainId = payload.get('selectedDomainId') as string | null;
    const selected_domain_overlay_id = payload.get('selectedDomainOverlayId') as string | null;
    const promptFile = payload.get('promptFile') as File | null;

    console.log({ projectName, initialUserPromptText, selectedDomainId, selected_domain_overlay_id, promptFileExists: !!promptFile });

    if (!projectName) {
      return { error: { message: "projectName is required", status: 400 } };
    }
    if (!initialUserPromptText && !promptFile) {
      return { error: { message: "Either initialUserPromptText or a promptFile must be provided.", status: 400 } };
    }
    if (!selectedDomainId) {
      return { error: { message: "selectedDomainId is required", status: 400 } };
    }

    const { data: newProjectData, error: createError } = await dbAdminClient
      .from('dialectic_projects')
      .insert({
        user_id: user.id,
        project_name: projectName,
        initial_user_prompt: initialUserPromptText || "",
        selected_domain_id: selectedDomainId,
        selected_domain_overlay_id: selected_domain_overlay_id,
        status: 'new',
        initial_prompt_resource_id: null,
      })
      .select(`
        *,
        domain:dialectic_domains (
          name
        )
      `)
      .single();

    if (createError) {
      console.error("Error creating project (initial insert):", createError);
      if (createError.code === '23503') { // foreign_key_violation
        if (createError.message.includes('selected_domain_id')) {
          return { error: { message: "Invalid selectedDomainId. The specified domain does not exist.", details: createError.message, status: 400 } };
        }
        if (createError.message.includes('selected_domain_overlay_id')) {
          return { error: { message: "Invalid selected_domain_overlay_id. The specified overlay does not exist.", details: createError.message, status: 400 } };
        }
      }
      return { error: { message: "Failed to create project", details: createError.details || createError.message, status: 500 } };
    }

    if (!newProjectData) {
      return { error: { message: "Failed to create project, no data returned from initial insert.", status: 500 }};
    }

    if (promptFile) {
      console.log(`Processing promptFile: ${promptFile.name}, size: ${promptFile.size}, type: ${promptFile.type}`);
      const projectResourceRecordId = crypto.randomUUID();
      const storagePath = `projects/${newProjectData.id}/initial-prompts/${projectResourceRecordId}/${promptFile.name}`;
      
      const { data: uploadData, error: uploadError } = await dbAdminClient.storage
        .from('dialectic-contributions')
        .upload(storagePath, promptFile, {
          contentType: promptFile.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading promptFile to storage:", uploadError);
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
          storage_bucket: 'dialectic-contributions',
          storage_path: uploadData.path,
          mime_type: promptFile.type,
          size_bytes: promptFile.size,
          resource_description: 'Initial project prompt file',
        })
        .select('id')
        .single();

      if (resourceCreateError) {
        console.error("Error creating dialectic_project_resources record:", resourceCreateError);
        await dbAdminClient.storage.from('dialectic-contributions').remove([uploadData.path]);
        return { error: { message: "Failed to record prompt file resource.", details: resourceCreateError.message, status: 500 } };
      }

      if (!resourceData) {
        return { error: { message: "Failed to record prompt file resource, no data returned.", status: 500 } };
      }

      const { data: updatedProjectData, error: updateProjectError } = await dbAdminClient
        .from('dialectic_projects')
        .update({
          initial_prompt_resource_id: projectResourceRecordId,
          initial_user_prompt: "",
        })
        .eq('id', newProjectData.id)
        .select(`
          *,
          domain:dialectic_domains (
            name
          )
        `)
        .single();

      if (updateProjectError) {
        console.error("Error updating project with resource ID:", updateProjectError);
        return { error: { message: "Failed to finalize project with file resource.", details: updateProjectError.message, status: 500 } };
      }
      if (!updatedProjectData) {
         return { error: { message: "Failed to finalize project with file resource, no data returned from update.", status: 500 }};
      }
       Object.assign(newProjectData, updatedProjectData);
    }
    
    const responseData: DialecticProject = {
      id: newProjectData.id,
      user_id: newProjectData.user_id,
      project_name: newProjectData.project_name,
      initial_user_prompt: newProjectData.initial_user_prompt,
      initial_prompt_resource_id: newProjectData.initial_prompt_resource_id,
      selected_domain_id: newProjectData.selected_domain_id,
      domain_name: newProjectData.domain.name,
      selected_domain_overlay_id: newProjectData.selected_domain_overlay_id,
      repo_url: newProjectData.repo_url,
      status: newProjectData.status,
      created_at: newProjectData.created_at,
      updated_at: newProjectData.updated_at,
    };
    
    console.log("Project created/updated successfully:", responseData.id);
    return { data: responseData };

  } catch (e) {
    console.error("Unexpected error in createProject:", e);
    const details = e instanceof Error ? e.message : String(e);
    return { error: { message: "An unexpected error occurred.", details, status: 500 } };
  }
}
  