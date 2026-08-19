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
    "Gorbulho",
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


function load() {

  try {

    const raw = localStorage.getItem(KEY);

    if (raw) {
      return JSON.parse(raw);
    }

  } catch (e) {

    console.error("Erro ao carregar dados locais:", e);

  }

  return {
    origins: DEFAULT.origins.map(x => ({
      id: uid(),
      name: x
    })),

    reasons: DEFAULT.reasons.map(x => ({
      id: uid(),
      name: x
    })),

    foods: DEFAULT.foods.map(x => ({
      id: uid(),
      name: x
    })),

    people: DEFAULT.people,

    entries: [],

    movements: [],

    attendance: {}
  };
}


function save() {

  try {

    localStorage.setItem(
      KEY,
      JSON.stringify(db)
    );

  } catch (e) {

    console.error("Erro ao salvar:", e);

  }
}


// ============================================================
// 4.1 CARREGAMENTO DOS DADOS DO SUPABASE
// ============================================================

async function loadFromSupabase() {

  if (!currentUser) {
    throw new Error("Usuário não autenticado.");
  }

  console.log("Carregando dados do Supabase...");

  try {

    // ----------------------------------------------------------
    // PESSOAS
    // ----------------------------------------------------------

    const { data: people, error: peopleError } =
      await supabaseClient
        .from("Pessoas")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("nome");

    if (peopleError) throw peopleError;


    // ----------------------------------------------------------
    // ALIMENTOS
    // ----------------------------------------------------------

    const { data: foods, error: foodsError } =
      await supabaseClient
        .from("Alimentos")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("nome");

    if (foodsError) throw foodsError;


    // ----------------------------------------------------------
    // ORIGENS
    // ----------------------------------------------------------

    const { data: origins, error: originsError } =
      await supabaseClient
        .from("origens")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("nome");

    if (originsError) throw originsError;


    // ----------------------------------------------------------
    // ENTRADAS
    // ----------------------------------------------------------

    const { data: entries, error: entriesError } =
      await supabaseClient
        .from("entradas")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("data_entrada", { ascending: false });

    if (entriesError) throw entriesError;


    // ----------------------------------------------------------
    // SAÍDAS
    // ----------------------------------------------------------

    const { data: outputs, error: outputsError } =
      await supabaseClient
        .from("saídas")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("data_saida", { ascending: false });

    if (outputsError) throw outputsError;


    // ----------------------------------------------------------
    // PERDAS
    // ----------------------------------------------------------

    const { data: losses, error: lossesError } =
      await supabaseClient
        .from("perdas")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("data_perda", { ascending: false });

    if (lossesError) throw lossesError;


    // ----------------------------------------------------------
    // PRESENÇA
    // ----------------------------------------------------------

    const { data: attendanceRows, error: attendanceError } =
      await supabaseClient
        .from("presença")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .order("data", { ascending: false });

    if (attendanceError) throw attendanceError;


    // ----------------------------------------------------------
    // MOTIVOS
    // Não existe tabela de motivos no Supabase neste momento.
    // Portanto, os motivos permanecem no cadastro local do app.
    // ----------------------------------------------------------

    const reasons = DEFAULT.reasons.map(name => ({
      id: name,
      name
    }));


    // ----------------------------------------------------------
    // CONVERSÃO PARA O FORMATO QUE O APP JÁ UTILIZA
    // ----------------------------------------------------------

    const dbSupabase = {

      people: (people || []).map(p => ({
        id: p.id,
        name: p.nome,
        registration: p["matrícula"]
      })),

      foods: (foods || []).map(f => ({
        id: f.id,
        name: f.nome
      })),

      origins: (origins || []).map(o => ({
        id: o.id,
        name: o.nome
      })),

      entries: (entries || []).map(e => ({
        id: e.id,
        date: e.data_entrada,
        foodId: e.alimento_id,
        qty: Number(e.quantidade || 0),
        originId: e.origem_id,
        note: "",
        createdAt: e.created_at || new Date().toISOString()
      })),

      movements: [

        ...(outputs || []).map(s => ({
          id: "saida-" + s.id,
          date: s.data_saida,
          type: "saida",
          foodId: s.alimento_id,
          qty: Number(s.quantidade || 0),
          originId: s.origem_id,
          reasonId: null,
          note: s.destino || "",
          createdAt: s.created_at || new Date().toISOString()
        })),

        ...(losses || []).map(p => ({
          id: "perda-" + p.id,
          date: p.data_perda,
          type: "perda",
          foodId: p.alimento_id,
          qty: Number(p.quantidade || 0),
          originId: p.origem_id,
          reasonId: reasons.find(r => r.name === p.motivo)?.id || p.motivo || null,
          note: "",
          createdAt: p.created_at || new Date().toISOString()
        }))

      ],

      attendance: {},

      reasons
    };


    // ----------------------------------------------------------
    // ORGANIZAR PRESENÇA POR DATA
    // ----------------------------------------------------------

    (attendanceRows || []).forEach(row => {

      if (!dbSupabase.attendance[row.data]) {
        dbSupabase.attendance[row.data] = [];
      }

      if (row.present) {
        dbSupabase.attendance[row.data].push(row.pessoa_id);
      }

    });


    console.log("Dados carregados do Supabase:", dbSupabase);

    return dbSupabase;

  } catch (error) {

    console.error("Erro ao carregar dados do Supabase:", error);

    throw error;
  }

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


function removeEntry(id) {

  if (
    !confirm(
      "Excluir esta entrada?"
    )
  ) return;


  db.entries =
    db.entries.filter(
      x => x.id !== id
    );


  save();

  renderAll();

  toast(
    "Entrada excluída."
  );

}


function removeMovement(id) {

  if (
    !confirm(
      "Excluir esta movimentação?"
    )
  ) return;


  db.movements =
    db.movements.filter(
      x => x.id !== id
    );


  save();

  renderAll();

  toast(
    "Movimentação excluída."
  );

}


// ============================================================
// 13. PRESENÇA
// ============================================================

function renderAttendance() {

  const date =
    document.getElementById(
      "attendanceDate"
    )?.value || isoToday();


  const q =
    (
      document.getElementById(
        "attendanceSearch"
      )?.value || ""
    ).toLowerCase();


  const set =
    new Set(
      db.attendance[date] || []
    );


  const people =
    db.people.filter(
      p =>
        (
          p.name +
          " " +
          p.registration
        )
          .toLowerCase()
          .includes(q)
    );


  const count =
    document.getElementById(
      "attendanceCount"
    );


  if (count) {
    count.textContent =
      `${set.size} presentes`;
  }


  const list =
    document.getElementById(
      "attendanceList"
    );


  if (!list) return;


  list.innerHTML =
    people.length

      ? people
          .map(
            p => `

              <div class="attendance-row">

                <div>

                  <div class="person-name">
                    ${esc(p.name)}
                  </div>

                  <div class="person-reg">
                    Matrícula:
                    ${esc(p.registration)}
                  </div>

                </div>

                <label class="switch">

                  <input
                    type="checkbox"
                    data-person="${p.id}"
                    ${
                      set.has(p.id)
                        ? "checked"
                        : ""
                    }
                  >

                  <span class="slider"></span>

                </label>

              </div>

            `
          )
          .join("")

      : `
        <div class="empty">
          Nenhuma pessoa cadastrada/encontrada.
        </div>
      `;


  document
    .querySelectorAll(
      "[data-person]"
    )
    .forEach(el => {

      el.addEventListener(
        "change",
        e => {

          const a =
            new Set(
              db.attendance[date] || []
            );


          if (e.target.checked) {

            a.add(
              e.target.dataset.person
            );

          } else {

            a.delete(
              e.target.dataset.person
            );

          }


          db.attendance[date] =
            [...a];


          save();

          renderAttendance();

          renderDashboard();

        }
      );

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


function delBy(
  key,
  id
) {

  if (
    !confirm(
      "Excluir cadastro? Registros históricos que já usam este item continuarão salvos."
    )
  ) {
    return;
  }


  db[key] =
    db[key].filter(
      x => x.id !== id
    );


  save();

  renderAll();

  toast(
    "Cadastro excluído."
  );

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

  const entryForm =
    document.getElementById(
      "entryForm"
    );


  if (entryForm) {

    entryForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        db.entries.push({

          id: uid(),

          date:
            f.get("date"),

          originId:
            f.get("origin"),

          foodId:
            f.get("foodId"),

          qty:
            Number(
              f.get("qty")
            ),

          note:
            f.get("note") || "",

          createdAt:
            new Date()
              .toISOString()

        });


        save();

        e.target.reset();

        document.getElementById(
          "entryDate"
        ).value = isoToday();

        renderAll();

        toast(
          "Entrada registrada."
        );

      }
    );

  }


  const movementForm =
    document.getElementById(
      "movementForm"
    );


  if (movementForm) {

    movementForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        const origin =
          f.get("origin");

        const food =
          f.get("foodId");

        const qty =
          Number(
            f.get("qty")
          );


        const st =
          calcStock();


        const available =
          Number(
            st[origin]?.[food] || 0
          );


        if (qty > available) {

          toast(
            `Saldo insuficiente. Disponível em ${getName(
              db.origins,
              origin
            )}: ${fmt(available)}.`
          );

          return;

        }


        db.movements.push({

          id: uid(),

          date:
            f.get("date"),

          type:
            f.get("type"),

          originId:
            origin,

          foodId:
            food,

          qty:
            qty,

          reasonId:
            f.get("reasonId"),

          note:
            f.get("note") || "",

          createdAt:
            new Date()
              .toISOString()

        });


        save();

        e.target.reset();

        document.getElementById(
          "movementDate"
        ).value = isoToday();

        renderAll();

        toast(
          "Movimentação registrada."
        );

      }
    );

  }


  const dashboardDate =
    document.getElementById(
      "dashboardDate"
    );


  if (dashboardDate) {

    dashboardDate.addEventListener(
      "change",
      renderDashboard
    );

  }


  const entryDate =
    document.getElementById(
      "entryDate"
    );


  if (entryDate) {

    entryDate.addEventListener(
      "change",
      renderEntries
    );

  }


  const attendanceDate =
    document.getElementById(
      "attendanceDate"
    );


  if (attendanceDate) {

    attendanceDate.addEventListener(
      "change",
      renderAttendance
    );

  }


  const attendanceSearch =
    document.getElementById(
      "attendanceSearch"
    );


  if (attendanceSearch) {

    attendanceSearch.addEventListener(
      "input",
      renderAttendance
    );

  }


  const refreshStock =
    document.getElementById(
      "refreshStock"
    );


  if (refreshStock) {

    refreshStock.addEventListener(
      "click",
      () => {

        renderStock();

        toast(
          "Estoque atualizado."
        );

      }
    );

  }


  const generateReport =
    document.getElementById(
      "generateReport"
    );


  if (generateReport) {

    generateReport.addEventListener(
      "click",
      renderReport
    );

  }


  const exportCSVButton =
    document.getElementById(
      "exportCSV"
    );


  if (exportCSVButton) {

    exportCSVButton.addEventListener(
      "click",
      exportCSV
    );

  }


  const personForm =
    document.getElementById(
      "personForm"
    );


  if (personForm) {

    personForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        db.people.push({

          id: uid(),

          name:
            f.get("name")
              .trim(),

          registration:
            f.get("registration")
              .trim()

        });


        save();

        e.target.reset();

        renderAll();

        toast(
          "Pessoa cadastrada."
        );

      }
    );

  }


  const foodForm =
    document.getElementById(
      "foodForm"
    );


  if (foodForm) {

    foodForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        db.foods.push({

          id: uid(),

          name:
            f.get("name")
              .trim()

        });


        save();

        e.target.reset();

        renderAll();

        toast(
          "Alimento cadastrado."
        );

      }
    );

  }


  const originForm =
    document.getElementById(
      "originForm"
    );


  if (originForm) {

    originForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        db.origins.push({

          id: uid(),

          name:
            f.get("name")
              .trim()

        });


        save();

        e.target.reset();

        renderAll();

        toast(
          "Origem cadastrada."
        );

      }
    );

  }


  const reasonForm =
    document.getElementById(
      "reasonForm"
    );


  if (reasonForm) {

    reasonForm.addEventListener(
      "submit",
      e => {

        e.preventDefault();

        const f =
          new FormData(
            e.target
          );


        db.reasons.push({

          id: uid(),

          name:
            f.get("name")
              .trim()

        });


        save();

        e.target.reset();

        renderAll();

        toast(
          "Motivo cadastrado."
        );

      }
    );

  }


  const backupBtn =
    document.getElementById(
      "backupBtn"
    );


  if (backupBtn) {

    backupBtn.addEventListener(
      "click",
      () =>
        download(
          new Blob(
            [
              JSON.stringify(
                db,
                null,
                2
              )
            ],
            {
              type:
                "application/json"
            }
          ),
          `backup_controle_alimentos_${isoToday()}.json`
        )
    );

  }


  const restoreFile =
    document.getElementById(
      "restoreFile"
    );


  if (restoreFile) {

    restoreFile.addEventListener(
      "change",
      async e => {

        const file =
          e.target.files[0];

        if (!file) return;


        try {

          const obj =
            JSON.parse(
              await file.text()
            );


          if (
            !obj.foods ||
            !obj.origins ||
            !obj.entries
          ) {

            throw Error(
              "Arquivo inválido"
            );

          }


          db = obj;

          save();

          renderAll();

          toast(
            "Backup restaurado."
          );


        } catch (err) {

          console.error(err);

          alert(
            "Não foi possível restaurar este arquivo."
          );

        }


        e.target.value = "";

      }
    );

  }


  const resetBtn =
    document.getElementById(
      "resetBtn"
    );


  if (resetBtn) {

    resetBtn.addEventListener(
      "click",
      () => {

        if (
          !confirm(
            "Isso apagará os dados atuais deste aparelho. Tem certeza?"
          )
        ) {
          return;
        }


        localStorage.removeItem(
          KEY
        );


        db = load();

        setDates();

        renderAll();

        toast(
          "Dados padrão restaurados."
        );

      }
    );

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
