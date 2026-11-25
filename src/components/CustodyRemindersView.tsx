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
import { localize, translateCategory, translateCampusLocation, translateUserRole } from "../lib/i18n";
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
    language,
  } = useApp();
  const l = (pt: string, en: string) => localize(language, pt, en);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("TODAS");
  const [selectedItemForAction, setSelectedItemForAction] = useState<LostFoundItem | null>(null);
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationType, setDestinationType] = useState<"DOACAO" | "DESCARTE" | "LEILAO_PROJETO" | "OUTRO">("DOACAO");
  const [destinationEntity, setDestinationEntity] = useState(
    l("Entidade Beneficente Conveniada IFPR", "IFPR Partner Charitable Organization")
  );
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
        type: l("DOAÇÃO SOCIAL", "SOCIAL DONATION"),
        target: l("Campanha do Agasalho IFPR / APAE Ivaiporã", "IFPR Winter Clothing Drive / APAE Ivaiporã"),
        icon: HeartHandshake,
        tone: "emerald" as const,
        description: l(
          "Doação para entidades beneficentes parceiras do campus após 90 dias de guarda.",
          "Donation to partner charitable organizations after 90 days in custody."
        ),
      };
    }
    if (cat.includes("livro") || cat.includes("caderno") || cat.includes("estudos") || cat.includes("didático")) {
      return {
        type: l("INCORPORAÇÃO / DOAÇÃO", "COLLECTION / DONATION"),
        target: l("Biblioteca do Campus / Fundo Estudantil", "Campus Library / Student Aid Fund"),
        icon: BookOpen,
        tone: "blue" as const,
        description: l(
          "Incorporação ao acervo da biblioteca ou distribuição para alunos em vulnerabilidade.",
          "Addition to the library collection or distribution to students in need."
        ),
      };
    }
    if (cat.includes("eletrônico") || cat.includes("tecnologia") || cat.includes("fone") || cat.includes("carregador")) {
      return {
        type: l("AVALIAÇÃO / TI VERDE", "ASSESSMENT / GREEN IT"),
        target: l("Laboratório de TI / Descarte Eletrônico", "IT Lab / Certified E-Waste Disposal"),
        icon: Cpu,
        tone: "slate" as const,
        description: l(
          "Avaliação pela DAE/TI para aproveitamento didático ou descarte ecológico certificado.",
          "Evaluation by DAE/IT for academic reuse or certified eco-friendly disposal."
        ),
      };
    }
    if (cat.includes("documento") || cat.includes("cartão") || cat.includes("crachá")) {
      return {
        type: l("CORREIOS / DESTRUIÇÃO LGPD", "POSTAL SERVICE / LGPD SHREDDING"),
        target: l("Correios / Órgão Emissor ou Destruição", "Postal Service / Issuing Body or Shredding"),
        icon: ShieldAlert,
        tone: "amber" as const,
        description: l(
          "Encaminhamento aos Correios ou destruição segura com lavratura de ata conforme LGPD.",
          "Forwarding to the postal service or secure destruction with formal record per LGPD."
        ),
      };
    }
    return {
      type: l("DESTINAÇÃO INSTITUCIONAL", "INSTITUTIONAL DISPOSITION"),
      target: l("Comissão de Patrimônio do Campus", "Campus Assets Committee"),
      icon: Building,
      tone: "slate" as const,
      description: l(
        "Encaminhar para triagem final e destinação autorizada pela direção geral do IFPR.",
        "Forward for final review and disposition authorized by IFPR campus administration."
      ),
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
      doc.text(
        l(
          "Termo Oficial de Doação e Destinação de Bens Não Reclamados (>90 Dias)",
          "Official Donation & Disposition Record for Unclaimed Items (>90 Days)"
        ),
        14,
        19
      );

      // Metadata box
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      const protocolNumber = `TERMO-DOACAO-IFPR-${Date.now().toString().slice(-6)}`;
      doc.text(`${l("Protocolo Institucional", "Institutional Protocol")}: ${protocolNumber}`, 14, 36);
      doc.text(`${l("Data de Emissão", "Issue Date")}: ${formatDateTime(new Date().toISOString())}`, 14, 42);
      doc.text(
        `${l("Responsável", "Responsible")}: ${currentUser.name} (${translateUserRole(currentUser.role, language)} - SEBAC/${l("Portaria", "Front Desk")})`,
        14,
        48
      );

      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const legalText = l(
        "Em conformidade com o Regulamento de Achados e Perdidos do IFPR Campus Ivaiporã e as normas vigentes de guarda patrimonial, os itens relacionados abaixo permaneceram sem reclamação de propriedade por período superior a 90 (noventa) dias corridos e são declarados aptos para doação a instituições de caridade ou descarte responsável.",
        "In accordance with the IFPR Campus Ivaiporã Lost & Found Regulation and asset custody rules, the items listed below remained unclaimed for over 90 (ninety) calendar days and are declared eligible for donation to charitable institutions or responsible disposal."
      );
      const splitLegal = doc.splitTextToSize(legalText, 180);
      doc.text(splitLegal, 14, 56);

      // Table of items > 90 days
      autoTable(doc, {
        startY: 72,
        head: [[
          "ID",
          l("Título / Descrição", "Title / Description"),
          l("Categoria", "Category"),
          l("Data Entrada", "Entry Date"),
          l("Dias em Guarda", "Days in Custody"),
          l("Destinação Sugerida", "Suggested Disposition"),
        ]],
        body: filteredItems.map((item) => {
          const rec = getRecommendation(item.category);
          return [
            item.id,
            item.title,
            translateCategory(item.category, language),
            formatDate(item.date),
            `${(item as any).daysInCustody} ${l("dias", "days")}`,
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
        doc.text(l("Servidor Responsável (SEBAC)", "Responsible Staff (SEBAC)"), 25, finalY + 25);

        doc.line(120, finalY + 20, 190, finalY + 20);
        doc.text(l("Representante da Entidade Recebedora", "Receiving Organization Representative"), 122, finalY + 25);
      }

      // Footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          l("IFPR Campus Ivaiporã • Gestão de Achados e Perdidos", "IFPR Campus Ivaiporã • Lost & Found Management"),
          14,
          288
        );
        doc.text(l(`Página ${i} de ${totalPages}`, `Page ${i} of ${totalPages}`), 180, 288);
      }

      doc.save(`termo-doacao-90dias-ifpr-${Date.now()}.pdf`);
      vibrateSuccess();
      addToast(
        l(
          "Termo Institucional de Doação em PDF gerado com sucesso!",
          "Institutional Donation PDF Record generated successfully!"
        ),
        "success"
      );
    } catch (e: any) {
      console.error(e);
      addToast(
        l("Erro ao gerar termo de doação em PDF.", "Error generating donation PDF record."),
        "error"
      );
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
      addToast(
        l(
          `Pertence "${selectedItemForAction.title}" destinado com sucesso.`,
          `Item "${selectedItemForAction.title}" assigned for disposition successfully.`
        ),
        "success"
      );
      setDestinationModalOpen(false);
      setSelectedItemForAction(null);
    } catch (err: any) {
      console.error(err);
      addToast(
        l("Erro ao registrar destinação do pertence.", "Error recording item disposition."),
        "error"
      );
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

  const itemCountLabel = (count: number) =>
    count === 1 ? l("1 item", "1 item") : l(`${count} itens`, `${count} items`);

  return (
    <div className="space-y-5">
      {/* Alert Header */}
      <PageHeader
        eyebrow={l("Normas Regimentais IFPR • Artigo 42", "IFPR Institutional Rules • Article 42")}
        title={l("Lembretes de Itens em Custódia", "Custody Item Reminders")}
        description={l(
          "Itens no depósito do campus há mais de 90 dias sem reclamação, aptos para doação comunitária, descarte sustentável ou incorporação ao acervo do IFPR.",
          "Items stored on campus for over 90 days without a claim, eligible for community donation, sustainable disposal, or addition to the IFPR collection."
        )}
        icon={<AlertTriangle className="w-5 h-5" />}
        badge={
          <UIBadge tone={itemsOver90Days.length > 0 ? "amber" : "emerald"}>
            {itemCountLabel(itemsOver90Days.length)}
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
            <span>{l("Gerar Termo de Doação (PDF)", "Generate Donation Record (PDF)")}</span>
          </UIButton>
        }
      />

      {/* Quick Summary Cards by Recommendation Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {l("Doação Social / Agasalhos", "Social Donation / Clothing")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#EBF5F0] dark:bg-emerald-950/60 text-[#16845B] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <HeartHandshake className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {itemCountLabel(clothingCount)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {l("Encaminhar para APAE e Campanha do Agasalho", "Forward to APAE and Winter Clothing Drive")}
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {l("Biblioteca / Livros", "Library / Books")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {itemCountLabel(booksCount)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {l("Incorporar ao acervo didático estudantil", "Incorporate into student academic collection")}
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {l("Eletrônicos / TI Verde", "Electronics / Green IT")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {itemCountLabel(electronicsCount)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {l("Laboratórios de Informática ou Descarte Certificado", "Computer Labs or Certified E-Waste Disposal")}
          </p>
        </SurfaceCard>

        <SurfaceCard padding="sm" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {l("Documentos / Correios", "Documents / Postal Service")}
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#172B2A] dark:text-white tabular-nums">
            {itemCountLabel(documentsCount)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {l("Agência dos Correios ou Destruição Segura", "Postal Service or Secure Shredding")}
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
            placeholder={l("Buscar por título, local ou código...", "Search by title, location, or code...")}
            aria-label={l(
              "Buscar itens em custódia por título, local ou código",
              "Search items in custody by title, location, or code"
            )}
          />
        </div>

        <div className="w-full sm:w-60">
          <UISelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            leftIcon={<Filter className="w-4 h-4" />}
            aria-label={l("Filtrar por categoria", "Filter by category")}
          >
            <option value="TODAS">{l("Todas as Categorias", "All Categories")}</option>
            <option value="Vestuário">{l("Vestuário / Casacos", "Clothing / Jackets")}</option>
            <option value="Eletrônicos">{translateCategory("Eletrônicos", language)}</option>
            <option value="Documentos">{translateCategory("Documentos", language)}</option>
            <option value="Mochilas">{l("Mochilas e Bolsas", "Backpacks & Bags")}</option>
            <option value="Chaves">{translateCategory("Chaves", language)}</option>
            <option value="Material Didático">{translateCategory("Material Didático", language)}</option>
          </UISelect>
        </div>
      </SurfaceCard>

      {/* Table of items */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-7 h-7" />}
          title={l("Nenhum item pendente há mais de 90 dias", "No items pending over 90 days")}
          description={l(
            "O fluxo de devoluções do Campus Ivaiporã está em dia e os pertences estão sendo restituídos dentro do prazo.",
            "Campus Ivaiporã return workflow is up to date and items are being returned on time."
          )}
        />
      ) : (
        <SurfaceCard padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">{l("Pertence / Identificação", "Item / Identification")}</th>
                  <th className="py-3.5 px-4">{l("Tempo em Guarda", "Time in Custody")}</th>
                  <th className="py-3.5 px-4">{l("Local de Origem", "Origin Location")}</th>
                  <th className="py-3.5 px-4">{l("Recomendação IFPR", "IFPR Recommendation")}</th>
                  <th className="py-3.5 px-4 text-right">{l("Ações Regulamentares", "Regulatory Actions")}</th>
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
                              aria-label={l("Sem foto anexada", "No photo attached")}
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
                              {item.qrCodeId} • {translateCategory(item.category, language)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <UIBadge tone="rose">
                          {(item as any).daysInCustody} {l("dias", "days")}
                        </UIBadge>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1">
                          {l("Desde", "Since")} {formatDate(item.date)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {translateCampusLocation(item.location, language)}
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
                            <span>{l("Destinar", "Assign")}</span>
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
                    {l("Registrar Destinação do Pertence", "Record Item Disposition")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedItemForAction.title} (<span className="font-mono">{selectedItemForAction.qrCodeId}</span>)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDestinationModal}
                aria-label={l("Fechar janela de destinação", "Close disposition modal")}
                className="p-2 rounded-xl text-slate-400 hover:text-[#172B2A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDestination} className="space-y-4">
              <UIFieldGroup
                label={l("Modalidade de Destinação", "Disposition Type")}
                htmlFor="custody-destination-type"
                required
              >
                <UISelect
                  id="custody-destination-type"
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value as any)}
                >
                  <option value="DOACAO">
                    {l("Doação para Entidade Beneficente / Social", "Donation to Charitable / Social Organization")}
                  </option>
                  <option value="LEILAO_PROJETO">
                    {l("Incorporação ao Acervo / Fundo Didático Estudantil", "Incorporation into Collection / Student Fund")}
                  </option>
                  <option value="DESCARTE">
                    {l("Descarte Ecológico / TI Verde / Destruição LGPD", "Eco-Friendly Disposal / Green IT / LGPD Shredding")}
                  </option>
                  <option value="OUTRO">
                    {l("Outra Destinação Administrativa", "Other Administrative Disposition")}
                  </option>
                </UISelect>
              </UIFieldGroup>

              <UIFieldGroup
                label={l("Entidade / Órgão Recebedor", "Receiving Organization / Body")}
                htmlFor="custody-destination-entity"
                required
              >
                <UIInput
                  id="custody-destination-entity"
                  type="text"
                  required
                  value={destinationEntity}
                  onChange={(e) => setDestinationEntity(e.target.value)}
                  placeholder={l("Ex: APAE Ivaiporã, Biblioteca Central, etc.", "e.g. APAE Ivaiporã, Central Library, etc.")}
                />
              </UIFieldGroup>

              <UIFieldGroup
                label={l("Observações e Termos de Transferência", "Notes & Transfer Terms")}
                htmlFor="custody-destination-notes"
              >
                <UITextarea
                  id="custody-destination-notes"
                  rows={3}
                  value={destinationNotes}
                  onChange={(e) => setDestinationNotes(e.target.value)}
                  placeholder={l(
                    "Detalhes sobre a entrega, autorização da direção ou número de processo...",
                    "Details on handover, administration approval, or case number..."
                  )}
                />
              </UIFieldGroup>

              <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-2">
                <UIButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={closeDestinationModal}
                >
                  {l("Cancelar", "Cancel")}
                </UIButton>
                <UIButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSubmitting}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? l("Gravando...", "Saving...")
                      : l("Confirmar Destinação", "Confirm Disposition")}
                  </span>
                </UIButton>
              </div>
            </form>
          </div>
        )}
      </ModalShell>
    </div>
  );
};
