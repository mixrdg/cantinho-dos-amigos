const params = new URLSearchParams(location.search);
const state = {
  id:null,name:"",room:"",ws:null,
  localTracks:new Map(), // kind -> MediaStreamTrack
  localStreams:new Map(), // screen/camera/mic stream ownership
  peers:new Map(), tiles:new Map(), makingOffer:new Set(), pendingIce:new Map()
};
const $=id=>document.getElementById(id);
const RTC_CONFIG={iceServers:[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"}
]};
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
const SERVER_URL="https://cantinho-dos-amigos.onrender.com";
function wsUrl(){return SERVER_URL.replace(/^http/,"ws")+"/ws";}
function apiUrl(path){return SERVER_URL+path;}
function send(data){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(data));}
function system(t){$("messages").insertAdjacentHTML("beforeend",`<div class="system">${esc(t)}</div>`);$("messages").scrollTop=$("messages").scrollHeight;}
function chat(n,t){$("messages").insertAdjacentHTML("beforeend",`<div class="message"><b>${esc(n)}</b><p>${esc(t)}</p></div>`);$("messages").scrollTop=$("messages").scrollHeight;}
function updateCount(n){$("count").textContent=`${n} online`;}
function mediaStream(){const tracks=[...state.localTracks.values()];return tracks.length?new MediaStream(tracks):null;}
function makeTile(id,name,stream,local=false){
  let item=state.tiles.get(id);
  if(!item){
    const tile=document.createElement("div");tile.className="tile";tile.id=`tile-${id}`;
    tile.innerHTML=`<video autoplay playsinline ${local?"muted":""}></video><div class="name">${esc(name)}${local?" (você)":""}</div>${local?'<div class="badge">VOCÊ</div>':''}`;
    $("grid").appendChild(tile);item={tile,video:tile.querySelector("video"),name};state.tiles.set(id,item);
  }
  item.video.srcObject=stream;
  item.video.autoplay=true;
  item.video.playsInline=true;
  item.video.setAttribute("playsinline","");
  item.video.setAttribute("webkit-playsinline","");
  // Em celulares, alguns navegadores bloqueiam autoplay quando o stream tem áudio.
  // Tentamos tocar normalmente e, se bloqueado, iniciamos a reprodução visualmente mutada.
  const playVideo=()=>{
    const p=item.video.play();
    if(p&&typeof p.catch==="function")p.catch(()=>{
      item.video.muted=true;
      const retry=item.video.play();
      if(retry&&typeof retry.catch==="function")retry.catch(()=>{});
    });
  };
  if(item.video.readyState>=2)playVideo();
  else item.video.onloadedmetadata=playVideo;
  $("empty").style.display="none";
  return item.video;
}
function removeTile(id){const x=state.tiles.get(id);if(x){x.tile.remove();state.tiles.delete(id);}if(state.tiles.size===0)$("empty").style.display="block";}
function refreshLocalTile(){const stream=mediaStream();if(stream)makeTile(state.id,state.name,stream,true);else removeTile(state.id);}

