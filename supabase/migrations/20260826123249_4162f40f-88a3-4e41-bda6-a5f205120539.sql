CREATE TABLE public.pilot_waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL,
  pain_point text,
  consent boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pilot_waitlist_email_unique UNIQUE (email),
  CONSTRAINT pilot_waitlist_email_len CHECK (char_length(email) BETWEEN 3 AND 255),
  CONSTRAINT pilot_waitlist_role_check CHECK (role IN ('solo_builder','developer','product_manager','founder','other')),
  CONSTRAINT pilot_waitlist_pain_point_len CHECK (pain_point IS NULL OR char_length(pain_point) <= 500),
  CONSTRAINT pilot_waitlist_consent_check CHECK (consent = true)
);

GRANT INSERT (email, role, pain_point, consent) ON public.pilot_waitlist TO anon, authenticated;
GRANT ALL ON public.pilot_waitlist TO service_role;

ALTER TABLE public.pilot_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can join the waitlist"
  ON public.pilot_waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (consent = true);