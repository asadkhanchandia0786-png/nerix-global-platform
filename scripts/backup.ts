import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';
import {openDB} from '../server/db.ts';
import {exportBackup} from '../server/backup.ts';
const db=await openDB(process.env.DATABASE_URL);try{const data=await exportBackup(db);await mkdir('backups',{recursive:true,mode:0o700});const path=`backups/nerix-${Date.now()}.json`;await writeFile(path,JSON.stringify(data),{mode:0o600});console.log(`Saved ${path}. It contains private customer data and password hashes. Keep it encrypted and private.`);}finally{await db.close();}
