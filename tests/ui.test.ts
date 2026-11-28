import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import request from 'supertest';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {startEmail} from '../server/email.ts';
import React from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Node','Event','MouseEvent','FormData','MutationObserver','location','history'])Object.defineProperty(globalThis,key,{value:(dom.window as any)[key],configurable:true,writable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
dom.window.scrollTo=()=>{};
let db:DB,app:ReturnType<typeof createApp>,agent:ReturnType<typeof request.agent>,ui:any,screen:any,within:any,user:any,cleanup:()=>void;
const setupToken='ui-test-setup-token-at-least-24-chars';
before(async()=>{
  db=await openDB(undefined,'memory://');await migrate(db);app=createApp(db,{mode:'demo',setupToken});agent=request.agent(app);
  globalThis.fetch=(async(url:any,options:any={})=>{
    if(String(url)==='https://api.resend.com/emails')return new Response(null,{status:200});
    const method=(options.method||'GET').toLowerCase(),r=(agent as any)[method](String(url));for(const[k,v]of Object.entries(options.headers||{}))r.set(k,v as string);if(options.body)r.send(options.body);const result=await r;return{ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.body} as Response;
  }) as typeof fetch;
  const lib=await import('@testing-library/react');ui=lib;lib.configure({asyncUtilTimeout:8000});screen=lib.screen;within=lib.within;cleanup=lib.cleanup;
  user=(await import('@testing-library/user-event')).default.setup({document:dom.window.document,delay:null});
});
after(async()=>{cleanup();await db.close();dom.window.close();});
test('Owner can initialize, navigate all screens, save a profile and add a lead through the actual UI/API',async()=>{
  const{App}=await import('../client/app.tsx');ui.render(React.createElement(App));
  await screen.findByText('Make it yours.');await user.type(screen.getByLabelText('Setup key'),setupToken);await user.type(screen.getByLabelText('Your name'),'Asad Test');await user.type(screen.getByLabelText('Email address'),'ui-owner@example.test');await user.type(screen.getByLabelText('Password'),'UI-test-password-12345');await user.click(screen.getByRole('button',{name:'Create owner account →'}));
  await screen.findByRole('heading',{name:'Hello, Asad.'});await screen.findByText('Your first conversation is ahead');
  const nav=within(screen.getByRole('navigation'));
  await user.click(nav.getByRole('button',{name:'AI agents'}));await screen.findByRole('heading',{name:'A voice for every moment.'});
  await screen.findByRole('heading',{name:'Alex'});const alex=screen.getByRole('heading',{name:'Alex'}).closest('section');await user.click(within(alex).getByRole('button',{name:'Edit profile'}));
  const dialog=screen.getByRole('dialog');const knowledge=within(dialog).getByLabelText(/Approved business knowledge/);await user.clear(knowledge);await user.type(knowledge,'Nerix Global provides thoughtful AI conversations.');await user.click(within(dialog).getByRole('button',{name:'Save changes'}));await ui.waitFor(()=>assert.ok(screen.queryByRole('dialog')===null));
  await user.click(nav.getByRole('button',{name:'Lead directory'}));await screen.findByText('Maple Dental · example');await user.click(screen.getByRole('button',{name:'Add lead'}));const add=within(screen.getByRole('dialog'));await user.type(add.getByLabelText('Business name'),'UI imported clinic');await user.type(add.getByLabelText('Phone'),'+442079460099');await user.click(add.getByRole('button',{name:'Save lead'}));await screen.findByText('UI imported clinic');
  for(const[label,heading]of [['Call history','Every conversation, accounted for.'],['Follow-ups','Keep the next step clear.'],['Team & locations','The right people. The right access.'],['Workspace settings','Set up your workspace.'],['Support','We’re here to help.'],['Referral partners','Make an introduction.'],['Nerix administration','A clear view of your business.']]){await user.click(nav.getByRole('button',{name:label}));await screen.findByRole('heading',{name:heading});await ui.waitFor(()=>assert.ok(screen.queryByRole('alert')===null));}
});
test('Customer test checkout adds exactly USD100, visibly keeps it non-cash, and creates a receipt',async()=>{
  const nav=within(screen.getByRole('navigation'));await user.click(nav.getByRole('button',{name:'Wallet & billing'}));await screen.findByRole('heading',{name:'Your balance. Your pace.'});await user.click(screen.getByRole('button',{name:'Add credit'}));
  let d=within(screen.getByRole('dialog'));await user.selectOptions(d.getByLabelText('Choose payment currency'),'PKR');await user.click(d.getByRole('button',{name:'Review test quote'}));await d.findByText('PKR 28000.00');assert.match(screen.getByRole('dialog').textContent||'',/illustrative/i);await user.click(d.getByRole('button',{name:'Confirm simulated payment'}));await screen.findByText('Test credit added once. No money was charged.');await user.click(screen.getByRole('button',{name:'Back to wallet'}));await screen.findAllByText('$400.00');assert.ok(screen.getByText('Test receipt · no funds received'));
});
test('Campaign editing and an eligible 90-second simulation produce a real ledger charge and follow-up',async()=>{
  const nav=within(screen.getByRole('navigation'));await user.click(nav.getByRole('button',{name:'Campaigns'}));await screen.findByRole('button',{name:'Edit'});await user.click(screen.getByRole('button',{name:'Edit'}));let d=within(screen.getByRole('dialog'));
  for(const day of ['Sat','Sun'])await user.click(d.getByRole('button',{name:day}));
  const from=d.getByLabelText('From'),until=d.getByLabelText('Until');ui.fireEvent.change(from,{target:{value:'00:00'}});ui.fireEvent.change(until,{target:{value:'23:59'}});await user.selectOptions(d.getByLabelText('Campaign status'),'ready');await user.click(d.getByRole('checkbox'));await user.click(d.getByRole('button',{name:'Save changes'}));await ui.waitFor(()=>assert.ok(screen.queryByRole('dialog')===null));
  await screen.findByText('ready');await user.click(await screen.findByRole('button',{name:'Simulate'}));d=within(await screen.findByRole('dialog'));const lead=await d.findByLabelText('Lead');const option=within(lead).getByRole('option',{name:/UI imported clinic · Eligible/});await user.selectOptions(lead,(option as HTMLOptionElement).value);await user.click(d.getByRole('button',{name:'Run simulation'}));await screen.findByText(/Simulation completed. 90 billable seconds/);assert.match(screen.getByRole('dialog').textContent||'',/\$0.4500/);await user.click(screen.getByRole('button',{name:'View workspace'}));
  await user.click(nav.getByRole('button',{name:'Follow-ups'}));await screen.findByText('Arrange a conversation');await user.click(nav.getByRole('button',{name:'Wallet & billing'}));await screen.findAllByText('$399.55');
});
test('Owner converts the existing Dentive workspace through the UI; its dashboard removes credit controls and shows the fee waiver',async()=>{
  let nav=within(screen.getByRole('navigation'));await user.click(nav.getByRole('button',{name:'Nerix administration'}));
  let row:any;await ui.waitFor(()=>{row=screen.getAllByText('Dentive AI · pilot').find((el:Element)=>el.closest('tr'))?.closest('tr');assert.ok(row);});await user.click(within(row).getByRole('button',{name:'Make internal company'}));
  const d=within(screen.getByRole('dialog'));assert.equal(d.getByLabelText('Company name').value,'Dentive AI');await user.click(d.getByRole('checkbox'));await user.click(d.getByRole('button',{name:'Convert to internal company'}));
  await screen.findByText('dental · Internal company · Nerix fees waived');await ui.waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));
  const me=(await agent.get('/api/me')).body,dentive=me.orgs.find((o:any)=>o.name==='Dentive AI');assert.ok(dentive);
  // The guide requests one reload to refresh the menu after conversion.
  cleanup();const {App}=await import('../client/app.tsx');ui.render(React.createElement(App));await screen.findByLabelText('Select workspace');await user.selectOptions(screen.getByLabelText('Select workspace'),dentive.id);
  await screen.findByText('Internal company');await screen.findByText('Waived · no top-up needed');
  nav=within(screen.getByRole('navigation'));await user.click(nav.getByRole('button',{name:'Wallet & billing'}));await screen.findByRole('heading',{name:'Your company. No Nerix service charges.'});
  assert.equal(screen.queryByRole('button',{name:'Add credit'}),null);assert.equal(screen.queryByRole('button',{name:'Set preferences'}),null);await screen.findByText('No Nerix top-up or auto-recharge');
  await user.click(nav.getByRole('button',{name:'Campaigns'}));const simulate=await screen.findByRole('button',{name:'Simulate'});assert.equal(simulate.disabled,false);
});
test('Marketing signup saves the changed plan and shows it in Customers before verification',async()=>{
  cleanup();
  const owner=agent;
  const {App}=await import('../client/app.tsx');
  agent=request.agent(app);
  startEmail(db,{apiKey:'re_test',from:'Nerix <test@example.test>'});
  try {
    history.replaceState(null,'','/?signup=1&plan=payg&currency=gbp');
    ui.render(React.createElement(App));
    await screen.findByRole('tab',{name:'Create an account',selected:true});
    await screen.findByText('£0.28/min · Prepaid credit from £75 · Billed per second');
    await user.type(screen.getByLabelText('Full name'),'Plan Tester');
    await user.type(screen.getByLabelText('Company / business name'),'Plan Test Workspace');
    await user.type(screen.getByLabelText('Work email'),'signup-plan@example.test');
    await user.type(screen.getByLabelText('Password'),'UI-test-password-12345');
    await user.selectOptions(screen.getByLabelText('Change plan'),'scale');
    await screen.findByText('£225/month · 1,200 included minutes');
    await user.click(screen.getByRole('button',{name:'Create account →'}));
    await screen.findByRole('heading',{name:'Check your email.'});

    cleanup();
    agent=owner;
    history.replaceState(null,'','/');
    ui.render(React.createElement(App));
    await user.click(await screen.findByRole('button',{name:'Nerix administration'}));
    const workspace=await screen.findByRole('row',{name:/Plan Test Workspace/});
    assert.ok(within(workspace).getByText('Scale Monthly'));
    assert.ok(within(workspace).getByText('GBP'));
  } finally {
    cleanup();
    agent=owner;
    history.replaceState(null,'','/');
    startEmail(db,{});
  }
});
