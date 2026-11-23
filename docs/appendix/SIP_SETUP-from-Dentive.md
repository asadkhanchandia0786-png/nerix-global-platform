> **Appendix.** This is the original Dentive carrier/Asterisk guide with product names changed mechanically. It may still say "practice", "patient" or "Sarah"; read those as "customer location", "caller" and "the assistant". Where it disagrees with `ORACLE-GATEWAY-SETUP.md`, follow that file.

# Build the Nerix SIP gateway · VoIPstudio configuration for 0.6.10

**Provider clarification:** Neil confirmed free direct SIP forwarding, routing users created disabled, and one active VoIPstudio PAYG registration for staff transfers across practices. Forwarded calls use a DID inbound channel and a forwarding-user slot; increasing outbound user capacity is free under his reply, while extra DID inbound channels remain chargeable. Use Nerix-controlled aliases for routing-user email addresses. This release models separate inbound forwarding and central outbound registration; exact ingress transport, called-DID delivery and caller-ID permission still need confirmation in a live call. TLS/5061 is the confirmed outbound registration setting. No GoTrunk subscription is required for this arrangement.

Transfers use telephone numbers only. The ZIP contains the gateway software, Asterisk configuration generator and service installer. Running these on your Linux host creates Nerix's SIP/media gateway. It connects a supported SIP carrier to OpenAI Realtime and the portal. No hosted SIP server or carrier account has been activated by preparing the ZIP.

## Call and dashboard structure

| Incoming call | Sarah destination | Portal location |
|---|---|---|
| London public number forwards an unanswered call | London Sarah DID | London |
| Manchester public number forwards an unanswered call | Manchester Sarah DID | Manchester |
| Birmingham public number forwards an unanswered call | Birmingham Sarah DID | Birmingham |

One practice owner sees all these locations in one dashboard. A user assigned only London sees London's data. Another customer practice cannot access them. The gateway checks the incoming DID/trunk against the database's practice and location; a mismatch is rejected before Sarah answers. Caller ID is never used to identify the practice.

The same design supports Nerix AI's UK and USA locations. `deploy/nerix-regions.example.json` is a fictional example. Replace every number and location code with the actual assigned values. Keep your approved staff names in the portal.

## 1. Obtain the connection details

A dedicated Linux server must run Asterisk **20 or later** with PJSIP, ARI, external-media/RTP, mixing bridges, HTTP WebSocket and music-on-hold support, plus Node **20.19 or later**. The gateway and Asterisk run on the same host. The public portal runs separately on Cloudflare; do not try to run Asterisk in a Worker or Replit workflow.

For each provider-approved trunk or authorized practice-PBX connection, record privately:

- SIP server/domain, username and password; allowed signaling transport/port and PCMU (`ulaw`) support.
- Provider signaling IPv4 ranges and media ranges. These may differ.
- Which DID(s) reach the registration and the exact called-number Request-URI delivered to Asterisk.
- Permission/capacity for simultaneous inbound calls and outbound staff calls; DTMF must reach ARI as RFC4733 events.
- Whether multiple registrations sharing signaling IPs retain the registration `line` parameter.
- Whether a practice's public number is authorized as outbound caller ID on that connection.

Use the VoIPstudio PAYG registration specifically confirmed by Neil. Inbound forwarding can use an IP-identified endpoint without registering each disabled routing user. Keep the separate ingress and outbound transports aligned with actual provider settings.

## 2. Configure staff telephone numbers

In each location's dashboard settings, add each staff member's name, role and direct international telephone number. Several names may share one number. That number must ring the intended team and must not forward back to Sarah.

Add a named Front desk contact with the Receptionist role/default, or use the location's **Direct front-desk fallback number**. A staff member can remain in the directory with a blank phone number. If the caller requests that person, Sarah explains that the direct number is unavailable, confirms that she will check with the configured front desk, and privately identifies the originally requested person in the handoff. If no unique reachable front desk is configured, she offers a callback instead. An unknown or ambiguous staff name first requires clarification; Sarah never guesses a private phone number.

The existing Nerix team names—Neil Vance, Aaron Miles, Evan Brooks and Ryan Cole—are retained. Their legacy `NERIX_TRANSFER_PHONE` setting is now connected to the SIP directory for the internal workspace. If that setting is already in Replit, preserve it and copy it privately to the Cloudflare portal's secrets when deploying. You may instead save the same direct number against all four names in each location's settings; explicit location entries take precedence. The private gateway routing file must permit that shared number for both regional DIDs.

No telephone extensions are created, required or dialled. A decline or unsuccessful sales transfer still leads to the existing agreed callback flow, without repeatedly ringing other people.

## 3. Prepare the private routing map

Assign each purchased DID to its practice/location in Nerix Admin. Record the public numbers in that location's settings. Then use `deploy/voipstudio-forwarding.example.json` for the separate forwarding/central-PAYG model, or copy `deploy/gateway-routing.example.json` for a provider-confirmed shared registered trunk to `/etc/nerix/gateway-routing.json` on Linux and replace its examples.

