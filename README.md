# Localiza+

Sistema web para gerenciamento de **Achados e Perdidos**, desenvolvido pela equipe **InovaIF** para o **IFPR Campus Ivaiporã**.

O Localiza+ tem como objetivo centralizar o registro, consulta e gerenciamento de objetos perdidos e encontrados, facilitando a comunicação entre alunos, servidores e a administração responsável pelo serviço de Achados e Perdidos.

---

## 📌 Sobre o projeto

O **Localiza+** é um projeto de extensão desenvolvido no **Instituto Federal do Paraná (IFPR) – Campus Ivaiporã**, inicialmente voltado para melhorar o processo de gerenciamento de objetos perdidos e encontrados dentro da instituição.

A proposta é substituir processos manuais e descentralizados por uma plataforma digital que permita:

* Registrar objetos perdidos;
* Registrar objetos encontrados;
* Pesquisar ocorrências;
* Facilitar a identificação de possíveis correspondências;
* Registrar a devolução de objetos;
* Gerenciar usuários e permissões;
* Manter histórico das ocorrências;
* Disponibilizar recursos administrativos e de auditoria;
* Melhorar a comunicação entre usuários e responsáveis pelo sistema.

O projeto poderá futuramente ser expandido para outras instituições, órgãos públicos e comunidades da região.

---

## 🎯 Objetivos

### Objetivo geral

Desenvolver uma plataforma digital para otimizar o processo de Achados e Perdidos, proporcionando maior organização, segurança e facilidade de acesso às informações.

### Objetivos específicos

* Digitalizar o cadastro de objetos perdidos e encontrados;
* Reduzir a dependência de registros físicos;
* Facilitar a localização de objetos;
* Melhorar o controle das ocorrências;
* Registrar o processo de devolução;
* Permitir diferentes níveis de acesso;
* Aumentar a segurança das informações;
* Fornecer ferramentas administrativas para acompanhamento do sistema.

---

## 👥 Equipe

Projeto desenvolvido pela equipe **InovaIF**.

### Integrantes

* Gabriel Oliveira da Silva
* Hélio Augusto de Souza Barros
* Kalil Padilha
* Luiz Gustavo Bernaki
* Paulo Cauan Lima Pereira
* Vitor Gonçalves Guerino Moraes

### Instituição

**Instituto Federal do Paraná – Campus Ivaiporã**

Endereço:

> Rua Max Arthur Greipel, nº 505 – Parque Industrial
> Ivaiporã – PR, 86873-400

---

## 🧑‍💻 Tecnologias utilizadas

O sistema utiliza tecnologias modernas para desenvolvimento de aplicações web.

### Front-end

* **React**
* **TypeScript**
* **Vite**
* **HTML5**
* **CSS**
* **JavaScript**

### Backend e serviços

* **Firebase Authentication**
* **Cloud Firestore**
* **Firebase Analytics**
* **Firebase Performance Monitoring**
* APIs e funções server-side

### Infraestrutura

* **Vercel**
* **GitHub**

### Outros recursos

* Progressive Web App (PWA)
* Integração com Discord para notificações
* Geração de relatórios e documentos em PDF
* Sistema de controle de acesso baseado em funções

---

## 🔐 Controle de acesso

O Localiza+ possui diferentes níveis de acesso para controlar os recursos disponíveis para cada usuário.

Entre os perfis utilizados pelo sistema estão:

| Perfil            | Descrição                                                                |
| ----------------- | ------------------------------------------------------------------------ |
| **Aluno**         | Pode utilizar os recursos destinados aos usuários comuns                 |
| **Servidor/TAE**  | Possui recursos adicionais relacionados ao gerenciamento das ocorrências |
| **Administrador** | Possui acesso aos recursos administrativos e de gerenciamento do sistema |

As permissões devem ser controladas tanto pela interface quanto pelas regras de segurança do backend e do Firestore.

---

## 📦 Principais funcionalidades

### 🔎 Achados e Perdidos

O sistema permite o registro de:

* Objetos perdidos;
* Objetos encontrados;
* Descrição dos objetos;
* Local onde foram perdidos ou encontrados;
* Data e horário;
* Informações adicionais;
* Status da ocorrência.

---

### 📝 Registro de ocorrências

Cada ocorrência pode possuir informações utilizadas para facilitar a identificação do objeto.

O sistema permite acompanhar o ciclo da ocorrência desde seu cadastro até sua resolução.

---

### 🏷️ Etiquetas

As ocorrências podem possuir recursos para geração de etiquetas, facilitando a identificação física dos objetos armazenados.

