export interface Mail {
  to: string
  subject: string
  body: string
}

export async function sendMail(mail: Mail): Promise<void> {
  console.log(`[mailer stub] to=${mail.to} subject="${mail.subject}"\n${mail.body}`)
}

export const TestMailer = {
  sent: [] as Mail[],
  async sendMail(mail: Mail): Promise<void> {
    TestMailer.sent.push(mail)
  },
  reset(): void {
    TestMailer.sent = []
  },
}
