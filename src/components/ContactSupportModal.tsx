import React, { useState } from "react";
import {
  X,
  Mail,
  Send,
  LifeBuoy,
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { SupportCategory, SupportFeedbackTicket } from "../types";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { sanitizeFirestoreData } from "../lib/shared-constants";
import { safeFetchJson } from "../lib/apiHelper";
import { vibrateClick, vibrateSuccess, vibrateWarning } from "../lib/utils";

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactSupportModal: React.FC<ContactSupportModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, language, t, addToast } = useApp();

  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [category, setCategory] = useState<SupportCategory>("FEEDBACK");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"BAIXA" | "MEDIA" | "ALTA">("MEDIA");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);

  const [loading, setLoading] = useState(false);
  const [submittedProtocol, setSubmittedProtocol] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories: { id: SupportCategory; labelPt: string; labelEn: string; icon: React.ReactNode; color: string }[] = [
    {
      id: "BUG_REPORT",
      labelPt: "Relatar Bug / Erro no Sistema",
      labelEn: "Bug Report / System Issue",
      icon: <Bug className="w-4 h-4" />,
      color: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",
    },
    {
      id: "FEEDBACK",
      labelPt: "Sugestão ou Melhoria",
      labelEn: "Suggestion or Improvement",
      icon: <Lightbulb className="w-4 h-4" />,
      color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      id: "BELONGING_QUERY",
      labelPt: "Dúvida sobre Pertence / Retirada",
      labelEn: "Question about Lost Item / Pickup",
      icon: <HelpCircle className="w-4 h-4" />,
      color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      id: "OTHER",
      labelPt: "Elogio ou Outro Assunto",
      labelEn: "Praise or Other Topic",
      icon: <MessageSquare className="w-4 h-4" />,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      vibrateWarning();
      setErrorMessage(
        language === "pt"
          ? "Por favor, preencha todos os campos obrigatórios (nome, e-mail, assunto e mensagem)."
          : "Please fill in all required fields (name, email, subject, and message)."
      );
      return;
    }

    setLoading(true);
    vibrateClick();

    const protocol = `IFPR-SUP-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    const diagnostics = includeDiagnostics
      ? {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          online: navigator.onLine,
          language: navigator.language,
          currentPath: window.location.pathname + window.location.search,
        }
      : undefined;

    const ticketData: SupportFeedbackTicket = {
      id: `ticket_${protocol}`,
      name: name.trim(),
      email: email.trim(),
      category,
      subject: subject.trim(),
      message: message.trim(),
      priority,
      userId: currentUser?.id,
      userRole: currentUser?.role,
      createdAt: timestamp,
      status: "NOVO",
      userAgent: navigator.userAgent,
      protocol,
    };

    try {
      // 1. Send to server endpoint to trigger direct email notification & Discord dispatch
      const res = await fetch("/api/support/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          category,
          subject: subject.trim(),
          message: message.trim(),
          priority,
          clientDiagnostics: diagnostics,
        }),
      });

      const resData = await res.json().catch(() => null);

      if (!res.ok || (resData && resData.success === false)) {
        throw new Error(resData?.error || "Erro ao processar envio no servidor de suporte.");
      }

      const confirmedProtocol = resData?.protocol || protocol;

      // 2. Persist in Firestore support_tickets collection (non-blocking for resilient UX)
      if (db) {
        try {
          const ticketRef = doc(db, "support_tickets", ticketData.id);
          await setDoc(ticketRef, sanitizeFirestoreData({ ...ticketData, protocol: confirmedProtocol }));
        } catch (dbErr) {
          console.warn("[Support Tickets Firestore Notice] Gravação secundária no Firestore:", dbErr);
        }
      }

      vibrateSuccess();
      setSubmittedProtocol(confirmedProtocol);
      addToast(
        language === "pt"
          ? "Feedback enviado com sucesso para a equipe do Campus Ivaiporã!"
          : "Feedback sent successfully to Campus Ivaiporã team!",
        "success"
      );
    } catch (err: any) {
      console.error("Erro ao enviar suporte:", err);
      setErrorMessage(
        err?.message ||
          (language === "pt"
            ? "Ocorreu um erro ao enviar seu contato. Você pode utilizar a opção de envio direto por e-mail abaixo."
            : "An error occurred while sending your feedback. You can use direct email client option below.")
      );
      vibrateWarning();
    } finally {
      setLoading(false);
    }
  };

  const generateMailtoUrl = () => {
    const dest = "localizamais6@gmail.com";
    const sub = `[IFPR Suporte - ${category}] ${subject || "Contato de Usuário"}`;
    const bodyLines = [
      `Olá Equipe de Atendimento do IFPR Campus Ivaiporã,`,
      ``,
      `Nome: ${name || "Não informado"}`,
      `E-mail: ${email || "Não informado"}`,
      `Categoria: ${category}`,
      `Prioridade: ${priority}`,
      ``,
      `Mensagem:`,
      `${message || "(Sem conteúdo digitado)"}`,
      ``,
      `---`,
      `Enviado via Plataforma IFPR Achados & Perdidos`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
    ];
    return `mailto:${dest}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
  };

  const handleCopyProtocol = () => {
    if (!submittedProtocol) return;
    navigator.clipboard.writeText(submittedProtocol);
    setCopied(true);
    vibrateClick();
    addToast(t("contactCopied", "Protocolo copiado para a área de transferência!"), "info");
    setTimeout(() => setCopied(false), 3000);
  };

  const handleResetForm = () => {
    setSubmittedProtocol(null);
    setSubject("");
    setMessage("");
    setErrorMessage(null);
  };

  return (
    <div
      id="contact-support-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-[#00843D]/10 text-[#00843D] dark:text-green-400 border border-[#00843D]/20 shadow-xs">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded bg-[#00843D]/15 text-[#00843D] dark:text-green-400">
                  {language === "pt" ? "Campus Ivaiporã • Suporte Direto" : "Ivaiporã Campus • Direct Support"}
                </span>
              </div>
              <h2 id="contact-modal-title" className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">
                {t("contactModalTitle", "Suporte & Feedback Institucional")}
              </h2>
            </div>
          </div>

          <button
            id="close-contact-modal-btn"
            onClick={() => {
              vibrateClick();
              onClose();
            }}
            className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            aria-label={t("close", "Fechar")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {submittedProtocol ? (
            /* Success State */
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-[#00843D] dark:text-green-400 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-neutral-900 dark:text-white">
                  {t("contactSuccessTitle", "Mensagem Encaminhada com Sucesso!")}
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
                  {t(
                    "contactSuccessDesc",
                    "Seu relato foi registrado e notificado para a equipe de suporte do IFPR Campus Ivaiporã via e-mail (localizamais6@gmail.com)."
                  )}
                </p>
              </div>

              {/* Protocol Card */}
              <div className="p-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between max-w-md mx-auto">
                <div className="text-left">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                    {t("contactProtocolLabel", "Protocolo de Atendimento")}
                  </span>
                  <span className="text-sm font-mono font-black text-[#00843D] dark:text-green-400">
                    {submittedProtocol}
                  </span>
                </div>
                <button
                  id="copy-protocol-btn"
                  onClick={handleCopyProtocol}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#2A2A2A] border border-neutral-200 dark:border-neutral-700 text-xs font-bold flex items-center space-x-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 transition-all shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? t("contactCopied", "Copiado!") : t("contactCopyProtocol", "Copiar")}</span>
                </button>
              </div>

              {/* Campus Destination Info */}
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-center gap-2 max-w-md mx-auto">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  {language === "pt"
                    ? "Cópia despachada para: localizamais6@gmail.com"
                    : "Copy dispatched to: localizamais6@gmail.com"}
                </span>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  id="new-feedback-btn"
                  onClick={handleResetForm}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-bold transition-all"
                >
                  {language === "pt" ? "Enviar Outra Mensagem" : "Send Another Message"}
                </button>
                <button
                  id="close-success-btn"
                  onClick={() => {
                    vibrateClick();
                    onClose();
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#00843D] hover:bg-[#006e32] text-white text-xs font-extrabold transition-all shadow-md"
                >
                  {t("close", "Fechar Janela")}
                </button>
              </div>
            </div>
          ) : (
            /* Contact Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {t(
                  "contactModalDesc",
                  "Envie relatos de erros, sugestões de melhoria ou dúvidas diretamente para a equipe de apoio do Campus Ivaiporã."
                )}
              </p>

              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-500/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Category Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  {t("contactCategoryLabel", "Tipo de Mensagem")} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categories.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => {
                          vibrateClick();
                          setCategory(cat.id);
                        }}
                        className={`p-3 rounded-2xl border text-left flex items-center space-x-3 transition-all ${
                          isSelected
                            ? "border-[#00843D] bg-[#00843D]/10 text-neutral-900 dark:text-white ring-2 ring-[#00843D]/20 shadow-xs"
                            : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#181818] text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                        }`}
                      >
                        <div className={`p-2 rounded-xl border ${cat.color} shrink-0`}>
                          {cat.icon}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate">
                            {language === "pt" ? cat.labelPt : cat.labelEn}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* User Identity Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    {t("contactNameLabel", "Seu Nome Completo")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#00843D]/30 focus:border-[#00843D] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    {t("contactEmailLabel", "Seu E-mail")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@ifpr.edu.br"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#00843D]/30 focus:border-[#00843D] transition-all"
                  />
                </div>
              </div>

              {/* Subject & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    {t("contactSubjectLabel", "Assunto")} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-subject-input"
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={
                      category === "BUG_REPORT"
                        ? "Ex: Erro ao escanear etiqueta QR no celular"
                        : "Ex: Sugestão de novo ponto de entrega no ginásio"
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#00843D]/30 focus:border-[#00843D] transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    {t("contactPriorityLabel", "Prioridade")}
                  </label>
                  <select
                    id="contact-priority-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#00843D]/30 focus:border-[#00843D] transition-all"
                  >
                    <option value="BAIXA">{language === "pt" ? "🟢 Baixa" : "🟢 Low"}</option>
                    <option value="MEDIA">{language === "pt" ? "🟡 Média" : "🟡 Medium"}</option>
                    <option value="ALTA">{language === "pt" ? "🔴 Alta / Urgente" : "🔴 High / Urgent"}</option>
                  </select>
                </div>
              </div>

              {/* Message Description */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                  {t("contactMessageLabel", "Mensagem / Descrição Detalhada")} <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="contact-message-input"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    language === "pt"
                      ? "Descreva seu relato com o máximo de detalhes (passos para reproduzir se for um bug, ou informações do objeto/sugestão)..."
                      : "Provide as much detail as possible (steps to reproduce for bugs, or suggestion notes)..."
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#00843D]/30 focus:border-[#00843D] transition-all resize-none"
                />
              </div>

              {/* Diagnostics Toggle */}
              <label className="flex items-center space-x-2 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDiagnostics}
                  onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                  className="w-4 h-4 rounded text-[#00843D] focus:ring-[#00843D] border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <span>
                  {language === "pt"
                    ? "Incluir dados técnicos do dispositivo (navegador, tela, status de conexão)"
                    : "Include device technical diagnostics (browser, screen size, connection status)"}
                </span>
              </label>

              {/* Form Action Buttons */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Direct email app fallback */}
                <a
                  id="direct-mailto-link"
                  href={generateMailtoUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-[#00843D] dark:hover:text-green-400 transition-colors flex items-center space-x-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{t("contactDirectMailBtn", "Abrir no Meu Aplicativo de E-mail")}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                {/* Submit button */}
                <button
                  id="submit-contact-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-[#00843D] hover:bg-[#006e32] text-white text-xs font-black transition-all flex items-center justify-center space-x-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t("contactSubmitting", "Enviando à equipe...")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{t("contactSubmitBtn", "Enviar Mensagem por E-mail")}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
