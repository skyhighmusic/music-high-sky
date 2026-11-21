# Music High Sky — Firestore Security Specification (Phase 0 Security TDD)

## 1. Data Invariants
1. **Identity & Email Verification**: All writes require `request.auth != null && request.auth.token.email_verified == true`. Super Administrator is bootstrapped strictly for verified email `highsky2711@gmail.com` or an active `users/{uid}` document with `role == 'super_admin'`.
2. **No Self-Escalation**: Non-admin users registering a `users/{uid}` profile may ONLY create their own profile with `role == 'artist'` and `status == 'active'`, and can never mutate `role` or `status` on update.
3. **PII Isolation**: `users/{userId}` contains private email addresses and is readable ONLY by the document owner (`request.auth.uid == userId`) or a verified `super_admin`.
4. **Release Ownership & Terminal State Locking**: Artists may only create releases with `submittedBy == request.auth.uid` and initial status `'Draft'` or `'Submitted'`. Artists may only edit their own releases while status is `'Draft'` or `'Metadata Correction Required'`. Once status is `'Taken Down'`, non-admin updates are strictly blocked.
5. **Admin-Only Verification Gates**: `artists`, `platforms`, `settings`, `royalties`, `analytics`, and `copyright_records` writes are restricted to `super_admin` (and `label_manager` where operationally appropriate for distribution/schedule management, never allowing unverified artists to forge royalties or auto-claim copyright ownership).
6. **Temporal & Structural Integrity**: Every document enforces `createdAt == request.time` on create, `updatedAt == request.time` on update, immutable `createdAt`/`submittedBy`/`ownerId`, strict `hasAll`/`hasOnly` key allowlists, mandatory `.size()` checks on every string/array, and `isValidId()` on single-document path variables.
7. **Immutable Audit Logs**: `audit_logs` are append-only (`allow update, delete: if false;`) and readable only by `super_admin` or `label_manager`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Assigned Super Admin on Signup**: Artist creates `/users/{uid}` with `{ role: "super_admin", status: "active" }`.
2. **Role Escalation Update**: Artist updates `/users/{uid}` changing `role` from `"artist"` to `"super_admin"`.
3. **Unverified Email Spoof**: Request with `email: "highsky2711@gmail.com"` and `email_verified: false` attempts admin write.
4. **Cross-User PII Read**: Non-admin authenticated user issues `get` on `/users/otherUserUid`.
5. **Shadow Field Injection on Release**: Artist creates `/releases/rel_1` including undocumented ghost field `isVerified: true`.
6. **Artist Bypassing Approval Workflow**: Artist creates `/releases/rel_2` directly with `status: "Live"` or updates their Draft directly to `status: "Approved"`.
7. **Identity Spoofing on Release**: Artist creates `/releases/rel_3` with `submittedBy: "someone_else"`.
8. **Post-Takedown Mutation**: Label Manager attempts to edit a release whose status is already `"Taken Down"`.
9. **Artist Forging Verified Royalty Statement**: Artist attempts to create a document in `/royalties/roy_1`.
10. **Artist Auto-Claiming Copyright Verification**: Artist attempts to write `/copyright_records/cr_1` with `verifiedByAdmin: true`.
11. **Path ID Poisoning**: User attempts to create `/releases/` with a 1,500-character ID or invalid characters (`../admin`).
12. **Audit Log Tampering**: Even a Super Admin attempts to `update` or `delete` an existing `/audit_logs/{logId}` document.
