# Segment Landing Pages — Plan & Progress

## Objective

Replace the generic `UseCases` component (2x2 grid on the homepage) with four razor-sharp ICP cards, each linking to a dedicated landing page that speaks directly to that segment's pain, story, and outcome. Each landing page drives sign-up with a trackable segment tag so we can measure conversion per segment.

---

## The Four Segments

### 1. Vibe Coders

**One-liner:** "Stop burning money on 'please fix' — give your AI agent a real plan."

**Pain:** They built 80% of their app on Bolt/Lovable/Replit/v0, then hit a wall. The AI agent lost context, started breaking things, and now they're stuck in a loop of paying for fixes that create new bugs. They can clearly state *what* they want but can't communicate the *method*.

**Relationship to output:** The plan is a prompt strategy — structured instructions the AI coding agent can follow without losing context or introducing regressions.

**Example scenario:**
> Jamie used bolt to build a custom to-do list and calorie tracker. It worked great until she tried to convert the webpage into an iOS app and get it to sync to her Apple. She's spent $180 on regenerations and it's worse than it was two days ago. She needs a spec that tells the agent exactly what to build, what to leave alone, and in what order.

**Example project (to run through system):**
- "Create an iOS combined to-do list and calorie tracker that reminds me to input my food intake and sends alerts to my Apple Watch for meals and todo items."

**Featured docs on landing page:**
1. **Business Case** — validates their idea; shows them "here's what you're actually building" in clear terms
2. **Work Plan** — the actionable output; this is what they paste into Bolt/Lovable/Replit as structured instructions

**CTA tag:** `signup_segment=vibe-coder`

---

### 2. Indie Hackers & Solo Devs Outside Their Stack

**One-liner:** "You know how to code. You just don't know *this* stack yet."

**Pain:** They're competent developers tackling a language, framework, or architecture pattern outside their core expertise. They don't have weeks to study best practices before shipping. They need to make sound architectural decisions in unfamiliar territory without learning everything the hard way.

**Relationship to output:** The plan is a guardrail and accelerator — something they'll read, learn from, and use to avoid the pitfalls that experienced devs in that stack already know about.

**Example scenario:**
> Marcus is a senior Typescript backend dev. His side project is a website that has gotten fairly popular and users want a desktop version so they can have local file system access without uploading documents to his database, but Marcus has never built for desktop before and isn't that confident in his front end skills." 

**Example project (to run through system):**
- "Add a Windows desktop head to a next.js web app monorepo that uses the existing next.js core and syncs to the production database. It needs a platform layer to switch methods and access the file system and provide access to app functions for documents without uploading them to the database."

**Featured docs on landing page:**
1. **Tech Stack** — the decisions made for them; "it recommended X over Y and here's why"
2. **System Architecture** — the big picture they need to execute confidently in unfamiliar territory

**CTA tag:** `signup_segment=indie-hacker`

---

### 3. Startups & Small Teams Racing to MVP

**One-liner:** "You have 4 months of runway. You can't afford to plan for 3 weeks — or to not plan at all."

**Pain:** They have a waitlist, a short runway, and enormous pressure to ship. They know skipping planning leads to rewrites that burn their remaining time and money. But a traditional planning phase — weeks of architecture review, stakeholder alignment, technical discovery — is a luxury they can't afford. They need the rigor without the timeline.

**Relationship to output:** The plan is a time compression tool — the output of a mature pre-development process delivered in minutes, not sprints. It gives the team alignment on architecture, scope, and priorities before they write line one.

**Example scenario:**
> A 3-person team raised a small pre-seed round. They have a waitlist of 300 users and 4 months to prove traction or the money runs out. Their CTO knows they should plan the architecture properly, but every day spent planning is a day not shipping. They need a comprehensive technical spec — data model, API design, infrastructure choices, security considerations — generated in an afternoon so they can start building tomorrow.

**Example project (to run through system):**
- "We're building a platform where hiring managers paste job descriptions and our AI screens resumes, ranks candidates, and generates interview question sets tailored to the role. We need team accounts, a Stripe subscription, and an applicant tracking dashboard. It needs to integrate with job boards and LinkedIn for sourcing. Three of us, launching in 4 months."

**Featured docs on landing page:**
1. **Business Case** — what the CTO forwards to co-founders and investors to show "we have a plan"
2. **Product Requirements** — the alignment doc; gets the whole team building the same thing from day one

**CTA tag:** `signup_segment=startup`

