# Dentive AI internal company account — app 0.2.2

Dentive AI can be your own internal company account, with **Nerix service fees waived**, no deposit/top-up requirement and no demo balance. This applies to its outbound Alex and inbound Sarah profiles. OpenAI usage, telephone numbers, carrier minutes and hosting still cost money through your provider accounts. Waiving your own Nerix fees does not activate a telephone connection.

## Update your existing Replit app

Use **Nerix-Global-App-0.2.2-Update.zip** in the same Nerix project that currently runs 0.2.1. The marketing website and the original Sarah application do not need this update.

1. Stop the app using Replit's Stop button.
2. In Shell, run `npm run backup`. Keep the resulting private file in `backups/`. It contains private account data and must not be shared publicly. With embedded storage, keep the app stopped while backing up or migrating.
3. Upload **Nerix-Global-App-0.2.2-Update.zip** into this project's Files area.
4. Run these commands one at a time in Shell, from the project root:

```bash
unzip -o Nerix-Global-App-0.2.2-Update.zip
npm ci
npm run db:migrate
npm run build
```

5. Click **Run**, then refresh the app in its separate browser tab.

The update keeps existing accounts, passwords, team memberships, leads, campaigns, site keys, conversation records, Replit Secrets and database configuration. Migration 003 adds a billing classification. It does not automatically change a company merely because its name contains “Dentive”. The update uses your existing database; it does not create a new owner account.

## Convert the existing Dentive workspace

1. Sign into the **Nerix platform administrator** account, using your original admin email.
2. Open **Nerix administration → Customers**.
3. In the **Dentive AI · pilot** row, click **Make internal company**.
4. Confirm the company name is **Dentive AI**.
5. Tick **“I confirm this company belongs to us…”**, then click **Convert to internal company**.
6. Reload the page once. The workspace selector now shows **Dentive AI**, and the dashboard badge shows **Internal company**.
7. Your existing separate Dentive login still works with the same email/password. Switch accounts through the Nerix app's Sign out action; keep Replit signed in while using a protected preview.

Conversion removes the remaining demo credit with an auditable ledger entry. It preserves people, invitations, leads, campaigns, profiles, history and company access. Complete active simulations before converting. Workspaces with real payments or pending refunds cannot be converted through this control; real funds must be reconciled separately.

Only the Nerix platform owner can enable the exemption. A customer workspace owner, manager, staff member or public signup cannot waive its own charges. Exempt companies cannot create top-ups, recharge preferences or new wallet credits; old checkout links cannot credit them either. Other customer prices and normal USD100 deposit requirements continue unchanged.

## Explore your owned company's workflows

- **Overview:** shows Nerix service charges of $0 and no top-up requirement. Call counts/time and outcome history are still available.
- **Wallet & billing:** displays the internal exemption and external-provider-cost explanation, without Add credit or auto-recharge controls.
- **AI agents → Alex:** set Dentive's approved business offer, contact details, objections, language and outreach instructions. Sarah remains its support profile. This does not replace the original Sarah application's separate booking/calling integrations.
- **Campaigns:** keep authorized calling windows, attempt limits and opt-outs. Simulations can run at a zero balance and record a $0 Nerix fee. They still do not dial a real prospect or consume OpenAI audio credits.
- **Lead directory:** existing example leads remain explicitly fictional. Use your own authorized prospect list for a later live pilot; do not dial the example data.

## Actual calls and production

The internal account classification is implemented. The app's live voice/Realtime, SIP/carrier and warm-transfer adapters still require implementation and activation. The present Run/Simulate flow cannot place a real call. The fee waiver alone is not evidence that live calling works.

For a public production backend, configure a separate durable PostgreSQL database, HTTPS APP_ORIGIN, long SETUP_TOKEN and APP_MODE=pilot. New owned companies can be created through **Nerix administration → New workspace** with the owned-company checkbox. They start with no deposit and no fictional credit or leads. New external customer workspaces use normal billing.

No remote provider, DNS setting, Replit deployment or original Sarah project is changed by applying this update. The existing website ZIP remains **Nerix-Global-Cloudflare-v1.0.3.zip**.
