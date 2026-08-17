// ============================================================
// ACE - CONTROLE DE ALIMENTOS
// V7 + SUPABASE AUTH
// ============================================================


// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL =
  "https://jblyzktbngvjqgvejgsa.supabase.co";


// COLE AQUI A SUA SUPABASE PUBLISHABLE KEY

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

    "Gorbulho",
    "Vencimento",
    "Avaria",
    "Outro"

  ],


  foods: [

    "Açúcar 1 kg",
    "Arroz 1 kg",
    "Café 250g",
    "Charque",
    "Feijão 1kg",
    "Macarrão",
    "Óleo 900ml"

  ]

};


// ============================================================
// 3. VARIÁVEIS
// ============================================================

let db = {

  people: [],

  foods: [],

  origins: [],

  reasons: [],

  entries: [],

  movements: [],

  attendance: {}

};


let currentUser =
  null;


let appStarted =
  false;


let deferredPrompt =
  null;


// ============================================================
// 4. FUNÇÕES BÁSICAS
// ============================================================


function isoToday() {

  const d =
    new Date();


  const y =
    d.getFullYear();


  const m =
    String(
      d.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      d.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    y +
    "-" +
    m +
    "-" +
    day
  );

}


// ------------------------------------------------------------
// FORMATAR DATA
// ------------------------------------------------------------

function fmtDate(
  value
) {

  if (!value) {

    return "";

  }


  const parts =
    String(
      value
    ).split(
      "-"
    );


  if (
    parts.length !==
    3
  ) {

    return value;

  }


  return (
    parts[2] +
    "/" +
    parts[1] +
    "/" +
    parts[0]
  );

}


// ------------------------------------------------------------
// FORMATAR NÚMERO
// ------------------------------------------------------------

function fmt(
  value
) {

  const n =
    Number(
      value || 0
    );


  return n.toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits:
        2
    }
  );

}


// ------------------------------------------------------------
// ESCAPAR HTML
// ------------------------------------------------------------

