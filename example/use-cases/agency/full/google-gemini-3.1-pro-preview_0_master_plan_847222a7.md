# Index
Executive Summary

MVP Description

Market Opportunity

Competitive Analysis

Dependency Rules

Phases and Milestones

Architecture Summary

Architecture

Technical Context

Implementation Context

Test Framework

Component Mapping

Technology Stacks



# Executive Summary
The Master Plan details the phased execution strategy to construct a hyper-connected local bakery digital experience. Emphasizing rigid sequential dependencies starting with critical API acquisition (Phase 0), the plan provisions for a managed iPaaS core (Phase 1), high-performance headless presentation (Phase 2), and advanced revenue-generating automations (Phase 3). This roadmap prioritizes risk mitigation, TCO reduction, and absolute physical-to-digital parity.



# Implementation Phases
**Name:** Phase 0: Go/No-Go API Approval

**Objective:** Secure Toast Partner API credentials.

**Technical context:** Toast API ecosystem is highly restrictive; requires single-location merchant access.

**Implementation strategy:** Submit application and validate sandbox access. This phase mitigates the highest operational risk early.

**Milestones:**

  - **Id:** m0.1
  - **Title:** Acquire Toast API Partner Access
  - **Objective:** Obtain necessary API keys and webhook capabilities.
  - **Provides:** - Toast API Keys
- Sandbox Access
  - **Directionality:** Foundational external dependency.
  - **Requirements:** - Approved Toast Partner status
- Webhook endpoint documentation access
  - **Status:** [ ]
  - **Coverage notes:** Addresses the primary Go/No-Go API blocker identified in technical feasibility assessments.
  - **Iteration delta:** N/A

**Name:** Phase 1: iPaaS Core Integration

**Objective:** Establish fundamental real-time inventory synchronization.

**Technical context:** Replaces custom AWS architecture with Make.com/Celigo for a strict <60s SLA to maintain data parity.

**Implementation strategy:** Map payloads, build DLQs, and implement baseline inventory deduction webhooks. Eliminating custom AWS Lambdas for low-code iPaaS.

**Milestones:**

  - **Id:** m1.1
  - **Title:** Deploy iPaaS Webhook Listeners
  - **Objective:** Receive and log physical Toast POS payloads.
  - **Deps:** - m0.1
  - **Provides:** - iPaaS Ingestion Layer
- DLQ Infrastructure
  - **Directionality:** Data ingestion bridge.
  - **Requirements:** - Secure OAuth connections
- HMAC signature validation
  - **Status:** [ ]
  - **Coverage notes:** Creates the primary ingress route for all POS ledger updates into the digital ecosystem.
  - **Iteration delta:** N/A

**Name:** Phase 2: Headless Presentation Layer

**Objective:** Launch the customer-facing WP storefront connected to Shopify.

**Technical context:** Decoupled Next.js/React consuming Shopify Storefront API and WP REST.

**Implementation strategy:** Build responsive UI components and configure edge caching to absorb traffic spikes via CDN.

**Milestones:**

  - **Id:** m2.1
  - **Title:** Headless WP & Shopify Cart Integration
  - **Objective:** Render catalog and process checkouts.
  - **Deps:** - m1.1
  - **Provides:** - Customer UI
- Live Storefront
  - **Directionality:** User-facing deployment.
  - **Requirements:** - LCP < 2.5s
- Successful E2E digital order testing
  - **Status:** [ ]
  - **Coverage notes:** Implements stale-while-revalidate strategy to maintain frontend resilience.
  - **Iteration delta:** N/A

**Name:** Phase 3: Omnichannel Automations

**Objective:** Activate dynamic pricing markdowns and fresh batch alerts.

**Technical context:** Synchronous dual-writes and ESP integration requiring complex timing and dependencies.

**Implementation strategy:** Build complex iPaaS scheduler logic and map POS macros to Klaviyo for high-conversion automated campaigns.

**Milestones:**

  - **Id:** m3.1
  - **Title:** Dynamic Pricing & ESP Trigger Rollout
  - **Objective:** Automate markdown chronologies and Klaviyo campaigns.
  - **Deps:** - m2.1
  - **Provides:** - Pricing Scheduler
