'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { Invite, MembershipRequest } from '@paynless/types'; // Assuming these types exist
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// TODO: Refine pending item display (e.g., user info for requests, email/role for invites)

export const PendingActionsCard: React.FC = () => {
  const {
    currentPendingInvites,
    currentPendingRequests,
    isLoading, // Use main loading for now
    approveRequest,
    denyRequest,
    cancelInvite,
  } = useOrganizationStore();

  // Placeholder Actions
  const handleApproveRequest = (membershipId: string) => {
    console.log(`TODO: Approve request ${membershipId}`);
    // approveRequest(membershipId);
  };
  const handleDenyRequest = (membershipId: string) => {
    console.log(`TODO: Deny request ${membershipId}`);
    // denyRequest(membershipId);
  };
  const handleCancelInvite = (inviteId: string) => {
    console.log(`TODO: Cancel invite ${inviteId}`);
    // cancelInvite(inviteId);
  };

  const isLoadingPending = isLoading; // Use main loading state for now

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Actions (Admin)</CardTitle>
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
                {currentPendingRequests.map((req: MembershipRequest) => (
                  <TableRow key={req.id}>
                    {/* TODO: Display user info better (Name? Email?) */}
                    <TableCell>{req.user_profiles?.full_name || req.user_id}</TableCell>
                    <TableCell>{new Date(req.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" color="success" onClick={() => handleApproveRequest(req.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDenyRequest(req.id)}>Deny</Button>
                    </TableCell>
                  </TableRow>
                ))}
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
                      <Button size="sm" variant="destructive" onClick={() => handleCancelInvite(invite.id)}>Cancel Invite</Button>
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