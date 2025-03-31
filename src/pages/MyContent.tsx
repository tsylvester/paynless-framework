import React from 'react';
import { Layout } from '../components/layout/Layout';

export function MyContentPage() {
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">My Content</h1>
        <p className="mt-4 text-gray-500">Coming soon! Manage all your content in one place.</p>
      </div>
    </Layout>
  );
}