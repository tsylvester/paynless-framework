// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";
import { 
    CreateProjectPayload, 
  } from "./dialectic.interface.ts";
  import { createSupabaseClient as originalCreateSupabaseClient } from "../_shared/auth.ts"; // Renamed import
  import { isValidDomainTag as originalIsValidDomainTag } from "../_shared/domain-utils.ts"; // Renamed import
  
  console.log("createProject function started");
  
  // Define an options interface for clarity
  export interface CreateProjectOptions {
    createSupabaseClient?: (req: Request) => SupabaseClient;
    isValidDomainTag?: (dbClient: SupabaseClient, tag: string) => Promise<boolean>; // Added
  }

  export async function createProject(
    req: Request,
    dbAdminClient: SupabaseClient,
    payload: CreateProjectPayload,
    options?: CreateProjectOptions // Added options parameter
  ) {
    const { projectName, initialUserPrompt, selected_domain_tag } = payload;
  
    if (!projectName || !initialUserPrompt) {
      return { error: { message: "projectName and initialUserPrompt are required", status: 400 } };
    }
  
    // Use injected createSupabaseClient if provided, otherwise use the original
    const resolvedCreateSupabaseClient = options?.createSupabaseClient || originalCreateSupabaseClient;
    const supabaseUserClient = resolvedCreateSupabaseClient(req);
    const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();
  
    if (userError || !user) {
      console.warn("User not authenticated for createProject", userError);
      return { error: { message: "User not authenticated", status: 401 } };
    }
  
    // Use injected isValidDomainTag if provided, otherwise use the original
    const resolvedIsValidDomainTag = options?.isValidDomainTag || originalIsValidDomainTag;
    if (selected_domain_tag) {
      const tagIsValid = await resolvedIsValidDomainTag(dbAdminClient, selected_domain_tag);
      if (!tagIsValid) {
        return { error: { message: `Invalid selectedDomainTag: "${selected_domain_tag}"`, status: 400 } };
      }
    }
  
    const { data: newProjectData, error: createError } = await dbAdminClient
      .from('dialectic_projects')
      .insert({
        user_id: user.id,
        project_name: projectName,
        initial_user_prompt: initialUserPrompt,
        selected_domain_tag: selected_domain_tag,
        // status is 'active' by default due to table definition
        // created_at and updated_at are handled by default in table definition
      })
      .select() // Select all columns of the new project
      .single();
  
    if (createError) {
      console.error("Error creating project:", createError);
      // Check for specific DB errors if needed, e.g., unique constraint violation
      return { error: { message: "Failed to create project", details: createError.message, status: 500 } };
    }
  
    if (!newProjectData) {
      // This case should ideally not be reached if insert was successful without error
      // but as a safeguard.
      return { error: { message: "Failed to create project, no data returned.", status: 500 }};
    }
    
    return { data: newProjectData };
  }
  