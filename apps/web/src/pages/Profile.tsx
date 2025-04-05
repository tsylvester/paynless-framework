import { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { Layout } from '../components/layout/Layout';
import { Container, Typography, TextField, Button, Box, CircularProgress, Alert } from '@mui/material';
import { logger } from '@paynless/utils';
import { UserProfileUpdate } from '@paynless/types';
import { useAuthStore } from '@paynless/store';

export function ProfilePage() {
  const {
    profile: currentProfile, 
    isLoading: authLoading, 
    error: authError, 
    updateProfile
  } = useAuthStore(state => ({
    profile: state.profile,
    isLoading: state.isLoading,
    error: state.error,
    updateProfile: state.updateProfile
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UserProfileUpdate>({
    defaultValues: {
      first_name: '',
      last_name: ''
    }
  });

  useEffect(() => {
    if (currentProfile) {
      reset({
        first_name: currentProfile.first_name || '',
        last_name: currentProfile.last_name || ''
      });
    }
  }, [currentProfile, reset]);

  const onSubmit: SubmitHandler<UserProfileUpdate> = async (data) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    logger.info('Updating profile with data:', data);

    try {
      const success = await updateProfile(data);

      if (success) {
        setSubmitSuccess(true);
        logger.info('Profile update successful via store action');
      } else {
        setSubmitError(authError?.message || 'Failed to update profile.');
        logger.error('Profile update failed via store action', { storeError: authError });
      }
    } catch (e) {
      logger.error('Unexpected error during profile update submission', { error: e });
      setSubmitError('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading && !currentProfile) {
    return <Layout><CircularProgress /></Layout>;
  }

  if (!currentProfile) {
    return <Layout><Alert severity="warning">Could not load profile data.</Alert></Layout>;
  }

  return (
    <Layout>
      <Container maxWidth="sm">
        <Typography variant="h4" gutterBottom>Edit Profile</Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            fullWidth
            id="first_name"
            label="First Name"
            {...register('first_name')}
            error={!!errors.first_name}
            helperText={errors.first_name?.message}
            disabled={isSubmitting}
          />
          <TextField
            margin="normal"
            fullWidth
            id="last_name"
            label="Last Name"
            {...register('last_name')}
            error={!!errors.last_name}
            helperText={errors.last_name?.message}
            disabled={isSubmitting}
          />
          
          {submitSuccess && <Alert severity="success" sx={{ mt: 2 }}>Profile updated successfully!</Alert>}
          {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
          {authError && !submitError && <Alert severity="warning" sx={{ mt: 2 }}>Store Error: {authError.message}</Alert>} 

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={isSubmitting || authLoading}
          >
            {isSubmitting ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </Box>
      </Container>
    </Layout>
  );
}