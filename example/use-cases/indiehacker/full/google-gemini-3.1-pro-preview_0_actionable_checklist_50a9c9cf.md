# Actionable Checklist


## Milestone IDs
M0.1

M1.1



## Index
Phase 0: Technical Audit (SSG)

Phase 1: Turborepo Migration



## Milestone Summary
Milestones M0.1 and M1.1 completely validated and scaffolded. The application has mathematically proven viability for strict Static Site Generation (SSG) by removing server-side properties and replacing them with mockable client hooks. Subsequently, the codebase has been cleanly re-architected into a Turborepo monorepo, delineating reusable core IP into `@workspace/core` and encapsulating the static web pipeline into `@workspace/web`. This firmly mitigates the foundational Tauri gating risk and securely orchestrates the foundation for Phase 2 implementation.



## Milestone Reference
**Id:** M0.1, M1.1

**Phase:** Phase 0: Technical Audit (SSG), Phase 1: Turborepo Migration

**Dependencies:** M0.1 strictly precedes M1.1; M0.1 has no upstream dependencies.



## Steps
**Path:** ./next.config.js

**Title:** Configure Next.js Static Export

**Objective:**

- Enable Next.js output: 'export' mode to produce a pure static HTML bundle strictly required by Tauri.

- Disable unoptimized image scaling to prevent build failures during static export.

**Role:**

- Build Configuration

**Module:**

- Web Config

**Interface:**

- NextConfig configuration object export.

**Interface tests:**

- Assert configuration object structurally matches Next.js NextConfig typings.

- Assert explicit absence of server-only keys (e.g., rewrites, redirects).

**Interface guards:**

- TypeScript strict object validation using `/** @type {import('next').NextConfig} */`.

**Unit tests:**

- Import next.config.js in a Node test runner and assert `config.output === 'export'`.

- Assert `config.images.unoptimized === true`.

**Construction:**

- const nextConfig = { ... }; module.exports = nextConfig;

**Source:**

- Define the nextConfig object literal.

- Set the key `output: 'export'`.

- Set the key `images: { unoptimized: true }`.

- Remove any pre-existing `rewrites`, `redirects`, or `headers` functions which trigger Node.js runtime.

**Provides:**

- Static HTML Output Generation

- Un-optimized Image Rendering Fallback

**Integration tests:**

- Execute 'npx next build' command and verify the successful creation of the 'out/' directory containing static assets.

**Directionality:**

- Core Platform Requirement

**Requirements:**

- Inject `output: 'export'` into the Next.js configuration object.

- Configure `images: { unoptimized: true }` to disable default Next.js server-side image scaling.

- Remove any configured `rewrites` or `redirects` which strictly require Node.js server execution.

**Commit:**

- build: configure next.js for static export mode to satisfy tauri constraints

**Path:** ./src/pages/index.tsx

**Title:** Eliminate SSR Data Fetching Requirements

**Objective:**

- Systematically eliminate `getServerSideProps` to enable SSG compatibility.

- Implement client-side data fetching to restore dynamic state behavior without server rendering.

**Role:**

- Data Fetching Architecture

**Module:**

- UI Routing

**Deps:**

- ./next.config.js (Configure Next.js Static Export, Build config, inward-facing, output mode)

**Context slice:**

- Requires the Next.js config to be set to output: 'export' to ensure subsequent build commands validate the refactor.

**Interface:**

- React Page Component `default export`

- `getStaticProps` function export (optional fallback)

**Interface tests:**

- Assert page component correctly accepts static or empty props via TypeScript constraints.

- Assert `getStaticProps` (if utilized) returns a standard `{ props: {} }` Next.js payload without runtime dependencies.

**Interface guards:**

- Next.js build-time static check fails explicitly if `getServerSideProps` is found alongside `output: 'export'`.

**Unit tests:**

- Mount component in JSDOM and assert loading skeleton renders on initial mount.

- Mock `fetch` response, await hydration hook, and assert data renders without server context.

- Reflectively inspect module exports to assert `getServerSideProps` is undefined.

**Construction:**

- export default function HomePage() { ... }

- export const getStaticProps = async () => { return { props: {} } }

**Source:**

- Delete `export const getServerSideProps` entirely.

- Integrate `useEffect` or `useQuery` (React Query) inside the component to execute data fetching post-mount.

- Add conditional rendering: `if (isLoading) return <LoadingSkeleton />;` to prevent layout shift.

**Provides:**

- Client-Side Data Hydration

- SSG Compatible Route Architecture

**Mocks:**

- Global `fetch` or `axios` interceptors inside unit tests to mock backend responses.

