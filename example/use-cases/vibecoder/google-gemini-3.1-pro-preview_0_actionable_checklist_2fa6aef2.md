# Actionable Checklist


## Milestone IDs
M1.1

M1.2

M1.3



## Index
M1.1 - Shared Core Framework & SPM Setup

M1.2 - CoreData Polymorphic Schema Implementation

M1.3 - CloudKit Synchronization & LWW Conflict Resolution



## Milestone Summary
Phase 1 Core Foundation is completely detailed, translating SPM target initialization, CoreData polymorphism, and CloudKit syncing into atomic, testable, dependency-ordered work nodes. This sequence guarantees the foundational local persistence layer and deterministic cloud sync algorithms are robustly built and strictly validated using TDD before introducing any UI or view model abstractions.



## Milestone Reference
**Id:** M1.1, M1.2, M1.3

**Phase:** Phase 1: Core Foundation

**Dependencies:** Zero upstream dependencies. This is the strict dependency frontier for the entire application.



## Steps
**Path:** Packages/SharedCore/Package.swift

**Title:** [ ] [Foundation] Packages/SharedCore/Package.swift **Initialize SPM Package Structure**

**Objective:**

- **Functional Requirement:** Bootstrap the multi-target Swift Package Manager (SPM) architecture to securely isolate the application's domain, data, and sync logic from the presentation targets.

- **Non-functional Requirement:** Ensure strict compilation boundaries so that iOS and watchOS UI targets cannot directly query the database or network without passing through view-model or service abstractions.

- **Performance Requirement:** Enforce aggressive compiler flags (e.g., `StrictConcurrency`) to surface threading issues at compile time, laying the groundwork for sub-100ms render speeds.

**Role:**

- Foundation Module Manager

- Dependency Coordinator

**Module:**

- SharedCore Package

**Deps:**

- None (Root Node)

**Context slice:**

- Relies entirely on standard Apple toolchains (`swift-tools-version: 5.9`).

- No external 3rd-party dependencies permitted at the root manifest.

**Interface:**

- Manifest declaration exposing a single unified library product: `SharedCore`.

- Internal Targets: `DataLayer`, `SyncEngine`, `APIClient`, `DomainModels`, `Connectivity`.

- Test Targets: `SharedCoreTests`.

**Interface tests:**

- Verify via `swift package describe` that all targets are registered and isolated.

- Verify `swift build` compiles the empty structure natively on both iOS and watchOS SDK destinations.

**Interface guards:**

- Guard: `// swift-tools-version: 5.9` must be explicitly declared on line 1.

- Guard: Platform restrictions `.iOS(.v17), .watchOS(.v10)` strictly enforced.

**Unit tests:**

- N/A for the manifest file itself. (Validation occurs via CLI tooling).

**Construction:**

- Standard SPM `Package(...)` constructor initializing products and targets arrays.

**Source:**

- Create `Package.swift` at `Packages/SharedCore/`.

- Define the package name as `SharedCore`.

- Add strict concurrency checking: `swiftSettings: [.enableExperimentalFeature("StrictConcurrency")]` on all targets.

- Create empty physical directories for each declared target to allow initial compilation.

**Provides:**

- SPM Framework Skeleton

- Target Definitions (DataLayer, SyncEngine, APIClient, DomainModels, Connectivity)

**Mocks:**

- N/A

**Integration tests:**

- Run `xcodebuild build -scheme SharedCore -destination 'platform=iOS Simulator,name=iPhone 15 Pro'`.

- Run `xcodebuild build -scheme SharedCore -destination 'platform=watchOS Simulator,name=Apple Watch Series 9 (45mm)'`.

**Directionality:**

- Foundation Layer -> Outward to App Targets

- Internal structure is completely decoupled from UI.

**Requirements:**

- Valid Swift 5.9 Package.swift file.

- Strict separation of internal target dependencies.

- Integration of Swift concurrency flags.

**Commit:**

- `git commit -m "chore(spm): initialize SharedCore multi-target package"`

**Path:** Packages/SharedCore/Tests/SharedCoreTests/MockInfrastructure.swift

**Title:** [ ] [Quality Assurance] Packages/SharedCore/Tests/SharedCoreTests/MockInfrastructure.swift **Testing Infrastructure & Mock Protocols Setup**

**Objective:**

- **Functional Requirement:** Establish a robust, protocol-oriented unit testing environment capable of simulating complex offline-first operations.

