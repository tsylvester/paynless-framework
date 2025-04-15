import { Layout } from '../components/layout/Layout'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@paynless/store'

export function DashboardPage() {
  // Get user AND profile from the store
  const { user, profile, isLoading } = useAuthStore((state) => ({
    user: state.user,
    profile: state.profile,
    isLoading: state.isLoading,
  }))

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        </div>
      </Layout>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  // Determine the name to display, prioritizing profile, then user, then email
  const displayName = profile?.first_name || user.first_name || user.email
  // Determine role, prioritizing profile, then user (User object might not have role)
  const displayRole = profile?.role || user.role || 'user' // Default to 'user' if unknown

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold text-textPrimary mb-6">
          Dashboard
        </h1>

        <div className="mt-8 bg-surface shadow overflow-hidden sm:rounded-lg">
          <div className="px-6 py-6 sm:px-8">
            <h2 className="text-lg leading-6 font-medium text-textPrimary">
              Welcome back, {displayName}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-textSecondary">
              Your personalized dashboard.
            </p>
          </div>
          <div className="border-t border-border px-6 py-6 sm:px-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Dashboard cards would go here */}
              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-6 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">
                    Account Summary
                  </h3>
                  <div className="mt-4 text-sm text-textSecondary">
                    <p>User ID: {user.id}</p>
                    <p>Email: {user.email}</p>
                    {/* Display role from profile or fallback */}
                    <p>Role: {displayRole}</p>
                    <p>
                      Created:{' '}
                      {new Date(
                        user.created_at || profile?.created_at || Date.now()
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-6 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">
                    Recent Activity
                  </h3>
                  <div className="mt-4 text-sm text-textSecondary">
                    <p>No recent activity to display.</p>
                  </div>
                </div>
              </div>

              <div className="bg-background overflow-hidden shadow rounded-lg">
                <div className="px-6 py-5 sm:p-6">
                  <h3 className="text-lg font-medium text-textPrimary">
                    Quick Actions
                  </h3>
                  <div className="mt-4 text-sm text-textSecondary">
                    <ul className="divide-y divide-border">
                      <li className="py-3">
                        <a
                          href="/profile"
                          className="text-primary hover:text-primary/90"
                        >
                          Edit profile
                        </a>
                      </li>
                      <li className="py-3">
                        <a
                          href="/settings"
                          className="text-primary hover:text-primary/90"
                        >
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

        {/* WARNING and Usage Guidelines Section */}
        <div
          className="mt-10 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-6 py-4 rounded-lg relative mb-8"
          role="alert"
        >
          <strong className="font-bold block text-lg">
            WARNING! WARNING! WARNING!
          </strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              This framework works AS IS, but there are no warranties or
              guarantees, explicit or implied.
            </li>
            <li>
              All changes are AT YOUR OWN RISK! Our code works, but we can't fix
              YOUR code.
            </li>
            <li>
              Be very careful before letting AI Coding Assistants tamper with
              the Supabase Functions (<code>supabase/functions/</code>) or
              Shared Packages (<code>packages/</code>).
            </li>
            <li>
              Never let the frontend communicate directly with Supabase
              database/auth. Maintain the backend (Edge Function) -&gt; store
              -&gt; API Client -&gt; frontend layering.
            </li>
            <li>
              Be extremely careful with any changes to files in{' '}
              <code>packages/api-client</code> or <code>packages/store/</code>.
            </li>
            <li>
              The <code>apps/web</code> and <code>apps/desktop</code> frontends
              work, but <code>apps/android</code> and <code>apps/ios</code>{' '}
              aren't populated yet.
            </li>
          </ul>
        </div>

        <div
          className="mt-10 bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-200 px-6 py-4 rounded-lg relative mb-8"
          role="alert"
        >
          <strong className="font-bold block text-lg">
            How to Effectively Use This Framework with AI Coding Assistants:
          </strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>
              Read the <code className="text-xs">README.md</code> file
              thoroughly to understand this project's architecture, structure,
              and contents.
            </li>
            <li>
              Keep the <code className="text-xs">README.md</code> file in
              context for every AI coding prompt.
            </li>
            <li>
              Regularly remind the AI assistant to re-read the{' '}
              <code className="text-xs">README.md</code> file.
            </li>
            <li>
              Regularly ask the AI assistant to update the documentation (like
              the README) sections for database schema, file structure, and API
              endpoints when you make changes.
            </li>
            <li>
              Regularly ask the AI assistant if its proposed changes align with
              the architecture, structure, and patterns described in the{' '}
              <code className="text-xs">README.md</code> file.
            </li>
            <li>
              Ask the AI assistant to create detailed work plans and checklists
              for feature additions, including architecture considerations,
              deliverables, development steps, and testing requirements.
            </li>
            <li>
              Make the AI assistant follow the checklist, update its progress,
              and refer back to it frequently.
            </li>
            <li>
              Remind the AI assistant to use Test-Driven Development (TDD): Ask
              it to write unit tests based on your requirements *before* writing
              the feature code. Ensure the tests pass before accepting the code.
            </li>
          </ul>
        </div>

        {/* Setup Guide Section */}
        <div className="mt-10 bg-surface shadow overflow-hidden sm:rounded-lg p-8">
          <h2 className="text-xl font-semibold text-textPrimary mb-4">
            How to Setup Your Paynless Framework
          </h2>

          <div className="space-y-6">
            {/* GitHub Fork */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">
                1. Fork on GitHub
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>Complete your subscription to get access to the repo.</li>
                <li>Open the Paynless Framework repo.</li>
                <li>Click the "Fork" button in the top-right corner.</li>
                <li>Choose your GitHub account to create the fork under.</li>
              </ol>
            </div>

            {/* Setup Your Project Manually */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">
                2. Setup Your Project Manually
              </h3>

              {/* Supabase Connection */}
              <h4 className="text-md font-medium text-textPrimary mt-3 mb-1">
                2a. Connect to Supabase
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>
                  Sign in to your{' '}
                  <a
                    href="https://supabase.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Supabase
                  </a>{' '}
                  account.
                </li>
                <li>Create a new project or use an existing one.</li>
                <li>
                  Navigate to your Project Settings &gt; Integrations &gt;
                  GitHub.
                </li>
                <li>
                  Follow the instructions to connect your GitHub account and
                  select your forked repository.
                </li>
                <li>
                  Ensure you set up the required environment variables in your
                  Supabase project settings (refer to <code>.env.example</code>{' '}
                  in the repository for the list, e.g.,{' '}
                  <code>STRIPE_SECRET_KEY</code>). Supabase might automatically
                  detect some during the GitHub connection process.
                </li>
                <li>
                  Run the database migrations from the{' '}
                  <code>supabase/migrations</code> folder using the Supabase CLI
                  or dashboard SQL editor to set up your schema.
                </li>
                <li>
                  <strong>How to Set up Supabase CLI and Deploy:</strong>
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>
                      Install the Supabase CLI globally:{' '}
                      <code>pnpm install -g supabase</code>
                    </li>
                    <li>
                      Log in to the CLI: <code>supabase login</code>
                    </li>
                    <li>
                      Link your local project to your Supabase project:{' '}
                      <code>
                        supabase link --project-ref &lt;your-project-ref&gt;
                        --password &lt;your-database-password&gt;
                      </code>
                      <br />
                      (Find your project ref in your Supabase dashboard URL).
                    </li>
                    <li>
                      Push local database changes (like migrations) to your
                      Supabase project: <code>supabase db push</code>
                    </li>
                    <li>
                      Deploy all Edge Functions:{' '}
                      <code>supabase functions deploy</code>
                      <ul className="list-circle list-inside ml-4 mt-1">
                        <li>
                          The config.toml in the Supabase directory already
                          turns off JWT for the public functions.
                        </li>
                        <li>
                          The <code>--no-verify-jwt</code> flag is important
                          here because functions like <code>login</code> and{' '}
                          <code>register</code> need to be accessed without a
                          pre-existing user JWT.
                        </li>
                        <li>
                          If you need to deploy functions individually, use the
                          flag only for public ones:
                        </li>
                        <li className="ml-4">
                          <code>
                            supabase functions deploy login --no-verify-jwt
                          </code>
                        </li>
                        <li className="ml-4">
                          <code>
                            supabase functions deploy register --no-verify-jwt
                          </code>
                        </li>
                        <li className="ml-4">
                          <code>
                            supabase functions deploy &lt;function_name&gt;
                          </code>{' '}
                          (for others)
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ol>

              {/* Netlify Connection */}
              <h4 className="text-md font-medium text-textPrimary mt-3 mb-1">
                2b. Connect to Netlify (for Web App)
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>
                  Sign in to your{' '}
                  <a
                    href="https://netlify.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Netlify
                  </a>{' '}
                  account.
                </li>
                <li>Click "Add new site" &gt; "Import an existing project".</li>
                <li>Connect to GitHub and authorize Netlify.</li>
                <li>Select your forked Paynless Framework repository.</li>
                <li>
                  Configure the build settings:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>
                      Base directory: <code>apps/web</code>
                    </li>
                    <li>
                      Build command: <code>pnpm run build</code>
                    </li>
                    <li>
                      Publish directory: <code>apps/web/dist</code>
                    </li>
                  </ul>
                </li>
                <li>
                  Add Redirect for Client-Side Routing:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>
                      To ensure direct links or refreshes work correctly with
                      React Router, create a file named <code>_redirects</code>{' '}
                      in the <code>apps/web/public</code> directory with:
                    </li>
                    <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs my-1">
                      <code>/* /index.html 200</code>
                    </pre>
                    <li>
                      This is all set up in your netlify.toml file already.
                    </li>
                  </ul>
                </li>
                <li>
                  Once you have Netlify connected to your Github account, it'll
                  automatically deploy with each commit.
                </li>
              </ol>
            </div>

            {/* Stripe Setup */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">
                3. Set Up Stripe Products & Webhooks
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>
                  In your{' '}
                  <a
                    href="https://stripe.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Stripe
                  </a>{' '}
                  dashboard, create Products and corresponding Prices that match
                  the plans you want to offer.
                </li>
                <li>
                  Set up a Stripe Webhook endpoint:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Go to Developers &gt; Webhooks &gt; Add endpoint.</li>
                    <li>
                      The endpoint URL should be your deployed Supabase function
                      URL for the webhook handler:{' '}
                      <code>
                        &lt;your-supabase-project-url&gt;/functions/v1/stripe-webhook
                      </code>
                    </li>
                    <li>
                      Select the events to listen for. Essential events include:
                      <ul className="list-circle list-inside ml-4 mt-1">
                        <li>
                          <code>checkout.session.completed</code>
                        </li>
                        <li>
                          <code>invoice.paid</code>
                        </li>
                        <li>
                          <code>invoice.payment_failed</code>
                        </li>
                        <li>
                          <code>customer.subscription.updated</code>
                        </li>
                        <li>
                          <code>customer.subscription.deleted</code>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li>
                  After creating the webhook, copy the Webhook Signing Secret.
                </li>
                <li>
                  Add this secret as an environment variable named{' '}
                  <code>STRIPE_WEBHOOK_SECRET</code> to your Supabase project
                  (in the <code>.env</code> file for local development via{' '}
                  <code>supabase start</code>, and in the Supabase Dashboard
                  under Project Settings &gt; Functions for deployed functions).
                </li>
              </ol>
            </div>

            {/* OpenAI Setup */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">
                4. Set Up OpenAI API Key
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>
                  If you plan to use the AI Chat features, you'll need an API
                  key from OpenAI (or another supported provider).
                </li>
                <li>
                  Visit{' '}
                  <a
                    href="https://openai.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    OpenAI
                  </a>{' '}
                  and create an account or sign in.
                </li>
                <li>
                  Navigate to the API Keys section of your OpenAI account
                  settings.
                </li>
                <li>Create a new secret key.</li>
                <li>
                  Add this key as an environment variable named{' '}
                  <code>OPENAI_API_KEY</code>:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>
                      For local development: Add it to your root{' '}
                      <code>.env</code> file (and optionally sync to{' '}
                      <code>supabase/.env.local</code> using the sync script).
                    </li>
                    <li>
                      For deployed functions: Add it to your Supabase Project
                      Settings &gt; Functions &gt; Secrets.
                    </li>
                  </ul>
                </li>
                <li>
                  Other AI providers (like Anthropic, Gemini) will require
                  similar steps with their respective keys (e.g.,{' '}
                  <code>ANTHROPIC_API_KEY</code>).
                </li>
              </ol>
            </div>

            {/* Dev Environment Setup */}
            <div>
              <h3 className="text-lg font-medium text-textPrimary mb-2">
                5. Load into Your Dev Environment
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-textSecondary">
                <li>Ensure you have Git and Node.js (with pnpm) installed.</li>
                <li>
                  Clone your forked repository to your local machine (
                  <code>git clone &lt;your-fork-url&gt;</code>).
                </li>
                <li>
                  Open the cloned repository folder in your preferred editor
                  (like Cursor).
                </li>
                <li>
                  Install dependencies: Run <code>pnpm install</code> in the
                  integrated terminal at the project root.
                </li>
                <li>
                  Copy <code>.env.example</code> to <code>.env</code> (at the
                  root) and fill in your Supabase/Stripe keys.
                </li>
                <li>
                  (Optional) Sync env vars to <code>supabase/.env.local</code>{' '}
                  by running:{' '}
                  <code>node supabase/functions/tools/sync-envs.js</code>
                </li>
                <li>
                  Start the local Supabase stack: <code>supabase start</code>
                </li>
                <li>
                  Apply migrations: <code>supabase db reset</code> (if first
                  time) or <code>supabase migration up</code>
                </li>
                <li>
                  Deploy functions locally:{' '}
                  <code>supabase functions deploy</code>. The config.toml is set
                  up to disable JWT on the public functions.
                </li>
                <li>
                  Start the web app dev server:{' '}
                  <code>pnpm --filter web dev</code>.
                </li>
              </ol>
            </div>

            <p className="text-center text-lg font-semibold text-green-600 dark:text-green-400 mt-8">
              Congratulations, you now have a working app with user auth,
              profiles, database, and subscriptions ready to go!
            </p>
          </div>
        </div>
      </div>
    </Layout>
  )
}
