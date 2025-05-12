import React from 'react';
import { useAuthStore, useAiStore } from '@paynless/store';
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
  modelId,
}) => {
  const { currentUser, profile: currentUserProfile } = useAuthStore(
    (state) => ({ currentUser: state.user as User | null, profile: state.profile as UserProfile | null }),
  );
  const { availableProviders, chatParticipantsProfiles } = useAiStore(
    (state) => ({
      availableProviders: state.availableProviders,
      chatParticipantsProfiles: state.chatParticipantsProfiles,
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

    // Initialize with a generic default
    displayName = 'User'; 
    fullIdentifier = `User ID: ${truncateId(userId)}`; // Keep fullIdentifier potentially more specific for title

    if (isCurrentUserMessage) {
      let tempDisplayName = 'You'; // Default before adding (You)
      if (currentUserProfile?.first_name && currentUserProfile?.last_name) {
        tempDisplayName = `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
      } else if (currentUserProfile?.first_name) {
        tempDisplayName = currentUserProfile.first_name;
      } else if (currentUser?.email) {
        tempDisplayName = currentUser.email;
      } else {
        // Fallback to truncated ID if no name/email for current user
        tempDisplayName = truncateId(userId);
      }
      fullIdentifier = `${tempDisplayName} (ID: ${userId})`; // Set fullIdentifier BEFORE appending (You)
      displayName = `${tempDisplayName} (You)`;
    } else {
      // For other users, try to get from chatParticipantsProfiles first
      const participantProfile = chatParticipantsProfiles[userId];
      if (participantProfile) {
        if (participantProfile.first_name && participantProfile.last_name) {
          displayName = `${participantProfile.first_name} ${participantProfile.last_name}`;
        } else if (participantProfile.first_name) {
          displayName = participantProfile.first_name;
        } else if (participantProfile.id) { // Fallback to ID from profile if name is missing
          displayName = truncateId(participantProfile.id);
        } // Else, displayName remains 'User' as initialized before this block
        fullIdentifier = `${displayName} (Profile ID: ${participantProfile.id})`;
      } else {
        // If participantProfile is not found, or for non-current users with no profile in chatParticipants
        displayName = truncateId(userId); // Default to truncated ID for other users not in participants list
        fullIdentifier = `User ID: ${userId}`; 
      }
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