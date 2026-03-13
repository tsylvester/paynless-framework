[ ] // So that find->replace will stop unrolling my damned instructions!

# **ICP Segment Landing Pages**

## Problem Statement

The homepage UseCases component currently shows a generic 2x2 grid with broad labels ("Indie Hackers & Vibe Coders", "Development Teams", "Startups & Agencies", "Learning & Teaching") that don't speak to any specific user's pain. There are no dedicated landing pages for any ICP segment, no way to measure which segment drives conversions, and no compelling demonstration of what the product actually produces. Visitors land on a generic page, see generic claims, and leave without understanding how Paynless solves *their* specific problem.

## Objectives

1. Create four dedicated ICP landing pages — one each for Vibe Coders, Indie Hackers, Startups, and Agencies — that speak directly to each segment's pain, show real AI-generated output as proof of value, and drive sign-up with a trackable segment tag.
2. Update the homepage UseCases component to link to these landing pages with segment-specific messaging.
3. Fix the broken ConvertKit newsletter subscription and add segment cohort tagging — ConvertKit captures email + segment, PostHog segments behavioral analytics with the same `signup_segment` property (`vibecoder`, `indiehacker`, `startup`, `agency`, or `direct`).

## Expected Outcome

- Four live landing pages at `/vibecoder`, `/indiehacker`, `/startup`, `/agency`
- Each page shows: hero with pain statement, before/after transformation, relatable scenario, real AI-generated docs in a reader, all 18 doc titles, segment-framed how-it-works, FAQ/objection handling, and a CTA with pricing and segment tag
- Homepage UseCases cards link to the four landing pages
- ConvertKit newsletter subscribers are tagged with their acquisition segment cohort
- PostHog captures `signup_segment` as a user property on every account creation via `identify` + `track`
- Conversion per segment is measurable in both ConvertKit (email) and PostHog (behavioral analytics)
- The broken `subscribeToNewsletter` action is fixed — newsletter opt-in actually works

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.
* Reference: `docs/implementations/Current/segment-landing-pages.md` for segment content, page structure, and routing decisions.

# Work Breakdown Structure

