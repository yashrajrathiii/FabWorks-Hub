-- Allow admins to manage other users' profiles (approve / revoke access).
-- Self-updates still can't change role (existing policy); this one is admin-only.
CREATE POLICY "Admins update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
