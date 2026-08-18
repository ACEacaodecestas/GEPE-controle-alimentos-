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

  return new Date()
    .toISOString()
    .slice(0, 10);

}


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

  ] = await Promise.all([


    supabaseClient
      .from("Pessoas")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "nome"
      ),


    supabaseClient
      .from("Alimentos")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "nome"
      ),


    supabaseClient
      .from("origens")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "nome"
      ),


    supabaseClient
      .from("entradas")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "data_entrada",
        {
          ascending: false
        }
      ),


    supabaseClient
      .from("saídas")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "data_saida",
        {
          ascending: false
        }
      ),


    supabaseClient
      .from("perdas")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
      .order(
        "data_perda",
        {
          ascending: false
        }
      ),


    supabaseClient
      .from("presença")
      .select("*")
      .eq(
        "usuario_id",
        currentUser.id
      )
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

    throw failed[1].error;

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
    DEFAULT.reasons.map(
      name => ({

        id: name,

        name

      })
    );


  const dbSupabase = {


    people:

      people.map(
        p => ({

          id:
            p.id,

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

          id:
            f.id,

          name:
            f.nome

        })
      ),


    origins:

      origins.map(
        o => ({

          id:
            o.id,

          name:
            o.nome

        })
      ),


    entries:

      entries.map(
        e => ({

          id:
            e.id,

          date:
            e.data_entrada,

          foodId:
            e.alimento_id,

          qty:
            Number(
              e.quantidade || 0
            ),

          originId:
            e.origem_id,

          note:
            e.observacao ||
            e.obs ||
            "",

          createdAt:
            e.created_at ||
            `${
              e.data_entrada ||
              isoToday()
            }T00:00:00Z`

        })
      ),


    movements: [

      ...outputs.map(
        s => ({

          id:
            `saida-${s.id}`,

          rawId:
            s.id,

          sourceTable:
            "saídas",

          date:
            s.data_saida,

          type:
            "saida",

          foodId:
            s.alimento_id,

          qty:
            Number(
              s.quantidade || 0
            ),

          originId:
            s.origem_id,

          reasonId:
            null,

          note:
            s.destino ||
            s.observacao ||
            "",

          createdAt:
            s.created_at ||
            `${
              s.data_saida ||
              isoToday()
            }T00:00:00Z`

        })
      ),


      ...losses.map(
        p => ({

          id:
            `perda-${p.id}`,

          rawId:
            p.id,

          sourceTable:
            "perdas",

          date:
            p.data_perda,

          type:
            "perda",

          foodId:
            p.alimento_id,

          qty:
            Number(
              p.quantidade || 0
            ),

          originId:
            p.origem_id,

          reasonId:
            reasons.find(
              r =>
                r.name ===
                p.motivo
            )?.id ||

            p.motivo ||

            null,

          note:
            p.observacao ||
            p.obs ||
            "",

          createdAt:
            p.created_at ||
            `${
              p.data_perda ||
              isoToday()
            }T00:00:00Z`

        })
      )

    ],


    attendance: {},


    reasons

  };


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
        row.pessoa_id
      ) {

        dbSupabase
          .attendance[
            row.data
          ]
          .push(
            row.pessoa_id
          );

      }

    }
  );


  return dbSupabase;

}


function save() {

  // Compatibilidade com a estrutura antiga.
  // O banco oficial agora é o Supabase;
  // não usamos localStorage para dados.

  return true;

}


async function reloadFromSupabase(
  showToast = false
) {

  db =
    await loadFromSupabase();


  renderAll();


  if (showToast) {

    toast(
      "Dados atualizados do Supabase."
    );

  }

}


function getCurrentUserId() {

  if (
    !currentUser?.id
  ) {

    throw new Error(
      "Usuário não autenticado."
    );

  }


  return currentUser.id;

}


// ============================================================
// FIM DA PARTE 1
// ============================================================

// ============================================================
// PARTE 2/5 - ORIGINAL
// ============================================================


// ============================================================
// 4.1 CADASTROS E MOVIMENTAÇÕES
// ============================================================

async function insertPerson(
  name,
  registration
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .insert({

        nome:
          name,

        "matrícula":
          registration,

        usuario_id:
          getCurrentUserId()

      })
      .select()
      .single();


  if (error) throw error;

  return data;

}


async function insertFood(
  name
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("Alimentos")
      .insert({

        nome:
          name,

        usuario_id:
          getCurrentUserId()

      })
      .select()
      .single();


  if (error) throw error;

  return data;

}


async function insertOrigin(
  name
) {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("origens")
      .insert({

        nome:
          name,

        usuario_id:
          getCurrentUserId()

      })
      .select()
      .single();


  if (error) throw error;

  return data;

}


