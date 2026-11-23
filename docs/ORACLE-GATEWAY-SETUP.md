# Switching the Oracle gateway from Dentive to Nerix

This replaces the Dentive gateway with the Nerix one on the same VM (same Asterisk, same VoIPstudio settings). The Dentive files stay on disk for rollback. For deep background on carrier settings, NAT and firewalls read `docs/appendix/SIP_SETUP-from-Dentive.md` (your original guide, with names changed; where it says "practice" read "customer location").

**Do this at a quiet time, with no live calls.** Calls cannot be answered for a few minutes while the services change.

## 0. Before you start
- Boot-volume backup made (see `DEPLOY-ORACLE.md`).
- The dashboard is running (`curl -s http://127.0.0.1:3000/api/health` shows `"liveCalls":true`).
- In the dashboard: a customer (or an *internal* test company) exists, it has a number assigned, and its receptionist is saved.
- Keep a copy of the working Dentive settings:
```
sudo cp -a /etc/asterisk /root/asterisk-backup-dentive
sudo cp -a /etc/dentive /root/dentive-etc-backup
```

## 1. Install the Nerix gateway files
```
sudo mkdir -p /opt/nerix-gateway
sudo cp -a ~/nerix/Nerix-Global-Platform/gateway ~/nerix/Nerix-Global-Platform/shared ~/nerix/Nerix-Global-Platform/deploy /opt/nerix-gateway/
cd /opt/nerix-gateway
sudo cp deploy/gateway-package.json package.json
sudo npm install --omit=dev          # installs the single dependency (ws)
```

## 2. Settings
```
sudo install -d -m 0750 /etc/nerix
sudo cp deploy/gateway.env.example /etc/nerix/gateway.env
sudo nano /etc/nerix/gateway.env
```
Fill in: `NERIX_GATEWAY_SECRET` (same as the dashboard's), `OPENAI_API_KEY`, `ARI_PASSWORD`, and **copy** from `/etc/dentive/gateway.env` the carrier block (`SIP_*`, `PUBLIC_IPV4`, `SIP_LOCAL_NETWORKS`) and the `VS_*` values. Leave `ENABLE_SIP_GATEWAY=false` for now. The model line is already `gpt-realtime-2.1-mini`.

## 3. Routing file
```
sudo cp deploy/voipstudio-forwarding.example.json /etc/nerix/gateway-routing.json
sudo nano /etc/nerix/gateway-routing.json
```
Keep the two trunks exactly as in your working `/etc/dentive/gateway-routing.json` (same ids and environment-variable names, so VoIPstudio needs no change). Replace the example `routes` with one entry per customer location. **Do not type them by hand:** in the dashboard open *AI receptionist → Nerix numbers → Gateway route* (Nerix owner only) and paste the generated object. It already contains the right `workspaceKey`, `locationKey` and staff `transferNumbers`.
- Staff transfers stay refused until you change that route's `callerIdVerified` to `true`, after confirming in VoIPstudio that the number may be used as caller ID on the central outbound registration. This is a safety gate inherited from your Dentive gateway.
- Whenever a customer adds or changes a staff number in the dashboard, paste the refreshed route and restart the gateway when idle.

## 4. Generate the Asterisk configuration and install the service
```
cd /opt/nerix-gateway
sudo bash deploy/install-gateway.sh
```
It checks everything first, **backs up** the current Asterisk files, writes the new ones, creates the `nerix-gateway` user and installs the service. If it stops with a message, fix that and run it again.

## 5. Switch over
```
sudo systemctl stop dentive-gateway
sudo systemctl disable dentive-gateway
sudo nano /etc/nerix/gateway.env          # set ENABLE_SIP_GATEWAY=true
sudo systemctl restart asterisk
sudo systemctl enable --now nerix-gateway
sudo journalctl -u nerix-gateway -f       # watch for errors
node --env-file=/etc/nerix/gateway.env /opt/nerix-gateway/gateway/check.js
```

## 6. Rollback (if the first test call fails and you cannot fix it quickly)
```
sudo systemctl stop nerix-gateway
sudo cp -a /root/asterisk-backup-dentive/. /etc/asterisk/
sudo systemctl restart asterisk
sudo systemctl start dentive-gateway && sudo systemctl enable dentive-gateway
```
This only works while the Dentive portal (`app.dentiveai.com`) is still deployed, so keep it until Nerix passes the test plan.
