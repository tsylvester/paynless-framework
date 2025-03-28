# Paynless App Framework

A robust user environment with AI integration built with React, Vite, and TypeScript. The Paynless framework provides Supabase user auth, Supabase database integration, user history, Stripe subscription management, and ChatGPT integration. The framework is intended to get new apps up and running in minutes. Whether vibe coding or traditional coding, with Paynless, you don't have to worry about setting up your environment and can immediately start delivering function. 

## Bug to be fixed: 
- Chat history currently saved per exchange instead of continuously
- Chat date overlaps delete button

## In testing: 
- Subscription elements

## Coming features: 
- Color theme abstraction for reskinning
- Recast app as API routes
- Dark / light mode
- Support for Claude, Perplexity, Gemini
- Personal bios
- Notifications
- Profile links
- User privacy levels
- Location awareness
- Media creation function
- Feed function
- Follow function
- User chats / DMs
- Dating / introduction / user discovery function
- Calendars & events 
- User groups & lists 
- Organizations 

## How to Use Paynless App

- Branch from Github to your own repo
- Clone repo in your dev environment
- Connect Netlify to your Github repo
- Connect Supabase to your Netlify account

# How to use in Bolt.new
- Authorize Bolt.new for your Github account
- Load this route in Bolt.new while logged in: https://bolt.new/~/github.com/[YOUR PROJECT ROUTE]
- "Download" the project from Bolt.new
- Unzip to your local project directory
- Check it in your dev environment
- Push the updated copy to Github
- Reload the Github route in Bolt.new to continue

## How to use in Claude.ai
- Choose "+"
- Choose "Add from Github"
- Select your project
- Unselect package-lock.json

## How to load the keys into Supabase
- Navigate to https://supabase.com/dashboard/project/[YOUR DATABASE]/functions/secrets
- Add key-value pairs for: 
-- SUPABASE_URL
-- SUPABASE_ANON_KEY
-- SUPABASE_SERVICE_ROLE_KEY
-- SUPABASE_DB_URL
-- OPENAI_API_KEY
-- STRIPE_SECRET_KEY
-- STRIPE_TEST_WEBHOOK_SECRET
-- STRIPE_LIVE_WEBHOOK_SECRET

## How to set up Supabase edge functions
- Navigate to https://supabase.com/dashboard/project/[YOUR DATABASE]/functions
- Click the "Create with Supabase Assistant" button beside "Deploy new function" 

- Deploy chat edge function
-- Tell Supabase you want to create a AI chat function at https://[YOUR DATABASE].supabase.co/functions/v1/chat
-- Give it the /supabase/functions/chat/index.ts file. 
-- Let it analyze the file, then select "Deploy". 

- Deploy create-checkout edge function
-- Tell Supabase you want to create a create-checkout function at https://[YOUR DATABASE].supabase.co/functions/v1/create-checkout
-- Give it the /supabase/functions/create-checkout/index.ts file.
-- Let it analyze the file, then select "Deploy." 

- Deploy manage-subscription edge function
-- Tell Supabase you want to create a manage-subscription function at https://[YOUR DATABASE].supabase.co/functions/v1/manage-subscription
-- Give it the /supabase/functions/manage-subscription/index.ts file.
-- Let it analyze the file, then select "Deploy." 

- Deploy stripe-webhook edge function
-- Tell Supabase you want to create a stripe-webhook function at https://[YOUR DATABASE].supabase.co/functions/v1/stripe-webhook
-- Give it the /supabase/functions/stripe-webhook/index.ts file.
-- Let it analyze the file, then select "Deploy." 

## How to load keys into Netlify
- Connect Netlify to Supabase under Site Configuration -> Supabase. 

## How to set up Stripe live webhook
- Navigate to https://dashboard.stripe.com/workbench/webhooks
- Click "Add destination"
- Add https://[YOUR DATABASE].supabase.co/functions/v1/stripe-webhook
- Add these events: 
-- checkout.session.completed
-- customer.card.created
-- customer.card.deleted
-- customer.subscription.created
-- customer.subscription.deleted
-- customer.subscription.updated
-- customer.created
-- customer.deleted
-- customer.updated
-- invoice.paid
-- invoice.payment_failed
-- invoice.payment_succeeded
- Click "Save"

