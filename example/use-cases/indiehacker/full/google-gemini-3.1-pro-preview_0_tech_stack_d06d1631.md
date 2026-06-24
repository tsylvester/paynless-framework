# Tech Stack Recommendations


## Frontend Stack
**Framework:** **Next.js (Static Export Configuration)**
The application strictly utilizes the Next.js framework configured specifically with the `output: 'export'` parameter. This target compilation strictly avoids Node.js server dependencies by generating pure static HTML, CSS, and JS assets, fundamentally satisfying Tauri's strict UI container constraints and achieving alignment with the Phase 0 audit mandates.

**Ui library:** **React**
Serves as the foundational UI layer operating identically across the web browser and the desktop Native Windows WebView2 environments. It utilizes advanced hook compositions to interface dynamically with the underlying Dependency Injection abstraction layer.

**State management:** **React Context / Zustand**
A highly performant hybrid architecture where the React Context API acts as the primary Dependency Injection (DI) router for environment-specific abstractions, while Zustand provides lightweight, un-opinionated, and fast global state management avoiding heavy Context re-renders.

**Routing:** **Next.js App/Pages Router (Static Mode)**
Application routing leverages the built-in Next.js routing capabilities explicitly scoped to purely static site generation (SSG) patterns. Dynamic server-side routes are structurally forbidden to ensure seamless artifact portability within the Tauri WebView.



## Backend Stack
**Framework:** **Tauri (Rust)**
The secure native orchestration wrapper providing absolute zero-trust local execution. It manages the WebView2 deployment footprint to keep the installer below 75MB while leveraging low-level OS hooks for deep local file-system interaction and payload processing completely isolated from network interfaces.

**Async runtime:** **Tokio**
The powerful Rust asynchronous runtime specifically utilized to prevent the primary React UI thread from bottlenecking. It offloads highly intensive computation—such as gigabyte-scale document processing and local SQLite writes—to parallel background workers.

**Ipc bridge:** **Tauri IPC Command System**
The primary localized communication bridge enabling secure, asynchronous message passing between the frontend JavaScript environment and the isolated Rust native execution context, strictly audited to prevent data exfiltration.



## Data Platform
**Local database:** **SQLite (via `tauri-plugin-sql`)**
An integrated embedded database running exclusively on the local machine acting as a deterministic offline event queue. Operating robustly with Write-Ahead Logging metadata structures, it caches unsynchronized application state and telemetry during network disconnections, structurally preventing data loss.

**Validation:** **Zod API Schema Layer**
The uncompromising structural network perimeter. Integrated at both compile-time and runtime, this explicit schema interceptor definitively strips and drops sensitive document fields from the outbound network queue, entirely replacing the unreliable dynamic taint-tracking mechanisms previously proposed.

**Cloud database:** **PostgreSQL (Existing Production DB)**
The primary cloud-hosted relational database acting as the ultimate source of truth, securely receiving robustly scrubbed and schema-validated synchronization payloads representing user telemetry and non-sensitive application state.



## DevOps Tooling
**Monorepo manager:** **Turborepo**
The central monorepo tool orchestrating cross-project code sharing between `packages/core`, `apps/web`, and `apps/desktop`. It enforces rigid boundary restrictions, aggressive build caching, and highly parallelized CI task execution.

**Ci cd:** **GitHub Actions (Windows OS Native Runners)**
The mandated continuous integration pipeline utilizing specialized Windows hardware runners explicitly to fulfill the architectural necessity of compiling raw Rust code and C++ desktop dependencies for native distribution.

**Packaging:** **WiX Toolset (MSI/EXE)**
Seamlessly connected to the Tauri build process, the WiX Toolset creates standard, compliance-ready Windows installer artifacts specifically optimized for frictionless distribution across enterprise environments utilizing Intune or SCCM.

**Signing:** **Hardware-backed EV Code Signing**
A critical procurement dependency utilized to explicitly cryptographically sign all desktop binary artifacts and MSI packages. This physical hardware token requirement directly mitigates the high-probability risk of deep enterprise Antivirus or Endpoint Detection and Response (EDR) platforms rejecting the custom binaries.



## Security Tooling
**Schema enforcement:** **Zod**
Operates as an explicit structural firewall prior to API dispatch. It enforces rigorous TypeScript definitions verifying that no keys outside of authorized standard metadata boundaries map correctly, permanently eliminating the risk of accidental proprietary data payload transmission.

**Network auditing:** **CI/CD Proxy Packet Inspectors**
Mandatory deep-packet staging infrastructure configured to actively intercept and decode HTTP network requests during automated tests to mathematically verify the operational success of the Zod schemas and confirm zero leakage of sensitive file signatures.



