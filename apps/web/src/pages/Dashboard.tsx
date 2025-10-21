import { Navigate } from "react-router-dom";
import {
	useAuthStore,
	useAiStore,
	useDialecticStore,
	useWalletStore,
} from "@paynless/store";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
	MessageSquare,
	Brain,
	Plus,
	TrendingUp,
	Users,
	Wallet,
	Clock,
	Activity,
	ChevronRight,
	Sparkles,
	Target,
	Zap,
} from "lucide-react";
import { ChatHistoryList } from "../components/ai/ChatHistoryList";
import { DialecticProjectCard } from "../components/dialectic/DialecticProjectCard";
import {
	selectDialecticProjects,
	selectIsLoadingProjects,
} from "@paynless/store";
import { selectActiveChatWalletInfo } from "@paynless/store";

export function DashboardPage() {
	const { user, profile, isLoading } = useAuthStore((state) => ({
		user: state.user,
		profile: state.profile,
		isLoading: state.isLoading,
	}));

	// Chat data
	const { chats, loadChatHistory } = useAiStore((state) => ({
		chats: state.chatsByContext.personal || [],
		loadChatHistory: state.loadChatHistory,
	}));

	// Dialectic data
	const { fetchDialecticProjects } = useDialecticStore();
	const dialecticProjects = useDialecticStore(selectDialecticProjects);
	const isLoadingProjects = useDialecticStore(selectIsLoadingProjects);

	// Wallet/Token data
	const activeChatWalletInfo = useWalletStore(selectActiveChatWalletInfo);
	const tokenBalance = activeChatWalletInfo?.balance || 0;
	const maxTokens = 100000; // Default free tier limit

	useEffect(() => {
		// Load data when component mounts
		if (profile) {
			loadChatHistory("personal");
			fetchDialecticProjects();
		}
	}, [profile, loadChatHistory, fetchDialecticProjects]);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background">
				<div className="flex justify-center items-center py-12">
					<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
				</div>
			</div>
		);
	}

	if (!user) {
		return <Navigate to="/login" />;
	}

	const recentChats = chats.slice(0, 5);
	const recentProjects = dialecticProjects.slice(0, 4);
	const tokenUsagePercentage = (tokenBalance / maxTokens) * 100;

	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-foreground mb-2">
						Welcome back, {profile?.name || user.email?.split("@")[0] || "User"}
					</h1>
					<p className="text-muted-foreground">
						Here's what's happening with your projects and conversations
					</p>
				</div>

				{/* Stats Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					{/* Token Usage */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								Tokens Remaining
							</CardTitle>
							<Wallet className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">
								{tokenBalance.toLocaleString()}
							</div>
							<div className="mt-2">
								<Progress value={tokenUsagePercentage} className="h-2" />
								<p className="text-xs text-muted-foreground mt-1">
									{Math.round(tokenUsagePercentage)}% of monthly allowance
								</p>
							</div>
						</CardContent>
					</Card>

					{/* Active Chats */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								Active Chats
							</CardTitle>
							<MessageSquare className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{chats.length}</div>
							<p className="text-xs text-muted-foreground">
								Conversations this month
							</p>
						</CardContent>
					</Card>

					{/* Dialectic Projects */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Projects</CardTitle>
							<Brain className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">
								{dialecticProjects.length}
							</div>
							<p className="text-xs text-muted-foreground">
								Dialectic projects created
							</p>
						</CardContent>
					</Card>

					{/* Account Type */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Plan</CardTitle>
							<TrendingUp className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">Free</div>
							<Button variant="link" className="p-0 h-auto text-xs" asChild>
								<Link to="/subscription">Upgrade to Pro</Link>
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Quick Actions */}
				<Card className="mb-8 border-border/50 bg-card/50 backdrop-blur-sm">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Zap className="h-5 w-5 text-primary" />
							Quick Actions
						</CardTitle>
						<CardDescription>
							Start something new or continue your work
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
							<Button asChild className="h-auto flex-col p-6 gap-2 hover:scale-105 transition-all duration-200 hover:shadow-lg">
								<Link to="/chat">
									<MessageSquare className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
									<span className="font-medium">Start Chat</span>
									<span className="text-xs opacity-80">Ask AI anything</span>
								</Link>
							</Button>

							<Button
								asChild
								variant="outline"
								className="h-auto flex-col p-6 gap-2 hover:scale-105 transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:bg-primary/5"
							>
								<Link to="/dialectic/new" className="group">
									<Brain className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
									<span className="font-medium">New Project</span>
									<span className="text-xs opacity-80">Dialectic process</span>
								</Link>
							</Button>

							<Button
								asChild
								variant="outline"
								className="h-auto flex-col p-6 gap-2 hover:scale-105 transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:bg-primary/5"
							>
								<Link to="/organizations" className="group">
									<Users className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
									<span className="font-medium">Organizations</span>
									<span className="text-xs opacity-80">Manage teams</span>
								</Link>
							</Button>

							<Button
								asChild
								variant="outline"
								className="h-auto flex-col p-6 gap-2 hover:scale-105 transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:bg-primary/5"
							>
								<Link to="/subscription" className="group">
									<Sparkles className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
									<span className="font-medium">Upgrade</span>
									<span className="text-xs opacity-80">Get more tokens</span>
								</Link>
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Main Content Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
					{/* Recent Chats */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between">
							<div>
								<CardTitle className="flex items-center gap-2">
									<MessageSquare className="h-5 w-5 text-primary" />
									Recent Conversations
								</CardTitle>
								<CardDescription></CardDescription>
							</div>
							<Button variant="ghost" size="sm" asChild>
								<Link to="/chat" className="flex items-center gap-1">
									View All <ChevronRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardHeader>
						<CardContent>
							{recentChats.length > 0 ? (
								<div className="space-y-3">
									{recentChats.map((chat) => (
										<Link
											key={chat.id}
											to={`/chat/${chat.id}`}
											className="block p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/50 transition-colors"
										>
											<div className="flex items-start justify-between">
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm truncate">
														{chat.title || `Chat ${chat.id.slice(0, 8)}...`}
													</p>
												</div>
												<Badge variant="outline" className="ml-2">
													{new Date(chat.updated_at).toLocaleDateString()}
												</Badge>
											</div>
										</Link>
									))}
								</div>
							) : (
								<div className="text-center py-8">
									<MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
									<p className="text-muted-foreground mb-4">
										No conversations yet
									</p>
									<Button asChild>
										<Link to="/chat">Start Your First Chat</Link>
									</Button>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Recent Dialectic Projects */}
					<Card className="border-border/50 bg-card/50 backdrop-blur-sm">
						<CardHeader className="flex flex-row items-center justify-between">
							<div>
								<CardTitle className="flex items-center gap-2">
									<Brain className="h-5 w-5 text-primary" />
									Dialectic Projects
								</CardTitle>
								<CardDescription></CardDescription>
							</div>
							<Button variant="ghost" size="sm" asChild>
								<Link to="/dialectic" className="flex items-center gap-1">
									View All <ChevronRight className="h-4 w-4" />
								</Link>
							</Button>
						</CardHeader>
						<CardContent>
							{!isLoadingProjects && recentProjects.length > 0 ? (
								<div className="space-y-3">
									{recentProjects.map((project) => (
										<Link
											key={project.id}
											to={`/dialectic/${project.id}`}
											className="block p-3 rounded-lg border border-border/50 hover:border-border hover:bg-muted/50 transition-colors"
										>
											<div className="flex items-start justify-between">
												<div className="flex-1 min-w-0">
													<p className="font-medium text-sm truncate">
														{project.project_name}
													</p>
												</div>
												<Badge variant={"outline"} className="ml-2">
													{new Date(project.created_at).toLocaleDateString()}
												</Badge>
											</div>
										</Link>
									))}
								</div>
							) : isLoadingProjects ? (
								<div className="flex items-center justify-center py-8">
									<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
									<span className="ml-2">Loading projects...</span>
								</div>
							) : (
								<div className="text-center py-8">
									<Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
									<p className="text-muted-foreground mb-4">No projects yet</p>
									<Button asChild>
										<Link to="/dialectic/new">Create Your First Project</Link>
									</Button>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Getting Started Section */}
				<Card className="mt-8 border-border/50 bg-gradient-to-r from-primary/5 to-primary/10 backdrop-blur-sm">
					<CardHeader className="text-center">
						<CardTitle className="flex items-center justify-center gap-2 text-xl">
							<Target className="h-6 w-6 text-primary" />
							From Idea to Plan in Seconds
						</CardTitle>
						<CardDescription className="text-base">
							Our Dialectic Engine orchestrates multiple AI models to build
							robust, battle-tested implementation plans for your software
							projects.
						</CardDescription>
					</CardHeader>
					<CardContent className="text-center">
						<div className="flex flex-col sm:flex-row gap-4 justify-center">
							<Button asChild size="lg">
								<Link to="/dialectic/new">
									<Plus className="h-4 w-4 mr-2" />
									Start New Project
								</Link>
							</Button>
							<Button variant="outline" size="lg" asChild>
								<Link to="/docs">Learn More</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
