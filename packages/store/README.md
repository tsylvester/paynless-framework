# @paynless/store

This package contains Zustand stores for managing application state across the Paynless platform.

## Available Stores

*   AuthStore: Manages authentication state, user profile.
*   SubscriptionStore: Handles subscription plans and status.
*   AIStore: Manages state related to AI chat interactions and configurations.
*   NotificationStore: Handles system-wide notifications.
*   OrganizationStore: Manages organization details, members, and settings.
*   AnalyticsStore: (Placeholder or for future analytics data)
*   WalletStore: Manages token wallet information and transactions.
*   DialecticStore: Manages state for the AI Dialectic Engine.

---

## Dialectic Store (`dialecticStore.ts`)

The `dialecticStore` is responsible for managing all state related to the AI Dialectic Engine feature. This includes dialectic projects, sessions, AI model catalogs, domain tags, and the content of contributions.

### Key State Properties (`DialecticStateValues`)

*   `projects: DialecticProject[] | null`: List of dialectic projects for the current user.
*   `currentProjectDetail: DialecticProject | null`: Detailed information for a currently selected project, including its sessions and contributions.
*   `modelCatalog: AIModelCatalogEntry[] | null`: List of available AI models for use in dialectic sessions.
*   `availableDomainTags: string[] | null`: List of available domain tags for categorizing projects.
*   `selectedDomainTag: string | null`: The currently selected domain tag for project creation or filtering.
*   `contributionContentCache: { [contributionId: string]: ContributionCacheEntry }`: Cache for storing fetched contribution content to avoid redundant downloads.
*   Loading states (e.g., `isLoadingProjects`, `isLoadingProjectDetail`, `isLoadingModelCatalog`, `isCreatingProject`, `isStartingSession`).
*   Error states (e.g., `projectsError`, `projectDetailError`, `modelCatalogError`, `createProjectError`, `startSessionError`).

### Key Actions/Thunks

*   `fetchDialecticProjects()`: Fetches the list of dialectic projects.
*   `fetchDialecticProjectDetails(projectId: string)`: Fetches detailed information for a specific project.
*   `createDialecticProject(payload: CreateProjectPayload)`: Creates a new dialectic project.
*   `startDialecticSession(payload: StartSessionPayload)`: Starts a new dialectic session for a project.
*   `fetchAIModelCatalog()`: Fetches the list of available AI models.
*   `fetchAvailableDomainTags()`: Fetches the list of available domain tags.
*   `setSelectedDomainTag(tag: string | null)`: Sets the selected domain tag in the state.
*   `fetchContributionContent(contributionId: string)`: Fetches and caches the content of a specific dialectic contribution via a signed URL.

### Selectors (`dialecticStore.selectors.ts`)

Selectors are provided to access specific parts of the `dialecticStore` state. For example:
*   `selectDialecticProjects`
*   `selectCurrentProjectDetail`
*   `selectModelCatalog`
*   `selectAvailableDomainTags`
*   And various selectors for loading and error states. 