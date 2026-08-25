export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export const PERMISSIONS = {
  CREATE_TASKS: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
  DELETE_TASKS: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
  MANAGE_PROJECTS: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
  MANAGE_SPRINTS: { OWNER: true, ADMIN: true, MEMBER: true, VIEWER: false },
  INVITE_MEMBERS: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
  MANAGE_INTEGRATIONS: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
  ACCESS_BILLING: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
  DELETE_WORKSPACE: { OWNER: true, ADMIN: false, MEMBER: false, VIEWER: false },
  // MANAGE_WORKSPACE_SETTINGS has no row in the ported frontend matrix — see
  // "Decisions this plan makes" #7. Extrapolated as Owner/Admin, matching
  // MANAGE_INTEGRATIONS's scope. Flagged for confirmation.
  MANAGE_WORKSPACE_SETTINGS: { OWNER: true, ADMIN: true, MEMBER: false, VIEWER: false },
} as const

export type Permission = keyof typeof PERMISSIONS
