# Handoff — Dashboard Expedição + tarefas relacionadas

_Atualizado em 04/09/2026 (migração Vercel → GitHub Pages + Actions em 29/08, gatilho
externo cron-job.org e fix de timeout do workflow em 03-04/09, todos concluídos)._

---

## 1. Dashboard Expedição (projeto principal) — FUNCIONANDO, EM PRODUÇÃO

**🔴 Painel ao vivo (é isso que vai na TV):** https://arthurgip.github.io/expedicaodash/
*(link fica ativo depois do primeiro deploy do workflow — ver seção 1b)*

Painel fixo de expedição, focado no dia. Dois jeitos de rodar, mesmo código-fonte:
- **Produção (GitHub Pages + Actions)** — é o que está no ar agora, ver seção 1b. Migrado
  do Vercel em 29/08/2026 porque o projeto Vercel foi PAUSADO por estourar a cota gratuita
  de CPU ("Fluid Active CPU") do plano Hobby — o Playwright serverless rodando a cada 2min
  consumia demais. GitHub Actions + Pages é 100% gratuito pro uso deste projeto.
- **Local** — pra desenvolver/testar (`http://localhost:3000`), ver abaixo.

**Como rodar local:**
```bash
cd "Dashboard Expedição"
npm install          # se ainda não rodou
npm start             # sobe o servidor em localhost:3000
```
O servidor local sincroniza sozinho a cada 90s (`SYNC_INTERVAL_SECONDS` no `.env`).

**Estrutura:**
- `src/server.mjs` — Express, só serve `public/` (estático) — sem endpoint de API.
- `src/sync.mjs` — orquestra a sincronização periódica LOCAL (loop `setInterval`).
- `scripts/ci-sync.mjs` — roda o MESMO ciclo de sync UMA VEZ, pensado pro GitHub Actions
  (produção) — ver seção 1b.
- `src/buildScheduleReference.mjs` — monta a referência de corte/coleta (fixo +
  Mercado Livre ao vivo), compartilhado entre `sync.mjs` e `ci-sync.mjs`.
- `src/idworksClient.mjs` — REST puro do idworks (pedidos Enviado/Entregue).
- `src/idworksBrowserClient.mjs` — Playwright/navegador local (profile persistente) pra
  buscar "Fechado" (ver bug abaixo). Usado só por `sync.mjs` (dev local).
- `src/idworksBrowserClientServerless.mjs` — mesma coisa, mas sem profile persistente
  (loga do zero toda vez) — usado por `scripts/ci-sync.mjs` (GitHub Actions).
- `src/aggregate.mjs` — agregação: raias por data (Fechado) e "enviados hoje" (ver
  `trackDispatchedToday` — mudou de definição em 29/08/2026, seção abaixo).
- `src/scheduleConfig.mjs` — horários de corte/coleta fixos (Shopee, Shein, Temu, Tiktok, Nuvem Shop).
- `src/mlClient.mjs` — busca horário do Mercado Livre AO VIVO via API oficial (ver seção 3).
- `src/cache.mjs` — escreve `public/data/dashboard.json` (o "banco de dados" do painel —
  ver seção 1b) e persiste o estado de `trackDispatchedToday` (local e prod, arquivos
  separados de propósito).
- `public/` — frontend (index.html, dashboard.js, dashboard.css) + `data/dashboard.json`
  gerado pelo sync (git-ignorado local; nunca commitado, nem em produção — ver 1b).

**Painéis (nessa ordem, empilhados verticalmente):**
1. **Fechado** — pedidos aguardando envio, em RAIAS POR DATA (DT est. exp. = `ShippingEstimateHandlingLimitDate` do idworks). Raia "Atrasado" (vermelho) se tiver pedido com data passada, depois "Hoje", depois dias futuros. Dentro de cada raia, barras horizontais por canal/modalidade (cores aproximadas de cada marketplace). É o painel com mais espaço (prioridade do usuário).
2. **Enviados hoje** — comparação enviado vs. pendente por canal, com barra de progresso. Painel pequeno de propósito.
3. **Corte e coleta** — referência visual (ícones relógio/caminhão/moto), cada dia/modalidade numa linha própria, nunca mistura regras de dias diferentes.

