# Dependency Map


## Overview
This Dependency Map outlines the critical path for transforming a cloud-reliant Next.js application into a dual-target architecture featuring a zero-trust Tauri Windows client. The architecture relies heavily on a Turborepo monorepo to maximize code reuse (>85%), utilizing a React Context Dependency Injection pattern to seamlessly switch between standard browser environments and native Windows execution contexts. 

Mapping these dependencies is paramount because the project harbors a severe technical trap: modern Next.js paradigms (SSR/RSC) are fundamentally incompatible with Tauri's strict requirement for static HTML asset delivery (SSG/SPA). By explicitly defining the tooling, codebase sequencing, and strict security validation boundaries (e.g., replacing loose 'Taint Tracking' with strict Zod schemas), this map ensures that architectural blockers are resolved in a pre-requisite gating phase before committing significant engineering resources. It structurally guarantees that the final application adheres strictly to enterprise data residency constraints without compromising our current web deployment velocity.



## Components
Shared UI and Business Logic Core (`packages/core`)

Next.js Web Head (`apps/web`)

Next.js + Tauri Desktop Head (`apps/desktop`)

Platform Abstraction Layer (Dependency Injection using React Context)

Tauri Rust Backend & IPC Bridge

API/Database Client (tRPC/Fetch)

Zod Schema Boundary Validator

Embedded Local Database (Tauri SQLite Plugin)



## Integration Points
Core IO Logic -> Platform Abstraction Layer Contract (`IPlatformProvider`)

Web Adapter -> Standard Browser APIs (Window, File API)

Desktop Adapter -> Tauri `@tauri-apps/api` (IPC Client)

Tauri IPC Client -> Tauri Rust Backend (`#[tauri::command]`)

Tauri Rust Backend -> Windows File System (OS Native API)

API Client -> Production Cloud Database

API Client -> Zod Schema Validator (pre-flight payload sanitization)

Desktop Adapter -> Local SQLite Database (Offline Sync Queue)



## Conflict Flags
Architectural Mismatch: Next.js Server-Side Rendering (SSR) / Server Components vs. Tauri strict Static Site Generation (SSG) requirements.

Security Vulnerability: Loosely typed JavaScript 'Taint Tracking' vs. Strict Zod Schema validation at the API boundary.

Performance Bottleneck: Large document JSON/Base64 serialization over the Rust-to-JS IPC bridge freezing the WebView2 UI thread.

Release Pipeline Coupling: Desktop-specific updates to shared packages inadvertently breaking the production web application.



## Dependencies
### 1. Architectural & Tooling Dependencies
- **Next.js Static Export Capabilities:** The entire `desktop-head` architecture is strictly dependent on the existing Next.js application's ability to compile using `output: 'export'`. Any reliance on Node.js APIs, React Server Components (RSC), or Server-Side Rendering (SSR) in the shared `core` will fatally block the Tauri build.
- **Turborepo (or Nx) Monorepo Engine:** Essential for orchestrating parallel builds, managing package dependencies (`packages/core` injected into `apps/web` and `apps/desktop`), and caching artifacts to maintain CI/CD velocity.
- **Tauri Framework & Rust Toolchain:** The Windows desktop client depends on the Tauri 1.x/2.x framework, requiring the Rust compiler (`rustc` and `cargo`) to be present in both local development environments and CI pipelines.
- **Windows WebView2:** The host machine must support Microsoft's WebView2 runtime, which Tauri relies upon to render the compiled Next.js static HTML/JS/CSS.

### 2. Software Library Dependencies
- **Dependency Injection Mechanism:** Relies natively on React Context to inject `WebAdapter` or `DesktopAdapter` implementations, preventing runtime reference errors to missing OS or Browser APIs.
- **Schema Validation (Zod):** A strict dependency for the API Client boundary to explicitly strip out sensitive properties (e.g., `document_body`, `local_path`) before any synchronization payload is transmitted to the production cloud database. This replaces the highly risky runtime JS 'taint tracking' approach.
- **Tauri SQLite Plugin:** Required to implement the embedded offline database, enabling the local queuing of standard application state metadata when the user is disconnected from the enterprise network.

