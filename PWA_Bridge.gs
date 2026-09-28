/**
 * WEBAPP AVALIAÇÃO — PONTE PWA ↔ APPS SCRIPT
 * VERSÃO COMPLETA — LOGIN + SESSÃO + FRONTEND REAL + RPC
 *
 * OBJETIVO
 * - Manter o endereço do usuário em portalsimonsports.github.io;
 * - Preservar login/sessão da versão anterior;
 * - Carregar o HTML REAL do arquivo Index do Apps Script;
 * - Substituir google.script.run por uma ponte RPC via POST oculto;
 * - Reaproveitar as funções públicas já existentes no projeto Apps Script.
 *
 * REQUISITOS DA IMPLANTAÇÃO WEB APP
 * - Executar como: Eu
 * - Quem tem acesso: Qualquer pessoa
 * - Após alteração: Gerenciar implantações > Editar > Nova versão > Implantar
 * - Manter a mesma URL /exec quando possível
 */

const PSS_PWA_ORIGIN = 'https://portalsimonsports.github.io';
const PSS_PWA_SESSAO_SEG = 60 * 60 * 8; // 8 horas

/**
 * Entrada POST da PWA.
 * Recebe payload enviado por formulário oculto dentro de iframe.
 */
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

    var out = PSS_PWA_processar_(req);
    return PSS_PWA_responder_(requestId, out);
  } catch (err) {
    return PSS_PWA_responder_(requestId, {
      ok: false,
      erro: String(err && err.message ? err.message : err)
    });
  }
}

/**
 * Roteador das ações expostas à PWA.
 */
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

  if (acao === 'login') {
    return PSS_PWA_login_(req.codigo, req.senha, req.perfil);
  }

  if (acao === 'validarSessao') {
    return PSS_PWA_validarSessao_(req.token);
  }

  if (acao === 'logout') {
    return PSS_PWA_logout_(req.token);
  }

  if (acao === 'frontend') {
    return PSS_PWA_frontend_();
  }

  if (acao === 'rpc') {
    return PSS_PWA_rpc_(req.funcao, req.args);
  }

  return {
    ok: false,
    erro: 'Ação inválida.'
  };
}

/**
 * Login usando as funções de autenticação já existentes no projeto.
 */
