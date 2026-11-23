# Running the dashboard on the Oracle VM

The dashboard, the gateway and Asterisk share one VM. The gateway reaches the dashboard at `http://127.0.0.1:3000`, so a call never depends on the public internet to be authorised. Customers reach the dashboard through a Cloudflare Tunnel.

> The commands below are standard Ubuntu/Node/Cloudflare steps but were **not run on your VM** when this package was built. Do one step at a time and stop at the first error. First: Oracle Console → Storage → Boot Volumes → create a **boot volume backup**.

## 1. Node 22
```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs unzip
node --version     # must print v22.x
```
(Your VM already has Node for the Dentive gateway; the dashboard needs 22.12 or newer.)

## 2. Install the dashboard
```
scp Nerix-Global-Platform.zip ubuntu@YOUR_VM_IP:~/
ssh ubuntu@YOUR_VM_IP
unzip -q Nerix-Global-Platform.zip -d ~/nerix
sudo mkdir -p /opt/nerix-portal && sudo cp -a ~/nerix/Nerix-Global-Platform/. /opt/nerix-portal/
sudo useradd --system --home-dir /opt/nerix-portal --shell /usr/sbin/nologin nerix-portal
sudo chown -R nerix-portal:nerix-portal /opt/nerix-portal
cd /opt/nerix-portal
sudo -u nerix-portal npm ci
sudo -u nerix-portal npm run build
sudo install -d -o nerix-portal -g nerix-portal -m 0700 /opt/nerix-portal/data
```

## 3. Settings
```
sudo install -d -o root -g nerix-portal -m 0750 /etc/nerix-portal
sudo cp deploy/portal.env.example /etc/nerix-portal/portal.env
sudo chown root:nerix-portal /etc/nerix-portal/portal.env && sudo chmod 0640 /etc/nerix-portal/portal.env
sudo nano /etc/nerix-portal/portal.env      # fill every empty value; generate secrets with: openssl rand -hex 32
```
`NERIX_GATEWAY_SECRET` here and in `/etc/nerix/gateway.env` must be identical.

## 4. Start it
```
sudo cp deploy/nerix-portal.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nerix-portal
sudo systemctl status nerix-portal --no-pager
curl -s http://127.0.0.1:3000/api/health         # shows version 0.4.0 and liveCalls true
```
Logs: `sudo journalctl -u nerix-portal -f`. If it refuses to start, the message names the missing setting.

## 5. Public address (Cloudflare Tunnel)
Install `cloudflared` for Linux arm64 from Cloudflare's download page, then:
```
cloudflared tunnel login                      # choose the Nerix Cloudflare account and the nerixglobal.com zone
cloudflared tunnel create nerix-portal
cloudflared tunnel route dns nerix-portal app.nerixglobal.com
sudo mkdir -p /etc/cloudflared && sudo cp ~/.cloudflared/*.json /etc/cloudflared/
sudo cp deploy/cloudflared-config.example.yml /etc/cloudflared/config.yml   # then edit the tunnel id
sudo cloudflared service install
```
Add the Cloudflare WAF rule that blocks `/api/gateway/*` from outside (see `CUTOVER-FROM-DENTIVE.md`). Do **not** open port 3000 in the Oracle firewall.

## 6. First sign-in
Open `https://app.nerixglobal.com`, enter your `SETUP_TOKEN` as the setup key, create the owner account. Then use Nerix administration to create customer workspaces (pilot mode: customers join by emailed invitation; there is no public sign-up).

## 7. Updating later
Upload the new zip, `sudo systemctl stop nerix-portal`, copy over `/opt/nerix-portal` (keep `data/`), `npm ci && npm run build`, start. Migrations run automatically on start.

## 8. Backups
`cd /opt/nerix-portal && sudo -u nerix-portal npm run backup` writes a file with all customers, wallets, calls and callbacks. Schedule it daily with cron and copy the files **off** the VM (for example to Oracle Object Storage or your own machine). The Neon database also has its own history, but do not rely on one copy.
