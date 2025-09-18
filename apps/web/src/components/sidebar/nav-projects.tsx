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
		queryFn: async () => {
			const result = await fetchDialecticProjects();
			return result || [];
		},
	});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="h-3 w-3 animate-spin" />
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
							<a href={`/dialectic/${item.id}`}>
								<span>{item.project_name}</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
