/** Temporary local recording, optional browser speech service, explicit text save. */
export class SpeakingRecorder {
  constructor({onStatus,onTranscript,onAudio,onState}) {
    Object.assign(this,{onStatus,onTranscript,onAudio,onState});
    this.generation=0;this.stream=null;this.recorder=null;this.recognition=null;this.url=null;this.timer=null;this.pending=false;
  }
  supported(){return !!(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);}
  recognitionSupported(){return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);}
  async start(transcribe=false) {
    if(this.pending || this.recorder?.state==='recording')return;
    if(!this.supported()){this.onStatus('Nagrywanie nie jest dostępne w tej przeglądarce. Odpowiedz na głos i wpisz tekst ręcznie.');return;}
    this.cleanup();const generation=this.generation;this.pending=true;this.onState(true);this.onStatus('Czekam na zgodę na użycie mikrofonu…');
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;this.pending=false;
      const recorder=new MediaRecorder(stream);this.recorder=recorder;const chunks=[];
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop());
        if(generation!==this.generation)return;
        this.recorder=null;this.stream=null;clearTimeout(this.timer);this.onState(false);
        const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||'audio/webm'});
        if(blob.size){this.url=URL.createObjectURL(blob);this.onAudio(this.url);}
        this.onStatus('Nagranie zakończone. Odsłuchaj odpowiedź; jej tekst możesz zapisać w lekcji.');
      };
      recorder.onerror=()=>{this.stop();this.onStatus('Nie udało się nagrać odpowiedzi. Spróbuj ponownie albo wpisz tekst.');};
      recorder.start();this.onStatus('Nagrywanie… Zatrzymaj po odpowiedzi (limit 2 minuty).');
      this.timer=setTimeout(()=>this.stop(),120000);
      if(transcribe && this.recognitionSupported()){
        const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
        const recognition=new Recognition();this.recognition=recognition;
        recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=false;
        recognition.onresult=event=>{
          if(generation!==this.generation)return;
          const text=Array.from(event.results).filter(r=>r.isFinal).map(r=>r[0].transcript).join(' ');
          this.onTranscript(text.slice(0,3000));
        };
        recognition.onerror=()=>{if(generation===this.generation)this.onStatus('Transkrypcja jest niedostępna. Nagranie trwa; po odsłuchu możesz wpisać odpowiedź.');};
        recognition.onend=()=>{if(this.recognition===recognition)this.recognition=null;};
        try{recognition.start();}catch{recognition.onerror();}
      }
    }catch(error){if(generation!==this.generation)return;this.cleanup();this.onStatus(error.name==='NotAllowedError'?'Brak zgody na mikrofon. Zmień uprawnienia witryny lub wpisz odpowiedź.':'Mikrofon jest niedostępny. Sprawdź urządzenie lub wpisz odpowiedź.');}
  }
  stop(){
    if(this.pending){this.cleanup();return;}
    clearTimeout(this.timer);
    try{this.recognition?.stop();}catch{}
    if(this.recorder?.state==='recording')this.recorder.stop();
    this.stream?.getTracks().forEach(track=>track.stop());
  }
  cleanup(){
    this.generation++;clearTimeout(this.timer);this.pending=false;
    try{this.recognition?.abort();}catch{}this.recognition=null;
    if(this.recorder?.state==='recording')this.recorder.stop();this.recorder=null;
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;
    this.onAudio(null);this.onState(false);
  }
}
