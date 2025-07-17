import * as React from "react";
import {
	BookOpen,
	Frame,
	PieChart,
	User,
	SquareTerminal,
} from "lucide-react";
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
import { useAuthStore } from "@paynless/store";
import { OrganizationSwitcher } from "../organizations/OrganizationSwitcher";
import { useNavigate } from "react-router-dom";

const data = {
	navMain: [
		// {
		// 	title: "New Chat",
		// 	url: "/new",
		// 	icon: SquareTerminal,
		// 	isActive: true,
		// },
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
			title: "Dialectic",
			url: "/dialectic",
			icon: BookOpen,
			isActive: true,
		},

		// {
		// 	title: "Documentation",
		// 	url: "#",
		// 	icon: BookOpen,
		// 	items: [
		// 		{
		// 			title: "How it works",
		// 			url: "/docs/how-it-works",
		// 		},
		// 		{
		// 			title: "Pricing",
		// 			url: "/docs/pricing",
		// 		},
		// 		{
		// 			title: "Tutorials",
		// 			url: "/docs/tutorials",
		// 		},
		// 		{
		// 			title: "Changelog",
		// 			url: "/docs/changelog",
		// 		},
		// 	],
		// },
	],
	projects: [
		{
			name: "Design Engineering",
			url: "#",
			icon: Frame,
		},
		{
			name: "Sales & Marketing",
			url: "#",
			icon: PieChart,
		},
		{
			name: "Travel",
			url: "#",
			icon: Map,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const navigate = useNavigate();

	const { user, isLoading } = useAuthStore((state) => ({ user: state.user }));

	const state = isLoading ? "LOADING" : !user ? "NO_AUTH" : "AUTHENTICATED";

	return (
		<Sidebar {...props} className="bg-[#fafafa] dark:bg-[#111] text-foreground max-w-[200px]">
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
					<SidebarHeader>
						<OrganizationSwitcher />
					</SidebarHeader>
					<SidebarContent>
						<NavMain items={data.navMain} />
						<NavProjects />
					</SidebarContent>
					<SidebarFooter>
						<NavUser user={user} />
					</SidebarFooter>
				</>
			)}
		</Sidebar>
	);
}
