# Architecture Summary
A highly resilient, multi-tenant Serverless architecture utilizing Next.js, Supabase, and Inngest to orchestrate sophisticated, long-running AI workflows. By explicitly decoupling all heavy computational loads into asynchronous background workers and strategically deploying a Chrome Extension for agile data ingress, the system guarantees superior reliability, robust regulatory compliance, and exceptionally rapid feature delivery aligned with strict startup constraints.


# Architecture
The system utilizes an event-driven, serverless edge architecture explicitly designed to prioritize reliability and fault tolerance for long-running, compute-heavy AI tasks. Given the inherent 10-second synchronous execution limits of Vercel's serverless environment, the architecture explicitly pivots away from traditional Backend-for-Frontend (BFF) patterns. The Next.js frontend operates as a thin, highly responsive client, utilizing React Server Components for SEO and fast initial hydration, communicating with Vercel-hosted edge API routes for lightweight orchestration. Supabase provides the foundational Backend-as-a-Service (BaaS) layer, offering a managed PostgreSQL database extended with pgvector, Row Level Security (RLS) for absolute multi-tenant data isolation, GoTrue for JWT authentication, and S3-compatible Object Storage. Crucially, a decoupled background worker framework (Inngest) handles all volatile and compute-heavy operations—specifically PDF extraction, chunking, and OpenAI GPT-4o interactions—asynchronously. Once these background workers finalize candidate evaluation and write the structured data back to PostgreSQL, Supabase Realtime WebSockets push the state updates directly to the subscribing UI, delivering a seamless, non-blocking user experience.



# Services
Next.js Frontend & API Orchestration Layer: Serves as the primary application interface and edge-based routing mechanism, orchestrating user sessions, webhook receptions, and asynchronous job dispatching.

Supabase Managed PostgreSQL & pgvector: Provides the core relational database foundation unified with high-dimensional vector storage, ensuring tight coupling between transactional application state and semantic search embeddings.

Supabase GoTrue Auth Service: Delivers secure, scalable JWT-based user authentication and identity verification seamlessly integrated with the database's RLS policies to enforce tenant boundaries.

Supabase Storage (Direct Client Uploads): Handles the secure ingress of candidate resumes (PDF, DOCX) directly from the client via pre-signed URLs, bypassing Vercel API payload memory constraints.

Inngest Async Background Worker Queue: The decoupled operational backbone responsible for executing unpredictable, long-running AI workflows, offering native observability, step-level exponential backoff retries, and strict concurrency controls.

OpenAI GPT-4o Integration Layer: The core intelligence engine responsible for parsing unstructured resumes, semantic scoring against job descriptions, and the automated generation of tailored interview questions.

Stripe Webhook Billing Engine: Manages subscription lifecycle events, active tier synchronization, and dynamic metered billing based on OpenAI token consumption to protect platform unit economics.

Chrome Extension DOM Sourcing Module: A specialized client-side data extraction application designed to bypass restrictive B2B API partnerships, allowing users to scrape and import candidate profiles directly from the browser DOM.



# Components
React Server Components: Utilized for SEO optimization, fast initial page loads, and minimizing the client-side JavaScript bundle size.

Supabase Realtime Subscriptions: WebSocket-based clients deployed in the UI to listen for PostgreSQL replication events, ensuring immediate frontend hydration when background AI workers complete processing.

Tiktoken Middleware: A programmatic budget constraint enforcement module that calculates exact token counts prior to payload dispatch, proactively rejecting overly large contexts to prevent LLM failure and cost overruns.

PDF Extraction Utility Service: An isolated, worker-bound micro-service utilizing open-source libraries (e.g., pdf2json) to systematically extract raw text from candidate binaries without polluting the core web API thread.

Stripe Checkout & Customer Portal Bindings: Secure, hosted UI components ensuring PCI compliance and frictionless user subscription management without custom billing frontend development.



# Data Flows
Resume Ingestion: Client requests a pre-signed URL from Next.js API -> Client uploads PDF/DOCX resume directly to Supabase Storage -> Client signals completion to Next.js API.

Async Dispatch: Client -> Next.js API orchestration route -> Dispatches parse/score event to the Inngest asynchronous queue -> Returns immediate HTTP 202 Accepted to UI.

Document Retrieval: Inngest Worker receives event -> Worker retrieves the secure document binary from Supabase Storage -> Worker executes the PDF extraction utility.

AI Inference: Inngest Worker sends structured text payload and Job Description to OpenAI API -> OpenAI extracts data, calculates match score, and generates justification (Zero Data Retention strictly enforced).

State Mutation: Inngest Worker receives OpenAI JSON response -> Worker computes pgvector embeddings -> Worker writes the finalized candidate record and embeddings to Supabase PostgreSQL.

