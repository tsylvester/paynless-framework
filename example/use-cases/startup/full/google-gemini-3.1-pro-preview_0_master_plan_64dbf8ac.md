# Index
Phase 1: Foundational Infrastructure

Phase 2: Core ATS Mechanics

Phase 3: AI Intelligence Pipeline

Phase 4: Sourcing & Launch



# Executive Summary
The Master Plan details a hyper-focused, four-sprint roadmap explicitly tailored to a 3-person team operating under a 4-month deadline. It prioritizes establishing the Supabase and Inngest foundation immediately (Phase 1) to definitively eliminate the architectural risk associated with long-running, timeout-prone AI operations on Vercel. By sequencing backend isolation and multi-tenancy first, the team secures a stable foundation for the subsequent rollout of the core UI logic (Phase 2), AI semantic screening (Phase 3), and the high-leverage Chrome Extension (Phase 4). The aggressive descoping of native B2B job board APIs in favor of a user-operated extraction tool guarantees we hit the MVP launch window while still delivering the product's core generative value.



# Implementation Phases
**Name:** Phase 1: Foundational Infrastructure

**Objective:** Establish Supabase DB, Auth, Stripe webhooks, and Async Queue boilerplate.

**Technical context:** Laying the structural multi-tenant foundation and establishing connection to Inngest event endpoints. This phase addresses the highest architectural risks immediately by decoupling heavy compute from the synchronous Next.js API paths.

**Implementation strategy:** Configure Supabase CLI local development, initialize Next.js repo, wire up Stripe checkout/webhooks. Provision Inngest client and ensure webhook cryptographic validation is in place.

**Milestones:**

  - **Id:** MS-1
  - **Title:** Core Setup & Proof of Concept
  - **Objective:** Deploy baseline infrastructure and prove async timeout mitigation.
  - **Provides:** - DB Schema
- Auth JWT Context
- Inngest Event Pipeline
- Stripe Webhook Handlers
  - **Directionality:** Bottom-up infrastructure
  - **Requirements:** - Supabase initialized with migrations committed via CLI
- Stripe Webhooks receiving and accurately updating DB limits
- Inngest dummy job processing to prove async execution without Edge timeouts
- RBAC roles defined via Custom Claims
  - **Status:** [ ]
  - **Coverage notes:** Covers foundational data layer, identity layer, and compute queue layer.
  - **Iteration delta:** Initial baseline

**Name:** Phase 2: Core ATS Mechanics

**Objective:** Core ATS CRUD (Jobs, Pipelines) and direct-to-S3 uploads.

**Technical context:** Building the UI shells and synchronous data mutations that users interact with. Bypasses Edge memory limits during PDF uploads by using presigned URLs.

**Implementation strategy:** Implement shadcn components, set up Zustand for workspace state, wire S3 presigned URLs for client-side direct uploads.

**Milestones:**

  - **Id:** MS-2
  - **Title:** Candidate & Job Pipelines
  - **Objective:** Enable users to create jobs and upload resumes securely.
  - **Deps:** - MS-1
  - **Provides:** - Pipeline UI
- Direct Upload Mechanism
- Storage Bucket Policies
  - **Directionality:** UI-driven CRUD
  - **Requirements:** - Jobs can be created, updated, and deleted securely within Workspace boundaries
- Resumes upload directly to S3 bypassing Vercel Edge memory limits
- UI state accurately reflects Workspace active jobs
  - **Status:** [ ]
  - **Coverage notes:** Establishes baseline product value allowing manual pipeline tracking.
  - **Iteration delta:** Initial baseline

**Name:** Phase 3: AI Intelligence Pipeline

**Objective:** OpenAI Integration, pgvector search, Supabase Realtime.

**Technical context:** The critical intelligence payload. Background jobs ingest text, call LLM, and write semantic vectors, returning the data over WebSockets.

**Implementation strategy:** Wrap OpenAI API in Inngest steps, calculate Tiktoken limits to protect budget, validate GPT-4o output with strictly typed JSON schemas, broadcast completion over WebSockets to UI.

**Milestones:**

  - **Id:** MS-3
  - **Title:** AI Screening Engine
  - **Objective:** Automated resume parsing and semantic scoring.
  - **Deps:** - MS-2
  - **Provides:** - AI Scores
- Interview Questions
- Realtime UI Updates
  - **Directionality:** Backend processing to UI update
  - **Requirements:** - Zero Vercel timeouts during PDF parsing and AI scoring
- LLM JSON schema validation passing definitively
- WebSockets reliably hydrate UI state once Inngest pipeline completes
- Strict Tiktoken budget caps enforced per request
  - **Status:** [ ]
  - **Coverage notes:** Delivers the core value proposition of intelligent automation.
  - **Iteration delta:** Initial baseline

**Name:** Phase 4: Sourcing & Launch

**Objective:** Chrome Extension development, QA, and Beta Launch.

**Technical context:** Client-side scraping and CORS configuration to bypass native APIs. Eliminates long B2B negotiation cycles by giving power directly to the user's browser context.

**Implementation strategy:** Build React Chrome extension content scripts, authenticate via Next.js session cookie, securely dispatch CORS payloads to Ingress API.

