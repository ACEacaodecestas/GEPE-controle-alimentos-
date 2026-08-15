# Controle de Alimentos — Android/PWA

Aplicativo web progressivo (PWA) para registrar:
- presença diária com nome e matrícula;
- entradas de alimentos;
- origem da entrada (Piedade, Água Fria ou outras);
- saídas;
- perdas e motivos;
- estoque separado por origem;
- relatório por período;
- exportação CSV para abrir no Excel;
- backup e restauração dos dados.

## Como testar no computador

Não abra `index.html` diretamente pelo duplo clique, porque o Service Worker precisa de HTTP/HTTPS.

Na pasta do projeto, rode um servidor local. Exemplo com Python:

`python -m http.server 8080`

Depois abra:

`http://localhost:8080`

## Como colocar no Android

A forma mais simples é publicar esta pasta em um serviço de hospedagem estática HTTPS, como GitHub Pages, Netlify ou Vercel.

No Android:
1. Abra o endereço no Chrome.
2. Use "Adicionar à tela inicial" ou o botão "Instalar" do aplicativo.
3. O app ficará com aparência de aplicativo e poderá funcionar offline depois do primeiro carregamento.

## Importante sobre os dados

Esta versão salva os registros no armazenamento local do navegador (localStorage). Isso permite começar imediatamente, mas os dados ficam vinculados ao aparelho/navegador.

Use o botão **Backup** regularmente.

## Próxima evolução recomendada

Para uso por vários celulares e vários usuários, trocar o armazenamento local por um banco de dados online, por exemplo Supabase/Firebase, acrescentando login, sincronização e histórico centralizado.
