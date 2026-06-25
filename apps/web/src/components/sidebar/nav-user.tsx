"use client";

import { useAuthStore, useNotificationStore } from "@paynless/store";
import { useQuery } from "@tanstack/react-query";

import {
	Bell,
	ChevronsUpDown,
	CreditCard,
	LogOut,
	Moon,
	Sparkles,
	Sun,
	User,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleDropdown } from "@/components/ui/SimpleDropdown";
import { SidebarMenuButton } from "@/components/ui/sidebar";
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

	const { logout, userTier, availableTiers } = useAuthStore((state) => ({
		logout: state.logout,
		userTier: state.userTier,
		availableTiers: state.availableTiers,
	}));

	useQuery({
		queryKey: ["notifications"],
		queryFn: async () => {
			await fetchNotifications();
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

	const nextTier = availableTiers.find(t => t.level > (userTier?.level ?? -1));
	const nextTierName = nextTier ? nextTier.name.charAt(0).toUpperCase() + nextTier.name.slice(1) : null;

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
				align="start"
				contentClassName="w-full p-1 bottom-full mb-2"
				onOpenChange={handleOpenChange}
				trigger={
					<SidebarMenuButton
						size="lg"
						className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full"
					>
						<Avatar className="h-8 w-8 rounded-lg">
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
				<div className="flex flex-col space-y-1 p-1">
					{nextTierName ? (
						<Button
							variant="ghost"
							className="w-full justify-start hover:underline"
							onClick={() => navigate("/subscription")}
						>
							<Sparkles />
							Upgrade to {nextTierName}
						</Button>
					) : userTier === null ? (
						<Button
							variant="ghost"
							className="w-full justify-start hover:underline"
							onClick={() => navigate("/subscription")}
						>
							<Sparkles />
							Upgrade
						</Button>
					) : null}

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
						onClick={() => navigate("/profile")}
					>
						<User />
						Profile
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
