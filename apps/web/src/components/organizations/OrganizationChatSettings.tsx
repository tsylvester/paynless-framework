import React from 'react';
import { useOrganizationStore, selectCurrentUserRoleInOrg } from '@paynless/store';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal } from "lucide-react";
import { toast } from 'sonner';

export const OrganizationChatSettings: React.FC = () => {
  const currentOrganizationId = useOrganizationStore(state => state.currentOrganizationId);
  const currentOrganizationDetails = useOrganizationStore(state => state.currentOrganizationDetails);
  const currentUserRoleInOrg = useOrganizationStore(selectCurrentUserRoleInOrg);
  const isLoading = useOrganizationStore(state => state.isLoading);
  const error = useOrganizationStore(state => state.error);
  const updateOrganizationSettings = useOrganizationStore(state => state.updateOrganizationSettings);

  if (!currentOrganizationId || !currentOrganizationDetails) {
    return null; // Or some placeholder if preferred
  }

  const isAdmin = currentUserRoleInOrg === 'admin';
  const allowMemberChatCreationSetting = !!currentOrganizationDetails.allow_member_chat_creation;
  const tokenUsagePolicySetting = currentOrganizationDetails.token_usage_policy || 'member_tokens';

  // Phase 1: Organization wallets are not yet enabled.
  // The switch should appear unchecked and disabled regardless of the stored policy.
  const isOrgTokenPolicySwitchEffectivelyDisabled = true; // For Phase 1

  const handleAllowMemberChatToggle = async (checked: boolean) => {
    if (!isAdmin || isLoading || !currentOrganizationId) return;
    await updateOrganizationSettings(currentOrganizationId, { allow_member_chat_creation: checked });
  };

  const handleTokenUsagePolicyToggle = async (checked: boolean) => {
    if (!isAdmin || isLoading || !currentOrganizationId) return;

    const newPolicy = checked ? 'organization_tokens' : 'member_tokens';

    if (newPolicy === 'organization_tokens') {
      toast.info("Organization wallets are not yet enabled. Org chats will use member tokens by default.");
      return;
    }
    
    await updateOrganizationSettings(currentOrganizationId, { token_usage_policy: newPolicy });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
          <div className="flex items-center space-x-3 p-4 border rounded-md">
            <Switch
              id="allow-member-chat-creation"
              checked={allowMemberChatCreationSetting}
              onCheckedChange={handleAllowMemberChatToggle}
              disabled={!isAdmin || isLoading}
              aria-label="Allow members to create organization chats"
              className="data-[state=unchecked]:bg-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Label htmlFor="allow-member-chat-creation" className={`flex-grow ${(!isAdmin || isLoading) ? 'text-muted-foreground' : ''}`}>
              Allow members to create organization chats
            </Label>
        </div>

          <div className="flex items-center space-x-3 p-4 border rounded-md">
            <Switch
              id="token-usage-policy"
              // Phase 1: Always unchecked and disabled
              checked={false}
              onCheckedChange={handleTokenUsagePolicyToggle} 
              disabled={isOrgTokenPolicySwitchEffectivelyDisabled || !isAdmin || isLoading}
              aria-label="Use organization tokens for organization chats"
              className="data-[state=unchecked]:bg-border ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <Label htmlFor="token-usage-policy" className={`flex-grow ${(!isAdmin || isLoading || isOrgTokenPolicySwitchEffectivelyDisabled) ? 'text-muted-foreground' : ''}`}>
              Use organization tokens for chat (not available)
            </Label>
          </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Updating settings...</p>
        )}
        {error && (
            <Alert variant="destructive">
                <Terminal className="h-4 w-4" />
                <AlertTitle>Update Failed</AlertTitle>
                <AlertDescription>{error as string}</AlertDescription>
            </Alert>
        )}
      </CardContent>
    </Card>
  );
}; 