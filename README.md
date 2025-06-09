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
*   **Shared Packages:** Core logic like the API client (`@paynless/api`), state stores (`@paynless/store`), shared types (`@paynless/types`), analytics (`@paynless/analytics`), and utilities (`@paynless/utils`) are organized into reusable packages within the monorepo.
*   **Multi-Platform Goal:** The structure includes placeholders and capability abstractions (`@paynless/platform`) aiming for future deployment targets including iOS, Android, Windows Desktop (Tauri), Linux, and Mac.

## Core Features & Capabilities

The framework comes pre-configured with essential features:

*   **User Authentication:** Secure sign-up, login, logout, password reset flows.
*   **User Profiles:** Database schema and API endpoints for managing user profile data.
*   **Subscription Management:** Integration with **Stripe** for handling subscription plans, checkout processes, customer billing portal access, and webhook event processing.
    * Syncs with plans populated into Stripe and automatically creates subscription cards for all enabled plans. 
*   **AI Chat Integration:** Backend functions and frontend components to interact with various AI providers (configurable, supports OpenAI, Anthropic, Google), manage chat history, and utilize system prompts.
    * Syncs with model providers and automatically populates available models into the database. 
*   **Web Analytics:** Google Analytics pre-configured. 
*   **User Analytics:** Pluggable analytics client (`@paynless/analytics`) with PostHog prebuilt, prepared for Mixpanel or others.
*   **Email Marketing Sync:** Trigger-based system to sync new users to email marketing platforms like Kit (prebuilt), prepared for other email marketing platforms.
*   **Customer Service:** Chatwoot prebuild for helping users. 
*   **In-App Notifications:** A real-time notification system allowing users to receive updates within the application (e.g., organization invites, role changes). Includes UI components for displaying and managing notifications.
*   **Multi-Tenancy (Organizations/Teams):** Support for users to create and belong to multiple organizations or teams. Includes features for:
    *   Organization creation and management (settings, visibility).
    *   Member management (inviting users via email, accepting/declining invites, managing roles - admin/member, removing members).
    *   Role-based access control (RBAC) enforced via RLS policies and backend checks.
    *   Organization switcher UI for easy context switching.
*   **AI Token Wallet & Payment System:** A flexible system for managing AI service tokens, allowing users to acquire tokens (initially via Stripe, with plans for crypto/Tauri wallet integration) and consume them for AI interactions, with a clear transaction audit trail.

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

## Configuration

Setting up the Paynless Framework for local development and deployment requires configuring several environment variables. These variables are typically managed in a `.env` file at the root of the project for local development and set directly in your deployment environment's settings (e.g., Supabase project settings, Vercel environment variables).

### Required Environment Variables

Create a `.env` file in the project root by copying the `.env.example` file:

```bash
cp .env.example .env
```

Then, populate the `.env` file with the necessary values. Key variables include:

*   **Supabase Configuration:**
    *   `SUPABASE_URL`: Your Supabase project URL.
    *   `SUPABASE_ANON_KEY`: Your Supabase project's anonymous key.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase project's service role key (keep this secret and only use it in secure backend environments).

