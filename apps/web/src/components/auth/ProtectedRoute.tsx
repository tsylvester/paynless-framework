import { useAuthStore } from "@paynless/store";
import type { UserRole } from "@paynless/types";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CreateOrganizationModal } from "../organizations/CreateOrganizationModal";

interface ProtectedRouteProps {
	children: ReactNode;
	allowedRoles?: UserRole[];
}

export function ProtectedRoute({
	children,
	allowedRoles,
}: ProtectedRouteProps) {
	const { user, isLoading } = useAuthStore();
	const location = useLocation();

	// Only show full-screen loader during initial auth check, not during form submissions
	if (isLoading && !user) {
		return (
			<div className="flex justify-center items-center min-h-screen">
				<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
			</div>
		);
	}

	// Don't redirect if we're on the register or login pages
	if (!user && !location.pathname.match(/^\/(register|login)$/)) {
		return <Navigate to="/login" />;
	}

	if (allowedRoles && user && !allowedRoles.includes(user.role as UserRole)) {
		return <Navigate to="/" />;
	}

	// Render children AND the modal for authenticated users
	return (
		<>
			{children}
			<CreateOrganizationModal />
		</>
	);
}
