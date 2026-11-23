# Gateway ⇄ dashboard contract (protocol 4)

The gateway (`gateway/`) and the dashboard (`server/gateway.ts`) speak a signed JSON protocol. It is the same protocol as your Dentive gateway with product-neutral names.

**Endpoint:** `POST /api/gateway/events` · **Auth:** headers `X-Nerix-Timestamp` (Unix seconds, ±5 min) and `X-Nerix-Signature` = hex HMAC-SHA256 of `"<timestamp>.<exact raw body>"` with `NERIX_GATEWAY_SECRET` (32+ chars). **Idempotency:** every body has a unique `eventId`; the same id with the same body returns the stored answer, with a different body returns 409.
Errors are `{ "ok": false, "reason": "<code>" }`; the gateway retries only on 5xx.

| Event | Sent when | Key fields | Dashboard does |
|---|---|---|---|
| `authorize` | a forwarded call arrives | `providerCallId`, `calledNumber`, `callerPhone`, `billingProtocol:4` | finds the number → workspace + location, checks status/channels/credit/caps, reserves up to 60 s of credit, returns instructions, voice, staff list (ids/names/roles only), `prepaid` |
| `connected` | the AI starts talking | `callId`, `providerCallId` | marks the call connected |
| `heartbeat` | every ~15 s | same | extends funded seconds from free credit; returns `prepaid {seconds, stop, detached}` |
| `usage` | each AI response | `responseId`, `model`, `usage`, `leg` | stores token counts |
| `save_callback` | caller agreed to a callback | name, reason, `callbackPhone`, `callbackDetailsConfirmed` | creates callback + Follow-ups task + emails |
| `transfer_request` | AI wants to connect staff | `targetId`, `targetName`, caller details | checks the directory, loop/capacity/policy rules; returns the number to dial |
| `transfer_answered / accepted / connected / failed` | staff leg progress | `transferId` | state machine; `connected` means the AI has left |
| `ended` | call over | `outcome`, `reason` | settles billing and closes the call |

**Rules enforced on the dashboard even if the gateway misbehaves:** a number must belong to the workspace's location; caller-supplied digits never choose a transfer destination; a decline or a failed sales call allows no further transfer; staff numbers never appear in the response sent to the AI; billing is idempotent per call; a call needs ≥15 s of funded time to start.

**Gateway-side route file** (`/etc/nerix/gateway-routing.json`) is a second, operator-controlled allowlist: the dialled number, trunk, workspace/location keys and permitted staff numbers must match, otherwise the gateway refuses the call or transfer.

**Differences from the Dentive contract:** `practiceSlug`/`locationCode` are now `workspaceKey`/`locationKey` (the workspace and location UUIDs); `callerType` `patient` is now `customer` (the old value is still accepted); staff roles are `manager, specialist, billing, support, receptionist, staff, other`; patient reminders/outreach events are removed; response includes `assistantName`.