- Each `trunks` item names a SIP connection. `direction` is `inbound`, `outbound`, or `both` (the legacy default). Inbound-only endpoints need only `trustedIpsEnv` and create no registration. Outbound-only endpoints create a registration but accept no new inbound destination routes. `serverEnv`, `usernameEnv`, `passwordEnv` and `trustedIpsEnv` name variables in the private gateway environment file; they do not hold credentials in JSON.
- Each `routes` item names one `did`, its incoming `trunk`, exact portal `workspaceKey` and `locationKey`, and public overflow numbers.
- `transferNumbers` lists the exact staff/front-desk telephone numbers allowed for that location. Four names sharing one number need only one number in this list. Calls dial through `outboundTrunk` when specified; otherwise they use the incoming trunk. Set `callerIdVerified: true` for a separate outbound trunk only after confirming that the central registration can present this DID. A number absent from the list is rejected even if a dashboard entry contains it.
- Caller ID defaults to the Sarah DID. To request the practice's public number, add `outboundCallerId` and `callerIdVerified: true` only after the provider authorizes that number. It must also be one of that location's `publicNumbers`. The carrier's accepted caller-ID behavior must be confirmed in a real call.
- `inboundAliases` can list exact provider-delivered forms of the assigned destination. The DID with and without `+` is recognized automatically. A single-DID registration also recognizes its SIP username. A shared multi-DID registration cannot use the same username/alias to distinguish several locations.

For several DIDs on one SIP registration, VoIPstudio must deliver an unambiguous called-number Request-URI for each one. If it does not, use separately identifiable registrations/provider routing. Unknown destinations are rejected; the gateway does not guess from caller ID or arbitrary forwarding headers.

Use `inboundMatch: "ip"` for distinct provider signaling ranges. Overlapping IP-identification rules are rejected. With provider-confirmed preservation of `line`, use `inboundMatch: "line"` for separately registered accounts sharing provider IPs. Each endpoint still permits only its configured provider signaling ranges. A provider that strips `line` needs a different verified routing arrangement.

Keep the private map aligned when adding locations or staff numbers. The portal and gateway both validate destinations; a telephone number missing from the private map cannot be dialled. In-place changes need a drained gateway/Asterisk restart, not a restart during active calls.

## 4. Install on the dedicated host

Install Asterisk and its required modules using the Linux distribution's maintained packages or Asterisk's official installation process. Extract this project to `/opt/nerix-gateway`. Its source must be readable, but not writable, by the service account.

```bash
cd /opt/nerix-gateway
```

```bash
npm ci --omit=dev
```

```bash
sudo install -d -m 0750 /etc/nerix
```

```bash
sudo install -m 0600 deploy/gateway.env.example /etc/nerix/gateway.env
```

```bash
sudo install -m 0600 deploy/gateway-routing.example.json /etc/nerix/gateway-routing.json
```

Use `sudoedit` to complete both private files. Set `ENABLE_SIP_GATEWAY=true`, `NERIX_APP_URL` to the working portal origin, and `NERIX_GATEWAY_SECRET` to the same strong signing secret used by the portal. Enter your OpenAI key, local ARI username/password and the `VS_*` variables named by the example. Leave legacy `SIP_*` credential fields blank when using the multi-DID map. ARI stays at `http://127.0.0.1:8088/ari`.

Quote environment values containing `#` or spaces. Node `--env-file` and systemd read these values; never execute/source the file as shell code. Generated Asterisk files contain passwords and must remain private.

On this dedicated host only:

```bash
sudo bash deploy/install-gateway.sh
```

The installer validates settings, creates the service account, backs up existing Asterisk configuration and installs the generated files. It does not buy a server, install Asterisk, open a firewall or start calls. If Node is not `/usr/bin/node`, update `ExecStart` in the service file to the actual system-managed Node path before starting it.

## 5. Networking and startup

If using `sip.nerixai.com`, create a DNS **A** record for the Linux server's public IPv4 and set it to **DNS only**. Ordinary Cloudflare website proxying does not carry this SIP/RTP traffic.

Allow SIP only from the configured provider signaling ranges on the selected UDP 5060 or TLS 5061 port. Allow RTP UDP 10000–10199 from the verified provider/PBX media ranges. Restrict administration access appropriately. Do not expose ARI port 8088 or the gateway's external-media sockets; they use loopback. Outbound HTTPS/WebSocket access is needed for the portal and OpenAI. Keep server clocks synchronized.

The example uses UDP/no SRTP because transport is provider-specific. If TLS/SDES is selected, confirm certificates, media support, NAT and carrier proxy requirements before live use. Native Asterisk/carrier acceptance is still required; generated configuration is not proof of carrier compatibility.

After networking and provider routing are ready:

```bash
sudo systemctl restart asterisk
```

```bash
sudo /usr/bin/node --env-file=/etc/nerix/gateway.env gateway/check.js --live
```

```bash
sudo systemctl enable --now nerix-gateway
```

```bash
sudo systemctl status nerix-gateway --no-pager
```

