import React from 'react';
import { Layout } from '../components/layout/Layout';
import { RegisterForm } from '../components/auth/RegisterForm';

export function RegisterPage() {
  return (
    <Layout>
      <div className="flex justify-center py-12">
        <RegisterForm />
      </div>
    </Layout>
  );
}