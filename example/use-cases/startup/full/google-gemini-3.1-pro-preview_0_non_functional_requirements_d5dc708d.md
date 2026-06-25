# Non-Functional Requirements Review


## Overview
### Non-Functional Requirements Overview

The system's non-functional strategy relies on a robust combination of fully managed serverless infrastructure and strict, event-driven architectural patterns. The platform exhibits immense strengths in maintainability and compute scalability by leveraging Next.js and Supabase, perfect for a lean 3-person team. However, the most critical NFR concern is performance reliability—specifically, mitigating Vercel serverless timeouts. Transitioning the core AI document parsing and OpenAI interaction from a synchronous API model to a highly resilient, asynchronous background queue is mandatory. When paired with rigorous Supabase RLS policies for tenant security and strict OpenAI data-retention settings for compliance, these operational criteria will ensure the ATS is secure, performant, and legally sound.



## Security
### Security Requirements & Recommendations

To protect sensitive HR data and candidate Personally Identifiable Information (PII), the platform must adhere to strict security protocols across the entire stack:

*   **Tenant Isolation via Row Level Security (RLS):** Supabase PostgreSQL must be configured with robust RLS policies. Every database query must automatically enforce the `workspace_id` context to guarantee multi-tenant data isolation and eliminate cross-tenant data bleed.
*   **Input Sanitization & File Security:** All uploaded files (PDFs, DOCX) must undergo rigorous sanitization before text extraction (`pdf2json`) to prevent malicious file execution or injection attacks. Direct browser-to-Supabase Storage uploads via pre-signed URLs should be utilized to prevent the Next.js backend from handling raw, untrusted binary streams directly.
*   **Authentication & Role-Based Access Control (RBAC):** Supabase GoTrue will manage secure authentication. RBAC must be strictly enforced at the API route level to differentiate between 'Admin' and 'Member' privileges within a workspace (e.g., restricting billing or team invite access to Admins).
*   **API Key Management:** All third-party service credentials (OpenAI, Stripe, Merge.dev) must be securely stored as environment variables in Vercel, never exposed to the client bundle.



## Performance
### Performance Expectations & Response Times

The platform must deliver a highly responsive user experience despite heavy reliance on intensive backend processing:

*   **UI Response Time:** The Next.js App Router (utilizing React Server Components) must deliver initial page loads and standard UI interactions (dashboard navigation, candidate list filtering) in **under 200ms**.
*   **LLM Processing SLA Pivot:** The baseline proposal's goal of '< 15 seconds synchronous' processing is fundamentally incompatible with Vercel Serverless limits (which strictly timeout at 10s-60s depending on the tier). The SLA must be formally shifted to **< 45 seconds asynchronous**.
*   **Token Optimization:** Implementing token estimators (e.g., `tiktoken`) prior to dispatching requests to OpenAI will ensure payload sizes remain within performant boundaries, dropping or truncating excessively long resumes before they bottleneck the API.



## Reliability
### Reliability Targets & Failure Recovery

Given the mission-critical nature of hiring software, system availability and graceful error handling are paramount:

*   **Target Uptime:** The system requires a standard **99.9% uptime** for core UI and database availability.
*   **Asynchronous Retries & Dead Letter Queues:** OpenAI API failures (rate limits, timeouts, 503s) are inevitable. These must be caught, queued, and automatically retried using an exponential backoff strategy via a dedicated background job framework (e.g., Inngest or Supabase Edge Functions).
*   **Circuit Breaker Pattern:** If the primary LLM provider (OpenAI GPT-4o) experiences a major outage, the system should gracefully degrade, allowing users to continue uploading resumes into a 'Pending Processing' state rather than returning hard application errors.



## Scalability
### Scalability Expectations & Load Management

The architecture relies exclusively on managed, serverless infrastructure to automatically handle load spikes without requiring active DevOps intervention:

*   **Compute Scalability:** Vercel automatically provisions Next.js Edge and Serverless functions, offering effectively infinite scaling for frontend traffic and API orchestration.
*   **Database Scalability:** Supabase (managed PostgreSQL) handles persistence. To prevent connection exhaustion during traffic spikes, connection pooling (via PgBouncer/Supavisor) must be implemented.
*   **Vector Database Management:** As the resume corpus grows, `pgvector` indexing limits must be closely monitored. Memory allocation for the database must be scaled proactively to maintain fast semantic search query times across historical candidate pools.



## Maintainability
### Maintainability & Codebase Readiness

The system is highly optimized for a lean 3-person development team by minimizing custom backend infrastructure:

