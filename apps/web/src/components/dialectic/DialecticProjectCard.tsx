import React from 'react';
import { DialecticProject } from '@paynless/types'; // Assuming types are available
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, FileUp } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDialecticStore } from '@paynless/store'; // Added store import
import { ViewProjectButton } from './ViewProjectButton'; // Import the new button
import { ExportProjectButton } from './ExportProjectButton';

interface DialecticProjectCardProps {
  project: DialecticProject & { // Assume these fields will be added to DialecticProject type
    user_first_name?: string | null;
    user_last_name?: string | null;
    user_email?: string | null;
  };
}

export const DialecticProjectCard: React.FC<DialecticProjectCardProps> = ({ project }) => {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const deleteDialecticProject = useDialecticStore((state) => state.deleteDialecticProject);
  const cloneDialecticProject = useDialecticStore((state) => state.cloneDialecticProject);
  const fetchDialecticProjects = useDialecticStore((state) => state.fetchDialecticProjects);

  let creatorName = project.user_id; // Default to user_id

  if (project.user_first_name && project.user_last_name) {
    creatorName = `${project.user_first_name} ${project.user_last_name}`;
  } else if (project.user_first_name) {
    creatorName = project.user_first_name;
  } else if (project.user_last_name) {
    creatorName = project.user_last_name;
  } else if (project.user_email) {
    creatorName = project.user_email;
  }

  const handleDelete = async () => {
    if (deleteDialecticProject) {
      await deleteDialecticProject(project.id);
      setShowDeleteDialog(false);
      // Optionally, re-fetch projects or rely on optimistic updates
      if (fetchDialecticProjects) fetchDialecticProjects();
    } else {
      console.error("deleteDialecticProject action is not available in the store.");
      setShowDeleteDialog(false);
    }
  };

  const handleClone = async () => {
    if (cloneDialecticProject) {
      await cloneDialecticProject(project.id);
      // Optionally, navigate to the new project or refresh the list
      if (fetchDialecticProjects) fetchDialecticProjects();
    } else {
      console.error("cloneDialecticProject action is not available in the store.");
    }
  };

  const formattedDate = new Date(project.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-grow">
              <CardTitle className="hover:text-primary transition-colors mb-1">
                <ViewProjectButton 
                  projectId={project.id} 
                  projectName={project.project_name || project.id}
                  variant="link"
                  className="p-0 h-auto font-semibold text-lg"
                >
                  {project.project_name || project.id}
                </ViewProjectButton>
              </CardTitle>
              <CardDescription>
                Created: {formattedDate}
              </CardDescription>
              <CardDescription>
                By: {creatorName}
              </CardDescription>
              {project.dialectic_domains && project.dialectic_domains.name && (
                <Badge variant="outline" className="mt-2">{project.dialectic_domains.name}</Badge>
              )}
            </div>

          </div>
        </CardHeader>
        <CardContent className="flex-grow">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {project.initial_user_prompt}
          </p>
            <div className="flex items-center space-x-1">
              <ExportProjectButton projectId={project.id} variant="ghost" size="icon">
                <span className="sr-only">Export project</span>
                <FileUp className="h-5 w-5" />
              </ExportProjectButton>
              <Button variant="ghost" size="icon" aria-label="Clone project" onClick={handleClone}>
                <Copy className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete project" onClick={() => setShowDeleteDialog(true)} className="text-destructive hover:text-destructive/90">
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>        </CardContent>
        <CardFooter className="mt-auto">
          <ViewProjectButton 
            projectId={project.id} 
            projectName={project.project_name || 'View Project'}
            variant="outline" 
            className="w-full"
          >
            View Project
          </ViewProjectButton>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project
              "{project.project_name || project.id}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}; 