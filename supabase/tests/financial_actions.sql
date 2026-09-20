-- Non-destructive integration test against the connected project.
-- All synthetic action rows roll back. Requires a database owner connection.
BEGIN;
SELECT set_config('akunai.test_business', b.id::text, true),
       set_config('request.jwt.claims', json_build_object('sub', b.user_id, 'role', 'authenticated')::text, true)
FROM public.businesses b JOIN public.business_members m ON m.business_id=b.id AND m.user_id=b.user_id
LIMIT 1;
SET LOCAL ROLE authenticated;
INSERT INTO public.financial_actions (business_id, created_by, title, due_date, source_key)
VALUES (current_setting('akunai.test_business')::uuid, auth.uid(), 'Rollback-only action QA', current_date, 'rollback-only-action-qa');
UPDATE public.financial_actions SET status='done', completed_at=now()
WHERE business_id=current_setting('akunai.test_business')::uuid AND source_key='rollback-only-action-qa';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.financial_actions WHERE source_key='rollback-only-action-qa' AND status='done')
    THEN RAISE EXCEPTION 'Owner cannot complete action'; END IF;
  BEGIN
    UPDATE public.financial_actions SET title='Forbidden edit' WHERE source_key='rollback-only-action-qa';
    RAISE EXCEPTION 'Immutable action title was writable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_actions WHERE source_key='rollback-only-action-qa')
    THEN RAISE EXCEPTION 'Cross-business data exposed'; END IF;
  BEGIN
    INSERT INTO public.financial_actions (business_id, created_by, title, due_date, source_key)
    VALUES (current_setting('akunai.test_business')::uuid, auth.uid(), 'Forbidden action', current_date, 'rollback-forbidden');
    RAISE EXCEPTION 'Non-member could insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('anon','public.financial_actions','SELECT') THEN RAISE EXCEPTION 'Anonymous read grant'; END IF;
  IF has_table_privilege('authenticated','public.financial_actions','DELETE') THEN RAISE EXCEPTION 'Unexpected delete grant'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: owner insert/update, immutable columns, non-member isolation, anon denied; test data rolled back' AS verification;
