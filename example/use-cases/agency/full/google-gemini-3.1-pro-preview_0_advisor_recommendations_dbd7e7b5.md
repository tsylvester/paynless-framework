# Advisor Recommendations


## Comparison Matrix
**Id:** Option A: Make.com / Celigo (Managed iPaaS)

**Scores:**

  - **Dimension:** alignment_with_constraints
  - **Weight:** 0.1
  - **Value:** 9.5
  - **Rationale:** Perfectly aligns with the TCO constraint of <10 billable maintenance hours per month for a local retail operation.

  - **Dimension:** completeness
  - **Weight:** 0.1
  - **Value:** 9
  - **Rationale:** Provides full lifecycle webhook ingestion, routing, and DLQ management out of the box.

  - **Dimension:** feasibility
  - **Weight:** 0.1
  - **Value:** 9.5
  - **Rationale:** Low-code visual interface enables rapid payload mapping between Toast and Shopify without deep backend engineering.

  - **Dimension:** risk_mitigation
  - **Weight:** 0.1
  - **Value:** 8.5
  - **Rationale:** Built-in Dead Letter Queues (DLQs) and offline queuing automatically mitigate local ISP disconnects.

  - **Dimension:** iteration_fit
  - **Weight:** 0.1
  - **Value:** 10
  - **Rationale:** Accelerates Phase 1 delivery by replacing complex IaC setup with instantaneous API connector configurations.

  - **Dimension:** strengths
  - **Weight:** 0.1
  - **Value:** 9
  - **Rationale:** Significantly minimizes DevOps overhead, offers built-in retry logic, and visual payload debugging.

  - **Dimension:** weaknesses
  - **Weight:** 0.1
  - **Value:** 6.5
  - **Rationale:** Introduces dependency on external SaaS uptime limits and vulnerability to platform pricing changes.

  - **Dimension:** opportunities
  - **Weight:** 0.1
  - **Value:** 8.5
  - **Rationale:** Empowers non-technical staff to visually adjust dynamic pricing logic and Fresh Batch routing flows later.

  - **Dimension:** threats
  - **Weight:** 0.1
  - **Value:** 6
  - **Rationale:** High-volume inventory updates could push operations near baseline SaaS plan limits, requiring careful threshold monitoring.

  - **Dimension:** dealer's choice
  - **Weight:** 0.1
  - **Value:** 9.5
  - **Rationale:** Provides the highest ROI for a small bakery needing enterprise-grade omnichannel sync on a bootstrap budget.

**Preferred:** true

**Id:** Option B: AWS Serverless Custom Stack (Custom Lambdas & SQS)

**Scores:**

  - **Dimension:** alignment_with_constraints
  - **Weight:** 0.1
  - **Value:** 2
  - **Rationale:** Violates the core objective of minimizing TCO and keeping maintenance under small-business thresholds.

  - **Dimension:** completeness
  - **Weight:** 0.1
  - **Value:** 10
  - **Rationale:** Infinitely customizable and capable of handling complex chronologies or arbitrary business logic.

  - **Dimension:** feasibility
  - **Weight:** 0.1
  - **Value:** 4
  - **Rationale:** Requires deep specialized knowledge of Terraform/IaC, AWS API Gateway, and Lambda deployment pipelines.

  - **Dimension:** risk_mitigation
  - **Weight:** 0.1
  - **Value:** 8
  - **Rationale:** Highly robust if configured correctly, but relies on custom SQS setup for ISP offline queueing.

  - **Dimension:** iteration_fit
  - **Weight:** 0.1
  - **Value:** 3
  - **Rationale:** High upfront time investment delays the critical Phase 1 Go/No-Go validation for Toast payloads.

  - **Dimension:** strengths
  - **Weight:** 0.1
  - **Value:** 9
  - **Rationale:** No arbitrary operation limits; complete control over data privacy, logging, and execution environments.

  - **Dimension:** weaknesses
  - **Weight:** 0.1
  - **Value:** 2
  - **Rationale:** Requires expensive developer retainers for minor schema updates or debugging dropped webhooks.

  - **Dimension:** opportunities
  - **Weight:** 0.1
  - **Value:** 8
  - **Rationale:** Scales seamlessly if the bakery franchises into a multi-location enterprise.

  - **Dimension:** threats
  - **Weight:** 0.1
  - **Value:** 3
  - **Rationale:** Total reliance on external technical personnel creates a massive single point of failure for daily retail operations.

  - **Dimension:** dealer's choice
  - **Weight:** 0.1
  - **Value:** 2
  - **Rationale:** Over-engineered for the specific constraints of a single-location local bakery.

**Preferred:** false



## Analysis
**Summary:** Analyzing alternate infrastructure options for the middleware layer mapping physical Toast POS payloads to Shopify digital inventory, explicitly comparing a Managed iPaaS approach (Make.com/Celigo) against a Custom AWS Serverless Architecture as outlined in the TRD feasibility insights.

**Tradeoffs:**

- Make.com significantly minimizes Total Cost of Ownership (TCO) and DevOps requirements but forces reliance on an external SaaS ecosystem and operation limits.

- AWS Lambdas provide infinite customization, massive scaling ceilings, and granular control but require deep IaC overhead, custom alerting, and ongoing developer maintenance which directly violates the goal of <10 billable operational hours/month.

- Managed iPaaS natively supplies visual payload mapping and out-of-the-box Dead Letter Queues (DLQ) to handle ISP drops, whereas custom AWS solutions require custom queue architecture (SQS/EventBridge) to achieve the same resilience.

**Consensus:**

- The iPaaS approach provides an overwhelmingly superior benefit-cost profile for a highly constrained local business context, perfectly matching the required metrics.

- Minimizing internal technical debt is critical; shifting the uptime and infrastructure SLA to a managed vendor ensures the bakery staff can focus on operations, not server maintenance.



## Recommendation
**Rankings:**

  - **Rank:** 1
  - **Option id:** Option A: Make.com / Celigo (Managed iPaaS)
  - **Why:** It is the only option that realistically satisfies the strict <10 billable hours/month maintenance constraint while still delivering the <60 second real-time sync SLA required for the hyper-connected model.
  - **When to choose:** Default choice. Immediate utilization for Phase 1 base provisioning.

  - **Rank:** 2
  - **Option id:** Option B: AWS Serverless Custom Stack (Custom Lambdas & SQS)
  - **Why:** Provides unlimited flexibility but introduces unsustainable DevOps overhead, violating the core TCO business requirement.
  - **When to choose:** Re-evaluate only if the business successfully transitions into a multi-state franchise model exceeding iPaaS enterprise tier limits.

**Tie breakers:**

- TCO limitation explicitly prioritizes a managed ecosystem over custom engineering.

- Development timeline heavily favors visual payload mapping over writing and deploying custom backend integration code.

- Native visual DLQ telemetry is essential for non-technical bakery management to verify offline queue recoveries after local internet outages.