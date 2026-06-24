# Risk Register


## Overview
This Risk Register identifies the core technical, commercial, and operational risks associated with bridging a physical POS environment to a highly dynamic digital storefront. While the proposed event-driven microservices architecture is a technical masterpiece that fully addresses the business constraints (real-time sync, automated pricing, fresh batch alerts), it poses a severe threat to the commercial and operational viability of a small local bakery. The primary drivers of risk are extreme architectural complexity, high ongoing Total Cost of Ownership (TCO), strict reliance on third-party SaaS API approvals (Toast), and the vulnerability of digital platforms to local physical ISP outages. The overarching concern is that a small business lacks the technical maturity and budget to maintain custom AWS infrastructure. Consequently, the mitigation posture strongly emphasizes simplifying the middleware layer, gating the project on API access, and ensuring graceful fallback states during network interruptions.



## Risk
### Risk 1: Custom Integration Maintenance Overhead

**Impact:** High. System failures could halt online sales and cause inventory disparities if the original developers are unavailable. In a small business context, technical risks rapidly become financial crises due to a lack of deep engineering support. AWS consumption costs and retainer fees for cloud engineers could severely dilute the bakery's profit margins.

**Likelihood:** High. A local bakery does not possess the internal Dev-Ops, Node.js, or AWS architecture skills required to maintain an enterprise-grade serverless application, respond to incident alerts, or manage ElastiCache (Redis) instances.

**Mitigation:** Migrate custom AWS Lambda code to a visual, managed Integration Platform as a Service (iPaaS) such as Make.com or Celigo to allow easier handoff, visual debugging, and significantly lower maintenance costs.

**Components Affected:** AWS Node.js Middleware (Integration Router), AWS API Gateway, AWS Lambda, AWS ElastiCache (Redis).

**Dependencies:** Original developer availability, AWS infrastructure uptime, Bakery operating budget.

**Sequencing Considerations:** Must be addressed prior to Phase 1. Deciding whether to use custom AWS infrastructure or an iPaaS dictates the entire engineering roadmap.

**Risk Mitigation Plan:** Conduct an immediate comparative analysis between the proposed AWS serverless stack and managed iPaaS solutions. Produce a Total Cost of Ownership (TCO) report for both options over a 3-year timeline.

**Open Questions:** Can an iPaaS natively handle the throughput and sub-60-second execution SLA required by the dynamic pricing and inventory sync engines without forcing a premium enterprise tier?

**Guardrails:** Implement strict timeouts on all Lambda functions to prevent runaway costs from infinite retry loops.

**Risk Signals:** Lagging indicators such as infrastructure cost creep and ongoing maintenance billable hours exceeding budget projections.

**Next Steps:** Evaluate iPaaS alternatives to custom AWS Node.js code and present the architectural pivot to the client.

---

### Risk 2: Toast API Access Denied

**Impact:** Critical. The entire event-driven architecture relies on Toast POS acting as the system of record. Without access to the Toast Partner API and webhooks, the real-time POS-to-Ecom inventory sync and Fresh Batch triggers cannot function.

**Likelihood:** High. Toast is known to have a stringent Partner Program, and single-location merchants or custom, single-tenant integrations are frequently denied API credentials or forced into cost-prohibitive enterprise tiers.

**Mitigation:** Use official partner channels early to secure approval. If denied, pivot to exploring alternative open POS systems, or utilize a middle-tier data aggregator if supported.

**Components Affected:** Toast POS API, Toast Webhooks, AWS API Gateway (Ingress).

**Dependencies:** Toast Partner Program acceptance timelines vs. Project Timeline.

**Sequencing Considerations:** Securing API credentials is the definitive Step 1. No custom development or data mapping should occur until access is granted.

**Risk Mitigation Plan:** Establish API partnership access as a Phase 0 Go/No-Go gate. Draft the partner application immediately emphasizing the unique omnichannel hyper-connected bakery use case.

