import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
	handleCorsPreflightRequest,
	createErrorResponse,
	createSuccessResponse,
} from "../_shared/cors-headers.ts";
import { logger } from "../_shared/logger.ts";
import type { Database } from "../types_db.ts";

// Socket.IO compatible message types
interface SocketMessage {
	type: "connect" | "disconnect" | "message" | "event" | "ack" | "error";
	event?: string;
	data?: unknown;
	id?: string;
	namespace?: string;
}

// Type for room/event data
interface RoomData {
	room: string;
	message?: string;
	[key: string]: unknown;
}

interface ClientConnection {
	id: string;
	socket: WebSocket;
	userId?: string;
	rooms: Set<string>;
	lastSeen: Date;
}

// In-memory store for connections (in production, consider using Redis)
const connections = new Map<string, ClientConnection>();
const rooms = new Map<string, Set<string>>(); // room -> set of connection IDs

// Generate a unique connection ID
function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Socket.IO compatible message formatter
function formatMessage(
	type: SocketMessage["type"],
	event?: string,
	data?: unknown,
	id?: string,
): string {
	const message: SocketMessage = { type };
	if (event) message.event = event;
	if (data !== undefined) message.data = data;
	if (id) message.id = id;
	return JSON.stringify(message);
}

// Handle WebSocket upgrade and Socket.IO compatibility
function handleWebSocket(request: Request): Response {
	const upgrade = request.headers.get("upgrade") || "";
	if (upgrade.toLowerCase() !== "websocket") {
		return new Response("Expected websocket", { status: 426 });
	}

	// Check for authorization - for development, allow connections with just an API key
	const authHeader = request.headers.get("Authorization");
	const url = new URL(request.url);
	const apiKey =
		url.searchParams.get("apikey") || request.headers.get("apikey");
	const authFromUrl = url.searchParams.get("authorization");

	// For development, be more permissive with authentication
	const isDevelopment = Deno.env.get("ENVIRONMENT") !== "production";
	if (!isDevelopment && !authHeader && !apiKey && !authFromUrl) {
		logger.warn(
			"WebSocket connection attempted without authentication in production",
		);
		return new Response("Authentication required", { status: 401 });
	}

	// Log the authentication attempt for debugging
	logger.info("WebSocket auth attempt", {
		hasAuthHeader: !!authHeader,
		hasApiKey: !!apiKey,
		hasAuthFromUrl: !!authFromUrl,
		isDevelopment,
	});

	const { socket, response } = Deno.upgradeWebSocket(request);
	const connectionId = generateConnectionId();

	// Extract user info from query params or headers
	const userId =
		url.searchParams.get("userId") || request.headers.get("x-user-id");
	const _token = apiKey || authHeader?.replace("Bearer ", "");

	logger.info(`WebSocket connection attempt`, { connectionId, userId });

	socket.onopen = () => {
		const connection: ClientConnection = {
			id: connectionId,
			socket,
			userId: userId || undefined,
			rooms: new Set(),
			lastSeen: new Date(),
		};

		connections.set(connectionId, connection);

		// Send Socket.IO compatible connection message
		socket.send(
			formatMessage("connect", "connect", {
				id: connectionId,
				userId: userId || null,
			}),
		);

		logger.info(`Client connected`, {
			connectionId,
			userId,
			totalConnections: connections.size,
		});
	};

	socket.onmessage = async (event) => {
		try {
			const connection = connections.get(connectionId);
			if (!connection) {
				logger.warn(`Message from unknown connection`, { connectionId });
				return;
			}

			connection.lastSeen = new Date();

			const message: SocketMessage = JSON.parse(event.data);
			logger.info(`Received message`, { connectionId, message });

			await handleSocketMessage(connection, message);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			logger.error(`Error handling message`, {
				connectionId,
				error: errorMessage,
			});
			socket.send(
				formatMessage("error", "error", { message: "Invalid message format" }),
			);
		}
	};

	socket.onclose = () => {
		handleDisconnection(connectionId);
	};

	socket.onerror = (error) => {
		logger.error(`WebSocket error`, { connectionId, error });
		handleDisconnection(connectionId);
	};

	return response;
}

// Handle Socket.IO compatible messages
async function handleSocketMessage(
	connection: ClientConnection,
	message: SocketMessage,
): Promise<void> {
	const { type, event, data, id: _id } = message;

	switch (type) {
		case "message":
			await handleMessageEvent(connection, event || "message", data);
			break;

		case "event":
			if (event) {
				await handleCustomEvent(connection, event, data);
			}
			break;

		case "connect": {
			// Handle reconnection or room joining
			const connectData = data as RoomData | undefined;
			if (connectData?.room) {
				await joinRoom(connection, connectData.room);
			}
			break;
		}

		default:
			logger.warn(`Unknown message type`, {
				connectionId: connection.id,
				type,
			});
	}
}

