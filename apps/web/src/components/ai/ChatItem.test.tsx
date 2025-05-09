import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, MockedFunction } from 'vitest';
import { ChatItem } from './ChatItem';
import { selectCurrentUserRoleInOrg } from '@paynless/store'; 
import type { Chat, User, Organization } from '@paynless/types';

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
  
  // Import mock logics inside the factory
  const { mockedUseAuthStoreHookLogic } = await import('../../mocks/authStore.mock');
  const { mockedUseAiStoreHookLogic } = await import('../../mocks/aiStore.mock');
  const { mockedUseOrganizationStoreHookLogic } = await import('../../mocks/organizationStore.mock');

  return {
    ...actual, 
    useAiStore: mockedUseAiStoreHookLogic,
    useAuthStore: mockedUseAuthStoreHookLogic,
    useOrganizationStore: mockedUseOrganizationStoreHookLogic,
    selectCurrentUserRoleInOrg: vi.fn(), 
  };
});

// Import reset and setter functions at the top level for use in tests
import { resetAuthStoreMock, mockSetAuthUser } from '../../mocks/authStore.mock';
import { resetAiStoreMock, mockDeleteChatSpy } from '../../mocks/aiStore.mock';
import { 
  resetAllStoreMocks as resetOrgStoreMocks, 
  mockSetCurrentOrgId,
  mockSetUserOrganizations,
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


describe('ChatItem', () => {
  const mockOnClickProp = vi.fn();

  beforeEach(() => {
    isAlertDialogOpen = false;
    resetAuthStoreMock();
    resetAiStoreMock();
    resetOrgStoreMocks(); 

    mockSetAuthUser(currentUser);
    mockSetCurrentOrgId('some-other-org-id');
    if (mockSetUserOrganizations) mockSetUserOrganizations([org1, org2]);

    localMockSelectCurrentUserRoleInOrg.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Basic rendering tests
  it('renders chat title correctly', () => {
    render(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
    expect(screen.getByText(personalChatByCurrentUser.title!)).toBeInTheDocument();
  });

  it('renders "Untitled Chat" if title is null', () => {
    render(<ChatItem chat={{ ...personalChatByCurrentUser, title: null }} onClick={mockOnClickProp} isActive={false} />);
    expect(screen.getByText(/^Untitled Chat/)).toBeInTheDocument();
  });

  it('renders "Untitled Chat" if title is empty string', () => {
    render(<ChatItem chat={{ ...personalChatByCurrentUser, title: '' }} onClick={mockOnClickProp} isActive={false} />);
    expect(screen.getByText(/^Untitled Chat/)).toBeInTheDocument();
  });

  it('calls onClick prop with chatId when the item is clicked', () => {
    render(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') }));
    expect(mockOnClickProp).toHaveBeenCalledWith(personalChatByCurrentUser.id);
  });

  it('applies active styling if isActive prop is true', () => {
    const { rerender } = render(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
    expect(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') })).not.toHaveClass('bg-muted');

    rerender(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={true} />);
    expect(screen.getByRole('button', { name: new RegExp(personalChatByCurrentUser.title!, 'i') })).toHaveClass('bg-muted');
  });


  describe('Delete Button Visibility', () => {
    it('Delete button IS VISIBLE for personal chat if current user is the creator', async () => {
      render(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);      
      const alertDialogTriggerWrapper = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(alertDialogTriggerWrapper).toBeInTheDocument();
      const deleteButton = await within(alertDialogTriggerWrapper).findByRole('button', { name: 'Delete chat' });
      expect(deleteButton).toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for personal chat if current user is NOT the creator', () => {
      render(<ChatItem chat={personalChatByOtherUser} onClick={mockOnClickProp} isActive={false} />);
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });

    it('Delete button IS VISIBLE for org chat if current user is the creator (even if just a member in that org)', async () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('member'); 
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(await within(trigger).findByRole('button', { name: 'Delete chat' })).toBeInTheDocument();
    });

    it('Delete button IS VISIBLE for org chat if current user is admin in that org (even if not creator)', async () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin');
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByOtherUserAsAdmin} onClick={mockOnClickProp} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      expect(await within(trigger).findByRole('button', { name: 'Delete chat' })).toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for org chat if current user is NOT creator AND NOT admin in that org', () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('member');
      mockSetCurrentOrgId(org1.id);
      render(<ChatItem chat={org1ChatByOtherUserAsMember} onClick={mockOnClickProp} isActive={false} />);
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });

    it('Delete button IS HIDDEN for org chat if currentOrganizationId does not match chat.organization_id (even if admin in current org)', () => {
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin');
      mockSetCurrentOrgId(org2.id); 
      render(<ChatItem chat={org1ChatByOtherUserAsAdmin} onClick={mockOnClickProp} isActive={false} />); 
      expect(screen.queryByTestId('alert-dialog-trigger-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-chat-button')).not.toBeInTheDocument();
    });
  });

  describe('Delete Button Interaction (when visible)', () => {
    const deletableOrgChatByAdmin = org1ChatByOtherUserAsAdmin;

    beforeEach(() => {
      isAlertDialogOpen = false; // Ensure reset before each test in this describe block too
      mockSetCurrentOrgId(org1.id);
      localMockSelectCurrentUserRoleInOrg.mockReturnValue('admin'); 
    });

    it('clicking delete button shows AlertDialog with title', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      const deleteButton = await within(trigger).findByRole('button', { name: 'Delete chat' });
      
      console.log('[Test Debug] Before clicking delete button (triggering AlertDialog)');
      fireEvent.click(deleteButton);
      console.log('[Test Debug] After clicking delete button, isAlertDialogOpen should be true. Value:', isAlertDialogOpen);
      
      // Force re-render for the AlertDialogContent mock to pick up the change in isAlertDialogOpen
      rerender(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />);

      expect(await screen.findByTestId('alert-dialog-content-mock')).toBeInTheDocument();
      expect(within(await screen.findByTestId('alert-dialog-content-mock')).getByTestId('alert-dialog-title-mock')).toHaveTextContent(/Are you absolutely sure/i);
    });
    
    it('confirming delete in AlertDialog calls deleteChat with correct IDs (org chat where user is admin)', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' })); 
      
      // Force re-render to show dialog content
      rerender(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />);

      const confirmButton = await screen.findByTestId('alert-dialog-action-mock');
      fireEvent.click(confirmButton);
      expect(mockDeleteChatSpy).toHaveBeenCalledWith(deletableOrgChatByAdmin.id, deletableOrgChatByAdmin.organization_id);
    });
    
    it('confirming delete in AlertDialog calls deleteChat with correct IDs (personal chat)', async () => {
      // Setup specific to this test for personal chat
      mockSetAuthUser(currentUser);
      mockSetCurrentOrgId(null);    
      localMockSelectCurrentUserRoleInOrg.mockReturnValue(null); 

      const { rerender } = render(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' }));
      
      // Force re-render to show dialog content
      rerender(<ChatItem chat={personalChatByCurrentUser} onClick={mockOnClickProp} isActive={false} />);
      
      const confirmButton = await screen.findByTestId('alert-dialog-action-mock');
      fireEvent.click(confirmButton);
      expect(mockDeleteChatSpy).toHaveBeenCalledWith(personalChatByCurrentUser.id, personalChatByCurrentUser.organization_id);
    });

    it('cancelling delete in AlertDialog does not call deleteChat', async () => {
      const { rerender } = render(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />); 
      const trigger = await screen.findByTestId('alert-dialog-trigger-mock');
      fireEvent.click(await within(trigger).findByRole('button', { name: 'Delete chat' }));
      
      // Force re-render to show dialog content
      rerender(<ChatItem chat={deletableOrgChatByAdmin} onClick={mockOnClickProp} isActive={false} />);

      const cancelButton = await screen.findByTestId('alert-dialog-cancel-mock');
      fireEvent.click(cancelButton);
      expect(mockDeleteChatSpy).not.toHaveBeenCalled();
    });
  });
}); 