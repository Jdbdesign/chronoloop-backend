import { buildApp, type BuildAppOptions } from '../../src/app.js'

// Every test app — including ones that need a custom mailer (TestMailer) —
// goes through the real buildApp(), so it always gets the production
// middleware stack (helmet, cors, cookieParser, 'express-async-errors',
// errorHandler) instead of a test file re-assembling its own subset and
// risking a gap. See src/app.ts's BuildAppOptions doc comment.
export function testApp(options?: BuildAppOptions) {
  return buildApp(options)
}