---

### 4. Agencies & Freelancers

**One-liner:** "Your client won't pay for a discovery phase. Your team pays the price."

**Pain:** Their clients see planning as overhead, not value. But when specs are thin, the offshore team (or the freelancer themselves) builds the wrong thing, leading to scope creep, rework, and margin erosion. They can't comp weeks of architecture work to the client, but they also can't afford the cost of building without it.

**Relationship to output:** The plan is a scope definition and risk reduction tool — something they can produce before quoting (to estimate accurately) or before kickoff (to hand off clear specs to the dev team).

**Example scenario:**
> A small agency lands a $40K client project — a marketplace app. The client provided a 2-page feature list and expects development to start Monday. The agency's PM knows the feature list has gaps (what about dispute resolution? search ranking? payment escrow?). A traditional discovery phase would cost $8K and the client won't approve it. They need a rigorous technical spec generated from the client's brief so their offshore team in the Philippines has clear instructions, and so the PM can identify scope gaps *before* they become change orders.

**Example project (to run through system):**
- "Wordpress site with Shopify integration and testimonies and user reviews for a local bakery that integrates with a Toast inventory and POS for real time product availability and automated pricing guidance, and emails clients when their favorite products are freshly made." 

**Featured docs on landing page:**
1. **Product Requirements** — what they show the client for scope sign-off before work begins
2. **Technical Requirements** — what they hand to the offshore team as clear build instructions

**CTA tag:** `signup_segment=agency`

---

## General Landing Page Notes

**Input messaging (all segments):** "Bring whatever you have — from a single sentence to a full brief. The more detail you provide, the sharper the output. But even one sentence gets you started."

**Doc display approach:**
- Show 2 featured docs per segment inline in a markdown renderer with an expand handle for resizing
- Below the featured docs, a teaser: "See all 18 documents →" that links to sign-up
- The full document suite per run:
  - **Proposal:** Business Case, Feature Specifications, Success Metrics, Technical Approach
  - **Review:** Business Case Critique, Dependency Map, Non-Functional Requirements, Risk Register, Technical Feasibility
  - **Refinement:** Product Requirements, System Architecture, Tech Stack
  - **Planning:** Master Plan, Milestones, Technical Requirements
  - **Implementation:** Work Plan, Recommendations, Updated Master Plan

---

## Deliverables & Steps

### Step 1: Finalize segment content (this document)
- [x] Define the 4 segments with pain, story, relationship to output
- [x] Write example scenarios for each
- [x] Define the example project for each segment
- [x] Select featured docs per segment (2 docs each, tailored to what the persona cares about)
- [x] Run each example project through the system and capture output artifacts
- [x] Extract the 2 featured docs per segment from the generated output

**Example output location:** `example/use-cases/{segment}/` — raw AI output, shipped as-is.

### Step 2: Build the segment landing pages

#### Routing decisions
- **Short routes:** `/:segment` — no `/use-cases/` prefix. Routes are `/vibecoder`, `/indiehacker`, `/startup`, `/agency`
- **`ref` param values** match the route/PostHog list names: `vibecoder`, `indiehacker`, `startup`, `agency`
- **CTA links:** `/register?ref=vibecoder` etc.

#### Page section structure (8 sections per landing page)

1. **Hero** — segment headline + pain one-liner + primary CTA button
   - CTA text: "Start Free — 1M Tokens, No Credit Card"
   - Links to `/register?ref={segment}`
   - Auth-aware: if logged in, show "Go to Dashboard" instead

