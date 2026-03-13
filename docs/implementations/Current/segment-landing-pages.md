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
- [ ] Run each example project through the system and capture output artifacts
- [ ] Extract and polish the 2 featured docs per segment from the generated output
- [ ] Write the full landing page copy for each segment

### Step 2: Update the homepage UseCases component
- [ ] Rewrite the 4 cards with final one-liners and summaries
- [ ] Make each card a `<Link>` to `/use-cases/{segment-slug}`
- [ ] Slugs: `vibe-coders`, `indie-hackers`, `startups`, `agencies`

### Step 3: Build the segment landing pages
- [ ] Create a shared layout/template for segment landing pages
- [ ] Page structure per segment:
  - Hero with segment-specific headline and pain statement
  - "Sound familiar?" scenario section (the example story)
  - "Here's what Paynless produces" section — 2 featured docs in markdown renderer with expand handle
  - "See all 18 documents →" teaser CTA linking to sign-up
  - How it works (brief recap of 5-stage process, contextualized to this segment)
  - CTA: sign-up with segment tag
- [ ] Create route `/use-cases/:segment` in React Router
- [ ] Build 4 pages using the shared template + segment-specific content

### Step 4: Implement segment tracking on sign-up (PostHog)
Existing PostHog integration captures email on account creation into a generic contact list. We need to segment it.

**Approach:**
- CTA links pass `ref` query param: `/register?ref=vibe-coder`
- Registration page reads `ref` from URL search params
- On account creation, include `ref` in the PostHog `identify` or `capture` call as a user property
- **5 PostHog lists:**
  - `vibe-coder` — from `/use-cases/vibe-coders` CTA
  - `indie-hacker` — from `/use-cases/indie-hackers` CTA
  - `startup` — from `/use-cases/startups` CTA
  - `agency` — from `/use-cases/agencies` CTA
  - `direct` — default for any sign-up with no `ref` param (main page, organic, etc.)
- If no `ref` param is present, default to `direct` so every sign-up is tagged

**Tasks:**
- [ ] Add `ref` query param reading to registration page
- [ ] Include `signup_segment` property in PostHog identify/capture on account creation
- [ ] Create 5 PostHog lists/cohorts for each segment
- [ ] Verify tag flows through by testing each CTA → register → PostHog path

### Step 5: Review and polish
- [ ] Review all 4 landing pages for tone consistency
- [ ] Ensure mobile responsiveness
- [ ] Test all CTA links and segment tag passthrough
- [ ] Confirm analytics/tracking captures segment correctly

---

## Open Questions

1. **Routing:** Do we want `/use-cases/vibe-coders` or a different URL structure?
2. **Doc polish:** After running the 4 example projects, do the featured docs need manual editing, or do we ship the raw AI output as-is? (Raw is more authentic, but may need light cleanup.)
3. **PostHog list setup:** Need the specific PostHog API calls / dashboard config to create the 5 cohorts. Tim to pull the PostHog code for each.
