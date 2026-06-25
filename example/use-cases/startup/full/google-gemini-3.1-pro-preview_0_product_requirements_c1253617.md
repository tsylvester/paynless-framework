# Executive Summary
This document outlines the product requirements for an AI-native Applicant Tracking System aimed at SMBs. To meet a strict 4-month MVP deadline with a 3-person team, the plan aggressively descopes risky native job board integrations in favor of a user-operated Chrome Extension for sourcing. Core AI operations (resume parsing, scoring, interview generation) are mandated to run asynchronously via a background queue to eliminate serverless timeout failures. With robust multi-tenancy enforced by Supabase and monetization tightly coupled to Stripe, the platform is structured for immediate viability, scalable reliability, and strong SaaS unit economics.



# MVP Description
The proposed Minimum Viable Product (MVP) is a lightweight, AI-native Applicant Tracking System (ATS) tailored specifically for Small and Medium-sized Businesses (SMBs). Operating under a strict 4-month launch window and constrained to a 3-person engineering team, the MVP aggressively descopes long-tail native integrations and heavy synchronous processing. Core capabilities include asynchronous AI resume screening powered by GPT-4o, an end-to-end pipeline management workflow, a user-driven Chrome Extension for direct candidate sourcing from LinkedIn and other job boards, secure multi-tenant team workspaces protected by Supabase Row Level Security (RLS), and a Stripe-integrated usage-based subscription model. By leveraging a high-velocity tech stack (Next.js, Supabase, Inngest), the platform is designed to provide immediate, automated pipeline productivity without the lock-in and excessive overhead of legacy enterprise ATS platforms.



# User Problem Validation
SMB hiring managers and recruiters consistently experience severe operational friction during the candidate intake and evaluation process. Manual resume review requires disproportionate hours of administrative effort, pulling key personnel away from strategic work. The existing market is heavily bifurcated: enterprise ATS solutions (such as Greenhouse or Lever) are prohibitively expensive, demand complex onboarding, and enforce rigid workflows unsuitable for lean teams. Conversely, standalone generative AI screening tools lack essential end-to-end pipeline tracking and collaborative workspaces, forcing users to constantly switch contexts between tools. There is a validated, critical lack of affordable, intelligent tools that aggregate, process, and rank candidates from diverse sources directly within a cohesive, frictionless tracking environment.



# Market Opportunity
The primary market opportunity lies within the highly underserved SMB segment, specifically targeting organizations with 10 to 250 employees. By positioning the product for tech-forward startups, digital agencies, and lean growth-stage companies, the platform can capture an audience of early adopters who actively seek AI-driven productivity multipliers. This segment requires enterprise-grade intelligence without enterprise-level lock-in, enabling a product-led growth (PLG) strategy where organic adoption is driven by immediate, measurable time-to-hire reductions and clear per-seat or usage-based pricing models.



# Competitive Analysis
The competitive landscape is dominated on the high end by incumbents like Greenhouse and Lever, which offer extensive compliance and reporting workflows but treat generative AI capabilities as expensive, premium add-ons accessible only at the highest pricing tiers. On the lower end, niche AI parsing tools offer rapid screening but entirely lack fundamental applicant tracking functionalities. This product specifically targets the 'missing middle' by providing native AI automation built directly into the core, affordable ATS pipeline. By making intelligent automation the baseline experience rather than an upsell, the platform delivers superior immediate value to lean SMB teams compared to legacy incumbents.



# Differentiation & Value Proposition
The platform strictly differentiates itself through a 'Transparent AI Workflow.' Instead of acting as a black box, the system provides explicit, deterministic, 2-sentence justifications for every AI-generated candidate score, directly tying the candidate's extracted experience to the user-provided job description. This explicit explainability builds immediate trust, effectively addressing inherent HR compliance and bias concerns by maintaining the human-in-the-loop. Furthermore, by coupling this transparent screening with a one-click Chrome Extension sourcing tool, the platform drastically accelerates candidate ingestion, reducing overall time-to-hire and maximizing workflow efficiency.



