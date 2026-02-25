# Index
1. Executive Summary

2. Subsystems & Components

3. API Specifications

4. Data Schema Definitions

5. Technical Stack & Tooling

6. Quality & Performance Guardrails



# Executive Summary
Technical requirements for the Hello World Productivity Suite, specifying a serverless Next.js 14 and Supabase architecture. The system prioritizes speed and security through deterministic NLP (Chrono.js), PostgreSQL RLS, and Edge-first deployment to deliver a high-velocity task management experience.



# Subsystems
**Name:** Identity & Access Management (IAM)

**Objective:** Provide secure, low-friction entry via Magic Link authentication.

**Implementation notes:** Utilizes Supabase Auth with PKCE flow for secure server-side session management. Middleware enforces protection on all (dashboard) routes.

**Name:** Deterministic NLP Engine

**Objective:** Transform unstructured text into structured task metadata with sub-100ms latency.

**Implementation notes:** Wraps Chrono.js in a custom parser library. Executed within Next.js Server Actions on the Edge to ensure high performance.

**Name:** Temporal Persistence Layer

**Objective:** Manage user-specific tasks and notes with strict data isolation.

**Implementation notes:** PostgreSQL database with Row Level Security (RLS) enabled. Prisma ORM handles type-safe interactions and migrations.

**Name:** Proactive Messaging Subsystem

**Objective:** Deliver time-sensitive reminders across devices.

**Implementation notes:** Leverages the Web Push standard. Service workers manage background sync and notification display for PWA parity.



# APIs
**Name:** Task Orchestration API (Server Actions)

**Description:** Internal server actions handling the lifecycle of task objects.

**Contracts:**

- createTask(content: string, parsedData: TaskSchema): Promise<ActionResult>

- toggleTask(id: string): Promise<ActionResult>

- deleteTask(id: string): Promise<ActionResult>

- updateTask(id: string, updates: Partial<TaskSchema>): Promise<ActionResult>

**Name:** Notification Registry API

**Description:** Handles the storage and rotation of VAPID push subscriptions.

**Contracts:**

- registerSubscription(userId: string, subscription: PushSubscription): Promise<void>

- revokeSubscription(endpoint: string): Promise<void>



# Database Schemas
**Name:** profiles

**Columns:**

- id: uuid (PK, references auth.users)

- updated_at: timestamp

- username: text

- full_name: text

- avatar_url: text

**Indexes:**

- username_unique_idx

**Rls:**

- Profiles are viewable by the owner only.

- Users can update only their own profile.

**Name:** tasks

**Columns:**

- id: uuid (PK)

- user_id: uuid (references profiles.id)

- content: text (not null)

- due_at: timestamp (with time zone)

- completed_at: timestamp (null if active)

- created_at: timestamp (default now())

**Indexes:**

- tasks_user_id_idx

- tasks_due_at_idx

**Rls:**

- SELECT: restricted to auth.uid() == user_id

- INSERT: authenticated users only, user_id must match auth.uid()

- UPDATE/DELETE: restricted to auth.uid() == user_id

**Name:** notes

**Columns:**

- id: uuid (PK)

- user_id: uuid (references profiles.id)

- content: text

- created_at: timestamp

**Indexes:**

- notes_user_id_idx

**Rls:**

- Strict isolation via auth.uid() check.



# Proposed File Tree
```
```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/route.ts
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── api/
│       └── push/route.ts
├── components/
│   ├── nlp/
│   │   ├── capture-input.tsx
│   │   └── confirmation-badge.tsx
│   ├── ritual/
│   │   ├── greeting-header.tsx
│   │   └── activity-feed.tsx
│   └── ui/
├── hooks/
│   ├── use-tasks.ts
│   └── use-push-notifications.ts
├── lib/
│   ├── parser/
│   │   ├── chrono-wrapper.ts
│   │   └── types.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── utils.ts
└── types/
    └── database.ts
```
```



# Architecture Overview
Next.js App Router acting as the unified framework for Edge-side rendering and Server Actions, communicating with a Supabase PostgreSQL backend. Deterministic NLP logic is kept local to the runtime to avoid external API latency.



# Delta Summary
Initial baseline technical requirements. Established the move to Next.js 14 App Router and Supabase RLS as the core security model.



