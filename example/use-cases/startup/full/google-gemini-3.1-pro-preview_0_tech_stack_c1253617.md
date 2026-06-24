# Tech Stack Recommendations


## Frontend Stack
**Framework:** **Next.js App Router (React)**: Selected as the core frontend framework utilizing React Server Components (RSC) to optimize SEO, minimize client bundle sizes, and deliver fast initial page loads, acting as a highly responsive thin client.

**Styling:** **Tailwind CSS + Radix UI (shadcn/ui)**: Employs a utility-first CSS framework coupled with unstyled, highly accessible UI primitives. This combination ensures rapid, consistent, and highly customizable interface component development critical for the 4-month MVP timeline.

**State management:** **React Context / Zustand**: Utilizes Zustand for lightweight, un-opinionated global state management to handle application-wide data (like workspace context), paired with standard React Context for localized component state, minimizing unnecessary boilerplate.

**Realtime:** **Supabase Realtime Client**: Integrates WebSockets for immediate UI hydration, enabling the frontend to seamlessly subscribe to database replication events and receive asynchronous state updates the moment background AI processing tasks conclude.



## Backend Stack
**Framework:** **Next.js API Routes (Serverless/Edge)**: Serves as the primary API orchestration and integration layer, utilizing Vercel's Edge network for low-latency routing, webhook reception (Stripe), and secure dispatch of asynchronous tasks.

**Async orchestration:** **Inngest**: A critical decoupled background worker framework explicitly chosen to handle all compute-heavy operations (e.g., PDF extraction, OpenAI inference) entirely asynchronously, definitively bypassing Vercel's strict 10-second synchronous serverless timeout limits.

**Runtime:** **Vercel Node.js / Edge Runtime**: Strategically targets Vercel's managed runtimes to distribute workloads efficiently. Leverages the Edge runtime for fast, lightweight routing/auth checks and the Node.js runtime where broader compatibility is required for heavier legacy parsing libraries.

**Auth:** **Supabase GoTrue**: Acts as the foundational identity and access management service, securely handling JWT-based session tokens and driving the multi-tenant Role-Based Access Control (RBAC) architecture.



## Data Platform
**Database:** **Supabase PostgreSQL**: A fully managed, highly scalable relational database serving as the primary system of record for organizations, users, job descriptions, workflows, and structured candidate profiles.

**Vector store:** **pgvector (PostgreSQL extension)**: Consolidates advanced semantic search capabilities directly within the primary PostgreSQL cluster. It securely stores 1536-dimensional embeddings for candidate resumes and job descriptions without introducing the operational overhead of a third-party vector database like Pinecone.

**Object storage:** **Supabase Storage**: Manages secure, direct-from-client uploads of unstructured candidate resumes (PDF/DOCX) via time-bound, pre-signed URLs. This explicitly bypasses Vercel API payload memory constraints and limits server-side ingress bottlenecks.

**Orm:** **Prisma or Drizzle ORM**: Provides robust, type-safe database access, bridging the Next.js API application layer with the Supabase PostgreSQL cluster to ensure schema synchronization, rapid iteration, and high developer velocity.



## DevOps Tooling
**Hosting:** **Vercel**: The exclusive deployment platform for the Next.js frontend and API routes, providing zero-configuration serverless scaling, automated preview environments per pull request, and global edge caching.

**Ci cd:** **GitHub Actions**: Powers the automated CI/CD pipeline, aggressively enforcing strict unit testing, linting, and TypeScript type-checking before authorizing Vercel preview or production deployments.

**Infrastructure as code:** **Supabase CLI**: Mandates Infrastructure-as-Code (IaC) principles for all database schema migrations, Row Level Security (RLS) policy configurations, and guarantees local development environment parity with production.

**Observability:** **Vercel Logs + PostHog**: Establishes a dual-layered observability stack. Vercel Analytics and function logs monitor backend edge orchestration tracing, while PostHog tracks granular frontend user funnel telemetry to measure MVP adoption metrics.



## Security Tooling
**Tenant isolation:** **PostgreSQL Row Level Security (RLS)**: Cryptographically enforces strict multi-tenancy rules at the foundational database level, mathematically guaranteeing absolute data isolation between different organizational workspaces regardless of application-tier routing flaws.

**Secret management:** **Vercel Environment Vault**: Securely injects and manages encrypted environment variables (e.g., highly sensitive OpenAI keys, Stripe webhook signing secrets), specifically scoping them to isolated development, staging, or production environments.

