# Sprint 04 — Camera Reliability, Fallbacks, and Admin Recovery

**Goal:** Make the selfie/camera validation flow reliable enough for real event use across more devices and lighting conditions, while ensuring players are not blocked when camera capture fails.

**Scope:** Camera startup stability, capture readiness, lower-light behavior, native fallback options, admin-confirm recovery flow, logging, and validation coverage.

**Out of scope:** Full computer-vision image quality scoring, full admin workflow redesign, and a complete rewrite of validation modes.

**Status:** Implemented in code; manual device validation still pending.

**References:**
- [docs/backlog.md](../../backlog.md)
- [docs/review-0330.md](../../review-0330.md)
- [docs/design/game_flow.md](../../design/game_flow.md)

---

## Why This Sprint Exists

Recent observations suggest the selfie path is functional but fragile:

- some captured selfies appeared blurry
- low-light conditions may have delayed autofocus / autoexposure settling
- the current flow appears to allow capture almost immediately after camera startup
- on at least one phone, the selfie modal appeared taller than the viewport, forcing the user to drag/scroll to reach the capture button
- camera/device/browser-specific log noise has likely appeared outside the primary dev environments
- there is no strong recovery path when camera capture fails during play

This creates two risks:

1. **quality risk** — blurry or poor selfie evidence in real play
2. **operational risk** — players can get stuck if camera access fails on an event device

Sprint 04 should reduce both risks.

---

## Current Observations from the Existing Flow

Based on the current implementation:

- camera startup relies on `getUserMedia()` and a live video stream frame capture
- capture appears to be allowed as soon as the stream starts
- there is no explicit stabilization wait for:
  - autofocus
  - exposure
  - white balance
  - non-zero video dimensions
- the current path requests the front camera (`facingMode: 'user'`)
- inset/clue overlay loading can fail independently of camera startup
- the selfie modal layout appears vulnerable to small/mobile viewport overflow because the video area can push the capture controls below the visible screen
- there is no fully realized fallback path when camera capture fails
- there is a partial backend concept for admin force-confirm, but it should not be trusted as a complete user-facing recovery path yet

---

## Sprint Outcome Definition

Sprint 04 is complete when:

1. the app delays selfie capture until camera readiness is believable,
2. users receive clearer feedback when the camera is still stabilizing,
3. camera failures no longer strand the player,
4. a native or simpler fallback path exists,
5. an organizer/admin can recover a blocked location when needed,
6. logs are specific enough to diagnose browser/OS differences,
7. the new flow is covered by targeted automated and manual checks.

---

## Design Principles

1. **Do not block gameplay on fragile camera behavior.**
2. **Prefer explicit readiness over instant capture.**
3. **Capture quality is secondary to graceful recovery.**
4. **Fallbacks should be operationally simple.**
5. **Admin recovery should be deliberate and auditable.**
6. **Cross-device diagnostics should be improved before assuming browser fault.**

---

## Proposed Workstreams

## Phase 0 — Instrument and Diagnose the Existing Camera Path

**Goal:** Make camera failures understandable before changing too much behavior.

**Plan:**
- Add structured logging around camera startup and capture:
  - browser/platform hints
  - `getUserMedia()` error `name`
  - error `message`
  - whether metadata loaded
  - video width/height at capture time
  - time from camera start to capture
- Distinguish among likely failures:
  - permission denied
  - unsupported camera API
  - overconstrained device selection
  - stream start failure
  - zero-dimension capture
  - inset-image load failure
- Add clear UI messaging for each major failure class.

**Acceptance criteria:**
- Camera logs are specific enough to compare behavior across devices.
- A tester can tell whether the failure was permissions, startup, readiness, or overlay-related.

---

## Phase 1 — Add Camera Readiness / Stabilization Guardrails

**Goal:** Reduce blurry or unstable early captures.

**Plan:**
- Disable the capture button until the video stream is genuinely ready.
- Wait for `loadedmetadata` / usable video dimensions.
- Add a short stabilization delay before enabling capture (for example ~500–1000 ms).
- Show a visible status such as:
  - `Starting camera…`
  - `Hold steady… optimizing image`
  - `Ready`
- Refuse capture if `videoWidth` / `videoHeight` are invalid.
- Optionally record the readiness duration in logs.

**Acceptance criteria:**
- Capture cannot occur before valid video dimensions exist.
- The UI communicates when the camera is still stabilizing.
- Early-frame blur should be reduced in manual testing.

---

## Phase 1b — Fix Mobile Selfie Modal Layout

**Goal:** Ensure the capture controls remain visible and usable on smaller phone screens.

**Problem observed:**
- On at least one phone, the selfie modal appeared larger than the viewport.
- The user had to drag/scroll to reach the capture button.
- This is consistent with a modal layout where the video region grows too tall and pushes controls off-screen.

**Plan:**
- Constrain modal content height on mobile (for example, with a viewport-relative max height).
- Use a flexible column layout so the video region can shrink when needed.
- Keep the action area visible at the bottom of the modal.
- Ensure the capture button never depends on the user scrolling to reach it.
- Add safe-area padding considerations for iPhone/home-indicator layouts.
- Reduce vertical spacing/padding on smaller screens.
- Test in portrait mode on smaller phones.

**Preferred UX direction:**
- Treat the selfie flow more like a full-screen mobile camera overlay:
  - close control at top
  - video region in the middle
  - capture action pinned at bottom

**Acceptance criteria:**
- On a phone-sized viewport, the capture button is visible without dragging around the modal.
- Portrait mobile layout remains usable with browser chrome visible.
- The modal does not feel oversized or clipped on tested devices.

---

## Phase 2 — Relax Camera Constraints and Improve Device Compatibility

