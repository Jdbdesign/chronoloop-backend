# Backlog

## Projects — ProjectMember Add/Remove CRUD (Deferred from B3)

`chronoloop-backend`'s Projects domain (B3, plan Decision 1) ships `ProjectMember`
as a seed-only read-through: `project.members` is populated at creation time from a
`memberIds` array in `POST /projects`, returned as a nested array on every project
response, but never mutated by any B3 endpoint — no `POST /projects/:id/members`,
no `DELETE /projects/:id/members/:memberId`.

This follows the same pattern as B2's Attachments (read-only nested array, no write
path, documented in frontend BACKLOG.md) and B3's own Milestones — don't build a
write path nothing in the frontend calls yet. The `WorkspaceMember.projectMemberships`
relation being present in the schema reflects the shared schema being written once for
the whole app, not a B3 commitment to a CRUD surface.

**What a future phase needs to build, as a pair (not independently — one without the
other is a dead feature):**

- **Backend:** `POST /projects/:id/members { memberId }` and
  `DELETE /projects/:id/members/:memberId`, both gated by `requireRole('MANAGE_PROJECTS')`.
  An `assertValidMember` helper (same pattern as B2's `assertValidAssignee`) to confirm
  `memberId` is an active `WorkspaceMember` of the project's workspace before inserting.
- **Frontend:** an actual add/remove affordance in the project detail panel
  (`ProjectDetailPanel.tsx` currently renders the team grid read-only — an "Edit project
  coming soon" toast fires on the edit button; no member management UI exists today).

Flagged now (B3 planning, 2026-09-27) so "project.members never changes after creation"
isn't later mistaken for a bug — same pattern as the Attachment-upload and
Accept-Invite-While-Logged-In entries in the frontend BACKLOG.md.
