'use client';

import React, { useEffect } from 'react';
import { useOrganizationStore, selectCurrentUserRoleInOrg } from '@paynless/store';
import { OrganizationListCard } from '../components/organizations/OrganizationListCard';
import { OrganizationDetailsCard } from '../components/organizations/OrganizationDetailsCard';
import { OrganizationPrivacyCard } from '../components/organizations/OrganizationPrivacyCard';
import { OrganizationChatSettings } from '../components/organizations/OrganizationChatSettings';
import { MemberListCard } from '../components/organizations/MemberListCard';
import { InviteMemberCard } from '../components/organizations/InviteMemberCard';
import { PendingActionsCard } from '../components/organizations/PendingActionsCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; // Import Alert components
import { Terminal } from 'lucide-react'; // Example icon for Alert
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import ErrorBoundary from '../components/common/ErrorBoundary'; // Import ErrorBoundary

export const OrganizationHubPage: React.FC = () => {
  const { 
    userOrganizations,
    currentOrganizationId,
    isLoading: isOrgLoading,
    error: orgError, // Get the error state
    fetchCurrentOrganizationDetails,
    fetchCurrentOrganizationMembers,
  } = useOrganizationStore(state => ({
    userOrganizations: state.userOrganizations,
    currentOrganizationId: state.currentOrganizationId,
    isLoading: state.isLoading,
    error: state.error,
    fetchCurrentOrganizationDetails: state.fetchCurrentOrganizationDetails,
    fetchCurrentOrganizationMembers: state.fetchCurrentOrganizationMembers,
  }));

  const currentUserRole = useOrganizationStore(selectCurrentUserRoleInOrg); // Use the selector correctly

  // NEW: Effect to fetch details/members whenever currentOrganizationId changes (and is not null)
  // This ensures data is fetched even when the ID is set by hydration from localStorage.
  useEffect(() => {
    if (currentOrganizationId) {
      fetchCurrentOrganizationDetails();
      fetchCurrentOrganizationMembers();
    }
    // Optional: If the ID becomes null, we might want to clear details/members explicitly,
    // although the setCurrentOrganizationId action already handles this.
    // else {
    //   set({ currentOrganizationDetails: null, currentOrganizationMembers: [] }); 
    // }
  }, [currentOrganizationId, fetchCurrentOrganizationDetails, fetchCurrentOrganizationMembers]);

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
      <h1 className="text-2xl font-semibold mb-6">{/* TODO: Text here if desired */}</h1>
      {/* Use flex layout for responsiveness */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Column 1: Organization List (Fixed width on medium screens and up) */}
        <div className="md:w-1/3 lg:w-1/4 flex-shrink-0"> {/* Adjust width as needed */}
          <ErrorBoundary fallback="Could not load the organization list.">
            <OrganizationListCard />
          </ErrorBoundary>
        </div>

        {/* Column 2: Management Cards (Takes remaining space, vertical stack) */}
        <div className="flex-1 space-y-6">
          {currentOrganizationId ? (
            // If an org ID is selected, check loading/error states for its details
            isOrgLoading ? (
              // Display Skeletons for the management cards while loading
              <div className="space-y-6">
                <Skeleton className="h-32 w-full" /> {/* Details Card Skeleton */}
                <Skeleton className="h-48 w-full" /> {/* Member List Card Skeleton */}
                {/* Add more based on typical admin view */}
                {/* <Skeleton className="h-24 w-full" /> Settings Card Skeleton */}
                {/* <Skeleton className="h-24 w-full" /> Invite Card Skeleton */}
                {/* <Skeleton className="h-32 w-full" /> Pending Actions Skeleton */}
              </div>
            ) : orgError ? (
              // Display an error message if fetching details/members failed
              <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Error Loading Organization Data</AlertTitle>
                <AlertDescription>
                  {orgError} - Could not load data for the selected organization.
                </AlertDescription>
              </Alert>
            ) : (
              // Loading finished and no error, render the actual cards
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ErrorBoundary fallback="Could not load organization details.">
                  <OrganizationDetailsCard />
                </ErrorBoundary>
                {isAdmin && (
                  <ErrorBoundary fallback="Could not load organization privacy settings.">
                    <OrganizationPrivacyCard />
                  </ErrorBoundary>
                )}
                <ErrorBoundary fallback="Could not load the member list.">
                  <MemberListCard />
                </ErrorBoundary>
                {isAdmin && (
                  <ErrorBoundary fallback="Could not load the invite member section.">
                    <InviteMemberCard />
                  </ErrorBoundary>
                )}
                  {isAdmin && (
                    <ErrorBoundary fallback="Could not load pending actions.">
                      <PendingActionsCard />
                    </ErrorBoundary>
                  )}
                  {isAdmin && (
                    <ErrorBoundary fallback="Could not load chat settings.">
                      <OrganizationChatSettings />
                    </ErrorBoundary>
                  )}
              </div>
            )
          ) : userOrganizations.length > 0 ? (
            // No org selected, but the user has organizations
            <div className="text-center text-muted-foreground p-4 border rounded-md">
              Select an organization to view details.
            </div>
          ) : (
             // User has no organizations at all
            <div className="text-center text-muted-foreground p-4 border rounded-md">
              You are not part of any organizations yet. Create one!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 