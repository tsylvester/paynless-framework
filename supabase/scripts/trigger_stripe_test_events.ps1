<#
.SYNOPSIS
Script to trigger various Stripe test webhook events using the Stripe CLI.

.DESCRIPTION
This script provides a structured way to send test events to your locally forwarded
Stripe webhook endpoint. 
You MUST replace placeholder values (like 'cus_YOUR_CUSTOMER_ID') with actual
test mode IDs from your Stripe Sandbox Dashboard.

Prerequisites:
1. Stripe CLI installed and configured (`stripe login`).
2. `stripe listen --forward-to http://localhost:54321/functions/v1/webhooks/stripe`
   running in a separate terminal.
3. The webhook signing secret from `stripe listen` (whsec_...) must be set as
   STRIPE_WEBHOOK_SIGNING_SECRET in your local Supabase function's environment
   and the Supabase local dev server restarted if needed.

.NOTES
Author: gemini-2.5-pro-preview-05-06
Date: 2025-05-16
#>

# --- Configuration - REPLACE THESE VALUES ---
$CustomerId = "cus_S4r3zUDNFNLOjT" # Replace with a Test Customer ID
$OneTimePriceId = "price_1ROTrMIskUlhzlIxNr0IUDKa" # Replace with a Test Price ID for a one-time product
$RecurringPriceId = "price_1RPVhUIskUlhzlIxRxwqRDjW" # Replace with a Test Price ID for a subscription product
$ProductIdToUpdateOrDelete = "prod_S4KNYUZ1J6yv75" # Replace with a Test Product ID
$PriceIdToUpdateOrDelete = "price_1RPVhUIskUlhzlIxRxwqRDjW" # Replace with a Test Price ID
$SubscriptionIdToUpdateOrDelete = "sub_1RPQUFIskUlhzlIxaM8Rws0Y" # Replace with a Test Subscription ID

# For checkout.session.completed, you typically have an internal ID stored in metadata
$InternalPaymentIdForOneTime = "ipid_$(New-Guid)" # Example: Generate a new one or use a known test one
$InternalPaymentIdForSubscription = "ipid_$(New-Guid)" # Example: Generate a new one or use a known test one

# Additional Test Data based on initiatePayment logic (REPLACE THESE WITH YOUR ACTUAL TEST VALUES)
$TestOrgId = "org_YOUR_TEST_ORG_ID"                 # Replace with a relevant test Organization ID
$TestItemIdForOneTime = "item_YOUR_TEST_ITEM_ID"       # Replace with the item_id_internal for the one-time product
$TestTokensToAwardForOneTime = "100"             # Example token amount
$TestTargetWalletIdForOneTime = "wallet_YOUR_TEST_WALLET_ID" # Replace with a relevant test Wallet ID

# --- Helper Function to Execute and Log Stripe Commands ---
function Invoke-StripeEvent {
    param(
        [string]$EventName,
        [array]$ArgumentArray
    )
    Write-Host "----------------------------------------------------"
    Write-Host "Triggering: $EventName"
    # Construct the command string for logging purposes only
    $CommandLog = "stripe trigger $EventName"
    if ($ArgumentArray.Length -gt 0) {
        $CommandLog += " $($ArgumentArray -join ' ')"
    }
    Write-Host "Attempting Command: $CommandLog"
    Write-Host "----------------------------------------------------"
    try {
        # Use splatting to pass arguments. Each element in ArgumentArray becomes a separate argument.
        & stripe trigger $EventName @ArgumentArray
        Write-Host "$EventName triggered successfully.`n"
    }
    catch {
        Write-Error "Error triggering {$EventName}: $_"
    }
    Write-Host "Waiting 5 seconds before next event..."
    Start-Sleep -Seconds 5
}

# --- Trigger Events ---

Write-Host "Starting Stripe Test Event Trigger Script..."
Write-Host "IMPORTANT: Ensure 'stripe listen --forward-to ...' is running in another terminal!"

# 1. checkout.session.completed (One-time payment)
# Simulates a successful one-time purchase, WITH MINIMAL overrides, INCLUDING internal_payment_id.
$ArgumentArray = @(
    # "--override", "checkout_session:customer=$($CustomerId)", # Removed for now
    # "--override", "checkout_session:client_reference_id=$($CustomerId)", # Removed for now
    # "--override", "checkout_session:line_items[0].price=$($OneTimePriceId)", # Removed to use CLI default price/amount
    # "--override", "checkout_session:line_items[0].quantity=1", # Removed to use CLI default
    # "--override", "checkout_session:mode=payment", # Let CLI use default mode from fixture
    "--override", "checkout_session:metadata.internal_payment_id=$($InternalPaymentIdForOneTime)",
    "--override", "checkout_session:success_url=https://example.com/success", # Keep required URLs
    "--override", "checkout_session:cancel_url=https://example.com/cancel"    # Keep required URLs
)
Invoke-StripeEvent -EventName "checkout.session.completed" -ArgumentArray $ArgumentArray

# Try with NO overrides to see if the default fixture passes signature verification (NOW COMMENTED OUT)
# $ArgumentArray = @()
# Invoke-StripeEvent -EventName "checkout.session.completed" -ArgumentArray $ArgumentArray