- **Non-functional Requirement:** Ensure tests execute within milliseconds by preventing any actual I/O to disk or external APIs.

- **Testing Requirement:** Provide highly reusable mock classes for all architectural boundaries (HealthKit, CloudKit, URLSession).

**Role:**

- Mock Provider

- Test Harness

**Module:**

- SharedCore.Tests

**Deps:**

- Provider: Packages/SharedCore/Package.swift, Layer: SPM, Direction: Inward, Context: Exposes the XCTest target framework.

**Context slice:**

- Requires access to the internal API surfaces defined in the SPM targets.

- Imports XCTest module natively.

**Interface:**

- `MockHealthStoreProtocol: HealthStoreProtocol`

- `MockURLProtocol: URLProtocol`

- `MockPersistentContainer: NSPersistentContainer`

**Interface tests:**

- Assert that calling `MockHealthStoreProtocol.requestAuthorization()` resolves synchronously and mutates internal state flags.

**Interface guards:**

- Guard: Prevent actual network requests by enforcing `URLProtocol.registerClass(MockURLProtocol.self)` in base test setup.

**Unit tests:**

- Write `testMockURLProtocolInterceptsRequests()` to verify synthetic JSON data is returned.

- Write `testMockPersistentContainerUsesInMemoryStore()` to assert `.memory` store type is configured.

**Construction:**

- Static factory methods `MockInfrastructure.buildInMemoryDatabase() -> NSPersistentContainer`.

- Standard class initializers for Protocol mocks.

**Source:**

- Implement `MockURLProtocol` overriding `canInit(with:)` and `startLoading()`.

- Implement `MockPersistentContainer` to force `NSPersistentStoreDescription` to use URL `/dev/null` for strict in-memory operation.

- Implement `MockHealthStoreProtocol` capturing state queries into observable arrays.

**Provides:**

- XCTest Target Infrastructure

- Hardware/Network Mocking Protocols

**Mocks:**

- This node is entirely dedicated to generating mocks for upstream systems.

**Integration tests:**

- Execute test suite to ensure the mocked container initializes in under 50ms without creating SQLite artifacts on disk.

**Directionality:**

- Testing -> Inward to Target Modules

- No production code depends on this file.

**Requirements:**

- Create base XCTestCase classes.

- Implement protocol stubs for external dependencies (e.g., MockHealthStore, MockURLProtocol).

**Commit:**

- `git commit -m "test(core): setup protocol-oriented mock infrastructure"`

**Path:** Packages/SharedCore/Sources/DataLayer/Schema.xcdatamodeld

**Title:** [ ] [Database Schema] Packages/SharedCore/Sources/DataLayer/Schema.xcdatamodeld **Define CoreData Data Model Schema**

**Objective:**

- **Functional Requirement:** Build the foundational local offline-first database mapping utilizing polymorphic inheritance.

- **Performance Requirement:** Satisfy sub-100ms mixed timeline rendering constraints by aggressively indexing `timestamp` and `lastModified` columns.

- **Architecture Requirement:** Enforce a single unified chronological timeline by routing all entities through the `TimelineEntity` abstract parent.

**Role:**

- Data Definition

- Local Storage Blueprint

**Module:**

- SharedCore.DataLayer

**Deps:**

- Provider: Packages/SharedCore/Package.swift, Layer: SPM, Direction: Inward, Context: SharedCore.DataLayer target definition.

**Context slice:**

- Exclusively relies on Apple's CoreData framework. No UI bindings.

**Interface:**

- Abstract Entity: `TimelineEntity` (id: UUID, timestamp: Date, entityType: Int16, lastModified: Date, isCompleted: Bool).

- Child Entity: `TaskItem` (inherits TimelineEntity, title: String, notes: String).

- Child Entity: `MealItem` (inherits TimelineEntity, calories: Int16, macrosJson: String).

**Interface tests:**

- Verify the `.momd` compiler successfully generates Swift entity subclasses.

- Verify polymorphic queries fetch both `TaskItem` and `MealItem` when executing a request for `TimelineEntity`.

**Interface guards:**

- Guard: `TimelineEntity` must be marked strictly as 'Abstract'.

- Guard: Indexes must be explicitly defined on `timestamp` (descending) and `lastModified`.

**Unit tests:**

- Write `testSchemaInitialization()` using `MockPersistentContainer` to verify the model loads successfully from the `.momd` bundle.

