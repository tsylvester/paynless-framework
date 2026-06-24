# Outcome Alignment
The metrics defined in this document validate that the AI-powered Applicant Tracking System (ATS) effectively delivers on its core value proposition: saving hiring teams—specifically those at startups and SMBs—significant hours per week typically lost to manual resume screening and interview preparation. Furthermore, these metrics ensure that the platform successfully monetizes this value within the tight 4-month initial launch window, strictly monitoring the operational costs of the underlying LLM APIs and ensuring the recurring revenue model is viable.



# North Star Metric
**Number of Candidates Successfully Screened & Ranked by AI**

This metric serves as the ultimate indicator of the platform's core value delivery. It demonstrates the end-to-end success of the user journey: users are creating jobs, sourcing candidates, and actively relying on the AI engine (GPT-4o) to parse, evaluate, and rank resumes. Sustained growth in this metric indicates strong product-market fit and high user trust in the AI's evaluations.



# Primary KPIs
To continuously validate the business case and technical feasibility, we will track the following Primary KPIs:

*   **Monthly Recurring Revenue (MRR):** Tracks the direct financial success and market validation of the platform, processed via Stripe subscriptions. Target: Achieve baseline profitability to cover API and hosting costs within the first 3 months post-launch.
*   **Weekly Active Workspaces (WAW):** Measures ongoing, team-level engagement. A workspace is considered active if at least one resume is uploaded, screened, or reviewed within a 7-day period. Target: 40% week-over-week growth in the first month post-launch.
*   **Average Time Saved per JD:** Quantified via targeted, lightweight user feedback surveys (e.g., NPS-style pop-ups post-interview generation). Target: Users report saving an average of 5+ hours per job requisition.



# Leading Indicators
These leading indicators will provide early signals of user acquisition and onboarding success before lagging financial metrics materialize:

*   **Number of Job Descriptions (JDs) Created:** Indicates top-of-funnel intent to use the platform for an active hiring cycle.
*   **Number of Team Invites Sent:** Demonstrates that admins are utilizing the multi-tenant features and integrating the platform into their broader company workflows.
*   **Number of Resumes Uploaded per Active Job:** Highlights successful sourcing (either manually or via job board/LinkedIn integrations) and ensures the AI pipeline has sufficient data to process.



# Lagging Indicators
These lagging measures will be used to assess the long-term sustainability and stickiness of the product:

*   **Trial-to-Paid Conversion Rate:** The percentage of users who upgrade to a premium tier via Stripe after exhausting their initial free AI screening limits. Target: > 15% conversion rate.
*   **Subscriber Churn Rate:** The percentage of paying workspaces that cancel their subscription in a given month. This will indicate if the platform provides continuous value beyond a single hiring push. Target: < 5% monthly churn.



# Guardrails
Given the strict constraints of a lean team and usage-based third-party APIs, the following guardrails must strictly remain within acceptable bounds:

*   **API Cost Margin:** The average OpenAI API cost must remain under 15% of the user's monthly subscription fee to ensure sustainable unit economics.
*   **System Reliability:** Platform uptime must exceed 99.9%, as hiring platforms are mission-critical during business hours.
*   **Processing Latency:** Average AI processing latency must remain under 15 seconds per resume to ensure a frictionless user experience.
*   **Human Override Rate:** User override or manual correction rate of AI-generated scores must remain below 10%, indicating high AI accuracy and minimal hallucinations.



# Measurement Plan
The measurement plan utilizes our serverless, managed-service architecture to automate tracking with minimal operational overhead:

*   **Product Analytics & Funnels:** Integrate **PostHog** to track front-end user behavior, feature usage, and conversion drop-offs. Key funnels include JD creation to resume upload, and team invite to successful onboarding.
*   **Financial Tracking:** Utilize the built-in **Stripe Dashboard** and Stripe Webhooks to monitor MRR, churn, and tier upgrades in real-time.
*   **Performance & Error Logging:** Implement custom logging within **Vercel** (for Next.js API Routes) to track API performance, LLM processing latency, and server-side errors. Supabase dashboard analytics will be utilized to monitor database load and storage utilization.



# Risk Signals
We will actively monitor for the following warning signs to preemptively address potential failure modes:

*   **High Downgrade/Cancellation Frequency:** A spike in churn after the first billing cycle suggests users are treating the platform as a disposable tool for a single hire rather than an ongoing ATS.
*   **LLM API Timeouts:** OpenAI API timeouts exceeding 2% of total requests, which risks breaking the core value proposition and frustrating users.
*   **Stripe Checkout Drop-offs:** High abandonment rates during the checkout flow, indicating friction in the payment UI or perceived lack of value at the paywall.



# Next Steps
Immediate actions required to operationalize the telemetry and metrics tracking during the infrastructure sprint (Weeks 1-3):

1.  Initialize the PostHog project and install the Next.js SDK.
2.  Define and document custom event taxonomies across the team (e.g., standardizing event names like `candidate_ranked`, `interview_generated`, `team_invited`).
3.  Configure real-time alert webhooks for critical API errors, specifically wiring Vercel/Next.js edge function failures to a dedicated Slack channel.
4.  Set up the Stripe Webhook handler in the Next.js backend to ensure accurate, real-time tracking of subscription states.



# Data Sources
PostHog (Product Analytics)

Stripe (Revenue Data)

Supabase / PostgreSQL (Platform Operational Data)



# Reporting Cadence
Metrics will be reviewed systematically to maintain alignment during the rapid 4-month development cycle and post-launch:

*   **Frequency:** Weekly KPI review meetings.
*   **Audience:** The 3 core founders.
*   **Channels:** Live synchronous review via a shared analytics dashboard (PostHog/Stripe combined view), with automated weekly summaries posted to a Slack `#metrics` channel.



# Ownership
Clear ownership ensures rapid iteration and accountability for the platform's success metrics:

*   **Product Strategist:** Accountable for User Engagement metrics (WAW, Time Saved per JD) and Revenue metrics (MRR, Conversion Rates, Churn).
*   **Technical Architect:** Accountable for System Performance (Latency, Uptime) and Cost Guardrails (OpenAI cost margins, API timeout rates).



# Escalation Plan
If mission-critical metrics or guardrails breach their defined thresholds, the following standard operating procedure will be executed:

1.  **Cost Guardrail Breach (AI Costs > 15% of Sub Fee):** The system will temporarily disable automated bulk screening for lower-tier workspaces. The Technical Architect will be notified immediately via PagerDuty/Slack alerts. The architect will then evaluate prompt optimization, investigate model switching (e.g., from GPT-4o to a cheaper tier for initial screening), or enforce stricter rate limiting.
2.  **Uptime / Latency Breach:** Re-route non-critical API requests, gracefully degrade the UI (e.g., fallback to asynchronous processing with email notifications instead of real-time polling), and initiate immediate architectural review.
3.  **High Churn Signal:** The Product Strategist will conduct immediate 1-on-1 qualitative interviews with churned users to identify feature gaps or pricing friction, adjusting the roadmap for the subsequent sprint accordingly.