# Advisor Recommendations


## Comparison Matrix
**Id:** Option A: Drizzle ORM + Hard-Capped Token Limits

**Scores:**

  - **Dimension:** alignment_with_constraints
  - **Weight:** 0.1
  - **Value:** 0.9
  - **Rationale:** Perfectly aligns with the strict 4-month MVP deadline and Vercel Edge compute constraints. Drizzle's lightweight runtime avoids Edge memory limits, while hard-capped token usage directly maps to Stripe tiers, eliminating runaway cost risks.

  - **Dimension:** completeness
  - **Weight:** 0.1
  - **Value:** 0.8
  - **Rationale:** Delivers all core required features. Hard caps are easier to implement fully within the MVP window than complex metered overage billing logic.

  - **Dimension:** feasibility
  - **Weight:** 0.1
  - **Value:** 0.85
  - **Rationale:** Highly feasible. Drizzle natively supports Supabase and Edge environments without requiring a Data Proxy. Enforcing limits at the queue dispatch stage is a straightforward boolean check.

  - **Dimension:** risk_mitigation
  - **Weight:** 0.1
  - **Value:** 0.95
  - **Rationale:** Aggressively mitigates two primary project risks: Vercel serverless constraints (by using a lighter ORM) and runaway OpenAI API costs (by strictly blocking processing when tier limits are reached).

  - **Dimension:** iteration_fit
  - **Weight:** 0.1
  - **Value:** 0.9
  - **Rationale:** Ideal for Phase 1 & 2 execution. Establishing Drizzle schemas and strict DB limits early provides a rock-solid foundation for the Inngest workers in Phase 3.

  - **Dimension:** strengths
  - **Weight:** 0.1
  - **Value:** 0.9
  - **Rationale:** Zero risk of margin destruction. Exceptional cold-start performance on Vercel. Forces product-led growth by encouraging users to actively upgrade tiers when they hit limits.

  - **Dimension:** weaknesses
  - **Weight:** 0.1
  - **Value:** 0.7
  - **Rationale:** Hard caps introduce user friction during active hiring sprints if they suddenly cannot process incoming resumes without upgrading. Drizzle has a slightly steeper learning curve if the 3-person team is already accustomed to Prisma.

  - **Dimension:** opportunities
  - **Weight:** 0.1
  - **Value:** 0.8
  - **Rationale:** Clear upsell paths to higher MRR tiers. High performance margin allows future introduction of more intensive AI operations without breaking the compute budget.

  - **Dimension:** threats
  - **Weight:** 0.1
  - **Value:** 0.6
  - **Rationale:** Competitors with unlimited AI screening (subsidized by VC) might poach users frustrated by early limits.

  - **Dimension:** dealer's choice
  - **Weight:** 0.1
  - **Value:** 0.9
  - **Rationale:** Best choice for a bootstrapped or lean 3-person team prioritizing survival, profitability, and system stability over unchecked scale.

**Preferred:** true

**Id:** Option B: Prisma ORM + Pay-As-You-Go Metered Overage

