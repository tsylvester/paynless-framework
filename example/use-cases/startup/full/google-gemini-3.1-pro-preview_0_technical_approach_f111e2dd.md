# Architecture
### Target Architecture

The platform relies on a heavily managed, serverless edge architecture designed to maximize development velocity for a lean 3-person team while ensuring high scalability and low operational overhead.

**Primary Layers & Paradigms:**
- **Compute & Rendering (Next.js App Router):** Acts as the unified layer for both the frontend React application and backend API services. Leveraging React Server Components (RSC) minimizes client-side JavaScript payloads, while serverless API routes handle heavy backend logic without the need for dedicated container orchestration.
- **Data & Auth Layer (Supabase):** Serves as the persistence and identity backend. It provides a managed PostgreSQL instance, GoTrue for authentication, and native Object Storage, operating entirely as a Backend-as-a-Service (BaaS) to eliminate database administration.
- **Intelligence Layer (OpenAI):** GPT-4o handles all asynchronous and synchronous natural language tasks (parsing, scoring, generation).

**Integration Boundaries:**
The architecture establishes strict network boundaries. The Next.js backend acts as a secure intermediary (BFF - Backend for Frontend) for all third-party services. Client browsers never interact directly with OpenAI, Stripe, or ATS integrations. They authenticate via Supabase Auth, and all subsequent authorized state mutations pass through the Next.js API layer which securely handles API keys and secrets.



# Components
### Key Components & Modules

**1. Frontend UI Application**
- **Tech Stack:** Next.js, Tailwind CSS, shadcn/ui.
- **Responsibility:** Delivers a responsive, accessible Applicant Tracking System (ATS) dashboard. It handles job description input, file uploads, candidate rendering, and billing settings.
- **Collaboration:** Consumes Next.js API Routes and Server Actions; uses Supabase client libraries for real-time state updates and direct, secure file uploads (via pre-signed URLs).

**2. Core API & Orchestration Layer**
- **Tech Stack:** Next.js API Routes (Node.js/Edge runtimes).
- **Responsibility:** Orchestrates business logic across domains. Handles multi-tenant routing, webhook listening, and task sequencing (e.g., File Upload -> Trigger Parser -> Trigger LLM -> Update DB).

**3. Database & Authentication (Supabase)**
- **Tech Stack:** Managed PostgreSQL, GoTrue.
- **Responsibility:** Enforces Row Level Security (RLS) to isolate multi-tenant data. Manages RBAC (Admin vs. Member). Stores structured app data and raw candidate files (S3-compatible storage).

**4. Intelligence Engine**
- **Tech Stack:** OpenAI API (GPT-4o), File parsing utilities (e.g., `pdf2json`).
- **Responsibility:** Ingests raw text from parsed PDFs/DOCX files, evaluates candidate fit against job requirements, generates a 0-100 score with a 2-sentence justification, and outputs 5 tailored interview questions.

**5. Billing & Subscription Engine**
- **Tech Stack:** Stripe Billing & Stripe Checkout.
- **Responsibility:** Manages self-serve subscriptions, tier gating (premium AI limits), and payment lifecycle events.
- **Collaboration:** Communicates asynchronously with the Core API via secure webhooks to update workspace access tiers.

**6. External ATS/Sourcing Integrations**
- **Tech Stack:** Merge.dev (Unified API) or native job board APIs.
- **Responsibility:** Inbound candidate sourcing from third-party networks (LinkedIn, Indeed) to auto-populate the platform's candidate pipelines.



# Data
### Data Models, Flows, and Governance

**Data Models & Schema**
The system utilizes a relational schema in PostgreSQL heavily optimized for multi-tenancy. Core tables include:
- **`Workspaces` (Teams):** The root anchor for multi-tenancy. Contains subscription status and aggregated usage limits.
- **`Users` & `Workspace_Users`:** Maps individuals to workspaces with specific roles (Admin, Member).
- **`Subscriptions`:** Caches Stripe subscription states to ensure rapid authorization checks without external API calls.
- **`Jobs`:** Contains Job Descriptions, statuses, and hiring manager metadata.
- **`Candidates`:** Stores parsed resume data, original file references (Supabase Storage URLs), and pipeline statuses.
- **`Reviews` & `InterviewKits`:** Holds the JSON outputs from the LLM (scores, justifications, tailored questions).

**Data Storage & Vector Capabilities**
- The primary datastore is managed PostgreSQL.
- **`pgvector` Extension:** Enabled to store resume embeddings. This allows future enhancements for semantic search (e.g., 'Find candidates similar to X' or querying historical candidate pools against new Job Descriptions).

**Data Flows**
1. **Ingestion:** User uploads a resume (PDF/DOCX). Frontend requests a pre-signed URL and uploads the file directly to Supabase Storage.
2. **Processing Pipeline:** Next.js API is triggered -> fetches the file -> runs `pdf2json` -> constructs a prompt with the Job Description -> calls OpenAI API.
3. **Persistence:** The LLM's structured JSON response is validated and written to the `Reviews` and `InterviewKits` tables.

**Governance & Security**
- **Multi-Tenant Isolation:** Enforced strictly at the database level using PostgreSQL Row Level Security (RLS). Every query automatically appends the user's active `workspace_id` context.
- **Cross-Tenant Data Leaks:** Prevented via RLS policies; queries attempting to read external workspace data will return empty sets natively.
- **PII Handling:** Resumes contain sensitive Personal Identifiable Information. Storage buckets are set to private, and LLM providers are configured with zero-data-retention policies (e.g., OpenAI API Enterprise/Zero-Day retention).



# Deployment
### Deployment Topology & Environments

