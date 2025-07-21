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
  _options?: CreateProjectOptions
) {
  console.log("createProject function invoked");

  try {
    const projectName = payload.get('projectName');
    const initialUserPromptText = payload.get('initialUserPromptText');
    const selectedDomainId = payload.get('selectedDomainId');
    const selected_domain_overlay_id = payload.get('selectedDomainOverlayId');
    const promptFile = payload.get('promptFile');

    const isFile = promptFile instanceof File;

    console.log({ projectName, initialUserPromptText, selectedDomainId, selected_domain_overlay_id, promptFileExists: isFile });

    if (!projectName || typeof projectName !== 'string') {
      return { error: { message: "projectName is required and must be a string", status: 400 } };
    }
    if (typeof initialUserPromptText !== 'string' && !isFile) {
      return { error: { message: "Either initialUserPromptText or a promptFile must be provided.", status: 400 } };
    }
    if (!selectedDomainId || typeof selectedDomainId !== 'string') {
      return { error: { message: "selectedDomainId is required and must be a string", status: 400 } };
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
        initial_user_prompt: "", // Always empty, we'll store everything as files
        selected_domain_id: selectedDomainId,
        selected_domain_overlay_id: selected_domain_overlay_id,
        process_template_id: defaultProcessTemplateId,
        status: 'new',
        initial_prompt_resource_id: null, // Will be set after file upload
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

    // Always create a file resource for the initial prompt, whether from string or file input
    const fileManager = new FileManagerService(dbAdminClient);
    let promptResourceId: string;

    if (isFile) {
      const file = promptFile;
      console.log(`Processing promptFile: ${file.name}, size: ${file.size}, type: ${file.type}`);
      
      const fileBuffer = await file.arrayBuffer();

      const uploadResult = await fileManager.uploadAndRegisterFile({
        pathContext: {
          projectId: newProjectData.id,
          fileType: 'initial_user_prompt',
          originalFileName: file.name,
        },
        fileContent: Buffer.from(fileBuffer),
        mimeType: file.type,
        sizeBytes: file.size,
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
      
      promptResourceId = uploadResult.record.id;
      console.log(`File uploaded and registered successfully via FileManagerService. Resource ID: ${promptResourceId}`);
    } else if (typeof initialUserPromptText === 'string') {
      // Convert string input to markdown file
      console.log(`Converting string input to markdown file for project ${newProjectData.id}`);
      
      const stringUint8Array = new TextEncoder().encode(initialUserPromptText);
      const fileContent = Buffer.from(stringUint8Array);
      const fileName = `initial_prompt_${Date.now()}.md`;

      const uploadResult = await fileManager.uploadAndRegisterFile({
        pathContext: {
          projectId: newProjectData.id,
          fileType: 'initial_user_prompt',
          originalFileName: fileName,
        },
        fileContent: fileContent,
        mimeType: 'text/markdown',
        sizeBytes: fileContent.byteLength,
        userId: user.id,
        description: 'Initial project prompt (converted from text input)',
      });

      if (uploadResult.error || !uploadResult.record) {
        console.error("Error uploading string prompt as file via FileManagerService:", uploadResult.error);
        await dbAdminClient.from('dialectic_projects').delete().eq('id', newProjectData.id);
        
        const baseMessage = uploadResult.error?.message || "Failed to upload and register initial prompt text as file.";
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
      
      promptResourceId = uploadResult.record.id;
      console.log(`String input converted to file and uploaded successfully via FileManagerService. Resource ID: ${promptResourceId}`);
    } else {
      // This shouldn't happen due to validation above, but adding for safety
      console.error("No prompt content provided");
      await dbAdminClient.from('dialectic_projects').delete().eq('id', newProjectData.id);
      return { error: { message: "No initial prompt content provided.", status: 400 } };
    }

    // Update project with the resource ID
    const { data: updatedProjectData, error: updateProjectError } = await dbAdminClient
      .from('dialectic_projects')
      .update({
        initial_prompt_resource_id: promptResourceId,
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
  