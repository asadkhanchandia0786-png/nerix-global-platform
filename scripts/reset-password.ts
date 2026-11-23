import 'dotenv/config';
import {openDB} from '../server/db.ts';
import {hashPassword} from '../server/auth.ts';
import {audit,need} from '../server/core.ts';
const account=process.env.RESET_OWNER_EMAIL,password=process.env.RESET_OWNER_PASSWORD;
need(account&&password,400,'Temporarily set RESET_OWNER_EMAIL and RESET_OWNER_PASSWORD in Secrets. Remove them after running this script. Stop the app first when using the embedded database.');
const db=await openDB(process.env.DATABASE_URL);try{const encoded=await hashPassword(password);await db.transaction(async q=>{const u=(await q.query("SELECT id FROM users WHERE email=$1 AND platform_role='owner'",[account.toLowerCase()])).rows[0];need(u,404,'Owner account not found.');await q.query('UPDATE users SET password_hash=$1 WHERE id=$2',[encoded,u.id]);await q.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);await audit(q,u.id,null,'owner.password_reset_cli');});console.log('Password changed and sessions revoked. Remove the temporary reset Secrets now.');}finally{await db.close();}
