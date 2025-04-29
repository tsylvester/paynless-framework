'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import {
  Card, CardHeader, CardTitle, CardContent
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const OrganizationDetailsCard: React.FC = () => {
  const {
    currentOrganizationId,
    currentOrganizationDetails,
    isLoading,
  } = useOrganizationStore();

  const isLoadingDetails = isLoading && (!currentOrganizationDetails || currentOrganizationId !== currentOrganizationDetails.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoadingDetails ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-[60px]" /> 
              <Skeleton className="h-4 w-[150px]" /> 
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-[60px]" /> 
              <Skeleton className="h-4 w-[80px]" />
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-4 w-[60px]" /> 
              <Skeleton className="h-4 w-[100px]" />
            </div>
          </div>
        ) : currentOrganizationDetails ? (
          <div className="space-y-2 text-sm">
            <div><strong>Name:</strong> {currentOrganizationDetails.name}</div>
            <div><strong>Visibility:</strong> <span className="capitalize">{currentOrganizationDetails.visibility}</span></div>
            <div><strong>Created:</strong> 
              {new Date(currentOrganizationDetails.created_at).toLocaleDateString()}
            </div>
            {/* Add other details as needed */}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No organization selected or details unavailable.</p>
        )}
      </CardContent>
    </Card>
  );
}; 