import { describe, it, expect } from 'vitest'
import { PERMISSIONS } from '../../../src/lib/permissions.js'

describe('PERMISSIONS matrix', () => {
  it('matches the ported ROLE_PERMISSIONS table for a sample of roles/permissions', () => {
    expect(PERMISSIONS.CREATE_TASKS.OWNER).toBe(true)
    expect(PERMISSIONS.CREATE_TASKS.VIEWER).toBe(false)
    expect(PERMISSIONS.DELETE_TASKS.MEMBER).toBe(false)
    expect(PERMISSIONS.INVITE_MEMBERS.ADMIN).toBe(true)
    expect(PERMISSIONS.INVITE_MEMBERS.MEMBER).toBe(false)
    expect(PERMISSIONS.ACCESS_BILLING.OWNER).toBe(true)
    expect(PERMISSIONS.ACCESS_BILLING.ADMIN).toBe(false)
    expect(PERMISSIONS.DELETE_WORKSPACE.ADMIN).toBe(false)
    expect(PERMISSIONS.DELETE_WORKSPACE.OWNER).toBe(true)
  })
})