*   `[✅]` apps/web/src/data/`segmentContent.ts` **[UI] Segment content data file — typed content objects for all 4 ICP segments**
    *   `[✅]` `objective`
        *   `[✅]` Provide a single source of truth for all segment-specific landing page content
        *   `[✅]` Each segment object contains: slug, headline, oneLiner, painStatement, scenario, exampleInput, featuredDocs (tab labels + markdown content strings), howItWorksFraming (5 stage descriptions), faqItems (question/answer pairs), ctaRef, gradient color
        *   `[✅]` Content sourced from `docs/implementations/Current/segment-landing-pages.md` and `example/use-cases/{segment}/`
    *   `[✅]` `role`
        *   `[✅]` Domain data — static content configuration consumed by the landing page template
    *   `[✅]` `module`
        *   `[✅]` ICP landing pages content layer
        *   `[✅]` No runtime dependencies — pure data export
    *   `[✅]` `deps`
        *   `[✅]` None — this is a leaf data file with no imports beyond types
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` No dependencies — exports typed content objects
        *   `[✅]` No injection needed — consumed directly by the template component
    *   `[✅]` interface/`segmentContent.types.ts`
        *   `[✅]` `SegmentFaqItem` — `{ question: string; answer: string }`
        *   `[✅]` `SegmentFeaturedDoc` — `{ tabLabel: string; content: string }`
        *   `[✅]` `SegmentHowItWorksStep` — `{ stage: number; title: string; description: string }`
        *   `[✅]` `SegmentContent` — full typed object with all fields: slug, headline, oneLiner, painStatement, scenario, exampleInput, featuredDocs, howItWorksSteps, faqItems, ctaRef, gradient
        *   `[✅]` `SegmentSlug` — union type `'vibecoder' | 'indiehacker' | 'startup' | 'agency'`
        *   `[✅]` `SEGMENT_SLUGS` — array of all valid slugs for route validation
    *   `[✅]` `segmentContent.ts`
        *   `[✅]` Export `segmentContentMap: Record<SegmentSlug, SegmentContent>` with all 4 segments populated
        *   `[✅]` Vibe Coder content from segment-landing-pages.md + `example/use-cases/vibecoder/` markdown files (business_case + actionable_checklist)
        *   `[✅]` Indie Hacker content from segment-landing-pages.md + `example/use-cases/indiehacker/` markdown files (tech_stack + system_architecture)
        *   `[✅]` Startup content from segment-landing-pages.md + `example/use-cases/startup/` markdown files (business_case + product_requirements)
        *   `[✅]` Agency content from segment-landing-pages.md + `example/use-cases/agency/` markdown files (product_requirements + technical_requirements)
        *   `[✅]` Export `SEGMENT_SLUGS` array and `isValidSegmentSlug` type guard
        *   `[✅]` FAQ content: 2-3 Q&A items per segment addressing likely objections
        *   `[✅]` How-it-works: 5 steps per segment with segment-specific language
    *   `[✅]` `directionality`
        *   `[✅]` Domain layer — pure data, no side effects
        *   `[✅]` All dependencies are inward-facing (none)
        *   `[✅]` Provides outward to template component
    *   `[✅]` `requirements`
        *   `[✅]` All 4 segments fully populated with content from the plan doc and example outputs
        *   `[✅]` Types are strict — no optional fields, no `any`
        *   `[✅]` Markdown content imported as raw strings from the example files
        *   `[✅]` Type guard `isValidSegmentSlug` validates route params

*   `[✅]` apps/web/src/components/marketing/`SegmentLandingPage.tsx` **[UI] Shared landing page template component — renders all 8 sections from a SegmentContent object**
    *   `[✅]` `objective`
        *   `[✅]` Render a complete ICP landing page from a `SegmentContent` data object
        *   `[✅]` 8 sections: Hero, Before/After, Sound Familiar, Doc Reader, See All 18, How It Works, FAQ, Final CTA
        *   `[✅]` Auth-aware CTAs (show "Go to Dashboard" for logged-in users)
        *   `[✅]` Functional on mobile, optimized for desktop
    *   `[✅]` `role`
        *   `[✅]` UI presentation — stateless template that renders segment data
    *   `[✅]` `module`
        *   `[✅]` Marketing / landing page presentation layer
        *   `[✅]` Consumes `SegmentContent` type and `MarkdownRenderer` component
    *   `[✅]` `deps`
        *   `[✅]` `segmentContent.types.ts` — domain types, direction: inward
        *   `[✅]` `MarkdownRenderer` — existing common component, direction: lateral (same layer)
        *   `[✅]` `useAuthStore` from `@paynless/store` — auth state for CTA awareness
        *   `[✅]` `Link` from `react-router-dom` — navigation
        *   `[✅]` `motion` from `framer-motion` — animations matching existing marketing components
        *   `[✅]` Lucide icons — consistent with existing icon usage
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `SegmentContent` object passed as prop
        *   `[✅]` `useAuthStore` for `user` state (logged in / logged out)
        *   `[✅]` No concrete imports from higher layers
    *   `[✅]` unit/`SegmentLandingPage.test.tsx`
        *   `[✅]` Renders hero section with segment headline and one-liner
        *   `[✅]` Renders scenario blockquote with segment story
        *   `[✅]` Renders tabbed doc reader with 2 tabs matching featured doc labels
        *   `[✅]` Renders all 18 document titles in the "See All" section
        *   `[✅]` Renders 5 how-it-works steps with segment-specific descriptions
        *   `[✅]` Renders FAQ items with questions and answers
        *   `[✅]` CTA links include correct `ref` param for the segment
        *   `[✅]` Auth-aware: shows "Go to Dashboard" when user is logged in
        *   `[✅]` Auth-aware: shows "Get Started Free" when user is not logged in
    *   `[✅]` `construction`
        *   `[✅]` Single prop: `content: SegmentContent`
        *   `[✅]` No internal state beyond UI toggle for doc reader expand/collapse and active tab
        *   `[✅]` Auth state read from `useAuthStore`
    *   `[✅]` `SegmentLandingPage.tsx`
        *   `[✅]` Hero section: gradient background, headline, one-liner, primary CTA button with `ref` param
        *   `[✅]` Before/After section: example input on left, featured doc titles on right, arrow divider, input messaging
        *   `[✅]` Sound Familiar section: styled blockquote with scenario text
        *   `[✅]` Doc Reader section: tab buttons to switch between 2 docs, `MarkdownRenderer` in contained scrollable div (`max-height: 600px`), expand/collapse toggle
        *   `[✅]` See All 18 section: stage-grouped list of all doc titles, CTA to sign up
        *   `[✅]` How It Works section: 5 steps with icons matching existing `ProcessSteps` component style, segment-specific descriptions
        *   `[✅]` FAQ section: collapsible or simple stacked Q&A items
        *   `[✅]` Final CTA section: closing headline, pricing text, primary/secondary buttons with `ref` param, auth-aware
    *   `[✅]` `directionality`
        *   `[✅]` UI adapter layer — consumes domain data, renders presentation
        *   `[✅]` All dependencies are inward-facing
        *   `[✅]` Provides outward to route component
    *   `[✅]` `requirements`
        *   `[✅]` All 8 sections render correctly with populated content
        *   `[✅]` Tab switching works for doc reader
        *   `[✅]` Expand/collapse toggle works for doc reader
        *   `[✅]` CTA buttons link to `/register?ref={segment}` or `/dashboard` based on auth state
        *   `[✅]` Styling matches existing marketing component patterns (Tailwind, Framer Motion, Lucide icons)
        *   `[✅]` Mobile: sections stack vertically, doc reader full-width, before/after stacked

*   `[✅]` apps/web/src/pages/`SegmentLandingPageRoute.tsx` **[UI] Route component — reads :segment param, validates, renders template**
    *   `[✅]` `objective`
        *   `[✅]` Read the `:segment` route parameter
        *   `[✅]` Validate it against `SEGMENT_SLUGS`
        *   `[✅]` Look up the `SegmentContent` from `segmentContentMap`
        *   `[✅]` Render `SegmentLandingPage` with the content, or redirect to `/` for invalid slugs
    *   `[✅]` `role`
        *   `[✅]` UI routing adapter — bridges React Router params to the template component
    *   `[✅]` `module`
        *   `[✅]` Page-level route handler for segment landing pages
    *   `[✅]` `deps`
        *   `[✅]` `useParams` from `react-router-dom` — reads `:segment` param
        *   `[✅]` `Navigate` from `react-router-dom` — redirect for invalid slugs
        *   `[✅]` `segmentContentMap`, `isValidSegmentSlug` from `segmentContent.ts` — content lookup and validation
        *   `[✅]` `SegmentLandingPage` from `SegmentLandingPage.tsx` — template component
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Route param `:segment` from React Router
        *   `[✅]` `segmentContentMap` for content lookup
    *   `[✅]` unit/`SegmentLandingPageRoute.test.tsx`
        *   `[✅]` Valid slug renders the `SegmentLandingPage` component with correct content
        *   `[✅]` Invalid slug redirects to `/`
    *   `[✅]` `construction`
        *   `[✅]` No props — reads from route params
        *   `[✅]` Stateless — delegates to template
    *   `[✅]` `SegmentLandingPageRoute.tsx`
        *   `[✅]` Read `segment` from `useParams`
        *   `[✅]` Validate with `isValidSegmentSlug`
        *   `[✅]` If invalid, render `<Navigate to="/" replace />`
        *   `[✅]` If valid, render `<SegmentLandingPage content={segmentContentMap[segment]} />`
    *   `[✅]` `directionality`
        *   `[✅]` UI adapter layer — bridges routing to presentation
        *   `[✅]` All dependencies are inward-facing
        *   `[✅]` Provides outward to React Router
    *   `[✅]` `requirements`
        *   `[✅]` All 4 valid slugs render the correct landing page
        *   `[✅]` Any other slug redirects to home

*   `[✅]` apps/web/`vite.config.ts` **[Build] Add vite-plugin-prerender for static HTML generation at build time**
    *   `[✅]` `objective`
        *   `[✅]` Install and configure `vite-plugin-prerender` and `vite-plugin-prerender-esm-fix` to generate static HTML files for the 4 segment landing pages at build time
        *   `[✅]` Enables immediate SEO indexing — Google sees real HTML, not a JS shell
        *   `[✅]` No SSR runtime required — build step produces `/vibecoder/index.html`, `/indiehacker/index.html`, etc.
        *   `[✅]` Rest of the SPA remains unchanged — only the 4 segment routes get prerendered
    *   `[✅]` `role`
        *   `[✅]` Build infrastructure — Vite plugin configuration
    *   `[✅]` `module`
        *   `[✅]` Build tooling layer
    *   `[✅]` `deps`
        *   `[✅]` `vite-plugin-prerender` — npm dev dependency, direction: external
        *   `[✅]` `vite-plugin-prerender-esm-fix` — npm dev dependency, direction: external
        *   `[✅]` Existing Vite config — direction: lateral (same layer)
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Vite plugin array in `vite.config.ts`
        *   `[✅]` List of routes to prerender: `/vibecoder`, `/indiehacker`, `/startup`, `/agency`
    *   `[✅]` `installation`
        *   `[✅]` Run `pnpm add -D vite-plugin-prerender --filter @paynless/web`
        *   `[✅]` Run `pnpm add -D vite-plugin-prerender-esm-fix --filter @paynless/web`
    *   `[✅]` `vite.config.ts`
        *   `[✅]` Import `vitePrerender` from `vite-plugin-prerender-esm-fix`
        *   `[✅]` Add to plugins array after existing plugins
        *   `[✅]` Configure with routes array: `['/vibecoder', '/indiehacker', '/startup', '/agency']`
        *   `[✅]` Set `staticDir` to match `build.outDir` (defaults to `dist`)
        *   `[✅]` Optional: configure `renderer` options if Puppeteer needs flags (headless, etc.)
    *   `[✅]` `directionality`
        *   `[✅]` Infrastructure layer — build-time only, no runtime impact
        *   `[✅]` Consumes route paths (hardcoded list)
        *   `[✅]` Outputs static HTML files to dist folder
    *   `[✅]` `requirements`
        *   `[✅]` Build succeeds with prerender plugin enabled
        *   `[✅]` `dist/vibecoder/index.html` (and 3 others) exist after build
        *   `[✅]` HTML files contain rendered content (not empty shell)
        *   `[✅]` Existing SPA routes still work (prerender doesn't break client routing)
        *   `[✅]` Dev server (`pnpm dev`) still works normally

*   `[✅]` apps/web/src/routes/`routes.tsx` **[UI] Add segment landing page routes to React Router**
    *   `[✅]` `objective`
        *   `[✅]` Add routes for `/vibecoder`, `/indiehacker`, `/startup`, `/agency` pointing to `SegmentLandingPageRoute`
        *   `[✅]` Routes are public (no `ProtectedRoute` wrapper)
        *   `[✅]` Lazy-loaded consistent with existing route patterns
        *   `[✅]` These routes are prerendered at build time by `vite-plugin-prerender` (configured in prior node)
    *   `[✅]` `role`
        *   `[✅]` Infrastructure — routing configuration
    *   `[✅]` `module`
        *   `[✅]` App routing layer
    *   `[✅]` `deps`
        *   `[✅]` `SegmentLandingPageRoute` — page component, direction: inward
        *   `[✅]` `vite-plugin-prerender` — build-time consumer of these routes (configured in vite.config.ts)
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` React Router route configuration array
    *   `[✅]` `routes.tsx`
        *   `[✅]` Add lazy import for `SegmentLandingPageRoute`
        *   `[✅]` Add 4 route entries: `{ path: 'vibecoder', element: <SegmentLandingPageRoute /> }` and same for `indiehacker`, `startup`, `agency`
        *   `[✅]` Place routes before the catch-all `*` redirect
    *   `[✅]` `directionality`
        *   `[✅]` Infrastructure layer — wires routes to components
        *   `[✅]` All dependencies are inward-facing
    *   `[✅]` `requirements`
        *   `[✅]` All 4 segment routes resolve correctly
        *   `[✅]` Routes are public, no auth required
        *   `[✅]` Lazy loaded to avoid bloating initial bundle

