import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import request from 'supertest';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id} from '../server/core.ts';

const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://nerixglobal.com/',runScripts:'outside-only',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','Event','MouseEvent','FormData','MutationObserver','location','history'])Object.defineProperty(globalThis,key,{value:(dom.window as any)[key],configurable:true,writable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;dom.window.scrollTo=()=>{};
Object.defineProperty(dom.window,'crypto',{value:{randomUUID:id},configurable:true});(dom.window as any).AbortSignal=globalThis.AbortSignal;
let db:DB,app:ReturnType<typeof createApp>,staff:ReturnType<typeof request.agent>,me:any,ui:any,screen:any,within:any,user:any,cleanup:()=>void,widgetSource:string,aiCalls=0,publicCalls=0;
const intervals:number[]=[];const originalInterval=dom.window.setInterval.bind(dom.window);
const pollers:Array<()=>Promise<void>>=[];
dom.window.setInterval=((handler:any,ms?:number)=>{const key=originalInterval(handler,ms);intervals.push(key);pollers.push(handler);return key;}) as any;
const bridge=async(url:any,options:any={})=>{
  const target=new URL(String(url),dom.window.location.href),path=target.pathname+target.search,method=(options.method||'GET').toLowerCase(),isPublic=path.startsWith('/chat-api/');
  const r=(isPublic?request(app):staff as any)[method](path);if(isPublic){publicCalls++;r.set('Origin',dom.window.location.origin);}
  for(const[k,v]of Object.entries(options.headers||{}))r.set(k,v as string);if(options.body)r.send(options.body);const result=await r;return{ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.body} as Response;
};
before(async()=>{
  db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken:'widget-ui-setup-token-24-characters',chat:{aiEnabled:true,provider:async()=>{aiCalls++;return{text:'Sarah can explain your setup and help while you wait.',usage:{input_tokens:40,output_tokens:12}};}}});staff=request.agent(app);
  const setup=await staff.post('/api/auth/setup').set('X-Nerix-Client','workspace').send({setupToken:'widget-ui-setup-token-24-characters',name:'Chat Owner',email:'widget-owner@example.test',password:'Widget-password-test-12345'});assert.equal(setup.status,200,JSON.stringify(setup.body));me=(await staff.get('/api/me')).body;
  globalThis.fetch=bridge as typeof fetch;(dom.window as any).fetch=bridge;
  const lib=await import('@testing-library/react');ui=lib;lib.configure({asyncUtilTimeout:10000});screen=lib.screen;within=lib.within;cleanup=lib.cleanup;
  user=(await import('@testing-library/user-event')).default.setup({document:dom.window.document,delay:null});widgetSource=await readFile(new URL('../public/chat-widget.js',import.meta.url),'utf8');
  (await import('../client/lib.tsx')).setCsrf(me.csrf);
});
afterEach(()=>{cleanup();for(const key of intervals.splice(0))dom.window.clearInterval(key);pollers.length=0;(dom.window as any).fetch=bridge;document.getElementById('nrx-chat-root')?.remove();sessionStorageClear();});
after(async()=>{await db.close();dom.window.close();});
function sessionStorageClear(){dom.window.sessionStorage.clear();}
function loadWidget(apiBase='https://api.example.test',siteKey='nerix-global'){(dom.window as any).NERIX_CHAT={apiBase,siteKey};dom.window.eval(widgetSource);return within(document.getElementById('nrx-chat-root'));}

