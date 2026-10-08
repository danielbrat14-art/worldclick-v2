import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {SpeakingRecorder} from '../static/js/speaking.js';
const window=new Window({url:'https://wordclick.test',settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
document.write(readFileSync('static/index.html','utf8'));
const $=id=>document.getElementById(id);
let signedIn=false,stored=[],fail=false,requests=[],savedWords=[];
const context=vm.createContext({window,document,console,structuredClone,crypto,confirm:()=>true,SpeakingRecorder,CustomEvent:window.CustomEvent,
  isSignedIn:()=>signedIn,playWordAudio(){},saveWordToVocabulary:async item=>savedWords.push(item),
  accountRequest:async(path,options={})=>{
    requests.push({path,...options});if(fail)throw Error('Connection failed — not saved');
    if(!options.method)return{lessons:structuredClone(stored)};
    const data=JSON.parse(options.body);
    if(options.method==='DELETE'){stored=stored.filter(l=>l.id!==path.split('/').at(-1));return{ok:true};}
    const lesson={...data,id:data.id||'lesson-one',revision:(data.revision||0)+1};stored=[lesson,...stored.filter(l=>l.id!==lesson.id)];return{lesson};
  }
});
vm.runInContext(readFileSync('static/js/srs.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function'),context);
vm.runInContext(readFileSync('static/js/lessons.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function'),context);
context.initLessons();
const click=id=>$(id).dispatchEvent(new window.Event('click'));
const submit=id=>$(id).dispatchEvent(new window.Event('submit',{cancelable:true}));
const settle=()=>new Promise(setImmediate);
try{
  click('lesson-new');assert.equal($('lesson-editor').classList.contains('hidden'),true);assert.equal(requests.length,0);
  console.log('PASS guest cannot create or load private lesson records');
  signedIn=true;window.dispatchEvent(new window.CustomEvent('vocab-changed'));await settle();
  click('lesson-new');$('lesson-title').value='Project risks';$('lesson-date').value='2026-10-08';$('lesson-notes').value='How would you manage project risks?\n<img src=x onerror=alert(1)>';
  submit('lesson-form');await settle();assert.equal(stored.length,1);assert.match($('lesson-status').textContent,/Zapisano/);
  console.log('PASS lesson form persists pasted notes and date on the current account');
  $('phrase-text').value='Could I clarify the scope?';$('phrase-translation').value='Czy mogę doprecyzować zakres?';$('phrase-example').value='Could I clarify the scope before we start?';
  submit('phrase-form');await settle();assert.equal(stored[0].phrases.length,1);assert.equal($('phrase-text').value,'');assert.match($('phrases-library').textContent,/Could I clarify/);
  const firstCard=$('lesson-phrases').firstElementChild;firstCard.querySelectorAll('button')[1].click();await settle();assert.equal(savedWords[0].phrase,'Could I clarify the scope?');
  console.log('PASS adding a phrase updates the lesson and global phrase library; copy to vocabulary uses the existing account writer');
  $('phrases-search').value='no match';$('phrases-search').dispatchEvent(new window.Event('input'));assert.match($('phrases-count').textContent,/0/);
  $('phrases-search').value='';$('phrases-search').dispatchEvent(new window.Event('input'));assert.match($('phrases-count').textContent,/1/);
  document.querySelector('[data-lesson-tab="review"]').click();assert.match($('lesson-review-card').textContent,/doprecyzować/);assert.equal(document.querySelector('[data-lesson-grade="5"]').disabled,true);
  click('lesson-review-reveal');assert.match($('lesson-review-card').textContent,/Could I clarify/);document.querySelector('[data-lesson-grade="5"]').click();await settle();
  assert.equal(stored[0].phrases[0].repetitions,1);assert.match(stored[0].phrases[0].nextReviewDate,/^\d{4}-\d{2}-\d{2}$/);
  assert.match($('lesson-review-count').textContent,/Brak zwrotów/);
  console.log('PASS lesson review requires revealing the answer and persists a future review schedule');
  const originalPhraseId=stored[0].phrases[0].id;
  $('lesson-phrases').firstElementChild.querySelectorAll('button')[2].click();$('phrase-example').value='Could I clarify the scope of this project?';submit('phrase-form');await settle();
  assert.equal(stored[0].phrases[0].id,originalPhraseId);assert.equal(stored[0].phrases[0].repetitions,1);assert.match(stored[0].phrases[0].example,/this project/);
  console.log('PASS phrase editing preserves identity and previously saved review progress');
  document.querySelector('[data-lesson-tab="speaking"]').click();assert.equal($('speaking-prompt').value,'How would you manage project risks?');
  $('speaking-answer').value='I would assess each risk and agree on a response.';click('speaking-save');await settle();assert.equal(stored[0].answers.length,1);assert.match($('speaking-history').textContent,/assess each risk/);assert.equal($('speaking-answer').value,'');
  console.log('PASS speaking uses a lesson question and saves only the explicit text answer');
  let read;window.addEventListener('lesson-read',event=>read=event.detail);click('lesson-read');assert.match(read.notes,/manage project risks/);
  assert.equal(document.querySelectorAll('#lesson-list img, #phrases-library img, #speaking-history img').length,0);
  console.log('PASS notes can open in the interactive reader; user text is rendered without HTML execution');
  fail=true;$('lesson-notes').value='Unsaved replacement';submit('lesson-form');await settle();assert.notEqual(stored[0].notes,'Unsaved replacement');assert.equal($('lesson-notes').value,'Unsaved replacement');assert.match($('lesson-status').textContent,/not saved/);assert.equal($('lesson-title').disabled,false);
  assert.equal(context.hasChanges(),true);
  console.log('PASS failed save preserves the draft, exposes an error and releases controls for retry');
  fail=false;submit('lesson-form');await settle();assert.equal(context.hasChanges(),false);
  click('lesson-delete');await settle();assert.equal(stored.length,0);assert.equal($('lesson-editor').classList.contains('hidden'),true);
  console.log('PASS owner can delete a lesson without leaving its phrases in the library');
}finally{context.stopLessonSpeaking();await window.happyDOM.close();}
