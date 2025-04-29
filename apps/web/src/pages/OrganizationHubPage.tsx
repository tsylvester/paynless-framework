'use client';

import React, { useEffect } from 'react';
import { useOrganizationStore } from '@paynless/store';
import { OrganizationListCard } from '../components/organizations/OrganizationListCard';
import { OrganizationDetailsCard } from '../components/organizations/OrganizationDetailsCard';
import { OrganizationSettingsCard } from '../components/organizations/OrganizationSettingsCard';
import { MemberListCard } from '../components/organizations/MemberListCard';
import { InviteMemberCard } from '../components/organizations/InviteMemberCard';
import { PendingActionsCard } from '../components/organizations/PendingActionsCard';
import { useCurrentUser } from '../hooks/useCurrentUser'; // Assuming hook to get user info

export const OrganizationHubPage: React.FC = () => {
  const { 
    userOrganizations,
    fetchUserOrganizations,
    setCurrentOrganizationId,
    currentOrganizationId,
    isLoading: isOrgLoading,
    selectCurrentUserRole, // Selector to get role for current org
  } = useOrganizationStore();

  const { user } = useCurrentUser(); // Get current user details
  const currentUserRole = selectCurrentUserRole(); // Get role in the currently selected organization

  useEffect(() => {
    // Fetch organizations when the component mounts or user changes
    if (user) {
      fetchUserOrganizations();
    }
  }, [fetchUserOrganizations, user]);

  useEffect(() => {
    // Set the initial current organization if not already set and organizations are loaded
    if (!currentOrganizationId && userOrganizations.length > 0) {
      setCurrentOrganizationId(userOrganizations[0].organization_id);
    }
  }, [currentOrganizationId, userOrganizations, setCurrentOrganizationId]);

  if (isOrgLoading && userOrganizations.length === 0) {
    // Use simple text or shadcn Skeleton for loading state
    return (
      <div className="flex justify-center items-center h-64">
        {/* Option 1: Simple Text */}
         <p className="text-muted-foreground">Loading organizations...</p>
      </div>
    );
  }

  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-6">Organizations</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Organization List */}
        <div className="lg:col-span-1">
          {/* OrganizationListCard will handle its own loading state for creating/list updates */}
          <OrganizationListCard />
        </div>

        {/* Column 2: Management Cards for Selected Org */}
        <div className="lg:col-span-2 space-y-6">
          {currentOrganizationId ? (
            <>
              <OrganizationDetailsCard />
              {/* Conditionally render admin cards based on role */}
              {isAdmin && <OrganizationSettingsCard />}
              <MemberListCard />
              {isAdmin && <InviteMemberCard />}
              {isAdmin && <PendingActionsCard />}
            </>
          ) : userOrganizations.length > 0 ? (
            <div className="text-center text-muted-foreground p-4 border rounded-md">
              Select an organization to view details.
            </div>
          ) : (
             // No organizations yet, OrganizationListCard should show create button
            <div className="text-center text-muted-foreground p-4 border rounded-md">
              You are not part of any organizations yet. Create one!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 