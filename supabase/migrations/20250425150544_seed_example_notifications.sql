-- Seed example notifications for user aabf2433-3332-48eb-a79b-d17e6603800d

-- Simple informational notification
INSERT INTO public.notifications (user_id, type, data, read)
VALUES (
    'aabf2433-3332-48eb-a79b-d17e6603800d',
    'info',
    '{"message": "This is a simple info notification."}',
    false
);

-- Notification with a target path for navigation
INSERT INTO public.notifications (user_id, type, data, read)
VALUES (
    'aabf2433-3332-48eb-a79b-d17e6603800d',
    'navigation',
    '{"message": "Click here to go to your profile.", "target_path": "/profile"}',
    false
);

-- Slightly longer notification
INSERT INTO public.notifications (user_id, type, data, read)
VALUES (
    'aabf2433-3332-48eb-a79b-d17e6603800d',
    'alert',
    '{"subject": "System Update", "message": "A system update was completed successfully overnight. No action required."}',
    false
);

-- Placeholder: Organization Join Request (Requires Org Features)
-- NOTE: target_path might need adjustment based on final implementation
INSERT INTO public.notifications (user_id, type, data, read)
VALUES (
    'aabf2433-3332-48eb-a79b-d17e6603800d', -- Assume this user is an admin receiving the request
    'organization_join_request',
    '{
        "message": "A user requested to join Example Org.", 
        "org_id": "00000000-0000-0000-0000-000000000001", 
        "requesting_user_id": "00000000-0000-0000-0000-000000000002", 
        "target_path": "/dashboard/organizations/00000000-0000-0000-0000-000000000001/members?filter=pending"
     }',
    false
);

-- Placeholder: Role Change Notification (Requires Org Features)
INSERT INTO public.notifications (user_id, type, data, read)
VALUES (
    'aabf2433-3332-48eb-a79b-d17e6603800d',
    'organization_role_change',
    '{
        "message": "Your role in Example Org was changed to Admin.", 
        "org_id": "00000000-0000-0000-0000-000000000001", 
        "new_role": "admin"
     }',
    true -- Mark as read example
);
