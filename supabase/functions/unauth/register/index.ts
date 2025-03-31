import { createErrorResponse } from "../../_shared/cors-headers.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export default async function handleRegister(data: RegisterData): Promise<Response> {
  try {
    // Log the registration attempt
    console.log('Registration attempt:', {
      email: data.email,
      hasPassword: !!data.password,
      firstName: data.firstName,
      lastName: data.lastName
    });

    // Validate required fields
    if (!data.email || !data.password) {
      return createErrorResponse('Email and password are required', 400);
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create the user
    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: data.firstName,
        last_name: data.lastName
      }
    });

    if (authError) {
      console.error('Error creating user:', authError);
      return createErrorResponse(authError.message, 400);
    }

    if (!authData.user) {
      return createErrorResponse('Failed to create user', 500);
    }

    // Create user profile if first name or last name is provided
    if (data.firstName || data.lastName) {
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .insert({
          id: authData.user.id,
          first_name: data.firstName,
          last_name: data.lastName,
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Don't return error here, as the user was created successfully
      }
    }

    // Sign in the user
    const { data: signInData, error: signInError } = await supabaseClient.auth.admin.signInWithPassword({
      email: data.email,
      password: data.password
    });

    if (signInError) {
      console.error('Error signing in user:', signInError);
      return createErrorResponse(signInError.message, 500);
    }

    // Return success response with user and session
    return new Response(
      JSON.stringify({
        user: signInData.user,
        session: signInData.session
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      500
    );
  }
} 