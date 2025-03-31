# API-Driven Application

This project is a modern API-driven application built with React and Supabase. It follows a clear separation of concerns to support web, iOS, and Android clients through a unified API.

## Development Context

This application is designed to follow these principles:
- Full separation of concerns 
- API-first architecture
- Secure, safe, reliable, robust development practices
- No code duplication
- Well-structured code with proper documentation
- Event-driven architecture instead of delays or timeouts
- Comprehensive logging
- Proper TypeScript typing system
- Clear organization of types and interfaces

When implementing features:
- Never duplicate or replicate existing functionality
- Create reusable components that can be used across the application
- Use separation of concerns to keep files focused and maintainable
- Document all code with clear, concise comments
- Use proper TypeScript types and interfaces
- Always implement full, production-ready features rather than placeholders or mock code
- Use logging for error handling and debugging
- Use events instead of timeouts for asynchronous operations
- Scan the codebase to prevent duplication of functionality
- Follow established patterns and conventions consistently

## Architecture Overview

The architecture follows these principles:
- Clear separation between frontend and backend
- RESTful API endpoints to serve all business logic
- Backend middleware to handle authentication and authorization
- Frontend as a consumer of the API, easily replaceable with mobile apps
- Stateless authentication using JWT tokens
- Consistent error handling and response formatting

## AI Integration

The application supports multiple AI providers through a modular architecture:

### Supported Providers
- OpenAI (ChatGPT)
- Perplexity (Coming soon)
- Claude (Coming soon)
- DeepSeek (Coming soon)
- Gemini (Coming soon)
- Copilot (Coming soon)

### Features
- Model selection interface
- System prompt management
- Rate limiting based on subscription tier
- Usage tracking and analytics
- Provider-agnostic API design

### Database Schema
- `ai_models` - Available AI models
- `ai_providers` - AI service providers
- `system_prompts` - Pre-configured system prompts
- `ai_usage` - Usage tracking and analytics

## API Endpoints

The application exposes the following API endpoints through Supabase Edge Functions:

### Authentication (/api-auth)
- POST /login - Login with email/password
- POST /register - Register new user
- POST /logout - Logout user
- GET /session - Get current session
- POST /reset-password - Request password reset

### Users (/api-users)
- GET /profile - Get user profile
- PUT /profile - Update user profile
- GET /settings - Get user settings
- PUT /settings - Update user settings

### Social (/api-social)
- GET /timeline - Get user timeline
- POST /posts - Create post
- GET /posts/:id - Get post details
- PUT /posts/:id - Update post
- DELETE /posts/:id - Delete post
- GET /posts/user/:id - Get user posts
- POST /comments - Create comment
- GET /comments/:postId - Get post comments
- POST /reactions - Create reaction
- DELETE /reactions/:postId - Remove reaction
- GET /relationships/counts/:userId - Get follower counts
- POST /relationships - Create relationship
- DELETE /relationships/:userId/:type - Remove relationship

### Messaging (/api-messages)
- GET /conversations - Get user conversations
- GET /conversations/:id - Get conversation messages
- POST / - Send message
- PUT /status - Update message status

### AI Integration (/api-ai)
- GET /models - Get available AI models
- GET /prompts - Get system prompts
- POST /generate - Generate AI response
- GET /usage - Get AI usage metrics

### Subscriptions (/api-subscriptions)
- GET /plans - Get subscription plans
- GET /current - Get current subscription
- POST /checkout - Create checkout session
- POST /billing-portal - Create billing portal session
- GET /usage/:metric - Get usage metrics

## Project Structure

```
/src
│
├── /api                 # API client implementations
│   ├── /clients         # Specific API clients for different endpoints
│   └── /ai             # AI-specific API clients
│
├── /components          # UI components
│   ├── /ai             # AI-related components
│   ├── /auth           # Authentication-related components
│   ├── /layout         # Layout components
│   ├── /social         # Social feature components
│   └── /messaging      # Messaging components
│
├── /context             # React context providers
│   ├── auth.context.tsx # Authentication context
│   └── subscription.context.tsx # Subscription context
│
├── /hooks               # Custom React hooks
│   ├── useAuth.ts       # Hook for auth context
│   └── useSubscription.ts # Hook for subscription context
│
├── /pages               # Page components
│   ├── Home.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── Profile.tsx
│   ├── /social          # Social feature pages
│   └── /messaging       # Messaging pages
│
├── /routes              # Routing configuration
│   └── routes.tsx       # Routes configuration
│
├── /services            # Business logic services
│   ├── auth.service.ts  # Authentication service
│   ├── profile.service.ts # User profile service
│   ├── social.service.ts # Social features service
│   ├── ai.service.ts    # AI integration service
│   └── subscription.service.ts # Subscription service
│
├── /types               # TypeScript types and interfaces
│   ├── ai.types.ts      # AI-related types
│   ├── api.types.ts     # API-related types
│   ├── auth.types.ts    # Authentication types
│   ├── message.types.ts # Messaging types
│   ├── post.types.ts    # Post types
│   ├── privacy.types.ts # Privacy settings types
│   ├── profile.types.ts # Profile types
│   ├── relationship.types.ts # Relationship types
│   ├── route.types.ts   # Routing types
│   └── subscription.types.ts # Subscription types
│
├── /utils               # Utility functions
│   ├── logger.ts        # Logging service
│   ├── supabase.ts      # Supabase client
│   └── stripe.ts        # Stripe utilities
│
├── App.tsx              # Main App component
└── main.tsx             # Entry point
```

## Edge Functions

Located in `/supabase/functions`:

```
/supabase/functions
│
├── /_shared            # Shared utilities
│   ├── cors-headers.ts # CORS handling
│   ├── supabase-client.ts # Supabase client setup
│   └── stripe-client.ts # Stripe client setup
│
├── /api-auth           # Authentication endpoints
├── /api-users          # User management endpoints
├── /api-social         # Social feature endpoints
├── /api-messages       # Messaging endpoints
├── /api-ai             # AI integration endpoints
├── /api-subscriptions  # Subscription management endpoints
└── /stripe-webhook     # Stripe webhook handler
```

## Core Framework Files (Do Not Modify)

The following files form the core of the application and should not be modified:
- `/api/clients/base.api.ts`
- `/utils/logger.ts`
- `/context/auth.context.tsx`
- `/utils/supabase.ts`

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase credentials
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the development server

## Supabase Setup

1. Create a new Supabase project
2. Click "Connect to Supabase" button to set up Supabase connection
3. Run the SQL migrations in the `supabase/migrations` folder

## API Implementation

The application follows a clear layered architecture:
1. UI Components → Make requests via Hooks
2. Hooks → Call Service Layer methods
3. Service Layer → Uses API Clients for remote operations
4. API Clients → Handle HTTP, caching, error handling
5. Backend API → Implements CRUD operations on data

## Contributing

To contribute to this project:
1. Ensure you understand the architecture and follow the same patterns
2. Never duplicate existing functionality
3. Use proper TypeScript types
4. Document all new code
5. Test your changes thoroughly