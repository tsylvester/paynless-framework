import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	useDialecticStore,
	selectGenerateContributionsError,
	selectUnifiedProjectProgress,
	selectSelectedModels,
} from "@paynless/store";
import {
	DialecticProject,
	DialecticSession,
} from "@paynless/types";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { ChevronDown, Download, MoreVertical, Cpu } from "lucide-react";
import { WalletSelector } from "../ai/WalletSelector";
import { AIModelSelector } from "./AIModelSelector";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExportProjectButton } from "./ExportProjectButton";
import { ContinueUntilCompleteToggle } from "../common/ContinueUntilCompleteToggle";
import { DynamicProgressBar } from "../common/DynamicProgressBar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
interface SessionInfoCardProps {
	// REMOVED: session?: DialecticSession;
}

export const SessionInfoCard: React.FC<SessionInfoCardProps> = (
	/* REMOVED: { session } */
) => {
	const project: DialecticProject | null = useDialecticStore(
		(state) => state.currentProjectDetail,
	);
	const session: DialecticSession | null = useDialecticStore(
		(state) => state.activeSessionDetail,
	);
	const unifiedProgress = useDialecticStore(
		useShallow((state) =>
			state.activeSessionDetail
				? selectUnifiedProjectProgress(state, state.activeSessionDetail.id)
				: null,
		),
	);
	const generateContributionsError = useDialecticStore(selectGenerateContributionsError);
	const navigate = useNavigate();
	const [isPromptOpen, setIsPromptOpen] = useState(false);
	const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
	const activeSeedPrompt = useDialecticStore((state) => state.activeSeedPrompt);
	const isLoading = useDialecticStore(state => state.isLoadingActiveSessionDetail);

	// Get selected model count
	const selectedModels = useDialecticStore(selectSelectedModels);
	const uniqueModelCount = new Set(selectedModels.map((model) => model.id)).size;

	if (!project || !session) {
		return (
			<div className="space-y-2 pl-14 py-4">
				<Skeleton className="h-8 w-48" />
				<div className="flex items-center gap-4">
					<Skeleton className="h-10 w-32" />
					<Skeleton className="h-10 w-32" />
				</div>
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	return (
		<div
			className="space-y-2 pl-14"
			aria-labelledby={`session-info-title-${session.id}`}
		>
			{/* Row 1: Back | Session name | Iteration badge | Status badge | spacer | ... dropdown */}
			<div className="flex items-center gap-3 flex-wrap">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => project && navigate(`/dialectic/${project.id}`)}
					disabled={!project}
					className="text-muted-foreground hover:text-foreground transition-colors duration-200 -ml-3"
				>
					← Back
				</Button>
				<h1
					className="text-xl font-light tracking-tight"
					data-testid={`session-info-title-${session.id}`}
				>
					{session.session_description || "Untitled Session"}
				</h1>
				<Badge
					variant="outline"
					className="font-normal border-0 px-2.5 py-0.5 bg-muted/50 text-muted-foreground"
				>
					Iteration {session.iteration_count}
				</Badge>
				<div className="flex-1 min-w-4" />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="h-9 w-9 p-0"
						>
							<MoreVertical className="h-4 w-4" />
							<span className="sr-only">More actions</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem asChild>
							<ExportProjectButton
								projectId={project.id}
								variant="ghost"
								size="sm"
								className="w-full justify-start cursor-pointer"
							>
								<Download className="mr-2 h-4 w-4" />
								Export Project
							</ExportProjectButton>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<div className="px-2 py-1.5">
							<ContinueUntilCompleteToggle />
						</div>
						<DropdownMenuItem onClick={() => setIsPromptOpen((p) => !p)}>
							{isPromptOpen ? "Hide Seed Prompt" : "Show Seed Prompt"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Row 2: Model Selector | Wallet Selector | DynamicProgressBar */}
			<div className="flex items-center gap-4 flex-wrap">
				<Popover open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-9 px-3 gap-2",
								uniqueModelCount === 0 && "ring-2 ring-primary animate-pulse",
							)}
						>
							<Cpu className="h-4 w-4" />
							<span>
								{uniqueModelCount > 0
									? `${uniqueModelCount} model${uniqueModelCount !== 1 ? "s" : ""}`
									: "Select models"}
							</span>
							<ChevronDown className="h-3.5 w-3.5 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[420px] p-0 bg-background border shadow-lg" align="start">
						<div className="p-3 border-b bg-background">
							<p className="text-sm font-medium">AI Models</p>
							<p className="text-xs text-muted-foreground">Select models for generation</p>
						</div>
						<div className="p-3 bg-background">
							<AIModelSelector />
						</div>
					</PopoverContent>
				</Popover>
				<div className="w-48">
					<WalletSelector />
				</div>
				{unifiedProgress && unifiedProgress.totalStages > 0 && (
					<div className="flex-1 min-w-0">
						<DynamicProgressBar sessionId={session.id} />
					</div>
				)}
			</div>

			{generateContributionsError && (
				<Alert variant="destructive" data-testid="generate-contributions-error">
					<AlertTitle>Error Generating Contributions</AlertTitle>
					<AlertDescription>
						{generateContributionsError.message}
					</AlertDescription>
				</Alert>
			)}

			{/* Prompt Display Section */}
			{isPromptOpen && (
				<div className="bg-card rounded-lg p-4 border">
					{isLoading ? (
						<div data-testid="iteration-prompt-loading">
							<Skeleton className="h-4 w-1/4 mb-2" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : activeSeedPrompt ? (
						<div className="p-2 rounded-md bg-muted/30">
							<MarkdownRenderer content={activeSeedPrompt.promptContent} />
						</div>
					) : (
						<p className="text-sm text-muted-foreground italic">
							No seed prompt available for this session.
						</p>
					)}
				</div>
			)}
		</div>
	);
};
