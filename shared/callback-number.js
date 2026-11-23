// Callback capture is not phone ownership verification. Never invent a number
// from the called DID, a forwarding destination or a staff directory entry.
const international=/^\+[1-9]\d{6,14}$/;
const plans={US:{prefix:'1',national:/^[2-9]\d{2}[2-9]\d{6}$/},CA:{prefix:'1',national:/^[2-9]\d{2}[2-9]\d{6}$/},GB:{prefix:'44',national:/^[1-9]\d{8,9}$/},PK:{prefix:'92',national:/^[1-9]\d{9}$/}};
export function phoneCountry(number){return number?.startsWith('+1')?'US':number?.startsWith('+44')?'GB':number?.startsWith('+92')?'PK':null;}
const country=value=>String(value||'').toUpperCase()==='UK'?'GB':String(value||'').toUpperCase();
function cleaned(value){return typeof value==='string'&&value.length<=40&&/^[+\d\s().-]*$/.test(value)?value.replace(/[\s().-]/g,''):null;}
function validInternational(number){
  if(!international.test(number))return false;
  const plan=plans[phoneCountry(number)];
  return !plan||plan.national.test(number.slice(plan.prefix.length+1));
}
export function inboundCallerNumber(value){
  let number=cleaned(value);if(!number)return null;
  if(number.startsWith('00'))number='+'+number.slice(2);
  // Some carriers deliver an international caller number without its plus.
  // Only accept complete known country-code forms; do not guess local digits.
  if(!number.startsWith('+')){
    if(!/^(1\d{10}|44\d{9,10}|92\d{10})$/.test(number))return null;
    number='+'+number;
  }
  return validInternational(number)?number:null;
}
function nationalNumber(digits,region){
  const plan=plans[region];if(!plan)return null;
  if(plan.prefix==='1'&&digits.length===11&&digits.startsWith('1'))digits=digits.slice(1);
  if(plan.prefix!=='1'&&digits.startsWith('0'))digits=digits.slice(1);
  return plan.national.test(digits)?'+'+plan.prefix+digits:null;
}
export function callbackNumber(input={},context={}){
  const raw=input.callbackPhone??'',caller=inboundCallerNumber(context.callerPhone);
  const fail=(reason,instruction)=>({ok:false,reason,instruction});
  if(input.useCallerNumber===true||raw===''){
    if(!caller)return fail('caller_number_unavailable','The incoming caller number is unavailable. Ask briefly which number staff should call. Accept local digits; do not require a country code for an ordinary local number.');
    return {ok:true,callbackPhone:caller,source:'caller_id',requiresConfirmation:true,instruction:'Read this exact number and ask whether staff should call back on it or on a different number. Caller ID is not proof of identity. Save only after agreement.'};
  }
  let digits=cleaned(raw);if(!digits)return fail('invalid_phone','Ask the caller to repeat the callback number, one digit at a time. Do not say the callback service is unavailable.');
  if(digits.startsWith('00'))digits='+'+digits.slice(2);
  const explicit=country(input.callbackCountry),local=country(context.defaultCountry),origin=phoneCountry(caller);
  if(!digits.startsWith('+')&&['US','CA'].includes(explicit||origin||local)&&digits.startsWith('011'))digits='+'+digits.slice(3);
  let number;
  if(digits.startsWith('+'))number=validInternational(digits)?digits:null;
  else if(!/^\d+$/.test(digits))number=null;
  else if(explicit){
    if(!plans[explicit])return fail('callback_country_required','For this country, ask for the country calling code and number, then prepare the number again.');
    number=nationalNumber(digits,explicit);
  }else{
    const regions=[...new Set([origin,local].filter(Boolean))];
    const candidates=[...new Set(regions.map(region=>nationalNumber(digits,region)).filter(Boolean))];
    if(candidates.length>1)return fail('callback_country_required','This local number could belong to more than one country. Ask only which country the callback number is in, then prepare it again with callbackCountry. Do not guess.');
    number=candidates[0];
    if(!regions.length||regions.every(region=>!plans[region]))return fail('callback_country_required','Ask which country this number is in, or ask for its country calling code.');
  }
  if(!number)return fail('invalid_phone','The number does not fit the expected format. Ask the caller to repeat or correct it; ask which country it belongs to if needed. Keep the other callback details.');
  return {ok:true,callbackPhone:number,source:'caller_supplied',requiresConfirmation:true,instruction:'Read this prepared number back once and ask for agreement before saving. If it is wrong, ask only for the correction and prepare the corrected number again.'};
}
