# Documentação de Entrega — Localiza+ (APS)

**Disciplina:** Análise e Projeto de Sistemas (APS) — Sistemas de Informação  
**Instituição:** Instituto Federal do Paraná (IFPR) — Campus Ivaiporã  
**Versão Auditada:** `v1.10.13`

---

## 1. Nome do Sistema

**Localiza+ — Sistema Institucional de Achados e Perdidos (IFPR Campus Ivaiporã)**

## 2. Descrição Objetiva

O **Localiza+** é uma aplicação web progressiva (PWA) voltada à gestão institucional de achados e perdidos do IFPR Campus Ivaiporã. A plataforma permite consulta pública de pertences perdidos, encontrados e devolvidos, busca textual e por voz, rastreamento por etiquetas QR Code, análise visual assistida por IA no cadastro de objetos, reivindicação de propriedade com controle de permissões (RBAC), devoluções formais com comprovante e assinatura eletrônica (presencial ou remota) e painel administrativo completo com trilha de auditoria.

## 3. Links Públicos do Projeto

> **Aviso de Conformidade:** Preencher os campos abaixo com os links reais validados antes do envio ao professor. Nenhum link fictício foi inserido automaticamente.

- **Link do Sistema Hospedado (Produção):** `[PREENCHER PELO RESPONSÁVEL — ex.: URL pública da Vercel/Cloud Run]`
- **Repositório GitHub:** `[PREENCHER PELO RESPONSÁVEL — ex.: https://github.com/usuario/repositorio]`
- **Manual do Usuário (HTML direto):** `[URL_PUBLICA]/manual-usuario.html`
- **Página de Ajuda e Manual (HTML + PDF no sistema):** `[URL_PUBLICA]/ajuda`

