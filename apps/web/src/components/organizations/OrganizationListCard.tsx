'use client';

import React, { useEffect } from 'react';
// import { Link } from 'react-router-dom'; // Remove unused Link
import { useOrganizationStore } from '@paynless/store';
import { logger } from '@paynless/utils'; // Added logger import
import {
  Card, CardHeader, CardTitle, CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlusCircle } from 'lucide-react'; // For Create New button
import { CreateOrganizationModal } from './CreateOrganizationModal'; // Import the modal
import { PaginationComponent } from '../common/PaginationComponent'; // <<< Import PaginationComponent
import { Skeleton } from '@/components/ui/skeleton'; // <<< Import Skeleton

// Placeholder for CreateOrganizationModal trigger
// import { useCreateOrganizationModal } from './CreateOrganizationModal'; 

export const OrganizationListCard: React.FC = () => {
  const {
    userOrganizations,
    currentOrganizationId,
    setCurrentOrganizationId,
    isLoading, // Use the main store loading state for now
    // TODO: Consider a specific loading state for list actions if needed
    openCreateModal,
    isCreateModalOpen, // <<< Get the state to control rendering
    // --- Get Pagination State & Actions ---
    orgListPage,
    orgListPageSize,
    orgListTotalCount,
    setOrgListPage,
    setOrgListPageSize,
    fetchUserOrganizations, // Need this to fetch initially
  } = useOrganizationStore();

  // Fetch initial page on mount
  useEffect(() => {
    // Fetch only if not loading and no orgs are present (or if pagination state suggests initial load needed)
    // Avoid fetching if we already have orgs for the current page > 1 to prevent loops on page load
    if (!isLoading) { 
      logger.info(
        `[OrganizationListCard] Fetching orgs - Page: ${orgListPage}, Size: ${orgListPageSize}`,
      )
      // Correct the call signature here
      fetchUserOrganizations({ page: orgListPage, limit: orgListPageSize });
    }
    // Depend on fetchUserOrganizations, pageSize, but NOT page or userOrgs to avoid loops <-- Comment might be outdated regarding page
  }, [fetchUserOrganizations, orgListPageSize, isLoading, orgListPage]); // Keep orgListPage here

  // TODO: Get function to open the Create Org Modal
  // const { onOpen: openCreateOrgModal } = useCreateOrganizationModal(); 

  // Handle click directly on button
  const handleOrgClick = (orgId: string) => {
    if (orgId !== currentOrganizationId) {
      setCurrentOrganizationId(orgId);
    }
  }

  const handleCreateNewClick = () => {
    // console.log('TODO: Trigger Create Organization Modal'); 
    // Call the action from the store
    openCreateModal();
  };

  // Handle page change from PaginationComponent
  const handlePageChange = (newPage: number) => {
    setOrgListPage(newPage);
  };

  // Handle page size change from PaginationComponent
  const handlePageSizeChange = (newSize: number) => {
    setOrgListPageSize(newSize);
  };

  // Calculate totalPages for the PaginationComponent conditional rendering
  // Although PaginationComponent does this internally, we might need it here
  //const totalPages = Math.ceil(orgListTotalCount / orgListPageSize);
  // const totalPages = Math.ceil(orgListTotalCount / orgListPageSize); // Remove unused variable assignment

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
        <CardTitle role="heading" className="text-lg">Organizations</CardTitle>
        <Button 
          onClick={handleCreateNewClick} 
          variant="outline"
          size="sm"
          className="shrink-0 w-full sm:w-auto"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          <span className="sm:inline">Create New</span>
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col flex-grow p-4 space-y-2"> {/* Add space-y for list items */}
        {isLoading && userOrganizations.length === 0 ? (
          // Show skeletons while loading initial list
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : !isLoading && userOrganizations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No organizations found.</p>
        ) : (
          // Map over the paginated list
          userOrganizations.map((org) => (
            <Button
              key={org.id}
              variant={currentOrganizationId === org.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => handleOrgClick(org.id)}
            >
              {/* TODO: Fetch org details if name isn't in userOrganizations */} 
              {org.name || org.id} 
            </Button>
          ))
        )}
        {/* Spacer to push pagination down if content is short */} 
        <div className="flex-grow"></div> 
      </CardContent>

      {/* --- Render Pagination Component --- */}
      {/* Only render pagination if needed (more than one page exists) */}
      {/* Pass necessary props from the store */}
      {/* PaginationComponent handles its own visibility based on totalPages > 1 */}
      <PaginationComponent
        currentPage={orgListPage}
        pageSize={orgListPageSize}
        totalItems={orgListTotalCount}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        // Optional: Define specific page sizes if needed
        // allowedPageSizes={[5, 10, 20]}
      />
      
      {/* Render the modal component (portal recommended if not already) */}
      {isCreateModalOpen && <CreateOrganizationModal />}
      {/* Optional Footer */}
      {/* <CardFooter>
        <p>Footer content if needed</p>
      </CardFooter> */}
    </Card>
  );
}; 