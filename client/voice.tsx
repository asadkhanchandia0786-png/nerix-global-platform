import {useState} from 'react';
import {Plus,Copy,Phone,PhoneIncoming,Pause,Play,Eye} from 'lucide-react';
import {api,useApp,useData,Load,Header,Card,Metric,Badge,Status,Empty,Table,Field,Form,str,Modal,Action,fmtDate,type Data} from './lib.tsx';
import {money} from '../shared/constants.ts';

const ROLE_LABELS:Record<string,string>={manager:'Manager',specialist:'Specialist / professional',billing:'Billing & accounts',support:'Customer support',receptionist:'Front desk / reception',staff:'General staff',other:'Other'};
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const LANGS=['en-GB','en-US','en-AU','en-CA','en-IN','en-AE'],VOICES=['marin','cedar','coral','alloy','ash','ballad','echo','sage','shimmer','verse'];
const slug=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'staff';
const lines=(s:string)=>s.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);
const dur=(s:number)=>s?`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`:'—';

type Hour={on:boolean;open:string;close:string};
const defaultHours=():Hour[]=>DAYS.map((_,i)=>({on:i>0&&i<6,open:'09:00',close:'17:00'}));
const fromServer=(w:any):{always:boolean;hours:Hour[]}=>Array.isArray(w)&&w.length===7?{always:false,hours:w.map((d:any[])=>d[0]?{on:true,open:d[0].open,close:d[0].close}:{on:false,open:'09:00',close:'17:00'})}:{always:true,hours:defaultHours()};

