-- Decision workspace action plans. Apply after the existing migrations.
CREATE TABLE IF NOT EXISTS public.financial_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (business_id, source_key)
);
ALTER TABLE public.financial_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_actions_read ON public.financial_actions FOR SELECT TO authenticated
USING (public.is_business_member(business_id, auth.uid()));
CREATE POLICY financial_actions_insert ON public.financial_actions FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.business_members m WHERE m.business_id = financial_actions.business_id
  AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin', 'member')
));
CREATE POLICY financial_actions_update ON public.financial_actions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = financial_actions.business_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin', 'member')))
WITH CHECK (EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = financial_actions.business_id AND m.user_id = auth.uid() AND m.role IN ('owner', 'admin', 'member')));
REVOKE ALL ON public.financial_actions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.financial_actions TO authenticated;
GRANT UPDATE (status, completed_at) ON public.financial_actions TO authenticated;
CREATE INDEX IF NOT EXISTS financial_actions_business_due_idx ON public.financial_actions (business_id, status, due_date);