test('Visitor widget and staff inbox complete reason-first handoff, human replies and resolution through the actual API',async()=>{
  const{LiveChat}=await import('../client/chat.tsx'),{AppContext}=await import('../client/lib.tsx');
  const org=me.orgs[0].id,meta=(await staff.get(`/api/org/${org}/meta`)).body;
  ui.render(React.createElement(AppContext.Provider,{value:{me,org,meta,epoch:0,refresh:()=>{},notify:()=>{},navigate:()=>{}}},React.createElement(LiveChat)));
  await screen.findByRole('heading',{name:'Every visitor deserves a reply.'});await screen.findByText('Sarah · Nerix Global’s AI assistant');await ui.waitFor(()=>assert.ok(!screen.getByRole('button',{name:'Go available'}).disabled));await user.click(screen.getByRole('button',{name:'Go available'}));await screen.findByRole('button',{name:'Set yourself unavailable'});
  const widget=loadWidget();await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/Hi, I'm Sarah/);
  await user.type(widget.getByLabelText('Your message'),'Can Sarah explain my setup?');await user.click(widget.getByRole('button',{name:'Send message'}));await widget.findByText('Sarah can explain your setup and help while you wait.');
  await user.click(widget.getByRole('button',{name:'Talk to our team'}));assert.ok(widget.getByLabelText('Reason for contacting our team'));assert.ok(!widget.queryByLabelText('Your name'));
  await user.type(widget.getByLabelText('Reason for contacting our team'),'I want help setting up my website chat.');await user.click(widget.getByRole('button',{name:'Continue to contact details'}));await user.type(widget.getByLabelText('Your name'),'Widget Visitor');await user.type(widget.getByLabelText('Email address'),'widget-visitor@example.test');await user.type(widget.getByLabelText('Phone with country code'),'+442079460022');await user.click(widget.getByRole('checkbox'));await user.click(widget.getByRole('button',{name:'Request a human agent'}));
  await widget.findByText(/Your request and contact details are saved/);
  const row=await screen.findByRole('button',{name:/Widget Visitor waiting/});await user.click(row);await screen.findByText('widget-visitor@example.test');await user.click(await screen.findByRole('button',{name:'Join chat'}));await widget.findByText(/Chat Owner has joined/);
  assert.equal(widget.queryByRole('button',{name:'Browse FAQs'}),null,'Preset replies must stop when a person joins');
  const before=aiCalls;await user.type(widget.getByLabelText('Your message'),'Hello to the live person.');await user.click(widget.getByRole('button',{name:'Send message'}));assert.equal(aiCalls,before);
  await user.type(await screen.findByLabelText('Reply to visitor'),'Thanks. I can help you get started.');await user.click(screen.getByRole('button',{name:'Send reply'}));await widget.findByText('Thanks. I can help you get started.');
  await pollers.at(-1)!();await pollers.at(-1)!();
  assert.equal(widget.getByText('Thanks. I can help you get started.').closest('.nrx-bubble').hidden,false,'Human replies must remain visible after polling');
  assert.equal(widget.queryByRole('button',{name:'Talk to our team'}),null,'The request button stays hidden after a person joins');
  await user.click(screen.getByRole('button',{name:'Resolve & close'}));await widget.findByText(/Our team marked this conversation resolved/);
});
test('Unconfigured website widget clearly uses local FAQ help and prepares an unsent email without saving a false follow-up',async()=>{
  const before=publicCalls,widget=loadWidget('');await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/messages are not being saved/);
  await user.click(widget.getByRole('button',{name:'Talk to our team'}));await user.type(widget.getByLabelText('Reason for contacting our team'),'I have a pricing question.');await user.click(widget.getByRole('button',{name:'Continue to contact details'}));await user.type(widget.getByLabelText('Your name'),'Offline Visitor');await user.type(widget.getByLabelText('Email address'),'offline@example.test');await user.type(widget.getByLabelText('Phone with country code'),'+442079460021');await user.click(widget.getByRole('checkbox'));await user.click(widget.getByRole('button',{name:'Prepare email draft'}));
  await widget.findByText('Your email draft is ready. It has not been sent or saved to the team inbox.');const href=widget.getByRole('link',{name:'Open my email draft'}).getAttribute('href');assert.match(decodeURIComponent(href),/Offline Visitor/);assert.equal(publicCalls,before);
});
test('A disconnected client widget never substitutes Nerix pricing for the client’s business information',async()=>{
  const widget=loadWidget('','site-client-example');await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/messages are not being saved/);await user.type(widget.getByLabelText('Your message'),'What is your price?');await user.click(widget.getByRole('button',{name:'Send message'}));await widget.findByText(/cannot confirm this business’s information or prices/);assert.ok(!document.getElementById('nrx-chat-root')!.textContent!.includes('$0.30'));
});
test('A delayed poll from an old conversation cannot reappear in a newly started chat',async()=>{
  const widget=loadWidget();await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/Hi, I'm Sarah/);
  await user.type(widget.getByLabelText('Your message'),'An old conversation message.');await user.click(widget.getByRole('button',{name:'Send message'}));await widget.findByText('An old conversation message.');
  await ui.waitFor(()=>assert.equal(widget.getByRole('button',{name:'Send message'}).disabled,false));
  let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>started=r);let hold=true;
  (dom.window as any).fetch=async(url:any,options:any)=>{
    const response=await bridge(url,options);
    if(hold&&(!options?.method||options.method==='GET')&&/\/conversations\/[^/]+$/.test(String(url))){hold=false;started();await held;}
    return response;
  };
  const pending=pollers.at(-1)!();await waiting;
  await user.click(widget.getByRole('button',{name:'New chat'}));
  await ui.waitFor(()=>{assert.equal(widget.queryByText('An old conversation message.'),null);assert.ok(widget.getByText(/Hi, I'm Sarah/));});
  release();await pending;
  assert.equal(widget.queryByText('An old conversation message.'),null);
});
test('New chat recovers an expired session and the privacy link points to an actual public policy',async()=>{
  const widget=loadWidget();await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/Hi, I'm Sarah/);
  const session=JSON.parse(dom.window.sessionStorage.getItem('nerix-chat:https://api.example.test:nerix-global')!);
  await db.query("UPDATE chat_conversations SET expires_at=now()-interval '1 minute' WHERE id=$1",[session.conversationId]);
  await user.click(widget.getByRole('button',{name:'New chat'}));
  await ui.waitFor(()=>{const next=JSON.parse(dom.window.sessionStorage.getItem('nerix-chat:https://api.example.test:nerix-global')!);assert.notEqual(next.conversationId,session.conversationId);});
  assert.equal(widget.getByRole('link',{name:'Privacy'}).href,'https://nerixglobal.com/privacy');
});
test('A client widget without an approved contact address does not send its visitors to Nerix by default',async()=>{
  const widget=loadWidget('','site-client-example');await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/messages are not being saved/);
  await user.click(widget.getByRole('button',{name:'Talk to our team'}));await widget.findByText(/no email contact is configured/);
  assert.equal(widget.queryByLabelText('Your name'),null);assert.equal(document.querySelector('#nrx-chat-root a[href^="mailto:"]'),null);
  assert.equal(widget.queryByRole('button',{name:'Browse FAQs'}),null,'Client sites must not expose the Nerix catalog');
});

test('A protected same-origin preview keeps its browser sign-in and saves a human request without OpenAI',async()=>{
  const previousApp=app,modes:string[]=[];
  app=createApp(db,{mode:'demo',setupToken:'widget-ui-setup-token-24-characters'});
  try{
    (dom.window as any).fetch=async(url:any,options:any={})=>{
      modes.push(options.credentials);
      if(options.credentials!=='same-origin')return new Response('<html>Sign in to Replit</html>',{status:401,headers:{'Content-Type':'text/html'}});
      return bridge(url,options);
    };
    dom.window.eval(await readFile(new URL('../public/chat-demo.js',import.meta.url),'utf8'));
    dom.window.eval(widgetSource);
    const widget=within(document.getElementById('nrx-chat-root'));
    await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));
    await ui.waitFor(()=>assert.ok(modes.length));assert.equal(modes[0],'same-origin');
    await widget.findByText(/common Nerix Global questions using prepared replies/);
    assert.equal(widget.queryByText(/messages are not being saved/),null);
    await user.click(widget.getByRole('button',{name:'Talk to our team'}));
    await user.type(widget.getByLabelText('Reason for contacting our team'),'Preview connection test.');
    await user.click(widget.getByRole('button',{name:'Continue to contact details'}));
    await user.type(widget.getByLabelText('Your name'),'Preview Visitor');
    await user.type(widget.getByLabelText('Email address'),'preview-visitor@example.test');
    await user.type(widget.getByLabelText('Phone with country code'),'+442079460028');
    await user.click(widget.getByRole('checkbox'));
    await user.click(widget.getByRole('button',{name:'Request a human agent'}));
    await widget.findByText(/Your request and contact details are saved/);
    assert.ok(modes.every(m=>m==='same-origin'));
    assert.equal((await db.query("SELECT count(*)::int AS count FROM chat_conversations WHERE contact->>'email'='preview-visitor@example.test'")).rows[0].count,1);
  }finally{app=previousApp;}
});

