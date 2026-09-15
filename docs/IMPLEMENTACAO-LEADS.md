# Implementação de leads: GitHub Pages + Cloudflare + Google Sheets

## Fluxo

1. A landing page continua em `https://matriculas.colegionos.com` no GitHub Pages.
2. Após a primeira digitação, o navegador envia um rascunho para o Worker.
3. O Worker valida e grava o estado mais recente do lead no D1.
4. O Worker tenta sincronizar imediatamente com o Apps Script e o cron repete falhas.
5. No envio final, a página só publica `lead_saved` no `dataLayer` após o D1 confirmar a gravação.
6. GTM usa somente `lead_saved` como gatilho de conversão de Meta e Google Ads.

## Recursos e segredos

No Cloudflare:

- Worker: `colegio-nos-leads`
- D1: `colegio-nos-leads`
- segredo `SHEETS_WEBHOOK_URL`: URL `/exec` do Apps Script
- segredo `SHEETS_SYNC_SECRET`: valor aleatório igual ao Script Property `SYNC_SECRET`
- segredo `RATE_LIMIT_SALT`: valor aleatório para anonimizar o IP usado no rate limit

No Apps Script, em **Configurações do projeto > Propriedades do script**:

- `SPREADSHEET_ID`: trecho entre `/d/` e `/edit` da URL da planilha
- `SYNC_SECRET`: o mesmo valor configurado no Worker

O script cria a aba `Leads D1`. A aba antiga, se existir, não é alterada.

Implante o Apps Script como aplicativo da web, executando como o proprietário e com acesso para qualquer pessoa. O segredo no corpo impede gravações sem autorização.

No GitHub, em **Settings > Secrets and variables > Actions**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`, limitado a Workers Scripts (edit), D1 (edit) e Account Settings (read)

## Contrato do GTM

Evento de conversão:

```javascript
{
  event: 'lead_saved',
  lead_id: 'identificador estável',
  event_id: 'identificador estável para deduplicação',
  transaction_id: 'identificador estável para deduplicação',
  lead_status: 'complete',
  unidade: 'Barra | Pechincha | Recreio',
  serie: 'texto sem dados de contato'
}
```

Não enviar nome, e-mail ou telefone pelo `dataLayer`.

No Google Ads, mapear `transaction_id` para evitar duplicidade. Na Meta, configurar `event_id` no template da tag para deduplicação. O gatilho das duas tags deve ser **Evento personalizado = `lead_saved`**.

## Recuperação

O D1 é a fonte operacional. Se o Apps Script ou a planilha estiverem indisponíveis, o registro permanece com `sync_status = failed` e é tentado novamente a cada cinco minutos, até vinte tentativas. Uma atualização posterior volta o registro para `pending`.