The live check verifies portal database readiness and Asterisk endpoint presence. It does not assert that registration, DTMF or audio succeeds. Confirm registrations privately with `asterisk -rx 'pjsip show registrations'`. Gateway events are persisted encrypted under `/var/lib/nerix-gateway`. Run one gateway process for this Asterisk application/state directory. Drain pending events before changing its signing secret.

## 6. Capacity and live acceptance

Your provider-confirmed baseline is two inbound channels per DID, expandable up to ten for your account. Record actual provisioned capacity and reconcile it with the agreed customer resources before activation. Existing commercial prices and allocations are not silently changed by this release. The admission ledger now counts only incoming calls against DID channels. Staff transfers use separate outbound slots. A forwarded incoming call also uses a forwarding-user slot at the carrier. Ten inbound channels are not a promise of ten simultaneous warm transfers; confirm outbound capacity and server capacity separately. `GATEWAY_MAX_CALLS` defaults to five overall; size the host and adjust this alongside DID allocations.

Test direct Sarah-DID calls using synthetic information first:

1. Correct branch greeting/context, clear two-way speech, interruptions and simultaneous calls on different DIDs.
2. Named staff and role-default lookup; ambiguity must ask for clarification.
3. Caller name/reason and relevant company are confirmed before dialing. Hold audio isolates the caller from the private introduction.
4. After the introduction, **1** joins the two people and closes both OpenAI voice connections. Sarah's billable time stops at confirmed handoff; provider call charges continue.
5. **2**, no answer, busy and voicemail-without-acceptance return the caller to Sarah for agreed callback handling. A ringing or answered phone alone does not accept a call.
6. Hangup during each stage clears remaining legs. Overflow/public/Sarah DID destinations are blocked as direct transfer targets. Verify remote staff-number forwarding cannot loop back.
7. Owner sees all branch records; branch staff cannot access another branch or customer. Call rows show the location and Sarah DID.
8. Confirm capacity refusal, carrier-side fallback when gateway service is unavailable, API outage/restart recovery and no duplicate billing.

Only then turn on the practice public numbers' no-answer/busy forwarding and repeat the tests. Configure a carrier-side alternate destination for gateway outages; this gateway rejects unavailable/unfunded/unroutable calls rather than creating an automatic unbilled bypass call.

Defaults remain 25 seconds ringing, 20 seconds for acceptance after the introduction and a 55-minute overall call limit, including joined staff calls. OpenAI stops at handoff, but Asterisk/gateway must keep running to bridge the human call. A host/process failure or duration limit can still end it.

## References

- [VoIPstudio SIP credentials](https://voipstudio.com/docs/user/thirdpartysoftphones/)
- [VoIPstudio user routing](https://voipstudio.com/docs/administrator/users/)
- [Asterisk installation](https://docs.asterisk.org/Getting-Started/Installing-Asterisk/)
- [Asterisk registration line matching](https://docs.asterisk.org/Latest_API/API_Documentation/Module_Configuration/res_pjsip_outbound_registration/)
- [Asterisk multiple trunks through a proxy](https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring-res_pjsip/PJSIP-with-Proxies/)
- [Asterisk external media](https://docs.asterisk.org/Development/Reference-Information/Asterisk-Framework-and-API-Examples/External-Media-and-ARI/)
- [OpenAI Realtime WebSocket](https://developers.openai.com/api/docs/guides/realtime-websocket)


## 0.6.10 operational settings

- On the gateway host, set `SIP_LOCAL_NETWORKS` to its actual private IPv4 network or address/CIDR whenever `PUBLIC_IPV4` is configured. Do not use a guessed network from an example.
- Inbound TLS endpoints require `SIP_TLS_CERT_FILE` and `SIP_TLS_KEY_FILE`; `SIP_TLS_CA_FILE` optionally selects the trusted CA bundle. Outbound-only TLS verifies the carrier certificate and does not require a local server certificate. The generator validates paths, and `gateway:check` checks that supplied files exist.
- `maxForwardingCalls` and `maxOutboundCalls` default to 5 per configured connection. A shared `both` endpoint counts incoming and outgoing legs against its user capacity. Separate endpoints keep those pools independent. The portal's `GATEWAY_MAX_OUTBOUND_CALLS` also defaults to 5 across active staff transfers; raise limits only to confirmed capacity. Several routing users grouped into one IP ingress can use a conservatively configured aggregate forwarding limit.
- New customer orders allow one Sarah DID per location. Existing orders retain their saved prices and quantities; review an old multi-number location before activating it.
- Portal and gateway must both run 0.6.10 billing protocol 4 before paid calling is enabled. Credit is reserved before admission, renewed by heartbeats and enforced by a local audio deadline. See GATEWAY_CONTRACT.md.
- Complete the live acceptance test after Oracle and Asterisk setup: DID/caller identity, two-way audio, private introduction, press 1/2, decline/timeout, hangup, two concurrent calls, wallet exhaustion and second-practice isolation.

The forwarding example uses UDP/no-SRTP for ingress and TLS/SDES for outbound as explicit placeholders, not confirmation of inbound carrier settings. Set the real transport/media requirements before use. `callerIdVerified` starts false deliberately; confirm the DID presentation on the central PAYG registration before enabling staff dialing.
