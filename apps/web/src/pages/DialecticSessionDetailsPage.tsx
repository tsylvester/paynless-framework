import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
	useDialecticStore,
	selectSortedStages,
	selectActiveStageSlug,
} from "@paynless/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	DialecticSession,
	DialecticProject,
	ApiError,
} from "@paynless/types";

// New Component Imports
import { SessionInfoCard } from "../components/dialectic/SessionInfoCard";
import { StageTabCard } from "../components/dialectic/StageTabCard";
import { SessionContributionsDisplayCard } from "../components/dialectic/SessionContributionsDisplayCard";
import { DynamicProgressBar } from "../components/common/DynamicProgressBar";

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
	const activeStageSlug = useDialecticStore(selectActiveStageSlug);
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
			{/* Header */}
			<div className="px-6 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<SessionInfoCard />
			</div>

			{/* Content */}
			<div className="px-6 py-6">
				<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
					{/* Sidebar */}
					<div className="lg:col-span-1">
						<div className="sticky top-24 space-y-4">
							{/* Enhanced Progress */}
							<DynamicProgressBar sessionId={activeSessionDetail.id} />
							{/* Stage Navigation */}
							<div className="space-y-2">
								<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
									Process Stages
								</h3>
								<div role="tablist" aria-label="Dialectic Stages">
									<StageTabCard />
								</div>
							</div>
						</div>
					</div>

					{/* Main Content Area */}
					<div className="lg:col-span-1">
						<div className="bg-card rounded-xl border shadow-sm overflow-hidden">
							{activeStageSlug && activeSessionDetail ? (
								<div className="p-6">
									<SessionContributionsDisplayCard />
								</div>
							) : (
								<div className="py-16 text-center">
									{!activeStageSlug &&
									sortedStages.length > 0 &&
									!isLoading ? (
										<div className="space-y-3">
											<div className="w-14 h-14 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
												<span className="text-xl">🎯</span>
											</div>
											<div>
												<h3 className="text-base font-medium mb-1">
													Select a stage to begin
												</h3>
												<p className="text-sm text-muted-foreground">
													Choose a process stage from the sidebar to view and
													work with contributions
												</p>
											</div>
										</div>
									) : sortedStages.length === 0 && !isLoading ? (
										<div className="space-y-3">
											<div className="w-14 h-14 mx-auto rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
												<span className="text-xl">⚠️</span>
											</div>
											<div>
												<h3 className="text-base font-medium mb-1 text-destructive">
													No stages configured
												</h3>
												<p className="text-sm text-muted-foreground">
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
