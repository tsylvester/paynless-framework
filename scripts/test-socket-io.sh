#!/bin/bash

# Quick Test Instructions for Socket.IO Edge Function

echo "🧪 Socket.IO Edge Function Test Instructions"
echo "============================================="
echo ""
echo "1. 📂 Open the test client HTML file:"
echo "   File: /Users/wes/Sites/paynless-framework/supabase/functions/socket-io/test-client.html"
echo "   You can double-click this file to open it in your browser"
echo ""
echo "2. 🔗 WebSocket URL for testing:"
echo "   ws://127.0.0.1:54321/functions/v1/socket-io"
echo ""
echo "3. 🔑 Authentication:"
echo "   The function should work in development mode without strict auth"
echo "   If needed, use this anon key:"
echo "   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
echo ""
echo "4. 🧪 Testing with curl:"
echo "   curl -H \"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0\" http://127.0.0.1:54321/functions/v1/socket-io"
echo ""
echo "5. 📋 Next steps:"
echo "   - Open test-client.html in your browser"
echo "   - Click 'Connect' to establish WebSocket connection"
echo "   - Try joining a room and sending messages"
echo "   - Check browser console for detailed logs"
echo ""
echo "🔧 Troubleshooting:"
echo "   - Make sure Supabase local server is running: supabase status"
echo "   - Check function logs: supabase functions logs socket-io"
echo "   - Verify the function is deployed: supabase functions list"

# Also test the endpoint with proper auth
echo ""
echo "Testing HTTP endpoint with auth..."
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  http://127.0.0.1:54321/functions/v1/socket-io 2>/dev/null | jq . || echo "Function responded (check above for JSON)"
