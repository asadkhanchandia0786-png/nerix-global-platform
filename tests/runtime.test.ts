import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeSettings} from '../server/runtime.ts';
import {equal} from '../server/auth.ts';

test('Deployed startup requires persistent storage, a proper HTTPS origin and a long setup secret',()=>{
  assert.throws(()=>runtimeSettings({NODE_ENV:'production'}),/Production requires/);
  const good={NODE_ENV:'production',DATABASE_URL:'postgresql://example.invalid/db',APP_ORIGIN:'https://app.example.test',SETUP_TOKEN:'a'.repeat(32)};
  assert.equal(runtimeSettings(good).mode,'pilot');
  for(const APP_ORIGIN of ['https://app.example.test/path','https://app.example.test?query=1','https://app.example.test#hash','https://user:pass@app.example.test','http://app.example.test','not a URL'])assert.throws(()=>runtimeSettings({...good,APP_ORIGIN}),/APP_ORIGIN/);
  assert.throws(()=>runtimeSettings({...good,SETUP_TOKEN:'short'}),/24 characters/);
  assert.throws(()=>runtimeSettings({...good,DATABASE_URL:undefined}),/Production requires/);
  assert.equal(runtimeSettings({...good,APP_ORIGIN:'https://app.example.test/'}).origin,'https://app.example.test');
});
test('Preview retains its demo defaults and explicit Replit hostname; invalid numeric settings fail early',()=>{
  assert.equal(runtimeSettings({}).mode,'demo');
  assert.equal(runtimeSettings({REPLIT_DEV_DOMAIN:'preview.example.test'}).origin,'https://preview.example.test');
  assert.equal(runtimeSettings({APP_ORIGIN:'http://localhost:3000'}).origin,'http://localhost:3000');
  for(const CHAT_AI_DAILY_LIMIT of ['0','1.5','NaN','10001'])assert.throws(()=>runtimeSettings({CHAT_AI_DAILY_LIMIT}),/CHAT_AI_DAILY_LIMIT/);
  for(const PORT of ['0','65536','hello'])assert.throws(()=>runtimeSettings({PORT}),/PORT/);
});
test('Secret comparison handles multibyte input without throwing or accepting a different value',()=>{
  assert.equal(equal('a','é'),false);assert.equal(equal('🔑','aa'),false);assert.equal(equal('matching-token','matching-token'),true);
});
