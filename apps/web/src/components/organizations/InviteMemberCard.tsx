'use client';

import React from 'react';
import { useOrganizationStore } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// TODO: Add form handling (react-hook-form, zod) for validation

export const InviteMemberCard: React.FC = () => {
  const {
    inviteUser, // Action needed
    isLoading, // Use main loading for now
    currentOrganizationId,
  } = useOrganizationStore();

  // Placeholder for form submission
  const handleInvite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('TODO: Handle invite submission');
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const role = formData.get('role') as string; // Role value from Select

    if (currentOrganizationId && email && role) {
        console.log(`Inviting ${email} as ${role} to org ${currentOrganizationId}`);
        // inviteUser(email, role); // Call the actual store action
    } else {
        console.error('Missing orgId, email, or role for invite');
        // TODO: Show user-friendly error
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite New Member</CardTitle>
        {/* <CardDescription>Invite a new user via email.</CardDescription> */}
      </CardHeader>
      <form onSubmit={handleInvite}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email"
              type="email" 
              placeholder="member@example.com" 
              required 
             />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
             <Select name="role" required defaultValue="member"> 
              <SelectTrigger id="role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            type="submit"
            isLoading={isLoading} // Reflect loading state if applicable
          >
            Send Invite
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}; 