Client Hydration: Supabase PostgreSQL commits the transaction -> Supabase Realtime broadcasts the replication event over WebSockets -> Client UI receives the payload and updates the candidate pipeline board.

Extension Ingress: Chrome Extension authenticates user -> Scrapes candidate DOM -> Posts structured JSON payload to a CORS-enabled Next.js API endpoint -> Triggers the async ingestion workflow.

Billing Synchronization: Stripe subscription event occurs -> Stripe dispatches secure Webhook -> Next.js API handler verifies cryptographic signature -> Updates organization's active tier and token limits in Supabase DB.



# Interfaces
Next.js App Router Internal API Routes: Defines the strictly typed, edge-deployed communication layer for first-party frontend requests and external webhook ingestion.

Supabase PostgREST API: Provides the auto-generated, RESTful interface for direct client-to-database communication, strictly governed by RLS multi-tenancy policies.

OpenAI REST API: The external interface for accessing the GPT-4o model, strictly accessed by the backend worker queue utilizing API keys stored in encrypted environment vaults.

Stripe REST API & Webhooks: Facilitates bi-directional communication for initializing checkout sessions and synchronizing asynchronous payment states back to the application database.

Chrome Extension Content Script to Next.js API Endpoint: A secured, CORS-enabled HTTP POST interface allowing authenticated browser extensions to push scraped candidate profiles into the core ATS platform.



# Integration Points
OpenAI API via Adapter Pattern: Decouples the core business logic from the specific LLM provider, enabling robust error handling, token accounting, and potential future hot-swapping to alternative models (e.g., Anthropic Claude).

Stripe Webhook Handlers: Critical ingestion points for subscription events (checkout.session.completed, invoice.payment_failed) requiring strict idempotency to ensure billing accuracy.

Target Job Boards/LinkedIn DOM: Volatile client-side integration points where the Chrome Extension interfaces with third-party web structures to extract professional profile data.



# Dependency Resolution
B2B API Dependency Elimination: Completely replaced the timeline-prohibitive dependency on native B2B APIs (e.g., LinkedIn Enterprise) by adopting a user-driven Chrome Extension for dynamic DOM parsing.

Vector Storage Consolidation: Decoupled the architecture from external, dedicated vector databases (like Pinecone) by natively utilizing the Supabase pgvector extension, unifying relational and semantic data in a single operational footprint.

Synchronous Bottleneck Decoupling: Resolved the fundamental conflict between Vercel's strict serverless timeout thresholds and long-running AI inference by forcefully routing all heavy compute through the Inngest background queue.



# Conflict Flags
Vercel Edge vs. Node.js Libraries: Potential architectural conflict between Vercel Edge runtime constraints (which lack full standard library support) and legacy Node.js PDF parsing dependencies (e.g., pdf2json). Mitigation requires isolating the parsing utility within full Node.js serverless functions or explicitly configuring the Inngest worker runtime environment.

Chrome Extension Volatility: Structural conflict between the predictable internal data models and highly volatile, unannounced DOM structure changes on target professional networks, requiring continuous parser maintenance.



# Sequencing
Sprint 1: Foundational Infrastructure. Establish the Next.js App Router, configure Supabase (Auth, DB, Storage) with RLS schemas, set up Stripe webhook boilerplate, and deploy the core Inngest asynchronous queue framework. Sprint 2: Core ATS Mechanics. Develop CRUD operations for Jobs and Candidate Pipelines, implement direct-to-S3 pre-signed uploads, and finalize the UI component library. Sprint 3: AI Intelligence Pipeline. Wire Inngest workers to the OpenAI API, establish Tiktoken budgeting, implement pgvector semantic search, and deploy Supabase Realtime for UI hydration. Sprint 4: Sourcing & Launch. Develop and submit the Chrome Extension, execute end-to-end asynchronous load testing, conduct a comprehensive security review, and execute the Beta Launch.



# Risk Mitigations
Compute Overruns: Tiktoken validation strictly counts and evaluates context window limits prior to any LLM execution, forcibly rejecting oversized payloads to protect API cost margins.

Memory Exhaustion: Implementing direct-to-Supabase Storage uploads completely bypasses Vercel's 4.5MB API request body limit, preventing application crashes during the ingestion of large candidate portfolios.

Data Privacy Non-Compliance: Explicitly configuring OpenAI endpoints for 'Zero Data Retention' and securing Business Associate Agreement (BAA) equivalent terms guarantees that PII is never utilized for secondary model training.

Double Billing & State Corruption: Designing strictly idempotent Stripe webhook handlers with exponential backoff ensures precise subscription synchronization during transient network failures or duplicate event deliveries.



# Risk Signals
High volume of Inngest Dead Letter Queue (DLQ) events indicating persistent failure in the PDF extraction or OpenAI integration layers.

