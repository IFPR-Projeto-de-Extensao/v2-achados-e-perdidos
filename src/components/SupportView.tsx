import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useRouter } from "../context/RouterContext";
import { submitSupportFeedback } from "../lib/supportFeedbackService";
import { localize } from "../lib/i18n";
import {
  LifeBuoy,
  MessageSquare,
  Bug,
  HelpCircle,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  MapPin,
  Clock,
  ExternalLink,
  Star,
  Smartphone,
  Shield,
  Layers,
  ArrowRight,
  Compass,
  BookOpen,
} from "lucide-react";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../lib/utils";
import { OFFICIAL_DISCORD_INVITE_URL } from "../lib/constants";
import { triggerSpotlightTour } from "../lib/spotlightTourUtils";

export const IFPR_IVAIPORA_DISCORD_INVITE = OFFICIAL_DISCORD_INVITE_URL;

interface SupportViewProps {
  initialTab?: "faq" | "feedback" | "bug";
}

export const SupportView: React.FC<SupportViewProps> = ({ initialTab = "faq" }) => {
  const { currentUser, addToast, language, t } = useApp();
  const L = (pt: string, en: string) => localize(language, pt, en);
  const { routeKey, navigate } = useRouter();

  // Determine active tab based on routeKey or prop
  const [activeTab, setActiveTab] = useState<"faq" | "feedback" | "bug">(() => {
    if (routeKey === "support_feedback") return "feedback";
    if (routeKey === "support_bug") return "bug";
    return initialTab;
  });

  useEffect(() => {
    if (routeKey === "support_feedback") {
      setActiveTab("feedback");
    } else if (routeKey === "support_bug") {
      setActiveTab("bug");
    } else if (routeKey === "support") {
      setActiveTab("faq");
    }
  }, [routeKey]);

  // Feedback form state
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState("USABILIDADE");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSenderName, setFeedbackSenderName] = useState(currentUser.name || "");
  const [feedbackSenderEmail, setFeedbackSenderEmail] = useState(currentUser.email || "");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Bug form state
  const [bugTitle, setBugTitle] = useState("");
  const [bugSeverity, setBugSeverity] = useState<"BAIXA" | "MEDIA" | "ALTA" | "CRITICA">("MEDIA");
  const [bugSteps, setBugSteps] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugActual, setBugActual] = useState("");
  const [bugImageUrl, setBugImageUrl] = useState("");
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);

  // FAQ Accordion
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const faqs =
    language === "en"
      ? [
          {
            q: "Where should I pick up a found item after claiming it?",
            a: "All items handed over to the IFPR Ivaiporã Campus administration are kept in safe custody at the Academic Office / Main Reception (Administrative Block). Bring an official photo ID or Student Card along with your Localiza+ code/receipt.",
          },
          {
            q: "How can I prove a valuable item (such as a phone or earbuds) belongs to me?",
            a: "When found items are registered, sensitive details (such as passcode, internal markings, or serial number) remain hidden. You will need to answer the verification question or unlock the device in person in front of the staff member.",
          },
          {
            q: "What is the maximum storage period for unclaimed items on campus?",
            a: "Under IFPR Ivaiporã Campus policy, items are stored for up to 90 days. After that period, unclaimed items are forwarded to partner social institutions or regulated sustainable disposal.",
          },
          {
            q: "Can I register an item I found outside IFPR?",
            a: "Localiza+ is dedicated primarily to items lost and found on IFPR Ivaiporã Campus premises, partner university buses, and institutional academic events.",
          },
          {
            q: "How do I find a lost item on campus?",
            a: "You can search the object catalog by title, category, color, approximate date, and campus block where the item was last seen, or check directly at the Main Gate and SEBAC.",
          },
        ]
      : [
          {
            q: "Onde devo retirar um objeto encontrado após reivindicá-lo?",
            a: "Todos os objetos entregues à administração do Campus Ivaiporã ficam sob custódia segura na Secretaria Acadêmica / Recepção Geral (Bloco Administrativo). Ao se dirigir ao local, apresente seu documento oficial com foto ou Carteirinha de Estudante e o código/comprovante do Localiza+.",
          },
          {
            q: "Como comprovar que um objeto de valor (como celular ou fone) é meu?",
            a: "Durante o cadastro de achados, detalhes sensíveis (como senha, marcas internas ou número de série) ficam ocultos. Você precisará responder à pergunta de verificação cadastrada ou desbloquear o aparelho presencialmente diante do servidor responsável.",
          },
          {
            q: "Qual o prazo máximo para retirada de objetos guardados no campus?",
            a: "Conforme o regulamento do IFPR Campus Ivaiporã, os objetos permanecem armazenados por até 90 dias. Após esse período, itens não procurados são encaminhados para doação a instituições sociais parceiras ou descarte sustentável regulamentado.",
          },
          {
            q: "Posso cadastrar um objeto que encontrei fora do IFPR?",
            a: "O Localiza+ é voltado prioritariamente para itens perdidos e encontrados nas dependências do IFPR Campus Ivaiporã, ônibus universitários conveniados e eventos acadêmicos institucionais.",
          },
          {
            q: "Como encontrar um objeto perdido no campus?",
            a: "Você pode pesquisar no catálogo geral por título, categoria, cor, data aproximada e bloco do campus onde o objeto foi visto pela última vez, ou consultar a equipe na Guarita Principal e SEBAC.",
          },
        ];

  const handleTabChange = (tab: "faq" | "feedback" | "bug") => {
    vibrateClick();
    setActiveTab(tab);
    if (tab === "feedback") {
      navigate("/suporte/feedback");
    } else if (tab === "bug") {
      navigate("/suporte/relatar-bug");
    } else {
      navigate("/suporte");
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      addToast(L("Por favor, digite sua mensagem ou sugestão.", "Please enter your message or suggestion."), "error");
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const result = await submitSupportFeedback({
        name: (feedbackSenderName || currentUser.name || L("Membro da Comunidade", "Community Member")).trim(),
        email: (feedbackSenderEmail || currentUser.email || "localizamais0@gmail.com").trim(),
        category: "FEEDBACK",
        subject: `[Feedback] ${feedbackCategory} - Avaliação: ${feedbackRating} estrelas`,
        message: feedbackMessage.trim(),
        priority: "MEDIA",
        includeDiagnostics: true,
        userId: currentUser?.id,
        userRole: currentUser?.role,
      });

      if (!result.success) {
        throw new Error(result.error || L("Erro ao processar sugestão no servidor.", "Error processing feedback on server."));
      }

      vibrateSuccess();
      setFeedbackSubmitted(true);
      addToast(
        L(
          "Sugestão e notificação enviadas à equipe do Campus Ivaiporã!",
          "Feedback and notification sent to the Ivaiporã Campus team!"
        ),
        "success"
      );
    } catch (err: any) {
      console.warn("Feedback notice:", err);
      addToast(err?.message || L("Obrigado pela sua sugestão!", "Thank you for your feedback!"), "info");
      setFeedbackSubmitted(true);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleSubmitBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugTitle.trim() || !bugSteps.trim()) {
      addToast(
        L(
          "Preencha o título do erro e os passos para reproduzi-lo.",
          "Please fill in the issue title and steps to reproduce it."
        ),
        "error"
      );
      return;
    }

    setIsSubmittingBug(true);
    try {
      const priorityMapping =
        bugSeverity === "CRITICA" || bugSeverity === "ALTA"
          ? ("ALTA" as const)
          : bugSeverity === "BAIXA"
          ? ("BAIXA" as const)
          : ("MEDIA" as const);

      const detailedReport = [
        `**Gravidade:** ${bugSeverity}`,
        `**Passos para Reproduzir:**\n${bugSteps.trim()}`,
        bugExpected.trim() ? `**Comportamento Esperado:**\n${bugExpected.trim()}` : null,
        bugActual.trim() ? `**Comportamento Obtido:**\n${bugActual.trim()}` : null,
        bugImageUrl.trim() ? `**Link / Imagem Anexa:**\n${bugImageUrl.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const result = await submitSupportFeedback({
        name: (currentUser.name || L("Membro da Comunidade", "Community Member")).trim(),
        email: (currentUser.email || "localizamais0@gmail.com").trim(),
        category: "BUG_REPORT",
        subject: `[Bug Report] ${bugTitle.trim()}`,
        message: detailedReport,
        priority: priorityMapping,
        includeDiagnostics: true,
        userId: currentUser?.id,
        userRole: currentUser?.role,
      });

      if (!result.success) {
        throw new Error(result.error || L("Erro ao processar relato no servidor.", "Error processing report on server."));
      }

      vibrateSuccess();
      setBugSubmitted(true);
      addToast(
        L(
          "Relato de erro enviado diretamente ao Discord e à equipe de TI!",
          "Bug report sent directly to Discord and the IT team!"
        ),
        "success"
      );
    } catch (err: any) {
      console.warn("Bug report notice:", err);
      addToast(err?.message || L("Relato registrado com sucesso!", "Report recorded successfully!"), "info");
      setBugSubmitted(true);
    } finally {
      setIsSubmittingBug(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-[#00843D] dark:text-green-400 text-xs font-black uppercase tracking-wider mb-2">
          <LifeBuoy className="w-3.5 h-3.5" />
          <span>{t("supportEyebrow")}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
          {t("supportTitle")}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {t("supportSubtitle")}
        </p>

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-6 border-t border-neutral-100 dark:border-neutral-800 mt-6">
          <button
            onClick={() => handleTabChange("faq")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
              activeTab === "faq"
                ? "bg-[#00843D] text-white shadow-md shadow-[#00843D]/20"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>{language === "en" ? "FAQ & Help Desk" : "Dúvidas & Atendimento"}</span>
          </button>

          <button
            onClick={() => handleTabChange("feedback")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
              activeTab === "feedback"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>{t("sendFeedback")}</span>
          </button>

          <button
            onClick={() => handleTabChange("bug")}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center space-x-2 ${
              activeTab === "bug"
                ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            <Bug className="w-4 h-4" />
            <span>{t("reportBug")}</span>
          </button>

          <div className="sm:ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                vibrateClick();
                navigate("/ajuda");
              }}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors flex items-center space-x-2 bg-white dark:bg-slate-900 text-[#172B2A] dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-[#16845B] cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-[#16845B] dark:text-emerald-400" />
              <span>{language === "en" ? "User Manual (PDF/HTML)" : "Manual do Usuário (PDF/HTML)"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                vibrateClick();
                triggerSpotlightTour();
              }}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors flex items-center space-x-2 bg-[#EBF5F0] dark:bg-emerald-950/50 text-[#16845B] dark:text-emerald-400 border border-[#16845B]/25 hover:bg-[#16845B]/15 cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              <span>{t("tourReplayBtn", "Iniciar Tour Guiado")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: FAQ & Campus Info */}
      {activeTab === "faq" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Institutional Contact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-[#00843D] dark:text-green-400 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                {L("Secretaria do Campus", "Campus Secretariat")}
              </h4>
              <p className="text-xs text-neutral-500 leading-relaxed">
                {L("Bloco Administrativo, IFPR Campus Ivaiporã - Rodovia PR-466.", "Administrative Block, IFPR Ivaiporã Campus - PR-466 Highway.")}
              </p>
            </div>

            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                {L("Horário de Atendimento", "Office Hours")}
              </h4>
              <p className="text-xs text-neutral-500 leading-relaxed">
                {L("Segunda a Sexta-feira, das 07:30 às 22:30 (Dias letivos).", "Monday to Friday, 07:30 to 22:30 (School days).")}
              </p>
            </div>

            <div className="bg-white dark:bg-[#1E1E1E] p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                {L("Contato por E-mail", "Email Contact")}
              </h4>
              <p className="text-xs text-neutral-500 leading-relaxed font-mono">
                achados.ivaipora@ifpr.edu.br
              </p>
            </div>
          </div>

          {/* Discord Integration Banner */}
          <div className="bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-neutral-900/80 p-6 rounded-3xl border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/30 text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                {L("Comunidade IFPR", "IFPR Community")}
              </span>
              <h3 className="text-base font-black text-white">
                {L("Servidor Oficial Discord do Campus Ivaiporã", "Official IFPR Ivaiporã Campus Discord Server")}
              </h3>
              <p className="text-xs text-neutral-300 max-w-lg">
                {L(
                  "Participe do canal de achados e perdidos em tempo real para avisos imediatos e integração comunitária.",
                  "Join the real-time lost and found channel for immediate alerts and campus community updates."
                )}
              </p>
            </div>

            <a
              href={IFPR_IVAIPORA_DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 whitespace-nowrap shrink-0"
            >
              <span>{L("Acessar Discord", "Open Discord")}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* FAQ Accordion Section */}
          <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#00843D]" />
              <span>{L("Perguntas Frequentes", "Frequently Asked Questions (FAQ)")}</span>
            </h3>

            <div className="space-y-3 pt-2">
              {faqs.map((faq, idx) => {
                const isOpen = expandedFaq === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden transition-colors"
                  >
                    <button
                      onClick={() => setExpandedFaq(isOpen ? null : idx)}
                      className="w-full p-4 text-left font-bold text-xs sm:text-sm text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50 flex items-center justify-between transition-colors"
                    >
                      <span>{faq.q}</span>
                      <span className="text-neutral-400 font-black text-base ml-2">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed bg-neutral-50/50 dark:bg-neutral-800/30 border-t border-neutral-100 dark:border-neutral-800">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Feedback Form */}
      {activeTab === "feedback" && (
        <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <span>{L("Enviar Sugestão ou Avaliação", "Send Suggestion or Feedback")}</span>
            </h3>
            <p className="text-xs text-neutral-500">
              {L(
                "Sua opinião ajuda a aprimorar o sistema de achados e perdidos do IFPR.",
                "Your feedback helps improve the IFPR Lost & Found system."
              )}
            </p>
          </div>

          {feedbackSubmitted ? (
            <div className="p-8 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-purple-600 mx-auto" />
              <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                {L("Sugestão Recebida com Sucesso!", "Feedback Received Successfully!")}
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 max-w-md mx-auto">
                {L(
                  "Muito obrigado por contribuir com a evolução contínua do Localiza+ no Campus Ivaiporã.",
                  "Thank you for helping us continuously improve Localiza+ at Ivaiporã Campus."
                )}
              </p>
              <button
                onClick={() => {
                  setFeedbackSubmitted(false);
                  setFeedbackMessage("");
                }}
                className="mt-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
              >
                {L("Enviar Outra Sugestão", "Send More Feedback")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-4">
              {/* Rating 1-5 Stars */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                  {L("Como você avalia sua experiência geral no sistema?", "How would you rate your overall experience?")}
                </label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className={`p-2 rounded-xl border transition-all ${
                        feedbackRating >= star
                          ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      <Star className="w-5 h-5 fill-current" />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-neutral-500 ml-2">
                    {feedbackRating === 5
                      ? L("Excelente (5/5)", "Excellent (5/5)")
                      : feedbackRating === 4
                      ? L("Muito Bom (4/5)", "Very Good (4/5)")
                      : feedbackRating === 3
                      ? L("Razoável (3/5)", "Average (3/5)")
                      : L("Precisa Melhorar", "Needs Improvement")}
                  </span>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {L("Categoria da Sugestão", "Feedback Category")}
                </label>
                <select
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                >
                  <option value="USABILIDADE">{L("Facilidade de Uso / Interface", "Usability / Interface")}</option>
                  <option value="NOVA_FUNCIONALIDADE">{L("Sugestão de Nova Funcionalidade", "New Feature Suggestion")}</option>
                  <option value="NOTIFICACOES">{L("Notificações e Alertas", "Notifications & Alerts")}</option>
                  <option value="OUTRO">{L("Outro Assunto", "Other Topic")}</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {L("Sua Mensagem / Sugestão *", "Your Message / Suggestion *")}
                </label>
                <textarea
                  rows={4}
                  required
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder={L(
                    "Conte-nos o que você achou, o que funcionou bem ou o que poderíamos melhorar...",
                    "Tell us what you think, what worked well, or what we could improve..."
                  )}
                  className="w-full p-3.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:border-purple-500 focus:outline-none text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Seu Nome (Opcional)", "Your Name (Optional)")}
                  </label>
                  <input
                    type="text"
                    value={feedbackSenderName}
                    onChange={(e) => setFeedbackSenderName(e.target.value)}
                    placeholder={L("Seu nome", "Your name")}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Seu E-mail (Opcional)", "Your Email (Optional)")}
                  </label>
                  <input
                    type="email"
                    value={feedbackSenderEmail}
                    onChange={(e) => setFeedbackSenderEmail(e.target.value)}
                    placeholder={L("seu.email@ifpr.edu.br", "your.email@ifpr.edu.br")}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmittingFeedback ? L("Enviando...", "Sending...") : t("sendFeedback")}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab 3: Bug Report Form */}
      {activeTab === "bug" && (
        <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-neutral-900 dark:text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-red-600" />
              <span>{L("Relatar Erro ou Falha Técnica", "Report Error or Technical Issue")}</span>
            </h3>
            <p className="text-xs text-neutral-500">
              {L(
                "Encontrou algum comportamento inesperado? Descreva o problema para que a equipe de TI possa corrigir rapidamente.",
                "Found an unexpected behavior? Describe the issue so our IT team can fix it quickly."
              )}
            </p>
          </div>

          {bugSubmitted ? (
            <div className="p-8 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-red-600 mx-auto" />
              <h4 className="text-base font-bold text-neutral-900 dark:text-white">
                {L("Relato de Erro Registrado!", "Issue Report Submitted!")}
              </h4>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 max-w-md mx-auto">
                {L(
                  "Nossa equipe de tecnologia foi notificada e analisará os registros para a correção do problema.",
                  "Our technology team has been notified and will review the logs to fix the issue."
                )}
              </p>
              <button
                onClick={() => {
                  setBugSubmitted(false);
                  setBugTitle("");
                  setBugSteps("");
                  setBugExpected("");
                  setBugActual("");
                  setBugImageUrl("");
                }}
                className="mt-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
              >
                {L("Relatar Outro Problema", "Report Another Issue")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitBug} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Título do Erro *", "Issue Title *")}
                  </label>
                  <input
                    type="text"
                    required
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    placeholder={L(
                      "Ex: Botão de gerar etiqueta QR não respondeu",
                      "E.g., Generate QR label button did not respond"
                    )}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:border-red-500 focus:outline-none text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Gravidade", "Severity")}
                  </label>
                  <select
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  >
                    <option value="BAIXA">{L("Baixa (Visual / Texto)", "Low (Visual / Text)")}</option>
                    <option value="MEDIA">{L("Média (Ação secundária)", "Medium (Secondary action)")}</option>
                    <option value="ALTA">{L("Alta (Função principal com erro)", "High (Core feature broken)")}</option>
                    <option value="CRITICA">{L("Crítica (Impedimento total)", "Critical (Complete blocker)")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {L("Passos para Reproduzir o Erro *", "Steps to Reproduce *")}
                </label>
                <textarea
                  rows={3}
                  required
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  placeholder={L(
                    "1. Acessei a tela de cadastro\n2. Preenchi os dados do objeto\n3. Ao clicar em Salvar, a tela ficou em branco...",
                    "1. Opened the registration page\n2. Filled out the item details\n3. Clicked Save and the screen went blank..."
                  )}
                  className="w-full p-3.5 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:border-red-500 focus:outline-none text-neutral-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Comportamento Esperado (Opcional)", "Expected Behavior (Optional)")}
                  </label>
                  <input
                    type="text"
                    value={bugExpected}
                    onChange={(e) => setBugExpected(e.target.value)}
                    placeholder={L("O que deveria ter acontecido?", "What should have happened?")}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    {L("Comportamento Ocorrido (Opcional)", "Actual Behavior (Optional)")}
                  </label>
                  <input
                    type="text"
                    value={bugActual}
                    onChange={(e) => setBugActual(e.target.value)}
                    placeholder={L("O que de fato aconteceu?", "What actually happened?")}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  {L("Link ou URL da Captura de Tela (Opcional)", "Screenshot Link / URL (Optional)")}
                </label>
                <input
                  type="url"
                  value={bugImageUrl}
                  onChange={(e) => setBugImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingBug}
                className="w-full py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{isSubmittingBug ? L("Enviando...", "Sending...") : L("Registrar Relato de Erro", "Submit Issue Report")}</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
