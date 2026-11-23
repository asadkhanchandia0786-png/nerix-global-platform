import 'dotenv/config';
import {openDB,migrate} from '../server/db.ts';
const db=await openDB(process.env.DATABASE_URL);try{await migrate(db);console.log('Database migrations applied.');}finally{await db.close();}