**Milestones:**

  - **Id:** MS-4
  - **Title:** Chrome Extension & Beta
  - **Objective:** Finalize direct candidate sourcing and system hardening.
  - **Deps:** - MS-3
  - **Provides:** - Sourcing Workflow
- End-to-End System
- Client-Side Extraction Utilities
  - **Directionality:** Client-side ingress
  - **Requirements:** - LinkedIn and targeted Job Board DOMs parsed successfully
- Payloads successfully dispatched to ATS queue securely
- System robustly handles varied extraction scenarios with fallback error handling
  - **Status:** [ ]
  - **Coverage notes:** Completes the MVP timeline by delivering the required sourcing ingress.
  - **Iteration delta:** Initial baseline



# Status Summary
**Up next:**

- MS-1

- MS-2

- MS-3

- MS-4



# Status Markers
**Unstarted:** [ ]

**In progress:** [🚧]

**Completed:** [✅]



# Dependency Rules
Database schemas and Auth must precede CRUD operations

Inngest worker queues must be provisioned before OpenAI API integration

Supabase Storage must be configured before PDF parsing workflows can execute

Next.js API routing and CORS policies must be established before Chrome Extension development

Infrastructure must proceed Application State

Application State must proceed AI Orchestration

AI Orchestration must proceed External Ingress



# Generation Limits
**Max steps:** 200

**Target steps:** 120-180

**Max output lines:** 600-800



# Feature Scope
Async AI Resume Screening & Scoring

Automated Interview Question Generation

Chrome Extension Sourcing Tool

Team Workspaces & RBAC via Supabase

Stripe Subscriptions & Metered Billing



# Features
Asynchronous AI Resume Screening & Scoring using GPT-4o

Automated Interview Question Generation tied to specific Job Descriptions

Chrome Extension Sourcing Tool targeting LinkedIn and Job Boards

Secure Team Workspaces & RBAC enforced by PostgreSQL RLS

Stripe Subscriptions seamlessly tracking metered Token consumption



# MVP Description
A lightweight, AI-native Applicant Tracking System (ATS) tailored specifically for SMBs running entirely on serverless architecture with asynchronous offloading. It explicitly guarantees zero blocked UI threads by deferring heavy LLM compute (resume parsing, scoring) to background worker queues. It avoids expensive 6-12 month B2B partnership negotiations by utilizing a user-operated Chrome extension for direct DOM sourcing, achieving immediate time-to-market within the strict 4-month boundary.



# Market Opportunity
Capturing tech-forward startups needing affordable, intelligent automation without enterprise vendor lock-in. The primary market lies within the highly underserved SMB segment (10-250 employees) who actively seek AI-driven productivity multipliers but cannot justify the cost or complexity of heavy incumbents like Greenhouse or Lever.



# Competitive Analysis
Targeting the 'missing middle' between standalone AI wrappers and rigid enterprise incumbents. Legacy tools force restrictive workflows and keep generative AI behind massive premium paywalls. Meanwhile, niche AI parsing tools offer rapid screening but completely lack fundamental pipeline tracking and collaborative workspaces. This system integrates transparent AI directly into the baseline pipeline experience.



# Technical Context
The platform is heavily reliant on Vercel Edge compute. Because Vercel enforces strict 10-second request timeouts on standard tiers, relying on synchronous Edge execution for volatile LLM generation or large PDF processing is guaranteed to fail in production. Therefore, we must rely strictly on Inngest to absorb the operational volatility of LLM latency via decoupled background jobs, syncing state back to the UI via Supabase WebSockets.



# Implementation Context
A small 3-person team necessitating extreme leverage of BaaS platforms (Supabase) to minimize boilerplate DevOps. The implementation relies on strict database-level security (RLS) instead of writing bespoke application-tier authorization middleware. Fast UI iteration is powered by Shadcn components. Offloading webhooks and long-running jobs to managed platforms guarantees a maintainable, high-velocity build.



# Test Framework
Jest for unit testing of AI parsing logic, Playwright for E2E user flows.



# Component Mapping
Next.js App Router -> UI, Supabase -> Data Layer, Inngest -> Compute Layer.



# Architecture Summary
Decoupled serverless architecture mitigating Vercel constraints. The system guarantees superior reliability, robust regulatory compliance, and rapid feature delivery by utilizing BaaS and decoupling compute. Event-driven architecture ensures zero data loss during traffic spikes and LLM rate-limit events.



# Architecture
Event-Driven Serverless architecture utilizing Next.js as an orchestration client, Inngest for async background orchestration, and Supabase for real-time Postgres state and multi-tenant isolation.



# Services
Next.js Frontend & API

Supabase Managed Postgres & Auth

Inngest Background Queue

Stripe Billing Engine

OpenAI GPT-4o Interface



# Components
React Server Components

Supabase Realtime WebSockets

Chrome Extension Sourcing Client

Inngest Async Workers

Tiktoken Budget Validator

PDF Extraction Utility



# Integration Points
OpenAI REST API for GPT-4o

Stripe Webhooks for Subscription Lifecycle Tracking

LinkedIn/Job Boards via Chrome Extension DOM parsing



# Dependency Resolution
Native APIs replaced by Extension to bypass negotiations

Custom vector databases replaced by pgvector inside Postgres for simplicity

Vercel Serverless timeouts bypassed completely by utilizing Inngest decoupled architecture



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