async function createPeer(peerId){
  if(peerId===state.id)return null;
  if(state.peers.has(peerId))return state.peers.get(peerId);
  const pc=new RTCPeerConnection(RTC_CONFIG);
  state.peers.set(peerId,pc);
  // Sempre recebemos vídeo/áudio, mesmo antes de alguém transmitir.
  pc.addTransceiver("video",{direction:"recvonly"});
  pc.addTransceiver("audio",{direction:"recvonly"});
  for(const track of state.localTracks.values()){
    pc.addTrack(track,mediaStream());
  }
  pc.onicecandidate=e=>{if(e.candidate)send({type:"ice",to:peerId,candidate:e.candidate});};
  pc.ontrack=e=>{
    let stream=e.streams[0];
    if(!stream){stream=new MediaStream([e.track]);}
    const existing=state.tiles.get(peerId)?.video?.srcObject;
    if(existing && existing instanceof MediaStream){if(!existing.getTracks().includes(e.track))existing.addTrack(e.track);stream=existing;}
    makeTile(peerId,"Participante",stream,false);
  };
  pc.onconnectionstatechange=()=>{
    if(["failed","closed"].includes(pc.connectionState)){pc.close();state.peers.delete(peerId);removeTile(peerId);}
  };
  pc.onnegotiationneeded=async()=>{
    // Apenas o peer com menor ID inicia renegociação, evitando glare.
    if(state.id>peerId)return;
    if(state.makingOffer.has(peerId))return;
    try{state.makingOffer.add(peerId);await pc.setLocalDescription(await pc.createOffer());send({type:"offer",to:peerId,description:pc.localDescription});}
    catch(e){}finally{state.makingOffer.delete(peerId);}
  };
  return pc;
}
async function negotiate(peerId){const pc=await createPeer(peerId);if(!pc||state.id>peerId)return;try{await pc.setLocalDescription(await pc.createOffer());send({type:"offer",to:peerId,description:pc.localDescription});}catch(e){}}
async function addLocalTrack(track,stream){
  const old=state.localTracks.get(track.kind);
  if(old)old.stop();
  state.localTracks.set(track.kind,track);state.localStreams.set(track.kind,stream);
  track.onended=()=>{if(state.localTracks.get(track.kind)===track){state.localTracks.delete(track.kind);state.localStreams.delete(track.kind);refreshLocalTile();renegotiateAll();}};
  refreshLocalTile();
  for(const [id,pc] of state.peers){
    const sender=pc.getSenders().find(s=>s.track?.kind===track.kind);
    if(sender)await sender.replaceTrack(track); else pc.addTrack(track,mediaStream());
  }
  await renegotiateAll();
}
async function renegotiateAll(){for(const id of state.peers.keys())await negotiate(id);}
async function startCamera(){
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){
    system("Câmera e microfone precisam de HTTPS e de um navegador compatível. Abra pelo endereço HTTPS do site.");
    alert("A câmera e o microfone só funcionam em HTTPS (ou localhost). Abra o Cantinho dos Amigos pelo endereço HTTPS.");
    return;
  }
  try{
    // Pede câmera e microfone juntos após um clique do usuário.
    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}
    });
    const video=stream.getVideoTracks()[0];
    const audio=stream.getAudioTracks()[0];
    if(video) await addLocalTrack(video,stream);
    if(audio) await addLocalTrack(audio,stream);
    if(video) $("camera").classList.add("active");
    if(audio) { audio.enabled=true; $("mic").classList.add("active"); }
    if(!video && !audio) throw new Error("Nenhum dispositivo de mídia foi disponibilizado.");
    system(video&&audio?"Câmera e microfone ativados.":video?"Câmera ativada. O microfone não foi disponibilizado.":"Microfone ativado. A câmera não foi disponibilizada.");
  }catch(e){
    console.error("getUserMedia:",e);
    const name=e?.name||"";
    let msg="Não foi possível acessar câmera/microfone.";
    if(name==="NotAllowedError"||name==="PermissionDeniedError") msg="Permissão negada. Clique no cadeado do navegador → permita Câmera e Microfone → recarregue a página e tente novamente.";
    else if(name==="NotFoundError"||name==="DevicesNotFoundError") msg="Nenhuma câmera ou microfone foi encontrado no dispositivo.";
    else if(name==="NotReadableError"||name==="TrackStartError") msg="A câmera ou o microfone está sendo usado por outro programa. Feche Zoom, Teams, Meet, OBS ou outro aplicativo e tente novamente.";
    else if(name==="OverconstrainedError") msg="As configurações solicitadas não são compatíveis com o dispositivo. Tente novamente.";
    else if(name==="SecurityError") msg="O navegador bloqueou o acesso por segurança. Use o site em HTTPS.";
    system(msg);
    alert(msg);
  }
}