*   `[ ]` apps/web/src/components/marketing/`UseCases.tsx` **[UI] Update homepage cards to link to segment landing pages**
    *   `[ ]` `objective`
        *   `[ ]` Replace current 4 card content with the 4 defined ICP segments
        *   `[ ]` Each card links to `/{segment-slug}`
        *   `[ ]` Cards use segment one-liners and pain-focused summaries from the plan doc
    *   `[ ]` `role`
        *   `[ ]` UI presentation — homepage marketing section
    *   `[ ]` `module`
        *   `[ ]` Marketing / homepage components
    *   `[ ]` `deps`
        *   `[ ]` `Link` from `react-router-dom` — navigation to segment pages
        *   `[ ]` Existing component dependencies (framer-motion, lucide-react) remain unchanged
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` No new dependencies — self-contained component with static data
    *   `[ ]` `UseCases.tsx`
        *   `[ ]` Update `useCases` array to 4 segments: Vibe Coders, Indie Hackers, Startups, Agencies
        *   `[ ]` Each card: title, one-liner description, 3 bullet items from segment pain/value, appropriate icon, gradient
        *   `[ ]` Wrap each card in `<Link to="/{slug}">` making the entire card clickable
        *   `[ ]` Slugs: `vibecoder`, `indiehacker`, `startup`, `agency`
        *   `[ ]` Update section heading/subheading to match segment-focused messaging
    *   `[ ]` `directionality`
        *   `[ ]` UI adapter layer — homepage presentation
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` All 4 cards display correct segment content
        *   `[ ]` All 4 cards link to the correct segment landing page
        *   `[ ]` Existing animation/layout behavior preserved
        *   `[ ]` No new icons needed if existing Lucide icons fit (Rocket, Code2, Building2 + one more)

