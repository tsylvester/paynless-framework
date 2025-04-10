// import React from 'react'; // REMOVED
// import { Container, Typography } from '@mui/material'; // REMOVED - Unused
import { RegisterForm } from '../components/auth/RegisterForm';
import { Layout } from '../components/layout/Layout';

export function RegisterPage() {
  return (
    <Layout>
      <div className="flex justify-center py-12">
        <RegisterForm />
      </div>
    </Layout>
  );
}