test('Preview credential opt-in never sends cookies to a different API origin',async()=>{
  const modes:string[]=[];
  (dom.window as any).fetch=async(url:any,options:any={})=>{modes.push(options.credentials);return bridge(url,options);};
  (dom.window as any).NERIX_CHAT={apiBase:'https://api.example.test',siteKey:'nerix-global',previewCredentials:true};
  dom.window.eval(widgetSource);const widget=within(document.getElementById('nrx-chat-root'));
  await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/Hi, I'm Sarah/);
  assert.ok(modes.length>=2);assert.ok(modes.every(m=>m==='omit'));
});

test('A preview login page is explained instead of silently hiding the connection failure',async()=>{
  (dom.window as any).fetch=async()=>new Response('<html>Sign in</html>',{status:401,headers:{'Content-Type':'text/html'}});
  const widget=loadWidget(dom.window.location.origin);
  await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));
  await widget.findByText(/messages are not being saved/);
  assert.match(widget.getByRole('alert').textContent,/Replit sign-in/);
});

test('An unconnected website can browse the complete prepared catalog without an API request or a false saved message',async()=>{
  const before=publicCalls,widget=loadWidget('');await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/messages are not being saved/);
  await user.click(widget.getByRole('button',{name:'Browse FAQs'}));await widget.findByRole('heading',{name:'Frequently asked questions'});
  const {FAQ_TOPICS}=await import('../shared/faq.ts');assert.equal(document.querySelectorAll('.nrx-faq-question').length,FAQ_TOPICS.length);
  await user.click(widget.getByRole('button',{name:'What is the minimum first deposit and later top-up?'}));
  await widget.findByText(FAQ_TOPICS.find(item=>item.id==='deposit')!.answer);
  assert.equal(widget.queryByRole('heading',{name:'Frequently asked questions'}),null);assert.equal(publicCalls,before);
  assert.match(widget.getByRole('status').textContent,/live connection offline/);
});

