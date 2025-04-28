'use client'

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '@paynless/store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"

// Define the Zod schema for form validation
const formSchema = z.object({
  name: z.string().min(3, { message: 'Organization name must be at least 3 characters long.' }),
  visibility: z.enum(['private', 'public']),
});

// Use z.infer again, it should now infer visibility as non-optional
type FormData = z.infer<typeof formSchema>;

export const CreateOrganizationForm: React.FC = () => {
  const navigate = useNavigate();
  const createOrganization = useOrganizationStore((state) => state.createOrganization);
  const isLoading = useOrganizationStore((state) => state.isLoading);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      visibility: 'private',
    },
  });

  const onSubmit = async (data: FormData) => {
    const toastId = toast.loading('Creating organization...');
    try {
      const newOrg = await createOrganization(data.name, data.visibility);
      if (newOrg) {
        toast.success(`Organization '${newOrg.name}' created successfully!`, { id: toastId });
        // Navigate to the new organization's page or the list
        // Assuming createOrganization action adds the new org to the store and returns it
        navigate(`/dashboard/organizations/${newOrg.id}`); // Navigate to the specific org page
      } else {
        // Handle case where creation succeeded API-wise but store/return is unexpected
        toast.error('Failed to create organization. Please try again.', { id: toastId });
      }
    } catch (error) {
      // Error handling likely done in store/API client, but catch here as fallback
      console.error("Create organization form error:", error);
      toast.error('Failed to create organization.', { id: toastId });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input placeholder="Your Company or Team Name" {...field} />
              </FormControl>
              <FormDescription>
                This will be the display name for your organization.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Visibility</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="private" />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Private (Only members can see)
                    </FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="public" />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Public (Visible to all logged-in users - future feature)
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormDescription>
                Choose who can see this organization.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading || form.formState.isSubmitting}>
          {isLoading || form.formState.isSubmitting ? 'Creating...' : 'Create Organization'}
        </Button>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm; 