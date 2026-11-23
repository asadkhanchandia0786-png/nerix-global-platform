import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {FAQ_TOPICS,answerFAQ,matchFAQ} from '../shared/faq.ts';
import {faqReply,chatInstructions} from '../server/chat-policy.ts';
import {openDB,migrate,type DB} from '../server/db.ts';
import {createApp} from '../server/app.ts';
import {id} from '../server/core.ts';

test('The public catalog answers every selectable question and excludes private deposit and internal billing details',()=>{
  assert.ok(FAQ_TOPICS.length>=30);assert.equal(new Set(FAQ_TOPICS.map(item=>item.id)).size,FAQ_TOPICS.length);
  for(const item of FAQ_TOPICS){assert.equal(matchFAQ(item.question)?.id,item.id);assert.equal(faqReply(item.question,{org_id:null}),item.answer);}
  const text=FAQ_TOPICS.map(item=>item.answer).join('\n');
  assert.doesNotMatch(text,/USD ?(?:5|10)\b|\$(?:5|10)\b|PKR ?5,?000|internal company|billing_mode|test balance.*300/i);
});
test('Common questions select the specific topic instead of confusing chat, deposits, bank fees and voice prices',()=>{
  for(const[message,topic]of [
    ['What does website chat cost?','chat-pricing'],['What is the minimum USD deposit?','deposit'],
    ['What is your price per minute?','pricing'],['Is ringing billed?','billing'],
    ['Will my bank add transaction fees?','payment-fees'],['Can I pay by bank transfer?','bank-transfer'],
    ['Can my balance top up automatically?','recharge'],['Do you connect to my CRM?','integrations'],
    ['What happens to my chat data in OpenAI?','privacy'],['Am I chatting with AI, preset help or a person?','ai-faq']
  ])assert.equal(matchFAQ(message)?.id,topic,message);
});
test('Answers describe pending capabilities and unknown questions without inventing live calls, payments or promises',()=>{
  assert.match(answerFAQ('Can I pay by Visa?'),/not active/);
  assert.match(answerFAQ('Is the full calling platform live today?'),/does not place real telephone calls/);
  assert.match(answerFAQ('Can I get a refund of unused paid credit?'),/proposed policy/);
  assert.match(answerFAQ('Which currencies can I select?'),/illustrative, not live/);
  assert.match(answerFAQ('Do you guarantee sales, appointments or Google rankings?'),/do not guarantee/);
  assert.match(answerFAQ('How do lunar rocks become cheese?'),/do not have a confirmed preset answer/);
});
test('Nerix preset answers and approved AI details never replace a client business scope',()=>{
  const site={org_id:id(),business_name:'Client Example',agent_name:'Help',purpose:'support',knowledge:'Client approved opening hours only.'};
  assert.doesNotMatch(faqReply('What is your price?',site),/\$0\.30|USD100/);
  assert.match(faqReply('I need a human',site),/Talk to our team/);
  assert.doesNotMatch(chatInstructions(site),/APPROVED PRESET DETAILS|Voice service starting rates/);
});

let db:DB,app:ReturnType<typeof createApp>,providerCalls=0;
before(async()=>{
  db=await openDB(undefined,'memory://');await migrate(db);
  app=createApp(db,{mode:'demo',setupToken:'faq-test-setup-token-24-characters',chat:{aiEnabled:false,apiKey:'fixture-key-not-a-real-credential',dailyLimit:1,provider:async()=>{providerCalls++;return{text:'Should never run in FAQ mode'};}}});
  const r=await request(app).post('/api/auth/setup').set('X-Nerix-Client','workspace').send({setupToken:'faq-test-setup-token-24-characters',email:'faq-owner@example.test',password:'Faq-owner-password-12345',name:'FAQ Owner'});assert.equal(r.status,200);
});
after(async()=>{await db.close();});
const pub=(path:string,body?:object,token?:string)=>{
  const r=body===undefined?request(app).get('/chat-api/sites/nerix-global'+path):request(app).post('/chat-api/sites/nerix-global'+path);
  r.set('Origin','https://nerixglobal.com').set('X-Nerix-Chat','widget');if(token)r.set('Authorization','Bearer '+token);return body===undefined?r:r.send(body);
};
test('Every catalog answer is saved by the actual chat API without OpenAI calls, AI quota or token usage',async()=>{
  const config=await pub('/config');assert.equal(config.status,200);assert.equal(config.body.aiReady,false);assert.equal(config.body.helpLabel,'Preset FAQ help');
  const v=await pub('/conversations',{});assert.equal(v.status,200);assert.doesNotMatch(v.body.conversation.messages[0].body,/offline|OpenAI/);
  for(const item of FAQ_TOPICS){
    const r=await pub(`/conversations/${v.body.conversation.id}/messages`,{body:item.question,requestKey:id()},v.body.token);
    assert.equal(r.status,200,item.id);assert.equal(r.body.messages.at(-1).body,item.answer,item.id);assert.equal(r.body.messages.at(-1).kind,'faq');
  }
  assert.equal(providerCalls,0);assert.equal((await db.query('SELECT count(*)::int AS count FROM chat_ai_usage')).rows[0].count,0);assert.equal((await db.query('SELECT count(*)::int AS count FROM chat_ai_budget')).rows[0].count,0);
});
