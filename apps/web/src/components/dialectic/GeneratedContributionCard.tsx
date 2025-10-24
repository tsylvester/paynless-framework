import React, { useState, useEffect } from "react";
import { useDialecticStore, selectContributionById } from "@paynless/store";
import { ApiError, DialecticContribution, ApiResponse } from "@paynless/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TextInputArea } from "@/components/common/TextInputArea";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, Save } from "lucide-react";
import { toast } from "sonner";

interface GeneratedContributionCardProps {
	contributionId: string;
	originalModelContributionIdForResponse: string;
	initialResponseText?: string;
	onResponseChange: (
		originalModelContributionIdForResponse: string,
		responseText: string,
	) => void;
}

export const GeneratedContributionCard: React.FC<
	GeneratedContributionCardProps
> = ({
	contributionId,
	originalModelContributionIdForResponse,
	initialResponseText = "",
	onResponseChange,
}) => {
	console.log(
		`[GeneratedContributionCard] Rendering with contributionId: ${contributionId}`,
	);

	const contribution: DialecticContribution | undefined = useDialecticStore(
		(state) => selectContributionById(state, contributionId),
	);
	console.log(
		`[GeneratedContributionCard] For contributionId ${contributionId}, selected contribution metadata:`,
		contribution,
	);

	const projectId = useDialecticStore(
		(state) => state.currentProjectDetail?.id,
	);

	const contentCacheEntry = useDialecticStore((state) =>
		contribution?.id
			? state.contributionContentCache?.[contribution.id]
			: undefined,
	);
	console.log(
		`[GeneratedContributionCard] For contributionId ${contributionId}, contentCacheEntry:`,
		contentCacheEntry,
	);

	const fetchContributionContent = useDialecticStore(
		(state) => state.fetchContributionContent,
	);
	const saveContributionEdit = useDialecticStore(
		(state) => state.saveContributionEdit,
	);
	const isSavingEdit = useDialecticStore(
		(state) => state.isSavingContributionEdit,
	);
	const saveEditError: ApiError | null = useDialecticStore(
		(state) => state.saveContributionEditError,
	);
	const resetSaveEditError = useDialecticStore(
		(state) => state.resetSaveContributionEditError,
	);

	const [isEditing, setIsEditing] = useState(false);
	const [editedContentText, setEditedContentText] = useState("");
	const [currentResponseText, setCurrentResponseText] =
		useState(initialResponseText);

	const displayContent = contentCacheEntry?.content || "";
	const isLoadingContent = contentCacheEntry?.isLoading || false;
	const contentError = contentCacheEntry?.error || null;

	useEffect(() => {
		setCurrentResponseText(initialResponseText);
	}, [initialResponseText]);

	useEffect(() => {
		if (
			contributionId &&
			contribution &&
			(!contentCacheEntry ||
				(!contentCacheEntry.content && !contentCacheEntry.isLoading))
		) {
			fetchContributionContent(contributionId);
		}
	}, [
		contributionId,
		contribution,
		contentCacheEntry,
		fetchContributionContent,
	]);

	useEffect(() => {
		if (isEditing) {
			setEditedContentText(displayContent);
		}
	}, [isEditing, displayContent]);

	useEffect(() => {
		return () => {
			if (saveEditError && resetSaveEditError) resetSaveEditError();
		};
	}, [saveEditError, resetSaveEditError]);

	const handleSaveEdit = async () => {
		if (!contribution || !projectId || isSavingEdit) {
			if (!projectId)
				toast.error("Cannot save edit: Project context is missing.");
			return;
		}
		if (saveEditError && resetSaveEditError) resetSaveEditError();

		try {
			const result: ApiResponse<DialecticContribution> =
				await saveContributionEdit({
					projectId: projectId,
					sessionId: contribution.session_id,
					originalModelContributionId:
						contribution.original_model_contribution_id || contribution.id,
					responseText: editedContentText,
					originalContributionIdToEdit: contribution.id,
					editedContentText,
				});
			if (result?.data || !result?.error) {
				toast.success("Edit Saved", {
					description: "Your changes to the contribution have been saved.",
				});
				setIsEditing(false);
			} else {
				const errorPayload: ApiError = result.error;
				toast.error("Failed to Save Edit", {
					description:
						errorPayload?.message ||
						saveEditError?.message ||
						"An unexpected error occurred.",
				});
			}
		} catch (e: unknown) {
			const errorMessage =
				e instanceof Error
					? e.message
					: "A client-side error occurred while saving.";
			toast.error("Save Error", { description: errorMessage });
		}
	};

	const handleResponseChangeInternal = (text: string) => {
		setCurrentResponseText(text);
		onResponseChange(originalModelContributionIdForResponse, text);
	};

	if (!contribution) {
		// Render a skeleton loader if the contribution object is not found in the store
		return (
			<Card
				className="animate-pulse flex flex-col gap-6 rounded-xl border py-6 shadow-sm"
				data-testid="skeleton-card"
			>
				<CardHeader>
					<Skeleton className="h-5 w-3/4" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-20 w-full" />
				</CardContent>
			</Card>
		);
	}

	const status = contribution.status;

	if (
		status &&
		["pending", "generating", "retrying", "continuing"].includes(status)
	) {
		const getStatusMessage = () => {
			switch (status) {
				case "pending":
					return `Contribution from ${contribution.model_name} is pending in the queue...`;
				case "generating":
					return `Generating contribution with ${contribution.model_name}...`;
				case "retrying":
					return `An issue occurred. Retrying generation for ${contribution.model_name}...`;
				case "continuing":
					return `Receiving response from ${contribution.model_name}...`;
				default:
					return "Loading...";
			}
		};

		return (
			<Card className="flex flex-col h-full">
				<CardHeader>
					<CardTitle className="text-lg">{contribution.model_name}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center justify-center flex-grow py-8">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					<p className="mt-4 text-muted-foreground">{getStatusMessage()}</p>
					{status === "retrying" && contribution.error && (
						<p className="mt-2 text-xs text-destructive text-center">
							{contribution.error.message}
						</p>
					)}
					{/* Show partial content if continuing */}
					{status === "continuing" && displayContent && (
						<div className="w-full mt-4 p-4 border rounded-md bg-muted/50 max-h-48 overflow-y-auto">
							<p className="text-sm text-muted-foreground whitespace-pre-wrap">
								{displayContent}
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		);
	}

	if (status === "failed") {
		return (
			<Card className="flex flex-col h-full border-destructive">
				<CardHeader>
					<CardTitle className="text-lg">{contribution.model_name}</CardTitle>
				</CardHeader>
				<CardContent className="flex-grow py-4">
					<Alert variant="destructive">
						<AlertTitle>Generation Failed</AlertTitle>
						<AlertDescription>
							{contribution.error?.message ||
								"An unexpected error occurred and the contribution could not be generated."}
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		);
	}

	const isUserEdited = contribution.edit_version > 1 && contribution.user_id;

	return (
		<Card className="flex flex-col h-full">
			<CardHeader>
				<div className="flex justify-between items-start">
					<div>
						<CardTitle className="text-lg flex items-center gap-5">
							<div>{contribution.model_name}</div>
							{isUserEdited ? (
								<Badge
									variant="outline"
									className="border-amber-500 text-amber-600 mx-2"
								>
									Edited by User
								</Badge>
							) : (
								<Badge variant="outline">AI Generated</Badge>
							)}
							<div className="text-xs text-gray-400">
								version {contribution.edit_version}
							</div>
						</CardTitle>
					</div>
				</div>
			</CardHeader>
			{/* Main content area with responsive layout */}
			<div className="flex-grow flex flex-col lg:flex-row gap-4 mx-6">
				{/* Display Section */}
				<div className="flex-1 min-w-0">
					<div className="mb-2">
						<h4 className="text-sm font-medium text-muted-foreground">
							Content
						</h4>
					</div>
					{isLoadingContent && (
						<div data-testid="content-loading-skeleton">
							<Skeleton className="h-24 w-full" />
						</div>
					)}
					{contentError && (
						<Alert variant="destructive">
							<AlertDescription>{contentError.message}</AlertDescription>
						</Alert>
					)}
					{!isLoadingContent && !contentError && (
						<div style={isEditing ? { width: "100%" } : undefined}>
							<TextInputArea
								label=""
								value={
									isEditing
										? editedContentText
										: displayContent || "No content available"
								}
								onChange={setEditedContentText}
								disabled={!isEditing}
								placeholder={isEditing ? "Enter edited content..." : ""}
								showPreviewToggle={true}
								showFileUpload={false}
								initialPreviewMode={!isEditing}
								onPreviewModeChange={(isPreview) => {
									if (!isSavingEdit) {
										setIsEditing(!isPreview);
										if (!isPreview) {
											setEditedContentText(displayContent);
										}
										if (saveEditError && resetSaveEditError)
											resetSaveEditError();
									}
								}}
								textAreaClassName={
									isEditing
										? "!w-full [field-sizing:normal]"
										: "pointer-events-none"
								}
							/>
						</div>
					)}
					{isEditing && (
						<div className="mt-2 space-y-2">
							<p className="text-xs text-muted-foreground px-1">
								Recommended for significant corrections. For substantive
								dialogue, use the response area.
							</p>
							<div className="flex justify-end gap-2 w-full">
								<Button
									variant="outline"
									onClick={() => {
										setIsEditing(false);
										setEditedContentText(displayContent);
										if (saveEditError && resetSaveEditError)
											resetSaveEditError();
									}}
									size="sm"
									disabled={isSavingEdit}
								>
									<XCircle className="mr-1.5 h-4 w-4" /> Discard
								</Button>
								<Button
									onClick={handleSaveEdit}
									size="sm"
									disabled={
										isSavingEdit || editedContentText === displayContent
									}
								>
									{isSavingEdit ? (
										<Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
									) : (
										<Save className="mr-1.5 h-4 w-4" />
									)}
									{isSavingEdit ? "Saving..." : "Save Edit"}
								</Button>
							</div>
						</div>
					)}
					{saveEditError && isEditing && (
						<Alert variant="destructive" className="mt-2">
							<AlertTitle>Save Error</AlertTitle>
							<AlertDescription>
								{saveEditError.message || "Could not save your edit."}
							</AlertDescription>
						</Alert>
					)}
				</div>

				{/* Response Section */}
				<div className="flex-1 min-w-0">
					<div className="mb-2">
						<h4 className="text-sm font-medium text-muted-foreground">
							Your Response
						</h4>
					</div>
					<div className="w-full space-y-1.5">
						<TextInputArea
							id={`response-${contribution.id}`}
							value={currentResponseText}
							onChange={handleResponseChangeInternal}
							placeholder={`Enter your response for ${contribution.model_name}. Notes, criticism, requests, or other feedback. Anything you add will be used by the model for the next stage.`}
							showPreviewToggle={true}
							showFileUpload={false}
						/>
					</div>
				</div>
			</div>
		</Card>
	);
};
