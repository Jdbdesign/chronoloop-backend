import { describe, it, expect, beforeEach } from 'vitest'
import { TestMailer } from '../../../src/lib/mailer.js'

describe('TestMailer', () => {
  beforeEach(() => TestMailer.reset())

  it('captures sent mail for assertions instead of sending it', async () => {
    await TestMailer.sendMail({ to: 'a@b.com', subject: 'Reset', body: 'link: xyz' })
    expect(TestMailer.sent).toHaveLength(1)
    expect(TestMailer.sent[0]).toEqual({ to: 'a@b.com', subject: 'Reset', body: 'link: xyz' })
  })

  it('reset() clears prior captures', async () => {
    await TestMailer.sendMail({ to: 'a@b.com', subject: 'x', body: 'y' })
    TestMailer.reset()
    expect(TestMailer.sent).toHaveLength(0)
  })

  it('does not throw when sending', async () => {
    await expect(
      TestMailer.sendMail({ to: 'a@b.com', subject: 'x', body: 'y' })
    ).resolves.toBeUndefined()
  })
})