**Integration tests:**

- Run 'next build' and assert that 'out/index.html' is statically generated and no server-side execution errors are thrown.

**Directionality:**

- Application Refactoring

**Requirements:**

- Perform comprehensive codebase regex search for `getServerSideProps` and eliminate usages.

- Refactor affected pages to utilize `getStaticProps` paired with client-side React Query/SWR for dynamic data.

- Implement loading fallback states in the UI to gracefully handle asynchronous client-side hydration.

**Commit:**

- refactor: eliminate SSR dependencies in routing to strictly support SSG

**Path:** ./src/api/mock/handlers.ts

**Title:** Mock Dynamic Server APIs for Build Stability

**Objective:**

- Ensure static site generation does not fail when build-time processes attempt to query internal server routes that are unavailable in export mode.

**Role:**

- Network Mocking

**Module:**

- API Client

**Deps:**

- ./src/pages/index.tsx (Eliminate SSR Data Fetching Requirements, Application refactoring, inward-facing, ensures components fallback properly)

**Context slice:**

- Needs to intercept fetch requests made during `getStaticProps` execution at build time.

**Interface:**

- MSW (Mock Service Worker) Request Handlers Array

- Setup Server Context initialization function

**Interface tests:**

- Assert handlers array contains specific interceptors for required internal APIs.

- Assert response payload matches exact TypeScript schema expected by `getStaticProps`.

**Interface guards:**

- Strict typing of mock responses against internal API OpenAPI or Zod definitions.

**Unit tests:**

- Initialize MSW server, execute `fetch` to target API, and assert mock response is returned with status 200.

- Assert network error handling if an unknown route is hit during build.

**Construction:**

- export const handlers = [ http.get('/api/internal/config', () => HttpResponse.json({...})) ];

**Source:**

- Import `http` and `HttpResponse` from `msw`.

- Define `handlers` array targeting local `/api/*` routes that next build might invoke.

- Export a setup function to conditionally start the interceptor if `process.env.NEXT_PHASE === 'phase-production-build'`.

**Provides:**

- Build-Time API Stability

- Decoupled Frontend Interface

**Mocks:**

- MSW intercepts native Node.js `fetch` during the `next build` phase.

**Integration tests:**

- Execute static export build and assert that pre-rendering completes fully without HTTP 404 or connection refused errors from API calls.

**Directionality:**

- Build Pipeline Resilience

**Requirements:**

- Implement mock interceptors for internal API dependencies invoked during `getStaticProps` execution.

- Segregate build-time environment variables to strictly route requests to mock endpoints during `next build`.

**Commit:**

- test: implement MSW handlers to stub API dependencies during static export builds

**Path:** ./package.json

**Title:** Establish SSG Verification Script

**Objective:**

- Provide explicit, deterministic NPM scripts to build, export, and locally serve the static HTML output for immediate QA.

**Role:**

- Pipeline Tooling

**Module:**

- NPM Scripts

**Deps:**

- ./next.config.js (Configure Next.js Static Export, Build config, inward-facing, provides export config)

- ./src/api/mock/handlers.ts (Mock Dynamic Server APIs for Build Stability, Build Resilience, inward-facing, provides safe build)

**Context slice:**

- Executes the Next.js CLI leveraging the new configurations and mocks.

**Interface:**

- package.json scripts block.

**Interface tests:**

- Assert `scripts['build:export']` exists and contains `next build`.

- Assert `scripts['serve:export']` exists and executes local file serving.

**Interface guards:**

- JSON schema validation for package.json.

**Unit tests:**

- Execute package script parser to verify scripts are correctly formatted commands.

**Construction:**

- "scripts": { "build:export": "next build", "serve:export": "serve out" }

**Source:**

- Open package.json.

- Append `"build:export": "next build"` to the scripts object.

- Append `"serve:export": "npx serve@latest out"` to the scripts object.

**Provides:**

- Local SSG Test Harness

- Phase 0 Exit Criteria Verification

**Integration tests:**

- Run `npm run build:export` followed by `npm run serve:export` and execute a simple curl to `localhost:3000` to verify HTML is served.

**Directionality:**

- Quality Assurance

**Requirements:**

- Add `build:export` script triggering `next build`.

- Add `serve:export` script utilizing a lightweight static server (e.g., `serve out`) to validate output fidelity.

**Commit:**

- chore: add npm scripts for SSG validation and local serve

**Path:** ./package.json

**Title:** Initialize Root Workspace Orchestration

**Objective:**

- Establish the foundational monorepo structure to orchestrate `apps/*` and `packages/*` for unified dependency management.

