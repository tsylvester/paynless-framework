import type { ReactNode } from "react";

import {
	SidebarProvider,
	SidebarInset,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";

interface LayoutProps {
	children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="peer-data-[state=collapsed]:ml-0 peer-data-[state=expanded]:ml-[calc(200px)] transition-[margin] duration-200 ease-linear bg-background">
				<div className="flex flex-1 flex-col gap-4 pt-0">
					<SidebarTrigger className="ml-2 mt-2 fixed w-10 h-10 z-10" />
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
