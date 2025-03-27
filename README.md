# AI Chat Framework

A robust authentication system with ChatGPT integration built with React, Vite, TypeScript, and Supabase. This framework provides user authentication with sign-in, sign-up, and sign-out functionality, along with email validation and password reset capabilities. It also features a complete ChatGPT integration with conversation history tracking.

## File Structure

```
/
├── .env                 # Environment variables
├── .env.example         # Example environment variables
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignIn.tsx         # Sign in component
│   │   │   ├── SignUp.tsx         # Sign up component
│   │   │   ├── SignOut.tsx        # Sign out component
│   │   │   ├── ResetPassword.tsx  # Reset password component
│   │   │   └── UpdatePassword.tsx # Update password component
│   │   ├── chat/
│   │   │   ├── ChatContainer.tsx   # Main chat container component
│   │   │   ├── ChatHistory.tsx     # Chat message history component
│   │   │   ├── ChatHistoryCard.tsx # Card for displaying chat history
│   │   │   ├── ChatInput.tsx       # Input component for chat messages
│   │   │   └── ChatMessage.tsx     # Individual message component
│   │   ├── profile/
│   │   │   ├── ProfileField.tsx          # Reusable profile field component
│   │   │   ├── UserNameField.tsx         # Username field component
│   │   │   ├── EmailField.tsx            # Email field component
│   │   │   ├── PasswordChangeField.tsx   # Password change component
│   │   │   └── EmailVerificationBanner.tsx # Email verification status banner
│   │   └── layout/
│   │       ├── Header.tsx         # Application header with navigation
│   │       ├── Footer.tsx         # Application footer
│   │       └── Layout.tsx         # Main layout wrapper
│   ├── context/
│   │   ├── AuthContext.tsx        # Authentication context provider
│   │   └── ChatContext.tsx        # Chat context provider for OpenAI integration
│   ├── pages/
│   │   ├── Home.tsx               # Home page with auth status display
│   │   ├── Landing.tsx            # Landing page with chat functionality
│   │   ├── Profile.tsx            # User profile page with editing capabilities
│   │   ├── AuthCallbackPage.tsx   # Handle auth callbacks
│   │   ├── ChatHistoryPage.tsx    # Page for viewing chat history
│   │   └── ChatDetailsPage.tsx    # Page for viewing chat details
│   ├── services/
│   │   ├── supabase.ts            # Supabase client and methods
│   │   └── chatService.ts         # Services for OpenAI integration
│   ├── types/
│   │   ├── auth.types.ts          # Type definitions for auth components
│   │   └── chat.types.ts          # Type definitions for chat components
│   ├── utils/
│   │   ├── logger.ts              # Logging utility
│   │   ├── network.ts             # Network status monitoring
│   │   └── retry.ts               # Retry mechanism for API calls
│   ├── App.tsx                    # Main app component with routing
│   ├── index.css                  # Global styles
│   └── main.tsx                   # Entry point
├── supabase/
│   ├── migrations/                # SQL migrations for database setup
│   └── functions/
│       └── chat/                  # Supabase Edge Function for OpenAI integration
├── tests/
│   ├── auth.test.tsx              # Tests for auth components
│   └── setup.ts                   # Test environment setup
├── package.json                   # Project dependencies
├── tsconfig.json                  # TypeScript configuration
└── vite.config.ts                 # Vite configuration
```

## Core Framework Files (Do Not Modify)

These files are fundamental to the authentication system and should not be modified:

* `src/context/AuthContext.tsx` - Provides authentication state and methods
  * Arguments: `children` (ReactNode)
  * Outputs: AuthContext with authentication state and methods

* `src/services/supabase.ts` - Handles Supabase integration
  * Arguments: None
  * Outputs: Supabase client and authentication helper functions

* `src/utils/logger.ts` - Logging service
  * Arguments: Message string and optional arguments
  * Outputs: Formatted console logs with timestamp and level

* `src/types/auth.types.ts` - TypeScript interfaces for auth system
  * Arguments: None
  * Outputs: Type definitions for authentication components and state

## Available Functions

### Auth Context (`src/context/AuthContext.tsx`)

The `AuthProvider` component provides the authentication context and the following functions:

```typescript
// Get the current authentication state
const { user, session, isLoading, error, networkStatus, authStatus, isOnline } = useAuth();

// Sign in with email and password
signIn(email: string, password: string): Promise<void>

// Sign up with email and password
signUp(email: string, password: string): Promise<void>

// Sign out the current user
signOut(): Promise<void>

// Send password reset email
resetPassword(email: string): Promise<void>

// Update user password
updatePassword(password: string): Promise<void>

// Retry authentication process if it fails
retryAuth(): Promise<void>
```

### Chat Context (`src/context/ChatContext.tsx`)

The `ChatProvider` component provides the chat context and the following functions:

```typescript
// Get the current chat state
const { messages, isLoading, error, systemPrompts, selectedPrompt } = useChat();

// Send a chat message
sendMessage(message: string, systemPromptName?: string): Promise<void>

// Clear the current chat
clearChat(): void

// Set the selected system prompt
setSelectedPrompt(promptName: string): void
```

### Supabase Service (`src/services/supabase.ts`)

```typescript
// Get Supabase client instance
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get current user
getUser(): Promise<User | null>

// Get current session
getSession(): Promise<Session | null>

// Refresh the current session
refreshSession(): Promise<boolean>

// Safely sign out the user (handles offline state)
safeSignOut(): Promise<boolean>

// Categorize authentication errors
categorizeAuthError(error: any): AuthErrorType
```

### Chat Service (`src/services/chatService.ts`)

