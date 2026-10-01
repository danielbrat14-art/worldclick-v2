import { translateOnline } from './translation-providers.js';
const providers=['MyMemory','Google Translate'];
const sharedPolishWords=new Set(['bank','hotel','radio','internet','laptop','model','plan','partner','test','sport']);
// Marks exactly the clicked occurrence, then translates its surrounding
// sentence. A word is called contextual only when the alignment survives.
export function markedContext(lookup) {
  const sentence=lookup.context_example||'';
  let start=lookup.target_start,end=lookup.target_end;
  const target=lookup.phrase||lookup.word;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>sentence.length||sentence.slice(start,end).toLowerCase()!==target.toLowerCase()) {
    start=sentence.toLowerCase().indexOf(target.toLowerCase());end=start+target.length;
  }
  if(start<0)return null;
  // Existing brackets are neutralised so only one pair denotes the target.
  const normalized=sentence.replace(/\[/g,'(').replace(/\]/g,')');
  let left=start,right=end;
  const make=()=>normalized.slice(left,start)+'['+normalized.slice(start,end)+']'+normalized.slice(end,right);
  if(new TextEncoder().encode(make()).length>480)return null;
  // Grow both sides while respecting the provider's UTF-8 limit. The target
  // always stays present, including when it occurs late in a long sentence.
  while(left>0||right<sentence.length) {
    let grew=false;
    if(left>0){left--;if(new TextEncoder().encode(make()).length>480)left++;else grew=true;}
    if(right<sentence.length){right++;if(new TextEncoder().encode(make()).length>480)right--;else grew=true;}
    if(!grew)break;
  }
  // Trim partial words at the outside of a shortened excerpt only.
  if(left>0){const space=normalized.slice(left,start).indexOf(' ');if(space>=0)left+=space+1;}
  if(right<sentence.length){const space=normalized.slice(end,right).lastIndexOf(' ');if(space>=0)right=end+space;}
  return make();
}
export function alignedTranslation(text,target) {
  const matches=[...String(text).matchAll(/\[([^\[\]]*)\]/g)];
  if(matches.length!==1)return null;
  const translated=matches[0][1].trim();
  if(!translated||(translated.toLowerCase()===target.toLowerCase()&&!sharedPolishWords.has(target.toLowerCase()))||translated.length>160||translated.split(/\s+/).length>10)return null;
  return {translation:translated,context_example_pl:String(text).replace(/\[|\]/g,'')};
}
export async function translateLookupInContext(lookup,options={}) {
  const online=options.translate || (text=>translateOnline(text,{providers}));
  const target=lookup.phrase||lookup.word;
  const marked=markedContext(lookup);
  let contextual=null;
  if(marked) {
    try {
      const result=await online(marked);
      const aligned=alignedTranslation(result?.text,target);
      if(aligned)return {...lookup,...aligned,possible_meanings:[aligned.translation],translation_kind:'contextual',source:result.provider+' (sentence)'};
      if(result?.text)contextual={...result,text:result.text.replace(/\[|\]/g,'')};
    }catch{}
  }
  // Context cannot always be aligned reliably. Keep the sentence visible and
  // label the isolated dictionary meaning explicitly instead of overstating it.
  const [word,sentence]=await Promise.all([
    lookup.translation?Promise.resolve({text:lookup.translation,provider:'dictionary'}):online(target),
    contextual?Promise.resolve(contextual):online(lookup.context_example).catch(()=>null)
  ]);
  return {...lookup,translation:word.text,context_example_pl:sentence?.text||'',possible_meanings:lookup.possible_meanings?.length?lookup.possible_meanings:[word.text],translation_kind:'dictionary',source:word.provider+' (dictionary)'};
}
