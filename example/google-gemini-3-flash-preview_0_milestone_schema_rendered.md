    # Index
    1. Executive Summary

2. Pipeline Context

3. Selection Criteria

4. Shared Infrastructure

5. Milestone M1: Foundation & Multi-Tenant Architecture

6. Milestone M2: Deterministic NLP Capture Engine

7. Iteration Semantics
    

    
    # Executive Summary
    The Milestone Schema for the Hello World Productivity Suite establishes a robust path through Phase 1 (Foundation) and Phase 2 (Intelligence). Key architectural decisions include prioritizing PostgreSQL RLS for multi-tenant isolation and implementing a deterministic parsing engine via Chrono.js within Next.js Server Actions. By batching M1 and M2, we ensure that the security layer is validated by the actual logic tier (Task Creation) immediately, reducing architectural drift and ensuring a 'Secure-by-Design' utility loop.
    

    
    # Pipeline Context
    This Milestone Schema acts as the 'Middle Zoom' artifact, bridging the high-level Master Plan with low-level Implementation Checklists. It decomposes strategic milestones into discrete architectural work nodes. Each node defines a specific module's path, role, and the capabilities it provides to the system, ensuring that developers and automated agents have a clear blueprint for component integration and dependency resolution.
    

    
    # Selection Criteria
    The selection is focused on the **Dependency Frontier**. Milestone M1 (Foundation) has no dependencies and is selected for immediate architectural definition. Milestone M2 (NLP Engine) depends on M1 and is included in this batch to establish the core logic-to-data flow early in the lifecycle. Milestones M3 and M4 are deferred as their dependencies (M2) are currently [ ].
    

    
    # Shared Infrastructure
    1. [CONFIG] Next.js 14 App Router (src/app) with Edge Runtime preference.

2. [DB] Supabase client-side and server-side initialization utilities (src/lib/supabase).

3. [UI] Tailwind CSS and shadcn/ui configuration (src/components/ui).

4. [BE] Zod-based shared validation schemas (src/types/schemas).

5. [API] Standardized Server Action response envelope for consistent error handling.
    

    
    # Milestones
    **Id:** M1

**Title:** Foundation & Multi-Tenant Architecture

**Status:** [ ]

**Objective:** Establish a secure, multi-tenant baseline using Supabase Auth and PostgreSQL Row Level Security (RLS).

**Nodes:**

  - **Path:** prisma/schema.prisma
  - **Title:** Relational Schema Definition
  - **Objective:** Define the core Profiles, Tasks, and Notes tables with explicit relationships.
  - **Role:** [DB]
  - **Module:** Persistence
  - **Provides:** - Prisma Client Types
- Database Migrations
  - **Directionality:** DB -> BE
  - **Requirements:** - Supabase connection string
- Prisma CLI

  - **Path:** supabase/migrations/
  - **Title:** RLS Security Policy Deployment
  - **Objective:** Inject raw SQL migrations to enable RLS and define per-user access policies.
  - **Role:** [RLS]
  - **Module:** Security
  - **Deps:** - Relational Schema Definition
  - **Provides:** - Multi-tenant Data Isolation
- Secure SELECT/INSERT/UPDATE policies
  - **Directionality:** DB -> Infra
  - **Requirements:** - Supabase CLI linked to project

  - **Path:** src/middleware.ts
  - **Title:** Auth & Session Orchestration
  - **Objective:** Implement edge-side session validation and route protection.
  - **Role:** [BE]
  - **Module:** Identity
  - **Provides:** - Route Guarding
- Server-side Session Context
  - **Directionality:** Infra -> BE
  - **Requirements:** - Supabase Auth Environment Variables

  - **Path:** src/app/(auth)/login/
  - **Title:** Magic Link Flow UI
  - **Objective:** Build the minimalist landing and login interface for identity entry.
  - **Role:** [UI]
  - **Module:** Identity
  - **Deps:** - Auth & Session Orchestration
  - **Provides:** - User Login Interface
- Magic Link Triggering
  - **Directionality:** UI -> BE
  - **Requirements:** - shadcn/ui Button and Input components

**Id:** M2

**Title:** Deterministic NLP Capture Engine

**Status:** [ ]

**Objective:** Implement the core logic for task extraction from unstructured text using Chrono.js.

**Nodes:**

  - **Path:** src/lib/parser/chrono-wrapper.ts
  - **Title:** Chrono.js Integration Layer
  - **Objective:** Wrap Chrono.js with localized logic for deterministic date/time extraction.
  - **Role:** [BE]
  - **Module:** Intelligence
  - **Provides:** - parseContent() function
- Temporal Metadata Extraction
  - **Directionality:** Logic -> API
  - **Requirements:** - chrono-node npm package

  - **Path:** src/app/actions/tasks.ts
  - **Title:** Task Life-cycle Server Actions
  - **Objective:** Create type-safe functions for task persistence with RLS enforcement.
  - **Role:** [API]
  - **Module:** Logic
  - **Deps:** - Relational Schema Definition
- Chrono.js Integration Layer
  - **Provides:** - createTask() Server Action
- Optimistic Update Handlers
  - **Directionality:** BE -> DB
  - **Requirements:** - Zod schemas for Task inputs

  - **Path:** src/components/nlp/capture-input.tsx
  - **Title:** NLP Capture UI Component
  - **Objective:** Build the high-velocity input field with real-time feedback.
  - **Role:** [UI]
  - **Module:** Capture
  - **Deps:** - Task Life-cycle Server Actions
  - **Provides:** - Deterministic Input Field
- Visual Confirmation Badge logic
  - **Directionality:** UI -> Logic
  - **Requirements:** - Lucide React icons
- useOptimistic React hook
    

    
    # Iteration Semantics
    This schema replaces any prior architectural drafts for the selected milestones. It serves as the single source of truth for the 'Middle Zoom' stage. Subsequent iterations will refine these nodes based on implementation feedback, while maintaining the specified module boundaries and role assignments.