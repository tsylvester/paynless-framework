#!/usr/bin/env node

// Test script to verify streaming chat functionality
console.log("Testing streaming chat functionality...");

const streamingUrl = "http://127.0.0.1:54321/functions/v1/chat-stream";
const supabaseAnonKey =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const testStreamingRequest = async () => {
	try {
		console.log("Making streaming request...");

		const response = await fetch(streamingUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: supabaseAnonKey,
				Authorization: `Bearer ${supabaseAnonKey}`,
			},
			body: JSON.stringify({
				message: "Test streaming message",
				providerId: "11111111-1111-1111-1111-111111111111",
				promptId: null,
			}),
		});

		console.log("Response status:", response.status, response.statusText);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`HTTP ${response.status}: ${response.statusText} - ${errorText}`,
			);
		}

		if (!response.body) {
			throw new Error("No response body");
		}

		console.log("✅ Successfully connected to streaming endpoint");
		console.log("📡 Reading streaming response...");

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split("\n");

				for (const line of lines) {
					if (line.startsWith("event: ") && line.includes("chunk")) {
						const nextLineIndex = lines.indexOf(line) + 1;
						const nextLine = lines[nextLineIndex];
						if (nextLine?.startsWith("data: ")) {
							try {
								const data = JSON.parse(nextLine.substring(6));
								if (data.content) {
									fullContent += data.content;
									console.log(`📦 Chunk received: "${data.content}"`);
								}
							} catch (e) {
								console.warn("Failed to parse chunk data:", e);
							}
						}
					} else if (line.startsWith("event: ") && line.includes("complete")) {
						console.log("✅ Streaming completed successfully");
						console.log(`📝 Full content: "${fullContent}"`);
						return;
					} else if (line.startsWith("event: ") && line.includes("error")) {
						const nextLineIndex = lines.indexOf(line) + 1;
						const nextLine = lines[nextLineIndex];
						if (nextLine?.startsWith("data: ")) {
							try {
								const data = JSON.parse(nextLine.substring(6));
								throw new Error(data.error || "Streaming error");
							} catch (e) {
								throw new Error("Unknown streaming error");
							}
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		console.log("✅ Stream reading completed");
	} catch (error) {
		console.error("❌ Test failed:", error.message);
		process.exit(1);
	}
};

testStreamingRequest();
