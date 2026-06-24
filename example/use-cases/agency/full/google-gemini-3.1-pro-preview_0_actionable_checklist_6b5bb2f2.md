# Actionable Checklist


## Milestone IDs
m0.1

m1.1



## Index
m0.1: Toast API Partner Authorization

m1.1: iPaaS Base Provisioning & Webhook Listeners



## Milestone Summary
Actionable Checklist outlining the strict delivery boundaries for Toast API provisioning (m0.1) and iPaaS webhook ingestion, security, and offline queuing (m1.1). By expanding these nodes into TDD-ready work units, this checklist guarantees the secure ingress, validation, and DLQ protection required to maintain physical-to-digital inventory parity before frontend development begins.



## Milestone Reference
**Id:** m0.1, m1.1

**Phase:** Phase 0: Go/No-Go API Approval and Phase 1: iPaaS Core Integration

**Dependencies:** m0.1 has no external prerequisites but acts as a strict dependency for m1.1. No code or middleware configuration in m1.1 may begin until m0.1 is verified.



## Steps
**Path:** partner_portal/application

**Title:** Submit Partner Docs

**Objective:**

- Provide required business validation to Toast to initiate the partner review process.

- Establish the technical use case documentation required by Toast Partner ecosystem, specifically justifying headless synchronization.

- Restrict the requested scope to a single-location merchant to expedite approval and meet Toast's strict API limitations.

**Role:**

- Management/Admin

- Integration Architect

**Module:**

- Toast Partner Platform

**Interface:**

- **Toast Partner Portal Form:** Web-based submission interface.

- **Fields:** Legal business name, single-location UID, E-commerce strategy (Headless WP/Shopify).

**Interface tests:**

- Verify that the business entity details exactly match Toast merchant records.

- Verify the architectural justification clearly specifies a 'Read-Only POS Data Sync' to lower perceived risk.

**Interface guards:**

- Ensure multi-location configuration options are explicitly unselected.

- Ensure write-access (menu updates) is omitted from the initial scope to ensure fast-track approval.

**Unit tests:**

- Validate form submission returns a tracking/application ID.

- Verify automated confirmation receipt via email.

**Construction:**

- Manual form entry via Toast Integration Portal.

**Source:**

- Business justification: 'Deploying a headless WordPress and Shopify environment utilizing Make.com to ingest real-time webhook inventory updates from Toast.'

- Scope: 'Inventory API (Read), Webhook configuration.'

**Provides:**

- Toast Application ID

- Partner Portal Access

**Integration tests:**

- Login to Toast Partner Portal utilizing provided credentials.

- Verify Application Status displays as 'Pending' or 'Approved'.

**Directionality:**

- Outbound business request to third-party vendor.

**Requirements:**

- Single-location specification.

- Architectural justification documentation uploaded.

- Agreement to Toast API SLA and Terms of Service.

**Commit:**

- Log Application ID in project tracking systems.

- Record submission timestamp and establish a 48-hour follow-up cadence.

**Path:** partner_portal/sandbox_provisioning

**Title:** Sandbox API & Webhook Provisioning

**Objective:**

- Acquire development API credentials from the approved Toast Partner Portal.

- Register the initial development/sandbox webhook endpoints pointing to a placeholder sink (e.g., webhook.site) for payload inspection.

**Role:**

- Integration Architect

- Security Architect

**Module:**

- Toast Partner Platform

**Deps:**

- partner_portal/application (Direction: Inbound, Slice: Approved Partner Status)

**Context slice:**

- Access to the Toast Integration Sandbox.

- Toast Application ID indicating approval.

**Interface:**

- **Toast Sandbox Dashboard:** Credential generation UI.

- **Toast Webhook Configurator:** URL and Event type registry.

**Interface tests:**

- Verify generation of `client_id` and `client_secret`.

- Verify webhook endpoint accepts HTTPS protocol strictly.

**Interface guards:**

- Fail if credentials are inadvertently exposed in unencrypted channels.

