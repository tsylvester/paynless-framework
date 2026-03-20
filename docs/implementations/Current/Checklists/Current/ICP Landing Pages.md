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

*   `[✅]` apps/web/src/components/marketing/`UseCases.tsx` **[UI] Update homepage cards to link to segment landing pages**
    *   `[✅]` `objective`
        *   `[✅]` Replace current 4 card content with the 4 defined ICP segments
        *   `[✅]` Each card links to `/{segment-slug}`
        *   `[✅]` Cards use segment one-liners and pain-focused summaries from the plan doc
    *   `[✅]` `role`
        *   `[✅]` UI presentation — homepage marketing section
    *   `[✅]` `module`
        *   `[✅]` Marketing / homepage components
    *   `[✅]` `deps`
        *   `[✅]` `Link` from `react-router-dom` — navigation to segment pages
        *   `[✅]` Existing component dependencies (framer-motion, lucide-react) remain unchanged
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` No new dependencies — self-contained component with static data
    *   `[✅]` `UseCases.tsx`
        *   `[✅]` Update `useCases` array to 4 segments: Vibe Coders, Indie Hackers, Startups, Agencies
        *   `[✅]` Each card: title, one-liner description, 3 bullet items from segment pain/value, appropriate icon, gradient
        *   `[✅]` Wrap each card in `<Link to="/{slug}">` making the entire card clickable
        *   `[✅]` Slugs: `vibecoder`, `indiehacker`, `startup`, `agency`
        *   `[✅]` Update section heading/subheading to match segment-focused messaging
    *   `[✅]` `directionality`
        *   `[✅]` UI adapter layer — homepage presentation
        *   `[✅]` All dependencies are inward-facing
    *   `[✅]` `requirements`
        *   `[✅]` All 4 cards display correct segment content
        *   `[✅]` All 4 cards link to the correct segment landing page
        *   `[✅]` Existing animation/layout behavior preserved
        *   `[✅]` No new icons needed if existing Lucide icons fit (Rocket, Code2, Building2 + one more)

*   `[✅]` apps/web/src/components/marketing/`PricingSection.tsx` **[UI] Simplified pricing explanation for homepage — free tier, base paid tier, link to full pricing**
    *   `[✅]` `objective`
        *   `[✅]` Render a simplified pricing explanation section for the homepage
        *   `[✅]` Display: 1M tokens on signup, free users get 100k/mo, $19.99 for 1M tokens/mo
        *   `[✅]` Note availability of Extra, Premium, Annual, and larger OTP options
        *   `[✅]` Link to `/pricing` for full pricing details
        *   `[✅]` Auth-aware CTAs: "Get Started Free" for unauth, "View Plans" for auth users
    *   `[✅]` `role`
        *   `[✅]` UI presentation — marketing section for homepage
    *   `[✅]` `module`
        *   `[✅]` Marketing / homepage components
    *   `[✅]` `deps`
        *   `[✅]` `motion` from `framer-motion` — animations consistent with other marketing sections
        *   `[✅]` `Link` from `react-router-dom` — navigation to /pricing and /register
        *   `[✅]` `useAuthStore` from `@paynless/store` — auth-aware CTA rendering
        *   `[✅]` Lucide icons (`Sparkles`, `ArrowRight`, `Check`) — consistent iconography
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Auth state for CTA button text
    *   `[✅]` unit/`PricingSection.test.tsx`
        *   `[✅]` Renders section heading
        *   `[✅]` Displays "1M tokens on signup" messaging
        *   `[✅]` Displays free tier info (100k tokens/mo)
        *   `[✅]` Displays base paid tier ($19.99 for 1M tokens/mo)
        *   `[✅]` Displays "more options available" text with link to /pricing
        *   `[✅]` CTA shows "Get Started Free" when not authenticated
        *   `[✅]` CTA shows "View Plans" when authenticated
        *   `[✅]` Link to /pricing renders correctly
    *   `[✅]` `construction`
        *   `[✅]` No required props — self-contained marketing section
    *   `[✅]` `PricingSection.tsx`
        *   `[✅]` Section heading: "Simple, Transparent Pricing"
        *   `[✅]` Signup bonus callout: "1M tokens free on signup"
        *   `[✅]` Two-column or card layout: Free tier vs Base paid tier
        *   `[✅]` Free tier: $0/mo, 100k tokens/mo, basic features
        *   `[✅]` Base paid tier: $19.99/mo, 1M tokens/mo, full features
        *   `[✅]` Footer text: "Extra, Premium, Annual, and larger one-time purchases available"
        *   `[✅]` "See all pricing options" link to `/pricing`
        *   `[✅]` Auth-aware primary CTA button
        *   `[✅]` Styling matches existing marketing section patterns
    *   `[✅]` `directionality`
        *   `[✅]` UI adapter layer — consumes auth store, renders presentation
        *   `[✅]` All dependencies are inward-facing
        *   `[✅]` Provides outward to Home.tsx
    *   `[✅]` `requirements`
        *   `[✅]` Clear, simple pricing explanation without overwhelming detail
        *   `[✅]` Responsive layout (mobile-first)
        *   `[✅]` Consistent animation and styling with existing marketing components

*   `[✅]` apps/web/src/pages/`PricingPage.tsx` **[UI] Public pricing page — full pricing options display at /pricing**
    *   `[✅]` `objective`
        *   `[✅]` Dedicated public pricing page at `/pricing`
        *   `[✅]` Display all subscription plans (Free, Monthly tiers, Annual tiers, One-time purchases)
        *   `[✅]` No authentication required — fully public page
        *   `[✅]` CTAs link to `/register?ref=pricing` for conversion tracking
    *   `[✅]` `role`
        *   `[✅]` UI page — public-facing pricing information
    *   `[✅]` `module`
        *   `[✅]` Pages layer — route-level component
    *   `[✅]` `deps`
        *   `[✅]` `motion` from `framer-motion` — page animations
        *   `[✅]` `Link` from `react-router-dom` — CTA navigation
        *   `[✅]` `useAuthStore` from `@paynless/store` — auth-aware CTAs
        *   `[✅]` Lucide icons (`Check`, `Sparkles`, `ArrowRight`) — feature lists
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Auth state for CTA rendering
    *   `[✅]` unit/`PricingPage.test.tsx`
        *   `[✅]` Renders page heading "Pricing"
        *   `[✅]` Renders Free plan card
        *   `[✅]` Renders Monthly plan cards
        *   `[✅]` Renders Annual plan cards with savings callout
        *   `[✅]` Renders One-time purchase options
        *   `[✅]` CTA buttons link to `/register?ref=pricing` when not authenticated
        *   `[✅]` CTA buttons link to `/subscription` when authenticated
        *   `[✅]` FAQ section renders
        *   `[✅]` Accessible without authentication
    *   `[✅]` `construction`
        *   `[✅]` No props — route-level page
    *   `[✅]` `PricingPage.tsx`
        *   `[✅]` Page wrapper with max-width container
        *   `[✅]` Hero: "Choose Your Plan" heading with signup bonus callout
        *   `[✅]` Tabs or sections: Monthly / Annual / One-Time
        *   `[✅]` Plan cards grid with features, pricing, CTAs
        *   `[✅]` Free plan always visible
        *   `[✅]` FAQ section (reuse content pattern from SubscriptionPage)
        *   `[✅]` All CTAs include `?ref=pricing` param for unauth users
        *   `[✅]` Auth users see "Manage Subscription" linking to /subscription
    *   `[✅]` `directionality`
        *   `[✅]` UI page layer — composes presentation
        *   `[✅]` All dependencies are inward-facing
        *   `[✅]` Provides outward to routes.tsx
    *   `[✅]` `requirements`
        *   `[✅]` Page renders fully without authentication
        *   `[✅]` All plan tiers displayed with clear pricing
        *   `[✅]` Conversion tracking via `ref=pricing` param
        *   `[✅]` Consistent styling with other marketing pages

*   `[✅]` apps/web/src/routes/`routes.tsx` **[UI] Add public /pricing route**
    *   `[✅]` `objective`
        *   `[✅]` Add route for `/pricing` pointing to `PricingPage`
        *   `[✅]` Route is public (no `ProtectedRoute` wrapper)
        *   `[✅]` Lazy-loaded consistent with existing route patterns
        *   `[✅]` Place route before the `:segment` catch route
    *   `[✅]` `role`
        *   `[✅]` Infrastructure — routing configuration
    *   `[✅]` `module`
        *   `[✅]` App routing layer
    *   `[✅]` `deps`
        *   `[✅]` `PricingPage` — page component, direction: inward
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` React Router route configuration array
    *   `[✅]` unit/`routes.test.tsx` (update existing)
        *   `[✅]` `/pricing` route resolves to PricingPage
        *   `[✅]` `/pricing` route is accessible without authentication
    *   `[✅]` `routes.tsx`
        *   `[✅]` Add lazy import for `PricingPage`
        *   `[✅]` Add route entry: `{ path: 'pricing', element: <PricingPage /> }`
        *   `[✅]` Place before `:segment` route to avoid segment validation conflict
    *   `[✅]` `directionality`
        *   `[✅]` Infrastructure layer — wires routes to components
        *   `[✅]` All dependencies are inward-facing
    *   `[✅]` `requirements`
        *   `[✅]` `/pricing` route resolves correctly
        *   `[✅]` Route is public, no auth required
        *   `[✅]` Lazy loaded

