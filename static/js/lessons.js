import { accountRequest, isSignedIn, saveWordToVocabulary } from './storage.js';
import { calculateSM2 } from './srs.js';
import { playWordAudio } from './speech.js';
import { SpeakingRecorder } from './speaking.js';

const $=id=>document.getElementById(id);
let lessons=[],selected=null,loaded=false,loading=false,busy=false,dirty=false;
let reviewQueue=[],revealed=false,promptIndex=0,recorder,editingPhraseId=null;
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Warsaw'});
const status=(text,error=false)=>{ $('lesson-status').textContent=text;$('lesson-status').classList.toggle('error',error); };
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function button(text,fn){const el=node('button',text,'btn-ghost');el.type='button';el.addEventListener('click',fn);return el;}
function hasChanges(){return !!selected && (['title','date','tutor','notes'].some(field=>draft()[field]!==selected[field]) || !!$('speaking-answer').value.trim() || !!$('phrase-text').value.trim() || !!$('phrase-translation').value.trim() || !!$('phrase-example').value.trim());}
function canLeave(){return !hasChanges() || confirm('Masz niezapisane zmiany lub odpowiedź. Opuścić tę lekcję?');}
function draft(){return {...selected,title:$('lesson-title').value,date:$('lesson-date').value,tutor:$('lesson-tutor').value,notes:$('lesson-notes').value};}
function setBusy(value){busy=value;document.querySelectorAll('#lesson-editor input, #lesson-editor textarea, #lesson-editor button, #lesson-new, #lesson-reload').forEach(el=>el.disabled=value);if(!value){$('lesson-delete').disabled=!selected?.id;updateSpeechControls(false);renderReview();}}

