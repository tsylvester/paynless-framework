import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { useOrganizationStore } from '@paynless/store';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Terminal, Loader2 } from 'lucide-react'; // Icons for alert and loading

export const OrganizationListPage: React.FC = () => {
  const {
    userOrganizations,
    isLoading,
    error,
    fetchUserOrganizations,
  } = useOrganizationStore((state) => ({
    userOrganizations: state.userOrganizations,
    isLoading: state.isLoading,
    error: state.error,
    fetchUserOrganizations: state.fetchUserOrganizations,
  }));

  useEffect(() => {
    // Fetch organizations when the component mounts
    fetchUserOrganizations();
  }, [fetchUserOrganizations]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading organizations...</span>
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    if (userOrganizations.length === 0) {
      return (
        <div className="text-center py-10">
          <p className="mb-4 text-muted-foreground">You are not a member of any organizations yet.</p>
          <Button asChild>
            <Link to="/dashboard/organizations/new">Create New Organization</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userOrganizations.map((org) => (
          <Card key={org.id}>
            <CardHeader>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>Visibility: {org.visibility}</CardDescription>
            </CardHeader>
            {/* <CardContent>
              <p>Content placeholder if needed</p>
            </CardContent> */}
            <CardFooter>
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/organizations/${org.id}`}>Manage</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Your Organizations</h1>
          {userOrganizations.length > 0 && (
             <Button asChild>
               <Link to="/dashboard/organizations/new">Create New Organization</Link>
            </Button>
          )}
        </div>
        {renderContent()}
      </div>
    </Layout>
  );
}; 