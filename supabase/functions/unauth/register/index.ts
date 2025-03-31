import { corsHeaders, createErrorResponse, createSuccessResponse } from "../../_shared/cors-headers.ts";
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

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase URL or service role key');
      return createErrorResponse('Server configuration error', 500);
    }
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
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

    // Create user profile
    if (data.firstName || data.lastName) {
      const { error: profileError } = await supabaseClient
        .from('user_profiles')  // Changed from 'profiles' to 'user_profiles'
        .insert({
          id: authData.user.id,
          first_name: data.firstName,
          last_name: data.lastName,
          avatar_url: null,
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Log but continue since user was created
      }
    }

    // Sign in the user to get tokens
    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: data.email,
      password: data.password
    });

    if (signInError) {
      console.error('Error signing in user:', signInError);
      return createErrorResponse(signInError.message, 500);
    }

    // Store tokens in localStorage (handled in frontend)
    const tokens = {
      access_token: signInData.session?.access_token,
      refresh_token: signInData.session?.refresh_token
    };

    // Return success response in the format expected by the client
    return createSuccessResponse({
      user: {
        id: authData.user.id,
        email: authData.user.email,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        role: authData.user.role || 'user',
        createdAt: authData.user.created_at,
        updatedAt: authData.user.updated_at
      },
      ...tokens
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred during registration',
      500
    );
  }
}