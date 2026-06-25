# Risk Register


## Overview
The overall risk posture of the Unified Daily Agenda project is manageable but highly concentrated in client-side synchronization and User Experience (UX) execution. By relying exclusively on first-party Apple frameworks and eliminating custom backend REST API infrastructure, the project significantly reduces operational, security, and scalability risks. However, this shifts the risk burden directly to the device level: managing complex multi-device state synchronization without data loss, and avoiding watchOS battery drain. Product-wise, merging two conceptually distinct application domains creates high friction risks during onboarding and daily use. Addressing the unresolved V1 food database strategy is the most critical immediate concern, as failure to provide seamless food logging will invalidate the core business case.



## Risk
### 1. Cross-Device State Conflicts

**Impact:** High. Data loss, duplication, or inconsistent states between the iPhone and Apple Watch regarding task/meal completion.

**Likelihood:** Medium. The 'offline-first' architecture inherently creates branching timelines when users interact with the app on an offline Apple Watch while simultaneously or subsequently modifying data on the iPhone.

**Mitigation:** Implement CRDT (Conflict-free Replicated Data Type) principles within the CoreData models or enforce a strict, immutable timestamp-based 'last-write-wins' resolution logic across all entities.

**Components Affected:** Shared Core Functionality Framework, iOS Main App, watchOS Companion App, `NSPersistentCloudKitContainer`.

**Dependencies:** CoreData Schema validation, CloudKit syncing engine.

**Sequencing Considerations:** Conflict resolution logic MUST be fully defined and unit-tested in Phase 1 (Shared Data Foundation) before any UI or WatchConnectivity development begins.

**Risk Mitigation Plan:** Establish robust automated testing suites specifically targeting WatchConnectivity state deltas and simulated offline-to-online reconciliation bursts.

**Open Questions:** If a user marks an item complete on the watch while offline, then modifies the same item's details on the phone, does completion status override the modification, or are changes merged?

**Guardrails:** Watch sync failure rate must remain < 2%. App crash rate < 0.1%.

**Risk Signals:** User reports of 'ghost tasks' reappearing or logged meals disappearing post-sync.

**Next Steps:** Finalize the state reconciliation ruleset and draft the automated test cases for offline sync recovery.

---

### 2. Manual Food Entry Churn (V1 Food Database Strategy)

**Impact:** Critical. Relying purely on manual food entry for the MVP completely contradicts the 'zero friction' value proposition, leading to massive early user churn.

**Likelihood:** High, if the project proceeds with the current baseline assumption of manual entry.

**Mitigation:** Mandate and integrate a lightweight third-party food database REST API (e.g., Nutritionix, FatSecret, or Edamam) for the V1 launch to support barcode scanning or quick-search logging.

**Components Affected:** iOS Main App, Data Models, Third-Party Integration Layer.

**Dependencies:** Budget approval for API licensing, Third-Party REST API uptime.

**Sequencing Considerations:** API vendor selection and integration proof-of-concept must occur in Phase 1 to inform the CoreData nutritional schema.

**Risk Mitigation Plan:** Allocate budget immediately for a third-party nutrition database. Design the UI to support quick-add from the API while maintaining a fallback for custom manual entries.

**Open Questions:** What are the latency and rate-limit constraints of the chosen third-party food API, and how do they impact the offline-first mandate?

**Guardrails:** Average meals logged per user per day must be > 2.5. Day 1 Retention > 40%.

**Risk Signals:** High funnel drop-off immediately after the 'Add Meal' button is tapped.

**Next Steps:** Evaluate 3rd-party food database APIs, request pricing tiers, and validate their endpoint performance.

---

### 3. UI Overcomplication & High Onboarding Friction

**Impact:** High. Combining dense health tracking data with a daily task manager risks creating a cluttered interface, causing cognitive overload and driving low Day 7 retention.

**Likelihood:** High, due to the dual-profile setup required (baselining both dietary goals and task lists simultaneously).

**Mitigation:** Implement modular 'Focus Modes' in the UI to hide dense health data when the user is focusing on work tasks, and employ 'Progressive Profiling' to stretch onboarding over the first week.

**Components Affected:** iOS Main App UX/UI, Onboarding Flow.

**Dependencies:** Design System, User Persona definitions.

**Sequencing Considerations:** High-fidelity wireframing and user testing must validate the unified timeline design (Phase 2) before backend integration.

**Risk Mitigation Plan:** Conduct extensive A/B testing on the onboarding flow. Default the view to a simplified, interleaved timeline and allow users to opt-in to denser macro-nutrient displays.

**Open Questions:** At what exact point during onboarding should the user be prompted for HealthKit permissions to minimize denial rates?

**Guardrails:** Notification Unsubscribe Rate < 5%. Onboarding completion rate > 75%.

