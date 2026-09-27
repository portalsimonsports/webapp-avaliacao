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

async function api(payload){
  if(!cfg.API_URL || cfg.API_URL.includes("COLE_AQUI")){
    throw new Error("URL do Apps Script ainda não configurada.");
  }

  const resp = await fetch(cfg.API_URL, {
    method: "POST",
    headers: {"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(payload),
    redirect: "follow"
  });

  if(!resp.ok) throw new Error("Falha de comunicação com o servidor.");
  return resp.json();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  btnEntrar.disabled = true;

  try{
    const codigo = document.getElementById("codigo").value.trim();
    const senha = document.getElementById("senha").value;

    const r = await api({acao:"login", codigo, senha});

    if(!r.ok) throw new Error(r.erro || "Código ou senha inválidos.");

    sessionStorage.setItem("wa_token", r.token);
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
  try{
    if(token) await api({acao:"logout", token});
  }catch(_){}
  limparSessao();
});

(async function restaurar(){
  const token = sessionStorage.getItem("wa_token");
  if(!token) return;

  try{
    const r = await api({acao:"validarSessao", token});
    if(!r.ok) return limparSessao();
    renderSessao({
      nome: r.usuario?.nome,
      modulos: r.usuario?.modulos || []
    });
  }catch(_){
    limparSessao();
  }
})();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
