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
          <div className="space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <strong className="text-textSecondary min-w-[80px]">Name:</strong> 
              <span className="break-words">{currentOrganizationDetails.name}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <strong className="text-textSecondary min-w-[80px]">Visibility:</strong> 
              <span className="capitalize">{currentOrganizationDetails.visibility}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <strong className="text-textSecondary min-w-[80px]">Created:</strong> 
              <span>{new Date(currentOrganizationDetails.created_at).toLocaleDateString()}</span>
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