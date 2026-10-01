/** Server-backed per-account library. Memory is only a UI cache. */
let items = [];
let ready = false;
let signedIn = false;
let loginAvailable = true;
let csrfToken = '';
export function isSignedIn(){return signedIn;}
export function showLibraryStatus(){showAccountMessage(signedIn?'Biblioteka zapisana na Twoim koncie':loginAvailable?'Czytaj i tłumacz bez logowania. Zaloguj się, aby zapisywać słówka.':'Czytaj i tłumacz bez logowania. Logowanie Google jest w przygotowaniu.');}
export function showAccountMessage(message, error=false) {
  const el=document.getElementById('account-status');
  if(el){el.textContent=message;el.classList.toggle('error',error);}
}
export async function accountRequest(path,options={}) {
  let response;
  try { response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(csrfToken?{'X-CSRF-Token':csrfToken}:{}),...options.headers}}); }
  catch {throw new Error('Brak połączenia. Spróbuj ponownie — zmiana nie została zapisana.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error || 'Nie udało się zapisać zmian. Spróbuj ponownie.');error.status=response.status;error.data=data;throw error;}
  return data;
}
export async function initializeVocabulary() {
  const account=await accountRequest('/api/me');
  const auth=account.auth||{enabled:true,provider:'ChatGPT',login_url:'/signin-with-chatgpt?return_to=%2F',logout_url:'/signout-with-chatgpt?return_to=%2F'};
  loginAvailable=auth.enabled;
  csrfToken=auth.csrf_token||'';
  const signIn=document.getElementById('account-signin');
  const signOut=document.getElementById('account-signout');
  signIn.href=auth.login_url;
  signIn.textContent='Zaloguj się przez '+auth.provider;
  signOut.href=auth.logout_url;
  if(auth.logout_method==='POST')signOut.onclick=async event=>{
    event.preventDefault();
    try{await accountRequest(auth.logout_url,{method:'POST',body:'{}'});window.location.assign('/');}
    catch(error){showAccountMessage(error.message,true);}
  };
  signedIn=!!account.user;
  document.getElementById('account-signin').classList.toggle('hidden',signedIn||!loginAvailable);
  document.getElementById('account-signout').classList.toggle('hidden',!signedIn);
  if(!signedIn){items=[];ready=false;document.getElementById('account-email').textContent='Gość';showLibraryStatus();changed();return;}
  const library=await accountRequest('/api/vocabulary');
  items=library.items;ready=true;
  document.getElementById('account-email').textContent=account.user.email;
  showLibraryStatus();
  changed();
}
export function getSavedVocabulary(){return structuredClone(items);}
export function isWordSaved(word,translation){return items.some(i=>key(i)===word?.toLowerCase()&&(!translation||(i.translation===translation.translation&&i.context_example===translation.context_example)));}
const key=item=>(item.phrase||item.clean_word||item.word).toLowerCase();
export async function saveWordToVocabulary(input) {
  if(!signedIn)throw new Error(loginAvailable?'Zaloguj się przyciskiem u góry, aby zapisać słowo w swojej bibliotece.':'Logowanie Google nie jest jeszcze skonfigurowane. Słowo nie zostało zapisane.');
  if(!ready)throw new Error('Biblioteka nie została załadowana. Odśwież stronę i spróbuj ponownie.');
  const {item}=await accountRequest('/api/vocabulary',{method:'POST',body:JSON.stringify(input)});
  items=[item,...items.filter(i=>key(i)!==key(item))];changed();
  showAccountMessage('Zapisano na Twoim koncie');return item;
}
export async function removeWordFromVocabulary(wordOrId) {
  if(!ready)throw new Error('Biblioteka nie została załadowana.');
  const item=items.find(i=>i.id===wordOrId||key(i)===wordOrId.toLowerCase());
  if(!item)return;
  await accountRequest('/api/vocabulary/'+encodeURIComponent(item.id),{method:'DELETE'});
  items=items.filter(i=>i.id!==item.id);changed();showAccountMessage('Usunięto z Twojej biblioteki');
}
export async function clearAllVocabulary(){
  if(!ready)throw new Error('Biblioteka nie została załadowana.');
  await accountRequest('/api/vocabulary',{method:'DELETE'});items=[];changed();showAccountMessage('Twoja biblioteka została wyczyszczona');
}
function changed(){window.dispatchEvent(new CustomEvent('vocab-changed',{detail:{count:items.length}}));}
