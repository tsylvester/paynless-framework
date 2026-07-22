import {
  isDialecticRecipeStep,
  isOutputRule,
} from "../../utils/type-guards/type_guards.dialectic.recipe.ts";
import type { ResolveTemplateFilenameFn } from "./resolveTemplateFilename.interface.ts";

export class TemplateResolutionError extends Error {}

export const resolveTemplateFilename: ResolveTemplateFilenameFn = async (
  _deps,
  params,
  payload,
) => {
  let templateFilename = "";

  try {
    const { data: stageData, error: stageError } = await params.dbClient
      .from("dialectic_stages")
      .select("active_recipe_instance_id")
      .eq("slug", payload.stageSlug)
      .single();

    if (stageError) {
      return { error: stageError, retriable: false };
    }
    if (!stageData) {
      throw new TemplateResolutionError(
        `Stage '${payload.stageSlug}' not found`,
      );
    }
    if (!stageData.active_recipe_instance_id) {
      throw new TemplateResolutionError(
        `Stage '${payload.stageSlug}' has no active recipe instance`,
      );
    }

    const { data: instance, error: instanceError } = await params.dbClient
      .from("dialectic_stage_recipe_instances")
      .select("*")
      .eq("id", stageData.active_recipe_instance_id)
      .single();

    if (instanceError) {
      return { error: instanceError, retriable: false };
    }
    if (!instance) {
      throw new TemplateResolutionError(
        `Recipe instance '${stageData.active_recipe_instance_id}' not found`,
      );
    }

    const { data: stepRows, error: stepErr } = await (
      instance.is_cloned === true
        ? params.dbClient
          .from("dialectic_stage_recipe_steps")
          .select("*")
          .eq("instance_id", instance.id)
        : params.dbClient
          .from("dialectic_recipe_template_steps")
          .select("*")
          .eq("template_id", instance.template_id)
    );

    if (stepErr) {
      return { error: stepErr, retriable: false };
    }
    if (!stepRows || stepRows.length === 0) {
      throw new TemplateResolutionError(
        instance.is_cloned === true
          ? `No cloned recipe steps found for instance '${instance.id}'`
          : `No template recipe steps found for template '${instance.template_id}'`,
      );
    }

    const matchingStep = stepRows.find((step) =>
      step.output_type === payload.outputType
    );

    if (!matchingStep || !isDialecticRecipeStep(matchingStep)) {
      throw new TemplateResolutionError(
        `No recipe step found with output_type '${payload.outputType}' for stage '${payload.stageSlug}'`,
      );
    }

    const outputsRequired = matchingStep.outputs_required;
    if (!isOutputRule(outputsRequired)) {
      throw new TemplateResolutionError(
        `Recipe step with output_type '${payload.outputType}' has missing or invalid outputs_required`,
      );
    }

    const filesToGenerate = outputsRequired.files_to_generate;
    if (!filesToGenerate || filesToGenerate.length === 0) {
      throw new TemplateResolutionError(
        `Recipe step with output_type '${payload.outputType}' has missing or empty files_to_generate array`,
      );
    }

    const matchingFileEntry = filesToGenerate.find((entry) =>
      entry.from_document_key === payload.documentKey
    );

    if (!matchingFileEntry) {
      throw new TemplateResolutionError(
        `No files_to_generate entry found with from_document_key '${payload.documentKey}' in recipe step with output_type '${payload.outputType}'`,
      );
    }

    if (matchingFileEntry.template_filename.trim() === "") {
      throw new TemplateResolutionError(
        `template_filename is missing or invalid in files_to_generate entry for from_document_key '${payload.documentKey}'`,
      );
    }

    templateFilename = matchingFileEntry.template_filename.trim();
  } catch (error) {
    if (error instanceof TemplateResolutionError) {
      return { error, retriable: false };
    }
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      retriable: false,
    };
  }

  if (templateFilename.trim() === "") {
    return {
      error: new TemplateResolutionError(
        "template_filename must be a non-empty string",
      ),
      retriable: false,
    };
  }

  return { templateFilename: templateFilename.trim() };
};
