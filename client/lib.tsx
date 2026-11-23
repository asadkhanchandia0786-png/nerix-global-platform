import React,{createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import { X,LoaderCircle,Inbox,ArrowUpRight,CheckCircle2,AlertCircle } from 'lucide-react';
export type Data=Record<string,any>;
let csrf='';export const setCsrf=(token:string)=>{csrf=token;};
export async function api(path:string,method='GET',body?:unknown){
  const r=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Nerix-Client':'workspace',...(csrf?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(!r.ok){if(r.status===401&&!path.startsWith('/auth'))window.dispatchEvent(new Event('session-expired'));throw new Error(data.error||'Request failed.');}return data;
}
export interface Context {me:Data;org:string;meta:Data;refresh:()=>void;epoch:number;navigate:(page:string)=>void;notify:(s:string)=>void}
export const AppContext=createContext<Context>({} as Context);export const useApp=()=>useContext(AppContext);
export function useData(path:string|null,epoch=0){
  const [state,setState]=useState<{path:string|null;data:any;loading:boolean;error:string}>({path:null,data:null,loading:false,error:''});
  useEffect(()=>{
    let current=true;
    if(!path){setState({path:null,data:null,loading:false,error:''});return;}
    // Refresh the same resource without unmounting forms and result dialogs.
    // A changed path always clears the old resource, including workspace switches.
    setState(previous=>previous.path===path&&previous.data!==null?{...previous,error:''}:{path,data:null,loading:true,error:''});
    api(path).then(data=>{if(current)setState({path,data,loading:false,error:''});}).catch(e=>{if(current)setState({path,data:null,loading:false,error:e.message});});
    return()=>{current=false;};
  },[path,epoch]);
  return state.path===path?state:{data:null,loading:!!path,error:''};
}
export const fmtDate=(value:string|null)=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
export function Badge({children,tone=''}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`}>{children}</span>;}
export function Status({value}:{value:string}){return <Badge tone={['ready','completed','done','settled','Interested','active','qualified','resolved'].includes(value)?'green':['Do not call','cancelled','reversed','paused','Failed'].includes(value)?'red':'neutral'}>{value.replaceAll('_',' ')}</Badge>;}
export function Empty({title,detail,action}:{title:string;detail?:string;action?:ReactNode}){return <div className="empty"><Inbox size={28}/><h3>{title}</h3>{detail&&<p>{detail}</p>}{action}</div>;}
export function Loading(){return <div className="loading"><LoaderCircle className="spin" size={22}/> Loading workspace…</div>;}
export function ErrorBox({message}:{message:string}){return message?<div className="error" role="alert"><AlertCircle size={18}/>{message}</div>:null;}
export function Load({state,children}:{state:ReturnType<typeof useData>;children:(data:any)=>ReactNode}){return state.loading?<Loading/>:state.error?<ErrorBox message={state.error}/>:children(state.data);}
export function Header({eyebrow,title,description,action}:{eyebrow?:string;title:string;description:string;action?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow||'YOUR WORKSPACE'}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
export function Card({title,aside,children,className=''}:{title?:string;aside?:ReactNode;children:ReactNode;className?:string}){return <section className={`card ${className}`}>{title&&<div className="card-head"><h2>{title}</h2>{aside}</div>}{children}</section>;}
export function Metric({label,value,note,icon}:{label:string;value:ReactNode;note:string;icon?:ReactNode}){return <div className="metric"><div className="metric-label">{label}{icon}</div><strong>{value}</strong><span>{note}</span></div>;}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <div className="field"><label className="control-label"><span>{label}</span>{children}</label>{hint&&<small>{hint}</small>}</div>;}
export function Form({children,onSubmit,submit='Save changes'}:{children:ReactNode;onSubmit:(d:FormData)=>Promise<void>;submit?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <form onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);const d=new FormData(e.currentTarget);try{await onSubmit(d);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <fieldset disabled={busy}>{children}</fieldset><ErrorBox message={error}/><div className="form-footer"><button className="button primary" disabled={busy} type="submit">{busy?<><LoaderCircle size={16} className="spin"/>Saving…</>:submit}</button></div>
  </form>;
}
export const str=(d:FormData,k:string)=>String(d.get(k)||'');
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const ref=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{const prior=document.activeElement as HTMLElement;const old=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.querySelector<HTMLElement>('button,input,select')?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')closeRef.current();if(e.key==='Tab'){const els=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')||[]);const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);prior?.focus();};},[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}><div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div><div className="modal-body">{children}</div></div></div>;
}
export function Table({headers,children}:{headers:string[];children:ReactNode}){return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
export function Action({children,onClick,className='button secondary',disabled=false}:{children:ReactNode;onClick:()=>Promise<unknown>;className?:string;disabled?:boolean}){
  const [busy,setBusy]=useState(false),[err,setErr]=useState('');return <><button type="button" disabled={busy||disabled} className={className} onClick={async()=>{setBusy(true);setErr('');try{await onClick();}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}}>{busy?<LoaderCircle size={16} className="spin"/>:children}</button>{err&&<span className="inline-error" role="alert">{err}</span>}</>;
}
export function ScopeFields({meta,company,location,onCompany,onLocation}:{meta:Data;company:string;location:string;onCompany:(id:string)=>void;onLocation:(id:string)=>void}){return <div className="grid two"><Field label="Company"><select name="companyId" value={company} onChange={e=>{onCompany(e.target.value);onLocation(meta.locations.find((l:Data)=>l.company_id===e.target.value)?.id||'');}} required>{meta.companies.map((c:Data)=><option value={c.id} key={c.id}>{c.name}</option>)}</select></Field><Field label="Location"><select name="locationId" value={location} onChange={e=>onLocation(e.target.value)} required><option value="" disabled>Select a location</option>{meta.locations.filter((l:Data)=>l.company_id===company).map((l:Data)=><option value={l.id} key={l.id}>{l.name}</option>)}</select></Field></div>;}
export function Success({children}:{children:ReactNode}){return <div className="success"><CheckCircle2 size={18}/>{children}</div>;}
export function LinkButton({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button type="button" className="text-button" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>;}
export class Boundary extends React.Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="fatal"><h1>Let’s reload your workspace.</h1><p>An unexpected screen error occurred. Your saved data is still on the server.</p><button className="button primary" onClick={()=>location.reload()}>Reload</button></div>:this.props.children;}}
