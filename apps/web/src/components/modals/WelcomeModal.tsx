import React from 'react';
import { useAuthStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export const WelcomeModal: React.FC = () => {
  const { showWelcomeModal, profile, updateSubscriptionAndDismissWelcome } = useAuthStore();
  const [isSubscribed, setIsSubscribed] = React.useState(true);

  if (!showWelcomeModal || profile?.is_subscribed_to_newsletter) {
    return null;
  }

  const handleContinue = () => {
    if (updateSubscriptionAndDismissWelcome) {
        updateSubscriptionAndDismissWelcome(isSubscribed);
    }
  };

  return (
    <Dialog open={showWelcomeModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to Paynless!</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p>We're glad to have you here. To get the most out of our platform, we'd like to send you occasional updates and system notices.</p>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="newsletter-opt-in"
              checked={isSubscribed}
              onCheckedChange={() => setIsSubscribed(!isSubscribed)}
            />
            <Label htmlFor="newsletter-opt-in">I agree to receive system notices and updates.</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 