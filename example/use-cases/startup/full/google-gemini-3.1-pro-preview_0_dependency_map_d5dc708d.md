# Dependency Map


## Overview
This Dependency Map outlines the critical path, integration boundaries, and external vendor reliance required to deliver the AI-powered ATS within the constrained 4-month timeline. Because the lean 3-person team relies heavily on managed services (Vercel, Supabase) and third-party APIs (OpenAI, Stripe) as a force multiplier, mapping these integration points is vital to project survival. Understanding these relationships highlights potential execution bottlenecks—specifically the conflict between synchronous API limitations and LLM processing times, as well as restrictive external sourcing integrations. Documenting this map allows the team to pivot to structural fallbacks and asynchronous event-driven architectures before development even begins.



## Components
Next.js App Router (UI & Orchestration): Serves as the unified layer for both frontend components (React Server Components) and secure backend API routes.

Supabase Auth & PostgreSQL (Identity & Data): Acts as the primary backend-as-a-service, managing multi-tenant PostgreSQL databases, Row Level Security (RLS), object storage for resumes, and user authentication.

OpenAI GPT-4o (Intelligence): The core analytical engine responsible for extracting candidate data, ranking fit against job descriptions, and generating tailored interview questions.

pdf2json (File Parsing): A lightweight, necessary utility to extract raw text strings from uploaded PDF and DOCX files before feeding data into the LLM prompt.

Stripe (Billing & Access Control): The financial backend handling SaaS subscriptions, payment processing, and tier-based feature gating (e.g., AI quota limits).



## Integration Points
Vercel -> Supabase (Postgres via Prisma/Drizzle or Supabase Client): Secure, server-side data mutations passing authenticated tenant context to enforce Row Level Security.

Vercel API -> OpenAI API: The critical intelligence bridge where parsed text and prompts are securely transmitted to GPT-4o.

Stripe Webhooks -> Vercel API -> Supabase DB (Tier updates): Asynchronous event listeners that automatically update workspace subscription tiers and AI quotas upon successful payment or cancellation.

Client Browser -> Supabase Storage: Direct, presigned URL uploads to bypass the Vercel API payload limits and timeout constraints when users upload large resume files.



## Conflict Flags
Job Board/LinkedIn API Integration vs. 4-Month Timeline constraint: Securing official API access from major job boards takes months of business development, directly conflicting with the strict MVP deadline.

Synchronous UI feedback loop vs. LLM/Parsing Latency: Vercel serverless functions have hard execution timeouts (10-60s) which conflict with the heavy, unpredictable processing times of PDF extraction and GPT-4o reasoning.



## Dependencies
The successful delivery of the MVP relies heavily on a few critical external vendors and open-source libraries. **OpenAI** is the most significant functional dependency, as GPT-4o powers the core product differentiation (candidate screening, ranking, and explainability). **Stripe** is an absolute dependency for the monetization strategy and automated tenant tier gating. On the frontend, development velocity strictly depends on the **shadcn/ui** and **Tailwind CSS** component ecosystems to quickly assemble accessible, responsive interfaces without the overhead of custom CSS. Finally, the newly proposed asynchronous architecture introduces a strict dependency on a background worker infrastructure (such as **Inngest** or **Supabase Edge Functions**) to safely decouple long-running LLM tasks from the synchronous UI thread.



## Sequencing
To systematically de-risk the project, the implementation order must adhere to the following sequence:

1. **Supabase Schema + Auth:** Establish the data foundation. Define PostgreSQL schemas, configure Row Level Security (RLS) policies for multi-tenancy, and implement GoTrue authentication.
2. **Stripe Checkout + Webhooks:** Implement the billing engine immediately after authentication to ensure subscription state drives workspace access control from the ground up.
3. **Next.js ATS UI:** Develop the core frontend dashboards, job creation workflows, and candidate pipeline kanban/list views utilizing mock data.
4. **Asynchronous File Parsing + LLM Pipeline:** Implement the background task queue. Handle `pdf2json` extraction, OpenAI API interactions, and Supabase Realtime UI updates safely outside Vercel's synchronous execution limits.
5. **Sourcing Fallback (Chrome Extension):** Build the alternative data ingestion method to bypass native LinkedIn/Job Board API blockades, allowing recruiters to clip candidate profiles directly from their browser into the ATS.



## Risk Mitigation
To mitigate extreme reliance on a single vendor for core intelligence, the technical team must abstract the LLM execution layer behind a unified interface or internal adapter. This design pattern ensures that the system can easily hot-swap from OpenAI's GPT-4o to comparable alternatives like Anthropic's Claude 3.5 Sonnet if API pricing changes, massive outages occur, or compliance mandates shift. 

Furthermore, to mitigate the severe schedule risk posed by third-party job boards (LinkedIn, Indeed), native API integrations must be aggressively descoped from the initial 4-month MVP. The team will instead deploy a native Chrome Extension fallback to scrape and parse screen data, actively circumventing API approval delays while still delivering the required automated sourcing workflow.



## Open Questions
- **OCR Fallback:** Will we need to run an Optical Character Recognition (OCR) fallback service (e.g., Tesseract) to handle scanned, image-based PDF resumes, or will the MVP strictly reject non-text PDFs to save engineering time and compute costs?
- **Background Infrastructure:** Which background job framework will the team officially adopt (e.g., Inngest, Trigger.dev, or raw Supabase Edge Functions) to handle the newly mandated asynchronous LLM queue?
- **Data Privacy & Scraping Limits:** Are there strict legal constraints or Terms of Service violations we need to document regarding the Chrome Extension scraping LinkedIn public profile data before the candidate actively consents?