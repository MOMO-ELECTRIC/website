#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
function getField(field) { return execFileSync('op', ['item', 'get', 'LARK API', `--fields=${field}`, '--reveal'], { encoding: 'utf8' }).trim(); }
async function call(url, options = {}) { const res = await fetch(url, options); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; } return { status: res.status, data }; }
(async()=>{
 const appId=getField('username'); const appSecret=getField('credential');
 const tokenRes=await call('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({app_id:appId,app_secret:appSecret})});
 const t=tokenRes.data.tenant_access_token; const headers={Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=utf-8'};
 const resp=await call('https://open.larksuite.com/open-apis/calendar/v4/calendars',{method:'POST',headers,body:JSON.stringify({summary:'MOMO施工同步',description:'OpenClaw sync calendar for construction schedule'})});
 console.log(JSON.stringify(resp,null,2));
})();
