    # Index
    Pipeline Context

Executive Summary

Selection Criteria

Shared Infrastructure

Milestones & Architectural Work Nodes

Iteration Semantics
    

    
    # Executive Summary
    The Milestone Schema outlines the granular execution nodes for Phase 1: Core Foundation. By enforcing a strict dependency frontier, this schema isolates foundational data operations—specifically CoreData polymorphism and CloudKit synchronization logic—within a highly modular Shared SPM framework. This strictly enforces the architectural rule that local state mapping, fetch performance thresholds (<100ms), and deterministic conflict resolution algorithms (Last-Write-Wins CRDT logic) must be validated and structurally complete prior to the introduction of any UI or wearable presentation layers.
    

    
    # Pipeline Context
    The Milestone Schema document acts as the middle-zoom architectural blueprint, bridging the high-level 'WHAT' defined in the Master Plan with the hyper-granular 'HOW' required by the Actionable Checklist. It decomposes the immediate dependency-frontier milestones into bounded architectural work nodes, specifically mapping capabilities to code paths, modules, and roles. This ensures every piece of the offline-first native system is isolated, rigorously integrated, and validated according to the dependency constraints before UI or wearable layer development commences.
    

    
    # Selection Criteria
    dependency frontier: Only milestones whose dependencies are completely satisfied [✅] or actively slated in the current iteration batch. The current batch encompasses Phase 1 (M1.1, M1.2, M1.3), forming the foundational local persistence and synchronization layers required before transitioning to the UI/UX presentation layer.
    

    
    # Shared Infrastructure
    Shared Core SPM Package (Cross-cutting abstraction for Data, Network, and Models)

Xcode Cloud Workflows (CI/CD pipeline targeting both iOS and watchOS simulators)

XCTest Mocking Framework (Shared stubs for CloudKit, HealthKit, and Nutritionix APIs)

TestFlight Beta Pipelines (Automated RC distribution upon successful PR merges)
    

    
    # Milestones
    **Id:** M1.1

**Title:** Shared Core Framework & SPM Setup

**Status:** [ ]

**Objective:** Bootstrap the multi-target Swift Package Manager (SPM) architecture to securely isolate the application's domain, data, and sync logic from the presentation targets.

**Nodes:**

  - **Path:** Packages/SharedCore/Package.swift
  - **Title:** Initialize SPM Package Structure
  - **Objective:** Scaffold the multi-target Swift Package with distinct bounds for data layers, domain models, network adapters, and connectivity logic.
  - **Role:** Foundation
  - **Module:** SharedCore
  - **Provides:** - SPM Framework Skeleton
- Target Definitions (DataLayer, SyncEngine, APIClient, DomainModels, Connectivity)
  - **Directionality:** Setup
  - **Requirements:** - Valid Swift 5.9 Package.swift file.
- Strict separation of internal target dependencies.
- Integration of Swift concurrency flags.

  - **Path:** Packages/SharedCore/Tests
  - **Title:** Testing Infrastructure & Mock Protocols Setup
  - **Objective:** Establish a robust, protocol-oriented unit testing environment capable of simulating complex offline-first operations without hitting live system APIs.
  - **Role:** Quality Assurance
  - **Module:** SharedCore.Tests
  - **Deps:** - Initialize SPM Package Structure
  - **Provides:** - XCTest Target Infrastructure
- Hardware/Network Mocking Protocols
  - **Directionality:** Foundation to Testing
  - **Requirements:** - Create base XCTestCase classes.
- Implement protocol stubs for external dependencies (e.g., MockHealthStore, MockURLProtocol).

**Id:** M1.2

**Title:** CoreData Polymorphic Schema Implementation

**Status:** [ ]

**Objective:** Build the local offline-first database for Tasks and Meals to satisfy sub-100ms mixed timeline rendering constraints.

**Nodes:**

  - **Path:** Packages/SharedCore/Sources/DataLayer/Schema.xcdatamodeld
  - **Title:** Define CoreData Data Model Schema
  - **Objective:** Visually and programmatically configure the core SQLite schema mapped with a base TimelineEntity and polymorphic inheritance for TaskItem and MealItem.
  - **Role:** Database Schema
  - **Module:** SharedCore.DataLayer
  - **Deps:** - Initialize SPM Package Structure
  - **Provides:** - Compiled .xcdatamodeld
