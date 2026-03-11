#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
const CALENDAR_ID = 'feishu.cn_lJRyrrr7nCTnGdvRvRZdhe@group.calendar.feishu.cn';
function getField(field){ return execFileSync('op',['item','get','LARK API',`--fields=${field}`,'--reveal'],{encoding:'utf8'}).trim(); }
async function call(url, options={}){ const res=await fetch(url,options); const text=await res.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}; return {status:res.status,data}; }
(async()=>{
 const appId=getField('username'); const appSecret=getField('credential');
 const tokenRes=await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({app_id:appId,app_secret:appSecret})});
 const t=tokenRes.data.tenant_access_token; const headers={Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=utf-8'};
 const variants=['show_only_free_busy','public','show_event_detail','show_all_event_details','reader','public_with_details'];
 for (const v of variants){
   const resp=await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}`,{method:'PATCH',headers,body:JSON.stringify({permission:v})});
   const after=await call(`https://open.larksuite.com/open-apis/calendar/v4/calendars/${encodeURIComponent(CALENDAR_ID)}`,{headers});
   console.log('===',v,'===');
   console.log(JSON.stringify({resp, after: after.data?.data?.permissions || after.data},null,2));
 }
})();
