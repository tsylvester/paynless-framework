import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../utils/logger';
import ProfileField from './ProfileField';

interface EmailFieldProps {
  email: string;
  onUpdate: (newEmail: string) => void;
}

const EmailField: React.FC<EmailFieldProps> = ({ email, onUpdate }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState(email || '');

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewEmail(email);
    setError(null);
  };

  const handleChange = (value: string) => {
    setNewEmail(value);
    setError(null);
  };

  const validateEmail = (value: string): string | null => {
    if (!value.trim()) return 'Email cannot be empty';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Please enter a valid email address';
    
    return null;
  };

  const handleSave = async (): Promise<void> => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    const validationError = validateEmail(newEmail);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newEmail === email) {
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use Supabase's built-in function to update email
      // This will automatically handle verification
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (updateError) {
        logger.error('Error updating email:', updateError);
        setError(updateError.message);
        return;
      }

      logger.info('Email update initiated, verification required');
      onUpdate(newEmail);
      setIsEditing(false);
    } catch (err) {
      logger.error('Unexpected error updating email:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProfileField
      label="Email Address"
      value={email}
      isEditing={isEditing}
      isLoading={isLoading}
      error={error}
      onEdit={handleEdit}
      onCancel={handleCancel}
      onChange={handleChange}
      onSave={handleSave}
      inputType="email"
      placeholder="Enter your email"
      validation={validateEmail}
    />
  );
};

export default EmailField;