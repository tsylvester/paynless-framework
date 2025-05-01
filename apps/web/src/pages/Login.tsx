// import React from 'react'; // REMOVED
// import { Container, Typography } from '@mui/material'; // REMOVED - Unused
import { LoginForm } from '../components/auth/LoginForm'; // CORRECTED: Use named import

export function LoginPage() {
  return (
    <div>
      <div className="flex justify-center py-12">
        <LoginForm />
      </div>
    </div>
  );
}