function esc(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


// ------------------------------------------------------------
// ID NUMÉRICO
// ------------------------------------------------------------

function newNumericId() {

  return (
    Date.now() +
    Math.floor(
      Math.random() *
      1000
    )
  );

}


// ------------------------------------------------------------
// USUÁRIO ATUAL
// ------------------------------------------------------------

function getCurrentUserId() {

  return (
    currentUser?.id ||
    null
  );

}


// ------------------------------------------------------------
// NOME PELO ID
// ------------------------------------------------------------

function getName(
  list,
  id
) {

  const item =
    list.find(
      x =>
        Number(
          x.id
        ) ===
        Number(
          id
        )
    );


  return (
    item?.name ||
    ""
  );

}


// ------------------------------------------------------------
// TOAST
// ------------------------------------------------------------

function toast(
  message
) {

  let el =
    document.getElementById(
      "aceToast"
    );


  if (!el) {

    el =
      document.createElement(
        "div"
      );


    el.id =
      "aceToast";


    el.style.position =
      "fixed";


    el.style.bottom =
      "25px";


    el.style.left =
      "50%";


    el.style.transform =
      "translateX(-50%)";


    el.style.zIndex =
      "999999";


    el.style.padding =
      "13px 18px";


    el.style.borderRadius =
      "10px";


    el.style.background =
      "#0b3a63";


    el.style.color =
      "#fff";


    el.style.fontWeight =
      "800";


    el.style.boxShadow =
      "0 10px 30px rgba(0,0,0,.25)";


    document.body.appendChild(
      el
    );

  }


  el.textContent =
    message;


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
// FIM DA PARTE 1
// ============================================================

// ============================================================
// 5. TELA DE LOGIN + CRIAÇÃO DE CONTA
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

      width:min(
        420px,
        100%
      );

      background:#fff;

      border-radius:20px;

      padding:30px;

      box-shadow:

        0 20px 60px

        rgba(
          0,
          0,
          0,
          .28
        );

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

      border:

        1px solid

        #d9e1e8;

      border-radius:10px;

      font-size:15px;

      outline:none;

      box-sizing:border-box;

    }


    .login-box input:focus{

      border-color:#1467a8;

      box-shadow:

        0 0 0 3px

        rgba(
          20,
          103,
          168,
          .12
        );

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

      filter:brightness(
        1.08
      );

    }


    .login-button:disabled{

      opacity:.65;

      cursor:not-allowed;

    }


    .register-button{

      width:100%;

      padding:12px;

      margin-top:12px;

      border:

        1px solid

        #0b3a63;

      border-radius:10px;

      background:#fff;

      color:#0b3a63;

      font-weight:900;

      font-size:14px;

      cursor:pointer;

    }


    .register-button:hover{

      background:#f2f7fb;

    }


    .back-button{

      width:100%;

      padding:11px;

      margin-top:12px;

      border:0;

      background:transparent;

      color:#0b3a63;

      font-weight:800;

      cursor:pointer;

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


    .login-success{

      display:none;

      margin-top:14px;

      padding:11px;

      border-radius:9px;

      background:#ecfdf3;

      color:#067647;

      font-size:13px;

      font-weight:700;

    }


    .login-success.show{

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

        rgba(
          255,
          255,
          255,
          .35
        );

      background:

        rgba(
          255,
          255,
          255,
          .12
        );

      color:#fff;

      border-radius:8px;

      padding:8px 11px;

      cursor:pointer;

      font-weight:800;

    }


    .logout-btn:hover{

      background:

        rgba(
          255,
          255,
          255,
          .22
        );

    }


    @media(
      max-width:700px
    ){

      .login-box{

        padding:
          24px
          20px;

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

    <div
      class="login-box"
    >

      <div
        class="login-logo"
      >

        <img
          src="ace-cesta.png"
          alt="ACE"
        >

      </div>


      <!-- ==================================================
           TELA DE LOGIN
           ================================================== -->

      <div
        id="loginView"
      >

        <div
          class="login-title"
        >
          ACE Ação de Cestas
        </div>


        <div
          class="login-subtitle"
        >
          Controle de Alimentos
        </div>


        <form
          id="loginForm"
        >

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


          <button
            id="registerButton"
            class="register-button"
            type="button"
          >
            📝 Criar minha conta
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


      <!-- ==================================================
           TELA DE CADASTRO
           ================================================== -->

      <div
        id="registerView"
        style="display:none;"
      >

        <div
          class="login-title"
        >
          📝 Criar minha conta
        </div>


        <div
          class="login-subtitle"
        >
          Cadastre seu acesso ao sistema
        </div>


        <form
          id="registerForm"
        >

          <label>

            Nome

            <input
              id="registerName"
              type="text"
              placeholder="Digite seu nome"
              autocomplete="name"
              required
            >

          </label>


          <label>

            E-mail

            <input
              id="registerEmail"
              type="email"
              placeholder="Digite seu e-mail"
              autocomplete="email"
              required
            >

          </label>


          <label>

            Senha

            <input
              id="registerPassword"
              type="password"
              placeholder="Crie uma senha"
              autocomplete="new-password"
              minlength="6"
              required
            >

          </label>


          <label>

            Confirmar senha

            <input
              id="registerPasswordConfirm"
              type="password"
              placeholder="Digite a senha novamente"
              autocomplete="new-password"
              minlength="6"
              required
            >

          </label>


          <button
            id="createAccountButton"
            class="login-button"
            type="submit"
          >
            📝 Criar conta
          </button>


          <button
            id="backToLoginButton"
            class="back-button"
            type="button"
          >
            ← Voltar para o login
          </button>


          <div
            id="registerError"
            class="login-error"
          ></div>


          <div
            id="registerSuccess"
            class="login-success"
          ></div>


          <div
            id="registerLoading"
            class="login-loading"
          ></div>

        </form>

      </div>

    </div>

  `;


  document.body.appendChild(
    login
  );


  // ==========================================================
  // LOGIN
  // ==========================================================

  document
    .getElementById(
      "loginForm"
    )
    .addEventListener(
      "submit",
      loginUser
    );


  // ==========================================================
  // ABRIR CADASTRO
  // ==========================================================

  document
    .getElementById(
      "registerButton"
    )
    .addEventListener(
      "click",
      showRegisterScreen
    );


  // ==========================================================
  // VOLTAR PARA LOGIN
  // ==========================================================

  document
    .getElementById(
      "backToLoginButton"
    )
    .addEventListener(
      "click",
      showLoginScreen
    );


  // ==========================================================
  // CRIAR CONTA
  // ==========================================================

  document
    .getElementById(
      "registerForm"
    )
    .addEventListener(
      "submit",
      registerUser
    );

}


// ============================================================
// MOSTRAR TELA DE CADASTRO
// ============================================================

function showRegisterScreen() {

  const loginView =
    document.getElementById(
      "loginView"
    );


  const registerView =
    document.getElementById(
      "registerView"
    );


  if (!loginView ||
      !registerView) {

    return;

  }


  loginView.style.display =
    "none";


  registerView.style.display =
    "block";


  const error =
    document.getElementById(
      "registerError"
    );


  const success =
    document.getElementById(
      "registerSuccess"
    );


  if (error) {

    error.classList.remove(
      "show"
    );

    error.textContent =
      "";

  }


  if (success) {

    success.classList.remove(
      "show"
    );

    success.textContent =
      "";

  }


  document
    .getElementById(
      "registerName"
    )
    ?.focus();

}


// ============================================================
// VOLTAR PARA LOGIN
// ============================================================

function showLoginScreen() {

  const loginView =
    document.getElementById(
      "loginView"
    );


  const registerView =
    document.getElementById(
      "registerView"
    );


  if (!loginView ||
      !registerView) {

    return;

  }


  registerView.style.display =
    "none";


  loginView.style.display =
    "block";


  const error =
    document.getElementById(
      "loginError"
    );


  if (error) {

    error.classList.remove(
      "show"
    );

    error.textContent =
      "";

  }


  document
    .getElementById(
      "loginEmail"
    )
    ?.focus();

}


// ============================================================
// FIM DA PARTE 2
// ============================================================

// ============================================================
// 6. CRIAR USUÁRIO
// ============================================================

async function registerUser(
  event
) {

  event.preventDefault();


  const name =
    String(
      document.getElementById(
        "registerName"
      )?.value ||
      ""
    ).trim();


  const email =
    String(
      document.getElementById(
        "registerEmail"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      document.getElementById(
        "registerPassword"
      )?.value ||
      ""
    );


  const confirmPassword =
    String(
      document.getElementById(
        "registerPasswordConfirm"
      )?.value ||
      ""
    );


  const errorEl =
    document.getElementById(
      "registerError"
    );


  const successEl =
    document.getElementById(
      "registerSuccess"
    );


  const loadingEl =
    document.getElementById(
      "registerLoading"
    );


  const button =
    document.getElementById(
      "createAccountButton"
    );


  // ==========================================================
  // LIMPAR MENSAGENS
  // ==========================================================

  if (errorEl) {

    errorEl.classList.remove(
      "show"
    );

    errorEl.textContent =
      "";

  }


  if (successEl) {

    successEl.classList.remove(
      "show"
    );

    successEl.textContent =
      "";

  }


  // ==========================================================
  // VALIDAÇÕES
  // ==========================================================

  if (!name) {

    showRegisterError(
      "Informe seu nome."
    );

    return;

  }


  if (!email) {

    showRegisterError(
      "Informe seu e-mail."
    );

    return;

  }


  if (!email.includes("@")) {

    showRegisterError(
      "Informe um e-mail válido."
    );

    return;

  }


  if (
    password.length <
    6
  ) {

    showRegisterError(
      "A senha deve ter pelo menos 6 caracteres."
    );

    return;

  }


  if (
    password !==
    confirmPassword
  ) {

    showRegisterError(
      "As senhas não conferem."
    );

    return;

  }


  // ==========================================================
  // BLOQUEAR BOTÃO
  // ==========================================================

  if (button) {

    button.disabled =
      true;

  }


  if (loadingEl) {

    loadingEl.textContent =
      "Criando sua conta...";

  }


  try {

    console.log(
      "ACE: criando usuário:",
      email
    );


    // ========================================================
    // SUPABASE AUTH
    // ========================================================

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .signUp({

          email:

            email,

          password:

            password,

          options: {

            data: {

              nome:
                name,

              nome_completo:
                name

            }

          }

        });


    if (error) {

      throw error;

    }


    console.log(
      "ACE: usuário criado:",
      data?.user?.id
    );


    // ========================================================
    // CASO O SUPABASE EXIJA CONFIRMAÇÃO DE E-MAIL
    // ========================================================

    if (
      data?.user &&
      !data?.session
    ) {

      if (successEl) {

        successEl.textContent =

          "Conta criada com sucesso! " +
          "Verifique seu e-mail para confirmar a conta " +
          "e depois volte para fazer login.";

        successEl.classList.add(
          "show"
        );

      }


      if (loadingEl) {

        loadingEl.textContent =
          "";

      }


      if (button) {

        button.disabled =
          false;

      }


      return;

    }


    // ========================================================
    // CASO O LOGIN AUTOMÁTICO ESTEJA HABILITADO
    // ========================================================

    if (
      data?.session &&
      data?.user
    ) {

      currentUser =
        data.user;


      if (successEl) {

        successEl.textContent =
          "Conta criada com sucesso! Entrando no sistema...";

        successEl.classList.add(
          "show"
        );

      }


      if (loadingEl) {

        loadingEl.textContent =
          "";

      }


      // Pequena pausa para mostrar a confirmação

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            700
          )
      );


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      await initApp();


      return;

    }


    // ========================================================
    // SITUAÇÃO INESPERADA
    // ========================================================

    showRegisterError(
      "A conta foi criada, mas não foi possível iniciar a sessão automaticamente. Volte ao login e tente entrar."
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO CRIAR CONTA:",
      error
    );


    let message =
      error?.message ||
      "Não foi possível criar a conta.";


    // --------------------------------------------------------
    // MENSAGENS MAIS AMIGÁVEIS
    // --------------------------------------------------------

    const lower =
      String(
        message
      ).toLowerCase();


    if (
      lower.includes(
        "user already registered"
      ) ||
      lower.includes(
        "already registered"
      )
    ) {

      message =
        "Este e-mail já possui uma conta. Tente entrar com sua senha.";

    }


    else if (
      lower.includes(
        "password"
      ) &&
      lower.includes(
        "characters"
      )
    ) {

      message =
        "A senha precisa ter pelo menos 6 caracteres.";

    }


    else if (
      lower.includes(
        "invalid"
      ) &&
      lower.includes(
        "email"
      )
    ) {

      message =
        "O e-mail informado não é válido.";

    }


    else if (
      lower.includes(
        "rate limit"
      )
    ) {

      message =
        "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.";

    }


    else if (
      lower.includes(
        "signup"
      ) &&
      lower.includes(
        "disabled"
      )
    ) {

      message =
        "O cadastro de novos usuários está desativado no Supabase.";

    }


    showRegisterError(
      message
    );


  } finally {

    if (loadingEl) {

      loadingEl.textContent =
        "";

    }


    if (button) {

      button.disabled =
        false;

    }

  }

}


// ============================================================
// MOSTRAR ERRO DO CADASTRO
// ============================================================

function showRegisterError(
  message
) {

  const errorEl =
    document.getElementById(
      "registerError"
    );


  if (!errorEl) {

    alert(
      message
    );

    return;

  }


  errorEl.textContent =
    message;


  errorEl.classList.add(
    "show"
  );

}


// ============================================================
// FIM DA PARTE 3
// ============================================================

// ============================================================
// 7. LOGIN
// ============================================================

async function loginUser(
  event
) {

  event.preventDefault();


  const email =
    String(
      document.getElementById(
        "loginEmail"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      document.getElementById(
        "loginPassword"
      )?.value ||
      ""
    );


  const errorEl =
    document.getElementById(
      "loginError"
    );


  const loadingEl =
    document.getElementById(
      "loginLoading"
    );


  const button =
    document.getElementById(
      "loginButton"
    );


  // ==========================================================
  // LIMPAR MENSAGEM ANTERIOR
  // ==========================================================

  if (errorEl) {

    errorEl.classList.remove(
      "show"
    );

    errorEl.textContent =
      "";

  }


  if (!email) {

    showLoginError(
      "Informe seu e-mail."
    );

    return;

  }


  if (!password) {

    showLoginError(
      "Informe sua senha."
    );

    return;

  }


  if (button) {

    button.disabled =
      true;

  }


  if (loadingEl) {

    loadingEl.textContent =
      "Entrando...";

  }


  try {

    console.log(
      "ACE: tentando login:",
      email
    );


    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .signInWithPassword({

          email:
            email,

          password:
            password

        });


    if (error) {

      throw error;

    }


    if (
      !data?.user
    ) {

      throw new Error(
        "Usuário não retornado pelo Supabase."
      );

    }


    currentUser =
      data.user;


    console.log(
      "ACE: login realizado:",
      currentUser.email
    );


    // ========================================================
    // FECHAR LOGIN
    // ========================================================

    document
      .getElementById(
        "loginScreen"
      )
      ?.remove();


    // ========================================================
    // INICIAR SISTEMA
    // ========================================================

    await initApp();


  } catch (error) {

    console.error(
      "ACE - ERRO LOGIN:",
      error
    );


    let message =
      error?.message ||
      "Não foi possível entrar.";


    const lower =
      String(
        message
      ).toLowerCase();


    if (
      lower.includes(
        "invalid login credentials"
      )
    ) {

      message =
        "E-mail ou senha incorretos.";

    }


    else if (
      lower.includes(
        "email not confirmed"
      )
    ) {

      message =
        "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";

    }


    else if (
      lower.includes(
        "too many requests"
      )
    ) {

      message =
        "Muitas tentativas. Aguarde um pouco e tente novamente.";

    }


    else if (
      lower.includes(
        "jwt"
      )
    ) {

      message =
        "Sessão de autenticação inválida. Atualize a página e tente novamente.";

    }


    showLoginError(
      message
    );


  } finally {

    if (loadingEl) {

      loadingEl.textContent =
        "";

    }


    if (button) {

      button.disabled =
        false;

    }

  }

}


// ============================================================
// MOSTRAR ERRO DE LOGIN
// ============================================================

function showLoginError(
  message
) {

  const errorEl =
    document.getElementById(
      "loginError"
    );


  if (!errorEl) {

    alert(
      message
    );

    return;

  }


  errorEl.textContent =
    message;


  errorEl.classList.add(
    "show"
  );

}


// ============================================================
// 8. LOGOUT
// ============================================================

async function logoutUser() {

  try {

    const {
      error
    } =
      await supabaseClient
        .auth
        .signOut();


    if (error) {

      throw error;

    }


    currentUser =
      null;


    location.reload();


  } catch (error) {

    console.error(
      "ACE - ERRO LOGOUT:",
      error
    );


    alert(
      "Não foi possível sair do sistema:\n\n" +
      (
        error?.message ||
        "erro desconhecido"
      )
    );

  }

}


// ============================================================
// 9. BARRA DO USUÁRIO
// ============================================================

function addUserBar() {

  if (
    !currentUser
  ) {

    return;

  }


  // ----------------------------------------------------------
  // Evitar duplicação
  // ----------------------------------------------------------

  if (
    document.getElementById(
      "aceUserBar"
    )
  ) {

    return;

  }


  const header =
    document.querySelector(
      "header"
    );


  if (!header) {

    console.warn(
      "ACE: header não encontrado."
    );

    return;

  }


  const bar =
    document.createElement(
      "div"
    );


  bar.id =
    "aceUserBar";


  bar.className =
    "user-bar";


  const name =
    currentUser
      ?.user_metadata
      ?.nome ||
    currentUser
      ?.user_metadata
      ?.nome_completo ||
    "";


  bar.innerHTML = `

    <span
      class="user-email"
      title="${esc(
        currentUser.email ||
        ""
      )}"
    >

      👤
      ${
        esc(
          name ||
          currentUser.email ||
          "Usuário"
        )
      }

    </span>


    <button
      id="aceLogoutButton"
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
      "aceLogoutButton"
    )
    ?.addEventListener(
      "click",
      logoutUser
    );

}


