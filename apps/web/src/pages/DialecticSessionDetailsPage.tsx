import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDialecticStore, selectSortedStages } from "@paynless/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	DialecticSession,
	DialecticProject,
	DialecticStage,
	ApiError,
} from "@paynless/types";

// New Component Imports
import { SessionInfoCard } from "../components/dialectic/SessionInfoCard";
import { StageTabCard } from "../components/dialectic/StageTabCard";
import { SessionContributionsDisplayCard } from "../components/dialectic/SessionContributionsDisplayCard";

export const DialecticSessionDetailsPage: React.FC = () => {
	const { projectId: urlProjectId, sessionId: urlSessionId } = useParams<{
		projectId: string;
		sessionId: string;
	}>();

	// Actions from store
	const activateContextForDeepLink = useDialecticStore(
		(state) => state.activateProjectAndSessionContextForDeepLink,
	);

	// Selectors from store for context and data
	const activeContextProjectId = useDialecticStore(
		(state) => state.activeContextProjectId,
	);
	const activeContextSessionId = useDialecticStore(
		(state) => state.activeContextSessionId,
	);
	const activeSessionDetail = useDialecticStore(
		(state) => state.activeSessionDetail,
	) as DialecticSession | null;
	const currentProjectDetail = useDialecticStore(
		(state) => state.currentProjectDetail,
	) as DialecticProject | null;
	const activeContextStage = useDialecticStore(
		(state) => state.activeContextStage,
	) as DialecticStage | null;
	const sortedStages = useDialecticStore(selectSortedStages);

	// Loading and error states from store
	const isLoadingProject = useDialecticStore(
		(state) => state.isLoadingProjectDetail,
	);
	const projectError = useDialecticStore((state) => state.projectDetailError);
	const isLoadingSession = useDialecticStore(
		(state) => state.isLoadingActiveSessionDetail,
	);
	const sessionError = useDialecticStore(
		(state) => state.activeSessionDetailError,
	) as ApiError | null;

	useEffect(() => {
		// Deep-link hydration logic
		if (urlProjectId && urlSessionId) {
			if (
				urlProjectId !== activeContextProjectId ||
				urlSessionId !== activeContextSessionId ||
				!activeSessionDetail ||
				activeSessionDetail.id !== urlSessionId
			) {
				activateContextForDeepLink(urlProjectId, urlSessionId);
			}
		}
	}, [
		urlProjectId,
		urlSessionId,
		activeContextProjectId,
		activeContextSessionId,
		activeSessionDetail,
		activateContextForDeepLink,
	]);

	useEffect(() => {
		return () => {};
	}, []);

	const isLoading = isLoadingProject || isLoadingSession;

	if (isLoading && !activeSessionDetail && !sessionError) {
		return (
			<div className="container mx-auto p-4">
				<h1 className="text-2xl font-bold mb-4">Loading session details...</h1>
				<Skeleton className="h-40 w-full mb-4" />
				<div className="flex space-x-2 my-4 overflow-x-auto pb-2">
					{[...Array(3)].map((_, i) => (
						<Skeleton key={i} className="h-20 w-32" />
					))}
				</div>
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	const displayError = projectError || sessionError;
	if (displayError) {
		return (
			<Alert variant="destructive" className="m-4">
				<AlertTitle>Error Loading Session</AlertTitle>
				<AlertDescription>
					{displayError.message || "Failed to load session details."}
					{currentProjectDetail && (
						<Button variant="link" asChild className="ml-2">
							<Link to={`/dialectic/${currentProjectDetail.id}`}>
								Back to Project
							</Link>
						</Button>
					)}
				</AlertDescription>
			</Alert>
		);
	}

	if (!activeSessionDetail) {
		return (
			<Alert variant="destructive" className="m-4">
				<AlertTitle>Session Not Found</AlertTitle>
				<AlertDescription>
					The session data could not be loaded. Please check the URL or try
					navigating again.
					{activeContextProjectId && (
						<Button variant="link" asChild className="ml-2">
							<Link to={`/dialectic/${activeContextProjectId}`}>
								Back to Project Details
							</Link>
						</Button>
					)}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div>
			{/* Enhanced Header */}
			<div className="px-6 py-2">
				<SessionInfoCard />
			</div>

			{/* Enhanced Content */}
			<div className="px-6 py-8">
				<div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
					{/* Enhanced Sidebar */}
					<div className="lg:col-span-1">
						<div className="sticky top-40 space-y-6">
							{/* Stage Navigation */}
							<div className="space-y-3">
								<h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
									Process Stages
								</h3>
								<div role="tablist" aria-label="Dialectic Stages">
									<StageTabCard />
								</div>
							</div>

							{/* Enhanced Progress */}
							{sortedStages.length > 0 && activeContextStage && (
								<div className="bg-muted/30 rounded-xl p-4 space-y-3">
									<div className="flex items-center justify-between text-sm">
										<span className="text-muted-foreground">Progress</span>
										<span className="font-medium">
											{sortedStages.findIndex(
												(s) => s.id === activeContextStage.id,
											) + 1}
											/{sortedStages.length}
										</span>
									</div>
									<div className="w-full bg-muted rounded-full h-2 overflow-hidden">
										<div
											className="bg-gradient-to-r from-blue-600 to-blue-700 h-2 rounded-full transition-all duration-500 ease-out"
											style={{
												width: `${((sortedStages.findIndex((s) => s.id === activeContextStage.id) + 1) / sortedStages.length) * 100}%`,
											}}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										{Math.round(
											((sortedStages.findIndex(
												(s) => s.id === activeContextStage.id,
											) +
												1) /
												sortedStages.length) *
												100,
										)}
										% complete
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Enhanced Content Area */}
					<div className="lg:col-span-4">
						<div className="bg-card rounded-2xl shadow-sm overflow-hidden">
							{activeContextStage && activeSessionDetail ? (
								<div className="p-8">
									<SessionContributionsDisplayCard />
								</div>
							) : (
								<div className="py-24 text-center">
									{!activeContextStage &&
									sortedStages.length > 0 &&
									!isLoading ? (
										<div className="space-y-4">
											<div className="w-16 h-16 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
												<span className="text-2xl">🎯</span>
											</div>
											<div>
												<h3 className="text-lg font-medium mb-2">
													Select a stage to begin
												</h3>
												<p className="text-muted-foreground">
													Choose a process stage from the sidebar to view and
													work with contributions
												</p>
											</div>
										</div>
									) : sortedStages.length === 0 && !isLoading ? (
										<div className="space-y-4">
											<div className="w-16 h-16 mx-auto rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
												<span className="text-2xl">⚠️</span>
											</div>
											<div>
												<h3 className="text-lg font-medium mb-2 text-destructive">
													No stages configured
												</h3>
												<p className="text-muted-foreground">
													This project doesn't have any process stages set up
												</p>
											</div>
										</div>
									) : null}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
