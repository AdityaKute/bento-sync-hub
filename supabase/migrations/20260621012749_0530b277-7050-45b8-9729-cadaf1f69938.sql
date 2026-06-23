
-- 1. Profiles: restrict SELECT to self + admin
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Prevent privilege escalation via profile self-update
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Storage: remove public read; allow only owner + admin
DROP POLICY IF EXISTS "Public read documents" ON storage.objects;
DROP POLICY IF EXISTS "Users read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins read all documents" ON storage.objects;
DROP POLICY IF EXISTS "Users read own files" ON storage.objects;
DROP POLICY IF EXISTS "Admins read all files" ON storage.objects;
CREATE POLICY "Users read own files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
CREATE POLICY "Admins read all files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND public.has_role(auth.uid(), 'admin')
  );

-- 4. Lock down has_role EXECUTE to authenticated only (revoke public/anon)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
