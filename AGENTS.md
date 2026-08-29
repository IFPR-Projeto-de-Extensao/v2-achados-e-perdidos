# REGRAS OBRIGATÓRIAS DE DESENVOLVIMENTO DO LOCALIZA+

Todas as regras abaixo devem ser seguidas rigorosamente em qualquer alteração, correção, implementação ou manutenção realizada no sistema Localiza+.

---

## 1. PROIBIDO UTILIZAR DADOS FICTÍCIOS

NUNCA utilize dados fictícios, mockados, de demonstração, hardcoded ou inventados para fazer uma funcionalidade parecer que está funcionando.

Isso inclui, mas não se limita a:
- Usuários fictícios;
- Objetos perdidos ou achados fictícios;
- Estatísticas inventadas;
- Quantidades inventadas;
- Gráficos com números fictícios;
- Notificações fictícias;
- Comentários fictícios;
- Registros fictícios;
- Datas inventadas;
- Dados de usuários inventados;
- Status inventados;
- Informações falsas em dashboards;
- Dados de monitoramento fictícios;
- Resultados de IA simulados;
- Respostas de APIs simuladas;
- Dados de Firebase simulados;
- Dados de Discord simulados;
- Dados de uptime inventados.

**Regra principal:** Se o dado real não estiver disponível, o sistema deve informar que o dado não está disponível ou apresentar o estado vazio apropriado. NUNCA invente um valor apenas para preencher uma tela.

---

## 2. UTILIZAR SOMENTE DADOS DA FONTE REAL

Toda informação apresentada ao usuário deve vir da fonte real correspondente:
- **Usuários** → Firebase Authentication / Firestore;
- **Objetos** → Firestore;
- **Notificações** → Banco de dados real;
- **Feedbacks** → Banco de dados / serviço realmente utilizado;
- **Estatísticas** → Dados reais armazenados;
- **Uptime** → Serviço de monitoramento real;
- **Discord** → Integração real com Discord;
- **E-mails** → Serviço de e-mail realmente configurado;
- **IA** → API/serviço de IA realmente configurado;
- **Configurações** → Configuração real do sistema.

Não criar uma segunda fonte de dados apenas para preencher a interface.

---

## 3. NÃO MASCARAR ERROS

Se uma API, banco de dados, Firebase, Discord, serviço externo ou qualquer outra dependência estiver apresentando erro:
- NÃO substituir o erro por dados fictícios.
- O sistema deve:
  1. Identificar o erro;
  2. Registrar o erro adequadamente;
  3. Exibir um estado de erro apropriado na interface;
  4. Corrigir a causa real do problema quando possível.

---

## 4. NÃO CRIAR FUNCIONALIDADES "FAKE"

Não implementar funcionalidades que apenas aparentem funcionar.
Proibido:
- Botão que mostra "Sucesso" sem executar a operação;
- Formulário que não salva os dados;
- Notificação que não é realmente enviada;
- Cadastro que não é persistido;
- Exclusão que apenas remove o item da interface;
- Atualização que não chega ao banco;
- Relatório com informações inventadas;
- Monitoramento com valores estáticos;
- Integração com Discord simulada;
- Integração com e-mail simulada.

Toda funcionalidade deve funcionar de ponta a ponta.

---

## 5. PRESERVAR FUNCIONALIDADES EXISTENTES

Antes de alterar qualquer parte do sistema:
- Verifique como a funcionalidade atual funciona;
- Identifique suas dependências;
- Não remova funcionalidades existentes sem necessidade;
- Não altere comportamentos que não estejam relacionados à tarefa;
- Não sobrescreva código funcional sem motivo;
- Não substitua uma implementação real por uma implementação simulada.

---

## 6. NÃO ALTERAR DADOS REAIS SEM NECESSIDADE

- Nunca apagar, modificar ou sobrescrever dados reais do sistema durante testes.
- Não executar operações destrutivas no banco de produção para testar uma funcionalidade.
- Quando forem necessários testes, utilize ambiente apropriado e nunca misture dados de teste com dados reais.

