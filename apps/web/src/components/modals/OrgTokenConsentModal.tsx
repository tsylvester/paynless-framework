import React from 'react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useWalletStore } from '@paynless/store'; // Assuming store is correctly aliased or pathed

interface OrgTokenConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string | undefined; // orgName might be undefined if org details are not yet loaded
}

export const OrgTokenConsentModal: React.FC<OrgTokenConsentModalProps> = ({
  isOpen,
  onClose,
  orgId,
  orgName,
}) => {
  const { setUserOrgTokenConsent } = useWalletStore.getState();

  const handleAccept = () => {
    setUserOrgTokenConsent(orgId, true);
    onClose();
  };

  const handleDecline = () => {
    setUserOrgTokenConsent(orgId, false);
    onClose();
  };

  // Fallback for orgName if not provided
  const displayOrgName = orgName || 'This organization';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Token Usage Confirmation</DialogTitle>
          <DialogDescription>
            {displayOrgName} chat sessions will use your personal tokens.
            Do you agree to use your personal tokens for chats within {displayOrgName}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleDecline}>
            Decline
          </Button>
          <Button onClick={handleAccept}>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 