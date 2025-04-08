import { Layout } from '../components/layout/Layout';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@paynless/store';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  // Get user AND profile from the store
  const { user, profile, isLoading } = useAuthStore(state => ({ 
    user: state.user,
    profile: state.profile,
    isLoading: state.isLoading 
  }));
  
  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  // Determine the name to display, prioritizing profile, then user, then email
  const displayName = profile?.first_name || user.first_name || user.email;
  // Determine role, prioritizing profile, then user (User object might not have role)
  const displayRole = profile?.role || user.role || 'user'; // Default to 'user' if unknown

  return (
    <Layout>
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-textPrimary">Dashboard</h1>
        
        <div className="mt-6 bg-surface shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-textPrimary">
              Welcome back, {displayName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-textSecondary">
              Your personalized dashboard.
            </p>
          </div>
          <div className="border-t border-border px-4 py-5 sm:px-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Dashboard cards would go here */}
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Account Summary</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <p>User ID: {user.id}</p>
                    <p>Email: {user.email}</p>
                    {/* Display role from profile or fallback */}
                    <p>Role: {displayRole}</p> 
                    <p>Created: {new Date(user.created_at || profile?.created_at || Date.now()).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Recent Activity</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <p>No recent activity to display.</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">Quick Actions</h3>
                  <div className="mt-3 text-sm text-textSecondary">
                    <ul className="divide-y divide-border">
                      <li className="py-2">
                        <a href="/profile" className="text-primary hover:text-primary/90">
                          Edit profile
                        </a>
                      </li>
                      <li className="py-2">
                        <a href="/settings" className="text-primary hover:text-primary/90">
                          Account settings
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Guide Section */}
        <div className="mt-8 bg-surface shadow overflow-hidden sm:rounded-lg p-6">
          <h2 className="text-xl font-semibold text-textPrimary mb-4">How to Setup Your Paynless Framework</h2>
          
          <div className="space-y-6">
            {/* GitHub Fork */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">1. Fork on GitHub</h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>Visit the <Link to="/subscription" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Subscription</Link> page to get access to the Paynless Framework Github Organization team. </li>
                <li>Open the Github Organization page for Paynless Framework.</li>
                <li>Click the "Fork" button in the top-right corner.</li>
                <li>Choose your GitHub account to create the fork under.</li>
              </ol>
            </div>

            {/* Supabase Connection */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">2. Connect to Supabase</h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>Sign in to your <Link to="https://supabase.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Supabase</Link> account.</li>
                <li>Create a new project or use an existing one.</li>
                <li>Navigate to your Project Settings &gt; Integrations &gt; GitHub.</li>
                <li>Follow the instructions to connect your GitHub account and select your forked repository.</li>
                <li>Ensure you set up the required environment variables in your Supabase project settings (refer to <code>.env.example</code> in the repository for the list, e.g., <code>STRIPE_SECRET_KEY</code>). Supabase might automatically detect some during the GitHub connection process.</li>
                <li>Run the database migrations from the <code>supabase/migrations</code> folder using the Supabase CLI or dashboard SQL editor to set up your schema.</li>
                <li><strong>How to Set up Supabase CLI and Deploy:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Install the Supabase CLI globally: <code>npm install -g supabase</code></li>
                    <li>Log in to the CLI: <code>supabase login</code></li>
                    <li>Link your local project to your Supabase project: <code>supabase link --project-ref &lt;your-project-ref&gt; --password &lt;your-database-password&lt;</code> 
                    <br/>(Find your project ref in your Supabase dashboard URL).</li>
                    <li>Push local database changes (like migrations) to your Supabase project: <code>supabase db push</code></li>
                    <li>Deploy all Edge Functions: <code>supabase functions deploy --no-verify-jwt</code>
                      <ul className="list-circle list-inside ml-4 mt-1">
                         <li>The <code>--no-verify-jwt</code> flag is important here because functions like `login` and `register` need to be accessed without a pre-existing user JWT.</li>
                         <li>Alternatively, deploy functions individually, using the flag only for public ones:</li>
                         <li className="ml-4"><code>supabase functions deploy login --no-verify-jwt</code></li>
                         <li className="ml-4"><code>supabase functions deploy register --no-verify-jwt</code></li>
                         <li className="ml-4"><code>supabase functions deploy &lt;function_name&gt;</code> (for others)</li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ol>
            </div>

            {/* Netlify Connection */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">3. Connect to Netlify (for Web App)</h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>Sign in to your <Link to="https://netlify.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Netlify</Link> account.</li>
                <li>Click "Add new site" &gt; "Import an existing project".</li>
                <li>Connect to GitHub and authorize Netlify.</li>
                <li>Select your forked Paynless Framework repository.</li>
                <li>Configure the build settings:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Base directory: <code>apps/web</code></li>
                    <li>Build command: <code>npm run build</code> (or <code>pnpm run build</code> if you adjusted package managers)</li>
                    <li>Publish directory: <code>apps/web/dist</code></li>
                  </ul>
                </li>
                <li>Add required environment variables (like <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>) under Site settings &gt; Build &amp; deploy &gt; Environment.</li>
                <li>Deploy the site.</li>
              </ol>
            </div>

            {/* Stripe Setup */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">4. Set Up Stripe Products & Webhooks</h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                 <li>In your <Link to="https://stripe.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe</Link> dashboard, create Products and corresponding Prices that match the plans you want to offer.</li>
                 <li>Set up a Stripe Webhook endpoint:
                   <ul className="list-disc list-inside ml-4 mt-1">
                     <li>Go to Developers &gt; Webhooks &gt; Add endpoint.</li>
                     <li>The endpoint URL should be your deployed Supabase function URL for the webhook handler: `&lt;your-supabase-project-url&gt;/functions/v1/stripe-webhook`</li>
                     <li>Select the events to listen for. Essential events include:
                       <ul className="list-circle list-inside ml-4 mt-1">
                          <li><code>checkout.session.completed</code></li>
                          <li><code>invoice.paid</code></li>
                          <li><code>invoice.payment_failed</code></li>
                          <li><code>customer.subscription.updated</code></li>
                          <li><code>customer.subscription.deleted</code></li>
                       </ul>
                     </li>
                   </ul>
                 </li>
                 <li>After creating the webhook, copy the Webhook Signing Secret.</li>
                 <li>Add this secret as an environment variable named <code>STRIPE_WEBHOOK_SECRET</code> to your Supabase project (in the `.env` file for local development via `supabase start`, and in the Supabase Dashboard under Project Settings &gt; Functions for deployed functions).</li>
              </ol>
            </div>

            {/* Loading into Tools - Renumbered to 5 */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">5. Load into Your Dev Environment</h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>
                  <strong>Using <Link to="https://bolt.new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Bolt.new</Link>:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Visit <Link to="https://bolt.new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">bolt.new</Link>.</li>
                    <li>Paste the URL of your forked GitHub repository.</li>
                    <li>Bolt should clone the repository and set up a development environment.</li>
                  </ul>
                </li>
                <li className="mt-2">
                  <strong>Using <Link to="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Lovable.dev</Link>:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1">
                     <li>Sign in to <Link to="https://lovable.dev" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">lovable.dev</Link>.</li>
                     <li>Connect your GitHub account if you haven't already.</li>
                     <li>Import your forked repository into Lovable.</li>
                  </ul>
                </li>
                 <li className="mt-2">
                  <strong>Using <Link to="https://cursor.sh" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cursor</Link>:</strong>
                   <ul className="list-disc list-inside ml-4 mt-1">
                     <li>Ensure you have <Link to="https://cursor.sh" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cursor</Link> installed.</li>
                     <li>Clone your forked repository to your local machine (<code>git clone &lt;your-fork-url&gt;</code>).</li>
                     <li>Open the cloned repository folder in Cursor (File &gt; Open Folder...).</li>
                     <li>Install dependencies: Run <code>pnpm install</code> in the integrated terminal.</li>
                     <li>Copy <code>.env.example</code> to <code>.env</code> and fill in your Supabase/Stripe keys.</li>
                     <li>Start the web app dev server: <code>pnpm --filter web dev</code>.</li>
                  </ul>
                </li>
              </ol>
            </div>
          </div>
          <br/>
          <h2 className="text-lg font-medium text-textPrimary mb-2">Congratulations, you now have a working app with user auth, profiles, database, and subscriptions ready to go!</h2>
        </div>
      </div>
    </Layout>
  );
}