*   `[✅]` apps/web/src/pages/`Home.tsx` **[UI] Add navigation badges and PricingSection to homepage**
    *   `[✅]` `objective`
        *   `[✅]` Add styled navigation links ("badges") to ICP landing pages and pricing page
        *   `[✅]` Position badges in upper-right area of Hero section, above the fold
        *   `[✅]` Add `PricingSection` component between UseCases and CTASection
        *   `[✅]` Maintain existing section order with new elements integrated
    *   `[✅]` `role`
        *   `[✅]` UI page — homepage composition
    *   `[✅]` `module`
        *   `[✅]` Pages layer — root landing page
    *   `[✅]` `deps`
        *   `[✅]` `PricingSection` from `../components/marketing/PricingSection` — new import
        *   `[✅]` `Link` from `react-router-dom` — badge navigation (already imported)
        *   `[✅]` Existing marketing component imports unchanged
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` No new context requirements
    *   `[✅]` unit/`Home.test.tsx` (create or update)
        *   `[✅]` Renders navigation badges section with 5 links
        *   `[✅]` Badge links point to correct routes (/vibecoder, /indiehacker, /startup, /agency, /pricing)
        *   `[✅]` Badges positioned in Hero section
        *   `[✅]` Renders PricingSection component
        *   `[✅]` Section order: Hero (with badges) → ProcessSteps → StatsSection → FeatureCards → UseCases → PricingSection → CTASection
    *   `[✅]` `Home.tsx`
        *   `[✅]` Import `PricingSection`
        *   `[✅]` Add navigation badges in Hero section upper-right area
        *   `[✅]` Badge links: "Vibe Coders", "Indie Hackers", "Startups", "Agencies", "Pricing"
        *   `[✅]` Simple styled links (pills/buttons), not large cards
        *   `[✅]` Add `<PricingSection />` between UseCases and CTASection
    *   `[✅]` `directionality`
        *   `[✅]` UI page layer — composes marketing components
        *   `[✅]` All dependencies are inward-facing
    *   `[✅]` `requirements`
        *   `[✅]` Badges visible above the fold in upper-right Hero area
        *   `[✅]` All 5 badge links functional
        *   `[✅]` PricingSection renders between UseCases and CTASection
        *   `[✅]` No layout breaks on mobile or desktop

*   `[✅]` apps/web/src/components/sidebar/`app-sidebar.tsx` **[UI] Add unauth-only navigation section with ICP and pricing links**
    *   `[✅]` `objective`
        *   `[✅]` Add new navigation section visible only to unauthenticated users
        *   `[✅]` Section contains links to 4 ICP landing pages and pricing page
        *   `[✅]` Position below existing navMain, above Login button
        *   `[✅]` Authenticated users do not see this section
    *   `[✅]` `role`
        *   `[✅]` UI navigation — app sidebar
    *   `[✅]` `module`
        *   `[✅]` Sidebar / navigation components
    *   `[✅]` `deps`
        *   `[✅]` Existing imports unchanged
        *   `[✅]` Lucide icons (`DollarSign`, `Code`, `Rocket`, `Users`, `Building2`) for nav items
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Auth state from existing `useAuthStore` usage
    *   `[✅]` unit/`app-sidebar.test.tsx` (update existing)
        *   `[✅]` When unauthenticated: renders "Explore" section with 5 links
        *   `[✅]` Explore section contains: Vibe Coders, Indie Hackers, Startups, Agencies, Pricing
        *   `[✅]` Links navigate to correct routes
        *   `[✅]` When authenticated: Explore section is NOT rendered
        *   `[✅]` Existing navMain items still render for both auth states
    *   `[✅]` `app-sidebar.tsx`
        *   `[✅]` Define `navExplore` array for unauth navigation:
            *   `[✅]` "Vibe Coders" → `/vibecoder` (Code icon)
            *   `[✅]` "Indie Hackers" → `/indiehacker` (Rocket icon)
            *   `[✅]` "Startups" → `/startup` (Users icon)
            *   `[✅]` "Agencies" → `/agency` (Building2 icon)
            *   `[✅]` "Pricing" → `/pricing` (DollarSign icon)
        *   `[✅]` Render `navExplore` section in NO_AUTH state only
        *   `[✅]` Position between navMain and Login button
        *   `[✅]` Use existing `NavMain` component pattern for rendering
    *   `[✅]` `directionality`
        *   `[✅]` UI adapter layer — navigation component
        *   `[✅]` All dependencies are inward-facing
    *   `[✅]` `requirements`
        *   `[✅]` Unauth users see Explore section with all 5 links
        *   `[✅]` Auth users do not see Explore section
        *   `[✅]` Links work correctly
        *   `[✅]` Sidebar styling consistent with existing items

*   `[ ]` supabase/migrations/`YYYYMMDDHHMMSS_newsletter_events.sql` **[DB] Extend user_profiles, create newsletter_events table, trigger, and RLS**
    *   `[ ]` `objective`
        *   `[ ]` Add newsletter subscription tracking columns to `user_profiles`
        *   `[ ]` Create `newsletter_events` queue table for event-driven Kit integration
        *   `[ ]` Create DB trigger on `user_profiles.is_subscribed_to_newsletter` to manage timestamps and insert events idempotently
        *   `[ ]` Lock down RLS so new columns and new table are service-role only
    *   `[ ]` `role`
        *   `[ ]` Infrastructure — database schema, triggers, and security policies
    *   `[ ]` `module`
        *   `[ ]` Newsletter event queue — foundation for all downstream Kit integration
    *   `[ ]` `deps`
        *   `[ ]` `user_profiles` table — existing, extended with new columns
        *   `[ ]` `auth.users` — FK target for `newsletter_events.user_id`
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` `user_profiles` table schema and existing RLS UPDATE policy
        *   `[ ]` `auth.users` for FK reference
    *   `[ ]` `user_profiles` alterations
        *   `[ ]` Add `subscribed_at` (timestamptz, nullable, default null)
        *   `[ ]` Add `unsubscribed_at` (timestamptz, nullable, default null)
        *   `[ ]` Add `signup_ref` (text, nullable, default null) — set once at registration, never changed by user
        *   `[ ]` Add `synced_to_kit_at` (timestamptz, nullable, default null) — set by sync script on success
    *   `[ ]` `newsletter_events` table creation
        *   `[ ]` `id` uuid PK default `gen_random_uuid()`
        *   `[ ]` `user_id` uuid NOT NULL FK → `auth.users(id)` ON DELETE CASCADE
        *   `[ ]` `event_type` text NOT NULL — values: `'subscribe'`, `'unsubscribe'`
        *   `[ ]` `created_at` timestamptz NOT NULL default `now()`
        *   `[ ]` `processed_at` timestamptz nullable default null
        *   `[ ]` `ref` text nullable — copied from `user_profiles.signup_ref` at event creation time
        *   `[ ]` Index on `newsletter_events` WHERE `processed_at IS NULL` for queue polling
    *   `[ ]` RLS policies
        *   `[ ]` `newsletter_events`: enable RLS, deny all to `anon` and `authenticated`, service_role only
        *   `[ ]` `user_profiles` UPDATE policy: exclude `signup_ref`, `synced_to_kit_at`, `subscribed_at`, `unsubscribed_at` from client-writable columns — these are managed by trigger or service_role only
    *   `[ ]` Trigger function `handle_newsletter_subscription_change()`
        *   `[ ]` AFTER UPDATE OF `is_subscribed_to_newsletter` ON `user_profiles`
        *   `[ ]` When `NEW.is_subscribed_to_newsletter = true` AND `OLD.is_subscribed_to_newsletter IS DISTINCT FROM true`:
            *   `[ ]` Set `NEW.subscribed_at = now()` if `OLD.subscribed_at IS NULL`
            *   `[ ]` Set `NEW.unsubscribed_at = NULL`
            *   `[ ]` INSERT into `newsletter_events` (`user_id`, `event_type`, `ref`) VALUES (`NEW.id`, `'subscribe'`, `NEW.signup_ref`)
        *   `[ ]` When `NEW.is_subscribed_to_newsletter = false` AND `OLD.is_subscribed_to_newsletter = true`:
            *   `[ ]` Set `NEW.unsubscribed_at = now()`
            *   `[ ]` INSERT into `newsletter_events` (`user_id`, `event_type`, `ref`) VALUES (`NEW.id`, `'unsubscribe'`, `NEW.signup_ref`)
    *   `[ ]` `directionality`
        *   `[ ]` Infrastructure layer — database schema, no application code dependency
        *   `[ ]` All downstream consumers (edge functions, store) depend on this
        *   `[ ]` No reverse dependencies
    *   `[ ]` `requirements`
        *   `[ ]` Migration applies cleanly to existing database with 200+ users
        *   `[ ]` Existing `is_subscribed_to_newsletter` values (all false) do not trigger events on migration
        *   `[ ]` Trigger is idempotent — flipping true→true does not duplicate events
        *   `[ ]` New columns default to null, no data backfill required
        *   `[ ]` RLS prevents client-side writes to service-managed columns
    *   `[ ]` Exempt from TDD (SQL migration)

