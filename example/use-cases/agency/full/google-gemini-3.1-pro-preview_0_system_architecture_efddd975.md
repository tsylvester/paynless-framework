# Architecture Summary
The system architecture defines a highly resilient, event-driven ecosystem that securely bridges physical and digital retail. By designating Toast as the physical system of record, Shopify as the commerce engine, and Headless WordPress as the high-performance UI, the architecture achieves a strict separation of concerns. Crucially, offloading all connective routing logic, rate-limit management, and chronological queueing to a managed iPaaS (Make.com/Celigo) drastically lowers the total cost of ownership. This ensures the bakery can reliably deliver complex capabilities—like 60-second inventory parity and real-time marketing automations—without the crippling overhead of maintaining custom cloud infrastructure.


# Architecture
The system employs an event-driven, hybrid microservices architecture orchestrated through a managed Integration Platform as a Service (iPaaS) hub-and-spoke model. This architecture fundamentally pivots away from a highly complex, custom AWS serverless environment (Lambda, API Gateway, ElastiCache) in favor of a low-code routing layer (Make.com or Celigo). This strategic shift minimizes the Total Cost of Ownership (TCO) and completely removes the dependency on specialized DevOps engineering, aligning technical capabilities with the operational constraints of a local retail bakery. In this design, Toast POS serves as the absolute physical system of record, pushing state changes via webhooks. The iPaaS layer intercepts, sequences, and translates these physical events into digital updates pushed to Shopify's backend (the commerce engine). Finally, the presentation layer utilizes a decoupled Headless WordPress instance that independently consumes Shopify Storefront APIs to render the user interface. This separation of concerns ensures that frontend performance (targeting an LCP of < 2.5s) remains fully isolated from heavy backend inventory and pricing synchronizations.



# Services
**Headless WordPress Frontend CMS**: A highly optimized, decoupled presentation layer responsible for serving the user interface, managing non-transactional content, and ensuring high-performance Core Web Vitals without being bogged down by monolithic backend logic.

**Shopify Storefront & Admin Commerce API**: The centralized digital commerce engine that manages the online catalog, secures the checkout process, houses omnichannel customer profiles, and acts as the source of truth for digital inventory states.

**Toast POS Ledger Data Source**: The master physical system of record. It handles all in-store transactions, establishes baseline physical pricing, tracks kitchen inventory, and broadcasts real-time physical state changes via outgoing webhooks.

**Make.com / Celigo iPaaS Routing Engine**: The intelligent, managed middleware layer that replaces custom AWS infrastructure. It handles secure webhook ingestion, API translation, chronological scheduling, rate-limit management, and offline queue processing.

**Klaviyo / ESP Dispatch Engine**: The Email Service Provider functioning as the automated marketing engine, which ingests parsed 'Fresh Batch' webhook triggers from the iPaaS to dispatch real-time, segmented notifications to subscribed customers.



# Components
**WP Engine / Kinsta Managed Hosting**: Specialized, high-availability managed infrastructure dedicated exclusively to hosting the Headless WordPress application, providing automated security patching and scalable compute.

