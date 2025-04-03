// src/pages/SubscriptionSuccess.tsx
import { useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import { useSubscription } from '../context/subscription.context';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export function SubscriptionSuccessPage() {
  const user = useAuthStore((state) => state.user);
  const { refreshSubscription } = useSubscription();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Refresh subscription data when the component mounts
    if (user) {
      refreshSubscription();
    }
    
    // Redirect to dashboard after 5 seconds
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [user, refreshSubscription, navigate]);
  
  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-16 px-4 sm:py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="flex justify-center">
            <CheckCircle className="h-20 w-20 text-green-500" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
            Thank you for your subscription!
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Your subscription has been processed successfully. You now have access to all the premium features.
          </p>
          <div className="mt-8">
            <p className="text-sm text-gray-500">
              You will be redirected to the dashboard in a few seconds. If you're not redirected, please{' '}
              <button 
                onClick={() => navigate('/dashboard')}
                className="text-indigo-600 hover:text-indigo-500"
              >
                click here
              </button>.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
