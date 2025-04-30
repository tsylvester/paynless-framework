'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { Invite, MembershipRequest } from '@paynless/types'; // Assuming these types exist
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { logger } from '@paynless/utils'; // Import logger
import { RefreshCw } from 'lucide-react'; // Import refresh icon
import { AdminBadge } from './AdminBadge'; // Import the badge

// TODO: Refine pending item display (e.g., user info for requests, email/role for invites)

export const PendingActionsCard: React.FC = () => {
  const {
    currentPendingInvites,
    currentPendingRequests,
    isLoading, // Use main loading for now
    approveRequest,
    denyRequest,
    cancelInvite,
    fetchCurrentOrganizationMembers, // Get fetch function
  } = useOrganizationStore();

  const handleRefresh = () => {
    logger.info('[PendingActionsCard] Refreshing pending actions...');
    fetchCurrentOrganizationMembers();
  };

  // Placeholder Actions
  const handleApproveRequest = async (membershipId: string) => {
    logger.info(`Attempting to approve request ${membershipId}`);
    try {
      const success = await approveRequest(membershipId);
      if (success) {
        logger.info(`Successfully approved request ${membershipId}`);
        // TODO: Toast
      } else {
        logger.error(`Failed to approve request ${membershipId}`);
        // TODO: Toast
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error approving request ${membershipId}: ${message}`, { error });
       // TODO: Toast
    }
  };
  const handleDenyRequest = async (membershipId: string) => {
    logger.info(`Attempting to deny request ${membershipId}`);
    try {
      const success = await denyRequest(membershipId);
      if (success) {
        logger.info(`Successfully denied request ${membershipId}`);
        // TODO: Toast
      } else {
        logger.error(`Failed to deny request ${membershipId}`);
        // TODO: Toast
      }
    } catch (error) {
       const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error denying request ${membershipId}: ${message}`, { error });
      // TODO: Toast
    }
  };
  const handleCancelInvite = async (inviteId: string) => {
    logger.info(`Attempting to cancel invite ${inviteId}`);
    try {
      const success = await cancelInvite(inviteId);
      if (success) {
        logger.info(`Successfully cancelled invite ${inviteId}`);
        // TODO: Add success toast notification
      } else {
        logger.error(`Failed to cancel invite ${inviteId} (API error handled by store)`);
        // TODO: Add error toast notification (error message is in store state)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Unexpected error cancelling invite ${inviteId}: ${message}`, { error }); 
       // TODO: Add unexpected error toast notification
    }
  };

  const isLoadingPending = isLoading; // Use main loading state for now

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center">
           <CardTitle>Pending Actions</CardTitle>
           <AdminBadge />
        </div>
        <Button 
            variant="outline" 
            size="icon" 
            onClick={handleRefresh} 
            disabled={isLoadingPending}
            aria-label="Refresh pending actions"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Join Requests */}
        <div>
          <h4 className="mb-2 font-medium">Join Requests</h4>
          {isLoadingPending && currentPendingRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading requests...</p>
          ) : currentPendingRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending join requests.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPendingRequests.map((req: MembershipRequest) => {
                  const profile = req.user_profiles;
                  const displayName = profile?.first_name && profile?.last_name 
                                      ? `${profile.first_name} ${profile.last_name}` 
                                      : profile?.first_name || profile?.last_name || req.user_id; // Fallback logic
                  return (
                  <TableRow key={req.id}>
                    {/* Use constructed display name */}
                    <TableCell>{displayName}</TableCell>
                    <TableCell>{new Date(req.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" color="success" onClick={() => handleApproveRequest(req.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDenyRequest(req.id)}>Deny</Button>
                    </TableCell>
                  </TableRow>
                );})}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pending Invites */}
        <div>
          <h4 className="mb-2 font-medium">Sent Invites</h4>
           {isLoadingPending && currentPendingInvites.length === 0 ? (
            <p className="text-muted-foreground text-sm">Loading invites...</p>
          ) : currentPendingInvites.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending invites.</p>
          ) : (
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPendingInvites.map((invite: Invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.invited_email}</TableCell>
                    <TableCell>{invite.role_to_assign}</TableCell>
                    <TableCell>{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => handleCancelInvite(invite.id)}>Cancel</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}; 