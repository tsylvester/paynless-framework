// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";
import { 
    CreateProjectPayload, 
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
    payload: CreateProjectPayload,
    options?: CreateProjectOptions // Optional DI for Supabase client and isValidDomainTag
  ) {
    const { projectName, initialUserPrompt, selectedDomainTag } = payload;
  
    if (!projectName || !initialUserPrompt) {
      return { error: { message: "projectName and initialUserPrompt are required", status: 400 } };
    }
  
    // Use injected createSupabaseClient if provided, otherwise use the one from sharedAuth
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
      const tagIsValid = await resolvedIsValidDomainTag(dbAdminClient, selectedDomainTag);
      if (!tagIsValid) {
        return { error: { message: `Invalid selectedDomainTag: "${selectedDomainTag}"`, status: 400 } };
      }
    }
  
    const { data: newProjectData, error: createError } = await dbAdminClient
      .from('dialectic_projects')
      .insert({
        user_id: user.id,
        project_name: projectName,
        initial_user_prompt: initialUserPrompt,
        selected_domain_tag: selectedDomainTag,
        status: 'new',
        // created_at and updated_at are handled by default in table definition
      })
      .select() // Select all columns of the new project
      .single();
  
    if (createError) {
      console.error("Error creating project:", createError);
      // Check for specific DB errors if needed, e.g., unique constraint violation
      if (createError.code === '23503') { // Foreign key violation
        return { error: { message: "Invalid selectedDomainTag. The specified domain tag does not exist.", details: createError.message, status: 400 } };
      }

      return { error: { message: "Failed to create project", details: createError.message, status: 500 } };
    }
  
    if (!newProjectData) {
      // This case should ideally not be reached if insert was successful without error
      // but as a safeguard.
      return { error: { message: "Failed to create project, no data returned.", status: 500 }};
    }
    
    // Map to the DialecticProject interface structure
    const responseData: DialecticProject = {
      id: newProjectData.id,
      user_id: newProjectData.user_id,
      project_name: newProjectData.project_name,
      initial_user_prompt: newProjectData.initial_user_prompt,
      selected_domain_tag: newProjectData.selected_domain_tag, // This is from DB, so it's snake_case
      repo_url: newProjectData.repo_url,
      status: newProjectData.status,
      created_at: newProjectData.created_at,
      updated_at: newProjectData.updated_at,
    };
    
    return { data: responseData };
  }
  