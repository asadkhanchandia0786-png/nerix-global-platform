import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {openDB,migrate} from '../server/db.ts';
import {restoreBackup} from '../server/backup.ts';
if(process.env.RESTORE_CONFIRM!=='EMPTY_DATABASE'||!process.argv[2])throw new Error('Use RESTORE_CONFIRM=EMPTY_DATABASE npm run restore -- backups/file.json with a NEW database. Stop the application first.');
const db=await openDB(process.env.DATABASE_URL);try{await migrate(db);await restoreBackup(db,JSON.parse(await readFile(process.argv[2],'utf8')));console.log('Restored. Sessions were not restored; sign in again.');}finally{await db.close();}
