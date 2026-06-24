# Index
Phase 0: Technical Audit (SSG)

Phase 1: Turborepo Migration

Phase 2: Platform Abstraction Layer

Phase 3: Tauri Desktop & SQLite integration

Phase 4: Zod Boundaries

Phase 5: CI/CD EV Signing

System Architecture Summary

Dependency Rules & Tooling



# Executive Summary
This Master Plan orchestrates the strategic expansion of our Next.js web application into a robust, zero-trust Tauri Windows desktop client. Through a meticulously phased implementation starting with a mandatory Static Export (SSG) feasibility audit, the plan ensures risk mitigation while establishing a Turborepo foundation to retain >85% code reuse. It structures the delivery of critical compliance features—including a native Rust file processing engine, SQLite offline synchronization, and immutable Zod network validation—to seamlessly unlock a highly lucrative $450M enterprise market.



# Implementation Phases
**Name:** Phase 0: Technical Audit (SSG)

**Objective:** Prove Next.js static export viability

**Technical context:** Next.js SSR components must be eliminated or mocked to support output: 'export', as Tauri rigidly requires a static web bundle.

**Implementation strategy:** Run strict technical audits and aggressively convert core UI functionality to pure client-side React + static props. Refactor away from direct Server Components.

**Milestones:**

  - **Id:** M0.1
  - **Title:** Next.js Static Export Feasibility Proof
  - **Status:** [🚧]
  - **Objective:** Successfully build the core app using output: 'export' without losing core functionality.
  - **Provides:** - SSG Build Capability
- Static HTML Output
  - **Directionality:** Foundational Phase
  - **Requirements:** - Remove SSR dependencies
- Mock dynamic server features
- Remove next/image default loader
- Strip getServerSideProps
  - **Iteration delta:** Transitioned to In Progress [🚧] to execute mandatory gating technical audit.

**Name:** Phase 1: Turborepo Migration

**Objective:** Restructure repositories into a unified workspace

**Technical context:** A Monorepo enables codebase sharing >85%, orchestrating standard cloud deployments and the native Tauri wrapper cleanly.

**Implementation strategy:** Initialize Turborepo, move existing codebase to packages/core, and scaffold apps/web and apps/desktop targets.

**Milestones:**

  - **Id:** M1.1
  - **Title:** Turborepo Scaffolding
  - **Status:** [ ]
  - **Objective:** Initialize the Turborepo and move shared logic.
  - **Deps:** - M0.1
  - **Provides:** - Unified Workspace
- Monorepo Orchestration
  - **Directionality:** Architectural Foundation
  - **Requirements:** - Configure root package.json
- Set up shared ESLint/TSConfig
- Migrate core logic to packages/core
  - **Iteration delta:** Remains unstarted pending completion of M0.1 dependencies.

**Name:** Phase 2: Platform Abstraction Layer

**Objective:** Implement React Context DI across shared UI

**Technical context:** Next.js and Tauri environments require distinctly different I/O implementations; a Dependency Injection layer is necessary to safely route operations without UI bundle bloat.

**Implementation strategy:** Create a unified `IPlatformAdapter` interface in `packages/core` and inject environment-specific implementations via a React Context Container evaluating `window.__TAURI_IPC__`.

**Milestones:**

  - **Id:** M2.1
  - **Title:** React Context DI Container Integration
  - **Status:** [ ]
  - **Objective:** Dynamically route I/O commands to standard Web APIs or native Tauri APIs using React Context.
  - **Deps:** - M1.1
  - **Provides:** - DI Interface (IPlatformAdapter)
- Environment-Agnostic Core UI
  - **Directionality:** Platform Abstraction Layer
  - **Requirements:** - Implement Context Provider at Root Layout
- Mock initial Web API adapter
- Refactor UI logic away from hardcoded window.* calls
  - **Iteration delta:** Initial baseline

**Name:** Phase 3: Tauri Desktop & SQLite integration

**Objective:** Scaffold the native Windows environment and offline database capabilities

**Technical context:** Native Windows access and robust offline queues are necessary for enterprise environments. Heavy file processing mandates Rust multithreading to avoid UI locking.

**Implementation strategy:** Scaffold Tauri `src-tauri` directory, configure Tokio async workers for local document processing, and integrate `tauri-plugin-sql` configured with WAL.

**Milestones:**

  - **Id:** M3.1
  - **Title:** Tauri Scaffolding & Local Processing Engine
  - **Status:** [ ]
  - **Objective:** Process highly sensitive enterprise documents entirely within local machine memory via Tokio.
  - **Deps:** - M2.1
  - **Provides:** - Tauri Windows Native Shell
- Tauri IPC Command System
  - **Directionality:** Native Backend Application
  - **Requirements:** - Initialize src-tauri app
- Implement Tokio thread pool
- Create 'process_document' Rust invoke handler
  - **Iteration delta:** Initial baseline

  - **Id:** M3.2
  - **Title:** Embedded SQLite Offline Sync Engine
  - **Status:** [ ]
  - **Objective:** Provide durable offline event queueing for non-sensitive data.
  - **Deps:** - M3.1
  - **Provides:** - SQLite Offline Sync Engine
- Offline Sync Queue
  - **Directionality:** Data Resilience Layer
  - **Requirements:** - Integrate tauri-plugin-sql
- Configure Write-Ahead Logging (WAL)
- Define OfflineSyncQueue schema
  - **Iteration delta:** Initial baseline

**Name:** Phase 4: Zod Boundaries

**Objective:** Implement strict schema validation interceptors

