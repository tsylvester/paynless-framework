import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, MockedFunction } from 'vitest';
import { ChatItem } from './ChatItem';
import { selectCurrentUserRoleInOrg } from '@paynless/store'; 
import type { Chat, User, Organization, SystemPrompt } from '@paynless/types';

// Mock logic and helpers will be imported inside the vi.mock factory
// import { mockedUseAuthStoreHookLogic, resetAuthStoreMock, mockSetAuthUser } from '../../mocks/authStore.mock';
// import { mockedUseAiStoreHookLogic, resetAiStoreMock, mockDeleteChatSpy } from '../../mocks/aiStore.mock';
// import { 
//   mockedUseOrganizationStoreHookLogic, 
//   resetAllStoreMocks as resetOrgStoreMocks, 
//   mockSetCurrentOrgId,
//   mockSetUserOrganizations, 
// } from '../../mocks/organizationStore.mock';


vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@paynless/store');
  
  const { mockedUseAuthStoreHookLogic } = await import('../../mocks/authStore.mock');
  // Import the specific mock functions and state accessors we need
  const {
    mockedUseAiStoreHookLogic, // This is the hook selector logic
    internalMockAiGetState, // Direct state getter from aiStore.mock.ts (needs to be exported)
    mockLoadChatDetailsSpy, 
    mockAvailablePrompts, // The getter function for prompts
    mockDeleteChatSpy // Ensure deleteChat spy is available for getState
  } = await import('../../mocks/aiStore.mock'); 
  const { mockedUseOrganizationStoreHookLogic } = await import('../../mocks/organizationStore.mock');

  // This function will be our mock for useAiStore
  const mockUseAiStore = (selector?: (state: any) => any) => {
    const fullMockState = internalMockAiGetState(); // Get the complete current mock state
    if (selector) {
      return selector(fullMockState);
    }
    // If no selector, return an object that mimics the store enough for ChatItem
    // It needs `availablePrompts` directly and a `getState` method
    return {
      ...fullMockState, // Spread all state properties
      availablePrompts: mockAvailablePrompts(), // Ensure this is available directly
      getState: () => ({
        ...fullMockState, // Spread state again for getState context
        loadChatDetails: mockLoadChatDetailsSpy,
        deleteChat: mockDeleteChatSpy, // Use the direct spy
        // Add any other actions from AiActions that ChatItem might call via getState()
      }),
    };
  };
  
  // Also attach getState to the mockUseAiStore function itself, like Zustand does
  (mockUseAiStore as any).getState = () => {
    const fullMockState = internalMockAiGetState();
    return {
        ...fullMockState,
        loadChatDetails: mockLoadChatDetailsSpy,
        deleteChat: mockDeleteChatSpy,
    };
  };

  return {
    ...actual, 
    useAiStore: mockUseAiStore,
    useAuthStore: mockedUseAuthStoreHookLogic,
    useOrganizationStore: mockedUseOrganizationStoreHookLogic,
    selectCurrentUserRoleInOrg: vi.fn(), 
  };
});

// Import reset and setter functions at the top level for use in tests
import { resetAuthStoreMock, mockSetAuthUser, mockSetAuthProfile } from '../../mocks/authStore.mock';
import { resetAiStoreMock, mockDeleteChatSpy, mockLoadChatDetailsSpy, mockSetAvailablePrompts, mockAvailablePrompts } from '../../mocks/aiStore.mock';
import { 
  resetAllStoreMocks as resetOrgStoreMocks, 
  mockSetCurrentOrgId,
  mockSetUserOrganizations,
  mockSetCurrentOrganizationMembers,
} from '../../mocks/organizationStore.mock';

