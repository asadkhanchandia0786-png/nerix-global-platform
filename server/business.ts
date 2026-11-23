import type {Express,Request} from 'express';
import {z} from 'zod';
import type {DB,Query,Row} from './db.ts';
import {Auth,scopeSQL,checkScope,validScope,type Access} from './auth.ts';
import {audit,id,need,text,uuid} from './core.ts';
import {serviceProfile,softwareCompany,softwareEntitlement,requireSoftware} from './services.ts';
import {registerCompanyBilling} from './company-billing.ts';
import {FIELD_TYPES,BUSINESS_TEMPLATES,type BusinessField} from '../shared/business.ts';
const key=z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const field=z.object({key,label:text(80),type:z.enum(FIELD_TYPES),required:z.boolean().default(false),options:z.array(text(100)).max(50).default([]),relationModule:uuid.optional(),archived:z.boolean().default(false)}).strict();
const workflow=z.object({id:uuid,name:text(100),trigger:z.enum(['created','status']),status:z.string().max(80),taskTitle:text(200),dueDays:z.number().int().min(0).max(365),enabled:z.boolean()}).strict();
const moduleInput=z.object({name:text(100),description:z.string().max(1000),fields:z.array(field).max(60),stages:z.array(text(80)).min(1).max(20),workflows:z.array(workflow).max(20).default([]),version:z.number().int().positive().optional(),archived:z.boolean().default(false)}).strict();
const recordInput=z.object({id:uuid.optional(),title:text(200),status:text(80),locationId:uuid,data:z.record(z.string(),z.unknown()),assigneeId:uuid.nullable().default(null),dueDate:z.iso.date().nullable().default(null),version:z.number().int().positive().optional(),archived:z.boolean().default(false)}).strict();
const asJSON=(v:unknown)=>JSON.stringify(v);
async function history(q:Query,a:Access,record:string,kind:string,details:unknown){await q.query('INSERT INTO business_history(id,org_id,record_id,actor_id,kind,details) VALUES($1,$2,$3,$4,$5,$6)',[id(),a.orgId,record,a.user.id,kind,asJSON(details)]);}
async function moduleAt(q:Query,a:Access,module:string,lock=false){const p:any[]=[a.orgId,module];if(a.companyId)p.push(a.companyId);const row=(await q.query(`SELECT * FROM business_modules WHERE org_id=$1 AND id=$2${a.companyId?' AND company_id=$3':''}${lock?' FOR UPDATE':''}`,p)).rows[0];need(row,404,'Module not found.');return row;}
async function recordAt(q:Query,a:Access,record:string,lock=false){const p:any[]=[a.orgId,record];const row=(await q.query(`SELECT * FROM business_records WHERE org_id=$1 AND id=$2${scopeSQL(a,p)}${lock?' FOR UPDATE':''}`,p)).rows[0];need(row,404,'Record not found.');return row;}
async function assignee(q:Query,a:Access,user:string|null,company:string,location:string){if(!user)return;need((await q.query(`SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2 AND m.active=true AND u.active=true AND (m.role='owner' OR (m.role<>'viewer' AND m.service_access->>'software' IN ('edit','admin'))) AND (m.company_id IS NULL OR m.company_id=$3) AND (m.location_id IS NULL OR m.location_id=$4)`,[a.orgId,user,company,location])).rows.length,400,'Assignee must have software editing access to this company and location.');}
async function validateFields(q:Query,a:Access,m:Row,input:Record<string,unknown>,location:string,previous:Record<string,unknown>={}) {
 const allowed=new Set((m.fields as BusinessField[]).filter(f=>!f.archived).map(f=>f.key));
 need(Object.keys(input).every(k=>allowed.has(k)),400,'Unknown or archived field.');
 const values={...previous,...input};
 for(const f of m.fields as BusinessField[]) {
  if(f.archived)continue;const v=values[f.key];const empty=v===undefined||v===null||v==='';
  need(!f.required||!empty,400,`${f.label} is required.`);if(empty){values[f.key]=null;continue;}
  if(f.type==='checkbox'){need(typeof v==='boolean',400,`${f.label} must be true or false.`);continue;}
  if(f.type==='number'||f.type==='currency'){need(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12,400,`${f.label} must be a valid number.`);if(f.type==='currency')need(Math.abs(Math.round(v*100)-v*100)<0.001,400,`${f.label} accepts two decimal places.`);continue;}
  need(typeof v==='string'&&v.length<=(f.type==='textarea'?8000:500),400,`${f.label} is too long or invalid.`);
  if(f.type==='date')need(z.iso.date().safeParse(v).success,400,`${f.label} must be a valid date.`);
  if(f.type==='email')need(z.email().safeParse(v).success,400,`${f.label} must be a valid email.`);
  if(f.type==='select')need(f.options.includes(v),400,`${f.label} has an unknown option.`);
  if(f.type==='relation') {need(uuid.safeParse(v).success,400,`${f.label} must reference a record.`);need((await q.query('SELECT 1 FROM business_records WHERE id=$1 AND org_id=$2 AND company_id=$3 AND location_id=$4 AND module_id=$5 AND archived=false',[v,a.orgId,m.company_id,location,f.relationModule])).rows.length,400,`${f.label} must reference an active record in the same company and location.`);}
 }
 return values;
}
async function runWorkflows(q:Query,a:Access,m:Row,r:Row,old?:Row){
 for(const rule of m.workflows)if(rule.enabled&&((rule.trigger==='created'&&!old)||(rule.trigger==='status'&&r.status===rule.status&&old?.status!==r.status))){
  const task=id();await q.query("INSERT INTO business_tasks(id,org_id,record_id,title,assignee_id,due_date,event_key) VALUES($1,$2,$3,$4,$5,(now() AT TIME ZONE 'UTC')::date+$6::integer,$7) ON CONFLICT(record_id,event_key) DO NOTHING",[task,a.orgId,r.id,rule.taskTitle,r.assignee_id,rule.dueDays,`${rule.id}:${r.version}`]);
  await history(q,a,r.id,'workflow',{name:rule.name,taskTitle:rule.taskTitle,dueDays:rule.dueDays});
 }
}
async function saveRecord(q:Query,a:Access,m:Row,b:z.infer<typeof recordInput>,old?:Row){
 need(!m.archived,409,'Restore this module before editing its records.');checkScope(a,m.company_id,b.locationId);await validScope(q,a.orgId,m.company_id,b.locationId);
 need(!old||old.location_id===b.locationId,400,'Record locations cannot be changed.');need(m.stages.includes(b.status),400,'Choose a status defined in this module.');
 if(old)need(old.version===b.version,409,'This record changed. Close the form and reopen it before saving.');
 await assignee(q,a,b.assigneeId,m.company_id,b.locationId);
 const data=await validateFields(q,a,m,b.data,b.locationId,old?.data);
 let r:Row;
 if(old)r=(await q.query('UPDATE business_records SET title=$1,status=$2,data=$3,assignee_id=$4,due_date=$5,archived=$6,version=version+1,updated_at=now() WHERE id=$7 RETURNING *',[b.title,b.status,asJSON(data),b.assigneeId,b.dueDate,b.archived,old.id])).rows[0];
 else r=(await q.query('INSERT INTO business_records(id,org_id,company_id,location_id,module_id,title,status,data,assignee_id,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[b.id||id(),a.orgId,m.company_id,b.locationId,m.id,b.title,b.status,asJSON(data),b.assigneeId,b.dueDate,a.user.id])).rows[0];
 await history(q,a,r.id,old?'updated':'created',{version:r.version,title:r.title,status:r.status,fields:Object.keys(b.data),archived:r.archived,previous:old?{title:old.title,status:old.status,data:old.data,assigneeId:old.assignee_id,dueDate:old.due_date}:null});
 if(!r.archived)await runWorkflows(q,a,m,r,old);
 await audit(q,a.user.id,a.orgId,old?'software.record_updated':'software.record_created',{recordId:r.id,moduleId:m.id,version:r.version});return r;
}
async function checkDefinition(q:Query,a:Access,company:string,b:z.infer<typeof moduleInput>,old?:Row){
 need(new Set(b.fields.map(f=>f.key)).size===b.fields.length&&new Set(b.stages).size===b.stages.length&&new Set(b.workflows.map(w=>w.id)).size===b.workflows.length,400,'Field keys, statuses and workflow identifiers must be unique.');
 for(const f of b.fields){if(f.type==='select')need(f.options.length&&new Set(f.options).size===f.options.length,400,'A choice field needs distinct options.');if(f.type==='relation'){need(f.relationModule,400,'Choose the linked module.');const target=await moduleAt(q,a,f.relationModule);need(target.company_id===company&&!target.archived,400,'Linked modules must belong to the same company.');}}
 for(const w of b.workflows)need(w.trigger==='created'||b.stages.includes(w.status),400,'Workflow status is not in this module.');
 if(old){
  need(old.version===b.version,409,'This module changed. Reopen the builder before saving.');
  // Never silently discard old data or reinterpret a stored field when an admin edits the layout.
  for(const f of old.fields){const n=b.fields.find(n=>n.key===f.key);need(n,400,'Archive existing fields instead of removing them.');need(n.type===f.type&&n.relationModule===f.relationModule,400,'Existing field types and links cannot change. Add a new field instead.');if(f.type==='select')need(f.options.every((v:string)=>n.options.includes(v)),400,'Keep existing choices so saved records stay valid.');}
  const used=(await q.query('SELECT DISTINCT status FROM business_records WHERE module_id=$1',[old.id])).rows;need(used.every(r=>b.stages.includes(r.status)),400,'A status still used by records cannot be removed.');
 }
}
export function registerBusiness(app:Express,db:DB,auth:Auth){
 const org=(req:Request)=>uuid.parse(req.params.org);
 const access=async(req:Request,level:'read'|'edit'|'admin'='read')=>{
  const a=await auth.access(req,org(req),'overview'),p=await serviceProfile(db,a.user,a.orgId);const ranks={none:0,read:1,edit:2,admin:3};
  need((ranks[p.software as keyof typeof ranks]||0)>=ranks[level],403,'Business software permission is required.');
  return a;
 };
 app.get('/api/org/:org/software',async(req,res)=>{const a=await access(req),p=await serviceProfile(db,a.user,a.orgId),company=await softwareCompany(db,a,uuid.optional().parse(req.query.company)),params:any[]=[a.orgId,company.id];
  res.json({...(await softwareEntitlement(db,a.orgId,company.id)),permission:p.software,platformOwner:p.platformOwner,workspaceOwner:p.workspaceOwner,
   modules:(await db.query(`SELECT * FROM business_modules WHERE org_id=$1 AND company_id=$2 ORDER BY created_at`,params)).rows,
   members:(await db.query(`SELECT m.user_id,m.company_id,m.location_id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.active=true AND u.active=true AND (m.role='owner' OR (m.role<>'viewer' AND m.service_access->>'software' IN ('edit','admin'))) AND ($2::uuid IS NULL OR m.company_id IS NULL OR m.company_id=$2) AND ($3::uuid IS NULL OR m.location_id IS NULL OR m.location_id=$3) ORDER BY u.name`,[a.orgId,a.companyId,a.locationId])).rows,templates:BUSINESS_TEMPLATES.map(t=>({key:t.key,name:t.name,description:t.description}))});
 });
 app.post('/api/org/:org/software/modules',async(req,res)=>{const a=await access(req,'admin'),{companyId,...rest}=z.object({companyId:uuid}).passthrough().parse(req.body),b=moduleInput.parse(rest);checkScope(a,companyId,a.locationId||'');await validScope(db,a.orgId,companyId,null);
  need(!a.locationId,403,'Module configuration requires company-wide access.');res.json(await db.transaction(async q=>{if(a.user.platform_role!=='owner')await requireSoftware(q,a.orgId,companyId);await checkDefinition(q,a,companyId,b);const m=(await q.query('INSERT INTO business_modules(id,org_id,company_id,name,description,fields,stages,workflows) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id(),a.orgId,companyId,b.name,b.description,asJSON(b.fields),asJSON(b.stages),asJSON(b.workflows)])).rows[0];await audit(q,a.user.id,a.orgId,'software.module_created',{id:m.id});return m;}));
 });
 app.put('/api/org/:org/software/modules/:module',async(req,res)=>{const a=await access(req,'admin'),b=moduleInput.parse(req.body);need(!a.locationId,403,'Module configuration requires company-wide access.');res.json(await db.transaction(async q=>{const m=await moduleAt(q,a,uuid.parse(req.params.module),true);if(a.user.platform_role!=='owner')await requireSoftware(q,a.orgId,m.company_id);await checkDefinition(q,a,m.company_id,b,m);const result=(await q.query('UPDATE business_modules SET name=$1,description=$2,fields=$3,stages=$4,workflows=$5,archived=$6,version=version+1 WHERE id=$7 RETURNING *',[b.name,b.description,asJSON(b.fields),asJSON(b.stages),asJSON(b.workflows),b.archived,m.id])).rows[0];await audit(q,a.user.id,a.orgId,'software.module_configured',{id:m.id,version:result.version});return result;}));});
 app.post('/api/org/:org/software/templates',async(req,res)=>{const a=await access(req,'admin'),b=z.object({companyId:uuid,key:text(50)}).parse(req.body);need(!a.locationId,403,'Templates require company-wide access.');checkScope(a,b.companyId,'');await validScope(db,a.orgId,b.companyId,null);const t=BUSINESS_TEMPLATES.find(t=>t.key===b.key);need(t,400,'Unknown template.');
  res.json(await db.transaction(async q=>{if(a.user.platform_role!=='owner')await requireSoftware(q,a.orgId,b.companyId);await q.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[b.companyId]);const results:Row[]=[];let contact:string|undefined;
   for(const definition of t.modules){const templateKey=`${t.key}:${definition.key}`;let m=(await q.query('SELECT * FROM business_modules WHERE org_id=$1 AND company_id=$2 AND template_key=$3',[a.orgId,b.companyId,templateKey])).rows[0];
    if(!m){const fields=definition.fields.map(f=>({...f,...(f.type==='relation'?{relationModule:contact}:{})}));m=(await q.query('INSERT INTO business_modules(id,org_id,company_id,name,description,fields,stages,template_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id(),a.orgId,b.companyId,definition.name,definition.description,asJSON(fields),asJSON(definition.stages),templateKey])).rows[0];}if(definition.key==='contacts')contact=m.id;results.push(m);
   }await audit(q,a.user.id,a.orgId,'software.template_applied',{companyId:b.companyId,template:b.key});return results;
  }));
 });
 app.get('/api/org/:org/software/modules/:module/records',async(req,res)=>{const a=await access(req),m=await moduleAt(db,a,uuid.parse(req.params.module));const b=z.object({q:z.string().max(200).default(''),status:z.string().max(80).default(''),archived:z.enum(['true','false']).default('false'),page:z.coerce.number().int().min(1).max(100000).default(1),from:z.iso.date().optional(),to:z.iso.date().optional(),location:uuid.optional()}).parse(req.query);
  const p:any[]=[a.orgId,m.id,b.archived==='true',b.q,b.status];let extra='';if(b.from){p.push(b.from);extra+=` AND due_date >= $${p.length}::date`;}if(b.to){p.push(b.to);extra+=` AND due_date <= $${p.length}::date`;}if(b.location){p.push(b.location);extra+=` AND location_id=$${p.length}`;}const where=`org_id=$1 AND module_id=$2 AND archived=$3 AND ($4='' OR position(lower($4) in lower(title||' '||data::text))>0) AND ($5='' OR status=$5)${extra}${scopeSQL(a,p)}`;
  const total=Number((await db.query(`SELECT count(*) AS total FROM business_records WHERE ${where}`,p)).rows[0].total);p.push((b.page-1)*100);
  res.json({total,page:b.page,records:(await db.query(`SELECT * FROM business_records WHERE ${where} ORDER BY updated_at DESC,id LIMIT 100 OFFSET $${p.length}`,p)).rows});
 });
 app.post('/api/org/:org/software/modules/:module/records',async(req,res)=>{const a=await access(req,'edit'),b=recordInput.parse(req.body);res.json(await db.transaction(async q=>{const m=await moduleAt(q,a,uuid.parse(req.params.module),true);await requireSoftware(q,a.orgId,m.company_id);if(b.id){const existing=(await q.query('SELECT * FROM business_records WHERE id=$1',[b.id])).rows[0];if(existing){need(existing.org_id===a.orgId&&existing.module_id===m.id,409,'This request identifier was already used.');checkScope(a,existing.company_id,existing.location_id);return existing;}}return saveRecord(q,a,m,b);}));});
 app.put('/api/org/:org/software/records/:record',async(req,res)=>{const a=await access(req,'edit'),b=recordInput.parse(req.body);res.json(await db.transaction(async q=>{const recordId=uuid.parse(req.params.record),found=await recordAt(q,a,recordId),m=await moduleAt(q,a,found.module_id,true),old=await recordAt(q,a,recordId,true);await requireSoftware(q,a.orgId,m.company_id);return saveRecord(q,a,m,b,old);}));});
 app.get('/api/org/:org/software/records/:record',async(req,res)=>{const a=await access(req),r=await recordAt(db,a,uuid.parse(req.params.record));res.json({record:r,history:(await db.query('SELECT h.id,h.kind,h.details,h.created_at,u.name AS actor FROM business_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.org_id=$1 AND h.record_id=$2 ORDER BY h.created_at DESC LIMIT 200',[a.orgId,r.id])).rows,tasks:(await db.query('SELECT * FROM business_tasks WHERE org_id=$1 AND record_id=$2 ORDER BY due_date',[a.orgId,r.id])).rows});});
 app.post('/api/org/:org/software/records/:record/notes',async(req,res)=>{const a=await access(req,'edit'),b=z.object({body:text(8000)}).parse(req.body);await db.transaction(async q=>{const r=await recordAt(q,a,uuid.parse(req.params.record));await requireSoftware(q,a.orgId,r.company_id);await history(q,a,r.id,'note',{body:b.body});});res.json({ok:true});});
 app.post('/api/org/:org/software/records/:record/tasks',async(req,res)=>{const a=await access(req,'edit'),b=z.object({title:text(200),dueDate:z.iso.date(),assigneeId:uuid.nullable()}).parse(req.body);res.json(await db.transaction(async q=>{const r=await recordAt(q,a,uuid.parse(req.params.record));await requireSoftware(q,a.orgId,r.company_id);await assignee(q,a,b.assigneeId,r.company_id,r.location_id);const t=(await q.query('INSERT INTO business_tasks(id,org_id,record_id,title,assignee_id,due_date,event_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id(),a.orgId,r.id,b.title,b.assigneeId,b.dueDate,id()])).rows[0];await history(q,a,r.id,'task_created',{title:b.title,dueDate:b.dueDate});return t;}));});
 app.patch('/api/org/:org/software/tasks/:task',async(req,res)=>{const a=await access(req,'edit'),b=z.object({status:z.enum(['open','done'])}).parse(req.body);await db.transaction(async q=>{const t=(await q.query('SELECT * FROM business_tasks WHERE id=$1 AND org_id=$2',[uuid.parse(req.params.task),a.orgId])).rows[0];need(t,404,'Task not found.');const r=await recordAt(q,a,t.record_id);await requireSoftware(q,a.orgId,r.company_id);await q.query('UPDATE business_tasks SET status=$1 WHERE id=$2',[b.status,t.id]);await history(q,a,t.record_id,'task_updated',{title:t.title,status:b.status});});res.json({ok:true});});
 app.get('/api/org/:org/software/tasks',async(req,res)=>{const a=await access(req),p:any[]=[a.orgId];res.json((await db.query(`SELECT t.*,r.title AS record_title,r.module_id,r.location_id,r.company_id FROM business_tasks t JOIN business_records r ON r.id=t.record_id WHERE t.org_id=$1 AND r.archived=false${scopeSQL(a,p,'r.')} ORDER BY t.status DESC,t.due_date LIMIT 1000`,p)).rows);});
 app.get('/api/org/:org/software/modules/:module/report',async(req,res)=>{const a=await access(req),m=await moduleAt(db,a,uuid.parse(req.params.module)),p:any[]=[a.orgId,m.id],where=`r.org_id=$1 AND r.module_id=$2 AND r.archived=false${scopeSQL(a,p,'r.')}`;
  res.json({statuses:(await db.query(`SELECT r.status,count(*)::int AS count FROM business_records r WHERE ${where} GROUP BY r.status`,p)).rows,owners:(await db.query(`SELECT u.name,count(*)::int AS count FROM business_records r LEFT JOIN users u ON u.id=r.assignee_id WHERE ${where} GROUP BY u.name`,p)).rows,overdueTasks:Number((await db.query(`SELECT count(*) AS count FROM business_tasks t JOIN business_records r ON r.id=t.record_id WHERE ${where} AND t.status='open' AND t.due_date<(now() AT TIME ZONE 'UTC')::date`,p)).rows[0].count)});
 });
 app.get('/api/org/:org/software/modules/:module/export',async(req,res)=>{const a=await access(req),m=await moduleAt(db,a,uuid.parse(req.params.module)),p:any[]=[a.orgId,m.id];const rows=(await db.query(`SELECT * FROM business_records WHERE org_id=$1 AND module_id=$2${scopeSQL(a,p)} ORDER BY created_at LIMIT 10001`,p)).rows;need(rows.length<=10000,413,'This module exceeds the 10,000-record export limit. Ask Nerix for a full database export.');
  const fields=m.fields as BusinessField[],cols=['Record ID','Title','Status','Location ID','Assignee ID','Due date','Archived',...fields.map(f=>f.key)];const safe=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv=[cols,...rows.map(r=>[r.id,r.title,r.status,r.location_id,r.assignee_id,r.due_date?String(r.due_date).slice(0,10):'',r.archived,...fields.map(f=>r.data[f.key])])].map(row=>row.map(safe).join(',')).join('\r\n');await audit(db,a.user.id,a.orgId,'software.export',{moduleId:m.id,count:rows.length});res.json({filename:`nerix-${m.id}.csv`,csv});
 });
 // Import uses record IDs as idempotency keys. Validation is transactional: a bad row imports nothing.
 app.post('/api/org/:org/software/modules/:module/import',async(req,res)=>{const a=await access(req,'edit'),b=z.object({rows:z.array(recordInput.extend({id:uuid})).min(1).max(500),preview:z.boolean()}).parse(req.body);res.json(await db.transaction(async q=>{const m=await moduleAt(q,a,uuid.parse(req.params.module),true);await requireSoftware(q,a.orgId,m.company_id);need(!m.archived,409,'Restore this module before importing records.');let imported=0,skipped=0;need(new Set(b.rows.map(r=>r.id)).size===b.rows.length,400,'Import row IDs must be unique.');
  for(const row of b.rows){const existing=(await q.query('SELECT * FROM business_records WHERE id=$1',[row.id])).rows[0];if(existing){need(existing.org_id===a.orgId&&existing.module_id===m.id,409,'An import identifier belongs to another module.');checkScope(a,existing.company_id,existing.location_id);skipped++;continue;}
   checkScope(a,m.company_id,row.locationId);await validScope(q,a.orgId,m.company_id,row.locationId);need(m.stages.includes(row.status),400,`Unknown status for ${row.title}.`);await assignee(q,a,row.assigneeId,m.company_id,row.locationId);await validateFields(q,a,m,row.data,row.locationId);if(!b.preview)await saveRecord(q,a,m,row);imported++;
  }return {imported,skipped,preview:b.preview};
 }));});
 registerCompanyBilling(app,db,auth);
}
