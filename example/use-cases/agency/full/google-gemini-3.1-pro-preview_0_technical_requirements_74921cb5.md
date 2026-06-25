# Index
Executive Summary

Architecture

Subsystems

APIs & Schemas

Data Flows & Integration

Operational & Non-Functional Requirements

Technical Stacks



# Executive Summary
This Technical Requirements Document establishes the specifications for a hyper-connected bakery ecosystem. It defines the use of an iPaaS middleware to seamlessly synchronize physical Toast POS inventory and pricing rules with a Shopify commerce engine and a decoupled Headless WordPress presentation layer. By strictly minimizing custom infrastructure, it guarantees highly maintainable, sub-60-second real-time omnichannel parity, reduces food waste, and captures intent-driven local demand through real-time notifications.



# Subsystems
**Name:** iPaaS Middleware (Make.com/Celigo)

**Objective:** Handle secure webhook ingestion, translation, scheduling, rate-limit management, and offline DLQ processing.

**Implementation notes:** Visual payload mapping replacing AWS Lambdas. Must configure native DLQs for offline fallback.

**Name:** Headless WordPress Frontend

**Objective:** Provide high-performance, decoupled UI ensuring < 2.5s LCP during traffic spikes.

**Implementation notes:** Hosted on WP Engine/Kinsta with Cloudflare Edge caching; stale-while-revalidate strategy.

**Name:** Shopify Commerce Engine

**Objective:** Central digital system of record for E-commerce state, checkout processing, and customer data.

**Implementation notes:** Utilizes GraphQL Storefront API for the UI and Admin API for iPaaS writes.



# APIs
**Name:** Toast Partner Webhook

**Description:** Emits physical ledger state changes and POS events.

**Contracts:**

- Inventory Update

- Fresh Batch Custom Macro

**Name:** Shopify Admin GraphQL

**Description:** Secured backend operations for inventory and pricing sync.

**Contracts:**

- InventorySet

- PriceRuleCreate



# Database Schemas
**Name:** ToastWebhook_Inventory

**Columns:**

- item_id

- sku

- quantity_available

- timestamp

- location_id

**Indexes:**

- sku

- location_id

**Rls:**

- Authenticated Webhook via HMAC



# Proposed File Tree
```
```text
frontend/
  ├── app/
  ├── components/
  ├── lib/
  │   ├── shopify/
  │   └── wordpress/
  └── public/
middleware_exports/
  ├── make_blueprints/
```
```



# Architecture Overview
An event-driven, hybrid microservices architecture orchestrated via a managed iPaaS hub-and-spoke model. Toast POS acts as the physical system of record, pushing webhooks to the iPaaS, which validates and maps them to Shopify as the digital commerce engine. A Headless WordPress frontend acts as the decoupled presentation layer consuming Shopify APIs for UI rendering.



# Delta Summary
Initial baseline technical requirements creation. Pivots away from heavy AWS custom infrastructure to utilize low-code/managed iPaaS middleware.



# Iteration Notes
First iteration. Overview of formalization scope: Transform the omnichannel bakery architecture into a persistent, actionable Master Plan. The integration centers heavily on managed iPaaS (Make.com/Celigo) replacing custom AWS components to keep TCO low. Iterative execution will be driven by a strict dependency graph: Phase 0 MUST clear Toast API hurdles before any further platform work.



# Feature Scope
Real-Time POS-to-Ecom Inventory Sync

Automated Pricing Guidance Engine

Fresh Batch Automated Email Alerts



# Feasibility Insights
Pivoting to iPaaS solves the major TCO feasibility block from the AWS critique.

Strict chronological payload processing is essential for accurate real-time inventory.

Automated pricing requires complex synchronous dual-writes to both Toast and Shopify.



# Non-Functional Alignment
E2E sync latency < 60 seconds

LCP < 2.5s via Headless WP edge caching

iPaaS error rate < 0.1%



# Outcome Alignment
Aligns the technical architecture with the core business requirement of maximizing sell-through rates and limiting TCO without internal DevOps. By integrating a managed iPaaS layer, we fulfill the architectural needs for reliable event routing without compounding operational technical debt.



# North Star Metric
Daily Sell-Through Rate (>95% of perishable inventory sold by end-of-day)



