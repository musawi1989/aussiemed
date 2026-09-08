# Running server modules from a script

`alias-loader.mjs` + `register-alias.mjs` let a plain node script import the
same modules the app does — resolving the `@/` alias, adding the file
extensions Next infers, and stubbing `next/headers`, `next/cache` and
`server-only`, none of which exist outside a request.

It is for verification only. Server actions cannot be posted to without a
browser, so the alternative is re-implementing the logic in the test and
checking your own copy of it — which passes whether or not the real one works.

    node --experimental-strip-types --import ./scripts/register-alias.mjs scripts/whatever.ts

Set `VERIFY_SESSION` to a session token to exercise anything behind
`requireAdmin()` — the `next/headers` stub hands that token back as the
session cookie. There is no such variable in the app.

Written to check the out-of-stock demotion against the real database, where it
caught a message that told a supplier they were still our primary immediately
after demoting them. Used again for the delivery receipts, where it showed the
magic-byte check refusing a renamed text file and the removal taking the bytes
with the row. Nothing in the app depends on any of it.
