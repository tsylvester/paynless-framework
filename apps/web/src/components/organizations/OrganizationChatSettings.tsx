import React from 'react';
import { useOrganizationStore, selectCurrentUserRoleInOrg } from '@paynless/store';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

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
  const currentSetting = !!currentOrganizationDetails.allow_member_chat_creation;

  const handleToggle = async (checked: boolean) => {
    if (!isAdmin || isLoading || !currentOrganizationId) return;

    await updateOrganizationSettings(currentOrganizationId, { allow_member_chat_creation: checked });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch
          id="allow-member-chat-creation"
          checked={currentSetting}
          onCheckedChange={handleToggle}
          disabled={!isAdmin || isLoading}
          aria-label="Allow members to create organization chats"
          className="data-[state=unchecked]:bg-border"
        />
        <Label htmlFor="allow-member-chat-creation" className={(!isAdmin || isLoading) ? 'text-muted-foreground' : ''}>
          Allow members to create organization chats
        </Label>
      </div>
      {isLoading && (
        <p className="text-sm text-muted-foreground">Updating settings...</p>
      )}
      {error && (
          <Alert variant="destructive">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Update Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
          </Alert>
      )}
    </div>
  );
}; 