// Mock AlertDialog (remains the same)
let isAlertDialogOpen = false; 
vi.mock('@/components/ui/alert-dialog', async () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (<>{children}</>),
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-trigger-mock" onClick={() => { 
      console.log('[Test Debug] AlertDialogTrigger clicked, setting isAlertDialogOpen to true');
      isAlertDialogOpen = true; 
    }}>
      {children}
    </div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => {
    // console.log('[Test Debug] AlertDialogContent rendering, isAlertDialogOpen:', isAlertDialogOpen);
    return isAlertDialogOpen ? <div data-testid="alert-dialog-content-mock">{children}</div> : null;
  },
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-dialog-header-mock">{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-dialog-title-mock">{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-dialog-description-mock">{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="alert-dialog-footer-mock">{children}</div>,
  AlertDialogCancel: ({ children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="alert-dialog-cancel-mock" {...props} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { 
      console.log('[Test Debug] AlertDialogCancel clicked, setting isAlertDialogOpen to false');
      isAlertDialogOpen = false; 
      if(props.onClick) props.onClick(e); 
    }}>{children}</button>
  ),
  AlertDialogAction: ({ children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button data-testid="alert-dialog-action-mock" {...props} onClick={(e: React.MouseEvent<HTMLButtonElement>) => { 
      console.log('[Test Debug] AlertDialogAction clicked, setting isAlertDialogOpen to false');
      isAlertDialogOpen = false; 
      if(props.onClick) props.onClick(e); 
    }}>{children}</button>
  ),
}));

const localMockSelectCurrentUserRoleInOrg = selectCurrentUserRoleInOrg as MockedFunction<typeof selectCurrentUserRoleInOrg>;

const currentUser: User = { id: 'user-current-123', email: 'current@example.com' };
const otherUser: User = { id: 'user-other-456', email: 'other@example.com' };
const org1: Organization = { id: 'org-1', name: 'Organization 1', created_at: '', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };
const org2: Organization = { id: 'org-2', name: 'Organization 2', created_at: '', allow_member_chat_creation: true, visibility: 'private', deleted_at: null };

// --- NEW MOCK DATA FOR UI ENHANCEMENTS ---
const samplePromptId1 = 'd6e2a447-328b-437f-a658-8f05260cc110';
const samplePromptId2 = 'fba02898-2701-4503-b598-30a6659242bb';

