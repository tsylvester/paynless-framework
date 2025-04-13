import { Layout } from '../components/layout/Layout';
import { ArrowRight, Database, Lock, Server, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, useAiStore } from '@paynless/store';
import { useState, useEffect, useCallback } from 'react';
import { logger } from '@paynless/utils';
import { ModelSelector } from '../components/ai/ModelSelector';
import { PromptSelector } from '../components/ai/PromptSelector';
import { AiChatbox } from '../components/ai/AiChatbox';

export function HomePage() {
  const { user, session } = useAuthStore();
  const navigate = useNavigate();

  const { loadAiConfig, sendMessage, startNewChat, setAnonymousCount } = useAiStore();
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  // TODO: Implement stashed message logic for post-registration sending (Phase 4)
  // Prefix with underscore to silence TS6133 until implemented
  const [_stashedMessage, _setStashedMessage] = useState<{ message: string; providerId: string; promptId: string; } | null>(null);

  useEffect(() => {
    loadAiConfig();
    startNewChat();
    setAnonymousCount(0);
  }, [loadAiConfig, startNewChat, setAnonymousCount]);

  useEffect(() => {
    if (user && session) {
      const pendingMessageJson = sessionStorage.getItem('pendingChatMessage');
      if (pendingMessageJson) {
        logger.info('[HomePage] Found stashed message, attempting to send...');
        try {
          const pendingMessage = JSON.parse(pendingMessageJson);
          sessionStorage.removeItem('pendingChatMessage');
          sendMessage({
            message: pendingMessage.message,
            providerId: pendingMessage.providerId,
            promptId: pendingMessage.promptId,
            isAnonymous: false,
          });
        } catch (error) {
          logger.error('[HomePage] Failed to parse or send stashed message:', { error: String(error) });
          sessionStorage.removeItem('pendingChatMessage');
        }
      }
    }
  }, [user, session, sendMessage]);

  const handleLimitReached = useCallback(() => {
    const pendingMessageJson = sessionStorage.getItem('pendingChatMessage');
    if (pendingMessageJson) {
        setShowLimitDialog(true);
    } else {
        logger.error('[HomePage] onLimitReached called but no pending message found in sessionStorage.');
    }
  }, []);

  const handleRegisterRedirect = () => {
    setShowLimitDialog(false);
    navigate('/register');
  };

  const handleCloseDialog = () => {
    setShowLimitDialog(false);
    sessionStorage.removeItem('pendingChatMessage'); 
    logger.info('[HomePage] User cancelled registration, cleared stashed message.');
  };
  
  return (
    <Layout>
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-textPrimary tracking-tight sm:text-5xl md:text-6xl">
            <span className="block">Welcome to the</span>
            <span className="block text-primary">Paynless Framework</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-textSecondary sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Get your app up and running in seconds without burning a single token. 
            <br/><br/> 
            A production-ready Web, iOS, Android, and Desktop app foundation. 
            <br/> <br/>
            <Link to="https://pnpm.io/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pnpm</Link> API monorepo using <Link to="https://react.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">React</Link>, <Link to="https://vitejs.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Vite</Link>, <Link to="https://supabase.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Supabase</Link>, and <Link to="https://stripe.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe</Link>.
            <br/> <br/>
            Built with <Link to="https://bolt.new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">bolt.new</Link>, <Link to="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">lovable.dev</Link>, <Link to="https://openai.com/chatgpt/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ChatGPT</Link>, <Link to="https://claude.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Claude</Link>, <Link to="https://gemini.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gemini</Link>, and <Link to="https://cursor.sh/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cursor</Link>. 
            <br/> <br/>
            Unit and integration tested with <Link to="https://deno.land/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Deno</Link> and <Link to="https://vitest.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Vitest</Link>. 
            <br/> <br/>
            This website is the web app you'll be building with.
          </p>
          <div className="my-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-primary/90 md:py-4 md:text-lg md:px-10"
              >
                Go to Dashboard
                <ArrowRight className="ml-2" size={20} />
              </Link>
            ) : (
              <>
                <div className="rounded-md shadow">
                  <Link
                    to="/register"
                    className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-primary/90 md:py-4 md:text-lg md:px-10"
                  >
                    Get Started
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* AI Chat Section */}
        <div className="my-12 max-w-4xl mx-auto bg-background p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-center text-textPrimary mb-6">Try Paynless AI</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ModelSelector 
              selectedProviderId={selectedProviderId}
              onProviderChange={setSelectedProviderId}
            />
            <PromptSelector 
              selectedPromptId={selectedPromptId}
              onPromptChange={setSelectedPromptId}
            />
          </div>
          <AiChatbox 
            providerId={selectedProviderId}
            promptId={selectedPromptId}
            isAnonymous={true}
            onLimitReached={handleLimitReached}
          />
          <p className="text-xs text-center text-muted-foreground mt-2">
            Anonymous users are limited to {useAiStore.getState().anonymousMessageLimit} messages. Sign up for unlimited access.
          </p>
        </div>
        
        {/* Features section */}
        <div className="py-12 bg-surface">
          <div className="max-w-xl mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
            <h2 className="sr-only">Our features</h2>
            <dl className="space-y-10 lg:space-y-0 lg:grid lg:gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Server className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-textPrimary">Multi-Platform API</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-textSecondary">
                  Built to deploy on
                  <ul className="list-disc list-inside">
                  <li>Web</li>
                  <li>iOS</li>
                  <li>Android</li>
                  <li>Desktop</li>
                  </ul>
                </dd>
              </div>
              
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Database className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-textPrimary">Supabase Backend</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-textSecondary">
                  Powered by Supabase for database, authentication, storage, and edge functions
                  with PostgreSQL under the hood.
                </dd>
              </div>
              
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Lock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-textPrimary">Secure Authentication</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-textSecondary">
                  Industry-standard JWT-based authentication with proper security measures and
                  user management system.
                </dd>
              </div>

              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M10.05 4.95A8.99 8.99 0 0 0 3.5 11.56 9 9 0 0 0 12 21a9 9 0 0 0 8.5-7.46 8.99 8.99 0 0 0-6.55-6.59Z"/><path d="M13.95 4.95A8.99 8.99 0 0 1 20.5 11.56 9 9 0 0 1 12 21a9 9 0 0 1-8.5-7.46 8.99 8.99 0 0 1 6.55-6.59Z"/><path d="M5.85 5.85A9.01 9.01 0 0 0 12 3a9.01 9.01 0 0 0 6.15 2.85"/><path d="M18.15 5.85A9.01 9.01 0 0 1 12 3a9.01 9.01 0 0 1-6.15 2.85"/><circle cx="12" cy="12" r="2"/></svg>
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-textPrimary">Stripe Integration</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-textSecondary">
                  Pre-configured Stripe integration for subscription plans, checkout, billing portal,
                  and webhook handling.
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Problem Section */}
        <div className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-textPrimary">Stop Painfully Reinventing the Wheel</h2>
            <p className="mt-4 text-lg text-textSecondary">
              You'll burn more tokens wiring up boilerplate than you'll spend on the Paynless Framework. 
              <br/><br/>              
              User authentication, state and session management,database connections, subscription billing, and a multi-platform API structure takes days even if you know what you're doing. 
              <br/><br/>
              Build your features instead of wasting time and money setting up the basics.
            </p>
          </div>
        </div>

        {/* Solution Section */}
        <div className="py-16 bg-surface">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-textPrimary">The Paynless Framework Launches Instantly</h2>
            <p className="mt-4 text-lg text-textSecondary">
              A production-ready foundation with everything pre-configured. Get secure Supabase authentication, PostgreSQL database, Stripe subscriptions, and a robust API structure out-of-the-box. Focus on your unique application logic from minute one.
            </p>
             <ul className="mt-6 text-left inline-block space-y-2 text-textSecondary">
                <li className="flex items-start">
                    <CheckCircle className="flex-shrink-0 h-6 w-6 text-green-500 mr-2" />
                    <span>Save millions of tokens trying to set up and test auth, DB, and billing integration.</span>
                </li>
                <li className="flex items-start">
                    <CheckCircle className="flex-shrink-0 h-6 w-6 text-green-500 mr-2" />
                    <span>Build scalable apps with a clean API-first monorepo architecture.</span>
                </li>
                 <li className="flex items-start">
                    <CheckCircle className="flex-shrink-0 h-6 w-6 text-green-500 mr-2" />
                    <span>Deploy seamlessly to Web, iOS, Android, and Desktop from one codebase.</span>
                </li>
            </ul>
          </div>
        </div>

        {/* Who Is This For? Section */}
        <div className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-textPrimary">Perfect For...</h2>
            <p className="mt-4 text-lg text-textSecondary">
              Vibe coders, SaaS startups, indie hackers, and development teams who want to ship faster without compromising on quality or security. If you're building a modern application with React, Supabase, and Stripe, this framework is designed for you.
            </p>
          </div>
        </div>

        {/* Final CTA Section */}
        <div className="py-16 bg-primary">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-white">Ready to Build Paynless-ly?</h2>
            <p className="mt-4 text-lg text-indigo-100">
              Fork the repository, follow the setup guide, and start building your next big idea today.
            </p>
            <div className="mt-8 flex justify-center">
               <div className="rounded-md shadow">
                 <Link
                   to="https://github.com/tsylvester/paynless-framework"
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-primary bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                 >
                   Fork on GitHub
                 </Link>
               </div>
               <div className="ml-3 rounded-md shadow">
                 <Link
                   to="/dashboard"
                   className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-dark hover:bg-primary-darker md:py-4 md:text-lg md:px-10"
                 >
                   View Setup Guide
                 </Link>
               </div>
            </div>
          </div>
        </div>

      </div>

      {showLimitDialog && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="card bg-[rgb(var(--color-surface))] p-6 rounded-lg shadow-lg max-w-md w-full z-50 border border-[rgb(var(--color-border))] "> 
            <h3 className="text-lg font-semibold mb-2 text-textPrimary">Message Limit Reached</h3>
            <p className="text-sm text-textSecondary mb-4">
              You've reached the message limit for anonymous users. Please register or sign in to continue chatting.
              Your message will be sent automatically after you sign up.
            </p>
            <div className="flex justify-end space-x-2">
              <button 
                onClick={handleCloseDialog} 
                className="btn-secondary inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 border border-[rgb(var(--color-border))] bg-transparent text-textSecondary hover:bg-[rgb(var(--color-surface))]"
              >
                Cancel
              </button>
              <button 
                onClick={handleRegisterRedirect} 
                className="btn-primary inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}