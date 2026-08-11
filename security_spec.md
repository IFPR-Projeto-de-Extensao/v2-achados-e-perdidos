# Security Specification & Test Matrix

## 1. Data Invariants
1. An item registration MUST belong to the user who created it (`registeredByUserId == request.auth.uid`).
2. An item claim MUST belong to the claimer (`claimerId == request.auth.uid`).
3. Users can only edit/delete their own items or claims, unless they have ADMIN role.
4. Notifications can only be read/updated by the recipient (`userId == request.auth.uid`).

## 2. Dirty Dozen Security Payloads
1. Spoofed `registeredByUserId` on item creation.
2. Missing required fields on item registration.
3. String exceeding `maxLength` boundaries.
4. Non-authenticated user creating an item.
5. User modifying another user's item status.
6. User reading private claim verification details of another user's claim (unless item owner or admin).
7. Claimer updating a claim after it reaches terminal state (`CONCLUIDO` / `REJEITADO`).
8. Spoofed `claimerId` on claim creation.
9. Modifying immutable field `createdAt`.
10. Unauthenticated write attempt to `users` collection.
11. Reading notifications belonging to another user.
12. Injecting unknown ghost fields in item updates.
