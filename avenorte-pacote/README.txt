# Avenorte Busca - Pacote pronto

## O que tem aqui
- index.html = app completo (Buscar + Adicionar, offline)

## Como instalar
1. Abra index.html no Bloco de Notas
2. Na linha 15, troque COLE_AQUI_URL_DO_APPS_SCRIPT pela URL do seu Apps Script
3. Salve

## Subir no GitHub
1. Acesse github.com/laercio-pavanello/avenorte-busca
2. Upload files > arraste index.html (substitui o antigo)
3. Commit

Cloudflare Pages faz deploy automático.

## Apps Script (cole na planilha)
const SHEET_ID = '1IQNbrEw7cb7hRpwJVcAVD1-KTfAfiwQ-l-ez_XIAjCc';
const ABA = 'Página1';

function doGet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ABA);
  const values = sheet.getDataRange().getValues();
  const dados = values.slice(1).filter(r => r[0]).map(r => ({
    codigo: r[0], descricao: r[1]||'', setor: r[2]||'', observacao: r[3]||'', termos_busca: r[4]||''
  }));
  return ContentService.createTextOutput(JSON.stringify(dados)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ABA);
  const d = JSON.parse(e.postData.contents);
  sheet.appendRow([String(d.codigo).toUpperCase().trim(), d.descricao.trim(), d.setor||'', d.observacao||'', d.termos_busca||'', new Date()]);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