- Write `testPolymorphicFetch()` to insert 1 Task and 1 Meal, then fetch via `TimelineEntity` and assert `count == 2`.

**Construction:**

- Xcode Data Model Editor configuration (xml backing).

**Source:**

- Create `Schema.xcdatamodeld` via Xcode.

- Add `TimelineEntity` and configure base attributes and Compound Indexes.

- Add `TaskItem` and set its Parent Entity to `TimelineEntity`.

- Add `MealItem` and set its Parent Entity to `TimelineEntity`.

- Set Codegen to 'Class Definition' to auto-generate Swift interfaces.

**Provides:**

- Compiled .xcdatamodeld

- Polymorphic Entity Definitions

**Mocks:**

- Validated using the in-memory `MockPersistentContainer` created in M1.1.

**Integration tests:**

- N/A (Schema is verified via the PersistenceController integration).

**Directionality:**

- Data Layer -> Core Foundation

- Serves as the absolute bottom of the stack for state management.

**Requirements:**

- Create abstract TimelineEntity with attributes: id (UUID), timestamp (Date), entityType (Int16), lastModified (Date).

- Implement TaskItem and MealItem child entities with unique fields.

- Apply index constraints on timestamp_index and lastModified_index.

**Commit:**

- `git commit -m "feat(data): implement polymorphic CoreData schema for timeline"`

**Path:** Packages/SharedCore/Sources/DataLayer/PersistenceController.swift

**Title:** [ ] [Database Controller] Packages/SharedCore/Sources/DataLayer/PersistenceController.swift **Implement Thread-Safe Persistence Controller**

**Objective:**

- **Functional Requirement:** Build the persistent container singleton responsible for managing read/write contexts and threading.

- **Performance Requirement:** Configure aggressively optimized batch-faulting and pagination parameters to maintain memory footprints strictly under limits.

- **Safety Requirement:** Isolate UI thread fetch contexts (`viewContext`) from background save operations (`newBackgroundContext`).

**Role:**

- Context Manager

- Database Operations Boundary

**Module:**

- SharedCore.DataLayer

**Deps:**

- Provider: Packages/SharedCore/Sources/DataLayer/Schema.xcdatamodeld, Layer: Data Model, Direction: Inward, Context: Loads the `.momd` file into the NSPersistentContainer.

**Context slice:**

- Requires the compiled NSManagedObjectModel. Exposes contexts via dependency injection protocols, not raw global singletons.

**Interface:**

- `protocol PersistenceControllerProtocol`

- `var viewContext: NSManagedObjectContext { get }`

- `func performBackgroundWrite(block: @escaping (NSManagedObjectContext) -> Void) async throws`

**Interface tests:**

- Assert that `viewContext.automaticallyMergesChangesFromParent` is `true`.

**Interface guards:**

- Guard: Throw fatal error if `.momd` model cannot be located in the SPM bundle during initialization.

**Unit tests:**

- Write `testBackgroundWriteMergesToViewContext()` to assert background thread modifications reflect on main thread context immediately.

- Write `testBatchFetchLimitsAreEnforced()` verifying memory faults operate correctly.

**Construction:**

- `init(inMemory: Bool = false)`: Initializes the container, dynamically switching to `/dev/null` store URL if `inMemory` is true.

**Source:**

- Implement `PersistenceController` class conforming to `PersistenceControllerProtocol`.

- Initialize `NSPersistentContainer(name: "Schema", managedObjectModel: model)`.

- Configure `viewContext` with `mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy` (to be overridden later by CloudKit LWW).

- Implement async wrapper `performBackgroundWrite` to handle `performBackgroundTask` safely with standard error throwing.

**Provides:**

- CoreData Stack Singleton

- Context Threading Management

- Thread-safe Database Operations

**Mocks:**

- `MockPersistenceController` returning purely in-memory configurations.

**Integration tests:**

- Instantiate `PersistenceController(inMemory: true)`, insert 10,000 mock records, and assert fetch time is under 100ms to prove pagination rules.

**Directionality:**

- Data Implementation -> Domain Providers

- Abstracts the actual CoreData storage away from the feature modules.

**Requirements:**

- NSPersistentContainer initialization targeting in-memory (for tests) and SQLite (for prod).

- Automated configuration of viewContext.automaticallyMergesChangesFromParent.

- Application of fetch limit and pagination parameters.

**Commit:**