## How to set up Stripe test webhook
- In the upper right, choose "Test Mode" 
- Choose "Sandboxes" 
- Choose "+Create" 
- Name your sandbox
- Set up a webhook exactly the same as your live webhook
- Click "Save"

## How to set up Stripe keys
- Get a Stripe Secret Key and load it into Supabase as above
- Create a live webhook secret and load it into Supabase as above
- Create a test webhook secret and load it into Supabase as above

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
│   │   ├── subscription/
│   │   │   └── UsageIndicator.tsx         # Usage limit indicator component
│   │   └── layout/
│   │       ├── Header.tsx         # Application header with navigation
│   │       ├── Footer.tsx         # Application footer
│   │       └── Layout.tsx         # Main layout wrapper
│   ├── context/
│   │   ├── AuthContext.tsx        # Authentication context provider
│   │   ├── ChatContext.tsx        # Chat context provider for OpenAI integration
│   │   └── SubscriptionContext.tsx # Subscription context provider for Stripe integration
│   ├── pages/
│   │   ├── Home.tsx               # Home page with auth status display
│   │   ├── Landing.tsx            # Landing page with chat functionality
│   │   ├── Profile.tsx            # User profile page with editing capabilities
│   │   ├── AuthCallbackPage.tsx   # Handle auth callbacks
│   │   ├── ChatHistoryPage.tsx    # Page for viewing chat history
│   │   ├── ChatDetailsPage.tsx    # Page for viewing chat details
│   │   └── SubscriptionPage.tsx   # Page for managing subscription plans
│   ├── services/
│   │   ├── supabase.ts            # Supabase client and methods
│   │   ├── chatService.ts         # Services for OpenAI integration
│   │   └── subscriptionService.ts # Services for Stripe subscription management
│   ├── types/
│   │   ├── auth.types.ts          # Type definitions for auth components
│   │   ├── chat.types.ts          # Type definitions for chat components
│   │   └── subscription.types.ts  # Type definitions for subscription components
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
│       ├── chat/                  # Supabase Edge Function for OpenAI integration
│       ├── stripe-webhook/        # Supabase Edge Function for Stripe webhook handling
│       ├── create-checkout/       # Supabase Edge Function for Stripe checkout creation
│       └── manage-subscription/   # Supabase Edge Function for subscription management
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

### Subscription Context (`src/context/SubscriptionContext.tsx`)

The `SubscriptionProvider` component provides the subscription context and the following functions:

```typescript
// Get the current subscription state
const { 
  subscription, 
  subscriptionEvents, 
  plans, 
  isLoading, 
  error, 
  checkoutSession 
} = useSubscription();

// Load subscription data
loadSubscription(): Promise<void>

// Load subscription events history
loadSubscriptionEvents(): Promise<void>

// Load available subscription plans
loadPlans(): Promise<void>

// Create a Stripe checkout session for subscription upgrade
createCheckoutSession(planId: string): Promise<{ url: string } | null>

// Cancel the current subscription
cancelSubscription(): Promise<boolean>

// Resume a canceled subscription
resumeSubscription(): Promise<boolean>

// Change subscription plan
changePlan(planId: string): Promise<boolean>

// Check if a subscription feature is enabled
isSubscriptionFeatureEnabled(featureName: string): boolean

// Get remaining usage for a specific feature
getRemainingUsage(usageType: string): Promise<number | null>
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

### Subscription Service (`src/services/subscriptionService.ts`)

```typescript
// Get all available subscription plans
getSubscriptionPlans(): Promise<SubscriptionPlan[]>

// Get the current user's subscription with plan details
getCurrentSubscription(): Promise<SubscriptionWithPlan | null>

// Get the user's subscription event history
getSubscriptionEvents(limit?: number): Promise<SubscriptionEvent[]>