**Bug importante já corrigido (Fechado retorna 0 via REST):** `GET /orders?IDStatusOrder=1` (Fechado) na API REST do idworks SEMPRE retorna 0, mesmo com pedidos reais. Confirmado testando byte-a-byte contra a chamada real da tela (mesmo token, mesma query, mesmos headers) — só funciona vindo de um navegador de verdade (SPA usa HTTP/2; fetch do Node usa HTTP/1.1). Contorno implementado: `idworksBrowserClient.mjs` usa Playwright pra abrir a tela de Pedidos e capturar a resposta real. Abre uma aba NOVA a cada ciclo (reaproveitar a mesma aba trava na 2ª busca — bug documentado também no projeto irmão "Rotina - Impressão de Pedidos").

**Bug corrigido em 29/08/2026 — pedidos do Mercado Livre (e Temu) apareciam "Atrasado" um dia
antes da hora:** `ShippingEstimateHandlingLimitDate` é uma DATA pura (sem horário real), mas
cada canal serializa esse instante de um jeito diferente — Shopee/Shein/Tiktok mandam
`23:59:59Z`, Mercado Livre manda `00:00:00Z`, Temu manda algo perto disso (`00:29:59Z`). O
código antigo convertia esse instante pro fuso de São Paulo (UTC-3) pra decidir a raia — isso
por coincidência dava certo pro formato `23:59:59Z`, mas pro `00:00:00Z`/`00:29:59Z` (ML/Temu)
subtrair 3h jogava a data pro dia anterior, fazendo pedidos do dia aparecerem como atrasados
(ou pedidos de amanhã aparecerem como se fossem hoje). Corrigido lendo o dia em UTC puro
(`utcDateKey` em `src/aggregate.mjs`) pra esse campo especificamente — os demais campos que
são instantes REAIS (ex: `ShippingDate`, usado no gráfico por hora) continuam convertendo
pro fuso de São Paulo normalmente.

**"Enviados hoje" mudou de definição em 29/08/2026:** antes contava pedidos com status
oficial "Enviado"/"Entregue" (`IDStatusOrder` 7/8) da idworks datados de hoje. Descoberto que
esse status só muda quando a transportadora/marketplace CONFIRMA o envio — pra Shopee/Shein
isso pode demorar horas ou dias, então um dia inteiro de despacho aparecia com só 3-4
pedidos no fim do dia (quase todos Mercado Livre). Redefinido pra contar pedidos que SOMEM do
backlog Fechado entre um ciclo de sync e outro (`trackDispatchedToday` em
`src/aggregate.mjs`) — reflete melhor o momento real do despacho no galpão. Tem uma guarda
contra falha de coleta do Playwright fazendo o backlog inteiro "sumir" de uma vez e inflar o
número por engano (ver comentário na função). Limitação conhecida: um pedido cancelado/
devolvido antes do despacho também conta como "despachado" (raro, não dá pra distinguir sem
consultar o pedido individualmente).

**Responsivo:** `html { font-size: clamp(...) }` com tudo em `rem` — a tela inteira reescala conforme o tamanho do monitor/TV.

**Pendências conhecidas:**
- Nome do motorista de coleta do Mercado Livre — API não expõe isso (campo vem vazio). Só entra se o usuário passar manualmente.
- Horário de corte/coleta de Shein, Temu, Tiktok, Nuvem Shop — não têm horário fixo (só prazo em dias), conforme informado pelo usuário.
- Login do navegador serverless (GitHub Actions) pode falhar ocasionalmente mesmo com retry — ver seção 1b, "Confiabilidade" (herdado do período Vercel, mesma lógica de retry).

---

## 1b. Deploy em produção (GitHub Pages + GitHub Actions) — FUNCIONANDO

**URL pública:** https://arthurgip.github.io/expedicaodash/
**Repositório:** https://github.com/arthurgip/expedicaodash (PÚBLICO — necessário pro
GitHub Pages gratuito no plano pessoal; sem isso só dá pra ter Pages privado no GitHub
Pro pago. Credenciais NUNCA vão pro repositório — ficam em GitHub Secrets, ver abaixo).

