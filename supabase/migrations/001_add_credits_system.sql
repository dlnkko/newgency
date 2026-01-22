-- Migration: Add credits system to profiles table
-- This migration adds credits column and RPC function for atomic credit consumption

-- Step 1: Add credits column to profiles table (if it doesn't exist)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0 NOT NULL;

-- Step 2: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_credits ON profiles(credits);

-- Step 3: Create RPC function to consume credits atomically
-- This function ensures thread-safe credit consumption
CREATE OR REPLACE FUNCTION consume_credit(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  -- Get current credits and lock the row
  SELECT credits INTO current_credits
  FROM profiles
  WHERE id = user_id
  FOR UPDATE;
  
  -- Check if user exists and has credits
  IF current_credits IS NULL THEN
    RETURN FALSE;
  END IF;
  
  IF current_credits <= 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Decrement credits atomically
  UPDATE profiles
  SET credits = credits - 1
  WHERE id = user_id
    AND credits > 0;
  
  -- Check if update was successful
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$;

-- Step 4: Create RPC function to add credits (for webhook)
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET credits = credits + amount
  WHERE id = user_id;
  
  RETURN FOUND;
END;
$$;

-- Step 5: Enable Row Level Security (RLS) on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies
-- Policy: Users can only read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile (but not credits directly)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    -- Prevent users from modifying credits directly
    (OLD.credits = NEW.credits)
  );

-- Note: Credits can only be modified via RPC functions (consume_credit, add_credits)
-- which use SECURITY DEFINER to bypass RLS