# 2. checkout.session.completed (New subscription)
# Simulates a new subscription creation.
$ArgumentArray = @(
    "--override", "checkout_session:mode=subscription",
    # "--override", "checkout_session:customer=$($CustomerId)", # Try without customer to see if fixture provides one
    # "--override", "checkout_session:line_items[0].price=$($RecurringPriceId)", # Try without specific line items
    # "--override", "checkout_session:line_items[0].quantity=1",
    "--override", "checkout_session:metadata.internal_payment_id=$($InternalPaymentIdForSubscription)",
    "--override", "checkout_session:metadata.user_id=$($CustomerId)", # Keep user_id as it may be useful for handler
    "--override", "checkout_session:success_url=https://example.com/success", 
    "--override", "checkout_session:cancel_url=https://example.com/cancel"
)
Invoke-StripeEvent -EventName "checkout.session.completed" -ArgumentArray $ArgumentArray

# 3. invoice.payment_succeeded (Subscription renewal)
# Simulates a successful recurring payment for an existing subscription.
# NOTE: For this to be fully realistic, the $SubscriptionIdToUpdateOrDelete should exist and be active.
$ArgumentArray = @() # Using default fixture
Invoke-StripeEvent -EventName "invoice.payment_succeeded" -ArgumentArray $ArgumentArray

# 4. invoice.payment_failed
# Simulates a failed payment for an invoice (e.g., subscription renewal).
$ArgumentArray = @() # Using default fixture
Invoke-StripeEvent -EventName "invoice.payment_failed" -ArgumentArray $ArgumentArray

# 5. customer.subscription.updated
# Simulates a subscription being updated (e.g., plan change, cancellation at period end).
# $ArgumentArray = @(
#     # To trigger for an existing subscription, the CLI often just needs its ID.
#     # The fixture data for the update (e.g., new price, cancel_at_period_end) 
#     # is often pre-defined in the CLI's event fixture or can be complex to override simply.
#     # We'll try with just the ID, assuming the CLI uses sensible defaults for the update event.
#     \"--override\", \"customer_subscription:id=$($SubscriptionIdToUpdateOrDelete)\"
# )
# # If more specific changes are needed for the update, we might need to use `stripe fixtures` or more complex params.
# Invoke-StripeEvent -EventName \"customer.subscription.updated\" -ArgumentArray $ArgumentArray

# 6. customer.subscription.deleted
# Simulates a subscription being canceled/deleted.
# $ArgumentArray = @(
#     \"--override\", \"customer_subscription:id=$($SubscriptionIdToUpdateOrDelete)\" # Target the existing subscription by ID
# )
# Invoke-StripeEvent -EventName \"customer.subscription.deleted\" -ArgumentArray $ArgumentArray

# --- Product Events ---
# 7. product.created
# $ArgumentArray = @() # No arguments needed
# Invoke-StripeEvent -EventName \"product.created\" -ArgumentArray $ArgumentArray

# 8. product.updated
# NOTE: Assumes $ProductIdToUpdateOrDelete exists.
$ArgumentArray = @() # Using default fixture
Invoke-StripeEvent -EventName "product.updated" -ArgumentArray $ArgumentArray

# 9. product.deleted
# NOTE: Assumes $ProductIdToUpdateOrDelete exists. This might fail if it has prices attached that aren't deleted.
# Consider creating a temporary product for this test then deleting it.
# $TempProdIdForDelete = \"prod_$(Get-Random -Minimum 10000000000000 -Maximum 99999999999999)\"
# & stripe product create --name=\"Temp Product for Deletion Test\" --id=\"$TempProdIdForDelete\" | Out-Null
# $ArgumentArray = @(
#     \"--override\", \"product:id=$($TempProdIdForDelete)\"
# )
# Invoke-StripeEvent -EventName \"product.deleted\" -ArgumentArray $ArgumentArray


# --- Price Events ---
# 10. price.created
# NOTE: Requires a product to attach to. Using $ProductIdToUpdateOrDelete.
# $ArgumentArray = @(
#     \"--override\", \"price:product=$($ProductIdToUpdateOrDelete)\",
#     \"--override\", \"price:currency=usd\",
#     \"--override\", \"price:unit_amount=1000\", # $10.00
#     \"--override\", \"price:recurring.interval=month\"
# )
# Invoke-StripeEvent -EventName \"price.created\" -ArgumentArray $ArgumentArray

# 11. price.updated
# NOTE: Assumes $PriceIdToUpdateOrDelete exists.
$ArgumentArray = @() # Using default fixture
Invoke-StripeEvent -EventName "price.updated" -ArgumentArray $ArgumentArray

# 12. price.deleted
# NOTE: The Stripe CLI `trigger` command does not directly support `price.deleted`.
# To test this event, you would need to delete a price via the Stripe API/Dashboard or SDK,
# which would then naturally emit this event to your webhook listener.
# Commenting out this section for now as it will fail with the CLI trigger command.
#
# # NOTE: Assumes $PriceIdToUpdateOrDelete exists.
# # Create a temporary price for deletion test
# $TempPriceProdId = $ProductIdToUpdateOrDelete # Use an existing product
# $TempPriceIdForDelete = "price_$(Get-Random -Minimum 10000000000000 -Maximum 99999999999999)"
# & stripe price create --product="$TempPriceProdId" --currency=usd --unit-amount=500 --id="$TempPriceIdForDelete" | Out-Null
# $ArgumentArray = @(
#     "--override", "price:id=$($TempPriceIdForDelete)"
# )
# Invoke-StripeEvent -EventName "price.deleted" -ArgumentArray $ArgumentArray


Write-Host "All test events triggered."
Write-Host "Check your 'stripe listen' terminal and Supabase function logs for details."
