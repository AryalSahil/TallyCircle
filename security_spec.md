# Security Specification — TallyCircle Friends Expense Tracker

## 1. Core Data Invariants
1. **Verified Identity Gate**: Every read and write operation requires `request.auth != null && request.auth.token.email_verified == true`.
2. **PII Isolation**: Private user fields (`email`, `phone`) live exclusively in `/users/{uid}` and are readable/writable only by `request.auth.uid == uid`. Public display profiles (`/publicProfiles/{uid}`) contain only `displayName`, `handle`, `photoUrl`, and optional `upiId` (no email or phone) and cannot be scraped via `list`.
3. **Exact Lookup Discovery**: `/userLookup/{lookupKey}` uses SHA-256 email hashes and handle keys with `allow list: if false` so users cannot enumerate registered accounts.
4. **No Cross-Group Access**: Accessing expenses, settlements, notes, or group activities under `/groups/{groupId}` requires active membership (`request.auth.uid in get(/databases/$(database)/documents/groups/$(groupId)).data.memberUids`). Friendship does not grant group access.
5. **No Duplicate Friendships**: Friendship documents use deterministic IDs `${minUid}_${maxUid}`, and creation requires `requesterUid == request.auth.uid` and `status == 'pending'`.
6. **Atomic & Revocable Invite Redemption**: Joining a group via invite requires a valid, active (`status == 'active'`), unexpired, under-limit `/groupInvites/{token}` document for that exact `groupId` updated atomically (`usesCount + 1`) in the same write batch (`getAfter`). Group-scoped `/groups/{groupId}/invites/{token}` and `/groups/{groupId}/emailInvites/{inviteId}` are readable/creatable/cancellable only by active group members.
7. **Terminal Settlement Locking**: Once a settlement reaches `status == 'confirmed'`, it is immutable and cannot be updated or deleted independently. Only the receiver (`toUid`) may confirm or dispute a settlement. Pending/unconfirmed settlements can be edited without altering `status`, `fromUid`, `toUid`, or `createdBy`.
8. **Strict Integer Money & Bounded Arrays**: All monetary fields (`amountPaise`) are integers `> 0`, arrays are strictly bounded (`<= 50` or `<= 100`), and all string fields enforce `.size()` bounds (`photoUrl <= 250000` for compressed JPEG avatars).
9. **Atomic Group Cascade Deletion & Isolated Friend Annotations**: Deleting historical `activities` or `confirmed` settlements is strictly rejected (`PERMISSION_DENIED`) unless `!existsAfter(/groups/{groupId})` in the same atomic batch. In accepted friendships, each user may only write their own `uid` key inside `nicknames`/`notes` maps.

## 2. The "Dirty Dozen" (+ Extended) Adversarial Payloads
1. **Unverified Email Write**: Authenticated user with `email_verified: false` tries to create `/groups/g1`. Expected: `PERMISSION_DENIED`.
2. **Cross-User PII Read**: User B calls `get(/users/userA)` to read User A's private email/phone. Expected: `PERMISSION_DENIED`.
3. **User Enumeration Scrape**: User A runs `list` on `/userLookup` or `/publicProfiles` without `uid == auth.uid`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection on Profile**: User A creates `/publicProfiles/userA` with extra field `isAdmin: true`. Expected: `PERMISSION_DENIED`.
5. **Friendship Spoofing**: User A creates `/friendships/userB_userC` setting `requesterUid: 'userB'`. Expected: `PERMISSION_DENIED`.
6. **Friendship Self-Accept**: User A creates `/friendships/userA_userB` with `status: 'accepted'`. Expected: `PERMISSION_DENIED`.
7. **Unauthorized Group Join**: User C attempts to add themselves to `/groups/g1` `memberUids` without a valid invite token batch. Expected: `PERMISSION_DENIED`.
8. **Cross-Group Expense Read**: Non-member User C reads `/groups/g1/expenses/e1`. Expected: `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Member creates expense with `createdAt` set to a past client timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
10. **Payer Self-Confirming Settlement**: Debtor (`fromUid`) attempts to update settlement `status` to `'confirmed'`. Expected: `PERMISSION_DENIED`.
11. **Mutating Confirmed Settlement**: Group member attempts to edit `amountPaise` or `status` on an already `'confirmed'` settlement. Expected: `PERMISSION_DENIED`.
12. **Oversized ID Poisoning**: Member tries to create `/groups/{150-char-invalid-id!}`. Expected: `PERMISSION_DENIED`.
13. **Cross-Friend Note Overwrite**: Accepted friend User A attempts to overwrite `notes['userB']` or inject an arbitrary key inside `/friendships/userA_userB`. Expected: `PERMISSION_DENIED`.
14. **Pending Settlement Status Escalation**: Payer attempts to sneak `status: 'confirmed'` while calling `updatePendingSettlement`. Expected: `PERMISSION_DENIED`.
15. **Revoked Group Invite Redemption**: Non-member User C attempts to redeem or join `/groups/g1` using a `/groupInvites/{token}` with `status == 'revoked'`. Expected: `PERMISSION_DENIED`.
16. **Non-Member Email Invite Injection**: Non-member User C attempts to create `/groups/g1/emailInvites/e1`. Expected: `PERMISSION_DENIED`.