async function startScreen(){
  try{const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});await addLocalTrack(stream.getVideoTracks()[0],stream);const a=stream.getAudioTracks()[0];if(a)await addLocalTrack(a,stream);$("screen").classList.add("active");system("Sua tela está sendo compartilhada com a sala.");}
  catch(e){system("Compartilhamento de tela cancelado.");}
}
function stopMedia(){
  for(const track of state.localTracks.values())track.stop();
  state.localTracks.clear();state.localStreams.clear();refreshLocalTile();
  $("screen").classList.remove("active");$("camera").classList.remove("active");$("mic").classList.remove("active");
  for(const pc of state.peers.values())for(const sender of pc.getSenders())if(sender.track)sender.replaceTrack(null).catch(()=>{});
  renegotiateAll();
}
async function toggleMic(){
  let track=state.localTracks.get("audio");
  if(!track){
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia){
      system("O microfone precisa de HTTPS e de permissão do navegador.");
      return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      track=stream.getAudioTracks()[0];
      if(track) await addLocalTrack(track,stream);
    }catch(e){
      console.error("getUserMedia audio:",e);
      const msg=(e?.name==="NotAllowedError"||e?.name==="PermissionDeniedError")
        ?"Permissão do microfone negada. Clique no cadeado do navegador e permita o Microfone."
        :"Não foi possível acessar o microfone. Verifique se ele está conectado e não está sendo usado por outro programa.";
      system(msg); alert(msg); return;
    }
  }
  if(track){
    track.enabled=!track.enabled;
    $("mic").classList.toggle("active",track.enabled);
    system(track.enabled?"Microfone ligado.":"Microfone desligado.");
  }
}
async function handle(m){
  if(m.type==="welcome"){
    state.id=m.id;$("roomLabel").textContent=m.room;updateCount(m.count);system(`Você entrou como ${m.name}.`);
    for(const p of m.peers){await createPeer(p.id);if(state.id<p.id)await negotiate(p.id);}return;
  }
  if(m.type==="peer-joined"){updateCount(m.count);system(`${m.name} entrou na sala.`);await createPeer(m.id);if(state.id<m.id)await negotiate(m.id);return;}
  if(m.type==="peer-left"){updateCount(m.count);system(`${m.name} saiu da sala.`);const pc=state.peers.get(m.id);if(pc)pc.close();state.peers.delete(m.id);removeTile(m.id);return;}
  if(m.type==="offer"){
    const pc=await createPeer(m.from);
    try{await pc.setRemoteDescription(m.description);for(const c of state.pendingIce.get(m.from)||[])await pc.addIceCandidate(c);state.pendingIce.delete(m.from);await pc.setLocalDescription(await pc.createAnswer());send({type:"answer",to:m.from,description:pc.localDescription});}catch(e){}return;
  }
  if(m.type==="answer"){const pc=state.peers.get(m.from);if(pc)try{await pc.setRemoteDescription(m.description);}catch(e){}return;}
  if(m.type==="ice"){const pc=await createPeer(m.from);try{if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);else{if(!state.pendingIce.has(m.from))state.pendingIce.set(m.from,[]);state.pendingIce.get(m.from).push(m.candidate);}}catch(e){}return;}
  if(m.type==="chat"){ chat(m.name,m.text); showTopMessage(`${m.name}: ${m.text}`); return; }
  if(m.type==="error")system(m.message);
}
function connect(){
  try{
    state.ws=new WebSocket(wsUrl());
    state.ws.onopen=()=>{
      $("status").textContent="Servidor online";
      $("join").style.display="flex";
      system("Servidor conectado. Você já pode entrar ou criar uma sala privada.");
    };
    state.ws.onmessage=e=>{try{handle(JSON.parse(e.data));}catch(err){console.error(err);}};
    state.ws.onclose=()=>{
      $("status").textContent="Servidor offline";
      system("Servidor desconectado. Confira o Render e tente novamente.");
    };
    state.ws.onerror=()=>{
      $("status").textContent="Erro no servidor";
    };
  }catch(e){
    $("status").textContent="Erro no servidor";
  }
}

async function createPrivateRoom(){
  try{
    const r=await fetch(apiUrl("/api/rooms/create"),{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    const data=await r.json();if(!r.ok||!data.room)throw new Error();
    const url=`${location.origin}${location.pathname}?room=${encodeURIComponent(data.room)}`;
    history.replaceState(null,"",`?room=${encodeURIComponent(data.room)}`);$("room").value=data.room;system(`Sala privada criada: ${data.room}`);
    await navigator.clipboard?.writeText(url).catch(()=>{});
    alert(`Sala privada criada!\n\nCódigo: ${data.room}\n\nO link foi copiado quando permitido pelo navegador.`);
  }catch(e){alert("Não foi possível criar a sala privada. Verifique se o servidor está online.");}
}
$("joinBtn").onclick=()=>{const name=$("name").value.trim()||"Convidado";const room=$("room").value.trim().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32);if(room.length<3)return alert("Use pelo menos 3 caracteres na sala.");state.name=name;state.room=room;localStorage.setItem("ca_name",name);history.replaceState(null,"",`?room=${encodeURIComponent(room)}`);if(state.ws?.readyState!==WebSocket.OPEN){alert("O servidor ainda não está conectado. Abra o Render, aguarde o status Live e tente novamente.");return;}$("join").style.display="none";send({type:"join",room,name});};
$("createPrivate").onclick=createPrivateRoom;
$("name").value=localStorage.getItem("ca_name")||"";$("room").value=params.get("room")||"";
$("camera").onclick=startCamera;$("screen").onclick=startScreen;$("stop").onclick=stopMedia;$("mic").onclick=toggleMic;
$("copyLink").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);system("Link da sala copiado.");}catch{prompt("Copie o link:",location.href);}};
$("chatForm").onsubmit=e=>{e.preventDefault();const i=$("message"),t=i.value.trim();if(t){send({type:"chat",text:t});i.value="";}};
window.addEventListener("beforeunload",()=>{for(const pc of state.peers.values())pc.close();for(const t of state.localTracks.values())t.stop();});
connect();

