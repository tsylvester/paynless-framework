# Dependency Map


## Overview
### Dependency Landscape Overview
This dependency map details the critical path of data flow across the proposed omnichannel architecture. It heavily emphasizes the absolute reliance on the physical Toast POS as the indisputable source of truth, and the AWS Node.js middleware as the mandatory transient processor. 

Mapping these dependencies is critical for this specific proposal because it highlights a severe mismatch between the technical brilliance of the solution and the operational maturity of the end-user. While the architecture flawlessly connects Headless WordPress, Shopify, and Toast to deliver dynamic pricing and real-time fresh batch alerts, it introduces massive operational dependencies. Relying on an uninterrupted local ISP, stringent Toast Partner API approvals, and the retention of senior AWS engineering talent creates an extremely fragile operational environment for a single local bakery. Understanding this dependency web is paramount to deciding whether to proceed with the custom AWS build or pivot toward a more maintainable, managed iPaaS solution.



## Components
Toast POS API

Shopify Admin & Storefront API

AWS API Gateway & Lambda

AWS ElastiCache (Redis)

WordPress CMS (Headless)

Email Service Provider (Klaviyo)



## Integration Points
Toast Webhooks -> AWS API Gateway

AWS Lambda -> Shopify Admin API (Inventory/Pricing Updates)

AWS Lambda -> ESP API (Email Triggers)

WordPress -> Shopify Storefront API (Product Render)



## Conflict Flags
Toast Partner Program acceptance timelines vs. Project Timeline

Shopify API rate limits vs. Real-time sync requirements



## Dependencies
### Core Ecosystem Dependencies
The success of the proposed real-time omnichannel architecture relies on several interconnected dependencies spanning physical infrastructure, third-party software vendors, and engineering capabilities:

*   **Physical Infrastructure**: The entire digital ecosystem—including online inventory availability and automated notifications—is strictly dependent on the physical bakery's local internet connection. Outages here immediately sever the Toast webhook dispatch, causing the single source of truth to fragment.
*   **Toast POS as the System of Record**: All downstream systems (Shopify, WordPress, ESP) are fundamentally dependent on the reliable delivery of Toast webhooks for inventory deductions and 'Fresh Batch' triggers.
*   **Vendor API Access**: Custom integration requires explicit approval into the Toast Partner Program to secure production API credentials. This is notoriously difficult for single-location merchants and acts as a strict Go/No-Go blocker.
*   **Engineering Talent**: The custom serverless AWS stack (Node.js, Lambda, API Gateway, ElastiCache) introduces a hard dependency on retaining senior cloud engineering talent for ongoing maintenance and emergency troubleshooting—resources typically outside a local bakery's operational budget.



## Sequencing
### Implementation Sequencing
To manage technical risk and validate core dependencies early, the implementation must follow a strict sequential order:

1.  **Phase 1: Secure API Credentials & Validation (Go/No-Go Gate)**
    *   Apply for and secure Toast Partner Program API credentials.
    *   Provision Shopify Storefront and Admin API tokens.
    *   Validate rate limits and webhook payload schemas across both platforms.
2.  **Phase 2: Bidirectional Data Schema Mapping**
    *   Establish canonical data models mapping Toast inventory IDs to Shopify product variants.
    *   Define the logic for handling physical refunds, online returns, and specific 'Fresh Batch' item tags.
3.  **Phase 3: Deploy Integration Middleware**
    *   Provision AWS infrastructure (API Gateway, Lambda, ElastiCache) via Terraform.
    *   Deploy the Node.js event routing logic.
    *   Establish and test the webhook listener and Dead Letter Queues (DLQ) behavior.
4.  **Phase 4: Implement WordPress Frontend UI & Value-Add Automations**
    *   Connect the Headless WP CMS to the Shopify Storefront API for product rendering.
    *   Implement ESP (Klaviyo) triggers for automated emails.
    *   Launch and calibrate the dynamic pricing cron jobs.



## Risk Mitigation
### Dependency Risk Mitigation
The architecture introduces significant vendor and infrastructure dependencies that must be aggressively mitigated to protect the business:

*   **API Rate Limit Protection**: To decouple heavy frontend read requests (from WordPress users) from the strict API limits of the backend systems (Shopify/Toast), the proposal leverages AWS ElastiCache (Redis). This ensures the frontend remains performant and online even if backend SaaS APIs degrade.
*   **Network Fault Tolerance**: Because the system is strictly dependent on the physical bakery's ISP, the middleware must implement robust retry logic, Dead Letter Queues (DLQs), and exponential backoff to handle batched webhooks once connectivity is restored.
*   **Operational Handoff**: The most significant business risk is the dependency on the original developers to maintain the custom AWS Lambda code. To mitigate this, the business should strongly evaluate transitioning from a custom AWS microservices architecture to a visual, fully-managed Integration Platform as a Service (iPaaS) like Make.com or Celigo. This drastically reduces the dependency on specialized cloud talent.



## Open Questions
### Unresolved Dependencies & Open Questions

*   **Is ElastiCache Strictly Necessary?** Can the Shopify Storefront API handle the anticipated read volume natively, allowing us to remove the costly and complex Redis dependency from the architecture entirely?
*   **Can an iPaaS Replace AWS Lambda?** Can we rely on a managed low-code integration platform (e.g., Celigo, Make) instead of maintaining a custom AWS serverless environment, thereby lowering ongoing TCO and technical dependency?
*   **Offline Webhook Behavior:** How exactly does Toast POS handle queued offline webhooks when a local internet outage resolves? Does it guarantee chronological delivery, and how will the middleware sequence these to prevent retroactive inventory corruption in Shopify?
*   **Toast API Accessibility:** Given that Toast is notoriously stringent with Partner API access for single-location merchants, what is the immediate fallback plan if sandbox credentials are denied?