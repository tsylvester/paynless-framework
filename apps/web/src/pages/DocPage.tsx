import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentInfo {
	slug: string;
	title: string;
	description: string;
	category: string;
	order: number;
}

interface DocsIndex {
	documents: DocumentInfo[];
}

export function DocPage() {
	const { documentSlug } = useParams<{ documentSlug: string }>();
	const [content, setContent] = useState<string>("");
	const [docInfo, setDocInfo] = useState<DocumentInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchDocument = async () => {
			if (!documentSlug) {
				setError("Document slug is missing");
				setLoading(false);
				return;
			}

			try {
				// First, fetch the docs index to get document info
				const indexResponse = await fetch("/docs/docs-index.json");
				if (indexResponse.ok) {
					const docsIndex: DocsIndex = await indexResponse.json();
					const foundDoc = docsIndex.documents.find(
						(doc) => doc.slug === documentSlug,
					);
					if (foundDoc) {
						setDocInfo(foundDoc);
					}
				}

				// Then fetch the document content
				const contentResponse = await fetch(`/docs/${documentSlug}.md`);
				if (!contentResponse.ok) {
					throw new Error("Document not found");
				}
				const markdownContent = await contentResponse.text();

				// Simple markdown to HTML conversion
				const htmlContent = convertMarkdownToHtml(markdownContent);
				setContent(htmlContent);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load document",
				);
			} finally {
				setLoading(false);
			}
		};

		fetchDocument();
	}, [documentSlug]);

	// Simple markdown to HTML converter
	const convertMarkdownToHtml = (markdown: string): string => {
		return (
			markdown
				// Headers
				.replace(
					/^### (.*$)/gim,
					'<h3 class="text-xl font-semibold mt-8 mb-4">$1</h3>',
				)
				.replace(
					/^## (.*$)/gim,
					'<h2 class="text-2xl font-semibold mt-10 mb-6">$1</h2>',
				)
				.replace(
					/^# (.*$)/gim,
					'<h1 class="text-3xl font-bold mt-12 mb-8">$1</h1>',
				)

				// Code blocks
				.replace(
					/```json\n([\s\S]*?)```/gim,
					'<pre class="bg-muted p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">$1</code></pre>',
				)
				.replace(
					/```([\s\S]*?)```/gim,
					'<pre class="bg-muted p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">$1</code></pre>',
				)

				// Inline code
				.replace(
					/`([^`]+)`/gim,
					'<code class="bg-muted px-2 py-1 rounded text-sm">$1</code>',
				)

				// Bold text
				.replace(/\*\*(.*)\*\*/gim, '<strong class="font-semibold">$1</strong>')

				// Links
				.replace(
					/\[([^\]]+)\]\(([^)]+)\)/gim,
					'<a href="$2" class="text-primary hover:underline">$1</a>',
				)

				// Lists
				.replace(/^\- (.*$)/gim, '<li class="ml-4">$1</li>')
				.replace(/^(\d+)\. (.*$)/gim, '<li class="ml-4">$2</li>')

				// Paragraphs
				.replace(/\n\n/gim, '</p><p class="mb-4">')
				.replace(
					/^(?!<[h1-6]|<pre|<li|<ul|<ol)(.+)$/gim,
					'<p class="mb-4">$1</p>',
				)
		);
	};

	if (!documentSlug) {
		return <Navigate to="/docs" replace />;
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-8">
					<div className="flex items-center justify-center min-h-[400px]">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-background">
				<div className="container mx-auto px-4 py-8">
					<div className="text-center">
						<h1 className="text-4xl font-bold text-red-600 mb-4">
							Document Not Found
						</h1>
						<p className="text-muted-foreground mb-6">{error}</p>
						<Link to="/docs">
							<Button>
								<ArrowLeft className="h-4 w-4 mr-2" />
								Back to Documentation
							</Button>
						</Link>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				{/* Header */}
				<div className="mb-8">
					<div className="flex items-center justify-between mb-4">
						{/* <Link to="/docs/getting-started">
							<Button variant="ghost">
								<ArrowLeft className="h-4 w-4 mr-2" />
								Back to Getting Started
							</Button>
						</Link> */}
						{/* <Link to="/docs-all">
							<Button variant="outline" size="sm">
								<BookOpen className="h-4 w-4 mr-2" />
								All Docs
							</Button>
						</Link> */}
					</div>
				</div>

				{/* Content */}
				<div className="max-w-4xl mx-auto">
					<h1 className="text-3xl font-bold flex items-center my-5 gap-3">
						<BookOpen className="h-8 w-8 mr-3 text-gray-500" />
						{docInfo.title}
					</h1>
					<Card>
						<CardContent className="p-8">
							<div
								className={cn(
									"prose prose-slate dark:prose-invert max-w-none",
									"prose-headings:scroll-mt-20",
									"prose-pre:bg-muted prose-pre:border",
									"prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
									"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
								)}
								dangerouslySetInnerHTML={{ __html: content }}
							/>
						</CardContent>
					</Card>
				</div>

				{/* Footer Actions */}
				<div className="mt-8 flex items-center justify-between">
					{/* <Link to="/docs-all">
						<Button variant="outline">
							<ArrowLeft className="h-4 w-4 mr-2" />
							All Documentation
						</Button>
					</Link> */}

					<div className="flex items-center space-x-2"></div>
				</div>
			</div>
		</div>
	);
}