2. **Before/After** — shows the transformation
   - Left: the one-sentence example input (from the segment's "Example project")
   - Arrow/divider
   - Right: the two featured doc titles with brief descriptions
   - Message: "Bring whatever you have — from a single sentence to a full brief. The more detail you provide, the sharper the output. But even one sentence gets you started."

3. **"Sound Familiar?"** — scenario story section
   - The example scenario for the segment rendered as a styled blockquote
   - Relatable, empathy-driven — no CTA here, just connection

4. **Doc Reader** — "Here's What You Get From Paynless"
   - Tabbed interface switching between the 2 featured docs per segment
   - Uses existing `MarkdownRenderer` component
   - Contained `<div>` with `max-height: 600px`, `overflow-y: auto`, styled with Tailwind prose classes
   - Expand/collapse toggle button to show full document height
   - Example docs loaded from `example/use-cases/{segment}/` as static imports

5. **"See All 18 Documents"** — breadth teaser
   - Stage-grouped list of all 18 document titles (no content, just names):
     - **Proposal:** Business Case, Feature Specifications, Success Metrics, Technical Approach
     - **Review:** Business Case Critique, Dependency Map, Non-Functional Requirements, Risk Register, Technical Feasibility
     - **Refinement:** Product Requirements, System Architecture, Tech Stack
     - **Planning:** Master Plan, Milestones, Technical Requirements
     - **Implementation:** Work Plan, Recommendations, Updated Master Plan
   - CTA: "Sign up to generate your own" → `/register?ref={segment}`

6. **How It Works** — 5-stage process contextualized to segment
   - Same 5 stages (Proposal → Review → Refinement → Planning → Implementation)
   - Each stage description reframed in the segment's language:
     - Vibecoder: "Describe what you want → Get a plan your AI agent can follow"
     - Indiehacker: "Describe your project → Get stack decisions and architecture from experienced devs in that stack"
     - Startup: "Paste your pitch → Get alignment docs your whole team can build from"
     - Agency: "Paste the client brief → Get scope docs and build instructions for your dev team"

7. **FAQ / Objection Handler** — 2-3 items per segment
   - Vibecoder: "But I've already tried AI tools" / "What if my project is too simple?"
   - Indiehacker: "Can I trust AI architecture decisions?" / "What if I already know part of the stack?"
   - Startup: "Is AI-generated architecture reliable enough to build on?" / "Can my whole team use this?"
   - Agency: "Will this look professional enough to show my client?" / "Can I white-label the output?"

8. **Final CTA** — conversion section
   - Headline: segment-specific closing hook
   - Pricing: "Start free — 1M tokens on signup, 100k tokens free every month. No credit card unless you upgrade."
   - Primary button: "Get Started Free" → `/register?ref={segment}`
   - Secondary: "Sign In" → `/login`
   - Auth-aware: logged-in users see "Go to Dashboard"

#### Content data structure
- One TypeScript data file (`segmentContent.ts`) holding a typed object per segment
- Contains: slug, headline, oneLiner, painStatement, scenario, exampleInput, featuredDocs (tab labels + file references), howItWorksFraming (5 strings), faqItems (question/answer pairs), ctaRef
- Template component consumes this data object — no per-segment component files

#### Technical approach
- [x] Create segment content data file with all 4 segments
- [x] Create shared landing page template component
- [x] Create landing page route component (reads `:segment` param, looks up content)
- [ ] Configure `vite-plugin-prerender` to generate static HTML at build time for the 4 segment routes
- [ ] Add route `/:segment` to React Router for the 4 segment slugs
- [ ] Import example markdown files as static content for the doc reader

#### SEO / Prerendering approach
The 4 segment landing pages need to be indexable by search engines immediately — no hydration delay, real HTML on first request.

**Approach: `vite-plugin-prerender`**
- Build-time prerendering — Puppeteer/jsdom renders each route at build time and writes static `.html` files
- Zero changes to routes, components, or entry point — plugin config only
- Rest of SPA untouched — only the 4 segment routes get prerendered
- Output: `dist/vibecoder/index.html`, `dist/indiehacker/index.html`, etc.

**Not doing:**
- Vike / vite-plugin-ssr — requires file-based routing migration (weeks)
- React Router v7 Framework Mode — requires v6→v7 upgrade + file-based routing (weeks)
- Full SSR runtime — overkill for 4 static content pages

#### Mobile approach
- Functional and readable on mobile, not mobile-first optimized
- Doc reader: full-width, scrollable, expand toggle prominent
- Before/after: stacked vertically on mobile
- FAQ: accordion or simple stacked sections

### Step 3: Update the homepage UseCases component
- [ ] Rewrite the 4 cards with final one-liners and segment-specific summaries
- [ ] Make each card a `<Link>` to `/{segment-slug}`
- [ ] Slugs: `vibe-coder`, `indie-hacker`, `startup`, `agency`
- [ ] Update card content to match the 4 segments (replace "Learning & Teaching" with the 4 defined ICPs)

### Step 4: Implement segment tracking on sign-up (ConvertKit + PostHog)

Two-step flow: **ConvertKit captures email + segment cohort**, then **PostHog segments behavioral analytics** using the same cohort tag.

#### Current state (broken)
- `RegisterForm.tsx` has a newsletter checkbox that calls `subscribeToNewsletter(email)` in authStore
- `subscribeToNewsletter` calls `supabase.functions.invoke('subscribe-to-newsletter')` — **this edge function does not exist**
- `on-user-created` Auth Hook auto-subscribes ALL new users to a single Kit tag (no segment differentiation)
- PostHog has zero integration in the registration flow (no `identify`, no `track`)

#### Target state
- CTA links pass `ref` query param: `/register?ref=vibecoder`
- `RegisterForm.tsx` reads `ref` from URL search params
- On registration (if newsletter checkbox is checked), pass `ref` value to the newsletter subscription so Kit tags the subscriber with their segment cohort
- On successful account creation, call PostHog `identify(userId, { signup_segment })` and `track('user_registered', { signup_segment })` with the `ref` value (default `direct`)
- **5 segment cohorts** in both ConvertKit and PostHog:
  - `vibecoder` — from `/vibecoder` CTA
  - `indiehacker` — from `/indiehacker` CTA
  - `startup` — from `/startup` CTA
  - `agency` — from `/agency` CTA
  - `direct` — default for any sign-up with no `ref` param

#### ConvertKit integration fix
- The `subscribe-to-newsletter` edge function was previously deleted because it tried to read the user's email from Supabase's `auth` table (which Supabase blocks). The fix: recreate it to accept `{ email, segment }` directly from the client — email comes straight from the signup form input, no auth table reads needed.
- `subscribeToNewsletter` action in authStore already receives email as a param — update signature to also accept `segment`, pass both to the new edge function.
- The new edge function uses `getEmailMarketingService()` factory (same pattern as `on-user-created`) and calls Kit with the segment value.
- Kit's `addUserToList` currently subscribes to a single tag. Need to either: (a) create per-segment tags in Kit and pass the segment-appropriate tag ID, or (b) use Kit custom fields to store the segment value.
- **Manual setup (Tim):** Create segment tags or custom field in the ConvertKit dashboard for the 5 cohorts.

#### PostHog integration
- After registration succeeds and user ID is available, call `analytics.identify(userId, { signup_segment })` and `analytics.track('user_registered', { signup_segment })`
- This happens in `RegisterForm.tsx` after the `register()` call succeeds
- **Manual setup (Tim):** Create 5 cohorts in PostHog dashboard filtered by `signup_segment` property

#### Tasks
- [ ] Fix the broken `subscribeToNewsletter` flow (create edge function or fix the call path)
- [ ] Pass `ref` / segment value through the newsletter subscription so Kit captures the cohort
- [ ] Add `ref` query param reading to `RegisterForm.tsx`
- [ ] Add PostHog `identify` + `track` calls on successful registration with `signup_segment` property
- [ ] Tim: Create segment tags/forms in ConvertKit dashboard
- [ ] Tim: Create 5 cohorts in PostHog dashboard
- [ ] Verify tag flows through by testing each CTA → register → Kit + PostHog path

### Step 5: Review and polish
- [ ] Review all 4 landing pages for tone consistency
- [ ] Ensure mobile is functional and readable
- [ ] Test all CTA links and segment tag passthrough
- [ ] Confirm analytics/tracking captures segment correctly

---

## Resolved Questions

1. **Routing:** Short routes — `/:segment` using the PostHog list names as slugs (`/vibe-coder`, `/indie-hacker`, `/startup`, `/agency`). No `/use-cases/` prefix.
2. **Doc polish:** Ship raw AI output as-is. What is generated is exactly what we use. Authentic, not misleading.
3. **`ref` values:** Use PostHog list names (`vibe-coder`, `indie-hacker`, `startup`, `agency`) as the `ref` param values.
4. **Mobile:** Functional and readable, not mobile-first. Target ICP is planning software — phone/tablet users are not the primary segment.
5. **Social proof:** No fake testimonials. Innovators don't need social proof — they need to see the product works. Trust signals come from real users after adoption curve begins.

## Open Questions

1. **PostHog cohort setup:** Create 5 cohorts in PostHog dashboard filtered by `signup_segment` user property.
2. **ConvertKit segment strategy:** Decide between per-segment Kit tags (requires creating 5 tags and passing tag IDs dynamically) vs. a Kit custom field storing the segment value on a single tag. Check Kit dashboard capabilities & report.
3. **`subscribe-to-newsletter` edge function:** Recreate it — accepts `{ email, segment }` from the client. Previously deleted because it tried to read email from auth tables; now the email is passed directly from the signup form input.
