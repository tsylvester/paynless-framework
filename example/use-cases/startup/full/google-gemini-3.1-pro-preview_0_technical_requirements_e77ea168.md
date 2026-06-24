# Index
1. Executive Summary

2. Subsystems & Services

3. APIs & Schemas

4. Data Flows & Integrations

5. Stack Definiton



# Executive Summary
The platform architecture guarantees zero blocked UI threads and complete protection from Vercel timeout limitations by delegating all LLM operations and PDF parsing to the Inngest background worker queue. Paired with a client-side Chrome Extension for sourcing, this stack fulfills the rigid 4-month MVP deadline while retaining strict multi-tenant isolation via Supabase RLS. By explicitly defining API boundaries and offloading state management to managed PostgreSQL, the team is empowered to ship rapidly with enterprise-grade resilience.



# Subsystems
**Name:** Next.js Serverless Orchestration Layer

**Objective:** Act as a thin orchestration client to manage UI rendering, user session states, and lightweight API routing.

**Implementation notes:** Leverage Next.js App Router with React Server Components for SEO and fast hydration. Use Edge API routes exclusively for lightweight requests and webhook receptions to maintain low latency.

**Name:** Supabase Managed Data & Auth Platform

**Objective:** Provide a foundational, highly secure Backend-as-a-Service layer for multi-tenant data storage, identity verification, and object storage.

**Implementation notes:** Utilize PostgreSQL with pgvector for unified relational and semantic data. Enforce strict Row Level Security (RLS) bound to GoTrue JWT custom claims for absolute tenant isolation. Use Supabase Storage for direct-from-client resume uploads.

**Name:** Inngest Async Worker Environment

**Objective:** Process heavy compute tasks (resume PDF parsing, OpenAI LLM inference) asynchronously without blocking Vercel serverless threads.

**Implementation notes:** Use Inngest for step-level execution logic, automatic retries, and exponential backoff. Integrate `tiktoken` middleware to calculate and validate LLM payloads prior to GPT-4o inference to protect budget constraints.

**Name:** Chrome Extension Sourcing Client

**Objective:** Bypass LinkedIn and Job Board API restrictions to ingest candidates directly from the user's browser.

**Implementation notes:** React-based content script pulling DOM structure, securely authenticated via the user's Next.js session, posting candidate JSON payloads to CORS-secured Next.js API endpoints.



# APIs
**Name:** Next.js Edge API Routes

**Description:** Stateless, edge-deployed communication layer for first-party frontend requests and external webhook ingestion.

**Contracts:**

- POST /api/jobs/create

- GET /api/candidates/list

- POST /api/storage/presigned-url

**Name:** Extension Ingress API

**Description:** Secured, strictly CORS-configured Next.js POST endpoint meant exclusively for extension payloads.

**Contracts:**

- POST /api/candidates/source

**Name:** Stripe Webhook API

**Description:** Receives subscription state changes, verifies cryptographic signatures, and synchronizes active tier and token limits.

**Contracts:**

- POST /api/webhooks/stripe

**Name:** OpenAI REST API

**Description:** External interface for accessing the GPT-4o model, strictly accessed by the backend worker queue utilizing Zero Data Retention policies.

**Contracts:**

- POST https://api.openai.com/v1/chat/completions

**Name:** Supabase PostgREST API

**Description:** Auto-generated RESTful interface for direct client-to-database communication governed by PostgreSQL RLS.

**Contracts:**

- GET /rest/v1/candidates?select=*

- POST /rest/v1/jobs



# Database Schemas
**Name:** Users

**Columns:**

- id (UUID, PK)

- email (VARCHAR)

- workspace_id (UUID, FK)

- role (VARCHAR)

- created_at (TIMESTAMP)

**Indexes:**

- idx_user_workspace

**Rls:**

- Enable RLS

- User can read/write own profile

- Workspace Admin can read workspace users

**Name:** Workspaces

**Columns:**

- id (UUID, PK)

- name (VARCHAR)

- stripe_customer_id (VARCHAR)

- tier (VARCHAR)

- token_usage (INTEGER)

**Indexes:**

- idx_stripe_cust

**Rls:**

- Enable RLS

- Workspace Members can read

- Workspace Admins only write

**Name:** Jobs

**Columns:**

- id (UUID, PK)

- workspace_id (UUID, FK)

- title (VARCHAR)

- description (TEXT)

- status (VARCHAR)

- created_at (TIMESTAMP)

**Indexes:**

- idx_job_workspace_status

**Rls:**

- Enable RLS

- Workspace Members can read/write

**Name:** Candidates

**Columns:**

- id (UUID, PK)

- workspace_id (UUID, FK)

- job_id (UUID, FK)

- resume_url (VARCHAR)

- score (INTEGER)

- embedding (VECTOR(1536))

**Indexes:**

- idx_workspace_job

- hnsw_embedding

**Rls:**

- Enable RLS

- Workspace Members read/write

**Name:** Assessments

**Columns:**

- id (UUID, PK)

- candidate_id (UUID, FK)

- score_justification (TEXT)

- interview_questions (JSONB)

- processed_at (TIMESTAMP)

**Indexes:**

- idx_assessment_candidate

**Rls:**

- Enable RLS

- Workspace Members read/write



# Proposed File Tree
```
├── apps
│   ├── web (Next.js app)
│   │   ├── app/api
│   │   ├── components
│   │   └── lib
│   └── extension (Chrome Extension)
├── packages
│   ├── db (Prisma/Drizzle + Supabase)
│   └── jobs (Inngest functions)
└── supabase
    └── migrations
```



