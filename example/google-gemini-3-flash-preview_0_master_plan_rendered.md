# Index
1. Executive Summary

2. Roadmap Overview

3. Phase 1: Secure Foundation (Milestone 1)

4. Phase 2: Core Utility & Intelligence (Milestones 2-3)

5. Phase 3: Engagement & Mobile Parity (Milestone 4)

6. Governance & Quality Standards



# Executive Summary
This master plan outlines a 3-phase execution roadmap for the Hello World Productivity Suite. We prioritize a 'Security-First' foundation in Phase 1 by establishing RLS-protected multi-tenancy. Phase 2 introduces the core value proposition: a deterministic NLP capture engine and a personalized ritual dashboard. Phase 3 secures user retention with PWA parity and Web Push reminders. This sequencing ensures technical risks like data isolation and parsing accuracy are mitigated early, while deferring the complexity of browser-specific PWA implementations until the core utility is proven.



# Implementation Phases
**Name:** Phase 1: Secure Foundation

**Objective:** Establish a production-ready, multi-tenant environment with strictly enforced data isolation.

**Technical context:** Next.js 14 App Router, Supabase Auth (PKCE), and PostgreSQL Row Level Security (RLS).

**Implementation strategy:** Database-first development. Establish security guardrails and authentication middleware before any feature UI is built.

**Milestones:**

  - **Id:** M1
  - **Title:** Foundation & Multi-Tenant Architecture
  - **Objective:** Establish secure Next.js/Supabase environment with Row Level Security.
  - **Deps:** - Supabase Account
- Vercel Project
  - **Provides:** - Secure Auth Middleware
- Multi-tenant Database Schema
- Authenticated API Base
  - **Directionality:** Backend -> Infrastructure
  - **Requirements:** - Supabase project linked with local CLI
- Prisma schema deployed with RLS enabled
- Magic Link auth flow functional
  - **Status:** [ ]
  - **Coverage notes:** Focuses on the 'Security-First' mandate. Covers Profiles and initial Task table structures.
  - **Iteration delta:** Greenfield setup

**Name:** Phase 2: Core Utility & Intelligence

**Objective:** Implement the 'Actionable Minimalism' loop through deterministic NLP capture and the ritual dashboard.

**Technical context:** Chrono.js integration, Next.js Server Actions, and shadcn/ui primitives.

**Implementation strategy:** Logic-to-View progression. Validate NLP parsing accuracy via unit tests before mounting the capture UI.

**Milestones:**

  - **Id:** M2
  - **Title:** Deterministic NLP Capture Engine
  - **Objective:** Implement Chrono.js parsing within Server Actions for task extraction.
  - **Deps:** - M1
  - **Provides:** - Parsing Server Action
- Visual Confirmation UI
- Task Persistence Logic
  - **Directionality:** Logic -> Backend -> UI
  - **Requirements:** - Successful parsing of 'tomorrow at 5pm'
- Visual Confirmation Badge UI functional
- Task persistence in Postgres
  - **Status:** [ ]
  - **Coverage notes:** Critical path for reducing interaction friction. Must handle timezone offsets correctly.
  - **Iteration delta:** Intelligence Layer

  - **Id:** M3
  - **Title:** Intelligent Ritual Dashboard
  - **Objective:** Build the personalized 'Hello World' landing with temporal orientation.
  - **Deps:** - M2
  - **Provides:** - Greeting Logic Component
- Unified Activity Feed
- Edge-rendered Dashboard Shell
  - **Directionality:** UI -> Orchestration
  - **Requirements:** - Greeting logic handles time-of-day correctly
- Unified feed renders tasks and notes chronologically
- FCP < 500ms on Vercel Edge
  - **Status:** [ ]
  - **Coverage notes:** Optimizing for First Contentful Paint (FCP) using Edge-side rendering for the ritual greeting.
  - **Iteration delta:** UX & Ritual Layer

**Name:** Phase 3: Engagement & Mobile Parity

**Objective:** Transition the web application into a proactive productivity companion through PWA features.

**Technical context:** Web Push API, Service Workers, and Web App Manifest.

**Implementation strategy:** Staging-heavy validation. Push notifications require HTTPS and production-like environments for testing.

