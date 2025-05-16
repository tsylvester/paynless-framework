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
$RecurringPriceId = "price_1RABirIskUlhzlIxSaAQpFe2" # Replace with a Test Price ID for a subscription product
$ProductIdToUpdateOrDelete = "prod_S4KNYUZ1J6yv75" # Replace with a Test Product ID
$PriceIdToUpdateOrDelete = "price_1RABirIskUlhzlIxSaAQpFe2" # Replace with a Test Price ID
$SubscriptionIdToUpdateOrDelete = "sub_1RPQUFIskUlhzlIxaM8Rws0Y" # Replace with a Test Subscription ID

# For checkout.session.completed, you typically have an internal ID stored in metadata
$InternalPaymentIdForOneTime = "ipid_$(New-Guid)" # Example: Generate a new one or use a known test one
$InternalPaymentIdForSubscription = "ipid_$(New-Guid)" # Example: Generate a new one or use a known test one

# --- Helper Function to Execute and Log Stripe Commands ---
function Invoke-StripeEvent {
    param(
        [string]$EventName,
        [string]$CommandArgs
    )
    Write-Host "----------------------------------------------------"
    Write-Host "Triggering: $EventName"
    Write-Host "Command: stripe trigger $EventName $CommandArgs"
    Write-Host "----------------------------------------------------"
    try {
        stripe trigger $EventName $CommandArgs
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
Write-Host "IMPORTANT: Replace placeholder IDs in this script with your actual Stripe Sandbox test IDs."
Read-Host -Prompt "Press Enter to continue if you have updated the IDs and stripe listen is running"

# 1. checkout.session.completed (One-time payment)
# Simulates a successful one-time purchase.
$test_args = "--add `"checkout_session:metadata.internal_payment_id=$InternalPaymentIdForOneTime`" --add `"checkout_session:customer=$CustomerId`" --add `"checkout_session:line_items[0].price=$OneTimePriceId`" --add `"checkout_session:line_items[0].quantity=1`" --add `"checkout_session:mode=payment`" --add `"checkout_session:payment_status=paid`""
Invoke-StripeEvent -EventName "checkout.session.completed" -CommandArgs $test_args

# 2. checkout.session.completed (New subscription)
# Simulates a new subscription creation.
$NewSubscriptionId = "sub_$(Get-Random -Minimum 10000000000000 -Maximum 99999999999999)" # Placeholder for a new sub id
$test_args = "--add `"checkout_session:metadata.internal_payment_id=$InternalPaymentIdForSubscription`" --add `"checkout_session:customer=$CustomerId`" --add `"checkout_session:line_items[0].price=$RecurringPriceId`" --add `"checkout_session:line_items[0].quantity=1`" --add `"checkout_session:mode=subscription`" --add `"checkout_session:payment_status=paid`" --add `"checkout_session:subscription=$NewSubscriptionId`""
Invoke-StripeEvent -EventName "checkout.session.completed" -CommandArgs $test_args

# 3. invoice.payment_succeeded (Subscription renewal)
# Simulates a successful recurring payment for an existing subscription.
# NOTE: For this to be fully realistic, the $SubscriptionIdToUpdateOrDelete should exist and be active.
$test_args = "--add `"invoice:customer=$CustomerId`" --add `"invoice:subscription=$SubscriptionIdToUpdateOrDelete`" --add `"invoice:billing_reason=subscription_cycle`""
Invoke-StripeEvent -EventName "invoice.payment_succeeded" -CommandArgs $test_args

# 4. invoice.payment_failed
# Simulates a failed payment for an invoice (e.g., subscription renewal).
$test_args = "--add `"invoice:customer=$CustomerId`" --add `"invoice:subscription=$SubscriptionIdToUpdateOrDelete`" --add `"invoice:billing_reason=subscription_cycle`""
Invoke-StripeEvent -EventName "invoice.payment_failed" -CommandArgs $test_args

# 5. customer.subscription.updated
# Simulates a subscription being updated (e.g., plan change, cancellation at period end).
$test_args = "--add `"subscription:customer=$CustomerId`" --add `"subscription:id=$SubscriptionIdToUpdateOrDelete`" --add `"subscription:status=active`" --add `"subscription:cancel_at_period_end=false`"" # Modify as needed
Invoke-StripeEvent -EventName "customer.subscription.updated" -CommandArgs $test_args

# 6. customer.subscription.deleted
# Simulates a subscription being canceled/deleted.
$test_args = "--add `"subscription:customer=$CustomerId`" --add `"subscription:id=$SubscriptionIdToUpdateOrDelete`""
Invoke-StripeEvent -EventName "customer.subscription.deleted" -CommandArgs $test_args

# --- Product Events ---
# 7. product.created
Invoke-StripeEvent -EventName "product.created" -CommandArgs ""

# 8. product.updated
# NOTE: Assumes $ProductIdToUpdateOrDelete exists.
$test_args = "--add `"product:id=$ProductIdToUpdateOrDelete`""
Invoke-StripeEvent -EventName "product.updated" -CommandArgs $test_args

# 9. product.deleted
# NOTE: Assumes $ProductIdToUpdateOrDelete exists. This might fail if it has prices attached that aren't deleted.
# Consider creating a temporary product for this test then deleting it.
$TempProdIdForDelete = "prod_$(Get-Random -Minimum 10000000000000 -Maximum 99999999999999)"
stripe product create --name="Temp Product for Deletion Test" --id="$TempProdIdForDelete" | Out-Null
$test_args = "--add `"product:id=$TempProdIdForDelete`""
Invoke-StripeEvent -EventName "product.deleted" -CommandArgs $test_args


# --- Price Events ---
# 10. price.created
# NOTE: Requires a product to attach to. Using $ProductIdToUpdateOrDelete.
$test_args = "--add `"price:product=$ProductIdToUpdateOrDelete`" --add `"price:currency=usd`" --add `"price:unit_amount=1000`" --add `"price:recurring[interval]=month`""
Invoke-StripeEvent -EventName "price.created" -CommandArgs $test_args

# 11. price.updated
# NOTE: Assumes $PriceIdToUpdateOrDelete exists.
$test_args = "--add `"price:id=$PriceIdToUpdateOrDelete`" --add `"price:active=true`"" # Example: Toggling active status
Invoke-StripeEvent -EventName "price.updated" -CommandArgs $test_args

# 12. price.deleted
# NOTE: Assumes $PriceIdToUpdateOrDelete exists.
# Create a temporary price for deletion test
$TempPriceProdId = $ProductIdToUpdateOrDelete # Use an existing product
$TempPriceIdForDelete = "price_$(Get-Random -Minimum 10000000000000 -Maximum 99999999999999)"
stripe price create --product="$TempPriceProdId" --currency=usd --unit-amount=500 --id="$TempPriceIdForDelete" | Out-Null
$test_args = "--add `"price:id=$TempPriceIdForDelete`""
Invoke-StripeEvent -EventName "price.deleted" -CommandArgs $test_args


Write-Host "All test events triggered."
Write-Host "Check your 'stripe listen' terminal and Supabase function logs for details."
