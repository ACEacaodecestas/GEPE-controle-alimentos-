// ============================================================
// ACE - CONTROLE DE ALIMENTOS
// V7 + SUPABASE AUTH
// ============================================================

// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL = "https://jblyzktbngvjqgvejgsa.supabase.co";

// COLE AQUI A SUA SUPABASE PUBLISHABLE KEY
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tLvr-LHX18qGGjGzkFVs6A_Alh83jMm";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


// ============================================================
// 2. BANCO LOCAL TEMPORÁRIO
// ============================================================

const KEY = "controle_alimentos_v1";

const DEFAULT = {
  origins: ["Piedade", "Água Fria"],

  reasons: [
    "Gorgulho",
    "Vencimento",
    "Avaria",
    "Outro"
  ],

  foods: [
    "Açúcar 1 kg",
    "Arroz 1 kg",
    "Café 250g",
    "Café Almofada 250g",
    "Charque",
    "Farinha Mandioca 1kg",
    "Feijão 1kg",
    "Flocão 400G/500g",
    "Leite 200g",
    "Macarrão",
    "Macarrão NINHO/LASANHA",
    "Óleo 900ml",
    "Proteína de Soja 400g",
    "Sal 1kg"
  ],

  people: [
    ["Alexandre Gonçalves Tavares", "43571"],
    ["Angelo Potrichi", "43986"],
    ["Mariella Pompeu", "43983"],
    ["Stefania Márcia Câmara Monteiro", "44134"],
    ["José Airton Martins Filho", "44051"],
    ["André Settinieri", "42705"]
  ].map(([name, registration]) => ({
    id: uid(),
    name,
    registration
  }))
};


// ============================================================
// 3. VARIÁVEIS
// ============================================================

let db = null;
let deferredPrompt = null;
let currentUser = null;
let appStarted = false;


// ============================================================
// 4. FUNÇÕES BÁSICAS
// ============================================================

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
}


function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

let numericIdCounter = 0;

function newNumericId() {
  numericIdCounter = (numericIdCounter + 1) % 1000;
  return Date.now() * 1000 + numericIdCounter;
}

function reasonsStorageKey() {
  return `controle_alimentos_motivos_${currentUser?.id || "anon"}`;
}

function loadLocalReasons() {
  const defaults = DEFAULT.reasons.map(name => ({ id: name, name }));
  try {
    const raw = localStorage.getItem(reasonsStorageKey());
    const saved = raw ? JSON.parse(raw) : [];
    const names = new Map();
    [...defaults, ...(Array.isArray(saved) ? saved : [])].forEach(r => {
      const name = String(r?.name || "").trim();
      if (name) names.set(name.toLowerCase(), { id: name, name });
    });
    return [...names.values()];
  } catch (e) {
    console.warn("Não foi possível carregar os motivos locais:", e);
    return defaults;
  }
}

function saveLocalReasons() {
  try {
    localStorage.setItem(reasonsStorageKey(), JSON.stringify(db?.reasons || []));
  } catch (e) {
    console.warn("Não foi possível salvar os motivos locais:", e);
  }
}


async function loadFromSupabase() {
  if (!currentUser?.id) {
    throw new Error("Usuário não autenticado.");
  }

  // ----------------------------------------------------------
  // O Supabase pode rejeitar um JWT recém-criado por alguns
  // segundos com "JWT issued at future". Isso é uma falha de
  // sincronização de relógio entre Auth/PostgREST. Fazemos UMA
  // renovação e uma nova tentativa antes de informar erro.
  // ----------------------------------------------------------
  async function carregarTabelas() {
    return await Promise.all([
      supabaseClient.from("Pessoas").select("*").order("nome"),
      supabaseClient.from("Alimentos").select("*").order("nome"),
      supabaseClient.from("origens").select("*").order("nome"),
      supabaseClient.from("entradas").select("*").order("data_entrada", { ascending: false }),
      supabaseClient.from("saídas").select("*").order("data_saida", { ascending: false }),
      supabaseClient.from("perdas").select("*").order("data_perda", { ascending: false }),
      supabaseClient.from("presença").select("*").order("data", { ascending: false })
    ]);
  }

  let results = await carregarTabelas();

  let failed = [
    ["Pessoas", results[0]],
    ["Alimentos", results[1]],
    ["origens", results[2]],
    ["entradas", results[3]],
    ["saídas", results[4]],
    ["perdas", results[5]],
    ["presença", results[6]]
  ].find(([, r]) => r.error);

  // ----------------------------------------------------------
  // RETENTATIVA ESPECÍFICA PARA JWT RECÉM-EMITIDO
  // Não apaga nem altera nenhum dado existente.
  // ----------------------------------------------------------
  if (failed && String(failed[1]?.error?.message || "").toLowerCase().includes("jwt issued at future")) {
    console.warn("ACE: JWT emitido no futuro. Renovando sessão e tentando novamente...");

    try {
      await supabaseClient.auth.refreshSession();
    } catch (refreshError) {
      console.warn("ACE: não foi possível renovar a sessão:", refreshError);
    }

    // Pequena tolerância para diferença de relógio entre Auth e PostgREST.
    await new Promise(resolve => setTimeout(resolve, 2000));

    results = await carregarTabelas();

    failed = [
      ["Pessoas", results[0]],
      ["Alimentos", results[1]],
      ["origens", results[2]],
      ["entradas", results[3]],
      ["saídas", results[4]],
      ["perdas", results[5]],
      ["presença", results[6]]
    ].find(([, r]) => r.error);
  }

  if (failed) {
    const err = failed[1].error;
    throw new Error(
      `Falha ao carregar a tabela ${failed[0]}: ${err?.message || "erro desconhecido"}`
    );
  }

  const peopleResult = results[0];
  const foodsResult = results[1];
  const originsResult = results[2];
  const entriesResult = results[3];
  const outputsResult = results[4];
  const lossesResult = results[5];
  const attendanceResult = results[6];

  const people = peopleResult.data || [];
  const foods = foodsResult.data || [];
  const origins = originsResult.data || [];
  const entries = entriesResult.data || [];
  const outputs = outputsResult.data || [];
  const losses = lossesResult.data || [];
  const attendanceRows = attendanceResult.data || [];
  const reasons = loadLocalReasons();

  // IMPORTANTE:
  // Estas consultas NÃO filtram por usuario_id.
  // Assim, qualquer usuário autenticado enxerga o mesmo
  // estoque, entradas, saídas, perdas e cadastros compartilhados.
  const dbSupabase = {
    people: people.map(p => ({
      id: Number(p.id),
      name: p.nome,
      registration: p["matrícula"] ?? p.matricula ?? ""
    })),

    foods: foods.map(f => ({
      id: Number(f.id),
      name: f.nome
    })),

    origins: origins.map(o => ({
      id: Number(o.id),
      name: o.nome
    })),

    entries: entries.map(e => ({
      id: Number(e.id),
      date: e.data_entrada,
      foodId: Number(e.alimento_id),
      qty: Number(e.quantidade || 0),
      originId: Number(e.origem_id),
      note: e.observacao || e.obs || "",
      createdAt: e.created_at || `${e.data_entrada || isoToday()}T00:00:00Z`
    })),

    movements: [
      ...outputs.map(s => ({
        id: `saida-${s.id}`,
        rawId: Number(s.id),
        sourceTable: "saídas",
        date: s.data_saida,
        type: "saida",
        foodId: Number(s.alimento_id),
        qty: Number(s.quantidade || 0),
        originId: Number(s.origem_id),
        reasonId: null,
        note: s.destino || s.observacao || "",
        createdAt: s.created_at || `${s.data_saida || isoToday()}T00:00:00Z`
      })),

      ...losses.map(p => ({
        id: `perda-${p.id}`,
        rawId: Number(p.id),
        sourceTable: "perdas",
        date: p.data_perda,
        type: "perda",
        foodId: Number(p.alimento_id),
        qty: Number(p.quantidade || 0),
        originId: Number(p.origem_id),
        reasonId:
          reasons.find(
            r => r.name.toLowerCase() === String(p.motivo || "").toLowerCase()
          )?.id || p.motivo || null,
        note: p.observacao || p.obs || "",
        createdAt: p.created_at || `${p.data_perda || isoToday()}T00:00:00Z`
      }))
    ],

    attendance: {},
    reasons
  };

  attendanceRows.forEach(row => {
    if (!dbSupabase.attendance[row.data]) {
      dbSupabase.attendance[row.data] = [];
    }

    if (row.present && row.pessoa_id != null) {
      const id = Number(row.pessoa_id);

      if (!dbSupabase.attendance[row.data].includes(id)) {
        dbSupabase.attendance[row.data].push(id);
      }
    }
  });

  return dbSupabase;
}

