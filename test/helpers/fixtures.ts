import type { WorkspaceRole } from '@prisma/client'
import { db } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { signAccessToken } from '../../src/lib/jwt.js'

let emailCounter = 0

export async function createUser() {
  emailCounter += 1
  return db.user.create({
    data: {
      email: `user${emailCounter}@example.com`,
      passwordHash: await hashPassword('x'),
      firstName: 'Test',
      lastName: `User${emailCounter}`,
    },
  })
}

export async function createWorkspaceWithOwner(workspaceName = 'Acme') {
  const owner = await createUser()
  const workspace = await db.workspace.create({
    data: { name: workspaceName, slug: workspaceName.toLowerCase().replace(/\s+/g, '-') },
  })
  const member = await db.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER' },
  })
  return { owner, workspace, member, token: signAccessToken(owner.id) }
}

export async function addMember(workspaceId: string, role: WorkspaceRole = 'MEMBER') {
  const user = await createUser()
  const member = await db.workspaceMember.create({ data: { workspaceId, userId: user.id, role } })
  return { user, member, token: signAccessToken(user.id) }
}