export function stopLessonSpeaking(){recorder?.cleanup();}
export function initLessons(){
  recorder=new SpeakingRecorder({onStatus:text=>$('speaking-status').textContent=text,
    onTranscript:text=>{ $('speaking-answer').value=text;dirty=true; },
    onAudio:url=>{const audio=$('speaking-audio');audio.pause();if(url)audio.src=url;else audio.removeAttribute('src');audio.classList.toggle('hidden',!url);},
    onState:updateSpeechControls});
  const supported=recorder.recognitionSupported();$('speaking-transcribe').disabled=!supported;
  if(!supported)$('speaking-status').textContent='Transkrypcja nie jest dostępna. Możesz nagrać odpowiedź lub wpisać ją ręcznie.';
  window.addEventListener('vocab-changed',()=>{if(isSignedIn()&&!loaded&&!loading)loadLessons();});
  for(const id of ['nav-lessons-btn','nav-phrases-btn'])$(id).addEventListener('click',()=>{if(!loaded&&!loading)loadLessons();});
  $('lesson-new').addEventListener('click',()=>{if(busy||loading||!canLeave())return;if(!isSignedIn()){status('Zaloguj się przyciskiem u góry, aby dodać lekcję.',true);return;}openLesson({title:'',date:today(),tutor:'',notes:'',phrases:[],answers:[]});$('lesson-title').focus();});
  $('lesson-reload').addEventListener('click',()=>{if(!busy&&canLeave())loadLessons();});
  $('lesson-search').addEventListener('input',renderList);
  $('lesson-form').addEventListener('input',()=>dirty=true);
  $('lesson-form').addEventListener('submit',async event=>{event.preventDefault();await persist(draft());});
  $('lesson-delete').addEventListener('click',async()=>{
    if(busy||!selected?.id||!confirm('Usunąć tę lekcję, jej zwroty i historię odpowiedzi?'))return;
    stopLessonSpeaking();setBusy(true);
    try{await accountRequest('/api/lessons/'+selected.id,{method:'DELETE',body:JSON.stringify({revision:selected.revision})});lessons=lessons.filter(l=>l.id!==selected.id);selected=null;dirty=false;$('lesson-editor').classList.add('hidden');status('Usunięto lekcję.');renderAll();}
    catch(error){status(error.message,true);}finally{setBusy(false);}
  });
  $('lesson-read').addEventListener('click',()=>{
    if(!$('lesson-notes').value.trim()){status('Wklej najpierw notatki.',true);return;}
    window.dispatchEvent(new CustomEvent('lesson-read',{detail:{title:$('lesson-title').value,notes:$('lesson-notes').value}}));
  });
  document.querySelectorAll('[data-lesson-tab]').forEach(el=>el.addEventListener('click',()=>switchPanel(el.dataset.lessonTab)));
  $('phrase-selection').addEventListener('click',()=>{const text=$('lesson-notes').value.slice($('lesson-notes').selectionStart,$('lesson-notes').selectionEnd).trim();if(!text){status('Zaznacz zwrot w polu notatek.',true);return;}if(text.length>120){status('Zaznacz krótszy zwrot (do 120 znaków).',true);return;}$('phrase-text').value=text;$('phrase-translation').focus();});
  $('phrase-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const next=draft(),text=$('phrase-text').value.trim();
    if(next.phrases.some(p=>p.id!==editingPhraseId&&p.text.toLowerCase()===text.toLowerCase())){status('Ten zwrot jest już w tej lekcji.',true);return;}
    const phrase={...(next.phrases.find(p=>p.id===editingPhraseId)||{}),id:editingPhraseId||crypto.randomUUID(),text,translation:$('phrase-translation').value.trim(),example:$('phrase-example').value.trim()};
    next.phrases=editingPhraseId?next.phrases.map(p=>p.id===editingPhraseId?phrase:p):[...next.phrases,phrase];
    if(await persist(next))resetPhraseForm();
  });
  $('phrase-cancel').addEventListener('click',resetPhraseForm);
  $('lesson-review-due').addEventListener('change',startReview);
  $('lesson-review-reveal').addEventListener('click',()=>{revealed=true;renderReview();});
  $('lesson-review-audio').addEventListener('click',()=>{if(reviewQueue[0]&&revealed)playWordAudio(reviewQueue[0].text);});
  document.querySelectorAll('[data-lesson-grade]').forEach(el=>el.addEventListener('click',async()=>{
    const current=reviewQueue[0];if(busy||!current||!revealed)return;
    const next=draft(),schedule=calculateSM2(current,Number(el.dataset.lessonGrade));
    next.phrases=next.phrases.map(p=>p.id===current.id?{...p,...schedule}:p);
    if(await persist(next)){reviewQueue.shift();revealed=false;renderReview();}
  }));
  $('phrases-search').addEventListener('input',renderLibrary);$('phrases-lesson-filter').addEventListener('change',renderLibrary);
  $('speaking-next').addEventListener('click',()=>{if(busy||($('speaking-answer').value.trim()&&!confirm('Zmienić pytanie i usunąć niezapisaną odpowiedź?')))return;stopLessonSpeaking();$('speaking-answer').value='';setPrompt();});
  $('speaking-listen').addEventListener('click',()=>playWordAudio($('speaking-prompt').value));
  $('speaking-start').addEventListener('click',()=>{if(busy)return;const text=$('speaking-answer').value;if(text.trim()&&!confirm('Rozpocząć nowe nagranie? Obecny tekst odpowiedzi pozostanie do czasu transkrypcji.'))return;recorder.start($('speaking-transcribe').checked);});
  $('speaking-stop').addEventListener('click',()=>recorder.stop());
  $('speaking-answer').addEventListener('input',()=>dirty=true);
  $('speaking-save').addEventListener('click',async()=>{
    if(busy)return;recorder.stop();const text=$('speaking-answer').value.trim(),prompt=$('speaking-prompt').value.trim();
    if(!text||!prompt){status('Wpisz pytanie oraz tekst odpowiedzi przed zapisaniem.',true);return;}
    const next=draft();next.answers=[{prompt,text,date:new Date().toISOString()},...next.answers].slice(0,20);
    if(await persist(next))$('speaking-answer').value='';
  });
  window.addEventListener('beforeunload',event=>{stopLessonSpeaking();if(hasChanges()){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLessonSpeaking();});
}
function updateSpeechControls(active){
  $('speaking-start').disabled=busy||active||!recorder?.supported();$('speaking-stop').disabled=busy||!active;
  $('speaking-transcribe').disabled=busy||active||!recorder?.recognitionSupported();
  $('speaking-next').disabled=busy||active;$('speaking-listen').disabled=busy||active;
  $('speaking-prompt').disabled=busy||active;$('speaking-save').disabled=busy||active;
}
async function loadLessons(){
  if(!isSignedIn()){status('Zaloguj się przyciskiem u góry, aby korzystać ze swoich lekcji.');renderLibrary();return;}
  loading=true;status('Wczytywanie Twoich lekcji…');
  try{const result=await accountRequest('/api/lessons');lessons=result.lessons;loaded=true;dirty=false;stopLessonSpeaking();selected=null;$('lesson-editor').classList.add('hidden');renderAll();status(lessons.length?'Wybierz lekcję lub dodaj nową.':'Dodaj pierwszą lekcję i wklej notatki z Preply.');}
  catch(error){status(error.message,true);}finally{loading=false;}
}
function openLesson(lesson){
  if(busy)return;stopLessonSpeaking();selected=structuredClone(lesson);dirty=false;
  for(const [field,id] of [['title','lesson-title'],['date','lesson-date'],['tutor','lesson-tutor'],['notes','lesson-notes']])$(id).value=lesson[field];
  $('lesson-editor').classList.remove('hidden');$('lesson-delete').disabled=!lesson.id;
  $('speaking-answer').value='';resetPhraseForm();promptIndex=0;setPrompt();renderLessonPhrases();renderHistory();switchPanel('phrases');renderList();
}
async function persist(next){
  if(busy||!selected)return false;if(!isSignedIn()){status('Zaloguj się, aby zapisać lekcję.',true);return false;}
  const changedPrompt=selected.title!==next.title||selected.notes!==next.notes;
  recorder.stop();setBusy(true);status('Zapisywanie…');
  try{const {lesson}=await accountRequest('/api/lessons'+(next.id?'/'+next.id:''),{method:next.id?'PUT':'POST',body:JSON.stringify(next)});selected=lesson;lessons=[lesson,...lessons.filter(l=>l.id!==lesson.id)];loaded=true;dirty=false;
    for(const [field,id] of [['title','lesson-title'],['date','lesson-date'],['tutor','lesson-tutor'],['notes','lesson-notes']])$(id).value=lesson[field];
    if(changedPrompt&&!$('speaking-answer').value.trim()){promptIndex=0;setPrompt();}
    renderAll();status('Zapisano lekcję na Twoim koncie.');return true;}
  catch(error){status(error.message,true);return false;}finally{setBusy(false);}
}
function renderAll(){renderList();renderLessonPhrases();renderHistory();const value=$('phrases-lesson-filter').value;const filter=$('phrases-lesson-filter');filter.replaceChildren();const all=node('option','Wszystkie lekcje');all.value='all';filter.appendChild(all);for(const l of lessons){const opt=node('option',l.title);opt.value=l.id;filter.appendChild(opt);}filter.value=lessons.some(l=>l.id===value)?value:'all';renderLibrary();}
function renderList(){
  const root=$('lesson-list');root.replaceChildren();const q=$('lesson-search').value.toLowerCase();
  const shown=lessons.filter(l=>`${l.title} ${l.tutor} ${l.notes}`.toLowerCase().includes(q));
  for(const l of shown){const el=button(l.title,()=>{if(!busy&&canLeave())openLesson(l);});el.className=l.id===selected?.id?'active':'';el.appendChild(node('small',`${l.date} · ${l.phrases.length} zwrotów`));root.appendChild(el);}
  if(!shown.length)root.appendChild(node('p',q?'Brak pasujących lekcji.':'Nie masz jeszcze zapisanych lekcji.'));
}
function phraseCard(phrase,lesson,editable=false){
  const card=node('article',undefined,'lesson-phrase-card');card.append(node('strong',phrase.text),node('p',phrase.translation));if(phrase.example)card.appendChild(node('p',phrase.example));card.appendChild(node('small',`${lesson.title||'Nowa lekcja'} · ${lesson.date}${phrase.nextReviewDate?' · powtórka: '+phrase.nextReviewDate:''}`));
  const actions=node('div',undefined,'lesson-toolbar');actions.appendChild(button('Posłuchaj',()=>playWordAudio(phrase.text)));
  actions.appendChild(button('Dodaj do słownictwa',async()=>{try{await saveWordToVocabulary({word:phrase.text,phrase:phrase.text,is_phrase:true,translation:phrase.translation,context_example:phrase.example||phrase.text});status('Zwrot dodany do Twojego słownictwa.');}catch(error){status(error.message,true);}}));
  if(editable){
    actions.appendChild(button('Edytuj',()=>{if(busy)return;editingPhraseId=phrase.id;$('phrase-text').value=phrase.text;$('phrase-translation').value=phrase.translation;$('phrase-example').value=phrase.example;$('phrase-submit').textContent='Zapisz zwrot';$('phrase-cancel').classList.remove('hidden');$('phrase-text').focus();}));
    actions.appendChild(button('Usuń zwrot',async()=>{if(busy||!confirm('Usunąć zwrot z tej lekcji?'))return;const next=draft();next.phrases=next.phrases.filter(p=>p.id!==phrase.id);if(await persist(next)){if(editingPhraseId===phrase.id)resetPhraseForm();}}));
  }
  else actions.appendChild(button('Otwórz lekcję',()=>{if(busy||!canLeave())return;$('nav-lessons-btn').click();openLesson(lesson);}));
  card.appendChild(actions);return card;
}
function renderLessonPhrases(){const root=$('lesson-phrases');root.replaceChildren();if(!selected)return;for(const p of selected.phrases)root.appendChild(phraseCard(p,selected,true));if(!selected.phrases.length)root.appendChild(node('p','Dodaj pierwszy zwrot z lekcji.'));}
function renderLibrary(){const root=$('phrases-library');root.replaceChildren();const q=$('phrases-search').value.toLowerCase(),filter=$('phrases-lesson-filter').value;let count=0;for(const l of lessons){if(filter!=='all'&&filter!==l.id)continue;for(const p of l.phrases){if(!`${p.text} ${p.translation} ${p.example} ${l.title}`.toLowerCase().includes(q))continue;root.appendChild(phraseCard(p,l));count++;}}$('phrases-count').textContent=isSignedIn()?`Znalezione zwroty: ${count}`:'Zaloguj się, aby zobaczyć zwroty ze swoich lekcji.';if(!count)root.appendChild(node('p','Dodaj zwroty w zakładce „Moje lekcje” lub zmień filtry.'));}
function switchPanel(name){stopLessonSpeaking();for(const tab of document.querySelectorAll('[data-lesson-tab]'))tab.setAttribute('aria-pressed',String(tab.dataset.lessonTab===name));for(const n of ['phrases','review','speaking'])$('lesson-panel-'+n).classList.toggle('hidden',n!==name);if(name==='review')startReview();}
function startReview(){reviewQueue=(selected?.phrases||[]).filter(p=>!$('lesson-review-due').checked||!p.nextReviewDate||p.nextReviewDate<=today());revealed=false;renderReview();}
function renderReview(){
  const current=reviewQueue[0],root=$('lesson-review-card');root.replaceChildren();$('lesson-review-count').textContent=current?`Pozostało w sesji: ${reviewQueue.length}`:'Brak zwrotów do powtórzenia. Dodaj zwroty lub wyłącz filtr „Tylko nowe i zaplanowane na dziś”.';
  if(current){root.appendChild(node('p',current.translation));if(revealed){root.appendChild(node('strong',current.text));if(current.example)root.appendChild(node('small',current.example));}}
  $('lesson-review-reveal').disabled=busy||!current||revealed;$('lesson-review-audio').disabled=busy||!current||!revealed;
  document.querySelectorAll('[data-lesson-grade]').forEach(el=>el.disabled=busy||!current||!revealed);
}
function setPrompt(){
  if(!selected)return;
  const custom=selected.notes.split('\n').map(line=>line.trim()).filter(line=>line.endsWith('?')&&/[a-z]/i.test(line)&&line.length<=500);
  const prompts=[...custom,`What did you learn in your lesson about "${selected.title||'today’s topic'}"?`,'Explain one idea from your lesson and give an example from your work or daily life.','Which part of this lesson was difficult, and what would you like to practise next?',...selected.phrases.map(p=>`Use "${p.text}" in a sentence about your work or daily life.`)];
  $('speaking-prompt').value=prompts[promptIndex++%prompts.length];
}
function renderHistory(){const root=$('speaking-history');root.replaceChildren();if(!selected)return;for(const a of selected.answers){const card=node('article',undefined,'lesson-phrase-card');card.append(node('strong',a.prompt),node('p',a.text),node('small',a.date.slice(0,10)));root.appendChild(card);}}
function resetPhraseForm(){editingPhraseId=null;$('phrase-form').reset();$('phrase-submit').textContent='Dodaj zwrot do lekcji';$('phrase-cancel').classList.add('hidden');}
