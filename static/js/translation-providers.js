/** Shared online translator used by the server and the browser fallback.
 * Never treats an untranslated input, quota message or error page as a result.
 */
export async function translateOnline(input, options = {}) {
  let text=String(input||'').trim();
  if(!text)return null;
  while(new TextEncoder().encode(text).length>480)text=text.slice(0,-1);
  const fetcher=options.fetcher || ((url)=>fetch(url,{signal:AbortSignal.timeout(6000)}));
  const report=options.reportFailure || (()=>{});
  const query=encodeURIComponent(text);
  for(const provider of options.providers || ['Google Translate','MyMemory']) {
    try {
      const url=provider==='Google Translate'
        ?'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pl&dt=t&q='+query
        :'https://api.mymemory.translated.net/get?q='+query+'&langpair=en%7Cpl';
      const response=await fetcher(url);
      if(!response.ok){report(provider,response.status);continue;}
      const data=await response.json();
      let translated;
      if(provider==='Google Translate') {
        if(!Array.isArray(data?.[0])){report(provider,'invalid-response');continue;}
        translated=data[0].map(part=>typeof part?.[0]==='string'?part[0]:'').join('');
      } else {
        if(+data.responseStatus!==200 || data.quotaFinished){report(provider,data.quotaFinished?'quota':data.responseStatus);continue;}
        translated=data.responseData?.translatedText;
      }
      if(typeof translated!=='string')continue;
      translated=translated.trim().replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name]));
      if(translated && translated.toLowerCase()!==text.toLowerCase())return {text:translated,provider};
    }catch {report(provider,'connection');}
  }
  throw new Error('Nie udało się pobrać tłumaczenia. Sprawdź połączenie i spróbuj ponownie.');
}
