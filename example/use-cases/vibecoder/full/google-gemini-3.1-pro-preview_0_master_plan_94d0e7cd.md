# Index
Phase 1: Core Foundation

Phase 2: Presentation Layer

Phase 3: Proactive Engagement & Integrations

Phase 4: watchOS Companion App

Phase 5: HealthKit Integration & Launch



# Executive Summary
This Master Plan details a phased, highly structured execution roadmap for developing a unified iOS/watchOS task and nutrition tracking application. Emphasizing a zero-custom-backend architecture via Apple CloudKit and an offline-first CoreData strategy, the plan is rigidly structured to validate data concurrency, sync reliability, and API latency constraints early in the lifecycle. The five-phase rollout systematically drives toward a minimum viable product that solves 'app fatigue' with uncompromised native performance.



# Implementation Phases
**Name:** Phase 1: Core Foundation

**Objective:** Establish shared local persistence, sync engine, and external API proofs-of-concept.

**Technical context:** CoreData polymorphic schema setup, CloudKit integration, SPM modularization.

**Implementation strategy:** Build the Shared Core Functionality Framework first to decouple data layers from UI. This strictly isolates the offline-first mechanisms for testing prior to any UI dependencies.

**Milestones:**

  - **Id:** M1.1
  - **Title:** Shared Core Framework & SPM Setup
  - **Objective:** Bootstrap SPM multi-target package.
  - **Provides:** - Shared Module Infrastructure
  - **Directionality:** Foundation
  - **Requirements:** - Create Swift Package
- Configure testing targets
  - **Status:** [ ]
  - **Coverage notes:** Sets up the modular boundary ensuring UI and Watch targets remain entirely decoupled from direct database/network queries.
  - **Iteration delta:** N/A

  - **Id:** M1.2
  - **Title:** CoreData Polymorphic Schema Implementation
  - **Objective:** Build the local offline-first database for Tasks and Meals.
  - **Deps:** - M1.1
  - **Provides:** - Local DB Access
- CoreData Stack Singleton
- Polymorphic Schema
  - **Directionality:** Backend to Frontend
  - **Requirements:** - Implement Base Entity
- Implement Task/Meal inheritance
- Unit Tests for pagination/fetch speed
  - **Status:** [ ]
  - **Coverage notes:** Polymorphic models mapped directly to SQLite via xcdatamodel are critical for sub-100ms mixed timeline rendering.
  - **Iteration delta:** N/A

  - **Id:** M1.3
  - **Title:** CloudKit Synchronization & LWW Conflict Resolution
  - **Objective:** Wire CoreData to NSPersistentCloudKitContainer and configure sync resolution.
  - **Deps:** - M1.2
  - **Provides:** - Cross-device sync layer
  - **Directionality:** Backend infrastructure
  - **Requirements:** - Configure CKContainer
- Implement Timestamp LWW Logic
  - **Status:** [ ]
  - **Coverage notes:** Replaces the need for a custom REST API. Relies entirely on native Apple Serverless scaling.
  - **Iteration delta:** N/A

**Name:** Phase 2: Presentation Layer

**Objective:** Build the iOS Core UX, MVVM bindings, and Progressive Profiling onboarding.

**Technical context:** SwiftUI view layer development, integrating tightly with the Shared Core Framework.

**Implementation strategy:** Focus on sub-100ms rendering performance and seamless list virtualization utilizing SwiftUI `TimelineView` and Focus Modes.

**Milestones:**

  - **Id:** M2.1
  - **Title:** Unified Timeline Dashboard (iOS)
  - **Objective:** Develop main timeline UI merging health and tasks.
  - **Deps:** - M1.3
  - **Provides:** - Main Application Interface
  - **Directionality:** UI Implementation
  - **Requirements:** - Sub-100ms render speeds
- Implement Focus Modes
  - **Status:** [ ]
  - **Coverage notes:** Provides the 'single pane of glass' differentiator critical to combating app fatigue.
  - **Iteration delta:** N/A

**Name:** Phase 3: Proactive Engagement & Integrations

**Objective:** Connect 3rd-party food DB and implement rich push notifications.

**Technical context:** Async network integration, Notification Service Extension.

**Implementation strategy:** Implement rigorous debounce/cache for APIs and power-efficient notification payloads.

**Milestones:**

  - **Id:** M3.1
  - **Title:** 3rd-Party Food API Integration (Nutritionix)
  - **Objective:** Implement zero-friction meal logging.
  - **Deps:** - M1.1
  - **Provides:** - Nutrition data capabilities
  - **Directionality:** External Integration
  - **Requirements:** - Barcode scanner
- Predictive autocomplete
- Offline cache
  - **Status:** [ ]
  - **Coverage notes:** Strict requirement to eliminate manual data entry churn.
  - **Iteration delta:** N/A

**Name:** Phase 4: watchOS Companion App

**Objective:** Deliver a lightweight wrist experience with quick actions.

**Technical context:** watchOS SwiftUI, WatchConnectivity constraints.

