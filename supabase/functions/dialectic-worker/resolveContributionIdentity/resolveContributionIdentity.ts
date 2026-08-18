import type {
  ResolveContributionIdentityDeps,
  ResolveContributionIdentityFn,
  ResolveContributionIdentityParams,
  ResolveContributionIdentityPayload,
  ResolveContributionIdentityReturn,
  ResolveContributionIdentitySuccessReturn,
} from "./resolveContributionIdentity.interface.ts";
import {
  ResolveContributionIdentityDocumentKeyError,
  ResolveContributionIdentityProviderIdentifierError,
  ResolveContributionIdentityRelationshipsError,
  ResolveContributionIdentityContinuationCountError,
  ResolveContributionIdentityRawProviderResponseError,
  ResolveContributionIdentitySourceGroupError,
  ResolveContributionIdentityRecipeStepReadError,
} from "./resolveContributionIdentity.interface.ts";
import type {
  CanonicalPathParams,
  ModelContributionFileTypes,
} from "../../_shared/types/file_manager.types.ts";
import { FileType } from "../../_shared/types/file_manager.types.ts";
import { isDocumentKey, isDocumentRelated } from "../../_shared/utils/type-guards/type_guards.file_manager.ts";
import { isJson } from "../../_shared/utils/type_guards.ts";
import { extractSourceGroupFragment } from "../../_shared/utils/path_utils.ts";