// ============================================================
// 10. VERIFICAR SESSÃO
// ============================================================

async function startAuth() {

  // ----------------------------------------------------------
  // Criar a tela de login
  // ----------------------------------------------------------

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


    // ========================================================
    // JÁ ESTÁ LOGADO
    // ========================================================

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
      "ACE - ERRO AO VERIFICAR SESSÃO:",
      error
    );


    showLoginError(
      "Não foi possível verificar sua sessão. Atualize a página e tente novamente."
    );

  }


  // ==========================================================
  // ESCUTAR ALTERAÇÕES DE AUTENTICAÇÃO
  // ==========================================================

  supabaseClient
    .auth
    .onAuthStateChange(
      async (
        event,
        session
      ) => {

        console.log(
          "ACE AUTH:",
          event
        );


        // ------------------------------------------------------
        // LOGIN
        // ------------------------------------------------------

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


        // ------------------------------------------------------
        // LOGOUT
        // ------------------------------------------------------

        if (
          event ===
          "SIGNED_OUT"
        ) {

          currentUser =
            null;


          location.reload();

        }

      }
    );

}


// ============================================================
// FIM DA PARTE 4
// ============================================================

// ============================================================
// INICIALIZAÇÃO FINAL DO APLICATIVO
// ============================================================

// ============================================================
// PARTE 5 - INICIALIZAÇÃO DO SISTEMA + AUTENTICAÇÃO
// ============================================================