function save() {
  // Compatibilidade com a estrutura antiga.
  // O banco oficial agora é o Supabase; não usamos localStorage para dados.
  return true;
}


async function reloadFromSupabase(showToast = false) {
  db = await loadFromSupabase();
  renderAll();
  if (showToast) toast("Dados atualizados do Supabase.");
}


function getCurrentUserId() {
  if (!currentUser?.id) {
    throw new Error("Usuário não autenticado.");
  }
  return currentUser.id;
}


async function insertPerson(name, registration) {
  const id = newNumericId();
  const { error } = await supabaseClient.from("Pessoas").insert({ id, nome: name, "matrícula": registration, ativo: true, usuario_id: getCurrentUserId() });
  if (error) throw error;
  return id;
}

async function insertFood(name) {
  const id = newNumericId();
  const { error } = await supabaseClient.from("Alimentos").insert({ id, nome: name, unidade: "unidade", ativo: true, usuario_id: getCurrentUserId() });
  if (error) throw error;
  return id;
}

async function insertOrigin(name) {
  const id = newNumericId();
  const { error } = await supabaseClient.from("origens").insert({ id, nome: name, ativo: true, usuario_id: getCurrentUserId() });
  if (error) throw error;
  return id;
}

async function insertEntry({ date, originId, foodId, qty }) {
  const { error } = await supabaseClient.from("entradas").insert({
    id: newNumericId(), data_entrada: date, alimento_id: Number(foodId), quantidade: qty, origem_id: Number(originId), usuario_id: getCurrentUserId()
  });
  if (error) throw error;
}

async function insertMovement({ date, type, originId, foodId, qty, reasonId, note }) {
  const userId = getCurrentUserId();
  if (type === "saida") {
    const { error } = await supabaseClient.from("saídas").insert({
      id: newNumericId(), data_saida: date, alimento_id: Number(foodId), quantidade: qty, origem_id: Number(originId), destino: note || "", usuario_id: userId
    });
    if (error) throw error;
    return;
  }

  const reasonName = db.reasons.find(r => r.id === reasonId)?.name || reasonId || "Outro";
  const { error } = await supabaseClient.from("perdas").insert({
    id: newNumericId(), data_perda: date, alimento_id: Number(foodId), quantidade: qty, origem_id: Number(originId), motivo: reasonName, usuario_id: userId
  });
  if (error) throw error;
}

