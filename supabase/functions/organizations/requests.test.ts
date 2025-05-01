import { assertEquals, assertExists, assert } from 'jsr:@std/assert';
import { describe, it } from 'jsr:@std/testing/bdd';

import { handleCreateJoinRequest, handleUpdateRequestStatus } from './requests.ts';
import { User } from '@supabase/supabase-js';
import { 
    createMockSupabaseClient, 
    MockSupabaseDataConfig, 
    MockQueryBuilderState 
} from "../_shared/test-utils.ts";

// Mock user objects conforming to Supabase User type (keep as is, should be compatible)
const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'Test User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    // Add other required fields if necessary, e.g., role, updated_at
};

const mockAdminUser: User = {
    id: 'admin-user-id',
    email: 'admin@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'Admin User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

// Mock Request object (basic)
const mockRequest = (method = 'POST', body = {}, headers = {}) => new Request('http://localhost', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

describe('Requests Handlers', () => {

    describe('handleCreateJoinRequest (POST /organizations/:orgId/requests)', () => {
        const orgId = 'test-org-id';
        const requestPath = `/organizations/${orgId}/requests`;

        it('should allow user to request joining', async () => {
            const newRequestId = 'new-req-123';
            const config: MockSupabaseDataConfig = {
                mockUser: mockUser,
                genericMockResults: {
                    organization_members: {
                        // Mock select for checking existing membership: returns null
                        select: (state: MockQueryBuilderState) => {
                            if (
                                state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id) &&
                                state.filters.some(f => f.column === 'organization_id' && f.value === orgId) &&
                                state.filters.some(f => f.column === 'status' && Array.isArray(f.value) && f.value.includes('active') && f.value.includes('pending'))
                            ) {
                                return Promise.resolve({ data: null, error: null, count: 0 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')}); // Fail test if wrong select happens
                        },
                        // Mock insert: returns new request ID
                        insert: (state: MockQueryBuilderState) => {
                            // Basic check on insert data
                            const insertPayload = Array.isArray(state.insertData) ? state.insertData[0] : state.insertData;
                            if (insertPayload?.user_id === mockUser.id && insertPayload?.organization_id === orgId && insertPayload?.status === 'pending') {
                                // The handler chains .select().single() after insert, so the insert mock needs to return data
                                // The test utility doesn't automatically handle chained selects after insert/update mocks.
                                // We return the expected *final* data here.
                                return Promise.resolve({ data: [{ id: newRequestId, status: 'pending', created_at: new Date().toISOString() }], error: null, count: 1 });
                            }
                             return Promise.resolve({ data: null, error: new Error('Mock insert condition not met')});
                        }
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {}); // No body expected

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            const body = await response.json();

            assertEquals(response.status, 201);
            assertExists(body.id);
            assertEquals(body.id, newRequestId);
            assertEquals(body.status, 'pending');
        });

        it('should return 409 if user is already an active member', async () => {
            const config: MockSupabaseDataConfig = {
                 mockUser: mockUser,
                 genericMockResults: {
                    organization_members: {
                        // Mock select for checking existing membership: returns active member
                        select: (state: MockQueryBuilderState) => {
                             if (
                                state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id) &&
                                state.filters.some(f => f.column === 'organization_id' && f.value === orgId) &&
                                state.filters.some(f => f.column === 'status' && Array.isArray(f.value) && f.value.includes('active') && f.value.includes('pending'))
                            ) {
                                return Promise.resolve({ data: [{ id: 'mem-1', status: 'active' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        }
                        // No insert expected
                    }
                 }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {});

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            assertEquals(response.status, 409);
        });

        it('should return 409 if user already has a pending request', async () => {
            const config: MockSupabaseDataConfig = {
                 mockUser: mockUser,
                 genericMockResults: {
                    organization_members: {
                         // Mock select for checking existing membership: returns pending member
                        select: (state: MockQueryBuilderState) => {
                             if (
                                state.filters.some(f => f.column === 'user_id' && f.value === mockUser.id) &&
                                state.filters.some(f => f.column === 'organization_id' && f.value === orgId) &&
                                state.filters.some(f => f.column === 'status' && Array.isArray(f.value) && f.value.includes('active') && f.value.includes('pending'))
                            ) {
                                return Promise.resolve({ data: [{ id: 'mem-2', status: 'pending' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        }
                    }
                 }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {});

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            assertEquals(response.status, 409);
        });

        it('should return 500 on member check error', async () => {
             const config: MockSupabaseDataConfig = {
                 mockUser: mockUser,
                 genericMockResults: {
                    organization_members: {
                        // Mock select for checking existing membership: returns error
                        select: () => Promise.resolve({ data: null, error: new Error('DB Check Error'), count: null })
                    }
                 }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {});

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            assertEquals(response.status, 500);
        });

        it('should return 500 on insert error', async () => {
             const config: MockSupabaseDataConfig = {
                 mockUser: mockUser,
                 genericMockResults: {
                    organization_members: {
                        // Mock select: returns null (no existing)
                        select: () => Promise.resolve({ data: null, error: null, count: 0 }),
                        // Mock insert: returns error
                        insert: () => Promise.resolve({ data: null, error: new Error('DB Insert Error'), count: null })
                    }
                 }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {});

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            assertEquals(response.status, 500);
        });

        it('should return 404/403 on RLS violation during insert', async () => {
             const config: MockSupabaseDataConfig = {
                 mockUser: mockUser,
                 genericMockResults: {
                    organization_members: {
                        // Mock select: returns null (no existing)
                        select: () => Promise.resolve({ data: null, error: null, count: 0 }),
                        // Mock insert: returns RLS error
                        insert: () => Promise.resolve({ data: null, error: { code: '42501', message: 'RLS error' }, count: null })
                    }
                 }
            };
             const { client: mockClient } = createMockSupabaseClient(config);
            const req = mockRequest('POST', {});

            const response = await handleCreateJoinRequest(req, mockClient, mockUser, orgId, {});
            assertEquals(response.status, 404); // As implemented currently
        });
    });

    describe('handleUpdateRequestStatus (PUT /organizations/members/:membershipId/status)', () => {
        const membershipId = 'mem-pending-123';
        const targetOrgId = 'org-for-pending-mem';
        const request = (status: 'active' | 'removed') => mockRequest('PUT', { status });

        it('should allow admin to approve a pending request', async () => {
            const approveRequest = request('active');
            const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser, // Requesting user is admin
                rpcResults: {
                    is_org_admin: () => Promise.resolve({ data: true, error: null }) // Admin check passes
                },
                genericMockResults: {
                    organization_members: {
                        // Mock select to fetch the pending membership
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        },
                        // Mock update to 'active'
                        update: (state: MockQueryBuilderState) => {
                            const updatePayload = state.updateData;
                            if ((updatePayload as { status?: string })?.status === 'active' && state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                 // Handler chains .select().single() after update
                                return Promise.resolve({ data: [{ id: membershipId, status: 'active' }], error: null, count: 1 });
                            }
                             return Promise.resolve({ data: null, error: new Error('Mock update condition not met')});
                        }
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);

            const response = await handleUpdateRequestStatus(approveRequest, mockClient, mockAdminUser, membershipId, { status: 'active' });
            const body = await response.json();

            assertEquals(response.status, 200);
            assertEquals(body.status, 'active');
            assertEquals(body.id, membershipId);
        });

        it('should allow admin to deny a pending request (set status to removed)', async () => {
            const denyRequest = request('removed');
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser, // Requesting user is admin
                rpcResults: {
                    is_org_admin: () => Promise.resolve({ data: true, error: null }) // Admin check passes
                },
                genericMockResults: {
                    organization_members: {
                        // Mock select to fetch the pending membership
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                             return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        },
                        // Mock update to 'removed'
                        update: (state: MockQueryBuilderState) => {
                             const updatePayload = state.updateData;
                            if ((updatePayload as { status?: string })?.status === 'removed' && state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                // Handler returns 204, data might be [{ id: membershipId, status: 'removed' }] or similar
                                return Promise.resolve({ data: [{ id: membershipId, status: 'removed' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock update condition not met')});
                        }
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);

            const response = await handleUpdateRequestStatus(denyRequest, mockClient, mockAdminUser, membershipId, { status: 'removed' });

            assertEquals(response.status, 204); // Expecting 204 No Content for removal
            assertEquals(response.body, null);
        });

        it('should return 400 for invalid status in body', async () => {
            const invalidRequest = mockRequest('PUT', { status: 'invalid-status' });
            const config: MockSupabaseDataConfig = { mockUser: mockAdminUser }; // No DB/RPC needed
            const { client: mockClient } = createMockSupabaseClient(config);

            const response = await handleUpdateRequestStatus(invalidRequest, mockClient, mockAdminUser, membershipId, { status: 'invalid-status' as any });
            assertEquals(response.status, 400);
            // Could add spies here to check DB/RPC were not called if desired
        });

        it('should return 404 if membership record not found', async () => {
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser,
                genericMockResults: {
                    organization_members: {
                        // Mock select: returns null (not found)
                        select: () => Promise.resolve({ data: null, error: null, count: 0 })
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'active' });
            assertEquals(response.status, 404);
        });

        it('should return 500 on error fetching membership', async () => {
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser,
                genericMockResults: {
                    organization_members: {
                         // Mock select: returns error
                        select: () => Promise.resolve({ data: null, error: new Error('Fetch Error'), count: null })
                    }
                }
            };
             const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'active' });
            assertEquals(response.status, 500);
        });

        it('should return 403 if requesting user is not admin of the target org', async () => {
            const config: MockSupabaseDataConfig = {
                mockUser: mockUser, // Non-admin user
                rpcResults: {
                    // Admin check fails
                    is_org_admin: () => Promise.resolve({ data: false, error: null })
                },
                 genericMockResults: {
                    organization_members: {
                        // Mock select succeeds (to get past the 404)
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        }
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockUser, membershipId, { status: 'active' });
            assertEquals(response.status, 403);
        });

        it('should return 500 on admin check error', async () => {
            const config: MockSupabaseDataConfig = {
                 mockUser: mockAdminUser,
                rpcResults: {
                    // Admin check returns error
                    is_org_admin: () => Promise.resolve({ data: null, error: new Error('RPC Error') })
                },
                 genericMockResults: {
                    organization_members: {
                         // Mock select succeeds (to get past the 404)
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        }
                    }
                }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'active' });
            assertEquals(response.status, 500);
        });

        it('should return 409 if membership is not pending', async () => {
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser,
                rpcResults: {
                    is_org_admin: () => Promise.resolve({ data: true, error: null }) // Admin check passes
                },
                 genericMockResults: {
                    organization_members: {
                         // Mock select returns an *active* member
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'active', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        }
                        // Update should not be called
                    }
                 }
            };
            const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'active' });
            assertEquals(response.status, 409);
        });

        it('should return 500 on update error', async () => {
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser,
                rpcResults: {
                    is_org_admin: () => Promise.resolve({ data: true, error: null }) // Admin check passes
                },
                genericMockResults: {
                    organization_members: {
                        // Mock select returns pending member
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        },
                        // Mock update returns DB error
                        update: () => Promise.resolve({ data: null, error: new Error('DB Update Error'), count: null })
                    }
                }
            };
             const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('active');

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'active' });
            assertEquals(response.status, 500);
        });

         it('should return 409 on update constraint violation', async () => {
             const config: MockSupabaseDataConfig = {
                mockUser: mockAdminUser,
                rpcResults: {
                    is_org_admin: () => Promise.resolve({ data: true, error: null }) // Admin check passes
                },
                genericMockResults: {
                    organization_members: {
                         // Mock select returns pending member
                        select: (state: MockQueryBuilderState) => {
                            if (state.filters.some(f => f.column === 'id' && f.value === membershipId)) {
                                return Promise.resolve({ data: [{ organization_id: targetOrgId, user_id: 'some-user-id', status: 'pending', role: 'member' }], error: null, count: 1 });
                            }
                            return Promise.resolve({ data: null, error: new Error('Mock select condition not met')});
                        },
                        // Mock update returns constraint violation error
                        update: () => Promise.resolve({ data: null, error: { message: 'violates constraint last_admin' }, count: null })
                    }
                }
            };
             const { client: mockClient } = createMockSupabaseClient(config);
            const req = request('removed'); // Trying to remove

            const response = await handleUpdateRequestStatus(req, mockClient, mockAdminUser, membershipId, { status: 'removed' });
            assertEquals(response.status, 409);
        });
    });
}); 