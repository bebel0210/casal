# casal TK shop — entrega automática do ebook

## Arquivos preparados

- `index.html`: landing page com nome, e-mail, WhatsApp e consentimentos separados.
- `api/leads.js`: endpoint Vercel. Valida campos e Turnstile; encaminha o cadastro ao Apps Script sem expor URL ou segredo no navegador.
- `automation/ebook_webapp.gs`: endpoint Apps Script. Registra o e-mail na aba `Leads`, envia o PDF como anexo e atualiza o status na coluna B.

## Configuração da conta Google

O código agora está apontado para os IDs fornecidos. Como essa planilha já é usada no script de prospecção, a coluna B será sobrescrita para os leads que solicitarem o ebook. O Apps Script envia o e-mail pela conta Google que publicar o Web App; essa conta precisa ter acesso de edição à planilha e acesso ao PDF.

### 1. Planilha e PDF

- O código usa a planilha e o PDF configurados nas Script Properties; a aba da planilha é `Leads` e exige `email` em A1 e `Status` em B1.
- A conta que publicar o Apps Script precisa ter acesso de leitura ao PDF e acesso de edição à planilha.

### 2. Apps Script

- Cole `automation/ebook_webapp.gs` no projeto Apps Script que terá autorização para enviar o e-mail.
- Em **Project Settings → Script Properties**, configure:
  - `SHEET_ID`: ID da planilha que você informou.
  - `PDF_FILE_ID`: ID do PDF que você informou.
  - `SHARED_SECRET`: uma chave aleatória longa, criada para essa integração.
  - `FROM_NAME`: `casal TK shop` (opcional).
- Em **Deploy → New deployment → Web app**, escolha executar como a conta do Alessandro. Permita acesso ao Web App e copie a URL de produção terminada em `/exec`.

### 3. Vercel e proteção anti-spam

- Na Vercel, configure `GOOGLE_APPS_SCRIPT_URL` com a URL `/exec`.
- Configure `GOOGLE_APPS_SCRIPT_SHARED_SECRET` com o mesmo valor salvo em `SHARED_SECRET` no Apps Script.
- Configure `TURNSTILE_SITE_KEY` com a chave pública (Site Key) do Turnstile.
- Configure `TURNSTILE_SECRET_KEY` com a chave privada (Secret Key), além de `TURNSTILE_HOSTNAME` e `ALLOWED_ORIGIN`.
- A função `/api/leads` fornece a chave pública ao HTML; não é preciso editar o `index.html` para colocá-la.
- Publique novamente a landing page e a função `/api/leads`.

Não coloque `SHARED_SECRET`, `PDF_FILE_ID` ou a URL do Web App no HTML público. Não envie a chave secreta pelo chat.

## Como o fluxo funciona

1. A pessoa preenche o formulário e conclui o Turnstile.
2. A função Vercel valida os dados e encaminha o cadastro.
3. O Apps Script confere a chave de integração, registra o lead e envia o PDF por e-mail.
4. A coluna B da aba `Leads` recebe `enviado` depois que o e-mail foi disparado ou `erro` se o envio falhar. O script localiza o cadastro pela coluna A e, se não encontrar o e-mail, adiciona uma nova linha.

O checkbox de novidades é opcional; só os contatos que o marcarem devem entrar em futuras comunicações promocionais. O consentimento do ebook serve apenas para entregar o material solicitado.

## Teste final

Faça um cadastro usando um e-mail seu e confirme a linha correspondente na aba `Leads`, o status `enviado` na coluna B e o recebimento do PDF. Teste também os dois estados do checkbox de novidades. A automação só começa depois de publicar o Apps Script e configurar todas as chaves na Vercel.
