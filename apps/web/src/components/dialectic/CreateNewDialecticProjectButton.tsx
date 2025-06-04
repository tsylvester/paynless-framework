import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ButtonProps } from '@/components/ui/button';

interface CreateNewDialecticProjectButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  children?: React.ReactNode;
}

export const CreateNewDialecticProjectButton: React.FC<CreateNewDialecticProjectButtonProps> = ({
  children = 'Create New Project',
  ...props
}) => {
  const navigate = useNavigate();

  const handleCreateNew = () => {
    navigate('/dialectic/new'); // Or your actual new project route
  };

  return (
    <Button onClick={handleCreateNew} {...props}>
      {children}
    </Button>
  );
}; 