-- 1. Blocked email domain list (server-only)
CREATE TABLE public.blocked_email_domains (
  domain text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_email_domains_normalized CHECK (domain = lower(btrim(domain)) AND domain <> '' AND domain NOT LIKE '% %')
);

GRANT ALL ON public.blocked_email_domains TO service_role;
-- No grants for anon/authenticated: list is never readable or writable by the public.

ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / SECURITY DEFINER functions can reach the rows.

-- 2. Seed known disposable / temporary email domains
INSERT INTO public.blocked_email_domains (domain) VALUES
  ('0-mail.com'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonbox.net'),
  ('burnermail.io'),
  ('byom.de'),
  ('cock.li'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('email-fake.com'),
  ('emailondeck.com'),
  ('emailtemporario.com.br'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('gefeatures.com'),
  ('getairmail.com'),
  ('getnada.com'),
  ('grr.la'),
  ('guerrillamail.com'),
  ('guerrillamail.biz'),
  ('guerrillamail.de'),
  ('guerrillamail.info'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('harakirimail.com'),
  ('inboxbear.com'),
  ('inboxkitten.com'),
  ('linshiyouxiang.net'),
  ('mail-temporaire.fr'),
  ('mail7.io'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailduck.io'),
  ('mailinator.com'),
  ('mailnesia.com'),
  ('mailsac.com'),
  ('mailtemp.net'),
  ('mailtm.com'),
  ('minuteinbox.com'),
  ('mintemail.com'),
  ('moakt.com'),
  ('mohmal.com'),
  ('mytemp.email'),
  ('nowmymail.com'),
  ('onetimemail.org'),
  ('pokemail.net'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spambog.com'),
  ('spamgourmet.com'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('tempail.com'),
  ('tempinbox.com'),
  ('tempm.com'),
  ('tempmail.plus'),
  ('tempmailo.com'),
  ('tempr.email'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmpmail.net'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trbvm.com'),
  ('vomoto.com'),
  ('wegwerfemail.de'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net'),
  ('zetmail.com');

-- 3. Domain check helper (exact domain + any subdomain of a blocked domain)
CREATE OR REPLACE FUNCTION public.is_email_domain_blocked(_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text;
  domain_part text;
BEGIN
  IF _email IS NULL THEN
    RETURN false;
  END IF;

  normalized := lower(btrim(_email));
  normalized := replace(replace(replace(normalized, ' ', ''), chr(9), ''), chr(160), '');

  IF position('@' IN normalized) = 0 THEN
    RETURN false;
  END IF;

  domain_part := split_part(normalized, '@', 2);
  IF domain_part = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.blocked_email_domains b
    WHERE domain_part = b.domain
       OR domain_part LIKE '%.' || b.domain
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_email_domain_blocked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_domain_blocked(text) TO anon, authenticated, service_role;

-- 4. Enforce on every insert/update of the waitlist, including direct Data API calls
CREATE OR REPLACE FUNCTION public.validate_pilot_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.email := replace(replace(replace(NEW.email, ' ', ''), chr(9), ''), chr(160), '');

  IF public.is_email_domain_blocked(NEW.email) THEN
    RAISE EXCEPTION 'disposable_email_domain' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.pain_point IS NOT NULL AND char_length(NEW.pain_point) > 500 THEN
    RAISE EXCEPTION 'pain_point_too_long' USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_pilot_waitlist_trigger ON public.pilot_waitlist;
CREATE TRIGGER validate_pilot_waitlist_trigger
  BEFORE INSERT OR UPDATE ON public.pilot_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.validate_pilot_waitlist();

-- 5. Hard length guard at the column level as well
ALTER TABLE public.pilot_waitlist
  DROP CONSTRAINT IF EXISTS pilot_waitlist_pain_point_max;
ALTER TABLE public.pilot_waitlist
  ADD CONSTRAINT pilot_waitlist_pain_point_max CHECK (pain_point IS NULL OR char_length(pain_point) <= 500);