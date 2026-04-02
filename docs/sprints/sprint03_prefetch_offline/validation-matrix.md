# Sprint 03 Validation Matrix

This document is the explicit sign-off matrix for Sprint 03 offline readiness.

Use it with [plan.md](plan.md) and [../../review-0401.md](../../review-0401.md).

---

## 1. Automated Backend Checks

These should pass before any manual testing begins.

- [ ] `pytest` passes locally
- [ ] Offline bundle auth/access tests pass
- [ ] Resume token helper tests pass
- [ ] Found-event idempotency tests pass
- [ ] Wrong-team / malformed payload tests pass

Expected current automated scope:

- offline bundle endpoint
- magic-link + resume-token flow helpers
- direct found-event replay/idempotency
- geo validation missing-coordinate rejection
- non-member rejection for found-event sync
- authoritative game-state refresh after sync

---

## 2. Browser Validation Checks

Run these in a normal desktop browser before device testing.

### Login / resume
- [ ] Log in on a clean browser profile
- [ ] Confirm magic-link handoff stores a resume token
- [ ] Reload and confirm session still works
- [ ] Corrupt/missing token path does not trap the user in a broken state

### Prefetch
- [ ] Download offline bundle from the account page
- [ ] Confirm progress and success status appear
- [ ] Confirm remove action works
- [ ] Retry download after removal

### Offline route mode
- [ ] Open route mode online first
- [ ] Disable network
- [ ] Reload route mode
- [ ] Confirm clues still render from cached bundle
- [ ] Confirm pending-sync UI is visible when expected

### Offline map mode
- [ ] Open map mode online first
- [ ] Disable network
- [ ] Reload map mode
- [ ] Confirm pins/popups still render from cached bundle
- [ ] Confirm pending-sync UI is visible when expected

### Queue + sync
- [ ] Mark one location while offline
- [ ] Confirm pending count increments
- [ ] Reload the page and confirm pending state survives
- [ ] Reconnect on Wi‑Fi and confirm sync clears pending state
- [ ] Reconnect on metered/cellular and confirm sync waits for consent unless enabled

---

## 3. Real Device Checks

Minimum device mix:

- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] One lower-end or storage-constrained Android device

Per-device checks:

- [ ] Login works
- [ ] Offline bundle downloads
- [ ] Route mode works offline
- [ ] Map mode works offline
- [ ] Offline find survives reload
- [ ] Reconnect sync succeeds
- [ ] Cellular fallback behavior is understandable

---

## 4. Multi-Device / Team Conflict Checks

Run these with at least two devices on the same team.

- [ ] Device A marks a location offline
- [ ] Device B marks the same location offline
- [ ] Device A syncs first
- [ ] Device B syncs later
- [ ] Final server progress is consistent
- [ ] Neither device shows misleading “lost” progress

Also check:

- [ ] one device with stale bundle vs one with fresh bundle
- [ ] repeated replay of the same found event does not duplicate progress

---

## 5. Event Rehearsal Sign-Off

Minimum rehearsal:

- [ ] 2 teams
- [ ] 2 devices per team
- [ ] at least 1 iPhone and 1 Android
- [ ] one offline segment of 15–20 minutes
- [ ] one reconnect sync segment on Wi‑Fi
- [ ] one manual cellular-sync fallback check

Go / no-go sign-off:

- [ ] Offline bundle downloads successfully on target devices
- [ ] Cached assets survive reload
- [ ] Offline progress survives reload
- [ ] Pending sync state is visible and understandable
- [ ] Wi‑Fi reconnect sync works end-to-end
- [ ] Cellular fallback requires explicit user action
- [ ] No duplicate location completions after sync
- [ ] No player progress lost in rehearsal
- [ ] Operator can explain recovery steps

If any item above fails, offline mode stays disabled for production event use.