// Handle custom events
async function handleCustomEvent(
	connection: ClientConnection,
	event: string,
	data: unknown,
): Promise<void> {
	logger.info(`Handling custom event`, {
		connectionId: connection.id,
		event,
		data,
	});

	const eventData = data as RoomData | undefined;

	switch (event) {
		case "join-room":
			if (eventData?.room) {
				await joinRoom(connection, eventData.room);
			}
			break;

		case "leave-room":
			if (eventData?.room) {
				await leaveRoom(connection, eventData.room);
			}
			break;

		case "broadcast":
			if (eventData?.room && eventData?.message) {
				await broadcastToRoom(
					eventData.room,
					event,
					eventData.message,
					connection.id,
				);
			}
			break;

		case "chat-message":
			// Example: Handle chat messages
			handleChatMessage(connection, data);
			break;

		default:
			// Echo back unknown events for testing
			connection.socket.send(formatMessage("event", `echo-${event}`, data));
	}
}

// Handle regular message events
async function handleMessageEvent(
	connection: ClientConnection,
	event: string,
	data: unknown,
): Promise<void> {
	// Broadcast message to all connections in the same rooms
	for (const room of connection.rooms) {
		await broadcastToRoom(room, event, data, connection.id);
	}

	// If not in any rooms, broadcast to all connections (global)
	if (connection.rooms.size === 0) {
		await broadcastToAll(event, data, connection.id);
	}
}

// Room management
async function joinRoom(
	connection: ClientConnection,
	roomName: string,
): Promise<void> {
	connection.rooms.add(roomName);

	if (!rooms.has(roomName)) {
		rooms.set(roomName, new Set());
	}
	const roomConnections = rooms.get(roomName);
	if (roomConnections) {
		roomConnections.add(connection.id);
	}

	// Notify client of successful room join
	connection.socket.send(
		formatMessage("event", "room-joined", { room: roomName }),
	);

	// Notify other room members
	await broadcastToRoom(
		roomName,
		"user-joined",
		{
			userId: connection.userId,
			connectionId: connection.id,
		},
		connection.id,
	);

	logger.info(`Client joined room`, {
		connectionId: connection.id,
		room: roomName,
	});
}

async function leaveRoom(
	connection: ClientConnection,
	roomName: string,
): Promise<void> {
	connection.rooms.delete(roomName);

	const roomConnections = rooms.get(roomName);
	if (roomConnections) {
		roomConnections.delete(connection.id);
		if (roomConnections.size === 0) {
			rooms.delete(roomName);
		}
	}

	// Notify client of successful room leave
	connection.socket.send(
		formatMessage("event", "room-left", { room: roomName }),
	);

	// Notify other room members
	await broadcastToRoom(
		roomName,
		"user-left",
		{
			userId: connection.userId,
			connectionId: connection.id,
		},
		connection.id,
	);

	logger.info(`Client left room`, {
		connectionId: connection.id,
		room: roomName,
	});
}

// Broadcasting functions
function broadcastToRoom(
	roomName: string,
	event: string,
	data: unknown,
	excludeConnectionId?: string,
): void {
	const roomConnections = rooms.get(roomName);
	if (!roomConnections) return;

	const message = formatMessage("event", event, data);

	for (const connectionId of roomConnections) {
		if (connectionId === excludeConnectionId) continue;

		const connection = connections.get(connectionId);
		if (connection && connection.socket.readyState === WebSocket.OPEN) {
			try {
				connection.socket.send(message);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				logger.error(`Failed to send message to connection`, {
					connectionId,
					error: errorMessage,
				});
				handleDisconnection(connectionId);
			}
		}
	}
}

function broadcastToAll(
	event: string,
	data: unknown,
	excludeConnectionId?: string,
): void {
	const message = formatMessage("event", event, data);

	for (const [connectionId, connection] of connections) {
		if (connectionId === excludeConnectionId) continue;

		if (connection.socket.readyState === WebSocket.OPEN) {
			try {
				connection.socket.send(message);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				logger.error(`Failed to send message to connection`, {
					connectionId,
					error: errorMessage,
				});
				handleDisconnection(connectionId);
			}
		}
	}
}

