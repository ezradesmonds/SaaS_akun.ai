-- Repair legacy workspaces created before the owner-membership trigger was
-- installed or while its policies were inconsistent.
INSERT INTO public.business_members (business_id, user_id, role)
SELECT b.id, b.user_id, 'owner'
FROM public.businesses b
WHERE b.user_id IS NOT NULL
ON CONFLICT (business_id, user_id) DO UPDATE
SET role = 'owner';

INSERT INTO public.subscriptions (business_id, plan, status)
SELECT b.id, 'free', 'active'
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

-- The original membership SELECT policy queried business_members from inside
-- its own policy and could fail with "infinite recursion detected in policy".
-- This helper executes the lookup outside RLS and always binds it to auth.uid().
CREATE OR REPLACE FUNCTION public.current_user_is_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_business_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_business_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "members_in_same_business" ON public.business_members;
DROP POLICY IF EXISTS "business_members_member_select" ON public.business_members;
CREATE POLICY "business_members_member_select" ON public.business_members
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_business_member(business_id));

-- Keep future business setup idempotent. The trigger function only copies the
-- owner recorded on the new business row and never trusts caller-supplied roles.
CREATE OR REPLACE FUNCTION public.auto_add_owner_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (business_id, user_id) DO UPDATE
  SET role = 'owner';

  INSERT INTO public.subscriptions (business_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (business_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_add_owner_member() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_business_created ON public.businesses;
CREATE TRIGGER on_business_created
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_owner_member();
