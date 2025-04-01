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
- State management using Zustand for predictable and reliable state

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

### Authentication
- POST /login - Login with email/password
- POST /register - Register new user
- POST /logout - Logout user
- GET /session - Get current session
- POST /refresh - Refresh authentication tokens
- POST /reset-password - Request password reset

### Users
- GET /me - Get current user profile
- GET /profile - Get user profile
- PUT /profile - Update user profile
- GET /users/preferences - Get user preferences
- PUT /users/preferences - Update user preferences
- GET /users/details - Get user details

### Subscriptions
- GET /api-subscriptions/plans - Get available subscription plans
- GET /api-subscriptions/current - Get current user's subscription
- POST /api-subscriptions/checkout - Create checkout session
- POST /api-subscriptions/billing-portal - Create billing portal session
- GET /api-subscriptions/usage/:metric - Get usage metrics
- POST /api-subscriptions/:id/cancel - Cancel subscription
- POST /api-subscriptions/:id/resume - Resume subscription

### Payments
- POST /stripe-webhook - Handle Stripe webhook events

## Project Structure

```
/src
│
├── /api                  # API client implementations
│   └── /clients          # Specific API clients for different endpoints
│       ├── /auth         # Authentication API clients
│       │   ├── index.ts  # Main auth client
│       │   ├── login.ts  # Login client
│       │   ├── register.ts # Register client
│       │   ├── session.ts # Session management
│       │   ├── password.ts # Password operations
│       │   └── reset-password.ts # Password reset
│       ├── base.api.ts   # Base API client with request handling
│       ├── profile.api.ts # User profile operations
│       └── stripe.api.ts # Subscription and payment operations
│
├── /components           # UI components
│   ├── /auth            # Authentication-related components
│   ├── /layout          # Layout components
│   ├── /profile         # User profile components
│   └── /subscription    # Subscription components
│
├── /config               # Configuration files
│
├── /context              # React context providers
│
├── /hooks                # Custom React hooks
│   ├── useAuth.ts       # Hook for auth context/store
│   └── useSubscription.ts # Hook for subscription state
│
├── /pages                # Page components
│   ├── Home.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── Profile.tsx
│   └── Subscription.tsx
│
├── /routes               # Routing configuration
│   └── routes.tsx       # Routes configuration
│
├── /services             # Business logic services
│   ├── /auth            # Authentication services
│   │   ├── index.ts     # Main auth service
│   │   ├── login.service.ts # Login service
│   │   ├── register.service.ts # Registration service
│   │   └── session.service.ts # Session management
│   ├── profile.service.ts # User profile service
│   └── subscription.service.ts # Subscription service
│
├── /store                # Zustand store implementations
│   ├── authStore.ts     # Authentication state store
│   └── subscriptionStore.ts # Subscription state store
│
├── /types                # TypeScript types and interfaces
│   ├── api.types.ts     # API-related types
│   ├── auth.types.ts    # Authentication types
│   ├── profile.types.ts # Profile types
│   ├── route.types.ts   # Routing types
│   └── subscription.types.ts # Subscription types
│
├── /utils                # Utility functions
│   ├── logger.ts        # Logging service
│   ├── supabase.ts      # Supabase client
│   └── stripe.ts        # Stripe utilities
│
├── App.tsx               # Main App component
└── main.tsx              # Entry point
```

## Edge Functions

Located in `/supabase/functions`:

```
/supabase/functions
│
├── /_shared             # Shared utilities
│   ├── auth.ts          # Authentication utilities
│   ├── cors-headers.ts  # CORS handling
│   └── stripe-client.ts # Stripe client setup
│
├── /login               # Login endpoint
├── /register            # Registration endpoint
├── /logout              # Logout endpoint
├── /session             # Session management
├── /refresh             # Token refresh
├── /reset-password      # Password reset
├── /profile             # Profile management
├── /me                  # Current user profile
├── /api-users           # User management endpoints
├── /api-subscriptions   # Subscription management endpoints
└── /stripe-webhook      # Stripe webhook handler
```

## Core Framework Files (Do Not Modify)

The following files form the core of the application and should not be modified:
- `/api/clients/base.api.ts`
- `/utils/logger.ts`
- `/utils/supabase.ts`

## Getting Started

1. Clone this repository
2. Copy `.env.example` to `.env` and add your Supabase credentials
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the development server

## Supabase Setup

1. Create a new Supabase project
2. Set up your project reference ID
3. Run the SQL migrations in the `supabase/migrations` folder //We need to create a migration file that represents the full state of the database

## API Implementation

The application follows a clear layered architecture:
1. UI Components → Make requests via Hooks or directly through stores
2. Hooks/Stores → Call Service Layer methods
3. Service Layer → Uses API Clients for remote operations
4. API Clients → Handle HTTP, caching, error handling
5. Backend API → Implements CRUD operations on data

## State Management

The application uses Zustand for state management:
1. State is defined in stores (`/src/store`)
2. Components access state through hooks or direct store imports
3. Updates to state trigger re-renders of dependent components
4. Authentication state is managed in `authStore.ts`
5. Subscription state is managed in `subscriptionStore.ts`

## Contributing

To contribute to this project:
1. Ensure you understand the architecture and follow the same patterns
2. Never duplicate existing functionality
3. Use proper TypeScript types
4. Document all new code
5. Test your changes thoroughly