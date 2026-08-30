REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pilot_waitlist FROM anon, authenticated;
REVOKE INSERT ON public.pilot_waitlist FROM anon, authenticated;
GRANT INSERT (email, role, pain_point, consent) ON public.pilot_waitlist TO anon, authenticated;