**Scores:**

  - **Dimension:** alignment_with_constraints
  - **Weight:** 0.1
  - **Value:** 0.7
  - **Rationale:** Prisma's developer experience accelerates the 4-month build, but its heavier Edge footprint risks timeout/memory issues on Vercel. Pay-as-you-go introduces complex invoicing logic.

  - **Dimension:** completeness
  - **Weight:** 0.1
  - **Value:** 0.9
  - **Rationale:** Provides a completely frictionless experience for power users who can process unlimited resumes without workflow interruptions.

  - **Dimension:** feasibility
  - **Weight:** 0.1
  - **Value:** 0.6
  - **Rationale:** Prisma on Edge requires WASM or a Data Proxy, adding DevOps overhead. Metered Stripe billing requires robust idempotent webhook handling and handling of unpaid overage invoices.

  - **Dimension:** risk_mitigation
  - **Weight:** 0.1
  - **Value:** 0.5
  - **Rationale:** Fails to fully mitigate the risk of runaway LLM costs. If a user abuses the Chrome Extension and ingests 10,000 profiles, the delayed Stripe overage charge might fail, leaving the company liable for the OpenAI bill.

  - **Dimension:** iteration_fit
  - **Weight:** 0.1
  - **Value:** 0.7
  - **Rationale:** Prisma accelerates Phase 1 schema generation, but billing complexities will bleed into Phase 2 and 3, jeopardizing the strict timeline.

  - **Dimension:** strengths
  - **Weight:** 0.1
  - **Value:** 0.8
  - **Rationale:** Superior developer experience and ecosystem. Uninterrupted end-user experience maximizes the perceived value of the automated pipeline.

  - **Dimension:** weaknesses
  - **Weight:** 0.1
  - **Value:** 0.4
  - **Rationale:** High financial risk from uncollected metered invoices. Heavier bundle sizes and cold starts on Vercel.

  - **Dimension:** opportunities
  - **Weight:** 0.1
  - **Value:** 0.85
  - **Rationale:** Maximizes revenue ceiling from enterprise-level SMBs that have massive hiring volumes but prefer avoiding annual enterprise contracts.

  - **Dimension:** threats
  - **Weight:** 0.1
  - **Value:** 0.3
  - **Rationale:** OpenAI API costs outpace collected Stripe MRR due to failed payments, sinking the SaaS unit economics.

  - **Dimension:** dealer's choice
  - **Weight:** 0.1
  - **Value:** 0.5
  - **Rationale:** Too risky for a 3-person team with limited capital; better suited for a Series A startup with dedicated DevOps and Finance teams.

**Preferred:** false



## Analysis
**Summary:** The primary decisions for Phase 1 involve selecting the correct database ORM for Vercel Edge compute and finalizing the monetization strategy to protect OpenAI API budgets. Option A utilizes Drizzle ORM to maintain an ultra-light Edge footprint, entirely avoiding Vercel memory constraints, combined with strict Stripe-tier hard caps. Option B leverages Prisma for raw developer velocity and implements pay-as-you-go metered billing for a frictionless user experience. While Option B offers superior theoretical revenue ceilings and workflow continuity, it introduces massive financial risk (uncollected overage invoices vs. hard OpenAI costs) and architectural complexity (Prisma Edge Data Proxies). Option A safely locks in the MVP constraints.

**Tradeoffs:**

- Developer Velocity vs. Edge Performance: Prisma offers a superior DX and faster initial schema scaffolding, but Drizzle executes much faster in Vercel Edge environments and consumes significantly less memory.

- User Friction vs. Cost Control: Hard caps force users to pause and upgrade (friction), whereas Pay-As-You-Go ensures uninterrupted workflow. However, Pay-As-You-Go risks margin collapse if users process thousands of candidates and their overage payment fails.

**Consensus:** For a 3-person team under a strict 4-month MVP deadline, protecting unit economics and architectural stability is paramount. Option A (Drizzle + Hard Caps) effectively neutralizes the highest platform risks.



## Recommendation
**Rankings:**

  - **Rank:** 1
  - **Option id:** Option A: Drizzle ORM + Hard-Capped Token Limits
  - **Why:** Directly mitigates the critical risks outlined in the PRD (Vercel Edge constraints and LLM cost overruns). It forces a lean infrastructure and guarantees that OpenAI API costs will not exceed 15% of MRR, ensuring immediate MVP viability.
  - **When to choose:** Adopt immediately for Phase 1. Scaffold the Next.js API routes with Drizzle, and configure the Inngest middleware to check Supabase for tier limits before dispatching any OpenAI extraction jobs.

  - **Rank:** 2
  - **Option id:** Option B: Prisma ORM + Pay-As-You-Go Metered Overage
  - **Why:** Provides better UX and developer velocity but carries unacceptable financial risk for a bootstrapped/lean MVP.
  - **When to choose:** Revisit post-launch if user feedback explicitly indicates that hard limits are causing high churn, or if enterprise clients request unlimited, invoiced screening.

**Tie breakers:**

- If the engineering team has zero Drizzle experience and extensive Prisma experience, Prisma can be used strictly if routed through standard Node.js Vercel functions (bypassing Edge), provided Inngest still handles the heavy lifting.

- If Stripe metered billing is heavily requested, implement a hybrid: hard cap the base tier, but allow users to pre-purchase 'token credits' to avoid overage collection risk.