# Risks & Mitigation
Risk 1: Vercel serverless timeouts during long-running AI processing and PDF extraction operations. Mitigation: Transitioned the architecture to offload all heavy compute to an asynchronous background worker queue via Inngest, ensuring guaranteed execution and zero blocked UI threads. Risk 2: High friction and blockages from native API scraping and enterprise B2B API negotiation delays. Mitigation: Implemented a client-side Chrome Extension for user-authenticated DOM extraction, shifting data ingress to the client. Risk 3: Runaway generative AI API costs destroying SaaS unit economics. Mitigation: Enforce strict Tiktoken budget caps per request prior to LLM execution, and strictly map API usage quotas directly to Stripe subscription tiers. Risk 4: Privacy compliance concerns regarding automated HR decision making. Mitigation: Ensure strict 'Zero Data Retention' configurations on OpenAI API endpoints and utilize Supabase Row Level Security (RLS) for tenant data isolation.


# SWOT Overview

## Strengths
Highly leveraged, modern tech stack (Next.js, Supabase) enabling a 3-person team to ship rapidly.

Clear AI explainability builds immediate trust and addresses HR compliance concerns.

Stripe metered billing securely protects operating margins against AI token costs.


## Weaknesses
Strict 4-month timeline defers deep HRIS integrations.

Dependence on target networks' DOM structures for the Chrome Extension.

Reliance on OpenAI API uptime and pricing stability.


## Opportunities
Capture tech-forward startup early adopters looking for productivity tools.

Future expansion into pgvector-powered semantic search across historical candidate pools.

Partnerships with boutique recruiting agencies needing white-labeled solutions.


## Threats
Aggressive anti-scraping DOM obfuscation from LinkedIn or job boards.

Rapid commoditization of AI parsing by enterprise ATS incumbents.

Strict data privacy regulations (GDPR, EU AI Act) targeting automated HR decisions.



# Feature Scope
Asynchronous AI Resume Screening & Scoring

Automated Interview Question Generation

Chrome Extension Sourcing Tool

Team Workspaces & RBAC via Supabase

Stripe Subscriptions & Metered Billing



# Feature Details
**Feature name:** Asynchronous AI Candidate Screening & Interview Question Generation

**Feature objective:** Automatically parse and rank uploaded resumes against a job description using an asynchronous background queue to prevent UI blocking and server timeouts, ensuring high reliability under Vercel execution constraints.

**User stories:**

- As a recruiter, I want resumes to process in the background so my browser doesn't freeze.

- As a hiring manager, I want the AI to provide a score, a justification, and tailored interview questions for each candidate.

**Acceptance criteria:**

- PDF/DOCX extraction utilizes secure pre-signed URLs.

- Processing logic runs entirely in an asynchronous worker queue (e.g., Inngest).

- UI receives real-time updates via Supabase Realtime.

- AI outputs strictly formatted JSON with 0-100 score, 2-sentence justification, and 5 questions.

**Dependencies:**

- OpenAI API (GPT-4o)

- Inngest Background Queue

- Supabase Storage & Realtime

- pdf2json utility

**Success metrics:**

- Parsing success rate >= 99%

- Average async processing latency < 45 seconds

- AI rejection rate by users < 10%

**Risk mitigation:** Enforce a strict 5MB upload limit. Implement token budgeting using Tiktoken to prevent context window overflow.

**Open questions:**

- What specific retry logic parameters (exponential backoff) should be configured for the LLM API to handle transient rate limits effectively?

**Tradeoffs:**

- Traded synchronous instant UI feedback for guaranteed async execution reliability.

- Omitted OCR fallback for image-heavy PDFs to protect MVP timeline.

**Feature name:** Chrome Extension Sourcing Tool

**Feature objective:** Completely bypass the 6-12 month delays associated with native enterprise job board API partnerships by providing immediate, user-controlled data extraction capabilities directly from the browser.

**User stories:**

