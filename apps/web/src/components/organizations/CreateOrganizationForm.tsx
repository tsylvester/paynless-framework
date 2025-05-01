'use client'

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useOrganizationStore } from '@paynless/store';
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"; // Or your preferred toast library
import { logger } from '@paynless/utils';

// Define the form schema using Zod
const formSchema = z.object({
  name: z.string().min(3, { message: "Organization name must be at least 3 characters." }),
  visibility: z.enum(['private', 'public'], { 
      required_error: "You need to select a visibility setting.",
      // message: "Visibility must be either 'private' or 'public'." // Optional custom message
  }),
});

// Define the type for our form values based on the schema
type CreateOrganizationFormValues = z.infer<typeof formSchema>;

export const CreateOrganizationForm: React.FC = () => {
  const createOrganization = useOrganizationStore((state) => state.createOrganization);
  const closeCreateModal = useOrganizationStore((state) => state.closeCreateModal);
  // Use isLoading from the store if needed to disable the button
  const isLoading = useOrganizationStore((state) => state.isLoading);
  // Get error state reactively
  const storeError = useOrganizationStore((state) => state.error);

  // Initialize the form
  const form = useForm<CreateOrganizationFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      visibility: "private", // Default to private
    },
  });

  // Define the submit handler
  const onSubmit = async (values: CreateOrganizationFormValues) => {
    logger.info('[CreateOrganizationForm] Attempting to create organization', values);
    // The createOrganization action in the store already sets loading/error states
    const createdOrg = await createOrganization(values.name, values.visibility);

    if (createdOrg) {
      logger.info('[CreateOrganizationForm] Organization created successfully', { id: createdOrg.id });
      toast.success(`Organization "${createdOrg.name}" created successfully!`);
      form.reset(); // Clear form fields
      closeCreateModal(); // Close the modal on success
    } else {
      // Error handling: The store sets the error state, maybe show a generic toast?
      // Or use form.setError for specific field errors if the API provides them?
      // Use the reactively selected storeError state here
      const currentError = storeError; // Use the value selected by the hook
      logger.error('[CreateOrganizationForm] Failed to create organization', { error: currentError });
      toast.error(currentError || 'Failed to create organization. Please try again.');
      // Example of setting a form error if API indicated name conflict:
      // form.setError("name", { type: "manual", message: "An organization with this name already exists." });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Inc." {...field} />
              </FormControl>
              <FormDescription>
                This is the name of your new organization.
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
                      Private (Invite only)
                    </FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="public" />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Public (Visible to others, requires join request)
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Form Footer with Buttons */}
        <div className="flex justify-end space-x-2 pt-4">
             <Button 
                type="button" 
                variant="outline" 
                onClick={closeCreateModal} 
                disabled={isLoading}
             >
                Cancel
            </Button>
             <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Organization"}
            </Button>
        </div>
      </form>
    </Form>
  );
};

export default CreateOrganizationForm; 