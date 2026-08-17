// ============================================================
// ACE - CONTROLE DE ALIMENTOS
// V7 + SUPABASE AUTH + BANCO COMPARTILHADO
// ============================================================

// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL =
  "https://jblyzktbngvjqgvejgsa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_tLvr-LHX18qGGjGzkFVs6A_Alh83jMm";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


// ============================================================
// 2. CONFIGURAÇÕES
// ============================================================

const KEY =
  "controle_alimentos_v1";

const DEFAULT = {

  origins: [
    "Piedade",
    "Água Fria"
  ],

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
  ].map(
    ([name, registration]) => ({
      id: uid(),
      name,
      registration
    })
  )
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

  if (
    window.crypto &&
    typeof window.crypto.randomUUID ===
      "function"
  ) {
    return window.crypto.randomUUID();
  }

  return (
    Date.now() +
    "-" +
    Math.random()
      .toString(16)
      .slice(2)
  );
}


function isoToday() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


// ============================================================
// ID NUMÉRICO
// IMPORTANTE:
// As tabelas do Supabase usam int8.
// Portanto NÃO usamos UUID para os IDs das tabelas.
// ============================================================

let numericIdCounter = 0;

function newNumericId() {

  numericIdCounter =
    (numericIdCounter + 1) %
    1000;

  return (
    Date.now() * 1000 +
    numericIdCounter
  );

}


// ============================================================
// MOTIVOS
// CONTINUAM LOCAIS COMO NA V7.
// NÃO CRIAMOS TABELA MOTIVOS.
// ============================================================

function reasonsStorageKey() {

  return (
    "controle_alimentos_motivos_" +
    (currentUser?.id || "anon")
  );

}


function loadLocalReasons() {

  const defaults =
    DEFAULT.reasons.map(
      name => ({
        id: name,
        name
      })
    );

  try {

    const raw =
      localStorage.getItem(
        reasonsStorageKey()
      );

    const saved =
      raw
        ? JSON.parse(raw)
        : [];

    const names =
      new Map();

    [
      ...defaults,
      ...(Array.isArray(saved)
        ? saved
        : [])
    ].forEach(r => {

      const name =
        String(
          r?.name || ""
        ).trim();

      if (name) {

        names.set(
          name.toLowerCase(),
          {
            id: name,
            name
          }
        );

      }

    });

    return [
      ...names.values()
    ];

  } catch (error) {

    console.warn(
      "Erro ao carregar motivos:",
      error
    );

    return defaults;

  }

}


function saveLocalReasons() {

  try {

    localStorage.setItem(
      reasonsStorageKey(),
      JSON.stringify(
        db?.reasons || []
      )
    );

  } catch (error) {

    console.warn(
      "Erro ao salvar motivos:",
      error
    );

  }

}


// ============================================================
// 5. CARREGAR BANCO DO SUPABASE
//
// ATENÇÃO:
// NÃO FILTRAMOS PELO usuario_id.
//
// O banco é compartilhado.
// usuario_id serve para saber QUEM fez a operação.
// ============================================================

async function loadFromSupabase() {

  if (!currentUser?.id) {

    throw new Error(
      "Usuário não autenticado."
    );

  }

  const [
    peopleResult,
    foodsResult,
    originsResult,
    entriesResult,
    outputsResult,
    lossesResult,
    attendanceResult
  ] =
    await Promise.all([

      supabaseClient
        .from("Pessoas")
        .select("*")
        .order("nome"),

      supabaseClient
        .from("Alimentos")
        .select("*")
        .order("nome"),

      supabaseClient
        .from("origens")
        .select("*")
        .order("nome"),

      supabaseClient
        .from("entradas")
        .select("*")
        .order(
          "data_entrada",
          {
            ascending: false
          }
        ),

      supabaseClient
        .from("saídas")
        .select("*")
        .order(
          "data_saida",
          {
            ascending: false
          }
        ),

      supabaseClient
        .from("perdas")
        .select("*")
        .order(
          "data_perda",
          {
            ascending: false
          }
        ),

      supabaseClient
        .from("presença")
        .select("*")
        .order(
          "data",
          {
            ascending: false
          }
        )

    ]);


  const results = [

    [
      "Pessoas",
      peopleResult
    ],

    [
      "Alimentos",
      foodsResult
    ],

    [
      "origens",
      originsResult
    ],

    [
      "entradas",
      entriesResult
    ],

    [
      "saídas",
      outputsResult
    ],

    [
      "perdas",
      lossesResult
    ],

    [
      "presença",
      attendanceResult
    ]

  ];


  const failed =
    results.find(
      ([, result]) =>
        result.error
    );


  if (failed) {

    const [
      tableName,
      result
    ] = failed;

    throw new Error(
      `Erro ao carregar ${tableName}: ${
        result.error.message
      }`
    );

  }


  const people =
    peopleResult.data || [];

  const foods =
    foodsResult.data || [];

  const origins =
    originsResult.data || [];

  const entries =
    entriesResult.data || [];

  const outputs =
    outputsResult.data || [];

  const losses =
    lossesResult.data || [];

  const attendanceRows =
    attendanceResult.data || [];


  const reasons =
    loadLocalReasons();


  // ==========================================================
  // CONVERTER SUPABASE → FORMATO USADO PELO APP
  // ==========================================================

  const dbSupabase = {

    people:
      people.map(
        p => ({
          id: Number(p.id),

          name:
            p.nome,

          registration:
            p["matrícula"] ??
            p.matricula ??
            ""
        })
      ),


    foods:
      foods.map(
        f => ({
          id: Number(f.id),

          name:
            f.nome
        })
      ),


    origins:
      origins.map(
        o => ({
          id: Number(o.id),

          name:
            o.nome
        })
      ),


    entries:
      entries.map(
        e => ({

          id:
            Number(e.id),

          date:
            e.data_entrada,

          foodId:
            Number(
              e.alimento_id
            ),

          qty:
            Number(
              e.quantidade || 0
            ),

          originId:
            Number(
              e.origem_id
            ),

          note:
            e.observacao ||
            e.obs ||
            "",

          createdAt:
            e.created_at ||
            `${e.data_entrada || isoToday()}T00:00:00Z`

        })
      ),


    movements: [

      // ------------------------------------------------------
      // SAÍDAS
      // ------------------------------------------------------

      ...outputs.map(
        s => ({

          id:
            "saida-" +
            s.id,

          rawId:
            Number(s.id),

          sourceTable:
            "saídas",

          date:
            s.data_saida,

          type:
            "saida",

          foodId:
            Number(
              s.alimento_id
            ),

          qty:
            Number(
              s.quantidade || 0
            ),

          originId:
            Number(
              s.origem_id
            ),

          reasonId:
            null,

          note:
            s.destino ||
            s.observacao ||
            "",

          createdAt:
            s.created_at ||
            `${s.data_saida || isoToday()}T00:00:00Z`

        })
      ),


      // ------------------------------------------------------
      // PERDAS
      // ------------------------------------------------------

      ...losses.map(
        p => ({

          id:
            "perda-" +
            p.id,

          rawId:
            Number(p.id),

          sourceTable:
            "perdas",

          date:
            p.data_perda,

          type:
            "perda",

          foodId:
            Number(
              p.alimento_id
            ),

          qty:
            Number(
              p.quantidade || 0
            ),

          originId:
            Number(
              p.origem_id
            ),

          reasonId:
            reasons.find(
              r =>
                r.name
                  .toLowerCase() ===
                String(
                  p.motivo || ""
                ).toLowerCase()
            )?.id ||
            p.motivo ||
            null,

          note:
            p.observacao ||
            p.obs ||
            "",

          createdAt:
            p.created_at ||
            `${p.data_perda || isoToday()}T00:00:00Z`

        })
      )

    ],


    attendance: {},


    reasons

  };


  // ==========================================================
  // PRESENÇA
  // ==========================================================

  attendanceRows.forEach(
    row => {

      if (
        !dbSupabase
          .attendance[
            row.data
          ]
      ) {

        dbSupabase
          .attendance[
            row.data
          ] = [];

      }


      if (
        row.present &&
        row.pessoa_id != null
      ) {

        const personId =
          Number(
            row.pessoa_id
          );


        if (
          !dbSupabase
            .attendance[
              row.data
            ]
            .includes(
              personId
            )
        ) {

          dbSupabase
            .attendance[
              row.data
            ]
            .push(
              personId
            );

        }

      }

    }
  );


  return dbSupabase;

}


