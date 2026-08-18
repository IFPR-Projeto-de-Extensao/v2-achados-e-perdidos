import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  ShieldCheck,
  ArrowLeft,
  Calendar,
  Building2,
  Mail,
  Lock,
  Database,
  Cpu,
  Bell,
  MessageSquare,
  FileText,
  Key,
  Users,
  Eye,
  AlertCircle,
  CheckCircle2,
  Printer,
  Search,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Shield,
  HelpCircle,
  Radio,
  Server,
  Share2,
  Globe2,
  FolderLock,
  UserCheck,
} from "lucide-react";

export const PrivacyPolicyView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string>("sec-1");

  // Scroll to top on initial mount & update page title
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    const originalTitle = document.title;
    document.title = "Política de Privacidade | Localiza+";

    // Set meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Política de Privacidade do Localiza+, projeto InovaIF do IFPR Campus Ivaiporã."
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

  const sections = [
    { id: "sec-1", num: 1, title: "Quem somos" },
    { id: "sec-2", num: 2, title: "O que é o Localiza+" },
    { id: "sec-3", num: 3, title: "Dados pessoais que podem ser tratados" },
    { id: "sec-4", num: 4, title: "Dados de cadastro e autenticação" },
    { id: "sec-5", num: 5, title: "Dados relacionados a objetos perdidos e encontrados" },
    { id: "sec-6", num: 6, title: "Dados de solicitações e feedback" },
    { id: "sec-7", num: 7, title: "Dados técnicos e de segurança" },
    { id: "sec-8", num: 8, title: "Finalidades do tratamento" },
    { id: "sec-9", num: 9, title: "Bases legais" },
    { id: "sec-10", num: 10, title: "Uso de inteligência artificial" },
    { id: "sec-11", num: 11, title: "Firebase" },
    { id: "sec-12", num: 12, title: "Armazenamento no Cloud Firestore" },
    { id: "sec-13", num: 13, title: "Notificações" },
    { id: "sec-14", num: 14, title: "Integração com Discord" },
    { id: "sec-15", num: 15, title: "Comunicação por e-mail" },
    { id: "sec-16", num: 16, title: "Analytics, telemetria e monitoramento" },
    { id: "sec-17", num: 17, title: "Cookies, armazenamento local e tecnologias semelhantes" },
    { id: "sec-18", num: 18, title: "Compartilhamento de dados" },
    { id: "sec-19", num: 19, title: "Transferência internacional de dados" },
    { id: "sec-20", num: 20, title: "Segurança da informação" },
    { id: "sec-21", num: 21, title: "Retenção dos dados" },
    { id: "sec-22", num: 22, title: "Dados de menores de idade" },
    { id: "sec-23", num: 23, title: "Direitos dos titulares" },
    { id: "sec-24", num: 24, title: "Como solicitar o exercício dos direitos" },
    {
      id: "sec-25",
      num: 25,
      title: "Encarregado pelo tratamento de dados pessoais e contato de privacidade",
    },
    { id: "sec-26", num: 26, title: "Responsabilidade pelas informações fornecidas" },
    { id: "sec-27", num: 27, title: "Imagens de objetos" },
    { id: "sec-28", num: 28, title: "Registro de auditoria" },
    { id: "sec-29", num: 29, title: "Alterações nesta Política de Privacidade" },
    { id: "sec-30", num: 30, title: "Contato" },
    { id: "sec-31", num: 31, title: "Disposições finais" },
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
    <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 shadow-sm transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-100 dark:border-neutral-800">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20">
                Documento Institucional • InovaIF
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                IFPR Campus Ivaiporã
              </span>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
                LGPD (Lei nº 13.709/2018)
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-neutral-900 dark:text-white tracking-tight">
              Política de Privacidade
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl leading-relaxed">
              Transparência, integridade e regras sobre a coleta, utilização, armazenamento, proteção e compartilhamento de dados no sistema <strong>Localiza+</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleBackToSystem}
              className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>

            <button
              onClick={handlePrint}
              title="Imprimir documento ou salvar como PDF"
              className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir / Salvar PDF</span>
            </button>
          </div>
        </div>

        {/* Date and Key Meta */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#00843D] shrink-0" />
            <span>
              <strong>Última atualização:</strong> 18 de agosto de 2026
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-[#00843D]" />
              <span>Conformidade Legal</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <Building2 className="w-4 h-4 text-neutral-400" />
              <span>IFPR Ivaiporã</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Layout with Responsive Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sticky Index (Desktop) */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-neutral-900 dark:text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-[#00843D]" />
                <span>Índice de Seções ({sections.length})</span>
              </h2>
            </div>

            {/* Quick search inside index */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
              <input
                type="text"
                placeholder="Filtrar seção..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#00843D]"
              />
            </div>

            {/* Section Links */}
            <nav className="max-h-[500px] overflow-y-auto space-y-1 pr-1 custom-scrollbar" aria-label="Navegação das seções da Política de Privacidade">
              {filteredSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center justify-between group ${
                    activeSectionId === s.id
                      ? "bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-bold border border-[#00843D]/20"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200"
                  }`}
                >
                  <span className="truncate">
                    <strong className="text-neutral-400 dark:text-neutral-500 font-mono mr-1.5">
                      {s.num.toString().padStart(2, "0")}.
                    </strong>
                    {s.title}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}

              {filteredSections.length === 0 && (
                <p className="text-xs text-neutral-400 py-3 text-center">
                  Nenhuma seção encontrada para &quot;{searchQuery}&quot;.
                </p>
              )}
            </nav>
          </div>

          {/* Quick Contact Card */}
          <div className="bg-gradient-to-br from-emerald-50 to-neutral-50 dark:from-[#1A261E] dark:to-[#1E1E1E] rounded-3xl border border-emerald-200/60 dark:border-emerald-900/30 p-5 space-y-3">
            <div className="flex items-center space-x-2 text-[#00843D] dark:text-green-400">
              <Mail className="w-4 h-4 shrink-0" />
              <h3 className="text-xs font-black uppercase tracking-wider">
                Dúvidas de Privacidade
              </h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Para solicitações de direitos ou esclarecimentos sobre o tratamento de seus dados:
            </p>
            <div className="space-y-1.5 text-xs font-mono">
              <a
                href="mailto:localizamais6@gmail.com"
                className="block text-[#00843D] dark:text-green-400 hover:underline break-all font-semibold"
              >
                localizamais6@gmail.com
              </a>
              <a
                href="mailto:paulocauan39@gmail.com"
                className="block text-neutral-600 dark:text-neutral-400 hover:underline break-all"
              >
                paulocauan39@gmail.com
              </a>
            </div>
          </div>
        </aside>

        {/* Right Article Body with All 31 Detailed Sections */}
        <article className="lg:col-span-8 space-y-8 text-neutral-800 dark:text-neutral-200 leading-relaxed text-sm">
          {/* SEÇÃO 1 */}
          <section id="sec-1" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                01
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                1. Quem somos
              </h2>
            </div>
            <p>
              O <strong>Localiza+</strong> é um sistema computacional desenvolvido pela equipe do projeto <strong>InovaIF</strong>, vinculado ao <strong>Instituto Federal do Paraná – IFPR – Campus Ivaiporã</strong>, instituição federal de ensino pública pertencente à Rede Federal de Educação Profissional, Científica e Tecnológica.
            </p>
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs">
              <div className="flex items-start space-x-2">
                <Building2 className="w-4 h-4 text-[#00843D] shrink-0 mt-0.5" />
                <span>
                  <strong>Instituição:</strong> Instituto Federal do Paraná – IFPR – Campus Ivaiporã
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <FolderLock className="w-4 h-4 text-[#00843D] shrink-0 mt-0.5" />
                <span>
                  <strong>Endereço:</strong> Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <Mail className="w-4 h-4 text-[#00843D] shrink-0 mt-0.5" />
                <span>
                  <strong>E-mail institucional do projeto:</strong>{" "}
                  <a href="mailto:localizamais6@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold underline">
                    localizamais6@gmail.com
                  </a>
                </span>
              </div>
            </div>
          </section>

          {/* SEÇÃO 2 */}
          <section id="sec-2" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                02
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                2. O que é o Localiza+
              </h2>
            </div>
            <p>
              O <strong>Localiza+</strong> é uma plataforma de interesse público acadêmico e comunitário projetada para modernizar, agilizar e conferir transparência aos processos de cadastro, catalogação, guarda, busca e devolução de bens e pertences esquecidos ou encontrados nas instalações físicas do IFPR Campus Ivaiporã.
            </p>
            <p>
              A solução permite que estudantes, servidores docentes, técnico-administrativos e visitantes registrem itens encontrados ou perdidos, consultem a lista oficial de custódia, solicitem resgates de forma documentada e acompanhem o fluxo de atendimento até a efetiva entrega ao legítimo proprietário.
            </p>
          </section>

          {/* SEÇÃO 3 */}
          <section id="sec-3" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                03
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                3. Dados pessoais que podem ser tratados
              </h2>
            </div>
            <p>
              O Localiza+ trata apenas os dados pessoais estritamente necessários para a operacionalização segura de suas finalidades institucionais. Dependendo das ações que o titular realiza no sistema, diferentes categorias de informações podem ser coletadas e processadas, conforme detalhado nas seções seguintes.
            </p>
          </section>

          {/* SEÇÃO 4 */}
          <section id="sec-4" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                04
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                4. Dados de cadastro e autenticação
              </h2>
            </div>
            <p>
              Para criar uma conta de usuário, acessar funcionalidades restritas ou autenticar-se na plataforma, podem ser coletados e armazenados os seguintes dados:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Nome completo:</strong> para identificação nos registros e termos de devolução;</li>
              <li><strong>Endereço de e-mail:</strong> e-mail institucional do IFPR ou pessoal, utilizado como credencial primária de acesso e comunicação;</li>
              <li><strong>Senha de acesso:</strong> tratada em formato estritamente criptografado (hash seguro) pelo serviço Firebase Authentication, sem acesso em texto plano pela equipe do projeto;</li>
              <li><strong>Vínculo institucional:</strong> categoria do usuário (Aluno, Servidor Docente/Técnico ou Secretaria/Administrador);</li>
              <li><strong>Curso ou setor de lotação:</strong> para fins de direcionamento e verificação institucional;</li>
              <li><strong>Número de matrícula ou registro acadêmico:</strong> para validação de titularidade em registros e emissão de comprovantes;</li>
              <li><strong>Número de telefone ou WhatsApp (opcional):</strong> para facilitar contato urgente em caso de localização de pertences críticos;</li>
              <li><strong>Foto de perfil / Avatar:</strong> imagem de avatar pública ou foto fornecida na autenticação federada com a conta Google;</li>
              <li><strong>Identificador Único (UID):</strong> código identificador exclusivo gerado pelo Firebase Authentication.</li>
            </ul>
          </section>

          {/* SEÇÃO 5 */}
          <section id="sec-5" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                05
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                5. Dados relacionados a objetos perdidos e encontrados
              </h2>
            </div>
            <p>
              Ao cadastrar uma ocorrência de achado ou perda de pertence, o usuário fornece informações descritivas do bem:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Título, descrição e categoria do item (ex: Eletrônicos, Documentos, Chaves, Material Escolar, Vestuário);</li>
              <li>Cor predominante, marca ou características específicas;</li>
              <li>Local do campus onde foi encontrado ou visto pela última vez (ex: salas de aula, laboratórios, biblioteca, ginásio, pátio, portaria);</li>
              <li>Data e horário aproximados do fato;</li>
              <li>Fotografias do objeto (quando anexadas);</li>
              <li>Código de rastreabilidade ou protocolo de registro gerado pelo sistema;</li>
              <li>Status operacional do item (PERDIDO, ENCONTRADO, EM_ANALISE, PROPRIETARIO_IDENTIFICADO, DEVOLVIDO, ENCERRADO);</li>
              <li>Identificador (UID) do usuário que realizou o cadastro e histórico das etapas de custódia e entrega.</li>
            </ul>
          </section>

          {/* SEÇÃO 6 */}
          <section id="sec-6" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                06
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                6. Dados de solicitações e feedback
              </h2>
            </div>
            <p>
              Ao utilizar os formulários de suporte rápido, relato de bugs, manifestação de dúvidas ou envio de feedback, são coletados:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Nome do manifestante;</li>
              <li>E-mail para resposta;</li>
              <li>Tipo de manifestação (Dúvida, Sugestão, Elogio, Relato de Problema ou Solicitação Geral);</li>
              <li>Conteúdo detalhado da mensagem e data de envio.</li>
            </ul>
          </section>

          {/* SEÇÃO 7 */}
          <section id="sec-7" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                07
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                7. Dados técnicos e de segurança
              </h2>
            </div>
            <p>
              Para assegurar a integridade, segurança, estabilidade e disponibilidade da plataforma:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Endereço IP:</strong> processado estritamente em memória volátil de servidor para mecanismos de limitação de taxa (rate limiting), mitigação de ataques de negação de serviço e proteção contra fraudes, não sendo utilizado para perfilamento pessoal;</li>
              <li><strong>Informações do navegador e dispositivo:</strong> dados de User-Agent, tipo de sistema operacional e resolução para fins de renderização responsiva;</li>
              <li><strong>Tokens de Notificação Web Push:</strong> identificadores temporários do Firebase Cloud Messaging (FCM) para entrega de notificações no dispositivo autorizado pelo usuário;</li>
              <li><strong>Métricas de desempenho e telemetria anônima:</strong> tempos de carregamento de páginas e latência de rede.</li>
            </ul>
          </section>

          {/* SEÇÃO 8 */}
          <section id="sec-8" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                08
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                8. Finalidades do tratamento
              </h2>
            </div>
            <p>Os dados pessoais tratados pelo Localiza+ destinam-se exclusivamente às seguintes finalidades:</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Identificar e autenticar usuários com segurança para utilização da plataforma;</li>
              <li>Registrar, catalogar e disponibilizar para consulta os bens encontrados ou perdidos nas dependências do IFPR Campus Ivaiporã;</li>
              <li>Cruzar informações descritivas para identificar potenciais correspondências entre itens perdidos e achados;</li>
              <li>Facilitar a comunicação entre a equipe de custódia e os requerentes para devolução rápida dos pertences;</li>
              <li>Emitir termos formais de entrega e devolução com rastreabilidade de custódia e prestação de contas institucional;</li>
              <li>Prevenir fraudes, apropriação indevida ou falsas reivindicações de propriedade de bens;</li>
              <li>Prestar suporte técnico, responder a chamados e aperfeiçoar a usabilidade do sistema;</li>
              <li>Cumprir obrigações legais, regulamentares e administrativas inerentes ao serviço público federal.</li>
            </ol>
          </section>

          {/* SEÇÃO 9 */}
          <section id="sec-9" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                09
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                9. Bases legais
              </h2>
            </div>
            <p>
              O tratamento de dados pessoais no Localiza+ está fundamentado nas hipóteses legais previstas no <strong>Artigo 7º da Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018)</strong>, com ênfase em:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm">
              <li>
                <strong>Art. 7º, II e Art. 23:</strong> Cumprimento de obrigação legal ou regulatória e execução de políticas públicas pelo Poder Público, voltadas à gestão do patrimônio, ordem e assistência à comunidade acadêmica do Instituto Federal do Paraná;
              </li>
              <li>
                <strong>Art. 7º, V:</strong> Execução de contrato ou de procedimentos preliminares relacionados a contrato do qual seja parte o titular, a pedido deste, consubstanciado na prestação do serviço público de custódia e recuperação de pertences solicitado pelo usuário;
              </li>
              <li>
                <strong>Art. 7º, I:</strong> Consentimento do titular, fornecido de forma livre e inequívoca para finalidades específicas (tais como recebimento de notificações push no navegador e preenchimento voluntário de formulários de contato);
              </li>
              <li>
                <strong>Art. 7º, IX:</strong> Legítimo interesse do controlador ou de terceiros, visando à proteção patrimonial, integridade física de bens esquecidos e prevenção a fraudes no âmbito do campus.
              </li>
            </ul>
          </section>

          {/* SEÇÃO 10 */}
          <section id="sec-10" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                10
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                10. Uso de inteligência artificial
              </h2>
            </div>
            <p>
              Determinadas funcionalidades do Localiza+ integram recursos e serviços de inteligência artificial (incluindo modelos Google Gemini via API de processamento seguro) para auxiliar os usuários e a equipe em tarefas computacionais, tais como:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Análise preliminar de descrições textuais para sugestão de categorias e etiquetas;</li>
              <li>Análise de imagens de itens encontrados para identificação de cores, tipos de objetos e marcas aparentes;</li>
              <li>Pesquisa semântica para localização de itens a partir de linguagem natural;</li>
              <li>Cálculo de índice de similaridade entre registros de objetos perdidos e achados.</li>
            </ul>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center space-x-2 font-black text-xs uppercase tracking-wide">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Ressalva Obrigatória de Uso</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold leading-relaxed">
                &ldquo;Os resultados produzidos por inteligência artificial possuem caráter auxiliar e não determinam, isoladamente, a propriedade ou a devolução de um objeto.&rdquo;
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                A validação final de titularidade e a entrega de qualquer bem custodiado são realizadas exclusivamente por servidores humanos autorizados no balcão de atendimento do IFPR Campus Ivaiporã, mediante comprovação documental ou detalhamento de itens não visíveis.
              </p>
            </div>
          </section>

          {/* SEÇÃO 11 */}
          <section id="sec-11" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                11
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                11. Firebase
              </h2>
            </div>
            <p>
              O Localiza+ utiliza a infraestrutura do <strong>Google Firebase</strong> (Firebase Authentication, Cloud Firestore e Firebase Cloud Messaging) para autenticação de usuários, persistência de banco de dados e sinalização em tempo real. Os serviços são operados sob rígidos padrões de segurança, criptografia em trânsito (HTTPS / TLS) e em repouso.
            </p>
          </section>

          {/* SEÇÃO 12 */}
          <section id="sec-12" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                12
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                12. Armazenamento no Cloud Firestore
              </h2>
            </div>
            <p>
              As informações estruturadas (registros de pertences, perfis de usuários, registros de auditoria, modelos de documentos institucionais e notificações) são armazenadas no banco de dados NoSQL <strong>Cloud Firestore</strong>.
            </p>
            <p>
              O acesso aos documentos é estritamente protegido por <strong>Regras de Segurança do Firestore (Firestore Security Rules)</strong> e controle de acesso baseado em papéis (RBAC), impedindo que usuários não autenticados ou sem os devidos privilégios acessem, alterem ou excluam dados protegidos de terceiros.
            </p>
          </section>

          {/* SEÇÃO 13 */}
          <section id="sec-13" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                13
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                13. Notificações
              </h2>
            </div>
            <p>
              O sistema disponibiliza notificações internas na interface (in-app) e notificações push para navegadores (via Firebase Cloud Messaging). As notificações servem para avisar o usuário sobre:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li>Identificação de potenciais correspondências com objetos perdidos por ele cadastrados;</li>
              <li>Atualizações no status de reivindicação ou entrega de itens;</li>
              <li>Avisos institucionais e operacionais do setor de Achados e Perdidos.</li>
            </ul>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              O envio de notificações push no dispositivo depende de permissão expressa concedida pelo usuário em seu navegador, a qual pode ser revogada a qualquer tempo nas configurações do próprio navegador.
            </p>
          </section>

          {/* SEÇÃO 14 */}
          <section id="sec-14" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                14
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                14. Integração com Discord
              </h2>
            </div>
            <p>
              Para otimizar o tempo de resposta da equipe e dos servidores responsáveis pelo setor, o Localiza+ pode encaminhar notificações operacionais resumidas para canais internos e privados no <strong>Discord</strong> por meio de webhooks seguros.
            </p>
            <p>
              As notificações enviadas via Discord destinam-se exclusivamente a:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li>Avisar a equipe sobre novos itens encontrados cadastrados;</li>
              <li>Avisar sobre novos registros de pertences perdidos no campus;</li>
              <li>Receber solicitações de suporte, manifestações e feedbacks enviados pelos usuários;</li>
              <li>Alertas operacionais e administrativos necessários para a continuidade dos serviços.</li>
            </ul>
            <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              O compartilhamento de informações através desses webhooks fica estritamente limitado aos dados necessários para a finalidade operacional correspondente (como categoria do item, local e data), sendo processado em canais restritos da equipe e coordenação.
            </p>
          </section>

          {/* SEÇÃO 15 */}
          <section id="sec-15" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                15
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                15. Comunicação por e-mail
              </h2>
            </div>
            <p>
              O sistema pode enviar e-mails transacionais necessários para o funcionamento da conta do usuário (como confirmação de cadastro, instruções de redefinição de senha e comunicados de entrega de pertences). Essas mensagens são expedidas pelo canal oficial do projeto (<code>localizamais6@gmail.com</code>) ou infraestrutura institucional correspondente, não sendo praticado o envio de mensagens promocionais não solicitadas (spam).
            </p>
          </section>

          {/* SEÇÃO 16 */}
          <section id="sec-16" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                16
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                16. Analytics, telemetria e monitoramento
              </h2>
            </div>
            <p>
              O Localiza+ utiliza ferramentas de telemetria técnica e mensuração de desempenho, tais como <strong>Vercel Analytics</strong> e <strong>Vercel Speed Insights</strong>. Essas ferramentas coletam dados técnicos agregados e anônimos sobre tempo de carregamento de páginas, estabilidade e erros de execução, com o objetivo exclusivo de aprimorar a velocidade e a confiabilidade do sistema, sem qualquer rastreamento comportamental invasivo ou cruzamento com bases de dados de publicidade.
            </p>
          </section>

          {/* SEÇÃO 17 */}
          <section id="sec-17" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                17
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                17. Cookies, armazenamento local e tecnologias semelhantes
              </h2>
            </div>
            <p>
              O sistema utiliza recursos de armazenamento local do navegador do usuário para proporcionar uma experiência fluida:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>localStorage e sessionStorage:</strong> utilizados para manter a sessão de login ativa entre abas, salvar o tema visual escolhido (claro ou escuro) e o idioma da interface (Português ou Inglês);</li>
              <li><strong>IndexedDB:</strong> utilizado como cache local do Progressive Web App (PWA) para viabilizar consultas offline parciais e enfileirar cadastros em caso de oscilação de conectividade no campus;</li>
              <li>Não são utilizados cookies de rastreamento publicitário comercial de terceiros.</li>
            </ul>
          </section>

          {/* SEÇÃO 18 */}
          <section id="sec-18" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                18
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                18. Compartilhamento de dados
              </h2>
            </div>
            <p>
              O Localiza+ <strong>não comercializa, não vende e não aluga</strong> dados pessoais a terceiros sob nenhuma circunstância.
            </p>
            <p>O compartilhamento ocorre unicamente com:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Provedores de infraestrutura tecnológica:</strong> Google Cloud Platform / Firebase e Vercel, na medida estritamente necessária para hospedar a aplicação, autenticar usuários e manter o banco de dados;</li>
              <li><strong>Canais internos de atendimento:</strong> Discord (via webhooks privados) para notificação da equipe de atendimento e suporte;</li>
              <li><strong>Autoridades competentes e órgãos de controle:</strong> exclusivamente mediante requisição formal, dever legal ou ordem judicial, na forma da legislação aplicável.</li>
            </ul>
          </section>

          {/* SEÇÃO 19 */}
          <section id="sec-19" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                19
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                19. Transferência internacional de dados
              </h2>
            </div>
            <p>
              Em razão da utilização de servidores de computação em nuvem operados por empresas globais (Google LLC e Vercel Inc.), alguns dados tratados podem ser armazenados ou processados em data centers localizados fora do Brasil (notadamente nos Estados Unidos).
            </p>
            <p>
              Tais provedores atendem a rígidos padrões internacionais de segurança da informação (como certificações ISO/IEC 27001, SOC 1/2/3) e oferecem salvaguardas contratuais e técnicas compatíveis com o <strong>Art. 33 da LGPD</strong>.
            </p>
          </section>

          {/* SEÇÃO 20 */}
          <section id="sec-20" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                20
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                20. Segurança da informação
              </h2>
            </div>
            <p>O Localiza+ adota medidas técnicas e administrativas aptas a proteger os dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Criptografia de ponta a ponta na transmissão dos dados via protocolo <strong>HTTPS com TLS 1.3</strong>;</li>
              <li>Criptografia em repouso nos bancos de dados do Cloud Firestore;</li>
              <li>Controle de acesso granular baseado em papéis (Role-Based Access Control - RBAC);</li>
              <li>Mecanismo de limitação de taxa (Rate Limiting) para prevenção de ataques de força bruta e sobrecarga de requisições;</li>
              <li>Sanitização de entradas para mitigação de vulnerabilidades de injeção de código e XSS.</li>
            </ul>
          </section>

          {/* SEÇÃO 21 */}
          <section id="sec-21" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                21
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                21. Retenção dos dados
              </h2>
            </div>
            <p>
              Os dados pessoais serão conservados pelo período estritamente necessário para cumprir as finalidades para as quais foram coletados:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Contas de usuários:</strong> mantidas enquanto o cadastro estiver ativo ou pelo período correspondente ao vínculo acadêmico/institucional com o IFPR;</li>
              <li><strong>Registros de achados, perdidos e termos de devolução:</strong> conservados pelo prazo necessário à prestação de contas, auditoria interna e registro histórico patrimonial do campus, após o qual poderão ser anonimizados ou descartados de forma segura;</li>
              <li><strong>Registros de segurança e logs:</strong> mantidos pelo tempo necessário para averiguação de incidentes e auditoria técnica.</li>
            </ul>
          </section>

          {/* SEÇÃO 22 */}
          <section id="sec-22" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                22
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                22. Dados de menores de idade
              </h2>
            </div>
            <p>
              Por se tratar de um ambiente educacional público que atende turmas de Cursos Técnicos Integrados ao Ensino Médio, o Localiza+ trata dados pessoais de estudantes menores de 18 anos.
            </p>
            <p>
              O tratamento desses dados é realizado em conformidade com o <strong>Artigo 14 da LGPD</strong>, no melhor interesse dos estudantes, para a finalidade exclusiva de proteção patrimonial, localização de seus pertences escolares e viabilização da rotina acadêmica no campus.
            </p>
          </section>

          {/* SEÇÃO 23 */}
          <section id="sec-23" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                23
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                23. Direitos dos titulares
              </h2>
            </div>
            <p>
              Em conformidade com o <strong>Artigo 18 da LGPD</strong>, o titular dos dados pessoais (ou seu representante legal) possui os seguintes direitos perante o controlador:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Confirmação e Acesso:</strong> obter a confirmação da existência de tratamento e acessar os seus dados pessoais armazenados;</li>
              <li><strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou desatualizados;</li>
              <li><strong>Anonimização, Bloqueio ou Eliminação:</strong> requerer a anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei;</li>
              <li><strong>Portabilidade:</strong> solicitar a portabilidade dos seus dados a outro fornecedor de serviço, observados os segredos comerciais e técnicos;</li>
              <li><strong>Eliminação:</strong> solicitar a eliminação dos dados tratados com base no consentimento, ressalvadas as hipóteses de guarda obrigatória por dever legal;</li>
              <li><strong>Informação sobre compartilhamento:</strong> obter informações sobre as entidades públicas e privadas com as quais houve compartilhamento de dados;</li>
              <li><strong>Revogação do consentimento:</strong> revogar o consentimento previamente manifestado a qualquer momento, mediante manifestação expressa;</li>
              <li><strong>Oposição:</strong> opor-se a tratamento realizado com fundamento em uma das hipóteses de dispensa de consentimento, em caso de descumprimento ao disposto na LGPD.</li>
            </ul>
          </section>

          {/* SEÇÃO 24 */}
          <section id="sec-24" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                24
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                24. Como solicitar o exercício dos direitos
              </h2>
            </div>
            <p>
              Para exercer qualquer um dos seus direitos previstos na LGPD, o titular de dados ou seu responsável legal pode enviar uma solicitação formal pelos canais indicados abaixo, informando seu nome completo, vínculo institucional e a descrição clara da solicitação:
            </p>
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs">
              <p>
                <strong>E-mail geral do projeto:</strong>{" "}
                <a href="mailto:localizamais6@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold underline">
                  localizamais6@gmail.com
                </a>
              </p>
              <p>
                <strong>Contato de privacidade do projeto:</strong>{" "}
                <a href="mailto:paulocauan39@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold underline">
                  paulocauan39@gmail.com
                </a>
              </p>
              <p className="text-neutral-500 dark:text-neutral-400 text-[11px] pt-1">
                As solicitações serão apreciadas e respondidas dentro dos prazos legais aplicáveis.
              </p>
            </div>
          </section>

          {/* SEÇÃO 25 */}
          <section id="sec-25" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                25
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                25. Encarregado pelo tratamento de dados pessoais e contato de privacidade
              </h2>
            </div>
            <p>
              Durante a fase de desenvolvimento, testes e implantação inicial do projeto:
            </p>
            <div className="p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-3">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-5 h-5 text-[#00843D] dark:text-green-400 shrink-0" />
                <h3 className="text-sm font-black text-neutral-900 dark:text-white">
                  Contato de privacidade do projeto: Paulo Cauan Lima Pereira
                </h3>
              </div>
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                <strong>E-mail:</strong>{" "}
                <a href="mailto:paulocauan39@gmail.com" className="text-[#00843D] dark:text-green-400 font-mono underline font-bold">
                  paulocauan39@gmail.com
                </a>
              </p>
              <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-800/60 text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5">
                <p className="font-bold text-neutral-800 dark:text-neutral-200">
                  Nota explicativa de distinção institucional:
                </p>
                <p>
                  Esta indicação é de caráter técnico e provisório no âmbito do projeto Localiza+ / InovaIF e <strong>não substitui</strong> a futura designação formal do Encarregado pelo Tratamento de Dados Pessoais (DPO) pela administração central do Instituto Federal do Paraná (IFPR).
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Após a implantação oficial e definição institucional pela governança do IFPR, as informações de contato do Encarregado oficial do órgão serão devidamente atualizadas nesta seção.
                </p>
              </div>
            </div>
          </section>

          {/* SEÇÃO 26 */}
          <section id="sec-26" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                26
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                26. Responsabilidade pelas informações fornecidas
              </h2>
            </div>
            <p>
              O usuário é exclusivamente responsável pela veracidade, exatidão e licitude dos dados que insere no sistema (especialmente descrições de itens, fotografias e dados de contato). É estritamente vedada a inserção de informações falsas, imagens com conteúdo ilícito ou ofensivo, ou tentativas de reivindicação fraudulenta de bens alheios, sujeitando-se o infrator às sanções disciplinares e legais cabíveis.
            </p>
          </section>

          {/* SEÇÃO 27 */}
          <section id="sec-27" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                27
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                27. Imagens de objetos
              </h2>
            </div>
            <p>
              As fotografias cadastradas na plataforma devem retratar exclusivamente os objetos encontrados ou perdidos. Recomenda-se aos usuários que evitem o envio de fotos que exponham rostos de pessoas, documentos pessoais com números abertos (como CPF ou cartões de crédito visíveis sem necessidade) ou dados de natureza íntima. A equipe de administração reserva-se o direito de moderar ou remover imagens em desacordo com esta diretriz.
            </p>
          </section>

          {/* SEÇÃO 28 */}
          <section id="sec-28" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                28
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                28. Registro de auditoria
              </h2>
            </div>
            <p>
              Com a finalidade de garantir transparência, rastreabilidade e prestação de contas (accountability), o sistema registra eventos essenciais de auditoria (como cadastro de bens, alterações de status para &ldquo;Devolvido&rdquo;, geração de termos e ações administrativas), gravando data, horário, identificador do operador e tipo de operação realizada.
            </p>
          </section>

          {/* SEÇÃO 29 */}
          <section id="sec-29" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                29
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                29. Alterações nesta Política de Privacidade
              </h2>
            </div>
            <p>
              Esta Política de Privacidade poderá ser atualizada periodicamente para refletir melhorias no sistema, novas funcionalidades, ajustes na infraestrutura técnica ou alterações normativas e legislativas. Qualquer alteração relevante será indicada pela atualização da data no cabeçalho deste documento. Recomenda-se a consulta periódica desta página.
            </p>
          </section>

          {/* SEÇÃO 30 */}
          <section id="sec-30" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                30
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                30. Contato
              </h2>
            </div>
            <p>
              Para dúvidas, sugestões ou solicitações relacionadas a esta Política de Privacidade ou ao tratamento de dados no Localiza+:
            </p>
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs sm:text-sm">
              <p>
                <strong>E-mail geral do projeto:</strong>{" "}
                <a href="mailto:localizamais6@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold underline">
                  localizamais6@gmail.com
                </a>
              </p>
              <p>
                <strong>Contato de privacidade do projeto:</strong>{" "}
                <a href="mailto:paulocauan39@gmail.com" className="text-[#00843D] dark:text-green-400 font-semibold underline">
                  paulocauan39@gmail.com
                </a>
              </p>
              <p>
                <strong>Endereço institucional:</strong> Instituto Federal do Paraná – Campus Ivaiporã, Rua Max Arthur Greipel, nº 505 – Parque Industrial, Ivaiporã – PR, CEP 86873-400
              </p>
            </div>
          </section>

          {/* SEÇÃO 31 */}
          <section id="sec-31" className="bg-white dark:bg-[#1E1E1E] rounded-3xl border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <span className="w-8 h-8 rounded-xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 font-mono font-black text-xs flex items-center justify-center shrink-0">
                31
              </span>
              <h2 className="text-lg font-black text-neutral-900 dark:text-white">
                31. Disposições finais
              </h2>
            </div>
            <p>
              Esta Política de Privacidade é regida e interpretada de acordo com as leis da República Federativa do Brasil, em especial a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e as normas regulamentares do Instituto Federal do Paraná.
            </p>
            <div className="pt-4 flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400">
              <span>Localiza+ • IFPR Campus Ivaiporã</span>
              <button
                onClick={handleBackToSystem}
                className="text-[#00843D] dark:text-green-400 font-bold hover:underline flex items-center space-x-1"
              >
                <span>Voltar ao início do sistema</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};
