# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Paynless Framework is a production-ready SaaS application framework built as a monorepo. It provides a comprehensive platform for building multi-platform applications with integrated authentication, database management, subscription billing, and AI capabilities. The core feature is an AI Dialectic Engine - a sophisticated document generation system that uses multiple AI models to collaboratively work through a dialectic process (Hypothesis → Antithesis → Synthesis → Parenthesis → Paralysis).

**Technology Stack:** React 18 + TypeScript + Vite (frontend), Supabase (backend), PostgreSQL 15 (database), Deno Edge Functions (serverless), Stripe (payments), TanStack Query + Zustand (state management), TailwindCSS + shadcn/ui (UI).

**Current Development:** Feature branch `feature/document-centric-generation` focused on document rendering, job payload structures, and file management in Supabase Storage.

## Critical Development Rules

**IMPORTANT:** This codebase has strict development methodology documented in [docs/Instructions for Agent.md](docs/Instructions%20for%20Agent.md). Key principles:

1. **Read → Analyze → Explain → Propose → Edit → Lint → Halt** - Always read files before editing, propose changes explicitly, edit ONE file per turn, then halt
2. **TDD Cycle:** RED test → implementation → GREEN test → lint (exemptions: types/interfaces/docs)
3. **Dependency Ordering:** Bottom-up only - build types/interfaces/helpers before consumers
4. **Strict Typing:** No `any`, `as`, `as const`, or inline types (exceptions: Supabase clients and intentionally malformed test objects)
5. **One File Per Turn:** NEVER edit multiple files without explicit multi-file approval
6. **Dependency Injection:** Wire dependencies at application boundary; use typed, immutable RequestContext/ExecutionContext
7. **Builder vs Reviewer Modes:** Declare mode in every response - Builder executes, Reviewer finds errors/omissions/discrepancies

## Common Commands

### Development
```bash
# Install dependencies
pnpm install

# Start all apps in parallel
pnpm dev

# Start web app only
pnpm dev:web

# Build for production
pnpm build

# Preview production build
pnpm preview

# Clean build artifacts
pnpm clean:buildinfo

# Full clean (including node_modules)
pnpm clean
```

### Testing
```bash
# Run all tests (unit + integration)
pnpm test

# Run integration tests only
pnpm test:integration

# Run tests in a specific package
pnpm --filter @paynless/api test

# Run tests in watch mode
pnpm --filter @paynless/web test -- --watch
```

### Code Quality
```bash
# Lint all packages
pnpm lint

# Format and lint with Biome
npx biome check --write .
```

### Supabase (Backend)
```bash
# Start local Supabase stack
supabase start

# Stop local Supabase
supabase stop

# View Supabase Studio (database UI)
# Navigate to http://localhost:54323

# Generate TypeScript types from database schema
pnpm sync:types

# Create a new migration
supabase migration new <migration_name>

# Apply migrations locally
supabase db reset

# View Edge Function logs
supabase functions serve --debug

# Deploy Edge Functions to production
supabase functions deploy <function_name>
```

### Single Test Execution
```bash
# Run a specific test file with Vitest
pnpm --filter @paynless/web test -- <test-file-name>

# Run tests matching a pattern
pnpm test -- --grep="specific test name"

# Run integration tests for a specific service
pnpm --filter @paynless/api test:integration -- <test-file>
```

## Architecture Overview

### Monorepo Structure
```
apps/
├── web/              # React web app (Vite + TypeScript)
└── windows/          # Windows Desktop app (Tauri)

packages/
├── api/              # API client with Supabase integration
├── types/            # Shared TypeScript types (application types, not DB types)
├── store/            # Zustand state management stores
├── analytics/        # Analytics integration (PostHog)
├── utils/            # Utility functions
└── platform/         # Platform abstraction layer (Web/Desktop/Mobile)

supabase/
├── functions/        # Deno Edge Functions (backend API)
├── migrations/       # PostgreSQL database migrations
├── integration_tests/ # Backend integration tests
└── config.toml       # Supabase CLI configuration
```

### Key Architectural Patterns

**API-First Design:** Clear separation between frontend (React) and backend (Supabase Edge Functions). All business logic exposed via RESTful API endpoints.

**Singleton API Client Pattern:** `@paynless/api` exports a singleton `api` object initialized once per application lifecycle via `initializeApiClient(config)`. Used throughout stores and components without dependency injection.

