import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrganizationStore } from '@paynless/store'; // Import the specific store hook
import { toast } from 'sonner';

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  // Use the specific store hook
  const acceptOrganizationInvite = useOrganizationStore(s => s.acceptOrganizationInvite);
  const isLoading = useOrganizationStore(s => s.isLoading);

  useEffect(() => {
    const handleAccept = async () => {
      if (!token) {
        toast.error('Invalid invite link.');
        navigate('/');
        return;
      }
      try {
        // The store action likely returns boolean or throws error on failure
        const success = await acceptOrganizationInvite(token);
        if (success) {
          toast.success('Invite accepted! Welcome to the organization.');
          // TODO: Navigate to the specific organization's page?
          // Need orgId from the API response or store update.
          navigate('/dashboard'); // Navigate to dashboard for now
        } else {
          // If the store action returns false or doesn't throw, handle it here.
          // Often, the action itself might show a toast on failure.
          toast.error('Failed to accept invite. Please try again or contact support.');
          navigate('/'); // Navigate away on failure
        }
      } catch (error) {
        // Catch errors thrown by the API client/store action
        console.error('Failed to accept invite:', error);
        // Toast might already be shown by API client/store error handling
        // toast.error('An unexpected error occurred while accepting the invite.');
        navigate('/');
      }
    };

    handleAccept();
    // Ensure isLoading is included in dependency array if its change should re-trigger logic, though likely not needed here.
  }, [token, acceptOrganizationInvite, navigate]);

  return (
    <div className="flex justify-center items-center h-screen">
      {isLoading ? (
        <p>Accepting invite...</p>
      ) : (
        <p>Redirecting...</p> // Show redirecting even if there was an error before navigation
      )}
    </div>
  );
}; 