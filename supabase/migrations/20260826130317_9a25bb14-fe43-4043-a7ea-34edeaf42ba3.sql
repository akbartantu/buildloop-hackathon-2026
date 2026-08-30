DROP FUNCTION IF EXISTS public.is_email_domain_blocked(text);

CREATE OR REPLACE FUNCTION public.validate_pilot_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  domain_part text;
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.email := replace(replace(replace(NEW.email, ' ', ''), chr(9), ''), chr(160), '');

  domain_part := split_part(NEW.email, '@', 2);

  IF domain_part <> '' AND EXISTS (
    SELECT 1 FROM public.blocked_email_domains b
    WHERE domain_part = b.domain OR domain_part LIKE '%.' || b.domain
  ) THEN
    RAISE EXCEPTION 'disposable_email_domain' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.pain_point IS NOT NULL AND char_length(NEW.pain_point) > 500 THEN
    RAISE EXCEPTION 'pain_point_too_long' USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pilot_waitlist() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_pilot_waitlist() FROM anon;
REVOKE ALL ON FUNCTION public.validate_pilot_waitlist() FROM authenticated;