- Polymorphic Entity Definitions
  - **Directionality:** Data Implementation
  - **Requirements:** - Create abstract TimelineEntity with attributes: id (UUID), timestamp (Date), entityType (Int16), lastModified (Date).
- Implement TaskItem and MealItem child entities with unique fields.
- Apply index constraints on timestamp_index and lastModified_index.

  - **Path:** Packages/SharedCore/Sources/DataLayer/PersistenceController.swift
  - **Title:** Implement Thread-Safe Persistence Controller
  - **Objective:** Build the persistent container singleton responsible for managing read/write contexts, view threading, and aggressively optimized batch-faulting.
  - **Role:** Database Controller
  - **Module:** SharedCore.DataLayer
  - **Deps:** - Define CoreData Data Model Schema
  - **Provides:** - CoreData Stack Singleton
- Context Threading Management
  - **Directionality:** Infrastructure Setup
  - **Requirements:** - NSPersistentContainer initialization targeting in-memory (for tests) and SQLite (for prod).
- Automated configuration of viewContext.automaticallyMergesChangesFromParent.
- Application of fetch limit and pagination parameters.

**Id:** M1.3

**Title:** CloudKit Synchronization & LWW Conflict Resolution

**Status:** [ ]

**Objective:** Wire the local CoreData stack to Apple CloudKit to deliver seamless E2E encrypted multi-device state synchronization with deterministic conflict resolution.

**Nodes:**

  - **Path:** App/App.entitlements
  - **Title:** System Capabilities & App Entitlements
  - **Objective:** Register the necessary App Store Connect iCloud container identifier and ensure the target has correct push capabilities for silent synchronization.
  - **Role:** System Configuration
  - **Module:** App Target
  - **Deps:** - Implement Thread-Safe Persistence Controller
  - **Provides:** - iCloud Container Access
- Remote Notifications Background Mode
  - **Directionality:** Cloud Infrastructure
  - **Requirements:** - Enable iCloud capability and check 'CloudKit'.
- Enable Push Notifications and Background Modes (Remote Notifications).

  - **Path:** Packages/SharedCore/Sources/SyncEngine/CloudKitManager.swift
  - **Title:** NSPersistentCloudKitContainer Integration
  - **Objective:** Upgrade the standard CoreData container to a CloudKit-backed container to enable automatic background mapping to remote databases.
  - **Role:** Synchronization Layer
  - **Module:** SharedCore.SyncEngine
  - **Deps:** - System Capabilities & App Entitlements
- Implement Thread-Safe Persistence Controller
  - **Provides:** - Background Cloud Sync Engine
- Automated Remote State Mapping
  - **Directionality:** Local to Cloud Integration
  - **Requirements:** - Replace NSPersistentContainer with NSPersistentCloudKitContainer.
- Configure NSPersistentStoreDescription to point to the correct CKContainer identifier.

  - **Path:** Packages/SharedCore/Sources/SyncEngine/MergePolicy.swift
  - **Title:** Timestamp-Based LWW Pseudo-CRDT Logic
  - **Objective:** Implement deterministic logic ensuring multi-device offline edit merging resolves safely and favors the most chronologically recent change.
  - **Role:** State Reconciliation
  - **Module:** SharedCore.SyncEngine
  - **Deps:** - NSPersistentCloudKitContainer Integration
  - **Provides:** - Conflict Resolution Policy
- Offline Merge Safety
  - **Directionality:** Sync Logic
  - **Requirements:** - Subclass NSMergePolicy.
- Override resolution methods to compare the lastModified timestamp of conflicting TimelineEntity instances.
- Write automated XCTest covering simulated conflicting multi-device states.
    

    
    # Iteration Semantics
    replace, don't extend; reference prior schema for continuity. This document entirely replaces the previous milestone schema state, honing strictly in on the active dependency frontier to ensure deep focus on Phase 1 deliverables before proceeding.