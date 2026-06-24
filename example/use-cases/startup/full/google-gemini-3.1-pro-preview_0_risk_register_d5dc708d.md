# Risk Register


## Overview
The overall risk posture of the AI ATS platform is highly elevated due to the intersection of an ambitious scope, an inflexible 4-month timeline, a lean 3-person team, and a fundamental architectural mismatch (synchronous serverless vs. long-running LLM tasks). While the business case and core Next.js/Supabase stack are validated and sound, success hinges entirely on aggressively descoping external API dependencies and implementing an asynchronous task queue. If the team resolves the compute timeouts and secures candidate sourcing via alternative ingestion methods (Chrome Extension), the remaining risks (cost, compliance) are manageable through strict configuration and rate-limiting guardrails.



## Risk
### 1. Serverless API Timeout during Resume Processing
**Impact:** High. The core product action (screening) will fail, leading to immediate user churn and failure to deliver on the platform's primary value proposition.
**Likelihood:** High. Parsing complex PDF documents and waiting for GPT-4o synchronous generation will regularly exceed Vercel's Serverless execution limits (10s on Hobby, up to 60s on Pro).
**Mitigation:** Implement an asynchronous background job queue (e.g., Inngest) and use Supabase Realtime to update the client UI upon completion.
**Components Affected:** Next.js API Routes, Supabase Storage, OpenAI GPT-4o, pdf2json, Vercel compute environment.
**Dependencies:** Vercel timeout constraints, OpenAI response latency, pdf2json execution time.
**Sequencing Considerations:** Must be addressed in Sprint 1/2 architecture setup to avoid cascading refactoring delays later in the 4-month timeline.
**Risk Mitigation Plan:** Pivot from a synchronous Backend-for-Frontend (BFF) paradigm to an Event-Driven architecture. Upload to Supabase Storage -> DB Webhook -> Background Worker (Inngest) -> Update DB -> Supabase Realtime pushes to UI.
**Open Questions:** Will the team invest in a robust background job infrastructure like Inngest or Trigger.dev, or rely purely on long-running Supabase Edge Functions?
**Guardrails:** Restrict maximum file upload size to 5MB. Enforce strict timeout fallbacks in the UI.
**Risk Signals:** Spikes in 504 Gateway Timeout errors on Vercel API routes.
**Next Steps:** Establish the background worker framework and configure the Vercel/Supabase staging environments for asynchronous testing.

### 2. External Sourcing Integration Failure (LinkedIn/Job Boards)
**Impact:** High. Failure to meet the user constraint of requiring integration with job boards and LinkedIn for sourcing.
**Likelihood:** High. LinkedIn is notoriously hostile to automated applicant sourcing via unofficial channels, and official API access for an early-stage startup is rarely granted within a 4-month window.
**Mitigation:** Descope native API integrations in Sprint 4. Substitute with a native Chrome Extension that parses screen data and sends it to the ATS, circumventing API approval delays.
**Components Affected:** Next.js App Router, External Integration APIs.
**Dependencies:** LinkedIn/Job Board DOM structure, Chrome Web Store review timelines.
**Sequencing Considerations:** Immediately pivot Sprint 4 deliverables from backend integrations to Chrome Extension development.
**Risk Mitigation Plan:** Establish a unified API fallback plan. Rely strictly on manual uploads and the Chrome Extension for the MVP. Evaluate unified API providers like Merge.dev only post-MVP.
**Open Questions:** Does the 3-person team possess the specialized knowledge required to rapidly deploy a Chrome Extension alongside the Next.js app?
**Guardrails:** Ensure the frontend gracefully handles manual fallback ingestion (email-to-ATS or manual parsing).
**Risk Signals:** Cease-and-desist notifications from platforms, rate-limiting, or blocked API requests.
**Next Steps:** Formally descope direct LinkedIn API sourcing from the MVP roadmap and design the Chrome Extension architecture.

