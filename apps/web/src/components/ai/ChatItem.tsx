import type { Chat } from '@paynless/types';
import { useAiStore, useOrganizationStore, useAuthStore } from '@paynless/store';
import { selectCurrentUserRoleInOrg } from '@paynless/store'; // Assuming re-export
import { cn } from '@/lib/utils';
import { AttributionDisplay } from '@/components/common/AttributionDisplay';
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
import { Trash2, Info } from 'lucide-react'; // Example icon and Info icon for prompts

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
}

export function ChatItem({ chat, isActive }: ChatItemProps) {
  const { deleteChat, loadChatDetails } = useAiStore.getState();
  const availablePrompts = useAiStore(state => state.availablePrompts);

  const authState = useAuthStore.getState();
  const orgState = useOrganizationStore.getState();
  
  const currentUser = authState.user;
  const currentOrganizationId = orgState.currentOrganizationId;

  const chatTitle = chat.title || `Untitled Chat ${chat.id.substring(0, 6)}...`;

  let canDelete = false;
  if (currentUser) {
    if (chat.organization_id === null) { // Personal chat
      canDelete = chat.user_id === currentUser.id;
    } else { // Organization chat
      const isCreator = chat.user_id === currentUser.id;
      let isAdminInChatOrg = false;

      if (chat.organization_id === currentOrganizationId) {
        const currentUserRoleInActiveOrg = selectCurrentUserRoleInOrg(orgState);
        isAdminInChatOrg = currentUserRoleInActiveOrg === 'admin';
      }
      
      canDelete = isCreator || isAdminInChatOrg;
    }
  }

  const handleDeleteConfirm = () => {
    deleteChat(chat.id, chat.organization_id);
  };

  const systemPromptName = chat.system_prompt_id && availablePrompts 
    ? availablePrompts.find(p => p.id === chat.system_prompt_id)?.name 
    : null;

  return (
    <div className="flex items-center justify-between w-full group border border-border rounded-md p-1 my-0.5">
      <button
        type="button"
        onClick={() => loadChatDetails(chat.id)}
        className={cn(
          'flex-grow text-left px-3 py-2 rounded-md text-sm transition-colors w-full truncate',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isActive 
            ? 'bg-primary/10 font-semibold text-accent-foreground ring-2 ring-primary' 
            : 'text-muted-foreground'
        )}
        aria-current={isActive ? 'page' : undefined}
      >
        <div className="flex flex-col">
          <span className="truncate font-medium">{chatTitle}</span>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground/80 mt-1">
            <AttributionDisplay
              userId={chat.user_id}
              role="user"
              timestamp={chat.updated_at}
              organizationId={chat.organization_id}
            />
            {systemPromptName && (
              <span className="flex items-center truncate" title={`Prompt: ${systemPromptName}`}>
                <Info size={12} className="mr-1 shrink-0" /> 
                {systemPromptName}
              </span>
            )}
          </div>
        </div>
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