**Implementation strategy:** Optimize for glanceability and strict <10KB WatchConnectivity data transfer limits.

**Milestones:**

  - **Id:** M4.1
  - **Title:** watchOS Core Interface & Sync
  - **Objective:** Release companion app capable of offline logging and immediate sync.
  - **Deps:** - M1.3
  - **Provides:** - Wearable Application
  - **Directionality:** Cross-Platform Extension
  - **Requirements:** - WatchConnectivity sync
- Complications implementation
  - **Status:** [ ]
  - **Coverage notes:** Must stay strictly under payload and thermal constraints to ensure OS does not throttle the app.
  - **Iteration delta:** N/A

**Name:** Phase 5: HealthKit Integration & Launch

**Objective:** Finalize biometrics, analytics, and prep for App Store.

**Technical context:** Apple HealthKit privacy rules, PostHog telemetry.

**Implementation strategy:** Strict ATT compliance and robust beta testing via TestFlight.

**Milestones:**

  - **Id:** M5.1
  - **Title:** HealthKit & Telemetry Rollout
  - **Objective:** Sync data with Apple Health and finalize anonymized analytics.
  - **Deps:** - M2.1
- M3.1
  - **Provides:** - Production Readiness
  - **Directionality:** Finalization
  - **Requirements:** - HealthKit read/write
- Zero PII telemetry configuration
  - **Status:** [ ]
  - **Coverage notes:** Completes the ecosystem loop by sharing parsed macro data securely with the user's local Health store.
  - **Iteration delta:** N/A



# Status Summary
**Up next:**

- M1.1

- M1.2

- M1.3



# Status Markers
**Unstarted:** [ ]

**In progress:** [🚧]

**Completed:** [✅]



# Dependency Rules
Data models and SPM foundation must complete before any UI development.

CloudKit integration must be verified before watchOS sync implementation.

3rd-Party API integration can occur parallel to UI work but must complete before HealthKit finalization.



# Generation Limits
**Max steps:** 200

**Target steps:** 120-180

**Max output lines:** 600-800



# Feature Scope
Unified Daily Agenda

Low-Friction Food Logging via 3rd-Party API

watchOS Companion App

Notification Service Extension



# Features
Chronological mixed-content timeline

Barcode and search nutrition logging

Actionable watchOS push notifications

Progressive profiling onboarding



# MVP Description
A high-performance, native iOS and watchOS application engineered to seamlessly unify task management and nutritional tracking into a single chronological timeline leveraging offline-first CoreData and CloudKit.



# Market Opportunity
Targeting holistic self-optimization users who experience app fatigue switching between disparate productivity and diet trackers. Significant willingness-to-pay for unified, friction-free premium applications.



# Competitive Analysis
Incumbents (Todoist, Things 3) lack nutrition/health integration. Incumbent health apps (MyFitnessPal) suffer bloated UX and lack agenda management. A unified, native Apple ecosystem approach strongly outmaneuvers both.



# Technical Context
Swift 5.9+, SwiftUI, CoreData (polymorphic), CloudKit, Nutritionix API, HealthKit. Strict offline-first requirement to achieve sub-100ms render targets.



# Implementation Context
Modular internal SPM structure for shared logic. High emphasis on automated UI testing via Xcode Cloud across both iOS and watchOS simulators.



# Test Framework
XCTest and Xcode Cloud parallel simulator environments (Mocked API/HealthKit/WatchConnectivity protocols).



# Component Mapping
iOS Target (UI), Watch Target (UI), SharedCore Framework (Data/Sync/Domain), API Layer (Network/Caching).



# Architecture Summary
Strictly Apple-native, completely offline-first, utilizing CoreData and CloudKit to eliminate backend costs while delivering high-speed unified timeline visualization.



# Architecture
MVVM over Offline-First CoreData with CloudKit Sync



# Services
Apple CloudKit

Apple HealthKit

Nutritionix API

Apple UserNotifications



# Components
iOS SwiftUI App

watchOS SwiftUI App

SharedCore Package

NotificationService Extension



# Integration Points
Nutritionix (Food Database)

HealthKit (Biometrics/Calorie Log)

PostHog/Firebase (Analytics)



# Dependency Resolution
3rd-Party API is an MVP requirement.

Network layers masked via protocols for stable CI/CD test injection.



# Frontend Stack
**Ios:** SwiftUI, Swift 5.9+

**Watchos:** SwiftUI, WidgetKit



# Backend Stack
**Database:** CloudKit

**Infrastructure:** Apple Serverless

**Custom services:** None



# Data Platform
**Local storage:** CoreData Polymorphic

**Conflict resolution:** LWW Timestamp pseudo-CRDT

**Health data:** HealthKit



# DevOps Tooling
**Ci cd:** Xcode Cloud

**Beta distribution:** TestFlight



# Security Tooling
**Telemetry scrubbing:** Custom Interceptor

**Encryption:** CloudKit E2EE



# Shared Libraries
SharedCore (Internal SPM)



# Third Party Services
Nutritionix/FatSecret

PostHog/Firebase