# Architecture Overview
A highly resilient, event-driven, multi-tenant Serverless architecture utilizing Next.js as a thin orchestration client, Supabase for foundational data/auth, and Inngest for asynchronous processing of heavy AI tasks (PDF extraction, OpenAI inference), completely bypassing synchronous serverless execution limits.



# Delta Summary
Initial baseline established. Focus is on finalizing the event-driven decoupling strategy using Inngest and preparing schemas for pgvector and multi-tenant RLS.



# Iteration Notes
Ensure Zero Data Retention policy is mapped to OpenAI configurations via the API adapter. The project timeline rigidly dictates abandoning native Node BFF operations in favor of Edge routing and async workers.



# Feature Scope
Async AI Resume Screening & Scoring

Automated Interview Question Generation

Chrome Extension Sourcing Tool

Team Workspaces & RBAC via Supabase

Stripe Subscriptions & Metered Billing



# Feasibility Insights
Event-driven async architecture safely bypasses Vercel 10s serverless timeout limits, eliminating the highest technical risk for AI processing.

Chrome Extension mitigates the severe 6-12 month timeline risk associated with negotiating and implementing native B2B APIs for job boards.

Supabase RLS handles multi-tenant data isolation effectively, drastically reducing bespoke middleware security logic.



# Non-Functional Alignment
Security: Zero Data Retention enforced on OpenAI, ensuring candidate PII is not used for foundational model training.

Performance: Async background processing guarantees zero browser freezing, providing a highly responsive user interface during mass resume uploads.

Maintainability: Shifting extraction to the client reduces server-side scraping liabilities and localizes DOM-parsing updates.



# Outcome Alignment
Aligns the technical implementation strictly with the 4-month MVP, 3-person constraints. By removing long-tail API partnership dependencies and utilizing robust BaaS/async tooling, the team guarantees delivery of core AI intelligence capabilities without compromising system stability or SaaS unit economics.



# North Star Metric
Number of Candidates Successfully Screened & Ranked by AI



# Primary KPIs
Monthly Recurring Revenue (MRR)

Weekly Active Workspaces (WAW)

Average Time Saved per Job Description (Target: 5+ hours)



# Guardrails
OpenAI API Cost < 15% of MRR

System Uptime > 99.9%

AI Output Override Rate < 10%



# Measurement Plan
Implement PostHog for granular frontend behavioral tracking and funnel drop-offs. Utilize Stripe webhooks as the financial source of truth for MRR. Monitor Vercel and Inngest logs continuously for background queue health, deadlock detection, and operational latency.



# Architecture Summary
System guarantees superior reliability, robust regulatory compliance, and rapid feature delivery by utilizing BaaS and decoupling compute. The strategic separation of long-running workflows into background queues enables standard Serverless deployments while protecting user experience.



# Architecture
Event-driven Serverless Edge with Async Offloading



# Services
Next.js Frontend & API

Supabase Managed Postgres & Auth

Inngest Background Queue

Stripe Billing Engine

OpenAI GPT-4o Interface



# Components
React Server Components

Supabase Realtime WebSockets

Tiktoken Budget Validator

PDF Extraction Utility



# Data Flows
Resume Upload -> Supabase Storage -> Inngest -> OpenAI -> PostgreSQL -> UI via Realtime

Chrome Extension -> Next.js API -> Inngest -> PostgreSQL

Stripe Webhook -> Next.js API -> PostgreSQL (Limits Update)



# Interfaces
Next.js Internal API Routes

Supabase PostgREST

OpenAI REST

Stripe REST



# Integration Points
OpenAI GPT-4o via API adapter

Stripe via Webhook handler

LinkedIn/Job Boards via DOM parsing



# Dependency Resolution
Eliminated native B2B API dependencies via Chrome Extension

Resolved vector store complexity by using pgvector inside Postgres

Bypassed serverless timeouts by utilizing Inngest decoupled architecture



# Security Measures
PostgreSQL Row Level Security (RLS)

RBAC via GoTrue Custom Claims

Zero Telemetry Logging of PII

Webhook Cryptographic Verification



# Observability Strategy
Vercel Analytics for edge latency

Inngest Dashboard for async tracing

PostHog for user telemetry

Supavisor for DB pool health



# Scalability Plan
Horizontal scaling of Inngest queues

Vertical scaling of Supabase compute for pgvector load

Edge distribution of Next.js API routes



# Resilience Strategy
Automated external retries via Inngest step functions

WebSocket fallback protocol via HTTP polling



# Frontend Stack
**Framework:** Next.js App Router (React)

**Styling:** Tailwind CSS + Radix UI (shadcn/ui)

**State management:** React Context / Zustand

**Realtime:** Supabase Realtime Client



# Backend Stack
**Framework:** Next.js API Routes

**Orchestration:** Inngest

**Runtime:** Vercel Node.js / Edge

**Auth:** Supabase GoTrue



# Data Platform
**Database:** Supabase PostgreSQL

**Vector store:** pgvector

**Object storage:** Supabase Storage

**Orm:** Prisma/Drizzle ORM



# DevOps Tooling
**Hosting:** Vercel

**Ci cd:** GitHub Actions

**Iac:** Supabase CLI

**Observability:** Vercel Logs + PostHog



# Security Tooling
**Isolation:** PostgreSQL RLS

**Secrets:** Vercel Environment Vault

**Tokens:** JWT



# Shared Libraries
pdf2json

tiktoken

zod

stripe-node



# Third Party Services
OpenAI

Stripe

Inngest