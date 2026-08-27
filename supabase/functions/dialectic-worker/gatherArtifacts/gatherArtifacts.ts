import type {
  DialecticContributionRow,
  DialecticFeedbackRow,
  DialecticProjectResourceRow,
  InputRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type { ResourceDocuments } from "../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts";
import { deconstructStoragePath } from "../../_shared/utils/path_deconstructor.ts";
import type {
  GatherArtifactsErrorReturn,
  GatherArtifactsFn,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";
import { isApplyCompressionOverlaySuccessReturn } from "../applyCompressionOverlay/applyCompressionOverlay.provides.ts";

export const gatherArtifacts: GatherArtifactsFn = async (
  deps,
  params,
  payload,
) => {
  const { dbClient, projectId, sessionId, iterationNumber, stageSlug, output_type } = params;
  const rules: InputRule[] = payload.inputsRequired ?? [];

  if (rules.length === 0) {
    const successEmpty: GatherArtifactsSuccessReturn = { artifacts: [] };
    return successEmpty;
  }

  const gathered: Required<ResourceDocuments[number]>[] = [];

  for (const rule of rules) {
    if (!rule.document_key) {
      continue;
    }

    try {
      if (rule.type === "document") {
        deps.logger.info(
          `[gatherArtifacts] Querying dialectic_project_resources for document input rule: type='${rule.type}', stage='${rule.slug}', document_key='${rule.document_key}'`,
        );
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rule.slug)
          .eq("resource_type", "rendered_document");

        if (error) {
          deps.logger.error(
            `[gatherArtifacts] Error querying dialectic_project_resources for document input rule: type='${rule.type}', stage='${rule.slug}', document_key='${rule.document_key}'`,
            { error },
          );
          if (rule.required === false) {
            deps.logger.info(
              `[gatherArtifacts] Error querying optional document input rule: type='${rule.type}', stage='${rule.slug}', document_key='${rule.document_key}'. Skipping optional input.`,
            );
            continue;
          }
          return { error, retriable: false };
        }

        if (!Array.isArray(data) || data.length === 0) {
          deps.logger.warn(
            `[gatherArtifacts] No resources found in dialectic_project_resources for document input rule: type='${rule.type}', stage='${rule.slug}', document_key='${rule.document_key}'`,
          );
          if (rule.required === false) {
            deps.logger.info(
              `[gatherArtifacts] No rendered documents found for optional input rule type 'document' with stage '${rule.slug}' and document_key '${rule.document_key}'. Skipping optional input.`,
            );
            continue;
          }
          return {
            error: new Error(
              `Required rendered document for input rule type 'document' with stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
            ),
            retriable: false,
          };
        }

        const filtered: DialecticProjectResourceRow[] = data.filter(
          (row: DialecticProjectResourceRow) => {
            const parsed = deconstructStoragePath({
              storageDir: row.storage_path,
              fileName: row.file_name,
              dbOriginalFileName: row.file_name,
            });
            return row.stage_slug === rule.slug && parsed.documentKey === rule.document_key;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required rendered document for input rule type 'document' with stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_project_resources.`,
            ),
            retriable: false,
          };
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(filtered);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error) {
          if (rule.required === false) {
            continue;
          }
          return { error: downloadResult.error, retriable: false };
        }
        if (!downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Failed to download content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
            retriable: false,
          };
        }
        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rule.document_key,
          stage_slug: rule.slug,
          type: "document",
        });
      }

      if (rule.type === "feedback") {
        deps.logger.info(
          `[gatherArtifacts] Querying dialectic_feedback for feedback input rule: stage='${rule.slug}', document_key='${rule.document_key}'`,
        );
        const { data, error } = await dbClient
          .from("dialectic_feedback")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rule.slug);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return { error, retriable: false };
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required feedback for stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_feedback.`,
            ),
            retriable: false,
          };
        }

        const filtered: DialecticFeedbackRow[] = data.filter(
          (row: DialecticFeedbackRow) => {
            if (row.stage_slug !== rule.slug) return false;
            const feedbackSuffix = "_feedback.md";
            if (row.file_name.endsWith(feedbackSuffix)) {
              const baseName = row.file_name.slice(0, -feedbackSuffix.length) + ".md";
              const parsed = deconstructStoragePath({
                storageDir: row.storage_path,
                fileName: baseName,
                dbOriginalFileName: baseName,
              });
              return parsed.documentKey === rule.document_key;
            }
            return false;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required feedback for stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_feedback.`,
            ),
            retriable: false,
          };
        }

        const latest: DialecticFeedbackRow = deps.pickLatest(filtered);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error) {
          if (rule.required === false) {
            continue;
          }
          return { error: downloadResult.error, retriable: false };
        }
        if (!downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Failed to download feedback content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
            retriable: false,
          };
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rule.document_key,
          stage_slug: latest.stage_slug,
          type: "feedback",
        });
      }

      if (rule.type === "seed_prompt") {
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rule.slug)
          .eq("resource_type", "seed_prompt");

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return { error, retriable: false };
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required seed_prompt for stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_project_resources.`,
            ),
            retriable: false,
          };
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(data);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error) {
          if (rule.required === false) {
            continue;
          }
          return { error: downloadResult.error, retriable: false };
        }
        if (!downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Failed to download seed_prompt content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
            retriable: false,
          };
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rule.document_key,
          stage_slug: rule.slug,
          type: "seed_prompt",
        });
      }

      if (rule.type === "project_resource") {
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("resource_type", rule.document_key);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return { error, retriable: false };
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required project_resource for document_key '${rule.document_key}' was not found in dialectic_project_resources.`,
            ),
            retriable: false,
          };
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(data);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error) {
          if (rule.required === false) {
            continue;
          }
          return { error: downloadResult.error, retriable: false };
        }
        if (!downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Failed to download project_resource content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
            retriable: false,
          };
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rule.document_key,
          stage_slug: rule.slug,
          type: "project_resource",
        });
      } else if (
        rule.type === "header_context" ||
        (rule.type !== "document" && rule.type !== "feedback" && rule.type !== "seed_prompt")
      ) {
        const { data, error } = await dbClient
          .from("dialectic_contributions")
          .select("*")
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage", rule.slug);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return { error, retriable: false };
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required ${rule.type} for stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_contributions.`,
            ),
            retriable: false,
          };
        }

        const filtered: DialecticContributionRow[] = data.filter(
          (row: DialecticContributionRow) => {
            if (!row.file_name) {
              return false;
            }
            const parsed = deconstructStoragePath({
              storageDir: row.storage_path,
              fileName: row.file_name,
              dbOriginalFileName: row.file_name,
            });
            return row.stage === rule.slug && parsed.documentKey === rule.document_key;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Required ${rule.type} for stage '${rule.slug}' and document_key '${rule.document_key}' was not found in dialectic_contributions.`,
            ),
            retriable: false,
          };
        }

        const latest: DialecticContributionRow = deps.pickLatest(filtered);
        if (!latest.file_name) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Contribution row '${latest.id}' has null file_name — data integrity violation.`,
            ),
            retriable: false,
          };
        }

        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error) {
          if (rule.required === false) {
            continue;
          }
          return { error: downloadResult.error, retriable: false };
        }
        if (!downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return {
            error: new Error(
              `Failed to download ${rule.type} content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
            retriable: false,
          };
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rule.document_key,
          stage_slug: latest.stage,
          type: rule.type,
        });
      }
    } catch (error) {
      if (rule.required === false) {
        deps.logger.info(
          `[gatherArtifacts] Error processing optional input rule type='${rule.type}', stage='${rule.slug}', document_key='${rule.document_key}'. Skipping.`,
          { error },
        );
        continue;
      }
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        retriable: false,
      };
    }
  }

  const uniqueById = new Map<string, Required<ResourceDocuments[number]>>();
  for (const artifact of gathered) {
    if (!uniqueById.has(artifact.id)) {
      uniqueById.set(artifact.id, artifact);
    }
  }

  const overlayResult = await deps.applyCompressionOverlay(
    params,
    { resourceDocuments: Array.from(uniqueById.values()), conversationHistory: [] },
  );
  if (!isApplyCompressionOverlaySuccessReturn(overlayResult)) {
    return { error: overlayResult.error, retriable: overlayResult.retriable };
  }

  const success: GatherArtifactsSuccessReturn = {
    artifacts: overlayResult.resourceDocuments,
  };
  return success;
};
