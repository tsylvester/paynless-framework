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

export function EditEmail() {
  const {
    user,
    profile,
    updateEmail,
    isLoading: storeIsLoading,
    error: storeError,
  } = useAuthStore((state) => ({
    user: state.user,
    profile: state.profile,
    updateEmail: state.updateEmail,
    isLoading: state.isLoading,
    error: state.error,
  }));

  const [email, setEmail] = useState(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const originalEmailFromAuth = user?.email || '';

  const isLoading = storeIsLoading || isSubmitting;

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !user) return;

    if (email === originalEmailFromAuth) {
      return;
    }
    
    setIsSubmitting(true);
    const result = await updateEmail({ email });

    if (result) {
      toast.success('Email update request sent! Check your inbox for verification.');
    } else {
      toast.error('Failed to update email. An unexpected error occurred.');
    }
    setIsSubmitting(false);
  };

  if (!user && storeIsLoading) {
    return (
      <Card className="w-full max-w-lg mx-auto mb-8">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-textPrimary mb-6">Edit Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6 text-center">
          <p>Loading email settings...</p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-textPrimary">Edit Email</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-600">
            User data not available. Cannot edit email.
            {storeError && <p>{storeError.message}</p>}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasChanged = email !== originalEmailFromAuth;

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-textPrimary mb-6">Edit Email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {storeError && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{storeError.message}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="block text-sm font-medium text-textSecondary mb-1">Email Address</Label>
            <Input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="block w-full"
              placeholder="your.email@example.com"
              disabled={isLoading}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Changing your email requires re-verification.
            </p>
          </div>
          <CardFooter className="px-0 py-0 mt-2">
            <Button 
              type="submit" 
              disabled={isLoading || !hasChanged}
              className="w-full flex justify-center py-2 px-4 text-sm font-medium"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
} 