/* Responsive extras: fullscreen, top ticker, room entry/exit sounds and mobile chat */
const caTicker=document.getElementById("messageTickerText");let caTickerTimer;
function showTopMessage(text){if(!caTicker)return;caTicker.textContent=text;caTicker.classList.remove("play");void caTicker.offsetWidth;caTicker.classList.add("play");clearTimeout(caTickerTimer);caTickerTimer=setTimeout(()=>caTicker.classList.remove("play"),7200)}
let caAudioCtx=null;
function caSound(kind="in"){try{if(!caAudioCtx)caAudioCtx=new(window.AudioContext||window.webkitAudioContext)();if(caAudioCtx.state==="suspended")caAudioCtx.resume();const n=caAudioCtx.currentTime,o=caAudioCtx.createOscillator(),g=caAudioCtx.createGain();o.type="sine";o.frequency.setValueAtTime(kind==="in"?740:420,n);o.frequency.exponentialRampToValueAtTime(kind==="in"?1040:260,n+.12);g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(.055,n+.015);g.gain.exponentialRampToValueAtTime(.0001,n+.16);o.connect(g);g.connect(caAudioCtx.destination);o.start(n);o.stop(n+.17)}catch(_){}}
function caEnableAudio(){try{if(!caAudioCtx)caAudioCtx=new(window.AudioContext||window.webkitAudioContext)();if(caAudioCtx.state==="suspended")caAudioCtx.resume()}catch(_){}}
["click","touchstart","keydown"].forEach(e=>document.addEventListener(e,caEnableAudio,{once:true,passive:true}));
const caFullscreen=document.getElementById("fullscreen");
const caVideoArea=document.getElementById("grid");
if(caFullscreen&&caVideoArea){caFullscreen.addEventListener("click",async()=>{try{if(!document.fullscreenElement)await caVideoArea.requestFullscreen();else await document.exitFullscreen()}catch(_){showTopMessage("Não foi possível colocar o vídeo em tela cheia.")}});document.addEventListener("fullscreenchange",()=>caFullscreen.textContent=document.fullscreenElement===caVideoArea?"✕ Sair da tela cheia":"⛶ Tela cheia")}
const caChatToggle=document.getElementById("chatToggle"),caChatPanel=document.getElementById("chatPanel")||document.querySelector(".chat-panel")||document.querySelector(".chat");
if(caChatToggle&&caChatPanel)caChatToggle.addEventListener("click",()=>{caChatPanel.classList.toggle("chat-open");if(caChatPanel.classList.contains("chat-open")){const i=caChatPanel.querySelector("input,textarea");if(i&&matchMedia("(max-width:800px)").matches)i.focus()}});
if(typeof window.system==="function"){const caOriginalSystem=window.system;window.system=function(text,...rest){caOriginalSystem.call(this,text,...rest);if(typeof text==="string"&&/(entrou|saiu|deixou a sala)/i.test(text)){showTopMessage(text);caSound(/saiu|deixou/i.test(text)?"out":"in")}}}
const caObserver=new MutationObserver(ms=>{for(const m of ms)for(const node of m.addedNodes||[]){if(!(node instanceof HTMLElement))continue;const t=(node.innerText||node.textContent||"").trim();if(t&&t.length<180&&/(entrou|saiu|deixou a sala)/i.test(t)){showTopMessage(t);caSound(/saiu|deixou/i.test(t)?"out":"in")}}});
caObserver.observe(document.body,{childList:true,subtree:true});

/* Emojis + mensagens recebidas no ticker */
const caEmoji=document.getElementById("emojiButton"),caInput=document.getElementById("message")||document.getElementById("chatInput")||document.querySelector(".chat input")||document.querySelector(".chat textarea");
if(caEmoji&&caInput){const p=document.createElement("div");p.className="emoji-picker";["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫡","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","👏","🙌","👐","🤲","🙏","💪","🫶","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","🔥","✨","⭐","🌟","💫","💥","🎉","🎊","🎈","🎁","🏆","🥇","⚽","🏀","🎮","🎵","🎶","🎸","🎬","📸","🚀","✈️","🌎","☀️","🌙","☁️","🌈","🍕","🍔","🍟","🌭","🍎","🍓","🍉","🍌","🍇","🍺","☕","🍻","😈","👿","💀","☠️","👻","👽","🤖","💯","✅","❌","⚡","💡","🔔","💬","📌","🎯","🛡️"].forEach(e=>{const b=document.createElement("button");b.type="button";b.className="emoji-choice";b.textContent=e;b.onclick=()=>{const a=caInput.selectionStart??caInput.value.length,z=caInput.selectionEnd??caInput.value.length;caInput.value=caInput.value.slice(0,a)+e+caInput.value.slice(z);caInput.focus();caInput.setSelectionRange(a+e.length,a+e.length);p.classList.remove("open")};p.appendChild(b)});document.body.appendChild(p);caEmoji.onclick=()=>{const r=caEmoji.getBoundingClientRect();p.style.left=Math.min(Math.max(8,r.left),Math.max(8,window.innerWidth-p.offsetWidth-8))+"px";p.style.top=Math.min(Math.max(8,r.top-p.offsetHeight-8),Math.max(8,window.innerHeight-p.offsetHeight-8))+"px";p.classList.toggle("open")}}
