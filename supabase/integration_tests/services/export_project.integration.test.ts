import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import {
  initializeSupabaseAdminClient,
  coreCreateAndSetupTestUser,
  setSharedAdminClient,
  testLogger,
  initializeTestDeps,
} from "../../functions/_shared/_integration.test.utils.ts";
import { type Database } from "../../functions/types_db.ts";
import { FileManagerService } from "../../functions/_shared/services/file_manager.ts";
import { createSignedUrlForPath, downloadFromStorage } from "../../functions/_shared/supabase_storage_utils.ts";
import { exportProject } from "../../functions/dialectic-service/exportProject.ts";
import { createProject } from "../../functions/dialectic-service/createProject.ts";

Deno.test(
  "Export Project integrates with FileManager to upload zip and return signed URL",
  { sanitizeOps: false, sanitizeResources: false },
  async (t) => {
    let adminClient: SupabaseClient<Database>;
    let userClient: SupabaseClient<Database>;
    let user: User;
    let projectId: string | null = null;

    const CONTENT_BUCKET = Deno.env.get('SB_CONTENT_STORAGE_BUCKET') || 'dialectic-content-bucket';

    const setup = async () => {
      adminClient = initializeSupabaseAdminClient();
      setSharedAdminClient(adminClient);
      initializeTestDeps();

      // Ensure required content bucket exists
      try {
        // createBucket is idempotent across runs; ignore "already exists" errors
        const { error: createErr } = await adminClient.storage.createBucket(CONTENT_BUCKET, { public: false });
        if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
          testLogger.warn(`[export_project.setup] createBucket error: ${createErr.message}`);
        }
      } catch (e) {
        testLogger.warn(`[export_project.setup] createBucket threw: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Ensure env is set so FileManagerService constructor succeeds
      if (!Deno.env.get('SB_CONTENT_STORAGE_BUCKET')) {
        Deno.env.set('SB_CONTENT_STORAGE_BUCKET', CONTENT_BUCKET);
      }

      // Create test user and client
      const { userClient: uc } = await coreCreateAndSetupTestUser();
      // DB calls rely on RLS via userClient
      userClient = uc;
      const { data: { user: fetchedUser } } = await userClient.auth.getUser();
      assertExists(fetchedUser, 'Failed to fetch test user');
      user = fetchedUser;

      // Fetch an existing domain id for project creation
      const { data: domain, error: domainError } = await adminClient
        .from('dialectic_domains')
        .select('id')
        .eq('name', 'Software Development')
        .single();
      assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
      assertExists(domain, 'Expected Software Development domain to exist');

      // Create a minimal project (no resources required for export)
      const formData = new FormData();
      formData.append('projectName', 'Export IT Project');
      formData.append('selectedDomainId', domain.id);
      formData.append('initialUserPromptText', 'Initial content for export integration test');

      const { data: project, error: createErr2 } = await createProject(formData, adminClient, user);
      assert(!createErr2, `Failed to create project: ${createErr2?.message}`);
      assertExists(project, 'Project creation returned no data');
      projectId = project?.id ?? null;
      assertExists(projectId, 'Project id must exist after creation');
    };

    const teardown = async () => {
      // Rely on shared cleanup in other suites; nothing additional here
    };

    await t.step('Setup', setup);

    await t.step('Should generate export zip via FileManager and return a signed URL', async () => {
      assertExists(projectId, 'Cannot export without a project id');

      const fileManager = new FileManagerService(adminClient);
      const storageUtils = {
        // Ignore the passed client and use adminClient to avoid RLS issues for storage ops
        downloadFromStorage: (_c: SupabaseClient<Database>, bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        createSignedUrlForPath: (_c: SupabaseClient<Database>, bucket: string, path: string, exp: number) => createSignedUrlForPath(adminClient, bucket, path, exp),
      };

      const { data, error } = await exportProject(userClient, fileManager, storageUtils, projectId!, user.id);
      assert(!error, `exportProject returned error: ${error?.message}`);
      assertExists(data?.export_url, 'Expected export_url to be returned');
      const expectedFileName = 'project_export_export-it-project.zip';
      assertEquals(data?.file_name, expectedFileName);

      // Also verify a resource row was created for the export (file_name ends with .zip)
      const { data: resources, error: resErr } = await adminClient
        .from('dialectic_project_resources')
        .select('file_name, storage_bucket, storage_path')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(5);
      assert(!resErr, `Failed to query project resources: ${resErr?.message}`);
      assertExists(resources, 'Expected at least one resource row after export');
      const zipRow = (resources || []).find(r => typeof r.file_name === 'string' && r.file_name.endsWith('.zip'));
      assertExists(zipRow, 'Expected a registered .zip resource for the export');

      // Export again to verify overwrite semantics (upsert): only one .zip entry with expected name should exist at root
      const second = await exportProject(userClient, fileManager, storageUtils, projectId!, user.id);
      assert(!second.error, `Second export returned error: ${second.error?.message}`);
      const { data: afterResources, error: afterErr } = await adminClient
        .from('dialectic_project_resources')
        .select('file_name, storage_path')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(20);
      assert(!afterErr, `Failed to query resources after second export: ${afterErr?.message}`);
      const atRootAfter = (afterResources || []).filter(r => r.storage_path === projectId);
      const zipRowsForName = atRootAfter.filter(r => r.file_name === expectedFileName);
      assertEquals(zipRowsForName.length, 1, 'Expected exactly one export zip row after overwrite');
    });

    await t.step('Teardown', teardown);
  },
);


Deno.test(
  "Export succeeds with initial root resource present; both coexist at project root",
  { sanitizeOps: false, sanitizeResources: false },
  async (t) => {
    let adminClient: SupabaseClient<Database>;
    let userClient: SupabaseClient<Database>;
    let user: User;
    let projectId: string | null = null;

    const CONTENT_BUCKET = Deno.env.get('SB_CONTENT_STORAGE_BUCKET') || 'dialectic-content-bucket';

    const setup = async () => {
      adminClient = initializeSupabaseAdminClient();
      setSharedAdminClient(adminClient);
      initializeTestDeps();

      // Ensure required content bucket exists
      try {
        const { error: createErr } = await adminClient.storage.createBucket(CONTENT_BUCKET, { public: false });
        if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
          testLogger.warn(`[export_project.coexist.setup] createBucket error: ${createErr.message}`);
        }
      } catch (_) {
        testLogger.warn('[export_project.coexist.setup] createBucket threw (ignored)');
      }

      // Ensure env is set so FileManagerService constructor succeeds
      if (!Deno.env.get('SB_CONTENT_STORAGE_BUCKET')) {
        Deno.env.set('SB_CONTENT_STORAGE_BUCKET', CONTENT_BUCKET);
      }

      // Create test user and client
      const { userClient: uc } = await coreCreateAndSetupTestUser();
      userClient = uc;
      const { data: { user: fetchedUser } } = await userClient.auth.getUser();
      assertExists(fetchedUser, 'Failed to fetch test user');
      user = fetchedUser;

      // Fetch an existing domain id for project creation
      const { data: domain, error: domainError } = await adminClient
        .from('dialectic_domains')
        .select('id')
        .eq('name', 'Software Development')
        .single();
      assert(!domainError, `Failed to fetch domain: ${domainError?.message}`);
      assertExists(domain, 'Expected Software Development domain to exist');

      // Create a project with an initial prompt (root-level resource)
      const formData = new FormData();
      formData.append('projectName', 'Root Coexistence Project');
      formData.append('selectedDomainId', domain.id);
      formData.append('initialUserPromptText', 'Initial prompt ensures a root-level resource exists');

      const { data: project, error: createErr2 } = await createProject(formData, adminClient, user);
      assert(!createErr2, `Failed to create project: ${createErr2?.message}`);
      assertExists(project, 'Project creation returned no data');
      projectId = project?.id ?? null;
      assertExists(projectId, 'Project id must exist after creation');

      // Verify an initial root-level resource exists
      const { data: beforeResources, error: beforeErr } = await adminClient
        .from('dialectic_project_resources')
        .select('file_name, storage_bucket, storage_path, project_id')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(10);
      assert(!beforeErr, `Failed to query initial project resources: ${beforeErr?.message}`);
      assertExists(beforeResources);
      const initialAtRoot = (beforeResources || []).find(r => r.storage_path === projectId && typeof r.file_name === 'string' && r.file_name.endsWith('.md'));
      assertExists(initialAtRoot, 'Expected an initial prompt resource at the project root');
    };

    await t.step('Setup', setup);

    await t.step('Export coexists at project root and returns signed URL', async () => {
      assertExists(projectId, 'Cannot export without a project id');

      const fileManager = new FileManagerService(adminClient);
      const storageUtils = {
        downloadFromStorage: (_c: SupabaseClient<Database>, bucket: string, path: string) => downloadFromStorage(adminClient, bucket, path),
        createSignedUrlForPath: (_c: SupabaseClient<Database>, bucket: string, path: string, exp: number) => createSignedUrlForPath(adminClient, bucket, path, exp),
      };

      const { data, error } = await exportProject(userClient, fileManager, storageUtils, projectId!, user.id);
      // GREEN expectation: succeeds
      assert(!error, `exportProject returned error: ${error?.message}`);
      assertExists(data?.export_url, 'Expected export_url to be returned');
      const expectedFileName = 'project_export_root-coexistence-project.zip';
      assertEquals(data?.file_name, expectedFileName);

      // Verify both initial prompt (.md) and export (.zip) exist at the project root path
      const { data: resources, error: resErr } = await adminClient
        .from('dialectic_project_resources')
        .select('file_name, storage_bucket, storage_path')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(10);
      assert(!resErr, `Failed to query project resources: ${resErr?.message}`);
      assertExists(resources);
      const atRoot = (resources || []).filter(r => r.storage_path === projectId);
      const hasInitialMd = atRoot.some(r => typeof r.file_name === 'string' && r.file_name.endsWith('.md'));
      const hasZip = atRoot.some(r => typeof r.file_name === 'string' && r.file_name.endsWith('.zip'));
      assert(hasInitialMd, 'Expected initial prompt file at root');
      assert(hasZip, 'Expected export .zip file at root');

      // Export again to verify overwrite semantics
      const second = await exportProject(userClient, fileManager, storageUtils, projectId!, user.id);
      assert(!second.error, `Second export returned error: ${second.error?.message}`);
      const { data: afterResources, error: afterErr } = await adminClient
        .from('dialectic_project_resources')
        .select('file_name, storage_path')
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false })
        .limit(20);
      assert(!afterErr, `Failed to query resources after second export: ${afterErr?.message}`);
      const atRootAfter = (afterResources || []).filter(r => r.storage_path === projectId);
      const zipRowsForName = atRootAfter.filter(r => r.file_name === expectedFileName);
      assertEquals(zipRowsForName.length, 1, 'Expected exactly one export zip row after overwrite');
    });
  },
);

