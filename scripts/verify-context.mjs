import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { markedContext, translateLookupInContext, alignedTranslation } from '../static/js/context-translation.js';
const sentence='The bank approved the loan, and the bank of the river flooded.';
const start=sentence.lastIndexOf('bank');
assert.equal(markedContext({word:'bank',context_example:sentence,target_start:start,target_end:start+4}),'The bank approved the loan, and the [bank] of the river flooded.');
console.log('PASS marker identifies the clicked occurrence of a repeated word');
const long='This is background information. '.repeat(80)+'We will lead the project. '+ 'More details follow. '.repeat(80);
const lead=long.indexOf('lead');
const excerpt=markedContext({word:'lead',context_example:long,target_start:lead,target_end:lead+4});
assert.ok(excerpt.includes('[lead]'));assert.ok(new TextEncoder().encode(excerpt).length<=480);
console.log('PASS long context keeps the selected word within the provider limit');
assert.equal(alignedTranslation('Siedzieli na [] brzegu rzeki.','bank'),null);
assert.equal(alignedTranslation('Ona będzie [lead] projekt.','lead'),null);
console.log('PASS empty or untranslated alignments cannot be labelled contextual');
const checks=[
  ['bank','They sat on the bank of the river.','Siedzieli na [brzegu] rzeki.','brzegu'],
  ['bank','The bank approved the loan.','[Bank] zatwierdził kredyt.','Bank'],
  ['lead','She will lead the project.','Ona [poprowadzi] projekt.','poprowadzi'],
  ['lead','The pipe contains lead.','Rura zawiera [ołów].','ołów'],
  ['charge','The battery needs a charge.','Bateria wymaga [ładowania].','ładowania'],
  ['issue','The latest issue of the magazine is interesting.','Najnowsze [wydanie] czasopisma jest ciekawe.','wydanie'],
  ['address','We need to address this issue.','Musimy [rozwiązać] ten problem.','rozwiązać'],
];
for(const [word,en,pl,expected] of checks){
  const start=en.indexOf(word);
  const result=await translateLookupInContext({word,context_example:en,target_start:start,target_end:start+word.length},{translate:async()=>({text:pl,provider:'fixture'})});
  assert.equal(result.translation,expected);assert.equal(result.translation_kind,'contextual');assert.ok(!result.context_example_pl.includes('['));
}
console.log('PASS contextual extraction distinguishes bank, lead, charge, issue and address');
const fallback=await translateLookupInContext({word:'bank',context_example:'They sat on the bank of the river.',translation:'bank, brzeg'},
  {translate:async()=>({text:'Siedzieli na brzegu rzeki.',provider:'fixture'})});
assert.equal(fallback.translation_kind,'dictionary');assert.equal(fallback.context_example_pl,'Siedzieli na brzegu rzeki.');
console.log('PASS unaligned results are labelled dictionary meanings with the sentence preserved');
function node(){return {children:[],dataset:{},events:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(child){this.children.push(child);},addEventListener(name,fn){this.events[name]=fn;}};}
const doc={createElement:node,querySelectorAll:()=>[]};
const context=vm.createContext({document:doc,console});
vm.runInContext(readFileSync('static/js/reader.js','utf8').replaceAll('export function','function'),context);
const container=node(),events=[];
context.renderInteractiveText('The bank approved the loan. We sat on the bank of the river.',container,event=>events.push(event));
const banks=container.children[0].children.filter(n=>n.dataset.word==='bank');
banks[1].events.click({stopPropagation(){}});
assert.equal(events[0].sentence,'We sat on the bank of the river.');assert.equal(events[0].wordOffset,events[0].sentence.indexOf('bank'));
console.log('PASS the reader passes the correct sentence and position for the second bank');
