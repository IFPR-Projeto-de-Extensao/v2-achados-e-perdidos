Localiza+ | Sistema de Achados e Perdidos

Plataforma digital de gerenciamento de objetos perdidos e encontrados do Instituto Federal do Paraná – Campus Ivaiporã.

Desenvolvido pela equipe InovaIF, no contexto de um Projeto de Extensão do curso de Sistemas de Informação.

[![Projeto](https://img.shields.io/badge/Projeto-Extensão-00843D)](https://www.ifpr.edu.br/)
[![Versão](https://img.shields.io/badge/Versão-1.10.11-blue)](https://github.com/IFPR-Projeto-de-Extensao/v2-achados-e-perdidos)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Backend-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)

---

📌 Sobre o projeto

O Localiza+ é uma plataforma web desenvolvida para modernizar e organizar o processo de Achados e Perdidos do IFPR – Campus Ivaiporã.

A aplicação centraliza o registro, a consulta e o gerenciamento de objetos perdidos e encontrados, proporcionando um ambiente organizado para alunos, servidores e administradores.

O sistema busca reduzir a dependência de processos manuais, facilitar a localização de objetos e proporcionar maior transparência e segurança durante o processo de devolução.

Além de atender às necessidades institucionais, o projeto possui potencial de expansão para outras instituições e comunidades da região.

🎯 Objetivos

Objetivo geral

Desenvolver uma solução digital para otimizar o gerenciamento de Achados e Perdidos, melhorando a organização, a segurança e a eficiência do processo de recuperação de objetos.

Objetivos específicos

- Digitalizar o registro de objetos perdidos e encontrados.
- Centralizar as informações das ocorrências.
- Facilitar a consulta e identificação de objetos.
- Organizar o processo de reivindicação e devolução.
- Estabelecer níveis de acesso conforme os perfis institucionais.
- Manter registros das atividades realizadas.
- Disponibilizar ferramentas administrativas e de auditoria.
- Facilitar o acesso por computadores e dispositivos móveis.

---

👥 Equipe InovaIF

Projeto desenvolvido por estudantes do curso de Sistemas de Informação.

Integrantes

- Gabriel Oliveira da Silva
- Hélio Augusto de Souza Barros
- Kalil Padilha
- Luiz Gustavo Bernaki
- Paulo Cauan Lima Pereira

Instituição

Instituto Federal do Paraná – IFPR

Campus Ivaiporã

Endereço: Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400.

---

🧑‍💻 Tecnologias utilizadas

Front-end

Tecnologia| Finalidade
React 19| Construção da interface
TypeScript| Tipagem estática
Vite| Ferramentas de desenvolvimento e build
Tailwind CSS 4| Estilização
Lucide React| Ícones
Recharts| Visualização de dados

Backend e serviços

Tecnologia| Finalidade
Node.js 22| Ambiente de execução
Express| Servidor e APIs
Firebase Authentication| Autenticação de usuários
Cloud Firestore| Banco de dados
Firebase Admin SDK| Operações administrativas no servidor
Nodemailer| Envio de notificações por e-mail

Infraestrutura e ferramentas

- Vercel: hospedagem e implantação da aplicação.
- GitHub: versionamento e gerenciamento do código-fonte.
- Vitest: testes automatizados.
- ESBuild: compilação do servidor.
- Progressive Web App (PWA): suporte à experiência de instalação da aplicação.

---

🏗️ Arquitetura do sistema

O Localiza+ utiliza uma arquitetura web com interface React, servidor Node.js/Express e serviços Firebase.

                  ┌─────────────────────┐
                  │       Usuário       │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │     Localiza+       │
                  │   React + Vite      │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │   Node.js + Express │
                  │    APIs Server-side │
                  └──────────┬──────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
          ┌──────────┐ ┌──────────┐ ┌────────────┐
          │ Firebase │ │ Firestore│ │ Serviços   │
          │   Auth   │ │          │ │ de e-mail  │
          └──────────┘ └──────────┘ └────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │   Dados e registros │
                  │    da aplicação     │
                  └─────────────────────┘

O servidor também disponibiliza operações administrativas e serviços que exigem validação e autorização no backend.

---

🔐 Controle de acesso e permissões

O sistema utiliza controle de acesso baseado em funções (RBAC), considerando o perfil e as permissões do usuário.

Perfis disponíveis

Perfil| Permissões
ALUNO| Consultar ocorrências, pesquisar objetos e solicitar reivindicações.
SERVIDOR/TAE| Consultar, cadastrar e gerenciar objetos e ocorrências, conforme as permissões atribuídas.
ADMIN| Acessar recursos administrativos, gerenciar usuários e realizar operações administrativas autorizadas.

Regras importantes

- O cadastro de objetos é restrito aos perfis SERVIDOR/TAE e ADMIN.
- Usuários ALUNO não possuem autorização para cadastrar objetos.
- Alunos podem consultar ocorrências e solicitar a reivindicação de objetos.
- Operações administrativas exigem autorização compatível com o perfil.
- A interface não é considerada uma barreira de segurança suficiente.
- As permissões também são verificadas nas regras do Firestore e nos serviços de backend.

O sistema utiliza mecanismos adicionais de validação de contas, autenticação institucional e autorização para proteger os recursos da aplicação.

---

📦 Principais funcionalidades

🔎 1. Gerenciamento de achados e perdidos

Centraliza informações sobre objetos perdidos e encontrados.

Os registros podem conter:

- Nome ou identificação do objeto.
- Descrição.
- Categoria.
- Imagem.
- Local da ocorrência.
- Data e horário.
- Informações adicionais.
- Status da ocorrência.

📝 2. Registro de ocorrências

Permite acompanhar as ocorrências desde o cadastro até sua resolução.

O sistema organiza as informações para facilitar a identificação dos objetos e o acompanhamento das atividades relacionadas.

🔍 3. Pesquisa de objetos

Disponibiliza recursos de consulta e filtragem para facilitar a localização de objetos cadastrados.

Os usuários podem pesquisar ocorrências e verificar informações disponíveis de acordo com suas permissões.

🤝 4. Reivindicação de objetos

Permite que usuários solicitem a recuperação de objetos que acreditam ser seus.

As solicitações são encaminhadas para análise e tratamento conforme o fluxo de autorização do sistema.

🏷️ 5. Etiquetas de identificação

O sistema disponibiliza recursos para geração de etiquetas relacionadas às ocorrências.

Fluxo simplificado:

Cadastro da ocorrência
        ↓
Identificação do objeto
        ↓
Geração da etiqueta
        ↓
Identificação física

📋 6. Registro de devolução

O processo de devolução permite documentar a entrega do objeto ao responsável.

Conforme o fluxo implementado, podem ser registrados:

- Identificação da ocorrência.
- Atualização do status.
- Data e horário.
- Responsável pela operação.
- Informações de confirmação.
- Comprovante da devolução.

✍️ 7. Assinaturas e confirmações

O sistema possui recursos de assinatura e confirmação relacionados ao processo de devolução.

As operações de confirmação respeitam as permissões dos perfis autorizados.

📊 8. Painel administrativo

Disponibiliza ferramentas para acompanhamento e gerenciamento do sistema.

Entre os recursos administrativos estão:

- Visualização de ocorrências.
- Filtros e consultas.
- Gerenciamento de usuários.
- Acompanhamento de atividades.
- Recursos de auditoria.
- Ferramentas administrativas.

📄 9. Relatórios e documentos

O Localiza+ disponibiliza recursos para geração de documentos e relatórios em PDF.

Esses documentos podem auxiliar no acompanhamento administrativo, na organização das ocorrências e na auditoria do sistema.

🔔 10. Notificações

O sistema possui integração com serviços de envio de e-mail para notificações relacionadas às operações da aplicação.

O envio é realizado por serviços server-side, mantendo as credenciais de comunicação protegidas no ambiente de execução.

---

🛡️ Segurança

A segurança é um dos pilares do Localiza+.

A aplicação utiliza mecanismos de proteção distribuídos entre a autenticação, a interface, as regras do banco de dados e o backend.

Mecanismos de segurança

- Firebase Authentication para autenticação.
- Firestore Security Rules para controle de acesso aos dados.
- Firebase Admin SDK para operações administrativas.
- Controle de acesso baseado em funções.
- Validação de permissões no servidor.
- Proteção de rotas e operações sensíveis.
- Validação de contas e estados de autorização.
- Registro de atividades administrativas.
- Utilização de variáveis de ambiente para credenciais.
- Validação de operações relacionadas à devolução e confirmação.

Proteção de informações sensíveis

Nunca devem ser enviados ao GitHub:

- Senhas.
- Tokens de autenticação.
- Chaves privadas.
- Credenciais administrativas.
- Arquivos Service Account.
- Webhooks privados.
- Arquivos ".env" com informações confidenciais.

As credenciais devem ser configuradas nos ambientes apropriados, como as configurações de variáveis de ambiente da Vercel.

Importante: as chaves e credenciais privadas não devem ser inseridas diretamente no código-fonte.

---

🤖 Inteligência artificial

A integração com inteligência artificial encontra-se desativada na versão atual do Localiza+.

A aplicação deve ser utilizada e documentada considerando suas funcionalidades operacionais implementadas, sem depender de serviços de IA.

A indisponibilidade desses recursos não impede a utilização das funcionalidades convencionais de gerenciamento de Achados e Perdidos.

---

📱 Progressive Web App (PWA)

O Localiza+ possui suporte a Progressive Web App (PWA).

Essa tecnologia permite oferecer uma experiência semelhante à de um aplicativo instalado, dependendo dos recursos disponibilizados pelo navegador e pelo dispositivo.

Entre as características previstas estão:

- Possibilidade de instalação.
- Acesso por dispositivos móveis.
- Experiência adaptada a diferentes resoluções.
- Recursos de aplicação web progressiva.

A disponibilidade de funcionalidades específicas, como instalação e comportamento offline, depende da configuração da aplicação, do navegador e das condições de conectividade.

---

⚙️ Instalação e configuração

Pré-requisitos

Para executar o projeto localmente, são necessários:

- Node.js 22.x.
- npm.
- Git.
- Projeto Firebase configurado.
- Credenciais e variáveis de ambiente necessárias para os serviços utilizados.

1. Clonar o repositório

git clone https://github.com/IFPR-Projeto-de-Extensao/v2-achados-e-perdidos.git

2. Acessar o diretório

cd v2-achados-e-perdidos

3. Instalar dependências

npm install

4. Configurar variáveis de ambiente

Crie o arquivo ".env.local" na raiz do projeto.

Configure as variáveis necessárias para o Firebase e para os serviços server-side.

Exemplo de configuração do Firebase:

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

As demais variáveis devem seguir os nomes efetivamente utilizados pelo código da versão correspondente.

Atenção:

- Não compartilhe credenciais privadas.
- Não utilize chaves administrativas no frontend.
- Não publique arquivos de ambiente com informações confidenciais.
- Consulte a configuração do servidor antes de executar integrações externas.

5. Executar em desenvolvimento

npm run dev

Esse comando executa o servidor de desenvolvimento definido no projeto por meio do "tsx server.ts".

6. Verificar o código

npm run lint

Executa a verificação de tipos TypeScript.

7. Executar testes automatizados

npm test

Executa a suíte de testes utilizando Vitest.

8. Gerar build de produção

npm run build

O processo realiza a compilação da aplicação web e a geração do bundle do servidor.

9. Executar o servidor compilado

npm run start

Executa o servidor compilado em "dist/server.cjs".

---

🧪 Testes e qualidade

O desenvolvimento do Localiza+ utiliza testes automatizados e verificações técnicas para reduzir regressões e identificar problemas.

Entre os aspectos que devem ser verificados estão:

- Autenticação e encerramento de sessão.
- Controle de acesso dos perfis.
- Cadastro e gerenciamento de ocorrências.
- Pesquisa de objetos.
- Solicitações de reivindicação.
- Registro de devoluções.
- Geração de etiquetas.
- Geração de documentos PDF.
- Assinaturas e confirmações.
- Regras de segurança do Firestore.
- Operações administrativas.
- Notificações.
- Responsividade.
- Compatibilidade com navegadores.
- Funcionamento do PWA.
- Build de produção.

A execução dos testes deve ocorrer antes da disponibilização de alterações em produção.

---

🚀 Implantação

O projeto utiliza a Vercel como infraestrutura de hospedagem.

O processo de implantação pode seguir o fluxo:

        GitHub
           │
           ▼
   Código versionado
           │
           ▼
    Integração Vercel
           │
           ▼
      Build de produção
           │
           ▼
     Disponibilização
           │
           ▼
       Localiza+

As variáveis de ambiente devem ser configuradas diretamente no ambiente de hospedagem.

A configuração de produção deve considerar a versão do Node.js, os serviços Firebase, as APIs e as configurações de segurança necessárias.

A publicação de regras do Firestore e as alterações de infraestrutura devem ser tratadas como operações independentes, com validação própria.

---

📁 Estrutura do projeto

A estrutura geral do repositório contempla os seguintes elementos:

v2-achados-e-perdidos/
│
├── api/
│   └── ...
│
├── public/
│   └── ...
│
├── src/
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── views/
│   └── ...
│
├── server.ts
├── firestore.rules
├── firebase.json
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md

A organização interna pode evoluir conforme novas funcionalidades e necessidades técnicas forem incorporadas.

---

🔥 Firebase

O Firebase é utilizado como parte da infraestrutura principal do Localiza+.

Firebase Authentication

Responsável pela autenticação e identificação dos usuários.

Cloud Firestore

Banco de dados utilizado para armazenar as informações das ocorrências, usuários e demais registros da aplicação.

Firestore Security Rules

As regras de segurança controlam as operações de leitura, criação, atualização e exclusão dos dados.

As autorizações devem considerar a identidade do usuário, o estado da conta e as permissões atribuídas ao perfil.

Firebase Admin SDK

Utilizado pelo backend para operações administrativas que exigem privilégios de servidor.

As credenciais administrativas devem permanecer exclusivamente no ambiente server-side.

---

🔒 Privacidade e proteção de dados

O tratamento das informações deve observar as disposições da Lei Geral de Proteção de Dados Pessoais (LGPD), Lei nº 13.709/2018, e as orientações institucionais aplicáveis.

A documentação de privacidade deve informar:

- Quais informações são coletadas.
- Finalidades do tratamento.
- Como os dados são armazenados.
- Como ocorre o controle de acesso.
- Direitos dos titulares.
- Canais institucionais de contato.

A Política de Privacidade oficial deve ser mantida atualizada e disponibilizada aos usuários.

---

🤝 Contribuição e desenvolvimento

Por se tratar de um projeto de extensão institucional, as alterações devem ser realizadas de maneira organizada e documentada.

Fluxo recomendado

Criar branch
     ↓
Desenvolver alteração
     ↓
Executar testes
     ↓
Verificar TypeScript
     ↓
Validar build
     ↓
Realizar commit
     ↓
Enviar alterações
     ↓
Revisar Pull Request
     ↓
Integrar alterações

Criar uma branch

git checkout -b feature/nova-funcionalidade

Registrar alterações

git add .
git commit -m "feat: adiciona nova funcionalidade"

Enviar alterações

git push origin feature/nova-funcionalidade

Convenção de commits

Recomenda-se utilizar mensagens descritivas:

Prefixo| Utilização
"feat:"| Nova funcionalidade
"fix:"| Correção de problema
"security:"| Alteração de segurança
"refactor:"| Refatoração
"docs:"| Documentação
"test:"| Testes
"chore:"| Manutenção e dependências

---

🐛 Relato de problemas

Problemas encontrados durante a utilização ou desenvolvimento devem ser documentados com informações suficientes para permitir sua reprodução.

Recomenda-se informar:

1. Descrição do problema.
2. Passos para reprodução.
3. Comportamento esperado.
4. Comportamento observado.
5. Navegador e dispositivo utilizados.
6. Mensagens de erro.
7. Logs relevantes.
8. Capturas de tela, quando necessário.

Nunca inclua credenciais, senhas ou tokens em relatos públicos.

---

📜 Licença

O Localiza+ é desenvolvido no contexto de um Projeto de Extensão do Instituto Federal do Paraná – Campus Ivaiporã.

A distribuição, utilização e eventual licenciamento do código-fonte devem observar as orientações e autorizações institucionais aplicáveis.

---

📞 Contato

Projeto: Localiza+
Equipe: InovaIF
Instituição: Instituto Federal do Paraná – Campus Ivaiporã
E-mail: localizamais6@gmail.com

Repositório:
https://github.com/IFPR-Projeto-de-Extensao/v2-achados-e-perdidos

---

📌 Status do projeto

Versão documentada: 1.10.10

O Localiza+ encontra-se em desenvolvimento e evolução contínua, com foco na estabilidade, segurança, organização das ocorrências e melhoria da experiência dos usuários.

A documentação deste repositório deve acompanhar as funcionalidades efetivamente implementadas e disponibilizadas na versão correspondente.

---

<p align="center">LOCALIZA+

Tecnologia para tornar o processo de Achados e Perdidos mais simples, organizado e acessível.

Desenvolvido pela equipe InovaIF
IFPR – Campus Ivaiporã

</p>