- As a recruiter, I want to extract candidate details from LinkedIn with one click so I can add them to my ATS pipeline without manual data entry.

- As a hiring manager, I want the sourced candidate's profile to instantly map to the correct active job within my workspace.

**Acceptance criteria:**

- The Chrome Extension successfully extracts candidate name, experience, and skills from target DOM structures.

- The extension securely authenticates via the Next.js API using the user's active session.

- Payloads are posted as structured JSON to CORS-enabled API endpoints.

- The UI provides visual confirmation of successful candidate ingestion.

**Dependencies:**

- Target Job Boards/LinkedIn DOM structures

- Next.js App Router internal API routes

- Google Chrome Web Store deployment approval

**Success metrics:**

- Extraction success rate >= 95% on supported platforms

- User adoption rate > 60% of Weekly Active Workspaces

**Risk mitigation:** Shift parsing to the client-side to significantly reduce server-side IP scraping liabilities and associated blocking risks. Implement robust error handling for unexpected DOM changes.

**Open questions:**

- Will the Chrome Extension require specific legal disclaimers for end-users regarding scraping terms of service?

**Tradeoffs:**

- Requires ongoing maintenance bandwidth to keep DOM parsers up-to-date against unannounced UI changes on target websites.

**Feature name:** Team Workspaces & RBAC via Supabase

**Feature objective:** Establish secure, logically isolated multi-tenant environments that allow hiring teams to collaborate on candidate pipelines without risking cross-tenant data contamination.

**User stories:**

- As a workspace admin, I want to invite my team members so we can collaboratively review candidate scores.

- As an IT administrator, I want guarantees that our candidate data is securely isolated from other organizations.

**Acceptance criteria:**

- Workspaces are strictly isolated using PostgreSQL Row Level Security (RLS).

- Users are authenticated via Supabase GoTrue with secure JWTs.

- Role claims (e.g., Admin, Member) are verified natively in the database before granting read/write access.

- Users can successfully send and accept workspace invitations via email.

**Dependencies:**

- Supabase GoTrue Auth Service

- Supabase Managed PostgreSQL

- Transactional Email Provider (for invites)

**Success metrics:**

- 0% incidence of cross-tenant data leakage

- Average invitations accepted per active workspace > 2

**Risk mitigation:** Utilize built-in database-level RLS to guarantee strict tenant data isolation, drastically reducing the bespoke middleware development required and closing potential application-layer vulnerability gaps.

**Open questions:**

- Should we utilize Prisma or Drizzle for type-safe database queries against Supabase, considering Drizzle's lighter edge runtime footprint?

**Tradeoffs:**

- Coupling deeply to Supabase RLS logic reduces portability to non-Postgres databases but maximizes initial time-to-market.

**Feature name:** Stripe Subscriptions & Metered Billing

**Feature objective:** Secure operating margins and enforce fair usage by dynamically linking subscription tiers and metered billing directly to LLM token consumption.

**User stories:**

- As a user, I want to easily upgrade my subscription tier via a secure checkout portal to process more resumes.

- As a business owner, I want the system to automatically halt AI processing when a user exhausts their plan limits to protect profitability.

**Acceptance criteria:**

- The platform integrates seamlessly with Stripe Checkout and Customer Portal.

- Stripe webhook events update organization active subscription tier limits in the Supabase DB accurately.

- Idempotent webhook handlers ensure accurate billing state during transient network failures.

- AI processing queue checks tier quotas before dispatching jobs to OpenAI.

**Dependencies:**

- Stripe REST API

- Stripe Webhook bindings

- Next.js API Webhook Routes

**Success metrics:**

- Webhook processing success rate > 99.9%

- OpenAI API cost remains < 15% of MRR

**Risk mitigation:** Cryptographically verify all incoming Stripe webhooks. Apply idempotent database transaction logic to prevent duplicate processing. Track token usage dynamically via Tiktoken middleware.

**Open questions:**

- Finalize whether to offer pay-as-you-go AI screening overage or strictly hard-cap usage at subscription tier limits.

**Tradeoffs:**

