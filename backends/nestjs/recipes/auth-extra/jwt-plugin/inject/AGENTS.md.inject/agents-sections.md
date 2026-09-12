
## JWT plugin

`GET /auth/token` mints a signed JWT from the current session (Better Auth's `jwt()`/`bearer()`
plugins). Purely additive — it's for services *other than this API* that need to verify identity
independently, without a DB round trip. The native cookie session (used by this API and its own
frontend) works identically whether or not this is present; don't switch existing routes to
bearer-token auth because this exists.
