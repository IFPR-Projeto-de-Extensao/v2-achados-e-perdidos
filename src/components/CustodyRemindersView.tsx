import React, { useState, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertTriangle,
  HeartHandshake,
  BookOpen,
  Cpu,
  Search,
  Filter,
  CheckCircle2,
  Building,
  ShieldAlert,
  FileCheck,
  CameraOff,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { LostFoundItem } from "../types";
import { formatDateTime, formatDate, safeParseDate, vibrateClick, vibrateSuccess } from "../lib/utils";
import {
  PageHeader,
  SurfaceCard,
  UIButton,
  UIBadge,
  EmptyState,
  ModalShell,
  UIFieldGroup,
  UIInput,
  UISelect,
  UITextarea,
} from "./ui";

interface CustodyRemindersViewProps {
  darkMode?: boolean;
}

export const CustodyRemindersView: React.FC<CustodyRemindersViewProps> = () => {
  const {
    items,
    setSelectedItemForDetail,
    registerItemDestination,
    addToast,
    currentUser,
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
        tone: "emerald" as const,
        description: "Doação para entidades beneficentes parceiras do campus após 90 dias de guarda.",
      };
    }
    if (cat.includes("livro") || cat.includes("caderno") || cat.includes("estudos") || cat.includes("didático")) {
      return {
        type: "INCORPORAÇÃO / DOAÇÃO",
        target: "Biblioteca do Campus / Fundo Estudantil",
        icon: BookOpen,
        tone: "blue" as const,
        description: "Incorporação ao acervo da biblioteca ou distribuição para alunos em vulnerabilidade.",
      };
    }
    if (cat.includes("eletrônico") || cat.includes("tecnologia") || cat.includes("fone") || cat.includes("carregador")) {
      return {
        type: "AVALIAÇÃO / TI VERDE",
        target: "Laboratório de TI / Descarte Eletrônico",
        icon: Cpu,
        tone: "slate" as const,
        description: "Avaliação pela DAE/TI para aproveitamento didático ou descarte ecológico certificado.",
      };
    }
    if (cat.includes("documento") || cat.includes("cartão") || cat.includes("crachá")) {
      return {
        type: "CORREIOS / DESTRUIÇÃO LGPD",
        target: "Correios / Órgão Emissor ou Destruição",
        icon: ShieldAlert,
        tone: "amber" as const,
        description: "Encaminhamento aos Correios ou destruição segura com lavratura de ata conforme LGPD.",
      };
    }
    return {
      type: "DESTINAÇÃO INSTITUCIONAL",
      target: "Comissão de Patrimônio do Campus",
      icon: Building,
      tone: "slate" as const,
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

  const clothingCount = itemsOver90Days.filter((i) => i.category.toLowerCase().includes("vestuário")).length;
  const booksCount = itemsOver90Days.filter((i) => i.category.toLowerCase().includes("livro") || i.category.toLowerCase().includes("caderno")).length;
  const electronicsCount = itemsOver90Days.filter((i) => i.category.toLowerCase().includes("eletrônico")).length;
  const documentsCount = itemsOver90Days.filter((i) => i.category.toLowerCase().includes("documento")).length;

  const closeDestinationModal = () => {
    setDestinationModalOpen(false);
    setSelectedItemForAction(null);
  };

  return (
    <div className="space-y-5">
      {/* Alert Header */}
      <PageHeader
        eyebrow="Normas Regimentais IFPR • Artigo 42"
        title="Lembretes de Itens em Custódia"
        description="Itens no depósito do campus há mais de 90 dias sem reclamação, aptos para doação comunitária, descarte sustentável ou incorporação ao acervo do IFPR."
        icon={<AlertTriangle className="w-5 h-5" />}
        badge={
          <UIBadge tone={itemsOver90Days.length > 0 ? "amber" : "emerald"}>
            {itemsOver90Days.length} {itemsOver90Days.length === 1 ? "item" : "itens"}
          </UIBadge>
        }
        actions={
          <UIButton
            type="button"
            variant="primary"
            size="md"
            onClick={handleGenerateInstitutionalDonationPDF}
            disabled={filteredItems.length === 0}
          >
            <FileCheck className="w-4 h-4" />
            <span>Gerar Termo de Doação (PDF)</span>
          </UIButton>
        }
      />

      {/* Quick Summary Cards by Recommendation Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Doação Social / Agasalhos
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <HeartHandshake className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {clothingCount} {clothingCount === 1 ? "item" : "itens"}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Encaminhar para APAE e Campanha do Agasalho
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Biblioteca / Livros
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {booksCount} {booksCount === 1 ? "item" : "itens"}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Incorporar ao acervo didático estudantil
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Eletrônicos / TI Verde
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {electronicsCount} {electronicsCount === 1 ? "item" : "itens"}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Laboratórios de Informática ou Descarte Certificado
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Documentos / Correios
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {documentsCount} {documentsCount === 1 ? "item" : "itens"}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Agência dos Correios ou Destruição Segura
          </p>
        </SurfaceCard>
      </div>

      {/* Filter Bar */}
      <SurfaceCard
        padding="sm"
        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
      >
        <div className="w-full sm:w-80">
          <UIInput
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
            placeholder="Buscar por título, local ou código..."
            aria-label="Buscar itens em custódia por título, local ou código"
          />
        </div>

        <div className="w-full sm:w-60">
          <UISelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            leftIcon={<Filter className="w-4 h-4" />}
            aria-label="Filtrar por categoria"
          >
            <option value="TODAS">Todas as Categorias</option>
            <option value="Vestuário">Vestuário / Casacos</option>
            <option value="Eletrônicos">Eletrônicos</option>
            <option value="Documentos">Documentos</option>
            <option value="Mochilas">Mochilas & Bolsas</option>
            <option value="Chaves">Chaves</option>
            <option value="Material Didático">Material Didático</option>
          </UISelect>
        </div>
      </SurfaceCard>

      {/* Table of items */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-7 h-7" />}
          title="Nenhum item pendente há mais de 90 dias"
          description="O fluxo de devoluções do Campus Ivaiporã está em dia e os pertences estão sendo restituídos dentro do prazo."
        />
      ) : (
        <SurfaceCard padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Pertence / Identificação</th>
                  <th className="py-3.5 px-4">Tempo em Guarda</th>
                  <th className="py-3.5 px-4">Local de Origem</th>
                  <th className="py-3.5 px-4">Recomendação IFPR</th>
                  <th className="py-3.5 px-4 text-right">Ações Regulamentares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredItems.map((item) => {
                  const rec = getRecommendation(item.category);
                  const IconComp = rec.icon;
                  return (
                    <tr key={item.id} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {item.imageUrl &&
                          item.imageUrl.trim() !== "" &&
                          !item.imageUrl.includes("photo-1544816155-12df9643f363") &&
                          !item.imageUrl.includes("photo-1584438784894-089d6a62b8fa") ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-400 dark:text-slate-500"
                              aria-label="Sem foto anexada"
                            >
                              <CameraOff className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedItemForDetail(item)}
                              className="font-bold text-[#172B2A] dark:text-white hover:text-[#16845B] dark:hover:text-emerald-400 text-left block cursor-pointer transition-colors"
                            >
                              {item.title}
                            </button>
                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              {item.qrCodeId} • {item.category}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <UIBadge tone="rose">{(item as any).daysInCustody} dias</UIBadge>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1">
                          Desde {formatDate(item.date)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {item.location}
                      </td>

                      <td className="py-3.5 px-4">
                        <UIBadge tone={rec.tone} className="whitespace-normal text-left py-1 px-2.5 rounded-lg">
                          <IconComp className="w-3.5 h-3.5 shrink-0" />
                          <span>{rec.target}</span>
                        </UIBadge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end">
                          <UIButton
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              vibrateClick();
                              setSelectedItemForAction(item);
                              setDestinationModalOpen(true);
                            }}
                          >
                            <HeartHandshake className="w-3.5 h-3.5" />
                            <span>Destinar</span>
                          </UIButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* Destination Modal */}
      <ModalShell
        isOpen={destinationModalOpen && Boolean(selectedItemForAction)}
        onClose={closeDestinationModal}
        maxWidthClass="max-w-lg"
        zIndexClass="z-50"
        ariaLabelledBy="custody-destination-title"
      >
        {selectedItemForAction && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 border border-[#16845B]/15 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <HeartHandshake className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="custody-destination-title"
                    className="text-base font-bold text-[#172B2A] dark:text-white"
                  >
                    Registrar Destinação do Pertence
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedItemForAction.title} (<span className="font-mono">{selectedItemForAction.qrCodeId}</span>)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDestinationModal}
                aria-label="Fechar janela de destinação"
                className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDestination} className="space-y-4">
              <UIFieldGroup
                label="Modalidade de Destinação"
                htmlFor="custody-destination-type"
                required
              >
                <UISelect
                  id="custody-destination-type"
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as any)}
                >
                  <option value="DOACAO">Doação para Entidade Beneficente / Social</option>
                  <option value="LEILAO_PROJETO">Incorporação ao Acervo / Fundo Didático Estudantil</option>
                  <option value="DESCARTE">Descarte Ecológico / TI Verde / Destruição LGPD</option>
                  <option value="OUTRO">Outra Destinação Administrativa</option>
                </UISelect>
              </UIFieldGroup>

              <UIFieldGroup
                label="Entidade / Órgão Recebedor"
                htmlFor="custody-destination-entity"
                required
              >
                <UIInput
                  id="custody-destination-entity"
                  type="text"
                  required
                  value={destinationEntity}
                  onChange={(e) => setDestinationEntity(e.target.value)}
                  placeholder="Ex: APAE Ivaiporã, Biblioteca Central, etc."
                />
              </UIFieldGroup>

              <UIFieldGroup
                label="Observações e Termos de Transferência"
                htmlFor="custody-destination-notes"
              >
                <UITextarea
                  id="custody-destination-notes"
                  rows={3}
                  value={destinationNotes}
                  onChange={(e) => setDestinationNotes(e.target.value)}
                  placeholder="Detalhes sobre a entrega, autorização da direção ou número de processo..."
                />
              </UIFieldGroup>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-2">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={closeDestinationModal}
                >
                  Cancelar
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? "Gravando..." : "Confirmar Destinação"}</span>
                </UIButton>
              </div>
            </form>
          </div>
        )}
      </ModalShell>
    </div>
  );
};
