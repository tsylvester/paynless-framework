// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Buffer } from 'https://deno.land/std@0.177.0/node/buffer.ts';
import { 
    DialecticProject 
  } from "./dialectic.interface.ts";
import { FileManagerService } from "../_shared/services/file_manager.ts";

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

    // Step 1: Find the default process template for the selected domain
    const { data: association, error: associationError } = await dbAdminClient
      .from('domain_process_associations')
      .select('process_template_id')
      .eq('domain_id', selectedDomainId)
      .eq('is_default_for_domain', true)
      .single();

    if (associationError || !association) {
      console.error(`Error finding default process for domain ${selectedDomainId}:`, associationError);
      return { error: { message: "Could not find a default process template for the selected domain.", status: 400 } };
    }

    const defaultProcessTemplateId = association.process_template_id;

    const { data: newProjectData, error: createError } = await dbAdminClient
      .from('dialectic_projects')
      .insert({
        user_id: user.id,
        project_name: projectName,
        initial_user_prompt: initialUserPromptText || "",
        selected_domain_id: selectedDomainId,
        selected_domain_overlay_id: selected_domain_overlay_id,
        process_template_id: defaultProcessTemplateId,
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
      
      const fileManager = new FileManagerService(dbAdminClient);
      const fileBuffer = await promptFile.arrayBuffer();

      const uploadResult = await fileManager.uploadAndRegisterFile({
        pathContext: {
          projectId: newProjectData.id,
          fileType: 'initial_user_prompt',
          originalFileName: promptFile.name,
        },
        fileContent: Buffer.from(fileBuffer),
        mimeType: promptFile.type,
        sizeBytes: promptFile.size,
        userId: user.id,
        description: 'Initial project prompt file',
      });

      if (uploadResult.error || !uploadResult.record) {
        console.error("Error uploading promptFile via FileManagerService:", uploadResult.error);
        await dbAdminClient.from('dialectic_projects').delete().eq('id', newProjectData.id);
        
        const baseMessage = uploadResult.error?.message || "Failed to upload and register initial prompt file.";
        const errorDetails = uploadResult.error?.details;
        const fullMessage = errorDetails ? `${baseMessage}: ${errorDetails}` : baseMessage;

        return { 
          error: { 
            message: fullMessage, 
            details: errorDetails || (uploadResult.error?.message && uploadResult.error.message !== baseMessage ? uploadResult.error.message : undefined),
            status: 500 
          }
        };
      }
      
      const promptResourceId = uploadResult.record.id;
      console.log(`File uploaded and registered successfully via FileManagerService. Resource ID: ${promptResourceId}`);

      const { data: updatedProjectData, error: updateProjectError } = await dbAdminClient
        .from('dialectic_projects')
        .update({
          initial_prompt_resource_id: promptResourceId,
          initial_user_prompt: "",
        })
        .eq('id', newProjectData.id)
        .select(`
          *,
          domain:dialectic_domains (
            name
          ),
          process_template:dialectic_process_templates (
            *
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
    
    // This part of the logic assumes that if the project was just created and not updated,
    // the process_template relationship might not be populated. We'll fetch it if needed.
    if (!newProjectData.process_template) {
       const { data: finalProjectData, error: finalFetchError } = await dbAdminClient
        .from('dialectic_projects')
        .select(`
          *,
          domain:dialectic_domains (
            name
          ),
          process_template:dialectic_process_templates (
            *
          )
        `)
        .eq('id', newProjectData.id)
        .single();
      
      if(finalFetchError || !finalProjectData) {
         console.error("Error fetching final project data with process_template:", finalFetchError);
         return { error: { message: "Failed to fetch project details after creation.", status: 500 } };
      }
      Object.assign(newProjectData, finalProjectData);
    }
    
    const responseData: DialecticProject = {
      id: newProjectData.id,
      user_id: newProjectData.user_id,
      project_name: newProjectData.project_name,
      initial_user_prompt: newProjectData.initial_user_prompt,
      initial_prompt_resource_id: newProjectData.initial_prompt_resource_id,
      selected_domain_id: newProjectData.selected_domain_id,
      domain_name: newProjectData.domain.name,
      process_template: newProjectData.process_template,
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
  