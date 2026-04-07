# Sprint 05 — Account UX, Team Switching, and Offline Readiness

**Goal:** Make the account flow feel event-ready by fixing team-switch theming, making offline bundle readiness more visible and less error-prone, and resolving navbar/subnav overlap issues.

**Scope:** Account page information architecture, switch-team behavior, offline bundle entry points and connection gating, account/game navbar layering, and small account-flow cleanup that supports these UX fixes.

**Out of scope:** A full account-page redesign, a full auth-system rewrite, a full service-layer extraction for all account routes, or background auto-sync beyond the existing Wi‑Fi-first policy.

**Status:** Implemented in code; automated validation complete; manual validation partially complete.

**References:**
- [docs/backlog.md](../../backlog.md)
- [docs/review-0330.md](../../review-0330.md)
- [docs/design/game_flow.md](../../design/game_flow.md)
- [docs/sprints/sprint03_prefetch_offline/plan.md](../sprint03_prefetch_offline/plan.md)

---

## Why This Sprint Exists

Recent account-flow UX issues are now blocking confidence more than core gameplay logic:

- switching teams does not reliably make the visible page theme feel like it changed to the new game immediately
- the offline bundle call-to-action is too buried under the `Options` tab, even though offline readiness is one of the most important player actions before leaving coverage
- the current offline download permission logic can falsely warn on a laptop/home Wi‑Fi connection
- the game-page subnav can cover the account dropdown, which makes navigation feel broken even when the underlying state is fine

This sprint is meant to tighten the “before play” and “switch context” experience rather than add new game modes.

---

## Current Observations from the Existing Flow

Based on the current implementation:

- base-template branding is injected server-side from the active team/game via the context processor in [app/__init__.py](../../../app/__init__.py)
- active team changes are written through `/api/switch_team`, but the account UI itself does not deliberately re-render the themed shell before leaving the page
- the account page still places offline download controls inside the `Options` tab in [app/templates/user/account.html](../../../app/templates/user/account.html), which hides a critical pre-play step behind a secondary tab
- offline bundle download confirmation in [app/static/js/account.js](../../../app/static/js/account.js) currently relies on `navigator.connection.type`, `effectiveType`, and `saveData`
- the current metered-network heuristic treats `effectiveType` values like `4g` as enough evidence of a metered connection, which is likely too aggressive on laptops and desktop-class browsers
- the base layout and play-page subnav both create stacking contexts, so the account dropdown in [app/templates/base.html](../../../app/templates/base.html) can be visually covered by play-page subnav content from [app/templates/findloc.html](../../../app/templates/findloc.html) and [app/templates/map/play.html](../../../app/templates/map/play.html)
- account/team/game flow logic remains concentrated in [app/main/routes.py](../../../app/main/routes.py), which the review already called out as a maintainability pressure point

---

## Sprint Outcome Definition

Sprint 05 is complete when:

1. switching teams causes the visible shell/theme to match the newly active game in a predictable way,
2. offline bundle readiness is surfaced earlier in the account journey,
3. confident Wi‑Fi/unmetered users are not needlessly blocked by cellular warnings,
4. metered/cellular users still must explicitly consent before a large download,
5. the account dropdown is always usable above the game subnav,
6. account-related route/template complexity is slightly reduced where it directly supports this work,
7. the revised behavior is documented and validated with targeted checks.

---

## Design Principles

1. **Pre-play readiness should be obvious, not hidden.**
2. **Theme changes must track active-team changes consistently.**
3. **Do not silently consume metered data.**
4. **Do not treat ambiguous network hints as definitive cellular proof.**
5. **Navigation layers must never obscure account controls.**
6. **Prefer focused cleanup while touching account flows, not broad unrelated refactors.**

---

## Backlog / Review Items to Pull Into This Sprint

While reviewing [docs/backlog.md](../../backlog.md) and [docs/review-0330.md](../../review-0330.md), the most relevant account-adjacent follow-ups to fold into this sprint are:

1. **`app/main/routes.py` pressure relief (account slice only)**
	 - The March 30 review explicitly called out `app/main/routes.py` as too large.
	 - This sprint is a good place to extract or at least isolate account/team-switch/offline-download concerns if the UX fixes touch those areas heavily.
	 - Status for Sprint 05: in scope as opportunistic cleanup, limited to account-related pieces.

2. **`teams/routes.py` cleanup**
	 - The backlog still lists `teams/routes.py` cleanup as open.
	 - This is adjacent to join/switch team UX because dead or partial team routes make the account journey harder to reason about.
	 - Status for Sprint 05: review and either finish/remove MVP-confusing paths if they overlap with account navigation.

