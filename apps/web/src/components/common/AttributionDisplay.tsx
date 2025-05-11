import React from 'react';
import { useAuthStore, useOrganizationStore, useAiStore } from '@paynless/store';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import type { UserProfile, User } from '@paynless/types';

export interface AttributionDisplayProps {
  userId: string | null;
  role: 'user' | 'assistant';
  timestamp: string;
  organizationId?: string | null;
  modelId?: string | null;
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
}) => {
  const { currentUser, profile: currentUserProfile } = useAuthStore(
    (state) => ({ currentUser: state.user as User | null, profile: state.profile as UserProfile | null }),
  );
  const { currentOrganizationId, currentOrganizationMembers } = useOrganizationStore(
    (state) => ({
      currentOrganizationId: state.currentOrganizationId,
      currentOrganizationMembers: state.currentOrganizationMembers,
    }),
  );
  const { availableProviders } = useAiStore(
    (state) => ({
      availableProviders: state.availableProviders,
    }),
  );

  let displayName = 'Unknown';
  let fullIdentifier = userId ? `User ID: ${userId}` : 'Assistant';

  if (role === 'assistant') {
    // Get the actual model information from the store
    const provider = modelId ? availableProviders?.find(p => p.id === modelId) : null;
    displayName = provider ? provider.name : 'Assistant';
    fullIdentifier = provider ? provider.name : 'Assistant';
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
      // No email on user_profiles, so fallback to undefined
    }

    if (profileToUse?.first_name && profileToUse?.last_name) {
      displayName = `${profileToUse.first_name} ${profileToUse.last_name}`;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else if (profileToUse?.first_name) {
      displayName = profileToUse.first_name;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else if (emailFallback) {
      // Use email as fallback when no profile name is available
      displayName = emailFallback;
      fullIdentifier = `${displayName} (ID: ${userId})`;
    } else {
      displayName = truncateId(userId);
      fullIdentifier = `User ID: ${userId}`;
    }
    // Add (You) if this is the current user
    if (isCurrentUserMessage) {
      displayName += ' (You)';
    }
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
      <span title={fullIdentifier} className="font-semibold truncate" data-testid="attribution-name">
        {displayName}
      </span>
      <span title={fullTimestampString} className="whitespace-nowrap">
        {formattedTimestamp}
      </span>
    </div>
  );
}; 