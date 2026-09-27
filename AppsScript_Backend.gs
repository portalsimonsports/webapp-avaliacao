/**
 * WEBAPP AVALIAÇÃO — BACKEND BASE
 * Apps Script
 *
 * IMPORTANTE:
 * Ajuste ID_PLANILHA, ABA_USUARIOS e as colunas conforme sua base atual.
 */

const ID_PLANILHA = 'COLE_AQUI_O_ID_DA_PLANILHA';
const ABA_USUARIOS = 'USUARIOS';
const TEMPO_SESSAO_SEG = 60 * 60 * 8;

function doPost(e) {
  try {
    const req = JSON.parse((e.postData && e.postData.contents) || '{}');
    let out;
    switch (String(req.acao || '')) {
      case 'login': out = login_(req.codigo, req.senha); break;
      case 'validarSessao': out = validarSessao_(req.token); break;
      case 'logout': out = logout_(req.token); break;
      default: out = { ok:false, erro:'Ação inválida.' };
    }
    return json_(out);
  } catch (err) {
    return json_({ ok:false, erro:String(err && err.message ? err.message : err) });
  }
}

function login_(codigo, senha) {
  codigo = String(codigo || '').trim();
  senha = String(senha || '');
  if (!codigo || !senha) return { ok:false, erro:'Informe código e senha.' };
  const ss = SpreadsheetApp.openById(ID_PLANILHA);
  const sh = ss.getSheetByName(ABA_USUARIOS);
  if (!sh) throw new Error('Aba de usuários não encontrada.');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok:false, erro:'Nenhum usuário cadastrado.' };
  const cab = values[0].map(v => String(v).trim().toUpperCase());
  const iCodigo = cab.indexOf('CODIGO');
  const iSenha = cab.indexOf('SENHA');
  const iNome = cab.indexOf('NOME');
  const iStatus = cab.indexOf('STATUS');
  const iModulos = cab.indexOf('MODULOS');
  if (iCodigo < 0 || iSenha < 0) throw new Error('Cabeçalho precisa conter CODIGO e SENHA.');
  const row = values.slice(1).find(r => String(r[iCodigo]).trim() === codigo);
  if (!row) return { ok:false, erro:'Código ou senha inválidos.' };
  if (iStatus >= 0 && String(row[iStatus]).trim().toUpperCase() !== 'ATIVO') return { ok:false, erro:'Usuário sem acesso.' };
  if (String(row[iSenha]) !== senha) return { ok:false, erro:'Código ou senha inválidos.' };
  const token = Utilities.getUuid() + Utilities.getUuid();
  const usuario = { codigo, nome: iNome >= 0 ? String(row[iNome] || '') : codigo, modulos: parseModulos_(iModulos >= 0 ? row[iModulos] : '') };
  CacheService.getScriptCache().put('sessao:' + token, JSON.stringify(usuario), TEMPO_SESSAO_SEG);
  return { ok:true, token, usuario };
}

function validarSessao_(token) {
  token = String(token || '').trim();
  if (!token) return { ok:false, erro:'Sessão inválida.' };
  const raw = CacheService.getScriptCache().get('sessao:' + token);
  if (!raw) return { ok:false, erro:'Sessão expirada.' };
  return { ok:true, usuario:JSON.parse(raw) };
}

function logout_(token) {
  token = String(token || '').trim();
  if (token) CacheService.getScriptCache().remove('sessao:' + token);
  return { ok:true };
}

function parseModulos_(valor) {
  return String(valor || '').split(';').map(s => s.trim()).filter(Boolean).map(item => {
    const p = item.split('|');
    return { nome:(p[0] || '').trim(), url:(p[1] || '#').trim() };
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
