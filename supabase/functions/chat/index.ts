import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "npm:openai@4.28.0";
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

// In your Edge Function
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, // Use service role instead of anon key
  {
    auth: {
      persistSession: false,
    }
  }
);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Type definitions
interface ChatRequest {
  prompt: string;
  systemPromptName?: string;
  previousMessages?: Message[];
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Check available models and select the best one
async function getBestAvailableModel(openai) {
  try {
    const { data } = await openai.models.list();
    
    // Define model preference order
    const preferredModels = [
      "gpt-4-turbo",
      "gpt-4-1106-preview",
      "gpt-4",
      "gpt-3.5-turbo-1106",
      "gpt-3.5-turbo"
    ];
    
    // Find the best available model from our preference list
    const availableModels = data.map(model => model.id);
    const bestModel = preferredModels.find(model => availableModels.includes(model));
    
    return bestModel || "gpt-3.5-turbo"; // Default fallback
  } catch (error) {
    console.error("Error fetching models:", error);
    return "gpt-3.5-turbo"; // Default fallback if API call fails
  }
}

serve(async (req: Request) => {
  console.log("Request received");
  
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    console.log("Attempting to authenticate user with token");
    
    const authResponse = await supabase.auth.getUser(token);
    console.log("Auth response received:", !!authResponse);
    
    const user = authResponse.data?.user;
    const authError = authResponse.error;
    
    console.log("User authenticated:", !!user);
    console.log("Auth error:", authError ? JSON.stringify(authError) : "none");

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("User ID:", user.id);
    
    // Parse request
    const requestData = await req.json();
    console.log("Request body parsed");
    
    const { prompt, systemPromptName = "default", previousMessages = [] } = requestData as ChatRequest;
    console.log("Prompt:", prompt ? prompt.substring(0, 30) + "..." : "missing");
    console.log("System prompt name:", systemPromptName);
    console.log("Previous messages count:", previousMessages.length);

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get the system prompt
    console.log("Fetching system prompt:", systemPromptName);
    
    let systemPromptData;
    const systemPromptResponse = await supabase
      .from("system_prompts")
      .select("content")
      .eq("name", systemPromptName)
      .eq("is_active", true)
      .single();
    
    const data = systemPromptResponse.data;
    const systemPromptError = systemPromptResponse.error;
    
    console.log("System prompt found:", !!data);
    console.log("System prompt error:", systemPromptError ? JSON.stringify(systemPromptError) : "none");

    if (systemPromptError) {
      console.error("Error fetching system prompt:", systemPromptError);
      // If we can't find the specified prompt, use a fallback
      systemPromptData = { content: "You are a helpful AI assistant. Answer questions concisely and accurately." };
      console.log("Using fallback system prompt");
    } else {
      systemPromptData = data;
      console.log("Using retrieved system prompt");
    }

    // Prepare messages for OpenAI
    const messages = [
      { role: "system", content: systemPromptData.content },
      ...previousMessages,
      { role: "user", content: prompt },
    ];
    console.log("Messages prepared for OpenAI");

    // Get the best available model
    console.log("Selecting best available model");
    const model = await getBestAvailableModel(openai);
    console.log("Selected model:", model);

    // Call OpenAI API with the selected model
    console.log("Calling OpenAI API");
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 1000,
    });
    console.log("OpenAI API response received");

    const response = completion.choices[0].message.content;
    console.log("Response extracted from OpenAI response");

    // Create a complete response message array
    const allMessages = [
      ...messages,
      { role: "assistant", content: response }
    ];
    console.log("All messages prepared for storage");

    // Store the interaction in user_events with complete message history
    console.log("Storing chat in user_events table");
    console.log("User ID for storage:", user.id);
    
    const insertData = {
      user_id: user.id,
      event_type: "chat",
      event_description: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
      event_details: {
        prompt,
        systemPromptName,
        response,
        timestamp: new Date().toISOString(),
        messages: allMessages,
        model: model
      },
    };
    console.log("Insert data prepared:", JSON.stringify(insertData).substring(0, 100) + "...");
    
    // When inserting user events with service role
    const insertResponse = await supabase
      .from("user_events")
      .insert(insertData)
      .select(); // Add select to get the returned data

    // If this fails due to RLS (which it shouldn't with service role)
    if (insertResponse.error) {
      console.error("Error storing chat history:", insertResponse.error);
      
      // Attempt with RLS bypass if needed
      if (insertResponse.error.code === "42501") { // Permission denied
        try {
          const bypassResponse = await supabase.auth.admin.updateUserById(
            user.id,
            { app_metadata: { bypass_rls: true } }
          );
          
          if (!bypassResponse.error) {
            // Try the insert again
            const retryInsert = await supabase
              .from("user_events")
              .insert(insertData);
              
            // Reset the bypass_rls
            await supabase.auth.admin.updateUserById(
              user.id,
              { app_metadata: { bypass_rls: false } }
            );
              
            if (!retryInsert.error) {
              console.log("Chat history stored successfully using RLS bypass");
            }
          }
        } catch (bypassError) {
          console.error("Error with RLS bypass attempt:", bypassError);
        }
      }
    }    
    const insertError = insertResponse.error;
    
    console.log("Insert completed");
    console.log("Insert error:", insertError ? JSON.stringify(insertError) : "none");
    console.log("Insert status:", insertError ? "FAILED" : "SUCCESS");

    if (insertError) {
      console.error("Error storing chat history:", insertError);
    } else {
      console.log("Chat history stored successfully");
    }

    // Return the response
    console.log("Preparing response to client");
    return new Response(
      JSON.stringify({
        response,
        messages: allMessages,
        model: model,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    // Log the full error details
    console.error("Error stack:", error.stack);
    console.error("Error message:", error.message);
    
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});