*   `[ ]` supabase/functions/_shared/email_service/`kit_tags.config.ts` **[BE] Kit tag-to-ref mapping configuration**
    *   `[ ]` `objective`
        *   `[ ]` Provide a single source of truth mapping ref slugs to Kit tag IDs
        *   `[ ]` Extensible — adding a new funnel ref requires adding one line
        *   `[ ]` Not in .env — these are not secrets, they're configuration
    *   `[ ]` `role`
        *   `[ ]` Domain configuration — static data consumed by Kit adapter and edge functions
    *   `[ ]` `module`
        *   `[ ]` Email service configuration layer
        *   `[ ]` No runtime dependencies — pure data export
    *   `[ ]` `deps`
        *   `[ ]` None — leaf config file
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` No dependencies — exports typed config objects
    *   `[ ]` `kit_tags.config.ts`
        *   `[ ]` Export `KitTagConfig` type: `{ tagId: string; description: string }`
        *   `[ ]` Export `kitTagMap: Record<string, KitTagConfig>` with placeholder tag IDs for: `vibecoder`, `indiehacker`, `startup`, `agency`, `pricing`, `direct`, `legacy_user`, `no_explicit_opt_in`
        *   `[ ]` Export `getTagIdForRef(ref: string): string | null` — looks up ref in map, returns tagId or null for unknown refs
        *   `[ ]` Export `KIT_NEWSLETTER_TAG_ID: string` — the primary newsletter tag (used for soft-unsub removal)
    *   `[ ]` `directionality`
        *   `[ ]` Domain configuration layer — pure data, no side effects
        *   `[ ]` All dependencies are inward-facing (none)
        *   `[ ]` Provides outward to Kit service and edge functions
    *   `[ ]` `requirements`
        *   `[ ]` All 8 ref slugs mapped with placeholder tag IDs
        *   `[ ]` `getTagIdForRef` returns null for unknown refs (does not throw)
        *   `[ ]` User fills in actual tag IDs after creating tags in Kit dashboard
    *   `[ ]` Exempt from TDD (config/types)

*   `[ ]` supabase/functions/_shared/email_service/`kit_service.ts` **[BE] Rewrite Kit service to API v4 + add tag management methods**
    *   `[ ]` `objective`
        *   `[ ]` Migrate Kit service from broken v1/v3 endpoints to Kit API v4 (`https://api.kit.com/v4/`)
        *   `[ ]` Fix authentication: `X-Kit-Api-Key` header instead of `api_key` in body/query
        *   `[ ]` Fix field naming: `email_address` instead of `email`
        *   `[ ]` Add tag management methods for per-ref tagging
    *   `[ ]` `role`
        *   `[ ]` Adapter — external service integration with Kit email marketing platform
    *   `[ ]` `module`
        *   `[ ]` Email service adapter layer
        *   `[ ]` Consumes `kit_tags.config.ts` for tag lookups
    *   `[ ]` `deps`
        *   `[ ]` `kit_tags.config.ts` — tag ID lookups, direction: inward (config)
        *   `[ ]` `EmailMarketingService` interface from `../types.ts` — contract, direction: inward
        *   `[ ]` `UserData` type from `../types.ts` — data shape, direction: inward
        *   `[ ]` `logger` from `../logger.ts` — logging, direction: lateral
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` `KitServiceConfig` for API key and base URL
        *   `[ ]` `kitTagMap` for ref→tagId resolution
    *   `[ ]` interface/`EmailMarketingService` updates (in `../types.ts` and `packages/types/src/email.types.ts`)
        *   `[ ]` Add `addTagToSubscriber(email: string, tagId: string): Promise<void>`
        *   `[ ]` Add `removeTagFromSubscriber(email: string, tagId: string): Promise<void>`
    *   `[ ]` interface/`KitServiceConfig` updates
        *   `[ ]` Remove `tagId` as required single value (tags are now per-ref via config)
        *   `[ ]` Keep `apiKey`, `baseUrl`, `customUserIdField`, `customCreatedAtField`
    *   `[ ]` unit/`kit_service.test.ts`
        *   `[ ]` `makeApiRequest` sends `X-Kit-Api-Key` header, not `api_key` in body
        *   `[ ]` `addUserToList` calls `POST /v4/subscribers` with `email_address` field
        *   `[ ]` `findSubscriberIdByEmail` calls `GET /v4/subscribers?email_address=...`
        *   `[ ]` `updateUserAttributes` calls `PATCH /v4/subscribers/{id}` (not PUT)
        *   `[ ]` `addTagToSubscriber` calls `POST /v4/tags/{tagId}/subscribers` with `{"email_address": "..."}`
        *   `[ ]` `removeTagFromSubscriber` calls `DELETE /v4/tags/{tagId}/subscribers` with `{"email_address": "..."}`
        *   `[ ]` Error handling: non-OK responses throw with status and message
        *   `[ ]` 204 responses handled correctly (no body parsing)
    *   `[ ]` `construction`
        *   `[ ]` Constructor accepts `KitServiceConfig` (apiKey, baseUrl required)
        *   `[ ]` No tag ID required at construction — tags resolved per-call
    *   `[ ]` `kit_service.ts`
        *   `[ ]` Rewrite `makeApiRequest`: auth via `X-Kit-Api-Key` header for all methods, remove `api_key` body/query injection
        *   `[ ]` Rewrite `addUserToList`: `POST /v4/subscribers` with `{ email_address, first_name, fields: {...} }`
        *   `[ ]` Rewrite `findSubscriberIdByEmail`: `GET /v4/subscribers?email_address=...` with API key in header
        *   `[ ]` Rewrite `updateUserAttributes`: `PATCH /v4/subscribers/{id}` (method changed from PUT)
        *   `[ ]` Keep `removeUser` updated for v4: `DELETE /v4/subscribers/{id}` (hard delete, used for GDPR)
        *   `[ ]` New `addTagToSubscriber(email, tagId)`: `POST /v4/tags/{tagId}/subscribers` with `{ "email_address": email }`
        *   `[ ]` New `removeTagFromSubscriber(email, tagId)`: `DELETE /v4/tags/{tagId}/subscribers` with `{ "email_address": email }`
    *   `[ ]` `factory.ts` updates
        *   `[ ]` Update `EmailFactoryConfig` to remove single `kitTagId` — tags are now per-ref
        *   `[ ]` Update factory validation to not require `kitTagId`
    *   `[ ]` `directionality`
        *   `[ ]` Adapter layer — implements interface, wraps external API
        *   `[ ]` All dependencies are inward-facing (interface, types, config)
        *   `[ ]` Provides outward to edge functions
    *   `[ ]` `requirements`
        *   `[ ]` All existing methods work against Kit API v4
        *   `[ ]` New tag methods work for per-ref tagging
        *   `[ ]` Auth uses `X-Kit-Api-Key` header exclusively
        *   `[ ]` Base URL defaults to `https://api.kit.com`
        *   `[ ]` Backward-compatible: NoOp and Dummy services unaffected