---

## 7. VALIDAR FRONTEND + BACKEND + BANCO

Uma funcionalidade só deve ser considerada concluída quando todas as partes necessárias estiverem funcionando:
- Interface;
- Lógica frontend;
- APIs;
- Backend;
- Firebase;
- Firestore;
- Autenticação;
- Regras de segurança;
- Variáveis de ambiente;
- Integrações externas;
- Persistência dos dados.

---

## 8. SEGURANÇA

Nunca:
- Expor senhas, tokens, chaves privadas, Service Account Keys ou Webhooks privados do Discord;
- Colocar credenciais diretamente no código ou no GitHub;
- Utilizar credenciais fictícias como substituição de uma configuração real;
- Remover regras de segurança apenas para fazer uma funcionalidade funcionar.

Utilizar sempre variáveis de ambiente e mecanismos seguros apropriados.

---

## 9. AUTENTICAÇÃO E AUTORIZAÇÃO

- Não confiar apenas na interface para controlar permissões.
- Todas as operações sensíveis devem possuir validação no backend/banco.
- Respeitar os níveis de acesso existentes no Localiza+: Aluno, Servidor/TAE, Administrador.

---

## 10. NÃO IGNORAR ERROS DO CONSOLE

Antes de considerar uma alteração concluída, verificar:
- Console do navegador;
- Erros JavaScript/TypeScript;
- Erros de build;
- Erros das APIs;
- Erros do Firebase / Firestore / Autenticação / Integrações;
- Logs de execução.

---

## 11. RESPONSIVIDADE

Toda alteração visual deve ser verificada e garantir funcionamento harmônico em:
- Celular / Smartphone;
- Tablet;
- Desktop.

---

## 12. NÃO ALTERAR A IDENTIDADE DO SISTEMA SEM SOLICITAÇÃO

Preservar:
- Nome Localiza+;
- Identidade visual institucional (IFPR Campus Ivaiporã);
- Estrutura de navegação;
- Funcionalidades existentes;
- Terminologia utilizada no sistema.

---

## 13. HISTÓRICO DE VERSÕES É OBRIGATÓRIO

TODA alteração realizada no sistema deve ser registrada na seção "Histórico de Versões" (`src/data/versionsData.ts`).
A atualização deve fazer parte da própria tarefa de desenvolvimento. NUNCA realizar uma alteração no sistema e esquecer de atualizar o Histórico de Versões.

---

## 14. FORMATO DO HISTÓRICO DE VERSÕES

Ao realizar alterações, adicionar ou atualizar o Histórico de Versões contendo:
- Número da versão;
- Data da alteração;
- Tipo da alteração;
- Descrição clara;
- Funcionalidades afetadas;
- Categorias ("NOVO", "ALTERADO", "CORRIGIDO", "MELHORADO", "SEGURANÇA", "REMOVIDO").

---

## 15. NÃO INVENTAR STATUS DE IMPLEMENTAÇÃO

Nunca informar que algo foi corrigido, implementado, testado, validado ou publicado se não tiver realmente acontecido. Se houver dependência de configuração externa, informar com transparência.

---

## 16. TESTES REAIS

Sempre testar funcionalidades de ponta a ponta com fluxos reais.

---

## 17. NÃO CRIAR CÓDIGO DESNECESSÁRIO

Reutilizar código existente, evitar duplicações e não criar APIs paralelas.

---

## 18. VARIÁVEIS DE AMBIENTE

Gerenciar chaves e parâmetros via `.env.example` e variáveis reais, sem embutir segredos no código.

---

## 19. DEPENDÊNCIAS EXTERNAS

Verificar autenticação, permissões, tratamento de erros e indisponibilidade sem simulações falsas.

---

## 20. REGRA DE OURO