**Goal:** Reduce device/browser-specific startup failures.

**Plan:**
- Keep the preferred selfie camera request first.
- If that fails, retry with looser constraints:
  - preferred: `facingMode: 'user'`
  - fallback: plain `video: true`
- Avoid overcommitting to constraints that some browsers only partially support.
- Add compatibility-safe error handling around `play()` and stream assignment.

**Acceptance criteria:**
- Devices that reject the preferred constraint can still fall back to a usable camera stream.
- Logging clearly shows which constraint path succeeded.

---

## Phase 3 — Add a Native Capture Fallback

**Goal:** Provide a simpler, OS-managed alternative when live in-browser capture is unreliable.

**Plan:**
- Add a fallback file-input option such as:
  - `<input type="file" accept="image/*" capture="user">`
- Present it when:
  - live camera startup fails,
  - the user explicitly chooses an alternate path,
  - the browser/device is known to be problematic in testing.
- Reuse the same validation submission path after a file is captured.

**Acceptance criteria:**
- The user can still provide a selfie-style image even if the live video path fails.
- The fallback path works on at least one iPhone and one Android device in manual testing.

---

## Phase 4 — Add an Admin-Confirm Recovery Path

**Goal:** Ensure event staff can unblock players when camera capture is not viable.

**Plan:**
- Decide between:
  - a dedicated admin endpoint for confirmation, or
  - a repaired/explicit version of the existing `force=true` concept.
- Prefer a dedicated admin route if possible for clarity.
- Require authenticated admin privileges.
- Record enough information for auditability:
  - team
  - location
  - acting admin
  - timestamp
  - optional reason (`camera_failed`, `device_incompatible`, `lighting_issue`, etc.)
- Add a small organizer-facing UI or clearly documented manual flow.

**Acceptance criteria:**
- An admin can unblock a player when the camera path is not usable.
- The override path is explicit, protected, and auditable.
- Normal player flow cannot access admin override behavior.

---

## Phase 5 — Improve User Messaging and Recovery UX

**Goal:** Reduce confusion during live failures.

**Plan:**
- Replace generic error toasts with clearer camera-specific recovery messages.
- Suggested recovery options:
  - `Try again`
  - `Use alternate capture`
  - `Ask organizer`
- If the camera is unavailable, keep the player in a recoverable state rather than dropping them into a broken modal flow.

**Acceptance criteria:**
- A player can understand what to do next after camera failure.
- Closing/retrying the camera path does not leave the modal or stream in a broken state.

---

## Phase 6 — Tests and Validation

**Implementation note:** Automated backend coverage for admin-confirm access control and success path is now in place. Manual device/browser validation from this phase is still required.

### Automated checks

Add or expand tests where feasible for:

- admin-confirm access control
- admin-confirm success path
- non-admin rejection for confirm path
- camera fallback-related request handling (where backend is involved)
- any new validation-mode branching logic

### Manual browser/device checks

#### Camera startup
- iPhone Safari in bright light
- iPhone Safari in lower light
- Android Chrome in bright light
- Android Chrome in lower light
- browser/device where prior log errors were seen

#### Modal layout / responsiveness
- capture button visible on smaller phones without scrolling
- portrait mode on iPhone
- portrait mode on Android
- browser UI chrome expanded/collapsed states do not hide the controls
- modal remains usable in home-screen/PWA mode if supported

#### Readiness behavior
- capture button disabled until ready
- readiness message visible
- dimensions valid before capture
- retry after denial or stream failure

#### Fallback behavior
- live stream fails → native capture fallback offered
- fallback image submits correctly
- inset/overlay failure does not confuse the user

#### Admin-confirm
- admin can confirm blocked location
- non-admin cannot trigger it
- override is visible in logs/audit trail

### Sign-off checklist

- [ ] camera startup errors are diagnosable
- [ ] blurry early captures are reduced in manual checks
- [ ] at least one fallback path works on both iPhone and Android
- [ ] admin-confirm recovery works end-to-end
- [ ] players are not stranded when camera capture fails

---

## Suggested Files to Touch

Likely implementation files:

- [app/static/js/camera.js](../../../app/static/js/camera.js)
- [app/static/js/validate.js](../../../app/static/js/validate.js)
- [app/static/js/validate-selfie.js](../../../app/static/js/validate-selfie.js)
- [app/api/routes.py](../../../app/api/routes.py)
- [app/templates/findloc.html](../../../app/templates/findloc.html)
- [app/templates/map/play.html](../../../app/templates/map/play.html) *(if map-mode selfie validation should share the same recovery path)*
- new tests under [tests/](../../../tests/)

---

## Recommended Delivery Order

1. instrument + classify failures
2. readiness/stabilization guardrails
3. looser camera-constraint fallback
4. native capture fallback
5. admin-confirm recovery
6. automated/manual validation

This order reduces risk by making failures visible before trying to patch every symptom.

---

## Risks / Notes

- Browser camera APIs remain inconsistent across devices.
- Native capture fallback may behave differently in PWA/home-screen mode.
- Admin-confirm must not become the default path; it is a recovery tool.
- Better camera reliability may reduce but not eliminate low-light blur.
- If image evidence quality becomes business-critical, a true native app may eventually be a better camera platform than browser capture.

---

## Checklist

- [ ] Phase 0 — instrument camera startup/capture failures
- [ ] Phase 1 — add stabilization/readiness gating
- [ ] Phase 2 — add looser constraint fallback
- [ ] Phase 3 — add native capture fallback
- [ ] Phase 4 — add admin-confirm recovery path
- [ ] Phase 5 — improve failure/retry UX
- [ ] Phase 6 — validate with tests and real devices

---

*End of plan.*
