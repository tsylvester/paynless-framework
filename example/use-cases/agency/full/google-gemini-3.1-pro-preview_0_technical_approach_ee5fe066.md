# Architecture
The system utilizes an event-driven microservices architecture designed to reliably bridge the gap between physical in-store operations and the digital storefront. At the core is an AWS-hosted Node.js middleware layer acting as the central nervous system connecting Toast POS, Shopify, and WordPress. By standardizing on native integrations (Shopify Storefront API, Toast Partner API), this approach balances the constraints of disparate commercial systems with the business need for low-latency, real-time data flow.

WordPress operates in a headless capacity, dedicated strictly to frontend UI generation, user experience, and rich content management. It dynamically consumes product, pricing, and availability data from Shopify via the Storefront API rather than hosting the e-commerce engine itself. This decoupling ensures optimal Core Web Vitals (LCP < 2.5s) and scalability while maintaining a seamless user experience. To respect API rate limits and minimize latency, the architecture heavily favors webhook-driven push events over continuous polling. This standard operational pattern ensures rapid data propagation between systems, directly enabling advanced capabilities like dynamic pricing algorithms and real-time fresh batch notifications.



# Components
1. **WordPress (Frontend UI & Content Management)**: Serves as the customer-facing presentation layer. It integrates specialized plugins for managing and displaying customer testimonies and utilizes a headless connection to Shopify to render the shopping experience. Items reaching zero inventory dynamically display as 'Sold Out' on this layer.

2. **Shopify (E-commerce Backend)**: Functions as the e-commerce engine, managing the digital product catalog, shopping cart, checkout processing, and customer preference profiles. It serves as the master database for online transactions and acts as the trigger point for automated price adjustments via the Price Rules API.

3. **Toast POS (System of Record)**: The primary source of truth for in-store physical operations, including master inventory state, physical sales execution, and base item pricing. It is responsible for emitting real-time webhooks to the integration middleware upon sales deductions or new 'Fresh Batch' additions.

4. **Integration Middleware**: Deployed continuously to AWS using API Gateway, Node.js Lambda functions, and Amazon ElastiCache (Redis). It acts as the routing and business logic engine, handling high-throughput webhook processing, inventory translation between Toast and Shopify, dynamic pricing cron jobs, and intelligent caching.

5. **Email Service Provider (ESP)**: An integration (e.g., Klaviyo) responsible for executing transactional and marketing communications, specifically the 'Fresh Batch Automated Email Alerts' dispatched within 5 minutes of a targeted middleware trigger.



# Data
The architecture enforces strict data governance and single-source-of-truth rules to prevent synchronization conflicts across the distributed platforms.

- **Master Data Management**: The physical product catalog, base pricing, and absolute real-time inventory counts are mastered in Toast POS. This data synchronizes unidirectionally to Shopify. Customer identities, omnichannel order histories, and product review sentiments are mastered in Shopify and rendered through WordPress.
- **Data Flows & Latency**: A physical sale executed in Toast POS triggers an inventory deduction webhook within 10 seconds. The AWS middleware processes this payload and updates the corresponding Shopify product inventory via the Admin API within a strictly monitored 60-second SLA. When stock hits zero, the integration updates the Shopify state, which instantly reflects as 'Sold Out' on the WordPress frontend.
- **Caching Strategy**: To decouple the read-heavy consumer traffic on the WordPress frontend from the stringent API rate limits of Toast POS, real-time inventory states and active pricing rules are cached in the Redis layer within the AWS middleware. This cache serves as the high-availability data source for frontend queries.



# Deployment
Deployment emphasizes automation, high availability, and reliance on managed services to reduce the operational total cost of ownership (TCO).

