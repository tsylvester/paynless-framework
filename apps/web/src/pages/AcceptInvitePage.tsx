'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { logger } from '@paynless/utils';
import { Skeleton } from "@/components/ui/skeleton";
import ErrorBoundary from '../components/common/ErrorBoundary';
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const {
    acceptInvite,
    declineInvite,
    error: actionError,
    fetchInviteDetails,
    currentInviteDetails,
    isFetchingInviteDetails,
    fetchInviteDetailsError,
  } = useOrganizationStore();

  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (token) {
      logger.info('[AcceptInvitePage] Fetching details for token...');
      fetchInviteDetails(token);
    } else {
      logger.error('[AcceptInvitePage] No token found on mount.');
      toast.error('Invalid or missing invite token in URL.');
    }
  }, [token, fetchInviteDetails]);

  const handleAccept = async () => {
    if (!token) {
      logger.error('[AcceptInvitePage] No token found.');
      toast.error('Invalid invite link.');
      return;
    }

    setActionLoading(true);
    logger.info(`[AcceptInvitePage] Accepting invite with token: ${token}`);

    const success = await acceptInvite(token);

    setActionLoading(false);
    if (success) {
      logger.info(`[AcceptInvitePage] Invite accepted successfully.`);
      toast.success('Invite accepted! Redirecting...');
      setTimeout(() => navigate('/dashboard/organizations'), 1500);
    } else {
      logger.error(`[AcceptInvitePage] Failed to accept invite.`);
      toast.error(actionError || 'Failed to accept invite. The link may be invalid or expired.');
    }
  };

  const handleDecline = async () => {
    if (!token) {
      logger.error('[AcceptInvitePage] No token found.');
      toast.error('Invalid invite link.');
      return;
    }
    
    setActionLoading(true);
    logger.info(`[AcceptInvitePage] Declining invite with token: ${token}`);

    const success = await declineInvite(token);
    
    setActionLoading(false);
    if (success) {
      logger.info(`[AcceptInvitePage] Invite declined successfully.`);
      toast.info('Invite declined. Redirecting...');
      setTimeout(() => navigate('/dashboard'), 1500);
    } else {
      logger.error(`[AcceptInvitePage] Failed to decline invite.`);
      toast.error(actionError || 'Failed to decline invite.');
    }
  };

  if (isFetchingInviteDetails) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
          <CardFooter className="flex justify-end space-x-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-36" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (fetchInviteDetailsError) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{fetchInviteDetailsError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-muted/40">
      <Toaster richColors position="top-right" />
      <ErrorBoundary fallbackMessage="There was a problem loading the invitation page.">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Organization Invitation</CardTitle>
            <CardDescription>
              {currentInviteDetails ? 
                `You have been invited to join ${currentInviteDetails.organizationName}.` : 
                `You have been invited to join an organization.` 
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentInviteDetails && (
              <p>Do you want to accept this invitation?</p>
            )}
          </CardContent>
          {currentInviteDetails && (
            <CardFooter className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={handleDecline} 
                disabled={actionLoading}
              >
                Decline
              </Button>
              <Button 
                onClick={handleAccept} 
                disabled={actionLoading}
                isLoading={actionLoading}
              >
                Accept Invitation
              </Button>
            </CardFooter>
          )}
        </Card>
      </ErrorBoundary>
    </div>
  );
}; 