// Create a Stripe checkout session for plan upgrade
createCheckoutSession(
  planId: string,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutSessionResponse>

// Manage subscription (cancel, resume, change plan)
manageSubscription(
  action: 'cancel' | 'resume' | 'change_plan',
  planId?: string
): Promise<ManageSubscriptionResponse>

// Check if a subscription feature is enabled
isFeatureEnabled(
  subscription: SubscriptionWithPlan | null,
  featureName: string
): boolean

// Calculate remaining usage for a limited feature
getRemainingUsage(
  subscription: SubscriptionWithPlan | null,
  usageType: string
): Promise<number | null>
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

## Subscription Components and Functions

### Subscription Components

* `SubscriptionPage.tsx` - Page for managing subscription plans
  * Outputs: Complete subscription management interface

* `UsageIndicator.tsx` - Component for displaying usage limits
  * Arguments:
    * `usageType` (string) - Type of usage to display (e.g., "messages_per_day")
    * `label` (string) - Display label for the usage metric
  * Outputs: Visual indicator of usage limits with remaining count

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

### `subscription_plans` Table
  - `subscription_plan_id` (text, primary key)
  - `subscription_name` (text)
  - `subscription_description` (text)
  - `subscription_price` (numeric)
  - `interval` (text)
  - `features` (text[])
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `subscription_limits` (jsonb)
  - `stripe_price_id` (text)

### `subscription_events` Table
  - `subscription_event_id` (uuid, primary key)
  - `subscription_id` (uuid)
  - `user_id` (uuid, references auth.users)
  - `stripe_subscription_id` (text)
  - `subscription_event_type` (text)
  - `subscription_previous_state` (text)
  - `subscription_status` (text)
  - `event_data` (jsonb)
  - `created_at` (timestamptz)

### `subscriptions` Table
  - `subscription_id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `stripe_subscription_id` (text)
  - `stripe_customer_id` (text)
  - `subscription_status` (text)
  - `subscription_plan_id` (text, references subscription_plans)
  - `subscription_price` (numeric)
  - `current_period_start` (timestamptz)
  - `current_period_end` (timestamptz)
  - `canceled_at` (timestamptz)
  - `ended_at` (timestamptz)
  - `metadata` (jsonb)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Development Context

This application is a Vite app using React with TypeScript. It features a complete user authentication system using Supabase for authentication and database storage, along with ChatGPT integration for AI-powered conversations and a subscription management system using Stripe.

The application uses Supabase's Row Level Security to ensure users can only access their own data. It follows best practices for separation of concerns, type safety, and comprehensive error handling.

The chat system is built with:
- OpenAI API integration via Supabase Edge Functions
- System prompt management for contextualizing conversations
- Chat history tracking and retrieval
- Responsive UI with markdown support for rich responses

The subscription system is built with:
- Stripe integration for payment processing
- Free and premium subscription plans
- Usage limits based on subscription tier
- Subscription history tracking
- Ability to upgrade, cancel, and resume subscriptions

## Environment Requirements

The following environment variables are required:

```
VITE_SUPABASE_DATABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
OPENAI_API_KEY=your-openai-api-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

The OpenAI API key and Stripe keys are used by the Supabase Edge Functions and must be set in your Supabase project settings.

## Setup and Deployment

1. Set up Supabase project and configure authentication settings
2. Update `.env` file with Supabase URL and anon key
3. Add your OpenAI API key and Stripe keys to Supabase environment variables
4. Run Supabase migrations to create required tables and policies
5. Deploy Supabase Edge Functions for ChatGPT integration and Stripe integration
6. Create products and prices in your Stripe dashboard that match the subscription_plans table
7. Deploy to Netlify for hosting

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

## Subscription Management Guidelines

For developers working with the subscription system:

1. **Subscription Plans**: Plans are defined in the `subscription_plans` table:
   - Each plan has a unique ID, name, description, price, and feature list
   - The `subscription_limits` JSON field defines usage restrictions

2. **Edge Functions**: Three edge functions handle subscription management:
   - `create-checkout`: Creates Stripe checkout sessions for new subscriptions
   - `manage-subscription`: Handles subscription cancellation, resumption, and plan changes
   - `stripe-webhook`: Processes webhook events from Stripe

3. **Subscription Flow**:
   - New users are automatically assigned the free plan
   - Users can upgrade to paid plans through Stripe checkout
   - Plan changes are processed through the Stripe API
   - Subscription events are recorded in the `subscription_events` table

4. **Usage Limits**: Feature restrictions are enforced based on subscription tier:
   - The `subscription_limits` field in the plan defines usage caps
   - The `UsageIndicator` component visualizes remaining usage
   - The `isSubscriptionFeatureEnabled` function checks if features are available

5. **Extending the Subscription System**:
   - To add new plans, insert records into the `subscription_plans` table
   - For new subscription features, extend the `isFeatureEnabled` function
   - Always maintain proper typing with the interfaces in `subscription.types.ts`

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