**Edge Cache / CDN**: A distributed content delivery network (such as Cloudflare or the hosting provider's native edge) used to cache Shopify product catalog states and static assets, protecting backend APIs from sudden traffic spikes.

**iPaaS Dead Letter Queue (DLQ) Module**: A native error-handling component within the iPaaS that automatically captures, logs, and safely queues failed payload deliveries (e.g., due to API rate limits or network drops) for subsequent chronological replay.

**iPaaS Chronological Schedulers (Pricing)**: Automated logic engines configured within the middleware to monitor item age thresholds and execute time-sensitive, bidirectional pricing updates to both Toast and Shopify simultaneously.

**Shopify Cart Engine**: The secure transactional component hosted within Shopify's infrastructure, explicitly handling PCI-compliant payment processing, cart scripting, and dynamic price rule applications.



# Data Flows
**Master Inventory Sync Flow**: Physical Transaction completed in-store -> Toast POS updates internal ledger -> Toast pushes Webhook payload -> iPaaS ingests and validates payload -> iPaaS translates schema and pushes to Shopify Admin API -> Shopify updates digital inventory -> Headless Frontend reflects new stock via Storefront API.

**Proactive Marketing Flow**: Staff mechanically triggers 'Fresh Batch' macro on POS -> Toast POS emits tagged webhook -> iPaaS intercepts and routes payload to Klaviyo REST API -> Klaviyo compiles segmented audience list -> Customer receives SMS/Email alert within 5 minutes.

**Dynamic Pricing Markdown Flow**: Time/Schedule Trigger fires within iPaaS Logic Engine -> iPaaS calculates markdown rules based on item age -> iPaaS pushes synchronous updates to Shopify Price Rules (Admin API) and Toast Discount API -> Markdowns reflect simultaneously at physical registers and on the digital storefront.



# Interfaces
**Toast Partner Webhook Endpoints**: Used for securely pushing real-time physical transactional data and inventory state changes outward to the iPaaS.

**Shopify Admin GraphQL API**: Leveraged by the iPaaS for secure, high-privileged backend operations, including forced inventory deductions, variant pricing updates, and catalog synchronization.

**Shopify Storefront GraphQL API**: Consumed directly by the Headless WordPress frontend to rapidly retrieve product availability, pricing, and cart states without routing through the iPaaS.

**Klaviyo REST API**: Utilized by the iPaaS to inject behavioral events and trigger automated marketing flows based on physical kitchen activities.

**WordPress REST / GraphQL API**: Exposes CMS content (such as blog posts, store hours, and rich media) to the decoupled React/Next.js frontend application.



# Integration Points
**Toast POS Base Pricing to Shopify Variant Pricing**: Strict dual-write synchronization where any baseline price change configured in the Toast physical ledger must be algorithmically translated and mapped to the corresponding Shopify product variant.

**Toast Inventory Count to Shopify Location Inventory**: A high-frequency integration mapping the physical available-to-sell quantities from the bakery's local Toast location directly to the corresponding Shopify digital fulfillment location.

**Toast POS Custom Macros to Klaviyo Triggers**: Mapping specific mechanical inputs on the physical POS register (the 'Fresh Batch' button) to programmatic event names that trigger corresponding automated email flows in the ESP.



# Dependency Resolution
**Elimination of Custom AWS Infrastructure**: Deep dependencies on highly specialized DevOps engineers were successfully removed by substituting code-heavy Lambda functions and Terraform scripts with the visual, low-code interface of a managed iPaaS tooling ecosystem.

**Toast Partner API Blockers**: Acknowledging the restrictive nature of Toast's ecosystem, the architecture mandates a strict Phase 0 Go/No-Go verification milestone for API credentials, treating it as an absolute project blocker prior to any capital investment in development.

**Shifting SLA Accountability**: The transition to a hub-and-spoke iPaaS model shifts the burden of uptime, infrastructure scaling, and security patching fully onto well-funded SaaS vendors (Shopify, Make.com, Toast) rather than relying on a localized, vulnerable internal IT footprint.



# Conflict Flags
**Toast Partner Program Exclusivity**: Toast's API policies are historically restrictive and tend to favor enterprise-level software vendors. Securing robust read/write webhook access for a single-location merchant remains a critical programmatic conflict.

**Synchronous Dual-System Write Collisions**: The dynamic pricing engine requires simultaneous updates to both Toast and Shopify. If one API accepts the payload while the other rejects it (due to rate limits or transient errors), it creates an immediate split-brain pricing scenario across physical and digital channels.



# Sequencing
Implementation is sequenced strictly to front-load risk and validate vendor feasibility. 

**Phase 0 (Go/No-Go)**: Secure, validate, and test Toast Partner API access. If denied, the project pauses. 
**Phase 1**: Configure the core iPaaS environment, map data schemas between Toast and Shopify, and establish foundational real-time inventory webhooks and Dead Letter Queue (DLQ) logic. 
**Phase 2**: Develop the customer-facing Headless WordPress UI and map it to the Shopify Storefront API to ensure high-performance catalog rendering. 
**Phase 3**: Activate complex operational automations, specifically the chronologically driven dynamic pricing engine and the ESP 'Fresh Batch' marketing triggers.



# Risk Mitigations
**Dead Letter Queues (DLQ)**: Implemented natively within the iPaaS to automatically capture and safely store any dropped or rejected payloads (e.g., due to local ISP drops), allowing for safe chronological replay without data loss.

**Circuit Breakers**: Configured on iPaaS routing modules to immediately halt outbound processing if Shopify or Toast APIs return consecutive 429 (Too Many Requests) errors, preventing runaway recursive loops and API lockouts.

**Stale-While-Revalidate Caching**: Implemented on the Headless WordPress frontend to ensure the site gracefully degrades during backend API dips, continuing to display cached product catalogs and allowing users to browse even if real-time inventory sync is temporarily halted.



# Risk Signals
**DLQ Build-up**: Any accumulation of failed messages in the iPaaS Dead Letter Queue interface indicates a severe breakdown in data parity or schema validation.

**429 Rate Limit Errors**: Telemetry spikes showing 'Too Many Requests' from either Shopify or Toast, signaling that the webhook influx is exceeding SaaS contractual limits and requires increased batching.

**Latency Spikes > 60s**: iPaaS execution telemetry demonstrating payload delivery times exceeding the 60-second SLA, threatening the 'real-time' promise of the inventory synchronization and risking double-selling.



# Security Measures
**Payload Validation and HMAC Signatures**: All incoming webhooks from Toast POS are cryptographically verified via HMAC signatures within the iPaaS to prevent malicious payload injection or replay attacks.

**Strict Execution Scoping**: API tokens provisioned for the iPaaS layer adhere to the principle of least privilege, scoped exclusively to necessary read/write endpoints (e.g., inventory and pricing) rather than global administrative access.

**Automated Privacy Compliance**: GDPR and CAN-SPAM requirements are managed via automated suppression list mapping; opting out of a 'Fresh Batch' notification automatically updates the Klaviyo CRM and propagates the suppression across all commerce layers.



# Observability Strategy
**Native iPaaS Monitoring**: Relying on the built-in dashboards provided by Make.com or Celigo to track API consumption limits, payload delivery success rates, and execution errors, explicitly avoiding the complexity of deploying a custom ELK stack.

**End-to-End Commerce Tracking**: Utilizing Google Analytics 4 (GA4) with cross-domain E-commerce tracking to monitor the full customer journey from the WordPress frontend through the Shopify checkout.

**Automated Operational Alerting**: Configuring iPaaS error handlers to instantly dispatch alert notifications via Slack or SMS to operational management if critical webhook delivery fails or the DLQ threshold is breached.



# Scalability Plan
**Frontend Decoupling**: The Headless WordPress frontend absorbs massive, sudden traffic spikes (e.g., following a 'Fresh Batch' email blast) by serving edge-cached HTML and JSON from the CDN, entirely decoupled from the backend APIs.

**Asynchronous Webhook Buffering**: The iPaaS acts as a centralized shock absorber, queuing massive influxes of Toast POS webhooks during peak retail hours and processing them asynchronously to prevent overwhelming Shopify's strictly enforced API rate limits.



# Resilience Strategy
**Local Offline POS Queuing**: Toast POS hardware natively caches physical transactions locally during a retail ISP outage, queuing outbound webhooks until commercial internet connectivity is restored.

**Sequential Payload Dequeuing**: Upon ISP restoration, the iPaaS enforces strict chronological processing of the backlogged webhooks, ensuring that older inventory updates do not retroactively overwrite newer states.

**Graceful UI Degradation**: If backend APIs become unreachable, the frontend is programmed to fail safely, displaying the last known cached catalog state rather than returning fatal 500 errors to the consumer.



# Compliance Controls
**Deferred PCI Compliance**: By routing all financial transactions through managed SaaS checkout flows (Shopify Payments for digital, Toast hardware for physical), the custom architecture defers PCI-DSS compliance burdens entirely to compliant third-party processors.

**Consumer Data Privacy**: Handled centrally via Klaviyo and Shopify's native privacy controls, ensuring that customer data deletion requests and communication opt-outs are globally respected across the integrated ecosystem.



# Open Questions
How specifically will Toast POS hardware sequence and transmit offline batched webhooks post-ISP failure, and what precise metadata headers must the iPaaS parse to guarantee chronological processing?

Does the selected iPaaS vendor natively support high-speed, Redis-like caching for frontend payload offloading, or will a supplementary managed caching layer be required to guarantee sub-2.5s LCP under load?

Can Make.com/Celigo handle the synchronous execution required for the dynamic pricing dual-writes strictly within the 60-second execution window before triggering timeout errors?



# Rationale
The decision to abandon the initially proposed custom AWS Lambda infrastructure in favor of a managed iPaaS directly addresses the core commercial and technical constraints of a local retail bakery. While custom AWS solutions offer theoretical infinite scalability and microsecond latency, they impose an unsustainable operational burden, demanding high retainer fees for specialized DevOps personnel and risking long-term technical debt. The iPaaS architecture elegantly solves this by providing a visual, low-code routing layer that local management or affordable agency partners can maintain. This pivot achieves the required event-driven, real-time synchronization between disparate SaaS platforms (Toast and Shopify) while dramatically reducing TCO, accelerating time-to-market, and ensuring robust offline queuing resilience.