- Fail if webhook endpoint does not support TLS 1.2 or higher.

**Unit tests:**

- Execute a manual REST API authentication call to `https://sandbox.toasttab.com/authentication/v1/authentication/login` using generated keys.

- Verify response contains a valid JWT Bearer token.

**Construction:**

- 1. Navigate to Sandbox > Integrations > API Access.

- 2. Generate new API Client.

- 3. Navigate to Webhooks > Add Endpoint.

- 4. Select 'Inventory Update' event type.

**Source:**

- Webhook URL: temporary diagnostic endpoint.

- API Scope Selection: `inventory:read`, `menus:read`.

**Provides:**

- Toast API Keys (Client ID / Secret)

- Registered Webhook Endpoints

**Mocks:**

- Diagnostic endpoint (webhook.site) acts as a mock consumer for Toast's initial push payloads.

**Integration tests:**

- Trigger a sandbox inventory deduction (manual POS ring-up).

- Verify the diagnostic endpoint receives a JSON payload matching the `ToastWebhook_Inventory` schema.

**Directionality:**

- Inbound credential receipt and outbound configuration.

**Requirements:**

- Secure storage of Client Secret in a managed password vault or 1Password.

- Access to inventory endpoints and webhook configuration screens.

**Commit:**

- Store `TOAST_CLIENT_ID` and `TOAST_CLIENT_SECRET` securely.

- Document standard payload schema received from the mock integration.

**Path:** ipaas/auth_connectors

**Title:** System Connection & OAuth Provisioning

**Objective:**

- Establish secure, least-privilege API connections between Make.com, Toast Sandbox, and the Shopify Admin API.

- Implement OAuth 2.0 flows and token refresh lifecycles natively within Make.com.

**Role:**

- Security Architect

- Integration Developer

**Module:**

- Make.com Core Connections

**Deps:**

- partner_portal/sandbox_provisioning (Direction: Inbound, Slice: Toast API Keys)

**Context slice:**

- Toast `client_id` and `client_secret`.

- Shopify Custom App Admin API Access Token (specifically `write_inventory`, `read_inventory`, `read_products`).

**Interface:**

- **Make.com Connection UI:** Native credential storage component.

- **Shopify Admin API Auth:** X-Shopify-Access-Token header.

- **Toast API Auth:** Bearer Token via OAuth 2.0 standard flow.

**Interface tests:**

- Test Make.com -> Toast connection yields a `200 OK` from `/menus/v2/restaurants/{restaurant_id}`.

- Test Make.com -> Shopify connection yields a `200 OK` from a basic `{ shop { name } }` GraphQL query.

**Interface guards:**

- Ensure Shopify scopes strictly exclude `write_orders` or `write_customers` to maintain least privilege.

- Ensure Toast authentication handles token expiry and automatically retrieves a new Bearer token.

**Unit tests:**

- Validate connection module responds with valid access flags.

- Verify token refresh triggers seamlessly before standard 1-hour expiry (Toast specific).

**Construction:**

- 1. In Make.com, navigate to Connections.

- 2. Add Custom App Connection for Toast POS using HTTP OAuth 2.0 module.

- 3. Add Shopify Connection using Make.com's native Shopify app, inserting the Custom App Admin token.

**Source:**

- Shopify GraphQL URL: `https://{store_name}.myshopify.com/admin/api/2024-01/graphql.json`

- Toast Token URL: `https://sandbox.toasttab.com/authentication/v1/authentication/login`

**Provides:**

- Shopify Admin GraphQL Connection object in Make.com

- Toast Partner API Connection object in Make.com

**Mocks:**

- Use a dummy endpoint to test credential rejection if scopes are misaligned.

**Integration tests:**

- Run a single 'List' operation on both platforms from Make.com to verify end-to-end authorization handshake.

**Directionality:**

- Bidirectional API Auth configured within middleware.

**Requirements:**

- OAuth 2.0 configuration applied successfully.

- Shopify InventorySet scope enforcement strictly maintained.

**Commit:**

