// Optional browser agent interface; unsupported browsers use the ordinary UI.
import { getSavedVocabulary } from './storage.js';
export function registerWordClickTools() {
  const context=document.modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[{
    name:'wordclick_read_saved_vocabulary',title:'Odczytaj moje słowa',
    description:'Read vocabulary currently loaded for this signed-in user.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return {items:getSavedVocabulary()};}
  },{
    name:'wordclick_open_text',title:'Otwórz tekst w czytniku',
    description:'Place English text in the existing reader and render its clickable words. Does not save vocabulary.',
    inputSchema:{type:'object',properties:{text:{type:'string',minLength:1,maxLength:100000}},required:['text'],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:true},
    execute(input){
      if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>100000||Object.keys(input).some(k=>k!=='text'))throw new Error('Expected English text up to 100,000 characters.');
      document.getElementById('nav-reader-btn').click();document.querySelector('[data-mode="paste"]').click();
      document.getElementById('text-input').value=input.text;document.getElementById('analyze-btn').click();
      return {opened:true,wordCount:input.text.trim().split(/\s+/).length};
    }
  }];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