**Open Questions:** Are there alternative, publicly accessible methods to extract real-time inventory deductions from Toast if the Partner API is restricted?

**Guardrails:** Block all infrastructure provisioning and frontend development phases until sandbox API keys are successfully tested.

**Risk Signals:** Delays in Toast Partner Program application responses or requirements for prohibitive minimum volume thresholds.

**Next Steps:** Validate Toast POS Partner API requirements specifically for single-location merchants and submit documentation.

---

### Risk 3: Local ISP Outage & Offline Synchronization Failure

**Impact:** High. If the physical bakery loses local internet connection, the digital storefront (Shopify/WordPress) will become instantly disconnected from physical reality. This leads to double-selling inventory that was purchased in-store while the network was down, resulting in customer service escalations and online order refunds.

**Likelihood:** Medium. Local brick-and-mortar retail locations frequently experience temporary ISP drops or router resets.

**Mitigation:** Cache inventory states in Redis. Ensure the frontend degrades gracefully to display cached inventory. Queue offline sales for chronological bulk sync upon network reconnection.

**Components Affected:** Toast POS (Physical Terminal), Local ISP, AWS ElastiCache (Redis), Shopify Storefront API.

**Dependencies:** The entire digital ecosystem is strictly dependent on the physical bakery internet connection.

**Sequencing Considerations:** Offline queuing and conflict resolution logic must be established in Phase 1 during the foundational Data & Sync build.

**Risk Mitigation Plan:** Define offline queuing behavior explicitly in the architectural spec. Implement logic in the middleware to process batch webhook payloads in chronological order to prevent retroactive, inaccurate inventory overrides.

**Open Questions:** How does Toast handle queued offline webhooks when a local internet outage resolves? Does it guarantee sequential delivery?

**Guardrails:** The WordPress frontend must seamlessly fall back to displaying cached inventory via Redis if backend sync APIs fail or timeout.

**Risk Signals:** Dropping Redis cache hit rates or sudden prolonged periods without inbound webhooks from Toast during normal business hours.

**Next Steps:** Review Toast documentation to map the exact offline queue webhook schema and test the recovery sequence in a sandbox environment.

---

### Risk 4: Operational Execution of 'Fresh Batch' Triggers

**Impact:** Medium. The proposed automated email marketing campaigns and subsequent traffic spikes are reliant on 'Fresh Batch' triggers. If bakery staff fail to correctly interact with the POS during busy periods, the primary revenue-driving differentiation of the platform is nullified.

**Likelihood:** Medium to High. Expecting physical cashier intervention (e.g., tagging a specific inventory addition macro) during high-stress retail hours often leads to poor compliance.

**Mitigation:** Provide a clear Standard Operating Procedure (SOP) for bakery staff and implement a simplified, one-touch interface or automated physical trigger if possible.

**Components Affected:** Toast POS terminal UI, Bakery Staff SOPs, ESP (Klaviyo/Mailchimp) API.

**Dependencies:** Physical staff compliance and training.

**Sequencing Considerations:** Must be finalized and documented prior to the Phase 3 Value-add Automations rollout.

**Risk Mitigation Plan:** Work directly with the bakery management to design the least-friction method for triggering the Fresh Batch event on the Toast interface. Conduct training sessions prior to launch.

**Open Questions:** Is the physical POS workflow for the 'Fresh Batch' triggers undefined, and how can we ensure staff compliance without slowing down the checkout line?

**Guardrails:** Monitor 'Fresh Batch' email dispatch volume against historical production schedules to identify if staff are forgetting to trigger the system.

**Risk Signals:** 0% email dispatch rates on known baking days; negative customer reviews mentioning a lack of expected notifications.

**Next Steps:** Clarify and finalize the physical POS workflow and create the SOP document for bakery operations.



