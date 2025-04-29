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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert components
import { Terminal } from 'lucide-react'; // Example icon for Alert
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import ErrorBoundary from '../components/common/ErrorBoundary'; // Import ErrorBoundary

export const OrganizationHubPage: React.FC = () => {
  const { 
    userOrganizations,
    fetchUserOrganizations,
    setCurrentOrganizationId,
    currentOrganizationId,
    isLoading: isOrgLoading,
    error: orgError, // Get the error state
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
    // Make sure not to set if there was an error fetching
    if (!currentOrganizationId && userOrganizations.length > 0 && !orgError) {
      setCurrentOrganizationId(userOrganizations[0].organization_id);
    }
    // If an error occurs *after* an org was selected, maybe clear selection?
    // else if (orgError && currentOrganizationId) {
    //   setCurrentOrganizationId(null); 
    // }
  }, [currentOrganizationId, userOrganizations, setCurrentOrganizationId, orgError]);

  // Initial Loading State with Skeletons
  if (isOrgLoading && userOrganizations.length === 0 && !orgError) {
    return (
      <div className="container mx-auto p-4">
        {/* Skeleton for Page Title */}
        <Skeleton className="h-8 w-1/3 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Skeleton for Organization List Card */}
          <div className="lg:col-span-1 space-y-4">
            <Skeleton className="h-10 w-full" /> {/* Card Header */}
            <Skeleton className="h-8 w-full" /> {/* List Item */}
            <Skeleton className="h-8 w-full" /> {/* List Item */}
            <Skeleton className="h-8 w-full" /> {/* List Item */}
            <Skeleton className="h-10 w-1/2" /> {/* Button */}
          </div>

          {/* Column 2: Skeleton for Management Cards Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Placeholder for where cards would be */}
            <Skeleton className="h-32 w-full" /> {/* Details Card Skeleton */}
            <Skeleton className="h-48 w-full" /> {/* Member List Card Skeleton */}
            {/* Add more skeletons if expecting admin cards */}
            {/* <Skeleton className="h-24 w-full" /> Settings Card Skeleton */}
            {/* <Skeleton className="h-24 w-full" /> Invite Card Skeleton */}
          </div>
        </div>
      </div>
    );
  }

  // Error State (If fetch failed and we have no orgs to show)
  if (orgError && userOrganizations.length === 0) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error Fetching Organizations</AlertTitle>
          <AlertDescription>
            {orgError} - Please try refreshing the page.
          </AlertDescription>
        </Alert>
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
          <ErrorBoundary fallbackMessage="Could not load the organization list.">
            <OrganizationListCard />
          </ErrorBoundary>
        </div>

        {/* Column 2: Management Cards for Selected Org */}
        <div className="lg:col-span-2 space-y-6">
          {currentOrganizationId ? (
            <>
              <ErrorBoundary fallbackMessage="Could not load organization details.">
                <OrganizationDetailsCard />
              </ErrorBoundary>
              {isAdmin && (
                <ErrorBoundary fallbackMessage="Could not load organization settings.">
                  <OrganizationSettingsCard />
                </ErrorBoundary>
              )}
              <ErrorBoundary fallbackMessage="Could not load the member list.">
                <MemberListCard />
              </ErrorBoundary>
              {isAdmin && (
                <ErrorBoundary fallbackMessage="Could not load the invite member section.">
                  <InviteMemberCard />
                </ErrorBoundary>
              )}
              {isAdmin && (
                <ErrorBoundary fallbackMessage="Could not load pending actions.">
                  <PendingActionsCard />
                </ErrorBoundary>
              )}
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