### 3. LLM API Cost Overruns
**Impact:** High. Total dependency on OpenAI introduces severe margin risk if token usage spirals, threatening the viability of the Stripe-based monetization strategy.
**Likelihood:** Medium. Users uploading excessively long or unoptimized resumes will rapidly drain token limits if unchecked.
**Mitigation:** Implement hard token budget caps per user request and per workspace tier to ensure Stripe MRR isn't eclipsed by OpenAI costs.
**Components Affected:** OpenAI GPT-4o, Next.js Orchestration, Stripe Billing, Supabase Database.
**Dependencies:** OpenAI token pricing, Stripe subscription tiers.
**Sequencing Considerations:** Must be implemented in Sprint 3 alongside the AI pipeline integration.
**Risk Mitigation Plan:** Utilize Tiktoken to accurately estimate token counts before dispatching requests, rejecting massive or malicious files. Implement anomaly detection on Stripe vs. OpenAI usage.
**Open Questions:** What is the hard ceiling for the API Cost Margin (e.g., AI costs must remain < 15% of the monthly subscription fee)?
**Guardrails:** Maximum token limit enforced per Job Description generation. Rate limits tied to Stripe tier.
**Risk Signals:** Sudden spikes in daily OpenAI billing dashboards; disproportionate token usage by single workspaces.
**Next Steps:** Finalize strict token limits for prompt engineering and implement cost telemetry in the backend.

### 4. Compliance and Data Privacy Violations (GDPR/PII)
**Impact:** Critical. Processing candidate PII (resumes) through third-party LLMs risks severe legal penalties if data is used for model training or retained improperly.
**Likelihood:** Medium. Default LLM configurations often retain data unless explicitly opted out.
**Mitigation:** Configure OpenAI organization settings to 'Zero Data Retention' and enforce strict Row Level Security (RLS) policies in Supabase.
**Components Affected:** Supabase Auth/PostgreSQL, OpenAI API, Next.js UI.
**Dependencies:** OpenAI Enterprise agreements, GDPR/CCPA regulatory frameworks.
**Sequencing Considerations:** Security policies and zero-retention agreements must be finalized in Sprint 1 prior to handling any real user data.
**Risk Mitigation Plan:** Ensure candidate PII is not used for model training. Implement a hard-delete function to honor GDPR 'Right to be Forgotten' requests. Rely on Supabase RLS to prevent cross-workspace data bleed.
**Open Questions:** How will non-standard PDF formats (e.g., images containing PII) be scrubbed or handled?
**Guardrails:** Automated testing for RLS isolation; routine audits of Supabase storage buckets.
**Risk Signals:** Unauthorized cross-tenant data access logs; user requests for data deletion failing.
**Next Steps:** Execute zero-retention agreements with OpenAI and draft the data lifecycle management policy.



## Impact
If these risks materialize, the platform faces immediate, compounding failures: architectural bottlenecks will cause core product actions to timeout (destroying the user experience), dependency roadblocks will halt candidate sourcing, unmanaged LLM token usage will obliterate financial margins, and PII mishandling will expose the startup to severe compliance liabilities.



## Likelihood
The likelihood of architectural and dependency risks materializing is High. Vercel's serverless constraints mathematically preclude long-running synchronous LLM chains, and LinkedIn's aggressive anti-scraping stance guarantees friction for unofficial integrations. The likelihood of cost and compliance risks is Medium, entirely dependent on how rigorously the team implements the proposed guardrails.



## Mitigation
The comprehensive mitigation strategy revolves around an architectural pivot to asynchronous, event-driven processing (using background queues like Inngest), scoping down ambitious sourcing integrations to a resilient Chrome Extension, enforcing strict API token budgeting aligned with Stripe MRR, and configuring zero-data-retention agreements to secure PII.



## Seed Examples
Serverless API Timeouts (Vercel limits)

LLM API Cost Overruns (OpenAI token limits)

External Sourcing Blocked (LinkedIn API Access Denied)

Compliance/PII Breaches (GDPR violations)

Data Isolation Failures (Cross-tenant data bleed)



## Mitigation Plan
The cross-cutting mitigation plan relies on three distinct pillars. 1) Architecture Redesign: The Technical Architect must immediately transition the ingestion flow to an asynchronous event-driven model (Weeks 1-3). 2) Scope Management: The Product Strategist must descope native job board integrations and formally allocate Sprint 4 to building the Chrome Extension fallback. 3) Resource Governance: Implement Tiktoken budgeting and Stripe webhook verification to ensure AI generation is strictly gated by paid tiers. These initiatives must be fully integrated before the end of Sprint 3 to allow 4 weeks of QA.



## Notes
Assumptions: The team will utilize managed services (Vercel, Supabase) exactly as proposed to save operational time. OCR fallback (e.g., Tesseract) for scanned images is considered out of scope for the MVP due to the 4-month constraint; strictly reject non-text PDFs to save time. Follow-up action: Determine exact latency SLA for the new asynchronous background workers.