3. **Operator/player offline guidance alignment**
	 - [docs/design/game_flow.md](../../design/game_flow.md) says players should open the account page and download the offline bundle before walking away from coverage.
	 - The current UI does not emphasize that strongly enough.
	 - Status for Sprint 05: definitely in scope.

The other backlog items — camera fallback/admin confirm, shared admin decorators, and the `password_hash` decision — are not primary Sprint 05 targets unless touched incidentally.

---

## Proposed Workstreams

## Phase 0 — Audit the Account Journey End-to-End

**Goal:** Establish the exact user path and where the current friction occurs.

**Plan:**
- Trace the account journey for:
	- first login → join game → switch active team → go play
	- existing player → open account → prepare for offline use → return to play
- Confirm how the active team influences:
	- base-template branding
	- game/team labels in the navbar
	- offline bundle target game/team
- Document where the current redirects and optimistic updates create mismatches between client state and visible themed shell.

**Acceptance criteria:**
- There is a clear written understanding of the current account flow.
- We know which transitions are client-only and which require a server render to refresh theming.

---

## Phase 1 — Fix Switch-Team Theme Consistency

**Goal:** Ensure switching teams makes the base shell feel correct immediately.

**Problem observed:**
- Theme values come from the active team/game on the server.
- Team switching is asynchronous.
- The account page does not currently guarantee a visible theme refresh before or during navigation.

**Plan:**
- Decide on one consistent post-switch behavior:
	- either re-render the account shell after switch,
	- or redirect through a server-rendered destination that clearly reflects the new theme,
	- or update the visible brand/theme client-side and then navigate.
- Make sure all visible shell cues update together:
	- navbar color
	- brand icon
	- brand caption
	- game/team metadata
- Verify the offline bundle panel also rebinds to the new active game/team.

**Acceptance criteria:**
- After switching teams, the visible theme matches the new game.
- Theme, active team, and bundle target cannot drift apart.
- The change feels intentional rather than delayed or incidental.

---

## Phase 2 — Move Offline Readiness Higher in the Account Flow

**Goal:** Make downloading the offline bundle an obvious “ready to play” step.

**Problem observed:**
- Offline download lives under `Options`, which reads like secondary preferences rather than mission-critical readiness.

**Plan:**
- Move or duplicate the offline bundle action into a more prominent place, such as:
	- a dedicated `Ready to play` section,
	- the switch-team area,
	- or an account-level readiness panel above secondary preferences.
- Keep the `Options` tab for actual preferences/troubleshooting, not the primary pre-event action.
- Make the panel clearly state:
	- which game/team will be downloaded
	- whether the bundle is already stored
	- what the player should do before leaving coverage
- Preserve remove/refresh capability without making the entry point feel hidden.

