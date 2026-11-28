# Security Summary

**Reviewed Files**: 28
**Issues Resolved**: 4

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Handle Squatting in Lookup Table | `firestore.rules` | 325 | Authenticated users could create or alter arbitrary `handle_*` lookup records in `/userLookup` without matching their own `/users/{uid}` handle. | Medium | Fixed | Bound `handle_*` creation to `getAfter(/users/$(request.auth.uid)).data.handle` and prevented handle reassignment on update, while restricting email lookups to 64-char SHA-256 hex keys. |
| Spreadsheet Formula Injection | `src/utils/exportReports.ts` | 15 | User-entered expense titles, descriptions, tags, notes, and group names were written directly to `.xlsx` cells, allowing leading formula characters (`=`, `+`, `-`, `@`). | Medium | Fixed | Added `sanitizeSpreadsheetCell` to prefix dangerous leading formula characters with `'` across all exported string columns. |
| Unescaped HTML in Email Invitations | `server.ts` | 372 | `groupName`, `inviterName`, and `inviteUrl` were interpolated directly into the transactional invitation email HTML template. | Medium | Fixed | Applied `escapeHtml` encoding to `safeGroup`, `senderLabel`, and `safeInviteUrl` after URL scheme validation before building the HTML email body. |
| Missing HTTP Security Headers & Unbounded Batch Input | `server.ts`, `vercel.json` | 131, 541, 581 | Express and Vercel responses lacked defensive headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), and `/api/finance/reconcile` and `/api/ai/parse-expense` lacked explicit batch/image bounds. | Low | Fixed | Disabled `x-powered-by`, added HTTP security headers in both `server.ts` and `vercel.json`, and enforced upper bounds on reconciliation arrays (2,000 items) and receipt base64 payloads (2.5 MB). |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server.ts`, `.env.example` | `GEMINI_API_KEY` and `RESEND_API_KEY` are loaded strictly from server environment variables and never exposed to client bundles. |
| Server-Side Auth Verification | `server.ts` | All `/api/invitations/*`, `/api/finance/*`, and `/api/ai/*` routes require a verified Firebase ID Bearer token validated via Firebase Identity Toolkit `accounts:lookup`. |
| Firestore Access Control | `firestore.rules` | Enforces default deny, verified-email auth, member-scoped group/expense/settlement access, atomic invite token redemption, and immutable confirmed settlements. |
| Safe Rendering | `src/pages/*.tsx`, `src/components/**/*.tsx` | Uses React JSX text bindings throughout with no raw `dangerouslySetInnerHTML` HTML injection, and validates external image/cover URLs via `isValidSafeUrl`. |

## PoC Verification

### 1. Handle Squatting in `/userLookup`

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Ownership Binding on Lookup Index |
| Impact | Medium |
| Affected File | `firestore.rules:320` |
| Test Scenario | User `userA` attempts to create `/userLookup/handle_someoneelse` with `{ uid: 'userA', handle: 'someoneelse' }` while their `/users/userA` profile still holds `handle: 'usera'`. |

#### How It Was Fixed
`/userLookup/{lookupKey}` creation now requires either a valid 64-hex-character `email_*` key or a `handle_*` key whose `handle` matches the post-commit `handle` on `/users/$(request.auth.uid)`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Client sends `create` request to `/userLookup/handle_someoneelse` as `userA` | Request reaches `/userLookup/{lookupKey}` rule |
| 2 | `firestore.rules:326` checks `lookupKey == 'handle_' + incoming().handle && getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.handle == incoming().handle` | Evaluates to `false` because `/users/userA.handle` is `'usera'` |
| 3 | Fallback `lookupKey.matches('^email_[0-9a-f]{64}$')` is checked | Evaluates to `false`; write is **Denied** |

#### Conclusion
**Fix Verified** - An authenticated user cannot claim arbitrary `/userLookup/handle_*` entries without atomically holding that handle on their own `/users/{uid}` document.

### 2. Spreadsheet Formula Injection in Excel Export

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unsafe Spreadsheet Export Output |
| Impact | Medium |
| Affected File | `src/utils/exportReports.ts:15` |
| Test Scenario | Expense title `=SUM(A1:A2)` or `+cmd\|calc` exported via `exportReportToExcel`. |

#### How It Was Fixed
Added `sanitizeSpreadsheetCell` and wrapped all string fields in `expenseRows` and `settlementRows` so any leading `=`, `+`, `-`, `@`, tab, or carriage return (even after whitespace) is neutralized with a leading `'`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `=SUM(A1:A2)` is passed into `exportReportToExcel` | Enters `sanitizeSpreadsheetCell` at `src/utils/exportReports.ts:15` |
| 2 | Regex `/^[\s]*[=+\-@\t\r]/` matches at line 18 | Returns `"'=SUM(A1:A2)"` |
| 3 | `XLSX.utils.json_to_sheet` writes the escaped literal string | **Handled Safely** as plain text in Excel |

#### Conclusion
**Fix Verified** - User-controlled strings beginning with formula trigger characters are escaped before serialization into `.xlsx` sheets.

### 3. HTML Injection in Invitation Email Template

#### Summary
| Field | Value |
|---|---|
| Issue Type | Unescaped HTML Interpolation |
| Impact | Medium |
| Affected File | `server.ts:361` |
| Test Scenario | POST `/api/invitations/send-email` with `groupName: 'Trip <img src=x onerror=alert(1)>'` and valid `https://` `inviteUrl`. |

#### How It Was Fixed
`server.ts` validates `inviteUrl` strictly for `http:`/`https:` schemes and encodes `safeGroup`, `senderLabel`, and `safeInviteUrl` through `escapeHtml` (`&`, `<`, `>`, `"`, `'`) before building the email HTML string.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Authenticated payload reaches `/api/invitations/send-email` | Scheme validated via `new URL(inviteUrl)` at `server.ts:325` |
| 2 | `escapeHtml` encodes `safeGroup`, `senderLabel`, and `safeInviteUrl` at `server.ts:372-374` | `<` and `>` become `&lt;` and `&gt;` |
| 3 | Only escaped values are interpolated at `server.ts:397-405` | **Handled Safely** |

#### Conclusion
**Fix Verified** - Untrusted group names, inviter names, and URL attributes cannot inject executable markup into outgoing invitation emails.
