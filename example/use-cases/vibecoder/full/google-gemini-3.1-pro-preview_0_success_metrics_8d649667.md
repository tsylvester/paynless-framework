# Outcome Alignment
This Success Metrics framework is explicitly designed to validate the core hypothesis of the business case: that combining productivity (task management) and health (caloric tracking) into a single, unified daily agenda materially increases user retention and habit compliance. By tracking user behavior across both domains simultaneously, we aim to demonstrate that reducing 'app fatigue' and context-switching leads to superior adherence compared to industry baselines for standalone productivity or health applications. The metrics defined herein trace a direct line from initial onboarding friction (leading indicators) through daily cross-functional utilization (North Star) to long-term behavioral retention (lagging indicators).



# North Star Metric
### Daily Actionable Engagement (DAE)

**Definition:** The percentage of Daily Active Users (DAU) who successfully complete *at least one task* **AND** *log at least one meal* within the same 24-hour period.

**Rationale:** Since the primary differentiation of the application is the unified single-pane-of-glass approach, success cannot be measured by task completion or meal logging in isolation. DAE ensures that the core holistic self-optimization loop is being utilized and that health habits are being treated as first-class daily priorities alongside work tasks.

**Target:** We are targeting a baseline DAE of **>40%** among active users post-onboarding, demonstrating strong resonance with the combined interface.



# Primary KPIs
The primary Key Performance Indicators (KPIs) measure engagement depth and retention across the unified ecosystem:

1. **Retention Rates (Day 1, Day 7, Day 30):** Evaluates the long-term viability of the holistic planner approach.
   - *Target Thresholds:* Day 1 > 40%, Day 7 > 20%, Day 30 > 10%.
2. **Average Meals Logged per User per Day:** Measures the reduction of friction in caloric tracking, particularly validating the effectiveness of the proactive watchOS reminders.
   - *Target Threshold:* > 2.5 meals per active user per day.
3. **Task Completion Rate:** The ratio of tasks completed versus tasks created on a daily basis.
   - *Target Threshold:* > 60% completion rate, ensuring the agenda drives actual achievement rather than serving as an overwhelming backlog.



# Leading Indicators
Leading indicators provide early validation during the onboarding and initial usage phases:

- **Push Notification Opt-In Rate:** Crucial for delivering proactive, context-aware reminders. *Target: > 70% during initial onboarding.*
- **Apple Watch Companion App Installation Rate:** Validates demand for wrist-based friction reduction and justifies the native watchOS investment. *Target: > 30% of the iOS install base.*
- **Configured Recurring Meal Reminders:** The average number of automated health alerts setup during a user's first session. *Target: > 2 per user.*



# Lagging Indicators
Lagging measures will confirm sustained business and product success over time:

- **Subscription Conversion Rate:** If a premium tier (e.g., advanced macro-nutrient analytics, AI-based task prioritization) is launched, the percentage of Monthly Active Users (MAU) converting to paid subscriptions.
- **App Store Rating & Sentiment:** Organic user feedback reflecting overall satisfaction. *Target: > 4.5 Stars.*
- **30-Day Churn Rate:** The percentage of users abandoning the app after the first month, highlighting long-term habit failure or failure of the core proposition.



# Guardrails
To ensure technical stability and prevent user burnout from proactive alerts, the following constraints are strictly monitored and must not be breached:

- **Notification Unsubscribe Rate:** Must remain **below 5%**. Exceeding this indicates that meal or task reminders are too frequent, annoying, or lacking actionable context.
- **App Crash Rate:** Must remain **below 0.1%** of total sessions to maintain user trust, particularly given the sensitive nature of health data and core daily planning.
- **Watch Sync Failure Rate:** Must remain **below 2%**. High WatchConnectivity unreliability would critically undermine the wrist-first validation strategy and degrade battery performance.



# Measurement Plan
The measurement strategy relies on a robust, privacy-preserving, and anonymous telemetry pipeline. Because the app handles personal health goals and daily schedules, data collection strictly complies with App Store guidelines and standard privacy laws.

**Instrumentation:**
- **Telemetry SDKs:** Utilize Firebase Analytics or PostHog for granular event tracking, coupled with Apple's native App Analytics for acquisition and crash data.
- **Key Funnel Tracking:** Instrument specific conversion points including:
  - `Onboarding_Complete`: Triggers when task and calorie baselines are established.
  - `First_Task_Created` & `First_Meal_Logged`: Tracks time-to-value.
  - `Watch_App_Opened` & `Watch_Action_Completed`: Monitors wearable engagement.

All metrics are aggregated without exposing Personally Identifiable Information (PII) or explicit task/meal names to the backend.



# Risk Signals
**Siloed Usage Patterns**
- *Warning Sign:* A high volume of users heavily utilizing the task list but completely ignoring the calorie tracker (or vice versa).
- *Implication:* Indicates that the unified value proposition is failing to resonate, or the UI is overcomplicated, driving users back to single-purpose habits.
- *Planned Response:* If >30% of DAU fall into siloed usage after 7 days, trigger an immediate UX review to optimize the modular dashboard, adjust focus toggles (Work vs. Health), or improve onboarding to reinforce the 'holistic health' connection.



# Next Steps
1. **Define Event Taxonomy:** Product and Engineering must finalize a comprehensive tracking plan, detailing exact event names, properties, and triggers for the telemetry SDK.
2. **Competitor Baseline Analysis:** Establish final target thresholds for Day 7 retention based on detailed competitor matrices (Todoist, YAZIO, MyFitnessPal).
3. **Dashboard Creation:** Set up live tracking dashboards in the chosen analytics platform prior to the TestFlight beta launch to monitor real-time user flows and guardrail metrics.



# Data Sources
App Store Connect Analytics

Firebase/PostHog Analytics SDK

Crashlytics



# Reporting Cadence
- **Beta/TestFlight Phase:** Weekly KPI reviews focusing heavily on guardrails (crash rates, WatchConnectivity sync failures) and leading indicators.
- **Post-Launch Phase:** Monthly deep-dives focused on the North Star metric (DAE), cohort retention rates, and lagging indicators (churn, App Store ratings).
- **Channels:** Automated weekly reports distributed via Slack integrations and email, supported by live dashboard links accessible to all stakeholders.



# Ownership
- **Product Strategy Lead:** Accountable for metrics definition, reporting cadence, monitoring the North Star metric, and organizing review meetings.
- **iOS Lead Engineer:** Accountable for the technical implementation of telemetry, maintaining Crashlytics health, and ensuring WatchConnectivity sync failure rates remain within strict guardrail limits.



# Escalation Plan
Strict operational triggers are established to guarantee immediate mitigation if core metrics or guardrails fail:

- **Trigger 1:** Day 7 retention falls below **15%**.
- **Trigger 2:** App crash rate exceeds **1%**.
- **Trigger 3:** Watch sync failure rate exceeds **5%** for consecutive days.

**Escalation Action:** If any trigger is hit, an immediate triage meeting will be convened between Product and Engineering leadership. All new feature development will be halted (code freeze). Engineering resources will pivot entirely to stability, bug fixing, and targeted UX improvements until the metrics return to acceptable baseline thresholds.