### 3. Team & Operational Dependencies
- **Cross-Functional Upskilling:** Frontend engineers will require familiarization with Rust syntax and Tauri IPC concepts to build and maintain the secure backend bridge.
- **GitHub Actions Windows Runners:** The DevOps pipeline depends on `windows-latest` runners for native `.msi` and `.exe` compilation, alongside enterprise EV Code Signing certificates to mitigate Windows Defender false positives.



## Sequencing
### Phase 0: The Gating Audit & Static Validation
Prior to any monorepo restructuring, an immediate audit must be conducted on the existing Next.js codebase. All dependencies on SSR, Server Actions, and Node.js-exclusive libraries must be mapped and refactored. The exit gate for this phase is successfully running `next build` with `output: 'export'` on the core user flows.

### Phase 1: Monorepo Orchestration
Initialize the Turborepo workspace. Extract the validated UI components and business logic into a shared `packages/core` library. Ensure the existing web deployment pipeline (`apps/web`) functions flawlessly with the newly decoupled packages.

### Phase 2: Platform Abstraction & Dependency Injection
Define the `IPlatformProvider` interface. Refactor the `core` package to route all input/output commands through this interface. Implement and inject the `WebAdapter` to ensure the web application retains 100% feature parity and operational stability.

### Phase 3: Tauri Desktop Scaffold & IPC Bridge
Initialize `apps/desktop` utilizing the static export from Phase 0. Implement the `DesktopAdapter`. Write the Rust-based Tauri commands (`#[tauri::command]`) for secure local file system traversal. Establish the local SQLite plugin to handle offline state caching.

### Phase 4: Strict Security Boundaries & CI/CD Validation
Implement the Zod schema validation layer on all API Client outbound requests to guarantee zero document leakage to the cloud database. Finalize the GitHub Actions matrix using Windows runners, sign the executables, and configure the Over-The-Air (OTA) update mechanism.



## Risk Mitigation
### 1. Mitigating the Next.js SSG Mismatch Risk
The highest architectural risk is the incompatibility between modern Next.js server features and Tauri's native shell constraints. This is mitigated strictly by **Phase 0**—a mandatory technical audit forcing the codebase into compliance with `output: 'export'`. Any non-compliant components must be refactored to standard client-side data fetching (e.g., React Query or SWR) before proceeding.

### 2. Mitigating Zero-Trust Data Leaks
The baseline proposal's reliance on 'Taint Tracking' is insufficient in a loosely typed JavaScript runtime. We mitigate this critical compliance risk by implementing **Strict Schema Boundary Validation**. Utilizing a library like Zod, we enforce compile-time and runtime checks on all outbound API payloads. The schema explicitly omits/rejects `document_body` or `local_path` fields, making it impossible to serialize sensitive data into network requests.

### 3. Mitigating IPC Thread Freezing
Passing massive multi-megabyte document arrays across the Rust-to-JS IPC bridge requires heavy JSON serialization that can block the UI thread. Mitigation involves **offloading file processing entirely to Rust background threads**. The IPC bridge will only transmit lightweight metadata, references, or utilize Tauri's custom protocols (`tauri://`) to stream binary assets directly to HTML elements, preserving a smooth 60fps React interface.

### 4. Mitigating Web App Regressions
Changes to the shared `core` intended for the desktop client could break the production web app. Mitigation requires strict isolated testing inside the monorepo pipeline: a pull request cannot be merged unless the `apps/web` integration and end-to-end tests pass at 100%.



## Open Questions
### 1. Offline Authentication Workflows
While the local SQLite database provides an offline data queue, how will user authentication be handled in a purely disconnected state? Must the user have a live network connection to authenticate and open the desktop application, or will we implement localized, encrypted JWT caching via the Tauri Rust backend to allow air-gapped usage?

### 2. Next.js API Route Equivalence
The existing Next.js application likely utilizes `pages/api` or `app/api` routes. Since these cannot be statically exported, how much of this backend logic needs to be rewritten in Rust for the desktop target versus abstracted out to an external, independently hosted microservice?

### 3. Enterprise Distribution Strategy
Over-The-Air (OTA) updates are sufficient for unmanaged devices, but highly regulated enterprises often disable automatic app updates, preferring managed deployments via SCCM or Microsoft Intune. What are the specific `.msi` packaging constraints required to support these automated enterprise deployment networks?