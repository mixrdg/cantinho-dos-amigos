# Cantinho dos Amigos — GitHub Pages + Render

Projeto com frontend estático no GitHub Pages e servidor Node.js/WebSocket no Render.

## URLs

Frontend:
https://mixrdg.github.io/cantinho-dos-amigos/

Backend esperado:
https://cantinho-dos-amigos.onrender.com

WebSocket:
wss://cantinho-dos-amigos.onrender.com/ws

## Deploy no Render

1. Conecte o repositório `mixrdg/cantinho-dos-amigos` ao Render.
2. Crie um Web Service chamado `cantinho-dos-amigos`.
3. Runtime: Node.
4. Build Command: `npm install`.
5. Start Command: `npm start`.
6. Health Check Path: `/health`.
7. Aguarde o serviço ficar `Live`.

O arquivo `render.yaml` também contém essa configuração.

## Importante

O frontend está configurado para usar o servidor Render em `https://cantinho-dos-amigos.onrender.com`. Se você escolher outro nome de serviço/URL, altere `SERVER_URL` no `app.js`.

## Funcionalidades

- salas públicas e privadas por código;
- chat em tempo real;
- câmera e microfone;
- compartilhamento de tela;
- WebRTC entre participantes;
- sinalização por WebSocket;
- endpoint `/health` para o Render.

Salas privadas são mantidas em memória e deixam de existir se o servidor reiniciar. Para produção, recomenda-se adicionar TURN para redes que não conseguem estabelecer WebRTC diretamente.


## Interface responsiva (nova versão)
- Tela cheia.
- Layout minimalista e responsivo para celular/desktop.
- Chat de acesso rápido; no celular abre como painel flutuante.
- Mensagens de entrada/saída passam no topo da direita para a esquerda.
- Som curto quando alguém entra ou sai da sala.


## Atualizações da interface
- Tela cheia real pelo botão "⛶ Tela cheia".
- Botão "💬 Chat" para abrir/fechar o chat em telas pequenas.
- Mensagens de chat recebidas aparecem no topo e percorrem da esquerda para a direita até desaparecer.
- Tema roxo, preto e azul.
- Seletor de emojis no chat.
- Layout responsivo para celular.
