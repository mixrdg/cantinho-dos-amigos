const express=require('express');const http=require('http');const cors=require('cors');const {WebSocketServer}=require('ws');const app=express();app.use(cors());app.use(express.json());const server=http.createServer(app);const wss=new WebSocketServer({server,path:'/ws'});const rooms=new Map();
function roomUsers(id){return [...rooms.values()].filter(x=>x.room===id).length}
app.get('/',(_,res)=>res.json({ok:true,name:'Cantinho dos Amigos API'}));
app.get('/api/rooms',(_,res)=>{const ids=[...new Set([...rooms.values()].map(x=>x.room))];res.json(ids.map(id=>({id,name:id,users:roomUsers(id)})))});
wss.on('connection',(ws,req)=>{const u=new URL(req.url,'http://localhost');const room=u.searchParams.get('room')||'geral';const name=u.searchParams.get('name')||'Visitante';ws.room=room;ws.name=name;rooms.set(ws,{room,name});broadcastCount(room);
ws.on('message',raw=>{try{const m=JSON.parse(raw);if(m.type==='chat')broadcast(room,{type:'chat',name:ws.name,text:String(m.text||'').slice(0,300)})}catch{}});
ws.on('close',()=>{rooms.delete(ws);broadcastCount(room)})});
function broadcast(room,msg){for(const [ws,u] of rooms)if(u.room===room&&ws.readyState===1)ws.send(JSON.stringify(msg))}
function broadcastCount(room){broadcast(room,{type:'count',count:roomUsers(room)})}
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log(`Cantinho dos Amigos API em http://localhost:${PORT}`));