'use client';

import React from 'react';
import { useForm, ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useOrganizationStore, selectCurrentUserRoleInOrg } from '@paynless/store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage 
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
  // Hooks MUST be called at the top level, before any conditional returns.
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'member', // Default role
    },
  });
  const { formState } = form; // Get form state for disabling button

  // Use selector correctly
  const currentUserRole = useOrganizationStore(selectCurrentUserRoleInOrg);

  // Get actions and needed state directly
  const {
    inviteUser, 
    isLoading,
    currentOrganizationId,
  } = useOrganizationStore((state) => ({ // Select only needed actions/primitive state
    inviteUser: state.inviteUser,
    isLoading: state.isLoading,
    currentOrganizationId: state.currentOrganizationId,
  }));

  // Conditionally render based on role and selected org
  if (currentUserRole !== 'admin' || !currentOrganizationId) {
    return null; // Don't render for non-admins or if no org selected
  }

  const onSubmit = async (values: InviteFormValues) => {
    if (!currentOrganizationId) {
        logger.error('[InviteMemberCard] Org ID missing despite check');
        toast.error('Cannot invite member, organization context is missing.');
        return;
    }
    logger.debug(`[InviteMemberCard] Attempting invite for ${values.email} as ${values.role} to org ${currentOrganizationId}`);
    try {
        // Store action handles API call
        const inviteResult = await inviteUser(values.email, values.role);
        
        // Check if the store action indicated success (e.g., returned the invite object or true)
        // Assuming inviteUser returns null on failure/handled error from API
        if (inviteResult) { 
           toast.success(`Invite sent successfully to ${values.email}`);
           form.reset(); 
        } else {
            // Revert to using getState() to access error for now
            const errorFromStore = useOrganizationStore.getState().error;
            const displayMessage = errorFromStore || 'Failed to send invite. User may already be a member or have a pending invite.';
            toast.error(displayMessage);
        }
    } catch (error) { // Catch unexpected errors *within the component/store action itself*
        logger.error('[InviteMemberCard] Unexpected error during invite process:', { error });
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
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
              render={({ field }: { field: ControllerRenderProps<InviteFormValues, 'email'> }) => (
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
            <div className="flex items-end gap-4">
              <div className="flex-grow">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }: { field: ControllerRenderProps<InviteFormValues, 'role'> }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} name={field.name}>
                        <FormControl>
                          <SelectTrigger id="role" aria-label="Role"> 
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background/70 backdrop-blur-md border border-border">
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button 
                type="submit"
                disabled={formState.isSubmitting || isLoading}
                className="shrink-0"
              >
                {formState.isSubmitting ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
          </CardContent>
        </form>
      </Form>
    </Card>
  );
}; 