**Role:**

- Monorepo Configuration

**Module:**

- Workspace Root

**Deps:**

- ./package.json (Establish SSG Verification Script, Quality Assurance, inward-facing, ensures SSG is stable prior to migration)

**Context slice:**

- Assumes project root is cleared for orchestration, existing source moved to subdirectories (handled in later nodes, but root configured now).

**Interface:**

- Root package.json `workspaces` array

- Root devDependencies

**Interface tests:**

- Assert `workspaces` field strictly equals `["apps/*", "packages/*"]`.

- Assert `private` is set to `true`.

**Interface guards:**

- NPM/Yarn/PNPM strict workspace validation on `install`.

**Unit tests:**

- Execute NPM install locally and assert `node_modules` hoists correctly.

**Construction:**

- "private": true, "workspaces": ["apps/*", "packages/*"]

**Source:**

- Create a new `package.json` at the absolute root of the repository.

- Set `"private": true` to prevent accidental publishing.

- Define `"workspaces": ["apps/*", "packages/*"]`.

- Add `turbo` as a devDependency.

**Provides:**

- Package Linking

- Dependency Hoisting

**Integration tests:**

- Run workspace install and verify successful resolution without circular dependency warnings.

**Directionality:**

- Architectural Foundation

**Requirements:**

- Define `workspaces` array including `apps/*` and `packages/*`.

- Install root-level orchestration dependencies like `turbo`.

**Commit:**

- chore: initialize root workspace configuration for turborepo

**Path:** ./turbo.json

**Title:** Define Turborepo Build Pipelines

**Objective:**

- Establish explicit topological execution graphs and caching rules for building, linting, and testing across the monorepo.

**Role:**

- Task Orchestration

**Module:**

- Turborepo Config

**Deps:**

- ./package.json (Initialize Root Workspace Orchestration, Monorepo config, inward-facing, provides workspace awareness)

**Context slice:**

- Requires knowledge of standard NPM scripts (`build`, `lint`, `dev`) that will be executed in the workspaces.

**Interface:**

- turbo.json configuration schema.

**Interface tests:**

- Assert pipeline defines `build`, `lint`, and `dev` keys.

- Assert `build` pipeline has `dependsOn: ["^build"]` to enforce topological compilation.

**Interface guards:**

- Turborepo CLI schema validator (`turbo check`).

**Unit tests:**

- Run `turbo run build --dry` and assert JSON output defines the correct task execution graph.

**Construction:**

- { "$schema": "https://turbo.build/schema.json", "pipeline": { "build": { "dependsOn": ["^build"] } } }

**Source:**

- Create `turbo.json` at the workspace root.

- Define `pipeline` object.

- Configure `build` with outputs array (e.g., `dist/**`, `.next/**`, `out/**`).

- Configure `lint` and `dev` (with `cache: false` for dev).

**Provides:**

- Parallel Execution Pipelines

- Build Artifact Caching

**Integration tests:**

- Execute a dummy `turbo run build` to verify configuration is parsed without syntax or structural errors.

**Directionality:**

- Developer Velocity

**Requirements:**

- Define standard `build` pipeline with topological dependencies (`^build`).

- Define caching inputs for the `build` task (e.g., `src/**`, `package.json`, `tsconfig.json`).

- Define `dev` and `lint` pipeline rules.

**Commit:**

- chore: define turborepo pipeline configurations and caching policies

**Path:** ./packages/config/tsconfig.json

**Title:** Scaffold Shared Toolchain configurations

**Objective:**

- Centralize TypeScript rules to ensure strict, unified standards across both Web and Desktop applications, maximizing cross-environment consistency.

**Role:**

- Standardization

**Module:**

- Shared Tooling

**Deps:**

- ./package.json (Initialize Root Workspace Orchestration, Monorepo config, inward-facing, provides package boundaries)

**Context slice:**

- Requires workspace symlinking to be accessible via `@workspace/config/*` imports.

**Interface:**

- tsconfig base JSON payload.

**Interface tests:**

- Assert `strict: true` and `isolatedModules: true` are enabled in compilerOptions.

**Interface guards:**

- TSC compiler invocation using the base config to check for schema invalidities.

**Unit tests:**

- Run `tsc --showConfig` on a dummy package extending this config and assert flags are accurately inherited.

**Construction:**

- { "compilerOptions": { "strict": true, "skipLibCheck": true } }

**Source:**

- Create `packages/config/package.json` naming it `@workspace/config`.

- Create `packages/config/tsconfig.json` containing base strict rules.

