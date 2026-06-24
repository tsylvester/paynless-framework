    # Index
    Milestone 1: Foundational Infrastructure Details

Milestone 2: Core ATS Mechanics Details

Shared Infrastructure & Cross-Cutting Capabilities

Schema Mapping
    

    
    # Executive Summary
    This schema translates the Master Plan into a set of highly specific, executable architectural nodes. It isolates the immediate dependency frontier: Milestone 1 (Foundational Infrastructure) and Milestone 2 (Core ATS Mechanics). By formally sequencing Supabase multi-tenancy schemas, Stripe webhook integrations, and Inngest queue bindings before any frontend CRUD or file storage operations are permitted, the schema mathematically enforces the core architectural mandate—eliminating the risk of Vercel serverless timeouts via decoupled, asynchronous compute.
    

    
    # Pipeline Context
    The milestone schema bridges the high-level Master Plan and low-level task executions. It translates the strategic project phases into a strict sequence of architectural nodes. By isolating the 'HOW' into bounded modules, it ensures that cross-cutting concerns (like database migrations, multi-tenant RLS, and async queue configurations) are explicitly established before feature-level UI and AI integration work begins, guaranteeing adherence to our strict dependency rules and mitigating critical timeline risks.
    

    
    # Selection Criteria
    dependency frontier: only milestones whose deps are [✅] or in current batch
    

    
    # Shared Infrastructure
    Supabase Core (Server & Client): Centralized initialization of PostgREST and GoTrue Auth clients to be shared across API routes and React Server Components.

Next.js App Router Core: Foundational request parsing, CORS enforcement middleware, and structured Edge/Node runtime configurations.

Inngest Singleton: Shared event payload typings and client instantiation for dispatching and receiving background jobs across the application.

Stripe Webhook Verifier: Reusable cryptographic signature validation middleware for secure billing synchronization.

Tiktoken Middleware Utility: Programmatic budget constraint module to calculate token counts globally before LLM dispatches.
    

    
    # Milestones
    **Id:** MS-1

**Title:** Core Setup & Proof of Concept

**Status:** [ ]

**Objective:** Deploy baseline infrastructure and prove async timeout mitigation.

**Nodes:**

  - **Path:** infrastructure/supabase
  - **Title:** Provision Database & Auth
  - **Objective:** Establish multi-tenant RLS schema for Workspaces and Users.
  - **Role:** Backend Architect
  - **Module:** Data Layer
  - **Provides:** - GoTrue Auth
- RLS Constraints
- Users Schema
- Workspaces Schema
  - **Directionality:** Foundation
  - **Requirements:** - Migrations committed via Supabase CLI
- RBAC roles defined via GoTrue custom claims
- Zero default access (RLS enabled strictly on all tables)

  - **Path:** infrastructure/stripe
  - **Title:** Stripe Webhook API Integration
  - **Objective:** Securely synchronize metered billing limits and subscription tiers into the database.
  - **Role:** Backend Developer
  - **Module:** Billing Integration
  - **Deps:** - infrastructure/supabase
  - **Provides:** - Stripe Webhook API Handler
- DB Token Limit Updates
  - **Directionality:** External Ingress to DB
  - **Requirements:** - Verify Stripe cryptographic signatures via stripe-node
- Idempotent event processing for checkout and limits
- Update Workspace token_usage and tier reliably

  - **Path:** infrastructure/inngest
  - **Title:** Async Queue Boilerplate
  - **Objective:** Wire up Next.js API to receive and process Inngest events safely.
  - **Role:** Systems Engineer
  - **Module:** Compute Layer
  - **Deps:** - infrastructure/supabase
  - **Provides:** - Worker Router
- Event Payload Types
- Dummy Job Execution Validation
  - **Directionality:** Foundation
  - **Requirements:** - Events strictly typed via TypeScript interfaces
- Mock job executes successfully bypassing Vercel 10s limits
- API route exposed securely at /api/inngest

**Id:** MS-2

**Title:** Candidate & Job Pipelines

**Status:** [ ]

**Objective:** Enable users to create jobs and upload resumes securely.

**Nodes:**

  - **Path:** core/ui-shell
  - **Title:** Application Layout & Global State
  - **Objective:** Scaffold the shadcn/ui shell and Zustand workspace state management.
  - **Role:** Frontend Architect
  - **Module:** UI Layer
  - **Deps:** - infrastructure/supabase
  - **Provides:** - Global Navigation
- Workspace Context Provider
- Theme & Component Primitives
  - **Directionality:** Client Foundation
  - **Requirements:** - Next.js Root Layout configured with Tailwind
- Shadcn/UI components initialized
- Zustand store accurately hydrates workspace data on mount

  - **Path:** core/jobs-crud
  - **Title:** Jobs Management Pipelines
  - **Objective:** Implement synchronous UI mutations for tracking ATS job listings.
  - **Role:** Frontend Developer
  - **Module:** ATS Application
  - **Deps:** - core/ui-shell
- infrastructure/supabase
  - **Provides:** - Jobs Dashboard
- Job Creation Workflow
- Pipeline View State
  - **Directionality:** UI-driven CRUD
  - **Requirements:** - Create, Read, Update, Delete (CRUD) operations on Jobs table
- Strict adherence to Workspace boundaries via RLS testing
- Optimistic UI updates via React hooks

  - **Path:** core/storage
  - **Title:** Direct-to-S3 Resume Uploads
  - **Objective:** Configure Supabase Storage for direct client-side PDF ingestion.
  - **Role:** Backend Architect
  - **Module:** Storage Layer
  - **Deps:** - infrastructure/supabase
- core/jobs-crud
  - **Provides:** - Storage Bucket Policies
- Pre-signed URL API
- Candidate Record Initializer
  - **Directionality:** Client to Object Store
  - **Requirements:** - Storage buckets provisioned securely via CLI
- Pre-signed URLs generated strictly for authenticated Workspace Members
- File uploads completely bypass Vercel API memory limits
- Initial Candidate record created upon successful blob storage
    

    
    # Iteration Semantics
    replace, don't extend; reference prior schema for continuity