async function deletePerson(id) {
  const { error } = await supabaseClient.from("Pessoas").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteFood(id) {
  const { error } = await supabaseClient.from("Alimentos").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteOrigin(id) {
  const { error } = await supabaseClient.from("origens").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteReasonLocalOnly(id) {
  db.reasons = db.reasons.filter(x => x.id !== id);
  saveLocalReasons();
}

async function deleteEntry(id) {
  const { error } = await supabaseClient.from("entradas").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteMovement(id) {
  const movement = db.movements.find(x => x.id === id);
  if (!movement?.rawId || !movement.sourceTable) throw new Error("Não foi possível identificar a movimentação no Supabase.");
  const { error } = await supabaseClient.from(movement.sourceTable).delete().eq("id", Number(movement.rawId));
  if (error) throw error;
}

async function setAttendance(date, personId, present) {
  const table = supabaseClient.from("presença");
  const { data: existing, error: findError } = await table.select("id").eq("data", date).eq("pessoa_id", Number(personId)).limit(1);
  if (findError) throw findError;

  if (present) {
    if (!existing?.length) {
      const { error } = await table.insert({ id: newNumericId(), data: date, pessoa_id: Number(personId), present: true, usuario_id: getCurrentUserId() });
      if (error) throw error;
    }
    return;
  }

  const { error } = await table.delete().eq("data", date).eq("pessoa_id", Number(personId));
  if (error) throw error;
}

async function deleteCadastro(key, id) {
  if (key === "people") return deletePerson(id);
  if (key === "foods") return deleteFood(id);
  if (key === "origins") return deleteOrigin(id);
  if (key === "reasons") return deleteReasonLocalOnly(id);
  throw new Error("Cadastro desconhecido.");
}

function esc(s) {

  return String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

}


function fmt(n) {

  return Number(n || 0).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits: 2
    }
  );

}


function fmtDate(d) {

  return d
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR")
    : "";

}


function getName(arr, id) {

  return arr.find(x => x.id === id)?.name || "—";

}


function toast(msg) {

  const el = document.getElementById("toast");

  if (!el) return;

  el.textContent = msg;

  el.classList.add("show");

  clearTimeout(window._toast);

  window._toast = setTimeout(
    () => el.classList.remove("show"),
    2400
  );

}


// ============================================================
// 5. TELA DE LOGIN
// ============================================================

function createLoginScreen() {

  if (document.getElementById("loginScreen")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "loginStyle";

  style.textContent = `

    #loginScreen{
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:
        linear-gradient(
          135deg,
          #0b3a63 0%,
          #075486 55%,
          #0b3a63 100%
        );
    }

    .login-box{
      width:min(420px,100%);
      background:#fff;
      border-radius:20px;
      padding:30px;
      box-shadow:0 20px 60px rgba(0,0,0,.28);
    }

    .login-logo{
      text-align:center;
      margin-bottom:18px;
    }

    .login-logo img{
      width:150px;
      max-width:70%;
      height:auto;
    }

    .login-title{
      text-align:center;
      color:#0b3a63;
      font-size:27px;
      font-weight:900;
      margin:5px 0;
    }

    .login-subtitle{
      text-align:center;
      color:#667085;
      font-size:14px;
      margin-bottom:25px;
    }

    .login-box label{
      display:flex;
      flex-direction:column;
      gap:6px;
      margin-bottom:14px;
      font-size:13px;
      font-weight:800;
      color:#344054;
    }

    .login-box input{
      width:100%;
      padding:13px;
      border:1px solid #d9e1e8;
      border-radius:10px;
      font-size:15px;
      outline:none;
      box-sizing:border-box;
    }

    .login-box input:focus{
      border-color:#1467a8;
      box-shadow:0 0 0 3px rgba(20,103,168,.12);
    }

    .login-button{
      width:100%;
      padding:13px;
      margin-top:8px;
      border:0;
      border-radius:10px;
      background:#0b3a63;
      color:#fff;
      font-weight:900;
      font-size:15px;
      cursor:pointer;
    }

    .login-button:hover{
      filter:brightness(1.08);
    }

    .login-button:disabled{
      opacity:.65;
      cursor:not-allowed;
    }

    .login-error{
      display:none;
      margin-top:14px;
      padding:11px;
      border-radius:9px;
      background:#fdeceb;
      color:#b42318;
      font-size:13px;
      font-weight:700;
    }

    .login-error.show{
      display:block;
    }

    .login-loading{
      text-align:center;
      color:#667085;
      font-size:13px;
      margin-top:12px;
    }

    .user-bar{
      display:flex;
      align-items:center;
      gap:10px;
      margin-left:auto;
    }

    .user-email{
      font-size:12px;
      opacity:.9;
    }

    .logout-btn{
      border:1px solid rgba(255,255,255,.35);
      background:rgba(255,255,255,.12);
      color:#fff;
      border-radius:8px;
      padding:8px 11px;
      cursor:pointer;
      font-weight:800;
    }

    .logout-btn:hover{
      background:rgba(255,255,255,.22);
    }

    @media(max-width:700px){

      .login-box{
        padding:24px 20px;
      }

      .login-title{
        font-size:24px;
      }

      .user-email{
        display:none;
      }

    }

  `;

  document.head.appendChild(style);


  const login = document.createElement("div");

  login.id = "loginScreen";

  login.innerHTML = `

    <div class="login-box">

      <div class="login-logo">
        <img src="ace-cesta.png" alt="ACE">
      </div>

      <div class="login-title">
        ACE Ação de Cestas
      </div>

      <div class="login-subtitle">
        Controle de Alimentos
      </div>

      <form id="loginForm">

        <label>
          E-mail
          <input
            id="loginEmail"
            type="email"
            placeholder="Digite seu e-mail"
            autocomplete="username"
            required
          >
        </label>

        <label>
          Senha
          <input
            id="loginPassword"
            type="password"
            placeholder="Digite sua senha"
            autocomplete="current-password"
            required
          >
        </label>

        <button
          id="loginButton"
          class="login-button"
          type="submit"
        >
          🔐 Entrar
        </button>

        <div
          id="loginError"
          class="login-error"
        ></div>

        <div
          id="loginLoading"
          class="login-loading"
        ></div>

      </form>

    </div>

  `;

  document.body.appendChild(login);


  document
    .getElementById("loginForm")
    .addEventListener("submit", loginUser);

}


async function loginUser(e) {

  e.preventDefault();

  const email =
    document.getElementById("loginEmail").value.trim();

  const password =
    document.getElementById("loginPassword").value;

  const button =
    document.getElementById("loginButton");

  const error =
    document.getElementById("loginError");

  const loading =
    document.getElementById("loginLoading");


  error.classList.remove("show");

  error.textContent = "";

  button.disabled = true;

  button.textContent = "Entrando...";

  loading.textContent = "Autenticando...";


  try {

    const { data, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


    if (authError) {
      throw authError;
    }


    currentUser = data.user;

    document
      .getElementById("loginScreen")
      .remove();

    initApp();

  } catch (err) {

    console.error(err);

    error.textContent =
      traduzirErroLogin(err);

    error.classList.add("show");

    button.disabled = false;

    button.textContent = "🔐 Entrar";

    loading.textContent = "";

  }

}


function traduzirErroLogin(err) {

  const msg = String(
    err?.message || ""
  ).toLowerCase();


  if (
    msg.includes("invalid login credentials")
  ) {
    return "E-mail ou senha incorretos.";
  }


  if (
    msg.includes("email not confirmed")
  ) {
    return "Este e-mail ainda não foi confirmado.";
  }


  if (
    msg.includes("too many requests")
  ) {
    return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  }


  if (!msg) {
    return "Não foi possível realizar o login.";
  }


  return err.message;

}


// ============================================================
// 6. CONTROLE DO USUÁRIO LOGADO
// ============================================================

function addUserBar() {

  const header =
    document.querySelector(".ace-header-v6");

  if (!header || !currentUser) {
    return;
  }


  if (document.getElementById("userBar")) {
    return;
  }


  const bar = document.createElement("div");

  bar.id = "userBar";

  bar.className = "user-bar";


  bar.innerHTML = `

    <span class="user-email">
      ${esc(currentUser.email)}
    </span>

    <button
      id="logoutBtn"
      class="logout-btn"
      type="button"
    >
      🚪 Sair
    </button>

  `;


  header.appendChild(bar);


  document
    .getElementById("logoutBtn")
    .addEventListener(
      "click",
      logoutUser
    );

}


async function logoutUser() {

  const ok =
    confirm("Deseja sair do sistema?");

  if (!ok) return;


  const { error } =
    await supabaseClient.auth.signOut();


  if (error) {

    console.error(error);

    toast("Não foi possível sair.");

    return;

  }


  location.reload();

}


// ============================================================
// 7. SELECTS
// ============================================================

function populateSelect(
  id,
  arr,
  placeholder = "Selecione..."
) {

  const el =
    document.getElementById(id);

  if (!el) return;


  el.innerHTML =
    `<option value="">${placeholder}</option>` +
    arr
      .map(
        x =>
          `<option value="${x.id}">
            ${esc(x.name)}
          </option>`
      )
      .join("");

}


function setDates() {

  [
    "entryDate",
    "movementDate",
    "dashboardDate",
    "attendanceDate"
  ].forEach(id => {

    const e =
      document.getElementById(id);

    if (e) {
      e.value = isoToday();
    }

  });


  const start =
    document.getElementById("reportStart");

  const end =
    document.getElementById("reportEnd");


  if (start) {
    start.value = isoToday();
  }


  if (end) {
    end.value = isoToday();
  }

}


function refreshSelects() {

  populateSelect(
    "entryOrigin",
    db.origins
  );

  populateSelect(
    "movementOrigin",
    db.origins
  );

  populateSelect(
    "entryFood",
    db.foods
  );

  populateSelect(
    "movementFood",
    db.foods
  );

  populateSelect(
    "movementReason",
    db.reasons
  );


  const reportOrigin =
    document.getElementById(
      "reportOrigin"
    );


  if (reportOrigin) {

    reportOrigin.innerHTML =
      '<option value="">Todas</option>' +
      db.origins
        .map(
          x =>
            `<option value="${x.id}">
              ${esc(x.name)}
            </option>`
        )
        .join("");

  }

}


// ============================================================
// 8. ESTOQUE
// ============================================================

function calcStock() {

  const stock = {};

  db.origins.forEach(
    o => stock[o.id] = {}
  );


  db.foods.forEach(food => {

    db.origins.forEach(origin => {

      stock[origin.id][food.id] = 0;

    });

  });


  db.entries.forEach(entry => {

    if (
      stock[entry.originId] &&
      stock[entry.originId][entry.foodId] != null
    ) {

      stock[entry.originId][entry.foodId] +=
        Number(entry.qty);

    }

  });


  db.movements.forEach(movement => {

    if (
      stock[movement.originId] &&
      stock[movement.originId][movement.foodId] != null
    ) {

      stock[movement.originId][movement.foodId] -=
        Number(movement.qty);

    }

  });


  return stock;

}


// ============================================================
// 9. DASHBOARD
// ============================================================

function renderDashboard() {

  const date =
    document.getElementById(
      "dashboardDate"
    )?.value || isoToday();


  const todayLabel =
    document.getElementById(
      "todayLabel"
    );

  if (todayLabel) {
    todayLabel.textContent =
      fmtDate(date);
  }


  const ent =
    db.entries
      .filter(x => x.date === date)
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const sai =
    db.movements
      .filter(
        x =>
          x.date === date &&
          x.type === "saida"
      )
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const per =
    db.movements
      .filter(
        x =>
          x.date === date &&
          x.type === "perda"
      )
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const st = calcStock();


  const estoque =
    Object.values(st)
      .reduce(
        (a, o) =>
          a +
          Object.values(o)
            .reduce(
              (x, v) =>
                x + Number(v),
              0
            ),
        0
      );


  const pres =
    (db.attendance[date] || [])
      .filter(Boolean)
      .length;


  const ids = [
    ["kpiEntrada", ent],
    ["kpiSaida", sai],
    ["kpiPerda", per],
    ["kpiEstoque", estoque],
    ["kpiPresentes", pres]
  ];


  ids.forEach(([id, value]) => {

    const el =
      document.getElementById(id);

    if (el) {
      el.textContent = fmt(value);
    }

  });


  const originSummary =
    document.getElementById(
      "originSummary"
    );


  if (originSummary) {

    originSummary.innerHTML =
      db.origins
        .map(o => {

          const total =
            Object.values(
              st[o.id] || {}
            ).reduce(
              (a, v) =>
                a + Number(v),
              0
            );


          return `
            <div class="origin-box">

              <div class="origin-title">

                <span>
                  📍 ${esc(o.name)}
                </span>

                <span class="badge">
                  ${fmt(total)}
                </span>

              </div>

              <div class="origin-value">
                ${fmt(total)} itens
              </div>

            </div>
          `;

        })
        .join("");

  }


  const recent =
    document.getElementById(
      "recentMovements"
    );


  if (recent) {

    const all = [

      ...db.entries.map(x => ({
        ...x,
        kind: "Entrada",
        sign: "+",
        color: "green"
      })),

      ...db.movements.map(x => ({
        ...x,
        kind:
          x.type === "perda"
            ? "Perda"
            : "Saída",
        sign: "-",
        color:
          x.type === "perda"
            ? "red"
            : "blue"
      }))

    ]
      .sort(
        (a, b) =>
          (b.createdAt || "")
            .localeCompare(
              a.createdAt || ""
            )
      )
      .slice(0, 8);


    recent.innerHTML =
      all.length

        ? all.map(x => `

            <div class="recent-item">

              <b>
                ${x.sign}
                ${fmt(x.qty)}
                —
                ${esc(
                  getName(
                    db.foods,
                    x.foodId
                  )
                )}
              </b>

              <small>
                ${x.kind}
                •
                ${esc(
                  getName(
                    db.origins,
                    x.originId
                  )
                )}
                •
                ${fmtDate(x.date)}
              </small>

            </div>

          `).join("")

        : `
          <div class="empty">
            Nenhum lançamento ainda.
          </div>
        `;

  }

}


// ============================================================
// 10. ENTRADAS
// ============================================================

function renderEntries() {

  const date =
    document.getElementById(
      "entryDate"
    )?.value || isoToday();


  const arr =
    db.entries
      .filter(
        x => x.date === date
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(
            a.createdAt
          )
      );


  const total =
    arr.reduce(
      (s, x) =>
        s + Number(x.qty),
      0
    );


  const totalEl =
    document.getElementById(
      "entryDayTotal"
    );


  if (totalEl) {
    totalEl.textContent =
      `Total: ${fmt(total)}`;
  }


  const tableEl =
    document.getElementById(
      "entriesTable"
    );


  if (tableEl) {

    tableEl.innerHTML =
      table(
        arr,
        [
          [
            "Data",
            x => fmtDate(x.date)
          ],
          [
            "Origem",
            x =>
              esc(
                getName(
                  db.origins,
                  x.originId
                )
              )
          ],
          [
            "Alimento",
            x =>
              esc(
                getName(
                  db.foods,
                  x.foodId
                )
              )
          ],
          [
            "Qtd",
            x => fmt(x.qty)
          ],
          [
            "Obs.",
            x => esc(x.note || "")
          ]
        ],
        x => removeEntry(x.id)
      );

  }

}


// ============================================================
// 11. MOVIMENTAÇÕES
// ============================================================

function renderMovements() {

  const arr =
    db.movements
      .slice()
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(
            a.createdAt
          )
      );


  const el =
    document.getElementById(
      "movementsTable"
    );


  if (!el) return;


  el.innerHTML =
    table(
      arr,
      [
        [
          "Data",
          x => fmtDate(x.date)
        ],

        [
          "Tipo",
          x =>
            `<span class="pill ${
              x.type === "perda"
                ? "red"
                : "blue"
            }">
              ${
                x.type === "perda"
                  ? "Perda"
                  : "Saída"
              }
            </span>`
        ],

        [
          "Origem",
          x =>
            esc(
              getName(
                db.origins,
                x.originId
              )
            )
        ],

        [
          "Alimento",
          x =>
            esc(
              getName(
                db.foods,
                x.foodId
              )
            )
        ],

        [
          "Qtd",
          x => fmt(x.qty)
        ],

        [
          "Motivo",
          x =>
            esc(
              getName(
                db.reasons,
                x.reasonId
              )
            )
        ],

        [
          "Obs.",
          x =>
            esc(x.note || "")
        ]

      ],
      x => removeMovement(x.id)
    );

}


// ============================================================
// 12. TABELA
// ============================================================

function table(
  arr,
  cols,
  remove
) {

  if (!arr.length) {

    return `
      <div class="empty">
        Nenhum registro encontrado.
      </div>
    `;

  }


  return `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            ${cols
              .map(
                c =>
                  `<th>${c[0]}</th>`
              )
              .join("")}

            <th>Ação</th>

          </tr>

        </thead>

        <tbody>

          ${arr.map(x => `

            <tr>

              ${cols
                .map(
                  c =>
                    `<td>${c[1](x)}</td>`
                )
                .join("")}

              <td>

                <button
                  class="btn danger-btn"
                  data-remove="${x.id}"
                >
                  Excluir
                </button>

              </td>

            </tr>

          `).join("")}

        </tbody>

      </table>

    </div>

  `;

}


async function removeEntry(id) {

  if (!confirm("Excluir esta entrada?")) return;

  try {
    await deleteEntry(id);
    await reloadFromSupabase();
    toast("Entrada excluída.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível excluir a entrada.");
  }

}


async function removeMovement(id) {

  if (!confirm("Excluir esta movimentação?")) return;

  try {
    await deleteMovement(id);
    await reloadFromSupabase();
    toast("Movimentação excluída.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível excluir a movimentação.");
  }

}


// ============================================================
// 13. PRESENÇA
// ============================================================

function renderAttendance() {

  const date =
    document.getElementById("attendanceDate")?.value || isoToday();

  const q =
    (document.getElementById("attendanceSearch")?.value || "").toLowerCase();

  const set = new Set(db.attendance[date] || []);

  const people = db.people.filter(p =>
    (p.name + " " + p.registration).toLowerCase().includes(q)
  );

  const count = document.getElementById("attendanceCount");
  if (count) count.textContent = `${set.size} presentes`;

  const list = document.getElementById("attendanceList");
  if (!list) return;

  list.innerHTML = people.length
    ? people.map(p => `
        <div class="attendance-row">
          <div>
            <div class="person-name">${esc(p.name)}</div>
            <div class="person-reg">Matrícula: ${esc(p.registration)}</div>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              data-person="${p.id}"
              ${set.has(p.id) ? "checked" : ""}
            >
            <span class="slider"></span>
          </label>
        </div>
      `).join("")
    : `<div class="empty">Nenhuma pessoa cadastrada/encontrada.</div>`;

  document.querySelectorAll("[data-person]").forEach(el => {
    el.addEventListener("change", async e => {
      const personId = e.target.dataset.person;
      const present = e.target.checked;
      e.target.disabled = true;

      try {
        await setAttendance(date, personId, present);
        await reloadFromSupabase();
        toast(present ? "Presença registrada." : "Presença removida.");
      } catch (error) {
        console.error(error);
        e.target.checked = !present;
        toast("Não foi possível atualizar a presença.");
      } finally {
        e.target.disabled = false;
      }
    });
  });

}


// ============================================================
// 14. ESTOQUE
// ============================================================

function renderStock() {

  const st = calcStock();


  const cards =
    document.getElementById(
      "stockCards"
    );


  if (cards) {

    cards.innerHTML =
      db.origins
        .map(o => {

          const total =
            Object.values(
              st[o.id] || {}
            ).reduce(
              (a, v) =>
                a + Number(v),
              0
            );


          return `

            <div class="panel">

              <h3>
                📍 ${esc(o.name)}
              </h3>

              <div class="origin-value">
                ${fmt(total)} itens
              </div>

            </div>

          `;

        })
        .join("");

  }


  const rows =
    db.foods
      .map(food => {

        const vals =
          db.origins.map(
            origin =>
              Number(
                st[origin.id]?.[
                  food.id
                ] || 0
              )
          );


        const total =
          vals.reduce(
            (a, v) =>
              a + v,
            0
          );


        return `

          <tr>

            <td>
              ${esc(food.name)}
            </td>

            ${vals
              .map(
                v =>
                  `<td>${fmt(v)}</td>`
              )
              .join("")}

            <td>
              <b>${fmt(total)}</b>
            </td>

          </tr>

        `;

      })
      .join("");


  const tableEl =
    document.getElementById(
      "stockTable"
    );


  if (tableEl) {

    tableEl.innerHTML = `

      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>Alimento</th>

              ${db.origins
                .map(
                  o =>
                    `<th>${esc(o.name)}</th>`
                )
                .join("")}

              <th>Total</th>

            </tr>

          </thead>

          <tbody>

            ${rows}

          </tbody>

        </table>

      </div>

    `;

  }

}


// ============================================================
// 15. RELATÓRIO
// ============================================================

function renderReport() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value || "";

  const end =
    document.getElementById(
      "reportEnd"
    )?.value || "";

  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value || "";


  const entries =
    db.entries.filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    );


  const mov =
    db.movements.filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    );


  const presentDates =
    Object.entries(
      db.attendance
    ).filter(
      ([d]) =>
        (!start || d >= start) &&
        (!end || d <= end)
    );


  const html = `

    <div class="cards">

      <div class="card">

        <span>Entradas</span>

        <strong>
          ${fmt(
            entries.reduce(
              (s, x) =>
                s + Number(x.qty),
              0
            )
          )}
        </strong>

      </div>

      <div class="card">

        <span>Saídas</span>

        <strong>
          ${fmt(
            mov
              .filter(
                x =>
                  x.type === "saida"
              )
              .reduce(
                (s, x) =>
                  s + Number(x.qty),
                0
              )
          )}
        </strong>

      </div>

      <div class="card danger">

        <span>Perdas</span>

        <strong>
          ${fmt(
            mov
              .filter(
                x =>
                  x.type === "perda"
              )
              .reduce(
                (s, x) =>
                  s + Number(x.qty),
                0
              )
          )}
        </strong>

      </div>

      <div class="card">

        <span>Dias com presença</span>

        <strong>
          ${presentDates.length}
        </strong>

      </div>

    </div>

    <h3>Entradas</h3>

    ${
      entries.length

        ? table(
            entries,
            [
              [
                "Data",
                x => fmtDate(x.date)
              ],
              [
                "Origem",
                x =>
                  esc(
                    getName(
                      db.origins,
                      x.originId
                    )
                  )
              ],
              [
                "Alimento",
                x =>
                  esc(
                    getName(
                      db.foods,
                      x.foodId
                    )
                  )
              ],
              [
                "Qtd",
                x => fmt(x.qty)
              ],
              [
                "Obs.",
                x =>
                  esc(
                    x.note || ""
                  )
              ]
            ],
            () => {}
          )

        : `
          <div class="empty">
            Sem entradas no período.
          </div>
        `
    }

    <h3>Saídas e perdas</h3>

    ${
      mov.length

        ? table(
            mov,
            [
              [
                "Data",
                x => fmtDate(x.date)
              ],
              [
                "Tipo",
                x =>
                  esc(
                    x.type === "perda"
                      ? "Perda"
                      : "Saída"
                  )
              ],
              [
                "Origem",
                x =>
                  esc(
                    getName(
                      db.origins,
                      x.originId
                    )
                  )
              ],
              [
                "Alimento",
                x =>
                  esc(
                    getName(
                      db.foods,
                      x.foodId
                    )
                  )
              ],
              [
                "Qtd",
                x => fmt(x.qty)
              ],
              [
                "Motivo",
                x =>
                  esc(
                    getName(
                      db.reasons,
                      x.reasonId
                    )
                  )
              ]
            ],
            () => {}
          )

        : `
          <div class="empty">
            Sem movimentações no período.
          </div>
        `
    }

  `;


  const result =
    document.getElementById(
      "reportResult"
    );


  if (result) {
    result.innerHTML = html;
  }

}