- **Cloud Infrastructure**: The middleware layer will be deployed on AWS using Serverless frameworks. Infrastructure as Code (IaC) will be strictly maintained using Terraform to ensure repeatable, documented, and secure environment provisioning.
- **CI/CD Pipeline**: Code updates to the Node.js middleware and inventory scripts will be deployed continuously via GitHub Actions, executing automated integration and linting tests before promoting builds to the AWS production environment.
- **Managed Platforms**: The headless WordPress application will be hosted on managed, optimized infrastructure (e.g., WP Engine or Kinsta) to ensure security patching and performance baselines. Shopify and Toast POS operations will remain on their respective native SaaS configurations, minimizing internal infrastructure maintenance.
- **Operational Tooling**: Operational health will be tracked using AWS CloudWatch for middleware API routing, Sentry for continuous exception tracking, and Datadog for holistic systems monitoring. Google Analytics 4 will monitor core user behavior and conversion flows.



# Sequencing
Project delivery is structured iteratively across three phases to manage technical risk and validate core functionalities early.

- **Phase 1: Foundation (Data & Sync)**
  - Secure Toast Partner API credentials and validate API rate limit thresholds.
  - Map data schemas between Toast inventory entities and Shopify product catalog architectures.
  - Develop, test, and deploy the core bidirectional (to account for online returns/refunds) and unidirectional real-time inventory sync logic within the AWS middleware.

- **Phase 2: Frontend (Customer Experience)**
  - Build the headless WordPress frontend UI and integrate the Shopify Storefront API/Buy Button.
  - Deploy and test the customer testimonies integration.
  - Conduct end-to-end integration testing of the 'Sold Out' display functionality traversing the complete Toast-to-Shopify-to-WordPress pipeline.
  - Implement GA4 properties and establish baseline conversion measurement tools.

- **Phase 3: Automation (Value-Add Features)**
  - Develop and validate the automated dynamic pricing guidance engine, configuring age/time-of-day thresholds mapped securely to Shopify Price Rules and Toast discount macros.
  - Configure and rigorously test the 'Fresh Batch' tagging system, connecting Toast inventory triggers to the ESP preference databases for targeted email dispatch.



# Risk Mitigation
Several architectural and operational risks have been identified, with specific mitigation strategies codified into the system design:

- **API Rate Limiting & Latency**: Polling mechanisms are inherently inefficient and prone to triggering '429 Too Many Requests' errors, which cause inventory discrepancies. We mitigate this by natively utilizing an event-driven, webhook-based push architecture for all Toast and Shopify interactions.
- **System Downtime & Internet Reliability**: Should the Toast API experience an outage or the physical bakery location lose internet connectivity, the AWS Redis cache layer will act as an authoritative fallback state. This ensures the digital storefront remains online, performant, and transactional using the last known good inventory baseline.
- **Sync Discrepancies**: To maintain the target <1% discrepancy rate and prevent double-selling, the middleware will enforce strict chronological sequence ordering of webhooks. An escalation protocol via PagerDuty will automatically alert the engineering team if synchronization queues delay beyond 5 minutes.
- **Feature Lifespan**: To mitigate the threat of emerging native POS platforms making custom code obsolete, the architecture strictly decouples business logic into modular microservices. Individual functions (like the pricing engine) can be sunset or refactored independently without inducing widespread technical debt.



# Open Questions
- **Inventory Tagging Mechanisms**: Can Toast POS natively distinguish a 'freshly baked' inventory addition from a standard manual inventory correction or return, or do we need to implement a custom macro/button interface on the POS terminal for bakers to explicitly fire the 'Fresh Batch' webhook payload?
- **Offline Queuing Behavior**: If the physical bakery location temporarily loses local internet access, how does Toast batch and dispatch webhooks once connectivity is restored? How must the middleware correctly sequence these delayed events to prevent retroactively inaccurate inventory state overrides in Shopify?
- **Bidirectional Pricing Rule Execution**: When the dynamic pricing engine applies automated discount scripts to day-old inventory via Shopify Price Rules in the final 2 hours of operation, what is the exact Toast POS Pricing API mechanism required to automatically sync this markdown in-store so walk-in customers receive the identical price without manual cashier intervention?