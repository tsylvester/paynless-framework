import { Navigate } from "react-router-dom";
import { useAuthStore } from "@paynless/store";
import { Link } from "react-router-dom";
import { CreateDialecticProjectForm } from "../components/dialectic/CreateDialecticProjectForm";
import { WalletSelector } from "../components/ai/WalletSelector";

export function DashboardPage() {
	// Get user AND profile from the store
	const { user, profile, isLoading } = useAuthStore((state) => ({
		user: state.user,
		profile: state.profile,
		isLoading: state.isLoading,
	}));

	if (isLoading) {
		return (
			<div>
				<div className="flex justify-center items-center py-12">
					<div
						className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"
						role="progressbar"
						aria-label="Loading content"
					></div>
				</div>
			</div>
		);
	}

	if (!user) {
		return <Navigate to="/login" />;
	}

	// Determine role, prioritizing profile, then user (User object might not have role)
	const displayRole = profile?.role || user.role || "user"; // Default to 'user' if unknown

	return (
		<div>
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="mt-8 bg-surface shadow overflow-hidden sm:rounded-lg">
					<div className="border-t border-border px-6 py-6 sm:px-8">
						<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
							{/* Dashboard cards would go here */}
							<div className="bg-background overflow-hidden shadow rounded-lg">
								<div className="px-6 py-5 sm:p-6">
									<h3 className="text-lg font-medium text-textPrimary">
										Account Summary
									</h3>
									<div className="mt-4 text-sm text-textSecondary">
										<p>User ID: {user.id}</p>
										<p>Email: {user.email}</p>
										{/* Display role from profile or fallback */}
										<p>Role: {displayRole}</p>
										<p>
											Created:{" "}
											{new Date(
												user.created_at || profile?.created_at || Date.now(),
											).toLocaleDateString()}
										</p>
									</div>
								</div>
							</div>

							<div className="bg-background overflow-hidden shadow rounded-lg">
								<div className="px-6 py-5 sm:p-6">
									<h3 className="text-lg font-medium text-textPrimary">
										Recent Activity
									</h3>
									<div className="mt-4 text-sm text-textSecondary">
										<div className="flex items-center">
											<WalletSelector />{" "}
											<span className="ml-2">tokens remaining</span>
										</div>
									</div>
								</div>
							</div>

							<div className="bg-background overflow-hidden shadow rounded-lg">
								<div className="px-6 py-5 sm:p-6">
									<h3 className="text-lg font-medium text-textPrimary">
										Quick Actions
									</h3>
									<div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
										<Link
											to="/dialectic"
											className="font-medium text-primary hover:text-primary/90"
										>
											Start Project
										</Link>
										<Link
											to="/chat"
											className="font-medium text-primary hover:text-primary/90"
										>
											Start Chat
										</Link>
										<Link
											to="/subscription"
											className="font-medium text-primary hover:text-primary/90"
										>
											Subscribe
										</Link>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="mt-10 bg-background/70 backdrop-blur-md border border-border shadow-lg rounded-lg p-8">
					<CreateDialecticProjectForm />
				</div>

				<div
					className="mt-10 bg-background/70 backdrop-blur-md border border-border shadow-lg rounded-lg p-8"
					role="region"
					aria-labelledby="dialectic-introduction"
				>
					<div className="text-center">
						<h2
							id="dialectic-introduction"
							className="text-2xl font-bold text-primary tracking-tight"
						>
							<Link
								to="/dialectic"
								className="text-primary hover:text-primary/90"
							>
								From Idea to Plan in Seconds.
							</Link>
						</h2>
						<p className="mt-4 max-w-3xl mx-auto text-lg text-textSecondary">
							Our{" "}
							<Link
								to="/dialectic"
								className="text-primary hover:text-primary/90"
							>
								Dialectic Engine
							</Link>{" "}
							orchestrates multiple AI models to build robust, battle-tested
							implementation plans for your software project in moments.{" "}
							<a
								href="/docs/getting-started"
								className="text-primary hover:text-primary/90"
							>
								Learn more here
							</a>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