**Por que migrou do Vercel (29/08/2026):** o projeto Vercel foi PAUSADO automaticamente
por estourar a cota gratuita de "Fluid Active CPU" do plano Hobby (o Playwright
serverless rodando a cada 2min consumia demais). GitHub Actions + Pages não tem esse
tipo de cota pro uso deste projeto — é gratuito. Trade-off aceito: intervalo de
atualização caiu de ~2min pra ~5-10min (aprovado pelo usuário, painel de TV não precisa
de mais que isso).

### Arquitetura (parecida com a do Vercel — sem processo contínuo)

GitHub Actions também não mantém processo rodando nem disco persistente entre
execuções — mesma limitação do Vercel, resolvida de um jeito parecido:

- **`.github/workflows/dashboard.yml`** — workflow que roda a cada ~10min (`cron:
  '*/10 * * * *'`) e também em todo push na `main` (útil pra publicar rápido quando o
  código muda, não só esperar o próximo ciclo). Um job só (`sync-and-deploy`):
  1. `npm ci`
  2. `node scripts/ci-sync.mjs` — busca idworks REST + Playwright serverless pro
     Fechado + horário ML, grava `public/data/dashboard.json`.
  3. Commita `data/prod-dispatch-state.json` (estado do rastreamento de "enviados
     hoje" — ver seção 1) SE ele mudou, com `[skip ci]` na mensagem pra não disparar o
     workflow de novo sozinho (loop infinito).
  4. `actions/upload-pages-artifact` + `actions/deploy-pages` — publica `public/`
     (incluindo o `dashboard.json` recém-gerado) no GitHub Pages. **O
     `dashboard.json` em si NUNCA é commitado** — só existe no artefato do Pages, pra
     não poluir o histórico do git com um commit a cada ciclo.
- **`scripts/ci-sync.mjs`** — roda o ciclo de sync UMA VEZ (equivalente ao antigo
  `api/sync.mjs` do Vercel), usando as mesmas funções de `src/` que o `sync.mjs` local
  usa (`groupBacklog`, `trackDispatchedToday`, `buildScheduleReference`).
- **`src/idworksBrowserClientServerless.mjs`** — igual ao período Vercel: sem profile
  persistente (loga do zero toda vez), usa `playwright-core` + `@sparticuz/chromium`
  (não o `playwright` normal, que baixa um Chromium grande demais/incompatível).
  **Diferente de `idworksBrowserClient.mjs`** (versão local, com profile salvo em
  `.browser-profile/` e Edge do sistema).
- **Estado persistido:** como não tem Redis nem disco persistente, o estado do
  rastreamento de "enviados hoje" fica commitado no próprio repositório
  (`data/prod-dispatch-state.json`) — o workflow faz `git commit` + `git push` desse
  arquivo a cada ciclo em que ele mudou. É um arquivo pequeno (IDs de pedido + contagem
  por canal), sem PII.

### Confiabilidade do Playwright serverless (importante se voltar a falhar)

Mesma lógica herdada do período Vercel (o gargalo é o mesmo: CPU fria/compartilhada
deixando a SPA do idworks lenta pra carregar). Duas correções já aplicadas em
`idworksBrowserClientServerless.mjs`:
1. Espera o campo `#basic_email` aparecer com `waitFor` (30s), não `networkidle` (que
   não é confiável com SPAs) nem o timeout curto padrão do `fill()`.
2. `fetchFechadoOrdersServerless` tenta até 2x dentro da MESMA execução (reaproveita o
   browser já aberto, só troca a aba) antes de desistir.

Com isso, taxa de sucesso ficou em ~100% nos testes no Vercel (5/5 seguidos) — ainda não
testado especificamente nos runners do GitHub Actions, mas o ambiente é parecido
(container Linux compartilhado). Se voltar a falhar muito: aumentar `retries` em
`idworksBrowserClientServerless.mjs`. O erro mais comum observado foi
`net::ERR_INSUFFICIENT_RESOURCES` e timeout achando `#basic_email` com body vazio —
ambos indicam falta de CPU/memória pro Chromium renderizar a tempo, não bug de lógica.

### Gatilho externo (cron-job.org) — necessário além do `schedule` nativo

O `cron: '*/10 * * * *'` do workflow (seção acima) é o gatilho "oficial", mas na prática
o agendamento nativo do GitHub Actions se mostrou pouco confiável pra esse repositório —
em 29/08/2026 ficou **mais de 1h30 sem disparar sozinho** nenhuma vez, mesmo com tudo
configurado certo (`state: active`, permissões OK, sintaxe do cron OK). Não achamos causa
definitiva (é um comportamento documentado como possível pelo próprio GitHub, "pode
atrasar em períodos de carga alta", mas não tanto assim).

Contorno: um job no **cron-job.org** (mesma conta usada antes pro Vercel) chama
`POST /repos/arthurgip/expedicaodash/actions/workflows/dashboard.yml/dispatches` a cada
10min, com um Personal Access Token do usuário. Isso dispara o workflow via
`workflow_dispatch` de fora, independente do `schedule` nativo funcionar ou não (os dois
ficam ativos ao mesmo tempo — se o nativo disparar também, só gera um sync a mais,
inofensivo). Configuração do job cron-job.org:
```
URL:     https://api.github.com/repos/arthurgip/expedicaodash/actions/workflows/dashboard.yml/dispatches
Método:  POST
Headers: Authorization: token SEU_PAT_AQUI   (nao "Bearer" - o dispatch endpoint
                                               respondeu 401 com "Bearer", so aceitou
                                               com o prefixo "token")
         Accept: application/vnd.github+json
         Content-Type: application/json
Corpo:   {"ref":"main"}
Intervalo: 10 minutos
```
O PAT precisa dos escopos `repo` + `workflow`. Se expirar/for revogado, gerar um novo em
`github.com/settings/tokens` e atualizar o header no job do cron-job.org.

### Incidente: run travado em "waiting" bloqueando a fila (04/09/2026)

Um run ficou preso em status **"waiting"** por ~9h (06:20 às 15:10 UTC), com uma
`pending_deployment` pro ambiente `github-pages` **sem nenhum revisor configurado**
(`reviewers: []`, `current_user_can_approve: false` até pra quem tem admin) — ninguém
conseguia aprovar. Como o workflow só permite uma execução pendente por vez
(`concurrency: group: dashboard-sync`), TODAS as tentativas seguintes (dispatch nativo E
cron-job.org, de 10 em 10min) foram sendo canceladas em cascata atrás dessa travada, sem
nunca chegar a rodar de verdade — o painel ficou ~9h sem atualizar.

A política de branch do ambiente (`deployment-branch-policies`) permitia `main`
normalmente, e não existe regra de "required reviewers" configurada — parece ter sido um
glitch pontual do lado do GitHub, não uma configuração nossa errada.

**Fix quando acontecer de novo:** achar o run mais antigo com `status: waiting` (não
aparece com `--status in_progress`, precisa listar e olhar campo `status` de cada um) e
cancelar manualmente:
```bash
gh run list --repo arthurgip/expedicaodash --limit 60 --json databaseId,status,createdAt
# procurar o mais antigo com status "waiting"
gh run cancel <ID_DO_RUN_TRAVADO> --repo arthurgip/expedicaodash
```
Isso libera a fila na hora — o próximo run pendente passa a rodar normalmente. Sinal de
que isso está acontecendo: vários runs seguidos com `conclusion: cancelled` E `jobs: []`
(cancelados antes de sequer começar).

### Secrets do repositório GitHub

Configurados via `gh secret set NOME --repo arthurgip/expedicaodash` (CLI) ou pelo site
→ repositório → Settings → Secrets and variables → Actions.
```
IDWORKS_ACCOUNT, IDWORKS_EMAIL, IDWORKS_PASSWORD   (mesmas do .env local, obrigatórios)
ML_ACCESS_TOKEN, ML_USER_ID                         (opcionais — sem eles o painel usa o
                                                      horário fixo do ML; ver seção 3
                                                      pra token/reautorização)
```
Não precisa mais de `SYNC_SECRET` nem variáveis de Redis (`KV_REST_API_*`) — não existe
endpoint público de sync pra proteger, e o estado vive no próprio repositório.

### Redeploy (depois de mudar código)
Só dar push na branch `main` — o workflow já cuida do resto:
```bash
cd "Dashboard Expedição"
git add -A
git commit -m "sua mensagem"
git push
```
Ou disparar manualmente sem mudar código: aba **Actions** do repositório → workflow
"Sync dashboard e publicar no GitHub Pages" → **Run workflow**.

### Token do Mercado Livre em produção

Depois de trocar o `code` (seção 3) e gerar `data/ml-tokens.json` localmente, copiar
`access_token` e `user_id` de lá pros secrets do repositório:
```bash
gh secret set ML_ACCESS_TOKEN --repo arthurgip/expedicaodash --body "SEU_ACCESS_TOKEN"
gh secret set ML_USER_ID --repo arthurgip/expedicaodash --body "SEU_USER_ID"
```
Como não tem `refresh_token` (seção 3), isso precisa ser refeito a cada 6h pra manter o
horário do ML ao vivo em produção — sem isso, cai pro horário fixo automaticamente
(não quebra nada).

---

## 2. Credenciais (.env, não versionado)

```
IDWORKS_ACCOUNT=gip
IDWORKS_EMAIL=arthurgip2023@gmail.com
IDWORKS_PASSWORD=art21

ML_CLIENT_ID=4523762985355157
ML_CLIENT_SECRET=<no .env, não repetir aqui>
ML_REDIRECT_URI=https://httpbin.org/anything
```

Essas mesmas credenciais (IDWORKS_*) ficam também como GitHub Secrets do repositório
`arthurgip/expedicaodash` (ver seção 1b) — nunca commitadas.

---

## 3. Integração Mercado Livre (horário de corte/coleta AO VIVO) — FUNCIONA, MAS COM LIMITAÇÃO

**Endpoint usado:** `GET https://api.mercadolibre.com/users/{user_id}/shipping/schedule/cross_docking`
Devolve o cronograma real por dia da semana (corte + janela de coleta). Confirmado contra a conta real:
- Seg a Qui: corte 09:00, coleta 10:00–12:00
- Sexta: corte 09:45, coleta 10:45–12:45
- Sábado: corte 06:00, coleta 09:00–11:00
- Domingo: não trabalha

Isso é MAIS preciso do que o que o usuário tinha passado manualmente (achava que Seg-Sex era tudo igual; na verdade Sexta é diferente).

**⚠️ LIMITAÇÃO CRÍTICA: sem `refresh_token`.**
A autorização OAuth feita (fluxo manual: usuário abre link de auth, loga, copia o `code` da URL de redirect, eu troco por token) devolveu **só `access_token`** (válido 6h), **sem `refresh_token`**. Não sei ainda por quê — pode ser configuração do app no DevCenter, ou algo no fluxo. Isso significa: **depois de 6h, a busca ao vivo do ML falha e o painel cai pro horário fixo automaticamente** (não quebra nada, só para de atualizar). Pra reativar, tem que reautorizar manualmente de novo:

1. Abrir (no navegador do usuário, logado na conta ML): `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=4523762985355157&redirect_uri=https://httpbin.org/anything`
2. Copiar o `code` da resposta/URL (é de uso único e expira rápido — copiar e usar na hora).
3. Rodar: `node scripts/ml-oauth-exchange.mjs SEU_CODE_AQUI` (salva em `data/ml-tokens.json`, não versionado).

**Próximo passo sugerido:** investigar no DevCenter do ML se tem algum campo "offline access" ou escopo que precisa ser marcado pra vir o `refresh_token`. Não testado ainda.

**App ML:** já criado pelo usuário (Client ID acima). Permissão habilitada: "Venda e envios de um produto" = Leitura.

---

## 4. Catálogo de produtos (tarefa separada, à parte do dashboard)

O usuário pediu quantidade em estoque real (idworks) pra colar num catálogo de atacado no Canva
(`https://www.canva.com/design/DAHHySKSd6k/...`, título "CATALOGO ATACADO", 32 páginas: Básicos p3-15,
Listras p16-19, Ponchos p20-27, Plus Size p28-31, Informações p32).

**Status: CONCLUÍDO. Todas as páginas de produto têm os números de estoque colados e commitados
no Canva real (ver seção 5).**

Os 22 produtos originais do catálogo foram resolvidos contra o idworks (nome do catálogo → nome
real + estoque por cor) e entregues em `catalogo-estoque-completo.md` (na raiz do projeto). Alguns
nomes do catálogo são "apelidos" comerciais bem diferentes do nome real no idworks (ex: "PONCHO
BOTÃO" no catálogo = "PONCHO ROSILENE ... - Botão" no idworks; "GOLA ALTA" = "BLUSA TRICÔ HENRIQUE
GOLA ALTA").

**Descoberta durante a edição (seção 5):** as páginas 25-27 (seção Ponchos) mostravam um segundo
trio "Poncho Botão/Punho/Tradicional" com swatches diferentes do trio das páginas 21-24 — não é
duplicata, é uma linha de produto separada no idworks: **"PONCHO HENRIQUE ..."** (vs. "PONCHO
ROSILENE ..." dos itens 4/8/10). Não estava no `catalogo-estoque-completo.md` original porque não
tinha sido descoberta na varredura inicial. Dados buscados na hora (`GET /sku?Search=PONCHO
HENRIQUE&Simple=1`) e adicionados ao arquivo como itens 23-25. O arquivo agora tem 25 produtos no
total.

Todos os itens têm o nome real do idworks anotado entre parênteses no arquivo, pra rastreabilidade.

Se precisar atualizar de novo (estoque muda com o tempo), o padrão de busca é:
```js
// por nome (arriscado se ambíguo - sempre teve que confirmar com o usuário)
GET /sku?Search=<nome>&Simple=1
// por código de referência exato (seguro, usar sempre que tiver o código)
GET /sku?IDSkuCompanyStrict=<codigo>&Simple=1
// depois: filtrar IDTypeSku===3 (variação/filho) com IDProduct === <IDSku do pai>
// TypeProductVariationValue tem a cor (primeira parte, antes da vírgula)
// QtyAvailable é o estoque
```

---

## 5. Edição automática no Canva — CONCLUÍDA

O usuário conectou um conector do Canva (MCP), o que deu acesso a ferramentas reais de edição
(`read-design`, `edit-design`, etc, prefixo `mcp__0d15abd1-c5d5-4e3a-8948-5b8fde48f138__`).

**Todas as 32 páginas foram processadas e commitadas de verdade no Canva** (não é mais um teste em
transação aberta — cada página foi commitada individualmente com `finalize: "commit"` assim que
validada visualmente pelo thumbnail retornado). Páginas de capa de seção (3, 16, 20, 28) e a página
de informações (32) foram puladas (canceladas sem edição) por não terem dados de produto.

**⚠️ Correção feita depois do primeiro passe: números invertidos entre Rosilene e Henrique.**
As páginas 22/23/24 (primeira ocorrência de "Poncho botão/punho/tradicional") e 25/26/27 (segunda
ocorrência) mostram os MESMOS três modelos, mas são duas linhas de produto diferentes no idworks
("PONCHO ROSILENE..." vs "PONCHO HENRIQUE...", ver seção 4). No primeiro passe os números foram
colados ao contrário (Rosilene nas páginas 22-24, Henrique nas 25-27) — o usuário percebeu e pediu
pra inverter. Feito: agora 22-24 = Henrique, 25-27 = Rosilene. **Detalhe estranho pra ficar registrado:**
as fotos de capa das páginas 22 e 25 (poncho preto e poncho terracota) batem pixel-a-pixel com as
fotos do produto ROSILENE no idworks, não do Henrique — ou seja, a foto usada no design não
necessariamente indica de qual linha de produto a página realmente é. A confirmação confiável veio
comparando os NOMES das cores: os labels de cor "MARROM" (não "CÁQUI") nas páginas 22-24 só fazem
sentido pro Henrique, que tem uma variação real chamada Marrom (o Rosilene não tem "Marrom", só
"Cáqui" — forçar esse match foi o que os totais bateram certinho no passe corrigido, sem sobras).
Se for mexer nessas 6 páginas de novo, não confiar só na foto — conferir os nomes dos labels de cor
contra os dados reais de cada linha (`PONCHO ROSILENE ...` vs `PONCHO HENRIQUE ...`) antes de colar
os números.

**Descobertas importantes (resolvido o que estava pendente numa sessão anterior):**
- O catálogo NÃO tem campo de texto pra "quantidade em estoque" — só tem preço por faixa de
  quantidade de COMPRA (24/36/48 peças), que é conceito diferente. Números de estoque foram
  adicionados como novos elementos de texto (`add_text`) embaixo de cada bolinha de cor.
- **O suposto "bug" de `top`/`left` trocados em `add_text` não existe.** Foi confirmado com testes
  isolados (top=100/left=200 e top=900/left=10) que os parâmetros funcionam exatamente como o nome
  diz. O que gerava confusão era a leitura do campo `pos` retornado pelo `read-design`/`edit-design`:
  o formato de exibição é `"top,left"` (primeiro número é o TOP), não `"left,top"` como se supunha
  antes. Com essa convenção confirmada, todo o posicionamento passou a funcionar de primeira.
- Elementos que compartilham o mesmo TOP (primeira coordenada de `pos`) estão na mesma FILEIRA
  horizontal; elementos que compartilham o mesmo LEFT (segunda coordenada) estão na mesma COLUNA
  vertical. Útil pra decifrar rapidamente a grade de bolinhas de cor de cada página.
- **Técnica padrão pra páginas com pouco espaço vertical** (fileiras de cor muito próximas, sem
  espaço pra encaixar o número): duas variantes, escolhidas pelo usuário caso a caso —
  1. Empurrar a(s) fileira(s) de baixo pra baixo (`position_element`, +15 a +25px), quando sobra
     espaço livre antes da caixa de informação/preço.
  2. Encolher as bolinhas de cor (`resize_element`, de ~46.93px pra 38px, `preserve_aspect_ratio:
     true`) e reposicionar os labels de cor logo abaixo da bolinha menor — usado em páginas com 3+
     fileiras onde nem empurrar resolvia (ex: Poncho Punho Rosilene, Poncho Tradicional Rosilene).
- Formatação padrão dos números adicionados: `font_size: 9`, `text_align: "center"`, `color:
  "#1b1b1b"` (bate com o estilo dos labels de cor já existentes).
- Fluxo de seguranca usado em toda página: `read-design` com `open_transaction: true` → aplicar
  edições com `finalize: "keep_open"` (padrão) → conferir o thumbnail retornado visualmente →
  corrigir se preciso → só então `finalize: "commit"`. Um erro real aconteceu (grade mal
  interpretada numa página de 3 colunas x 4 fileiras) e foi revertido a tempo com `finalize:
  "cancel"` antes de qualquer commit — nenhuma edição errada ficou salva no Canva real.

---

## 6. Outros arquivos úteis na pasta

- `scripts/discover-orders.mjs`, `discover-order-detail.mjs` — descoberta genérica de campos do
  idworks (útil se a API mudar).
- `scripts/test-sync.mjs` — roda o pipeline de sync uma vez fora do servidor, bom pra debug.
- `scripts/ml-oauth-exchange.mjs` — reautorizar o Mercado Livre, local e/ou remoto com `--remote`
  (grava nos GitHub Secrets via `gh secret set` — seções 1b e 3).
- `scripts/ci-sync.mjs` — sync de produção (GitHub Actions), ver seção 1b.
- `catalogo-estoque-completo.md` — entregável final do catálogo (seção 4). **Não vai pro
  repositório GitHub** (dado de negócio à parte do dashboard, o repo é público).
- `DEPLOY.md` — guia alternativo de instalação num PC dedicado ligado na TV via HDMI (não usado no
  fim, o usuário optou pelo deploy GitHub Pages da seção 1b em vez disso — mas fica documentado
  caso troque de ideia ou precise de um fallback offline).
- `.github/workflows/dashboard.yml` — workflow de sync + deploy (seção 1b).
