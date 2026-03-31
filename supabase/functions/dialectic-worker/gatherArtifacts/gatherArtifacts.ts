import type {
  DialecticContributionRow,
  DialecticFeedbackRow,
  DialecticProjectResourceRow,
  InputRule,
} from "../../dialectic-service/dialectic.interface.ts";
import type { ResourceDocuments } from "../../_shared/types.ts";
import { deconstructStoragePath } from "../../_shared/utils/path_deconstructor.ts";
import type {
  GatherArtifactsErrorReturn,
  GatherArtifactsFn,
  GatherArtifactsSuccessReturn,
} from "./gatherArtifacts.interface.ts";

function toErrorReturn(error: unknown): GatherArtifactsErrorReturn {
  if (error instanceof Error) {
    return { error, retriable: false };
  }
  return { error: new Error(String(error)), retriable: false };
}

export const gatherArtifacts: GatherArtifactsFn = async (
  deps,
  params,
  payload,
) => {
  const { dbClient, projectId, sessionId, iterationNumber } = params;
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

    const rType: InputRule["type"] = rule.type;
    const rStage: string = rule.slug;
    const rKey: string = rule.document_key;

    try {
      if (rType === "document") {
        deps.logger.info(
          `[gatherArtifacts] Querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`,
        );
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rStage)
          .eq("resource_type", "rendered_document");

        if (error) {
          deps.logger.error(
            `[gatherArtifacts] Error querying dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`,
            { error },
          );
          if (rule.required === false) {
            deps.logger.info(
              `[gatherArtifacts] Error querying optional document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping optional input.`,
            );
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
            ),
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          deps.logger.warn(
            `[gatherArtifacts] No resources found in dialectic_project_resources for document input rule: type='${rType}', stage='${rStage}', document_key='${rKey}'`,
          );
          if (rule.required === false) {
            deps.logger.info(
              `[gatherArtifacts] No rendered documents found for optional input rule type 'document' with stage '${rStage}' and document_key '${rKey}'. Skipping optional input.`,
            );
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources. This indicates the document was not rendered or the rendering step failed.`,
            ),
          );
        }

        const filtered: DialecticProjectResourceRow[] = data.filter(
          (row: DialecticProjectResourceRow) => {
            const parsed = deconstructStoragePath({
              storageDir: row.storage_path,
              fileName: row.file_name,
              dbOriginalFileName: row.file_name,
            });
            return row.stage_slug === rStage && parsed.documentKey === rKey;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required rendered document for input rule type 'document' with stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`,
            ),
          );
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(filtered);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error || !downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Failed to download content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
          );
        }
        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rKey,
          stage_slug: rStage,
          type: "document",
        });
      }

      if (rType === "feedback") {
        deps.logger.info(
          `[gatherArtifacts] Querying dialectic_feedback for feedback input rule: stage='${rStage}', document_key='${rKey}'`,
        );
        const { data, error } = await dbClient
          .from("dialectic_feedback")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rStage);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required feedback for stage '${rStage}' and document_key '${rKey}' query failed.`,
            ),
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required feedback for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_feedback.`,
            ),
          );
        }

        const filtered: DialecticFeedbackRow[] = data.filter(
          (row: DialecticFeedbackRow) => {
            const parsed = deconstructStoragePath({
              storageDir: row.storage_path,
              fileName: row.file_name,
              dbOriginalFileName: row.file_name,
            });
            return row.stage_slug === rStage && parsed.documentKey === rKey;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required feedback for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_feedback.`,
            ),
          );
        }

        const latest: DialecticFeedbackRow = deps.pickLatest(filtered);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error || !downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Failed to download feedback content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
          );
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rKey,
          stage_slug: latest.stage_slug,
          type: "feedback",
        });
      }

      if (rType === "seed_prompt") {
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage_slug", rStage)
          .eq("resource_type", "seed_prompt");

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required seed_prompt for stage '${rStage}' and document_key '${rKey}' query failed.`,
            ),
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required seed_prompt for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_project_resources.`,
            ),
          );
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(data);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error || !downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Failed to download seed_prompt content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
          );
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rKey,
          stage_slug: rStage,
          type: "seed_prompt",
        });
      }

      if (rType === "project_resource") {
        const isInitialUserPrompt: boolean = rKey === "initial_user_prompt";
        const resourceTypeForQuery: string = isInitialUserPrompt
          ? "initial_user_prompt"
          : "project_resource";
        const { data, error } = await dbClient
          .from("dialectic_project_resources")
          .select("*")
          .eq("project_id", projectId)
          .eq("resource_type", resourceTypeForQuery);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required project_resource for document_key '${rKey}' query failed.`,
            ),
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required project_resource for document_key '${rKey}' was not found in dialectic_project_resources.`,
            ),
          );
        }

        const latest: DialecticProjectResourceRow = deps.pickLatest(data);
        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error || !downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Failed to download project_resource content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
          );
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rKey,
          stage_slug: rStage,
          type: "project_resource",
        });
      } else if (
        rType === "header_context" ||
        (rType !== "document" && rType !== "feedback" && rType !== "seed_prompt")
      ) {
        const { data, error } = await dbClient
          .from("dialectic_contributions")
          .select("*")
          .eq("session_id", sessionId)
          .eq("iteration_number", iterationNumber)
          .eq("stage", rStage);

        if (error) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required ${rType} for stage '${rStage}' and document_key '${rKey}' query failed.`,
            ),
          );
        }

        if (!Array.isArray(data) || data.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required ${rType} for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_contributions.`,
            ),
          );
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
            return row.stage === rStage && parsed.documentKey === rKey;
          },
        );

        if (filtered.length === 0) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Required ${rType} for stage '${rStage}' and document_key '${rKey}' was not found in dialectic_contributions.`,
            ),
          );
        }

        const latest: DialecticContributionRow = deps.pickLatest(filtered);
        if (!latest.file_name) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Contribution row '${latest.id}' has null file_name — data integrity violation.`,
            ),
          );
        }

        const downloadResult = await deps.downloadFromStorage(
          dbClient,
          latest.storage_bucket,
          `${latest.storage_path}/${latest.file_name}`,
        );
        if (downloadResult.error || !downloadResult.data) {
          if (rule.required === false) {
            continue;
          }
          return toErrorReturn(
            new Error(
              `Failed to download ${rType} content from storage: bucket='${latest.storage_bucket}', path='${latest.storage_path}/${latest.file_name}'`,
            ),
          );
        }

        const content: string = new TextDecoder().decode(downloadResult.data);
        gathered.push({
          id: latest.id,
          content,
          document_key: rKey,
          stage_slug: latest.stage,
          type: rType,
        });
      }
    } catch (error) {
      if (rule.required === false) {
        deps.logger.info(
          `[gatherArtifacts] Error processing optional input rule type='${rType}', stage='${rStage}', document_key='${rKey}'. Skipping.`,
          { error },
        );
        continue;
      }
      return toErrorReturn(error);
    }
  }

  const uniqueById = new Map<string, Required<ResourceDocuments[number]>>();
  for (const artifact of gathered) {
    if (!uniqueById.has(artifact.id)) {
      uniqueById.set(artifact.id, artifact);
    }
  }

  const success: GatherArtifactsSuccessReturn = {
    artifacts: Array.from(uniqueById.values()),
  };
  return success;
};
