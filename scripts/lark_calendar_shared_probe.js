#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const CAL_ID = 'feishu.cn_8WVFMJaMQXy9ujJYS4Douh@group.calendar.feishu.cn';
function getField(field){ return execFileSync('op',['item','get','LARK API',`--fields=${field}`,'--reveal'],{encoding:'utf8'}).trim(); }
async function call(url, options={}){ const res=await fetch(url,options); const text=await res.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}; return {status:res.status,data}; }
async function main(){
 const appId=getField('username'); const appSecret=getField('credential');
 const tokenRes=await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({app_id:appId,app_secret:appSecret})});
 const t=tokenRes.data.tenant_access_token; const headers={Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=utf-8'};
 const probes=[
  ['GET calendar', `https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CAL_ID)}`, {headers}],
  ['GET acls', `https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CAL_ID)}/acls`, {headers}],
  ['POST subscribe', `https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CAL_ID)}/subscribe`, {method:'POST',headers,body:JSON.stringify({})}],
  ['POST subscription', `https://open.larksuite.com/open-apis/calendar/v4/calendars/subscription`, {method:'POST',headers,body:JSON.stringify({calendar_ids:[CAL_ID]})}],
  ['POST search events', `https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CAL_ID)}/events/search`, {method:'POST',headers,body:JSON.stringify({page_size:1})}]
 ];
 for (const [label,url,opt] of probes){ const r=await call(url,opt); console.log('===',label,'==='); console.log(JSON.stringify(r,null,2)); }
}
main().catch(err=>{console.error(err.stack||String(err));process.exit(1);});