```typescript
// Send a chat message to OpenAI API
sendChatMessage(
  prompt: string, 
  previousMessages?: ChatMessage[],
  systemPromptName?: string
): Promise<{ response: string; messages: ChatMessage[] }>

// Get available system prompts
getSystemPrompts(): Promise<SystemPrompt[]>

// Get user's chat history
getUserChatHistory(limit?: number): Promise<UserEvent[]>

// Get a specific chat event by ID
getChatEventById(eventId: string): Promise<UserEvent | null>
```

### Logger Service (`src/utils/logger.ts`)

```typescript
// Log an informational message
logger.info(message: string, ...args: unknown[]): void

// Log a warning message
logger.warn(message: string, ...args: unknown[]): void

// Log an error message
logger.error(message: string, ...args: unknown[]): void

// Log a debug message (only in non-production)
logger.debug(message: string, ...args: unknown[]): void
```

### Network Monitor (`src/utils/network.ts`)

```typescript
// Get current network status
networkMonitor.getStatus(): ConnectionStatus

// Check if the device is online
networkMonitor.isOnline(): boolean

// Add a listener for network status changes
networkMonitor.addListener(listener: ConnectionListener): () => void
```

### Retry Mechanism (`src/utils/retry.ts`)

```typescript
// Execute a function with retry logic
withRetry<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>

// Check if an error is retryable
isRetryableError(error: any): boolean
```

## Chat Components and Functions

### Chat Components

* `ChatContainer.tsx` - Main container for the chat interface
  * Arguments: 
    * `onSubmitWithoutAuth` (function) - Optional callback for handling unauthenticated submissions
  * Outputs: Complete chat interface with history and input

* `ChatInput.tsx` - Input component for sending messages
  * Arguments: 
    * `onSubmitWithoutAuth` (function) - Optional callback for handling unauthenticated submissions
  * Outputs: Text input and send button with system prompt selector

* `ChatHistory.tsx` - Displays chat message history
  * Arguments: 
    * `messages` (ChatMessage[]) - Array of chat messages
    * `isLoading` (boolean) - Optional loading state
  * Outputs: Scrollable list of chat messages

* `ChatMessage.tsx` - Individual message component
  * Arguments: 
    * `message` (ChatMessage) - Message object
  * Outputs: Formatted message with user/assistant styling

* `ChatHistoryCard.tsx` - Card for displaying chat history summary
  * Arguments: 
    * `event` (UserEvent) - Chat event object
  * Outputs: Card with chat summary and link to details

## Database Tables

### `profiles` Table
  - `id` (uuid, primary key)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `user_name` (text)

### `user_events` Table
  - `event_id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `event_type` (text)
  - `created_at` (timestamptz)
  - `event_description` (text)
  - `event_details` (jsonb)

### `system_prompts` Table
  - `prompt_id` (uuid, primary key)
  - `name` (text, unique)
  - `description` (text)
  - `content` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `is_active` (boolean)
  - `tag` (text)

## Development Context

This application is a Vite app using React with TypeScript. It features a complete user authentication system using Supabase for authentication and database storage, along with ChatGPT integration for AI-powered conversations.

The application uses Supabase's Row Level Security to ensure users can only access their own data. It follows best practices for separation of concerns, type safety, and comprehensive error handling.

The chat system is built with:
- OpenAI API integration via Supabase Edge Functions
- System prompt management for contextualizing conversations
- Chat history tracking and retrieval
- Responsive UI with markdown support for rich responses

## Environment Requirements

The following environment variables are required:

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key
```

The OpenAI API key is used by the Supabase Edge Function and must be set in your Supabase project settings.

## Setup and Deployment

1. Set up Supabase project and configure authentication settings
2. Update `.env` file with Supabase URL and anon key
3. Add your OpenAI API key to Supabase environment variables
4. Run Supabase migrations to create required tables and policies
5. Deploy Supabase Edge Functions for ChatGPT integration
6. Deploy to Netlify for hosting

## Testing

Comprehensive tests are included to verify the authentication functionality with both success and failure scenarios. Run tests with:

```bash
npm run test
```

Or in watch mode:

```bash
npm run test:watch
```

## AI Integration Guidelines

For developers working with the ChatGPT integration:

1. **System Prompts**: To create a new system prompt, add it to the `system_prompts` table with a unique name and set `is_active` to true.

2. **Edge Function**: The chat edge function handles:
   - User authentication
   - System prompt selection
   - OpenAI API integration
   - Chat history storage

3. **Chat History**: User interactions are automatically stored in the `user_events` table with:
   - The initial prompt
   - System prompt used
   - AI response
   - Timestamp information

4. **Chat Context**: The `ChatContext` component manages conversation state and integrates with the authentication system to ensure users are properly authenticated before sending messages.

5. **Extending the Chat System**:
   - To add features, extend the `ChatContext` or relevant services
   - For new UI components, follow the existing pattern of separation of concerns
   - Always maintain proper typing with the interfaces in `chat.types.ts`

## Development Strategy 

This application follows these development principles:

1. **Full separation of concerns**: Each file has a specific purpose and responsibility
2. **Minimal file sizes**: Components are broken into functional pieces
3. **API integration**: External services are properly integrated with error handling
4. **Security**: Authentication and data protection at all levels
5. **Reliability**: Comprehensive error handling and retry mechanisms
6. **Well-structured code**: Consistent patterns and organization
7. **Complete documentation**: All components and functions are documented

When extending this codebase, maintain these principles by:
- Scanning the entire codebase before adding new functionality
- Using event notifications instead of delays
- Properly typing all components and functions
- Following established patterns for consistency
- Using the logger service for comprehensive error tracking