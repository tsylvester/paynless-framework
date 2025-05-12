'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { logger } from '@paynless/utils'; // Import logger
import { RefreshCw } from 'lucide-react'; // Import refresh icon
import { AdminBadge } from './AdminBadge'; // Import the badge
import { Badge } from '@/components/ui/badge';
import { 
    PendingInviteWithInviter,
    PendingRequestWithDetails
} from '@paynless/types';
import { formatDistanceToNow } from 'date-fns';

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
          <h4 className="text-sm font-semibold mb-2">Join Requests</h4>
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
                {currentPendingRequests.map((req: PendingRequestWithDetails) => {
                  const profile = req.user_profiles;
                  const displayName = profile?.first_name || profile?.last_name 
                                    ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
                                    : (req.user_email || 'User Profile Pending');
                  return (
                  <TableRow key={req.id}>
                    <TableCell>
                      {displayName}
                      {req.user_email && <span className="block text-xs text-muted-foreground">{req.user_email}</span>}
                    </TableCell>
                    <TableCell>{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</TableCell>
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
          <h4 className="text-sm font-semibold mb-2 mt-4">Pending Invitations</h4>
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
                  <TableHead>Invited By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPendingInvites.map((invite: PendingInviteWithInviter) => {
                  // Use new flat properties, fallback to email
                  const inviterName = (invite.inviter_first_name || invite.inviter_last_name)
                                    ? `${invite.inviter_first_name || ''} ${invite.inviter_last_name || ''}`.trim()
                                    : (invite.inviter_email || 'Unknown Inviter');
                  return (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.invited_email}</TableCell>
                    <TableCell><Badge variant="secondary">{invite.role_to_assign}</Badge></TableCell>
                    <TableCell>{inviterName}</TableCell>
                    <TableCell>{formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleCancelInvite(invite.id)}
                        className="text-destructive-foreground"
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                );})}
              </TableBody>
            </Table>
          )}
        </div>

        {/* No Pending Actions Message */}
        {currentPendingInvites.length === 0 && currentPendingRequests.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending invites or join requests.</p>
        )}
      </CardContent>
    </Card>
  );
}; 