# Deploy — PC da expedição (rodando 24/7, TV via HDMI)

Este guia configura o painel pra rodar sozinho, sem supervisão, no PC que fica
ligado na TV da expedição.

## 1. Copiar o projeto pra esse PC

Copie a pasta inteira `Dashboard Expedição` (com o arquivo `.env` incluso —
ele já tem as credenciais configuradas, não precisa preencher de novo) pro PC
da expedição. Pode ser por pendrive, pasta de rede compartilhada, ou
qualquer jeito que você já usa pra transferir arquivos entre as máquinas.

**Não copie** a pasta `node_modules` nem `.browser-profile` (se existirem) —
são geradas de novo no passo seguinte.

## 2. Instalar o Node.js

Baixe e instale a versão LTS: https://nodejs.org/pt (marque a opção padrão
de instalação, não precisa mexer em nada).

Confirme no terminal (PowerShell):
```powershell
node --version
```

## 3. Instalar as dependências do projeto

Abra o PowerShell na pasta do projeto e rode:
```powershell
npm install
```

Confirme que o **Microsoft Edge** está instalado nesse PC (normalmente já
vem instalado no Windows 10/11) — é ele que a automação do "Fechado" usa.

## 4. Testar uma vez, manualmente

```powershell
npm start
```

Abra `http://localhost:3000` no navegador desse PC e confira se o painel
carrega com dados reais. Se funcionar, feche com `Ctrl+C` e siga pro próximo
passo (deixar rodando sozinho).

## 5. Deixar o servidor rodando sempre (com reinício automático)

Instale o PM2, que mantém o processo vivo e reinicia sozinho se cair:
```powershell
npm install -g pm2
pm2 start src/server.mjs --name dashboard-expedicao
pm2 save
```

Configure o PM2 pra iniciar junto com o Windows:
```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

Comandos úteis depois:
```powershell
pm2 status                        # ver se está rodando
pm2 logs dashboard-expedicao      # ver o log ao vivo
pm2 restart dashboard-expedicao   # reiniciar manualmente
```

## 6. Abrir o navegador em tela cheia (kiosk) automaticamente

Crie um atalho com este destino (ajuste o caminho do Edge se for diferente):
```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen --no-first-run
```

Coloque esse atalho na pasta de inicialização do Windows, pra abrir sozinho
ao ligar o PC:
1. Pressione `Win + R`, digite `shell:startup`, Enter.
2. Cole o atalho criado nessa pasta.

**Sair do modo kiosk** (se precisar mexer depois): `Alt + F4`.

## 7. Configurar o Windows pra não precisar de ninguém

- **Login automático** (pra não travar na tela de senha após queda de
  energia): Painel de Controle → Contas de Usuário → configurar login sem
  senha, ou usar `netplwiz` (`Win+R` → `netplwiz` → desmarcar "exigir
  usuário e senha").
- **Nunca dormir/desligar a tela**: Configurações → Sistema → Energia → tela
  e "suspender" = Nunca (quando ligado na tomada).
- **Reiniciar sozinho após queda de energia**: essa opção fica na BIOS/UEFI
  da placa-mãe (geralmente "Restore on AC Power Loss" ou "After Power
  Failure" → "Power On"). Varia por fabricante — se precisar, me chama que
  te ajudo a achar.

## 8. Conectar na TV

Cabo HDMI do PC pra TV, TV na entrada certa. Se a tela ficar cortada/com
bordas pretas, ajuste a resolução em Configurações → Sistema → Vídeo pra
bater com a resolução nativa da TV (geralmente 1920×1080).

---

Depois de tudo isso, o painel deve sobreviver a quedas de energia, reinícios
do Windows e travamentos do processo sozinho, sem precisar de ninguém mexer.