*   `[ ]` supabase/functions/on-user-created/`index.ts` **[BE] Strip Kit logic from auth hook — let event queue handle all Kit communication**
    *   `[ ]` `objective`
        *   `[ ]` Remove direct Kit `addUserToList` call from the `on-user-created` auth hook
        *   `[ ]` All Kit communication is now handled by the newsletter event queue
        *   `[ ]` Profile and wallet creation remain in the DB trigger `handle_new_user()` — this edge function is separate
    *   `[ ]` `role`
        *   `[ ]` Infrastructure — Supabase auth hook, receives user creation events
    *   `[ ]` `module`
        *   `[ ]` Auth hook layer — post-signup processing
    *   `[ ]` `deps`
        *   `[ ]` Supabase Auth Hook payload — provides user record
        *   `[ ]` `logger` from `../_shared/logger.ts` — logging
        *   `[ ]` Remove: `getEmailMarketingService`, `EmailFactoryConfig`, `NoOpEmailService`, `EmailMarketingService`, `UserData`
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Auth hook request body with `record` field containing `User`
    *   `[ ]` unit/`on-user-created.test.ts`
        *   `[ ]` Handler receives valid user record → returns 200 with log message
        *   `[ ]` Handler receives invalid user record → returns 400
        *   `[ ]` Handler does NOT call any email marketing service
        *   `[ ]` Remove all existing tests that assert Kit/email service behavior
    *   `[ ]` `construction`
        *   `[ ]` `HandlerDependencies` simplified — remove `emailService`
        *   `[ ]` `defaultDeps` simplified — remove factory config and service initialization
    *   `[ ]` `index.ts`
        *   `[ ]` Remove imports: `getEmailMarketingService`, `EmailFactoryConfig`, `NoOpEmailService`, `EmailMarketingService`, `UserData`
        *   `[ ]` Remove `emailService` from `HandlerDependencies` interface
        *   `[ ]` Remove `emailService` usage in handler: no `addUserToList`, no `instanceof NoOpEmailService` check
        *   `[ ]` Remove `defaultDeps` factory config and service initialization (env var reads)
        *   `[ ]` Keep: request parsing, user record validation, logging, 200 response
        *   `[ ]` Handler becomes: parse request → validate user record → log → return 200
    *   `[ ]` `directionality`
        *   `[ ]` Infrastructure layer — auth hook
        *   `[ ]` No longer depends on email service adapter
        *   `[ ]` Profile/wallet creation handled by DB trigger, not this function
    *   `[ ]` `requirements`
        *   `[ ]` Auth hook still returns 200 on valid requests (does not block signup)
        *   `[ ]` Auth hook still returns 400 on invalid requests
        *   `[ ]` No Kit/email marketing calls made
        *   `[ ]` Existing user signup flow (profile + wallet + tokens) is unaffected (handled by DB trigger)

