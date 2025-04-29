// import React from 'react'; // REMOVED
// import { Container, Typography } from '@mui/material'; // REMOVED - Unused
import { RegisterForm } from '../components/auth/RegisterForm';

export function RegisterPage() {
  return (
    <div>
      <div className="flex justify-center py-12">
        <RegisterForm />
      </div>
    </div>
  );
}