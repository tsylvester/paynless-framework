'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import {
  Card, CardHeader, CardTitle, CardContent
} from "@/components/ui/card";
import { Loader2 } from 'lucide-react';

export const OrganizationDetailsCard: React.FC = () => {
  const {
    currentOrganizationDetails,
    isLoading, // Using the main store loading for now
  } = useOrganizationStore();

  // Use isLoading specifically for details fetch if available later
  const isLoadingDetails = isLoading; 

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoadingDetails && !currentOrganizationDetails ? (
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading details...</span>
          </div>
        ) : currentOrganizationDetails ? (
          <div className="space-y-2 text-sm">
            <p><strong>Name:</strong> {currentOrganizationDetails.name}</p>
            <p><strong>Visibility:</strong> {currentOrganizationDetails.visibility}</p>
            <p><strong>Created:</strong> 
              {new Date(currentOrganizationDetails.created_at).toLocaleDateString()}
            </p>
            {/* Add other details as needed */}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No organization selected or details unavailable.</p>
        )}
      </CardContent>
    </Card>
  );
}; 