// ============================================================
// 16. CADASTROS
// ============================================================

function renderCadastros() {

  const people =
    document.getElementById(
      "peopleTable"
    );


  if (people) {

    people.innerHTML = `

      <div class="mini-list">

        ${
          db.people
            .map(
              p => `

                <div class="mini-row">

                  <span>

                    <b>
                      ${esc(p.name)}
                    </b>

                    <br>

                    <small>
                      ${esc(p.registration)}
                    </small>

                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-person="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
          ||
          `
            <div class="empty">
              Nenhuma pessoa.
            </div>
          `
        }

      </div>

    `;

  }


  const foods =
    document.getElementById(
      "foodsTable"
    );


  if (foods) {

    foods.innerHTML = `

      <div class="mini-list">

        ${
          db.foods
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-food="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  const origins =
    document.getElementById(
      "originsTable"
    );


  if (origins) {

    origins.innerHTML = `

      <div class="mini-list">

        ${
          db.origins
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-origin="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  const reasons =
    document.getElementById(
      "reasonsTable"
    );


  if (reasons) {

    reasons.innerHTML = `

      <div class="mini-list">

        ${
          db.reasons
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-reason="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  document
    .querySelectorAll(
      "[data-del-person]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "people",
              b.dataset.delPerson
            )
    );


  document
    .querySelectorAll(
      "[data-del-food]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "foods",
              b.dataset.delFood
            )
    );


  document
    .querySelectorAll(
      "[data-del-origin]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "origins",
              b.dataset.delOrigin
            )
    );


  document
    .querySelectorAll(
      "[data-del-reason]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "reasons",
              b.dataset.delReason
            )
    );

}


