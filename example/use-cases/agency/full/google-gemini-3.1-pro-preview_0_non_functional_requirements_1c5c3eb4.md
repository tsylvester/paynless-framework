# Non-Functional Requirements Review


## Overview
### Comprehensive Non-Functional Requirements Overview
This foundational NFR blueprint establishes a rigorous set of operational constraints uniquely designed to ensure the bakery's omnichannel digital integration runs securely, highly performantly, and entirely without manual staff intervention. The targeted performance, scalability, and reliability dimensions are exceptionally robust, appropriately employing standard enterprise architectural patterns—such as Redis caching and event-driven asynchronous webhook processing—to guarantee high availability and real-time < 60-second end-to-end syncs. However, while technically brilliant, the overarching concern remains rooted in the system's high architectural complexity. For a local small business environment, ensuring the custom codebase is meticulously documented, properly instrumented via CloudWatch and Sentry, and strictly capped to prevent AWS consumption overages is essential. Furthermore, an immediate strategic review prioritizing highly maintainable iPaaS alternatives over custom AWS serverless infrastructure is the most critical recommendation to mitigate the severe financial risks of long-term technical debt and support overhead.



## Security
### Security Architecture & Secret Management
The architecture must enforce strict data security and platform integrity, maintaining a clear separation of concerns to prevent unauthorized access or data leakage.

* **Secrets Management**: All sensitive credentials, including API keys for Shopify Admin, Toast Partner APIs, and the Email Service Provider (ESP), must be securely stored in AWS Secrets Manager. Hardcoding API keys or access tokens within the Node.js source code or exposing them as unencrypted environment variables is strictly prohibited.
* **PCI Data Isolation**: The system is designed to entirely bypass the ingestion or processing of sensitive payment information. Raw credit card data and personal payment instruments must never pass through the custom AWS middleware or the headless WordPress environment. Payment processing must remain natively encapsulated within the Shopify Checkout flow for online orders, and the physical Toast POS terminals for in-store transactions, thereby preserving out-of-the-box PCI compliance boundaries.
* **IAM Least Privilege**: The AWS Lambda functions and API Gateway must operate under the strict principle of least privilege. Explicit AWS Identity and Access Management (IAM) roles must be defined, granting integration endpoints access only to absolutely necessary resources, such as Amazon ElastiCache (Redis) read/write channels and specific CloudWatch log groups.



## Performance
### Performance Expectations & Response Time
High performance is the linchpin of the 'hyper-connected bakery' customer experience. Latency at any data integration point risks presenting inaccurate inventory to the user, directly leading to out-of-stock customer friction.

* **End-to-End Sync Latency**: The critical integration path—spanning from a physical item being sold in Toast POS, generating an outbound webhook, routing through API Gateway and AWS Lambda, and executing a write request via the Shopify Admin API—must resolve completely in **< 60 seconds**.
* **Frontend Rendering Limits**: The Headless WordPress storefront must be highly optimized for Core Web Vitals, specifically targeting a Largest Contentful Paint (LCP) metric of **< 2.5 seconds**. Achieving this requires aggressive use of the Redis cache to serve immediate, localized inventory states to users rather than executing synchronous backend API queries on every page load.
* **Event-Driven Asynchronous Processing**: Polling architectures are disallowed due to inherent latency and massive API overhead. The entire integration must rely on push-based webhook execution to guarantee real-time data flows. Middleware must return a 200 OK receipt to Toast POS within 200 milliseconds before queuing the heavier Shopify API updates asynchronously, preventing timeout drops.



## Reliability
### Reliability Targets & Failure Recovery
The integration ecosystem must be highly resilient, ensuring the digital storefront remains transactional even when physical systems or third-party dependencies experience localized outages.

* **Target Uptime SLAs**: The core AWS integration middleware layer (API Gateway, Node.js Lambda router, and ElastiCache) must be architected to achieve a **99.9% uptime** standard, minimizing any risk to continuous inventory parity.
* **Graceful Degradation**: In the event of an ISP internet outage at the physical bakery location or a temporary Toast API disruption, the system must not crash the customer-facing frontend. The WordPress UI must degrade gracefully, falling back to the last-known authoritative inventory state stored in the highly available Redis cache.
* **Automated Failure Recovery**: Unprocessed webhook payloads resulting from Shopify API timeouts, 5xx server errors, or transient network drops must automatically route to a designated Dead Letter Queue (DLQ). The system must implement intelligent exponential backoff and automated retry logic to seamlessly resolve queue backups once upstream services are restored, guaranteeing eventual data consistency without manual staff intervention.



