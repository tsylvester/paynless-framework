# Feature Name
Real-Time POS-to-Ecom Inventory Sync



## Feature Objective
The primary objective of this feature is to establish a unified single source of truth for both physical and digital inventory. By ensuring the Shopify online storefront accurately and continuously reflects the real-time physical inventory managed within the Toast POS, this integration captures immediate customer demand while preventing overselling. Powered by an event-driven middleware architecture, this synchronization actively mitigates the risk of customer frustration caused by out-of-stock items, directly contributing to the overarching goal of maximizing daily sell-through rates and seamlessly bridging the physical and digital bakery experience.



## User Stories
- As a customer, I want to see accurate stock levels online so I do not order an out-of-stock pastry.
- As a bakery manager, I want in-store purchases to automatically deduct from online availability to prevent double-selling.



## Acceptance Criteria
- A sale in Toast POS triggers an inventory webhook within 10 seconds.
- The integration middleware updates the corresponding Shopify product inventory within 60 seconds.
- Items reaching zero inventory automatically display as 'Sold Out' on the WordPress frontend.



## Dependencies
- Toast Inventory API
- Shopify Admin API
- Middleware event router



## Success Metrics
- < 1% discrepancy between physical and digital stock levels
- Zero online orders refunded due to out-of-stock issues

---

# Feature Name
Fresh Batch Automated Email Alerts



## Feature Objective
This feature aims to drive immediate customer engagement and foot traffic by notifying subscribed customers the moment a fresh batch of their favorite baked goods becomes available. Utilizing automated triggers derived from Toast POS inventory additions, the system routes 'Fresh Batch' events through the AWS Node.js integration middleware directly to the designated Email Service Provider (ESP). This automated flow establishes a highly engaging, personalized communication channel that capitalizes on the immediate consumer demand for freshly made products, thereby boosting omnichannel order volume and customer retention.



## User Stories
- As a customer, I want to receive an email the moment my favorite croissants are fresh out of the oven.
- As a marketer, I want the system to automatically handle these notifications without manual input.



## Acceptance Criteria
- An inventory increase event in Toast tagged as 'Fresh Batch' triggers the notification service.
- The system queries the CRM/Shopify for users with matching product preferences.
- Personalized emails are dispatched via the ESP within 5 minutes of the trigger.



## Dependencies
- Email Service Provider (ESP) API
- Customer preference database
- Toast custom item tagging



## Success Metrics
- 25%+ open rate on fresh batch emails
- Conversion rate of 10%+ within 2 hours of dispatch

---

# Feature Name
Automated Pricing Guidance Engine



## Feature Objective
The Automated Pricing Guidance Engine is designed to drastically reduce daily food waste and capture late-day revenue by dynamically adjusting product pricing based on the age of inventory or specific time-of-day thresholds. Leveraging scheduled chron jobs within the middleware architecture, this feature automates the discounting process across both the Shopify e-commerce backend and the Toast POS simultaneously. This removes the need for manual pricing interventions by the bakery staff and proactively incentivizes purchases during late afternoon hours to clear out day-old inventory.



## User Stories
- As a bakery owner, I want the system to discount day-old items automatically during the last 2 hours of operation.



## Acceptance Criteria
- System tracks the timestamp of inventory creation.
- When age thresholds or time-of-day thresholds are met, the middleware updates the Shopify price or applies a global discount script.
- In-store Toast POS receives a sync to match the new online price.



## Dependencies
- Shopify Price Rules API
- Toast POS Pricing API



## Success Metrics
- 15% reduction in daily unsold food waste
- Increase in late-day sales volume