- Save Connections in Make.com Team workspace.

- Rename connections clearly: `Toast_Sandbox_Auth_v1` and `Shopify_Sandbox_Admin_v1`.

**Path:** ipaas/middleware/hmac_validation

**Title:** Cross-Cutting HMAC Validation

**Objective:**

- Implement generic cryptographic validation for all incoming Toast POS webhook payloads to secure the ingress point.

- Protect against malicious payload injection by verifying the Toast-generated signature.

**Role:**

- Security Architect

**Module:**

- Make.com Webhook Routes

**Deps:**

- ipaas/auth_connectors (Direction: Structural, Slice: Verified API Environment)

**Context slice:**

- Make.com Custom Webhook module.

- Toast Webhook Secret (obtained from Toast Partner Portal).

**Interface:**

- **Webhook URL:** The Make.com assigned payload URL.

- **Headers:** `toast-signature`.

- **Body:** Raw JSON payload.

**Interface tests:**

- Calculate SHA-256 HMAC of the raw body using the Toast Webhook Secret.

- Compare calculated HMAC with the `toast-signature` header.

**Interface guards:**

- If signatures match, proceed to routing.

- If signatures do not match, abort execution and return HTTP 401 Unauthorized.

**Unit tests:**

- Simulate a request with a valid signature and assert execution continues.

- Simulate a request with an invalid/missing signature and assert execution halts with 401.

**Construction:**

- 1. Create Make.com Custom Webhook.

- 2. Add a 'Set Variable' module to capture raw body.

- 3. Add Make.com native 'Crypto' module to compute HMAC-SHA256.

- 4. Add a Router / Filter block checking `computed_hmac` == `toast-signature`.

**Source:**

- Algorithm: `sha256`

- Key: `{{env.TOAST_WEBHOOK_SECRET}}`

- Input: `{{1.rawBody}}`

**Provides:**

- Verified Webhook Ingress Filter

- Payload Security Middleware

**Mocks:**

- Postman collection configured to send payloads with dynamically generated valid signatures and intentionally broken signatures.

**Integration tests:**

- Trigger a real Toast POS Sandbox inventory event and monitor the Make.com execution history for successful HMAC validation.

**Directionality:**

- Inbound (Toast -> iPaaS).

**Requirements:**

- Reject unauthorized payloads with 401 HTTP status.

- Log failed validation attempts silently in Make.com history without alerting external caller.

**Commit:**

- Save Make.com scenario: `Middleware_Ingress_Security_Base`.

- Update Toast Partner Portal webhook URL to the newly secured Make.com webhook.

**Path:** ipaas/middleware/dlq

**Title:** Cross-Cutting DLQ Configuration

**Objective:**

- Configure native offline queuing (Dead Letter Queue) for rejected or failed webhook processes to prevent data loss.

- Ensure high-availability resilience against Shopify API limits (429 Too Many Requests) and ISP drops.

**Role:**

- Integration Architect

**Module:**

- Make.com Core Error Handlers

**Deps:**

- ipaas/auth_connectors (Direction: Outbound, Slice: Shopify Rate Limits)

**Context slice:**

- Shopify Admin API limits (Cost-based GraphQL limits).

- Make.com Incomplete Executions storage.

**Interface:**

- **Make.com Error Handlers:** `Break`, `Ignore`, `Resume`, `Rollback` directives.

**Interface tests:**

- Test that an HTTP 429 error from the Shopify API connector triggers the 'Break' directive.

- Test that the 'Break' directive successfully stores the incomplete payload with all original headers and timestamp intact.

**Interface guards:**

- Ensure error handler catches specifically `DataError` and `ConnectionError`.

- Prevent infinite loops by setting max retry attempts to 3 within the `Break` module.

**Unit tests:**

- Simulate a Shopify 429 response via mock API.

- Assert the execution pauses and enters the Incomplete Executions queue rather than failing completely.

**Construction:**

- 1. Attach an Error Handler to the Shopify GraphQL module in all blueprints.

- 2. Select the 'Break' directive.

