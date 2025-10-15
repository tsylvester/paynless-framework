import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Database } from "../../types_db.ts";
import {
  DialecticContributionRow,
  InputRule,
} from "../../dialectic-service/dialectic.interface.ts";
import {
  ProjectContext,
  SessionContext,
  StageContext,
  AssemblerSourceDocument,
} from "./prompt-assembler.interface.ts";
import type { DownloadStorageResult } from "../supabase_storage_utils.ts";
import { parseInputArtifactRules } from "../utils/input-artifact-parser.ts";

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
) => Promise<AssemblerSourceDocument[]>;

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
): Promise<AssemblerSourceDocument[]> {
  const sourceDocuments: AssemblerSourceDocument[] = [];
  let criticalError: Error | null = null;

  if (
    !stage.recipe_step || !stage.recipe_step.inputs_required ||
    stage.recipe_step.inputs_required.length === 0
  ) {
    console.info(
      "[gatherInputsForStage] No input rules defined for stage:",
      stage.slug,
    );
    return sourceDocuments;
  }

  const rules: InputRule[] = parseInputArtifactRules(
    stage.recipe_step.inputs_required,
  );

  const stageSpecificRules = rules.filter(
    (rule: InputRule): rule is Extract<InputRule, {
      type: "document" | "feedback";
    }> => rule.type === "document" || rule.type === "feedback",
  );

  const stageSlugsForDisplayName = stageSpecificRules
    .map((rule: { stage_slug: string }) => rule.stage_slug)
    .filter(
      (slug: string, index: number, self: string[]) => self.indexOf(slug) === index,
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

    if (rule.type === "document" || rule.type === "feedback") {
      if (!rule.stage_slug) {
        console.warn("[gatherInputsForStage] Skipping rule due to missing stage_slug:", rule);
        continue;
      }
      const displayName = displayNameMap.get(rule.stage_slug) ||
        (rule.stage_slug.charAt(0).toUpperCase() + rule.stage_slug.slice(1));

      if (rule.type === "document") {
        const { data: aiContributions, error: aiContribError } = await dbClient
          .from("dialectic_contributions")
          .select("*")
          .eq("session_id", session.id)
          .eq("iteration_number", iterationNumber)
          .eq("stage", rule.stage_slug)
          .eq("is_latest_edit", true);

        if (aiContribError) {
          console.error(
            `[gatherInputsForStage] Failed to retrieve AI contributions.`,
            { error: aiContribError, rule, projectId: project.id },
          );
          if (rule.required !== false) {
            criticalError = new Error(
              `Failed to retrieve REQUIRED AI contributions for stage '${displayName}'.`,
            );
            break;
          }
          continue;
        }

        if (
          (!aiContributions || aiContributions.length === 0) &&
          rule.required !== false
        ) {
          criticalError = new Error(
            `Required contributions for stage '${displayName}' were not found.`,
          );
          break;
        }

        const typedAiContributions: DialecticContributionRow[] =
          aiContributions || [];
        for (const contrib of typedAiContributions) {
          if (criticalError) break;

          if (contrib.storage_path && contrib.storage_bucket) {
            const fileName = contrib.file_name || "";
            const pathToDownload = fileName
              ? `${contrib.storage_path}/${fileName}`
              : contrib.storage_path;
            const { data: content, error: downloadError } =
              await downloadFromStorageFn(contrib.storage_bucket, pathToDownload);

            if (content && !downloadError) {
              const decodedContent = new TextDecoder("utf-8").decode(content);
              sourceDocuments.push({
                id: contrib.id,
                type: "document",
                content: decodedContent,
                metadata: {
                  displayName: displayName,
                  modelName: contrib.model_name || "AI Model",
                  header: rule.section_header,
                },
              });
            } else {
              console.error(
                `[gatherInputsForStage] Failed to download contribution file.`,
                { path: pathToDownload, error: downloadError },
              );
              if (rule.required !== false) {
                criticalError = new Error(
                  `Failed to download REQUIRED content for contribution ${contrib.id} from stage '${displayName}'.`,
                );
                break;
              }
            }
          } else {
            console.warn(
              `[gatherInputsForStage] Contribution ${contrib.id} is missing storage details.`,
            );
            if (rule.required !== false) {
              criticalError = new Error(
                `REQUIRED Contribution ${contrib.id} from stage '${displayName}' is missing storage details.`,
              );
              break;
            }
          }
        }
        if (criticalError) break;
      } else if (rule.type === "feedback") {
        const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1;
        const { data: feedbackRecord, error: feedbackError } = await dbClient
          .from("dialectic_feedback")
          .select("id, storage_bucket, storage_path, file_name")
          .eq("session_id", session.id)
          .eq("stage_slug", rule.stage_slug)
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
          sourceDocuments.push({
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
      }
    }
  }

  if (criticalError) {
    throw criticalError;
  }

  return sourceDocuments;
}