async function delBy(key, id) {

  if (!confirm("Excluir cadastro? Registros históricos que já usam este item continuarão salvos.")) {
    return;
  }

  try {
    await deleteCadastro(key, id);
    await reloadFromSupabase();
    toast("Cadastro excluído.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível excluir o cadastro. Verifique se ele possui registros vinculados.");
  }

}


// ============================================================
// 17. CSV
// ============================================================

function csvEscape(v) {

  return `"${String(v ?? "")
    .replace(/"/g, '""')}"`;

}


function exportCSV() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value || "";

  const end =
    document.getElementById(
      "reportEnd"
    )?.value || "";

  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value || "";


  const rows = [
    [
      "Data",
      "Tipo",
      "Origem",
      "Alimento",
      "Quantidade",
      "Motivo",
      "Observação"
    ]
  ];


  db.entries
    .filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    )
    .forEach(
      x =>
        rows.push([
          x.date,
          "Entrada",
          getName(
            db.origins,
            x.originId
          ),
          getName(
            db.foods,
            x.foodId
          ),
          x.qty,
          "",
          x.note || ""
        ])
    );


  db.movements
    .filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    )
    .forEach(
      x =>
        rows.push([
          x.date,
          x.type === "perda"
            ? "Perda"
            : "Saída",
          getName(
            db.origins,
            x.originId
          ),
          getName(
            db.foods,
            x.foodId
          ),
          x.qty,
          getName(
            db.reasons,
            x.reasonId
          ),
          x.note || ""
        ])
    );


  const blob =
    new Blob(
      [
        "\ufeff" +
        rows
          .map(
            r =>
              r
                .map(csvEscape)
                .join(";")
          )
          .join("\n")
      ],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );


  download(
    blob,
    `relatorio_${start || "inicio"}_${end || "fim"}.csv`
  );

}


