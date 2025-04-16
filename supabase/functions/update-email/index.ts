import { serve } from 'https://deno.land/std/http/server.ts'
import {
  createSupabaseAdminClient,
  createSupabaseClient,
  getUserIdFromClient,
} from '../_shared/auth.ts'
import { corsHeaders } from '../_shared/cors-headers.ts'
import {
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/responses.ts'

console.log('Update Email Function Initializing')

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let newEmail: string | undefined
    try {
      const body = await req.json()
      newEmail = body.email
    } catch (error) {
      console.error('Error parsing request body:', error)
      return createErrorResponse(
        "Invalid request body. Ensure it's valid JSON with an 'email' field.",
        400,
        error
      )
    }

    if (!newEmail) {
      return createErrorResponse("Missing 'email' in request body.", 400)
    }

    // 1. Create a Supabase client with the user's access token
    const supabaseClient = createSupabaseClient(req)

    // 2. Get the user ID
    let userId: string
    try {
      userId = await getUserIdFromClient(supabaseClient)
      console.log(`Authenticated user ID: ${userId}`)
    } catch (error) {
      console.error('Authentication error:', error)
      // Assuming getUserIdFromClient throws an error that createErrorResponse can handle
      // If it returns a specific structure, adjust accordingly
      return createErrorResponse(
        error instanceof Error ? error.message : 'Authentication failed',
        401,
        error
      )
    }

    // 3. Create a Supabase admin client to update the user
    const supabaseAdmin = createSupabaseAdminClient()

    // 4. Update the user's email
    console.log(`Attempting to update email for user ${userId} to ${newEmail}`)
    const { data: updatedUser, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail })

    if (updateError) {
      console.error('Error updating user email:', updateError)
      // Provide more specific feedback if possible, e.g., email already taken
      const errorMessage = updateError.message.includes('unique constraint')
        ? 'Email address is already in use.'
        : 'Failed to update email.'
      return createErrorResponse(errorMessage, 500, updateError)
    }

    console.log('Successfully updated email for user:', updatedUser?.user?.id)
    return createSuccessResponse({
      success: true,
      message: 'Email updated successfully.',
    })
  } catch (error) {
    console.error('Unhandled error in update-email function:', error)
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred.',
      500,
      error
    )
  }
})