*   `[ ]` supabase/functions/`process-newsletter-events`/index.ts **[BE] Newsletter event queue processor — reads events, calls Kit, marks processed**
    *   `[ ]` `objective`
        *   `[ ]` Process unprocessed events from `newsletter_events` table
        *   `[ ]` For `subscribe` events: create Kit subscriber if needed, add ref-specific tag
        *   `[ ]` For `unsubscribe` events: remove newsletter tag from Kit subscriber (soft unsub, keeps subscriber in Kit)
        *   `[ ]` Mark `processed_at = now()` on each event after successful Kit call
        *   `[ ]` Idempotent — safe to re-run, duplicate processing does not create duplicate tags
    *   `[ ]` `role`
        *   `[ ]` Application service — event processor, bridges DB events to external Kit API
    *   `[ ]` `module`
        *   `[ ]` Newsletter event processing — consumes queue, produces Kit API calls
    *   `[ ]` `deps`
        *   `[ ]` `newsletter_events` table — reads unprocessed events (service_role), direction: inward (data)
        *   `[ ]` `auth.users` — reads email for event's user_id (service_role), direction: inward (data)
        *   `[ ]` `kit_service.ts` via factory — Kit API adapter, direction: lateral (adapter)
        *   `[ ]` `kit_tags.config.ts` — ref→tagId resolution, direction: inward (config)
        *   `[ ]` `logger` — logging, direction: lateral
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Supabase service_role client for DB reads/writes
        *   `[ ]` `getEmailMarketingService` factory for Kit adapter
        *   `[ ]` `getTagIdForRef` for ref→tagId resolution
        *   `[ ]` `KIT_NEWSLETTER_TAG_ID` for soft-unsub tag removal
    *   `[ ]` unit/`process-newsletter-events.test.ts`
        *   `[ ]` Subscribe event: creates Kit subscriber and adds ref-specific tag
        *   `[ ]` Subscribe event with unknown ref: creates subscriber, logs warning, skips tagging
        *   `[ ]` Unsubscribe event: removes newsletter tag from Kit subscriber
        *   `[ ]` Already-processed events (processed_at not null) are not re-fetched
        *   `[ ]` Marks `processed_at` on each event after successful processing
        *   `[ ]` Kit API failure: does NOT mark `processed_at`, logs error, continues to next event
        *   `[ ]` Empty queue: returns success with "no events to process" message
        *   `[ ]` Batch processing: handles multiple pending events in one invocation
    *   `[ ]` `construction`
        *   `[ ]` `HandlerDependencies`: supabaseClient (service_role), emailService, logger
        *   `[ ]` Default deps read env vars for service_role client and Kit factory config
    *   `[ ]` `index.ts`
        *   `[ ]` Query `newsletter_events` WHERE `processed_at IS NULL` ORDER BY `created_at ASC`
        *   `[ ]` For each event: look up user email from `auth.users` via `user_id`
        *   `[ ]` For `subscribe` events:
            *   `[ ]` Call `emailService.addUserToList({ email, ... })` to ensure subscriber exists in Kit
            *   `[ ]` Call `emailService.addTagToSubscriber(email, getTagIdForRef(event.ref))` to apply ref tag
        *   `[ ]` For `unsubscribe` events:
            *   `[ ]` Call `emailService.removeTagFromSubscriber(email, KIT_NEWSLETTER_TAG_ID)` to soft-unsub
        *   `[ ]` On success per event: UPDATE `newsletter_events` SET `processed_at = now()` WHERE `id = event.id`
        *   `[ ]` On failure per event: log error, skip, continue to next event
        *   `[ ]` Return summary: `{ processed: N, failed: M, skipped: K }`
    *   `[ ]` `directionality`
        *   `[ ]` Application service layer — consumes data + config, calls adapter
        *   `[ ]` All dependencies are inward-facing
        *   `[ ]` Provides outward: triggered by Supabase Database Webhook on `newsletter_events` INSERT
    *   `[ ]` `requirements`
        *   `[ ]` All pending events processed in FIFO order
        *   `[ ]` Failed events remain unprocessed for retry on next invocation
        *   `[ ]` Idempotent — re-processing a subscribe event does not duplicate Kit tags
        *   `[ ]` Soft unsub: subscriber remains in Kit, only tag is removed
        *   `[ ]` Logging for every event outcome (success, failure, skip)

*   `[ ]` supabase/functions/`subscribe-to-newsletter`/index.ts **[BE] Registration subscription handler — sets profile flags and ref via service_role**
    *   `[ ]` `objective`
        *   `[ ]` Accept `{ userId, ref }` from authenticated client after registration
        *   `[ ]` Use service_role to update `user_profiles`: set `is_subscribed_to_newsletter = true`, `signup_ref = ref`
        *   `[ ]` The DB trigger handles timestamps and event insertion — this function only writes the profile fields
        *   `[ ]` Replaces the previously deleted `subscribe-to-newsletter` edge function
    *   `[ ]` `role`
        *   `[ ]` Application service — bridges client registration flow to profile update + event trigger
    *   `[ ]` `module`
        *   `[ ]` Newsletter subscription — registration path
    *   `[ ]` `deps`
        *   `[ ]` `user_profiles` table — writes `is_subscribed_to_newsletter`, `signup_ref` (service_role), direction: inward (data)
        *   `[ ]` Supabase service_role client — bypasses RLS for service-managed columns
        *   `[ ]` `logger` — logging, direction: lateral
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Authenticated user JWT for user identity verification
        *   `[ ]` Service_role client for profile writes
    *   `[ ]` unit/`subscribe-to-newsletter.test.ts`
        *   `[ ]` Valid `{ userId, ref }`: updates profile with `is_subscribed_to_newsletter = true` and `signup_ref = ref`
        *   `[ ]` Missing userId: returns 400
        *   `[ ]` Missing ref: defaults to `'direct'`
        *   `[ ]` User not found: returns 404
        *   `[ ]` Already subscribed: idempotent, no error (profile update is a no-op for the bool, trigger only fires on actual change)
        *   `[ ]` Returns 200 on success
    *   `[ ]` `construction`
        *   `[ ]` `HandlerDependencies`: supabaseClient (service_role), logger
    *   `[ ]` `index.ts`
        *   `[ ]` Parse request body for `userId` and `ref` (default ref to `'direct'`)
        *   `[ ]` Verify the authenticated user matches `userId` (or allow service_role bypass)
        *   `[ ]` UPDATE `user_profiles` SET `is_subscribed_to_newsletter = true`, `signup_ref = ref` WHERE `id = userId`
        *   `[ ]` Return 200 on success, appropriate error codes on failure
    *   `[ ]` `directionality`
        *   `[ ]` Application service layer — writes data, trigger handles downstream
        *   `[ ]` All dependencies are inward-facing
        *   `[ ]` Provides outward: called by client after registration
    *   `[ ]` `requirements`
        *   `[ ]` Profile is updated atomically (both fields in one UPDATE)
        *   `[ ]` `signup_ref` is set by service_role only — client cannot write it directly
        *   `[ ]` Trigger fires on `is_subscribed_to_newsletter` change → event inserted → queue processes → Kit updated
        *   `[ ]` Idempotent — calling twice with same data does not duplicate events (trigger only fires on actual value change)

