# Paynless Framework Application

The Paynless Framework is a comprehensive, production-ready application framework designed for building modern, multi-platform applications with integrated user authentication, database management, user profiles, subscription billing, and AI capabilities out-of-the-box. Built using a robust tech stack including React, Supabase, Stripe, and AI model integrations (OpenAI, Anthropic, Google), it accelerates development by providing a solid foundation for SaaS products and other complex applications.

## Architecture & Technology

Paynless utilizes a **monorepo architecture** managed with `pnpm` workspaces, promoting code sharing and consistency across different parts of the application. Key architectural principles include:

*   **API-First Design:** A clear separation between the frontend applications and the backend logic, which is exposed via RESTful APIs.
*   **Backend:** Powered by **Supabase**, utilizing:
    *   **Auth:** Secure JWT-based user authentication (email/password, potentially others).
    *   **Database:** PostgreSQL database for storing application data (profiles, subscriptions, AI chat history, etc.).
    *   **Edge Functions:** Deno-based serverless functions implementing the backend API endpoints for business logic (user management, subscription handling via Stripe, AI chat interactions).
*   **Frontend (Web):** Built with **React** (using **Vite**), **TypeScript**, and styled with **TailwindCSS**. Leverages **shadcn/ui** and **Radix UI** for accessible and reusable UI components. State management is handled globally by **Zustand** and data fetching/caching by **TanStack Query**. Routing is managed by **React Router**.
*   **Shared Packages:** Core logic like the API client (`@paynless/api-client`), state stores (`@paynless/store`), shared types (`@paynless/types`), analytics (`@paynless/analytics-client`), and utilities (`@paynless/utils`) are organized into reusable packages within the monorepo.
*   **Multi-Platform Goal:** The structure includes placeholders and capability abstractions (`@paynless/platform-capabilities`) aiming for future deployment targets including iOS, Android, Windows Desktop (Tauri), Linux, and Mac.

## Core Features & Capabilities

The framework comes pre-configured with essential features:

*   **User Authentication:** Secure sign-up, login, logout, password reset flows.
*   **User Profiles:** Database schema and API endpoints for managing user profile data.
*   **Subscription Management:** Integration with **Stripe** for handling subscription plans, checkout processes, customer billing portal access, and webhook event processing.
    * Syncs with plans populated into Stripe and automatically creates subscription cards for all enabled plans. 
*   **AI Chat Integration:** Backend functions and frontend components to interact with various AI providers (configurable, supports OpenAI, Anthropic, Google), manage chat history, and utilize system prompts.
    * Syncs with model providers and automatically populates available models into the database. 
*   **Web Analytics:** Google Analytics pre-configured. 
*   **User Analytics:** Pluggable analytics client (`@paynless/analytics-client`) with PostHog prebuilt, prepared for Mixpanel or others.
*   **Email Marketing Sync:** Trigger-based system to sync new users to email marketing platforms like Kit (prebuilt), prepared for other email marketing platforms.
*   **Customer Service:** Chatwoot prebuild for helping users. 

## Development
*   **Development Experience:**
    *   **TypeScript:** End-to-end type safety.
    *   **Testing:** Comprehensive testing strategy using **Vitest** and **React Testing Library** for unit and integration tests (including MSW for API mocking).
    *   **Development Guidelines:** Clear guidelines for branching, contributing, and coding standards (`docs/DEV_PLAN.md`).

## Getting Started & Documentation

Refer to the following documents in the `/docs` directory for detailed information:

*   `docs/DEV_PLAN.md`: Development guidelines, getting started instructions, setup procedures, and contribution information.
*   `docs/STRUCTURE.md`: In-depth architecture details, API endpoint list, database schema overview, project structure breakdown, and core package information.
*   `docs/TESTING_PLAN.md`: The testing strategy, philosophy (TDD), tooling, setup, current status, and known limitations.
*   `docs/IMPLEMENTATION_PLAN.md`: Tracking for work-in-progress, completed features, and planned enhancements.