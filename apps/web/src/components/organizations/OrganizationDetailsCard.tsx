'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardBody, Spinner } from '@nextui-org/react'; // Assuming NextUI

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
        <h4 className="font-bold text-large">Organization Details</h4>
      </CardHeader>
      <CardBody>
        {isLoadingDetails && !currentOrganizationDetails ? (
          <div className="flex justify-center items-center">
             <Spinner size="sm" label="Loading details..." />
          </div>
        ) : currentOrganizationDetails ? (
          <div className="space-y-2">
            <p><strong>Name:</strong> {currentOrganizationDetails.name}</p>
            <p><strong>Visibility:</strong> {currentOrganizationDetails.visibility}</p>
            <p><strong>Created:</strong> 
              {new Date(currentOrganizationDetails.created_at).toLocaleDateString()}
            </p>
            {/* Add other details as needed */}
          </div>
        ) : (
          <p className="text-gray-500">No organization selected or details unavailable.</p>
        )}
      </CardBody>
    </Card>
  );
}; 