## Shared Libraries
`packages/core`: The single source of truth for all application UI views, business logic, unified utility classes, and custom React hooks. Its architectural isolation directly drives the project's ability to maintain a >85% cross-platform code reuse Key Performance Indicator (KPI).

`packages/config`: The central repository enforcing strict enterprise compliance across the Turborepo, establishing identical TypeScript (`tsconfig.json`), ESLint, and Prettier formatting standards to avert codebase fragmentation.



## Third-Party Services
**Vercel (Web Application Hosting)**: Target continuous deployment platform operating the Next.js edge-delivery network exclusively for the `apps/web` cloud head.

**Enterprise SSO Identity Providers (OIDC/SAML)**: Corporate federations facilitating heavily regulated user authentication while securely provisioning access tokens required by the desktop application for offline capabilities.



## Component Recommendations
**Component name:** Tauri Desktop Environment Wrapper

**Recommended option:** Tauri 2.0 with Windows WebView2

**Rationale:** Selected to completely resolve compliance mandates requiring deep local execution, Tauri provides a vastly smaller binary footprint (under 75MB) and lower memory utilization compared to Electron. First-class Rust integration secures the environment, allowing deep OS file parsing capabilities directly outside the traditional web sandbox constraints.

**Alternatives:**

- Electron Framework (Chromium + Node.js)

- Native C# / WPF Dedicated Desktop Architecture

**Tradeoffs:**

- Mandates the adoption of Rust as an absolute requirement and core competency for frontend engineering teams.

- Requires the existing complex Next.js codebase to be strictly statically exportable, demanding the forfeit of standard Next.js Server-Side Rendering (SSR) capabilities.

**Risk signals:**

- Spontaneous WebView2 lifecycle bugs, breaking changes, or regressions force-pushed via automatic, unblockable Windows OS system updates.

**Integration requirements:**

- Requires the immediate procurement and integration of hardware-backed EV code signing certificates.

- Requires dedicated Windows native CI build runners integrated into GitHub Actions.

**Operational owners:**

- Desktop Platform Architecture Team

- DevOps Strategy Team

**Migration plan:**

- Initiated during the Phase 3 Desktop Scaffold plan.

- Strictly blocked and gated pending the official validation and sign-off of the Phase 0 Next.js Static Export Feasibility Audit.

**Component name:** Dependency Injection Platform Abstraction Layer (PAL)

**Recommended option:** React Context API

**Rationale:** Operating natively within the React UI library ecosystem, this approach requires zero additional Webpack bundle bloat and comprehensively supports dynamically switching the application's underlying I/O engines (Web APIs vs. Tauri OS APIs) purely based on targeted environment bootstrap variables without rewriting core view logic.

**Alternatives:**

- InversifyJS (TypeScript IoC Container)

- Build-time Webpack / Turbopack Dependency Aliasing

**Tradeoffs:**

- Context provider re-renders must be meticulously architected and optimized across the deeply nested Node tree to avert potentially severe client-side performance degradation.

**Risk signals:**

- Notable input lag, frame dropping, or performance overhead measured if too many granular React Contexts recursively wrap the heavy application root UI logic.

**Integration requirements:**

- Requires the engineering definition of standardized, highly inflexible TypeScript contracts mapping absolute equivalence across divergent Web and Tauri API paradigms.

**Operational owners:**

- Frontend Core Architecture Team

**Migration plan:**

- Executed structurally during Phase 2 across the entirety of `packages/core`.

- Precedes the actual desktop scaffold by aggressively replacing and wrapping all existing, direct global `window.*` API usages within the existing cloud product.



## Open Questions
Are specific `rust-analyzer` definitions, standard tooling packages, and IDE linting presets required across the entire engineering team immediately to rapidly scale baseline familiarity and standardize Tauri background development?

How will the existing cloud backend validate desktop-specific, long-lived offline token renewals with cryptographic security when the embedded SQLite queue automatically syncs payload metadata upon unexpected network restorations?

Will the inevitable introduction of massive local document processing workloads (e.g., heavily clustered payloads exceeding 50MB) require abandoning standard IPC mechanisms and implementing custom `tauri://` protocol streaming to avoid UI locking?



## Next Steps
Staff and initiate the Phase 0 Next.js Static Export (SSG) technical audit to firmly establish the feasibility of detaching the core application from Node.js dependencies.

Provision unified local Rust and Tauri development environments across the frontend engineering team alongside required IDE compliance plugins.

Set up the baseline Turborepo monorepo directory scaffolding (`apps/web`, `apps/desktop`, `packages/core`) to initialize environment isolation.

Create the first iteration of the Dependency Injection (React Context) interface mappings to serve as the unified bridge for the Platform Abstraction Layer.