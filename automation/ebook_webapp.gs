/**
 * Recebe um cadastro encaminhado pelo endpoint privado da landing page,
 * envia o PDF solicitado e marca o status na aba Leads.
 *
 * Configure em Project Settings > Script Properties:
 *   SHEET_ID      = ID da planilha informado pelo usuário
 *   PDF_FILE_ID   = ID do PDF informado pelo usuário
 *   SHARED_SECRET = mesmo segredo definido em GOOGLE_APPS_SCRIPT_SHARED_SECRET na Vercel
 *   FROM_NAME     = nome exibido no e-mail (opcional)
 * Os IDs ficam fora do código versionado para não serem publicados no GitHub.
 *
 * Publique como Web app. O endpoint é protegido pelo segredo compartilhado
 * e pela validação Turnstile feita na rota da Vercel.
 */

const EBOOK_TAB_NAME = "Leads";

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonResponse({ ok: false, message: "Tente novamente." });

  try {
    const props = PropertiesService.getScriptProperties();
    const expectedSecret = props.getProperty("SHARED_SECRET");
    if (!expectedSecret) return jsonResponse({ ok: false, message: "Configuração incompleta." });

    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!payload.sharedSecret || payload.sharedSecret !== expectedSecret) {
      return jsonResponse({ ok: false, message: "Não autorizado." });
    }

    const name = cleanCell(payload.name, 120);
    const email = String(payload.email || "").trim().toLowerCase().slice(0, 254);
    const phone = cleanCell(payload.phone, 40);
    const digits = phone.replace(/\D/g, "");
    const ebookConsent = payload.ebookConsent === true;
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || digits.length < 10 || digits.length > 13 || !ebookConsent) {
      return jsonResponse({ ok: false, message: "Dados inválidos." });
    }

    const sheetId = props.getProperty("SHEET_ID");
    const pdfId = props.getProperty("PDF_FILE_ID");
    if (!sheetId || !pdfId) return jsonResponse({ ok: false, message: "Configuração incompleta." });

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheetByName(EBOOK_TAB_NAME);
    if (!sheet) return jsonResponse({ ok: false, message: 'Não encontrei a aba "Leads".' });

    const emailHeader = String(sheet.getRange("A1").getValue() || "").trim().toLowerCase();
    const statusHeader = String(sheet.getRange("B1").getValue() || "").trim().toLowerCase();
    if (emailHeader !== "email" || statusHeader !== "status") {
      return jsonResponse({ ok: false, message: 'A planilha precisa ter "email" em A1 e "Status" em B1.' });
    }

    const pdf = DriveApp.getFileById(pdfId);
    if (pdf.getMimeType() !== "application/pdf") {
      return jsonResponse({ ok: false, message: "O arquivo configurado não é um PDF." });
    }

    const lastRow = sheet.getLastRow();
    const existingEmails = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat()
      : [];
    const matchingIndex = existingEmails.findIndex(value => String(value || "").trim().toLowerCase() === email);
    const row = matchingIndex >= 0 ? matchingIndex + 2 : lastRow + 1;
    if (matchingIndex < 0) {
      sheet.getRange(row, 1, 1, 2).setValues([[cleanCell(email, 254), "pendente"]]);
    }

    try {
      MailApp.sendEmail({
        to: email,
        subject: "Seu ebook gratuito do casal TK",
        body: "Olá, " + name + "!\n\nAqui está o ebook que você solicitou. O PDF está anexado a esta mensagem.\n\nUm abraço,\ncasal TK",
        name: props.getProperty("FROM_NAME") || "casal TK shop",
        attachments: [pdf.getBlob().setName(pdf.getName())]
      });
      sheet.getRange(row, 2).setValue("enviado");
      return jsonResponse({ ok: true, message: "Cadastro recebido e ebook enviado." });
    } catch (sendError) {
      sheet.getRange(row, 2).setValue("erro");
      return jsonResponse({ ok: false, message: "Não foi possível enviar o ebook." });
    }
  } catch (error) {
    return jsonResponse({ ok: false, message: "Não foi possível processar o cadastro." });
  } finally {
    lock.releaseLock();
  }
}

function cleanCell(value, maxLength) {
  let text = String(value || "").trim().slice(0, maxLength);
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return text;
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
