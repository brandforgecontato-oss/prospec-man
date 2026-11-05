# SETUP — Manual do operador

Guia para colocar o BrandForge Prospecção pra rodar na sua máquina. Este documento é o manual do operador (você); a documentação técnica fica no [CLAUDE.md](CLAUDE.md) e a especificação completa em [prompt.MD](prompt.MD).

## 1. Pré-requisitos

- Node.js 24 LTS e pnpm instalados.
- Google Chrome instalado (a automação conecta no Chrome que **você** abre e loga — o sistema nunca abre um navegador próprio).
- Uma conta OpenAI e uma conta de negócios do Instagram/Meta com Graph API habilitada (só necessário quando você for ligar a resposta automática — o resto do sistema funciona sem isso).

## 2. Instalar e configurar

```bash
pnpm install
cp .env.example .env
cp config/business.example.json config/business.json
```

Preencha `config/business.json` com os dados reais da sua empresa (nome, oferta, ICP, `verifiedClaims`/`unverifiedClaims`, links do WhatsApp e do grupo de afiliados). Esse arquivo é gitignored — nunca vai pro repositório.

Aplique as migrações do banco:

```bash
pnpm db:migrate
```

Isso cria `data/brandforge.db` (pasta gitignored).

## 3. Chave da OpenAI

1. Acesse `https://platform.openai.com/api-keys`.
2. Crie a chave **num projeto separado** (não misture com outros usos da sua conta OpenAI).
3. Permissão da chave: **Restricted** — dê só o escopo de "Model capabilities" (chat completions), nada além disso.
4. Em **Settings → Limits**, defina um **hard limit mensal** em USD. Esse é o limite de verdade, cobrado pela OpenAI; o `OPENAI_MONTHLY_BUDGET_USD` no `.env` é um segundo limite, mais conservador, que o próprio sistema respeita e usa para se pausar sozinho antes de chegar no limite da OpenAI.
5. Cole a chave em `OPENAI_API_KEY` no `.env`, e preencha `OPENAI_MODEL`/`OPENAI_MODEL_FAST` com os nomes exatos dos modelos que você quer usar (sem apelido/alias — o nome exato evita que a qualidade das mensagens mude sozinha se a OpenAI atualizar um alias).
6. Preencha `config/openai-pricing.json` com o preço atual por modelo (USD por milhão de tokens), disponível em `https://openai.com/api/pricing` — sem isso, o sistema recusa a chamada em vez de registrar um custo errado.

## 4. Chrome com perfil dedicado (CDP)

O sistema **nunca** abre um Chrome novo nem guarda sua sessão do Instagram — ele se conecta, via protocolo CDP, num Chrome que **você** já abriu e logou manualmente. Suba o Chrome assim:

**macOS:**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-profile-brandforge"
```

**Linux:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-profile-brandforge"
```

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:USERPROFILE\.chrome-profile-brandforge"
```

Com o Chrome aberto, **faça login no Instagram manualmente, uma única vez** — a sessão fica salva no perfil dedicado (`--user-data-dir`) e é reaproveitada nas próximas vezes que você abrir o Chrome com o mesmo comando.

Confira `CHROME_CDP_URL=http://127.0.0.1:9222` e `CHROME_PROFILE_DIR` no `.env` (aponte para a mesma pasta do `--user-data-dir`).

**Aviso de segurança:** a porta de debug (`--remote-debugging-port`) dá controle total sobre a sessão logada nesse Chrome — qualquer processo que alcance essa porta pode ler e agir como você no Instagram. Por isso:
- Mantenha sempre em `127.0.0.1` — **nunca** `0.0.0.0` nem um IP de rede.
- **Nunca** rode isso numa máquina compartilhada ou exposta à internet.
- Não deixe essa porta acessível por túnel, proxy ou redirecionamento de outra máquina.

## 5. Webhook e API oficial do Instagram (opcional no início)

Só necessário quando você for ligar a resposta automática via API oficial (Funil A, Etapa 2 do [prompt.MD](prompt.MD)). Até lá, o sistema funciona só com o primeiro contato pelo navegador.

1. No painel de desenvolvedor da Meta, crie o app e habilite a Instagram Graph API / Messaging.
2. Configure o webhook apontando para `https://SEU_DOMINIO/api/webhooks/instagram`, com um `Verify Token` à sua escolha — coloque o mesmo valor em `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
3. Copie o `App Secret` para `INSTAGRAM_APP_SECRET` (usado para verificar a assinatura de cada evento recebido).
4. Gere um token de acesso de longa duração para a conta de negócios e coloque em `INSTAGRAM_ACCESS_TOKEN`; o ID da conta em `INSTAGRAM_BUSINESS_ACCOUNT_ID`.
5. O webhook só responde local ou atrás de um domínio público (ex.: um túnel como `ngrok` em desenvolvimento) — a Meta não alcança `localhost`.

## 6. Como rodar

Painel e worker juntos, num comando só:

```bash
pnpm dev:all
```

Painel sozinho (`http://localhost:3000`): `pnpm dev`. Worker sozinho (a fila de jobs — descoberta, envio de DM, webhook, IA): `pnpm worker`.

## 7. Como pausar

Dois jeitos, e nenhum deles perde fila nem dado:

- **Painel:** acesse `/excecoes` e clique em "Pausar sistema" (dá pra escrever o motivo). O worker para de pegar qualquer job novo assim que a pausa é gravada; retome pelo mesmo lugar, botão "Retomar sistema".
- **Encerrar o processo:** `Ctrl+C` no terminal onde o worker está rodando (ou nos dois, se estiver usando `pnpm dev:all`) — ele termina o job atual antes de sair. Na próxima subida, qualquer job que tenha ficado preso em execução por uma queda abrupta é reenfileirado automaticamente.