- Klaviyo Broadcast Automation
  - **Directionality:** Business logic enhancement.
  - **Requirements:** - Simultaneous Toast/Shopify price parity
- Sub-5 minute email dispatch SLA
  - **Status:** [ ]
  - **Coverage notes:** Final integration of value-added business workflows utilizing the verified data pipelines.
  - **Iteration delta:** N/A



# Status Summary
**Up next:**

- m0.1



# Status Markers
**Unstarted:** [ ]

**In progress:** [🚧]

**Completed:** [✅]



# Dependency Rules
No development starts until Phase 0 (Toast API Approval) is strictly complete.

Linear progression mandated by Phase 0 blocker.

iPaaS core inventory synchronization must be validated before Dynamic Pricing automations are deployed.

API mappings must be validated against DLQs before pushing to Phase 2.

Headless WordPress must be connected to Shopify Storefront API before Klaviyo marketing flows are activated.



# Generation Limits
**Max steps:** 200

**Target steps:** 120-180

**Max output lines:** 600-800



# Feature Scope
Real-Time POS-to-Ecom Sync

Fresh Batch Automations

Dynamic Pricing Markdowns



# Features
Inventory parity via push webhooks

Automated marketing triggers

Chronological pricing discount rules



# MVP Description
A hyper-connected digital storefront utilizing a headless WordPress frontend and Shopify commerce engine, synchronized with physical Toast POS via an iPaaS middleware to deliver real-time stock, markdowns, and notifications.



# Market Opportunity
Capturing intent-driven local demand by providing pre-transit inventory availability, bypassing 3rd-party aggregators.



# Competitive Analysis
Replaces static brochure-ware sites with enterprise-grade real-time inventory responsiveness.



# Technical Context
Pivots away from heavy AWS infrastructure to utilize low-code/managed iPaaS middleware. By minimizing custom infrastructure, the integration centers heavily on managed iPaaS (Make.com/Celigo) replacing custom AWS components to keep TCO low. Iterative execution will be driven by a strict dependency graph.



# Implementation Context
Heavily reliant on managed vendor ecosystems (Toast, Make.com, Shopify, WP Engine) reducing internal DevOps overhead. Edge Caching is utilized for frontend resilience, and Dead Letter Queues (DLQs) are heavily leveraged for ISP drop mitigation.



# Test Framework
End-to-end payload validation via iPaaS DLQ telemetry and UI performance testing via Lighthouse.



# Component Mapping
Toast (Source) -> iPaaS (Router) -> Shopify (Destination/Engine) -> WP (Presentation).



# Architecture Summary
Hub-and-spoke iPaaS middleware routing physical POS data to digital platforms. Highly resilient ecosystem utilizing a managed iPaaS to connect Toast POS physical data with Shopify digital state, served by a performant Headless WordPress front-end.



# Architecture
An event-driven, hybrid microservices architecture orchestrated via a managed iPaaS hub-and-spoke model. Toast POS acts as the physical system of record, pushing webhooks to the iPaaS, which updates Shopify as the digital commerce engine. A Headless WordPress frontend consumes Shopify APIs for UI rendering.



# Services
Toast POS

Shopify Storefront

Make.com / Celigo

WP Engine Hosted CMS

Klaviyo ESP



# Components
Webhook Listeners

Edge Cache

GraphQL Adapters

DLQ Managers



# Integration Points
Toast Webhooks -> iPaaS -> Shopify GraphQL

Toast POS Macros -> iPaaS -> Klaviyo API



# Dependency Resolution
Phase 0 strictly resolves Toast API uncertainty.

iPaaS resolves custom DevOps requirement.

Elimination of Custom AWS Infrastructure in favor of low-code iPaaS.

Shifting SLA accountability to SaaS vendors.



# Frontend Stack
**Layer:** Headless WordPress / Next.js

**Caching:** Edge Stale-While-Revalidate



# Backend Stack
**Engine:** Shopify API



# Data Platform
**Ledger:** Toast POS



# DevOps Tooling
**Type:** Managed SaaS deployments



# Security Tooling
**Waf:** CDN Level (Cloudflare)



# Shared Libraries
Vendor SDKs



# Third Party Services
Toast

Shopify

Make.com

Klaviyo