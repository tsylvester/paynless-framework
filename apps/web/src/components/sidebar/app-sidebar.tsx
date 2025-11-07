import * as React from "react";
import { useEffect } from "react";
import { BookOpen, File, User, SquareTerminal } from "lucide-react";
import { NavMain } from "@/components/sidebar/nav-main";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { NavUser } from "@/components/sidebar/nav-user";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useDialecticStore, useAiStore, useAuthStore } from "@paynless/store";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const navigate = useNavigate();
	const storeLoadChatHistory = useAiStore.getState().loadChatHistory;

	const { user, isLoading } = useAuthStore((state) => ({ user: state.user }));

	const { projects, fetchDialecticProjects } = useDialecticStore((state) => ({
		projects: state.projects,
		isLoading: state.isLoadingProjects,
		fetchDialecticProjects: state.fetchDialecticProjects,
	}));

	const personal = useAiStore((state) => state.chatsByContext.personal);
	const isLoadingPersonalChats = useAiStore(
		(state) => state.isLoadingHistoryByContext.personal,
	);

	// console.log("chatsForContext personal:", personal);
	// console.log("personal is array?", Array.isArray(personal));
	// console.log("personal length:", personal?.length);
	// console.log("isLoadingPersonalChats:", isLoadingPersonalChats);

	// Load chat history for personal context
	useEffect(() => {
		const activeContextId = "personal";
		const shouldLoad =
			personal === undefined && !isLoadingPersonalChats && !!user; // Only load if user is authenticated

		if (shouldLoad) {
			console.log("Loading chat history for personal context");
			storeLoadChatHistory(activeContextId);
		}
	}, [personal, isLoadingPersonalChats, user, storeLoadChatHistory]);

	useQuery({
		queryKey: ["projects"],
		queryFn: async () => {
			const result = await fetchDialecticProjects();
			return result || [];
		},
	});

	const state = isLoading ? "LOADING" : !user ? "NO_AUTH" : "AUTHENTICATED";

	const data = {
		navMain: [
			{
				title: "Dashboard",
				url: "/dashboard",
				icon: SquareTerminal,
				isActive: true,
			},
			{
				title: "Chat",
				url: "/chat",
				icon: User,
				isActive: true,
			},
			{
				title: "Planner",
				url: "/dialectic",
				icon: BookOpen,
				isActive: true,
			},
		],

		navSecondary: [
			{
				title: "Chats",
				url: "/chat",
				icon: User,
				isActive: true,
				items: (personal || []).map((chat) => ({
					title: chat.title || `Chat ${chat.id}`,
					url: `/chat/${chat.id}`,
				})),
			},

			{
				title: "Projects",
				url: "/dialectic",
				icon: BookOpen,
				isActive: true,
				items: projects.map((project) => ({
					title: project.project_name,
					url: `/dialectic/${project.id}`,
				})),
			},

			{
				title: "Documentation",
				url: "#",
				icon: File,
				items: [
					{
						title: "Getting started",
						url: "/docs/getting-started",
					},
					// {
					// 	title: "Pricing",
					// 	url: "/docs/pricing",
					// },
					// {
					// 	title: "Tutorials",
					// 	url: "/docs/tutorials",
					// },
					// {
					// 	title: "Changelog",
					// 	url: "/docs/changelog",
					// },
				],
			},
		],
	};

	return (
		<Sidebar
			{...props}
			className="bg-[#fafafa] dark:bg-[#111] text-foreground max-w-[200px]"
		>
			{state === "LOADING" ? (
				<SidebarContent>
					<div className="flex items-center justify-between p-4">
						<div className="text-lg font-semibold">Loading...</div>
					</div>
				</SidebarContent>
			) : state === "NO_AUTH" ? (
				<>
					<SidebarContent>
						<NavMain items={data.navMain} />
					</SidebarContent>
					<SidebarFooter>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full"
							onClick={() => navigate("/login")}
						>
							<User />
							Login
						</SidebarMenuButton>
					</SidebarFooter>
				</>
			) : (
				<>
					<SidebarContent>
						<NavMain items={data.navMain} />
						<NavMain items={data.navSecondary} subtitle="History" hideLogo />
					</SidebarContent>
					<SidebarFooter>
						<NavUser user={user} />
					</SidebarFooter>
				</>
			)}
		</Sidebar>
	);
}