// ============================================================
// ENTRADA
// ============================================================

async function insertEntry({
  date,
  originId,
  foodId,
  qty,
  note
}) {

  const row = {

    data_entrada:
      date,

    alimento_id:
      foodId,

    quantidade:
      qty,

    origem_id:
      originId,

    usuario_id:
      getCurrentUserId()

  };


  // Mantém observação somente
  // se o banco possuir essa coluna.

  if (note) {

    row.observacao =
      note;

  }


  let result =
    await supabaseClient
      .from("entradas")
      .insert(row)
      .select()
      .single();


  // Se a tabela não possuir observacao,
  // repete sem ela.

  if (

    result.error &&
    note &&
    /observacao|column/i.test(
      result.error.message || ""
    )

  ) {

    delete row.observacao;


    result =
      await supabaseClient
        .from("entradas")
        .insert(row)
        .select()
        .single();

  }


  if (result.error) {

    throw result.error;

  }


  return result.data;

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


  // ==========================================================
  // SAÍDA
  // ==========================================================

  if (
    type ===
    "saida"
  ) {

    const row = {

      data_saida:
        date,

      alimento_id:
        foodId,

      quantidade:
        qty,

      origem_id:
        originId,

      destino:
        note || "",

      usuario_id:
        userId

    };


    const {
      data,
      error
    } =
      await supabaseClient
        .from("saídas")
        .insert(row)
        .select()
        .single();


    if (error) throw error;

    return data;

  }


  // ==========================================================
  // PERDA
  // ==========================================================

  const reasonName =

    db.reasons.find(
      r =>
        r.id ===
        reasonId
    )?.name ||

    reasonId ||

    "Outro";


  const row = {

    data_perda:
      date,

    alimento_id:
      foodId,

    quantidade:
      qty,

    origem_id:
      originId,

    motivo:
      reasonName,

    usuario_id:
      userId

  };


  if (note) {

    row.observacao =
      note;

  }


  let result =
    await supabaseClient
      .from("perdas")
      .insert(row)
      .select()
      .single();


  if (

    result.error &&
    note &&
    /observacao|column/i.test(
      result.error.message || ""
    )

  ) {

    delete row.observacao;


    result =
      await supabaseClient
        .from("perdas")
        .insert(row)
        .select()
        .single();

  }


  if (result.error) {

    throw result.error;

  }


  return result.data;

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
        id
      )
      .eq(
        "usuario_id",
        getCurrentUserId()
      );


  if (error) throw error;

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
        id
      )
      .eq(
        "usuario_id",
        getCurrentUserId()
      );


  if (error) throw error;

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
        id
      )
      .eq(
        "usuario_id",
        getCurrentUserId()
      );


  if (error) throw error;

}


async function deleteReasonLocalOnly(
  id
) {

  db.reasons =
    db.reasons.filter(
      x =>
        x.id !== id
    );


  renderAll();

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
        id
      )
      .eq(
        "usuario_id",
        getCurrentUserId()
      );


  if (error) throw error;

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
      "Não foi possível identificar a movimentação no Supabase."
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
        movement.rawId
      )
      .eq(
        "usuario_id",
        getCurrentUserId()
      );


  if (error) throw error;

}


// ============================================================
// PRESENÇA
// ============================================================

async function setAttendance(
  date,
  personId,
  present
) {

  const userId =
    getCurrentUserId();


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
        "usuario_id",
        userId
      )
      .eq(
        "data",
        date
      )
      .eq(
        "pessoa_id",
        personId
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

            data:
              date,

            pessoa_id:
              personId,

            present:
              true,

            usuario_id:
              userId

          });


      if (error) {

        throw error;

      }

    }


    return;

  }


  if (
    existing?.length
  ) {

    const {
      error
    } =
      await table
        .delete()
        .eq(
          "id",
          existing[0].id
        )
        .eq(
          "usuario_id",
          userId
        );


    if (error) {

      throw error;

    }

  }

}


// ============================================================
// DELETE CADASTRO
// ============================================================

