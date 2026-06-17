import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuthContext, AUTH_ERRORS } from '@/lib/permissions/guard'
import { PLANS } from '@/lib/permissions/plans'
import { logAuditAction } from '@/lib/audit/log'
import { z } from 'zod'

type MemberRow = {
  id: string
  role: 'owner' | 'admin' | 'member'
  user_id: string
  joined_at: string
}

async function getUserByEmail(email: string) {
  const supabase = createAdminClient()
  const normalized = email.trim().toLowerCase()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data.users.find(user => user.email?.toLowerCase() === normalized) || null
}

// GET /api/team?business_id=xxx -> list members + invitations
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id')
  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })

  const supabase = createAdminClient()

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from('business_members')
      .select('id, role, user_id, joined_at')
      .eq('business_id', ctx.businessId)
      .order('joined_at', { ascending: true }),

    supabase
      .from('invitations')
      .select('id, email, role, expires_at, created_at, accepted_at')
      .eq('business_id', ctx.businessId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ])

  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 })

  const memberRows = (membersRes.data || []) as MemberRow[]
  const users = await Promise.all(
    memberRows.map(member => supabase.auth.admin.getUserById(member.user_id))
  )

  const members = memberRows.map((member, index) => {
    const user = users[index].data.user
    return {
      id: member.id,
      role: member.role,
      joined_at: member.joined_at,
      user_id: member.user_id,
      email: user?.email || '',
      name: user?.user_metadata?.name || user?.email || 'Unknown user',
      is_you: member.user_id === ctx.userId,
    }
  })

  return NextResponse.json({
    members,
    invitations: invitesRes.data || [],
    plan_limit: PLANS[ctx.plan].limits.max_members,
    current_count: members.length,
  })
}

const InviteSchema = z.object({
  business_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
})

// POST /api/team -> invite member
export async function POST(request: NextRequest) {
  const parsed = InviteSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('invite_member')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createAdminClient()
  const { email, role, business_id } = parsed.data
  const normalizedEmail = email.trim().toLowerCase()

  const { count } = await supabase
    .from('business_members')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', ctx.businessId)

  const maxMembers = PLANS[ctx.plan].limits.max_members
  if ((count || 0) >= maxMembers) {
    return NextResponse.json({
      error: `Plan ${ctx.plan} hanya support ${maxMembers} member. Upgrade untuk tambah lebih.`,
      upgrade_required: true,
    }, { status: 402 })
  }

  const invitedUser = await getUserByEmail(normalizedEmail)
  if (invitedUser) {
    const { data: existingMember } = await supabase
      .from('business_members')
      .select('id')
      .eq('business_id', business_id)
      .eq('user_id', invitedUser.id)
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json({ error: 'User sudah menjadi member' }, { status: 409 })
    }
  }

  await supabase
    .from('invitations')
    .delete()
    .eq('business_id', business_id)
    .eq('email', normalizedEmail)
    .is('accepted_at', null)

  const { data: invitation, error } = await supabase
    .from('invitations')
    .insert({
      business_id,
      email: normalizedEmail,
      role,
      invited_by: ctx.userId,
    })
    .select('id, token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const inviteUrl = `${appUrl}/api/team/invite/${invitation.token}`

  await logAuditAction({
    actorId: ctx.userId,
    action: 'invite_team_member',
    targetType: 'team',
    targetId: business_id,
    metadata: { invitation_id: invitation.id, email: normalizedEmail, role },
    ipAddress: request.headers.get('x-forwarded-for'),
  })

  return NextResponse.json({
    success: true,
    invitation_url: inviteUrl,
    message: `Undangan dibuat untuk ${normalizedEmail}. Link: ${inviteUrl}`,
  }, { status: 201 })
}

const UpdateRoleSchema = z.object({
  business_id: z.string().uuid(),
  member_id: z.string().uuid(),
  role: z.enum(['admin', 'member']),
})

// PATCH /api/team -> change role
export async function PATCH(request: NextRequest) {
  const parsed = UpdateRoleSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const ctx = await getAuthContext(parsed.data.business_id)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('change_member_role')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createAdminClient()

  const { data: target } = await supabase
    .from('business_members')
    .select('role, user_id')
    .eq('id', parsed.data.member_id)
    .eq('business_id', ctx.businessId)
    .single()

  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Tidak bisa mengubah role owner' }, { status: 400 })
  }

  const { error } = await supabase
    .from('business_members')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.member_id)
    .eq('business_id', ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAuditAction({
    actorId: ctx.userId,
    action: 'change_team_role',
    targetType: 'team',
    targetId: ctx.businessId,
    metadata: { member_id: parsed.data.member_id, user_id: target.user_id, role: parsed.data.role },
    ipAddress: request.headers.get('x-forwarded-for'),
  })

  return NextResponse.json({ success: true })
}

// DELETE /api/team?member_id=xxx&business_id=xxx -> remove member
export async function DELETE(request: NextRequest) {
  const memberId = request.nextUrl.searchParams.get('member_id')
  const businessId = request.nextUrl.searchParams.get('business_id')

  if (!memberId) return NextResponse.json({ error: 'member_id required' }, { status: 400 })

  const ctx = await getAuthContext(businessId)
  if (!ctx) return NextResponse.json(AUTH_ERRORS.unauthorized, { status: 401 })
  if (!ctx.can('remove_member')) return NextResponse.json(AUTH_ERRORS.forbidden, { status: 403 })

  const supabase = createAdminClient()

  const { data: target } = await supabase
    .from('business_members')
    .select('role, user_id')
    .eq('id', memberId)
    .eq('business_id', ctx.businessId)
    .single()

  if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Tidak bisa menghapus owner' }, { status: 400 })
  }
  if (target.user_id === ctx.userId) {
    return NextResponse.json({ error: 'Tidak bisa menghapus diri sendiri' }, { status: 400 })
  }

  const { error } = await supabase
    .from('business_members')
    .delete()
    .eq('id', memberId)
    .eq('business_id', ctx.businessId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAuditAction({
    actorId: ctx.userId,
    action: 'remove_team_member',
    targetType: 'team',
    targetId: ctx.businessId,
    metadata: { member_id: memberId, user_id: target.user_id },
    ipAddress: request.headers.get('x-forwarded-for'),
  })

  return NextResponse.json({ success: true })
}
