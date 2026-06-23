-- One-time bootstrap script for the admin account.
-- Run this manually after the migrations have been pushed.
-- This script creates the admin user in auth.users and syncs the public profile/role rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Create the user if it does not already exist.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'admin@gmail.com'
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    )
    VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'admin@gmail.com',
      crypt('0123456789', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"],"role":"admin"}',
      '{"role":"admin"}'::jsonb
    )
    RETURNING id INTO v_admin_id;
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = crypt('0123456789', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE email = 'admin@gmail.com'
    RETURNING id INTO v_admin_id;

    IF v_admin_id IS NULL THEN
      SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@gmail.com';
    END IF;
  END IF;

  -- Ensure the public profile row exists and has the correct role.
  INSERT INTO public.profiles (id, email, role)
  VALUES (v_admin_id, 'admin@gmail.com', 'admin')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role;

  -- Ensure the role mapping exists.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_admin_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$$;
