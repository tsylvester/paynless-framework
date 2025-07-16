import * as React from "react";
import {
	AudioWaveform,
	BookOpen,
	Bot,
	Command,
	Frame,
	GalleryVerticalEnd,
	Map,
	PieChart,
	Settings2,
	SquareTerminal,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavMain } from "@/components/sidebar/nav-main";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { NavUser } from "@/components/sidebar/nav-user";
import { TeamSwitcher } from "@/components/sidebar/team-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import { useOrganizationStore, useAuthStore } from "@paynless/store";
import { OrganizationSwitcher } from "../organizations/OrganizationSwitcher";

// This is sample data.
const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
	teams: [
		{
			name: "Acme Inc",
			logo: GalleryVerticalEnd,
			plan: "Enterprise",
		},
		{
			name: "Acme Corp.",
			logo: AudioWaveform,
			plan: "Startup",
		},
		{
			name: "Evil Corp.",
			logo: Command,
			plan: "Free",
		},
	],
	navMain: [
		{
			title: "New Chat",
			url: "/chat",
			icon: SquareTerminal,
			isActive: true,
			// items: [
			// 	{
			// 		title: "History",
			// 		url: "#",
			// 	},
			// 	{
			// 		title: "Starred",
			// 		url: "#",
			// 	},
			// 	{
			// 		title: "Settings",
			// 		url: "#",
			// 	},
			// ],
		},
		// {
		// 	title: "Models",
		// 	url: "#",
		// 	icon: Bot,
		// 	items: [
		// 		{
		// 			title: "Genesis",
		// 			url: "#",
		// 		},
		// 		{
		// 			title: "Explorer",
		// 			url: "#",
		// 		},
		// 		{
		// 			title: "Quantum",
		// 			url: "#",
		// 		},
		// 	],
		// },
		{
			title: "Documentation",
			url: "#",
			icon: BookOpen,
			items: [
				{
					title: "How it works",
					url: "/docs/how-it-works",
				},
				{
					title: "Pricing",
					url: "/docs/pricing",
				},
				{
					title: "Tutorials",
					url: "/docs/tutorials",
				},
				{
					title: "Changelog",
					url: "/docs/changelog",
				},
			],
		},
		// {
		// 	title: "Settings",
		// 	url: "#",
		// 	icon: Settings2,
		// 	items: [
		// 		{
		// 			title: "General",
		// 			url: "#",
		// 		},
		// 		{
		// 			title: "Team",
		// 			url: "#",
		// 		},
		// 		{
		// 			title: "Billing",
		// 			url: "#",
		// 		},
		// 		{
		// 			title: "Limits",
		// 			url: "#",
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
	// const {
	// 	userOrganizations,
	// 	currentOrganizationId,
	// 	isLoading,
	// 	fetchUserOrganizations,
	// 	setCurrentOrganizationId,
	// 	openCreateModal,
	// } = useOrganizationStore((state) => ({
	// 	userOrganizations: state.userOrganizations,
	// 	currentOrganizationId: state.currentOrganizationId,
	// 	isLoading: state.isLoading,
	// 	fetchUserOrganizations: state.fetchUserOrganizations,
	// 	setCurrentOrganizationId: state.setCurrentOrganizationId,
	// 	openCreateModal: state.openCreateModal,
	// }));

const { user,isLoading } = useAuthStore((state) => ({ user: state.user }))
console.log('user', user)
	// useQuery({
	// 	queryKey: ["userOrganizations"],
	// 	queryFn: () => fetchUserOrganizations(),
	// });



	//   const teams = userOrganizations.map(org => ({
	// 	name: org.name,
	// 	logo: org?.logo || GalleryVerticalEnd, // Fallback icon if no logo
	// 	plan: "Free", // Default plan if not set
	//   }));

	const state = isLoading ? 'LOADING' : !user ? 'NO_AUTH' : 'AUTHENTICATED';

	return (
		<Sidebar {...props} className="bg-[#111] text-foreground">
			{state === 'LOADING' ? (
				<SidebarContent>
					<div className="flex items-center justify-between p-4">
						<div className="text-lg font-semibold">Loading...</div>
					</div>
				</SidebarContent>
			) : state === 'NO_AUTH' ? (
				<SidebarContent>
					<NavMain items={data.navMain} />
				</SidebarContent>
			) : (
				<>
					<SidebarHeader>
						<OrganizationSwitcher />
					</SidebarHeader>
					<SidebarContent>
						<NavMain items={data.navMain} />
						<NavProjects projects={data.projects} />
					</SidebarContent>
					<SidebarFooter>
						<NavUser user={data.user} />
					</SidebarFooter>
					
					
				</>
			)}
		</Sidebar>
	);
}