// ============================================================
// ATUALIZAR USUÁRIO ATUAL
// ============================================================

function setCurrentUserFromSession(user) {

  if (!user) {
    return;
  }

  try {

    if (
      typeof currentUser !== "undefined" &&
      currentUser !== null
    ) {

      currentUser.id =
        user.id || null;

      currentUser.email =
        user.email || "";

      currentUser.nome =
        user.user_metadata?.nome ||
        user.user_metadata?.nome_completo ||
        user.user_metadata?.name ||
        "";

    }

  } catch (error) {

    console.error(
      "ACE - ERRO AO ATUALIZAR USUÁRIO:",
      error
    );

  }

}


// ============================================================
// CARREGAR DADOS DO SISTEMA
// ============================================================
//
// IMPORTANTE:
// A versão anterior chamava:
//
//     db = load();
//
// A função load() não existe no aplicativo.
// Isso causava:
//
//     load is not defined
//
// Aqui verificamos as funções de carregamento que possam
// existir nas outras partes do app.js, sem alterar nenhuma
// delas.
// ============================================================

async function carregarDadosDoSistema() {

  console.log(
    "ACE: iniciando carregamento dos dados..."
  );


  // ----------------------------------------------------------
  // PRIMEIRA POSSIBILIDADE
  // ----------------------------------------------------------

  if (
    typeof loadFromSupabase ===
    "function"
  ) {

    console.log(
      "ACE: usando loadFromSupabase()."
    );

    return await loadFromSupabase();

  }


  // ----------------------------------------------------------
  // SEGUNDA POSSIBILIDADE
  // ----------------------------------------------------------

  if (
    typeof loadData ===
    "function"
  ) {

    console.log(
      "ACE: usando loadData()."
    );

    return await loadData();

  }


  // ----------------------------------------------------------
  // TERCEIRA POSSIBILIDADE
  // ----------------------------------------------------------

  if (
    typeof carregarDados ===
    "function"
  ) {

    console.log(
      "ACE: usando carregarDados()."
    );

    return await carregarDados();

  }


  // ----------------------------------------------------------
  // QUARTA POSSIBILIDADE
  // ----------------------------------------------------------

  if (
    typeof carregarDadosSupabase ===
    "function"
  ) {

    console.log(
      "ACE: usando carregarDadosSupabase()."
    );

    return await carregarDadosSupabase();

  }


  // ----------------------------------------------------------
  // QUINTA POSSIBILIDADE
  // ----------------------------------------------------------

  if (
    typeof loadDatabase ===
    "function"
  ) {

    console.log(
      "ACE: usando loadDatabase()."
    );

    return await loadDatabase();

  }


  // ----------------------------------------------------------
  // SE O BANCO JÁ EXISTIR
  // ----------------------------------------------------------

  if (
    typeof db !== "undefined" &&
    db !== null
  ) {

    console.log(
      "ACE: banco já disponível."
    );

    return db;

  }


  // ----------------------------------------------------------
  // NÃO ENCONTRADO
  // ----------------------------------------------------------

  console.warn(
    "ACE: nenhuma função específica de carregamento encontrada."
  );

  return null;

}