*   `[ ]` supabase/functions/`sync-existing-users`/index.ts **[BE] One-time legacy user sync to Kit — tags existing users as legacy + no_explicit_opt_in**
    *   `[ ]` `objective`
        *   `[ ]` Sync all existing users (200+) to Kit with `legacy_user` and `no_explicit_opt_in` tags
        *   `[ ]` Idempotent — uses `synced_to_kit_at` column to skip already-synced users
        *   `[ ]` Disposable — intended for one-time use, can be removed after sync is complete
    *   `[ ]` `role`
        *   `[ ]` Operations — one-time data migration script as edge function
    *   `[ ]` `module`
        *   `[ ]` Legacy user sync — bootstrap existing users into Kit
    *   `[ ]` `deps`
        *   `[ ]` `user_profiles` table — reads all profiles WHERE `synced_to_kit_at IS NULL` (service_role)
        *   `[ ]` `auth.users` — reads email for each user
        *   `[ ]` `kit_service.ts` via factory — Kit API adapter
        *   `[ ]` `kit_tags.config.ts` — tag IDs for `legacy_user` and `no_explicit_opt_in`
        *   `[ ]` `logger` — logging
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Service_role Supabase client
        *   `[ ]` Kit adapter via factory
        *   `[ ]` Tag config for legacy tags
    *   `[ ]` unit/`sync-existing-users.test.ts`
        *   `[ ]` Syncs users where `synced_to_kit_at IS NULL`: creates Kit subscriber, adds both tags
        *   `[ ]` Skips users where `synced_to_kit_at IS NOT NULL`
        *   `[ ]` Sets `synced_to_kit_at = now()` on each user after successful Kit sync
        *   `[ ]` Kit API failure for one user: logs error, continues to next user, does NOT set `synced_to_kit_at`
        *   `[ ]` Empty result set: returns success with "no users to sync" message
        *   `[ ]` Returns summary: `{ synced: N, failed: M, skipped: K }`
    *   `[ ]` `construction`
        *   `[ ]` `HandlerDependencies`: supabaseClient (service_role), emailService, logger
    *   `[ ]` `index.ts`
        *   `[ ]` Query `user_profiles` JOIN `auth.users` WHERE `synced_to_kit_at IS NULL`
        *   `[ ]` For each user:
            *   `[ ]` Call `emailService.addUserToList({ id, email, firstName, createdAt })` to create subscriber in Kit
            *   `[ ]` Call `emailService.addTagToSubscriber(email, getTagIdForRef('legacy_user'))` to add legacy tag
            *   `[ ]` Call `emailService.addTagToSubscriber(email, getTagIdForRef('no_explicit_opt_in'))` to add opt-in status tag
            *   `[ ]` UPDATE `user_profiles` SET `synced_to_kit_at = now()` WHERE `id = user.id`
        *   `[ ]` On failure per user: log error, continue to next
        *   `[ ]` Return summary JSON
    *   `[ ]` `directionality`
        *   `[ ]` Operations/infrastructure layer — one-time migration
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` All unsynced users added to Kit with both tags
        *   `[ ]` Already-synced users are not re-processed (no tag overwrite)
        *   `[ ]` Safe to re-run — picks up where it left off on partial failure
        *   `[ ]` Logs progress for monitoring during manual execution

*   `[ ]` packages/store/src/`authStore.ts` **[STORE] Update subscribeToNewsletter signature + add localStorage ref persistence**
    *   `[ ]` `objective`
        *   `[ ]` Update `subscribeToNewsletter` to accept and pass `ref` to the edge function
        *   `[ ]` Add `persistSignupRef(ref)` and `consumeSignupRef()` utilities for OAuth ref survival
        *   `[ ]` Ensure ref persistence works across all auth providers (email, Google, GitHub, Apple)
    *   `[ ]` `role`
        *   `[ ]` State management — auth store actions for newsletter subscription
    *   `[ ]` `module`
        *   `[ ]` Auth / newsletter subscription flow
    *   `[ ]` `deps`
        *   `[ ]` Supabase client — edge function invocation, direction: lateral
        *   `[ ]` `localStorage` — ref persistence across OAuth redirects, direction: external (browser API)
        *   `[ ]` `packages/types/src/auth.types.ts` — type definitions, direction: inward
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Auth store state and actions
        *   `[ ]` `localStorage` for `signup_ref` key
    *   `[ ]` interface/`auth.types.ts` updates
        *   `[ ]` Update `subscribeToNewsletter` signature: `(email: string, ref: string) => Promise<void>`
        *   `[ ]` Add `persistSignupRef: (ref: string) => void`
        *   `[ ]` Add `consumeSignupRef: () => string` — returns ref and clears from storage, defaults to `'direct'`
    *   `[ ]` unit/`authStore.newsletter.test.ts` (update)
        *   `[ ]` `subscribeToNewsletter(email, 'vibecoder')` invokes edge function with `{ email, ref: 'vibecoder' }`
        *   `[ ]` `subscribeToNewsletter(email, 'direct')` invokes edge function with `{ email, ref: 'direct' }`
        *   `[ ]` `persistSignupRef('vibecoder')` writes `'vibecoder'` to localStorage key `signup_ref`
        *   `[ ]` `consumeSignupRef()` reads and clears localStorage key `signup_ref`, returns value
        *   `[ ]` `consumeSignupRef()` returns `'direct'` when localStorage key is absent
    *   `[ ]` `construction`
        *   `[ ]` No new store state — ref is transient (localStorage), not persisted in Zustand
    *   `[ ]` `authStore.ts`
        *   `[ ]` Update `subscribeToNewsletter`: accept `(email: string, ref: string)`, pass `{ email, ref }` to edge function body
        *   `[ ]` Add `persistSignupRef(ref: string)`: `localStorage.setItem('signup_ref', ref)`
        *   `[ ]` Add `consumeSignupRef(): string`: read `localStorage.getItem('signup_ref')`, remove key, return value or `'direct'`
    *   `[ ]` `directionality`
        *   `[ ]` State management layer — consumes types, calls edge function
        *   `[ ]` All dependencies are inward-facing
        *   `[ ]` Provides outward to UI components
    *   `[ ]` `requirements`
        *   `[ ]` Edge function receives `{ email, ref }` on every subscription call
        *   `[ ]` Ref survives OAuth redirect round-trips via localStorage
        *   `[ ]` `consumeSignupRef` clears localStorage after read — no stale refs on subsequent logins
        *   `[ ]` Default `'direct'` when no ref was persisted

*   `[ ]` apps/web/src/components/auth/`RegisterForm.tsx` **[UI] Wire ref param, localStorage persistence, PostHog tracking on email registration**
    *   `[ ]` `objective`
        *   `[ ]` Read `ref` from URL search params, default to `'direct'`
        *   `[ ]` Persist ref to localStorage before registration (survives page reload or interruption)
        *   `[ ]` After registration: PostHog `identify` + `track` with `signup_segment`
        *   `[ ]` Pass ref to `subscribeToNewsletter(email, ref)` when checkbox is checked
    *   `[ ]` `role`
        *   `[ ]` UI adapter — bridges URL params → analytics + email marketing for email signup path
    *   `[ ]` `module`
        *   `[ ]` Auth / registration flow — email signup
    *   `[ ]` `deps`
        *   `[ ]` `useSearchParams` from `react-router-dom` — reads `ref` from URL query params
        *   `[ ]` `analytics` from `@paynless/analytics` — PostHog singleton for `identify`/`track`
        *   `[ ]` `useAuthStore` — `register`, `subscribeToNewsletter`, `persistSignupRef`, `consumeSignupRef`, and `user` state
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` URL search params for `ref` value
        *   `[ ]` `analytics` singleton for PostHog calls
        *   `[ ]` Auth store for registration actions and user state
    *   `[ ]` unit/`RegisterForm.test.tsx` (update)
        *   `[ ]` With `ref=vibecoder` in URL: `persistSignupRef` called with `'vibecoder'` before register
        *   `[ ]` With `ref=vibecoder`: PostHog `identify` called with `{ signup_segment: 'vibecoder' }` after registration
        *   `[ ]` With `ref=vibecoder`: PostHog `track` called with `('user_registered', { signup_segment: 'vibecoder' })` after registration
        *   `[ ]` With no `ref` param: PostHog calls use `signup_segment: 'direct'`
        *   `[ ]` Newsletter checkbox checked: `subscribeToNewsletter` called with email AND ref
        *   `[ ]` Newsletter checkbox unchecked: `subscribeToNewsletter` NOT called
        *   `[ ]` Existing registration behavior (form validation, navigation, error display) unchanged
    *   `[ ]` `RegisterForm.tsx`
        *   `[ ]` Add `useSearchParams` to read `ref` from URL, default to `'direct'`
        *   `[ ]` Call `persistSignupRef(ref)` before `register()` call
        *   `[ ]` After `register()` succeeds: read user ID from auth store state
        *   `[ ]` Call `analytics.identify(userId, { signup_segment: ref })`
        *   `[ ]` Call `analytics.track('user_registered', { signup_segment: ref })`
        *   `[ ]` If `subscribe` checkbox checked: call `subscribeToNewsletter(email, ref)`
    *   `[ ]` `directionality`
        *   `[ ]` UI adapter layer — bridges URL params → store + analytics
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` Every email sign-up is tagged with a segment in PostHog
        *   `[ ]` Ref is persisted to localStorage before auth action begins
        *   `[ ]` Newsletter subscribers receive ref through edge function → trigger → Kit
        *   `[ ]` Default `'direct'` applied when no `ref` present
        *   `[ ]` Existing registration UX is not altered

*   `[ ]` apps/web/src/`App.tsx` + OAuth flows **[UI] Wire ref persistence for OAuth registration paths (Google, future GitHub/Apple)**
    *   `[ ]` `objective`
        *   `[ ]` Ensure `ref` from URL survives OAuth redirect round-trips via localStorage
        *   `[ ]` After OAuth callback: detect new user, consume ref, call PostHog + subscribe-to-newsletter
        *   `[ ]` Provider-agnostic pattern — works for Google now, GitHub and Apple later
    *   `[ ]` `role`
        *   `[ ]` UI adapter — bridges OAuth redirect flow to analytics + newsletter subscription
    *   `[ ]` `module`
        *   `[ ]` Auth / registration flow — OAuth signup paths
    *   `[ ]` `deps`
        *   `[ ]` `useAuthStore` — `loginWithGoogle`, `persistSignupRef`, `consumeSignupRef`, `subscribeToNewsletter`
        *   `[ ]` `analytics` from `@paynless/analytics` — PostHog `identify`/`track`
        *   `[ ]` `onAuthStateChange` listener in authStore — detects auth state transitions
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` Auth state transitions (signed_in event with new user detection)
        *   `[ ]` `localStorage` for `signup_ref` key
    *   `[ ]` `discovery` — **MUST RESOLVE BEFORE STARTING WORK**
        *   `[ ]` Trace `onAuthStateChange` listener in `authStore.ts` to determine where post-OAuth user detection happens
        *   `[ ]` Determine: does the listener distinguish "new signup" (first `SIGNED_IN` event) from "returning login"?
        *   `[ ]` Determine: where does the post-OAuth redirect land? (currently `loginWithGoogle` redirects to `/dashboard`)
        *   `[ ]` Determine: is there a point in the auth flow after OAuth where we have both the user ID and know this is a first-time signup?
        *   `[ ]` Determine: should ref consumption + PostHog + newsletter subscription happen in the auth state listener, in `App.tsx` (on profile load), or in a dedicated post-auth hook?
        *   `[ ]` Determine: if `has_seen_welcome_modal === false` is a reliable proxy for "new user", we can use that as the trigger point
        *   `[ ]` Document findings and chosen approach before writing any code
    *   `[ ]` unit/tests (determined after discovery)
        *   `[ ]` Test cases TBD based on discovery findings — will cover:
        *   `[ ]` OAuth login with ref in URL: ref persisted to localStorage before redirect
        *   `[ ]` Post-OAuth callback for new user: ref consumed, PostHog identify+track called, subscribe-to-newsletter called
        *   `[ ]` Post-OAuth callback for returning user: ref NOT consumed (or consumed and discarded), no duplicate PostHog/newsletter calls
        *   `[ ]` Multiple OAuth providers: same ref persistence pattern works for all
    *   `[ ]` Implementation (determined after discovery)
        *   `[ ]` In `loginWithGoogle` (and future OAuth methods): read `ref` from URL, call `persistSignupRef(ref)` before initiating OAuth
        *   `[ ]` In post-auth detection point (TBD from discovery): if new user, `consumeSignupRef()`, PostHog `identify` + `track`, call `subscribeToNewsletter` if applicable
    *   `[ ]` `directionality`
        *   `[ ]` UI adapter layer — bridges OAuth flow → store + analytics
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` Ref survives OAuth redirect round-trip for all providers
        *   `[ ]` New OAuth users get PostHog `signup_segment` tracking
        *   `[ ]` New OAuth users who opted in get newsletter subscription with ref
        *   `[ ]` Returning OAuth users are not re-tracked or re-subscribed
        *   `[ ]` Pattern is provider-agnostic — adding GitHub/Apple requires minimal changes

*   `[ ]` apps/web/src/components/modals/`WelcomeModal.tsx` + `App.tsx` **[UI] Fix modal rendering + wire newsletter opt-in for legacy and new users**
    *   `[ ]` `objective`
        *   `[ ]` Fix WelcomeModal not rendering — component exists but is never imported/rendered in the app tree
        *   `[ ]` Fix guard logic — modal should show based on `has_seen_welcome_modal`, not subscription status
        *   `[ ]` Wire modal opt-in/opt-out to trigger newsletter event queue → Kit tag update
        *   `[ ]` For `no_explicit_opt_in` legacy users: opt-in flips to explicit; opt-out leaves as-is
    *   `[ ]` `role`
        *   `[ ]` UI component — post-signup modal for newsletter opt-in
    *   `[ ]` `module`
        *   `[ ]` Auth / onboarding flow — welcome experience
    *   `[ ]` `deps`
        *   `[ ]` `useAuthStore` — `showWelcomeModal`, `profile`, `updateSubscriptionAndDismissWelcome`
        *   `[ ]` `Dialog` and related shadcn components — modal UI
        *   `[ ]` Confirm no reverse dependency is introduced
    *   `[ ]` `context_slice`
        *   `[ ]` `showWelcomeModal` boolean from auth store
        *   `[ ]` `profile` for `has_seen_welcome_modal` and `is_subscribed_to_newsletter` state
    *   `[ ]` `current_state`
        *   `[ ]` `WelcomeModal.tsx` exists with correct UI and `handleContinue` calling `updateSubscriptionAndDismissWelcome`
        *   `[ ]` `App.tsx` sets `showWelcomeModal = true` when `profile.has_seen_welcome_modal === false`
        *   `[ ]` **Bug: `<WelcomeModal />` is never imported or rendered in any component** — only imported in its test file
        *   `[ ]` **Bug: Line 12 guard** `if (!showWelcomeModal || profile?.is_subscribed_to_newsletter)` — skips modal for already-subscribed users even if `has_seen_welcome_modal` is false
    *   `[ ]` unit/`WelcomeModal.test.tsx` (update)
        *   `[ ]` Modal renders when `showWelcomeModal = true` regardless of `is_subscribed_to_newsletter` value
        *   `[ ]` Modal does NOT render when `showWelcomeModal = false`
        *   `[ ]` Clicking Continue with checkbox checked calls `updateSubscriptionAndDismissWelcome(true)`
        *   `[ ]` Clicking Continue with checkbox unchecked calls `updateSubscriptionAndDismissWelcome(false)`
        *   `[ ]` Remove/update any test that asserts modal hidden when `is_subscribed_to_newsletter = true`
    *   `[ ]` `WelcomeModal.tsx`
        *   `[ ]` Fix guard: change to `if (!showWelcomeModal) return null;` — remove `is_subscribed_to_newsletter` check
        *   `[ ]` Existing `handleContinue` already calls `updateSubscriptionAndDismissWelcome(isSubscribed)` → writes profile → trigger fires → event queue → Kit — no additional wiring needed
    *   `[ ]` `App.tsx`
        *   `[ ]` Import `WelcomeModal` from `./components/modals/WelcomeModal`
        *   `[ ]` Render `<WelcomeModal />` in the component tree (inside `AppContent`, after existing content)
    *   `[ ]` `directionality`
        *   `[ ]` UI component layer — consumes auth store, renders modal
        *   `[ ]` All dependencies are inward-facing
    *   `[ ]` `requirements`
        *   `[ ]` Modal renders for all new users who haven't seen it, regardless of subscription status
        *   `[ ]` Opt-in flips `is_subscribed_to_newsletter = true` → trigger → event → Kit tag update
        *   `[ ]` Opt-out sets `has_seen_welcome_modal = true`, leaves `is_subscribed_to_newsletter = false`
        *   `[ ]` For `no_explicit_opt_in` legacy users: modal appearance is idempotent with email opt-out — both paths set `has_seen_welcome_modal = true`
        *   `[ ]` Modal only shows once per user (dismissed state persisted in profile)
    *   `[ ]` **Commit** `feat(newsletter): Kit v4 integration, newsletter event queue, signup ref tracking, and opt-in flows`
        *   `[ ]` Extended user_profiles with subscribed_at, unsubscribed_at, signup_ref, synced_to_kit_at
        *   `[ ]` Created newsletter_events table with RLS and queue index
        *   `[ ]` Created DB trigger for idempotent subscription state management and event insertion
        *   `[ ]` Created Kit tag config mapping ref slugs to Kit tag IDs
        *   `[ ]` Rewrote Kit service to API v4 (X-Kit-Api-Key auth, /v4/ endpoints, email_address field)
        *   `[ ]` Added addTagToSubscriber and removeTagFromSubscriber to Kit service
        *   `[ ]` Stripped Kit logic from on-user-created auth hook
        *   `[ ]` Created process-newsletter-events edge function (queue processor → Kit)
        *   `[ ]` Created subscribe-to-newsletter edge function (registration path)
        *   `[ ]` Created sync-existing-users edge function (one-time legacy sync)
        *   `[ ]` Updated authStore subscribeToNewsletter to accept ref, added localStorage ref persistence
        *   `[ ]` Wired RegisterForm with ref reading, PostHog tracking, and newsletter subscription
        *   `[ ]` Wired OAuth ref persistence for provider-agnostic signup tracking
        *   `[ ]` Fixed WelcomeModal rendering and guard logic

*   `[ ]` `manual_setup` **[CONFIG] Manual operational steps — Kit dashboard, env vars, webhook, sync**
    *   `[ ]` Kit dashboard setup
        *   `[ ]` Generate v4 API key in Kit dashboard
        *   `[ ]` Create Kit tags: `vibecoder`, `indiehacker`, `startup`, `agency`, `pricing`, `direct`, `legacy_user`, `no_explicit_opt_in`
        *   `[ ]` Record tag IDs and fill into `kit_tags.config.ts`
    *   `[ ]` Environment variables
        *   `[ ]` Update `EMAIL_MARKETING_BASE_URL` to `https://api.kit.com`
        *   `[ ]` Update `EMAIL_MARKETING_API_KEY` with v4 API key
        *   `[ ]` Remove `EMAIL_MARKETING_TAG_ID` (no longer used — tags are per-ref in config)
    *   `[ ]` Supabase Database Webhook
        *   `[ ]` Configure webhook on `newsletter_events` INSERT → calls `process-newsletter-events` edge function URL
    *   `[ ]` Deploy edge functions
        *   `[ ]` Deploy `process-newsletter-events`
        *   `[ ]` Deploy `subscribe-to-newsletter`
        *   `[ ]` Deploy `sync-existing-users`
        *   `[ ]` Redeploy `on-user-created` (stripped Kit logic)
    *   `[ ]` Run legacy sync
        *   `[ ]` Invoke `sync-existing-users` edge function once
        *   `[ ]` Verify users appear in Kit with `legacy_user` + `no_explicit_opt_in` tags
    *   `[ ]` Send opt-in email
        *   `[ ]` Draft "we made a newsletter" email in Kit targeting `no_explicit_opt_in` tag
        *   `[ ]` Include unsubscribe button (Kit handles this natively)
        *   `[ ]` Include explicit opt-in link (links to app, triggers welcome modal or direct opt-in)
    *   `[ ]` PostHog cohorts
        *   `[ ]` Create cohorts in PostHog filtered by `signup_segment` user property for each ref value

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