**Technical context:** Compliance mathematically prohibits any local document keys or proprietary state from exfiltration over HTTP transit.

**Implementation strategy:** Apply immutable Zod schemas as an interceptor over 100% of outbound Axios/Fetch paths.

**Milestones:**

  - **Id:** M4.1
  - **Title:** Schema Validation Network Boundary
  - **Status:** [ ]
  - **Objective:** Mathematically block sensitive local payload keys from HTTP transit.
  - **Deps:** - M2.1
  - **Provides:** - Zod Interceptors
- Verifiable Exfiltration Firewall
  - **Directionality:** Security Boundary
  - **Requirements:** - Define OutboundNetworkPayload schemas
- Inject schema interceptor into HTTP clients
- Test explicit rejection of sensitive keys
  - **Iteration delta:** Initial baseline

**Name:** Phase 5: CI/CD EV Signing

**Objective:** Finalize automated release pipeline for Windows executables

**Technical context:** Windows binary distribution commands Hardware-backed Extended Validation (EV) signing to prevent enterprise EDR flagging.

**Implementation strategy:** Configure Windows native GitHub action runners, orchestrate proxy deep packet inspections for final security validation, and sign the finalized `.msi` artifacts via WiX.

**Milestones:**

  - **Id:** M5.1
  - **Title:** Windows Build Pipeline & EV Signing
  - **Status:** [ ]
  - **Objective:** Finalize automated WiX packaging and EV signed installers.
  - **Deps:** - M3.1
- M4.1
  - **Provides:** - Signed Executables
- Automated Release Chain
  - **Directionality:** DevOps
  - **Requirements:** - Setup Windows OS Action runners
- Configure WiX MSIs < 75MB
- Integrate HSM EV token
  - **Iteration delta:** Initial baseline



# Status Summary
**In progress:**

- M0.1

**Up next:**

- M1.1

- M2.1

- M3.1

- M3.2

- M4.1

- M5.1



# Status Markers
**Unstarted:** [ ]

**In progress:** [🚧]

**Completed:** [✅]



# Dependency Rules
Phase 0 MUST precede all other phases to mitigate SSG compatibility risks.

Phase 1 MUST precede Phase 2 to establish the shared packages/core architecture.

Platform Abstraction Layer (Phase 2) MUST be integrated before native OS Tauri hooks are written.

SQLite Offline Sync requires Phase 3 Tauri scaffolding to be completed.

Zod Validation Boundaries (Phase 4) MUST be in place before any production API deployment for the desktop client.

Phase 5 CI/CD EV Signing MUST block final release but can run in parallel with Phase 4 testing.

UI refactoring depends on the Phase 2 Platform Abstraction Layer.



# Generation Limits
**Max steps:** 200

**Target steps:** 120-180

**Max output lines:** 600-800



# Feature Scope
Platform Abstraction Layer

Local Document Processing Engine

Strict Schema Validation Network Boundary

Embedded SQLite Offline Database & Sync Engine



# Features
Tauri Rust Backend

Zod Network Interceptor

React Context DI

SQLite Sync Engine



# MVP Description
A unified Turborepo workspace orchestrating the existing Next.js web application and a newly introduced Tauri-based Windows desktop client capable of secure local file system access, offline SQLite synchronization, and strict zero-trust Zod schema validation.



# Market Opportunity
$450M Total Addressable Market (TAM) within heavily regulated enterprise sectors (healthcare, defense, finance) strictly requiring zero-trust data residency.



# Competitive Analysis
Outperforms Electron competitors via drastically reduced memory bloat and <75MB installer size utilizing native Windows WebView2 runtime. Outperforms disjointed C# applications via >85% codebase reuse.



# Technical Context
System bridges standard cloud execution with strict native desktop limits using dependency injection, multithreaded Rust async workers, and static Next.js compilation.



# Implementation Context
Linear execution required starting with critical SSG capability proving before committing resources to Turborepo and Tauri.



# Test Framework
Proxy deep packet inspection for data exfiltration verification, Jest for shared logic, Tauri test helpers for IPC bridging.



# Component Mapping
packages/core maps to standard UI; apps/desktop maps to WebView2 wrapper; src-tauri maps to Rust execution.



# Architecture Summary
Unified Dependency Injection layer sharing >85% Next.js logic across standard cloud deployments and Tauri Windows desktop client, protected by compile-time Zod schemas and offline SQLite caching.



# Architecture
Turborepo workspace managing Next.js, Tauri, Zod, and SQLite.



# Services
packages/core

apps/web

apps/desktop

Tauri Rust Backend Layer



# Components
React Context DI Container

Zod Network Interceptor

Tokio Rust Async Workers

Tauri SQLite Plugin



# Integration Points
Next.js Static Export -> Tauri Builder

React Frontend -> Tauri IPC

API Client -> Cloud Sync Endpoints



# Dependency Resolution
Turborepo orchestration

Zod boundary logic

SQLite plugin binaries



# Frontend Stack
**Framework:** Next.js (Static Export Configuration)

**Ui library:** React

**State management:** React Context / Zustand



# Backend Stack
**Framework:** Tauri (Rust)

**Async runtime:** Tokio



# Data Platform
**Local database:** SQLite

**Validation:** Zod API Schema Layer



# DevOps Tooling
**Monorepo manager:** Turborepo

**Ci cd:** GitHub Actions

**Signing:** Hardware-backed EV Code Signing



# Security Tooling
**Schema enforcement:** Zod



# Shared Libraries
packages/core

packages/config



# Third Party Services
Vercel

Enterprise SSO Identity Providers