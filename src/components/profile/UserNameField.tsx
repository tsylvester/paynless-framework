import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../utils/logger';
import ProfileField from './ProfileField';

interface UserNameFieldProps {
  userName: string | null;
  onUpdate: (newUserName: string) => void;
}

const UserNameField: React.FC<UserNameFieldProps> = ({ userName, onUpdate }) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState(userName || '');

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewUserName(userName || '');
    setError(null);
  };

  const handleChange = (value: string) => {
    setNewUserName(value);
    setError(null);
  };

  const validateUserName = (value: string): string | null => {
    if (!value.trim()) return 'Username cannot be empty';
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (value.length > 30) return 'Username must be less than 30 characters';
    return null;
  };

  const handleSave = async (): Promise<void> => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    const validationError = validateUserName(newUserName);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ user_name: newUserName, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        logger.error('Error updating username:', updateError);
        setError(updateError.message);
        return;
      }

      logger.info('Username updated successfully');
      onUpdate(newUserName);
      setIsEditing(false);
    } catch (err) {
      logger.error('Unexpected error updating username:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProfileField
      label="Username"
      value={userName}
      isEditing={isEditing}
      isLoading={isLoading}
      error={error}
      onEdit={handleEdit}
      onCancel={handleCancel}
      onChange={handleChange}
      onSave={handleSave}
      placeholder="Set a username"
      validation={validateUserName}
    />
  );
};

export default UserNameField;