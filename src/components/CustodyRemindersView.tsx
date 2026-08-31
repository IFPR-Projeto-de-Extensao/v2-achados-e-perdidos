import React, { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertTriangle,
  HeartHandshake,
  Trash2,
  BookOpen,
  Cpu,
  FileText,
  Clock,
  Download,
  Search,
  Filter,
  CheckCircle2,
  Building,
  ShieldAlert,
  Printer,
  ChevronRight,
  Sparkles,
  Layers,
  FileCheck,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { LostFoundItem } from "../types";
import { formatDateTime, formatDate, safeParseDate, vibrateClick, vibrateSuccess } from "../lib/utils";

interface CustodyRemindersViewProps {
  darkMode?: boolean;
}

export const CustodyRemindersView: React.FC<CustodyRemindersViewProps> = ({ darkMode }) => {
  const {
    items,
    setSelectedItemForDetail,
    registerItemDestination,
    addToast,
    currentUser,
    sendNotificationToUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("TODAS");
  const [selectedItemForAction, setSelectedItemForAction] = useState<LostFoundItem | null>(null);
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationType, setDestinationType] = useState<"DOACAO" | "DESCARTE" | "LEILAO_PROJETO" | "OUTRO">("DOACAO");
  const [destinationEntity, setDestinationEntity] = useState("Entidade Beneficente Conveniada IFPR");
  const [destinationNotes, setDestinationNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute items with custody age >= 90 days (not yet returned or discarded)
  const itemsOver90Days = useMemo(() => {
    const now = Date.now();
    return items
      .filter((item) => {
        if (item.status === "DEVOLVIDO" || item.status === "ENCERRADO" || (item.status as string) === "DOADO" || (item.status as string) === "DESCARTE") {
          return false;
        }
        const itemDate = safeParseDate(item.date || item.createdAt || "")?.getTime();
        if (!itemDate || isNaN(itemDate)) return false;
        const diffDays = Math.floor((now - itemDate) / (1000 * 60 * 60 * 24));
        return diffDays >= 90;
      })
      .map((item) => {
        const itemDate = safeParseDate(item.date || item.createdAt || "")?.getTime() || now;
        const diffDays = Math.floor((now - itemDate) / (1000 * 60 * 60 * 24));
        return {
          ...item,
          daysInCustody: diffDays,
        };
      })
      .sort((a, b) => b.daysInCustody - a.daysInCustody);
  }, [items]);

  // Filtered list
  const filteredItems = useMemo(() => {
    return itemsOver90Days.filter((item) => {
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.qrCodeId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = categoryFilter === "TODAS" || item.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [itemsOver90Days, searchQuery, categoryFilter]);

  // Get institutional destination recommendation based on category
  const getRecommendation = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes("vestuário") || cat.includes("roupa") || cat.includes("acessórios")) {
      return {
        type: "DOAÇÃO SOCIAL",
        target: "Campanha do Agasalho IFPR / APAE Ivaiporã",
        icon: HeartHandshake,
        color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800",
        description: "Doação para entidades beneficentes parceiras do campus após 90 dias de guarda.",
      };
    }
    if (cat.includes("livro") || cat.includes("caderno") || cat.includes("estudos") || cat.includes("didático")) {
      return {
        type: "INCORPORAÇÃO / DOAÇÃO",
        target: "Biblioteca do Campus / Fundo Estudantil",
        icon: BookOpen,
        color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800",
        description: "Incorporação ao acervo da biblioteca ou distribuição para alunos em vulnerabilidade.",
      };
    }
    if (cat.includes("eletrônico") || cat.includes("tecnologia") || cat.includes("fone") || cat.includes("carregador")) {
      return {
        type: "AVALIAÇÃO / TI VERDE",
        target: "Laboratório de TI / Descarte Eletrônico",
        icon: Cpu,
        color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800",
        description: "Avaliação pela DAE/TI para aproveitamento didático ou descarte ecológico certificado.",
      };
    }
    if (cat.includes("documento") || cat.includes("cartão") || cat.includes("crachá")) {
      return {
        type: "CORREIOS / DESTRUIÇÃO LGPD",
        target: "Correios / Órgão Emissor ou Destruição",
        icon: ShieldAlert,
        color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800",
        description: "Encaminhamento aos Correios ou destruição segura com lavratura de ata conforme LGPD.",
      };
    }
    return {
      type: "DESTINAÇÃO INSTITUCIONAL",
      target: "Comissão de Patrimônio do Campus",
      icon: Building,
      color: "text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700",
      description: "Encaminhar para triagem final e destinação autorizada pela direção geral do IFPR.",
    };
  };

  // Generate Institutional Batch Donation/Disposal PDF
  const handleGenerateInstitutionalDonationPDF = () => {
    vibrateClick();
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const campusGreen = [0, 132, 61];

      // Header Banner
      doc.setFillColor(campusGreen[0], campusGreen[1], campusGreen[2]);
      doc.rect(0, 0, 210, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("INSTITUTO FEDERAL DO PARANÁ • CAMPUS IVAIPORÃ", 14, 12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Termo Oficial de Doação e Destinação de Bens Não Reclamados (>90 Dias)", 14, 19);

      // Metadata box
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      const protocolNumber = `TERMO-DOACAO-IFPR-${Date.now().toString().slice(-6)}`;
      doc.text(`Protocolo Institucional: ${protocolNumber}`, 14, 36);
      doc.text(`Data de Emissão: ${formatDateTime(new Date().toISOString())}`, 14, 42);
      doc.text(`Responsável: ${currentUser.name} (${currentUser.role} - SEBAC/Portaria)`, 14, 48);

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const legalText =
        "Em conformidade com o Regulamento de Achados e Perdidos do IFPR Campus Ivaiporã e as normas vigentes de guarda patrimonial, os itens relacionados abaixo permaneceram sem reclamação de propriedade por período superior a 90 (noventa) dias corridos e são declarados aptos para doação a instituições de caridade ou descarte responsável.";
      const splitLegal = doc.splitTextToSize(legalText, 180);
      doc.text(splitLegal, 14, 56);

      // Table of items > 90 days
      autoTable(doc, {
        startY: 72,
        head: [["ID", "Título / Descrição", "Categoria", "Data Entrada", "Dias em Guarda", "Destinação Sugerida"]],
        body: filteredItems.map((item) => {
          const rec = getRecommendation(item.category);
          return [
            item.id,
            item.title,
            item.category,
            formatDate(item.date),
            `${(item as any).daysInCustody} dias`,
            rec.target,
          ];
        }),
        theme: "striped",
        headStyles: { fillColor: [0, 132, 61], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2.5 },
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);

      if (finalY < 240) {
        doc.line(20, finalY + 20, 90, finalY + 20);
        doc.text("Servidor Responsável (SEBAC)", 25, finalY + 25);

        doc.line(120, finalY + 20, 190, finalY + 20);
        doc.text("Representante da Entidade Recebedora", 122, finalY + 25);
      }

      // Footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("IFPR Campus Ivaiporã • Gestão de Achados e Perdidos", 14, 288);
        doc.text(`Página ${i} de ${totalPages}`, 180, 288);
      }

      doc.save(`termo-doacao-90dias-ifpr-${Date.now()}.pdf`);
      vibrateSuccess();
      addToast("Termo Institucional de Doação em PDF gerado com sucesso!", "success");
    } catch (e: any) {
      console.error(e);
      addToast("Erro ao gerar termo de doação em PDF.", "error");
    }
  };

  // Submit single item destination
  const handleConfirmDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForAction) return;

    setIsSubmitting(true);
    try {
      const fullNotes = `Destinado para: ${destinationEntity}. Observações: ${destinationNotes || "Destinação efetuada conforme regulamento de 90 dias do IFPR."}`;
      await registerItemDestination(selectedItemForAction.id, destinationType, fullNotes);
      addToast(`Pertence "${selectedItemForAction.title}" destinado com sucesso.`, "success");
      setDestinationModalOpen(false);
      setSelectedItemForAction(null);
    } catch (err: any) {
      console.error(err);
      addToast("Erro ao registrar destinação do pertence.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-2xl bg-white/20 backdrop-blur-md">
                <AlertTriangle className="w-6 h-6 text-white" />
              </span>
              <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-wider">
                Normas Regimentais IFPR • Artigo 42
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Lembretes de Itens em Custódia ({itemsOver90Days.length})
            </h2>
            <p className="text-xs sm:text-sm text-amber-100 max-w-2xl leading-relaxed">
              Itens que estão no depósito do campus há mais de <strong>90 dias</strong> sem reclamação. Conforme as normas institucionais, recomenda-se a doação comunitária, descarte sustentável ou incorporação ao acervo do IFPR.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleGenerateInstitutionalDonationPDF}
              disabled={filteredItems.length === 0}
              className="px-4 py-2.5 rounded-xl bg-white text-amber-900 font-black text-xs hover:bg-amber-50 transition-all flex items-center gap-1.5 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <FileCheck className="w-4 h-4 text-amber-700" />
              <span>Gerar Termo de Doação (PDF)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Summary Cards by Recommendation Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              Doação Social / Agasalhos
            </span>
            <HeartHandshake className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
            {itemsOver90Days.filter((i) => i.category.toLowerCase().includes("vestuário")).length} itens
          </div>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            Encaminhar para APAE e Campanha do Agasalho
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
              Biblioteca / Livros
            </span>
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-900 dark:text-blue-100">
            {itemsOver90Days.filter((i) => i.category.toLowerCase().includes("livro") || i.category.toLowerCase().includes("caderno")).length} itens
          </div>
          <p className="text-[11px] text-blue-700 dark:text-blue-400">
            Incorporar ao acervo didático estudantil
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wider">
              Eletrônicos / TI Verde
            </span>
            <Cpu className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-900 dark:text-purple-100">
            {itemsOver90Days.filter((i) => i.category.toLowerCase().includes("eletrônico")).length} itens
          </div>
          <p className="text-[11px] text-purple-700 dark:text-purple-400">
            Laboratórios de Informática ou Descarte Certificado
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Documentos / Correios
            </span>
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900 dark:text-amber-100">
            {itemsOver90Days.filter((i) => i.category.toLowerCase().includes("documento")).length} itens
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Agência dos Correios ou Destruição Segura
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título, local ou código..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-[#00843D]"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-neutral-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
          >
            <option value="TODAS">Todas as Categorias</option>
            <option value="Vestuário">Vestuário / Casacos</option>
            <option value="Eletrônicos">Eletrônicos</option>
            <option value="Documentos">Documentos</option>
            <option value="Mochilas">Mochilas & Bolsas</option>
            <option value="Chaves">Chaves</option>
            <option value="Material Didático">Material Didático</option>
          </select>
        </div>
      </div>

      {/* Table of items */}
      <div className="rounded-3xl bg-white dark:bg-[#1E1E1E] border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="text-base font-black text-neutral-900 dark:text-white">
              Nenhum item pendente há mais de 90 dias
            </h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Parabéns! O fluxo de devoluções do Campus Ivaiporã está em dia e os pertences estão sendo restituídos rapidamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-900/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-extrabold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Pertence / Identificação</th>
                  <th className="py-3.5 px-4">Tempo em Guarda</th>
                  <th className="py-3.5 px-4">Local de Origem</th>
                  <th className="py-3.5 px-4">Recomendação IFPR</th>
                  <th className="py-3.5 px-4 text-right">Ações Regulamentares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filteredItems.map((item) => {
                  const rec = getRecommendation(item.category);
                  const IconComp = rec.icon;
                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <img
                            src={item.imageUrl || "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=150"}
                            alt={item.title}
                            className="w-10 h-10 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedItemForDetail(item)}
                              className="font-extrabold text-neutral-900 dark:text-white hover:text-[#00843D] text-left block"
                            >
                              {item.title}
                            </button>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {item.qrCodeId} • {item.category}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[11px] font-black">
                            {(item as any).daysInCustody} dias
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          Desde {formatDate(item.date)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                        {item.location}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className={`p-2 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 ${rec.color}`}>
                          <IconComp className="w-3.5 h-3.5 shrink-0" />
                          <span>{rec.target}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              vibrateClick();
                              setSelectedItemForAction(item);
                              setDestinationModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#00843D] hover:bg-[#006e33] text-white text-xs font-black transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                          >
                            <HeartHandshake className="w-3.5 h-3.5" />
                            <span>Destinar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Destination Modal */}
      {destinationModalOpen && selectedItemForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-[#00843D]">
                  <HeartHandshake className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-black text-neutral-900 dark:text-white">
                    Registrar Destinação do Pertence
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {selectedItemForAction.title} ({selectedItemForAction.qrCodeId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDestinationModalOpen(false);
                  setSelectedItemForAction(null);
                }}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDestination} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Modalidade de Destinação
                </label>
                <select
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                >
                  <option value="DOACAO">Doação para Entidade Beneficente / Social</option>
                  <option value="LEILAO_PROJETO">Incorporação ao Acervo / Fundo Didático Estudantil</option>
                  <option value="DESCARTE">Descarte Ecológico / TI Verde / Destruição LGPD</option>
                  <option value="OUTRO">Outra Destinação Administrativa</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Entidade / Órgão Recebedor
                </label>
                <input
                  type="text"
                  required
                  value={destinationEntity}
                  onChange={(e) => setDestinationEntity(e.target.value)}
                  placeholder="Ex: APAE Ivaiporã, Biblioteca Central, etc."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Observações e Termos de Transferência
                </label>
                <textarea
                  rows={3}
                  value={destinationNotes}
                  onChange={(e) => setDestinationNotes(e.target.value)}
                  placeholder="Detalhes sobre a entrega, autorização da direção ou número de processo..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setDestinationModalOpen(false);
                    setSelectedItemForAction(null);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-black rounded-xl bg-[#00843D] text-white hover:bg-[#006e33] transition-all flex items-center gap-1.5 shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? "Gravando..." : "Confirmar Destinação"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
