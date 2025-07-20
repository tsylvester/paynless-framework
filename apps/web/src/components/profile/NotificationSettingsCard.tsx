import React from 'react';
import { useAuthStore } from '@paynless/store';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Terminal } from "lucide-react";

export const NotificationSettingsCard: React.FC = () => {
  const profile = useAuthStore(state => state.profile);
  const isLoading = useAuthStore(state => state.isLoading);
  const error = useAuthStore(state => state.error);
  const toggleNewsletterSubscription = useAuthStore(state => state.toggleNewsletterSubscription);

  if (!profile) {
    return null; // Or some placeholder if preferred
  }

  const handleSubscriptionToggle = async (checked: boolean) => {
    if (isLoading) return;
    await toggleNewsletterSubscription(checked);
  };

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-textPrimary">Email Notifications</CardTitle>
        <CardDescription>Manage your email notification preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
            <Label htmlFor="newsletter-subscription" className="font-semibold text-textSecondary">System Notices</Label>
            <div className="flex items-center space-x-3 p-4 border rounded-md">
              <Switch
                id="newsletter-subscription"
                checked={!!profile.is_subscribed_to_newsletter}
                onCheckedChange={handleSubscriptionToggle}
                disabled={isLoading}
                aria-label="Subscribe to system notices and updates"
                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <Label htmlFor="newsletter-subscription" className={`flex-grow ${isLoading ? 'text-muted-foreground' : ''}`}>
                System notices and updates
              </Label>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            Receive important updates, announcements, and system-related notifications.
          </p>
        </div>
      </CardContent>
      {(isLoading || error) && (
        <CardFooter className={`border-t pt-4 mt-6 ${error ? 'bg-destructive/10 border-destructive/30' : ''}`}>
          {isLoading && !error && <p data-testid="loading-indicator" className="text-sm text-muted-foreground animate-pulse w-full text-center">Saving settings...</p>}
          {error && (
            <div data-testid="error-message" className="w-full flex items-center gap-2 text-destructive p-3 rounded-md bg-destructive/10">
              <AlertCircle size={18} />
              <span>Error updating settings: {error.message}</span>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}; 