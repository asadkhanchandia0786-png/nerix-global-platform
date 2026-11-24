// Owner-only: create and edit customer accounts, and unlock / lock their AI and phone features.
import {useState} from 'react';
import {Plus,Copy} from 'lucide-react';
import {api,useApp,useData,Load,Card,Badge,Empty,Table,Field,Form,str,Modal,Action,fmtDate,type Data} from './lib.tsx';
import {money} from '../shared/constants.ts';
const ACCESS_LABEL:Record<string,string>={active:'Activated',locked:'Locked · awaiting activation',suspended:'Suspended by Nerix'};
export function AccountsAdmin(){
  const{epoch,refresh,notify}=useApp(),state=useData('/admin/accounts',epoch),industry=useData('/industries'),[modal,setModal]=useState<''|'create'|'edit'|'password'>(''),[row,setRow]=useState<Data|null>(null),[link,setLink]=useState('');
  const open=(m:'create'|'edit'|'password',r?:Data)=>{setRow(r||null);setModal(m);};
  const setAccess=async(r:Data,status:string)=>{await api(`/admin/org/${r.org_id}/activation`,'POST',{status,note:status==='active'?'Activated by Nerix administrator':''});refresh();notify(status==='active'?'Workspace activated.':'Workspace locked.');};
  return <><Card title="Customer accounts" aside={<button className="button primary" onClick={()=>open('create')}><Plus size={16}/>Create account</button>}>
    <Load state={state}>{d=>d.accounts.length?<Table headers={['Person','Business','Access','Funds','Actions']}>{d.accounts.map((r:Data)=><tr key={r.user_id}>
      <td><strong>{r.name}</strong><small>{r.email}</small><small>{r.email_verified_at?'Email verified':'Email not verified'}{r.self_registered?' · self sign-up':' · created by Nerix'}{!r.active?' · disabled':''}</small></td>
      <td><strong>{r.business}</strong><small>Created {fmtDate(r.created_at)}</small></td>
      <td><Badge tone={r.activation_status==='active'||!r.locked?'green':'amber'}>{r.locked?(ACCESS_LABEL[r.activation_status]||r.activation_status):r.activation_status==='locked'?'Unlocked by funded wallet':ACCESS_LABEL[r.activation_status]}</Badge></td>
      <td>{money(Number(r.paid)+Number(r.bonus))}</td>
      <td><div className="button-row wrap">
        <button className="text-button" onClick={()=>open('edit',r)}>Edit</button>
        {r.activation_status==='active'?<Action className="text-button" onClick={()=>setAccess(r,'suspended')}>Lock</Action>:<Action className="text-button" onClick={()=>setAccess(r,'active')}>Activate</Action>}
        <button className="text-button" onClick={()=>open('password',r)}>Password</button>
        {!r.email_verified_at&&<Action className="text-button" onClick={async()=>{await api(`/admin/accounts/${r.user_id}/resend-verification`,'POST',{});notify('A new verification code was sent.');}}>Resend code</Action>}
      </div></td></tr>)}</Table>:<Empty title="No customer accounts yet" detail="Accounts appear here when someone signs up or when you create one."/>}</Load>
    <div className="card-foot">New self sign-ups start locked: the AI receptionist, phone numbers, AI agents, campaigns and outbound calls stay read-only until you activate them or their wallet is funded. “Lock” is a hard lock that a funded wallet does not lift.</div></Card>
    {modal&&<Modal title={modal==='create'?'Create customer account':modal==='edit'?'Edit account':'Reset password'} onClose={()=>setModal('')}>
      {modal==='create'&&<Form submit="Create account" onSubmit={async f=>{const out=await api('/admin/accounts','POST',{name:str(f,'name'),business:str(f,'business'),email:str(f,'email'),industry:str(f,'industry')||'general',...(str(f,'password')?{password:str(f,'password')}:{}),activate:f.has('activate'),sendEmail:f.has('sendEmail')});setModal('');refresh();if(out.setPasswordLink)setLink(out.setPasswordLink);else notify('Account created.');}}>
        <Field label="Full name"><input name="name" required maxLength={200}/></Field>
        <Field label="Company / business name"><input name="business" required maxLength={120}/></Field>
        <Field label="Work email"><input name="email" type="email" required/></Field>
        <Field label="Industry"><select name="industry" defaultValue="general">{(industry.data||[]).map((i:Data)=><option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
        <Field label="Password (optional)" hint="Leave empty to email them a link to choose their own (valid 48 hours)."><input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password"/></Field>
        <label className="check"><input type="checkbox" name="sendEmail" defaultChecked/>Email them the set-password link</label>
        <label className="check"><input type="checkbox" name="activate"/>Activate AI receptionist and phone features now</label>
        <p className="small muted">Accounts you create are marked email-verified. Without activation they stay locked like a self sign-up.</p></Form>}
      {modal==='edit'&&row&&<Form onSubmit={async f=>{await api(`/admin/accounts/${row.user_id}`,'PATCH',{name:str(f,'name'),email:str(f,'email'),business:str(f,'business'),active:f.has('active'),emailVerified:f.has('verified')});setModal('');refresh();notify('Account updated. Changing email, disabling or un-verifying signs the person out.');}}>
        <Field label="Full name"><input name="name" defaultValue={row.name} required maxLength={200}/></Field>
        <Field label="Company / business name"><input name="business" defaultValue={row.business} required maxLength={120}/></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={row.email} required/></Field>
        <label className="check"><input type="checkbox" name="verified" defaultChecked={!!row.email_verified_at}/>Email verified</label>
        <label className="check"><input type="checkbox" name="active" defaultChecked={row.active}/>Account enabled</label></Form>}
      {modal==='password'&&row&&<Form submit="Apply" onSubmit={async f=>{const out=await api(`/admin/accounts/${row.user_id}/password`,'POST',str(f,'password')?{password:str(f,'password')}:{});setModal('');if(out.setPasswordLink)setLink(out.setPasswordLink);else notify(out.emailed?'A set-password email was sent.':'Password changed. They were signed out.');}}>
        <p><strong>{row.name}</strong> · {row.email}</p>
        <Field label="New password (optional)" hint="Leave empty to email them a link instead. Setting one here signs them out everywhere."><input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password"/></Field></Form>}
    </Modal>}
    {link&&<Modal title="Set-password link" onClose={()=>setLink('')}><p>Email is not available, so no message was sent. Share this link privately; it is valid for 48 hours.</p><input className="copy-field" value={link} readOnly onFocus={e=>e.target.select()} aria-label="Set-password link"/><Action onClick={async()=>{await navigator.clipboard.writeText(link);notify('Link copied.');}}><Copy size={15}/>Copy link</Action></Modal>}
  </>;
}