**Acceptance criteria:**
- A player can immediately see how to prepare offline.
- The offline action appears before they leave the account flow for gameplay.
- The UI better matches the operator guidance in [docs/design/game_flow.md](../../design/game_flow.md#L51-L61).

---

## Phase 3 — Correct Network Detection and Consent Rules for Bundle Downloads

**Goal:** Avoid false cellular warnings while preserving explicit consent on truly metered connections.

**Problem observed:**
- The current heuristic can classify a home Wi‑Fi laptop as metered because `effectiveType` alone is not a reliable proxy for “cellular.”

**Plan:**
- Tighten the bundle-download gating heuristic so it prefers:
	- explicit `saveData`
	- explicit `type === 'cellular'`
	- other browser hints only when confidence is strong
- Avoid treating ambiguous browser-reported throughput classes alone as definitive proof of cellular.
- Align the download policy with the product rule:
	- on confidently unmetered/Wi‑Fi connections, allow immediate download with a notification
	- on confidently metered/cellular connections, require explicit user consent
	- on ambiguous connections, choose a policy that does not repeatedly false-positive on desktop browsers
- Reuse or align with the existing Wi‑Fi-first sync language so the messaging is consistent across account and play UI.

**Acceptance criteria:**
- Laptop/home Wi‑Fi users are not spuriously warned in common cases.
- Metered users still must opt in.
- Status and confirmation text are understandable and consistent with the rest of the offline UX.

---

## Phase 4 — Add a More Immediate Offline Download Experience

**Goal:** Start offline preparation sooner when the app has enough confidence to do so.

**Plan:**
- When a player is clearly on an unmetered connection and has selected/switched to an active team, support a more immediate download path.
- Preferred behavior:
	- start download from the primary readiness UI without extra hidden steps
	- show a toast/status message immediately when the bundle begins and when it completes
- If the connection is metered or data-saving, do not auto-start; require explicit permission.
- Decide whether this should happen:
	- automatically right after switching teams on the account page,
	- or immediately from a prominent single-click readiness action.

**Acceptance criteria:**
- Offline preparation feels one-step on good connections.
- Success/failure is obvious through status text and notifications.
- Metered users are still protected.

---

## Phase 5 — Fix Navbar / Subnav Layering

**Goal:** Ensure the account dropdown is always usable on game pages.

**Problem observed:**
- The subnav on play pages can cover the account dropdown, likely due to stacking-context/z-index interactions.

**Plan:**
- Audit stacking contexts in:
	- [app/templates/base.html](../../../app/templates/base.html)
	- [app/templates/findloc.html](../../../app/templates/findloc.html)
	- [app/templates/map/play.html](../../../app/templates/map/play.html)
- Ensure the dropdown menu reliably appears above the subnav.
- Avoid solving this with extreme z-index inflation unless necessary; prefer a simple, stable layering model.
- Check both route mode and map mode.

**Acceptance criteria:**
- The account dropdown is not obscured by the subnav.
- The fix works on both play-page variants.
- There are no new regressions for modals, sync toasts, or other overlays.

---

## Phase 6 — Account-Flow Cleanup While Touching the Code

**Goal:** Reduce obvious maintenance friction directly related to this sprint.

**Plan:**
- If the account UX work requires significant edits in [app/main/routes.py](../../../app/main/routes.py), extract or isolate account-related helpers/routes where practical.
- Review whether `teams/routes.py` should remain part of the MVP account/team journey.
- Remove obvious account-page debug noise if it is still present in the live template.
- Keep cleanup intentionally narrow and tied to account UX, not a full architecture sweep.

**Acceptance criteria:**
- Account-related code touched by Sprint 05 is easier to reason about than before.
- No new duplicate logic is introduced around active-team resolution and branding.

---

## Phase 7 — Tests and Validation

### Automated checks

Add or expand tests where feasible for:

- account page rendering with different active teams/games
- switch-team response and post-switch account/play behavior
- offline bundle UI state for the active team/game
- any backend/context behavior that determines theming inputs

If pure browser network-detection logic is difficult to unit test in the current setup, document that gap and cover it manually.

### Manual checks

#### Team switching

- [x] switch from one themed game/team to another on the account page
- [x] confirm the visible shell reflects the new active game
- [x] confirm the destination page matches the new theme and team metadata

#### Offline readiness

- confirm the offline bundle action is easy to find from the account flow
- confirm download starts immediately on a normal laptop/Wi‑Fi path
- confirm completion messaging is visible
- confirm remove/re-download still works

#### Metered-consent behavior

- simulate or test on a metered/data-saving path where possible
- confirm explicit consent is required before large bundle download
- confirm the wording is clear and non-alarmist

#### Navigation layering

- open the account dropdown from route mode
- open the account dropdown from map mode
- confirm subnav never covers the dropdown on desktop and mobile widths

**Acceptance criteria:**
- Sprint 05 changes are covered by targeted regression checks.
- Manual validation is specific enough to catch the original user-reported issues.

---

## Risks / Watchouts

- Theme consistency depends on both client state and server-rendered context, so partial fixes may still feel inconsistent.
- Browser network-information APIs are inconsistent across platforms; overfitting to one browser can create new false positives elsewhere.
- Moving offline controls higher in the account flow should not make the page feel overwhelming or duplicate too much logic.
- Z-index fixes can accidentally break toasts, modals, or map overlays if not kept disciplined.

---

## Definition of Done

- [x] Switching active team reliably updates the visible game theming
- [x] Offline bundle readiness is promoted out of a hidden/secondary-feeling location
- [x] Normal unmetered users are not falsely warned about cellular/data-saving before download
- [ ] Metered users must explicitly consent before bundle download
- [ ] Account dropdown is never covered by the play subnav
- [x] Account-related code touched by this sprint is at least modestly cleaner
- [x] Sprint 05 behavior is documented and validated

---

## Recommended Implementation Order

1. Phase 0 — audit current flow
2. Phase 1 — fix switch-team theme consistency
3. Phase 5 — fix dropdown/subnav layering
4. Phase 2 — promote offline readiness in the account flow
5. Phase 3 — tighten metered-network detection and consent logic
6. Phase 4 — improve immediacy of offline download UX
7. Phase 6 — opportunistic account-related cleanup
8. Phase 7 — tests and manual validation

---

*End of Sprint 05 plan.*
