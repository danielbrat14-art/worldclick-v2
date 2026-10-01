import { accountRequest, showAccountMessage, showLibraryStatus } from './storage.js';
import { translateLookupInContext } from './context-translation.js';
async function resolveInBrowser(lookup,sentenceContext) {
  const result=await translateLookupInContext({...lookup,context_example:lookup.context_example||sentenceContext});
  showLibraryStatus();
  return result;
}
export async function fetchLiveNewsFeed(){
  try{return (await accountRequest('/api/news-feed')).articles||[];}
  catch(error){showAccountMessage('Nie udało się pobrać wiadomości. Możesz wkleić tekst lub wybrać przykład.',true);return [];}
}
export async function fetchArticleFromUrl(url){return accountRequest('/api/import-url',{method:'POST',body:JSON.stringify({url})});}
export async function requestTranslation(word,sentenceContext,wordOffset){
  if(sentenceContext.length>2000){const start=Math.max(0,(wordOffset||0)-900);sentenceContext=sentenceContext.slice(start,start+2000);wordOffset=Math.max(0,(wordOffset||0)-start);}
  try {
    const data=await accountRequest('/api/translate',{method:'POST',body:JSON.stringify({word,sentence:sentenceContext,word_offset:wordOffset,prefer_browser:true})});
    if(data.needs_browser_translation)return await resolveInBrowser(data,sentenceContext);
    showLibraryStatus();
    return data;
  } catch(error) {
    // Cloud IPs can be refused by translation providers. Retry directly from
    // the signed-in browser, preserving detected phrases and true error states.
    if(![502,503].includes(error.status) || !error.data?.lookup)throw error;
    const lookup=error.data.lookup;
    return resolveInBrowser(lookup,sentenceContext);
  }
}
