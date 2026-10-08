import assert from 'node:assert/strict';
import {SpeakingRecorder} from '../static/js/speaking.js';
let stops=0,revoked=[],events=[],pending;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>pending=resolve)}}});
const stream=()=>({getTracks:()=>[{stop(){stops++;}}]});
class Recorder {
  constructor(){this.state='inactive';this.mimeType='audio/webm';Recorder.last=this;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.();}
}
globalThis.MediaRecorder=Recorder;
const realCreate=URL.createObjectURL,realRevoke=URL.revokeObjectURL;
URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=value=>revoked.push(value);
let audio,transcript;
const recorder=new SpeakingRecorder({onStatus:text=>events.push(text),onTranscript:text=>transcript=text,onAudio:value=>audio=value,onState:value=>events.push(value)});
try{
  const first=recorder.start();recorder.cleanup();pending(stream());await first;
  assert.equal(stops,1);assert.equal(recorder.stream,null);assert.equal(Recorder.last,undefined);
  console.log('PASS leaving while permission is pending stops any late microphone stream');
  const second=recorder.start();pending(stream());await second;assert.equal(Recorder.last.state,'recording');recorder.stop();assert.equal(audio,'blob:fixture');assert.ok(stops>=2);
  recorder.cleanup();assert.equal(audio,null);assert.deepEqual(revoked,['blob:fixture']);
  console.log('PASS recording stops tracks, provides temporary playback, then revokes its blob URL');
  class Recognition {constructor(){Recognition.last=this;}start(){}stop(){this.stopped=true;}abort(){this.aborted=true;}}
  globalThis.SpeechRecognition=Recognition;
  const third=recorder.start(false);pending(stream());await third;assert.equal(Recognition.last,undefined);recorder.cleanup();
  const fourth=recorder.start(true);pending(stream());await fourth;
  const result=Object.assign([{transcript:'I can clarify the risks.'}],{isFinal:true});
  Recognition.last.onresult({results:[result]});assert.equal(transcript,'I can clarify the risks.');
  const recognition=Recognition.last;recorder.cleanup();transcript='';recognition.onresult({results:[result]});assert.equal(transcript,'');assert.equal(recognition.aborted,true);
  console.log('PASS speech service only starts after opt-in; late transcription is ignored after leaving');
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});};
  await recorder.start();assert.equal(recorder.pending,false);assert.match(events.at(-1),/Brak zgody/);
  console.log('PASS microphone denial gives a usable manual-answer fallback');
}finally{recorder.cleanup();URL.createObjectURL=realCreate;URL.revokeObjectURL=realRevoke;delete globalThis.MediaRecorder;delete globalThis.SpeechRecognition;}
