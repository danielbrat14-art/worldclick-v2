// Included in the Worker bundle. Identity comes only from Sites dispatch.
function requiredText(value, name, max, optional=false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new HttpError(400, `Sprawdź pole „${name}” (maks. ${max} znaków).`);
  return value.trim();
}
function normalizeLesson(input, previous) {
  const title=requiredText(input.title,'Temat',160);
  const date=requiredText(input.date,'Data',10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)
    throw new HttpError(400,'Podaj prawidłową datę lekcji.');
  const notes=requiredText(input.notes,'Notatki',20000,true);
  const tutor=requiredText(input.tutor||'','Lektor',100,true);
  if(!Array.isArray(input.phrases) || input.phrases.length>100)throw new HttpError(400,'Lekcja może zawierać maksymalnie 100 zwrotów.');
  const keys=new Set(), ids=new Set();
  const phrases=input.phrases.map(p=>{
    if(!p || typeof p!=='object')throw new HttpError(400,'Nieprawidłowy zwrot.');
    const text=requiredText(p.text,'Zwrot',120),translation=requiredText(p.translation,'Tłumaczenie',800);
    const key=text.toLowerCase();
    if(keys.has(key))throw new HttpError(400,'Ten zwrot jest już na liście tej lekcji.');keys.add(key);
    const id=clean(p.id,80)||crypto.randomUUID();
    if(!/^[\w-]{1,80}$/.test(id)||ids.has(id))throw new HttpError(400,'Nieprawidłowy identyfikator zwrotu.');ids.add(id);
    const item={id,text,translation,example:requiredText(p.example||'','Przykład',1000,true)};
    for(const field of ['repetitions','interval','easeFactor']) {
      if(p[field]!==undefined && (!Number.isFinite(p[field])||p[field]<0||p[field]>10000))throw new HttpError(400,'Nieprawidłowe dane powtórek.');
      if(p[field]!==undefined)item[field]=p[field];
    }
    if(p.nextReviewDate!==undefined){if(!/^\d{4}-\d{2}-\d{2}$/.test(p.nextReviewDate))throw new HttpError(400,'Nieprawidłowa data powtórki.');item.nextReviewDate=p.nextReviewDate;}
    return item;
  });
  if(!Array.isArray(input.answers)||input.answers.length>20)throw new HttpError(400,'Nieprawidłowa historia mówienia.');
  const answers=input.answers.map(a=>({prompt:requiredText(a?.prompt,'Pytanie',500),text:requiredText(a?.text,'Odpowiedź',3000),date:clean(a?.date,40)}));
  const lesson={id:previous?.id||crypto.randomUUID(),title,date,tutor,notes,phrases,answers,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(new TextEncoder().encode(JSON.stringify(lesson)).length>55000)throw new HttpError(400,'Notatki, zwroty i odpowiedzi tej lekcji przekraczają 55 KB. Podziel materiał na dwie lekcje.');
  return lesson;
}
async function lessonsApi(request,env,user) {
  const db=getDb(env),url=new URL(request.url),parts=url.pathname.split('/');
  if(parts.length>4 || (parts.length===4&&!parts[3]))throw new HttpError(404,'Nie znaleziono lekcji.');
  const id=parts[3];
  if(id&&!/^[\w-]{1,80}$/.test(id))throw new HttpError(404,'Nie znaleziono lekcji.');
  if(request.method==='GET'&&!id){
    const rows=await db.prepare('SELECT payload, revision FROM lessons WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').bind(user.id).all();
    return json({lessons:rows.results.map(r=>({...JSON.parse(r.payload),revision:r.revision}))});
  }
  if(request.method==='POST'&&!id){
    const input=await readJson(request),lesson=normalizeLesson(input);
    const result=await db.prepare('INSERT INTO lessons (id,user_id,payload,revision,updated_at) SELECT ?,?,?,1,? WHERE (SELECT COUNT(*) FROM lessons WHERE user_id = ?) < 100').bind(lesson.id,user.id,JSON.stringify(lesson),Date.now(),user.id).run();
    if(!result.meta.changes)throw new HttpError(409,'Osiągnięto limit 100 lekcji. Usuń niepotrzebną lekcję.');
    return json({lesson:{...lesson,revision:1}},201);
  }
  if(id && ['GET','PUT','DELETE'].includes(request.method)){
    const row=await db.prepare('SELECT payload, revision FROM lessons WHERE user_id = ? AND id = ?').bind(user.id,id).first();
    if(!row)throw new HttpError(404,'Nie znaleziono lekcji na Twoim koncie.');
    if(request.method==='GET')return json({lesson:{...JSON.parse(row.payload),revision:row.revision}});
    const input=await readJson(request);
    if(input.revision!==row.revision)throw new HttpError(409,'Lekcja zmieniła się w innej karcie lub na innym urządzeniu. Skopiuj niezapisane notatki i wczytaj lekcje ponownie.');
    if(request.method==='DELETE'){
      const result=await db.prepare('DELETE FROM lessons WHERE user_id = ? AND id = ? AND revision = ?').bind(user.id,id,input.revision).run();
      if(!result.meta.changes)throw new HttpError(409,'Lekcja zmieniła się. Wczytaj lekcje ponownie.');
      return json({ok:true});
    }
    const lesson=normalizeLesson(input,JSON.parse(row.payload));
    const result=await db.prepare('UPDATE lessons SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(lesson),Date.now(),user.id,id,input.revision).run();
    if(!result.meta.changes)throw new HttpError(409,'Lekcja zmieniła się. Wczytaj lekcje ponownie.');
    return json({lesson:{...lesson,revision:input.revision+1}});
  }
  throw new HttpError(405,'Niedozwolona metoda.');
}