- `git commit -m "feat(data): implement thread-safe persistence controller"`

**Path:** App/App.entitlements

**Title:** [ ] [System Configuration] App/App.entitlements **System Capabilities & App Entitlements**

**Objective:**

- **Functional Requirement:** Register the necessary App Store Connect iCloud container identifier.

- **Non-functional Requirement:** Ensure the target has correct push capabilities for silent background synchronization (Push Notifications / Background Modes).

**Role:**

- System Security Configuration

- Capability Declarations

**Module:**

- App Target

**Deps:**

- Provider: Packages/SharedCore/Sources/DataLayer/PersistenceController.swift, Layer: Infrastructure, Direction: Outward, Context: Unlocks the hardware layer needed to upgrade the local persistence controller to cloud persistence.

**Context slice:**

- A purely structural plist/XML file defining OS-level permissions.

**Interface:**

- `com.apple.developer.icloud-container-identifiers` array.

- `com.apple.developer.icloud-services`.

**Interface tests:**

- Verify Xcode code signing validation passes during CI build.

**Interface guards:**

- Guard: CloudKit environment defined properly to allow Developer testing without polluting Production schemas.

**Unit tests:**

- N/A for XML entitlements file.

**Construction:**

- Added via Xcode 'Signing & Capabilities' UI to ensure project file integrity.

**Source:**

- Enable 'iCloud' capability.

- Check 'CloudKit'.

- Add standard container identifier `iCloud.com.appname.unifiedtimeline`.

- Enable 'Push Notifications'.

- Enable 'Background Modes' -> check 'Remote notifications'.

**Provides:**

- iCloud Container Access

- Remote Notifications Background Mode

**Mocks:**

- N/A

**Integration tests:**

- Compile app target natively to ensure the provisioning profile successfully matches the specified entitlements.

**Directionality:**

- OS Boundary -> App Target

- Required prerequisite before the SPM sync engine can utilize cloud mapping.

**Requirements:**

- Enable iCloud capability and check 'CloudKit'.

- Enable Push Notifications and Background Modes (Remote Notifications).

**Commit:**

- `git commit -m "chore(app): configure icloud and background push entitlements"`

**Path:** Packages/SharedCore/Sources/SyncEngine/CloudKitManager.swift

**Title:** [ ] [Synchronization Layer] Packages/SharedCore/Sources/SyncEngine/CloudKitManager.swift **NSPersistentCloudKitContainer Integration**

**Objective:**

- **Functional Requirement:** Upgrade the standard CoreData container to a CloudKit-backed container.

- **Operational Requirement:** Enable automatic background mapping of local entity changes to remote CloudKit databases natively.

- **Architecture Requirement:** Implement this transparently so the View/ViewModel layers remain completely unaware of the cloud context.

**Role:**

- Sync Engine Core

- Remote Database Orchestrator

**Module:**

- SharedCore.SyncEngine

**Deps:**

- Provider: App/App.entitlements, Layer: OS Config, Direction: Inward, Context: Validates the container ID.

- Provider: Packages/SharedCore/Sources/DataLayer/PersistenceController.swift, Layer: DataLayer, Direction: Inward, Context: Modifies the initialization path of the base container.

**Context slice:**

- Requires swapping `NSPersistentContainer` for `NSPersistentCloudKitContainer` within the `PersistenceController` initialization phase based on configuration flags.

**Interface:**

- `func configureCloudKit(for storeDescription: NSPersistentStoreDescription)`

- `func initializeSchema() async throws` (for Dev environments)

**Interface tests:**

- Verify `cloudKitContainerOptions` is set on the `NSPersistentStoreDescription`.

**Interface guards:**

- Guard: Do NOT initialize CloudKit in `.memory` testing modes to prevent network timeouts during CI.

**Unit tests:**

- Write `testCloudKitOptionsConfiguredForSQLiteStore()` to ensure the store description correctly attaches the `NSPersistentCloudKitContainerOptions` using the correct container identifier.

**Construction:**

- Injected during the `PersistenceController` initialization process before `loadPersistentStores` is called.

**Source:**

- Refactor `PersistenceController.swift` internally to conditionally utilize `NSPersistentCloudKitContainer`.

- Create `CloudKitManager` struct.

- Implement `cloudKitContainerOptions = NSPersistentCloudKitContainerOptions(containerIdentifier: "iCloud.com...")`.

