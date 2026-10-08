import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const dir=mkdtempSync(join(tmpdir(),'wordclick-lessons-')),path=join(dir,'db.sqlite');
let sqlite=new DatabaseSync(path);
// Apply the previous migration, save a real old-shape word, then append the new one.
sqlite.exec(readFileSync('drizzle/0000_quick_ser_duncan.sql','utf8'));
sqlite.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?)').run('old-word','A','risk',JSON.stringify({id:'old-word',word:'risk',translation:'ryzyko'}),1);
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&& !f.startsWith('0000')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
const DB={prepare(sql){return{bind(...args){return{async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:{changes:sqlite.prepare(sql).run(...args).changes}};}};}};}};
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(readFileSync('dist/server/index.js')).toString('base64'));
let count=0;
function ok(actual,expected,label){assert.deepEqual(actual,expected,label);console.log('PASS '+label);count++;}
async function req(route,{user='A',method='GET',body,headers={}}={}){
  const response=await worker.fetch(new Request('https://wordclick.test'+route,{method,headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@test.invalid'}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),{DB});
  return{status:response.status,data:await response.json().catch(()=>null),headers:response.headers};
}
const input={title:'Project risks',date:'2026-10-08',tutor:'Tutor',notes:'We discussed project risks. What would you do differently?',phrases:[{text:'Could I clarify whether you mean…?',translation:'Czy mogę doprecyzować…?',example:'Could I clarify whether you mean the delivery date?'}],answers:[]};
try{
  ok((await req('/api/vocabulary')).data.items[0].id,'old-word','additive migration preserves the existing vocabulary');
  for(const method of ['GET','POST'])ok((await req('/api/lessons',{user:null,method,body:method==='POST'?input:undefined})).status,401,'anonymous '+method+' lessons rejected');
  ok((await req('/api/lessons',{method:'POST',body:input,headers:{Origin:'https://attacker.test'}})).status,403,'cross-origin lesson write rejected');
  ok((await req('/api/lessons')).data.lessons,[],'new account has no seeded or owner fallback notes');
  const created=await req('/api/lessons',{method:'POST',body:{...input,user_id:'B',id:'forged-id'}});
  ok(created.status,201,'lesson saved on verified account A');
  let lesson=created.data.lesson;const id=lesson.id,phraseId=lesson.phrases[0].id;
  assert.notEqual(id,'forged-id');
  ok((await req('/api/lessons',{user:'B'})).data.lessons,[],'account B cannot list A notes or phrases');
  for(const method of ['GET','PUT','DELETE'])ok((await req('/api/lessons/'+id,{user:'B',method,body:method==='GET'?undefined:lesson})).status,404,'account B cannot '+method+' A lesson');
  ok((await req('/api/lessons/'+id,{method:'PUT',body:{...lesson,revision:0}})).status,409,'stale revision cannot overwrite notes');
  ok((await req('/api/lessons/'+id,{method:'DELETE',body:{revision:0}})).status,409,'stale revision cannot delete newer data');
  const updated=await req('/api/lessons/'+id,{method:'PUT',body:{...lesson,notes:'New notes from Preply',phrases:[{...lesson.phrases[0],repetitions:1,easeFactor:2.6,interval:1,nextReviewDate:'2026-10-09'}],answers:[{prompt:'What did you learn?',text:'I learned how to clarify project risks.',date:'2026-10-08T14:00:00Z'}]}});
  ok(updated.status,200,'notes, review schedule and speaking text saved together');lesson=updated.data.lesson;
  ok(lesson.phrases[0].id,phraseId,'phrase ID remains stable after review');ok(lesson.revision,2,'successful save increments revision');
  sqlite.close();sqlite=new DatabaseSync(path);
  const reread=(await req('/api/lessons/'+id)).data.lesson;
  ok(reread.notes,'New notes from Preply','notes survive database reopen');
  ok(reread.phrases[0].nextReviewDate,'2026-10-09','review schedule survives database reopen');
  ok(reread.answers[0].text,'I learned how to clarify project risks.','speaking text survives database reopen');
  const simultaneous=await Promise.all([req('/api/lessons/'+id,{method:'PUT',body:{...lesson,notes:'device one'}}),req('/api/lessons/'+id,{method:'PUT',body:{...lesson,notes:'device two'}})]);
  ok(simultaneous.map(r=>r.status).sort(),[200,409],'only one concurrent update with the same revision is accepted');
  const bad=[{...input,date:'2026-02-31'},{...input,notes:'x'.repeat(20001)},{...input,phrases:[...input.phrases,...input.phrases]},{...input,phrases:[{text:'',translation:'empty'}]},{...input,answers:[{prompt:'question',text:''}]}];
  for(const body of bad)ok((await req('/api/lessons',{method:'POST',body})).status,400,'invalid or oversized lesson fields rejected');
  ok((await req('/api/lessons',{method:'POST',body:{...input,notes:'x'.repeat(60001)}})).status,413,'request byte limit enforced before parsing');
  const b=(await req('/api/lessons',{user:'B',method:'POST',body:input})).data.lesson;
  ok((await req('/api/lessons/'+id+'/extra')).status,404,'extra path cannot target another resource');
  const current=(await req('/api/lessons/'+id)).data.lesson;
  ok((await req('/api/lessons/'+id,{method:'DELETE',body:{revision:current.revision}})).status,200,'owner deletes lesson and its nested phrases');
  ok((await req('/api/lessons/'+id)).status,404,'deleted lesson is no longer readable');
  ok((await req('/api/lessons',{user:'B'})).data.lessons[0].id,b.id,'deleting A preserves B notes');
  const escaped=(await req('/api/lessons',{method:'POST',body:{...input,title:"x'); DROP TABLE vocabulary;--",notes:'<img src=x onerror=alert(1)>'}})).data.lesson;
  ok((await req('/api/vocabulary')).data.items[0].id,'old-word','lesson text cannot execute SQL or damage vocabulary');
  ok(escaped.notes,'<img src=x onerror=alert(1)>','notes remain plain user data for safe text rendering');
  ok((await req('/api/lessons')).headers.get('Cache-Control'),'private, no-store','private lesson responses cannot be cached');
  const home=await worker.fetch(new Request('https://wordclick.test/'),{DB});
  assert.match(home.headers.get('Content-Security-Policy'),/media-src[^;]+blob:/);
  ok(home.headers.get('Permissions-Policy'),'microphone=(self), camera=()','microphone limited to this origin; camera disabled');
  console.log(`Verified ${count} real SQLite lesson, privacy and compatibility checks.`);
}finally{sqlite.close();rmSync(dir,{recursive:true,force:true});}
