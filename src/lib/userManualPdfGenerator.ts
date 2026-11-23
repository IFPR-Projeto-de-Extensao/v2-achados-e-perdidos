import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ManualSection {
  id: string;
  number: string;
  title: string;
  summary: string;
  bullets: string[];
  note?: string;
}

export const USER_MANUAL_VERSION = "v1.10.13";

export const USER_MANUAL_SECTIONS: ManualSection[] = [
  {
    id: "apresentacao",
    number: "1",
    title: "Apresentação do Sistema Localiza+",
    summary:
      "O Localiza+ é o sistema institucional de Achados e Perdidos do IFPR Campus Ivaiporã, desenvolvido para centralizar o registro, a busca pública, o rastreamento por QR Code e a devolução formal e auditável de pertences no campus.",
    bullets: [
      "Catálogo público pesquisável por texto, voz, filtros e leitura de QR Code.",
      "Gestão institucional de custódia com prazo padrão de guarda de até 90 dias.",
      "Emissão de comprovante de devolução com assinatura eletrônica presencial ou remota.",
    ],
  },
  {
    id: "perfis",
    number: "2",
    title: "Tipos de Usuários e Perfis de Acesso",
    summary:
      "As funcionalidades disponíveis variam conforme o perfil autenticado e verificado no sistema:",
    bullets: [
      "Visitante (sem login): consulta o catálogo público, busca itens, lê QR Codes, acessa o Manual/Ajuda e envia mensagens ao Suporte.",
      "Comunidade Externa (e-mails não institucionais verificados): cria conta, faz login, consulta o catálogo e detalhes públicos, lê QR Codes, reivindica objetos, acompanha suas solicitações, gerencia suas próprias notificações e edita dados pessoais do perfil.",
      "Discente / Aluno (@estudantes.ifpr.edu.br verificado): todas as consultas + reivindicação online de objetos, acompanhamento de solicitações, notificações e edição de perfil.",
      "Servidor / TAE (@ifpr.edu.br verificado e aprovado): cadastro de objetos, impressão de etiquetas QR Code, análise de reivindicações, devoluções formais e acesso ao Painel do Servidor.",
      "Administrador: gestão completa de usuários, aprovações, objetos, devoluções, auditoria, relatórios, suporte e configurações.",
    ],
  },
  {
    id: "criar-conta",
    number: "3",
    title: "Como Criar uma Conta (IFPR e Comunidade Externa)",
    summary:
      "Tanto membros do IFPR quanto integrantes da comunidade externa podem criar sua conta diretamente pela opção Entrar > Criar Conta:",
    bullets: [
      "Informe Nome Completo, E-mail válido e Senha (mínimo de 6 caracteres).",
      "Vínculo detectado automaticamente: @estudantes.ifpr.edu.br (Aluno), @ifpr.edu.br (Servidor) e demais provedores como Gmail/Outlook (Comunidade Externa).",
      "Aceite os Termos de Uso e Política de Privacidade e conclua o cadastro.",
      "Verificação obrigatória: abra o e-mail de confirmação enviado (verifique também a pasta Spam), clique no link e confirme na tela de verificação.",
    ],
  },
  {
    id: "login-senha",
    number: "4",
    title: "Como Fazer Login e Recuperar Senha",
    summary:
      "O acesso autenticado pode ser realizado com e-mail e senha cadastrados ou via conta Google:",
    bullets: [
      "Clique em Entrar na barra superior e informe suas credenciais ou selecione Continuar com Google.",
      "Para recuperar a senha: clique em Esqueceu sua senha?, informe o e-mail cadastrado e utilize o link enviado para redefinir sua senha.",
    ],
  },
  {
    id: "consultar-objetos",
    number: "5",
    title: "Como Consultar Objetos Perdidos e Encontrados",
    summary:
      "A busca de pertences é pública e pode ser iniciada diretamente na tela inicial ou no catálogo:",
    bullets: [
      "Use a barra de busca na Tela Inicial para pesquisar por nome, cor, marca, local ou código QR.",
      "Utilize a pesquisa por voz (ícone de microfone) em navegadores compatíveis.",
      "Navegue pelos atalhos Consultar Objetos, Encontrados, Perdidos e Devolvidos.",
      "No catálogo (/objetos), filtre por categoria, status e local do campus e alterne entre visualização em Grade ou Lista.",
    ],
  },
  {
    id: "cadastrar-objeto",
    number: "6",
    title: "Como Cadastrar um Objeto",
    summary:
      "Para garantir integridade e controle de custódia, o cadastro no catálogo é realizado por Servidores aprovados e Administradores.",
    bullets: [
      "Acesse Registrar Objeto na tela inicial ou Registrar na barra superior (/cadastrar).",
      "Selecione o tipo (Encontrado ou Perdido), adicione fotos e preencha título, categoria, local, data, cor, marca e descrição.",
      "Utilize observações privadas de custódia para dados sensíveis (ex.: documentos) que não devem aparecer publicamente.",
      "Ao confirmar, o registro é persistido no banco de dados com geração automática de código QR único.",
    ],
    note: "Discentes e visitantes externos que encontrarem ou perderem um objeto devem procurar a Portaria Principal ou SEPAE/SEBAC para registro oficial.",
  },
  {
    id: "reivindicar-devolucao",
    number: "7",
    title: "Como Reivindicar um Objeto e Solicitar Devolução",
    summary:
      "Ao reconhecer um pertence encontrado no catálogo, o proprietário pode solicitar a restituição:",
    bullets: [
      "Abra a ficha do objeto no catálogo e clique em Solicitar Este Objeto (disponível para contas autenticadas e com e-mail verificado, incluindo Comunidade Externa e membros do IFPR).",
      "Descreva evidências específicas que comprovem a posse do objeto (conteúdo interno, marcas, número de série, etc.).",
      "Acompanhe suas próprias solicitações em Meu Perfil e receba notificações sobre alterações de status.",
      "Após aprovação da equipe do campus, realize a retirada mediante documento oficial com foto e assinatura do Recibo de Devolução (presencial ou via link remoto).",
    ],
    note: "Por segurança, cada usuário acessa exclusivamente suas próprias reivindicações e notificações. Contas sem e-mail verificado ou suspensas permanecem bloqueadas para envio de solicitações.",
  },
  {
    id: "qr-code",
    number: "8",
    title: "Como Funciona o QR Code",
    summary:
      "Cada objeto registrado possui um identificador QR exclusivo para rastreamento físico e digital:",
    bullets: [
      "Servidores e administradores podem imprimir a Etiqueta de Identificação com QR Code na ficha do objeto.",
      "Qualquer usuário pode clicar em Ler QR Code na tela inicial ou barra superior e apontar a câmera para a etiqueta.",
      "A leitura abre diretamente os detalhes do objeto correspondente no Localiza+.",
    ],
  },
  {
    id: "analise-ia",
    number: "9",
    title: "Como Funciona a Análise Visual por IA",
    summary:
      "No cadastro de objetos, o sistema oferece auxílio de Inteligência Artificial para agilizar a catalogação quando configurado no servidor:",
    bullets: [
      "Envie a foto do objeto no formulário de cadastro e clique em Analisar Foto com IA.",
      "O sistema sugere título, categoria, cor, marca e descrição com base na imagem enviada.",
      "Todas as sugestões podem ser revisadas e editadas antes de salvar. Se a API de IA não estiver configurada, o preenchimento manual segue normalmente.",
    ],
  },
  {
    id: "instalar-pwa",
    number: "10",
    title: "Como Instalar como Aplicativo (PWA)",
    summary:
      "O Localiza+ funciona como Progressive Web App (PWA) instalável em smartphones e computadores:",
    bullets: [
      "Android (Chrome/Edge): clique em Instalar App (PWA) no menu/rodapé ou acesse Menu (⋮) > Instalar aplicativo.",
      "iOS (Safari): toque em Compartilhar e selecione Adicionar à Tela de Início.",
      "Desktop (Chrome/Edge): clique no ícone de instalação na barra de endereços ou em Instalar App (PWA) no rodapé.",
    ],
  },
  {
    id: "suporte",
    number: "11",
    title: "Como Pedir Suporte e Contato Institucional",
    summary:
      "Canais oficiais para dúvidas, sugestões, relato de falhas e retirada de pertences no IFPR Campus Ivaiporã:",
    bullets: [
      "Central de Suporte no sistema: /suporte (FAQ, Feedback em /suporte/feedback e Relato de Bug em /suporte/relatar-bug).",
      "Atendimento Presencial: Portaria Principal e Secretaria / SEPAE / SEBAC — Bloco Administrativo, Rodovia PR-466.",
      "Horário: Segunda a sexta-feira, das 07h30 às 22h30 (dias letivos).",
      "Telefone: (43) 3126-9400 | E-mail: achados.ivaipora@ifpr.edu.br.",
    ],
  },
];

