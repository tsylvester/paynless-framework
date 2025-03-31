import React from 'react';
import { Layout } from '../components/layout/Layout';
import { LoginForm } from '../components/auth/LoginForm';

export function LoginPage() {
  return (
    <Layout>
      <div className="flex justify-center py-12">
        <LoginForm />
      </div>
    </Layout>
  );
}