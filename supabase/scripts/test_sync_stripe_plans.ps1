# supabase/scripts/test_sync_stripe_plans.ps1
# Invokes the sync-stripe-plans Edge Function. The Supabase CLI has no "functions invoke" command;
# use this script or curl after starting functions with: supabase functions serve

# --- Configuration ---
# Attempt to read Supabase Service Role Key from supabase/.env
$SupabaseServiceRoleKey = "YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE" # Default placeholder
$EnvFilePath = Join-Path $PSScriptRoot "..\\.env" # Assuming script is in supabase/scripts and .env is in supabase/

if (Test-Path $EnvFilePath) {
    try {
        $envContent = Get-Content $EnvFilePath
        $serviceKeyLine = $envContent | Where-Object { $_ -match "^SUPABASE_SERVICE_ROLE_KEY=" }
        if ($serviceKeyLine) {
            $SupabaseServiceRoleKey = ($serviceKeyLine -split "=")[1].Trim()
            Write-Host "Successfully read SUPABASE_SERVICE_ROLE_KEY from $($EnvFilePath)" -ForegroundColor Cyan
        } else {
            Write-Warning "SUPABASE_SERVICE_ROLE_KEY not found in $($EnvFilePath). Using placeholder. Please set it in the .env file or manually in this script."
        }
    } catch {
        Write-Warning "Error reading $($EnvFilePath): $($_.Exception.Message). Using placeholder for SUPABASE_SERVICE_ROLE_KEY."
    }
} else {
    Write-Warning "$($EnvFilePath) not found. Using placeholder for SUPABASE_SERVICE_ROLE_KEY. Please create it or set the key manually in this script."
}

# If using a local Supabase instance, this is typically the default:
$FunctionBaseUrl = "http://localhost:54321/functions/v1"
# If targeting a deployed Supabase instance, use its URL:
# $FunctionBaseUrl = "https://YOUR_PROJECT_REF.supabase.co/functions/v1"

$SyncPlansEndpoint = "$($FunctionBaseUrl)/sync-stripe-plans"

# Standard Headers
$Headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $($SupabaseServiceRoleKey)" # Use the (potentially) loaded key
}

# --- Helper Function to Make Request and Show Output ---
function Invoke-SyncRequest {
    param (
        [string]$TestName,
        [object]$Body = $null,
        [string]$Endpoint
    )

    Write-Host "`n--- Running Test: $($TestName) ---" -ForegroundColor Green
    Write-Host "Endpoint: $($Endpoint)"
    
    try {
        $params = @{
            Uri     = $Endpoint
            Method  = 'POST'
            Headers = $Headers
        }
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 3
            $params.Body = $jsonBody
            Write-Host "Request Body: $($jsonBody)"
        }

        # Make the request
        $response = Invoke-RestMethod @params -Verbose
        Write-Host "Response from $($TestName):"
        $response | ConvertTo-Json -Depth 5 | Write-Output # Output entire response object as JSON
        
    } catch {
        Write-Error "Error during '$($TestName)': $($_.Exception.Message)"
        if ($_.Exception.Response) {
            Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
            Write-Host "Response Content: $($_.Exception.Response.Content | Out-String)"
        } else {
            Write-Host "No response content available for the error."
        }
    }
    Write-Host "--- $($TestName) COMPLETED. Check Supabase function logs for detailed execution status. ---" -ForegroundColor Green
    Write-Host "Remember to verify the 'subscription_plans' table in your database."
    Write-Host ("-" * 60)
}

# --- Test Scenarios ---
# Contract: POST with Content-Type: application/json, Authorization: Bearer <service_role_key>,
# and body { isTestMode: boolean } (required). Response: { success, synced, failed, errors }.

# Test 1: Sync with Test Mode
# Requires STRIPE_SECRET_TEST_KEY and STRIPE_TEST_WEBHOOK_SECRET in Supabase Edge Function environment.
Write-Host "Test 1: Sync with Test Mode (via Request Body)"
Write-Host "Expected: Syncs plans using Stripe TEST data."
$test1Body = @{ isTestMode = $true }
Invoke-SyncRequest -TestName "Test Mode Sync" -Body $test1Body -Endpoint $SyncPlansEndpoint

# Test 2: Explicitly request LIVE mode (USE WITH EXTREME CAUTION)
# WARNING: This will interact with your LIVE Stripe account if STRIPE_SECRET_LIVE_KEY is configured 
#          in your Supabase Edge Function environment. It could modify data if there are discrepancies.
#          ONLY RUN THIS IF YOU ARE ABSOLUTELY SURE AND HAVE BACKUPS OR ARE IN A SAFE TEST/STAGING LIVE ENVIRONMENT.
# This test is commented out by default for safety.
<# 
Write-Host "Test 2: Sync with Live Mode (CAUTION!)" -ForegroundColor Yellow
Write-Host "WARNING: THIS WILL INTERACT WITH YOUR LIVE STRIPE DATA IF CONFIGURED!" -ForegroundColor Red
Write-Host "Expected: Syncs plans using Stripe LIVE data."
$test2Body = @{ isTestMode = $false }
Invoke-SyncRequest -TestName "Live Mode Sync (CAUTION)" -Body $test2Body -Endpoint $SyncPlansEndpoint
#>
Write-Host "Test 2 (Live Mode Sync) is commented out by default for safety." -ForegroundColor Yellow
Write-Host "Uncomment the section in the script if you need to run it, and understand the risks."
Write-Host ("-" * 60)


Write-Host "`nAll scripted tests finished." -ForegroundColor Cyan
Write-Host "Please review the output above, check your Supabase function logs for detailed messages and potential errors from 'sync-stripe-plans',"
Write-Host "and inspect your 'subscription_plans' database table to verify the synced data." 