test('Connected preset FAQ mode saves a selected answer and labels the intentional mode without an AI-offline warning',async()=>{
  const previousApp=app,before=aiCalls;app=createApp(db,{mode:'demo',setupToken:'widget-ui-setup-token-24-characters'});
  try{
    const widget=loadWidget();await user.click(widget.getByRole('button',{name:'Chat with Nerix Global'}));await widget.findByText(/common Nerix Global questions using prepared replies/);
    assert.equal(widget.getByRole('status').textContent,'Preset FAQ help');assert.doesNotMatch(document.getElementById('nrx-chat-root')!.textContent!,/AI offline|AI connection offline/);
    await user.click(widget.getByRole('button',{name:'Browse FAQs'}));await user.click(widget.getByRole('button',{name:'Can I get a refund of unused paid credit?'}));
    const {FAQ_TOPICS}=await import('../shared/faq.ts');await widget.findByText(FAQ_TOPICS.find(item=>item.id==='refunds')!.answer);
    const stored=JSON.parse(dom.window.sessionStorage.getItem('nerix-chat:https://api.example.test:nerix-global')!);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM chat_messages WHERE conversation_id=$1 AND sender=$2',[stored.conversationId,'visitor'])).rows[0].count,1);
    assert.equal(aiCalls,before);
  }finally{app=previousApp;}
});