async function deleteCadastro(
  key,
  id
) {

  if (
    key ===
    "people"
  ) {

    return deletePerson(
      id
    );

  }


  if (
    key ===
    "foods"
  ) {

    return deleteFood(
      id
    );

  }


  if (
    key ===
    "origins"
  ) {

    return deleteOrigin(
      id
    );

  }


  if (
    key ===
    "reasons"
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
// FUNÇÕES AUXILIARES
// ============================================================

function esc(s) {

  return String(
    s ?? ""
  ).replace(

    /[&<>"']/g,

    m => ({

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
        d + "T12:00:00"
      ).toLocaleDateString(
        "pt-BR"
      )

    : "";

}


function getName(
  arr,
  id
) {

  return arr.find(
    x =>
      x.id === id
  )?.name || "—";

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
      border:0;
      border-radius:8px;
      padding:7px 10px;
      cursor:pointer;
      font-weight:800;
    }

  `;


  document.head.appendChild(
    style
  );


// ============================================================
// FIM DA PARTE 2
// ============================================================

// ============================================================
// CONTINUAÇÃO DA PARTE 3/5
// ============================================================

  // A tela de login é criada acima.
  // O formulário chama loginUser().
  // Não alterar essa estrutura.

}


// ============================================================
// LOGIN
// ============================================================

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
    document
      .getElementById(
        "loginPassword"
      )
      .value;


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
      .remove();


    initApp();


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


// ============================================================
// TRADUZIR ERROS DE LOGIN
// ============================================================

function traduzirErroLogin(
  err
) {

  const msg =
    String(
      err?.message || ""
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
// 6. CONTROLE DO USUÁRIO LOGADO
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

      Sair

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

      async () => {

        try {

          await supabaseClient
            .auth
            .signOut();


        } catch (error) {

          console.error(
            "Erro ao sair:",
            error
          );

        }

      }

    );

}


// ============================================================
// FIM DA PARTE 3/5
// ============================================================

// ============================================================
// PARTE 4/5 - ORIGINAL
// ============================================================


// ============================================================
// LOGOUT
// ============================================================

async function logoutUser() {

  const ok =
    confirm(
      "Deseja sair do sistema?"
    );


  if (!ok) return;


  const { error } =
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
  placeholder = "Selecione..."
) {

  const el =
    document.getElementById(
      id
    );


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
    o =>
      stock[o.id] = {}
  );


  db.foods.forEach(
    food => {

      db.origins.forEach(
        origin => {

          stock[
            origin.id
          ][
            food.id
          ] = 0;

        }
      );

    }
  );


  db.entries.forEach(
    entry => {

      if (

        stock[
          entry.originId
        ] &&

        stock[
          entry.originId
        ][
          entry.foodId
        ] != null

      ) {

        stock[
          entry.originId
        ][
          entry.foodId
        ] +=
          Number(
            entry.qty
          );

      }

    }
  );


  db.movements.forEach(
    movement => {

      if (

        stock[
          movement.originId
        ] &&

        stock[
          movement.originId
        ][
          movement.foodId
        ] != null

      ) {

        stock[
          movement.originId
        ][
          movement.foodId
        ] -=
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
    )?.value ||
    isoToday();


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
        x =>
          x.date === date
      )

      .reduce(
        (s, x) =>
          s +
          Number(
            x.qty
          ),

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
          s +
          Number(
            x.qty
          ),

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
          s +
          Number(
            x.qty
          ),

        0
      );


  const st =
    calcStock();


  const estoque =
    Object.values(
      st
    )

      .reduce(
        (a, o) =>

          a +

          Object.values(o)
            .reduce(
              (x, v) =>
                x +
                Number(v),

              0
            ),

        0
      );


  const pres =
    (
      db.attendance[
        date
      ] || []
    )
      .filter(Boolean)
      .length;


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


  const originSummary =
    document.getElementById(
      "originSummary"
    );


  if (originSummary) {

    originSummary.innerHTML =

      db.origins

        .map(
          o => {

            const total =

              Object.values(
                st[
                  o.id
                ] || {}
              )

                .reduce(
                  (a, v) =>
                    a +
                    Number(v),

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

          }
        )

        .join("");

  }


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
            "+",

          color:
            "green"

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
            "-",

          color:
            x.type === "perda"
              ? "red"
              : "blue"

        })
      )

    ]

      .sort(
        (a, b) =>
          (
            b.createdAt ||
            ""
          )
            .localeCompare(
              a.createdAt ||
              ""
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
          b.createdAt.localeCompare(
            a.createdAt
          )
      );


  const total =
    arr.reduce(
      (s, x) =>
        s +
        Number(
          x.qty
        ),

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
              fmt(
                x.qty
              )

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
            fmt(
              x.qty
            )

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
// FIM DA PARTE 4/5
// ============================================================

// ============================================================
// PARTE 5/5 - FINAL ORIGINAL
// ============================================================


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
    URL.createObjectURL(
      blob
    );


  a.download =
    name;


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
                    x.dataset.page ===
                    page
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

      async e => {

        e.preventDefault();


        const f =
          new FormData(
            e.target
          );


        const date =
          f.get("date");


        const originId =
          f.get("origin");


        const foodId =
          f.get("foodId");


        const qty =
          Number(
            f.get("qty")
          );


        const note =
          String(
            f.get("note") || ""
          ).trim();


        if (
          !date ||
          !originId ||
          !foodId ||
          !Number.isFinite(qty) ||
          qty <= 0
        ) {

          toast(
            "Preencha os dados da entrada corretamente."
          );

          return;

        }


        const submit =
          e.target.querySelector(
            'button[type="submit"]'
          );


        if (submit) {

          submit.disabled =
            true;

        }


        try {

          await insertEntry({

            date,
            originId,
            foodId,
            qty,
            note

          });


          await reloadFromSupabase();


          e.target.reset();


          document
            .getElementById(
              "entryDate"
            )
            .value =
              isoToday();


          renderEntries();


          toast(
            "Entrada registrada no Supabase."
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível registrar a entrada."
          );


        } finally {

          if (submit) {

            submit.disabled =
              false;

          }

        }

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

      async e => {

        e.preventDefault();


        const f =
          new FormData(
            e.target
          );


        const date =
          f.get("date");


        const type =
          f.get("type");


        const originId =
          f.get("origin");


        const foodId =
          f.get("foodId");


        const qty =
          Number(
            f.get("qty")
          );


        const reasonId =
          f.get("reasonId");


        const note =
          String(
            f.get("note") || ""
          ).trim();


        if (
          !date ||
          !type ||
          !originId ||
          !foodId ||
          !Number.isFinite(qty) ||
          qty <= 0
        ) {

          toast(
            "Preencha os dados da movimentação corretamente."
          );

          return;

        }


        const st =
          calcStock();


        const available =
          Number(
            st[
              originId
            ]?.[
              foodId
            ] || 0
          );


        if (
          qty > available
        ) {

          toast(

            `Saldo insuficiente. Disponível em ${
              getName(
                db.origins,
                originId
              )
            }: ${fmt(available)}.`

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


        const submit =
          e.target.querySelector(
            'button[type="submit"]'
          );


        if (submit) {

          submit.disabled =
            true;

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


          await reloadFromSupabase();


          e.target.reset();


          document
            .getElementById(
              "movementDate"
            )
            .value =
              isoToday();


          renderAll();


          toast(

            type === "perda"

              ? "Perda registrada no Supabase."

              : "Saída registrada no Supabase."

          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível registrar a movimentação."
          );


        } finally {

          if (submit) {

            submit.disabled =
              false;

          }

        }

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

      async () => {

        try {

          await reloadFromSupabase();


          toast(
            "Estoque atualizado."
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível atualizar o estoque."
          );

        }

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

      async e => {

        e.preventDefault();


        const f =
          new FormData(
            e.target
          );


        const name =
          String(
            f.get("name") || ""
          ).trim();


        const registration =
          String(
            f.get("registration") || ""
          ).trim();


        if (
          !name ||
          !registration
        ) {

          toast(
            "Informe nome e matrícula."
          );

          return;

        }


        try {

          await insertPerson(
            name,
            registration
          );


          await reloadFromSupabase();


          e.target.reset();


          toast(
            "Pessoa cadastrada no Supabase."
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível cadastrar a pessoa."
          );

        }

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

      async e => {

        e.preventDefault();


        const f =
          new FormData(
            e.target
          );


        const name =
          String(
            f.get("name") || ""
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


          await reloadFromSupabase();


          e.target.reset();


          toast(
            "Alimento cadastrado no Supabase."
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível cadastrar o alimento."
          );

        }

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

      async e => {

        e.preventDefault();


        const f =
          new FormData(
            e.target
          );


        const name =
          String(
            f.get("name") || ""
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


          await reloadFromSupabase();


          e.target.reset();


          toast(
            "Origem cadastrada no Supabase."
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Não foi possível cadastrar a origem."
          );

        }

      }

    );

  }


  // Motivos continuam sendo os quatro padrões
  // do aplicativo.

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


        const name =
          String(
            f.get("name") || ""
          ).trim();


        if (!name) {

          toast(
            "Informe o motivo."
          );

          return;

        }


        if (
          db.reasons.some(
            r =>
              r.name.toLowerCase() ===
              name.toLowerCase()
          )
        ) {

          toast(
            "Esse motivo já existe."
          );

          return;

        }


        db.reasons.push({

          id:
            name,

          name

        });


        e.target.reset();


        renderAll();


        toast(
          "Motivo adicionado nesta sessão."
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

      () => {

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

        );

      }

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


          await restoreCloudBackup(
            obj
          );


          await reloadFromSupabase();


          toast(
            "Backup restaurado no Supabase."
          );


        } catch (error) {

          console.error(
            error
          );


          alert(

            "Não foi possível restaurar este arquivo no Supabase.\n\n" +

            (
              error?.message ||
              "Verifique o backup e as permissões."
            )

          );

        }


        e.target.value =
          "";

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

      async () => {

        if (

          !confirm(

            "Atualizar os dados deste aparelho com o conteúdo atual do Supabase?"

          )

        ) {

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


          toast(
            "Não foi possível atualizar os dados."
          );

        }

      }

    );

  }

}


// ============================================================
// RESTAURAR BACKUP NA NUVEM
// ============================================================

async function restoreCloudBackup(
  obj
) {

  if (
    !obj ||
    !obj.foods ||
    !obj.origins ||
    !obj.entries
  ) {

    throw new Error(
      "Arquivo de backup inválido."
    );

  }


  const userId =
    getCurrentUserId();


  if (
    Array.isArray(
      obj.people
    ) &&
    obj.people.length
  ) {

    const rows =
      obj.people.map(
        p => ({

          id:
            p.id ||
            uid(),

          nome:
            p.name,

          "matrícula":
            p.registration,

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("Pessoas")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  if (
    Array.isArray(
      obj.foods
    ) &&
    obj.foods.length
  ) {

    const rows =
      obj.foods.map(
        f => ({

          id:
            f.id ||
            uid(),

          nome:
            f.name,

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("Alimentos")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  if (
    Array.isArray(
      obj.origins
    ) &&
    obj.origins.length
  ) {

    const rows =
      obj.origins.map(
        o => ({

          id:
            o.id ||
            uid(),

          nome:
            o.name,

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("origens")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  if (
    Array.isArray(
      obj.entries
    ) &&
    obj.entries.length
  ) {

    const rows =
      obj.entries.map(
        e => ({

          id:
            e.id ||
            uid(),

          data_entrada:
            e.date,

          alimento_id:
            e.foodId,

          quantidade:
            Number(
              e.qty || 0
            ),

          origem_id:
            e.originId,

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("entradas")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  const outputs =
    (
      obj.movements ||
      []
    )
      .filter(
        m =>
          m.type === "saida"
      );


  if (
    outputs.length
  ) {

    const rows =
      outputs.map(
        m => ({

          id:
            m.rawId ||
            String(
              m.id
            ).replace(
              /^saida-/,
              ""
            ) ||
            uid(),

          data_saida:
            m.date,

          alimento_id:
            m.foodId,

          quantidade:
            Number(
              m.qty || 0
            ),

          origem_id:
            m.originId,

          destino:
            m.note || "",

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("saídas")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  const losses =
    (
      obj.movements ||
      []
    )
      .filter(
        m =>
          m.type === "perda"
      );


  if (
    losses.length
  ) {

    const rows =
      losses.map(
        m => ({

          id:
            m.rawId ||
            String(
              m.id
            ).replace(
              /^perda-/,
              ""
            ) ||
            uid(),

          data_perda:
            m.date,

          alimento_id:
            m.foodId,

          quantidade:
            Number(
              m.qty || 0
            ),

          origem_id:
            m.originId,

          motivo:
            db.reasons.find(
              r =>
                r.id ===
                m.reasonId
            )?.name ||

            m.reasonId ||

            "Outro",

          usuario_id:
            userId

        })
      );


    const {
      error
    } =
      await supabaseClient
        .from("perdas")
        .upsert(
          rows
        );


    if (error) throw error;

  }


  for (
    const [
      date,
      peopleIds
    ]
    of Object.entries(
      obj.attendance || {}
    )
  ) {

    for (
      const personId
      of peopleIds || []
    ) {

      await setAttendance(
        date,
        personId,
        true
      );

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


      deferredPrompt =
        e;


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

  if (
    appStarted
  ) return;


  appStarted =
    true;


  console.log(
    "ACE Controle de Alimentos iniciado."
  );


  try {

    db =
      await loadFromSupabase();


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

    appStarted =
      false;


    console.error(
      "Erro ao iniciar aplicativo:",
      error
    );


    alert(

      "Não foi possível carregar os dados do sistema.\n\n" +

      (
        error?.message ||
        "Verifique a conexão com o Supabase."
      )

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


  // ==========================================================
  // MONITORA ALTERAÇÕES DE AUTENTICAÇÃO
  // ==========================================================

  supabaseClient
    .auth
    .onAuthStateChange(

      (event, session) => {

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


          initApp();

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
// 24. INÍCIO
// ============================================================

startAuth();


// ============================================================
// FIM DO APP
// ============================================================
