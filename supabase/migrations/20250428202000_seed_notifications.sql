-- Seed notifications table with example data

INSERT INTO public.notifications (user_id, type, data, read, created_at)
VALUES
    -- Unread, Actionable (Profile)
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'profile_update', 
        '{"subject": "Update Required", "message": "Please review your profile settings.", "target_path": "/settings/profile"}',
        false,
        now() - interval '1 hour'
    ),
    -- Unread, Non-actionable (Info)
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'info', 
        '{"subject": "System Maintenance", "message": "Scheduled maintenance tonight at 2 AM UTC."}',
        false,
        now() - interval '2 hours'
    ),
    -- Read, Actionable (Billing)
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'billing_update', 
        '{"subject": "Invoice Ready", "message": "Your monthly invoice #INV-123 is available.", "target_path": "/settings/billing"}',
        true,
        now() - interval '1 day'
    ),
    -- Read, Non-actionable (Old Info)
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'info', 
        '{"subject": "Welcome!", "message": "Welcome to the Paynless Framework!"}',
        true,
        now() - interval '3 days'
    ),
    -- Unread, Actionable (Join Request Example - Requires Org Context usually)
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'org_join_request', 
        '{"subject": "Join Request", "message": "User ''Test User'' requested to join ''Example Org''.", "target_path": "/dashboard/organizations/ORG_ID_PLACEHOLDER/members", "requesting_user_id": "USER_ID_PLACEHOLDER", "org_id": "ORG_ID_PLACEHOLDER", "membership_id": "MEMBERSHIP_ID_PLACEHOLDER" }',
        false,
        now() - interval '5 minutes'
    ),
     -- Unread, Minimal Data
    (
        'aabf2433-3332-48eb-a79b-d17e6603800d', 
        'system_alert', 
        '{"message": "Critical system alert resolved."}',
        false,
        now() - interval '10 minutes'
    )
ON CONFLICT (id) DO NOTHING;
