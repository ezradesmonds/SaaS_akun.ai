-- Preserve member access while closing anonymous aggregate/RPC exposure.
ALTER VIEW public.account_balances SET (security_invoker = true);
ALTER VIEW public.monthly_summary SET (security_invoker = true);
ALTER VIEW public.admin_stats SET (security_invoker = true);
REVOKE ALL ON public.account_balances, public.monthly_summary, public.business_plan_info FROM PUBLIC, anon;
REVOKE ALL ON public.admin_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_stats TO service_role;

DO $$ DECLARE routine record; BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname IN (
      'auto_add_owner_member','create_default_accounts','current_user_is_business_member',
      'increment_usage','is_business_admin','is_business_member','is_business_owner','is_super_admin',
      'post_invoice_issuance','post_journal_transaction','record_invoice_payment_atomic',
      'replace_transaction_lines','reverse_journal_transaction')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', routine.signature);
  END LOOP;
END $$;
-- Retired edit RPC and setup helper are not called by the client application.
REVOKE EXECUTE ON FUNCTION public.replace_transaction_lines(uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_accounts(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_add_owner_member() FROM authenticated;
ALTER FUNCTION public.create_default_accounts(uuid) SET search_path = public;
ALTER FUNCTION public.is_super_admin(uuid) SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.increment_usage(p_business_id uuid, p_field text, p_amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(p_business_id,auth.uid()) THEN
    RAISE EXCEPTION 'Business membership required';
  END IF;
  IF p_field NOT IN ('tx_count','ai_calls','ocr_scans') OR p_amount IS NULL OR p_amount < 1 OR p_amount > 10 THEN
    RAISE EXCEPTION 'Invalid usage increment';
  END IF;
  INSERT INTO public.usage_records (business_id,period,tx_count,ai_calls,ocr_scans)
  VALUES (p_business_id,to_char(now(),'YYYY-MM'),
    CASE WHEN p_field='tx_count' THEN p_amount ELSE 0 END,
    CASE WHEN p_field='ai_calls' THEN p_amount ELSE 0 END,
    CASE WHEN p_field='ocr_scans' THEN p_amount ELSE 0 END)
  ON CONFLICT (business_id,period) DO UPDATE SET
    tx_count=usage_records.tx_count+EXCLUDED.tx_count,
    ai_calls=usage_records.ai_calls+EXCLUDED.ai_calls,
    ocr_scans=usage_records.ocr_scans+EXCLUDED.ocr_scans,
    updated_at=now();
END $$;
REVOKE EXECUTE ON FUNCTION public.increment_usage(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid,text,integer) TO authenticated;
