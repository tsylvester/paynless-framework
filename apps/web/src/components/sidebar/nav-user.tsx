"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

import {
	BadgeCheck,
	Bell,
	ChevronsUpDown,
	CreditCard,
	LogOut,
	Sparkles,
	Sun,
	Moon,
} from "lucide-react";
import { SimpleDropdown } from "@/components/ui/SimpleDropdown";
import { useAuthStore, useNotificationStore } from "@paynless/store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "../../hooks/useTheme";

export function NavUser({
	user,
}: {
	user: {
		email: string;
	};
}) {
	const { colorMode, setColorMode } = useTheme();

	// const { isMobile } = useSidebar();
	const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
	const {
		// notifications,
		unreadCount,
		fetchNotifications,
	} = useNotificationStore((state) => ({
		// notifications: state.notifications,
		unreadCount: state.unreadCount,
		fetchNotifications: state.fetchNotifications,
	}));

	const { logout } = useAuthStore((state) => ({
		logout: state.logout,
	}));

	useQuery({
		queryKey: ["notifications"],
		queryFn: async () => {
			const result = await fetchNotifications();
			return result || [];
		},
	});

	const handleOpenChange = useCallback((open: boolean) => {
		setIsSwitcherOpen(open);
		// If closing, maybe clear focus or perform other actions
	}, []);

	const navigate = useNavigate();

	const handleLogout = async () => {
		await logout();
		navigate("/login");
	};

	return (
		<div>
			<div
				className={`flex items-center justify-center w-full ${isSwitcherOpen && "hidden"}`}
			>
				<Button
					variant="ghost"
					onClick={() => navigate("/notifications")}
					className="p-2 rounded-lg text-textSecondary hover:bg-surface hover:text-textPrimary"
					aria-label={"Notifications"}
				>
					<Bell />
					<Badge className="ml-1 text-xs text-white">{unreadCount}</Badge>
				</Button>

				<Button
					variant="ghost"
					onClick={() => setColorMode(colorMode === "light" ? "dark" : "light")}
					className="p-2 rounded-lg text-textSecondary hover:bg-surface hover:text-textPrimary"
					aria-label={
						colorMode === "light"
							? "Switch to dark mode"
							: "Switch to light mode"
					}
				>
					{colorMode === "light" ? <Moon size={20} /> : <Sun size={20} />}
				</Button>
			</div>
			<SimpleDropdown
				align="end"
				contentClassName="w-full p-1 overflow-hidden"
				onOpenChange={handleOpenChange}
				trigger={
					<SidebarMenuButton
						size="lg"
						className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full"
					>
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarImage src={user.avatar} alt={user.name} />
							<AvatarFallback className="rounded-lg">
								{(user.email.charAt(0) + user.email.charAt(1)).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight w-full overflow-hidden max-w-[103px]">
							<span className="truncate text-xs">{user.email}</span>
						</div>
						<ChevronsUpDown className="ml-auto size-4" />
					</SidebarMenuButton>
				}
			>
				<div
					className={"flex flex-col fixed mt-[-250px] animate-slide-up-spring"}
				>
					<Button
						variant="ghost"
						className="w-full justify-start hover:underline"
						onClick={() => navigate("/subscription")}
					>
						<Sparkles />
						Upgrade to Pro
					</Button>

					<Button
						variant="ghost"
						className="w-full justify-start hover:underline"
						onClick={() => navigate("/organizations")}
					>
						<BadgeCheck />
						Account
					</Button>
					<Button
						variant="ghost"
						className="w-full justify-start hover:underline"
						onClick={() => navigate("/subscription")}
					>
						<CreditCard />
						Billing
					</Button>
					<Button
						variant="ghost"
						className="w-full justify-start hover:underline"
						onClick={() => navigate("/notifications")}
					>
						<Bell />
						Notifications ({unreadCount})
					</Button>

					<Button
						variant="ghost"
						className="w-full justify-start hover:underline"
						onClick={handleLogout}
					>
						<LogOut />
						Log out
					</Button>
				</div>
			</SimpleDropdown>
		</div>
	);
}
