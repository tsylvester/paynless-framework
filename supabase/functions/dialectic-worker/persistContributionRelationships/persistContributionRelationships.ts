import type {
	DialecticContributionRow,
	DocumentRelationships,
} from "../../dialectic-service/dialectic.interface.ts";
import { isRecord } from "../../_shared/utils/type-guards/type_guards.common.ts";
import {
	isContributionType,
	isDocumentRelationships,
} from "../../_shared/utils/type-guards/type_guards.dialectic.ts";
import {
	PersistContributionRelationshipsStageSlugMissingError,
	PersistContributionRelationshipsRelationshipsMissingError,
	PersistContributionRelationshipsUpdateError,
	PersistContributionRelationshipsStageEntryError,
	PersistContributionRelationshipsStageSlugTypeError,
	PersistContributionRelationshipsMergedEntryError,
	type PersistContributionRelationshipsFn,
} from "./persistContributionRelationships.interface.ts";

export const persistContributionRelationships: PersistContributionRelationshipsFn = async (_deps, params, payload) => {
	// Stage slug invariant
	if (payload.stageSlug === undefined || payload.stageSlug.trim() === "") {
		return {
			error: new PersistContributionRelationshipsStageSlugMissingError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
			}),
			retriable: false,
		};
	}
	const resolvedStageSlug: string = payload.stageSlug;

	// Continuation path
	if (params.isContinuationForStorage) {
		// Continuation relationships invariant
		if (payload.document_relationships === undefined || payload.document_relationships === null) {
			return {
				error: new PersistContributionRelationshipsRelationshipsMissingError({
					jobId: params.job.id,
					contributionId: params.contribution.id,
				}),
				retriable: false,
			};
		}

		// Continuation write
		const { error: relUpdateError } = await params.dbClient
			.from("dialectic_contributions")
			.update({ document_relationships: payload.document_relationships })
			.eq("id", params.contribution.id);

		if (relUpdateError) {
			return {
				error: new PersistContributionRelationshipsUpdateError({
					jobId: params.job.id,
					contributionId: params.contribution.id,
					stageSlug: resolvedStageSlug,
					driverMessage: relUpdateError.message,
				}),
				retriable: true,
			};
		}

		// Continuation verification
		const stageEntry = Object.entries(payload.document_relationships).find(([key]) => key === resolvedStageSlug);
		if (
			!stageEntry ||
			typeof stageEntry[1] !== "string" ||
			stageEntry[1].trim() === ""
		) {
			return {
				error: new PersistContributionRelationshipsStageEntryError({
					jobId: params.job.id,
					contributionId: params.contribution.id,
					stageSlug: resolvedStageSlug,
				}),
				retriable: false,
			};
		}

		// Continuation success
		const returnedContribution: DialecticContributionRow = {
			...params.contribution,
			document_relationships: payload.document_relationships,
		};
		return {
			persisted: true,
			contribution: returnedContribution,
		};
	}

	// Init decision
	const existing = params.contribution.document_relationships;
	if (isRecord(existing)) {
		const existingStageValue: unknown = existing[resolvedStageSlug];
		if (
			typeof existingStageValue === "string" &&
			existingStageValue.trim() !== "" &&
			existingStageValue === params.contribution.id
		) {
			// Unchanged flavor
			return {
				persisted: false,
				contribution: params.contribution,
			};
		}
	}

	// Merge assembly
	const merged: DocumentRelationships = {};

	if (isDocumentRelationships(existing)) {
		for (const [key, value] of Object.entries(existing)) {
			if (typeof value === "string") {
				if (isContributionType(key)) {
					merged[key] = value;
				} else if (key === "source_group") {
					merged.source_group = value;
				}
			}
		}
	}

	// Source group initialization
	if (payload.document_relationships !== undefined && payload.document_relationships !== null) {
		if (payload.document_relationships.source_group === null) {
			merged.source_group = params.contribution.id;
		}
	}

	// Stage key type check
	if (!isContributionType(resolvedStageSlug)) {
		return {
			error: new PersistContributionRelationshipsStageSlugTypeError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug: resolvedStageSlug,
			}),
			retriable: false,
		};
	}

	// Stage key assignment
	merged[resolvedStageSlug] = params.contribution.id;

	// Init write
	const { error: updateError } = await params.dbClient
		.from("dialectic_contributions")
		.update({ document_relationships: merged })
		.eq("id", params.contribution.id);

	if (updateError) {
		return {
			error: new PersistContributionRelationshipsUpdateError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug: resolvedStageSlug,
				driverMessage: updateError.message,
			}),
			retriable: true,
		};
	}

	// Merged verification
	const mergedStageValue = merged[resolvedStageSlug];
	if (
		typeof mergedStageValue !== "string" ||
		mergedStageValue.trim() === "" ||
		mergedStageValue !== params.contribution.id
	) {
		return {
			error: new PersistContributionRelationshipsMergedEntryError({
				jobId: params.job.id,
				contributionId: params.contribution.id,
				stageSlug: resolvedStageSlug,
			}),
			retriable: false,
		};
	}

	// Init success
	const returnedContribution: DialecticContributionRow = {
		...params.contribution,
		document_relationships: merged,
	};
	return {
		persisted: true,
		contribution: returnedContribution,
	};
};