## 4. Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide Icons, Motion, D3.js / Recharts, `jspdf` + `jspdf-autotable` (geração de PDFs e relatórios), `qrcode.react` / `html5-qrcode`.
- **PWA & Offline:** `vite-plugin-pwa` (Workbox), Service Worker customizado (`public/sw-custom.js`), IndexedDB (`src/lib/offlineDb.ts`) com tombstones anti-ressurreição.
- **Backend / APIs:** Node.js + Express (`server.ts`) e Serverless Functions compatíveis com Vercel (`api/[...route].ts`, `api/*`).
- **Banco de Dados e Autenticação:** Firebase Authentication (e-mail/senha + Google) e Cloud Firestore (banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`).
- **Integrações Reais (via variáveis de ambiente):** Google Gemini (`@google/genai` via proxy server-side `/api/ai/analyze-image`), SMTP/Nodemailer, Discord Webhooks.
- **Qualidade e Testes:** Vitest + Testing Library + testes de Firestore Security Rules no Cloud Firestore Emulator.

## 5. Como Acessar o Sistema

1. Acesse a URL pública da aplicação em navegador desktop ou mobile (Chrome, Edge, Safari ou Firefox).
2. A **Tela Inicial (`/`)** permite pesquisar objetos imediatamente sem necessidade de login, abrir o leitor de **QR Code**, consultar o catálogo completo (`/objetos`) e acessar o botão **Ajuda (`/ajuda`)**.
3. Opcionalmente, instale o sistema como aplicativo **PWA** pelo botão **Instalar App (PWA)** no menu/rodapé ou pelas opções do navegador.

## 6. Como Criar uma Conta (Comunidade IFPR e Comunidade Externa)

1. Clique em **Entrar** na barra superior e selecione a aba **Criar Conta**.
2. Preencha **Nome Completo**, **E-mail** e **Senha** (mínimo 6 caracteres).
3. O sistema classifica automaticamente o vínculo:
   - `@estudantes.ifpr.edu.br` → **Discente (Aluno IFPR)**
   - `@ifpr.edu.br` → **Servidor / TAE IFPR** (cadastro de objetos e gestão liberados após aprovação administrativa)
   - Demais domínios (ex.: `@gmail.com`, `@outlook.com`, `@yahoo.com`) → **Comunidade Externa**
4. Aceite os Termos de Uso e a Política de Privacidade e finalize o cadastro.
5. **Verificação de E-mail:** Abra o e-mail de confirmação enviado pelo Firebase Authentication (verifique também a caixa de Spam), clique no link de verificação e confirme em **Já verifiquei meu e-mail** na rota `/verificar-email`.

## 7. Perfis de Usuário e Permissões Reais

| Perfil | Origem | O que pode fazer | Restrições de Segurança |
| :--- | :--- | :--- | :--- |
| **Visitante** | Sem login | Consultar catálogo público, buscar por texto/voz/filtros, ver detalhes públicos, ler QR Code, acessar Manual (`/ajuda`), enviar feedback/suporte público. | Não cadastra objetos, não reivindica online, não acessa `/admin` nem dados privados. |
| **Comunidade Externa (`INTRUSO`)** | E-mail não institucional verificado | Criar conta, verificar e-mail, fazer login/logout, recuperar senha, consultar catálogo público, ler QR Code, **reivindicar objetos online (`/claims`)**, acompanhar/cancelar suas próprias reivindicações, gerenciar suas próprias notificações e atualizar dados pessoais do próprio perfil. | Não cadastra objetos, não acessa `/admin`, não visualiza/altera reivindicações ou notificações de terceiros e não pode alterar cargo ou campos de controle. |
| **Discente (`ALUNO`)** | `@estudantes.ifpr.edu.br` verificado | Tudo acima + abrir reivindicações online (`/claims`), acompanhar status, receber/gerenciar notificações e editar o próprio perfil. | Não cadastra objetos diretamente no catálogo e não acessa `/admin`. |
| **Servidor (`SERVIDOR`)** | `@ifpr.edu.br` verificado e aprovado | Cadastrar/editar objetos, imprimir etiquetas QR, analisar reivindicações, registrar devoluções formais (assinatura presencial/remota) e acessar o Painel do Servidor. | Não promove administradores nem altera governança global de papéis. |
| **Administrador (`ADMIN`)** | Governança / Root Admin | Acesso integral ao Painel Administrativo (`/admin`): usuários, aprovações de servidores, objetos, devoluções e reaberturas, auditoria, relatórios PDF/CSV, feedbacks/bugs, monitoramento e configurações. | Regras fail-closed no Firestore e validação server-side via Firebase Admin ID Token. |

## 8. Funcionalidades Implementadas

- Consulta pública de objetos com busca rápida, busca por voz, filtros por categoria/status/local e modos **Grade** e **Lista**.
- Cadastro de objetos perdidos e encontrados (perfis autorizados) com upload de fotos comprimidas, campos privados de custódia (`/item_private`) e geração automática de **QR Code**.
- Impressão de **Etiqueta QR Code** e **Leitor de QR Code** integrado à câmera do dispositivo.
- Análise visual de imagens com IA (`@google/genai`) no servidor quando `GEMINI_API_KEY` está configurada.
- Fluxo formal de reivindicação e devolução (`/api/items/register-return`, `/api/items/reopen-return`, `/item_return_records`) com recibo imprimível, assinatura eletrônica presencial ou link remoto com token criptografado.
- Painel Administrativo e do Servidor com métricas reais (D3.js/Recharts), gestão de usuários, trilha de auditoria e exportação de documentos/relatórios.
- **Tour Guiado por Foco (Spotlight)** adaptado ao perfil do usuário.
- **Ajuda e Manual do Usuário** em HTML e PDF diretamente na tela inicial.
- **PWA instalável** com suporte offline e proteção anti-ressurreição na exclusão de objetos.

## 9. Roteiro Sugerido de Testes para o Professor Avaliador

### Cenário A — Navegação Pública e Manual (Visitante)
1. Abrir a Tela Inicial (`/`), testar busca rápida e os atalhos **Consultar Objetos**, **Encontrados**, **Perdidos** e **Devolvidos**.
2. Clicar no botão **Ajuda** na tela inicial (`/ajuda`), abrir o **Manual em HTML** (`/manual-usuario.html`) e testar o download do **Manual em PDF**.
3. Testar o leitor de **QR Code** (se houver câmera) e o formulário de **Suporte** (`/suporte`).

### Cenário B — Conta da Comunidade Externa
1. Clicar em **Entrar → Criar Conta** e registrar uma conta usando e-mail externo (ex.: Gmail/Outlook pessoal de teste).
2. Confirmar que o vínculo exibido é **Comunidade Externa** e concluir a verificação de e-mail.
3. Fazer login, editar nome/telefone no próprio perfil (`/perfil`), testar reivindicação de um objeto no catálogo, acompanhar a solicitação em **Meu Perfil**, verificar suas próprias notificações, sair e testar **Esqueceu sua senha?**.
4. Confirmar que o usuário externo **não consegue** acessar `/admin`, cadastrar objetos, alterar o próprio cargo nem acessar reivindicações/notificações de terceiros.

### Cenário C — Conta de Administrador (Testes de Gestão e Segurança)
1. Autenticar com a conta administradora (fornecida em canal reservado pelo grupo).
2. Acessar `/admin`: verificar dashboards reais, gestão de usuários, aprovação de servidores, controle de itens, logs de auditoria e monitoramento.
3. Cadastrar um objeto de teste em `/cadastrar`, gerar/visualizar sua etiqueta QR Code, editar dados, testar o fluxo de devolução formal ou exclusão e confirmar que **após excluir o registro ele não reaparece** (mesmo recarregando a página).
4. Remover quaisquer registros de teste criados ao final da avaliação, se desejado.

## 10. Acesso Administrativo para Avaliação

- **E-mail da conta administradora cadastrada no projeto:** `paulocauan39@gmail.com` (Root Admin institucional configurado no código e nas Firestore Rules).
- **Credenciais / Senha de avaliação:** `[FORNECER AO PROFESSOR EM CANAL PRIVADO / SEGURO — NUNCA VERSIONAR SENHAS NO REPOSITÓRIO]`.
- Caso o professor deseje testar com sua própria conta (inclusive e-mail externo), o Root Admin pode atribuir temporariamente a permissão `ADMIN` em `/admin/usuarios` (coleção `role_assignments`).

## 11. Onde Encontrar o Manual do Usuário

- **Botão na Tela Inicial:** Botão **Ajuda** ao lado de *Consultar Objetos* (visível em desktop e mobile).
- **Menu Superior e Rodapé:** Link **Ajuda** na barra de navegação superior, no menu lateral mobile e no rodapé.
- **Página In-App (com botão de download PDF e link HTML):** `/ajuda` ou `/manual`.
- **Arquivo HTML Independente (pronto para impressão/PDF):** `/manual-usuario.html`.

## 12. Checklist Pré-Entrega de Limpeza do Banco de Dados (Operação Manual)

Antes da avaliação final, o administrador deve confirmar no **Firebase Console → Cloud Firestore** (banco `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`) que não restam registros fictícios de desenvolvimento:
- [ ] Revisar e limpar itens de teste em `items`, `item_private`, `item_history`, `item_return_records`, `claims` e `signature_requests`.
- [ ] Limpar baterias fictícias em `test_executions` (a interface agora exibe estado vazio real quando a coleção está vazia).
- [ ] Remover usuários de teste em `users` e no Firebase Authentication, **preservando obrigatoriamente** a conta administradora (`paulocauan39@gmail.com`, UID `hCG5mDgK1fRaTojULzlM7dXvb7n2`) e contas legítimas.
- [ ] Limpar tickets/notificações de teste em `support_tickets`, `notifications`, `email_notifications` e `analytics_events`, mantendo `system_config` intacta.

## 13. Observações Importantes para a Avaliação

1. **Dados 100% Reais:** Nenhuma tela operacional exibe registros fictícios ou mockados; quando não há registros no Firestore, o sistema apresenta estados vazios apropriados.
2. **Comunidade Externa e Reivindicações Online (Etapa 2):** O código da aplicação e o arquivo `firestore.rules` local foram atualizados para permitir que usuários externos autenticados, com e-mail verificado e conta ativa (`INTRUSO` em standing ativo) criem e acompanhem suas próprias reivindicações (`/claims`), editem apenas campos pessoais permitidos do próprio perfil (`/users/{uid}`) e gerenciem somente suas próprias notificações (`/notifications`), preservando integralmente o bloqueio de cadastro de objetos, painel `/admin` e proteção contra escalonamento de privilégios. **Atenção:** para que a permissão entre em vigor no banco de produção, as regras atualizadas de `firestore.rules` devem ser publicadas manualmente no Firebase Console para o banco nomeado `ai-studio-ifprachadosperdi-d3034e26-954c-413d-8c6d-f7e508afe8b1`.
3. **Recursos Dependentes de Variáveis de Ambiente:** Análise de imagem por IA (`GEMINI_API_KEY`), disparo de e-mail SMTP (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`) e notificações no Discord (`DISCORD_*_WEBHOOK_URL`) operam em modo real quando as respectivas variáveis estão configuradas no ambiente hospedado; na ausência delas, o sistema informa o status de forma transparente sem simular sucesso.
4. **Integridade do Firebase Storage:** O sistema não utiliza Firebase Storage para upload de imagens (as imagens são comprimidas e persistidas via Firestore). Recomenda-se manter regras de bloqueio total (*deny all*) no Firebase Storage caso o bucket esteja habilitado no projeto.