## Scalability
### Scalability & Load Management
System load will be highly cyclical, necessitating elastic computing resources capable of scaling transparently to meet immediate consumer demand without operator intervention.

* **Traffic Burst Accommodation**: The architecture must sustain immediate, massive frontend and API traffic spikes up to **10x the standard baseline volume** without degradation. These spikes are modeled to occur instantaneously following the automated dispatch of 'Fresh Batch' email blasts to the bakery's customer subscriber base.
* **API Rate Limit Throttling**: The custom middleware must actively monitor and dynamically respect API usage limits across all integrated third-party platforms. During high-velocity transactional periods, the system must employ intelligent request batching or rate-limit throttling mechanisms to prevent the Shopify Admin or Storefront APIs from issuing `429 Too Many Requests` status codes, which would break the synchronization loop.



## Maintainability
### Maintainability & Operational Readiness
This dimension represents the single highest ongoing risk factor for a local bakery adopting enterprise-grade serverless cloud architecture.

* **Codebase Standardization and Documentation**: The custom Node.js middleware must conform to strict enterprise development standards. It must feature comprehensive inline documentation, clear schema maps, and a predictable repository structure. The codebase must be inherently transferable so that a third-party Managed Service Provider (MSP) can seamlessly inherit, debug, and manage the system without relying on the original implementation developers.
* **System Telemetry**: Extensive, structured logging must be integrated throughout the entire middleware stack to facilitate rapid triage and debugging when sync failures occur.
* **Architectural Risk Pivot**: Given the profound Total Cost of Ownership (TCO) implications of maintaining custom AWS serverless infrastructure for a single business location, an immediate evaluation of low-code Integration Platform as a Service (iPaaS) alternatives—such as Make.com or Celigo—is required. Migrating custom AWS Lambda code to a visual, managed iPaaS environment would drastically lower the technical barrier and ongoing maintenance burden.



## Compliance
### Regulatory & Organizational Compliance
* **Marketing & Communication Regulations**: The 'Fresh Batch' automated email integration must achieve strict adherence to CAN-SPAM (US) and GDPR requirements. Marketing opt-in preferences captured natively on the WordPress frontend or within Shopify checkout must be accurately mapped and synchronized to the Email Service Provider (ESP) subscriber lists.
* **Frictionless Opt-Out Paths**: Every automated communication dispatch must guarantee a highly visible, frictionless, and instantaneous opt-out or preference management path. Unsubscribing must dynamically suppress future triggers traversing the AWS middleware to prevent compliance violations.
* **Data Minimization Practices**: The AWS middleware serves solely as a transient processor and routing mechanism. It must strictly adhere to data minimization principles, ensuring it does not log, persist, or expose Customer Personally Identifiable Information (PII) beyond the transient execution window necessary to route the immediate transactional payload.



## Outcome Alignment
### Strategic Outcome Alignment
The rigorous enforcement of these non-functional operational constraints serves as the structural foundation for achieving the project's primary functional and financial goals. Guaranteeing an end-to-end sync latency of <60 seconds and enforcing strict graceful degradation routines directly enable the primary operational KPI: maintaining a **< 1% discrepancy rate in digital vs. physical inventory**. By successfully shielding the end consumer from system delays and preventing oversold items, the bakery dramatically improves customer retention. Furthermore, automating system recovery and ensuring 99.9% middleware uptime explicitly removes the need for physical bakery staff to intervene in IT issues, allowing them to remain completely focused on core culinary and customer service operations.



## Primary KPIs
### Primary Key Performance Indicators (KPIs)
* **Middleware Uptime**: Target 99.9% continuous availability for the AWS API Gateway and Lambda routing logic.
* **End-to-End (E2E) Sync Latency**: Target < 60 seconds from physical POS deduction execution to the finalized digital Shopify state update.
* **Frontend Largest Contentful Paint (LCP)**: Target < 2.5 seconds for core WordPress page loads to prevent mobile shopping cart abandonment.
* **Support Ticket Volume / Refund Rate**: Target near-zero customer service inquiries and order refunds specifically related to out-of-stock items or oversold digital goods.