**Hosting & Continuous Deployment**
- **Frontend & Compute (Vercel):** The Next.js application is deployed directly to Vercel. This provides automatic global edge routing, Serverless function provisioning, and out-of-the-box CI/CD integration. Every push to the main branch triggers an immutable production build.
- **Database & Storage (Supabase Cloud):** Fully managed database scaling, point-in-time recovery, and S3-compatible object storage are offloaded to Supabase's hosted cloud.

**Environment Strategy**
- **Local:** Developers use the Supabase CLI for local PostgreSQL emulation and `.env.local` for isolated testing.
- **Preview/Staging:** Vercel automatically generates Preview Deployments for every Pull Request. These connect to a Staging Supabase project and Stripe Test Mode, enabling full-stack feature validation before merging.
- **Production:** High-availability, production-grade instances of Supabase and Stripe Live Mode. Protected by strict environment variable access controls.

**Operational Tooling**
- **CI Pipeline:** GitHub Actions runs automated tests (Jest/Cypress) and linters (ESLint, Prettier) on all PRs to maintain code quality.
- **Observability:** Custom Vercel logging captures API performance, specifically tracking LLM latency and timeout rates. PostHog is integrated for client-side product usage analytics, funnel tracking, and monitoring drop-offs during Stripe checkout.



# Sequencing
### Implementation Sequencing

Given the strict 4-month (16-week) constraint, the delivery is organized into four distinct, phased sprints designed to de-risk the platform sequentially.

**Sprint 1: Core Infrastructure & Identity (Weeks 1-3)**
- **Objective:** Scaffold the foundation and secure revenue pathways.
- **Tasks:** Next.js project initialization; Supabase GoTrue Auth configuration; Database schema definition and RLS policies implementation. Multi-tenant workspace scaffolding. Stripe Checkout integration and secure webhook handling for subscriptions.
- **Dependencies:** Stripe API, Supabase Cloud.

**Sprint 2: Core ATS Features (Weeks 4-8)**
- **Objective:** Build the non-AI application workflows.
- **Tasks:** CRUD operations for Jobs; candidate tracking UI (kanban/list views); secure file uploads to Supabase Storage; PDF/DOCX file parsing utilities (`pdf2json`); team invite systems and RBAC enforcement.
- **Dependencies:** React/Tailwind/shadcn UI libraries.

**Sprint 3: AI Intelligence Integration (Weeks 9-12)**
- **Objective:** Deliver the primary value proposition.
- **Tasks:** Integrate OpenAI API (GPT-4o); design robust system prompts for extracting, ranking, and generating interview questions; implement human-in-the-loop override UI; build the JSON schema validation for LLM responses; add `pgvector` indexing for candidates.
- **Dependencies:** OpenAI API, prompt optimization.

**Sprint 4: Sourcing, Polish, & Launch (Weeks 13-16)**
- **Objective:** Expand the funnel and finalize quality assurance.
- **Tasks:** Implement external integrations (Merge.dev or direct job boards/LinkedIn); integrate PostHog for telemetry; conduct comprehensive QA (security, multi-tenant boundaries, performance); optimize LLM latency; public launch.
- **Dependencies:** Third-party API approvals (Merge/LinkedIn).



# Risk Mitigation
### Architectural & Delivery Risk Mitigation

**1. API Cost Overruns & Abuse**
- **Risk:** Unbounded usage of the OpenAI API could erode the SaaS profit margins.
- **Mitigation:** Implement strict, tiered rate-limiting based on the workspace's Stripe subscription tier. Implement token budgeting in the backend. If average OpenAI costs breach 15% of the subscription fee, an automated escalation plan will temporarily disable bulk screening for lower tiers and notify the Technical Architect to optimize prompts.

**2. AI Hallucination & Bias**
- **Risk:** The AI may incorrectly score candidates or exhibit systemic bias.
- **Mitigation:** Force the LLM to output structured JSON with a mandatory 'AI reasoning' string (2-sentence justification) for transparency. Require a human-in-the-loop validation step. Utilize high-precision models (GPT-4o) with strictly typed system prompts.

**3. Vendor Lock-in (LLMs)**
- **Risk:** Over-reliance on OpenAI could be problematic if pricing changes or downtimes occur.
- **Mitigation:** Abstract the LLM execution layer behind an internal adapter interface. This allows the team to hot-swap to Anthropic (Claude 3.5 Sonnet) or other models with minimal refactoring if necessary.

**4. Parsing Failures**
- **Risk:** Unconventional resume formats (complex PDFs, images) failing to extract properly.
- **Mitigation:** Implement a robust fallback UI. If text extraction confidence is low, the system will flag the resume and provide an interface for the hiring manager to manually correct or input the data, ensuring the pipeline never fully breaks.



# Open Questions
### Open Questions & Unresolved Decisions

1. **LinkedIn / Sourcing API Access:** Will LinkedIn or other major job boards grant direct API access for automated candidate sourcing? If rejected due to API restrictions, do we pivot to building a companion Chrome Extension for manual candidate clipping, or utilize a unified aggregator like Merge.dev at an additional cost?
2. **File Size & Storage Limitations:** What is the maximum acceptable file size for resume uploads? We need to determine a hard limit (e.g., 5MB vs. 10MB) to balance Supabase storage costs, text extraction limits, and user convenience.
3. **LLM Context Window Management:** For exceptionally long JDs or lengthy candidate histories, how aggressively should we truncate text before sending it to the LLM to preserve token costs and latency while maintaining accurate scoring?
4. **Compliance & Data Residency:** As an ATS handling PII, do we need to limit early adoption to specific regions (e.g., US-only) to avoid immediate GDPR or CCPA compliance overhead during the initial 4-month MVP launch?