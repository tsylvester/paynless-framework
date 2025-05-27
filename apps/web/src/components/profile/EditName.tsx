import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

export function EditName() {
  const {
    profile,
    updateProfile,
    isLoading: storeIsLoading,
    error: storeError,
  } = useAuthStore((state) => ({
    profile: state.profile,
    updateProfile: state.updateProfile,
    isLoading: state.isLoading,
    error: state.error,
  }));

  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoading = storeIsLoading || isSubmitting;

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !profile) return;

    const originalFirstName = profile.first_name || '';
    const originalLastName = profile.last_name || '';

    if (firstName === originalFirstName && lastName === originalLastName) {
      return;
    }

    setIsSubmitting(true);

    const result = await updateProfile({ first_name: firstName, last_name: lastName });

    if (result) {
      toast.success('Name updated successfully!');
    } else {
      toast.error('Failed to update name. An unexpected error occurred.');
    }
    setIsSubmitting(false);
  };

  if (!profile && storeIsLoading) {
    return (
      <Card className="w-full max-w-lg mx-auto mb-8">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-textPrimary mb-6">Edit Name</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading profile data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-textPrimary">Edit Name</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-600">
            Profile data not available.
            {storeError && <p>{storeError.message}</p>}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasChanged = (profile.first_name || '') !== firstName || (profile.last_name || '') !== lastName;

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-textPrimary">Edit Name</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {storeError && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{storeError.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="mb-4">
            <Label
              htmlFor="firstName"
              className="block text-sm font-medium text-textSecondary mb-1"
            >
              First Name
            </Label>
            <Input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="block w-full"
              placeholder="Enter first name"
              disabled={isLoading}
            />
          </div>

          <div className="mb-6">
            <Label
              htmlFor="lastName"
              className="block text-sm font-medium text-textSecondary mb-1"
            >
              Last Name
            </Label>
            <Input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="block w-full"
              placeholder="Enter last name"
              disabled={isLoading}
            />
          </div>
          <CardFooter className="px-0 py-0">
            <Button
              type="submit"
              disabled={isLoading || !hasChanged}
              className="w-full flex justify-center py-2 px-4 text-sm font-medium"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
} 