O sistema também se pausa **sozinho** em alguns casos (estouro do orçamento mensal de IA, perda de sessão do Chrome, taxa anormal de erros) — o motivo sempre aparece em `/excecoes` e no banner do painel.

## 8. Backup e restauração

O estado inteiro do sistema é um único arquivo SQLite: `data/brandforge.db` (mais os arquivos `-wal`/`-shm` ao lado, se existirem). Para fazer backup, com o worker parado:

```bash
cp data/brandforge.db backups/brandforge-$(date +%Y%m%d-%H%M).db
```

(`backups/` já é gitignored — pasta pensada exatamente pra isso.)

Para restaurar, com o worker parado, copie o backup de volta por cima do arquivo apontado por `DATABASE_URL` e suba o worker normalmente:

```bash
cp backups/brandforge-AAAAMMDD-HHMM.db data/brandforge.db
```

Não existe hoje um agendador de backup automático — é uma cópia manual do arquivo, quando você quiser.

## 9. Se a chave da OpenAI vazar

1. Revogue a chave imediatamente em `https://platform.openai.com/api-keys` (não dá pra "trocar a senha", só apagar e criar outra).
2. Gere uma chave nova, no mesmo projeto separado, mesma permissão `Restricted`, mesmo hard limit.
3. Atualize `OPENAI_API_KEY` no `.env` e reinicie o worker.
4. Confira em `/excecoes` e no painel de uso da OpenAI se houve chamada que você não reconhece — se houve, o custo já apareceu em `ai_calls`/no painel, então dá pra saber a janela de tempo exata do vazamento.

O mesmo vale para `INSTAGRAM_APP_SECRET`/`INSTAGRAM_ACCESS_TOKEN`: revogue no painel da Meta, gere de novo, atualize o `.env`, reinicie.

## 10. Caminho até a autonomia: simulação → dry-run → piloto

O prompt.MD pede uma progressão de confiança em vez de ligar tudo de uma vez (seção "Testes"). Não existe um flag no sistema que trave isso automaticamente — a progressão é uma decisão sua, feita nesta ordem:

### Nível 1 — Simulação local (já feito, roda sozinho)

`pnpm test` roda toda a suíte contra páginas e CDP simulados (`vi.mock("playwright-core")`) — cobre transição de pipeline/canal, dedupe, idempotência de webhook/job, trava de envio duplicado, follow-up, atribuição de experimento, recuperação após reinício, expiração de janela da API, lista de não-contato, circuit breaker e corte por orçamento. Nada disso toca um Chrome real. Rode antes de qualquer coisa abaixo — se algo aqui está quebrado, os níveis seguintes não vão dizer nada de confiável.

### Nível 2 — Dry-run real (envio final bloqueado)

Com o Chrome real aberto e logado (seção 4), os seletores de `scrapeProfile()` e `sendDirectMessage()` ainda não foram confirmados contra a marcação atual do Instagram — só contra páginas simuladas. Dois scripts fazem esse teste sem risco:

```bash
# Lê um perfil público de verdade — só leitura, sem risco nenhum.
pnpm dry-run:profile nome_do_perfil

# Abre o composer de DM de uma conta de verdade e digita a mensagem —
# mas NUNCA pressiona Enter. Use uma conta de teste SUA, não um lead
# real: mesmo em dry-run, é a caixa de mensagens de verdade dessa conta
# que abre.
pnpm dry-run:dm sua_conta_de_teste "mensagem de teste"
```

Se algum dos dois falhar, o erro aponta pro seletor que não bateu (mais screenshot/aria-snapshot salvos em `screenshots/`, igual ao que a produção salvaria) — ajuste `src/integrations/browser/profile.ts` ou `dm.ts` e repita até os dois passarem limpos.

### Nível 3 — Smoke test real e limitado (só com sua autorização explícita)

Isto envia **uma DM de verdade**. Só faça depois do nível 2 passar limpo, e só para uma conta que você controla (uma segunda conta sua, ou peça pra alguém de confiança topar receber):

1. Suba `pnpm dev:all`.
2. Cadastre a conta de teste em `/leads/novo`.
3. Isso enfileira `discover_profile` → `send_browser_dm` de verdade. Acompanhe pelo terminal do worker e pela ficha do lead (`/leads/<id>`) — a mensagem deve chegar na conta de teste.
4. Confirme na ficha do lead que o estado foi para `waiting_inbound_reply` e a mensagem aparece na timeline como enviada.
5. Se quiser testar o ciclo completo (webhook → API oficial → IA), responda a partir da conta de teste e confira se o webhook casa a resposta e a conversa segue pela API (seção 5 precisa estar configurada).

### Piloto limitado → autonomia

Só depois do nível 3 limpo: solte para um pequeno número real de leads (você decide quantos), acompanhando de perto pelo painel (`/`, `/leads`, `/excecoes`) por alguns dias — de olho em falso positivo de ICP, qualidade da mensagem inicial, e qualquer pausa automática do circuit breaker. Sem sinal de problema, vá soltando mais devagar (o próprio aquecimento de `MAX_DMS_PER_DAY` em `pacing.ts` já limita o ritmo dos primeiros dias). Autonomia plena é o fim natural disso, não um botão — é você decidindo, com histórico real na mão, que não precisa mais olhar cada lead antes de deixar seguir.