*   **Operational Readiness:** Relying on managed services (Vercel, Supabase) effectively removes the need for infrastructure maintenance, OS patching, or container orchestration.
*   **Type Safety:** Strict end-to-end TypeScript typing must be enforced. Specifically, OpenAI API responses must utilize Structured Outputs (JSON Schema) mapped directly to TypeScript interfaces (e.g., `Review` and `InterviewKit` models) to prevent runtime errors caused by LLM hallucinations.
*   **Code Structure:** Using Next.js App Router and React Server Components limits custom backend glue-code, localizing data fetching directly to the component tree and improving long-term readability.



## Compliance
### Compliance Coverage & Regulatory Needs

Handling resumes inherently involves processing Personally Identifiable Information (PII) subject to strict global data privacy frameworks (GDPR, CCPA):

*   **LLM Data Privacy:** The OpenAI organization settings must be strictly configured to **'Zero Data Retention'** (via an Enterprise agreement or zero-day API configuration) to ensure candidate PII is not stored on OpenAI servers or used to train future foundation models.
*   **Right to be Forgotten:** To comply with GDPR, the platform must implement a cascading 'Hard Delete' function that completely scrubs a candidate's PII, raw files (from Supabase Storage), and database records upon request.
*   **Data Processing Agreements (DPAs):** The startup must secure standard DPAs with all sub-processors, notably Vercel, Supabase, and OpenAI.



## Outcome Alignment
### NFR Alignment with Business Outcomes

These non-functional requirements directly support the business goal of delivering a low-touch, highly automated SaaS platform tailored for SMBs:

*   **Event-Driven Reliability:** By shifting from synchronous wait-times to asynchronous reliability, users will not experience frustrating browser timeouts, fostering trust in the AI's capabilities.
*   **Serverless Maintainability:** Offloading infrastructure management allows the 3-person team to focus 100% of their velocity on feature iteration and market differentiation rather than database administration.
*   **Security & Compliance:** Addressing PII and multi-tenancy upfront eliminates critical adoption blockers for compliance-conscious B2B customers.



## Primary KPIs
### Primary NFR Key Performance Indicators

*   **API Timeout Rate:** Target < 1% of all file processing and LLM generation requests.
*   **P95 Asynchronous Processing Latency:** Target < 30 seconds from document upload to final database write and real-time UI update.



## Leading Indicators
### Leading Indicators of NFR Health

*   **Average Token Length per Request:** Rapid increases warn of impending latency spikes or API cost overruns.
*   **Background Job Retry Rate:** High frequency of API retries per job description suggests upstream instability (e.g., OpenAI throttling) or poor prompt construction.



## Lagging Indicators
### Lagging Indicators for NFR Validation

*   **Monthly Serverless Compute Costs:** Validates the efficiency of the background processing architecture against Stripe MRR.
*   **Database Storage Capacity Utilization:** Tracks the footprint of parsed PDFs and vector embeddings over time, signaling when to scale Supabase tiers.



## Measurement Plan
### Measurement & Telemetry Plan

The 3-person team will leverage automated SaaS telemetry to monitor these targets continuously:

*   **Compute & API Performance:** Vercel Analytics will actively monitor edge network performance, serverless compute times, and API route 5xx error rates.
*   **User Perception & Friction:** PostHog will be implemented to track client-side latency, session drops during loading states, and overall funnel friction.
*   **Infrastructure Health:** Supabase Dashboards will be monitored weekly for database query latency, storage growth, and connection pool saturation.



## Risk Signals
### Risk Signals & Warning Thresholds

*   **Vercel 504 Gateway Timeouts:** A sudden spike in 504 errors on Next.js API routes indicates that synchronous operations are still blocking execution, requiring immediate architectural rollback to the background queue.
*   **Unusual Supabase Storage Spikes:** Indicates potential abuse of the platform (e.g., massive file uploads bypassing frontend validation) or a failure in the document lifecycle/deletion policies.



## Guardrails
### System Guardrails

To ensure operational stability and cost predictability, the following hard limits must be strictly enforced:

*   **File Upload Size Limit:** Maximum allowable resume upload size is strictly restricted to **5MB** to prevent extraction memory faults and storage bloat.
*   **Token Budgeting:** A strict maximum token limit (e.g., 10,000 tokens) must be enforced per Job Description generation/scoring run. Requests exceeding this length must be gracefully truncated or rejected.



## Next Steps
### Immediate Next Steps

1.  **Queue Infrastructure Initialization:** Evaluate, select, and integrate the background worker framework (e.g., Inngest, Trigger.dev, or Supabase Edge Functions) to transition LLM operations away from Vercel API routes.
2.  **Staging Environment Configuration:** Spin up parallel staging environments across Vercel and Supabase to safely test Webhook retries and multi-tenant RLS rules before production rollout.
3.  **Token Validation Integration:** Integrate `tiktoken` (or a similar lightweight tokenizer) into the API parsing layer to establish programmatic enforcement of token guardrails.