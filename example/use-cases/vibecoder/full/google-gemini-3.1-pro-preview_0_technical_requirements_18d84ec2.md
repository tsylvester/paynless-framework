# Index
Executive Summary

Architecture Overview

Subsystems

APIs & External Services

Schemas & Data Models

Proposed File Tree

Alignment & Metrics

Technology Stack



# Executive Summary
This technical requirements document outlines the architectural blueprint for an offline-first iOS and watchOS application that merges task management with dietary tracking. Standardizing on Swift 5.9, SwiftUI, CoreData, and Apple CloudKit completely removes the requirement for custom backend server infrastructure. A 3rd-party nutrition API guarantees instantaneous food logging, while WatchConnectivity constraints (<10KB payloads) and strict UI rendering speeds (<100ms) secure maximum user retention and engagement.



# Subsystems
**Name:** Local Persistence Engine

**Objective:** Maintain an offline-first absolute source of truth with sub-100ms fetch performance.

**Implementation notes:** Utilizes a heavily indexed polymorphic CoreData schema mapped with strict pagination and batch-faulting to guarantee sub-100ms rendering speeds regardless of database size.

**Name:** Synchronization Engine

**Objective:** Provide seamless E2E encrypted multi-device state sync without a custom backend.

**Implementation notes:** Leverages NSPersistentCloudKitContainer alongside a custom Last-Write-Wins (LWW) timestamp pseudo-CRDT logic to mathematically resolve concurrent cross-device edits without throwing merge exceptions.

**Name:** Food Database Integration

**Objective:** Enable zero-friction meal logging to drastically reduce data entry churn.

**Implementation notes:** Implemented as an asynchronous REST client interacting with a 3rd-party API (Nutritionix/FatSecret). Includes robust local SQLite/CoreData caching layers and aggressive debounce logic for network queries.

**Name:** Proactive Engagement Subsystem

**Objective:** Deliver context-aware, actionable alerts to drive behavioral habit retention.

**Implementation notes:** Utilizes UserNotifications and a dedicated Notification Service Extension to intercept and render rich SwiftUI interfaces directly within push payloads.

**Name:** Wearable Connectivity Subsystem

**Objective:** Extend core functionalities directly to the user's wrist with strict thermal and bandwidth optimizations.

**Implementation notes:** Employs WatchConnectivity with tightly controlled payload models. Operations are guaranteed to remain strictly <10KB to prevent watchOS thermal throttling and ensure lightning-fast state transitions.



# APIs
**Name:** 3rd-Party Nutrition API (Nutritionix/FatSecret)

**Description:** Provides instant, crowdsourced macro-nutritional data via barcode scan or text search to eliminate manual data entry friction.

**Contracts:**

- GET /search

- GET /barcode

**Name:** Apple HealthKit

**Description:** A highly secure, privacy-compliant, on-device data store for reading active energy and writing native nutritional macros natively.

**Contracts:**

- HKHealthStore.requestAuthorization

- HKHealthStore.save

- HKHealthStore.execute

**Name:** Apple CloudKit API

**Description:** Enterprise-grade synchronization infrastructure facilitating seamless state updates across the user's hardware ecosystem.

**Contracts:**

- NSPersistentCloudKitContainer.sync

- CKContainer.accountStatus



# Database Schemas
**Name:** TimelineEntity (CoreData)

**Columns:**

- id (UUID)

- timestamp (Date)

- entityType (Int16)

- isCompleted (Bool)

- lastModified (Date)

**Indexes:**

- timestamp_index

- type_index

- lastModified_index

**Name:** Apple CloudKit Sync Schema

**Columns:**

- recordName (String)

- recordChangeTag (String)

- encodedSystemFields (Data)

**Indexes:**

- recordName_index

**Name:** Local API Caching Schema

**Columns:**

- barcode_id (String)

- query_text (String)

- json_payload (Data)

- cache_expiry (Date)

**Indexes:**

- barcode_id_index

- query_text_index



# Proposed File Tree
```
├── App (iOS Main Target)
│   ├── Application
│   ├── Presentation (SwiftUI/MVVM)
│   └── Resources
├── WatchApp (watchOS Target)
│   ├── Application
│   ├── Presentation
│   └── Complications
├── NotificationExtension
│   └── NotificationService.swift
└── Packages (SPM)
    └── SharedCore
        ├── Sources
        │   ├── DataLayer (CoreData)
        │   ├── SyncEngine (CloudKit)
        │   ├── APIClient (Network/Cache)
        │   ├── DomainModels
        │   └── Connectivity (WatchConnectivity)
        └── Tests
```



# Architecture Overview
A strictly Apple-native ecosystem design leveraging SwiftUI, MVVM patterns, CoreData, and Apple CloudKit to provide a completely offline-first, highly performant unified timeline. Eliminates all custom backend server costs. Employs async network calls for 3rd-party food data and WatchConnectivity for wearable state.



# Delta Summary
Initial technical requirements baseline focusing on Apple ecosystem optimization. Standardized architectural decisions map cleanly to the zero-backend constraint by formalizing offline-first local state resolution (CoreData + LWW CRDTs) paired with asynchronous external integrations (Nutritionix API).