*   **Stripe Configuration:**
    *   `STRIPE_SECRET_KEY`: Your Stripe secret key.
    *   `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret for processing events.
    *   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key for the frontend.

*   **AI Provider API Keys:**
    *   To enable AI features, you need to provide API keys for the respective providers. These keys must be securely stored in your Supabase project's Vault for backend Edge Function access and also set in your local `.env` file for local development and testing that involves direct API calls from your local machine (if any).
    *   `OPENAI_API_KEY`: Your API key for OpenAI services.
    *   `ANTHROPIC_API_KEY`: Your API key for Anthropic services.
    *   `GOOGLE_API_KEY`: Your API key for Google AI services (e.g., Gemini).

*   **Other Services:**
    *   *(You may want to list other critical .env variables here from your .env.example, such as those for Google Analytics, PostHog, Kit, Chatwoot etc., if they are essential for basic setup)*

**Important for AI Dialectic Engine:**
The AI Dialectic Engine relies on the AI Provider API Keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) being correctly configured both in your local `.env` file (for local development or CLI usage that might make direct calls) and, critically, within your **Supabase project's Vault**. The backend Edge Functions for the Dialectic Engine will fetch these keys from the Vault to interact with the AI models.

Default model selections and other configurations for the Dialectic Engine are primarily managed through the application's database (`ai_models_catalog` table) and the `ai sync function`, not through additional environment variables.

### AI Dialectic Engine: Core Data Handling and Storage Architecture

The AI Dialectic Engine employs a structured approach to managing and storing data artifacts, primarily utilizing Supabase Storage. Adherence to these principles is crucial for consistency, reliability, and future integrations.

**Overarching Principle:** Supabase Storage serves as the primary, canonical repository for all dialectic session artifacts. This approach is designed for scalability and to align internal storage structures with planned GitHub export capabilities.

**Key Goals:**
*   Ensure a consistent, reliable, and scalable approach to storing all generated and user-provided artifacts.
*   Align internal storage structures with the planned GitHub export structure for seamless integration.
*   Provide clear linkage between database records and their corresponding file-based artifacts in cloud storage.

#### 1. Supabase Storage as Primary Artifact Repository

*   **Stored Artifacts Include:**
    *   Initial user prompts (text or file references).
    *   System-generated seed input components for each iteration (e.g., `user_prompt.md`, `system_settings.json`).
    *   Raw and formatted AI model contributions for each stage (e.g., Thesis, Antithesis, Synthesis).
    *   User-provided feedback files or structured data.
    *   Supporting documents or resources generated during the dialectic process.
    *   Project-level readme and organizational folders (`Implementation/`, `Complete/`).

*   **Folder Structure:** The folder structure within the designated Supabase Storage bucket (default: `dialectic-contributions`, configurable) strictly follows the pattern outlined for GitHub export.
    *   **Base Path for Project Artifacts:** `projects/{project_id}/`
    *   **Detailed Structure:**
        ```
        projects/{project_id}/
        ├── project_readme.md      (High-level project description, goals, defined by user or initial setup)
        ├── Implementation/          (User-managed folder for their current work-in-progress files related to this project)
        │   └── ...
        ├── Complete/                (User-managed folder for their completed work items for this project)
        │   └── ...
        └── sessions/{session_id_short}/  (Each distinct run of the dialectic process)
            └── iteration_{N}/        (N being the iteration number, e.g., "iteration_1")
                ├── 0_seed_inputs/
                │   ├── user_prompt.md  (The specific prompt that kicked off this iteration)
                │   ├── system_settings.json          (Models, core prompt templates used for this iteration)
                │   └── seed_prompt.md  (The actual input prompt sent to the model for completion)
                ├── 1_hypothesis/
                │   ├── {model_name_slug}_hypothesis.md (Contains YAML frontmatter + AI response)
                │   ├── ... (other models\' hypothesis outputs)
                │   ├── user_feedback_hypothesis.md   (User\'s feedback on this stage)
                │   └── documents/                      (Optional refined documents, e.g., PRDs from each model)
                │       └── {model_name_slug}_prd_hypothesis.md
                │       └── ...
                ├── 2_antithesis/
                │   ├── {critiquer_model_slug}_critique_on_{original_model_slug}.md
                │   ├── ...
                │   └── user_feedback_antithesis.md
                ├── 3_synthesis/
                │   ├── {model_name_slug}_synthesis.md
                │   ├── ...
                │   ├── user_feedback_synthesis.md
                │   └── documents/                      (Refined documents from each model, e.g., PRDs, business cases)
                │       ├── {model_name_slug}_prd_synthesis.md
                │       ├── {model_name_slug}_business_case_synthesis.md
                │       └── ...
                ├── 4_parenthesis/
                │   ├── {model_name_slug}_parenthesis.md
                │   ├── ...
                │   ├── user_feedback_parenthesis.md
                │   └── documents/                      (Detailed implementation plans from each model)
                │       └── {model_name_slug}_implementation_plan_parenthesis.md
                │       └── ...
                ├── 5_paralysis/
                │   ├── {model_name_slug}_paralysis.md
                │   ├── ...
                │   ├── user_feedback_paralysis.md
                │   └── documents/                      (The user-selected/finalized canonical outputs)
                │       ├── chosen_implementation_plan.md
                │       ├── project_checklist.csv
                │       └── ... (other formats like Jira importable CSV/JSON)
                └── iteration_summary.md (Optional: An AI or user-generated summary of this iteration\'s key outcomes and learnings)
        ```

#### 2. Database Path and Bucket Conventions

*   Database fields storing paths to files (e.g., `dialectic_contributions.content_storage_path`, `dialectic_contributions.seed_prompt_url`, `dialectic_project_resources.storage_path`) will store relative paths *within the designated Supabase Storage bucket*. These paths will not include the bucket name itself.
*   Relevant tables (e.g., `dialectic_contributions`, `dialectic_project_resources`) will include a `content_storage_bucket` (or similarly named) field. This field will store the name of the Supabase Storage bucket where the artifact resides (e.g., "dialectic-contributions"), allowing for future flexibility if multiple buckets are used.

#### 3. Seed Input Components for an Iteration (Stored in Supabase Storage)

*   **`user_prompt.md`**: This Markdown file contains the specific user-provided or system-derived textual input forming the core basis of an iteration's prompt.
    *   *Storage Path:* `projects/{project_id}/sessions/{session_id}/iteration_{N}/0_seed_inputs/user_prompt.md`
*   **`system_settings.json`**: A JSON file detailing AI models selected, core `system_prompts.id` used, active `domain_specific_prompt_overlays` configurations, and other critical system-level parameters for constructing the full prompt.
    *   *Storage Path:* `projects/{project_id}/sessions/{session_id}/iteration_{N}/0_seed_inputs/system_settings.json`
*   **"Fully Constructed Seed Prompt" (Conceptual/In-Memory)**: This refers to the complete prompt text sent to an AI model. It's dynamically assembled by the backend from `user_prompt.md`, `system_settings.json`, and applicable `system_prompts.prompt_text`.
    *   *Storage Consideration (Future):* This fully constructed prompt might be logged/stored for auditing or debugging (e.g., as `.../0_seed_inputs/full_constructed_prompt_for_{model_slug}.txt` in Supabase Storage or in `dialectic_contributions`). For Phase 1, primary reliance is on reconstructing it from its components.

#### 4. Frontend Data Access

The frontend application will primarily fetch file-based content (e.g., AI contributions, user prompts stored as files) directly from Supabase Storage. This will typically be achieved using presigned URLs generated by the backend or via the Supabase client SDK if appropriate RLS and access policies are in place for direct client access to specific paths.

#### 5. GitHub Export as a Replicator

The GitHub integration feature acts as an exporter or replicator. It will read the structured artifacts from Supabase Storage and commit them to the user's connected GitHub repository, maintaining the identical folder and file structure. Supabase Storage remains the primary source of truth for the application.