**Auth tokens:** **JWT (GoTrue)**: Utilizes secure JSON Web Tokens issued by Supabase GoTrue to definitively govern session states and seamlessly inject specific RBAC role claims (Admin/Member) used downstream for RLS evaluation.



## Shared Libraries
pdf2json (Document parsing and text extraction)

tiktoken (LLM token estimation and strict budget enforcement)

zod (End-to-end schema validation for API boundaries and AI outputs)

stripe-node (SaaS monetization and secure billing webhooks)



## Third-Party Services
OpenAI (GPT-4o standard model with Zero Data Retention policies applied)

Stripe (Payments, SaaS Subscriptions, and Metered Billing Infrastructure)



## Component Recommendations
**Component name:** Async Background Worker Queue

**Recommended option:** Inngest

**Rationale:** Provides seamless step-level retries, deep observability, and complex decoupled execution capabilities directly within the Next.js stack. This structurally eliminates synchronous serverless timeouts without requiring the lean 3-person engineering team to provision, monitor, or manage separate heavy infrastructure like self-hosted Redis, Celery, or Temporal clusters.

**Alternatives:**

- Supabase Edge Functions + pg-boss

- Temporal

- AWS SQS

**Tradeoffs:**

- Introduces a critical, core third-party proprietary orchestration dependency, trading potential vendor lock-in for a radically simplified Developer Experience (DX) and near-zero operational overhead.

**Risk signals:**

- High volumes of Dead Letter Queue (DLQ) events indicating widespread parsing or AI generation failures.

- Vendor lock-in constraints combined with unexpected Inngest pricing changes or service execution limits.

**Integration requirements:**

- A dedicated Next.js API route must be exclusively configured and secured to serve as the remote execution and event consumption endpoint for the Inngest orchestration engine.

**Operational owners:**

- Systems Architect

**Migration plan:**

- If Inngest service limits, SLAs, or pricing constraints are breached at scale, abstract the core workload execution layer to utilize standard HTTP webhooks backed by a fully managed AWS SQS instance and standalone Node.js workers.

**Component name:** Candidate Sourcing Mechanism

**Recommended option:** React-based Chrome Extension

**Rationale:** Completely bypasses the severe 6-12 month timeline risk associated with negotiating and technically integrating enterprise B2B API partnerships with proprietary professional networks like LinkedIn. It provides an immediate, frictionless, user-controlled data extraction vector to capture top-of-funnel candidate volume for the MVP.

**Alternatives:**

- Official B2B APIs (LinkedIn, Indeed)

- Third-party Scraping APIs (e.g., PhantomBuster)

**Tradeoffs:**

- Demands continuous engineering maintenance to keep DOM parsers up-to-date against frequent, unannounced, and potentially hostile UI changes on target sourcing websites.

- Relies entirely on localized client-side execution contexts, fundamentally limiting the ability to execute centralized, server-side batch processing automation.

**Risk signals:**

- Target platforms implementing aggressive CSS class name obfuscation and dynamic rendering to break parsers.

- Aggressive algorithmic blocking or shadow-banning of user IP addresses by target job boards detecting DOM extraction patterns.

**Integration requirements:**

- Strict Cross-Origin Resource Sharing (CORS) rules must be heavily configured on the core Next.js API specifically to accept authorized POST requests exclusively from the designated Chrome Extension ID.

**Operational owners:**

- Frontend Lead

**Migration plan:**

- Shift progressively toward official native B2B APIs and authenticated platform integrations once the platform establishes sufficient scale, market traction, and venture funding to successfully negotiate enterprise access.



## Open Questions
Should the engineering team standardly utilize Prisma or Drizzle ORM for type-safe database queries against Supabase, specifically considering Drizzle's potentially lighter Edge runtime footprint and cold start performance?

Are there critical compatibility issues or performance bottlenecks between the legacy `pdf2json` extraction library and Vercel's specific Serverless/Edge Node environment configurations under heavy concurrent loads?



## Next Steps
Initialize the core Next.js Git repository incorporating the Tailwind CSS framework and Radix UI (shadcn/ui) boilerplate components to unblock frontend development.

Provision the foundational Supabase project environment and establish standardized local development parity for all engineers utilizing the Supabase CLI.

Immediately implement and deploy a proof-of-concept Inngest background function executing a mocked OpenAI API call to definitively validate serverless timeout mitigation under Vercel staging environments.