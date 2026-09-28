const cfg = window.APP_CONFIG || {};
const form = document.getElementById("loginForm");
const statusEl = document.getElementById("status");
const painel = document.getElementById("painel");
const modulosEl = document.getElementById("modulos");
const usuarioNome = document.getElementById("usuarioNome");
const btnSair = document.getElementById("btnSair");
const btnEntrar = document.getElementById("btnEntrar");

function setStatus(msg, erro=false){
  statusEl.textContent = msg || "";
  statusEl.style.color = erro ? "#a11" : "#17633a";
}

function renderSessao(sessao){
  form.classList.add("hidden");
  painel.classList.remove("hidden");
  usuarioNome.textContent = sessao.nome || "Usuário";
  modulosEl.innerHTML = "";
  (sessao.modulos || []).forEach(m => {
    const a = document.createElement("a");
    a.className = "modulo";
    a.href = m.url || "#";
    a.textContent = m.nome || "Módulo";
    modulosEl.appendChild(a);
  });
}

function limparSessao(){
  sessionStorage.removeItem("wa_token");
  sessionStorage.removeItem("wa_usuario");
  painel.classList.add("hidden");
  form.classList.remove("hidden");
  form.reset();
}

/*
 * Apps Script faz redirecionamento para googleusercontent e não oferece CORS
 * de forma confiável para fetch() vindo do GitHub Pages.
 * Esta ponte usa POST tradicional para um iframe oculto. O Apps Script devolve
 * uma página mínima que responde ao PWA com window.parent.postMessage().
 */
function api(payload){
  return new Promise((resolve, reject) => {
    if(!cfg.API_URL || cfg.API_URL.includes("COLE_AQUI")){
      reject(new Error("URL do Apps Script ainda não configurada."));
      return;
    }

    const requestId = "wa_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    iframe.name = requestId;
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    const postForm = document.createElement("form");
    postForm.method = "POST";
    postForm.action = cfg.API_URL;
    postForm.target = requestId;
    postForm.style.display = "none";

    const inputPayload = document.createElement("input");
    inputPayload.type = "hidden";
    inputPayload.name = "payload";
    inputPayload.value = JSON.stringify({...payload, requestId});
    postForm.appendChild(inputPayload);
    document.body.appendChild(postForm);

    let finalizado = false;

    function limpar(){
      window.removeEventListener("message", onMessage);
      try { postForm.remove(); } catch(_) {}
      setTimeout(() => { try { iframe.remove(); } catch(_) {} }, 100);
    }

    function onMessage(ev){
      if(finalizado) return;
      const origemOk = ev.origin === "https://script.google.com" ||
                       ev.origin === "https://script.googleusercontent.com" ||
                       ev.origin.endsWith(".googleusercontent.com");
      if(!origemOk) return;

      let data = ev.data;
      try { if(typeof data === "string") data = JSON.parse(data); } catch(_) {}
      if(!data || data.requestId !== requestId) return;

      finalizado = true;
      clearTimeout(timer);
      limpar();
      resolve(data.response || data);
    }

    window.addEventListener("message", onMessage);

    const timer = setTimeout(() => {
      if(finalizado) return;
      finalizado = true;
      limpar();
      reject(new Error("O Apps Script ainda não está com a ponte PWA ativada. Atualize o backend e a implantação."));
    }, 20000);

    postForm.submit();
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  btnEntrar.disabled = true;

  try{
    const codigo = document.getElementById("codigo").value.trim();
    const senha = document.getElementById("senha").value;
    const r = await api({acao:"login", codigo, senha});

    if(!r || !r.ok) throw new Error((r && r.erro) || "Código ou senha inválidos.");

    sessionStorage.setItem("wa_token", r.token || "");
    sessionStorage.setItem("wa_usuario", JSON.stringify(r.usuario || {}));
    renderSessao({
      nome: r.usuario?.nome,
      modulos: r.usuario?.modulos || []
    });
  }catch(err){
    setStatus(err.message || "Erro ao entrar.", true);
  }finally{
    btnEntrar.disabled = false;
  }
});

btnSair.addEventListener("click", async () => {
  const token = sessionStorage.getItem("wa_token");
  try{ if(token) await api({acao:"logout", token}); }catch(_){}
  limparSessao();
});

(async function restaurar(){
  const token = sessionStorage.getItem("wa_token");
  if(!token) return;
  try{
    const r = await api({acao:"validarSessao", token});
    if(!r || !r.ok) return limparSessao();
    renderSessao({nome:r.usuario?.nome, modulos:r.usuario?.modulos || []});
  }catch(_){
    limparSessao();
  }
})();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
