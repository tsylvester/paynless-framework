import React from 'react';
import { useAuthStore, useAiStore, useOrganizationStore } from '@paynless/store';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import type { UserProfile, User, OrganizationMemberWithProfile } from '@paynless/types';

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
      currentOrganizationMembers: state.currentOrganizationMembers as OrganizationMemberWithProfile[],
    }),
  );
  const { availableProviders, chatParticipantsProfiles } = useAiStore(
    (state) => ({
      availableProviders: state.availableProviders,
      chatParticipantsProfiles: state.chatParticipantsProfiles,
    }),
  );

  let displayName = 'Unknown';
  let fullIdentifier = userId ? userId : 'Assistant';

  if (role === 'assistant') {
    // Get the actual model information from the store
    const provider = modelId ? availableProviders?.find(p => p.id === modelId) : null;
    displayName = provider ? provider.name : 'Assistant';
    fullIdentifier = provider ? provider.name : 'Assistant';
  } else if (userId) {
    // Determine if the message user is the current authenticated user
    const isCurrentUserMessage = currentUser?.id === userId;

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
      // Check if we're in an organization context and the user is a member
      const isInOrgContext = organizationId && currentOrganizationId === organizationId;
      const orgMember = isInOrgContext ? currentOrganizationMembers?.find(m => m.user_id === userId) : null;
      
      if (!isInOrgContext) {
        // If organization IDs don't match, use truncated ID
        displayName = truncateId(userId);
        fullIdentifier = userId;
      } else if (orgMember && orgMember.user_profiles) {
        const profile = orgMember.user_profiles;
        if (profile.first_name && profile.last_name) {
          displayName = `${profile.first_name} ${profile.last_name}`;
          fullIdentifier = `${profile.first_name} ${profile.last_name} (ID: ${userId})`;
        } else if (profile.first_name) {
          displayName = profile.first_name;
          fullIdentifier = `${profile.first_name} (ID: ${userId})`;
        } else {
          displayName = truncateId(userId);
          fullIdentifier = userId;
        }
      } else if (orgMember && !orgMember.user_profiles) {
        // If user_profiles is null/undefined, use truncated ID
        displayName = truncateId(userId);
        fullIdentifier = userId;
      } else if (!orgMember) {
        // If member not found in org, use truncated ID
        displayName = truncateId(userId);
        fullIdentifier = userId;
      } else {
        // Try chat participants profiles as fallback
        const participantProfile = chatParticipantsProfiles[userId];
        if (participantProfile) {
          if (participantProfile.first_name && participantProfile.last_name) {
            displayName = `${participantProfile.first_name} ${participantProfile.last_name}`;
            fullIdentifier = `${participantProfile.first_name} ${participantProfile.last_name} (ID: ${userId})`;
          } else if (participantProfile.first_name) {
            displayName = participantProfile.first_name;
            fullIdentifier = `${participantProfile.first_name} (ID: ${userId})`;
          } else {
            const truncatedId = truncateId(userId);
            displayName = truncatedId;
            fullIdentifier = truncatedId;
          }
        } else {
          // Final fallback to truncated ID
          const truncatedId = truncateId(userId);
          displayName = truncatedId;
          fullIdentifier = truncatedId;
        }
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