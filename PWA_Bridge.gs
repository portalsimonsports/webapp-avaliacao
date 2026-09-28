/**
 * Portal SimonSports — WebApp Avaliação
 * PWA_Bridge.gs — COMPLETO
 *
 * OBJETIVO
 * - Manter o endereço do usuário em portalsimonsports.github.io;
 * - Carregar o HTML REAL do arquivo Index do Apps Script;
 * - Substituir google.script.run por uma ponte RPC via POST oculto;
 * - Reaproveitar as funções públicas já existentes no projeto Apps Script.
 *
 * IMPLANTAÇÃO
 * - Executar como: Eu
 * - Quem tem acesso: Qualquer pessoa
 * - Após alteração: Gerenciar implantações > Editar > Nova versão > Implantar
 */

const PSS_PWA_ORIGIN = 'https://portalsimonsports.github.io';

function doPost(e) {
  var req = {};
  var requestId = '';

  try {
    if (e && e.parameter && e.parameter.payload) {
      req = JSON.parse(String(e.parameter.payload));
    } else if (e && e.postData && e.postData.contents) {
      req = JSON.parse(String(e.postData.contents));
    }

    requestId = String(req.requestId || '');
    return PSS_PWA_responder_(requestId, PSS_PWA_processar_(req));
  } catch (err) {
    return PSS_PWA_responder_(requestId, {
      ok: false,
      erro: String(err && err.message ? err.message : err)
    });
  }
}

function PSS_PWA_processar_(req) {
  req = req || {};
  var acao = String(req.acao || '').trim();

  if (acao === 'ping') {
    return {
      ok: true,
      servico: 'PWA_Bridge',
      dataHora: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'America/Sao_Paulo',
        'dd/MM/yyyy HH:mm:ss'
      )
    };
  }

  if (acao === 'frontend') {
    return PSS_PWA_frontend_();
  }

  if (acao === 'rpc') {
    return PSS_PWA_rpc_(req.funcao, req.args);
  }

  return { ok: false, erro: 'Ação inválida.' };
}

/**
 * Entrega o HTML REAL que hoje é servido pelo Apps Script.
 * Usa Template para preservar includes e scriptlets existentes.
 */
function PSS_PWA_frontend_() {
  try {
    var html = HtmlService
      .createTemplateFromFile('Index')
      .evaluate()
      .getContent();

    return {
      ok: true,
      html: html
    };
  } catch (err) {
    return {
      ok: false,
      erro: 'Não foi possível carregar o arquivo Index: ' + String(err && err.message ? err.message : err)
    };
  }
}

/**
 * Emula google.script.run.
 * Funções terminadas com _ continuam privadas, como no comportamento nativo.
 */
function PSS_PWA_rpc_(nomeFuncao, args) {
  nomeFuncao = String(nomeFuncao || '').trim();
  args = Array.isArray(args) ? args : [];

  if (!nomeFuncao) {
    return { ok: false, erro: 'Função não informada.' };
  }

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nomeFuncao)) {
    return { ok: false, erro: 'Nome de função inválido.' };
  }

  if (
    nomeFuncao === 'doGet' ||
    nomeFuncao === 'doPost' ||
    nomeFuncao.indexOf('PSS_PWA_') === 0 ||
    /_$/.test(nomeFuncao)
  ) {
    return { ok: false, erro: 'Função não disponível para chamada remota.' };
  }

  try {
    var fn = globalThis[nomeFuncao];
    if (typeof fn !== 'function') {
      return {
        ok: false,
        erro: 'Função pública não encontrada no Apps Script: ' + nomeFuncao
      };
    }

    var resultado = fn.apply(null, args);

    return {
      ok: true,
      resultado: resultado
    };
  } catch (err) {
    return {
      ok: false,
      erro: String(err && err.message ? err.message : err)
    };
  }
}

/**
 * Resposta por postMessage diretamente para o TOP da página GitHub.
 */
function PSS_PWA_responder_(requestId, response) {
  var pacote = {
    requestId: String(requestId || ''),
    response: response || { ok: false, erro: 'Resposta vazia.' }
  };

  var json = JSON.stringify(pacote)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  var html = ''
    + '<!doctype html><html><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '</head><body>'
    + '<script>'
    + 'try {'
    + ' var p=' + JSON.stringify(json) + ';'
    + ' if(typeof p==="string") p=JSON.parse(p);'
    + ' window.top.postMessage(p,' + JSON.stringify(PSS_PWA_ORIGIN) + ');'
    + '} catch(e) {}'
    + '<\/script>'
    + '</body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('PWA Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function PSS_PWA_TESTAR_BACKEND() {
  var resultado = PSS_PWA_processar_({ acao: 'ping' });
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

function PSS_PWA_TESTAR_FRONTEND() {
  var resultado = PSS_PWA_frontend_();
  Logger.log(JSON.stringify({
    ok: resultado.ok,
    tamanhoHtml: resultado.html ? resultado.html.length : 0,
    erro: resultado.erro || ''
  }));
  return resultado;
}
