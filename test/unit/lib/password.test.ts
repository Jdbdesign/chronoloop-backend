import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../../src/lib/password.js'

describe('password hashing', () => {
  it('produces a hash that verifies against the original password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('produces different hashes for the same input (salted)', async () => {
    const a = await hashPassword('same input')
    const b = await hashPassword('same input')
    expect(a).not.toBe(b)
  })

  it('encodes cost factor 12 in the hash', async () => {
    const hash = await hashPassword('same input')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
  })
})