## Impact
If the identified risks materialize, the consequences range from technical failure to complete commercial unviability. System failures and API discrepancies will directly cause inventory mismatch, leading to overselling online, out-of-stock cancellations, and profound customer frustration, undermining the 'hyper-connected bakery' value proposition. Financially, relying on over-engineered custom AWS infrastructure exposes a small business to high operational expenditure (OpEx), cloud consumption spikes due to runaway API retries, and expensive ongoing retainer fees for cloud engineers. At the absolute extreme, denial of Toast API access represents a catastrophic project blocker, preventing the integration entirely.



## Likelihood
The overall likelihood of these risks materializing is heavily skewed toward 'High' due to the mismatch between the proposal's enterprise-grade architectural complexity and the operational reality of a small local bakery. Specifically, the likelihood of facing high Total Cost of Ownership (TCO) and maintenance overhead is near certain if deploying a custom Node.js/Terraform/Redis stack for a single location. Additionally, API access friction with commercial POS vendors like Toast is highly probable for independent merchants.



## Mitigation
The primary strategy to mitigate these risks is architectural simplification. By transitioning the custom AWS Node.js middleware to a fully managed Integration Platform as a Service (iPaaS) like Make.com or Celigo, the solution drastically reduces ongoing maintenance burdens and cloud engineering dependencies. Technical safeguards, such as Dead Letter Queues (DLQs), exponential backoff for API retries, and Redis caching layers, will protect against API rate-limiting and temporary ISP outages. Additionally, strict gating of the project based on acquiring Toast API credentials ensures budget is not wasted prior to establishing fundamental feasibility.



## Seed Examples
Risk: Toast API Access Denied | Impact: Critical | Likelihood: Medium | Mitigation: Use official partner channels early, or pivot to open POS systems.

Risk: Local ISP Outage | Impact: High | Likelihood: Medium | Mitigation: Cache inventory in Redis; queue offline sales for bulk sync upon reconnection.

Risk: Webhook Failure / Missing Data | Impact: High | Likelihood: Medium | Mitigation: Implement Dead Letter Queues (DLQ) and exponential backoff retry logic.



## Mitigation Plan
### Cross-Cutting Mitigation Themes

**1. Simplification & Managed Services:** Pivot away from custom, high-maintenance AWS serverless infrastructure toward managed iPaaS solutions to lower TCO and enable easier handoff to the bakery or standard managed service providers. *Owner: Technical Lead. Timeline: Pre-Phase 1.*

**2. Phase 0 API Gating:** Treat third-party API access (specifically Toast POS) as a strict Go/No-Go milestone. Do not commence data schema mapping or core integration development until production and sandbox credentials are secured. *Owner: Project Manager. Timeline: Immediate.*

**3. Fault Tolerance & Decoupling:** Utilize intelligent caching (Redis or equivalent iPaaS data stores) to decouple the heavy read requests of the WordPress frontend from the strict rate limits of the Shopify and Toast backends. Implement Dead Letter Queues (DLQs) to capture failed webhooks for replay. *Owner: Cloud Architect. Timeline: Phase 1.*

**4. Operational Alignment:** Acknowledge that technical features rely on physical human operations. Develop explicit Standard Operating Procedures (SOPs) for bakery staff to execute inventory inputs (like 'Fresh Batch' triggers) with minimal friction. *Owner: Operations Analyst. Timeline: Phase 3.*



## Notes
**Assumptions:**
- We assume the bakery is willing to alter in-store physical operations to support digital triggers (e.g., specific POS workflows for Fresh Batches).
- We assume Shopify and Toast rate limits will accommodate peak traffic spikes during Fresh Batch email blasts without throttling if push webhooks and caching are strictly utilized.

**Dependencies:**
- Project success is wholly dependent on the approval of Toast Partner Program API access for a single-location merchant.
- Real-time accuracy is dependent on the reliability of the local physical bakery's ISP.

**Follow-up Actions:**
- Validate Toast POS Partner API requirements and constraints immediately.
- Define and document offline queuing behavior for Toast webhooks.
- Create a budgetary cost breakdown comparing the proposed AWS infrastructure against top iPaaS platforms.