- Apply options to the first description in `container.persistentStoreDescriptions`.

- Set `description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)`.

**Provides:**

- Background Cloud Sync Engine

- Automated Remote State Mapping

**Mocks:**

- Leverages `MockPersistentContainer` (which disables CloudKit naturally by remaining in-memory) to prevent test contamination.

**Integration tests:**

- N/A locally (Requires actual device/simulator authenticated with iCloud for full E2E, which is verified manually outside unit test scope).

**Directionality:**

- Sync Logic -> Data Logic

- Applies cloud configuration directly into the lower persistence layers.

**Requirements:**

- Replace NSPersistentContainer with NSPersistentCloudKitContainer.

- Configure NSPersistentStoreDescription to point to the correct CKContainer identifier.

**Commit:**

- `git commit -m "feat(sync): configure NSPersistentCloudKitContainer mapping"`

**Path:** Packages/SharedCore/Sources/SyncEngine/MergePolicy.swift

**Title:** [ ] [State Reconciliation] Packages/SharedCore/Sources/SyncEngine/MergePolicy.swift **Timestamp-Based LWW Pseudo-CRDT Logic**

**Objective:**

- **Functional Requirement:** Implement deterministic conflict resolution ensuring multi-device offline edit merging resolves safely.

- **Algorithm Requirement:** Use a Last-Write-Wins (LWW) pseudo-CRDT strategy prioritizing the most chronologically recent change using the `lastModified` entity attribute.

- **Stability Requirement:** Mathematically prevent the application from throwing unhandled `NSMergeConflict` exceptions during intense multi-device synchronizations.

**Role:**

- Conflict Resolution Logic

- Data Safety Guard

**Module:**

- SharedCore.SyncEngine

**Deps:**

- Provider: Packages/SharedCore/Sources/SyncEngine/CloudKitManager.swift, Layer: Sync, Direction: Inward, Context: Handles the actual conflicting push payloads generated by the container.

**Context slice:**

- Requires direct access to CoreData's `NSMergePolicy` subclassing and the `TimelineEntity.lastModified` attribute definition.

**Interface:**

- `class LWWTimestampMergePolicy: NSMergePolicy`

- `override func resolve(optimisticLockingConflicts list: [NSMergeConflict]) throws`

**Interface tests:**

- Verify the policy gracefully falls back to `error` or `trump` logic if the conflicting objects do not possess a `lastModified` date.

**Interface guards:**

- Guard: Ensure all objects within the conflict list dynamically cast to `TimelineEntity` before attempting timestamp comparison.

**Unit tests:**

- Create two separate in-memory contexts.

- Insert a cloned `TaskItem` into both. Modify context A at T=1 and context B at T=2.

- Trigger a save on both to force an `NSMergeConflict`.

- Assert the merge policy automatically executes and the final persistent store reflects the properties from context B (T=2).

**Construction:**

- `LWWTimestampMergePolicy(merge: .mergeByPropertyObjectTrumpMergePolicyType)` mapped securely onto `viewContext.mergePolicy` inside `PersistenceController`.

**Source:**

- Create `MergePolicy.swift`.

- Subclass `NSMergePolicy`.

- Override `resolve(optimisticLockingConflicts list: [NSMergeConflict]) throws`.

- Iterate over `list`. For each conflict, compare `databaseSnapshot` vs `objectSnapshot` `lastModified` values.

- If `objectSnapshot.lastModified > databaseSnapshot.lastModified`, retain object state; else revert to database state.

- Call `super.resolve` passing the manually reconciled list.

**Provides:**

- Conflict Resolution Policy

- Offline Merge Safety

- Zero-Crash Sync Assurance

**Mocks:**

- `MockNSMergeConflict` generation utilized extensively within the unit tests to artificially simulate CloudKit payload collisions.

**Integration tests:**

- Simulate a mocked background context save while a foreground context holds an unsaved edit. Assert that the `NSManagedObjectContextDidSave` notification triggers the LWW policy securely.

**Directionality:**

- Sync Logic -> Data Implementation

- Intercepts data directly at the SQLite persistence boundary before it hits the UI.

**Requirements:**

- Subclass NSMergePolicy.

- Override resolution methods to compare the lastModified timestamp of conflicting TimelineEntity instances.

- Write automated XCTest covering simulated conflicting multi-device states.

**Commit:**

- `git commit -m "feat(sync): implement timestamp-based LWW CRDT merge policy"`