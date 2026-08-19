import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  FileText,
  ArrowLeft,
  Calendar,
  Building2,
  Mail,
  Lock,
  Cpu,
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Printer,
  Search,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Shield,
  HelpCircle,
  Server,
  UserCheck,
  Ban,
  Scale,
  FileCheck2,
  Clock,
  ShieldAlert,
  HelpCircle as QuestionIcon,
  BookOpen,
} from "lucide-react";

export const TermsOfUseView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-1");

  // Scroll to top on initial mount & update page title & meta description
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const originalTitle = document.title;
    document.title = "Termos de Uso | Localiza+";

    // Set meta description for SEO
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Termos de Uso do Localiza+, projeto InovaIF do IFPR Campus Ivaiporã."
      );
    }

    return () => {
      document.title = originalTitle;
    };
  }, []);

  const handleBackToSystem = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.pushState({}, "", "/");
    }
    setActiveTab("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenPrivacyPolicy = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (typeof window !== "undefined") {
      window.history.pushState({ tab: "privacy_policy" }, "", "/politica-de-privacidade");
    }
    setActiveTab("privacy_policy");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sections = [
    { id: "sec-1", num: 1, title: "Sobre o Localiza+" },
    { id: "sec-2", num: 2, title: "Aceitação dos Termos" },
    { id: "sec-3", num: 3, title: "Elegibilidade e cadastro" },
    { id: "sec-4", num: 4, title: "Responsabilidade pelas informações fornecidas" },
    { id: "sec-5", num: 5, title: "Uso adequado da plataforma" },
    { id: "sec-6", num: 6, title: "Cadastro de objetos perdidos" },
    { id: "sec-7", num: 7, title: "Cadastro de objetos encontrados" },
    { id: "sec-8", num: 8, title: "Imagens e conteúdos enviados pelos usuários" },
    { id: "sec-9", num: 9, title: "Processo de reivindicação e devolução de objetos" },
    { id: "sec-10", num: 10, title: "Proibição de informações falsas ou fraudulentas" },
    { id: "sec-11", num: 11, title: "Condutas proibidas" },
    { id: "sec-12", num: 12, title: "Contas de usuários" },
    { id: "sec-13", num: 13, title: "Contas administrativas e privilégios" },
    { id: "sec-14", num: 14, title: "Notificações e comunicações" },
    { id: "sec-15", num: 15, title: "Inteligência artificial" },
    { id: "sec-16", num: 16, title: "Integrações com serviços de terceiros" },
    { id: "sec-17", num: 17, title: "Disponibilidade e funcionamento do sistema" },
    { id: "sec-18", num: 18, title: "Limitação de responsabilidade" },
    { id: "sec-19", num: 19, title: "Segurança" },
    { id: "sec-20", num: 20, title: "Suspensão ou encerramento de contas" },
    { id: "sec-21", num: 21, title: "Propriedade intelectual" },
    { id: "sec-22", num: 22, title: "Privacidade e proteção de dados" },
    { id: "sec-23", num: 23, title: "Links e serviços de terceiros" },
    { id: "sec-24", num: 24, title: "Alterações dos Termos" },
    { id: "sec-25", num: 25, title: "Legislação aplicável" },
    { id: "sec-26", num: 26, title: "Contato" },
    { id: "sec-27", num: 27, title: "Disposições finais" },
  ];

  const filteredSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.num.toString().includes(searchQuery)
  );

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -90;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <main className="max-w-7xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Top Header Card */}
      <header className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20">
                Documento Institucional • InovaIF
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                IFPR Campus Ivaiporã
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                Condições de Uso & Diretrizes
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 dark:text-white tracking-tight flex items-center gap-3">
              <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-[#00843D] shrink-0" />
              <span>Termos de Uso</span>
            </h1>
            <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-300 max-w-3xl leading-relaxed">
              Regras, diretrizes, direitos, responsabilidades e condições gerais aplicáveis ao uso
              da plataforma <strong>Localiza+</strong> no âmbito do Instituto Federal do Paraná (IFPR) – Campus Ivaiporã.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <button
              onClick={handleBackToSystem}
              className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-all flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e32] text-white text-xs font-bold transition-all flex items-center space-x-2 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <Calendar className="w-4 h-4 text-[#00843D] shrink-0" />
            <div>
              <span className="block text-[10px] uppercase font-bold text-neutral-400">Atualização</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">18 de agosto de 2026</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <Building2 className="w-4 h-4 text-[#00843D] shrink-0" />
            <div>
              <span className="block text-[10px] uppercase font-bold text-neutral-400">Instituição</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">IFPR Campus Ivaiporã</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <Sparkles className="w-4 h-4 text-[#00843D] shrink-0" />
            <div>
              <span className="block text-[10px] uppercase font-bold text-neutral-400">Projeto & Equipe</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">InovaIF (Extensão)</span>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-100 dark:border-neutral-800">
            <Mail className="w-4 h-4 text-[#00843D] shrink-0" />
            <div className="truncate">
              <span className="block text-[10px] uppercase font-bold text-neutral-400">Contato Geral</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">localizamais6@gmail.com</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout: Sticky Sidebar Navigation + Content Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sticky Table of Contents Sidebar */}
        <aside aria-label="Índice dos Termos de Uso" className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-neutral-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#00843D]" />
                <span>Índice dos Termos</span>
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                27 seções
              </span>
            </div>

            {/* Quick Search inside Table of Contents */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Filtrar seção por número ou palavra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            {/* Links list with scroll behavior */}
            <nav className="max-h-[58vh] overflow-y-auto pr-1 space-y-1 scrollbar-thin text-xs">
              {filteredSections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between group cursor-pointer ${
                    activeSectionId === sec.id
                      ? "bg-[#00843D] text-white font-bold shadow-xs"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white font-medium"
                  }`}
                >
                  <span className="truncate mr-2">
                    <span className="font-mono text-[11px] opacity-70 mr-1.5">
                      {sec.num.toString().padStart(2, "0")}.
                    </span>
                    {sec.title}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      activeSectionId === sec.id
                        ? "text-white translate-x-0.5"
                        : "text-neutral-400 group-hover:translate-x-0.5"
                    }`}
                  />
                </button>
              ))}
              {filteredSections.length === 0 && (
                <p className="text-[11px] text-neutral-400 text-center py-4">
                  Nenhuma seção encontrada para a busca realizada.
                </p>
              )}
            </nav>

            {/* Quick Links Box */}
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-col gap-2">
              <a
                href="/politica-de-privacidade"
                onClick={handleOpenPrivacyPolicy}
                className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 font-bold hover:underline flex items-center justify-between"
              >
                <span>Ver Política de Privacidade</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          </div>
        </aside>

        {/* Full Text Document Content */}
        <article className="lg:col-span-8 space-y-8 bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-10 shadow-sm text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed transition-colors">
          
          {/* Institutional Opening Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#00843D] dark:text-green-400 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Identificação Institucional e Apresentação</span>
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-normal">
              O <strong>Localiza+</strong> é um sistema web e aplicativo progressivo (PWA) de achados e perdidos desenvolvido no contexto do projeto de extensão <strong>InovaIF</strong>, vinculado ao <strong>Instituto Federal do Paraná – IFPR – Campus Ivaiporã</strong>, sediado na Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400.
            </p>
          </div>

          {/* Section 1: Sobre o Localiza+ */}
          <section id="sec-1" className="space-y-3 pt-2 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">01.</span> Sobre o Localiza+
            </h2>
            <p>
              O <strong>Localiza+</strong> é uma plataforma institucional concebida para auxiliar a comunidade acadêmica (estudantes, docentes, servidores técnico-administrativos, terceirizados e visitantes) do <strong>IFPR Campus Ivaiporã</strong> no registro, catalogação, busca, localização e procedimentos de devolução de pertences perdidos e encontrados nas dependências do campus.
            </p>
            <p>
              A plataforma atua como ferramenta digital de apoio e mediação colaborativa, integrando recursos de busca, classificação orientada, geração de identificadores de entrega (QR Code), avisos automatizados e ferramentas analíticas auxiliares.
            </p>
          </section>

          {/* Section 2: Aceitação dos Termos */}
          <section id="sec-2" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">02.</span> Aceitação dos Termos
            </h2>
            <p>
              Ao acessar, navegar, cadastrar-se ou utilizar qualquer funcionalidade do Localiza+, você declara ter lido, compreendido e concordado integralmente com estes <strong>Termos de Uso</strong> e com a <strong>Política de Privacidade</strong> da plataforma.
            </p>
            <p>
              Caso você não concorde com quaisquer das condições, diretrizes ou responsabilidades estipuladas neste documento, solicitamos que não utilize o sistema nem cadastre dados na plataforma.
            </p>
          </section>

          {/* Section 3: Elegibilidade e cadastro */}
          <section id="sec-3" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">03.</span> Elegibilidade e cadastro
            </h2>
            <p>
              A navegação pública básica e a consulta de objetos cadastrados podem ser realizadas sem necessidade de autenticação. Contudo, ações ativas, tais como o registro de objetos perdidos ou encontrados, inserção de comentários, abertura de reivindicações de propriedade e gerenciamento de perfil, demandam cadastro de conta de usuário.
            </p>
            <p>
              O cadastro é facultado a membros da comunidade do IFPR e visitantes legítimos. O usuário compromete-se a fornecer informações verídicas, exatas e atualizadas no momento de sua inscrição, sendo estritamente vedado o uso de dados de terceiros ou identidades falsas.
            </p>
          </section>

          {/* Section 4: Responsabilidade pelas informações fornecidas */}
          <section id="sec-4" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">04.</span> Responsabilidade pelas informações fornecidas
            </h2>
            <p>
              O usuário é o único e exclusivo responsável por toda e qualquer informação, descrição, categoria, marca, cor, data, localização estimada, fotografia ou comentário que inserir no sistema.
            </p>
            <p>
              O usuário deve zelar pela precisão dos dados, garantindo que as informações fornecidas correspondam estritamente à realidade dos fatos e não induzam a comunidade acadêmica ou os servidores responsáveis a erro ou confusão.
            </p>
          </section>

          {/* Section 5: Uso adequado da plataforma */}
          <section id="sec-5" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">05.</span> Uso adequado da plataforma
            </h2>
            <p>
              O Localiza+ deve ser utilizado exclusivamente para suas finalidades institucionais: auxiliar na recuperação de bens esquecidos e na gestão comunitária de achados e perdidos no IFPR Campus Ivaiporã.
            </p>
            <p>
              É expressamente vedada a utilização da plataforma para fins comerciais, publicitários, políticos, difamatórios, fraudulentos ou qualquer outra finalidade alheia aos objetivos acadêmicos e extensionistas do projeto.
            </p>
          </section>

          {/* Section 6: Cadastro de objetos perdidos */}
          <section id="sec-6" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">06.</span> Cadastro de objetos perdidos
            </h2>
            <p>
              O usuário que cadastrar um objeto na condição de <strong>PERDIDO</strong> deve relatar com fidelidade os dados do pertence, tais como data aproximada da perda, local provável dentro do campus, características visuais e eventuais marcas de identificação.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>O usuário não deve registrar objetos que não lhe pertençam ou cuja perda não tenha ocorrido legitimamente.</li>
              <li>O cadastro de um objeto perdido cria um alerta no sistema, mas não garante que o bem seja localizado ou devolvido.</li>
              <li>Quando houver uma possível correspondência no sistema, o usuário será notificado, devendo proceder à validação e comprovação de propriedade conforme os trâmites institucionais.</li>
            </ul>
          </section>

          {/* Section 7: Cadastro de objetos encontrados */}
          <section id="sec-7" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">07.</span> Cadastro de objetos encontrados
            </h2>
            <p>
              Qualquer usuário ou servidor que encontrar um objeto nas dependências do campus poderá cadastrá-lo como <strong>ENCONTRADO</strong> para auxiliar na rápida identificação pelo proprietário legítimo.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>O usuário que cadastrar um objeto encontrado deve entregá-lo no ponto de guarda oficial do campus (ex.: SEBAC / Recepção / Portaria) para custódia física segura.</li>
              <li>Recomenda-se não divulgar publicamente detalhes ultrassensíveis ou segredos do objeto (ex.: senhas gravadas, conteúdos íntimos ou quantias exatas em dinheiro) que devam ser utilizados exclusivamente como critério de verificação na devolução física.</li>
            </ul>
          </section>

          {/* Section 8: Imagens e conteúdos enviados pelos usuários */}
          <section id="sec-8" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">08.</span> Imagens e conteúdos enviados pelos usuários
            </h2>
            <p>
              Ao realizar o upload de fotografias de pertences ou inserir textos descritivos, o usuário declara que:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>Possui o direito de registrar e compartilhar a imagem para a finalidade estrita de identificação do objeto;</li>
              <li>A imagem retrata o pertence e não viola direitos de imagem, intimidade ou privacidade de terceiros;</li>
              <li>Não constam no enquadramento da fotografia rostos de pessoas não autorizadas, documentos pessoais abertos com dados excessivos (CPF, RG, cartões bancários com numeração completa visível) ou conteúdos ofensivos;</li>
              <li>Imagens inadequadas, ilegais ou que violem estes termos poderão ser removidas sumariamente pela moderação administrativa.</li>
            </ul>
          </section>

          {/* Section 9: Processo de reivindicação e devolução de objetos */}
          <section id="sec-9" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">09.</span> Processo de reivindicação e devolução de objetos
            </h2>
            <p>
              A plataforma estabelece critérios claros para a entrega e conferência de bens esquecidos:
            </p>
            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Diretrizes Obrigatórias de Reivindicação:</span>
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>O cadastro de uma reivindicação na plataforma <strong>não constitui prova definitiva</strong> de propriedade.</li>
                <li>Correspondências automáticas ou apontamentos gerados por inteligência artificial <strong>não autorizam a entrega imediata</strong> sem prévia validação humana.</li>
                <li>A entrega física do objeto requer a apresentação de documento de identificação pessoal, confirmação de características particulares do bem e assinatura/registro no termo de devolução institucional.</li>
                <li>Informações do processo de devolução (nome do recebedor, data, matrícula/documento e servidor responsável) são registradas para fins de auditoria e segurança patrimonial.</li>
              </ul>
            </div>
          </section>

          {/* Section 10: Proibição de informações falsas ou fraudulentas */}
          <section id="sec-10" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">10.</span> Proibição de informações falsas ou fraudulentas
            </h2>
            <p>
              É expressamente proibido prestar declarações inverídicas, forjar registros de itens perdidos para obter vantagens indevidas ou tentar apropriar-se de bens pertencentes a terceiros por meio de reivindicações falsas.
            </p>
            <p>
              A tentativa de apropriação indevida ou fraude sujeitará o infrator ao bloqueio imediato da conta na plataforma, sem prejuízo das sanções disciplinares acadêmicas cabíveis no IFPR e da comunicação às autoridades competentes nos termos da legislação civil e penal brasileira (Art. 169 do Código Penal – Apropriação de coisa havida por erro, caso fortuito ou força da natureza).
            </p>
          </section>

          {/* Section 11: Condutas proibidas */}
          <section id="sec-11" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">11.</span> Condutas proibidas
            </h2>
            <p>
              Constituem condutas terminantemente proibidas aos usuários do Localiza+:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
              <li>Cadastrar objetos inexistentes ou duplicar registros repetidamente de forma abusiva;</li>
              <li>Utilizar robôs, scripts automatizados, scrapers ou rotinas de varredura que sobrecarreguem ou interfiram na infraestrutura da plataforma;</li>
              <li>Tentar violar a segurança, autenticação, controle de acesso ou regras de banco de dados do sistema;</li>
              <li>Inserir códigos maliciosos, vírus, malwares, links suspeitos ou arquivos corrompidos;</li>
              <li>Praticar assédio, ofensas, discriminação ou divulgação de conteúdos impróprios nos campos de descrição, comentários ou mensagens de suporte;</li>
              <li>Utilizar a plataforma para veiculação de spam, campanhas publicitárias ou promoção de produtos e serviços.</li>
            </ul>
          </section>

          {/* Section 12: Contas de usuários */}
          <section id="sec-12" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">12.</span> Contas de usuários
            </h2>
            <p>
              O usuário é responsável pela guarda, confidencialidade e uso de suas credenciais de autenticação (e-mail institucional, senha e conta Google vinculada).
            </p>
            <p>
              Qualquer atividade realizada por meio de uma conta autenticada será presumida como praticada pelo titular respectivo até que haja comunicação prévia e inequívoca de perda, furto ou comprometimento das credenciais à equipe de administração.
            </p>
          </section>

          {/* Section 13: Contas administrativas e privilégios */}
          <section id="sec-13" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">13.</span> Contas administrativas e privilégios
            </h2>
            <p>
              Determinadas contas possuem perfis de acesso elevado (Administrador TI, Servidor Responsável, Membro da Equipe InovaIF), com permissões para moderação de itens, gerenciamento de status de devolução, geração de termos de custódia e auditoria do sistema.
            </p>
            <p>
              Os titulares de contas administrativas comprometem-se a atuar com estrita observância ao princípio da finalidade pública, confidencialidade funcional, zelo patrimonial e proteção aos dados pessoais dos usuários.
            </p>
          </section>

          {/* Section 14: Notificações e comunicações */}
          <section id="sec-14" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">14.</span> Notificações e comunicações
            </h2>
            <p>
              O Localiza+ pode enviar notificações operacionais por meio de alertas na interface, notificações push (Firebase Cloud Messaging - FCM, mediante consentimento do navegador) e e-mails institucionais sobre o andamento de ocorrências, correspondências identificadas ou respostas a solicitações de suporte.
            </p>
            <p>
              O usuário pode habilitar ou revogar as permissões de notificação do navegador a qualquer momento diretamente nas configurações de seu dispositivo.
            </p>
          </section>

          {/* Section 15: Inteligência artificial */}
          <section id="sec-15" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">15.</span> Inteligência artificial
            </h2>
            <p>
              O Localiza+ integra recursos de inteligência artificial generativa e multimodal (Google Gemini API) exclusivamente como ferramenta de tecnologia assistiva para apoiar na classificação de categorias, extração de palavras-chave, análise visual de fotografias e cálculo de similaridade semântica entre objetos cadastrados.
            </p>
            <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border-l-4 border-[#00843D] text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed font-medium space-y-1">
              <p className="font-black text-[#00843D] dark:text-green-400 uppercase tracking-wide text-[11px]">
                Aviso Expressamente Declarado:
              </p>
              <p className="italic">
                “Os resultados produzidos por inteligência artificial são auxiliares e podem conter erros. Uma sugestão ou correspondência gerada automaticamente não constitui prova de propriedade e não determina, isoladamente, a devolução de um objeto.”
              </p>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              A decisão final de entrega de qualquer pertence físico é prerrogativa exclusiva e indelegável de validação humana e administrativa realizada pelos servidores e monitores do campus.
            </p>
          </section>

          {/* Section 16: Integrações com serviços de terceiros */}
          <section id="sec-16" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">16.</span> Integrações com serviços de terceiros
            </h2>
            <p>
              Para assegurar sua operação técnica, alta escalabilidade e segurança, o Localiza+ utiliza serviços de infraestrutura e provedores tecnológicos terceiros, tais como:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li><strong>Google Firebase</strong> (Firebase Authentication, Cloud Firestore e Firebase Cloud Messaging);</li>
              <li><strong>Google Gemini API</strong> (processamento de inteligência artificial assistiva);</li>
              <li><strong>Vercel & Google Cloud Run</strong> (hospedagem de aplicações, telemetria agregada e execução de rotas de backend);</li>
              <li><strong>Discord Webhooks</strong> (notificações internas de novos achados e perdas para canais operacionais restritos da equipe).</li>
            </ul>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Para informações detalhadas sobre como os dados pessoais são protegidos durante essas integrações, consulte a nossa{" "}
              <a
                href="/politica-de-privacidade"
                onClick={handleOpenPrivacyPolicy}
                className="text-[#00843D] dark:text-green-400 font-bold underline hover:text-[#006e32]"
              >
                Política de Privacidade
              </a>.
            </p>
          </section>

          {/* Section 17: Disponibilidade e funcionamento do sistema */}
          <section id="sec-17" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">17.</span> Disponibilidade e funcionamento do sistema
            </h2>
            <p>
              A equipe do projeto InovaIF e o IFPR empregam esforços contínuos para manter o Localiza+ disponível, estável e funcional. Contudo, em razão da natureza dos sistemas computacionais e redes públicas de internet, <strong>não é possível garantir disponibilidade ininterrupta de 100%</strong>.
            </p>
            <p>
              A plataforma poderá sofrer suspensões temporárias, instabilidades ou manutenções programadas em razão de atualizações de segurança, melhorias na infraestrutura, falhas em servidores terceiros ou eventos fora do controle razoável da equipe desenvolvedora.
            </p>
          </section>

          {/* Section 18: Limitação de responsabilidade */}
          <section id="sec-18" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">18.</span> Limitação de responsabilidade
            </h2>
            <p>
              O Localiza+ constitui uma ferramenta de apoio e facilitação comunitária. A disponibilização do sistema não enseja, sob qualquer hipótese, obrigação de guarda, depósito ou indenização securitária por objetos extraviados, danificados ou não recuperados no campus.
            </p>
            <p>A plataforma não garante de forma absoluta:</p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>Que todo objeto perdido será inevitavelmente localizado ou devolvido ao dono;</li>
              <li>Que as informações inseridas por outros usuários sejam 100% exatas em todos os momentos;</li>
              <li>Que correspondências geradas automaticamente estejam isentas de falsos positivos ou falsos negativos;</li>
              <li>A integridade física de itens devolvidos em estado de deterioração anterior ao encontro.</li>
            </ul>
          </section>

          {/* Section 19: Segurança */}
          <section id="sec-19" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">19.</span> Segurança
            </h2>
            <p>
              O Localiza+ adota padrões modernos de segurança da informação, incluindo comunicação criptografada por protocolo HTTPS/TLS, regras granulares de segurança no banco de dados Cloud Firestore, rate limiting em rotas de API, sanitização de entradas de texto e restrição estrita de privilégios de acesso.
            </p>
            <p>
              O usuário compromete-se a colaborar com a segurança da plataforma, não tentando burlar controles técnicos e notificando prontamente a equipe caso identifique qualquer comportamento atípico ou vulnerabilidade no sistema.
            </p>
          </section>

          {/* Section 20: Suspensão ou encerramento de contas */}
          <section id="sec-20" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">20.</span> Suspensão ou encerramento de contas
            </h2>
            <p>
              A coordenação do projeto e a administração do sistema reservam-se o direito de advertir, limitar funcionalidades, suspender temporariamente ou encerrar definitivamente o acesso de qualquer usuário nas seguintes hipóteses:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>Descumprimento comprovado destes Termos de Uso ou da Política de Privacidade;</li>
              <li>Prática de condutas fraudulentas, inserção deliberada de dados falsos ou tentativa de apropriação indevida de bens;</li>
              <li>Ataques técnicos ou atos que comprometam a estabilidade e segurança da plataforma;</li>
              <li>Determinação legal ou administrativa fundamentada emitida por autoridade competente do IFPR.</li>
            </ul>
          </section>

          {/* Section 21: Propriedade intelectual */}
          <section id="sec-21" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">21.</span> Propriedade intelectual
            </h2>
            <p>
              Os elementos que compõem o Localiza+, incluindo o nome da plataforma, marcas institucionais, logotipos, interface visual, projeto gráfico, layouts, banco de dados, códigos-fonte e documentações técnicas, são protegidos pelas normas vigentes de direitos autorais e propriedade intelectual brasileiras, integrando o patrimônio extensionista e tecnológico do projeto InovaIF / IFPR Campus Ivaiporã, ressalvados os componentes de código aberto e bibliotecas de terceiros devidamente licenciadas sob seus respectivos termos.
            </p>
            <p>
              É vedada a reprodução comercial, engenharia reversa desautorizada ou alteração da identidade visual do sistema para fins ilegítimos sem a expressa anuência da equipe gestora institucional.
            </p>
          </section>

          {/* Section 22: Privacidade e proteção de dados */}
          <section id="sec-22" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">22.</span> Privacidade e proteção de dados
            </h2>
            <p>
              O tratamento de dados pessoais realizado durante a utilização do Localiza+ está descrito de forma detalhada e transparente na nossa <strong>Política de Privacidade</strong>, elaborada em rigorosa conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (LGPD – Lei nº 13.709/2018)</strong> e o <strong>Marco Civil da Internet (Lei nº 12.965/2014)</strong>.
            </p>
            <p>
              A Política de Privacidade integra formalmente estes Termos de Uso. Para conhecer as finalidades, bases legais, prazos de retenção e os canais para exercício dos seus direitos como titular de dados pessoais, acesse o documento completo em:
            </p>
            <div className="pt-1">
              <a
                href="/politica-de-privacidade"
                onClick={handleOpenPrivacyPolicy}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20 font-bold hover:bg-[#00843D]/20 transition-colors text-xs"
              >
                <span>Acessar Política de Privacidade do Localiza+</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </section>

          {/* Section 23: Links e serviços de terceiros */}
          <section id="sec-23" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">23.</span> Links e serviços de terceiros
            </h2>
            <p>
              A plataforma pode disponibilizar links que direcionam o usuário para portais externos oficiais (como o portal institucional do IFPR – ivaipora.ifpr.edu.br).
            </p>
            <p>
              O Localiza+ não possui ingerência nem responsabilidade sobre as políticas de privacidade, termos de uso ou conteúdos de sites de terceiros que não estejam sob sua administração direta.
            </p>
          </section>

          {/* Section 24: Alterações dos Termos */}
          <section id="sec-24" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">24.</span> Alterações dos Termos
            </h2>
            <p>
              Estes Termos de Uso poderão ser revisados periodicamente para refletir evoluções tecnológicas, introdução de novos recursos no sistema, melhorias de segurança ou atualizações na legislação brasileira.
            </p>
            <p>
              Sempre que ocorrerem alterações relevantes, a data de última atualização constante no cabeçalho será revisada, e avisos informativos poderão ser veiculados na página inicial da plataforma. A continuidade no uso dos serviços após a publicação das alterações constitui aceitação dos novos termos.
            </p>
          </section>

          {/* Section 25: Legislação aplicável */}
          <section id="sec-25" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">25.</span> Legislação aplicável
            </h2>
            <p>
              Estes Termos de Uso são regidos, interpretados e executados segundo a legislação da República Federativa do Brasil, em especial o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).
            </p>
            <p>
              Eventuais controvérsias decorrentes da aplicação deste instrumento que não possam ser dirimidas amigavelmente pela via administrativa serão submetidas ao foro judicial competente da comarca de Ivaiporã, Estado do Paraná.
            </p>
          </section>

          {/* Section 26: Contato */}
          <section id="sec-26" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">26.</span> Contato
            </h2>
            <p>
              Para esclarecer dúvidas sobre estes Termos de Uso, enviar sugestões de aprimoramento ou relatar problemas operacionais na plataforma, entre em contato pelos canais oficiais:
            </p>
            <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 space-y-3 text-xs">
              <div className="flex items-start space-x-3">
                <Building2 className="w-4 h-4 text-[#00843D] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-neutral-900 dark:text-white">Localiza+ – Projeto InovaIF</span>
                  <p className="text-neutral-600 dark:text-neutral-400">Instituto Federal do Paraná – Campus Ivaiporã</p>
                  <p className="text-neutral-500">Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <Mail className="w-4 h-4 text-[#00843D] shrink-0" />
                <div>
                  <span className="font-bold text-neutral-900 dark:text-white">E-mail Oficial do Projeto:</span>{" "}
                  <a href="mailto:localizamais6@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold hover:underline">
                    localizamais6@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Section 27: Disposições finais */}
          <section id="sec-27" className="space-y-3 pt-4 scroll-mt-24">
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <span className="font-mono text-[#00843D] dark:text-green-400">27.</span> Disposições finais
            </h2>
            <p>
              Caso qualquer disposição ou cláusula destes Termos de Uso seja considerada nula, inválida ou inaplicável por autoridade judicial ou administrativa competente, as demais disposições permanecerão plenamente válidas, eficazes e em pleno vigor.
            </p>
            <p>
              A eventual tolerância da equipe gestora ou do IFPR em relação ao descumprimento de qualquer condição deste instrumento constituirá mera liberalidade, não implicando novação, renúncia ou alteração dos direitos estipulados.
            </p>
            <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
              <span>Localiza+ • IFPR Campus Ivaiporã</span>
              <span className="font-mono">Versão 2.4 (2026)</span>
            </div>
          </section>

          {/* Bottom Back / Action Row */}
          <div className="pt-8 border-t border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              onClick={handleBackToSystem}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retornar à Página Inicial do Sistema</span>
            </button>

            <div className="flex items-center space-x-2">
              <a
                href="/politica-de-privacidade"
                onClick={handleOpenPrivacyPolicy}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-bold transition-colors"
              >
                Política de Privacidade
              </a>
              <button
                onClick={handlePrint}
                className="px-4 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e32] text-white text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Documento</span>
              </button>
            </div>
          </div>

        </article>
      </div>
    </main>
  );
};