- 3. Configure Break to store incomplete execution and retry automatically after 5 minutes.

- 4. Attach an 'Ignore' directive to known non-critical errors (e.g., 'Product Not Found').

**Source:**

- Make.com Error Routing Logic.

- Retry schedule: 5m, 15m, 60m.

**Provides:**

- Dead Letter Queue Storage

- Automated Chronological Replay Mechanism

**Mocks:**

- Mock an HTTP 503 Service Unavailable response from Shopify to trigger the DLQ.

**Integration tests:**

- Force a failure in the Shopify module.

- Verify the payload is preserved in Incomplete Executions.

- Manually resolve the failure condition and 'Run Incomplete Executions' to verify successful processing.

**Directionality:**

- Internal iPaaS Logic.

**Requirements:**

- Capture Shopify 429 Rate Limit errors accurately.

- Preserve exact Toast payload timestamp for replay to maintain chronological integrity.

**Commit:**

- Apply Error Handler configuration template across all Make.com scenarios.

- Enable 'Allow storing Incomplete Executions' in Scenario settings.

**Path:** ipaas/webhooks/inventory

**Title:** Inventory Sync Blueprints

**Objective:**

- Parse validated incoming Toast payloads, translate physical SKUs to Shopify variants, and accurately update Location inventory.

- Achieve a strict physical-to-digital inventory parity SLA of < 60s.

**Role:**

- Integration Developer

**Module:**

- Make.com Blueprints

**Deps:**

- ipaas/middleware/hmac_validation (Direction: Inbound, Slice: Verified Webhook Payload)

- ipaas/middleware/dlq (Direction: Internal, Slice: Error Handling Envelope)

**Context slice:**

- Toast `item_id` and `quantity_available`.

- Shopify Admin GraphQL `inventorySetQuantities` mutation.

- Shopify `LocationId` mapping.

**Interface:**

- **Input:** JSON from HMAC validation router.

- **Process:** Data mapping logic.

- **Output:** Shopify GraphQL Mutation.

**Interface tests:**

- Map `Toast.item_id` string to `Shopify.InventoryItemId` GraphQL GID format.

- Map `Toast.quantity_available` to Shopify `quantity` integer.

**Interface guards:**

- Ensure quantities are positive integers or zero. Reject negative values if not supported by Shopify inventory logic.

- Validate `LocationId` correctly matches the intended Shopify store location before executing mutation.

**Unit tests:**

- Verify blueprint extracts correct `item_id` from a nested Toast webhook payload.

- Verify GraphQL mutation is formatted correctly with `inventoryItemId`, `locationId`, and `quantity` variables.

**Construction:**

- 1. Receive payload from HMAC module.

- 2. Add Make.com 'Data Store' or JSON Map module to resolve `Toast SKU` to `Shopify InventoryItemId`.

- 3. Use Shopify 'Make a GraphQL API Call' module.

- 4. Construct mutation: `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { inventoryAdjustmentGroup { id } userErrors { field message } } }`.

- 5. Map variables into the GraphQL payload.

**Source:**

- Make.com Scenario Blueprint JSON.

- GraphQL Query and Variables mapping.

**Provides:**

- Real-Time Inventory Parity Blueprint

- Toast-to-Shopify GraphQL Mutation Logic

**Mocks:**

- Mock JSON mapping table representing physical SKUs to digital InventoryItem IDs.

**Integration tests:**

- Trigger a Toast sandbox inventory deduction.

- Measure the time from Toast event emission to Shopify inventory update.

- Assert E2E latency < 60s.

- Verify Shopify backend reflects exact `quantity_available`.

**Directionality:**

- Toast -> iPaaS -> Shopify Admin

**Requirements:**

- End-to-end execution latency < 60s.

- Correct mapping of Toast `item_id` to Shopify `InventoryItemId`.

**Commit:**

- Activate Make.com Scenario `Inventory_Sync_Toast_To_Shopify`.

- Verify production logs confirm < 60s processing times for 10 sequential test events.