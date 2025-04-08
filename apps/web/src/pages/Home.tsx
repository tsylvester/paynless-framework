import { Layout } from '../components/layout/Layout';
import { ArrowRight, Database, Lock, Server, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';

export function HomePage() {
  const { user } = useAuthStore();
  
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
            A production-ready, multi-platform (Web, iOS, Android, desktop) app foundation. 
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
        
        {/* Features section */}
        <div className="py-12 bg-surface">
          <div className="max-w-xl mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
            <h2 className="sr-only">Our features</h2>
            <dl className="space-y-10 lg:space-y-0 lg:grid lg:grid-cols-1 lg:gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <dt>
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Server className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-textPrimary">Multi-Platform API</p>
                </dt>
                <dd className="mt-2 ml-16 text-base text-textSecondary">
                  Designed for multi-platform deployment.
                  <ul>
                  <li>- Web</li>
                  <li>- iOS</li>
                  <li>- Android</li>
                  <li>- Desktop</li>
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
                  Powered by Supabase for database, authentication, storage, and real-time functionality
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
            <h2 className="text-3xl font-extrabold text-textPrimary">Stop Reinventing the Wheel (Painfully)</h2>
            <p className="mt-4 text-lg text-textSecondary">
              You'd burn more in tokens wiring up boilerplate than you'll spend on the Paynless Framework. 
              <br/><br/>              
              Reliable user authentication, database connections, subscription billing, and a multi-platform API structure takes days even if you know what you're doing. 
              <br/><br/>
              Building your core features instead of wasting time and money getting stalled setting up the basics.
            </p>
          </div>
        </div>

        {/* Solution Section */}
        <div className="py-16 bg-surface">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-extrabold text-textPrimary">The Paynless Solution: Launch Instantly</h2>
            <p className="mt-4 text-lg text-textSecondary">
              The Paynless Framework provides a production-ready foundation with everything pre-configured. Get secure Supabase authentication, PostgreSQL database, Stripe subscriptions, and a robust API structure out-of-the-box. Focus on your unique application logic from minute one.
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
                   to="https://github.com/paynless/paynless-framework"
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
    </Layout>
  );
}