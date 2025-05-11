import type { Chat } from '@paynless/types';
import { useAiStore, useOrganizationStore, useAuthStore } from '@paynless/store';
import { selectCurrentUserRoleInOrg } from '@paynless/store'; // Assuming re-export
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns'; // Import date-fns functions
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
  const currentOrganizationMembers = orgState.currentOrganizationMembers;

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

  let formattedTimestamp = '';
  try {
    if (chat.updated_at) {
      formattedTimestamp = formatDistanceToNow(parseISO(chat.updated_at), { addSuffix: true });
    }
  } catch (error) {
    // formattedTimestamp remains empty or you can set a default error string
  }

  const systemPromptName = chat.system_prompt_id && availablePrompts 
    ? availablePrompts.find(p => p.id === chat.system_prompt_id)?.name 
    : null;

  // Determine creator display name and title
  let creatorDisplayString = 'Unknown';
  let creatorTitle = 'Unknown User';

  if (chat.user_id) {
    // Default to truncated UUID
    creatorDisplayString = `${chat.user_id.substring(0, 8)}...`;
    creatorTitle = `User ID: ${chat.user_id}`;

    // Define a shape for the user details we expect.
    // This aligns with typical User structures from authState.user
    type UserDetails = {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
    };

    let foundUserDetails: UserDetails | undefined;

    // Case 1: Creator is the current user
    if (currentUser && currentUser.id === chat.user_id) {
      // If the creator is the current user, use their profile from authState
      if (authState.profile && authState.profile.id === currentUser.id) {
        foundUserDetails = authState.profile; 
      } else {
        // Fallback to currentUser (Supabase user object) if profile somehow doesn't match or is missing,
        // though ideally authState.profile should always be the source for current user's display details.
        foundUserDetails = currentUser; 
      }
    } 
    // Case 2: Organization chat, and creator is a member of the current active organization
    else if (chat.organization_id && chat.organization_id === currentOrganizationId && currentOrganizationMembers && Array.isArray(currentOrganizationMembers)) {
      // currentOrganizationMembers is Array<OrganizationMemberWithProfile>
      // OrganizationMemberWithProfile = OrganizationMember & { user_profiles: UserProfile | null }
      // OrganizationMember has user_id
      // UserProfile has id, first_name, last_name, email
      const member = currentOrganizationMembers.find(
        (m) => m.user_id === chat.user_id
      );
      if (member && member.user_profiles) { // Check if user_profiles exists
        // Ensure the id from user_profiles matches, though user_id on member is the primary link
        if (member.user_profiles.id === chat.user_id) {
            foundUserDetails = member.user_profiles; // UserProfile is compatible with UserDetails
        }
      }
    }

    if (foundUserDetails) {
      const { first_name, last_name, email } = foundUserDetails;
      let newDisplayString: string | null = null;

      if (first_name && last_name) {
        newDisplayString = `${first_name} ${last_name}`;
      } else if (first_name) {
        // Use first_name if last_name is not available
        newDisplayString = first_name;
      } else if (email) {
        newDisplayString = email;
      }

      if (newDisplayString) {
        creatorDisplayString = newDisplayString;
        // Update title to be more specific if name/email found
        creatorTitle = `${creatorDisplayString} (ID: ${chat.user_id})`;
      }
      // If newDisplayString remains null, creatorDisplayString keeps the truncated UUID
      // and creatorTitle also reflects the User ID.
    }
  }

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
            {formattedTimestamp && (
              <span title={`Updated: ${new Date(chat.updated_at).toLocaleString()}`}>{formattedTimestamp}</span>
            )}
            {chat.user_id && (
              <span className="truncate" title={creatorTitle}>
                by: {creatorDisplayString}
              </span>
            )}
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