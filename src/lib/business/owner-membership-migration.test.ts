import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260916142412_repair_owner_memberships.sql'),
  'utf8',
)

describe('owner membership repair migration', () => {
  it('backfills every legacy business owner idempotently', () => {
    expect(migration).toContain('INSERT INTO public.business_members')
    expect(migration).toContain('ON CONFLICT (business_id, user_id) DO UPDATE')
    expect(migration).toContain("SET role = 'owner'")
  })

  it('keeps free subscription setup idempotent', () => {
    expect(migration).toContain('INSERT INTO public.subscriptions')
    expect(migration).toContain('ON CONFLICT (business_id) DO NOTHING')
  })

  it('does not expose the trigger function to public execution', () => {
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.auto_add_owner_member() FROM PUBLIC')
  })

  it('replaces the recursive membership policy with an authenticated helper', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.current_user_is_business_member')
    expect(migration).toContain('bm.user_id = (SELECT auth.uid())')
    expect(migration).toContain('DROP POLICY IF EXISTS "members_in_same_business"')
    expect(migration).toContain('TO authenticated')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.current_user_is_business_member(UUID) FROM PUBLIC')
  })
})
