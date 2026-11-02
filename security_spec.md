# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants & Relationship Mapping

1. **Master Source of Truth (`users/{userId}`)**:
   - Every authenticated, email-verified user owns exactly one profile document at `/users/{userId}` where `userId == request.auth.uid` and `data.uid == request.auth.uid`.
   - During profile creation, `role` MUST be `'reader'` unless the caller is already a verified administrator (`isAdmin()`). Self-assigned `'admin'` roles are strictly forbidden.
   - `bookmarks` is a bounded array (`size() <= 50`) of string series IDs (`size() <= 128`).
2. **PII Isolation (`users/{userId}/private/{docId}`)**:
   - Email addresses are strictly isolated from `/users/{userId}` and stored in `/users/{userId}/private/{docId}`.
   - Only the document owner (`isOwner(userId)`) or `isAdmin()` may read or write this subcollection, and the parent `/users/{userId}` document must exist with `uid == request.auth.uid`.
3. **Master Gate Relational Sync (`users/{userId}/progress/{seriesId}`)**:
   - Reading progress documents can only be read or written if the parent `/users/{userId}` document exists and its `uid` field matches `request.auth.uid` (verified via `get()`).
4. **Global Consistency Invariant (`comments/{commentId}` & `requests/{requestId}`)**:
   - A comment or series request cannot be created unless its `authorId` matches `request.auth.uid` AND the referenced user profile `/users/{authorId}` exists (`exists()`).
5. **Terminal State Locking (`requests/{requestId}`)**:
   - Once a `SeriesRequest` reaches the terminal status `'Acquired'`, no non-admin updates are permitted (`existing().status != 'Acquired' || isAdmin()`).
6. **Admin Library Catalog, Chapter Persistence & Studio Chapter Edits (`series/{seriesId}`, `chapters/{chapterId}`, & `chapter_edits/{editId}`)**:
   - Public catalog and translation overlay reads (`get`, `list`) are bounded by resource field validation (`existing().title.size() >= 1 && existing().totalViews >= 0` for series, `existing().title.size() >= 1 && existing().views >= 0` for chapters, `existing().version == 1` for chapter_edits).
   - Creation, updates, and deletion of `/series/{seriesId}`, `/chapters/{chapterId}`, and `/chapter_edits/{editId}` are strictly restricted to verified administrators (`isAdmin()`) with strict key allowlists (`hasAll` + `hasOnly`), bounded arrays (`genres.size() <= 12`, `pageUrls.size() <= 60`, `pages.size() <= 60`), and immutable identity/creation timestamps (`id`, `seriesId`, `chapterId`, `createdAt`).
7. **Temporal Integrity & Immutable Fields**:
   - All `createdAt` and `updatedAt` fields must equal `request.time` on creation, and `createdAt` + ownership identifiers (`uid`, `userId`, `authorId`, `seriesId`, `chapterId`, `id`) are strictly immutable on update (`incoming().updatedAt == request.time`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Self-Assigned Admin Role Escalation)**:
   - Target: `CREATE /users/user_123`
   - Payload: `{ "uid": "user_123", "username": "Hacker", "role": "admin", "bookmarks": [], "createdAt": "<SERVER_TIME>", "updatedAt": "<SERVER_TIME>" }`
   - Expected: `PERMISSION_DENIED` (non-admin cannot create profile with `role: "admin"`).
2. **Payload 2 (Identity Spoofing on User Profile)**:
   - Target: `CREATE /users/victim_999` (authenticated as `user_123`)
   - Payload: `{ "uid": "victim_999", "username": "Spoofer", "role": "reader", "bookmarks": [], "createdAt": "<SERVER_TIME>", "updatedAt": "<SERVER_TIME>" }`
   - Expected: `PERMISSION_DENIED` (`request.auth.uid != userId`).
