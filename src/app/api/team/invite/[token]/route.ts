import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAuditAction } from '@/lib/audit/log'

// GET /api/team/invite/[token] -> accept invitation
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  if (!user) {
    return NextResponse.redirect(
      `${appUrl}/auth/login?redirect=/api/team/invite/${params.token}`
    )
  }

  const { data: invitation } = await admin
    .from('invitations')
    .select('*')
    .eq('token', params.token)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invitation) {
    return NextResponse.redirect(`${appUrl}/dashboard?invite=expired`)
  }

  if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.redirect(`${appUrl}/dashboard?invite=wrong_email`)
  }

  const { data: existingOwner } = await admin
    .from('business_members')
    .select('role')
    .eq('business_id', invitation.business_id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (existingOwner) {
    await admin
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
    return NextResponse.redirect(`${appUrl}/dashboard?business_id=${invitation.business_id}&invite=already_member`)
  }

  const { error: memberError } = await admin
    .from('business_members')
    .upsert({
      business_id: invitation.business_id,
      user_id: user.id,
      role: invitation.role,
      invited_by: invitation.invited_by,
    }, { onConflict: 'business_id,user_id' })

  if (memberError) {
    return NextResponse.redirect(`${appUrl}/dashboard?invite=error`)
  }

  await admin
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  await logAuditAction({
    actorId: user.id,
    action: 'accept_team_invite',
    targetType: 'team',
    targetId: invitation.business_id,
    metadata: { invitation_id: invitation.id, role: invitation.role },
    ipAddress: request.headers.get('x-forwarded-for'),
  })

  return NextResponse.redirect(
    `${appUrl}/dashboard?business_id=${invitation.business_id}&invite=success`
  )
}
