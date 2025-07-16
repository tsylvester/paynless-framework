export default function Help() {
	return (
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
					<Link to="/dialectic" className="text-primary hover:text-primary/90">
						From Idea to Plan in Seconds.
					</Link>
				</h2>
				<p className="mt-4 max-w-3xl mx-auto text-lg text-textSecondary">
					Our{" "}
					<Link to="/dialectic" className="text-primary hover:text-primary/90">
						Dialectic Engine
					</Link>{" "}
					orchestrates multiple AI models to build robust, battle-tested
					implementation plans for your software project in moments.
				</p>
			</div>

			<div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
				{/* How It Works Section */}
				<div className="space-y-4">
					<h3 className="text-xl font-semibold text-textPrimary">
						How It Works
					</h3>
					<ol className="list-decimal list-inside space-y-3 text-textSecondary">
						<li>
							<strong className="font-medium text-textPrimary">
								Submit Your Vision:
							</strong>{" "}
							Start a new Project with a simple problem statement. Use text
							input, or upload a markdown file. Explain what you want to build,
							and our AI team gets to work.
						</li>
						<li>
							<strong className="font-medium text-textPrimary">
								Pick Your Players:
							</strong>{" "}
							Use any AI model in our library, as many as you want. <br />
							(We recommend 3.)
						</li>
						<li>
							<strong className="font-medium text-textPrimary">
								AI-Powered{" "}
								<Link
									to="/dialectic"
									className="text-primary hover:text-primary/90"
								>
									Dialectic
								</Link>
								:
							</strong>
							<ul className="list-disc list-inside ml-5 mt-1">
								<li>
									<span className="font-semibold">Thesis (Idea):</span> Multiple
									AIs generate unique, diverse approaches.
								</li>
								<li>
									<span className="font-semibold">Antithesis (Critique):</span>{" "}
									The AIs critique each other's work, finding flaws and blind
									spots.
								</li>
								<li>
									<span className="font-semibold">Synthesis (Merge):</span> The
									best ideas are merged into a unified, superior plan.
								</li>
								<li>
									<span className="font-semibold">
										Parenthesis (Formalize):
									</span>{" "}
									The AIs transform the plan into a detailed, actionable
									checklist of explicit, specific prompts that explain exactly
									how to perform each step.
								</li>
								<li>
									<span className="font-semibold">Paralysis (Organize):</span>{" "}
									The AIs organize the plan into a structured, easy-to-follow
									plan that's impossible to mess up.
								</li>
							</ul>
						</li>
						<li>
							<strong className="font-medium text-textPrimary">
								Generate Key Documents:
							</strong>{" "}
							We generate Product Requirements Documents (PRDs), use cases,
							business cases, and a full, detailed implementation plan suitable
							for any developer.
						</li>
					</ol>
				</div>

				{/* Features & What's Next Section */}
				<div className="space-y-4">
					<h3 className="text-xl font-semibold text-textPrimary">
						Features & What's Next
					</h3>
					<div className="text-textSecondary space-y-3">
						<p>
							Our implementation plans are a structured checklist of prompts
							that can be fed into a coding agent, or implemented manually by a
							team of developers.
						</p>
						<p>
							We support individuals and organizations with powerful tools,
							including an innovative context-managed multi-user{" "}
							<Link to="/chat" className="text-primary hover:text-primary/90">
								AI Chat
							</Link>{" "}
							and our groundbreaking structured{" "}
							<Link
								to="/dialectic"
								className="text-primary hover:text-primary/90"
							>
								Dialectic
							</Link>{" "}
							process.
						</p>
						<p>
							Chat with coworkers about your project, pull an AI model into the
							chat for its opinion, and transition seamlessly into an
							implementation plan that explains exactly how to build the
							feature.
						</p>
					</div>
					<div className="mt-10">
						<h3 className="text-xl font-semibold text-textPrimary">
							Coming Soon:
						</h3>
						<p className="text-textSecondary">
							We're constantly rolling out new capabilities. Get ready for
							direct plan exporting to GitHub and a powerful CLI to sync your
							projects with Linear, Jira, Microsoft Project, and your other
							favorite tools.
							<br />
							We're working on importing plan documents into the dialectic so
							that your agents know exactly what to build.
						</p>
					</div>
					<div className="mt-10">
						<div>
							<h3 className="text-xl font-semibold text-textPrimary">
								Get Started for Free
							</h3>
							<p className="text-textSecondary">
								All users get{" "}
								<span className="font-semibold text-primary">
									100k tokens per month
								</span>
								. Need more power and features? Check out our{" "}
								<Link
									to="/subscription"
									className="text-primary hover:text-primary/90"
								>
									subscription options
								</Link>{" "}
								10m tokens start at $19.99/month or $199.99/year.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