function SettingsEditor({row,onClose}:{row:Data;onClose:()=>void}){
  const {org,me,refresh,notify}=useApp(),s=row.settings,init=fromServer(s.weeklyHours);
  const [always,setAlways]=useState(init.always),[hours,setHours]=useState<Hour[]>(init.hours);
  const [targets,setTargets]=useState<Data[]>(s.transferTargets.map((t:Data)=>({...t,phone:t.phone||''})));
  const isOwner=me.user.platform_role==='owner';
  const update=(i:number,patch:Data)=>setTargets(t=>t.map((x,j)=>j===i?{...x,...patch}:x));
  return <Modal title={`Receptionist · ${row.location.company_name} · ${row.location.name}`} onClose={onClose} wide>
    <Form submit="Save and publish" onSubmit={async d=>{
      const used=new Set<string>();
      const staff=targets.filter(t=>t.name.trim()).map(t=>{let id=t.id||slug(t.name),n=2;while(used.has(id)||id==='reception')id=`${slug(t.name)}-${n++}`;used.add(id);return {id,name:t.name.trim(),role:t.role,phone:t.phone.trim()||null,defaultForRole:!!t.defaultForRole};});
      await api(`/org/${org}/voice/settings/${row.location.id}`,'PUT',{
        assistantName:str(d,'assistantName'),businessName:str(d,'businessName'),businessType:str(d,'businessType'),greeting:str(d,'greeting'),voice:str(d,'voice'),language:str(d,'language'),
        about:str(d,'about'),knowledge:str(d,'knowledge'),policies:str(d,'policies'),emergency:str(d,'emergency'),afterHoursNote:str(d,'afterHoursNote'),
        weeklyHours:always?null:hours.map(h=>h.on?[{open:h.open,close:h.close}]:[]),fallbackPhone:str(d,'fallbackPhone').trim()||null,publicNumbers:lines(str(d,'publicNumbers')),
        transferTargets:staff,transfersEnabled:d.has('transfersEnabled'),callbacksEnabled:d.has('callbacksEnabled'),notifyEmails:lines(str(d,'notifyEmails')),service:isOwner?str(d,'service'):s.service});
      onClose();refresh();notify('Receptionist saved. The next call uses these settings.');}}>
      <h3>Identity</h3>
      <div className="grid two">
        <Field label="Business name (spoken to callers)"><input name="businessName" defaultValue={s.businessName} required maxLength={120}/></Field>
        <Field label="What kind of business?" hint="For example: plumbing company, law firm, dental clinic."><input name="businessType" defaultValue={s.businessType} maxLength={120}/></Field>
        <Field label="Assistant name"><input name="assistantName" defaultValue={s.assistantName} required maxLength={60}/></Field>
        <Field label="Voice"><select name="voice" defaultValue={s.voice}>{VOICES.map(v=><option key={v}>{v}</option>)}</select></Field>
        <Field label="Language / accent"><select name="language" defaultValue={s.language}>{LANGS.map(v=><option key={v}>{v}</option>)}</select></Field>
        {isOwner&&<Field label="Service tier (Nerix only)"><select name="service" defaultValue={s.service}><option value="basic">Reception & support</option><option value="advanced">Advanced support</option></select></Field>}
      </div>
      <Field label="Opening greeting" hint="Leave blank for the default. It is spoken once, exactly as written."><textarea name="greeting" rows={2} defaultValue={s.greeting} maxLength={400}/></Field>
      <h3>What the assistant knows</h3>
      <Field label="About the business" hint="A short description in your own words."><textarea name="about" rows={3} defaultValue={s.about} maxLength={3000}/></Field>
      <Field label="Public facts the assistant may share" hint="Services, prices, address, parking, FAQs. Only this text answers factual questions."><textarea name="knowledge" rows={6} defaultValue={s.knowledge} maxLength={12000}/></Field>
      <Field label="Internal rules (never read aloud)" hint="For example: always take the address for a leak; never quote prices on weekends."><textarea name="policies" rows={3} defaultValue={s.policies} maxLength={6000}/></Field>
      <Field label="Emergency instruction" hint="What should callers be told in an emergency for your business?"><textarea name="emergency" rows={2} defaultValue={s.emergency} maxLength={1500}/></Field>
      <h3>Opening hours</h3>
      <label className="check"><input type="checkbox" checked={always} onChange={e=>setAlways(e.target.checked)}/>Hours not set (the assistant will not say whether you are open)</label>
      {!always&&<div className="hours-list">{hours.map((h,i)=><div key={i} className="grid three" style={{alignItems:'center'}}><label className="check"><input type="checkbox" checked={h.on} onChange={e=>setHours(x=>x.map((y,j)=>j===i?{...y,on:e.target.checked}:y))}/>{DAYS[i]}</label>
        <input type="time" value={h.open} disabled={!h.on} onChange={e=>setHours(x=>x.map((y,j)=>j===i?{...y,open:e.target.value}:y))} aria-label={`${DAYS[i]} opening time`}/>
        <input type="time" value={h.close} disabled={!h.on} onChange={e=>setHours(x=>x.map((y,j)=>j===i?{...y,close:e.target.value}:y))} aria-label={`${DAYS[i]} closing time`}/></div>)}</div>}
      <Field label="After-hours note" hint="Optional. For example: urgent faults are handled by our on-call team."><textarea name="afterHoursNote" rows={2} defaultValue={s.afterHoursNote} maxLength={1500}/></Field>
      <h3>People and callbacks</h3>
      <label className="check"><input type="checkbox" name="transfersEnabled" defaultChecked={s.transfersEnabled}/>Allow live transfers to staff (the assistant asks the staff member to press 1 to accept)</label>
      <label className="check"><input type="checkbox" name="callbacksEnabled" defaultChecked={s.callbacksEnabled}/>Take callback requests</label>
      <div className="grid two">
        <Field label="Front-desk number (fallback)" hint="International format, e.g. +442079460100. Used when a caller asks for someone who is not listed."><input name="fallbackPhone" defaultValue={s.fallbackPhone||''} placeholder="+..."/></Field>
        <Field label="Email callback alerts to" hint="Up to 5 addresses, separated by commas."><input name="notifyEmails" defaultValue={(s.notifyEmails||[]).join(', ')}/></Field>
      </div>
      <Field label="Your public business numbers that forward to the assistant" hint="One per line. Prevents a transfer from looping back to the assistant."><textarea name="publicNumbers" rows={2} defaultValue={(s.publicNumbers||[]).join('\n')}/></Field>
      <h3>Staff directory (private)</h3>
      <p className="small muted">Callers never hear these names unless they say them first. Pick one default contact per role so “the manager” or “billing” goes to the right person.</p>
      {targets.map((t,i)=><div className="grid four" key={i} style={{alignItems:'end'}}>
        <Field label="Name"><input value={t.name} onChange={e=>update(i,{name:e.target.value})} maxLength={100}/></Field>
        <Field label="Role"><select value={t.role} onChange={e=>update(i,{role:e.target.value})}>{Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Direct number"><input value={t.phone} onChange={e=>update(i,{phone:e.target.value})} placeholder="+..."/></Field>
        <div><label className="check"><input type="checkbox" checked={!!t.defaultForRole} onChange={e=>update(i,{defaultForRole:e.target.checked})}/>Default for role</label><button type="button" className="text-button" onClick={()=>setTargets(x=>x.filter((_,j)=>j!==i))}>Remove</button></div></div>)}
      <button type="button" className="button secondary" onClick={()=>setTargets(x=>[...x,{id:'',name:'',role:'staff',phone:'',defaultForRole:false}])}><Plus size={16}/>Add person</button>
    </Form></Modal>;
}

export function Reception(){
  const {org,meta,epoch,refresh,notify,me}=useApp(),numbers=useData(`/org/${org}/voice/numbers`,epoch),settings=useData(`/org/${org}/voice/settings`,epoch);
  const [edit,setEdit]=useState<Data|null>(null),[assign,setAssign]=useState(false),[route,setRoute]=useState<Data|null>(null),[preview,setPreview]=useState<string>('');
  const isOwner=me.user.platform_role==='owner',canEdit=['owner','manager'].includes(meta.role);
  return <><Header title="Your AI receptionist." description="Calls your team cannot answer are forwarded to your Nerix number. The assistant answers, helps, transfers to staff or takes a callback."/>
    <Load state={numbers}>{d=><><div className="grid three">
      <Metric label="Phone service" value={d.gatewayEnabled?'Connected':'Not connected'} note={d.gatewayEnabled?'Ready for forwarded calls':'The call gateway is switched off'}/>
      <Metric label="Email alerts" value={d.emailEnabled?'On':'Off'} note={d.emailEnabled?'Callbacks and invitations are emailed':'Add a Resend key to enable'}/>
      <Metric label="Numbers" value={String(d.numbers.length)} note="Assigned to your locations"/></div>
      <Card title="Your Nerix numbers" aside={isOwner&&<button className="button primary" onClick={()=>setAssign(true)}><Plus size={16}/>Assign number</button>}>
        {d.numbers.length?<Table headers={['Location','Number','Status','Channels','']}>{d.numbers.map((n:Data)=><tr key={n.id}><td><strong>{n.location_name}</strong><small>{n.company_name}</small></td><td><strong>{n.e164}</strong><small>{n.label}</small></td><td><Status value={n.status}/></td><td>{n.included_channels+n.extra_channels} at once</td>
          <td>{isOwner&&<><Action onClick={async()=>{await api(`/org/${org}/voice/numbers/${n.id}`,'PATCH',{status:n.status==='active'?'paused':'active'});refresh();}}>{n.status==='active'?<><Pause size={14}/>Pause</>:<><Play size={14}/>Resume</>}</Action> <button className="text-button" onClick={()=>setRoute(n)}>Gateway route</button></>}</td></tr>)}</Table>
          :<Empty title="No number yet" detail={isOwner?'Assign a VoIPstudio number to a location to start receiving forwarded calls.':'Nerix will assign a number to your location. Then set up your business’s call forwarding to it.'}/>}
        <p className="small muted section-padding">How it works: keep your normal business number. Set it to forward unanswered or busy calls to the Nerix number above (your phone company or VoIPstudio can do this).</p></Card></>}</Load>
    <Load state={settings}>{rows=>rows.map((r:Data)=><Card key={r.location.id} title={`${r.location.company_name} · ${r.location.name}`} aside={<Badge tone={r.configured?'green':'amber'}>{r.configured?'Configured':'Not configured yet'}</Badge>}>
      <p>{r.location.e164?<>Forwarding number: <strong>{r.location.e164}</strong></>:<span className="muted">No Nerix number assigned yet.</span>} · Assistant: <strong>{r.settings.assistantName}</strong> · {r.settings.language} · {r.settings.transferTargets.length+(r.settings.fallbackPhone?1:0)} staff contact(s)</p>
      <div className="button-row">{canEdit&&<button className="button primary" onClick={()=>setEdit(r)}>{r.configured?'Edit receptionist':'Set up receptionist'}</button>}
        <Action onClick={async()=>{const p=await api(`/org/${org}/voice/preview/${r.location.id}`);setPreview(p.instructions);}}><Eye size={15}/>Preview instructions</Action></div></Card>)}</Load>
    {edit&&<SettingsEditor row={edit} onClose={()=>setEdit(null)}/>}
    {preview&&<Modal title="Instructions the assistant receives" onClose={()=>setPreview('')} wide><pre className="prompt-preview">{preview}</pre></Modal>}
    {assign&&<Modal title="Assign a Nerix number" onClose={()=>setAssign(false)}><Form submit="Assign number" onSubmit={async d=>{await api(`/org/${org}/voice/numbers`,'POST',{locationId:str(d,'locationId'),e164:str(d,'e164').replace(/[\s()-]/g,''),label:str(d,'label'),includedChannels:Number(str(d,'includedChannels')||2),extraChannels:Number(str(d,'extraChannels')||0)});setAssign(false);refresh();notify('Number assigned. Now add its gateway route on the Oracle server.');}}>
      <Field label="Location"><select name="locationId" required>{meta.locations.map((l:Data)=><option key={l.id} value={l.id}>{meta.companies.find((c:Data)=>c.id===l.company_id)?.name} · {l.name}</option>)}</select></Field>
      <Field label="VoIPstudio number" hint="International format, for example +442079460100."><input name="e164" required placeholder="+442079460100"/></Field>
      <Field label="Label (optional)"><input name="label" maxLength={80}/></Field>
      <div className="grid two"><Field label="Included simultaneous calls"><input name="includedChannels" type="number" min={1} max={20} defaultValue={2}/></Field><Field label="Extra simultaneous calls"><input name="extraChannels" type="number" min={0} max={20} defaultValue={0}/></Field></div></Form></Modal>}
    {route&&<Modal title="Gateway route (Oracle server)" onClose={()=>setRoute(null)} wide><p>Add this object to the <code>routes</code> list in <code>/etc/nerix/gateway-routing.json</code>, then restart the gateway when no calls are active. The trunk names match the VoIPstudio forwarding example (<code>vs-forward</code> in, <code>vs-payg</code> out for staff transfers). Change <code>callerIdVerified</code> to <code>true</code> only after you have confirmed in VoIPstudio that this number may be used as the caller ID on the central outbound registration; until then the gateway refuses staff transfers on purpose. Staff numbers must be listed in <code>transferNumbers</code> or transfers are refused.</p>
      <pre className="prompt-preview">{JSON.stringify(route.route,null,2)}</pre><Action onClick={async()=>{await navigator.clipboard.writeText(JSON.stringify(route.route,null,2));notify('Route copied.');}}><Copy size={16}/>Copy route</Action></Modal>}</>;
}

export function InboundCalls(){
  const {org,meta,epoch,refresh,notify}=useApp(),calls=useData(`/org/${org}/voice/calls`,epoch),cbs=useData(`/org/${org}/voice/callbacks`,epoch);
  const [tab,setTab]=useState<'callbacks'|'calls'>('callbacks'),[all,setAll]=useState(false),writable=meta.role!=='viewer';
  return <><Header title="Every call, handled." description="Callback requests left by callers, and the history of calls the assistant answered."/>
    <Load state={calls}>{rows=>{const week=rows.filter((c:Data)=>Date.now()-new Date(c.started_at).getTime()<7*864e5);return <div className="grid three">
      <Metric label="Calls (7 days)" value={String(week.length)} note="Answered by the assistant" icon={<PhoneIncoming size={16}/>}/>
      <Metric label="Talk time (7 days)" value={dur(week.reduce((a:number,c:Data)=>a+Number(c.billable_seconds||0),0))} note="Billable AI time"/>
      <Metric label="Transferred to staff" value={String(week.filter((c:Data)=>c.transfers.some((t:Data)=>['connected','completed'].includes(t.status))).length)} note="Live transfers accepted"/></div>;}}</Load>
    <div className="button-row"><button className={`button ${tab==='callbacks'?'primary':'secondary'}`} onClick={()=>setTab('callbacks')}>Callbacks</button><button className={`button ${tab==='calls'?'primary':'secondary'}`} onClick={()=>setTab('calls')}>Call history</button></div>
    {tab==='callbacks'&&<Card title="Callback requests" aside={<label className="check"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Show finished</label>}><Load state={cbs}>{rows=>{const shown=rows.filter((c:Data)=>all||['pending','in_progress'].includes(c.status));return shown.length?<div className="task-list">{shown.map((c:Data)=><div className="task" key={c.id}><div className="task-icon"><Phone size={19}/></div>
      <div><strong>{c.caller_name}{c.caller_company_name?` · ${c.caller_company_name}`:''}</strong><p><a href={`tel:${c.caller_phone}`}>{c.caller_phone}</a> · {c.location_name}</p><p className="small">{c.reason}</p>{c.requested_recipient&&<p className="small muted">Asked for: {c.requested_recipient}</p>}<small>{fmtDate(c.created_at)}</small></div>
      <div className="task-side"><Status value={c.status==='pending'?'open':c.status}/>{writable&&<><select value={c.status} aria-label="Callback status" onChange={async e=>{await api(`/org/${org}/voice/callbacks/${c.id}`,'PATCH',{status:e.target.value});refresh();notify('Callback updated.');}}><option value="pending">New</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="cancelled">Cancelled</option></select></>}</div></div>)}</div>
      :<Empty title="No callbacks waiting" detail="When a caller asks for a callback it appears here and in Follow-ups, and is emailed if alerts are on."/>;}}</Load></Card>}
    {tab==='calls'&&<Card title="Recent calls"><Load state={calls}>{rows=>rows.length?<Table headers={['When','Location','Caller','Outcome','AI time','Charge']}>{rows.map((c:Data)=><tr key={c.id}><td>{fmtDate(c.started_at)}</td><td>{c.location_name}<small>{c.after_hours?'After hours':''}</small></td><td>{c.caller_phone||'Withheld'}</td>
      <td><Status value={c.outcome||c.status}/>{c.transfers.length>0&&<small>Transfer: {c.transfers.map((t:Data)=>t.status).join(', ')}</small>}</td><td>{dur(Number(c.billable_seconds))}{Number(c.unfunded_seconds)>0&&<small>{c.unfunded_seconds}s not funded</small>}</td><td>{c.billing_enabled?money(c.charge,4):'Internal'}{!c.ended_at&&<small>In progress</small>}</td></tr>)}</Table>
      :<Empty title="No calls yet" detail="Forwarded calls will be listed here with their outcome, time and charge."/>}</Load></Card>}</>;
}
