// import React from 'react'; // REMOVED
// import { Container, Typography } from '@mui/material'; // REMOVED - Unused
import { LoginForm } from '../components/auth/LoginForm'; // CORRECTED: Use named import
import { Layout } from '../components/layout/Layout';

export function LoginPage() {
  return (
    <Layout>
      <div className="flex justify-center py-12">
        <LoginForm />
      </div>
    </Layout>
  );
}