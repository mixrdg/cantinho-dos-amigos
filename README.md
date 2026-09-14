# Cantinho dos Amigos — versão final

Sala de vídeo/áudio em tempo real com WebRTC + WebSocket, chat e salas privadas com código único.

## 1. Rodar localmente

Requer Node.js 20+.

```bash
npm install
npm start
```

Abra `http://localhost:10000`.

Para testar WebRTC com outras pessoas, use HTTPS/WSS em produção ou dois navegadores no mesmo computador para teste local.

## 2. Deploy no Render

Crie um Web Service apontando para este projeto.
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Node: 20+

O servidor usa `process.env.PORT` automaticamente.

## 3. Salas privadas

Clique em **Criar sala privada**. O backend gera um código aleatório de 10 caracteres e cria a sala. O código não é listado publicamente; quem tiver o código/link consegue entrar.

As salas ficam em memória. Se o servidor reiniciar, as salas privadas antigas deixam de existir.

## 4. WebRTC

Cada participante mantém uma conexão WebRTC com os demais. O projeto permite que vários participantes compartilhem câmera/tela simultaneamente. Para redes restritivas, adicione um servidor TURN (ex.: coturn) à lista `iceServers` em `app.js`.
