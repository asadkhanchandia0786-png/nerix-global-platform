# Replit visitor-chat connection update — app 0.2.3

Apply **Nerix-Global-App-0.2.3-Update.zip** to the same project already running 0.2.2. It contains changed/new files only. Your converted Dentive internal account, fee exemption and existing data are retained. No new database migration is needed for this patch.

## What was fixed

The self-hosted `chat-demo.html` test page now allows the browser's existing sign-in cookies on requests to that same app origin. This supports private preview proxies that require a signed-in browser. Ordinary website embeds continue to omit cookies; the preview option cannot send credentials to another origin. Public conversations still use their own expiring opaque tokens and existing site permissions.

Connection failures now show an explanation in the widget instead of silently displaying only offline FAQ help. A sign-in/access page is distinguished from an ordinary chat API response. The app never reports an unsaved request as delivered.

The protected-preview case was reproduced with a controlled sign-in proxy response and tested against the real local chat API. We could not inspect the owner's protected Replit network responses directly, so the hosted connection still needs the retest below. Reference: [Replit private development previews](https://docs.replit.com/teams/privacy-and-deployment-settings).

## Install in the existing project

1. Stop the Replit app. In Shell, run `npm run backup` and keep the private backup.
2. Upload **Nerix-Global-App-0.2.3-Update.zip** into the same project's Files.
3. Run these commands one at a time from the project root:

```bash
unzip -o Nerix-Global-App-0.2.3-Update.zip
npm ci
npm run build
```

4. Click **Run**. Refresh the app tab with **Ctrl + Shift + R**.

## Retest the human handoff

1. Use the same browser where you are signed into Replit. Open your Nerix admin account, select **Nerix Global → Live chat inbox → Nerix Global website**, and click **Go available**.
2. Keep that inbox tab open. Click **Test visitor widget** to open a fresh test page, then hard-refresh it once.
3. Open chat. With OpenAI disabled, **Automatic help · AI offline** is expected. **Live connection offline** means the backend connection still failed; read the red explanation.
4. Click **Talk to our team**. Enter the reason, then name, email, phone with country code and contact permission. The button should say **Request a human agent**, rather than **Prepare email draft**.
5. The request should appear under **Waiting** or **Follow-Ups** in the inbox. Select it, click **Join chat**, send a reply and confirm it appears in the visitor tab.
6. If still offline, send the exact red error. You can also open `/chat-api/sites/nerix-global/config` on the same app origin and share the response. Keep the app running during the test.

OpenAI is not required for human chat or saved follow-ups. Enable its server Secrets after the connection and handoff test works. A private temporary preview is not the public backend for the Cloudflare website; that still requires a persistent public HTTPS backend and the correct website configuration.
