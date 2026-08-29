# Deploy na Oracle Cloud (Always Free) — custo R$ 0

Passo a passo do zero até o painel no ar, sem mensalidade. Leva ~40 minutos, a
maior parte esperando a VPS criar.

O que roda aqui: o backend (Node) + o Postgres, os dois num único `docker
compose` na VPS. O site (frontend) vai separado no Cloudflare Pages, também
grátis. O login continua no Firebase Auth (grátis até 50 mil usuários).

---

## 1. Criar a conta e a máquina na Oracle (~15 min)

1. Crie a conta em https://www.oracle.com/cloud/free/. Pede um cartão para
   verificação de identidade — **não cobra** enquanto você ficar no Always Free.
   Escolha uma região perto de você (São Paulo ou Vinhedo).
2. No console: **Compute → Instances → Create Instance**.
3. Em **Image and shape**:
   - Image: **Ubuntu 22.04**
   - Shape: **Ampere (ARM)** → `VM.Standard.A1.Flex` → 1 OCPU / 6 GB RAM
     (sobra folga; o teto grátis é 4 OCPU / 24 GB, mas 1/6 já é generoso aqui).
4. Em **Networking**, deixe criar uma VNIC pública. Baixe a **chave SSH privada**
   quando ele oferecer — é como você entra na máquina.
5. Create. Anote o **IP público** quando a instância ficar "Running".

### Liberar a porta 443 (HTTPS)

No console: **Networking → Virtual Cloud Networks → sua VCN → Security Lists →
Default → Add Ingress Rule**:
- Source CIDR `0.0.0.0/0`, protocolo TCP, porta de destino **443**.
- Repita para a porta **80** (o Caddy usa para emitir o certificado).

---

## 2. Entrar na máquina e instalar o Docker (~5 min)

```bash
# do seu PC, com a chave que baixou:
ssh -i sua-chave.key ubuntu@SEU_IP_PUBLICO

# já na VPS:
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
# saia e entre de novo para o grupo docker valer:
exit
ssh -i sua-chave.key ubuntu@SEU_IP_PUBLICO
```

---

## 3. Subir o backend + Postgres (~10 min)

```bash
git clone SEU_REPOSITORIO roprofit
cd roprofit/server

# configure os segredos:
cp .env.example .env
nano .env
```

Preencha o `.env`:
```
DB_PASSWORD=uma-senha-longa-e-aleatoria
FIREBASE_PROJECT_ID=roprofit
ADMIN_BOOTSTRAP_EMAILS=seu-email@dominio.com
```
`ADMIN_BOOTSTRAP_EMAILS` é o e-mail que vira admin sozinho no primeiro login —
é assim que você entra no painel sem depender de já ser admin.

```bash
docker compose up -d --build
docker compose logs -f server   # acompanhe a subida; Ctrl-C para sair do log
```

Você deve ver `schema aplicado` e `API no ar`. O `WARMUP=true` já dispara a
primeira coleta — em alguns minutos há dados. O mapeamento completo (~2.500
itens) leva ~2h, mas os itens da faixa da operação ficam prontos primeiro.

Confira que respondeu:
```bash
curl http://localhost:8080/health   # {"ok":true}
```

---

## 4. HTTPS com um domínio (Caddy, ~5 min)

O navegador exige HTTPS para o Firebase Auth funcionar. O Caddy emite e renova o
certificado sozinho, de graça. Você precisa de um domínio (ou subdomínio)
apontando para o IP da VPS — um registro A em `api.seudominio.com → SEU_IP`.

```bash
# ainda em roprofit/server
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
api.seudominio.com {
    reverse_proxy 127.0.0.1:8080
}
CADDY
sudo systemctl restart caddy
```

Agora `https://api.seudominio.com/health` responde com certificado válido.

---

## 5. Publicar o site no Cloudflare Pages (~5 min, grátis)

O frontend é estático — build uma vez, sobe de graça e nunca dorme.

No seu PC, na raiz do projeto:
```bash
# aponta o site para a API da VPS:
echo "VITE_API_BASE_URL=https://api.seudominio.com/api" >> .env.local
npm run build
```

No Cloudflare: **Pages → Create → Connect to Git** (ou faça upload da pasta
`dist/`). Build command `npm run build`, output `dist`. Adicione a variável de
ambiente `VITE_API_BASE_URL=https://api.seudominio.com/api` também lá, para os
builds automáticos.

No **Firebase Console → Authentication → Settings → Authorized domains**,
adicione o domínio do seu site do Cloudflare — senão o login é bloqueado.

---

## 6. Virar admin

1. Abra o site, faça login com o e-mail que pôs em `ADMIN_BOOTSTRAP_EMAILS`.
2. Recarregue. O menu **admin** aparece e `/admin/mercado` abre.

Para promover outra pessoa depois (ela precisa ter logado uma vez):
```bash
cd roprofit/server
docker compose exec server node dist/cli/grant-admin.js outro@email.com
```

---

## Manutenção

```bash
# atualizar depois de um git pull:
git pull && docker compose up -d --build

# ver saúde da coleta sem abrir o painel:
docker compose exec db psql -U roprofit -c \
  "SELECT collector, status, finished_at FROM collector_runs
   ORDER BY started_at DESC LIMIT 10;"

# backup do banco (rode de vez em quando, guarde fora da VPS):
docker compose exec db pg_dump -U roprofit roprofit | gzip > backup-$(date +%F).sql.gz
```

### Custo real

Tudo aqui é Always Free: a VPS Ampere, os 200 GB de disco, o Cloudflare Pages, o
Firebase Auth. O módulo usa ~1,3 GB de banco. **Não há mensalidade.** O único
gasto possível seria sair do Always Free (uma VM maior que o teto), o que não
acontece com a shape indicada acima.

### Se a coleta parar

A página `/admin/mercado/coletores` mostra quando um coletor falhou — é o mesmo
alarme de antes. Como tudo roda num processo só, `docker compose restart server`
resolve a maioria dos casos. O histórico fica no volume do Postgres, então
reiniciar não perde dado.
