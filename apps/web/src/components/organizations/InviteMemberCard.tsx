'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { 
    Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form"; // Import RHF components
import { toast } from 'sonner';
import { logger } from '@paynless/utils';

// Define Zod schema for validation
const inviteSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }).min(1, { message: "Email is required." }),
  role: z.enum(['member', 'admin'], { required_error: "Role is required." }),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

export const InviteMemberCard: React.FC = () => {
  const {
    inviteUser, 
    isLoading, // Use store's loading for general state if needed, formState better for button
    currentOrganizationId,
    selectCurrentUserRoleInOrg,
  } = useOrganizationStore();

  const currentUserRole = selectCurrentUserRoleInOrg();

  // Conditionally render based on role and selected org
  if (currentUserRole !== 'admin' || !currentOrganizationId) {
    return null; // Don't render for non-admins or if no org selected
  }

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'member', // Default role
    },
  });

  const { formState } = form; // Get form state for disabling button

  const onSubmit = async (values: InviteFormValues) => {
    if (!currentOrganizationId) {
        logger.error('[InviteMemberCard] Org ID missing despite check');
        toast.error('Cannot invite member, organization context is missing.');
        return;
    }
    logger.debug(`[InviteMemberCard] Attempting invite for ${values.email} as ${values.role} to org ${currentOrganizationId}`);
    try {
        await inviteUser(values.email, values.role);
        toast.success(`Invite sent successfully to ${values.email}`);
        form.reset(); // Reset form on success
    } catch (error) {
        logger.error('[InviteMemberCard] Invite failed:', { error });
        const errorMessage = error instanceof Error ? error.message : 'Failed to send invite. Please try again.';
        toast.error(errorMessage);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite New Member</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6"> 
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input 
                        placeholder="member@example.com" 
                        type="email"
                        {...field} 
                    />
                  </FormControl>
                  <FormMessage /> 
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} name={field.name}>
                    <FormControl>
                      <SelectTrigger id="role" aria-label="Role"> 
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button 
              type="submit"
              disabled={formState.isSubmitting || isLoading} // Disable on submit OR general loading
            >
              {formState.isSubmitting ? 'Sending...' : 'Send Invite'}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}; 