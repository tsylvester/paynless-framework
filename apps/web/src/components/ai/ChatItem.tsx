import type { Chat } from '@paynless/types';
import { useAiStore, useOrganizationStore, useAuthStore } from '@paynless/store';
import { selectCurrentUserRoleInOrg } from '@paynless/store'; // Assuming re-export
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button'; // For the main item if needed, or just style a button
import { Trash2 } from 'lucide-react'; // Example icon

interface ChatItemProps {
  chat: Chat;
  onClick: (chat: Chat) => void;
  isActive: boolean;
}

export function ChatItem({ chat, onClick, isActive }: ChatItemProps) {
  const { deleteChat } = useAiStore.getState();
  const authState = useAuthStore.getState();
  const orgState = useOrganizationStore.getState();
  
  const currentUser = authState.user;
  const currentOrganizationId = orgState.currentOrganizationId;

  // Log the state received by the component
  console.log('[ChatItem Debug] authState from store:', JSON.stringify(authState));
  console.log('[ChatItem Debug] orgState from store (before selector call):', JSON.stringify(orgState));

  const chatTitle = chat.title || `Untitled Chat ${chat.id.substring(0, 6)}...`;

  let canDelete = false;
  console.log('[ChatItem Debug] Initializing canDelete logic for chat:', chat.id);
  console.log('[ChatItem Debug] Chat type:', chat.organization_id === null ? 'Personal' : 'Organization');
  console.log('[ChatItem Debug] Chat Org ID:', chat.organization_id);
  console.log('[ChatItem Debug] Chat User ID (creator):', chat.user_id);
  console.log('[ChatItem Debug] Current logged-in User:', currentUser ? currentUser.id : 'No user');
  console.log('[ChatItem Debug] Current active Organization ID in store:', currentOrganizationId);

  if (currentUser) {
    if (chat.organization_id === null) { // Personal chat
      canDelete = chat.user_id === currentUser.id;
      console.log(`[ChatItem Debug] Personal chat. Creator: ${chat.user_id}, CurrentUser: ${currentUser.id}. CanDelete: ${canDelete}`);
    } else { // Organization chat
      const isCreator = chat.user_id === currentUser.id;
      let isAdminInChatOrg = false;

      console.log(`[ChatItem Debug] Org chat. Creator: ${isCreator} (User: ${chat.user_id}, CurrentUser: ${currentUser.id})`);

      if (chat.organization_id === currentOrganizationId) {
        // Only check admin role if the chat's org is the currently active one
        console.log('[ChatItem Debug] Calling selectCurrentUserRoleInOrg with orgState containing (members count):', orgState.currentOrganizationMembers?.length);
        const currentUserRoleInActiveOrg = selectCurrentUserRoleInOrg(orgState);
        isAdminInChatOrg = currentUserRoleInActiveOrg === 'admin';
        console.log(`[ChatItem Debug] Chat's org (${chat.organization_id}) IS the active org. Current user role in active org: ${currentUserRoleInActiveOrg}. isAdminInChatOrg: ${isAdminInChatOrg}`);
      } else {
        console.log(`[ChatItem Debug] Chat's org (${chat.organization_id}) is NOT the active org (${currentOrganizationId}). Skipping admin check for this org.`);
      }
      
      canDelete = isCreator || isAdminInChatOrg;
      console.log(`[ChatItem Debug] Org chat final. isCreator: ${isCreator}, isAdminInChatOrg (only if active org): ${isAdminInChatOrg}. CanDelete: ${canDelete}`);
    }
  } else {
    console.log('[ChatItem Debug] No current user found. Cannot delete.');
  }
  console.log('[ChatItem Debug] Final canDelete value for chat', chat.id, ':', canDelete);

  const handleDeleteConfirm = () => {
    deleteChat(chat.id, chat.organization_id);
  };

  return (
    <div className="flex items-center justify-between w-full group border border-border rounded-md p-1 my-0.5">
      <button
        type="button"
        onClick={() => onClick(chat)}
        className={cn(
          'flex-grow text-left px-3 py-2 rounded-md text-sm transition-colors w-full truncate',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isActive ? 'bg-muted font-semibold text-accent-foreground' : 'text-muted-foreground'
        )}
        aria-current={isActive ? 'page' : undefined}
      >
        {chatTitle}
      </button>
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-7 w-7"
              aria-label="Delete chat"
              data-testid="delete-chat-button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this chat
                history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
} 