Antes de finalizar qualquer tarefa:
1. "Estou mostrando ao usuário alguma informação que não veio de uma fonte real?" -> Corrigir.
2. "Estou simulando alguma funcionalidade para parecer que ela funciona?" -> Corrigir.
3. "Eu alterei alguma coisa no sistema?" -> Atualizar o Histórico de Versões.
4. "A alteração pode ter afetado outra funcionalidade?" -> Testar as funcionalidades relacionadas.

---

## 21. NÃO CORRIGIR REMOVENDO A FUNCIONALIDADE

- Quando encontrar um erro, corrija a causa raiz do problema.
- NUNCA "corrija" um bug simplesmente apagando, comentando ou desativando o botão, a tela, a API ou a funcionalidade afetada.
- Ocultar ou remover a funcionalidade com problemas para fazer o erro desaparecer não é correção; é demolição com interface bonita. A funcionalidade solicitada deve ser entregue funcional e íntegra.

---

## 22. NÃO ALTERAR BANCO DE PRODUÇÃO DURANTE TESTES

- O Localiza+ já possui dados reais de usuários cadastrados, objetos perdidos/achados, registros e termos de devolução do IFPR Campus Ivaiporã.
- É TERMINANTEMENTE PROIBIDO executar comandos destrutivos, truncar coleções, sobrescrever documentos de usuários reais ou injetar dados de teste aleatórios no banco de produção.
- Todos os testes devem respeitar a integridade absoluta dos dados reais existentes.

---

## 23. TODA ALTERAÇÃO DEVE TERMINAR COM UM RESUMO TÉCNICO

Ao concluir qualquer tarefa ou intervenção no sistema, o assistente DEVE obrigatoriamente fornecer um Resumo Técnico estruturado contendo:
1. **Arquivos alterados / criados** (caminho completo de cada arquivo);
2. **O que mudou** (descrição técnica e funcional objetiva das alterações);
3. **Testes e validações realizados** (build `npm run build`, linting `tsc --noEmit`, testes de ponta a ponta);
4. **Confirmação do Histórico de Versões** (indicação da versão e descrição adicionada em `src/data/versionsData.ts`).

---

## 24. REGRA DE OURO

Antes de finalizar qualquer tarefa:
1. "Estou mostrando ao usuário alguma informação que não veio de uma fonte real?" -> Corrigir.
2. "Estou simulando alguma funcionalidade para parecer que ela funciona?" -> Corrigir.
3. "Eu removi alguma funcionalidade em vez de consertar seu erro?" -> Corrigir.
4. "Eu alterei alguma coisa no sistema?" -> Atualizar o Histórico de Versões.
5. "A alteração pode ter afetado outra funcionalidade?" -> Testar as funcionalidades relacionadas.

---

## 25. CHECKLIST OBRIGATÓRIO ANTES DE FINALIZAR

[ ] Nenhum dado fictício foi utilizado.  
[ ] Nenhum dado real foi substituído por mock.  
[ ] Nenhuma funcionalidade foi simulada.  
[ ] Nenhuma funcionalidade foi removida para mascarar erro.  
[ ] O banco de produção foi preservado intacto.  
[ ] Os dados exibidos vêm das fontes reais.  
[ ] APIs e integrações foram verificadas.  
[ ] Firebase/Firestore foi verificado quando aplicável.  
[ ] Autenticação e autorização foram preservadas.  
[ ] Não existem credenciais expostas.  
[ ] Não foram introduzidos erros no console.  
[ ] O build funciona (`npm run build` / linting).  
[ ] A funcionalidade foi realmente testada.  
[ ] Desktop e Mobile foram verificados.  
[ ] Funcionalidades relacionadas foram verificadas.  
[ ] O Histórico de Versões foi atualizado (`src/data/versionsData.ts`).  
[ ] A descrição no Histórico de Versões corresponde exatamente ao que foi alterado.  
[ ] O Resumo Técnico obrigatório foi fornecido na resposta final.  
