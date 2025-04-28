import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { create } from 'zustand';
import { Organization, OrganizationMemberWithProfile, ApiError } from '@paynless/types';
import { api } from '@paynless/api'; // Mock this
import { logger } from '@paynless/utils';

// Define the state structure based on the plan
interface OrganizationState {
  userOrganizations: Organization[];
  currentOrganizationId: string | null;
  currentOrganizationDetails: Organization | null;
  currentOrganizationMembers: OrganizationMemberWithProfile[];
  isLoading: boolean;
  error: string | null; // Store error messages as strings
}

// Define the actions interface (implementations will be in the actual store)
interface OrganizationActions {
  fetchUserOrganizations: () => Promise<void>;
  setCurrentOrganizationId: (orgId: string | null) => void;
  fetchOrganizationDetails: (orgId: string) => Promise<void>;
  fetchCurrentOrganizationMembers: () => Promise<void>; // Fetches for currentOrganizationId
  softDeleteOrganization: (orgId: string) => Promise<boolean>; // Returns success status
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

// Combine state and actions for the store type
type OrganizationStore = OrganizationState & OrganizationActions;

// --- Mock Dependencies ---
vi.mock('@paynless/api', () => ({
  api: {
    // Mock the organizations PROPERTY as an OBJECT containing the methods
    organizations: {
      listUserOrganizations: vi.fn(),
      getOrganizationDetails: vi.fn(),
      getOrganizationMembers: vi.fn(),
      deleteOrganization: vi.fn(),
      // Add other org methods if needed by store actions
    },
    // Mock other API groups if needed (ensure structure matches real api export)
    // billing: { ... },
    // ai: { ... }, 
    // notifications: { ... }
  },
}));

vi.mock('@paynless/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock authStore to get userId - simplified for now
vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'test-user-id' } })) // Provide mock user ID
  }
}));

// --- Create a temporary store instance for testing --- 
// This allows testing actions without needing the full store implementation yet
// We will need the actual store implementation later for more complex tests

const createTestStore = (initialState: Partial<OrganizationState> = {}) => create<OrganizationStore>((set, get) => ({
  // Initial State
  userOrganizations: initialState.userOrganizations ?? [],
  currentOrganizationId: initialState.currentOrganizationId ?? null,
  currentOrganizationDetails: initialState.currentOrganizationDetails ?? null,
  currentOrganizationMembers: initialState.currentOrganizationMembers ?? [],
  isLoading: initialState.isLoading ?? false,
  error: initialState.error ?? null,

  // Mock Actions for testing purposes (implementations to come)
  fetchUserOrganizations: vi.fn(async () => { /* Test logic will go here */ }),
  setCurrentOrganizationId: vi.fn((orgId) => { 
      set({ currentOrganizationId: orgId });
      // TODO: Add logic later to potentially clear details/members if orgId changes
  }),
  fetchOrganizationDetails: vi.fn(async (orgId) => { /* Test logic will go here */ }),
  fetchCurrentOrganizationMembers: vi.fn(async () => { /* Test logic will go here */ }),
  softDeleteOrganization: vi.fn(async (orgId) => true), // Placeholder
  setError: vi.fn((error) => set({ error, isLoading: false })), 
  setLoading: vi.fn((loading) => set({ isLoading: loading })), 
}));