# Primary KPIs
Omnichannel Order Volume Growth (>20% YoY)

Inventory Synchronization Accuracy Rate (>99%)

Automated Campaign Conversion Rate (>10% within 2 hours)

Total Cost of Ownership (<10 billable hours/month)



# Guardrails
iPaaS Integration Error Rate must remain < 0.1%

LCP on WordPress frontend strictly < 2.5s

API limits must not exceed 80% capacity



# Measurement Plan
System health and technical goals will be measured via a combination of platform-native tools and analytics layers. **GA4** cross-domain E-commerce tracking will measure checkout flow and conversion drops. **iPaaS native telemetry** is used to monitor Dead Letter Queues (DLQs), webhook consumption rates, and 429 API limit thresholds. **Klaviyo** provides native reporting for ESP marketing ROI. All data pipelines funnel into a unified **Looker Studio** visualization dashboard.



# Architecture Summary
A highly resilient ecosystem utilizing a managed iPaaS to connect Toast POS physical data with Shopify digital state, served by a performant Headless WordPress front-end.



# Architecture
Event-driven, hybrid microservices architecture orchestrated via a managed iPaaS hub-and-spoke model. The architecture natively bypasses strict SaaS API rate limits and fully isolates the frontend performance layer from backend compute logic.



# Services
WP Engine / Kinsta Managed Hosting

Shopify Admin API

Toast POS Ledger Data Source

Make.com / Celigo Engine

Klaviyo



# Components
Edge Cache / CDN

iPaaS Dead Letter Queue (DLQ) Module

iPaaS Chronological Schedulers

Shopify Cart Engine



# Data Flows
Physical Transaction -> Toast Ledger -> Toast Webhook -> iPaaS Validation -> Shopify Admin API -> Shopify Inventory -> Headless Frontend

Toast POS Fresh Batch Macro -> Toast Webhook -> iPaaS Routing -> Klaviyo REST API -> Customer Alert

iPaaS Time Scheduler -> iPaaS Pricing Calculation -> Shopify Price Rules & Toast Discount API Updates



# Interfaces
Toast Partner Webhooks

Shopify Admin GraphQL

Shopify Storefront GraphQL

Klaviyo REST API

WordPress REST / GraphQL



# Integration Points
Toast POS Base Pricing to Shopify Variant Pricing

Toast Inventory Count to Shopify Location Inventory

Toast POS Custom Macros to Klaviyo Triggers



# Dependency Resolution
Elimination of Custom AWS Infrastructure in favor of low-code iPaaS.

Toast Partner API Blocker requires Phase 0 verification.

Shifting SLA accountability to SaaS vendors.



# Security Measures
Payload Validation and HMAC Signatures

Strict Execution Scoping (Least Privilege API tokens)

Automated Privacy Compliance via Klaviyo/Shopify suppression lists



# Observability Strategy
Native iPaaS Monitoring for DLQs and limits

End-to-End Commerce Tracking via GA4

Automated Slack/SMS Operational Alerting for dropped payloads



# Scalability Plan
Frontend Decoupling to absorb traffic spikes via CDN

Asynchronous Webhook Buffering via iPaaS to respect Shopify API limits



# Resilience Strategy
Local Offline POS Queuing on Toast hardware

Sequential Payload Dequeuing in iPaaS upon ISP restoration

Graceful UI Degradation using Stale-While-Revalidate caching



# Frontend Stack
**Framework:** Headless WordPress / React (Next.js)

**Hosting:** WP Engine / Kinsta

**Performance layer:** Cloudflare / CDN Edge Caching



# Backend Stack
**Commerce engine:** Shopify

**Integration layer:** Make.com or Celigo



# Data Platform
**System of record:** Toast POS Cloud Ledger

**Customer data:** Shopify / Klaviyo



# DevOps Tooling
**Infrastructure:** Vendor-managed SaaS (No custom IaC)

**Version control:** Git / GitHub

**Ci cd:** Managed platform native deployment hooks



# Security Tooling
**Waf:** Cloudflare Edge WAF

**Auth:** Strictly scoped OAuth 2.0 / Generated API Tokens



# Shared Libraries
Shopify Storefront API SDK

Toast POS Partner API SDK



# Third Party Services
Make.com / Celigo

Klaviyo

Toast POS

Shopify