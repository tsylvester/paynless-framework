"use client";

import { Loader2 } from "lucide-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useDialecticStore } from "@paynless/store";
import { useQuery } from "@tanstack/react-query";

export function NavProjects() {
	const { projects, fetchDialecticProjects, isLoading } = useDialecticStore(
		(state) => ({
			projects: state.projects,
			isLoading: state.isLoadingProjects,
			fetchDialecticProjects: state.fetchDialecticProjects,
		}),
	);

	useQuery({
		queryKey: ["projects"],
		queryFn: () => fetchDialecticProjects(),
	});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<p className="ml-2 text-lg">Loading projects...</p>
			</div>
		);
	}

	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Projects</SidebarGroupLabel>
			<SidebarMenu>
				{projects.map((item) => (
					<SidebarMenuItem key={item.id} className="px-1">
						<SidebarMenuButton asChild>
							<a href={`/chat/project/${item.id}`}>
								<span>{item.project_name}</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