Fluxo:

```text
Ocorrência
    ↓
Gerar etiqueta
    ↓
Etiqueta do objeto
```

---

### 🤝 Registro de devolução

Quando um objeto é devolvido, o sistema permite registrar a devolução da ocorrência.

O processo pode incluir:

```text
Ocorrência
    ↓
Registrar devolução
    ↓
Atualizar status
    ↓
Registrar data/hora
    ↓
Identificar responsável
    ↓
Gerar comprovante
```

---

### 📊 Dashboard administrativo

O painel administrativo permite acompanhar informações do sistema e realizar operações administrativas.

Entre os recursos estão:

* Visualização de ocorrências;
* Filtros;
* Gerenciamento de usuários;
* Acompanhamento de atividades;
* Auditoria;
* Relatórios;
* Administração do sistema.

---

### 📄 Relatórios

O sistema possui recursos para geração de relatórios em PDF a partir das informações disponíveis no sistema.

Os relatórios podem ser utilizados para fins administrativos, acompanhamento do projeto e auditoria.

---

### 🔔 Notificações

O Localiza+ possui integração com serviços externos para envio de notificações relacionadas às atividades do sistema.

Entre os recursos utilizados está a integração com **Discord**, permitindo encaminhar determinados eventos para canais específicos.

As credenciais utilizadas para integrações devem permanecer protegidas e nunca devem ser armazenadas diretamente no código-fonte.

---

## 🏗️ Arquitetura simplificada

```text
                    ┌──────────────────┐
                    │      Usuário     │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    Localiza+     │
                    │   React + Vite   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │   Firebase │ │   APIs /   │ │  Serviços  │
       │    Auth    │ │  Backend   │ │  externos  │
       └────────────┘ └────────────┘ └──────┬─────┘
              │                             │
              ▼                             ▼
       ┌────────────┐                  ┌────────────┐
       │ Firestore  │                  │  Discord   │
       └────────────┘                  └────────────┘
```

---

## 🔒 Segurança

A segurança é uma parte importante do projeto.

O sistema utiliza mecanismos como:

* Firebase Authentication;
* Regras de segurança do Firestore;
* Controle de acesso baseado em funções;
* Validação de autenticação;
* Proteção de rotas sensíveis;
* Variáveis de ambiente para informações privadas;
* Controle de permissões no backend;
* Registro de atividades administrativas.

### ⚠️ Informações sensíveis

**Nunca coloque no GitHub:**

* Senhas;
* Tokens;
* Chaves privadas;
* URLs de Webhooks do Discord;
* Credenciais de serviços;
* Arquivos `.env` contendo informações secretas;
* Service Account Keys;
* Tokens de autenticação.

Utilize variáveis de ambiente para informações sensíveis.

Exemplo:

```env
DISCORD_WEBHOOK_URL=seu_webhook
FIREBASE_PRIVATE_KEY=sua_chave
```

O arquivo `.env` deve estar no `.gitignore`.

---

## ⚙️ Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/IFPR-Projeto-de-Extensao/v2-achados-e-perdidos.git
```

### 2. Entrar no diretório

```bash
cd v2-achados-e-perdidos
```

### 3. Instalar as dependências

```bash
npm install
```

### 4. Configurar as variáveis de ambiente

Crie um arquivo:

```text
.env.local
```

Adicione as configurações necessárias para o ambiente de desenvolvimento.

Exemplo:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Não publique valores secretos no repositório.

### 5. Executar em desenvolvimento

```bash
npm run dev
```

O Vite disponibilizará o sistema localmente.

---

## 🏭 Build de produção

Para gerar a versão de produção:

```bash
npm run build
```

Para testar a versão compilada localmente:

```bash
npm run preview
```

---

## 🚀 Deploy

O projeto pode ser implantado utilizando a **Vercel**.

O fluxo recomendado é:

```text
GitHub
   ↓
Push / Pull Request
   ↓
Vercel
   ↓
Build
   ↓
Deploy
```

As variáveis de ambiente necessárias devem ser configuradas diretamente nas configurações do projeto de hospedagem.

---

## 📁 Estrutura do projeto

A estrutura pode variar conforme a evolução do sistema, mas segue uma organização semelhante a:

```text
/
├── api/
│   └── ...
│
├── public/
│   └── ...
│
├── src/
│   ├── components/
│   ├── contexts/
│   ├── hooks/
│   ├── lib/
│   ├── services/
│   ├── views/
│   └── ...
│
├── .gitignore
├── firebase.json
├── firestore.rules
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🗄️ Firebase