**Risk Signals:** Siloed usage (users heavily tracking tasks but ignoring calories, or vice-versa).

**Next Steps:** Finalize interactive wireframes and conduct user prototype testing focusing specifically on the dual-onboarding flow.

---

### 4. WatchOS Background Execution Limits & Battery Drain

**Impact:** High. Excessive continuous WatchConnectivity polling will degrade Apple Watch battery life, leading to immediate uninstalls and poor App Store reviews.

**Likelihood:** Medium. Standard Apple Watch syncing architectures frequently hit system-level background limits.

**Mitigation:** Heavily rely on localized Push Notifications via the `UserNotifications` framework rather than continuous WatchConnectivity polling. Transmit only lightweight state deltas.

**Components Affected:** watchOS Companion App, Notification Service Extension.

**Dependencies:** Apple `UserNotifications` framework, WatchConnectivity limits.

**Sequencing Considerations:** Prioritize the local push notification architecture early (Phase 3) to validate watchOS behavior and battery drain before launching TestFlight betas.

**Risk Mitigation Plan:** Profile battery usage strictly during the internal Alpha. Design the watch app to react to push notification payloads as the primary trigger for UI updates.

**Open Questions:** How quickly does WatchConnectivity awaken the watch app in the background when a task is completed on the iPhone?

**Guardrails:** Watch sync latency < 5 seconds. Negligible impact on daily device battery life.

**Risk Signals:** Spikes in app uninstalls directly correlated to watchOS app installations.

**Next Steps:** Build a WatchConnectivity proof-of-concept specifically to measure background wake limits and payload transfer latency.



## Impact
If these risks materialize, the application faces severe consequences spanning technical failure and product rejection. Data loss from state conflicts directly destroys user trust, leading to immediate abandonment. A failure to resolve the food database strategy guarantees a high-friction experience, neutralizing the app's core differentiator and crippling early adoption metrics (Day 1/Day 7 retention). Furthermore, poor optimization of watchOS syncing will result in unacceptable battery drain, prompting uninstalls and permanently damaging the app's reputation on the App Store.



## Likelihood
The overall likelihood of these risks materializing is Moderate to High. The technical complexity of managing a polymorphic CoreData schema synced reliably across devices via CloudKit natively introduces significant edge cases for state conflicts. Moreover, merging two inherently complex domains—dietary tracking and task management—guarantees UI/UX friction unless aggressively mitigated. The assumption that users will manually enter food in a V1 MVP has a near 100% historical probability of causing high churn in the modern app ecosystem.



## Mitigation
The foundational mitigation strategy centers on strict adherence to mature Apple native frameworks to avoid third-party dependency failures, combined with an 'offline-first' design. Technical mitigations require implementing rigorous conflict-resolution policies (CRDT/last-write-wins) for database synchronization and minimizing WatchConnectivity polling in favor of optimized local push notifications. Product mitigations require pivoting from manual food entry to integrating a third-party nutrition API, deploying 'Progressive Profiling' for onboarding, and utilizing UI 'Focus Modes' to prevent cognitive overload.



## Seed Examples
WatchConnectivity sync latency causing duplicate meal entries.

UI Overcomplication driving low Day 7 retention.

Manual V1 food logging causing high user abandonment.

HealthKit authorization denial crippling core value proposition.

Continuous watchOS background syncing causing severe battery drain and uninstalls.



## Mitigation Plan
The cross-cutting risk mitigation plan relies on three core themes: 1) **Automated Validation:** Engineering must establish extensive automated UI and unit testing to simulate WatchConnectivity state deltas and offline data reconciliation. 2) **Friction Elimination:** Product must secure budget and integrate a third-party nutrition database API before launch, completely removing the manual entry barrier. 3) **Progressive UX:** Design must enforce 'Focus Modes' to compartmentalize dense data and employ progressive onboarding to ease users into the dual-profile setup. 

**Owners:** The Product Strategy Lead owns UX and food API acquisition; the iOS Lead Engineer owns technical sync validation and battery profiling.

**Timelines:** Technical proofs-of-concept (WatchConnectivity, 3rd-party API tests) must be completed in Phase 1. UX mitigation validations must be finalized prior to Phase 2 development.

**Required Resources:** Budget for a commercial nutrition database API (e.g., FatSecret, Nutritionix), and dedicated senior iOS/watchOS developer bandwidth for architecture validation.



## Notes
Data loss or duplication in a health or daily task app severely impacts user trust and guarantees immediate churn. The offline-first strategy is optimal but heavily relies on the stability of CoreData polymorphism. It is assumed that Apple will not drastically alter background execution limits for watchOS in the upcoming release cycle. Follow-up is immediately required to select and license a third-party nutrition API to align with the 'zero friction' project mandate.