export const resolveContributionIdentity: ResolveContributionIdentityFn = async (
  deps: ResolveContributionIdentityDeps,
  params: ResolveContributionIdentityParams,
  payload: ResolveContributionIdentityPayload,
): Promise<ResolveContributionIdentityReturn> => {
  const jobId: string = params.job.id;

  // Description — spec L2101
  const description: string =
    `${payload.output_type} for stage '${payload.stageSlug}' by model ${params.providerRow.name}`;

  // Canonical assembly — spec L2102. Copy, not carry by reference (L2121).
  const restOfCanonicalPathParams: CanonicalPathParams = {
    contributionType: payload.canonicalPathParams.contributionType,
    stageSlug: payload.canonicalPathParams.stageSlug,
  };
  if (payload.canonicalPathParams.sourceModelSlugs !== undefined) {
    restOfCanonicalPathParams.sourceModelSlugs = payload.canonicalPathParams.sourceModelSlugs;
  }
  if (payload.canonicalPathParams.sourceAnchorType !== undefined) {
    restOfCanonicalPathParams.sourceAnchorType = payload.canonicalPathParams.sourceAnchorType;
  }
  if (payload.canonicalPathParams.sourceAnchorModelSlug !== undefined) {
    restOfCanonicalPathParams.sourceAnchorModelSlug = payload.canonicalPathParams.sourceAnchorModelSlug;
  }
  if (payload.canonicalPathParams.sourceAttemptCount !== undefined) {
    restOfCanonicalPathParams.sourceAttemptCount = payload.canonicalPathParams.sourceAttemptCount;
  }
  if (payload.canonicalPathParams.pairedModelSlug !== undefined) {
    restOfCanonicalPathParams.pairedModelSlug = payload.canonicalPathParams.pairedModelSlug;
  }

  // Anchor log — spec L2103. No outcome of its own; execution continues.
  if (restOfCanonicalPathParams.sourceAnchorModelSlug !== undefined) {
    deps.logger.info(
      "[resolveContributionIdentity] sourceAnchorModelSlug present in canonicalPathParams, will propagate to pathContext for antithesis pattern detection",
      {
        sourceAnchorModelSlug: restOfCanonicalPathParams.sourceAnchorModelSlug,
        stageSlug: restOfCanonicalPathParams.stageSlug,
        outputType: payload.output_type,
      },
    );
  }

  // Target resolution — spec L2104
  let targetContributionId = payload.target_contribution_id;
  if (targetContributionId === undefined || targetContributionId.length === 0) {
    const rowTarget = params.job.target_contribution_id;
    if (rowTarget !== null && rowTarget.length > 0) {
      targetContributionId = rowTarget;
    } else {
      targetContributionId = undefined;
    }
  }
  const isContinuationForStorage: boolean =
    targetContributionId !== undefined && targetContributionId.trim() !== "";

  // Continuation invariants — spec L2105, L2106
  if (isContinuationForStorage && targetContributionId !== undefined) {
    if (payload.document_relationships === undefined || payload.document_relationships === null) {
      return {
        error: new ResolveContributionIdentityRelationshipsError({ jobId, targetContributionId }),
        retriable: false,
      };
    }
    if (payload.continuation_count === undefined || !(payload.continuation_count > 0)) {
      return {
        error: new ResolveContributionIdentityContinuationCountError({ jobId, targetContributionId }),
        retriable: false,
      };
    }
  }

  // Raw provider precondition — spec L2107
  const rawProviderResponse = params.aiResponse.rawProviderResponse;
  if (rawProviderResponse === undefined || !isJson(rawProviderResponse)) {
    return {
      error: new ResolveContributionIdentityRawProviderResponseError({ jobId }),
      retriable: false,
    };
  }

  // Document invariants — spec L2108, L2109
  const outputType: ModelContributionFileTypes = payload.output_type;
  if (isDocumentRelated(outputType)) {
    const documentKey = payload.document_key;
    if (documentKey === undefined || documentKey === null || documentKey.trim() === "") {
      return {
        error: new ResolveContributionIdentityDocumentKeyError({ jobId }),
        retriable: false,
      };
    }
    if (params.providerRow.api_identifier.trim() === "") {
      return {
        error: new ResolveContributionIdentityProviderIdentifierError({
          jobId,
          providerId: params.providerRow.id,
        }),
        retriable: false,
      };
    }
  }

  // Storage selection — spec L2110
  let storageFileType: ModelContributionFileTypes;
  if (isDocumentKey(outputType)) {
    storageFileType = FileType.ModelContributionRawJson;
  } else {
    storageFileType = outputType;
  }

  // Source group resolution — spec L2111
  const relationships = payload.document_relationships;
  const sourceGroupRaw = relationships?.source_group;

  // Source group absent branches — spec L2112, L2113
  if (isDocumentRelated(outputType) && typeof sourceGroupRaw !== "string") {
    if (sourceGroupRaw !== null) {
      return {
        error: new ResolveContributionIdentitySourceGroupError({ jobId, outputType }),
        retriable: false,
      };
    }
    // source_group is explicitly null — check for recipe_step_id exemption
    const plannerMetadata = payload.planner_metadata;
    const recipeStepId = plannerMetadata?.recipe_step_id;
    if (recipeStepId === undefined) {
      return {
        error: new ResolveContributionIdentitySourceGroupError({ jobId, outputType }),
        retriable: false,
      };
    }

    // Exemption read — spec L2114
    const { data: stageData, error: stageError } = await params.dbClient
      .from("dialectic_stage_recipe_steps")
      .select("granularity_strategy")
      .eq("id", recipeStepId)
      .maybeSingle();

    // Driver error on stage table — spec L2115. Template table not consulted.
    if (stageError !== null) {
      return {
        error: new ResolveContributionIdentityRecipeStepReadError({
          recipeStepId,
          table: "dialectic_stage_recipe_steps",
          driverMessage: stageError.message,
        }),
        retriable: true,
      };
    }

    // Stage row found — spec L2117, L2118
    if (stageData !== null) {
      if (stageData.granularity_strategy !== "per_model") {
        return {
          error: new ResolveContributionIdentitySourceGroupError({ jobId, outputType }),
          retriable: false,
        };
      }
      // per_model admitted — fall through to success
    } else {
      // No row on stage table — spec L2116. Read template table.
      const { data: templateData, error: templateError } = await params.dbClient
        .from("dialectic_recipe_template_steps")
        .select("granularity_strategy")
        .eq("id", recipeStepId)
        .maybeSingle();

      if (templateError !== null) {
        return {
          error: new ResolveContributionIdentityRecipeStepReadError({
            recipeStepId,
            table: "dialectic_recipe_template_steps",
            driverMessage: templateError.message,
          }),
          retriable: true,
        };
      }

      if (templateData !== null) {
        if (templateData.granularity_strategy !== "per_model") {
          return {
            error: new ResolveContributionIdentitySourceGroupError({ jobId, outputType }),
            retriable: false,
          };
        }
        // per_model admitted — fall through to success
      } else {
        return {
          error: new ResolveContributionIdentitySourceGroupError({ jobId, outputType }),
          retriable: false,
        };
      }
    }
  }

  // Fragment — spec L2119. Computed only when sourceGroup is a string.
  const successReturn: ResolveContributionIdentitySuccessReturn = {
    restOfCanonicalPathParams,
    storageFileType,
    isContinuationForStorage,
    description,
  };

  if (typeof sourceGroupRaw === "string") {
    const sourceGroupFragment = extractSourceGroupFragment(sourceGroupRaw);
    if (sourceGroupFragment !== undefined) {
      successReturn.sourceGroupFragment = sourceGroupFragment;
    }
  }

  if (targetContributionId !== undefined) {
    successReturn.targetContributionId = targetContributionId;
  }

  // Success — spec L2120
  return successReturn;
};
