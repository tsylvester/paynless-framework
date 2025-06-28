// supabase/functions/_shared/utils/resourceDescriptionFormatter.ts
export interface ResourceDescriptionContext {
  type: string;
  session_id: string;
  stage_slug: string;
  iteration: number;
  original_file_name: string;
  project_id?: string; // Optional: include if universally available and useful
  // Add other common fields if necessary
}

/**
 * Creates a standardized JSON string for the 'resource_description' field.
 * Ensures consistency across different parts of the application when registering files.
 */
export function formatResourceDescription(context: ResourceDescriptionContext): string {
  const descriptionObject: Record<string, unknown> = {
    type: context.type,
    session_id: context.session_id,
    stage_slug: context.stage_slug,
    iteration: context.iteration,
    original_file_name: context.original_file_name,
  };

  if (context.project_id) {
    descriptionObject.project_id = context.project_id;
  }

  return JSON.stringify(descriptionObject);
} 