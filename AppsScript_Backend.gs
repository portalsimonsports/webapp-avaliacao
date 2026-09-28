/**
 * WEBAPP AVALIAÇÃO — PONTE PWA ↔ APPS SCRIPT
 *
 * Objetivo:
 * - Receber POST tradicional vindo do GitHub Pages/PWA;
 * - Evitar dependência de CORS/fetch;
 * - Reaproveitar as funções de autenticação já existentes no projeto;
 * - Responder ao PWA via window.parent.postMessage().
 *
 * IMPORTANTE:
 * Este arquivo deve ser adicionado ao MESMO projeto Apps Script que já possui
 * validarSenhaAdmin() e validarAcessoAluno(). Depois, crie uma nova versão da
 * implantação Web App mantendo a mesma URL /exec.
 */

const PSS_PWA_ORIGIN = 'https://portalsimonsports.github.io';
const PSS_PWA_SESSAO_SEG = 60 * 60 * 8;

function doPost(e) {
  var req = {};
  var requestId = '';

  try {
    if (e && e.parameter && e.parameter.payload) {
      req = JSON.parse(e.parameter.payload);
    } else if (e && e.postData && e.postData.contents) {
      req = JSON.parse(e.postData.contents);
    }

    requestId = String(req.requestId || '');
    var out = PSS_PWA_processar_(req);
    return PSS_PWA_responder_(requestId, out);
  } catch (err) {
    return PSS_PWA_responder_(requestId, {
      ok: false,
      erro: String(err && err.message ? err.message : err)
    });
  }
}

function PSS_PWA_processar_(req) {
  var acao = String(req.acao || '').trim();

  if (acao === 'login') {
    return PSS_PWA_login_(req.codigo, req.senha);
  }

  if (acao === 'validarSessao') {
    return PSS_PWA_validarSessao_(req.token);
  }

  if (acao === 'logout') {
    return PSS_PWA_logout_(req.token);
  }

  return { ok: false, erro: 'Ação inválida.' };
}

function PSS_PWA_login_(codigo, senha) {
  codigo = String(codigo || '').trim();
  senha = String(senha || '');

  if (!codigo || !senha) {
    return { ok: false, erro: 'Informe código e senha.' };
  }

  var usuario = null;
  var valido = false;

  // ADMIN — reaproveita a autenticação atual do sistema.
  if (codigo.toLowerCase() === 'admin' && typeof validarSenhaAdmin === 'function') {
    valido = !!validarSenhaAdmin(codigo, senha);
    if (valido) {
      usuario = {
        codigo: 'admin',
        nome: 'Administrador',
        perfil: 'ADMIN',
        modulos: [
          { nome: 'Painel do Administrador', url: '#' }
        ]
      };
    }
  }

  // ALUNO/USUÁRIO — reaproveita a função existente do sistema.
  if (!valido && typeof validarAcessoAluno === 'function') {
    try {
      var r = validarAcessoAluno(codigo, senha);
      if (r !== false && r !== null && r !== undefined) {
        valido = true;
        usuario = {
          codigo: codigo,
          nome: (r && (r.nome || r.alunoNome || r.nomeAluno)) ? String(r.nome || r.alunoNome || r.nomeAluno) : codigo,
          perfil: 'ALUNO',
          modulos: [
            { nome: 'Área do Aluno', url: '#' }
          ]
        };
      }
    } catch (eAluno) {
      valido = false;
    }
  }

  if (!valido || !usuario) {
    return { ok: false, erro: 'Código ou senha inválidos.' };
  }

  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(
    'PSS_PWA_SESSAO_' + token,
    JSON.stringify(usuario),
    PSS_PWA_SESSAO_SEG
  );

  return {
    ok: true,
    token: token,
    usuario: usuario
  };
}

function PSS_PWA_validarSessao_(token) {
  token = String(token || '').trim();
  if (!token) return { ok: false, erro: 'Sessão inválida.' };

  var raw = CacheService.getScriptCache().get('PSS_PWA_SESSAO_' + token);
  if (!raw) return { ok: false, erro: 'Sessão expirada.' };

  return {
    ok: true,
    usuario: JSON.parse(raw)
  };
}

function PSS_PWA_logout_(token) {
  token = String(token || '').trim();
  if (token) {
    CacheService.getScriptCache().remove('PSS_PWA_SESSAO_' + token);
  }
  return { ok: true };
}

function PSS_PWA_responder_(requestId, response) {
  var pacote = {
    requestId: String(requestId || ''),
    response: response || { ok: false, erro: 'Resposta vazia.' }
  };

  var json = JSON.stringify(pacote)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>' +
    'window.parent.postMessage(' + JSON.stringify(json) + ',' + JSON.stringify(PSS_PWA_ORIGIN) + ');' +
    '<\/script>' +
    '</body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
