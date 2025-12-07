import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  InputRule,
} from "../../dialectic-service/dialectic.interface.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  GatheredRecipeContext,
} from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { parseInputArtifactRules } from "../utils/input-artifact-parser.ts";
import { deconstructStoragePath } from "../utils/path_deconstructor.ts";

export type GatherInputsForStageFn = (
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  stage: StageContext,
  project: ProjectContext,
  session: SessionContext,
  iterationNumber: number,
) => Promise<GatheredRecipeContext>;

export async function gatherInputsForStage(
  dbClient: SupabaseClient<Database>,
  downloadFromStorageFn: (
    bucket: string,
    path: string,
  ) => Promise<DownloadStorageResult>,
  stage: StageContext,
  project: ProjectContext,
  session: SessionContext,
  iterationNumber: number,
): Promise<GatheredRecipeContext> {
  const gatheredContext: GatheredRecipeContext = {
    sourceDocuments: [],
    recipeStep: stage.recipe_step,
  };
  let criticalError: Error | null = null;

  if (
    !stage.recipe_step || !stage.recipe_step.inputs_required ||
    stage.recipe_step.inputs_required.length === 0
  ) {
    console.info(
      "[gatherInputsForStage] No input rules defined for stage:",
      stage.slug,
    );
    return gatheredContext;
  }

  const rules: InputRule[] = parseInputArtifactRules(
    stage.recipe_step.inputs_required,
  );

  const stageSpecificRules = rules.filter(
    (rule: InputRule): rule is Extract<InputRule, {
      type: "document" | "feedback" | "header_context";
    }> => rule.type === "document" || rule.type === "feedback" || rule.type === "header_context",
  );

  const stageSlugsForDisplayName = stageSpecificRules
    .map((rule: InputRule) => rule.slug)
    .filter(
      (slug: string, index: number, self: string[]) =>
        self.indexOf(slug) === index,
    );

  const { data: stagesData, error: stagesError } = await dbClient
    .from("dialectic_stages")
    .select("slug, display_name")
    .in(
      "slug",
      stageSlugsForDisplayName.length > 0
        ? stageSlugsForDisplayName
        : ["dummy-non-matching-slug"],
    );

  if (stagesError) {
    console.warn(
      "[gatherInputsForStage] Could not fetch display names for some stages.",
      { error: stagesError },
    );
  }
  const displayNameMap = new Map(
    stagesData?.map((s) => [s.slug, s.display_name]) || [],
  );

  for (const rule of rules) {
    if (criticalError) break;

    if (rule.type === "document" || rule.type === "feedback" || rule.type === "header_context") {
      if (!rule.slug) {
        console.warn("[gatherInputsForStage] Skipping rule due to missing slug:", rule);
        continue;
      }
      const displayName = displayNameMap.get(rule.slug) ||
        (rule.slug.charAt(0).toUpperCase() + rule.slug.slice(1));

      if (rule.type === "document") {
        // Query dialectic_project_resources for finished rendered documents
        console.info(
          `[gatherInputsForStage] Querying dialectic_project_resources for rendered document`,
          { stage: rule.slug, document_key: rule.document_key, session_id: session.id, iteration_number: iterationNumber },
        );

        const resourcesQuery = dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("resource_type", "rendered_document")
          .eq("session_id", session.id)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rule.slug);

        const { data: resources, error: resourcesError } = await resourcesQuery;

        if (resourcesError) {
          console.error(
            `[gatherInputsForStage] Failed to query dialectic_project_resources.`,
            { error: resourcesError, rule, projectId: project.id },
          );
          if (rule.required !== false) {
            criticalError = new Error(
              `Failed to query REQUIRED rendered documents from dialectic_project_resources for stage '${displayName}'. Database query failed: ${resourcesError.message}`,
            );
            break;
          }
          continue;
        }

        // Filter resources by document_key if provided
        let matchingResources = resources || [];
        if (rule.document_key && matchingResources.length > 0) {
          matchingResources = matchingResources.filter((resource) => {
            if (!resource.file_name || !resource.storage_path) {
              return false;
            }
            const deconstructed = deconstructStoragePath({
              storageDir: resource.storage_path,
              fileName: resource.file_name,
            });
            const extractedDocumentKey = deconstructed.documentKey;
            return extractedDocumentKey === rule.document_key;
          });
        }

        if (matchingResources.length > 0) {
          // Use the latest version of the resource (sort by updated_at descending, take first)
          const latestResource = matchingResources.sort((a, b) => {
            const aTime = new Date(a.updated_at).getTime();
            const bTime = new Date(b.updated_at).getTime();
            return bTime - aTime;
          })[0];

          console.info(
            `[gatherInputsForStage] Found rendered document in dialectic_project_resources`,
            { resource_id: latestResource.id, file_name: latestResource.file_name, stage: rule.slug },
          );

          if (latestResource.storage_path && latestResource.storage_bucket && latestResource.file_name) {
            // Extract model slug from file_name - all valid rendered documents have parseable file_names
            // because they are constructed by document_renderer from parsed contribution file_names
            // Format: {modelSlug}_{attemptCount}_{documentKey}.md
            let modelName: string | undefined = undefined;
            const pathInfo = deconstructStoragePath({
              storageDir: latestResource.storage_path,
              fileName: latestResource.file_name,
            });
            
            if (pathInfo.modelSlug) {
              // Use model slug from deconstructStoragePath if available
              modelName = pathInfo.modelSlug;
            } else if (latestResource.file_name) {
              // Fallback: extract model slug directly from file_name
              // Pattern: {modelSlug}_{attemptCount}_{documentKey}.md
              const fileNameWithoutExt = latestResource.file_name.replace(/\.(md|json)$/, '');
              const parts = fileNameWithoutExt.split('_');
              if (parts.length >= 2) {
                // First part is the model slug
                modelName = parts[0];
              }
            }

            const pathToDownload = `${latestResource.storage_path}/${latestResource.file_name}`;
            const { data: content, error: downloadError } =
              await downloadFromStorageFn(latestResource.storage_bucket, pathToDownload);

            if (content && !downloadError) {
              const decodedContent = new TextDecoder("utf-8").decode(content);
              const metadata: {
                displayName: string;
                header?: string;
                modelName?: string;
              } = {
                displayName: displayName,
                header: rule.section_header,
              };
              if (modelName) {
                metadata.modelName = modelName;
              }
              gatheredContext.sourceDocuments.push({
                id: latestResource.id,
                type: "document",
                content: decodedContent,
                metadata,
              });
            } else {
              console.error(
                `[gatherInputsForStage] Failed to download rendered document from resources.`,
                { path: pathToDownload, error: downloadError, resource_id: latestResource.id },
              );
              if (rule.required !== false) {
                criticalError = new Error(
                  `Failed to download REQUIRED rendered document ${latestResource.id} from stage '${displayName}'.`,
                );
                break;
              }
            }
          } else {
            console.error(
              `[gatherInputsForStage] Resource ${latestResource.id} is missing storage details.`,
              { resource: latestResource },
            );
            if (rule.required !== false) {
              criticalError = new Error(
                `REQUIRED Resource ${latestResource.id} from stage '${displayName}' is missing storage details.`,
              );
              break;
            }
          }
        } else {
          // No resources found
          console.warn(
            `[gatherInputsForStage] No rendered documents found in dialectic_project_resources`,
            { stage: rule.slug, document_key: rule.document_key, session_id: session.id, iteration_number: iterationNumber },
          );

          if (rule.required !== false) {
            const documentKeyStr = rule.document_key || "unspecified";
            criticalError = new Error(
              `Required rendered document for stage '${displayName}' with document_key '${documentKeyStr}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
            );
            break;
          }
        }
        if (criticalError) break;
      } else if (rule.type === "feedback") {
        const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1;
        const { data: feedbackRecord, error: feedbackError } = await dbClient
          .from("dialectic_feedback")
          .select("id, storage_bucket, storage_path, file_name")
          .eq("session_id", session.id)
          .eq("stage_slug", rule.slug)
          .eq("iteration_number", targetIteration)
          .eq("user_id", project.user_id)
          .limit(1)
          .single();

        if (feedbackError || !feedbackRecord) {
          if (rule.required !== false) {
            criticalError = new Error(
              `Required feedback for stage '${displayName}' was not found.`,
            );
            break;
          }
          continue;
        }

        const feedbackPath =
          `${feedbackRecord.storage_path}/${feedbackRecord.file_name}`;
        const { data: feedbackContent, error: feedbackDownloadError } =
          await downloadFromStorageFn(
            feedbackRecord.storage_bucket,
            feedbackPath,
          );

        if (feedbackContent && !feedbackDownloadError) {
          const content = new TextDecoder().decode(feedbackContent);
          gatheredContext.sourceDocuments.push({
            id: feedbackRecord.id,
            type: "feedback",
            content: content,
            metadata: {
              displayName: displayName,
              header: rule.section_header,
            },
          });
        } else {
          if (rule.required !== false) {
            criticalError = new Error(
              `Failed to download REQUIRED feedback for stage '${displayName}'.`,
            );
            break;
          }
        }
      } else if (rule.type === "header_context") {
        // Query dialectic_contributions for header_context type inputs
        console.info(
          `[gatherInputsForStage] Querying dialectic_contributions for header_context`,
          { stage: rule.slug, session_id: session.id, iteration_number: iterationNumber },
        );

        let contributionQuery = dbClient
          .from("dialectic_contributions")
          .select("*")
          .eq("session_id", session.id)
          .eq("iteration_number", iterationNumber)
          .eq("is_latest_edit", true)
          .eq("contribution_type", "header_context");

        if (rule.slug) {
          contributionQuery = contributionQuery.eq("stage", rule.slug);
        }

        if (rule.document_key) {
          contributionQuery = contributionQuery.ilike("file_name", `%${rule.document_key}%`);
        }

        const { data: headerContributions, error: contributionsError } = await contributionQuery;

        if (contributionsError) {
          console.error(
            `[gatherInputsForStage] Failed to query dialectic_contributions for header_context.`,
            { error: contributionsError, rule, projectId: project.id },
          );
          if (rule.required !== false) {
            criticalError = new Error(
              `Failed to query REQUIRED header_context from dialectic_contributions for stage '${displayName}'. Database query failed: ${contributionsError.message}`,
            );
            break;
          }
          continue;
        }

        if (headerContributions && headerContributions.length > 0) {
          // Use the latest version (sort by updated_at descending, take first)
          const latestContribution = headerContributions.sort((a, b) => {
            const aTime = new Date(a.updated_at).getTime();
            const bTime = new Date(b.updated_at).getTime();
            return bTime - aTime;
          })[0];

          console.info(
            `[gatherInputsForStage] Found header_context in dialectic_contributions`,
            { contribution_id: latestContribution.id, file_name: latestContribution.file_name, stage: rule.slug },
          );

          if (latestContribution.storage_path && latestContribution.storage_bucket && latestContribution.file_name) {
            const pathToDownload = `${latestContribution.storage_path}/${latestContribution.file_name}`;
            const { data: content, error: downloadError } =
              await downloadFromStorageFn(latestContribution.storage_bucket, pathToDownload);

            if (content && !downloadError) {
              const decodedContent = new TextDecoder("utf-8").decode(content);
              const metadata: {
                displayName: string;
                header?: string;
                modelName?: string;
              } = {
                displayName: displayName,
                header: rule.section_header,
              };
              if (latestContribution.model_name && typeof latestContribution.model_name === "string") {
                metadata.modelName = latestContribution.model_name;
              }
              gatheredContext.sourceDocuments.push({
                id: latestContribution.id,
                type: "header_context",
                content: decodedContent,
                metadata,
              });
            } else {
              console.error(
                `[gatherInputsForStage] Failed to download header_context from contributions.`,
                { path: pathToDownload, error: downloadError, contribution_id: latestContribution.id },
              );
              if (rule.required !== false) {
                criticalError = new Error(
                  `Failed to download REQUIRED header_context ${latestContribution.id} from stage '${displayName}'.`,
                );
                break;
              }
            }
          } else {
            console.error(
              `[gatherInputsForStage] Contribution ${latestContribution.id} is missing storage details.`,
              { contribution: latestContribution },
            );
            if (rule.required !== false) {
              criticalError = new Error(
                `REQUIRED Contribution ${latestContribution.id} from stage '${displayName}' is missing storage details.`,
              );
              break;
            }
          }
        } else {
          // No contributions found
          console.warn(
            `[gatherInputsForStage] No header_context found in dialectic_contributions`,
            { stage: rule.slug, session_id: session.id, iteration_number: iterationNumber },
          );

          if (rule.required !== false) {
            criticalError = new Error(
              `Required header_context for stage '${displayName}' was not found in dialectic_contributions. This indicates the header_context was not generated or the generation step failed.`,
            );
            break;
          }
        }
        if (criticalError) break;
      }
    }
  }

  if (criticalError) {
    throw criticalError;
  }

  return gatheredContext;
}