// --- Test Suite --- 
describe('OrganizationStore', () => {
  let useOrgStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    // Create a fresh store instance for each test
    useOrgStore = createTestStore();
    vi.clearAllMocks();
    // Mock API return values needed for the tests in this suite
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Initial State Tests ---
  it('should have correct initial state', () => {
    const state = useOrgStore.getState();
    expect(state.userOrganizations).toEqual([]);
    expect(state.currentOrganizationId).toBeNull();
    expect(state.currentOrganizationDetails).toBeNull();
    expect(state.currentOrganizationMembers).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  // --- fetchUserOrganizations Tests ---
  describe('fetchUserOrganizations', () => {
    const mockOrgs: Organization[] = [
      { id: 'org1', name: 'Org One', visibility: 'private', created_at: 'd1', deleted_at: null },
      { id: 'org2', name: 'Org Two', visibility: 'public', created_at: 'd2', deleted_at: null },
      { id: 'org3', name: 'Deleted Org', visibility: 'private', created_at: 'd3', deleted_at: new Date().toISOString() }, // Example deleted org
    ];

    it('should set loading state, call API, filter deleted orgs, and update state on success', async () => {
      // Arrange: Access the mocked method correctly
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      listMock.mockResolvedValue({ 
          status: 200, 
          data: mockOrgs 
      }); 
      const setStateSpy = vi.spyOn(useOrgStore.getState(), 'setLoading');
      const setErrorSpy = vi.spyOn(useOrgStore.getState(), 'setError');

      // Act
      await useOrgStore.getState().fetchUserOrganizations();

      // Assert
      expect(setStateSpy).toHaveBeenCalledWith(true);
      expect(listMock).toHaveBeenCalledTimes(1);
      expect(listMock).toHaveBeenCalledWith('test-user-id');
      
      // Check final state (implement filtering logic in the store action)
      const finalState = useOrgStore.getState();
      // EXPECTATION: The store action should filter out the deleted org
      expect(finalState.userOrganizations).toEqual(mockOrgs.filter(org => !org.deleted_at)); 
      expect(finalState.userOrganizations).toHaveLength(2);
      expect(finalState.error).toBeNull();
      expect(finalState.isLoading).toBe(false); // Handled by setLoading spy check
      expect(setErrorSpy).toHaveBeenCalledWith(null); // Explicitly set error to null
      expect(setStateSpy).toHaveBeenCalledWith(false);
    });

    it('should set error state and clear orgs list on API failure', async () => {
      // Arrange: Access the mocked method correctly
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      const errorMsg = 'Failed to fetch orgs';
      listMock.mockResolvedValue({ 
          status: 500, 
          error: { message: errorMsg, code: 'SERVER_ERROR' } 
      });
      const setStateSpy = vi.spyOn(useOrgStore.getState(), 'setLoading');
      const setErrorSpy = vi.spyOn(useOrgStore.getState(), 'setError');
      // Pre-fill state to ensure it gets cleared
      useOrgStore.setState({ userOrganizations: mockOrgs });

      // Act
      await useOrgStore.getState().fetchUserOrganizations();

      // Assert
      expect(setStateSpy).toHaveBeenCalledWith(true);
      expect(listMock).toHaveBeenCalledTimes(1);
      
      // Check final state
      const finalState = useOrgStore.getState();
      expect(finalState.userOrganizations).toEqual([]); // Should be cleared
      expect(finalState.error).toBe(errorMsg);
      expect(finalState.isLoading).toBe(false); // Handled by setLoading spy check
      expect(setErrorSpy).toHaveBeenCalledWith(errorMsg);
      expect(setStateSpy).toHaveBeenCalledWith(false);
    });

    it('should set error and clear orgs list if user is not authenticated', async () => {
       // Arrange: Mock authStore to return no user
      vi.mocked(useAuthStore.getState).mockReturnValueOnce({ user: null });
      const listMock = vi.mocked(api.organizations.listUserOrganizations);
      const setStateSpy = vi.spyOn(useOrgStore.getState(), 'setLoading');
      const setErrorSpy = vi.spyOn(useOrgStore.getState(), 'setError');
      useOrgStore.setState({ userOrganizations: mockOrgs }); // Pre-fill

       // Act
       await useOrgStore.getState().fetchUserOrganizations();

       // Assert
       expect(listMock).not.toHaveBeenCalled(); // Ensure API not called
       const finalState = useOrgStore.getState();
       expect(finalState.userOrganizations).toEqual([]);
       expect(finalState.error).toBe('User not authenticated');
       expect(finalState.isLoading).toBe(false);
       expect(setStateSpy).toHaveBeenCalledWith(true); // Still sets loading initially
       expect(setErrorSpy).toHaveBeenCalledWith('User not authenticated');
       expect(setStateSpy).toHaveBeenCalledWith(false);
    });
  });

  // TODO: Add tests for setCurrentOrganizationId
  // TODO: Add tests for fetchOrganizationDetails
  // TODO: Add tests for fetchCurrentOrganizationMembers
  // TODO: Add tests for softDeleteOrganization

}); 