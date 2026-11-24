import type { DB } from './db.ts';
import { need } from './core.ts';
import {hash,randomToken} from './auth.ts';
const CHAT_TABLES=['chat_sites','chat_conversations','chat_messages','chat_followups','chat_ai_budget','chat_ai_usage'] as const;
import {preserveLegacySoftwareAccess} from './services.ts';
const COMPANY_TABLES=['software_company_subscriptions','software_company_invoices'] as const;
const BUSINESS_TABLES=['software_subscriptions','software_invoices','business_modules','business_records','business_history','business_tasks'] as const;
const VOICE_TABLES=['phone_numbers','reception_settings','inbound_calls','inbound_transfers','callback_requests','inbound_usage_events','gateway_events'] as const;
// email_outbox, password_resets and email_verifications are deliberately excluded: they hold one-time links and are not worth restoring.
export const TABLES=['users','industries','organizations','companies','locations','memberships','support_assignments','invitations','audit','wallets','ledger','payments','deposit_exceptions','payment_quotes','refunds','leads','lead_history','suppression','agents','campaigns','calls','tasks','tickets','referrals',...CHAT_TABLES,...BUSINESS_TABLES,...COMPANY_TABLES,...VOICE_TABLES] as const;
export async function exportBackup(db:DB){return db.transaction(async q=>{
  await q.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const tables:Record<string,unknown[]>={};
  for(const table of TABLES)tables[table]=(await q.query(`SELECT * FROM ${table}`)).rows;
  // Restoring must not resume an old staff claim, in-flight AI request or visitor token.
  tables.chat_conversations=(tables.chat_conversations as any[]).map(c=>({...c,token_hash:hash(randomToken()),assigned_to:null,ai_busy_until:null,ai_request_id:null,status:c.status==='human'||c.status==='waiting'?'follow_up':c.status}));
  return{format:'nerix-backup-1',version:'0.5.0',createdAt:new Date().toISOString(),tables};
});}
export async function restoreBackup(db:DB,backup:any){
  need(backup?.format==='nerix-backup-1'&&['0.1.0','0.2.0','0.2.1','0.2.2','0.2.3','0.2.4','0.2.5','0.3.0','0.3.1','0.4.0','0.5.0'].includes(backup.version),400,'Unsupported backup version.');
  await db.transaction(async q=>{
    need(!(await q.query('SELECT 1 FROM users LIMIT 1')).rows.length,409,'Restore only into a new empty database. Existing accounts were found.');
    need(!(await q.query('SELECT 1 FROM chat_conversations LIMIT 1')).rows.length,409,'Existing chats were found. Restore only into an empty database.');
    await q.query('DELETE FROM industries');
    if(backup.version!=='0.1.0')await q.query('DELETE FROM chat_sites');
    for(const table of TABLES){
      if(!['0.3.1','0.4.0','0.5.0'].includes(backup.version)&&(COMPANY_TABLES as readonly string[]).includes(table))continue;
      if(!['0.4.0','0.5.0'].includes(backup.version)&&(VOICE_TABLES as readonly string[]).includes(table))continue;
      if(!['0.3.0','0.3.1','0.4.0','0.5.0'].includes(backup.version)&&(BUSINESS_TABLES as readonly string[]).includes(table))continue;
      if(backup.version==='0.1.0'&&(CHAT_TABLES as readonly string[]).includes(table))continue;
      need(Array.isArray(backup.tables[table]),400,`Backup is missing ${table}.`);
      const columns=new Set((await q.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table])).rows.map(r=>r.column_name));
      for(const row of backup.tables[table]){
        const keys=Object.keys(row);need(keys.every(k=>columns.has(k)),400,'Invalid backup column.');
        await q.query(`INSERT INTO ${table}(${keys.map(k=>`"${k}"`).join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>row[k]!==null&&typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));
      }
    }
    if(!['0.3.1','0.4.0','0.5.0'].includes(backup.version))await preserveLegacySoftwareAccess(q);
    // A backup taken during a live call must not resume it: release any credit held by calls that were still open.
    await q.query('UPDATE wallets w SET reserved=GREATEST(0,w.reserved-COALESCE((SELECT sum(i.reserved) FROM inbound_calls i WHERE i.org_id=w.org_id AND i.ended_at IS NULL),0))');
    await q.query("UPDATE inbound_calls SET status=CASE WHEN connected_at IS NULL THEN 'failed' ELSE status END,outcome=COALESCE(outcome,'failed'),ended_reason='restored_from_backup',ended_at=now(),reserved=0 WHERE ended_at IS NULL");
    // Explicitly imported serial values do not advance PostgreSQL sequences.
    // Without this, the first post-restore chat collides with an existing sequence.
    await q.query("SELECT setval(pg_get_serial_sequence('chat_messages','sequence'), COALESCE(max(sequence),1), max(sequence) IS NOT NULL) FROM chat_messages");
  });
}
