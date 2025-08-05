#!/bin/bash

# Socket.IO Edge Function Deployment Script

echo "🚀 Deploying Socket.IO Edge Function..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Navigate to functions directory
cd supabase/functions

echo "📝 Checking function syntax..."
# Basic TypeScript check (if deno is available)
if command -v deno &> /dev/null; then
    deno check socket-io/index.ts
    if [ $? -ne 0 ]; then
        echo "❌ TypeScript check failed"
        exit 1
    fi
    echo "✅ TypeScript check passed"
else
    echo "⚠️  Deno not found, skipping TypeScript check"
fi

cd ../..

echo "🔧 Deploying function..."
supabase functions deploy socket-io

if [ $? -eq 0 ]; then
    echo "✅ Socket.IO function deployed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Test the function using the test client: supabase/functions/socket-io/test-client.html"
    echo "2. Connect to WebSocket at: wss://your-project.supabase.co/functions/v1/socket-io"
    echo "3. Check status at: https://your-project.supabase.co/functions/v1/socket-io/status"
    echo ""
    echo "🔗 Documentation: supabase/functions/socket-io/README.md"
else
    echo "❌ Deployment failed"
    exit 1
fi
