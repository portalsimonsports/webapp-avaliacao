/**
 * WEBAPP AVALIAÇÃO — PONTE PWA ↔ APPS SCRIPT
 * VERSÃO COMPLETA — LOGIN + SESSÃO + FRONTEND REAL + RPC
 * COMPATÍVEL COM PERFIL / STATUS / PERMISSÕES DE ADMINISTRADORES
 *
 * OBJETIVO
 * - Manter o endereço do usuário em portalsimonsports.github.io;
 * - Preservar login/sessão da versão anterior;
 * - Carregar o HTML REAL do arquivo Index do Apps Script;
 * - Substituir google.script.run por uma ponte RPC via POST oculto;
 * - Reaproveitar as funções públicas já existentes no projeto Apps Script;
 * - Preparar a PWA para a aba Admins com:
 *   ID | Usuario | Senha | Data_Criacao | Perfil | Status | Permissoes | Observacoes.
 *
 * COMPATIBILIDADE
 * - Quando existir autenticarAdminCompleto(usuario, senha), usa Perfil/Status/Permissoes.
 * - Enquanto o Admin.gs antigo ainda estiver em uso, mantém fallback para validarSenhaAdmin().
 * - Assim esta versão pode ser publicada antes da atualização definitiva do Admin.gs.
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

  /**
   * ADMINISTRADOR
   * Aceita SUPERADMIN / ADMIN / PROFESSOR / CONSULTA.
   * O tipo exato virá da coluna Perfil quando Admin.gs for atualizado.
   */
  if (
    perfil === 'ADMIN' ||
    perfil === 'SUPERADMIN' ||
    perfil === 'PROFESSOR' ||
    perfil === 'CONSULTA' ||
    codigo.toLowerCase() === 'admin'
  ) {
    var acessoAdmin = PSS_PWA_autenticarAdmin_(codigo, senha);

    if (acessoAdmin && acessoAdmin.ok) {
      valido = true;
      usuario = {
        id: String(acessoAdmin.id || ''),
        codigo: String(acessoAdmin.usuario || codigo),
        nome: String(acessoAdmin.nome || acessoAdmin.usuario || codigo || 'Administrador'),
        perfil: String(acessoAdmin.perfil || 'ADMIN').toUpperCase(),
        status: String(acessoAdmin.status || 'ATIVO').toUpperCase(),
        permissoes: PSS_PWA_normalizarPermissoes_(acessoAdmin.permissoes),
        observacoes: String(acessoAdmin.observacoes || ''),
        modulos: [
          {
            nome: 'Painel do Administrador',
            url: '#'
          }
        ]
      };
    } else if (acessoAdmin && acessoAdmin.bloqueado) {
      return {
        ok: false,
        erro: acessoAdmin.erro || 'Administrador inativo ou sem permissão de acesso.'
      };
    }
  }

  /** ALUNO / USUÁRIO */
  if (!valido && perfil !== 'ADMIN' && perfil !== 'SUPERADMIN') {
    if (typeof validarAcessoAluno === 'function') {
      try {
        var r = validarAcessoAluno(codigo, senha);

        if (r !== false && r !== null && r !== undefined) {
          valido = true;
          usuario = {
            codigo: codigo,
            nome: PSS_PWA_extrairNome_(r, codigo),
            perfil: 'ALUNO',
            status: 'ATIVO',
            permissoes: ['AREA_ALUNO'],
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
 * Autenticação administrativa compatível com duas fases:
 *
 * FASE NOVA
 *   autenticarAdminCompleto(usuario, senha)
 *   Deve retornar objeto como:
 *   {
 *     ok: true,
 *     id: 'ADM...',
 *     usuario: 'nome',
 *     perfil: 'SUPERADMIN|ADMIN|PROFESSOR|CONSULTA',
 *     status: 'ATIVO',
 *     permissoes: 'TODAS' ou lista,
 *     observacoes: ''
 *   }
 *
 * FASE ANTIGA
 *   validarSenhaAdmin(usuario, senha) retorna true/false.
 */
function PSS_PWA_autenticarAdmin_(codigo, senha) {
  try {
    if (typeof autenticarAdminCompleto === 'function') {
      var detalhado = autenticarAdminCompleto(codigo, senha);

      if (detalhado && typeof detalhado === 'object') {
        var status = String(detalhado.status || 'ATIVO').trim().toUpperCase();
        var ok = detalhado.ok === true || detalhado.sucesso === true || detalhado.valido === true;

        if (ok && status !== 'ATIVO') {
          return {
            ok: false,
            bloqueado: true,
            erro: 'Administrador inativo. Acesso bloqueado.'
          };
        }

        if (ok) {
          return {
            ok: true,
            id: detalhado.id || detalhado.adminId || '',
            usuario: detalhado.usuario || codigo,
            nome: detalhado.nome || detalhado.usuario || codigo,
            perfil: detalhado.perfil || 'ADMIN',
            status: status || 'ATIVO',
            permissoes: detalhado.permissoes !== undefined ? detalhado.permissoes : 'TODAS',
            observacoes: detalhado.observacoes || ''
          };
        }

        if (detalhado.bloqueado || status === 'INATIVO') {
          return {
            ok: false,
            bloqueado: true,
            erro: detalhado.erro || detalhado.mensagem || 'Administrador inativo. Acesso bloqueado.'
          };
        }

        return {
          ok: false,
          erro: detalhado.erro || detalhado.mensagem || 'Credenciais administrativas inválidas.'
        };
      }
    }
  } catch (eDetalhado) {
    // Mantém compatibilidade: se a função nova falhar, tenta o login antigo.
  }

  try {
    if (typeof validarSenhaAdmin === 'function') {
      var antigo = validarSenhaAdmin(codigo, senha);

      if (antigo && typeof antigo === 'object') {
        var statusAntigo = String(antigo.status || 'ATIVO').trim().toUpperCase();
        var okAntigo = antigo.ok === true || antigo.sucesso === true || antigo.valido === true;

        if (okAntigo && statusAntigo !== 'ATIVO') {
          return {
            ok: false,
            bloqueado: true,
            erro: 'Administrador inativo. Acesso bloqueado.'
          };
        }

        if (okAntigo) {
          return {
            ok: true,
            id: antigo.id || antigo.adminId || '',
            usuario: antigo.usuario || codigo,
            nome: antigo.nome || antigo.usuario || codigo,
            perfil: antigo.perfil || 'ADMIN',
            status: statusAntigo || 'ATIVO',
            permissoes: antigo.permissoes !== undefined ? antigo.permissoes : 'TODAS',
            observacoes: antigo.observacoes || ''
          };
        }
      }

      if (antigo === true) {
        return {
          ok: true,
          id: '',
          usuario: codigo,
          nome: codigo.toLowerCase() === 'admin' ? 'Administrador' : codigo,
          perfil: codigo.toLowerCase() === 'admin' ? 'SUPERADMIN' : 'ADMIN',
          status: 'ATIVO',
          permissoes: 'TODAS',
          observacoes: 'Compatibilidade temporária com validarSenhaAdmin() antigo.'
        };
      }
    }
  } catch (eAntigo) {}

  return {
    ok: false,
    erro: 'Código/usuário ou senha inválidos.'
  };
}

/**
 * Padroniza Permissoes para um array.
 * Aceita:
 * - TODAS
 * - string separada por vírgula, ; ou |
 * - array
 */
function PSS_PWA_normalizarPermissoes_(permissoes) {
  if (Array.isArray(permissoes)) {
    return permissoes
      .map(function(v) { return String(v || '').trim().toUpperCase(); })
      .filter(function(v) { return !!v; });
  }

  var texto = String(permissoes === undefined || permissoes === null ? 'TODAS' : permissoes).trim();
  if (!texto) texto = 'TODAS';

  if (texto.toUpperCase() === 'TODAS') {
    return ['TODAS'];
  }

  return texto
    .split(/[;,|]+/)
    .map(function(v) { return String(v || '').trim().toUpperCase(); })
    .filter(function(v) { return !!v; });
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
    var usuario = JSON.parse(raw);

    if (usuario && usuario.status && String(usuario.status).toUpperCase() !== 'ATIVO') {
      CacheService.getScriptCache().remove('PSS_PWA_SESSAO_' + token);
      return {
        ok: false,
        erro: 'Usuário inativo. Sessão encerrada.'
      };
    }

    return {
      ok: true,
      usuario: usuario
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

    html = PSS_PWA_corrigirContadoresFrontend_(html);

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
 * Correção específica do Dashboard:
 * - Avaliações Realizadas recebe provasGeradas;
 * - Provas Geradas recebe avaliacoes/avaliacoesRealizadas.
 *
 * Esta correção atua apenas no HTML entregue à PWA e não altera
 * as planilhas nem os dados gravados.
 */
function PSS_PWA_corrigirContadoresFrontend_(html) {
  html = String(html || '');

  var originalNovo1 = "document.getElementById('stat-provas').innerText = (stats && typeof stats.avaliacoes !== 'undefined') ? stats.avaliacoes : ((stats && typeof stats.avaliacoesRealizadas !== 'undefined') ? stats.avaliacoesRealizadas : 0);";
  var originalNovo2 = "document.getElementById('stat-provas-geradas').innerText = (stats && typeof stats.provasGeradas !== 'undefined') ? stats.provasGeradas : 0;";

  var corrigidoNovo1 = "document.getElementById('stat-provas').innerText = (stats && typeof stats.provasGeradas !== 'undefined') ? stats.provasGeradas : 0;";
  var corrigidoNovo2 = "document.getElementById('stat-provas-geradas').innerText = (stats && typeof stats.avaliacoes !== 'undefined') ? stats.avaliacoes : ((stats && typeof stats.avaliacoesRealizadas !== 'undefined') ? stats.avaliacoesRealizadas : 0);";

  if (html.indexOf(originalNovo1) !== -1) {
    html = html.replace(originalNovo1, corrigidoNovo1);
  }
  if (html.indexOf(originalNovo2) !== -1) {
    html = html.replace(originalNovo2, corrigidoNovo2);
  }

  // Compatibilidade com versões anteriores do Index.
  html = html.replace(
    "document.getElementById('stat-provas').innerText = stats.avaliacoes;",
    "document.getElementById('stat-provas').innerText = stats.provasGeradas;"
  );

  return html;
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
    perfil: 'TESTE',
    status: 'ATIVO',
    permissoes: ['TODAS']
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
