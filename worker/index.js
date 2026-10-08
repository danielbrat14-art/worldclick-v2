// Sites hosting adapter for the existing Flask/static WordClick project.
// ASSETS and ORIGINAL are embedded by scripts/build.mjs; no runtime dependencies.
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const clean = (value, limit=200) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
function currentUser(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  const email=request.headers.get('oai-authenticated-user-email');
  if (!id || !email) return null;
  return {id,email};
}
async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'Wymagany jest format JSON.');
  if (+request.headers.get('content-length')>60000) throw new HttpError(413,'Dane są zbyt duże.');
  const reader=request.body?.getReader();
  if(!reader) throw new HttpError(400,'Brak danych.');
  let size=0; const chunks=[];
  for(;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>60000){await reader.cancel();throw new HttpError(413,'Dane są zbyt duże.');} chunks.push(value); }
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try { const data=JSON.parse(new TextDecoder().decode(bytes)); if(!data || typeof data!=='object' || Array.isArray(data))throw Error(); return data; }
  catch {throw new HttpError(400,'Nieprawidłowe dane JSON.');}
}
function checkOrigin(request) {
  const origin=request.headers.get('origin');
  if ((origin && origin!==new URL(request.url).origin) || request.headers.get('sec-fetch-site')==='cross-site') throw new HttpError(403,'Niedozwolone źródło żądania.');
}
function getDb(env) {
  if(!env.DB)throw new HttpError(503,'Biblioteka jest chwilowo niedostępna. Spróbuj ponownie.');
  return env.DB;
}
function wordKey(item) { return clean(item.phrase || item.clean_word || item.word,120).toLowerCase(); }
function normalizeItem(input,previous) {
  const word=clean(input.phrase || input.word,120), key=wordKey(input),translation=clean(input.translation,1000);
  if(!word || !key || !translation)throw new HttpError(400,'Słowo i tłumaczenie są wymagane.');
  const item={id:previous?.id || crypto.randomUUID(),word,clean_word:key,is_phrase:input.is_phrase===true,
    translation,pronunciation:clean(input.pronunciation,120),context_example:clean(input.context_example,2000),
    context_example_pl:clean(input.context_example_pl,2000),dateAdded:previous?.dateAdded || new Date().toLocaleDateString('pl-PL')};
  if(['contextual','dictionary'].includes(input.translation_kind))item.translation_kind=input.translation_kind;
  for(const field of ['repetitions','easeFactor','interval']) {
    if(Number.isFinite(input[field]) && input[field]>=0 && input[field]<=10000)item[field]=input[field];
    else if(previous?.[field]!==undefined)item[field]=previous[field];
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(input.nextReviewDate||''))item.nextReviewDate=input.nextReviewDate;
  else if(previous?.nextReviewDate)item.nextReviewDate=previous.nextReviewDate;
  return item;
}
async function vocabularyApi(request,env,user) {
  const db=getDb(env),path=new URL(request.url).pathname;
  if(request.method==='GET') {
    if(path!=='/api/vocabulary')throw new HttpError(404,'Nie znaleziono.');
    const rows=await db.prepare('SELECT payload FROM vocabulary WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all();
    return json({items:rows.results.map(r=>JSON.parse(r.payload))});
  }
  if(request.method==='POST' && path==='/api/vocabulary') {
    const input=await readJson(request),key=wordKey(input);
    if(!key)throw new HttpError(400,'Brak słowa.');
    const row=await db.prepare('SELECT payload FROM vocabulary WHERE user_id = ? AND word_key = ?').bind(user.id,key).first();
    const item=normalizeItem(input,row?JSON.parse(row.payload):null);
    await db.prepare("INSERT INTO vocabulary (id, user_id, word_key, payload, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, word_key) DO UPDATE SET payload = json_set(excluded.payload, '$.id', vocabulary.id), updated_at = excluded.updated_at").bind(item.id,user.id,key,JSON.stringify(item),Date.now()).run();
    // Read back to return the authoritative ID even if concurrent saves raced.
    const saved=await db.prepare('SELECT id, payload FROM vocabulary WHERE user_id = ? AND word_key = ?').bind(user.id,key).first();
    return json({item:{...JSON.parse(saved.payload),id:saved.id}});
  }
  if(request.method==='DELETE') {
    if(path==='/api/vocabulary')await db.prepare('DELETE FROM vocabulary WHERE user_id = ?').bind(user.id).run();
    else {
      const id=decodeURIComponent(path.slice('/api/vocabulary/'.length));
      if(!id || id.length>150)throw new HttpError(400,'Nieprawidłowy wpis.');
      const result=await db.prepare('DELETE FROM vocabulary WHERE user_id = ? AND id = ?').bind(user.id,id).run();
      if(!result.meta.changes)throw new HttpError(404,'Nie znaleziono wpisu na Twoim koncie.');
    }
    return json({ok:true});
  }
  throw new HttpError(405,'Niedozwolona metoda.');
}
async function fetchTimed(url,options={},milliseconds=12000) {
  try {return await fetch(url,{...options,signal:AbortSignal.timeout(milliseconds)});}
  catch {throw new HttpError(503,'Usługa zewnętrzna nie odpowiada. Spróbuj ponownie za chwilę.');}
}
function decodeHtml(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{ const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n;return c>0&&c<=0x10ffff?String.fromCodePoint(c):''; })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n]));
}
const plain = value => decodeHtml(value).replace(/<[^>]*>/g,' ').replace(/[ \t]+/g,' ').trim();
function isRoot(word) {
  const roots=ORIGINAL.COMMON_PHRASAL_VERB_ROOTS;
  if(roots.includes(word))return true;
  if(word.endsWith('ied')&&roots.includes(word.slice(0,-3)+'y'))return true;
  return ['ing','ed','es','s'].some(s=>{if(!word.endsWith(s))return false;const stem=word.slice(0,-s.length);return roots.includes(stem)||roots.includes(stem+'e')||(stem.at(-1)===stem.at(-2)&&roots.includes(stem.slice(0,-1)));});
}
const regexEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function detectPhrase(word,sentence,wordOffset) {
  for(const [key,item] of Object.entries(ORIGINAL.KNOWN_PHRASES)) {
    if(!key.split(' ').includes(word))continue;
    for(const match of sentence.matchAll(new RegExp('\\b'+regexEscape(key)+'\\b','gi'))) {
      if(wordOffset===undefined || (wordOffset>=match.index && wordOffset<match.index+match[0].length))return {...item,start:match.index,end:match.index+match[0].length};
    }
  }
  if(isRoot(word))for(const particle of ORIGINAL.PARTICLES){for(const match of sentence.matchAll(new RegExp('\\b('+regexEscape(word)+'\\s+'+regexEscape(particle)+')\\b','gi'))){if(wordOffset===undefined || wordOffset===match.index)return {phrase:match[1],phrase_type:'Phrasal Verb',start:match.index,end:match.index+match[0].length};}}
  return null;
}
async function translateText(text) {
  if(!text)return null;
  try {
    const result=await translateOnline(text,{fetcher:url=>fetchTimed(url,{},5000),reportFailure:(provider,status)=>console.warn('Translation provider unavailable',provider,status)});
    return result?.text || null;
  }catch {throw new HttpError(503,'Nie udało się pobrać tłumaczenia. Spróbuj ponownie.');}
}
async function translateApi(request) {
  const data=await readJson(request),raw=clean(data.word,120),word=raw.replace(/^[^\w]+|[^\w]+$/g,'').toLowerCase(),sentence=clean(data.sentence,2000);
  if(!word)throw new HttpError(400,'Wybierz angielskie słowo.');
  const leading=typeof data.sentence==='string'?data.sentence.length-data.sentence.trimStart().length:0;
  let offset=Number.isInteger(data.word_offset)?data.word_offset-leading:undefined;
  if(offset===undefined || offset<0 || sentence.slice(offset,offset+raw.length).toLowerCase()!==raw.toLowerCase())offset=sentence.match(new RegExp('\\b'+regexEscape(raw)+'\\b','i'))?.index;
  const phrase=detectPhrase(word,sentence,offset),dictionary=ORIGINAL.FALLBACK_DICTIONARY[word];
  const target=phrase?.phrase||word;
  const known=phrase?.translation || dictionary?.translation;
  const lookup={word:raw,clean_word:word,is_phrase:!!phrase,phrase:phrase?.phrase||null,phrase_type:phrase?.phrase_type||null,context_example:sentence||raw,word_offset:offset??0,target_start:phrase?.start??offset??0,target_end:phrase?.end??((offset??0)+raw.length)};
  // The deployed provider connection is refused from cloud IPs. The browser
  // requests preprocessing only, then resolves online translation directly.
  if(data.prefer_browser===true)return json({...lookup,translation:known||null,pronunciation:dictionary?.pronunciation||'',possible_meanings:phrase?.possible_meanings||dictionary?.possible_meanings||[],needs_browser_translation:true,source:known?'dictionary':'browser'});
  let translated,context;
  try {[translated,context]=await Promise.all([known?Promise.resolve(known):translateText(target),translateText(sentence).catch(()=>null)]);}
  catch(error){return json({error:error.message,lookup},error.status||503);}
  if(!translated)throw new HttpError(422,'Nie znaleziono tłumaczenia. Spróbuj innego słowa lub krótszego fragmentu.');
  return json({word:raw,clean_word:word,is_phrase:!!phrase,phrase:phrase?.phrase||null,phrase_type:phrase?.phrase_type||null,
    translation:translated,pronunciation:dictionary?.pronunciation||'',context_example:sentence||raw,context_example_pl:context||'',
    possible_meanings:phrase?.possible_meanings||dictionary?.possible_meanings||[translated],source:known?'dictionary':'online'});
}
function safeExternalUrl(value) {
  let url;try{url=new URL(value);}catch{throw new HttpError(400,'Podaj pełny adres HTTPS artykułu.');}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || host==='localhost')throw new HttpError(400,'Podaj publiczny adres HTTPS artykułu.');
  return url;
}
async function readLimited(response,limit=1500000) {
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Artykuł jest zbyt duży. Wklej wybrany fragment.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let pos=0;for(const part of chunks){bytes.set(part,pos);pos+=part.length;}
  return new TextDecoder().decode(bytes);
}
async function externalPage(value) {
  let url=safeExternalUrl(value);
  for(let i=0;i<4;i++) {
    const response=await fetchTimed(url.toString(),{redirect:'manual',headers:{'Accept':'text/html, application/rss+xml, application/xml','User-Agent':'WordClick/2 private reader'}});
    if([301,302,303,307,308].includes(response.status)){url=safeExternalUrl(new URL(response.headers.get('location'),url).toString());continue;}
    if(!response.ok)throw new HttpError(422,'Nie udało się otworzyć artykułu. Wklej jego tekst.');
    return {text:await readLimited(response),url};
  }
  throw new HttpError(422,'Zbyt wiele przekierowań. Wklej tekst artykułu.');
}
async function importApi(request) {
  const data=await readJson(request);const {text,url}=await externalPage(clean(data.url,2000));
  const html=text.replace(/<(script|style|nav|header|footer|form|aside|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const title=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Imported article');
  const body=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html;
  const paragraphs=[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>plain(m[1])).filter(p=>p.split(/\s+/).length>5 && !/sign up for|subscribe to|media caption|image caption/i.test(p));
  const content=paragraphs.join('\n\n').slice(0,100000);
  if(content.split(/\s+/).length<10 || /we use cookies|accept all|subscribe to read|before you continue to google/i.test(content))throw new HttpError(422,'Strona nie udostępnia tekstu artykułu. Wklej tekst ręcznie.');
  return json({title,content,url:url.toString(),domain:url.hostname,word_count:content.split(/\s+/).length});
}
async function newsApi() {
  const batches=await Promise.all(ORIGINAL.NEWS_FEEDS.map(async feed=>{
    try {
      const {text}=await externalPage(feed.url.replace(/^http:/,'https:'));
      return [...text.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0,6).map(match=>{
        const xml=match[1],tag=name=>xml.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';
        const link=plain(tag('link'))||decodeHtml(xml.match(/<link\b[^>]*href=["']([^"']+)/i)?.[1]||'');
        return {title:plain(tag('title')),link,description:plain(tag('description')||tag('summary')||tag('content')).slice(0,2000),pubDate:plain(tag('pubDate')||tag('updated')),source:feed.source,category:feed.category,badge_color:feed.badge_color};
      }).filter(a=>a.title&&/^https?:\/\//.test(a.link));
    }catch{return [];}
  }));
  const articles=batches.flat();return json({articles,total:articles.length});
}
export default {
  async fetch(request,env) {
    try {
      const path=new URL(request.url).pathname,user=currentUser(request);
      if(path.startsWith('/api/')) {
        if(!['GET','HEAD'].includes(request.method))checkOrigin(request);
        if(path==='/api/me'&&request.method==='GET')return json({user:user?{email:user.email}:null,storage:user?'account':'none'});
        if(path==='/api/vocabulary'||path.startsWith('/api/vocabulary/')) {
          if(!user)throw new HttpError(401,'Zaloguj się, aby korzystać ze swojej biblioteki.');
          return await vocabularyApi(request,env,user);
        }
        if(path==='/api/lessons'||path.startsWith('/api/lessons/')) {
          if(!user)throw new HttpError(401,'Zaloguj się, aby korzystać ze swoich lekcji.');
          return await lessonsApi(request,env,user);
        }
        if(path==='/api/translation-health' && request.method==='GET') {
          if(!user)throw new HttpError(401,'Zaloguj się, aby sprawdzić usługę.');
          const result=await translateText('upcoming');
          return json({ok:!!result,translation:result});
        }
        if(path==='/api/translate'&&request.method==='POST')return await translateApi(request);
        if(path==='/api/import-url'&&request.method==='POST')return await importApi(request);
        if(path==='/api/news-feed'&&request.method==='GET')return await newsApi();
        throw new HttpError(404,'Nie znaleziono.');
      }
      if(request.method!=='GET'&&request.method!=='HEAD')throw new HttpError(405,'Niedozwolona metoda.');
      const asset=ASSETS[path==='/'?'/index.html':path];
      if(asset===undefined)throw new HttpError(404,'Nie znaleziono.');
      const html=path==='/'||path==='/index.html';
      const body=asset;
      const type=html?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript';
      return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob: https://translate.google.com; connect-src 'self' https://translate.googleapis.com https://api.mymemory.translated.net; frame-ancestors 'self' https://chatgpt.com"}});
    } catch(error) {
      if(!(error instanceof HttpError))console.error('WordClick request failed',error?.message);
      return json({error:error instanceof HttpError?error.message:'Wystąpił błąd. Twoje dane pozostają zapisane. Spróbuj ponownie.'},error.status||503);
    }
  }
};