**Milestones:**

  - **Id:** M4
  - **Title:** Proactive Reminders & PWA
  - **Objective:** Enable Web Push notifications and offline manifest for mobile parity.
  - **Deps:** - M3
  - **Provides:** - Offline-ready Service Worker
- VAPID Push Subscription flow
- Installable PWA Manifest
  - **Directionality:** Browser API -> Infrastructure
  - **Requirements:** - Service Worker registered successfully
- Web Push receipt on desktop and mobile
- Add to Home Screen prompt functional
  - **Status:** [ ]
  - **Coverage notes:** Enables the 'Proactive' value proposition. Requires VAPID key configuration and user permission handling.
  - **Iteration delta:** Mobility & Engagement Layer



# Status Summary
**Up next:**

- M1: Foundation & Multi-Tenant Architecture



# Status Markers
**Unstarted:** [ ]

**In progress:** [🚧]

**Completed:** [✅]



# Dependency Rules
Backend data isolation (RLS) must precede any UI development to prevent data leaks.

NLP parsing logic must be validated via unit tests before UI integration to ensure determinism.

PWA notification testing requires a production-like staging environment (HTTPS) as per browser security standards.



# Generation Limits
**Max steps:** 200

**Target steps:** 120-180

**Max output lines:** 600-800



# Feature Scope
Identity (Supabase Magic Link)

Deterministic NLP Parsing (Chrono.js)

Ritual Greeting Dashboard

Unified Chronological Feed

Web Push Notifications

Installable PWA



# Features
NLP-enabled Task Entry

Time-of-day Personalization

Multi-tenant Data Privacy

Low-latency Edge Rendering



# MVP Description
A high-speed, minimalist productivity notepad featuring a personalized 'Hello World' ritual dashboard, zero-friction task capture via deterministic NLP, and proactive mobile-parity reminders through a PWA architecture.



# Market Opportunity
Targets the 'Actionable Minimalism' segment, providing a faster alternative to heavy project management tools and more intelligence than static note apps.



# Competitive Analysis
Faster than Notion due to Edge-first architecture; more proactive than Apple Notes via Web Push scheduling.



# Technical Context
The plan assumes an Edge-first serverless architecture on Vercel, utilizing Supabase as the unified BaaS for Auth and Postgres, and Chrono.js for low-latency client/server-side parsing.



# Implementation Context
Delivery follows a three-phase approach: Foundation (Security), Utility (NLP & Feed), and Retention (PWA). Each phase is delivered via iterative implementation checklists with TDD-first logic validation.



# Test Framework
Vitest for NLP unit tests; Playwright for E2E PWA and Auth flows.



# Component Mapping
Standardizing on shadcn/ui primitives for the Capture, Ritual, and Feed interfaces to ensure rapid development and consistent accessibility.



# Architecture Summary
Vercel Edge Functions + Supabase PostgreSQL RLS. A secure, multi-tier serverless stack optimized for minimal latency and high-velocity interaction.



# Architecture
The system follows a Next.js App Router orchestration pattern. Security is pushed to the database tier via RLS, while intelligence (NLP) is handled in Server Actions. Persistence is centralized in Supabase, and engagement is driven by browser-native Web Push APIs.



# Services
Supabase Auth

Supabase Database

Vercel Hosting

Postmark (Magic Links)



# Components
CommandInput

GreetingHeader

ActivityFeed

NotificationManager



# Integration Points
VAPID for Push Notifications

Chrono.js for Text Parsing

PostHog for Analytics



# Dependency Resolution
DB Schema -> Server Actions -> Client UI

VAPID Keys -> Service Worker -> Push Service



# Frontend Stack
**Framework:** Next.js 14

**Styling:** Tailwind CSS

**Ui components:** shadcn/ui



# Backend Stack
**Runtime:** Node.js (Edge Runtime)

**Orm:** Prisma

**Logic:** Server Actions



# Data Platform
**Database:** PostgreSQL

**Provider:** Supabase



# DevOps Tooling
**Hosting:** Vercel

**Ci cd:** GitHub Actions



# Security Tooling
**Auth:** Supabase PKCE

**Isolation:** Postgres RLS

**Validation:** Zod



# Shared Libraries
Chrono.js

date-fns

Lucide React



# Third Party Services
PostHog

Sentry