- Implementing hard caps ensures immediate cost control but introduces friction for high-velocity hiring teams compared to auto-scaling overage.



# Feasibility Insights
Event-driven async architecture safely bypasses Vercel 10s serverless timeout limits.

Chrome Extension mitigates the severe 6-12 month timeline risk of native B2B API partnerships.

Supabase RLS handles multi-tenant data isolation, reducing bespoke middleware development.



# Non-Functional Alignment
Security: Zero Data Retention enforced on OpenAI endpoints.

Performance: Async background processing guarantees zero browser freezing.

Maintainability: Shifting extraction to the client (Chrome Extension) reduces server-side scraping liabilities.



# Score Adjustments & Tradeoffs
Time-to-Market Score: Increased significantly by dropping native API integrations.

System Reliability Score: Increased by adopting asynchronous processing.

Maintainability Score: Decreased slightly due to volatile DOM dependency in the Chrome Extension.


# Outcome Alignment & Success Metrics

- Outcome Alignment: Aligns the MVP strictly with the 4-month, 3-person constraints by removing long-tail dependencies and leveraging robust BaaS and async tooling to deliver core value.


- North Star Metric: Number of Candidates Successfully Screened & Ranked by AI


## Primary KPIs
Monthly Recurring Revenue (MRR)

Weekly Active Workspaces (WAW)

Average Time Saved per Job Description (Target: 5+ hours)


## Leading Indicators
Resumes Uploaded per Active Job

Team Invites Sent & Accepted

Number of Job Descriptions Created


## Lagging Indicators
Trial-to-Paid Conversion Rate (Target: > 15%)

Subscriber Churn Rate (Target: < 5%)


## Guardrails
API Cost Margin: OpenAI cost must be < 15% of monthly subscription fee.

System Reliability: > 99.9% uptime with < 1% Vercel timeout rate.

AI Output Trust: Human override rate < 10%.


## Measurement Plan
Deploy PostHog for frontend behavioral tracking. Utilize Stripe webhooks for MRR/financial truth. Leverage Vercel logs and Inngest observability for queue health and latency.


## Risk Signals
Spikes in 504 Gateway Timeouts or background queue failures.

Drop in Chrome Extension parsing success rates.

High OpenAI 429 Too Many Requests responses.


# Decisions & Follow-Ups

## Resolved Positions
Architecture: Shifted to async event-driven processing.

Integration: Replaced native API sourcing with a Chrome Extension.

AI Model: Standardized on OpenAI GPT-4o with Zero Data Retention.


## Open Questions
Will the Chrome Extension require specific legal disclaimers for end-users regarding scraping terms of service?


## Next Steps
Initialize Sprint 1 by configuring Supabase infrastructure, Stripe webhooks, and the Inngest async queue backbone. Complete the proof-of-concept Inngest function executing a mock OpenAI call to validate timeout mitigation.



# Release Plan
Sprint 1: Supabase DB, Auth, Stripe webhooks, and Async Queue boilerplate.

Sprint 2: Core ATS CRUD (Jobs, Pipelines) and direct-to-S3 uploads.

Sprint 3: OpenAI Integration, pgvector search, Supabase Realtime.

Sprint 4: Chrome Extension development, QA, and Beta Launch.



# Assumptions
SMBs are willing to install a Chrome extension to bypass native integration limitations.

Target users have standardized resumes (PDF/DOCX) suitable for text extraction without heavy OCR.



# Open Decisions
Finalize whether to offer pay-as-you-go AI screening overage or strictly hard-cap usage at subscription tier limits.



# Implementation Risks
Unannounced DOM changes on LinkedIn breaking the Chrome Extension parser.

Vercel Edge/Node environment discrepancies affecting PDF parsing libraries.



# Stakeholder Communications
Weekly internal sprint demos prioritizing end-to-end async pipeline stability and Chrome Extension extraction fidelity.



# References
baseline_business_case

technical_feasibility_assessment

synthesis_document_technical_approach

synthesis_document_success_metrics