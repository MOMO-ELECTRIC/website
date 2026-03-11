#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const CALENDAR_ID = 'feishu.cn_dYHRL1BOxVnfA6zxEQuwPh@group.calendar.feishu.cn';
function getField(field){ return execFileSync('op',['item','get','LARK API',`--fields=${field}`,'--reveal'],{encoding:'utf8'}).trim(); }
async function call(url, options={}){ const res=await fetch(url,options); const text=await res.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}; return {status:res.status,data}; }
(async()=>{
 const appId=getField('username'); const appSecret=getField('credential');
 const tokenRes=await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({app_id:appId,app_secret:appSecret})});
 const t=tokenRes.data.tenant_access_token; const headers={Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=utf-8'};
 const variants=[
  {role:'reader', scope:{type:'tenant'}},
  {role:'free_busy_reader', scope:{type:'tenant'}},
  {role:'writer', scope:{type:'tenant'}},
  {role:'reader', scope:{type:'user', value:'me'}},
  {role:'reader', scope:{type:'tenant', value:''}}
 ];
 for (let i=0;i<variants.length;i++){
   const resp=await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}/acls`,{method:'POST',headers,body:JSON.stringify(variants[i])});
   console.log('VARIANT',i, JSON.stringify(variants[i]));
   console.log(JSON.stringify(resp,null,2));
 }
})();
