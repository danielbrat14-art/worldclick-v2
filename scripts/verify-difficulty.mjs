import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { estimateDifficulty, filterNewsArticles, difficultyDescription } from '../static/js/difficulty.js';

const basic = 'Today we went to the park. We saw a small dog near the lake. The sun was warm and the sky was blue. We had some lunch and then went home. It was a good day.';
const intermediate = 'The city council has approved a new plan to improve public transport across the region. Residents will be able to use a single ticket for buses and trains. The project will begin next year, and officials expect the changes to make daily travel more convenient.';
const advanced = 'The implementation of comprehensive macroeconomic stabilization mechanisms necessitates substantial coordination between regulatory institutions, international financial organizations and governmental authorities, particularly when deteriorating geopolitical circumstances exacerbate unpredictable inflationary pressures and undermine conventional monetary interventions. Consequently, policymakers must evaluate competing methodological assumptions before introducing potentially irreversible structural adjustments.';
for (const [text, expected] of [[basic,'basic'],[intermediate,'intermediate'],[advanced,'advanced'],['Breaking news','unknown'],['','unknown']]) assert.equal(estimateDifficulty(text).level, expected);
assert.equal(estimateDifficulty(null).level,'unknown');
assert.match(difficultyDescription(advanced), /orientacyjny.*C1–C2/);
console.log('PASS simple, ordinary and complex English samples have distinct broad difficulty bands; short text remains unassessed');

const fixtures = [
  ...Array.from({length:7},(_,i)=>({title:`Daily life ${i}`,description:basic,category:'Świat',source:'Test'})),
  {title:'City transport',description:intermediate,category:'Świat',source:'Test'},
  {title:'Policy outlook',description:advanced,category:'Biznes',source:'Test'},
  {title:'Breaking news',description:'',category:'Biznes',source:'Test'}
].map(article=>({...article,difficulty:estimateDifficulty(`${article.title}. ${article.description}`)}));
assert.equal(filterNewsArticles(fixtures,'Świat','advanced').length,0);
assert.equal(filterNewsArticles(fixtures,'Biznes','advanced').length,1);
assert.equal(filterNewsArticles(fixtures,'all','unknown').length,1);
assert.equal(filterNewsArticles(fixtures,'all','all').length,10);
console.log('PASS topic and difficulty combine with AND, including unknown and all-level choices');

// Run the actual feed controller against a small DOM harness, without cloud calls.
const nodes = new Map();
function element() {
  const classes = new Set();
  let html = '';
  return {children:[],events:{},dataset:{},value:'all',textContent:'',innerHTML:'',style:{},
    get innerHTML(){return html;},set innerHTML(value){html=value;this.children=[];},
    classList:{add(...x){x.forEach(v=>classes.add(v));},remove(...x){x.forEach(v=>classes.delete(v));},contains(x){return classes.has(x);}},
    setAttribute(){},appendChild(child){this.children.push(child);},scrollIntoView(){},
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);},
    dispatchEvent(event){for(const fn of this.events[event.type]||[])fn(event);},
    click(){this.dispatchEvent({type:'click'});}
  };
}
for(const id of ['news-feed-grid','news-loading','refresh-news-btn','news-level-select','news-filter-count','reset-news-filters','nav-reader-btn','interactive-container','interactive-text-body','article-display-title','article-meta-info']) nodes.set(id,element());
const pills = ['all','Świat','Biznes'].map(cat=>{const e=element();e.dataset.cat=cat;return e;});
const news = element();
const requests = [];
const document = {
  addEventListener(){}, createElement:element, getElementById:id=>nodes.get(id),
  querySelectorAll:selector=>selector==='.cat-pill'?pills:[],
  querySelector:selector=>selector==='[data-mode="news"]'?news:selector==='[data-cat="all"]'?pills[0]:null
};
const context=vm.createContext({document,window:{scrollTo(){}},console,Event:class {constructor(type){this.type=type;}},
  estimateDifficulty,filterNewsArticles,difficultyDescription,
  fetchArticleFromUrl:async()=>({content:basic}), renderInteractiveText(){},
  fetchLiveNewsFeed:()=>new Promise(resolve=>requests.push(resolve))
});
vm.runInContext(readFileSync('static/js/app.js','utf8').replace(/^import .*;\n/gm,''),context);
vm.runInContext(readFileSync('static/js/home.js','utf8').replaceAll('export function','function'),context);
context.initNewsFeed();
news.click();
requests.shift()(fixtures);
await new Promise(setImmediate);
assert.match(nodes.get('news-filter-count').textContent,/10 z 10/);
assert.equal(nodes.get('news-feed-grid').children.filter(n=>n.className==='library-card').length,6);
const select=nodes.get('news-level-select');
select.value='advanced';select.dispatchEvent({type:'change'});
assert.match(nodes.get('news-filter-count').textContent,/1 z 10/);
pills[1].click();
assert.match(nodes.get('news-filter-count').textContent,/0 z 10/);
assert.match(nodes.get('news-feed-grid').innerHTML,/Wyczyść filtry/);
nodes.get('reset-news-filters').click();
assert.equal(select.value,'all');assert.match(nodes.get('news-filter-count').textContent,/10 z 10/);
console.log('PASS feed control updates counts, pagination, combined empty state and reset');

nodes.get('refresh-news-btn').click();
nodes.get('refresh-news-btn').click();
const stale=requests.shift(), newest=requests.shift();
newest(fixtures.slice(0,1)); await new Promise(setImmediate);
stale(fixtures); await new Promise(setImmediate);
assert.match(nodes.get('news-filter-count').textContent,/1 z 1/);
select.value='advanced';select.dispatchEvent({type:'change'});
context.returnHome();
assert.equal(select.value,'all');assert.match(nodes.get('news-filter-count').textContent,/1 z 1/);
console.log('PASS stale refresh cannot replace the current feed; home resets the level filter');

await context.loadNewsArticleIntoReader(fixtures.find(a=>a.category==='Biznes'));
assert.match(nodes.get('article-meta-info').textContent,/Podstawowy.*A1–A2/);
assert.doesNotMatch(nodes.get('article-meta-info').textContent,/Zaawansowany/);
console.log('PASS reader reassesses the opened full text instead of repeating the excerpt estimate');

const html=readFileSync('static/index.html','utf8');
assert.match(html,/label for="news-level-select"/);
assert.match(html,/id="news-level-help"/);
assert.match(html,/id="news-filter-count".*aria-live="polite"/);
console.log('PASS filter is labelled and result count is announced accessibly');
