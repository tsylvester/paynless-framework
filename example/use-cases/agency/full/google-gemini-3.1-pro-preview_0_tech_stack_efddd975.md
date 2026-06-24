# Tech Stack Recommendations


## Frontend Stack
**Framework:** Headless WordPress acts as the primary content management system and presentation logic tier. An optional React/Next.js frontend layer can be utilized if decoupled via REST or GraphQL APIs to ensure high performance and rich interactions. This approach isolates the frontend presentation from backend latency, directly supporting the requirement to maintain a Largest Contentful Paint (LCP) of < 2.5 seconds.

**Hosting:** Managed specialized hosting solutions, specifically WP Engine or Kinsta, are designated for the headless environment. This offloads server maintenance, automates security patching, and provides high-availability infrastructure capable of sustaining the 10x traffic spikes expected during 'Fresh Batch' marketing broadcasts without relying on in-house DevOps.

**Performance layer:** An Edge CDN (such as Cloudflare or the built-in edge capabilities of the managed hosting provider) is mandated. It enforces aggressive stale-while-revalidate caching strategies, allowing the UI to degrade gracefully and serve cached inventory catalogs if the Shopify API experiences temporary outages.



## Backend Stack
**Commerce engine:** Shopify SaaS serves as the robust, highly scalable backend commerce engine. It handles complex digital cart state, processes secure checkouts, manages transactional emails, and maintains the unified customer profiles necessary for omnichannel marketing.

**Integration layer:** A managed Integration Platform as a Service (iPaaS), specifically Make.com or Celigo, acts as the central event-driven routing hub. It completely replaces the previously proposed custom AWS serverless infrastructure, managing webhook ingestion, payload transformation, and chronologically sequenced API dispatching.



## Data Platform
**System of record:** Toast POS Cloud Ledger operates as the absolute, uncompromising master source of truth for all physical data. It governs in-store transaction logs, physical inventory counts, and primary base pricing.

**Customer data:** Shopify acts as the primary transactional CRM, dynamically syncing authenticated customer data and purchase histories directly to Klaviyo. This ensures robust, GDPR/CAN-SPAM compliant omnichannel segmentation for targeted retention campaigns.



## DevOps Tooling
**Infrastructure:** Fully vendor-managed SaaS and low-code iPaaS environments. This strategic pivot completely eliminates the necessity for complex Infrastructure as Code (e.g., Terraform), dedicated cloud engineering retainers, and granular AWS resource management.

**Version control:** Git and GitHub are utilized exclusively for source code management of the WordPress headless theme and custom presentation layer components, enforcing strict peer review and versioning for UI updates.

**Ci cd:** Deployment pipelines leverage managed-platform native automation (e.g., WP Engine deployment hooks) to ensure frictionless, reliable code promotion across staging and production environments without requiring heavy GitHub Actions configurations.



## Security Tooling
**Waf:** Cloudflare or equivalent CDN-level Edge Security provides the primary Web Application Firewall (WAF). It is critical for mitigating DDoS attacks, preventing malicious bot scraping of highly dynamic inventory, and filtering untrusted traffic before it reaches the Headless CMS.

**Auth:** Strictly scoped OAuth 2.0 protocols and generated API Tokens govern all system-to-system communications. The iPaaS layer is restricted to the absolute lowest necessary privileges (Principle of Least Privilege), ensuring it can only read inventory from Toast and write specific updates to Shopify.



## Shared Libraries
Shopify Storefront API SDK (GraphQL) for seamless integration of headless cart management and inventory read operations.

Toast POS Partner API SDK and Webhook Payload Schemas for standardized ingestion of physical point-of-sale events.



## Third-Party Services
Make.com / Celigo (Primary iPaaS Routing & Logic Middleware)

Klaviyo / Mailchimp (Automated ESP & Customer Data Platform Dispatch Engine)

Toast POS (Physical System of Record & Terminal Operations)

Shopify (Digital Commerce Engine & E-commerce Backend)



## Component Recommendations
**Component name:** Integration Middleware (iPaaS Routing Engine)

**Recommended option:** Make.com (with Celigo as the enterprise alternative)

**Rationale:** Transitioning from custom AWS Lambdas to a managed iPaaS radically reduces ongoing technical maintenance and AWS cloud billing while providing powerful out-of-the-box features tailored for this ecosystem. It natively supplies visual payload mapping, Dead Letter Queues (DLQs) for reliable offline fallback, and pre-built API routing templates. This directly solves the small retail constraint of having zero in-house DevOps support while still meeting the <60s sync SLA constraint.

**Alternatives:**

- Custom Node.js AWS Lambdas orchestrated via API Gateway, Amazon SQS, and ElastiCache.

**Tradeoffs:**

- Sacrifices the infinite customizability, granular execution control, and millisecond APM telemetry of a native AWS deployment.

- Trades raw computational throughput for massive Total Cost of Ownership (TCO) reductions and democratized visual maintenance.

**Risk signals:**

- Reaching task tier limit constraints during unforeseen retail volume spikes, causing silent execution failures.

- Latency variations during managed vendor platform load that exceed the strict 60-second end-to-end execution window.

**Integration requirements:**

- Establishment of secure OAuth 2.0 connections mapping Toast physical ledgers to Shopify Admin endpoints.

- Implementation of robust chronological scheduler capabilities to compute item age and execute dynamic pricing markdowns synchronously.

- Configuration of native Dead Letter Queues (DLQ) to capture, store, and chronologically replay webhooks following local ISP disconnects.

**Operational owners:**

- Bakery Management Team (Ongoing workflow administration and physical Toast triggers)

- External Technical Consultant / Digital Agency (Initial schema mapping and complex workflow logic configuration)

**Migration plan:**

- N/A - This represents a greenfield integration approach completely replacing the theoretical custom infrastructure proposed in earlier architecture iterations.



## Open Questions
Are the operation task allocations inherent to Make.com's standard commercial tiers mathematically sufficient to process a 100% daily perishable inventory turnover payload volume without forcing an immediate upgrade to enterprise tier pricing?

Does the chosen iPaaS vendor natively support high-velocity, Redis-style edge caching to protect Shopify API limits during a 'Fresh Batch' marketing broadcast, or must the headless frontend handle 100% of the read load?



## Next Steps
Execute a lightweight technical Proof of Concept (PoC) in Make.com integrating a single Shopify variant to a Toast POS item to definitively validate webhook payload parsing capabilities and end-to-end latency.

Initiate Phase 0 immediately by submitting the requisite Toast Partner Application to secure programmatic API access for a single-location merchant before proceeding with platform development.