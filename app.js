const BACKEND_URL = "https://cantinho-dos-amigos-1.onrender.com";
const WS_URL = "wss://https://cantinho-dos-amigos-1.onrender.com/ws";
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
function wsUrl(){const p=location.protocol==="https:"?"wss:":"ws:";return `${p}//${location.host}/ws`;}
function apiUrl(path){return path;}
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
  try{const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});await addLocalTrack(stream.getVideoTracks()[0],stream);await addLocalTrack(stream.getAudioTracks()[0],stream);$("camera").classList.add("active");$("mic").classList.add("active");system("Câmera e microfone ativados.");}
  catch(e){system("Não foi possível acessar câmera/microfone. Verifique as permissões do navegador.");}
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
  if(!track){await startCamera();track=state.localTracks.get("audio");}
  if(track){track.enabled=!track.enabled;$("mic").classList.toggle("active",track.enabled);}
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
  if(m.type==="chat")return chat(m.name,m.text);
  if(m.type==="error")system(m.message);
}
function connect(){
  state.ws=new WebSocket(wsUrl());
  state.ws.onopen=()=>{$("status").textContent="Online";$("join").style.display="flex";};
  state.ws.onmessage=e=>{try{handle(JSON.parse(e.data));}catch(err){console.error(err);}};
  state.ws.onclose=()=>{$("status").textContent="Desconectado";system("Conexão encerrada. Recarregue a página para tentar novamente.");};
  state.ws.onerror=()=>{$("status").textContent="Erro de conexão";};
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
$("joinBtn").onclick=()=>{const name=$("name").value.trim()||"Convidado";const room=$("room").value.trim().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32);if(room.length<3)return alert("Use pelo menos 3 caracteres na sala.");state.name=name;state.room=room;localStorage.setItem("ca_name",name);history.replaceState(null,"",`?room=${encodeURIComponent(room)}`);$("join").style.display="none";send({type:"join",room,name});};
$("createPrivate").onclick=createPrivateRoom;
$("name").value=localStorage.getItem("ca_name")||"";$("room").value=params.get("room")||"";
$("camera").onclick=startCamera;$("screen").onclick=startScreen;$("stop").onclick=stopMedia;$("mic").onclick=toggleMic;
$("copyLink").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);system("Link da sala copiado.");}catch{prompt("Copie o link:",location.href);}};
$("chatForm").onsubmit=e=>{e.preventDefault();const i=$("message"),t=i.value.trim();if(t){send({type:"chat",text:t});i.value="";}};
window.addEventListener("beforeunload",()=>{for(const pc of state.peers.values())pc.close();for(const t of state.localTracks.values())t.stop();});
connect();
