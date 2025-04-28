import React from 'react';
import { Layout } from '@/components/layout/Layout';
import { CreateOrganizationForm } from '@/components/organizations/CreateOrganizationForm';

export const CreateOrganizationPage: React.FC = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Create New Organization</h1>
        <div className="max-w-2xl">
          <CreateOrganizationForm />
        </div>
      </div>
    </Layout>
  );
}; 