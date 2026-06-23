# Dependency Map


## Overview
This dependency map outlines the architectural, operational, and ecosystem integrations required to deliver the unified daily agenda application. The system leverages an overwhelmingly native approach, relying almost entirely on first-party Apple frameworks like CloudKit, HealthKit, and WatchConnectivity. This native mandate drastically reduces third-party infrastructure risks and effectively eliminates the cost of managing custom REST API servers. However, it strictly ties the product's ultimate fate to Apple's App Store Review Guidelines, HealthKit permission models, and watchOS execution constraints. Understanding these dependencies highlights the critical need to finalize the Shared Core data models immediately, ensuring a stable foundation before tackling complex cross-device synchronization.



## Components
iOS Main App

watchOS Companion App

Notification Service Extension

Shared Core Functionality Framework



## Integration Points
Apple HealthKit

NSPersistentCloudKitContainer

WatchConnectivity

UserNotifications Framework



## Conflict Flags
HealthKit read/write permissions being denied by the user.

WatchConnectivity background execution limits imposed by watchOS.



## Dependencies
The realization of this system relies on a select group of explicitly defined external dependencies, infrastructure providers, and ecosystem partnerships to ensure reliable delivery, cross-device synchronization, and product iteration.

### Primary Dependencies
*   **Apple Developer Program:** A mandatory foundational dependency for provisioning profiles, App Store Connect access, HealthKit entitlement provisioning, and TestFlight beta distribution.
*   **Xcode Cloud (CI/CD):** The primary operational dependency for continuous integration, automated UI/Unit testing, and automated release orchestration to TestFlight and the App Store.
*   **PostHog or Firebase Analytics:** The designated telemetry SDKs required to monitor the North Star Metric (Daily Actionable Engagement) via privacy-preserving, non-PII event tracking across the multi-platform environments.
*   **Third-Party Food Nutrition API (Strongly Recommended):** While initially omitted as an explicit dependency, the business case strongly recommends mandating a third-party food database API (e.g., Nutritionix, FatSecret, or Edamam) for V1. Relying strictly on manual entry creates extreme friction, violating the app's core value proposition.



## Sequencing
Strict implementation sequencing is required to prevent extensive and costly refactoring of the complex polymorphic data models supporting both productivity tasks and health metrics. 

### Recommended Order of Work
1.  **Phase 1: Foundation (Shared Core Framework):** The Shared Core Functionality Framework and the polymorphic CoreData schema **MUST** be finalized and validated before any UI development begins. This includes establishing the `NSPersistentCloudKitContainer` sync logic.
2.  **Phase 2: iOS Core UX:** Build out the main iOS application utilizing SwiftUI. Connect the validated CoreData models to the unified timeline view and implement standard HealthKit read/write integrations.
3.  **Phase 3: Proactive Notifications:** Develop and integrate the Notification Service Extension to support scheduled, context-aware local push alerts for daily meals and time-bound tasks.
4.  **Phase 4: watchOS Extension:** Develop the Apple Watch companion app. Establish the real-time WatchConnectivity data synchronization pipeline, ensuring payload sizes are optimized to under 10KB to prevent watchOS battery drain.
5.  **Phase 5: Telemetry & CI/CD Validation:** Integrate Firebase/PostHog event taxonomies, finalize the Xcode Cloud testing pipelines, and initiate internal TestFlight distribution.



## Risk Mitigation
Relying so heavily on native Apple ecosystem frameworks introduces strict platform constraints. The following mitigation plans are established for high-risk integration areas:

*   **Framework Coupling:** To mitigate the risk of tight coupling directly to system APIs, all Apple framework dependencies (such as HealthKit managers and WatchConnectivity delegates) will be abstracted behind protocols within the Shared Core Framework. This enables robust dependency injection, allowing the team to utilize mocked data for comprehensive unit testing and decoupled UI iteration.
*   **Permission Denials:** To mitigate the conflict flag of users denying HealthKit or Notification permissions, the app will implement a graceful UI degradation strategy. If health read/write permissions are restricted, the app will seamlessly fallback to an isolated manual tracker that does not export data to Apple Health, while fully maintaining core task management functionalities.
*   **WatchConnectivity Unreliability:** To mitigate watchOS background execution limits, the architecture heavily favors scheduled localized UserNotifications on both devices simultaneously, drastically reducing the reliance on continuous WatchConnectivity background polling.



## Open Questions
Several assumptions and unresolved elements remain regarding the critical dependency path:

1.  **Third-Party API Commitment:** Should a third-party food database API be officially documented as a primary, blocking dependency for V1, officially overriding the initial manual entry constraint?
2.  **Compliance Limits on Analytics:** Do the chosen telemetry providers (Firebase or PostHog) meet the stringent data residency and compliance limits for an application handling pseudo-health data, even if explicit PII and health metrics are rigorously stripped from the payload?
3.  **Xcode Cloud Tiering:** Will the default Xcode Cloud tier provided by the Apple Developer Program offer sufficient parallel compute hours to run simultaneous UI tests on both iOS and watchOS simulators on every pull request?