3. **Payload 3 (Shadow Field Injection on Profile Update)**:
   - Target: `UPDATE /users/user_123`
   - Payload: `{ "uid": "user_123", "username": "ValidName", "role": "reader", "bookmarks": [], "isVerified": true, "createdAt": "<EXISTING>", "updatedAt": "<SERVER_TIME>" }`
   - Expected: `PERMISSION_DENIED` (`hasOnly` rejects unknown field `isVerified`).
4. **Payload 4 (Unverified Email Spoofing Attack on Admin)**:
   - Target: `UPDATE /requests/req_1` (authenticated with `email: "yuniquearun@gmail.com"`, `email_verified: false`)
   - Payload: `{ ...status: "Acquired" }`
   - Expected: `PERMISSION_DENIED` (`isVerifiedUser()` requires `email_verified == true`).
5. **Payload 5 (Cross-User PII Read on Split Collection)**:
   - Target: `GET /users/victim_999/private/info` (authenticated as `user_123`)
   - Payload: N/A (Read request)
   - Expected: `PERMISSION_DENIED` (PII strictly restricted to `isOwner(userId) || isAdmin()`).
6. **Payload 6 (Orphaned Progress Write Without Parent User Profile)**:
   - Target: `CREATE /users/ghost_user/progress/solo-leveling` (where `/users/ghost_user` does not exist)
   - Payload: `{ "userId": "ghost_user", "seriesId": "solo-leveling", ... }`
   - Expected: `PERMISSION_DENIED` (Master Gate `get()` on parent `/users/{userId}` fails).
7. **Payload 7 (Orphaned Comment Creation Without Existing User Profile)**:
   - Target: `CREATE /comments/cmt_1` (where `/users/user_no_profile` does not exist)
   - Payload: `{ "chapterId": "ch_1", "seriesId": "s_1", "authorId": "user_no_profile", "username": "Anon", "content": "Hello", "spoiler": false, "upvotes": 0, "createdAt": "<SERVER_TIME>", "updatedAt": "<SERVER_TIME>" }`
   - Expected: `PERMISSION_DENIED` (`exists(/users/$(incoming().authorId))` fails).
8. **Payload 8 (ID Poisoning / Oversized Path Variable)**:
   - Target: `CREATE /comments/invalid$id!with@bad#chars`
   - Payload: Valid comment body
   - Expected: `PERMISSION_DENIED` (`isValidId(commentId)` regex guard fails).
9. **Payload 9 (Denial of Wallet / 1MB String Value Poisoning)**:
   - Target: `UPDATE /comments/cmt_1`
   - Payload: `{ ..., "content": "<2000-char string exceeding maxLength 1000>", "updatedAt": "<SERVER_TIME>" }`
   - Expected: `PERMISSION_DENIED` (`isValidComment` enforces `content.size() <= 1000`).
10. **Payload 10 (Terminal State Lock Bypass on Acquired Request)**:
    - Target: `UPDATE /requests/req_acquired` (where `existing().status == 'Acquired'`, caller is regular user)
    - Payload: `{ ..., "votes": 999, "updatedAt": "<SERVER_TIME>" }`
    - Expected: `PERMISSION_DENIED` (Terminal State Lock blocks updates when `existing().status == 'Acquired'`).
11. **Payload 11 (Unauthorized Non-Admin Series Catalog Mutation)**:
    - Target: `UPDATE /series/series-solo-leveling` (caller is non-admin reader)
    - Payload: `{ ..., "title": "Hacked Title", "updatedAt": "<SERVER_TIME>" }`
    - Expected: `PERMISSION_DENIED` (`isAdmin()` blocks non-admin writes to `/series/{seriesId}`).
12. **Payload 12 (Forged Client Timestamp on Creation)**:
    - Target: `CREATE /requests/req_2`
    - Payload: `{ ..., "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "2020-01-01T00:00:00Z" }`
    - Expected: `PERMISSION_DENIED` (`incoming().createdAt == request.time` rejects forged past/future timestamps).
