import { useAuthStore } from "@paynless/store";
import type React from "react";

// Placeholder for a loading component
const DefaultLoadingFallback = () => (
	<div
		style={{
			display: "flex",
			justifyContent: "center",
			alignItems: "center",
			height: "100vh",
		}}
	></div>
);

interface AuthenticatedGateProps {
	children: React.ReactNode;
	loadingFallback?: React.ReactNode;
	unauthenticatedFallback?: React.ReactNode | null;
}

export function AuthenticatedGate({
	children,
	loadingFallback = <DefaultLoadingFallback />,
	unauthenticatedFallback = null,
}: AuthenticatedGateProps) {
	const { user, isLoading } = useAuthStore((state) => ({
		user: state.user,
		isLoading: state.isLoading,
	}));

	// Only show loading during initial auth check, not during form submissions
	if (isLoading && !user) {
		return <>{loadingFallback}</>;
	}

	if (!user) {
		// Not authenticated, render null. Router handles showing public pages.
		return <>{unauthenticatedFallback}</>;
	}

	// Authenticated and auth check complete, render the protected children
	return <>{children}</>;
}
