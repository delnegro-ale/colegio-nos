# Colégio Nós — Landing Page de Matrículas 2027

Landing page estática de captação de leads, publicada via **GitHub Pages** em
<https://matriculas.colegionos.com>.

## Estrutura

```
index.html                  Landing page completa (HTML + CSS inline)
worker/                     API Cloudflare Worker, banco D1 e migrações
apps-script/Code.gs         Sincronização idempotente com Google Sheets
docs/IMPLEMENTACAO-LEADS.md Configuração e operação do fluxo de leads
assets/hero-alunos.webp     Imagem principal (WebP, ~71 KB)
assets/hero-alunos.jpg      Fallback JPEG (~129 KB)
assets/logo-colegio-nos.png Logo (topbar e rodapé)
favicon.ico
CNAME                       Domínio customizado do GitHub Pages
404.html                    Redireciona para a home
robots.txt / sitemap.xml
.nojekyll                   Desliga o processamento Jekyll do GitHub Pages
```

Não há build. É HTML estático puro — editar `index.html` e dar push na `main`
publica automaticamente.

## Formulário e persistência

O navegador envia rascunhos e submissões completas para um Cloudflare Worker.
O Worker grava primeiro no D1 e sincroniza a versão mais recente de cada lead
com o Google Sheets. O WhatsApp só é aberto após a confirmação do D1.

Consulte [docs/IMPLEMENTACAO-LEADS.md](docs/IMPLEMENTACAO-LEADS.md) para criar os
recursos, configurar os segredos e publicar o Worker.

## Rastreamento

Google Tag Manager: **GTM-5MBTFNMH**

Eventos enviados para o `dataLayer`:

| Evento           | Quando dispara                             | Dados extras |
|------------------|--------------------------------------------|--------------|
| `WhatsappButton` | Clique no botão "Fale conosco" do topo      | —            |
| `lead_saved`     | D1 confirmou o formulário completo          | `lead_id`, `event_id`, `transaction_id`, `unidade`, `serie` |

Nome, e-mail e telefone não são enviados ao `dataLayer`. Meta e Google Ads
devem usar exclusivamente `lead_saved` como gatilho de conversão.

## Desenvolvimento local

```sh
python3 -m http.server 8000
```

E abrir <http://localhost:8000>.

## Histórico

Antes de novembro de 2027 este repositório continha um app React/Vite gerado no
Lovable. Ele foi substituído por esta landing page estática — o código antigo
continua disponível no histórico do Git (commit `e6cbb73` e anteriores).