// ============================================================
// INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  // ----------------------------------------------------------
  // EVITA CARREGAR O SISTEMA DUAS VEZES
  // ----------------------------------------------------------

  if (
    typeof appStarted !== "undefined" &&
    appStarted
  ) {

    console.log(
      "ACE: aplicativo já iniciado."
    );

    return;

  }


  if (
    typeof appStarted !== "undefined"
  ) {

    appStarted = true;

  }


  try {

    console.log(
      "ACE: carregando banco..."
    );


    // ========================================================
    // CARREGAMENTO CORRIGIDO
    // ========================================================

    const dadosCarregados =
      await carregarDadosDoSistema();


    // --------------------------------------------------------
    // SOMENTE atualiza db se alguma função retornou dados
    // --------------------------------------------------------

    if (
      dadosCarregados !== null &&
      dadosCarregados !== undefined
    ) {

      db =
        dadosCarregados;

    }


    console.log(
      "ACE: banco carregado."
    );


    // ========================================================
    // DATAS
    // ========================================================

    if (
      typeof setDates ===
      "function"
    ) {

      setDates();

    }


    // ========================================================
    // NAVEGAÇÃO
    // ========================================================

    if (
      typeof nav ===
      "function"
    ) {

      nav();

    }


    // ========================================================
    // EVENTOS
    // ========================================================

    if (
      typeof bindEvents ===
      "function"
    ) {

      bindEvents();

    }


    // ========================================================
    // BACKUP
    // ========================================================

    if (
      typeof setupBackup ===
      "function"
    ) {

      setupBackup();

    }


    // ========================================================
    // PWA
    // ========================================================

    if (
      typeof setupPWA ===
      "function"
    ) {

      setupPWA();

    }


    // ========================================================
    // BARRA DO USUÁRIO
    // ========================================================

    if (
      typeof addUserBar ===
      "function"
    ) {

      addUserBar();

    }


    // ========================================================
    // RENDERIZAR SISTEMA
    // ========================================================

    if (
      typeof renderAll ===
      "function"
    ) {

      renderAll();

    }


    console.log(
      "ACE: aplicativo iniciado com sucesso."
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO INICIAR SISTEMA:",
      error
    );


    if (
      typeof appStarted !== "undefined"
    ) {

      appStarted =
        false;

    }


    alert(

      "Erro ao carregar o sistema:\n\n" +

      (
        error?.message ||
        "Erro desconhecido"
      )

    );

  }

}


