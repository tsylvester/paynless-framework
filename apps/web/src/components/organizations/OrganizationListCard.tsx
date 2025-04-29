'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import {
  Card, CardHeader, CardTitle, CardContent, CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus } from 'lucide-react'; // For Create New button

// Placeholder for CreateOrganizationModal trigger
// import { useCreateOrganizationModal } from './CreateOrganizationModal'; 

export const OrganizationListCard: React.FC = () => {
  const {
    userOrganizations,
    currentOrganizationId,
    setCurrentOrganizationId,
    isLoading, // Use the main store loading state for now
    // TODO: Consider a specific loading state for list actions if needed
  } = useOrganizationStore();

  // TODO: Get function to open the Create Org Modal
  // const { onOpen: openCreateOrgModal } = useCreateOrganizationModal(); 
  const openCreateOrgModal = () => {
    console.log('TODO: Trigger Create Organization Modal');
  };

  // Handle click directly on button
  const handleOrgClick = (orgId: string) => {
    if (orgId !== currentOrganizationId) {
      setCurrentOrganizationId(orgId);
    }
  }

  return (
    <Card>
      <CardHeader className="flex justify-between items-center">
        <CardTitle>Your Organizations</CardTitle>
        <Button 
          onClick={openCreateOrgModal} 
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create New
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="p-4 space-y-2">
        {isLoading && userOrganizations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">Loading...</p>
        ) : userOrganizations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">No organizations found.</p>
        ) : (
          // Replace Listbox with Buttons
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
      </CardContent>
      {/* Optional Footer */}
      {/* <CardFooter>
        <p>Footer content if needed</p>
      </CardFooter> */}
    </Card>
  );
}; 