// ============================================================
// COMPATIBILIDADE
// NÃO USAMOS localStorage COMO BANCO.
// ============================================================

function save() {

  return true;

}


// ============================================================
// RECARREGAR DADOS
// ============================================================

async function reloadFromSupabase(
  showToast = false
) {

  db =
    await loadFromSupabase();

  renderAll();

  if (showToast) {

    toast(
      "Dados atualizados."
    );

  }

}


// ============================================================
// USUÁRIO ATUAL
// ============================================================

function getCurrentUserId() {

  if (!currentUser?.id) {

    throw new Error(
      "Usuário não autenticado."
    );

  }

  return currentUser.id;

}


// ============================================================
// CADASTRO DE PESSOA
// ============================================================

async function insertPerson(
  name,
  registration
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .insert({

        id,

        nome:
          name,

        "matrícula":
          registration,

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// CADASTRO DE ALIMENTO
// ============================================================

async function insertFood(
  name
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("Alimentos")
      .insert({

        id,

        nome:
          name,

        unidade:
          "unidade",

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// CADASTRO DE ORIGEM
// ============================================================

async function insertOrigin(
  name
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("origens")
      .insert({

        id,

        nome:
          name,

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// ENTRADA
// ============================================================

async function insertEntry({
  date,
  originId,
  foodId,
  qty
}) {

  const {
    error
  } =
    await supabaseClient
      .from("entradas")
      .insert({

        id:
          newNumericId(),

        data_entrada:
          date,

        alimento_id:
          Number(foodId),

        quantidade:
          Number(qty),

        origem_id:
          Number(originId),

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// SAÍDA / PERDA
// ============================================================

async function insertMovement({
  date,
  type,
  originId,
  foodId,
  qty,
  reasonId,
  note
}) {

  const userId =
    getCurrentUserId();


  // ----------------------------------------------------------
  // SAÍDA
  // ----------------------------------------------------------

  if (
    type === "saida"
  ) {

    const {
      error
    } =
      await supabaseClient
        .from("saídas")
        .insert({

          id:
            newNumericId(),

          data_saida:
            date,

          alimento_id:
            Number(foodId),

          quantidade:
            Number(qty),

          origem_id:
            Number(originId),

          destino:
            note || "",

          usuario_id:
            userId

        });


    if (error) {

      throw error;

    }

    return;

  }


  // ----------------------------------------------------------
  // PERDA
  // ----------------------------------------------------------

  const reasonName =
    db.reasons.find(
      r =>
        r.id === reasonId
    )?.name ||
    reasonId ||
    "Outro";


  const {
    error
  } =
    await supabaseClient
      .from("perdas")
      .insert({

        id:
          newNumericId(),

        data_perda:
          date,

        alimento_id:
          Number(foodId),

        quantidade:
          Number(qty),

        origem_id:
          Number(originId),

        motivo:
          reasonName,

        usuario_id:
          userId

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// EXCLUSÕES
// ============================================================

async function deletePerson(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteFood(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("Alimentos")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteOrigin(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("origens")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteEntry(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("entradas")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteMovement(
  id
) {

  const movement =
    db.movements.find(
      x =>
        x.id === id
    );


  if (
    !movement?.rawId ||
    !movement.sourceTable
  ) {

    throw new Error(
      "Não foi possível identificar a movimentação."
    );

  }


  const {
    error
  } =
    await supabaseClient
      .from(
        movement.sourceTable
      )
      .delete()
      .eq(
        "id",
        Number(
          movement.rawId
        )
      );


  if (error) {

    throw error;

  }

}


// ============================================================
// MOTIVOS — SOMENTE LOCAL
// ============================================================

async function deleteReasonLocalOnly(
  id
) {

  db.reasons =
    db.reasons.filter(
      x =>
        x.id !== id
    );

  saveLocalReasons();

}


// ============================================================
// PRESENÇA
// ============================================================

async function setAttendance(
  date,
  personId,
  present
) {

  const table =
    supabaseClient
      .from("presença");


  const {
    data: existing,
    error: findError
  } =
    await table
      .select("id")
      .eq(
        "data",
        date
      )
      .eq(
        "pessoa_id",
        Number(personId)
      )
      .limit(1);


  if (findError) {

    throw findError;

  }


  if (present) {

    if (
      !existing?.length
    ) {

      const {
        error
      } =
        await table
          .insert({

            id:
              newNumericId(),

            data:
              date,

            pessoa_id:
              Number(
                personId
              ),

            present:
              true,

            usuario_id:
              getCurrentUserId()

          });


      if (error) {

        throw error;

      }

    }

    return;

  }


  const {
    error
  } =
    await table
      .delete()
      .eq(
        "data",
        date
      )
      .eq(
        "pessoa_id",
        Number(personId)
      );


  if (error) {

    throw error;

  }

}


// ============================================================
// DELETE GENÉRICO
// ============================================================

async function deleteCadastro(
  key,
  id
) {

  if (
    key === "people"
  ) {

    return deletePerson(id);

  }


  if (
    key === "foods"
  ) {

    return deleteFood(id);

  }


  if (
    key === "origins"
  ) {

    return deleteOrigin(id);

  }


  if (
    key === "reasons"
  ) {

    return deleteReasonLocalOnly(
      id
    );

  }


  throw new Error(
    "Cadastro desconhecido."
  );

}


// ============================================================
// UTILITÁRIOS
// ============================================================

function esc(s) {

  return String(
    s ?? ""
  ).replace(
    /[&<>"']/g,
    m =>
      ({
        "&":
          "&amp;",
        "<":
          "&lt;",
        ">":
          "&gt;",
        '"':
          "&quot;",
        "'":
          "&#039;"
      }[m])
  );

}


function fmt(n) {

  return Number(
    n || 0
  ).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits:
        2
    }
  );

}


function fmtDate(d) {

  return d
    ? new Date(
        d +
          "T12:00:00"
      ).toLocaleDateString(
        "pt-BR"
      )
    : "";

}


// ============================================================
// CORREÇÃO IMPORTANTE:
// IDs vindos dos SELECTS são strings.
// IDs vindos do Supabase são números.
// ============================================================

function getName(
  arr,
  id
) {

  const numericId =
    Number(id);

  return (
    arr.find(
      x =>
        Number(x.id) ===
        numericId
    )?.name ||
    "—"
  );

}


function toast(msg) {

  const el =
    document.getElementById(
      "toast"
    );

  if (!el) return;


  el.textContent =
    msg;

  el.classList.add(
    "show"
  );


  clearTimeout(
    window._toast
  );


  window._toast =
    setTimeout(
      () =>
        el.classList.remove(
          "show"
        ),
      2400
    );

}


// ============================================================
// 5. TELA DE LOGIN
// ============================================================

function createLoginScreen() {

  if (
    document.getElementById(
      "loginScreen"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "loginStyle";


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
      box-shadow:
        0 20px 60px
        rgba(0,0,0,.28);
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
      box-shadow:
        0 0 0 3px
        rgba(20,103,168,.12);
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
      border:
        1px solid
        rgba(255,255,255,.35);
      background:
        rgba(255,255,255,.12);
      color:#fff;
      border-radius:8px;
      padding:8px 11px;
      cursor:pointer;
      font-weight:800;
    }

    .logout-btn:hover{
      background:
        rgba(255,255,255,.22);
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


  document.head.appendChild(
    style
  );


  const login =
    document.createElement(
      "div"
    );


  login.id =
    "loginScreen";


  login.innerHTML = `

    <div class="login-box">

      <div class="login-logo">

        <img
          src="ace-cesta.png"
          alt="ACE"
        >

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


  document.body.appendChild(
    login
  );


  document
    .getElementById(
      "loginForm"
    )
    .addEventListener(
      "submit",
      loginUser
    );

}


async function loginUser(e) {

  e.preventDefault();


  const email =
    document
      .getElementById(
        "loginEmail"
      )
      .value
      .trim();


  const password =
    document.getElementById(
      "loginPassword"
    ).value;


  const button =
    document.getElementById(
      "loginButton"
    );


  const error =
    document.getElementById(
      "loginError"
    );


  const loading =
    document.getElementById(
      "loginLoading"
    );


  error.classList.remove(
    "show"
  );

  error.textContent =
    "";


  button.disabled =
    true;

  button.textContent =
    "Entrando...";

  loading.textContent =
    "Autenticando...";


  try {

    const {
      data,
      error: authError
    } =
      await supabaseClient
        .auth
        .signInWithPassword({

          email,

          password

        });


    if (authError) {

      throw authError;

    }


    currentUser =
      data.user;


    document
      .getElementById(
        "loginScreen"
      )
      ?.remove();


    await initApp();


  } catch (err) {

    console.error(
      err
    );


    error.textContent =
      traduzirErroLogin(
        err
      );


    error.classList.add(
      "show"
    );


    button.disabled =
      false;

    button.textContent =
      "🔐 Entrar";

    loading.textContent =
      "";

  }

}


function traduzirErroLogin(
  err
) {

  const msg =
    String(
      err?.message ||
      ""
    ).toLowerCase();


  if (
    msg.includes(
      "invalid login credentials"
    )
  ) {

    return (
      "E-mail ou senha incorretos."
    );

  }


  if (
    msg.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Este e-mail ainda não foi confirmado."
    );

  }


  if (
    msg.includes(
      "too many requests"
    )
  ) {

    return (
      "Muitas tentativas. Aguarde um pouco e tente novamente."
    );

  }


  if (!msg) {

    return (
      "Não foi possível realizar o login."
    );

  }


  return err.message;

}


// ============================================================
// 6. USUÁRIO LOGADO
// ============================================================

function addUserBar() {

  const header =
    document.querySelector(
      ".ace-header-v6"
    );


  if (
    !header ||
    !currentUser
  ) {

    return;

  }


  if (
    document.getElementById(
      "userBar"
    )
  ) {

    return;

  }


  const bar =
    document.createElement(
      "div"
    );


  bar.id =
    "userBar";

  bar.className =
    "user-bar";


  bar.innerHTML = `

    <span class="user-email">

      ${esc(
        currentUser.email
      )}

    </span>

    <button
      id="logoutBtn"
      class="logout-btn"
      type="button"
    >
      🚪 Sair
    </button>

  `;


  header.appendChild(
    bar
  );


  document
    .getElementById(
      "logoutBtn"
    )
    .addEventListener(
      "click",
      logoutUser
    );

}


async function logoutUser() {

  const ok =
    confirm(
      "Deseja sair do sistema?"
    );


  if (!ok) {

    return;

  }


  const {
    error
  } =
    await supabaseClient
      .auth
      .signOut();


  if (error) {

    console.error(
      error
    );

    toast(
      "Não foi possível sair."
    );

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
  placeholder =
    "Selecione..."
) {

  const el =
    document.getElementById(
      id
    );


  if (!el) {

    return;

  }


  el.innerHTML =
    `<option value="">
      ${placeholder}
    </option>` +

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
  ].forEach(
    id => {

      const e =
        document.getElementById(
          id
        );


      if (e) {

        e.value =
          isoToday();

      }

    }
  );


  const start =
    document.getElementById(
      "reportStart"
    );


  const end =
    document.getElementById(
      "reportEnd"
    );


  if (start) {

    start.value =
      isoToday();

  }


  if (end) {

    end.value =
      isoToday();

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
    origin => {

      stock[
        Number(origin.id)
      ] = {};

    }
  );


  db.foods.forEach(
    food => {

      db.origins.forEach(
        origin => {

          stock[
            Number(origin.id)
          ][
            Number(food.id)
          ] = 0;

        }
      );

    }
  );


  db.entries.forEach(
    entry => {

      const originId =
        Number(
          entry.originId
        );

      const foodId =
        Number(
          entry.foodId
        );


      if (
        stock[originId] &&
        stock[originId][
          foodId
        ] != null
      ) {

        stock[originId][foodId] +=
          Number(
            entry.qty
          );

      }

    }
  );


  db.movements.forEach(
    movement => {

      const originId =
        Number(
          movement.originId
        );

      const foodId =
        Number(
          movement.foodId
        );


      if (
        stock[originId] &&
        stock[originId][
          foodId
        ] != null
      ) {

        stock[originId][foodId] -=
          Number(
            movement.qty
          );

      }

    }
  );


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
      .filter(
        x => x.date === date
      )
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


  const st =
    calcStock();


  const estoque =
    Object.values(st)
      .reduce(
        (total, origem) =>
          total +
          Object.values(origem)
            .reduce(
              (soma, valor) =>
                soma +
                Number(valor),
              0
            ),
        0
      );


  const pres =
    (
      db.attendance[date] ||
      []
    ).length;


  const ids = [

    [
      "kpiEntrada",
      ent
    ],

    [
      "kpiSaida",
      sai
    ],

    [
      "kpiPerda",
      per
    ],

    [
      "kpiEstoque",
      estoque
    ],

    [
      "kpiPresentes",
      pres
    ]

  ];


  ids.forEach(
    ([id, value]) => {

      const el =
        document.getElementById(
          id
        );

      if (el) {

        el.textContent =
          fmt(value);

      }

    }
  );


  // ----------------------------------------------------------
  // RESUMO POR ORIGEM
  // ----------------------------------------------------------

  const originSummary =
    document.getElementById(
      "originSummary"
    );


  if (originSummary) {

    originSummary.innerHTML =
      db.origins
        .map(
          origin => {

            const total =
              Object.values(
                st[
                  Number(
                    origin.id
                  )
                ] || {}
              ).reduce(
                (a, v) =>
                  a +
                  Number(v),
                0
              );


            return `

              <div class="origin-box">

                <div class="origin-title">

                  <span>
                    📍
                    ${esc(
                      origin.name
                    )}
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

          }
        )
        .join("");

  }


  // ----------------------------------------------------------
  // MOVIMENTAÇÕES RECENTES
  // ----------------------------------------------------------

  const recent =
    document.getElementById(
      "recentMovements"
    );


  if (recent) {

    const all = [

      ...db.entries.map(
        x => ({

          ...x,

          kind:
            "Entrada",

          sign:
            "+"

        })
      ),

      ...db.movements.map(
        x => ({

          ...x,

          kind:
            x.type === "perda"
              ? "Perda"
              : "Saída",

          sign:
            "-"

        })
      )

    ]
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      )
      .slice(
        0,
        8
      );


    recent.innerHTML =
      all.length

        ? all
            .map(
              x => `

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
                    ${fmtDate(
                      x.date
                    )}

                  </small>

                </div>

              `
            )
            .join("")

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
    )?.value ||
    isoToday();


  const arr =
    db.entries
      .filter(
        x =>
          x.date === date
      )
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  const total =
    arr.reduce(
      (s, x) =>
        s +
        Number(x.qty),
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


  if (!tableEl) {

    return;

  }


  tableEl.innerHTML =
    table(

      arr,

      [

        [
          "Data",
          x =>
            fmtDate(
              x.date
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
          x =>
            fmt(x.qty)
        ],

        [
          "Obs.",
          x =>
            esc(
              x.note || ""
            )
        ]

      ],

      x =>
        removeEntry(
          x.id
        )

    );

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
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  const el =
    document.getElementById(
      "movementsTable"
    );


  if (!el) {

    return;

  }


  el.innerHTML =
    table(

      arr,

      [

        [
          "Data",
          x =>
            fmtDate(
              x.date
            )
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
          x =>
            fmt(x.qty)
        ],

        [
          "Motivo",
          x =>
            x.type === "perda"
              ? esc(
                  getName(
                    db.reasons,
                    x.reasonId
                  )
                )
              : "—"
        ],

        [
          "Obs.",
          x =>
            esc(
              x.note || ""
            )
        ]

      ],

      x =>
        removeMovement(
          x.id
        )

    );

}


// ============================================================
// 12. TABELA GENÉRICA
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

          ${arr
            .map(
              x => `

                <tr>

                  ${cols
                    .map(
                      c =>
                        `<td>
                          ${c[1](x)}
                        </td>`
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

              `
            )
            .join("")}

        </tbody>

      </table>

    </div>

  `;

}


// ============================================================
// 13. EXCLUIR ENTRADA
// ============================================================

async function removeEntry(
  id
) {

  if (
    !confirm(
      "Excluir esta entrada?"
    )
  ) {

    return;

  }


  try {

    const {
      error
    } =
      await supabaseClient
        .from("entradas")
        .delete()
        .eq(
          "id",
          Number(id)
        );


    if (error) {

      throw error;

    }


    await reloadFromSupabase(
      false
    );


    toast(
      "Entrada excluída."
    );


  } catch (error) {

    console.error(
      error
    );


    toast(
      "Erro ao excluir entrada: " +
      (
        error?.message ||
        "erro desconhecido"
      )
    );

  }

}


// ============================================================
// 14. EXCLUIR MOVIMENTAÇÃO
// ============================================================

async function removeMovement(
  id
) {

  if (
    !confirm(
      "Excluir esta movimentação?"
    )
  ) {

    return;

  }


  try {

    const movement =
      db.movements.find(
        x =>
          x.id === id
      );


    if (
      !movement ||
      !movement.rawId ||
      !movement.sourceTable
    ) {

      throw new Error(
        "Movimentação não encontrada."
      );

    }


    const {
      error
    } =
      await supabaseClient
        .from(
          movement.sourceTable
        )
        .delete()
        .eq(
          "id",
          Number(
            movement.rawId
          )
        );


    if (error) {

      throw error;

    }


    await reloadFromSupabase(
      false
    );


    toast(
      "Movimentação excluída."
    );


  } catch (error) {

    console.error(
      error
    );


    toast(
      "Erro ao excluir: " +
      (
        error?.message ||
        "erro desconhecido"
      )
    );

  }

}


// ============================================================
// 15. PRESENÇA
// ============================================================

async function renderAttendance() {

  const date =
    document.getElementById(
      "attendanceDate"
    )?.value ||
    isoToday();


  const q =
    (
      document.getElementById(
        "attendanceSearch"
      )?.value ||
      ""
    )
      .toLowerCase()
      .trim();


  const set =
    new Set(
      (
        db.attendance[
          date
        ] || []
      ).map(
        id =>
          Number(id)
      )
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


  if (!list) {

    return;

  }


  list.innerHTML =
    people.length

      ? people
          .map(
            p => `

              <div
                class="attendance-row"
              >

                <div>

                  <div
                    class="person-name"
                  >
                    ${esc(p.name)}
                  </div>

                  <div
                    class="person-reg"
                  >
                    Matrícula:
                    ${esc(
                      p.registration
                    )}
                  </div>

                </div>

                <label
                  class="switch"
                >

                  <input
                    type="checkbox"
                    data-person="${p.id}"
                    ${
                      set.has(
                        Number(
                          p.id
                        )
                      )
                        ? "checked"
                        : ""
                    }
                  >

                  <span
                    class="slider"
                  ></span>

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
    .forEach(
      el => {

        el.onchange =
          async event => {

            const pessoaId =
              Number(
                event.target
                  .dataset
                  .person
              );


            try {

              const {
                data: existing,
                error:
                  findError
              } =
                await supabaseClient
                  .from(
                    "presença"
                  )
                  .select(
                    "id"
                  )
                  .eq(
                    "pessoa_id",
                    pessoaId
                  )
                  .eq(
                    "data",
                    date
                  )
                  .limit(1);


              if (findError) {

                throw findError;

              }


              if (
                event.target.checked
              ) {

                if (
                  !existing ||
                  !existing.length
                ) {

                  const {
                    error
                  } =
                    await supabaseClient
                      .from(
                        "presença"
                      )
                      .insert({

                        id:
                          newNumericId(),

                        pessoa_id:
                          pessoaId,

                        data:
                          date,

                        present:
                          true,

                        usuario_id:
                          getCurrentUserId()

                      });


                  if (error) {

                    throw error;

                  }

                }

              } else {

                const {
                  error
                } =
                  await supabaseClient
                    .from(
                      "presença"
                    )
                    .delete()
                    .eq(
                      "pessoa_id",
                      pessoaId
                    )
                    .eq(
                      "data",
                      date
                    );


                if (error) {

                  throw error;

                }

              }


              await reloadFromSupabase(
                false
              );


            } catch (error) {

              console.error(
                error
              );


              event.target.checked =
                !event.target.checked;


              toast(
                "Erro na presença: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );

}


// ============================================================
// 16. ESTOQUE
// ============================================================

function renderStock() {

  const st =
    calcStock();


  const cards =
    document.getElementById(
      "stockCards"
    );


  if (cards) {

    cards.innerHTML =
      db.origins
        .map(
          origin => {

            const total =
              Object.values(
                st[
                  Number(
                    origin.id
                  )
                ] || {}
              )
                .reduce(
                  (a, v) =>
                    a +
                    Number(v),
                  0
                );


            return `

              <div class="panel">

                <h3>
                  📍
                  ${esc(
                    origin.name
                  )}
                </h3>

                <div
                  class="origin-value"
                >
                  ${fmt(total)}
                  itens
                </div>

              </div>

            `;

          }
        )
        .join("");

  }


  const rows =
    db.foods
      .map(
        food => {

          const vals =
            db.origins.map(
              origin =>
                Number(
                  st[
                    Number(
                      origin.id
                    )
                  ]?.[
                    Number(
                      food.id
                    )
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
                ${esc(
                  food.name
                )}
              </td>

              ${vals
                .map(
                  value =>
                    `<td>
                      ${fmt(value)}
                    </td>`
                )
                .join("")}

              <td>
                <b>
                  ${fmt(total)}
                </b>
              </td>

            </tr>

          `;

        }
      )
      .join("");


  const tableEl =
    document.getElementById(
      "stockTable"
    );


  if (tableEl) {

    tableEl.innerHTML = `

      <div
        class="table-wrap"
      >

        <table>

          <thead>

            <tr>

              <th>
                Alimento
              </th>

              ${db.origins
                .map(
                  origin =>
                    `<th>
                      ${esc(
                        origin.name
                      )}
                    </th>`
                )
                .join("")}

              <th>
                Total
              </th>

            </tr>

          </thead>

          <tbody>

            ${
              rows ||
              `
                <tr>
                  <td
                    colspan="${
                      db.origins.length +
                      2
                    }"
                  >
                    Nenhum alimento cadastrado.
                  </td>
                </tr>
              `
            }

          </tbody>

        </table>

      </div>

    `;

  }

}


// ============================================================
// 17. RELATÓRIO
// ============================================================

function renderReport() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value ||
    "";


  const end =
    document.getElementById(
      "reportEnd"
    )?.value ||
    "";


  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value ||
    "";


  const entries =
    db.entries.filter(
      x =>

        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          Number(
            x.originId
          ) ===
            Number(origin))

    );


  const mov =
    db.movements.filter(
      x =>

        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          Number(
            x.originId
          ) ===
            Number(origin))

    );


  const presentDates =
    Object.entries(
      db.attendance
    ).filter(
      ([date]) =>

        (!start ||
          date >= start) &&

        (!end ||
          date <= end)

    );


  const totalEntries =
    entries.reduce(
      (sum, x) =>
        sum +
        Number(x.qty),
      0
    );


  const totalOutputs =
    mov
      .filter(
        x =>
          x.type ===
          "saida"
      )
      .reduce(
        (sum, x) =>
          sum +
          Number(x.qty),
        0
      );


  const totalLosses =
    mov
      .filter(
        x =>
          x.type ===
          "perda"
      )
      .reduce(
        (sum, x) =>
          sum +
          Number(x.qty),
        0
      );


  const html = `

    <div class="cards">

      <div class="card">

        <span>
          Entradas
        </span>

        <strong>
          ${fmt(
            totalEntries
          )}
        </strong>

      </div>


      <div class="card">

        <span>
          Saídas
        </span>

        <strong>
          ${fmt(
            totalOutputs
          )}
        </strong>

      </div>


      <div class="card danger">

        <span>
          Perdas
        </span>

        <strong>
          ${fmt(
            totalLosses
          )}
        </strong>

      </div>


      <div class="card">

        <span>
          Dias com presença
        </span>

        <strong>
          ${
            presentDates.length
          }
        </strong>

      </div>

    </div>


    <h3>
      Entradas
    </h3>


    ${
      entries.length

        ? table(

            entries,

            [

              [
                "Data",
                x =>
                  fmtDate(
                    x.date
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
                x =>
                  fmt(x.qty)
              ],

              [
                "Obs.",
                x =>
                  esc(
                    x.note ||
                    ""
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


    <h3>
      Saídas e perdas
    </h3>


    ${
      mov.length

        ? table(

            mov,

            [

              [
                "Data",
                x =>
                  fmtDate(
                    x.date
                  )
              ],

              [
                "Tipo",
                x =>
                  esc(
                    x.type ===
                    "perda"
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
                x =>
                  fmt(x.qty)
              ],

              [
                "Motivo",
                x =>
                  x.type ===
                  "perda"

                    ? esc(
                        getName(
                          db.reasons,
                          x.reasonId
                        )
                      )

                    : "—"
              ],

              [
                "Obs.",
                x =>
                  esc(
                    x.note ||
                    ""
                  )
              ]

            ],

            () => {}

          )

        : `

          <div class="empty">

            Sem saídas ou perdas no período.

          </div>

        `
    }

  `;


  const target =
    document.getElementById(
      "reportResult"
    );


  if (target) {

    target.innerHTML =
      html;

  }

}


// ============================================================
// 18. EXPORTAÇÃO CSV
// ============================================================

function csvEscape(
  value
) {

  const text =
    String(
      value ?? ""
    );


  return (
    '"' +
    text
      .replace(
        /"/g,
        '""'
      ) +
    '"'
  );

}


function exportCSV() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value ||
    "";


  const end =
    document.getElementById(
      "reportEnd"
    )?.value ||
    "";


  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value ||
    "";


  const rows = [

    [
      "TIPO",
      "DATA",
      "ORIGEM",
      "ALIMENTO",
      "QUANTIDADE",
      "MOTIVO",
      "OBSERVAÇÃO"
    ]

  ];


  db.entries
    .filter(
      x =>
        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          Number(
            x.originId
          ) ===
            Number(origin))
    )
    .forEach(
      x => {

        rows.push([

          "Entrada",

          fmtDate(
            x.date
          ),

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

        ]);

      }
    );


  db.movements
    .filter(
      x =>
        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          Number(
            x.originId
          ) ===
            Number(origin))
    )
    .forEach(
      x => {

        rows.push([

          x.type ===
          "perda"
            ? "Perda"
            : "Saída",

          fmtDate(
            x.date
          ),

          getName(
            db.origins,
            x.originId
          ),

          getName(
            db.foods,
            x.foodId
          ),

          x.qty,

          x.type ===
          "perda"
            ? getName(
                db.reasons,
                x.reasonId
              )
            : "",

          x.note || ""

        ]);

      }
    );


  const blob =
    new Blob(

      [

        "\ufeff" +

        rows
          .map(
            row =>
              row
                .map(
                  csvEscape
                )
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

    `relatorio_${
      start || "inicio"
    }_${
      end || "fim"
    }.csv`

  );

}


// ============================================================
// 19. DOWNLOAD
// ============================================================

function download(
  blob,
  name
) {

  const a =
    document.createElement(
      "a"
    );


  const url =
    URL.createObjectURL(
      blob
    );


  a.href =
    url;

  a.download =
    name;


  document.body.appendChild(
    a
  );


  a.click();


  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );

}


// ============================================================
// 20. NAVEGAÇÃO
// ============================================================

function nav() {

  document
    .querySelectorAll(
      ".tab,.home-card"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const page =
              button.dataset.page;


            document
              .querySelectorAll(
                ".tab"
              )
              .forEach(
                tab =>
                  tab.classList.toggle(
                    "active",
                    tab.dataset.page ===
                      page
                  )
              );


            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                section =>
                  section.classList.remove(
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

              top:
                0,

              behavior:
                "smooth"

            });

          }
        );

      }
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
// FIM DA PARTE 2
// ============================================================

// ============================================================
// 21. CADASTROS
// ============================================================

function renderCadastros() {

  // ----------------------------------------------------------
  // PESSOAS
  // ----------------------------------------------------------

  const people =
    document.getElementById(
      "peopleTable"
    );


  if (people) {

    people.innerHTML = `

      <div class="mini-list">

        ${
          db.people.length

            ? db.people
                .map(
                  person => `

                    <div class="mini-row">

                      <span>

                        <b>
                          ${esc(
                            person.name
                          )}
                        </b>

                        <br>

                        <small>
                          Matrícula:
                          ${esc(
                            person.registration
                          )}
                        </small>

                      </span>

                      <button
                        class="btn danger-btn"
                        data-del-person="${person.id}"
                      >
                        Excluir
                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">
                Nenhuma pessoa cadastrada.
              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // ALIMENTOS
  // ----------------------------------------------------------

  const foods =
    document.getElementById(
      "foodsTable"
    );


  if (foods) {

    foods.innerHTML = `

      <div class="mini-list">

        ${
          db.foods.length

            ? db.foods
                .map(
                  food => `

                    <div class="mini-row">

                      <span>
                        ${esc(
                          food.name
                        )}
                      </span>

                      <button
                        class="btn danger-btn"
                        data-del-food="${food.id}"
                      >
                        Excluir
                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">
                Nenhum alimento cadastrado.
              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // ORIGENS
  // ----------------------------------------------------------

  const origins =
    document.getElementById(
      "originsTable"
    );


  if (origins) {

    origins.innerHTML = `

      <div class="mini-list">

        ${
          db.origins.length

            ? db.origins
                .map(
                  origin => `

                    <div class="mini-row">

                      <span>
                        ${esc(
                          origin.name
                        )}
                      </span>

                      <button
                        class="btn danger-btn"
                        data-del-origin="${origin.id}"
                      >
                        Excluir
                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">
                Nenhuma origem cadastrada.
              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // MOTIVOS
  // ----------------------------------------------------------

  const reasons =
    document.getElementById(
      "reasonsTable"
    );


  if (reasons) {

    reasons.innerHTML = `

      <div class="mini-list">

        ${
          db.reasons.length

            ? db.reasons
                .map(
                  reason => `

                    <div class="mini-row">

                      <span>
                        ${esc(
                          reason.name
                        )}
                      </span>

                      <button
                        class="btn danger-btn"
                        data-del-reason="${esc(
                          reason.id
                        )}"
                      >
                        Excluir
                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">
                Nenhum motivo cadastrado.
              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // EVENTOS DE EXCLUSÃO
  // ----------------------------------------------------------

  document
    .querySelectorAll(
      "[data-del-person]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir esta pessoa?"
              )
            ) {

              return;

            }


            try {

              await deletePerson(
                button.dataset
                  .delPerson
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Pessoa excluída."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir pessoa: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-food]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir este alimento?"
              )
            ) {

              return;

            }


            try {

              await deleteFood(
                button.dataset
                  .delFood
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Alimento excluído."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir alimento: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-origin]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir esta origem?"
              )
            ) {

              return;

            }


            try {

              await deleteOrigin(
                button.dataset
                  .delOrigin
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Origem excluída."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir origem: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-reason]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir este motivo?"
              )
            ) {

              return;

            }


            try {

              await deleteReasonLocalOnly(
                button.dataset
                  .delReason
              );


              renderCadastros();

              refreshSelects();


              toast(
                "Motivo excluído."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir motivo."
              );

            }

          };

      }
    );

}


// ============================================================
// 22. EVENTOS DOS FORMULÁRIOS
// ============================================================

function bindEvents() {


  // ==========================================================
  // ENTRADA
  // ==========================================================

  const entryForm =
    document.getElementById(
      "entryForm"
    );


  if (entryForm) {

    entryForm.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          String(
            form.get("date") ||
            ""
          );


        const originId =
          Number(
            form.get("origin")
          );


        const foodId =
          Number(
            form.get("foodId")
          );


        const qty =
          Number(
            form.get("qty")
          );


        const note =
          String(
            form.get("note") ||
            ""
          ).trim();


        // ----------------------------------------------------
        // VALIDAÇÃO
        // ----------------------------------------------------

        if (!date) {

          toast(
            "Informe a data."
          );

          return;

        }


        if (
          !originId ||
          !foodId
        ) {

          toast(
            "Selecione a origem e o alimento."
          );

          return;

        }


        if (
          !Number.isFinite(qty) ||
          qty <= 0
        ) {

          toast(
            "Informe uma quantidade válida."
          );

          return;

        }


        try {

          await insertEntry({

            date,

            originId,

            foodId,

            qty

          });


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          document.getElementById(
            "entryDate"
          ).value =
            isoToday();


          toast(
            "Entrada registrada com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO ENTRADA:",
            error
          );


          alert(
            "Erro ao registrar entrada:\n\n" +
            (
              error?.message ||
              JSON.stringify(
                error
              )
            )
          );

        }

      }
    );

  }


  // ==========================================================
  // SAÍDA / PERDA
  // ==========================================================

  const movementForm =
    document.getElementById(
      "movementForm"
    );


  if (movementForm) {

    movementForm.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          String(
            form.get("date") ||
            ""
          );


        const type =
          String(
            form.get("type") ||
            "saida"
          );


        const originId =
          Number(
            form.get("origin")
          );


        const foodId =
          Number(
            form.get("foodId")
          );


        const qty =
          Number(
            form.get("qty")
          );


        const reasonId =
          String(
            form.get(
              "reasonId"
            ) ||
            ""
          );


        const note =
          String(
            form.get("note") ||
            ""
          ).trim();


        // ----------------------------------------------------
        // VALIDAÇÕES
        // ----------------------------------------------------

        if (!date) {

          toast(
            "Informe a data."
          );

          return;

        }


        if (
          !originId ||
          !foodId
        ) {

          toast(
            "Selecione a origem e o alimento."
          );

          return;

        }


        if (
          !Number.isFinite(qty) ||
          qty <= 0
        ) {

          toast(
            "Informe uma quantidade válida."
          );

          return;

        }


        if (
          type === "perda" &&
          !reasonId
        ) {

          toast(
            "Selecione o motivo da perda."
          );

          return;

        }


        // ----------------------------------------------------
        // VERIFICAR ESTOQUE
        // ----------------------------------------------------

        const stock =
          calcStock();


        const available =
          Number(
            stock[
              originId
            ]?.[
              foodId
            ] || 0
          );


        if (
          qty >
          available
        ) {

          alert(
            `Quantidade superior ao estoque disponível.\n\n` +
            `Alimento: ${
              getName(
                db.foods,
                foodId
              )
            }\n` +
            `Origem: ${
              getName(
                db.origins,
                originId
              )
            }\n` +
            `Disponível: ${
              fmt(
                available
              )
            }`
          );

          return;

        }


        try {

          await insertMovement({

            date,

            type,

            originId,

            foodId,

            qty,

            reasonId,

            note

          });


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          document.getElementById(
            "movementDate"
          ).value =
            isoToday();


          toast(
            type === "perda"
              ? "Perda registrada com sucesso."
              : "Saída registrada com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO MOVIMENTAÇÃO:",
            error
          );


          alert(
            "Erro ao registrar movimentação:\n\n" +
            (
              error?.message ||
              JSON.stringify(
                error
              )
            )
          );

        }

      }
    );

  }


  // ==========================================================
  // DASHBOARD
  // ==========================================================

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


  // ==========================================================
  // DATA DAS ENTRADAS
  // ==========================================================

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


  // ==========================================================
  // DATA DA PRESENÇA
  // ==========================================================

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


  // ==========================================================
  // BUSCA DE PESSOAS
  // ==========================================================

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


  // ==========================================================
  // ATUALIZAR ESTOQUE
  // ==========================================================

  const refreshStock =
    document.getElementById(
      "refreshStock"
    );


  if (refreshStock) {

    refreshStock.addEventListener(
      "click",
      async () => {

        try {

          await reloadFromSupabase(
            true
          );

        } catch (error) {

          console.error(
            error
          );

          toast(
            "Erro ao atualizar estoque."
          );

        }

      }
    );

  }


  // ==========================================================
  // RELATÓRIO
  // ==========================================================

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


  // ==========================================================
  // CSV
  // ==========================================================

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


  // ==========================================================
  // CADASTRO DE PESSOA
  // ==========================================================

  const personForm =
    document.getElementById(
      "personForm"
    );


  if (personForm) {

    personForm.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        const registration =
          String(
            form.get(
              "registration"
            ) ||
            ""
          ).trim();


        if (!name) {

          toast(
            "Informe o nome completo."
          );

          return;

        }


        if (!registration) {

          toast(
            "Informe a matrícula."
          );

          return;

        }


        try {

          await insertPerson(
            name,
            registration
          );


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          toast(
            "Pessoa cadastrada com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO PESSOA:",
            error
          );


          alert(
            "Erro ao cadastrar pessoa:\n\n" +
            (
              error?.message ||
              JSON.stringify(
                error
              )
            )
          );

        }

      }
    );

  }


  // ==========================================================
  // CADASTRO DE ALIMENTO
  // ==========================================================

  const foodForm =
    document.getElementById(
      "foodForm"
    );


  if (foodForm) {

    foodForm.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (!name) {

          toast(
            "Informe o nome do alimento."
          );

          return;

        }


        try {

          await insertFood(
            name
          );


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          toast(
            "Alimento cadastrado com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO ALIMENTO:",
            error
          );


          alert(
            "Erro ao cadastrar alimento:\n\n" +
            (
              error?.message ||
              JSON.stringify(
                error
              )
            )
          );

        }

      }
    );

  }


  // ==========================================================
  // CADASTRO DE ORIGEM
  // ==========================================================

  const originForm =
    document.getElementById(
      "originForm"
    );


  if (originForm) {

    originForm.addEventListener(
      "submit",
      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (!name) {

          toast(
            "Informe o nome da origem."
          );

          return;

        }


        try {

          await insertOrigin(
            name
          );


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          toast(
            "Origem cadastrada com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO ORIGEM:",
            error
          );


          alert(
            "Erro ao cadastrar origem:\n\n" +
            (
              error?.message ||
              JSON.stringify(
                error
              )
            )
          );

        }

      }
    );

  }


  // ==========================================================
  // CADASTRO DE MOTIVO
  // ==========================================================

  const reasonForm =
    document.getElementById(
      "reasonForm"
    );


  if (reasonForm) {

    reasonForm.addEventListener(
      "submit",
      event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (!name) {

          toast(
            "Informe o motivo."
          );

          return;

        }


        const exists =
          db.reasons.some(
            reason =>
              reason.name
                .toLowerCase() ===
              name.toLowerCase()
          );


        if (exists) {

          toast(
            "Este motivo já está cadastrado."
          );

          return;

        }


        db.reasons.push({

          id:
            name,

          name:
            name

        });


        saveLocalReasons();


        refreshSelects();

        renderCadastros();


        event.target.reset();


        toast(
          "Motivo cadastrado."
        );

      }
    );

  }

}


// ============================================================
// 23. BACKUP
// ============================================================

function setupBackup() {

  const backupBtn =
    document.getElementById(
      "backupBtn"
    );


  if (backupBtn) {

    backupBtn.addEventListener(
      "click",
      () => {

        const backup = {

          versao:
            "ACE-SUPABASE-V1",

          exportadoEm:
            new Date()
              .toISOString(),

          usuario:
            currentUser?.email ||
            "",

          dados:
            db

        };


        const blob =
          new Blob(

            [
              JSON.stringify(
                backup,
                null,
                2
              )
            ],

            {
              type:
                "application/json"
            }

          );


        download(
          blob,

          `backup_ACE_${
            isoToday()
          }.json`

        );


        toast(
          "Backup gerado."
        );

      }
    );

  }


  // ----------------------------------------------------------
  // RESTAURAÇÃO
  // ----------------------------------------------------------
  //
  // Não fazemos INSERT automático de backup no Supabase.
  // Isso poderia duplicar registros.
  // ----------------------------------------------------------

  const restoreFile =
    document.getElementById(
      "restoreFile"
    );


  if (restoreFile) {

    restoreFile.addEventListener(
      "change",
      async event => {

        const file =
          event.target.files?.[0];


        if (!file) {

          return;

        }


        try {

          const text =
            await file.text();


          const backup =
            JSON.parse(
              text
            );


          if (
            !backup ||
            !backup.dados
          ) {

            throw new Error(
              "Arquivo de backup inválido."
            );

          }


          const ok =
            confirm(

              "O backup será apenas conferido. " +
              "A restauração automática no Supabase está desativada para evitar duplicação de dados.\n\n" +
              "Deseja apenas verificar o arquivo?"

            );


          if (ok) {

            toast(
              "Backup válido e conferido."
            );

          }


        } catch (error) {

          alert(
            "Erro ao ler backup:\n\n" +
            error.message
          );

        }


        event.target.value =
          "";

      }
    );

  }


  // ----------------------------------------------------------
  // RESET
  // ----------------------------------------------------------

  const resetBtn =
    document.getElementById(
      "resetBtn"
    );


  if (resetBtn) {

    resetBtn.addEventListener(
      "click",
      async () => {

        const ok =
          confirm(

            "Isso NÃO apagará os dados do Supabase.\n\n" +
            "O sistema apenas será recarregado com os dados atuais do banco.\n\n" +
            "Continuar?"

          );


        if (!ok) {

          return;

        }


        try {

          await reloadFromSupabase(
            true
          );


        } catch (error) {

          console.error(
            error
          );


          alert(
            "Erro ao recarregar:\n\n" +
            error.message
          );

        }

      }
    );

  }

}


// ============================================================
// 24. PWA
// ============================================================

function setupPWA() {

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();


      deferredPrompt =
        event;


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

        if (
          !deferredPrompt
        ) {

          return;

        }


        deferredPrompt.prompt();


        deferredPrompt =
          null;


        installBtn.classList.add(
          "hidden"
        );

      }
    );

  }


  if (
    "serviceWorker" in
    navigator
  ) {

    window.addEventListener(
      "load",
      () => {

        navigator.serviceWorker
          .register(
            "sw.js"
          )
          .catch(
            error =>
              console.warn(
                "Service Worker:",
                error
              )
          );

      }
    );

  }

}


// ============================================================
// 25. RENDERIZAR TUDO
// ============================================================

function renderAll() {

  if (!db) {

    return;

  }


  refreshSelects();


  renderDashboard();


  renderEntries();


  renderMovements();


  renderAttendance();


  renderStock();


  renderCadastros();

}


// ============================================================
// 26. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  if (appStarted) {

    return;

  }


  appStarted =
    true;


  try {

    console.log(
      "ACE: carregando banco..."
    );


    db =
      await loadFromSupabase();


    console.log(
      "ACE: banco carregado.",
      db
    );


    setDates();


    nav();


    bindEvents();


    setupBackup();


    setupPWA();


    addUserBar();


    renderAll();


    console.log(
      "ACE: aplicativo iniciado com sucesso."
    );


  } catch (error) {

    console.error(
      "ERRO AO INICIAR:",
      error
    );


    appStarted =
      false;


    alert(

      "Erro ao carregar o sistema:\n\n" +

      (
        error?.message ||
        JSON.stringify(
          error
        )
      )

    );

  }

}


// ============================================================
// 27. AUTENTICAÇÃO
// ============================================================

async function startAuth() {

  createLoginScreen();


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {

      throw error;

    }


    if (
      data?.session?.user
    ) {

      currentUser =
        data.session.user;


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      await initApp();


      return;

    }


  } catch (error) {

    console.error(
      "Erro ao verificar sessão:",
      error
    );


    const loginError =
      document.getElementById(
        "loginError"
      );


    if (loginError) {

      loginError.textContent =
        "Erro ao conectar ao Supabase: " +
        (
          error?.message ||
          "erro desconhecido"
        );


      loginError.classList.add(
        "show"
      );

    }

  }


  // ----------------------------------------------------------
  // OUVIR ALTERAÇÕES DE LOGIN
  // ----------------------------------------------------------

  supabaseClient
    .auth
    .onAuthStateChange(
      async (
        event,
        session
      ) => {

        console.log(
          "AUTH:",
          event
        );


        if (
          event ===
            "SIGNED_IN" &&
          session?.user
        ) {

          currentUser =
            session.user;


          document
            .getElementById(
              "loginScreen"
            )
            ?.remove();


          await initApp();

        }


        if (
          event ===
          "SIGNED_OUT"
        ) {

          location.reload();

        }

      }
    );

}


// ============================================================
// 28. INICIAR
// ============================================================

startAuth();


// ============================================================
// FIM DO APP.JS
// ============================================================

