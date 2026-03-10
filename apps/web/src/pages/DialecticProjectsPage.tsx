import React, { useEffect } from "react";
import { useDialecticStore } from "@paynless/store";
import {
	selectDialecticProjects,
	selectIsLoadingProjects,
	selectProjectsError,
} from "@paynless/store"; // Assuming selectors are exported from main store index
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react"; // For loading spinner
import { DialecticProjectCard } from "@/components/dialectic/DialecticProjectCard"; // Added import
import { CreateNewDialecticProjectButton } from "@/components/dialectic/CreateNewDialecticProjectButton"; // Added import

export const DialecticProjectsPage: React.FC = () => {
	const fetchDialecticProjects = useDialecticStore(
		(state) => state.fetchDialecticProjects,
	);
	const projects = useDialecticStore(selectDialecticProjects);
	const isLoading = useDialecticStore(selectIsLoadingProjects);
	const error = useDialecticStore(selectProjectsError);

	useEffect(() => {
		fetchDialecticProjects();
	}, []);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<p className="ml-2 text-lg">Loading projects...</p>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive" className="max-w-lg mx-auto mt-8">
				<AlertTitle>Error loading projects:</AlertTitle>
				<AlertDescription>{error.message}</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="container mx-auto py-8 px-4 md:px-6">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-3xl font-bold tracking-tight">Planner Projects</h1>
				<CreateNewDialecticProjectButton size="lg" />
			</div>

			<Separator className="mb-8" />

			{projects.length === 0 ? (
				<div className="text-center py-12">
					<h2 className="text-2xl font-semibold mb-3">No projects found.</h2>
					<p className="text-muted-foreground mb-6">
						Get started by creating your first dialectic project.
					</p>
					<CreateNewDialecticProjectButton variant="outline" size="lg">
						Create Your First Project
					</CreateNewDialecticProjectButton>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{projects.map((project) => (
						<DialecticProjectCard key={project.id} project={project} />
					))}
				</div>
			)}
		</div>
	);
};