**Component Organization (Standard Structure):**
```
component/
├── interface.ts       # ALL types + contracts (no external type dependencies)
├── adapter.ts         # Concrete implementation using interface types
├── mocks.ts           # Official mocks/stubs/test doubles
├── component.test.ts  # Tests using local mocks
└── README.md          # Documentation
```

**Type System Rules:**
- Components MUST define ALL types within their interface.ts (no external type dependencies)
- Use application types from `@paynless/types` before database types
- Use the narrowest type available for each purpose
- Never import entire libraries with `*`, never alias imports, never add `"type"` to type imports

**State Management:**
- Zustand stores for global state (auth, AI, dialectic projects, notifications)
- TanStack Query for server state & data caching
- React Context for runtime configuration

**Platform Abstraction:** `@paynless/platform` abstracts platform-specific features allowing shared UI code to adapt across Web, Desktop (Tauri), and future Mobile platforms.

### AI Dialectic Engine

The core feature is a multi-stage document generation pipeline:
1. **Hypothesis** - Initial model responses
2. **Antithesis** - Critique/alternative perspectives
3. **Synthesis** - Integration of feedback
4. **Parenthesis** - Implementation planning
5. **Paralysis** - Final decision/artifact selection

**Storage Architecture:** All dialectic artifacts (prompts, AI contributions, user feedback, generated documents) are stored in Supabase Storage following a structured folder hierarchy:
```
projects/{project_id}/
├── sessions/{session_id_short}/
│   └── iteration_{N}/
│       ├── 0_seed_inputs/
│       ├── 1_hypothesis/
│       ├── 2_antithesis/
│       ├── 3_synthesis/
│       ├── 4_parenthesis/
│       └── 5_paralysis/
```

**Job Processing:** Dialectic work is orchestrated through job queues with payloads stored in the database. Jobs progress through PLAN → EXECUTE → RENDER stages, with state managed via database triggers.

### Database Schema Highlights

Core tables:
- `user_profiles`, `user_subscriptions`, `subscription_plans` - User management
- `ai_chat_conversations`, `ai_chat_messages` - Chat history
- `ai_providers`, `ai_models_catalog` - Available AI models
- `organizations`, `organization_members` - Multi-tenancy
- `dialectic_projects`, `dialectic_sessions`, `dialectic_contributions` - Dialectic engine
- `dialectic_project_resources` - Project artifacts/documents

### Testing Architecture

**Test Layers:**
- **Unit Tests:** Pure logic, mocked dependencies, use Trusted Factories for object construction
- **Integration Tests:** Bounded subsystem testing (API/service/repo/adapter), exercise real code paths within boundary
- **End-to-End Tests:** Minimal, isolated, test full stack only when required

**Test Organization:** Tests mirror source tree (`src/foo/bar.ts` → `tests/foo/bar.test.ts`). Split by behavior if needed (`bar.basic.test.ts`, `bar.error.test.ts`).

**Trusted Factories:** Test factories live under `/tests/factories`, produce full typed domain objects, use production constructors, documented domain-approved defaults.

**Testing Standards:**
- Tests assert desired passing state (no RED/GREEN labels in test names)
- Each test covers exactly one behavior
- Use real application functions/mocks, strict typing, and asserts
- Never change assertions to match broken code - fix the code instead
- MSW for API mocking in tests

## Configuration

### Environment Variables

Create `.env` by copying `.env.example`. Key variables:

**Supabase:**
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (backend only, keep secret)

**Stripe:**
- `STRIPE_SECRET_KEY` - Secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook secret
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Publishable key (frontend)

**AI Providers:**
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GOOGLE_API_KEY` - Google AI API key

**CRITICAL:** AI Dialectic Engine requires API keys in both:
1. Local `.env` file (for local development)
2. Supabase project Vault (for backend Edge Functions to access)

### Local Supabase Configuration

Default ports (configured in `supabase/config.toml`):
- API: `http://localhost:54321`
- Database: `localhost:54322`
- Studio (UI): `http://localhost:54323`
- Inbucket (Email testing): `http://localhost:54324`

Storage buckets:
- `dialectic-contributions` - Dialectic session artifacts (private)
- `prompt-templates` - AI prompt templates (private)

## Development Workflow

### Checklist-Based Development

This codebase uses detailed checklists for complex features (see `docs/Instructions for Agent.md`). Each numbered step represents editing ONE FILE with a complete TDD cycle. Sub-steps use legal-style numbering (1.a, 1.b, 1.a.i, etc.).