// Handle chat message example
function handleChatMessage(connection: ClientConnection, data: unknown): void {
	const chatData = data as { message?: string; room?: string };
	const { message, room } = chatData;

	if (!message || !room) {
		connection.socket.send(
			formatMessage("error", "error", {
				message: "Message and room are required",
			}),
		);
		return;
	}

	// Here you could save the message to Supabase database
	const _supabase = createClient<Database>(
		Deno.env.get("SUPABASE_URL") ?? "",
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
	);

	// Example: Save to a chat_messages table
	// const { error } = await supabase
	//     .from('chat_messages')
	//     .insert({
	//         user_id: connection.userId,
	//         room: room,
	//         message: message,
	//         created_at: new Date().toISOString()
	//     })

	// Broadcast the message to the room
	broadcastToRoom(room, "chat-message", {
		userId: connection.userId,
		message,
		timestamp: new Date().toISOString(),
	});

	logger.info(`Chat message handled`, {
		connectionId: connection.id,
		room,
		message,
	});
}

// Clean up disconnected clients
function handleDisconnection(connectionId: string): void {
	const connection = connections.get(connectionId);
	if (!connection) return;

	// Remove from all rooms
	for (const roomName of connection.rooms) {
		const roomConnections = rooms.get(roomName);
		if (roomConnections) {
			roomConnections.delete(connectionId);
			if (roomConnections.size === 0) {
				rooms.delete(roomName);
			}

			// Notify other room members
			broadcastToRoom(
				roomName,
				"user-left",
				{
					userId: connection.userId,
					connectionId: connectionId,
				},
				connectionId,
			);
		}
	}

	connections.delete(connectionId);
	logger.info(`Client disconnected`, {
		connectionId,
		totalConnections: connections.size,
	});
}

// HTTP endpoint for Socket.IO handshake and status
function handleHttpRequest(request: Request): Response {
	const url = new URL(request.url);
	const path = url.pathname;

	// Handle Socket.IO polling fallback (for clients that can't use WebSocket)
	if (path.includes("/socket.io/")) {
		return createSuccessResponse(
			{
				message: "Socket.IO endpoint - use WebSocket connection",
				websocketUrl: url.origin.replace("http", "ws") + "/socket-io",
				activeConnections: connections.size,
				activeRooms: rooms.size,
			},
			200,
			request,
		);
	}

	// Status endpoint - allow without authentication for monitoring
	if (path === "/status" || path.endsWith("/status")) {
		return createSuccessResponse(
			{
				status: "active",
				connections: connections.size,
				rooms: Array.from(rooms.keys()),
				uptime: "N/A", // Deno doesn't have process.uptime
			},
			200,
			request,
		);
	}

	// Default response with usage instructions - allow without authentication
	return createSuccessResponse(
		{
			message: "Socket.IO Edge Function",
			usage: {
				websocket: "Connect to WebSocket at this endpoint",
				messageFormat: "Send JSON messages with type, event, and data fields",
				events: [
					'join-room - Join a room: {type: "event", event: "join-room", data: {room: "roomName"}}',
					'leave-room - Leave a room: {type: "event", event: "leave-room", data: {room: "roomName"}}',
					'chat-message - Send chat: {type: "event", event: "chat-message", data: {room: "roomName", message: "text"}}',
					'broadcast - Broadcast to room: {type: "event", event: "broadcast", data: {room: "roomName", message: "data"}}',
				],
			},
			status: {
				connections: connections.size,
				rooms: Array.from(rooms.keys()),
			},
		},
		200,
		request,
	);
}

// Cleanup interval to remove stale connections
setInterval(() => {
	const now = new Date();
	const staleThreshold = 5 * 60 * 1000; // 5 minutes

	for (const [connectionId, connection] of connections) {
		if (now.getTime() - connection.lastSeen.getTime() > staleThreshold) {
			if (connection.socket.readyState !== WebSocket.OPEN) {
				handleDisconnection(connectionId);
			}
		}
	}
}, 60000); // Check every minute

// Main request handler
serve((request: Request) => {
	// Check for status endpoint first, before any other checks
	const url = new URL(request.url);
	if (url.pathname.endsWith("/status")) {
		return createSuccessResponse(
			{
				status: "active",
				connections: connections.size,
				rooms: Array.from(rooms.keys()),
				uptime: "N/A",
			},
			200,
			request,
		);
	}

	// Handle CORS preflight
	if (request.method === "OPTIONS") {
		const preflightResponse = handleCorsPreflightRequest(request);
		return preflightResponse || new Response(null, { status: 204 });
	}

	try {
		// Check if this is a WebSocket upgrade request
		const upgradeHeader = request.headers.get("upgrade");
		if (upgradeHeader?.toLowerCase() === "websocket") {
			return handleWebSocket(request);
		}

		// Handle regular HTTP requests
		const response = handleHttpRequest(request);
		return response;
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		const errorStack = error instanceof Error ? error.stack : undefined;
		logger.error("Socket.IO function error", {
			error: errorMessage,
			stack: errorStack,
		});
		return createErrorResponse("Internal server error", 500, request, error);
	}
});
