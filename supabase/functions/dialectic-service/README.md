# Dialectic Service Edge Function

## Overview

The `dialectic-service` is a Deno Edge Function for Supabase that serves as the primary backend for the AI Dialectic feature. It handles various operations related to dialectic projects, contributions, and resources, acting as a single, unified endpoint.

The function is invoked via a `POST` request, with an `action` parameter specified in the request body (for JSON) or as a form field (for multipart/form-data). It requires a valid Supabase JWT for most operations.

## Core Concepts

-   **Action**: The specific operation to be performed.
-   **Payload**: A JSON object sent in the request body containing the necessary parameters for the requested action.
-   **Authentication**: Most requests must include an `Authorization: Bearer <SUPABASE_JWT>` header. The function validates the user's token and permissions before processing the request.

---

## Common Response Formats

### Success Response

Successful operations return a `200 OK` status with a JSON body.

```json
{
  "data": {
    "key": "value",
    "...": "..."
  },
  "success": true
}
```

### Error Response

Failed operations return an appropriate HTTP error status (e.g., 400, 401, 404, 500) with a JSON body describing the error.

```json
{
  "error": "A descriptive error message.",
  "success": false,
  "details": { "...": "..." } // Optional: additional error details
}
```

---

## Actions

### `createProject`

Creates a new dialectic project. This is a multipart request.

-   **URL**: `POST /dialectic-service`
-   **Request**: `multipart/form-data`
    -   `action`: "createProject"
    -   `projectName`: The name of the new project.
    -   `projectDefinition`: A JSON file containing the project's structure and initial settings.
-   **Success Response (`data` object)**:
    -   The newly created `DialecticProject` object.

### `listProjects`

Lists all dialectic projects accessible to the authenticated user.

-   **URL**: `POST /dialectic-service`
-   **Request Body**: `{ "action": "listProjects" }`
-   **Success Response (`data` object)**:
    -   An array of `DialecticProject` objects.

### `getProjectDetails`

Retrieves detailed information about a specific project.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "getProjectDetails",
      "payload": {
        "projectId": "uuid-of-the-project"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   The `DialecticProject` object with all its details.

### `cloneProject`

Clones an existing dialectic project, creating a new project for the current user.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "cloneProject",
      "payload": {
        "projectId": "uuid-of-project-to-clone"
      }
    }
    ```
-   **Success Response (`data` object)**:
    ```json
    {
      "newProjectId": "uuid-of-the-newly-created-project"
    }
    ```

### `exportProject`

Exports a project's data into a single JSON object.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "exportProject",
      "payload": {
        "projectId": "uuid-of-project-to-export"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   Contains the full project export data.

### `deleteProject`

Deletes a project and all its associated data.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "deleteProject",
      "payload": {
        "projectId": "uuid-of-project-to-delete"
      }
    }
    ```
-   **Success Response (`data` object)**: `null`

### `startSession`

Initiates a new dialectic session for a project.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "startSession",
      "payload": {
        "projectId": "uuid-of-the-project"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   The newly created `DialecticSession` object.

### `generateStageContributions`

Triggers the generation of AI-powered contributions for a specific stage of a dialectic process.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "generateStageContributions",
      "payload": {
        "sessionId": "uuid-of-the-dialectic-session",
        "iterationNumber": 1,
        "stageSlug": "the-slug-of-the-current-stage"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   Confirms that the generation process has started or completed.

### `submitStageResponses`

Submits user responses for a given stage, potentially advancing the dialectic process.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "submitStageResponses",
      "payload": {
        "sessionId": "uuid-of-the-dialectic-session",
        "responses": { ... } // Stage-specific response object
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   Information about the next stage or the result of the submission.

### `getContributionContentSignedUrl`

Retrieves a signed URL for accessing the content of a specific contribution.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "getContributionContentSignedUrl",
      "payload": {
        "contributionId": "uuid-of-the-contribution"
      }
    }
    ```
-   **Success Response (`data` object)**:
    ```json
    {
      "signedUrl": "a-temporary-url-to-the-content"
    }
    ```

### `saveContributionEdit`

Saves user edits to the content of a contribution.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "saveContributionEdit",
      "payload": {
        "contributionId": "uuid-of-the-contribution",
        "content": "The updated content to save."
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   The updated `DialecticContribution` object.

### `uploadProjectResourceFile`

Uploads a resource file (e.g., an image) to be associated with a project. This is a multipart request.

-   **URL**: `POST /dialectic-service`
-   **Request**: `multipart/form-data`
    -   `action`: "uploadProjectResourceFile"
    -   `projectId`: The UUID of the project.
    -   `file`: The file to upload.
-   **Success Response (`data` object)**:
    -   Details about the uploaded resource, including its URL.

### `getProjectResourceContent`

Retrieves the content of a specific project resource file from Supabase Storage.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "getProjectResourceContent",
      "payload": {
        "resourceId": "uuid-of-the-project-resource",
        "fileName": "name-of-the-file.txt"
      }
    }
    ```
-   **Success Response (`data` object)**:
    ```json
    {
      "content": "The textual content of the resource file.",
      "fileName": "name-of-the-file.txt",
      "mimeType": "text/plain"
    }
    ```

### `listAvailableDomainTags`

Lists available domain tags, optionally filtered by stage association.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "listAvailableDomainTags",
      "payload": {
        "stageAssociation": "optional-stage-slug"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   An array of `DomainTagDescriptor` objects.

### `updateProjectDomainTag`

Updates the domain tag for a specific project.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "updateProjectDomainTag",
      "payload": {
        "projectId": "uuid-of-the-project",
        "domainTag": "new-domain-tag"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   Confirmation of the update.

### `listAvailableDomainOverlays`

Lists available domain overlays for a given stage.

-   **URL**: `POST /dialectic-service`
-   **Request Body**:
    ```json
    {
      "action": "listAvailableDomainOverlays",
      "payload": {
        "stageAssociation": "stage-slug"
      }
    }
    ```
-   **Success Response (`data` object)**:
    -   An array of `DomainOverlayDescriptor` objects. 