**Checklist Labels:**
- `[DB]` Database Schema Change
- `[RLS]` Row-Level Security Policy
- `[BE]` Backend Logic (Edge Function)
- `[API]` API Client Library
- `[STORE]` State Management
- `[UI]` Frontend Component
- `[TEST-UNIT]` Unit Test
- `[TEST-INT]` Integration Test
- `[TEST-E2E]` End-to-End Test
- `[COMMIT]` Git Commit checkpoint
- `[DOCS]` Documentation Update

**Checklist Status:**
- `[ ]` Unstarted
- `[✅]` Completed
- `[🚧]` Incomplete/partial
- `[⏸️]` Paused (discovery/clarification needed)
- `[❓]` Uncertainty to resolve
- `[🚫]` Blocked/stopped

### Git Workflow

**Branches:**
- `main` - Production branch (protected)
- `dev` - Development branch for features
- `feature/*` - Feature branches

**Commit Conventions:** Use conventional commits (`feat:`, `test:`, `fix:`, `docs:`, `refactor:`).

**Rules:**
- Never push incomplete features
- Never push failing tests
- Never push broken builds
- Complete ALL features in scope before pushing to remote

### Component Development Standards

From `.cursor/rules/cursor_architecture_rules.md`:

1. **Self-Managing Components:** Each component manages its own lifecycle, state, and dependencies
2. **Type Ownership:** Components define ALL their types in `interface.ts` (no external type dependencies)
3. **Official Mocks:** Provide official mocks/test doubles in `mocks.ts` for consumers
4. **Fractal Architecture:** Design components to be exportable as standalone libraries
5. **One Function Per File:** If adding a second function, stop and propose refactoring
6. **File Size Limit:** When file exceeds 600 lines, propose decomposition

### Code Standards

- **No Default Values:** All objects must be fully constructed (exception: documented domain-approved defaults in Trusted Factories)
- **No Optional Chaining for Production Code:** Objects must be complete and typed
- **Logging:** Use comprehensive logging for debugging and production monitoring (DO NOT remove logging unless explicitly instructed)
- **Error Handling:** Believe failing tests literally; fix the stated condition before chasing deeper causes
- **Linting:** Resolve all lint errors in-file after each edit (report out-of-file errors and await instruction)

## Important Files & Documentation

- [docs/Instructions for Agent.md](docs/Instructions%20for%20Agent.md) - **CRITICAL:** Detailed development methodology
- [docs/DEV_PLAN.md](docs/DEV_PLAN.md) - Development guidelines and contribution info
- [docs/STRUCTURE.md](docs/STRUCTURE.md) - Architecture details, API endpoints, database schema
- [docs/TESTING_PLAN.md](docs/TESTING_PLAN.md) - Testing strategy and philosophy
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) - Feature tracking
- [README.md](README.md) - Project overview and setup
- [.cursor/rules/ai_agent_development_methodology.md](.cursor/rules/ai_agent_development_methodology.md) - 5-phase development cycle
- [.cursor/rules/cursor_architecture_rules.md](.cursor/rules/cursor_architecture_rules.md) - Component architecture standards

## Working with This Codebase

1. **Always read [docs/Instructions for Agent.md](docs/Instructions%20for%20Agent.md) first** - It contains mandatory development rules
2. **Declare your mode** in every response: `Mode: Builder` or `Mode: Reviewer`
3. **Follow the Read → Analyze → Explain → Propose → Edit → Lint → Halt cycle**
4. **Edit only ONE file per turn** - If you discover multi-file needs, stop and propose checklist updates
5. **Use TDD** - Write RED tests before implementation (except for types/interfaces/docs)
6. **Respect dependency order** - Build foundation layers first
7. **Use strict typing** - No `any`, use narrowest types, no type casting (except Supabase clients and intentional test malformed objects)
8. **Preserve existing functionality** - Never rename functions/variables or refactor without explicit instruction
9. **Never create documentation files** unless explicitly requested
10. **After writing a file, read it back** to confirm changes were applied correctly

## Supabase Local Development

The local Supabase instance provides a complete development environment. After `supabase start`:
- Access Studio UI at `http://localhost:54323` for database management
- View email testing at `http://localhost:54324` (Inbucket)
- API available at `http://localhost:54321`

Type generation: Run `pnpm sync:types` after any database schema changes to regenerate TypeScript types.

## Multi-Platform Support

The framework is designed for multi-platform deployment:
- **Web:** React app via Vite (primary)
- **Desktop:** Tauri-based Windows app (in development)
- **Mobile:** iOS/Android (planned, using `@paynless/platform` abstraction)

The `@paynless/platform` package provides platform-specific implementations (filesystem access, native dialogs, etc.) with a unified interface.