function download(
  blob,
  name
) {

  const a =
    document.createElement(
      "a"
    );

  a.href =
    URL.createObjectURL(blob);

  a.download = name;

  a.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        a.href
      ),
    1000
  );

}


// ============================================================
// 18. NAVEGAÇÃO
// ============================================================

function nav() {

  document
    .querySelectorAll(
      ".tab,.home-card"
    )
    .forEach(
      b =>
        b.addEventListener(
          "click",
          () => {

            const page =
              b.dataset.page;


            document
              .querySelectorAll(
                ".tab"
              )
              .forEach(
                x =>
                  x.classList.toggle(
                    "active",
                    x.dataset.page === page
                  )
              );


            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                x =>
                  x.classList.remove(
                    "active"
                  )
              );


            const target =
              document.getElementById(
                page
              );


            if (target) {
              target.classList.add(
                "active"
              );
            }


            window.scrollTo({
              top: 0,
              behavior: "smooth"
            });

          }
        )
    );


  const menu =
    document.getElementById(
      "menuButton"
    );


  if (menu) {

    menu.addEventListener(
      "click",
      () => {

        const tabs =
          document.querySelector(
            ".ace-tabs"
          );


        if (tabs) {
          tabs.classList.toggle(
            "menu-open"
          );
        }

      }
    );

  }

}


