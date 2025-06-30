import {
    assert,
    assertEquals,
    assertExists,
    assertNotEquals,
  } from "https://deno.land/std@0.208.0/assert/mod.ts";
  import {
    describe,
    it,
    beforeAll,
    afterAll,
  } from "https://deno.land/std@0.208.0/testing/bdd.ts";
  import {
    initializeSupabaseAdminClient,
    coreCreateAndSetupTestUser,
    initializeTestDeps,
    coreCleanupTestResources,
  } from "../../functions/_shared/_integration.test.utils.ts";
  import { SupabaseClient } from "npm:@supabase/supabase-js@2";
  
  // Test setup: Create three users and an organization.
  // User A: Org Admin
  // User B: Org Member
  // User C: No Org Affiliation
  const userA = { id: "", client: null as any };
  const userB = { id: "", client: null as any };
  const userC = { id: "", client: null as any };
  
  let serviceRoleClient: SupabaseClient<any>;
  let orgId: string;
  
  describe("RLS Policy Integration Tests for Profiles and Wallets", () => {
    beforeAll(async () => {
      initializeTestDeps();
      serviceRoleClient = initializeSupabaseAdminClient();
  
      // Create users and get their clients
      const userAPromise = coreCreateAndSetupTestUser();
      const userBPromise = coreCreateAndSetupTestUser();
      const userCPromise = coreCreateAndSetupTestUser();
      
      const [userAResult, userBResult, userCResult] = await Promise.all([userAPromise, userBPromise, userCPromise]);
  
      userA.client = userAResult.userClient;
      userA.id = userAResult.userId;
      userB.client = userBResult.userClient;
      userB.id = userBResult.userId;
      userC.client = userCResult.userClient;
      userC.id = userCResult.userId;
  
      assertExists(userA.id);
      assertExists(userB.id);
      assertExists(userC.id);
  
      // Create an organization and add users A and B
      const { data: org, error: orgError } = await serviceRoleClient
        .from("organizations")
        .insert({ name: "Test RLS Org" })
        .select()
        .single();
      if (orgError) throw orgError;
      assertExists(org.id);
      orgId = org.id;
  
      // Add members
      const { error: memberError } = await serviceRoleClient
        .from("organization_members")
        .insert([
          { organization_id: orgId, user_id: userA.id, role: "admin", status: "active" },
          { organization_id: orgId, user_id: userB.id, role: "member", status: "active" },
        ]);
      if (memberError) throw memberError;
      
      // Set up user profile privacy settings
      await serviceRoleClient.from('user_profiles').update({ profile_privacy_setting: 'private' }).eq('id', userA.id);
      await serviceRoleClient.from('user_profiles').update({ profile_privacy_setting: 'members' }).eq('id', userB.id);
      await serviceRoleClient.from('user_profiles').update({ profile_privacy_setting: 'public' }).eq('id', userC.id);
  
      // Create token wallets
      await serviceRoleClient.from('token_wallets').insert([
          { user_id: userA.id, currency: 'AI_TOKEN', balance: 100 },
          { user_id: userB.id, currency: 'AI_TOKEN', balance: 100 },
          { user_id: userC.id, currency: 'AI_TOKEN', balance: 100 },
          { organization_id: orgId, currency: 'AI_TOKEN', balance: 1000 },
      ]);
    });
  
    afterAll(async () => {
      // Manually clean up resources that weren't automatically tracked
      await serviceRoleClient.from("organization_members").delete().eq("organization_id", orgId);
      await serviceRoleClient.from("organizations").delete().eq("id", orgId);
      
      // coreCleanupTestResources will handle deleting the users created by coreCreateAndSetupTestUser
      await coreCleanupTestResources('all');
    });
  
    describe("User Profiles RLS Policies", () => {
      it("A user can always select their own profile", async () => {
        const { data, error } = await userA.client
          .from("user_profiles")
          .select("*")
          .eq("id", userA.id);
        assert(!error, `Selecting own profile failed: ${error?.message}`);
        assertEquals(data?.length, 1);
        assertEquals(data?.[0].id, userA.id);
      });
  
      it("A user can see a 'public' profile", async () => {
        const { data, error } = await userA.client
          .from("user_profiles")
          .select("id")
          .eq("id", userC.id);
        assert(!error, `Selecting public profile failed: ${error?.message}`);
        assertEquals(data?.length, 1);
      });
  
      it("A user cannot see a 'private' profile of another user", async () => {
         // User C (no org) tries to see User A's (private) profile
        const { data, error } = await userC.client
          .from("user_profiles")
          .select("id")
          .eq("id", userA.id);
        assert(!error, `Query should not fail, just return no data: ${error?.message}`);
        assertEquals(data?.length, 0);
      });
      
      it("A user can see a 'members' profile if they share an org", async () => {
        // User A (admin) tries to see User B's ('members') profile
        console.log(`Test: User A (${userA.id}) checking User B (${userB.id})'s 'members' profile in Org (${orgId})`);
        const { data, error } = await userA.client
          .from("user_profiles")
          .select("id")
          .eq("id", userB.id);
        console.log('Test query data:', JSON.stringify(data, null, 2));
        console.log('Test query error:', error);
         assert(!error, `Selecting org member's profile failed: ${error?.message}`);
         assertEquals(data?.length, 1);
      });
  
      it("A user cannot see a 'members' profile if they do not share an org", async () => {
        // User C (no org) tries to see User B's ('members') profile
        const { data, error } = await userC.client
          .from("user_profiles")
          .select("id")
          .eq("id", userB.id);
         assert(!error, `Query should not fail, just return no data: ${error?.message}`);
         assertEquals(data?.length, 0);
      });
    });
  
    describe("Token Wallets RLS Policies", () => {
      it("A user can select their own personal wallet", async () => {
          const { data, error } = await userA.client
            .from("token_wallets")
            .select("*")
            .eq("user_id", userA.id)
            .is("organization_id", null);
          assert(!error, `Selecting own wallet failed: ${error?.message}`);
          assertEquals(data?.length, 1);
          assertEquals(data?.[0].user_id, userA.id);
      });
  
      it("A user cannot select another user's personal wallet", async () => {
          const { data, error } = await userA.client
            .from("token_wallets")
            .select("*")
            .eq("user_id", userB.id)
            .is("organization_id", null);
          assert(!error, `Query should not fail, just return no data: ${error?.message}`);
          assertEquals(data?.length, 0);
      });
  
      it("An org admin can select the organization's wallet", async () => {
          const { data, error } = await userA.client // User A is admin
            .from("token_wallets")
            .select("*")
            .eq("organization_id", orgId);
          assert(!error, `Admin selecting org wallet failed: ${error?.message}`);
          assertEquals(data?.length, 1);
          assertEquals(data?.[0].organization_id, orgId);
      });
  
      it("A non-admin org member cannot select the organization's wallet", async () => {
          const { data, error } = await userB.client // User B is member
            .from("token_wallets")
            .select("*")
            .eq("organization_id", orgId);
          assert(!error, `Query should not fail, just return no data: ${error?.message}`);
          assertEquals(data?.length, 0);
      });
      
      it("A non-member cannot select the organization's wallet", async () => {
          const { data, error } = await userC.client // User C is not in the org
            .from("token_wallets")
            .select("*")
            .eq("organization_id", orgId);
          assert(!error, `Query should not fail, just return no data: ${error?.message}`);
          assertEquals(data?.length, 0);
      });
    });

    describe("Organization and Invite Flow", () => {
      let newOrgId: string;
      const inviteeEmail = "new.test.user@example.com";

      it("A user can create a new organization", async () => {
        const { data: newOrg, error: newOrgError } = await userA.client
          .rpc('create_org_and_admin_member', {
            p_user_id: userA.id,
            p_org_name: 'Newly Created Org',
            p_org_visibility: 'private'
          });
          
        assert(!newOrgError, `Org creation failed: ${newOrgError?.message}`);
        assertExists(newOrg, "create_org_and_admin_member should return the new org's ID");
        newOrgId = newOrg;

        // Verify the org exists and user A is an admin
        const { data: members, error: membersError } = await serviceRoleClient
          .from('organization_members')
          .select('*')
          .eq('organization_id', newOrgId)
          .eq('user_id', userA.id)
          .eq('role', 'admin');
        
        assert(!membersError, `Failed to verify org membership: ${membersError?.message}`);
        assertEquals(members?.length, 1);
      });

      it("An admin can invite a new, non-registered user by email", async () => {
        // User A invites a new user to the newly created org
        // In a real app, this token would be generated securely. For the test, a simple random string is sufficient.
        const inviteToken = `test-token-${Math.random()}`;

        const { data: invite, error: inviteError } = await userA.client
            .from('invites')
            .insert({
                organization_id: newOrgId,
                invited_email: inviteeEmail,
                role_to_assign: 'member',
                invited_by_user_id: userA.id,
                invite_token: inviteToken, // Provide the required token
            })
            .select()
            .single();
        
        assert(!inviteError, `Invite creation failed: ${inviteError?.message}`);
        assertExists(invite);
        assertEquals(invite.invited_email, inviteeEmail);
        assertEquals(invite.status, 'pending');
      });
    });
  }); 