# Iteration Notes
Focus firmly on offline-first constraints and performance guardrails. The architecture completely eschews a custom backend, relying instead on CloudKit for sync and a 3rd-party API for food data. Must ensure strict adherence to sub-100ms UI rendering and <10KB WatchConnectivity payload limits throughout documentation.



# Feature Scope
Unified Daily Agenda

Low-Friction Food Logging via 3rd-Party API

watchOS Companion App & Proactive Alerts

Progressive Profiling Onboarding



# Feasibility Insights
Unified agenda requires heavily indexed polymorphic CoreData queries.

Food logging mandates robust timeout protocols and extensive offline caching.

watchOS app requires strict <10KB payloads to avoid thermal throttling.



# Non-Functional Alignment
UI rendering strictly < 100ms.

Offline-First operability.

WatchConnectivity payloads strictly < 10KB.

System-wide sync failure rate < 2%.



# Outcome Alignment
Technical KPIs map directly to behavioral retention. Ensuring sub-100ms UI rendering and zero-friction food logging directly lowers the funnel drop-off rate, removing the fundamental friction of usage and directly supporting the North Star Metric of >40% DAE.



# North Star Metric
Daily Actionable Engagement (DAE) > 40%



# Primary KPIs
Retention Rates (Day 1 > 40%, Day 7 > 20%, Day 30 > 10%)

Average Meals Logged per User per Day (> 2.5)

Task Completion to Creation Ratio (> 60%)



# Guardrails
Notification Unsubscribe Rate strictly < 5%

App Crash Rate strictly > 99.9%

Watch Sync Failure Rate strictly < 2%

API Timeout and Latency Rate strictly < 1%



# Measurement Plan
Privacy-preserving anonymous telemetry (PostHog/Firebase Analytics) capturing synthesized funnel events stripped of PII, working in parallel with native Apple App Analytics to measure conversion paths and engagement without violating strict user privacy tenets.



# Architecture Summary
The application deploys a strictly Apple-native ecosystem design. Combining sub-100ms local reactivity with asynchronous cloud synchronization and a 3rd-party integration for instant food logging, eliminating backend server costs.



# Architecture
Offline-First Native MVVM leveraging Apple CoreData and CloudKit



# Services
Apple CloudKit (NSPersistentCloudKitContainer)

Apple HealthKit

UserNotifications & WidgetKit

3rd-Party Food Data Provider (Nutritionix/FatSecret)



# Components
iOS Main App (SwiftUI)

watchOS Companion App (SwiftUI)

Notification Service Extension

Shared Core Functionality Framework (SPM)

3rd-Party Food API Integration Layer



# Data Flows
Local UI <-> ViewModel <-> CoreData (Local Source of Truth)

CoreData <-> NSPersistentCloudKitContainer <-> Apple CloudKit (Sync)

iOS Shared Core <-> WatchConnectivity (<10KB Payloads) <-> watchOS Shared Core

API Integration Layer <-> HTTPS <-> 3rd-Party Nutrition API



# Interfaces
SwiftUI Views to ViewModels (Combine/Async-Await)

ViewModels to Shared Core Data Managers

Shared Core Framework to HealthKit/CloudKit SDKs



# Integration Points
Nutritionix/FatSecret REST API (Food database)

Apple HealthKit (Biometrics and calorie burning)

PostHog/Firebase Analytics (Anonymous telemetry via SDK)



# Dependency Resolution
3rd-Party Food Database API is a strict blocking dependency.

Protocol Abstractions for Testing hardware-dependent system frameworks.



# Security Measures
CloudKit Data Protection E2E encryption.

Telemetry Sanitization custom middleware.

Encrypted Configurations via Apple Keychain.



# Observability Strategy
Dual-Layer Analytics (Apple App Analytics + PostHog/Firebase).

Performance Threshold Monitoring (API latencies, crash rates < 0.1%).



# Scalability Plan
Local Data Pagination via CoreData batch-faulting.

Backend Serverless Scaling handled inherently by Apple CloudKit.

API Volume Provisioning negotiated upfront.



# Resilience Strategy
Offline-First Operability guarantees continuous local use.

Graceful Feature Degradation for failed API/HealthKit permissions.



# Frontend Stack
**Ios:** SwiftUI, Swift 5.9+, Combine/Async-Await

**Watchos:** SwiftUI, WidgetKit

**Extensions:** Notification Service Extension, WidgetKit Extensions



# Backend Stack
**Database:** CloudKit (NSPersistentCloudKitContainer)

**Infrastructure:** Apple Serverless / Managed CloudKit Environment

**Custom services:** None (Strategic decision)



# Data Platform
**Local storage:** CoreData with heavily indexed polymorphic schemas

**Conflict resolution:** Timestamp-based LWW Pseudo-CRDT

**Health data:** Apple HealthKit



# DevOps Tooling
**Ci cd:** Xcode Cloud

**Beta distribution:** Apple TestFlight

**Version control:** Git / GitHub



# Security Tooling
**Telemetry scrubbing:** Custom Privacy Interceptors

**Encryption:** Native iOS Data Protection / CloudKit E2EE



# Shared Libraries
Shared Core Functionality Framework (Internal SPM)

Mocking Frameworks for Xcode Cloud Automated Testing



# Third Party Services
Nutritionix or FatSecret (Food Database API)

PostHog or Firebase (Anonymous Funnel Telemetry)