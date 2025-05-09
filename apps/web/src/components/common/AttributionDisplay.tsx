import React from 'react';
import { useAuthStore, useOrganizationStore } from '@paynless/store';
import { formatDistanceToNow, format, parseISO, type Locale } from 'date-fns';
import type { UserProfile, OrganizationMemberWithProfile } from '@paynless/types';

// Placeholder for availableModels - in a real scenario, this might come from a store or context
// For now, it's a simple map for the purpose of the assistant attribution placeholder logic
const availableModels: Record<string, { name: string }> = {
  'model-gpt-4': { name: 'GPT-4' },
  'model-claude-2': { name: 'Claude 2' },
};

export interface AttributionDisplayProps {
  userId: string | null;
  role: 'user' | 'assistant';
  timestamp: string;
  organizationId?: string | null;
  modelId?: string | null;
  // isSelf?: boolean; // Optional: to explicitly add "(You)"
}

const truncateId = (id: string, length: number = 8): string => {
  if (!id) return 'N/A';
  return `${id.substring(0, length)}...`;
};

export const AttributionDisplay: React.FC<AttributionDisplayProps> = ({
  userId,
  role,
  timestamp,
  organizationId,
  modelId,
  // isSelf = false, // Uncomment if isSelf prop is used
}) => {
  const { currentUser, profile: currentUserProfile } = useAuthStore(
    (state) => ({ currentUser: state.user, profile: state.profile }),
  );
  const { currentOrganizationId, currentOrganizationMembers } = useOrganizationStore(
    (state) => ({
      currentOrganizationId: state.currentOrganizationId,
      currentOrganizationMembers: state.currentOrganizationMembers,
    }),
  );

  let displayName = 'Unknown';
  let fullIdentifier = userId ? `User ID: ${userId}` : 'Assistant';

  if (role === 'assistant') {
    const model = modelId ? availableModels[modelId] : null;
    displayName = model ? model.name : 'Assistant';
    fullIdentifier = model ? `${model.name} (Model ID: ${modelId})` : 'Assistant';
  } else if (userId) {
    // Determine if the message user is the current authenticated user
    const isCurrentUserMessage = currentUser?.id === userId;

    let profileToUse: UserProfile | null | undefined = null;
    let emailFallback: string | undefined = undefined;

    if (isCurrentUserMessage) {
      profileToUse = currentUserProfile;
      emailFallback = currentUser?.email;
    } else if (organizationId && organizationId === currentOrganizationId) {
      // Message is from another user in the currently active organization
      const member = currentOrganizationMembers?.find(m => m.user_id === userId);
      profileToUse = member?.user_profiles;
      emailFallback = member?.user_profiles?.email;
    }

    if (profileToUse?.first_name && profileToUse?.last_name) {
      displayName = `${profileToUse.first_name} ${profileToUse.last_name}`;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else if (profileToUse?.first_name) {
      displayName = profileToUse.first_name;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else if (profileToUse?.email) {
      displayName = profileToUse.email;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else if (emailFallback) {
      displayName = emailFallback;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else {
      displayName = truncateId(userId);
      fullIdentifier = `User ID: ${userId}`;
    }
    // Optional: Add "(You)" indicator
    // if (isCurrentUserMessage && isSelf) { // Or just always for isCurrentUserMessage
    //   displayName += ' (You)';
    // }
  }

  let formattedTimestamp = 'Invalid date';
  let fullTimestampString = timestamp;
  try {
    const date = parseISO(timestamp);
    formattedTimestamp = formatDistanceToNow(date, { addSuffix: true });
    fullTimestampString = format(date, 'PPPppp'); // e.g., Jun 20, 2023, 4:30:21 PM GMT+1
  } catch (error) {
    console.error('Error parsing timestamp:', error);
    // formattedTimestamp and fullTimestampString remain as default error values
  }

  return (
    <div className="text-xs text-muted-foreground flex items-center space-x-2">
      <span title={fullIdentifier} className="font-semibold truncate">
        {displayName}
      </span>
      <span title={fullTimestampString} className="whitespace-nowrap">
        {formattedTimestamp}
      </span>
    </div>
  );
}; 