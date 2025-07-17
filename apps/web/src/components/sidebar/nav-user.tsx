"use client";

import { useState, useCallback } from "react";

import {
	BadgeCheck,
	Bell,
	ChevronsUpDown,
	CreditCard,
	LogOut,
	Sparkles,
} from "lucide-react";
import { SimpleDropdown } from "@/components/ui/SimpleDropdown";
import { useAuthStore } from "@paynless/store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
export function NavUser({
	user,
}: {
	user: {
		email: string;
	};
}) {
	// const { isMobile } = useSidebar();
	const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

	const { logout } = useAuthStore((state) => ({
		logout: state.logout,
	}));

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
					Notifications
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
	);
}