*   `[ ]` apps/web/src/components/auth/`RegisterForm.tsx` **[UI] Read ref param, fix ConvertKit newsletter subscription, add PostHog segment tracking on registration**
    *   `[ ]` `objective`
        *   `[ ]` Read `ref` query parameter from URL (e.g., `/register?ref=vibecoder`)
        *   `[ ]` Fix the broken newsletter subscription flow — currently calls a non-existent `subscribe-to-newsletter` edge function
        *   `[ ]` Pass `ref` (segment cohort) through the newsletter subscription so ConvertKit (Kit) captures the subscriber's segment
        *   `[ ]` After successful registration, call PostHog `identify` and `track` with `signup_segment` property
        *   `[ ]` Default segment to `direct` when no `ref` param is present
    *   `[ ]` `role`
        *   `[ ]` UI adapter — bridges URL params to email marketing (ConvertKit) and behavioral analytics (PostHog)
    *   `[ ]` `module`
        *   `[ ]` Auth / registration flow — modifies existing `RegisterForm` component and `subscribeToNewsletter` action
    *   `[ ]` `deps`
        *   `[ ]` `useSearchParams` from `react-router-dom` — reads `ref` from URL query params
        *   `[ ]` `analytics` from `@paynless/analytics` — PostHog singleton for `identify`/`track` calls
        *   `[ ]` `useAuthStore` — existing `register`, `subscribeToNewsletter` actions, and `user` state
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` URL search params for `ref` value
        *   `[ ]` `analytics` singleton (PostHog adapter) for `identify` and `track`
        *   `[ ]` `useAuthStore` for `register()`, `subscribeToNewsletter()`, and post-registration `user` object (for userId)
    *   `[ ]` `current_state`
        *   `[ ]` `RegisterForm.tsx` has email/password fields and a newsletter checkbox (`subscribe` state)
        *   `[ ]` On submit: calls `register(email, password)` then conditionally `subscribeToNewsletter(email)`
        *   `[ ]` `subscribeToNewsletter` in authStore calls `supabase.functions.invoke('subscribe-to-newsletter', { body: { email } })` — **this edge function was deleted** because it tried to read the user's email from Supabase's auth table, which Supabase blocks for direct application reads. An attempt to mirror email into the profile table created further issues. The intended fix was always to pass the email directly from the signup form input instead of reading it from auth post-hoc.
        *   `[ ]` `on-user-created` Auth Hook auto-subscribes ALL new users to a single Kit tag via `addUserToList(userData)` — no segment, no cohort
        *   `[ ]` Kit's `addUserToList` posts to `/v1/tags/{tagId}/subscribe` with email + custom fields (userId, createdAt) — no segment field
        *   `[ ]` PostHog has zero calls in the registration flow — no `identify`, no `track`
        *   `[ ]` `register()` in authStore calls `supabase.auth.signUp({ email, password })` and returns — no analytics
    *   `[ ]` `changes_needed`
        *   `[ ]` **RegisterForm.tsx:**
            *   `[ ]` Add `useSearchParams` to read `ref` from URL, default to `'direct'`
            *   `[ ]` After `register()` succeeds, read user ID from auth store state
            *   `[ ]` Call `analytics.identify(userId, { signup_segment: ref })` to set PostHog user property
            *   `[ ]` Call `analytics.track('user_registered', { signup_segment: ref })` to capture registration event
            *   `[ ]` Pass `ref` to `subscribeToNewsletter` call: `subscribeToNewsletter(email, ref)`
        *   `[ ]` **authStore.ts — `subscribeToNewsletter` action:**
            *   `[ ]` Update signature to accept segment: `subscribeToNewsletter(email: string, segment?: string)`
            *   `[ ]` Update the `supabase.functions.invoke` call to target the new `subscribe-to-newsletter` edge function with `{ email, segment }` body
        *   `[ ]` **supabase/functions/`subscribe-to-newsletter`/ — new edge function:**
            *   `[ ]` Create the edge function that was previously deleted
            *   `[ ]` Accepts `{ email, segment }` directly from the client — no auth table reads needed, email comes straight from the signup form input
            *   `[ ]` Uses `getEmailMarketingService()` factory (same pattern as `on-user-created`)
            *   `[ ]` Calls Kit's `addUserToList` with the email and segment value
            *   `[ ]` **Decision needed:** Kit segment strategy — per-segment Kit tags (5 tag IDs, passed dynamically) or Kit custom field storing the segment value on a single tag? This determines how the edge function passes segment to Kit.
        *   `[ ]` **Kit integration (whichever approach chosen):**
            *   `[ ]` If per-segment tags: edge function receives segment → looks up tag ID → calls Kit with segment-specific `tagId`
            *   `[ ]` If custom field: edge function passes segment as a Kit `fields` value in `addUserToList` payload
    *   `[ ]` unit/`RegisterForm.test.tsx`
        *   `[ ]` With `ref=vibecoder` in URL: PostHog `identify` called with `{ signup_segment: 'vibecoder' }`
        *   `[ ]` With `ref=vibecoder` in URL: PostHog `track` called with `('user_registered', { signup_segment: 'vibecoder' })`
        *   `[ ]` With no `ref` param: PostHog calls use `signup_segment: 'direct'`
        *   `[ ]` With unknown `ref` value: passes through raw value (no validation)
        *   `[ ]` Newsletter checkbox checked: `subscribeToNewsletter` called with email AND segment
        *   `[ ]` Newsletter checkbox unchecked: `subscribeToNewsletter` NOT called
        *   `[ ]` Existing registration behavior (form validation, navigation, error display) unchanged
    *   `[ ]` `directionality`
        *   `[ ]` UI adapter layer — bridges URL params → analytics + email marketing
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` Every sign-up is tagged with a segment in PostHog — no sign-up goes untracked
        *   `[ ]` Newsletter subscribers in Kit are tagged with their acquisition segment
        *   `[ ]` `ref` param values pass through cleanly to both PostHog and Kit
        *   `[ ]` Default `direct` applied when no `ref` present
        *   `[ ]` Existing registration UX is not altered (form fields, validation, navigation)
        *   `[ ]` Newsletter subscription no longer silently fails
    *   `[ ]` `manual_setup` (not code)
        *   `[ ]` ConvertKit: create segment tags or custom field in Kit dashboard for the 5 cohorts
        *   `[ ]` PostHog: create 5 cohorts in PostHog dashboard filtered by `signup_segment` user property
    *   `[ ]` **Commit** `feat(landing-pages): add ICP segment landing pages with ConvertKit + PostHog tracking`
        *   `[ ]` Created segment content data types and data file with all 4 ICP segments
        *   `[ ]` Created shared landing page template component with 8 sections
        *   `[ ]` Created route component that validates segment param and renders template
        *   `[ ]` Added 4 segment routes to React Router
        *   `[ ]` Updated homepage UseCases cards to link to segment landing pages
        *   `[ ]` Fixed broken newsletter subscription flow and added segment cohort tagging via ConvertKit
        *   `[ ]` Added PostHog identify + track calls on registration with signup_segment property

