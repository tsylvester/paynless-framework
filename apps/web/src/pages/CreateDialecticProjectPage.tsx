import React from 'react';
import { CreateDialecticProjectForm } from '@/components/dialectic/CreateDialecticProjectForm';

export const CreateDialecticProjectPage: React.FC = () => {
  return (
    <div className="container mx-auto py-8 px-4 md:px-6 min-h-screen flex flex-col items-center justify-center">
      {/* 
        The CreateDialecticProjectForm has its own Card and max-width (defaulting to max-w-3xl).
        This outer div provides the general page padding and flex centering.
        If the form component's containerClassName needs to be different for the page context,
        it can be overridden here. For now, the default max-w-3xl from the form component is likely fine.
      */}
      <CreateDialecticProjectForm 
        containerClassName="w-full max-w-3xl"
      />
    </div>
  );
}; 