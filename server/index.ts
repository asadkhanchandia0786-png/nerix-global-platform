import 'dotenv/config';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import express from 'express';
import { openDB,migrate } from './db.ts';
import { createApp } from './app.ts';
import { randomToken } from './auth.ts';
import { expireReservations } from './wallet.ts';
import {recoverChats} from './chat.ts';
import {sweepInbound} from './gateway.ts';
import {startEmail,purgeEmail,emailEnabled} from './email.ts';
import {runtimeSettings} from './runtime.ts';
const {mode,origin,dailyLimit,port,gateway,email}=runtimeSettings(process.env);
await mkdir('data',{recursive:true,mode:0o700});
let setupToken=process.env.SETUP_TOKEN||'';
if(!setupToken){try{setupToken=(await readFile('data/setup-key','utf8')).trim();}catch{setupToken=randomToken();await writeFile('data/setup-key',setupToken,{mode:0o600});}}
if(setupToken.length<24)throw new Error('SETUP_TOKEN must contain at least 24 characters.');
const db=await openDB(process.env.DATABASE_URL);await migrate(db);await expireReservations(db);
const first=!(await db.query('SELECT 1 FROM users LIMIT 1')).rows.length;
if(first&&!process.env.SETUP_TOKEN)console.log(`Initial setup key (enter once in the app): ${setupToken}`);
if(first&&process.env.SETUP_TOKEN)console.log('Open the app and use your SETUP_TOKEN secret to create the owner account.');
const built=process.argv.includes('--production-assets');
startEmail(db,email);
const app=createApp(db,{mode:mode as 'demo'|'pilot',setupToken,origin,trustProxy:process.env.TRUST_PROXY==='1',developmentAssets:!built,gateway,chat:{apiKey:process.env.OPENAI_API_KEY,aiEnabled:process.env.CHAT_AI_ENABLED==='true',model:process.env.CHAT_MODEL||'gpt-4.1-mini',dailyLimit}});
let vite:Awaited<ReturnType<typeof import('vite')['createServer']>>|undefined;
if(built){await stat('dist/index.html');app.use(express.static(resolve('dist'),{index:false}));app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));}
else{const {createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const server=app.listen(port,'0.0.0.0',()=>console.log(`Nerix Global v0.4.0 · ${mode} mode · port ${port}. Inbound call gateway API: ${gateway.enabled?'ENABLED':'off'}. Email (Resend): ${emailEnabled()?'on':'off'}. Text AI chat: ${process.env.CHAT_AI_ENABLED==='true'&&process.env.OPENAI_API_KEY?'enabled':'offline (FAQ help available)'}. Card payments are manual.`));
// Maintenance runs every 15 s while the service is in use (calls, chats, staff) and only every 15 min when idle,
// so a serverless database such as Neon can sleep between visits instead of being kept awake all month.
let working=false,lastTouch=Date.now(),timer:NodeJS.Timeout|undefined,stopping=false;
server.on('request',()=>{lastTouch=Date.now();});
async function maintain(){if(working)return;working=true;try{await expireReservations(db);await recoverChats(db);await sweepInbound(db);await purgeEmail(db);}catch{console.error('Reconciliation failed. Check database availability.');}finally{working=false;}}
function schedule(){if(stopping)return;const busy=Date.now()-lastTouch<10*60*1000;timer=setTimeout(async()=>{await maintain();schedule();},busy?15000:15*60*1000);timer.unref?.();}
schedule();
async function shutdown(){stopping=true;if(timer)clearTimeout(timer);server.close();await vite?.close();await db.close();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
