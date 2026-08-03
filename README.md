# Colégio Nós — Landing Page de Matrículas 2027

Landing page estática de captação de leads, publicada via **GitHub Pages** em
<https://matriculas.colegionos.com>.

## Estrutura

```
index.html                  Landing page completa (HTML + CSS inline)
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

## Formulário

O formulário não usa backend: ao enviar, ele monta uma mensagem e abre o
WhatsApp (`https://wa.me/5521994753375`) com os dados preenchidos.

## Rastreamento

Google Tag Manager: **GTM-5MBTFNMH**

Eventos enviados para o `dataLayer` (mesmos nomes da versão anterior do site,
para não quebrar os gatilhos já configurados no GTM):

| Evento           | Quando dispara                             | Dados extras |
|------------------|--------------------------------------------|--------------|
| `WhatsappButton` | Clique no botão "Fale conosco" do topo      | —            |
| `AgendarVisita`  | Clique no CTA "Agendar minha visita"        | —            |
| `WhatsappForm`   | Envio do formulário de lead                 | `nome`, `email`, `telefone`, `unidade`, `serie` |

## Desenvolvimento local

```sh
python3 -m http.server 8000
```

E abrir <http://localhost:8000>.

## Histórico

Antes de novembro de 2027 este repositório continha um app React/Vite gerado no
Lovable. Ele foi substituído por esta landing page estática — o código antigo
continua disponível no histórico do Git (commit `e6cbb73` e anteriores).