- Create `packages/config/eslint-preset.js` extending standard React and Next rules.

**Provides:**

- Shared tsconfig base

- Shared eslint presets

**Integration tests:**

- Link a dummy package to `@workspace/config`, run linting, and verify rules apply.

**Directionality:**

- Code Quality Base

**Requirements:**

- Create `packages/config/tsconfig.json` defining strict standard rules.

- Create `packages/config/eslint-preset.js` extending Next.js and standard TypeScript linting rules.

- Ensure `packages/config/package.json` correctly exports these configurations.

**Commit:**

- chore: establish shared typescript and eslint toolchain in packages/config

**Path:** ./packages/core/package.json

**Title:** Initialize Shared Business Logic Package

**Objective:**

- Create the structural destination for standard UI components, state management, and the future Platform Abstraction Layer (PAL), facilitating >85% code reuse.

**Role:**

- Library Initialization

**Module:**

- Core Package

**Deps:**

- ./packages/config/tsconfig.json (Scaffold Shared Toolchain configurations, Shared Tooling, inward-facing, provides TSC base)

**Context slice:**

- Requires the standard `tsconfig.json` from `@workspace/config` to compile correctly.

**Interface:**

- NPM Package entrypoint (`main`, `types`, `exports`)

- Barrel file export `src/index.ts`

**Interface tests:**

- Assert `package.json` name equals `@workspace/core`.

- Assert `exports` correctly points to compiled `dist/index.js` or directly to source for build tools.

**Interface guards:**

- NPM package schema compliance.

**Unit tests:**

- Create dummy export in `src/index.ts` and test import resolution from an external mock script.

**Construction:**

- { "name": "@workspace/core", "main": "./src/index.ts" }

**Source:**

- Initialize `packages/core/package.json`.

- Set standard scripts (`lint`, `typecheck`).

- Create `packages/core/tsconfig.json` extending `@workspace/config/tsconfig.json`.

- Create `packages/core/src/index.ts` containing a test export (e.g., `export const CORE_INIT = true;`).

**Provides:**

- @workspace/core namespace

- Centralized Component Export

**Integration tests:**

- Execute `turbo run typecheck` to assert the core package compiles successfully against shared configuration.

**Directionality:**

- Code Reuse Architecture

**Requirements:**

- Scaffold `packages/core/package.json` with appropriate name (e.g., `@workspace/core`).

- Establish `src/index.ts` to serve as the unified export barrel file.

- Configure local `tsconfig.json` to extend `packages/config/tsconfig.json`.

**Commit:**

- feat: initialize @workspace/core library package for shared ui and business logic

**Path:** ./apps/web/package.json

**Title:** Migrate Existing Next.js Application

**Objective:**

- Physically relocate the audited, statically exportable Next.js source code into its designated monorepo application directory, finalizing the workspace scaffolding.

**Role:**

- Code Migration

**Module:**

- Web Deployment Head

**Deps:**

- ./package.json (Initialize Root Workspace Orchestration, Monorepo config, inward-facing, establishes target structure)

- ./packages/core/package.json (Initialize Shared Business Logic Package, Core Package, inward-facing, future UI dependency target)

**Context slice:**

- Applies the structural change required by Turborepo to recognize the Next.js app as a distinct buildable project.

**Interface:**

- Web App `package.json`

- Workspace app directory structure

**Interface tests:**

- Assert `package.json` name equals `@workspace/web`.

- Assert scripts map directly to turbo pipeline tasks.

**Interface guards:**

- Turborepo path resolution engine confirms app existence.

**Unit tests:**

- Validate imports within the relocated code correctly map to their new relative or absolute paths.

**Construction:**

- mv src/ apps/web/src/ && mv package.json apps/web/package.json

**Source:**

- Create `apps/web/` directory.

- Move the original `src`, `public`, `next.config.js`, and local `tsconfig.json` to `apps/web/`.

- Rename `apps/web/package.json` name to `@workspace/web`.

- Add `@workspace/config` and `@workspace/core` to its internal dependencies.

**Provides:**

- Isolated Web Target

- Monorepo Consuming App

**Integration tests:**

- Run `turbo run build:export` from the workspace root and verify `@workspace/web` builds the static bundle output correctly into `apps/web/out/`.

**Directionality:**

- Application Re-homing

**Requirements:**

- Move `src`, `public`, `next.config.js`, and associated Next.js assets into `apps/web/`.

- Update `apps/web/package.json` name to `@workspace/web`.

- Modify internal package scripts to align with the root `turbo.json` pipeline.

**Commit:**

- refactor: migrate next.js application into apps/web turborepo structure