Database connection pooling limits being rapidly exhausted on the PostgreSQL cluster during severe concurrent background worker scaling events.

Vercel Node.js or Edge function memory exhaustion alerts and frequent 504 Gateway Timeouts indicating that logic intended for the background queue is erroneously leaking into the synchronous request path.

Spikes in failed parsing attempts originating from the Chrome Extension, signaling an unannounced DOM obfuscation event by a target professional network.



# Security Measures
Tenant Isolation: Supabase PostgreSQL Row Level Security (RLS) policies cryptographically mandate that every database query evaluates the 'org_id' claim present in the user's active JWT, categorically preventing cross-tenant data leakage.

Role-Based Access Control (RBAC): Leveraging custom claims embedded within GoTrue JWTs to enforce strict functional boundaries between Workspace Admins and standard Members at the database level.

Zero Telemetry Logging of PII: Strict organizational policies and code reviews enforce that no candidate Personally Identifiable Information (PII) or raw resume content is ever logged to application monitoring tools (e.g., Vercel Logs, PostHog).

Webhook Cryptographic Verification: All incoming webhooks from external providers (Stripe, Inngest) undergo rigorous cryptographic signature verification before their payloads are evaluated or processed.



# Observability Strategy
Edge Orchestration Monitoring: Utilizing Vercel Analytics and integrated function logs to monitor synchronous Next.js API route latency, memory usage, and HTTP error rates.

Asynchronous Tracing: Deploying the Inngest Dashboard to achieve granular, step-level observability into background worker executions, encompassing explicit logging of retries, failure stack traces, and duration per operational step.

User Telemetry: Implementing PostHog to track detailed frontend behavioral funnels, feature adoption rates, and UX drop-offs, particularly for the asynchronous AI screening process.

Database Health: Leveraging the Supabase Supavisor dashboard to proactively monitor PostgreSQL query performance, index utilization (specifically for pgvector), and active connection pool health under load.



# Scalability Plan
Compute Scaling: The decoupled Inngest background workers automatically scale horizontally based on active queue depth, preventing processing bottlenecks during mass resume ingestion events without requiring manual cluster provisioning.

Database Scaling: Supabase instance compute (CPU/RAM) can be vertically scaled through tiered upgrades to manage increasing transactional volume and the computational overhead of high-dimensional pgvector cosine distance queries.

Frontend Delivery: Stateless Next.js API routes and React Server Components natively distribute and scale across Vercel's global Edge network, guaranteeing low-latency UI delivery regardless of concurrent user load.



# Resilience Strategy
Automated External Retries: Comprehensive exponential backoff and automated step-level retries are natively orchestrated by Inngest for all volatile external API interactions (OpenAI, third-party parsers) to gracefully absorb transient rate limits and network degradation.

WebSocket Fallback Protocol: The frontend UI incorporates graceful degradation logic; if the Supabase Realtime WebSocket connection drops or fails to initialize, the client automatically falls back to an intelligent, periodic HTTP polling mechanism to ensure the user still receives critical pipeline updates.



# Compliance Controls
AI Data Retention: OpenAI API configurations strictly utilize the 'Zero Data Retention' flag, fully eliminating the risk of candidate data being ingested into proprietary foundational models.

Regional Data Residency & Encryption: The Supabase PostgreSQL cluster and S3-compatible storage buckets are explicitly provisioned in compliant geographic regions equipped with mandatory at-rest and in-transit encryption methodologies to satisfy rigorous GDPR and CCPA directives.



# Open Questions
Will the built-in Supabase PgBouncer (or Supavisor) connection pooler sufficiently handle rapid, highly concurrent write spikes generated by hundreds of Inngest background workers completing AI tasks simultaneously, or is a dedicated queue-throttling mechanism required?

Are there unresolved dependency conflicts between Vercel's specific serverless environment configurations (Node vs. Edge runtimes) and the compiled binary requirements of standard PDF parsing libraries like pdf2json?

How will the system procedurally handle the legal and technical remediation if the Chrome Extension is flagged for violating the anti-scraping Terms of Service of major platforms like LinkedIn?



# Rationale
The explicit adoption of an asynchronous, event-driven architecture heavily reliant on Next.js, Supabase, and Inngest is fundamentally dictated by the severe constraints of the project: a strict 4-month MVP timeline, a lean 3-person engineering team, and the architectural limitations of serverless hosting. Attempting synchronous LLM operations within a standard BFF pattern would guarantee high failure rates via Vercel 504 timeouts, fatally degrading user trust. By standardizing on Supabase for a unified, secure data layer and explicitly offloading compute to Inngest, the architecture systematically minimizes bespoke DevOps overhead, enforces structural system resilience, and ensures the small team can focus their limited bandwidth exclusively on core AI intelligence workflows and user experience.