import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateDialecticProjectForm } from '@/components/dialectic/CreateDialecticProjectForm';

export const CreateDialecticProjectPage: React.FC = () => {
  const navigate = useNavigate();

  const handleProjectCreated = (projectId: string, projectName?: string) => {
    console.log(`Project created from page: ${projectName} (ID: ${projectId}). Navigating...`);
    navigate(`/dialectic/${projectId}`);
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 min-h-screen flex flex-col items-center justify-center">
      {/* 
        The CreateDialecticProjectForm has its own Card and max-width (defaulting to max-w-3xl).
        This outer div provides the general page padding and flex centering.
        If the form component's containerClassName needs to be different for the page context,
        it can be overridden here. For now, the default max-w-3xl from the form component is likely fine.
      */}
      <CreateDialecticProjectForm 
        onProjectCreated={handleProjectCreated} 
        // enableDomainSelection is true by default in the form component
        // submitButtonText is 'Create Project' by default
        // The form itself has a max-w-3xl, so it won't expand beyond that.
        // We can add w-full here if we want the card to take the full width up to its own max-width.
        containerClassName="w-full max-w-3xl" // Ensure it takes available width up to its max
      />
    </div>
  );
}; 