O sistema utiliza o Firebase para diferentes serviços da aplicação.

### Authentication

Responsável pela autenticação dos usuários.

### Firestore

Banco de dados utilizado para armazenar informações relacionadas ao sistema.

### Security Rules

As regras do Firestore são utilizadas para controlar quais usuários podem ler, criar, alterar ou excluir determinados dados.

As permissões devem considerar o usuário autenticado e seu papel dentro do sistema.

---

## 🧪 Desenvolvimento e testes

Antes de realizar alterações em produção, recomenda-se testar:

* Login e logout;
* Cadastro de usuários;
* Cadastro de achados;
* Cadastro de perdas;
* Pesquisa de ocorrências;
* Registro de devoluções;
* Geração de etiquetas;
* Geração de PDFs;
* Permissões de cada perfil;
* Regras do Firestore;
* Integrações externas;
* Responsividade em dispositivos móveis e computadores;
* Build de produção.

Também é importante verificar o console do navegador e os logs da infraestrutura durante testes.

Porque aparentemente até um botão perfeitamente inocente pode decidir quebrar três serviços diferentes ao mesmo tempo.

---

## 🌐 Responsividade

O Localiza+ foi desenvolvido para funcionar em diferentes tamanhos de tela, incluindo:

* Computadores;
* Notebooks;
* Tablets;
* Smartphones.

A interface deve ser testada em diferentes navegadores e resoluções antes de cada versão de produção.

---

## 📱 PWA

O projeto possui suporte a características de **Progressive Web App (PWA)**.

Isso permite que o sistema possa oferecer uma experiência semelhante à de uma aplicação instalada, dependendo do navegador e do dispositivo utilizado.

---

## 📜 Privacidade

O sistema deve possuir uma **Política de Privacidade** acessível aos usuários, descrevendo:

* Quais dados são coletados;
* Para quais finalidades são utilizados;
* Como os dados são armazenados;
* Como ocorre o tratamento das informações;
* Direitos dos titulares;
* Canais de contato.

A documentação jurídica oficial deve ser mantida separada do código-fonte quando necessário e atualizada conforme as definições institucionais do IFPR.

---

## 🛠️ Contribuição

Como este é um projeto de extensão institucional, alterações no sistema devem ser realizadas de forma organizada.

Fluxo recomendado:

```text
Criar branch
    ↓
Desenvolver alteração
    ↓
Testar localmente
    ↓
Verificar build
    ↓
Commit
    ↓
Pull Request
    ↓
Revisão
    ↓
Merge
```

### Exemplo de criação de branch

```bash
git checkout -b feature/nova-funcionalidade
```

### Commit

```bash
git add .
git commit -m "feat: adiciona nova funcionalidade"
```

### Enviar branch

```bash
git push origin feature/nova-funcionalidade
```

---

## 📌 Convenção de commits

Recomenda-se utilizar mensagens de commit organizadas.

Exemplos:

```text
feat: adiciona cadastro de objetos encontrados
fix: corrige envio de notificações
security: atualiza regras do Firestore
refactor: reorganiza serviço de autenticação
docs: atualiza documentação
chore: atualiza dependências
```

---

## 🐛 Relato de problemas

Ao encontrar um problema, procure fornecer:

1. Descrição do problema;
2. Passos para reproduzir;
3. Comportamento esperado;
4. Comportamento observado;
5. Navegador e dispositivo;
6. Mensagens de erro;
7. Logs relevantes;
8. Capturas de tela, quando necessário.

**Nunca envie tokens, senhas, chaves privadas ou Webhooks nas issues.**

---

## 📄 Licença

Este projeto é desenvolvido no contexto de um projeto de extensão do **Instituto Federal do Paraná – Campus Ivaiporã**.

A definição da licença de distribuição e utilização do código deverá seguir as orientações e autorizações institucionais aplicáveis ao projeto.

---

## 📞 Contato

**Projeto:** Localiza+
**Equipe:** InovaIF
**Instituição:** Instituto Federal do Paraná – Campus Ivaiporã

**E-mail de contato:**

`localizamais6@gmail.com`

---

## 📚 Status do projeto

**Em desenvolvimento.**

O Localiza+ está sendo desenvolvido de forma incremental, com implementação, testes e aprimoramentos contínuos de funcionalidades, segurança, desempenho e experiência do usuário.

---

## ⭐ Localiza+

> **Tecnologia para tornar o processo de Achados e Perdidos mais simples, organizado e acessível.**

Desenvolvido pela equipe **InovaIF**
**IFPR – Campus Ivaiporã**
