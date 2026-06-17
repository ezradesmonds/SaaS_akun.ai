// ============================================================
// PLAN DEFINITIONS — single source of truth
// ============================================================

export type Plan = 'free' | 'starter' | 'pro'
export type MemberRole = 'owner' | 'admin' | 'member'

export interface PlanConfig {
  name: string
  price_idr: number          // monthly price in IDR
  mayar_product_code: string
  limits: {
    tx_per_month: number
    ai_calls_per_month: number
    max_businesses: number
    max_members: number
  }
  features: {
    export_pdf: boolean
    export_excel: boolean
    multi_user: boolean
    api_access: boolean
    priority_support: boolean
    whatsapp_bot: boolean
  }
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    name: 'Free',
    price_idr: 0,
    mayar_product_code: 'free',
    limits: {
      tx_per_month: 50,
      ai_calls_per_month: 30,
      max_businesses: 1,
      max_members: 1,
    },
    features: {
      export_pdf: false,
      export_excel: false,
      multi_user: false,
      api_access: false,
      priority_support: false,
      whatsapp_bot: false,
    }
  },

  starter: {
    name: 'Starter',
    price_idr: 29_000,
    mayar_product_code: 'starter',
    limits: {
      tx_per_month: 500,
      ai_calls_per_month: 300,
      max_businesses: 2,
      max_members: 3,
    },
    features: {
      export_pdf: true,
      export_excel: false,
      multi_user: true,
      api_access: false,
      priority_support: false,
      whatsapp_bot: false,
    }
  },

  pro: {
    name: 'Pro',
    price_idr: 79_000,
    mayar_product_code: 'pro',
    limits: {
      tx_per_month: 999_999,
      ai_calls_per_month: 999_999,
      max_businesses: 5,
      max_members: 10,
    },
    features: {
      export_pdf: true,
      export_excel: true,
      multi_user: true,
      api_access: true,
      priority_support: true,
      whatsapp_bot: true,
    }
  }
}

// ============================================================
// ROLE PERMISSIONS
// ============================================================
export interface PermissionSet {
  // Transactions
  create_transaction: boolean
  delete_transaction: boolean
  // Reports
  view_reports: boolean
  export_reports: boolean
  // Team
  invite_member: boolean
  remove_member: boolean
  change_member_role: boolean
  // Settings
  edit_business: boolean
  manage_accounts: boolean
  // Billing
  manage_billing: boolean
  // AI Chat
  use_ai_chat: boolean
}

export const ROLE_PERMISSIONS: Record<MemberRole, PermissionSet> = {
  owner: {
    create_transaction: true,
    delete_transaction: true,
    view_reports: true,
    export_reports: true,
    invite_member: true,
    remove_member: true,
    change_member_role: true,
    edit_business: true,
    manage_accounts: true,
    manage_billing: true,
    use_ai_chat: true,
  },
  admin: {
    create_transaction: true,
    delete_transaction: true,
    view_reports: true,
    export_reports: true,
    invite_member: true,
    remove_member: false,   // can't remove people
    change_member_role: false,
    edit_business: true,
    manage_accounts: true,
    manage_billing: false,  // can't touch billing
    use_ai_chat: true,
  },
  member: {
    create_transaction: true,
    delete_transaction: false, // read-only for delete
    view_reports: true,
    export_reports: false,
    invite_member: false,
    remove_member: false,
    change_member_role: false,
    edit_business: false,
    manage_accounts: false,
    manage_billing: false,
    use_ai_chat: true,
  }
}

// Helper
export function hasPermission(role: MemberRole, permission: keyof PermissionSet): boolean {
  return ROLE_PERMISSIONS[role][permission]
}
