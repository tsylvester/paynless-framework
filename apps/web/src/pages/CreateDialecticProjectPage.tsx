import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useDialecticStore } from '@paynless/store';
import {
  selectIsCreatingProject,
  selectCreateProjectError,
  selectSelectedDomainTag,
} from '@paynless/store';
import type { CreateProjectPayload } from '@paynless/types';
import { DomainSelector } from '@/components/dialectic/DomainSelector';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const createProjectSchema = z.object({
  projectName: z.string().min(3, 'Project name must be at least 3 characters').max(100),
  initialUserPrompt: z.string().min(10, 'Initial prompt must be at least 10 characters').max(5000),
});

type CreateProjectFormValues = z.infer<typeof createProjectSchema>;

export const CreateDialecticProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const createDialecticProject = useDialecticStore((state) => state.createDialecticProject);
  const isCreating = useDialecticStore(selectIsCreatingProject);
  const creationError = useDialecticStore(selectCreateProjectError);
  const selectedDomainTag = useDialecticStore(selectSelectedDomainTag);
  const resetCreateProjectError = useDialecticStore((state) => state.resetCreateProjectError);

  const {
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<CreateProjectFormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      projectName: '',
      initialUserPrompt: '',
    },
  });

  useEffect(() => {
    if (creationError) {
        resetCreateProjectError();
    }
    return () => {
        if (creationError) {
            resetCreateProjectError();
        }
    }
  }, [resetCreateProjectError]);

  const onSubmit = async (data: CreateProjectFormValues) => {
    if (creationError) {
        resetCreateProjectError();
    }
    const payload: CreateProjectPayload = {
      ...data,
      selectedDomainTag: selectedDomainTag,
    };
    
    const result = await createDialecticProject(payload);

    if (result.success && result.data) {
      navigate(`/dialectic/${result.data.id}`);
    } else if (result.error) {
        console.error("Project creation failed:", result.error);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create New Dialectic Project</CardTitle>
          <CardDescription>
            Define the initial parameters for your new dialectic exploration.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {creationError && (
              <Alert variant="destructive">
                <AlertTitle>Creation Failed</AlertTitle>
                <AlertDescription>{creationError.message}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Controller
                name="projectName"
                control={control}
                render={({ field }) => <Input id="projectName" placeholder="E.g., Q4 Product Strategy" {...field} aria-invalid={!!errors.projectName} />}
              />
              {errors.projectName && <p className="text-sm text-destructive">{errors.projectName.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialUserPrompt">Initial User Prompt / Problem Statement</Label>
              <Controller
                name="initialUserPrompt"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="initialUserPrompt"
                    placeholder="Describe the core problem, question, or topic you want to explore..."
                    {...field}
                    rows={6}
                    aria-invalid={!!errors.initialUserPrompt}
                  />
                )}
              />
              {errors.initialUserPrompt && <p className="text-sm text-destructive">{errors.initialUserPrompt.message}</p>}
            </div>
            
            <Separator />

            <div>
                <h3 className="text-lg font-medium mb-2">Domain Focus (Optional)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Selecting a domain can help tailor the AI's responses and apply specific knowledge overlays.
                </p>
                <DomainSelector />
            </div>

          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isCreating} className="w-full">
              {isCreating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Project...</>
              ) : (
                'Create Project'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}; 