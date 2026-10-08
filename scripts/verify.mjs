import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'wordclick-'));
const path=join(temp,'library.sqlite');
let sqlite=new DatabaseSync(path);
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};}};}};
const code=readFileSync('dist/server/index.js','utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let count=0;
async function req(route,{user='A',method='GET',body,headers={}}={}){
  const h={...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{}),...headers};
  if(body!==undefined)h['Content-Type']='application/json';
  const response=await worker.fetch(new Request('https://wordclick.test'+route,{method,headers:h,...(body!==undefined?{body:JSON.stringify(body)}:{})}),{DB});
  const data=await response.json().catch(()=>null);return {status:response.status,data};
}
function ok(actual,expected,label){assert.deepEqual(actual,expected,label);count++;console.log('PASS '+label);}
try {
  ok((await req('/api/vocabulary',{user:null})).status,401,'anonymous API rejected');
  const home=await worker.fetch(new Request('https://wordclick.test/'),{DB});
  const homeHtml=await home.text();
  ok(homeHtml.includes('id="mode-news" class="card mode-panel active"'),true,'anonymous home opens the working news reader');
  ok(homeHtml.includes('/signin-with-chatgpt?return_to='),true,'public reader offers dispatch-owned login');
  ok((await req('/api/me',{user:null})).data,{user:null,storage:'none'},'anonymous account response contains no owner information');
  ok((await req('/api/vocabulary',{user:null,method:'POST',body:{word:'risk',translation:'ryzyko'}})).status,401,'anonymous cannot save vocabulary');
  ok((await req('/api/vocabulary',{user:null,method:'DELETE'})).status,401,'anonymous cannot clear vocabulary');
  ok((await req('/api/translation-health',{user:null})).status,401,'server translation diagnostic requires identity');
  ok((await req('/api/vocabulary',{method:'POST',body:{word:'risk',translation:'ryzyko'},headers:{origin:'https://attacker.test'}})).status,403,'cross-origin writes rejected');
  const saved=await req('/api/vocabulary',{method:'POST',body:{word:'risk',translation:'ryzyko',user_id:'B',context_example:'The project has risks.'}});
  ok(saved.status,200,'word saved on account A');
  const id=saved.data.item.id;
  ok((await req('/api/vocabulary',{user:'B'})).data.items,[],'account B cannot read account A');
  ok((await req('/api/vocabulary/'+id,{user:'B',method:'DELETE'})).status,404,'account B cannot delete account A item');
  ok((await req('/api/vocabulary',{method:'POST',body:{word:'risk',translation:'zagrożenie',repetitions:2,interval:3,nextReviewDate:'2026-10-04'}})).data.item.id,id,'duplicate saves retain authoritative ID');
  sqlite.close();sqlite=new DatabaseSync(path);
  const reloaded=(await req('/api/vocabulary')).data.items;
  ok(reloaded.length,1,'vocabulary survives database close and reopen');
  ok(reloaded[0].repetitions,2,'flashcard progress survives reopening');
  ok((await req('/api/vocabulary',{user:'B',method:'POST',body:{word:'risk',translation:'ryzyko B'}})).status,200,'same word is independent per account');
  ok((await req('/api/vocabulary',{method:'DELETE'})).status,200,'clear affects current account');
  ok((await req('/api/vocabulary',{user:'B'})).data.items.length,1,'clearing A preserves B');
  ok((await req('/api/vocabulary',{method:'POST',body:{word:'bad'}})).status,400,'invalid word entry rejected');
  ok((await req('/api/vocabulary',{method:'POST',body:{word:"x'); DROP TABLE vocabulary;--",translation:'test'}})).status,200,'prepared queries handle SQL injection as plain data');
  ok((await req('/api/vocabulary',{user:'B'})).data.items.length,1,'injection cannot damage other account');
  const realFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('No cloud call should be made');};
  ok((await req('/api/translate',{user:null,method:'POST',body:{word:'bank',sentence:'The bank approved the loan.',prefer_browser:true}})).status,200,'anonymous context preprocessing works without access to vocabulary');
  ok((await req('/api/news-feed',{user:null})).status,200,'anonymous news reading is available');
  const prepared=await req('/api/translate',{method:'POST',body:{word:'scaling',sentence:'We are scaling up.',prefer_browser:true}});
  ok(prepared.status,200,'browser-mode preprocessing needs no cloud translation connection');
  ok(prepared.data.phrase,'scaling up','browser-mode lookup preserves original phrase dictionary');
  const repeatedPhrase='We roll out the product and carry out the tests.';
  const secondParticle=await req('/api/translate',{method:'POST',body:{word:'out',sentence:repeatedPhrase,word_offset:repeatedPhrase.lastIndexOf('out'),prefer_browser:true}});
  ok(secondParticle.data.phrase,'carry out','repeated particles select the clicked phrasal verb');
  ok(secondParticle.data.target_start,repeatedPhrase.indexOf('carry'),'context span points at the correct phrase');
  globalThis.fetch=async (url)=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'nadchodzący'},quotaFinished:false}),{headers:{'Content-Type':'application/json'}});
  const translated=await req('/api/translate',{method:'POST',body:{word:'upcoming',sentence:'The upcoming project.'}});
  ok(translated.data.translation,'nadchodzący','translation result reaches original reader shape');
  const phrase=await req('/api/translate',{method:'POST',body:{word:'scaling',sentence:'We are scaling up the project.'}});
  ok(phrase.data.phrase,'scaling up','original phrasal verb logic retained');
  globalThis.fetch=async()=>new Response(JSON.stringify({responseStatus:403,quotaFinished:true,responseData:{translatedText:'LIMIT'}}));
  ok((await req('/api/translate',{method:'POST',body:{word:'unknown',sentence:'Unknown word.'}})).status,503,'provider quota failure is explicit, not a fake translation');
  globalThis.fetch=realFetch;
  ok((await req('/api/import-url',{method:'POST',body:{url:'https://127.0.0.1/'}})).status,400,'private address import rejected');
  ok((await req('/api/import-url',{method:'POST',body:{url:'file:///etc/passwd'}})).status,400,'non-HTTPS import rejected');
  for(const file of readdirSync('static/js').filter(f=>f.endsWith('.js'))) {
    const syntax=spawnSync(process.execPath,['--check','static/js/'+file],{encoding:'utf8'});
    assert.equal(syntax.status,0,syntax.stderr);
  }
  console.log(`Verified ${count} account/API checks and all frontend module syntax.`);
} finally {sqlite.close();rmSync(temp,{recursive:true,force:true});}
