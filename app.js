const API = 'https://cantinho-dos-amigos.onrender.com';
async function loadRooms(){
  const box=document.querySelector('#rooms');
  try{
    const r=await fetch(API+'/api/rooms'); const rooms=await r.json();
    box.innerHTML=rooms.length?rooms.map(x=>`<article class="room-card" onclick="location.href='sala.html?room=${encodeURIComponent(x.id)}'"><span class="live">● AO VIVO</span><h3>${escapeHtml(x.name)}</h3><p class="muted">👤 ${x.users} participante(s)</p></article>`).join(''):'<div class="empty">Nenhuma sala ativa. Crie a primeira!</div>';
  }catch(e){box.innerHTML='<div class="empty">Backend offline. Rode o servidor para listar as salas.</div>'}
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
document.querySelector('#joinBtn')?.addEventListener('click',()=>{const id=prompt('Digite o ID da sala:');if(id)location.href='sala.html?room='+encodeURIComponent(id)});
document.querySelector('#refreshBtn')?.addEventListener('click',loadRooms);loadRooms();