const mockAvailablePromptsData: SystemPrompt[] = [
  { id: samplePromptId1, name: 'Super Story Writer', prompt_text: 'You are a super story writer.', created_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z', is_active: true },
  { id: samplePromptId2, name: 'Code Helper Pro', prompt_text: 'You are a pro code helper.', created_at: '2023-01-02T00:00:00Z', updated_at: '2023-01-02T00:00:00Z', is_active: true },
];

const chatWithTimestampsAndPrompt: Chat = {
  id: 'chat-ui-enhance-1',
  title: 'UI Test Chat',
  organization_id: null,
  user_id: currentUser.id,
  created_at: new Date(2023, 0, 15, 10, 30, 0).toISOString(), // Jan 15, 2023 10:30:00
  updated_at: new Date(2023, 0, 16, 11, 45, 0).toISOString(), // Jan 16, 2023 11:45:00
  system_prompt_id: samplePromptId1,
};

const orgChatByOtherUserWithPrompt: Chat = {
  id: 'chat-org-other-prompt',
  title: 'Org Chat by Other with Prompt',
  organization_id: org1.id,
  user_id: otherUser.id, // Created by otherUser
  created_at: new Date(2023, 1, 10, 12, 0, 0).toISOString(), // Feb 10, 2023 12:00:00
  updated_at: new Date(2023, 1, 10, 12, 15, 0).toISOString(), // Feb 10, 2023 12:15:00
  system_prompt_id: samplePromptId2,
};
// --- END NEW MOCK DATA ---


const personalChatByCurrentUser: Chat = {
  id: 'chat-personal-current',
  title: 'My Personal Thoughts',
  organization_id: null,
  user_id: currentUser.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  system_prompt_id: null,
};

const personalChatByOtherUser: Chat = {
  id: 'chat-personal-other',
  title: 'Someone Else Personal Chat',
  organization_id: null,
  user_id: otherUser.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  system_prompt_id: null,
};

const org1ChatByCurrentUser: Chat = {
  id: 'chat-org1-current',
  title: 'Org1 Chat by Current User',
  organization_id: org1.id,
  user_id: currentUser.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  system_prompt_id: null,
};

const org1ChatByOtherUserAsAdmin: Chat = {
  id: 'chat-org1-other-admin',
  title: 'Org1 Chat by Other (Admin Deletable)',
  organization_id: org1.id,
  user_id: otherUser.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  system_prompt_id: null,
};

const org1ChatByOtherUserAsMember: Chat = {
    id: 'chat-org1-other-member',
    title: 'Org1 Chat by Other (Member, Not Deletable by current)',
    organization_id: org1.id,
    user_id: otherUser.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    system_prompt_id: null,
};

const currentUserProfileBase = { 
  id: currentUser.id,
  role: 'user' as 'user' | 'admin', // Explicitly cast role
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  last_selected_org_id: null,
  // ensure all fields from UserProfile are here, even if null
  first_name: null,
  last_name: null,
  email: null, 
};

const otherUserProfileBase = { 
  id: otherUser.id,
  role: 'user' as 'user' | 'admin', // Explicitly cast role
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  last_selected_org_id: org1.id,
  // ensure all fields from UserProfile are here, even if null
  first_name: null,
  last_name: null,
  email: null,
};


const personalChatByCurrentUserWithFullProfile: Chat = {
  ...personalChatByCurrentUser, // id, org_id (null), created_at, updated_at, system_prompt_id (null)
  user_id: currentUser.id,
  title: 'Chat by Current User Full Profile',
};

const personalChatByCurrentUserWithFirstNameOnly: Chat = {
  ...personalChatByCurrentUser,
  user_id: currentUser.id,
  title: 'Chat by Current User First Name Only',
};

const personalChatByCurrentUserWithEmailOnly: Chat = {
  ...personalChatByCurrentUser,
  user_id: currentUser.id,
  title: 'Chat by Current User Email Only',
};

const personalChatByCurrentUserWithNoDetailsInProfile: Chat = {
  ...personalChatByCurrentUser,
  user_id: currentUser.id,
  title: 'Chat by Current User No Profile Details',
};

// Mock date-fns for consistent timestamp output
vi.mock('date-fns', async (importOriginal) => {
  const actualDateFns = await importOriginal<typeof import('date-fns')>();
  return {
    ...actualDateFns, // Keep other exports like parseISO
    formatDistanceToNow: vi.fn(),
  };
});

// Import the mocked function to control its return value
import { formatDistanceToNow as mockFormatDistanceToNow } from 'date-fns';

describe('ChatItem', () => {
  beforeEach(() => {
    isAlertDialogOpen = false;
    resetAuthStoreMock();
    resetAiStoreMock();
    resetOrgStoreMocks(); 

    mockSetAuthUser(currentUser);
    mockSetCurrentOrgId('some-other-org-id');
    if (mockSetUserOrganizations) mockSetUserOrganizations([org1, org2]);
    
    mockSetAvailablePrompts(mockAvailablePromptsData);
    
    mockLoadChatDetailsSpy.mockClear();

    localMockSelectCurrentUserRoleInOrg.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Basic rendering tests
  it('renders chat title correctly', () => {
    render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);
    expect(screen.getByText(personalChatByCurrentUser.title!)).toBeInTheDocument();
  });

  it('renders "Untitled Chat" if title is null', () => {
    render(<ChatItem chat={{ ...personalChatByCurrentUser, title: null }} isActive={false} />);
    expect(screen.getByText(/^Untitled Chat/)).toBeInTheDocument();
  });

  it('renders "Untitled Chat" if title is empty string', () => {
    render(<ChatItem chat={{ ...personalChatByCurrentUser, title: '' }} isActive={false} />);
    expect(screen.getByText(/^Untitled Chat/)).toBeInTheDocument();
  });

  it('applies active styling if isActive prop is true', () => {
    const { rerender } = render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);
    expect(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') })).not.toHaveClass('bg-muted');

    rerender(<ChatItem chat={personalChatByCurrentUser} isActive={true} />);
    expect(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') })).toHaveClass('bg-primary/10');
  });


  describe('Direct Store Interaction', () => {
    it('calls useAiStore.getState().loadChatDetails with chat.id when the item is clicked', () => {
      render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') }));
      expect(mockLoadChatDetailsSpy).toHaveBeenCalledWith(personalChatByCurrentUser.id);
      expect(mockLoadChatDetailsSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI Enhancements Display', () => {
    beforeEach(() => {
      // Ensure availablePrompts are set for these tests
      mockSetAvailablePrompts(mockAvailablePromptsData);
      // Reset the date-fns mock before each test in this block
      (mockFormatDistanceToNow as MockedFunction<any>).mockClear();
    });

    it('displays the formatted updated_at timestamp using date-fns', () => {
      const expectedTimestamp = 'approx X days ago';
      (mockFormatDistanceToNow as MockedFunction<any>).mockReturnValue(expectedTimestamp);

      render(<ChatItem chat={chatWithTimestampsAndPrompt} isActive={false} />);
      // Check if the mocked timestamp is present. 
      // Note: The actual DOM structure might include a title attribute with the full date.
      expect(screen.getByText(expectedTimestamp)).toBeInTheDocument();
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(new Date(chatWithTimestampsAndPrompt.updated_at), { addSuffix: true });
    });

    it('renders system prompt name if chat.system_prompt_id exists and matches an available prompt', () => {
      const chatWithPrompt = { ...personalChatByCurrentUser, system_prompt_id: mockAvailablePromptsData[0].id };
      const expectedPromptName = mockAvailablePromptsData[0].name;
      mockSetAvailablePrompts(mockAvailablePromptsData);

      render(<ChatItem chat={chatWithPrompt} isActive={false} />);
      
      expect(screen.getByText(expectedPromptName)).toBeInTheDocument();
      
      // Verify the Info icon is also present
      const promptSpan = screen.getByText(expectedPromptName).closest('span');
      expect(promptSpan).not.toBeNull();
      // Use querySelector to find the SVG element within the span
      expect(promptSpan!.querySelector('svg')).toBeInTheDocument();
    });

    it('does NOT render system prompt name if chat.system_prompt_id exists but no match in availablePrompts', () => {
      const chatWithUnmatchedPrompt: Chat = { ...chatWithTimestampsAndPrompt, system_prompt_id: 'unmatched-prompt-id' };
      render(<ChatItem chat={chatWithUnmatchedPrompt} isActive={false} />);
      // Check that NO text element contains a part of any known prompt name as a weak check
      // A more robust check would be to ensure no element with a specific test-id for prompt name exists
      mockAvailablePromptsData.forEach(prompt => {
        expect(screen.queryByText(new RegExp(prompt.name, 'i'))).not.toBeInTheDocument();
      });
      // Also check that the Info icon is not present if no prompt name is rendered
      // This assumes the Info icon is only rendered alongside the prompt name.
      // If the structure allows Info icon without text, this assertion needs refinement.
      const buttons = screen.getAllByRole('button'); // Get all buttons to find the main one
      const mainButtonContent = within(buttons[0]); // Assuming first button is the main chat item
      expect(mainButtonContent.queryByRole('img', {hidden: true})).not.toBeInTheDocument(); // Check within the button context
    });

    it('does NOT render system prompt name if chat.system_prompt_id is null', () => {
      render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />); // system_prompt_id is null
      mockAvailablePromptsData.forEach(prompt => {
        expect(screen.queryByText(new RegExp(prompt.name, 'i'))).not.toBeInTheDocument();
      });
      const buttons = screen.getAllByRole('button');
      const mainButtonContent = within(buttons[0]);
      expect(mainButtonContent.queryByRole('img', {hidden: true})).not.toBeInTheDocument();
    });
  });

  describe('Creator Information Display', () => {
    // Scenario 1: Chat creator IS the currentUser
    describe('When chat creator is the current user', () => {
      beforeEach(() => {
        // Reset auth store to a baseline for each of these sub-tests
        resetAuthStoreMock();
        // Default user, can be overridden by tests if specific user properties needed for a test
        mockSetAuthUser(currentUser); 
      });

      it('displays full name if currentUser.profile has first_name and last_name', () => {
        const profileWithFullName = { 
          ...currentUserProfileBase, 
          first_name: 'Snorblus', 
          last_name: 'Finklestein',
          role: 'user' as 'user' | 'admin', // ensure role is correctly typed here too
        };
        mockSetAuthProfile(profileWithFullName); 

        render(<ChatItem chat={personalChatByCurrentUserWithFullProfile} isActive={false} />);
        const creatorSpan = screen.getByText(/by: Snorblus Finklestein/);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `Snorblus Finklestein (ID: ${currentUser.id})`);
      });

      it('displays first name if currentUser.profile has only first_name', () => {
        const profileWithFirstName = { 
          ...currentUserProfileBase, 
          first_name: 'Snorblus', 
          last_name: null, 
          role: 'user' as 'user' | 'admin', // ensure role is correctly typed here too
        };
        mockSetAuthProfile(profileWithFirstName);

        render(<ChatItem chat={personalChatByCurrentUserWithFirstNameOnly} isActive={false} />);
        const creatorSpan = screen.getByText(/by: Snorblus/);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `Snorblus (ID: ${currentUser.id})`);
      });

      it('displays email if currentUser.profile has only email (no names)', () => {
        const profileWithEmailOnly = { 
          ...currentUserProfileBase, 
          first_name: null, 
          last_name: null,
          email: 'snorblus.f@example.com', 
          role: 'user' as 'user' | 'admin', // ensure role is correctly typed here too
        };
        const tempCurrentUserWithEmail = { ...currentUser, email: 'snorblus.f@example.com' };
        mockSetAuthUser(tempCurrentUserWithEmail); // Set user with specific email
        mockSetAuthProfile(profileWithEmailOnly); // Set profile with matching email

        render(<ChatItem chat={personalChatByCurrentUserWithEmailOnly} isActive={false} />);
        const creatorSpan = screen.getByText(/by: snorblus.f@example.com/);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `snorblus.f@example.com (ID: ${currentUser.id})`);
      });
      
      it('displays truncated user_id if currentUser.profile has no names or email', () => {
        const profileWithNoDetails = { 
          ...currentUserProfileBase, 
          first_name: null, 
          last_name: null,
          email: null,
          role: 'user' as 'user' | 'admin', // ensure role is correctly typed here too
        };
        const currentUserNoEmail = { ...currentUser, email: undefined }; 
        mockSetAuthUser(currentUserNoEmail);
        mockSetAuthProfile(profileWithNoDetails);

        render(<ChatItem chat={personalChatByCurrentUserWithNoDetailsInProfile} isActive={false} />);
        const expectedIdDisplay = `${currentUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${currentUser.id}`);
      });

      it('displays truncated user_id if currentUser.profile is null (and user.email is also null/undefined)', () => {
        // Ensure the base user object in authState.user has no email for true UUID fallback
        const currentUserNoEmail = { ...currentUser, email: undefined };
        mockSetAuthUser(currentUserNoEmail);
        mockSetAuthProfile(null); // Profile is explicitly null

        render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />); // Using a generic chat by current user
        const expectedIdDisplay = `${currentUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${currentUser.id}`);
      });

      it('displays user.email if currentUser.profile is null but user.email exists', () => {
        const currentUserWithEmail = { ...currentUser, email: 'fallback@example.com' };
        mockSetAuthUser(currentUserWithEmail); // User has an email
        mockSetAuthProfile(null); // Profile is null

        render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />); 
        const creatorSpan = screen.getByText(`by: fallback@example.com`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `fallback@example.com (ID: ${currentUser.id})`);
      });
    });

    // Scenario 2: Chat creator IS an organization member (NOT currentUser)
    describe('When chat creator is an organization member (not current user)', () => {
      const orgChatByOther: Chat = {
        id: 'org-chat-by-other-1',
        title: 'Org Chat by Other User',
        organization_id: org1.id, // Belongs to org1
        user_id: otherUser.id,   // Created by otherUser
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        system_prompt_id: null,
      };

      beforeEach(() => {
        resetAuthStoreMock();
        mockSetAuthUser(currentUser); // Current user is NOT otherUser
        resetOrgStoreMocks();
        mockSetCurrentOrgId(org1.id); // Active org is org1
      });

      it('displays full name if member profile has first_name and last_name', () => {
        const memberProfileWithFullName = {
          ...otherUserProfileBase, // Includes id: otherUser.id, role
          first_name: 'Omega',
          last_name: 'Maximus',
          email: 'omega@example.com' 
        };
        mockSetCurrentOrganizationMembers([{ 
            // OrganizationMember part (ensure all required fields from OrganizationMember are present)
            id: 'mem-other-1', // Member record ID
            user_id: otherUser.id,
            organization_id: org1.id,
            role: 'member',
            status: 'active',
            created_at: new Date().toISOString(),
            // UserProfile part
            user_profiles: memberProfileWithFullName 
        }]);
        
        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const creatorSpan = screen.getByText(/by: Omega Maximus/);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `Omega Maximus (ID: ${otherUser.id})`);
      });

      it('displays email if member profile has only email (no names)', () => {
        const memberProfileWithEmail = {
          ...otherUserProfileBase,
          first_name: null,
          last_name: null,
          email: 'omega@example.com'
        };
        mockSetCurrentOrganizationMembers([{ 
            id: 'mem-other-1', user_id: otherUser.id, organization_id: org1.id, role: 'member', status: 'active', created_at: new Date().toISOString(),
            user_profiles: memberProfileWithEmail 
        }]);

        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const creatorSpan = screen.getByText(/by: omega@example.com/);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `omega@example.com (ID: ${otherUser.id})`);
      });

      it('displays truncated user_id if member profile has no names or email', () => {
        const memberProfileNoDetails = {
          ...otherUserProfileBase,
          first_name: null,
          last_name: null,
          email: null
        };
        mockSetCurrentOrganizationMembers([{ 
            id: 'mem-other-1', user_id: otherUser.id, organization_id: org1.id, role: 'member', status: 'active', created_at: new Date().toISOString(),
            user_profiles: memberProfileNoDetails 
        }]);

        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const expectedIdDisplay = `${otherUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${otherUser.id}`);
      });

      it('displays truncated user_id if member user_profiles is null', () => {
        mockSetCurrentOrganizationMembers([{ 
            id: 'mem-other-1', user_id: otherUser.id, organization_id: org1.id, role: 'member', status: 'active', created_at: new Date().toISOString(),
            user_profiles: null 
        }]);
        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const expectedIdDisplay = `${otherUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${otherUser.id}`);
      });

      it('displays truncated user_id if creator is not in currentOrganizationMembers', () => {
        mockSetCurrentOrganizationMembers([]); // Empty members list
        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const expectedIdDisplay = `${otherUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${otherUser.id}`);
      });

      it('displays truncated user_id if chat organization_id does not match current active org', () => {
        mockSetCurrentOrgId(org2.id); // Active org is org2, chat is in org1
        const memberProfileWithFullName = { ...otherUserProfileBase, first_name: 'Omega', last_name: 'Maximus' };
        mockSetCurrentOrganizationMembers([{ 
            id: 'mem-other-1', user_id: otherUser.id, organization_id: org1.id, role: 'member', status: 'active', created_at: new Date().toISOString(),
            user_profiles: memberProfileWithFullName 
        }]); // Member is in org1's list for completeness, but shouldn't be found

        render(<ChatItem chat={orgChatByOther} isActive={false} />);
        const expectedIdDisplay = `${otherUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${otherUser.id}`);
      });
    });

    // Scenario 3: Chat has user_id but no specific match found (e.g. personal chat by other user)
    describe('When no specific user details match (fallback cases)', () => {
      it('displays truncated user_id for a personal chat by another user', () => {
        resetAuthStoreMock();
        mockSetAuthUser(currentUser); // Logged in as someone else
        
        render(<ChatItem chat={personalChatByOtherUser} isActive={false} />); 
        const expectedIdDisplay = `${otherUser.id.substring(0, 8)}...`;
        const creatorSpan = screen.getByText(`by: ${expectedIdDisplay}`);
        expect(creatorSpan).toBeInTheDocument();
        expect(creatorSpan).toHaveAttribute('title', `User ID: ${otherUser.id}`);
      });
    });
  });

  describe('Delete Button Visibility', () => {
    it('Delete button IS VISIBLE for personal chat if current user is the creator', async () => {
      render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);      
      const alertDialogTriggerWrapper = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(alertDialogTriggerWrapper).toBeInTheDocument();
      const deleteButton = await within(alertDialogTriggerWrapper).findByRole('button', { name: 'Delete chat' });
      expect(deleteButton).toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for personal chat if current user is NOT the creator', () => {
      render(<ChatItem chat={personalChatByOtherUser} isActive={false} />);
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });

    it('Delete button IS VISIBLE for org chat if current user is the creator (even if just a member in that org)', async () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('member'); 
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByCurrentUser} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(await within(trigger).findByRole('button', { name: 'Delete chat' })).toBeInTheDocument();
    });

    it('Delete button IS VISIBLE for org chat if current user is admin in that org (even if not creator)', async () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin');
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByOtherUserAsAdmin} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(await within(trigger).findByRole('button', { name: 'Delete chat' })).toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for org chat if current user is NOT creator AND NOT admin in that org', () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('member');
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByOtherUserAsMember} isActive={false} />);
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for org chat if currentOrganizationId does not match chat.organization_id (even if admin in current org)', () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin');
      mockSetCurrentOrgId(org2.id); 
      render(<ChatItem chat={org1ChatByOtherUserAsAdmin} isActive={false} />); 
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });
  });

  describe('Delete Button Interaction (when visible)', () => {
    const deletableOrgChatByAdmin = org1ChatByOtherUserAsAdmin;

    beforeEach(() => {
      isAlertDialogOpen = false; 
      mockSetCurrentOrgId(org1.id);
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin'); 
    });

    it('clicking delete button shows AlertDialog with title', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      const deleteButton = await within(trigger).findByRole('button', { name: 'Delete chat' });
      
      console.log('[Test Debug] Before clicking delete button (triggering AlertDialog)');
      fireEvent.click(deleteButton);
      console.log('[Test Debug] After clicking delete button, isAlertDialogOpen should be true. Value:', isAlertDialogOpen);
      
      rerender(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />);

      expect(await screen.findByTestId('alert-dialog-content-mock')).toBeInTheDocument();
      expect(within(await screen.findByTestId('alert-dialog-content-mock')).getByTestId('alert-dialog-title-mock')).toHaveTextContent(/Are you absolutely sure/i);
    });
    
    it('confirming delete in AlertDialog calls deleteChat with correct IDs (org chat where user is admin)', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' })); 
      
      rerender(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />);

      const confirmButton = await screen.findByTestId('alert-dialog-action-mock');
      fireEvent.click(confirmButton);
      expect(mockDeleteChatSpy).toHaveBeenCalledWith(deletableOrgChatByAdmin.id, deletableOrgChatByAdmin.organization_id);
    });
    
    it('confirming delete in AlertDialog calls deleteChat with correct IDs (personal chat)', async () => {
      mockSetAuthUser(currentUser);
      mockSetCurrentOrgId(null);    
      localMockSelectCurrentUserRoleInOrg.mockReturnValue(null); 

      const { rerender } = render(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' }));
      
      rerender(<ChatItem chat={personalChatByCurrentUser} isActive={false} />);
      
      const confirmButton = await screen.findByTestId('alert-dialog-action-mock');
      fireEvent.click(confirmButton);
      expect(mockDeleteChatSpy).toHaveBeenCalledWith(personalChatByCurrentUser.id, personalChatByCurrentUser.organization_id);
    });

    it('cancelling delete in AlertDialog does not call deleteChat', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />); 
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' }));
      
      rerender(<ChatItem chat={deletableOrgChatByAdmin} isActive={false} />);

      const cancelButton = await screen.findByTestId('alert-dialog-cancel-mock');
      fireEvent.click(cancelButton);
      expect(mockDeleteChatSpy).not.toHaveBeenCalled();
    });
  });
}); 