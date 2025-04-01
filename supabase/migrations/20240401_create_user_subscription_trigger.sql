-- Create a function to assign free plan to new users
CREATE OR REPLACE FUNCTION assign_free_plan()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a free subscription for the new user
  INSERT INTO user_subscriptions (user_id, plan_id, status, cancel_at_period_end)
  VALUES (
    NEW.id, 
    '307b5c17-b505-4e57-b0a6-8c525239528b', 
    'free', 
    false
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run after a new user is inserted
DROP TRIGGER IF EXISTS assign_free_plan_trigger ON auth.users;
CREATE TRIGGER assign_free_plan_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION assign_free_plan(); 