// ============================================================
// INICIAR AUTENTICAÇÃO
// ============================================================

async function startAuth() {

  console.log(
    "ACE: iniciando autenticação..."
  );


  try {

    // ========================================================
    // VERIFICAR SE O CLIENTE SUPABASE EXISTE
    // ========================================================

    if (
      typeof supabaseClient ===
      "undefined" ||
      !supabaseClient
    ) {

      throw new Error(
        "Cliente Supabase não encontrado."
      );

    }


    // ========================================================
    // OUVIR ALTERAÇÕES DE AUTENTICAÇÃO
    // ========================================================

    if (
      !window.__aceAuthListenerRegistered
    ) {

      window.__aceAuthListenerRegistered =
        true;


      supabaseClient
        .auth
        .onAuthStateChange(
          async (
            event,
            session
          ) => {

            console.log(
              "ACE AUTH:",
              event
            );


            // ================================================
            // LOGIN REALIZADO
            // ================================================

            if (
              event ===
              "SIGNED_IN"
            ) {

              if (
                session?.user
              ) {

                console.log(
                  "ACE: usuário autenticado:",
                  session.user.email
                );


                setCurrentUserFromSession(
                  session.user
                );


                const loginScreen =
                  document.getElementById(
                    "loginScreen"
                  );


                if (loginScreen) {

                  loginScreen.remove();

                }


                await initApp();

              }

            }


            // ================================================
            // TOKEN ATUALIZADO
            // ================================================

            else if (
              event ===
              "TOKEN_REFRESHED"
            ) {

              if (
                session?.user
              ) {

                setCurrentUserFromSession(
                  session.user
                );

              }

            }


            // ================================================
            // LOGOUT
            // ================================================

            else if (
              event ===
              "SIGNED_OUT"
            ) {

              console.log(
                "ACE: usuário saiu."
              );


              if (
                typeof currentUser !==
                "undefined" &&
                currentUser !== null
              ) {

                currentUser.id =
                  null;

                currentUser.email =
                  "";

                currentUser.nome =
                  "";

              }


              location.reload();

            }

          }
        );

    }


    // ========================================================
    // VERIFICAR SESSÃO EXISTENTE
    // ========================================================

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


    // ========================================================
    // USUÁRIO JÁ ESTÁ LOGADO
    // ========================================================

    if (
      data?.session?.user
    ) {

      console.log(
        "ACE: sessão encontrada."
      );


      setCurrentUserFromSession(
        data.session.user
      );


      // ------------------------------------------------------
      // REMOVE A TELA DE LOGIN
      // ------------------------------------------------------

      const loginScreen =
        document.getElementById(
          "loginScreen"
        );


      if (loginScreen) {

        loginScreen.remove();

      }


      // ------------------------------------------------------
      // CARREGA O SISTEMA
      // ------------------------------------------------------

      await initApp();


      return;

    }


    // ========================================================
    // NÃO ESTÁ LOGADO
    // ========================================================

    console.log(
      "ACE: nenhuma sessão encontrada."
    );


    if (
      typeof createLoginScreen ===
      "function"
    ) {

      createLoginScreen();

    }


  } catch (error) {

    console.error(
      "ACE - ERRO AO VERIFICAR SESSÃO:",
      error
    );


    // --------------------------------------------------------
    // SE NÃO EXISTIR TELA DE LOGIN,
    // TENTA CRIÁ-LA
    // --------------------------------------------------------

    if (
      typeof createLoginScreen ===
      "function"
    ) {

      createLoginScreen();

    }


    const errorMessage =
      error?.message ||
      "";


    // --------------------------------------------------------
    // ERRO DE JWT
    // --------------------------------------------------------

    if (
      errorMessage
        .toLowerCase()
        .includes("jwt")
    ) {

      console.warn(
        "ACE: problema de JWT detectado."
      );

      return;

    }


    console.error(
      "ACE: erro de autenticação:",
      errorMessage
    );

  }

}


// ============================================================
// INICIAR APLICAÇÃO
// ============================================================

startAuth();


// ============================================================
// FIM DA PARTE 5
// ============================================================