/**
 * Generates and downloads the official Localiza+ User Manual in PDF format.
 * Uses strictly real system documentation (zero placeholder/mock data).
 */
export function downloadUserManualPdf(): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const maxWidth = pageWidth - marginX * 2;
  const generatedAt = new Date().toLocaleString("pt-BR");

  // Header Banner
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Localiza+ — Manual Oficial de Utilização", marginX, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `IFPR Campus Ivaiporã • Sistema de Achados e Perdidos • Versão ${USER_MANUAL_VERSION}`,
    marginX,
    22
  );
  doc.setFontSize(8.5);
  doc.text(`Documento gerado em: ${generatedAt}`, marginX, 28);

  let cursorY = 42;

  // Quick Profile Overview Table
  doc.setTextColor(23, 43, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo Rápido de Perfis de Acesso", marginX, cursorY);
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    head: [["Perfil", "Identificação", "Ações Principais"]],
    body: [
      ["Visitante", "Acesso público", "Consultar catálogo, buscar, ler QR Code, acessar Ajuda e Suporte"],
      ["Comunidade Externa", "E-mail pessoal verificado", "Criar conta, consultar catálogo, reivindicar objetos, perfil pessoal e próprias notificações"],
      ["Discente (Aluno)", "@estudantes.ifpr.edu.br", "Consultar, reivindicar objetos, acompanhar solicitações e notificações"],
      ["Servidor / TAE", "@ifpr.edu.br (aprovado)", "Cadastrar objetos, etiquetas QR, analisar reivindicações e devoluções formais"],
      ["Administrador", "Atribuição de governança", "Gestão integral de usuários, aprovações, itens, auditoria, relatórios e sistema"],
    ],
    headStyles: { fillColor: [22, 132, 91], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  cursorY = ((doc as any).lastAutoTable?.finalY || 92) + 8;

  for (const section of USER_MANUAL_SECTIONS) {
    if (cursorY > 258) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFillColor(235, 245, 240);
    doc.roundedRect(marginX, cursorY - 4.5, maxWidth, 7.5, 1.5, 1.5, "F");
    doc.setTextColor(6, 78, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(`${section.number}. ${section.title}`, marginX + 2.5, cursorY + 0.5);
    cursorY += 7;

    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const summaryLines = doc.splitTextToSize(section.summary, maxWidth);
    doc.text(summaryLines, marginX, cursorY);
    cursorY += summaryLines.length * 4.3 + 2;

    for (const bullet of section.bullets) {
      const bulletLines = doc.splitTextToSize(`• ${bullet}`, maxWidth - 3);
      if (cursorY + bulletLines.length * 4.2 > 278) {
        doc.addPage();
        cursorY = 18;
      }
      doc.text(bulletLines, marginX + 2.5, cursorY);
      cursorY += bulletLines.length * 4.2 + 1.2;
    }

    if (section.note) {
      const noteLines = doc.splitTextToSize(`Observação: ${section.note}`, maxWidth - 4);
      if (cursorY + noteLines.length * 4.2 > 278) {
        doc.addPage();
        cursorY = 18;
      }
      doc.setFont("helvetica", "italic");
      doc.setTextColor(120, 53, 15);
      doc.text(noteLines, marginX + 2, cursorY + 0.5);
      cursorY += noteLines.length * 4.2 + 2.5;
    }

    cursorY += 3;
  }

  // Page footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Localiza+ IFPR Campus Ivaiporã • Manual do Usuário (${USER_MANUAL_VERSION})`,
      marginX,
      290
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - marginX, 290, { align: "right" });
  }

  const filename = `Manual_de_Utilizacao_LocalizaPlus_IFPR_${USER_MANUAL_VERSION}.pdf`;
  doc.save(filename);
  return filename;
}
