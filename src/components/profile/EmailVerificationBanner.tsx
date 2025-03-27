import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { logger } from '../../utils/logger';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface EmailVerificationBannerProps {
  email: string;
  isVerified: boolean;
}

const EmailVerificationBanner: React.FC<EmailVerificationBannerProps> = ({ email, isVerified }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (isVerified) {
    return (
      <div className="flex items-center bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
        <CheckCircle size={18} className="mr-2" />
        <span>Your email is verified.</span>
      </div>
    );
  }

  const handleResendVerification = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        logger.error('Error sending verification email:', error);
        setError(error.message);
        return;
      }

      setSuccess(true);
      logger.info('Verification email sent successfully');
    } catch (err) {
      logger.error('Unexpected error sending verification email:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-md">
      <div className="flex items-start">
        <AlertTriangle size={18} className="mr-2 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Your email address is not verified</p>
          <p className="text-sm mt-1">
            Please check your inbox for a verification email or click below to resend it.
          </p>
          
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          {success && (
            <p className="text-green-600 text-sm mt-2">
              Verification email sent successfully! Please check your inbox.
            </p>
          )}
          
          <button
            onClick={handleResendVerification}
            disabled={isLoading || success}
            className="mt-2 inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-3 h-3 mr-2 border-t-2 border-b-2 border-amber-700 rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              'Resend Verification Email'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationBanner;