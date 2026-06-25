    # Index
    Pipeline Context

Selection Criteria

Shared Infrastructure

Milestone 0.1: Next.js Static Export Feasibility Proof

Milestone 1.1: Turborepo Scaffolding

Iteration Semantics

Executive Summary
    

    
    # Executive Summary
    This Milestone Schema establishes the granular, dependency-ordered technical graph strictly required to transition the core Next.js application into a robust, dual-target architecture capable of securely rendering a Tauri Windows desktop client. By explicitly defining structural nodes for the mandatory Phase 0 Static Site Generation (SSG) audit and the foundational Phase 1 Turborepo workspace migration, this middle-zoom documentation acts as the operational ledger. It ensures development agents generate code reliably and iteratively, effectively front-loading architectural risks before executing advanced compliance and offline integrations.
    

    
    # Pipeline Context
    This document serves as the middle-zoom architectural translation layer, effectively bridging the high-level strategic objectives defined in the Master Plan with the low-level file manipulations required in the Actionable Checklists. It purposefully decomposes prioritized dependency-frontier milestones into discrete, bounded architectural work nodes that explicitly define how structural components interoperate. By rigorously restricting the scope to the immediate execution batch, this schema prevents cognitive and contextual bloat for downstream autonomous agents while structurally enforcing the chronological prerequisites of the system architecture.
    

    
    # Selection Criteria
    Dependency frontier execution restricts the current operational batch exclusively to milestones whose upstream dependencies are fully resolved `[✅]` or are intentionally grouped within the active sequence. In strict adherence to the Master Plan's risk-mitigation strategy, which gates all Tauri native development behind Next.js SSG viability, this iteration isolates Phase 0 (M0.1) and Phase 1 (M1.1). Subsequent phases (e.g., Phase 2 Platform Abstraction Layer) remain unelaborated to prevent invalidating work if foundational SSG constraints require significant architectural pivots.
    

    
    # Shared Infrastructure
    Turborepo Workspace Pipeline

Next.js Static Site Generation (SSG) Engine

Shared ESLint & TypeScript Toolchain
    

    
    # Milestones
    **Id:** M0.1

**Title:** Next.js Static Export Feasibility Proof

**Status:** [ ]

**Objective:** Prove that the core application can seamlessly compile into a static HTML bundle using Next.js `output: 'export'`, strictly eliminating all Server-Side Rendering (SSR) reliance to satisfy Tauri's foundational requirement.

**Nodes:**

  - **Path:** ./next.config.js
  - **Title:** Configure Next.js Static Export
  - **Objective:** Enable export mode and globally disable incompatible server-centric optimizations.
  - **Role:** Build Configuration
  - **Module:** Web Config
  - **Provides:** - Static HTML Output Generation
- Un-optimized Image Rendering Fallback
  - **Directionality:** Core Platform Requirement
  - **Requirements:** - Inject `output: 'export'` into the Next.js configuration object.
- Configure `images: { unoptimized: true }` to disable default Next.js server-side image scaling.
- Remove any configured `rewrites` or `redirects` which strictly require Node.js server execution.

  - **Path:** ./src/pages/
  - **Title:** Eliminate SSR Data Fetching Requirements
  - **Objective:** Identify and systematically replace all `getServerSideProps` instances with standard static generation or client-side fetching.
  - **Role:** Data Fetching Architecture
  - **Module:** UI Routing
  - **Deps:** - Configure Next.js Static Export
  - **Provides:** - Client-Side Data Hydration
- SSG Compatible Route Architecture
  - **Directionality:** Application Refactoring
  - **Requirements:** - Perform comprehensive codebase regex search for `getServerSideProps`.
- Refactor affected pages to utilize `getStaticProps` paired with client-side React Query/SWR for dynamic data.
- Implement loading fallback states in the UI to gracefully handle asynchronous client-side hydration.

  - **Path:** ./src/api/mock/
  - **Title:** Mock Dynamic Server APIs for Build Stability
  - **Objective:** Ensure static site generation does not fail when build-time processes attempt to query internal server routes that will no longer exist in export mode.
  - **Role:** Network Mocking
  - **Module:** API Client
  - **Deps:** - Eliminate SSR Data Fetching Requirements
  - **Provides:** - Build-Time API Stability
- Decoupled Frontend Interface
  - **Directionality:** Build Pipeline Resilience
  - **Requirements:** - Implement mock interceptors for internal API dependencies invoked during `getStaticProps` execution.
- Segregate build-time environment variables to strictly route requests to mock endpoints during `next build`.

  - **Path:** ./package.json
  - **Title:** Establish SSG Verification Script
  - **Objective:** Provide an explicit, deterministic script to build, export, and locally serve the static output for manual and automated verification.
  - **Role:** Pipeline Tooling
  - **Module:** NPM Scripts
  - **Deps:** - Configure Next.js Static Export
