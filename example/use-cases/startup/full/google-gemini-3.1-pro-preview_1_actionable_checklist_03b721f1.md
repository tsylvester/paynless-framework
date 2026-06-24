# Actionable Checklist


## Milestone IDs
MS-1

MS-2



## Index
Phase 1: Foundational Infrastructure

Phase 2: Core ATS Mechanics

Phase 3: AI Intelligence Pipeline

Phase 4: Sourcing & Launch





## Milestone Reference
**Id:** MS-1, MS-2

**Phase:** Phase 1: Foundational Infrastructure, Phase 2: Core ATS Mechanics

**Dependencies:** MS-1 has no dependencies; MS-2 depends on MS-1.



## Steps
**Path:** apps/web/app/api/storage/presigned-url/route.ts

**Deps:**

- infrastructure/supabase: Data Layer

- core/jobs-crud: UI Shell

**Context slice:**

- Requires active session for pre-signed URL generation.

- Requires Job ID to bind Candidate record.

**Interface:**

- POST /api/storage/presigned-url

- Supabase Storage Bucket 'resumes'

**Interface tests:**

- Test unauthorized requests return HTTP 401.

- Test valid request returns signed URL and path string.

**Interface guards:**

- Validate user session via GoTrue.

- Enforce 5MB file size limit and application/pdf mime-type.

**Unit tests:**

- Assert token payload limits file key prefix strictly to workspace_id to prevent cross-tenant uploads.

**Construction:**

- Next.js Route Handler using Supabase Admin client to generate signed upload URLs.

- Storage bucket creation via Supabase migrations.

**Source:**

- const { data, error } = await supabase.storage.from('resumes').createSignedUploadUrl(filePath);

- supabase.from('Candidates').insert({ job_id, resume_url: filePath, status: 'pending' });

**Provides:**

- Storage Bucket Policies

- Pre-signed URL API

- Candidate Record Initializer

**Mocks:**

- Mock Supabase storage client returning dummy pre-signed URL string.

**Integration tests:**

- E2E test: User uploads mock PDF via UI, verify file arrives in local Supabase storage bucket, verify Candidate DB row is created.

**Directionality:**

- Client to Object Store

**Requirements:**

- Storage buckets provisioned securely via CLI.

- Pre-signed URLs generated strictly for authenticated Workspace Members.

- File uploads completely bypass Vercel API memory limits.

- Initial Candidate record created upon successful blob storage.

**Commit:**

- Added supabase/migrations/0002_storage_buckets.sql

- Added /api/storage/presigned-url/route.ts API route