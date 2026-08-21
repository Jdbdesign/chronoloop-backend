import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testApp } from '../helpers/testApp.js'
import { resetDb } from '../helpers/resetDb.js'

describe('GET /health', () => {
  beforeEach(resetDb)

  it('returns ok status with a working db connection', async () => {
    const res = await request(testApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', db: 'ok' })
  })
})