## Leading Indicators
### Leading Indicators
* **AWS CloudWatch API Error Rates**: Real-time monitoring of 5xx and 4xx status codes within the integration layer; frequent occurrences preemptively signal an impending synchronization collapse.
* **Lambda Execution Duration**: Tracking the average run time of serverless functions. Sustained upward trends indicate severe downstream API sluggishness or throttling.
* **Redis Cache Hit Ratios**: High hit rates validate the effectiveness of the decoupled read-heavy architecture. Conversely, dropping rates indicate a potential cache failure forcing synchronous polling constraints.



## Lagging Indicators
### Lagging Indicators
* **Infrastructure Cost Creep**: Gradual, month-over-month increases in AWS consumption costs (e.g., API Gateway invocations, Lambda execution gigabyte-seconds, ElastiCache scaling) that are disconnected from proportional baseline revenue growth.
* **Ongoing Maintenance Billable Hours**: The total accumulation of monthly hours billed by third-party engineering contractors or managed service providers required to patch custom code failures, update deprecating Node.js modules, or refactor integrations due to third-party API schema updates.



## Measurement Plan
### Measurement Plan & Operational Tooling
* **Infrastructure & Telemetry Monitoring**: Deploy AWS CloudWatch across the entire middleware stack to automatically capture granular error rates, Lambda execution metrics, API Gateway throughput, and Redis cache utilization.
* **Frontend Performance Tracking**: Implement Google Analytics 4 (GA4) tightly integrated with specialized Core Web Vitals monitoring tooling (such as automated Lighthouse audits) to continuously evaluate the real-world LCP and conversion flow performance of the WordPress environment.
* **Application Exception Tracking**: Integrate Sentry deep within the Node.js middleware codebase. Sentry will provide immediate, real-time, stack-traced exception notifications direct to the development team whenever custom routing scripts fail or external API payloads unexpectedly mutate.



## Risk Signals
### Early Warning Risk Signals
* **Spiking '429 Too Many Requests' Outages**: A sudden barrage of rate-limit rejection responses from either the Toast POS or Shopify APIs. This acts as an immediate red flag indicating catastrophic queue mismanagement or a failure of the architecture's inherent batching logic.
* **Redis Cache Miss Expansion**: Noticeable, sustained drops in cache hit rates that force the underlying system into heavy synchronous API processing, thereby vastly increasing the risk of latency-driven overselling.
* **Unresolved Dead Letter Queue (DLQ) Accumulation**: A rapidly growing, stagnant volume of unprocessable webhook events stuck in the DLQ without successful resolution. This signals a critical internal routing fault or a sustained, unannounced third-party platform outage.



## Guardrails
### Essential System Guardrails
* **Strict Hard Timeout Limits**: Mandatory maximum execution timeouts must be rigidly enforced on all AWS Lambda serverless functions. This safeguard is non-negotiable and unconditionally prevents hung computational processes from causing runaway, unrecoverable cloud consumption billing spikes.
* **DLQ Alert Escalation Thresholds**: Automated incident management alerts (e.g., via PagerDuty or immediate Slack integration) must be triggered instantly if the Dead Letter Queue accumulates a predefined, critical volume of unprocessed webhook events.
* **Exponential Backoff Ceilings**: Hardcoded caps on automated retry logic loops must be strictly implemented to ensure the middleware does not inadvertently launch a distributed denial-of-service against recovering third-party SaaS APIs (Shopify/Toast) following a system-wide outage.



## Next Steps
### Immediate Action Plan for Addressing NFR Gaps
* **Define Peak Load Traffic Parameters**: Systematically model and explicitly document the exact anticipated frontend user traffic bursts and backend API processing volume triggered immediately following the largest anticipated 'Fresh Batch' email blast.
* **Map Exact Toast Webhook Schema Variations**: Execute a deep-dive technical validation on the precise, varied JSON payload schemas emitted by the Toast POS webhooks for multiple event types (e.g., standard sales deductions vs. manual inventory corrections vs. explicit 'Fresh Batch' tagged additions) to finalize the custom Lambda data routing parameters.
* **Execute Formal iPaaS Feasibility Review**: Pause committing to custom AWS infrastructure and formally contrast the proposed Lambda architecture against fully managed iPaaS vendor platforms (Make.com, Celigo) to definitively validate the optimal path for reducing the small business's long-term operational maintenance costs.