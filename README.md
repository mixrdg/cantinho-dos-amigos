# Cantinho dos Amigos — GitHub Pages + Render

Projeto preparado para usar:

- **Frontend:** GitHub Pages — `https://mixrdg.github.io/cantinho-dos-amigos/`
- **Backend:** Render — `https://cantinho-dos-amigos.onrender.com`
- **WebSocket:** `wss://cantinho-dos-amigos.onrender.com/ws`

## 1. Publicar o backend no Render

No Render, crie um **Web Service** conectado ao repositório `mixrdg/cantinho-dos-amigos`.

Configuração:

- Runtime: **Node**
- Build Command: `npm install`
- Start Command: `npm start`
- Plano: **Free** (para começar)
- Health Check Path: `/health`

O arquivo `render.yaml` também deixa essas configurações registradas no projeto.

### Teste do servidor

Depois que o serviço ficar como **Live**, abra:

`https://cantinho-dos-amigos.onrender.com/health`

O resultado esperado é JSON com `ok: true` e `status: "online"`.

## 2. Frontend no GitHub Pages

O `app.js` deste pacote já está configurado para conversar com:

`https://cantinho-dos-amigos.onrender.com`

e com o WebSocket:

`wss://cantinho-dos-amigos.onrender.com/ws`

Portanto, depois de substituir os arquivos do repositório e aguardar o GitHub Pages atualizar, o endereço público continua:

`https://mixrdg.github.io/cantinho-dos-amigos/`

## 3. Funcionalidades

- Salas com código
- Criação de sala privada
- Chat em tempo real
- Câmera e microfone
- Compartilhamento de tela
- Vários participantes na mesma sala
- WebRTC para mídia entre participantes
- Sinalização por WebSocket
- Link da sala para compartilhar

## 4. Importante sobre WebRTC

O projeto usa STUN público para descoberta de rede. Algumas redes corporativas, móveis ou com NAT restritivo podem exigir um servidor TURN para conexão de mídia mais confiável.

As salas e seus códigos são mantidos em memória no servidor. Se o serviço reiniciar, as salas vazias deixam de existir.

## 5. Desenvolvimento local

```bash
npm install
npm start
```

Abra `http://localhost:10000`.

Para desenvolvimento local, altere temporariamente `SERVER_URL` no `app.js` para:

`http://localhost:10000`

Antes de publicar novamente no GitHub Pages, volte para:

`https://cantinho-dos-amigos.onrender.com`
