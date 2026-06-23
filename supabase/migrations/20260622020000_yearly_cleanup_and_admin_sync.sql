-- Yearly maintenance policy for non-admin users
-- This migration adds a cleanup function that removes users who are not admins
-- once they have been inactive for 1 year, and also deletes their storage files.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_non_admin_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  FOR v_user_id IN
    SELECT au.id
    FROM auth.users AS au
    LEFT JOIN public.user_roles AS ur
      ON ur.user_id = au.id AND ur.role = 'admin'
    LEFT JOIN public.profiles AS p
      ON p.id = au.id
    WHERE au.created_at < now() - interval '1 year'
      AND (ur.role IS NULL OR p.role IS DISTINCT FROM 'admin')
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'user-uploads'
      AND (storage.foldername(name))[1] = v_user_id::text;

    DELETE FROM auth.users
    WHERE id = v_user_id;
  END LOOP;
END;
$$;

-- Run once per year at 03:00 on January 1.
SELECT cron.schedule(
  'yearly-non-admin-cleanup',
  '0 3 1 1 *',
  $$SELECT public.cleanup_non_admin_users();$$
);

-- Keep the admin account sync logic explicit for future manual bootstrap runs.
CREATE OR REPLACE FUNCTION public.ensure_role_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'role', 'user')::public.app_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'user')::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_sync_roles ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_roles
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_role_sync();