// ============================================================
// 19. EVENTOS DO APLICATIVO
// ============================================================

function bindEvents() {

  const entryForm = document.getElementById("entryForm");

  if (entryForm) {
    entryForm.addEventListener("submit", async e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const date = f.get("date");
      const originId = f.get("origin");
      const foodId = f.get("foodId");
      const qty = Number(f.get("qty"));
      const note = String(f.get("note") || "").trim();

      if (!date || !originId || !foodId || !Number.isFinite(qty) || qty <= 0) {
        toast("Preencha os dados da entrada corretamente.");
        return;
      }

      const submit = e.target.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;

      try {
        await insertEntry({ date, originId, foodId, qty, note });
        await reloadFromSupabase();
        e.target.reset();
        document.getElementById("entryDate").value = isoToday();
        renderEntries();
        toast("Entrada registrada no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro na entrada: " + (error?.message || "verifique o Supabase."));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }


  const movementForm = document.getElementById("movementForm");

  if (movementForm) {
    movementForm.addEventListener("submit", async e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const date = f.get("date");
      const type = f.get("type");
      const originId = f.get("origin");
      const foodId = f.get("foodId");
      const qty = Number(f.get("qty"));
      const reasonId = f.get("reasonId");
      const note = String(f.get("note") || "").trim();

      if (!date || !type || !originId || !foodId || !Number.isFinite(qty) || qty <= 0) {
        toast("Preencha os dados da movimentação corretamente.");
        return;
      }

      const st = calcStock();
      const available = Number(st[originId]?.[foodId] || 0);

      if (qty > available) {
        toast(`Saldo insuficiente. Disponível em ${getName(db.origins, originId)}: ${fmt(available)}.`);
        return;
      }

      if (type === "perda" && !reasonId) {
        toast("Selecione o motivo da perda.");
        return;
      }

      const submit = e.target.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;

      try {
        await insertMovement({ date, type, originId, foodId, qty, reasonId, note });
        await reloadFromSupabase();
        e.target.reset();
        document.getElementById("movementDate").value = isoToday();
        renderAll();
        toast(type === "perda" ? "Perda registrada no Supabase." : "Saída registrada no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro na movimentação: " + (error?.message || "verifique o Supabase."));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }


  const dashboardDate = document.getElementById("dashboardDate");
  if (dashboardDate) dashboardDate.addEventListener("change", renderDashboard);

  const entryDate = document.getElementById("entryDate");
  if (entryDate) entryDate.addEventListener("change", renderEntries);

  const attendanceDate = document.getElementById("attendanceDate");
  if (attendanceDate) attendanceDate.addEventListener("change", renderAttendance);

  const attendanceSearch = document.getElementById("attendanceSearch");
  if (attendanceSearch) attendanceSearch.addEventListener("input", renderAttendance);

  const refreshStock = document.getElementById("refreshStock");
  if (refreshStock) {
    refreshStock.addEventListener("click", async () => {
      try {
        await reloadFromSupabase();
        toast("Estoque atualizado.");
      } catch (error) {
        console.error(error);
        toast("Não foi possível atualizar o estoque.");
      }
    });
  }

  const generateReport = document.getElementById("generateReport");
  if (generateReport) generateReport.addEventListener("click", renderReport);

  const exportCSVButton = document.getElementById("exportCSV");
  if (exportCSVButton) exportCSVButton.addEventListener("click", exportCSV);


  const personForm = document.getElementById("personForm");
  if (personForm) {
    personForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();
      const registration = String(f.get("registration") || "").trim();

      if (!name || !registration) {
        toast("Informe nome e matrícula.");
        return;
      }

      try {
        await insertPerson(name, registration);
        await reloadFromSupabase();
        e.target.reset();
        toast("Pessoa cadastrada no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar pessoa: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  const foodForm = document.getElementById("foodForm");
  if (foodForm) {
    foodForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o nome do alimento.");
        return;
      }

      try {
        await insertFood(name);
        await reloadFromSupabase();
        e.target.reset();
        toast("Alimento cadastrado no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar alimento: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  const originForm = document.getElementById("originForm");
  if (originForm) {
    originForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o nome da origem.");
        return;
      }

      try {
        await insertOrigin(name);
        await reloadFromSupabase();
        e.target.reset();
        toast("Origem cadastrada no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar origem: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  // Motivos continuam sendo os quatro padrões do aplicativo.
  // Não há tabela de motivos no esquema utilizado pelo app_corrigido.
  const reasonForm = document.getElementById("reasonForm");
  if (reasonForm) {
    reasonForm.addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o motivo.");
        return;
      }

      if (db.reasons.some(r => r.name.toLowerCase() === name.toLowerCase())) {
        toast("Esse motivo já existe.");
        return;
      }

      db.reasons.push({ id: name, name });
      saveLocalReasons();
      e.target.reset();
      renderAll();
      toast("Motivo adicionado nesta sessão.");
    });
  }


  const backupBtn = document.getElementById("backupBtn");
  if (backupBtn) {
    backupBtn.addEventListener("click", () => {
      download(
        new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
        `backup_controle_alimentos_${isoToday()}.json`
      );
    });
  }


  const restoreFile = document.getElementById("restoreFile");
  if (restoreFile) {
    restoreFile.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const obj = JSON.parse(await file.text());
        await restoreCloudBackup(obj);
        await reloadFromSupabase();
        toast("Backup restaurado no Supabase.");
      } catch (error) {
        console.error(error);
        alert("Não foi possível restaurar este arquivo no Supabase.\n\n" + (error?.message || "Verifique o backup e as permissões."));
      }

      e.target.value = "";
    });
  }


  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Atualizar os dados deste aparelho com o conteúdo atual do Supabase?")) return;

      try {
        await reloadFromSupabase(true);
      } catch (error) {
        console.error(error);
        toast("Não foi possível atualizar os dados.");
      }
    });
  }

}


async function restoreCloudBackup(obj) {
  if (!obj || !obj.foods || !obj.origins || !obj.entries) {
    throw new Error("Arquivo de backup inválido.");
  }

  const userId = getCurrentUserId();

  // O backup usa o mesmo formato interno que o aplicativo exibe.
  if (Array.isArray(obj.people) && obj.people.length) {
    const rows = obj.people.map(p => ({
      id: Number.isSafeInteger(Number(p.id)) ? Number(p.id) : newNumericId(),
      nome: p.name,
      "matrícula": p.registration,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("Pessoas").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.foods) && obj.foods.length) {
    const rows = obj.foods.map(f => ({
      id: Number.isSafeInteger(Number(f.id)) ? Number(f.id) : newNumericId(),
      nome: f.name,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("Alimentos").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.origins) && obj.origins.length) {
    const rows = obj.origins.map(o => ({
      id: Number.isSafeInteger(Number(o.id)) ? Number(o.id) : newNumericId(),
      nome: o.name,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("origens").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.entries) && obj.entries.length) {
    const rows = obj.entries.map(e => ({
      id: Number.isSafeInteger(Number(e.id)) ? Number(e.id) : newNumericId(),
      data_entrada: e.date,
      alimento_id: e.foodId,
      quantidade: Number(e.qty || 0),
      origem_id: e.originId,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("entradas").upsert(rows);
    if (error) throw error;
  }

  const outputs = (obj.movements || []).filter(m => m.type === "saida");
  if (outputs.length) {
    const rows = outputs.map(m => ({
      id: Number.isSafeInteger(Number(m.rawId)) ? Number(m.rawId) : newNumericId(),
      data_saida: m.date,
      alimento_id: m.foodId,
      quantidade: Number(m.qty || 0),
      origem_id: m.originId,
      destino: m.note || "",
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("saídas").upsert(rows);
    if (error) throw error;
  }

  const losses = (obj.movements || []).filter(m => m.type === "perda");
  if (losses.length) {
    const rows = losses.map(m => ({
      id: Number.isSafeInteger(Number(m.rawId)) ? Number(m.rawId) : newNumericId(),
      data_perda: m.date,
      alimento_id: m.foodId,
      quantidade: Number(m.qty || 0),
      origem_id: m.originId,
      motivo: db.reasons.find(r => r.id === m.reasonId)?.name || m.reasonId || "Outro",
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("perdas").upsert(rows);
    if (error) throw error;
  }

  // Presença é restaurada sem depender de uma chave composta.
  for (const [date, peopleIds] of Object.entries(obj.attendance || {})) {
    for (const personId of peopleIds || []) {
      await setAttendance(date, personId, true);
    }
  }
}


// ============================================================
// 20. PWA
// ============================================================

function setupPWA() {

  window.addEventListener(
    "beforeinstallprompt",
    e => {

      e.preventDefault();

      deferredPrompt = e;


      const button =
        document.getElementById(
          "installBtn"
        );


      if (button) {
        button.classList.remove(
          "hidden"
        );
      }

    }
  );


  const installBtn =
    document.getElementById(
      "installBtn"
    );


  if (installBtn) {

    installBtn.addEventListener(
      "click",
      async () => {

        if (!deferredPrompt) {
          return;
        }


        deferredPrompt.prompt();

        deferredPrompt = null;

        installBtn.classList.add(
          "hidden"
        );

      }
    );

  }


  if (
    "serviceWorker" in navigator
  ) {

    window.addEventListener(
      "load",
      () => {

        navigator.serviceWorker
          .register("sw.js")
          .catch(
            err =>
              console.warn(
                "Service Worker:",
                err
              )
          );

      }
    );

  }

}


// ============================================================
// 21. RENDERIZAÇÃO GERAL
// ============================================================

function renderAll() {

  refreshSelects();

  renderDashboard();

  renderEntries();

  renderMovements();

  renderAttendance();

  renderStock();

  renderCadastros();

}


// ============================================================
// 22. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  if (appStarted) return;
  appStarted = true;

  console.log(
    "ACE Controle de Alimentos iniciado."
  );


  try {

    db = await loadFromSupabase();


    setDates();

    nav();

    bindEvents();

    setupPWA();

    addUserBar();

    renderAll();


    console.log(
      "Aplicativo carregado com sucesso."
    );

  } catch (error) {

    appStarted = false;

    console.error(
      "Erro ao iniciar aplicativo:",
      error
    );

    alert(
      "Não foi possível carregar os dados do sistema.\n\n" +
      (error?.message || "Verifique a conexão com o Supabase.")
    );

  }

}


// ============================================================
// 23. VERIFICA LOGIN
// ============================================================

async function startAuth() {

  createLoginScreen();


  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {
      throw error;
    }


    if (data?.session?.user) {

      currentUser =
        data.session.user;


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      initApp();

      return;

    }


    // Não está logado.
    // Mantém a tela de login aberta.

  } catch (err) {

    console.error(
      "Erro ao verificar sessão:",
      err
    );


    const error =
      document.getElementById(
        "loginError"
      );


    if (error) {

      error.textContent =
        "Não foi possível conectar ao Supabase. Verifique a URL e a Publishable Key.";

      error.classList.add(
        "show"
      );

    }

  }


  // Monitora alterações de autenticação

  supabaseClient.auth.onAuthStateChange(
    (event, session) => {

      if (
        event === "SIGNED_IN" &&
        session?.user
      ) {

        currentUser =
          session.user;

        document
          .getElementById(
            "loginScreen"
          )
          ?.remove();

        initApp();

      }


      if (
        event === "SIGNED_OUT"
      ) {

        location.reload();

      }

    }
  );

}


// ============================================================
// 24. INÍCIO
// ============================================================

startAuth();
