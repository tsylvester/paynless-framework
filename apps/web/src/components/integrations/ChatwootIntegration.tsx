import { useEffect } from 'react';
import { useAuthStore } from '@paynless/store';
import { logger } from '@paynless/utils';

// Define a minimal interface for the Chatwoot SDK based on usage
interface ChatwootSDK {
  run: (config: { websiteToken: string; baseUrl: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setUser: (userId: string, userInfo: { email?: string; name?: string; [key: string]: any }) => void;
  reset: () => void;
  // Add other methods if needed
}

// Declare the chatwootSDK on the window object using the interface
declare global {
  interface Window {
    chatwootSDK: ChatwootSDK;
  }
}

export function ChatwootIntegration() {
  const { user, profile } = useAuthStore(state => ({ 
    user: state.user,
    profile: state.profile 
  }));

  // Access env vars using bracket notation
  const websiteToken = import.meta.env['VITE_CHATWOOT_WEBSITE_TOKEN'];
  const baseURL = import.meta.env['VITE_CHATWOOT_BASE_URL'];

  // Effect to add the Chatwoot script
  useEffect(() => {
    if (!websiteToken || !baseURL) {
      logger.warn('Chatwoot keys not found in env, skipping Chatwoot initialization.');
      return;
    }

    // Prevent adding script multiple times
    if (document.getElementById('chatwoot-sdk-script')) {
      return;
    }

    logger.info('Adding Chatwoot SDK script...');
    const script = document.createElement('script');
    script.id = 'chatwoot-sdk-script';
    script.src = `${baseURL}/packs/js/sdk.js`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      logger.info('Chatwoot SDK loaded, running config.');
      window.chatwootSDK.run({
        websiteToken: websiteToken,
        baseUrl: baseURL,
      });
    };

    script.onerror = () => {
       logger.error('Failed to load Chatwoot SDK script.');
    };

    document.body.appendChild(script);

    // Cleanup function to remove script if component unmounts (optional)
    return () => {
      const existingScript = document.getElementById('chatwoot-sdk-script');
      if (existingScript && existingScript.parentNode) {
         logger.info('Cleaning up Chatwoot SDK script.');
         existingScript.parentNode.removeChild(existingScript);
         // Also attempt to clean up any Chatwoot widget UI elements
         const widget = document.querySelector('.woot-widget-holder');
         if (widget && widget.parentNode) {
             widget.parentNode.removeChild(widget);
         }
      }
    };
  }, [websiteToken, baseURL]);

  // Effect to identify the user
  useEffect(() => {
    // Ensure SDK is loaded and run before trying to use it
    if (window.chatwootSDK && typeof window.chatwootSDK.setUser === 'function') {
      if (user && profile) {
        logger.info('Chatwoot: Identifying user', { userId: user.id });
        window.chatwootSDK.setUser(user.id, { 
          email: user.email,
          name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || user.email, // Use name from profile or fallback to email
          // Add other relevant user attributes here
          // avatar_url: profile.avatar_url, 
        });
      } else if (!user) {
         // If user logs out (user becomes null), reset Chatwoot identity
         logger.info('Chatwoot: Resetting user identification.');
         if (typeof window.chatwootSDK.reset === 'function') {
             window.chatwootSDK.reset();
         }
      }
    } else {
       // Wait for SDK to load if user is already logged in
       const checkSdkInterval = setInterval(() => {
           if (window.chatwootSDK && typeof window.chatwootSDK.setUser === 'function') {
               clearInterval(checkSdkInterval);
               if (user && profile) {
                  logger.info('Chatwoot: SDK loaded after delay, identifying user', { userId: user.id });
                   window.chatwootSDK.setUser(user.id, { 
                      email: user.email,
                      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || user.email,
                   });
               } else {
                   logger.info('Chatwoot: SDK loaded after delay, but no user logged in.');
                   if (typeof window.chatwootSDK.reset === 'function') {
                       window.chatwootSDK.reset();
                   }
               }
           }
       }, 500); // Check every 500ms

       // Cleanup interval check
       return () => clearInterval(checkSdkInterval);
    }

  }, [user, profile]); // Re-run when user or profile changes

  return null; // This component doesn't render anything itself
}