# Iteration Notes
Focused heavily on ensuring the NLP engine (Chrono.js) can run in edge environments to hit the <500ms FCP target. Magic Link auth chosen to maintain the 'minimalist' brand identity.



# Feature Scope
1. NLP-based Task Capture with visual confirmation.

2. Personalized Ritual Greeting (Time-of-day logic).

3. Unified Activity Feed (Tasks + Notes).

4. Cross-platform Reminders via PWA/Web Push.



# Feasibility Insights
Chrono.js is highly compatible with Vercel Edge Runtime due to zero native dependencies.

Web Push API support on iOS 16.4+ enables mobile parity for the PWA strategy.

PostgreSQL RLS provides sufficient multi-tenant isolation without complex application logic.



# Non-Functional Alignment
Performance: P95 FCP < 500ms via Edge Rendering.

Security: 100% RLS policy coverage on all tables.

Availability: 99.9% via Supabase and Vercel infrastructure.



# Outcome Alignment
Technical choices (Edge runtime, deterministic NLP, RLS) are optimized for the North Star metric of Weekly Active Task Completion (WATC) by minimizing entry friction and latency.



# North Star Metric
Weekly Active Task Completion (WATC)



# Primary KPIs
7-day Retention Rate

Task Creation Velocity (items per session)

Dashboard Engagement (ritual completion frequency)



# Guardrails
Zero external LLM calls on the critical path to prevent latency bloat.

Mandatory Zod validation for all Server Action payloads.

Standard shadcn/ui primitives only to ensure design consistency.



# Measurement Plan
Instrumentation of PostHog events for: 'task_captured', 'nlp_confirmed', 'ritual_viewed', and 'notification_clicked'. Vercel Speed Insights for real-time performance monitoring.



# Architecture Summary
High-performance, latency-minimized PWA stack optimized for mobile parity and secure multi-tenancy.



# Architecture
A serverless multi-tier architecture using Next.js for the presentation and orchestration layers, and Supabase for the persistence and identity tiers. All data access is gated by database-level RLS policies.



# Services
Supabase (Auth, DB, Realtime)

Vercel (Hosting, Edge Functions, Cron)

Postmark/Resend (Transactional Emails)

PostHog (Product Analytics)



# Components
CommandInput (NLP-enabled field)

GreetingHeader (Dynamic ritual UI)

ActivityFeed (Chronological task list)

ConfirmationBadge (Temporal metadata display)



# Data Flows
User Input -> lib/parser -> UI Confirmation -> Server Action -> Postgres RLS -> UI Success State

Supabase Auth Callback -> Middleware Session Check -> Edge Redirect -> Dashboard Hydration



# Interfaces
Mobile PWA (Installable manifest)

Desktop Browser (Chrome/Safari/Firefox)



# Integration Points
Resend for Magic Link delivery

Sentry for Edge-side exception tracking

PostHog for behavioral event ingestion



# Dependency Resolution
Database schema must be deployed before Server Actions can be tested.

Supabase Auth config must be finalized before Middleware implementation.

NLP library unit tests must pass before UI integration.



# Security Measures
PostgreSQL Row Level Security (RLS)

Zod Schema Validation

CSRF protection via Next.js Server Actions

Content Security Policy (CSP) headers



# Observability Strategy
Exception monitoring via Sentry

Performance metrics via Vercel Speed Insights

Custom logging for NLP parsing failure rates



# Scalability Plan
Horizontal scaling via Vercel Serverless Functions

Connection pooling via Supabase/PgBouncer

Edge-side caching for the 'Ritual' dashboard shell



# Resilience Strategy
Optimistic UI updates for task creation/toggling

Offline read-only access via Service Worker caching

Automatic retries for transient Magic Link failures



# Frontend Stack
**Framework:** Next.js 14 (App Router)

**Styling:** Tailwind CSS

**Ui:** shadcn/ui (Radix UI)



# Backend Stack
**Runtime:** Node.js (Edge Preferred)

**Language:** TypeScript



# Data Platform
**Database:** PostgreSQL

**Baas:** Supabase



# DevOps Tooling
**Hosting:** Vercel

**Ci:** GitHub Actions



# Security Tooling
**Auth:** Supabase PKCE

**Validation:** Zod



# Shared Libraries
Chrono.js

date-fns

Lucide React



# Third Party Services
Postmark/Resend

PostHog

Sentry