function PSS_PWA_login_(codigo, senha, perfil) {
  codigo = String(codigo || '').trim();
  senha = String(senha || '');
  perfil = String(perfil || '').trim().toUpperCase();

  if (!codigo || !senha) {
    return {
      ok: false,
      erro: 'Informe código/usuário e senha.'
    };
  }

  var usuario = null;
  var valido = false;

  /** ADMINISTRADOR */
  if (perfil === 'ADMIN' || codigo.toLowerCase() === 'admin') {
    if (typeof validarSenhaAdmin === 'function') {
      try {
        valido = !!validarSenhaAdmin(codigo, senha);
      } catch (eAdmin) {
        valido = false;
      }

      if (valido) {
        usuario = {
          codigo: codigo,
          nome: 'Administrador',
          perfil: 'ADMIN',
          modulos: [
            {
              nome: 'Painel do Administrador',
              url: '#'
            }
          ]
        };
      }
    }
  }

  /** ALUNO / USUÁRIO */
  if (!valido && perfil !== 'ADMIN') {
    if (typeof validarAcessoAluno === 'function') {
      try {
        var r = validarAcessoAluno(codigo, senha);

        if (r !== false && r !== null && r !== undefined) {
          valido = true;
          usuario = {
            codigo: codigo,
            nome: PSS_PWA_extrairNome_(r, codigo),
            perfil: 'ALUNO',
            modulos: [
              {
                nome: 'Área do Aluno',
                url: '#'
              }
            ]
          };
        }
      } catch (eAluno) {
        valido = false;
      }
    }
  }

  if (!valido || !usuario) {
    return {
      ok: false,
      erro: 'Código/usuário ou senha inválidos.'
    };
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

/**
 * Extrai nome quando validarAcessoAluno retorna objeto.
 */
function PSS_PWA_extrairNome_(r, fallback) {
  try {
    if (r && typeof r === 'object') {
      if (r.nome) return String(r.nome);
      if (r.alunoNome) return String(r.alunoNome);
      if (r.nomeAluno) return String(r.nomeAluno);
      if (r.usuario) return String(r.usuario);
    }
  } catch (e) {}

  return String(fallback || 'Usuário');
}

/**
 * Valida token de sessão temporário.
 */
function PSS_PWA_validarSessao_(token) {
  token = String(token || '').trim();

  if (!token) {
    return {
      ok: false,
      erro: 'Sessão inválida.'
    };
  }

  var raw = CacheService.getScriptCache().get(
    'PSS_PWA_SESSAO_' + token
  );

  if (!raw) {
    return {
      ok: false,
      erro: 'Sessão expirada.'
    };
  }

  try {
    return {
      ok: true,
      usuario: JSON.parse(raw)
    };
  } catch (e) {
    return {
      ok: false,
      erro: 'Sessão corrompida.'
    };
  }
}

/**
 * Encerra sessão.
 */
function PSS_PWA_logout_(token) {
  token = String(token || '').trim();

  if (token) {
    CacheService.getScriptCache().remove(
      'PSS_PWA_SESSAO_' + token
    );
  }

  return {
    ok: true
  };
}

/**
 * Entrega o HTML REAL do arquivo Index do Apps Script.
 * Usa template para preservar includes e scriptlets.
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
      erro: 'Não foi possível carregar o arquivo Index: ' +
        String(err && err.message ? err.message : err)
    };
  }
}

/**
 * Emula google.script.run.
 * Mantém privadas as funções terminadas em _.
 */
function PSS_PWA_rpc_(nomeFuncao, args) {
  nomeFuncao = String(nomeFuncao || '').trim();
  args = Array.isArray(args) ? args : [];

  if (!nomeFuncao) {
    return {
      ok: false,
      erro: 'Função não informada.'
    };
  }

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nomeFuncao)) {
    return {
      ok: false,
      erro: 'Nome de função inválido.'
    };
  }

  if (
    nomeFuncao === 'doGet' ||
    nomeFuncao === 'doPost' ||
    nomeFuncao.indexOf('PSS_PWA_') === 0 ||
    /_$/.test(nomeFuncao)
  ) {
    return {
      ok: false,
      erro: 'Função não disponível para chamada remota.'
    };
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
 * Devolve uma página HTML mínima dentro do iframe oculto.
 * Essa página envia a resposta diretamente ao TOP da página GitHub.
 */
function PSS_PWA_responder_(requestId, response) {
  var pacote = {
    requestId: String(requestId || ''),
    response: response || {
      ok: false,
      erro: 'Resposta vazia.'
    }
  };

  var json = JSON.stringify(pacote)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  var html = ''
    + '<!doctype html>'
    + '<html>'
    + '<head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '</head>'
    + '<body>'
    + '<script>'
    + 'try {'
    + '  var payload = ' + JSON.stringify(json) + ';'
    + '  if (typeof payload === "string") payload = JSON.parse(payload);'
    + '  window.top.postMessage(payload,' + JSON.stringify(PSS_PWA_ORIGIN) + ');'
    + '} catch(e) {'
    + '  try {'
    + '    window.top.postMessage({requestId:' + JSON.stringify(String(requestId || '')) + ',response:{ok:false,erro:String(e && e.message ? e.message : e)}},' + JSON.stringify(PSS_PWA_ORIGIN) + ');'
    + '  } catch(_) {}'
    + '}'
    + '<\/script>'
    + '</body>'
    + '</html>';

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('PWA Bridge')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}

/**
 * Teste manual do backend.
 */
function PSS_PWA_TESTAR_BACKEND() {
  var resultado = PSS_PWA_processar_({
    acao: 'ping'
  });

  Logger.log(JSON.stringify(resultado));
  return resultado;
}

/**
 * Teste manual do frontend real.
 */
function PSS_PWA_TESTAR_FRONTEND() {
  var resultado = PSS_PWA_frontend_();

  Logger.log(JSON.stringify({
    ok: resultado.ok,
    tamanhoHtml: resultado.html ? resultado.html.length : 0,
    erro: resultado.erro || ''
  }));

  return resultado;
}

/**
 * Teste manual de sessão.
 */
function PSS_PWA_TESTAR_SESSAO() {
  var token = Utilities.getUuid();
  var usuario = {
    codigo: 'TESTE',
    nome: 'Usuário Teste',
    perfil: 'TESTE'
  };

  CacheService.getScriptCache().put(
    'PSS_PWA_SESSAO_' + token,
    JSON.stringify(usuario),
    60
  );

  var resultado = PSS_PWA_validarSessao_(token);
  Logger.log(JSON.stringify(resultado));
  return resultado;
}