- Eliminate SSR Data Fetching Requirements
- Mock Dynamic Server APIs for Build Stability
  - **Provides:** - Local SSG Test Harness
- Phase 0 Exit Criteria Verification
  - **Directionality:** Quality Assurance
  - **Requirements:** - Add `build:export` script triggering `next build`.
- Add `serve:export` script utilizing a lightweight static server (e.g., `serve out`) to validate output fidelity.

**Id:** M1.1

**Title:** Turborepo Scaffolding

**Status:** [ ]

**Objective:** Initialize the structural Turborepo workspace, establishing the foundation for >85% code reuse across `apps/web`, `apps/desktop`, and `packages/core`.

**Nodes:**

  - **Path:** package.json
  - **Title:** Initialize Root Workspace Orchestration
  - **Objective:** Configure standard NPM/Yarn/pnpm workspace declarations at the repository root to link modular packages.
  - **Role:** Monorepo Configuration
  - **Module:** Workspace Root
  - **Deps:** - M0.1
  - **Provides:** - Package Linking
- Dependency Hoisting
  - **Directionality:** Architectural Foundation
  - **Requirements:** - Define `workspaces` array including `apps/*` and `packages/*`.
- Install root-level orchestration dependencies like `turbo`.

  - **Path:** turbo.json
  - **Title:** Define Turborepo Build Pipelines
  - **Objective:** Establish explicit topological execution graphs and caching rules for building, linting, and testing across the monorepo.
  - **Role:** Task Orchestration
  - **Module:** Turborepo Config
  - **Deps:** - Initialize Root Workspace Orchestration
  - **Provides:** - Parallel Execution Pipelines
- Build Artifact Caching
  - **Directionality:** Developer Velocity
  - **Requirements:** - Define standard `build` pipeline with topological dependencies (`^build`).
- Define caching inputs for the `build` task (e.g., `src/**`, `package.json`, `tsconfig.json`).
- Define `dev` and `lint` pipeline rules.

  - **Path:** packages/config/
  - **Title:** Scaffold Shared Toolchain configurations
  - **Objective:** Centralize ESLint, Prettier, and TypeScript configurations to ensure strict, unified standards across both Web and Desktop applications.
  - **Role:** Standardization
  - **Module:** Shared Tooling
  - **Deps:** - Initialize Root Workspace Orchestration
  - **Provides:** - Shared tsconfig base
- Shared eslint presets
  - **Directionality:** Code Quality Base
  - **Requirements:** - Create `packages/config/tsconfig.json` defining strict standard rules.
- Create `packages/config/eslint-preset.js` extending Next.js and standard TypeScript linting rules.
- Ensure `packages/config/package.json` correctly exports these configurations.

  - **Path:** packages/core/
  - **Title:** Initialize Shared Business Logic Package
  - **Objective:** Create the structural destination for standard UI components, state management, and the future Platform Abstraction Layer (PAL).
  - **Role:** Library Initialization
  - **Module:** Core Package
  - **Deps:** - Scaffold Shared Toolchain configurations
  - **Provides:** - @workspace/core namespace
- Centralized Component Export
  - **Directionality:** Code Reuse Architecture
  - **Requirements:** - Scaffold `packages/core/package.json` with appropriate name (e.g., `@workspace/core`).
- Establish `src/index.ts` to serve as the unified export barrel file.
- Configure local `tsconfig.json` to extend `packages/config/tsconfig.json`.

  - **Path:** apps/web/
  - **Title:** Migrate Existing Next.js Application
  - **Objective:** Physically relocate the audited, statically exportable Next.js source code into its designated monorepo application directory.
  - **Role:** Code Migration
  - **Module:** Web Deployment Head
  - **Deps:** - Initialize Root Workspace Orchestration
  - **Provides:** - Isolated Web Target
- Monorepo Consuming App
  - **Directionality:** Application Re-homing
  - **Requirements:** - Move `src`, `public`, `next.config.js`, and associated Next.js assets into `apps/web/`.
- Update `apps/web/package.json` name to `@workspace/web`.
- Modify internal package scripts to align with the root `turbo.json` pipeline.
    

    
    # Iteration Semantics
    Replace, do not extend. Downstream generation nodes must consume this exact schema as the definitive chronological blueprint for the current execution wave. It dictates the rigid sequencing of capabilities, guaranteeing no file-level manipulations for downstream technologies (Tauri, SQLite, Zod) occur before their foundational Turborepo and SSG architecture nodes are completely verified.