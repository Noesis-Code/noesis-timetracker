// usage: node cdp.js <port> <uid> <outPrefix> <W> <H> <steps json>
const {spawn}=require('child_process');const fs=require('fs');
const [,, port, uid, out, W, H, stepsJson]=process.argv;
const steps=JSON.parse(stepsJson&&stepsJson[0]==='@'?fs.readFileSync(stepsJson.slice(1),'utf8'):(stepsJson||'[]'));
(async()=>{
const ud=fs.mkdtempSync(require('os').tmpdir()+'/chr-');
const ch=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9333','--user-data-dir='+ud,'--no-first-run','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,3000));
const tabs=await (await fetch('http://127.0.0.1:9333/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend={};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method=="Runtime.exceptionThrown")console.log("EXC",JSON.stringify(m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description||m.params.exceptionDetails.text).slice(0,300));if(m.id&&pend[m.id]){pend[m.id](m.result||m.error);delete pend[m.id];}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});return r.result&&r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:+W,height:+H,deviceScaleFactor:2,mobile:true});
if(process.env.SAFE){await send('Emulation.setSafeAreaInsetsOverride',{insets:(process.env.SAFEL?{top:0,bottom:21,left:47,right:47}:{top:47,bottom:34,left:0,right:0})});await send('Emulation.setEmulatedMedia',{features:[{name:'display-mode',value:'standalone'}]});}
await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'standalone',{get:()=>true});"});
const base='http://localhost:'+port;
await send('Page.navigate',{url:base+'/'});await sleep(1500);
await ev("fetch(\"/api/profile/"+uid+"/verify-pin\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({pin:\"1234\"})}).then(r=>r.json()).then(p=>localStorage.setItem(\"noesis_profile\",JSON.stringify(p)))");
await send('Page.navigate',{url:base+'/'});await sleep(3000);
let n=0;
for(const s of steps){
  if(s.js){const r=await ev(s.js);if(r!==undefined)console.log('js:',JSON.stringify(r));}
  if(s.tap){const pt=await ev(s.tap);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pt[0],y:pt[1]}]});if(s.jitter){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pt[0]+s.jitter,y:pt[1]+s.jitter}]});await sleep(80);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});console.log('tap',JSON.stringify(pt));}
  if(s.wait)await sleep(s.wait);
  if(s.shot){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'-'+s.shot+'.png',Buffer.from(r.data,'base64'));}
}
ch.kill();
process.exit(0);
})();
