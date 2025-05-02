'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import { SimpleDropdown } from '@/components/ui/SimpleDropdown';
import { ChevronsUpDown, PlusCircle, Check, Building } from 'lucide-react'; // Icons
import { logger } from '@paynless/utils';
import { cn } from '@/lib/utils';

export const OrganizationSwitcher: React.FC = () => {
  const {
    userOrganizations,
    currentOrganizationId,
    isLoading,
    fetchUserOrganizations,
    setCurrentOrganizationId,
    openCreateModal,
  } = useOrganizationStore((state) => ({
    userOrganizations: state.userOrganizations,
    currentOrganizationId: state.currentOrganizationId,
    isLoading: state.isLoading,
    fetchUserOrganizations: state.fetchUserOrganizations,
    setCurrentOrganizationId: state.setCurrentOrganizationId,
    openCreateModal: state.openCreateModal,
  }));

  // Keep track of SimpleDropdown open state for potential callback use
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const handleOpenChange = useCallback((open: boolean) => {
    setIsSwitcherOpen(open);
    // If closing, maybe clear focus or perform other actions
  }, []);

  // Determine if the list is currently loading (specifically for the initial fetch)
  const isListLoading = isLoading && userOrganizations.length === 0;

  useEffect(() => {
    const shouldFetch = userOrganizations.length === 0 && !isLoading;
    // We don't need to check for user explicitly here, as fetchUserOrganizations internally checks auth
    // and handles the case where the user might have logged out between renders.
    if (shouldFetch) {
      logger.debug('[OrganizationSwitcher] Initial fetch triggered: No orgs loaded and not currently loading.');
      fetchUserOrganizations(); // Call without params to use store's current page/limit
    }
  }, [userOrganizations.length, isLoading, fetchUserOrganizations]); // Dependencies

  const handleSelectOrganization = (orgId: string | null) => {
    // If clicking the currently selected org, deselect it (set to null)
    if (orgId === currentOrganizationId) {
      logger.info(`[OrganizationSwitcher] Deselecting current org: ${orgId}`);
      setCurrentOrganizationId(null);
      setIsSwitcherOpen(false); // Close dropdown
      return; // Stop execution here
    }

    // If selecting a *different* org
    logger.info(`[OrganizationSwitcher] Setting current org to: ${orgId}`);
    setCurrentOrganizationId(orgId);
    setIsSwitcherOpen(false); // Explicitly close
  };

  const currentOrg = userOrganizations.find(org => org.id === currentOrganizationId);
  const triggerLabel = currentOrg ? currentOrg.name : 'Select Organization';

  // Define styles for dropdown items
  const itemBaseClasses = "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer";

  return (
    <SimpleDropdown
      align="end"
      contentClassName="w-[200px] p-1" // Apply width and padding here
      onOpenChange={handleOpenChange} // Pass callback
      trigger={
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isSwitcherOpen}
          className="w-[200px] justify-between"
          disabled={isListLoading}
        >
          {isListLoading ? (
            'Loading...'
          ) : (
            <>
              <span className="truncate flex-grow text-left">{triggerLabel}</span>
            </>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      }
    >
      {/* Content inside SimpleDropdown's children */}
      <div className="flex flex-col">
        {/* Organization List */}
        <div className="flex flex-col space-y-1 p-1 max-h-[200px] overflow-y-auto">
          {userOrganizations.length > 0 ? (
            userOrganizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSelectOrganization(org.id)}
                className={cn(itemBaseClasses, "justify-between")}
              >
                <div className="flex items-center overflow-hidden">
                    <Building className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{org.name}</span>
                </div>
                {currentOrganizationId === org.id && (
                  <Check className="ml-2 h-4 w-4 flex-shrink-0" />
                )}
              </button>
            ))
          ) : (
            !isListLoading && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No organizations found.</p>
            )
          )}
          {isListLoading && <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</p>}
        </div>

        <hr className="my-1 border-border" />

        {/* Manage All Link */}
        <Link
            to="/organizations"
            className={itemBaseClasses}
            onClick={() => setIsSwitcherOpen(false)} // Close dropdown on click
        >
          <Building className="mr-2 h-4 w-4" />
          Manage Organizations
        </Link>

        <hr className="my-1 border-border" />

        {/* Create New Button */}
        <button
            className={itemBaseClasses}
            onClick={() => {
                setIsSwitcherOpen(false); // Close dropdown
                openCreateModal(); // Open the modal
            }}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Organization
        </button>
      </div>
    </SimpleDropdown>
  );
};

export default OrganizationSwitcher; 