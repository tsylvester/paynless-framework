import {
  AssembledPrompt,
  AssembleTurnPromptDeps,
  AssembleTurnPromptParams,
} from "./prompt-assembler.interface.ts";
import { isRecord } from "../utils/type_guards.ts";
import { FileManagerResponse, FileType } from "../types/file_manager.types.ts";
import { ContentToInclude, HeaderContext, OutputRule } from "../../dialectic-service/dialectic.interface.ts";
import { isHeaderContext, isContentToInclude, isOutputRule } from "../utils/type-guards/type_guards.dialectic.ts";
import { Database } from "../../types_db.ts";
import { gatherInputsForStage } from "./gatherInputsForStage.ts";
import { renderPrompt } from "../prompt-renderer.ts";

export async function assembleTurnPrompt(
  deps: AssembleTurnPromptDeps,
  params: AssembleTurnPromptParams,
): Promise<AssembledPrompt> {
  const { dbClient, fileManager } = deps;
  const { job, project, session, stage } = params;
  // 1. Precondition Guards
  if (!session.selected_model_ids || session.selected_model_ids.length === 0) {
    throw new Error(
      "PRECONDITION_FAILED: Session must have at least one selected model.",
    );
  }
  if (!isRecord(job.payload)) {
    throw new Error(
      "PRECONDITION_FAILED: Job payload is missing or not a valid record.",
    );
  }
  if (
    "step_info" in job.payload
  ) {
    throw new Error(
      "PRECONDITION_FAILED: Legacy 'step_info' object found in job payload.",
    );
  }
  if (!isRecord(job.payload.inputs)) {
    throw new Error(
      "PRECONDITION_FAILED: Job payload inputs is missing or not a valid record.",
    );
  }
  if (typeof job.payload.document_key !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'document_key'.");
  }
  if (typeof job.payload.model_id !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_id'.");
  }
  if (!stage.recipe_step) {
    throw new Error("PRECONDITION_FAILED: Stage context is missing recipe_step.");
  }

  // Check if this recipe step requires a header_context input
  const requiresHeaderContext = Array.isArray(stage.recipe_step.inputs_required)
    && stage.recipe_step.inputs_required.some((rule) => rule?.type === 'header_context');

  // Only validate header_context_id if the recipe step requires it
  if (requiresHeaderContext) {
    if (typeof job.payload.inputs.header_context_id !== "string") {
      throw new Error(
        "PRECONDITION_FAILED: Job payload inputs is missing 'header_context_id'.",
      );
    }
  }

  // 2. Fetch Model Details
  const { data: model, error: modelError } = await dbClient
    .from("ai_providers")
    .select("name")
    .eq("id", job.payload.model_id)
    .single();

  if (modelError || !model) {
    throw new Error(
      `Failed to fetch model details for id ${job.payload.model_id}: ${
        modelError?.message
      }`,
    );
  }

  // 3. Fetch Header Context Contribution from Database (only if required)
  let headerContext: HeaderContext | undefined;
  if (requiresHeaderContext) {
    const headerContextId = job.payload.inputs.header_context_id;
    if (typeof headerContextId !== "string") {
      throw new Error(
        "PRECONDITION_FAILED: Job payload inputs is missing 'header_context_id'.",
      );
    }
    const { data: headerContrib, error: contribError } = await dbClient
      .from("dialectic_contributions")
      .select("id, storage_bucket, storage_path, file_name, contribution_type")
      .eq("id", headerContextId)
      .single();

    if (contribError || !headerContrib) {
      throw new Error(
        `Header context contribution with id '${headerContextId}' not found in database.`,
      );
    }

    if (headerContrib.contribution_type !== "header_context") {
      throw new Error(
        `Contribution '${headerContextId}' is not a header_context contribution (found '${headerContrib.contribution_type}').`,
      );
    }

    if (typeof headerContrib.storage_bucket !== "string" || !headerContrib.storage_bucket) {
      throw new Error(
        `Header context contribution '${headerContextId}' is missing required storage_bucket.`,
      );
    }

    if (typeof headerContrib.storage_path !== "string" || !headerContrib.storage_path) {
      throw new Error(
        `Header context contribution '${headerContextId}' is missing required storage_path.`,
      );
    }

    if (typeof headerContrib.file_name !== "string" || !headerContrib.file_name) {
      throw new Error(
        `Header context contribution '${headerContextId}' is missing required file_name.`,
      );
    }

    // 4. Construct Storage Path and Download Header Context
    const fileName = headerContrib.file_name || "";
    const pathToDownload = fileName
      ? `${headerContrib.storage_path}/${fileName}`
      : headerContrib.storage_path;

    const { data: headerBlob, error: headerError } = await deps.downloadFromStorage(
      dbClient,
      headerContrib.storage_bucket,
      pathToDownload,
    );
    if (headerError || !headerBlob) {
      throw new Error(
        `Failed to download header context file from storage: ${headerError?.message}`,
      );
    }

    try {
      let headerContent: string;
      if (headerBlob instanceof Blob) {
        headerContent = await headerBlob.text();
      } else if (headerBlob instanceof ArrayBuffer) {
        headerContent = new TextDecoder().decode(headerBlob);
      } else {
        throw new Error("Invalid format for header context file.");
      }
      const parsedContext = JSON.parse(headerContent);
      if (!isHeaderContext(parsedContext)) {
        throw new Error("Parsed header context does not conform to HeaderContext interface structure.");
      }
      headerContext = parsedContext;
    } catch (e: unknown) {
      let errorMessage = "An unknown error occurred while parsing JSON.";
      if (e instanceof Error) {
        errorMessage = e.message;
      }
      throw new Error(
        `Failed to parse header context content as JSON: ${errorMessage}`,
      );
    }
  }

  // 5. Get files_to_generate from Recipe Step and Find Document Template
  const documentKey = job.payload.document_key;
  
  // Validate and narrow outputs_required type
  if (!stage.recipe_step.outputs_required) {
    throw new Error(
      `Recipe step missing outputs_required for document_key '${documentKey}'. EXECUTE recipe steps must have outputs_required.`,
    );
  }
  
  // Type guard: ensure outputs_required is an OutputRule object (not an array)
  if (!isOutputRule(stage.recipe_step.outputs_required)) {
    throw new Error(
      `Recipe step outputs_required is malformed for document_key '${documentKey}'. outputs_required must be an OutputRule object.`,
    );
  }
  
  const outputsRequired: OutputRule = stage.recipe_step.outputs_required;
  
  // Get files_to_generate from recipe step (execution instructions)
  const filesToGenerate = outputsRequired.files_to_generate;
  if (!filesToGenerate || !Array.isArray(filesToGenerate) || filesToGenerate.length === 0) {
    throw new Error(
      `Recipe step missing files_to_generate for document_key '${documentKey}'. EXECUTE recipe steps must have files_to_generate in outputs_required.`,
    );
  }

  // Find the file generation instruction for this document
  const docInfo = filesToGenerate.find(
    (f) => f.from_document_key === documentKey,
  );
  if (!docInfo) {
    throw new Error(
      `No files_to_generate entry found with from_document_key '${documentKey}' in recipe step.`,
    );
  }

  // Get alignment details from header_context (filled by PLAN job) - only if header_context is required
  let contextForDoc: { document_key: string; content_to_include: unknown } | undefined;
  let validatedContentToInclude: ContentToInclude | undefined;
  if (requiresHeaderContext && headerContext) {
    if (!headerContext.context_for_documents || !Array.isArray(headerContext.context_for_documents) || headerContext.context_for_documents.length === 0) {
      throw new Error(
        `Header context is missing context_for_documents array. Header context must include context_for_documents with alignment details.`,
      );
    }

    contextForDoc = headerContext.context_for_documents.find(
      (d) => d.document_key === documentKey,
    );
    if (!contextForDoc) {
      throw new Error(
        `No context_for_documents entry found for document_key '${documentKey}' in header_context. The PLAN job must generate alignment details for all documents in files_to_generate.`,
      );
    }

    // Validate that files_to_generate[].from_document_key matches context_for_documents[].document_key
    if (docInfo.from_document_key !== contextForDoc.document_key) {
      throw new Error(
        `PLAN ↔ EXECUTE structure mapping violation: files_to_generate[].from_document_key '${docInfo.from_document_key}' does not match context_for_documents[].document_key '${contextForDoc.document_key}'.`,
      );
    }

    // Validate content_to_include structure conforms to ContentToInclude type
    if (!isContentToInclude(contextForDoc.content_to_include)) {
      throw new Error(
        `content_to_include structure for document_key '${documentKey}' does not conform to ContentToInclude type. Content must be an object (not array at top level) with values of type string, string[], boolean, number, or nested ContentToInclude structures.`,
      );
    }

    // Validate key existence: Verify all required keys from recipe step's content_to_include exist in header_context
    if (outputsRequired.documents && Array.isArray(outputsRequired.documents)) {
      const recipeDoc = outputsRequired.documents.find(
        (d) => d.document_key === documentKey && 'content_to_include' in d
      );
      
      if (recipeDoc && 'content_to_include' in recipeDoc && recipeDoc.content_to_include) {
        const recipeContentToInclude = recipeDoc.content_to_include;
        const contextContentToInclude = contextForDoc.content_to_include;
        
        // Check that all required keys from recipe step exist in header_context (without type checking)
        const requiredKeys = Object.keys(recipeContentToInclude);
        const actualKeys = Object.keys(contextContentToInclude);
        const missingKeys = requiredKeys.filter(key => !actualKeys.includes(key));
        
        if (missingKeys.length > 0) {
          throw new Error(
            `content_to_include for document_key '${documentKey}' is missing required keys from recipe step: ${missingKeys.join(', ')}. ` +
            `Required keys: ${requiredKeys.join(', ')}, but header_context has keys: ${actualKeys.join(', ')}.`
          );
        }
      }
    }

    // Validate that content_to_include has been filled in (not empty model)
    if (
      !contextForDoc.content_to_include ||
      (typeof contextForDoc.content_to_include === "object" &&
        !Array.isArray(contextForDoc.content_to_include) &&
        Object.keys(contextForDoc.content_to_include).length === 0)
    ) {
      throw new Error(
        `content_to_include not filled in for document_key '${documentKey}' in header_context. The PLAN job must populate alignment details in context_for_documents before EXECUTE jobs can use them.`,
      );
    }
    // Capture validated content for use in merge (TypeScript doesn't track narrowing across scopes)
    validatedContentToInclude = contextForDoc.content_to_include;
  }

  // 5.b Resolve Turn prompt template via recipe_step.prompt_template_id (authoritative, no fallbacks)
  if (typeof stage.recipe_step.prompt_template_id !== "string" || stage.recipe_step.prompt_template_id.length === 0) {
    throw new Error(
      `PRECONDITION_FAILED: Recipe step is missing prompt_template_id for document_key '${documentKey}'.`,
    );
  }

  type SystemPromptRow = Database["public"]["Tables"]["system_prompts"]["Row"];
  const { data: systemPrompt, error: systemPromptError } = await dbClient
    .from("system_prompts")
    .select("id, document_template_id")
    .eq("id", stage.recipe_step.prompt_template_id)
    .single<SystemPromptRow>();

  if (systemPromptError || !systemPrompt) {
    throw new Error(
      `Failed to load system_prompts row for prompt_template_id '${stage.recipe_step.prompt_template_id}': ${systemPromptError?.message ?? "not found"}`,
    );
  }

  const documentTemplateId = systemPrompt.document_template_id;
  if (typeof documentTemplateId !== "string" || documentTemplateId.length === 0) {
    throw new Error(
      `System prompt '${systemPrompt.id}' is missing document_template_id. Turn prompts must resolve templates via document_template_id.`,
    );
  }

  type DocumentTemplateRow = Database["public"]["Tables"]["dialectic_document_templates"]["Row"];
  if (typeof project.selected_domain_id !== "string" || project.selected_domain_id.length === 0) {
    throw new Error(
      `Project '${project.id}' is missing selected_domain_id. Template lookup requires domain_id.`,
    );
  }

  const { data: templateRow, error: templateErr } = await dbClient
    .from("dialectic_document_templates")
    .select("storage_bucket, storage_path, file_name")
    .eq("id", documentTemplateId)
    .eq("domain_id", project.selected_domain_id)
    .eq("is_active", true)
    .single<DocumentTemplateRow>();

  if (templateErr || !templateRow) {
    throw new Error(
      `Failed to resolve document template '${documentTemplateId}' for domain_id '${project.selected_domain_id}': ${templateErr?.message ?? "not found"}`,
    );
  }

  const templateBucket = templateRow.storage_bucket;
  const templateStoragePath = templateRow.storage_path;
  const templateFile = templateRow.file_name;

  if (typeof templateBucket !== "string" || templateBucket.length === 0) {
    throw new Error(
      `Invalid template row '${documentTemplateId}': missing storage_bucket.`,
    );
  }
  if (typeof templateStoragePath !== "string" || templateStoragePath.length === 0) {
    throw new Error(
      `Invalid template row '${documentTemplateId}': missing storage_path.`,
    );
  }
  if (typeof templateFile !== "string" || templateFile.length === 0) {
    throw new Error(
      `Invalid template row '${documentTemplateId}': missing file_name.`,
    );
  }

  const fullTemplatePath =
    `${templateStoragePath.replace(/\/$/, "")}/${templateFile.replace(/^\//, "")}`;

  const { data: templateBlob, error: templateError } = await deps.downloadFromStorage(
    dbClient,
    templateBucket,
    fullTemplatePath,
  );
  if (templateError || !templateBlob) {
    throw new Error(
      `Failed to download turn prompt template '${fullTemplatePath}' from bucket '${templateBucket}': ${templateError?.message}`,
    );
  }

  let documentTemplateContent: string;
  if (templateBlob instanceof Blob) {
    documentTemplateContent = await templateBlob.text();
  } else if (templateBlob instanceof ArrayBuffer) {
    documentTemplateContent = new TextDecoder().decode(templateBlob);
  } else {
    throw new Error("Invalid format for document template file.");
  }

  // 6. Gather Context and Render the Prompt
  const documentSpecificData = isRecord(job.payload.document_specific_data)
    ? job.payload.document_specific_data
    : {};

  // Call gatherContext to build base DynamicContextVariables
  const dynamicContext = await deps.gatherContext(
    dbClient,
    (bucket, path) => deps.downloadFromStorage(dbClient, bucket, path),
    gatherInputsForStage,
    project,
    session,
    stage,
    project.initial_user_prompt,
    session.iteration_count,
  );

  // Merge context for prompt rendering
  // Merge order: dynamicContext -> content_to_include (alignment) -> documentSpecificData -> header_context
  // Note: user_domain_overlay_values is passed separately to deps.render for proper overlay layering
  // When requiresHeaderContext is true, validatedContentToInclude and headerContext are guaranteed by validation above
  const baseContext = {
    ...dynamicContext,
    ...documentSpecificData,
  };

  const mergedContext = requiresHeaderContext
    ? { ...baseContext, ...validatedContentToInclude, header_context: headerContext }
    : baseContext;

  // Create stage with template content for deps.render
  const stageWithTemplate = {
    ...stage,
    system_prompts: { prompt_text: documentTemplateContent },
  };

  // Use deps.render with proper overlay layering
  const renderedPrompt = deps.render(
    renderPrompt,
    stageWithTemplate,
    mergedContext,
    project.user_domain_overlay_values,
  );

  if (typeof job.payload.model_slug !== "string") {
    throw new Error("PRECONDITION_FAILED: Job payload is missing 'model_slug'.");
  }
  // 7. Persist the Assembled Prompt
  let sourceContributionId: string | undefined;
  if ("target_contribution_id" in job.payload) {
    const rawTargetContributionId = job.payload.target_contribution_id;
    if (
      rawTargetContributionId !== undefined &&
      rawTargetContributionId !== null &&
      typeof rawTargetContributionId !== "string"
    ) {
      throw new Error(
        "PRECONDITION_FAILED: Job payload target_contribution_id must be a string.",
      );
    }
    if (typeof rawTargetContributionId === "string") {
      sourceContributionId = rawTargetContributionId;
    }
  }

  const response: FileManagerResponse = await fileManager.uploadAndRegisterFile({
    pathContext: {
      projectId: project.id,
      sessionId: session.id,
      iteration: session.iteration_count,
      stageSlug: stage.slug,
      fileType: FileType.TurnPrompt,
      modelSlug: job.payload.model_slug,
      attemptCount: job.attempt_count,
      documentKey: documentKey,
      stepName: stage.recipe_step.step_name,
      branchKey: stage.recipe_step.branch_key,
      parallelGroup: stage.recipe_step.parallel_group,
      sourceContributionId,
    },
    fileContent: renderedPrompt,
    mimeType: "text/markdown",
    sizeBytes: new TextEncoder().encode(renderedPrompt).length,
    userId: project.user_id,
    description:
      `Turn prompt for stage: ${stage.slug}, document: ${documentKey}`,
  });

  if (response.error) {
    throw new Error(
      `Failed to save turn prompt: ${response.error.message}`,
    );
  }

  // 8. Return the Final AssembledPrompt
  return {
    promptContent: renderedPrompt,
    source_prompt_resource_id: response.record.id,
  };
}