* Add landing page badges to top of home page 
* Add pricing to home page 
* Add pricing landing page to top of home page 


---

# Backlog

## StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
- Update StageDAGProgressDialog to use notifications to change color too

## Highlight the chosen Chat or Project in the left sidebar
- Currently the sidebar gives no indication of which Chat or Project the user has focused
- Outline and/or highlight the chosen Chat or Project in the left sidebar

## New user sign in banner doesn't display, throws console error
- Chase, diagnose, fix

## Refactor EMCAS to break apart the functions, segment out the tests
- Move gatherArtifacts call to processSimpleJob
- Decide where to measure & RAG

## Switch to stream-to-buffer instead of chunking
- This lets us render the buffer in real time to show document progress

## Build test fixtures for major function groups
- Provide standard mock factories and objects
- dialectic-worker, dialectic-service, document_renderer, anything else that has huge test files

## Support user-provided API keys for their preferred providers

## Regenerate existing document from user feedback & edits

## Have an additional user input panel where they user can build their own hybrid versions from the ones provided
AND/OR
## Let the user pick/rate their preferred version and drop the others

## Use a gentle color schema to differentiate model outputs visually / at a glance

## When doc loads for the first time, position at top

## Search across documents for key terms

## Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?"

## Add optional outputs for selected stages
- A "landing page" output for the proposal stage
-- Landing page
-- Hero banner
-- Call to action
-- Email sign up
- A "financial analysis" output for the "refinement" stage
-- 1/3/5 year
-- Conservative / base / aggressive
-- IS, BS, CF
- A "generate next set of work" for the implementation stage

## Ensure front end components use friendly names
- SessionInfoCard uses formal names instead of friendly names

## 504 Gateway Timeout on back end
- Not failed, not running
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)
