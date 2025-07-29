# Socket.IO Edge Function

A WebSocket-based real-time communication function that provides Socket.IO compatible functionality on Supabase Edge Functions.

## Features

- **WebSocket Support**: Full-duplex real-time communication
- **Socket.IO Compatibility**: Uses Socket.IO-like message format
- **Room Management**: Join/leave rooms for targeted messaging
- **Broadcasting**: Send messages to all users in a room or globally
- **CORS Support**: Proper CORS handling for web clients
- **Error Handling**: Comprehensive error handling and logging
- **Connection Management**: Automatic cleanup of stale connections

## Usage

### WebSocket Connection

Connect to the WebSocket endpoint with optional user identification:

```javascript
const ws = new WebSocket('ws://localhost:54321/functions/v1/socket-io?userId=user123');
```

### Message Format

All messages follow this JSON structure:

```typescript
interface SocketMessage {
    type: 'connect' | 'disconnect' | 'message' | 'event' | 'ack' | 'error'
    event?: string
    data?: any
    id?: string
    namespace?: string
}
```

### Basic Events

#### Join a Room
```javascript
ws.send(JSON.stringify({
    type: 'event',
    event: 'join-room',
    data: { room: 'chat-room-1' }
}));
```

#### Leave a Room
```javascript
ws.send(JSON.stringify({
    type: 'event',
    event: 'leave-room',
    data: { room: 'chat-room-1' }
}));
```

#### Send Chat Message
```javascript
ws.send(JSON.stringify({
    type: 'event',
    event: 'chat-message',
    data: { 
        room: 'chat-room-1', 
        message: 'Hello everyone!' 
    }
}));
```

#### Broadcast to Room
```javascript
ws.send(JSON.stringify({
    type: 'event',
    event: 'broadcast',
    data: { 
        room: 'chat-room-1', 
        message: 'Important announcement!' 
    }
}));
```

### Receiving Messages

```javascript
ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
        case 'connect':
            console.log('Connected with ID:', message.data.id);
            break;
            
        case 'event':
            switch (message.event) {
                case 'room-joined':
                    console.log('Joined room:', message.data.room);
                    break;
                    
                case 'chat-message':
                    console.log('New message:', message.data.message);
                    break;
                    
                case 'user-joined':
                    console.log('User joined:', message.data.userId);
                    break;
                    
                case 'user-left':
                    console.log('User left:', message.data.userId);
                    break;
            }
            break;
            
        case 'error':
            console.error('Socket error:', message.data.message);
            break;
    }
};
```

## HTTP Endpoints

### Status Endpoint
```
GET /socket-io/status
```

Returns server status and statistics:
```json
{
    "status": "active",
    "connections": 5,
    "rooms": ["chat-room-1", "lobby"],
    "uptime": "N/A"
}
```

### Socket.IO Compatibility Endpoint
```
GET /socket-io/socket.io/
```

Returns information for Socket.IO clients:
```json
{
    "message": "Socket.IO endpoint - use WebSocket connection",
    "websocketUrl": "ws://localhost:54321/functions/v1/socket-io",
    "activeConnections": 5,
    "activeRooms": 2
}
```

## Client Implementation Examples

### JavaScript/TypeScript
```typescript
class SocketClient {
    private ws: WebSocket | null = null;
    private connectionId: string | null = null;
    
    connect(url: string, userId?: string) {
        const wsUrl = userId ? `${url}?userId=${userId}` : url;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => console.log('Connected');
        this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
        this.ws.onclose = () => console.log('Disconnected');
        this.ws.onerror = (error) => console.error('WebSocket error:', error);
    }
    
    joinRoom(room: string) {
        this.send('event', 'join-room', { room });
    }
    
    sendMessage(room: string, message: string) {
        this.send('event', 'chat-message', { room, message });
    }
    
    private send(type: string, event: string, data: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, event, data }));
        }
    }
    
    private handleMessage(message: any) {
        // Handle incoming messages
        console.log('Received:', message);
    }
}
```

### React Hook
```typescript
import { useEffect, useRef, useState } from 'react';

export function useSocket(url: string, userId?: string) {
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const ws = useRef<WebSocket | null>(null);
    
    useEffect(() => {
        const wsUrl = userId ? `${url}?userId=${userId}` : url;
        ws.current = new WebSocket(wsUrl);
        
        ws.current.onopen = () => setConnected(true);
        ws.current.onclose = () => setConnected(false);
        ws.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            setMessages(prev => [...prev, message]);
        };
        
        return () => {
            ws.current?.close();
        };
    }, [url, userId]);
    
    const send = (type: string, event: string, data: any) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type, event, data }));
        }
    };
    
    return { connected, messages, send };
}
```

## Testing

Use the included `test-client.html` file to test the Socket.IO function:

1. Start your Supabase local development server
2. Open `test-client.html` in a web browser
3. Connect to the WebSocket endpoint
4. Test room joining, messaging, and broadcasting features

## Environment Variables

The function uses these Supabase environment variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

## Database Integration

The function includes commented examples for saving messages to a Supabase database. Uncomment and modify as needed:

```typescript
// Example: Save to a chat_messages table
const { error } = await supabase
    .from('chat_messages')
    .insert({
        user_id: connection.userId,
        room: room,
        message: message,
        created_at: new Date().toISOString()
    });
```

## Error Handling

The function includes comprehensive error handling:
- Invalid message format errors
- Connection cleanup on errors
- Automatic reconnection for clients
- Stale connection cleanup (every 60 seconds)

## CORS Configuration

CORS is configured to allow connections from:
- `http://localhost:5173` (Local Vite dev server)
- `https://paynless.app` (Production URL)
- `https://paynless-framework.netlify.app` (Netlify deployment)

Modify the `allowedOrigins` array in `cors-headers.ts` to add your domains.

## Deployment

Deploy using the Supabase CLI:

```bash
supabase functions deploy socket-io
```

## Architecture Notes

- **In-memory storage**: Connections and rooms are stored in memory. For production with multiple instances, consider using Redis.
- **Stateless design**: Each function instance maintains its own state. Use database or external storage for persistent state.
- **Cleanup mechanism**: Automatic cleanup prevents memory leaks from stale connections.
- **WebSocket-first**: Optimized for WebSocket connections rather than HTTP polling.

## Troubleshooting

### Connection Issues
- Ensure WebSocket URL is correct (`ws://` for HTTP, `wss://` for HTTPS)
- Check CORS configuration for your domain
- Verify Supabase Edge Functions are running

### Message Delivery
- Ensure both sender and receiver are in the same room
- Check connection status before sending messages
- Monitor browser console for errors

### Performance
- Consider implementing connection limits
- Monitor memory usage for large numbers of connections
- Implement rate limiting for message sending if needed
