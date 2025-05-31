import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox'; // Assuming you have a Checkbox component
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

import { useDialecticStore } from '@paynless/store';
import type { AIModelCatalogEntry, StartSessionPayload } from '@paynless/types';

const startSessionSchema = z.object({
  sessionDescription: z.string().min(1, 'Session description is required').max(255),
  selectedModelIds: z.array(z.string()).min(1, 'At least one AI model must be selected'),
});

type StartSessionFormValues = z.infer<typeof startSessionSchema>;

interface StartDialecticSessionModalProps {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSessionStarted: (sessionId: string) => void; // Callback when session is successfully started
}

export const StartDialecticSessionModal: React.FC<StartDialecticSessionModalProps> = ({
  projectId,
  isOpen,
  onOpenChange,
  onSessionStarted,
}) => {
  const {
    fetchAIModelCatalog,
    modelCatalog,
    isLoadingModelCatalog,
    modelCatalogError,
    startDialecticSession,
    isStartingSession,
    startSessionError,
  } = useDialecticStore((state) => ({
    fetchAIModelCatalog: state.fetchAIModelCatalog,
    modelCatalog: state.modelCatalog,
    isLoadingModelCatalog: state.isLoadingModelCatalog,
    modelCatalogError: state.modelCatalogError,
    startDialecticSession: state.startDialecticSession,
    isStartingSession: state.isStartingSession,
    startSessionError: state.startSessionError,
  }));

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    control,
  } = useForm<StartSessionFormValues>({
    resolver: zodResolver(startSessionSchema),
    defaultValues: {
      sessionDescription: '',
      selectedModelIds: [],
    },
    mode: 'onChange', // Validate on change for better UX
  });

  useEffect(() => {
    if (isOpen && !modelCatalog?.length && !modelCatalogError) {
      fetchAIModelCatalog();
    }
  }, [isOpen, modelCatalog, modelCatalogError, fetchAIModelCatalog]);
  
  // Reset form when modal is closed
  useEffect(() => {
    if (!isOpen) {
      reset(); 
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: StartSessionFormValues) => {
    const payload: StartSessionPayload = {
      projectId,
      sessionDescription: data.sessionDescription,
      selectedModelCatalogIds: data.selectedModelIds,
    };
    const result = await startDialecticSession(payload);
    if (result && !result.error && result.data?.id) {
      onSessionStarted(result.data.id);
      onOpenChange(false); // Close modal on success
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Start New Dialectic Session</DialogTitle>
          <DialogDescription>
            Configure and launch a new session for project ID: {projectId}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sessionDescription" className="text-right">
              Description
            </Label>
            <Input
              id="sessionDescription"
              {...register('sessionDescription')}
              className="col-span-3"
              aria-invalid={errors.sessionDescription ? "true" : "false"}
            />
            {errors.sessionDescription && (
              <p role="alert" className="col-span-4 text-sm text-red-600 pl-[calc(25%+1rem)]">
                {errors.sessionDescription.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">AI Models</Label>
            <div className="col-span-3 grid gap-2">
              {isLoadingModelCatalog && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
              {modelCatalogError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{modelCatalogError.message || 'Failed to load AI models.'}</AlertDescription>
                </Alert>
              )}
              {!isLoadingModelCatalog && !modelCatalogError && modelCatalog && modelCatalog.length > 0 ? (
                <Controller
                  name="selectedModelIds"
                  control={control}
                  render={({ field }) => (
                    <>
                      {modelCatalog.map((model: AIModelCatalogEntry) => (
                        <div key={model.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`model-${model.id}`}
                            checked={field.value?.includes(model.id)}
                            onCheckedChange={(checked) => {
                              const currentSelectedIds = field.value || [];
                              if (checked) {
                                field.onChange([...currentSelectedIds, model.id]);
                              } else {
                                field.onChange(
                                  currentSelectedIds.filter((id) => id !== model.id)
                                );
                              }
                            }}
                          />
                          <Label htmlFor={`model-${model.id}`} className="font-normal">
                            {model.model_name} ({model.provider_name})
                          </Label>
                        </div>
                      ))}
                    </>
                  )}
                />
              ) : null}
              {!isLoadingModelCatalog && !modelCatalogError && (!modelCatalog || modelCatalog.length === 0) && (
                <p className="text-sm text-muted-foreground">No AI models available.</p>
              )}
               {errors.selectedModelIds && (
                <p role="alert" className="text-sm text-red-600">
                  {errors.selectedModelIds.message}
                </p>
              )}
            </div>
          </div>

          {startSessionError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Error Starting Session</AlertTitle>
              <AlertDescription>
                {startSessionError.message || 'An unexpected error occurred.'}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isStartingSession}>
              Cancel
            </Button>
            <Button type="submit" disabled={isStartingSession || !isValid}>
              {isStartingSession && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 
              Start Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}; 