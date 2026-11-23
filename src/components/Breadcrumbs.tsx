import React, { useMemo } from "react";
import { useRouter, Link } from "../context/RouterContext";
import { useApp } from "../context/AppContext";
import { UIBadge } from "./ui";
import {
  Home,
  ChevronRight,
  PackageSearch,
  CheckCircle2,
  PlusCircle,
  Bookmark,
  Bell,
  User,
  Settings,
  Sparkles,
  LifeBuoy,
  MessageSquare,
  Bug,
  ShieldCheck,
  LayoutDashboard,
  Users,
  GraduationCap,
  FileText,
  Activity,
  SlidersHorizontal,
  Shield,
  FileCheck,
  ArrowLeft,
  GitBranch,
  Building2,
} from "lucide-react";
import { vibrateClick } from "../lib/utils";

interface BreadcrumbSegment {
  label: string;
  path: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: "red" | "green" | "amber" | "emerald" | "blue" | "purple" | "neutral";
  isCurrent?: boolean;
}

const SEGMENT_CONFIG: Record<
  string,
  {
    labelPt: string;
    labelEn: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeColor?: BreadcrumbSegment["badgeColor"];
  }
> = {
  admin: { labelPt: "Admin", labelEn: "Admin", icon: ShieldCheck, badge: "Admin", badgeColor: "amber" },
  dashboard: { labelPt: "Visão Geral", labelEn: "Overview", icon: LayoutDashboard },
  usuarios: { labelPt: "Gestão de Usuários", labelEn: "User Management", icon: Users },
  users: { labelPt: "Gestão de Usuários", labelEn: "User Management", icon: Users },
  aprovacoes: { labelPt: "Solicitações Acadêmicas", labelEn: "Academic Requests", icon: GraduationCap },
  approvals: { labelPt: "Solicitações Acadêmicas", labelEn: "Academic Requests", icon: GraduationCap },
  itens: { labelPt: "Controle de Itens & QR", labelEn: "Items & QR Control", icon: PackageSearch },
  items: { labelPt: "Controle de Itens & QR", labelEn: "Items & QR Control", icon: PackageSearch },
  objetos: { labelPt: "Objetos", labelEn: "Objects", icon: PackageSearch },
  feedbacks: { labelPt: "Feedbacks da Comunidade", labelEn: "Community Feedback", icon: MessageSquare },
  feedback: { labelPt: "Feedback", labelEn: "Feedback", icon: MessageSquare },
  bugs: { labelPt: "Relatos de Bugs", labelEn: "Bug Reports", icon: Bug, badge: "TI", badgeColor: "red" },
  "relatar-bug": { labelPt: "Relatar Bug", labelEn: "Report Bug", icon: Bug, badge: "TI", badgeColor: "red" },
  documentos: { labelPt: "Termos & Documentos", labelEn: "Terms & Documents", icon: FileText },
  documents: { labelPt: "Termos & Documentos", labelEn: "Terms & Documents", icon: FileText },
  monitoramento: { labelPt: "Monitoramento & Logs", labelEn: "Monitoring & Logs", icon: Activity },
  monitoring: { labelPt: "Monitoramento & Logs", labelEn: "Monitoring & Logs", icon: Activity },
  configuracoes: { labelPt: "Configurações", labelEn: "Settings", icon: SlidersHorizontal },
  settings: { labelPt: "Configurações", labelEn: "Settings", icon: Settings },
  buscar: { labelPt: "Buscar Objetos", labelEn: "Search Objects", icon: PackageSearch },
  perdidos: { labelPt: "Objetos Perdidos", labelEn: "Lost Objects", icon: PackageSearch, badge: "Perdidos", badgeColor: "red" },
  encontrados: { labelPt: "Objetos Encontrados", labelEn: "Found Objects", icon: CheckCircle2, badge: "Achados", badgeColor: "green" },
  devolvidos: { labelPt: "Objetos Devolvidos", labelEn: "Returned Objects", icon: CheckCircle2 },
  cadastrar: { labelPt: "Cadastrar Objeto", labelEn: "Register Object", icon: PlusCircle },
  "meus-itens": { labelPt: "Meus Registros", labelEn: "My Records", icon: Bookmark },
  "meus-registros": { labelPt: "Meus Registros", labelEn: "My Records", icon: Bookmark },
  notificacoes: { labelPt: "Notificações & Alertas", labelEn: "Notifications & Alerts", icon: Bell },
  perfil: { labelPt: "Meu Perfil", labelEn: "My Profile", icon: User },
  "analisador-ia": { labelPt: "Analisador Visual IA", labelEn: "AI Visual Analyzer", icon: Sparkles, badge: "Gemini", badgeColor: "purple" },
  ia: { labelPt: "Inteligência Artificial", labelEn: "Artificial Intelligence", icon: Sparkles, badge: "Gemini", badgeColor: "purple" },
  suporte: { labelPt: "Central de Suporte", labelEn: "Support Center", icon: LifeBuoy },
  privacidade: { labelPt: "Política de Privacidade", labelEn: "Privacy Policy", icon: Shield },
  "politica-de-privacidade": { labelPt: "Política de Privacidade", labelEn: "Privacy Policy", icon: Shield },
  termos: { labelPt: "Termos de Uso", labelEn: "Terms of Use", icon: FileCheck },
  "termos-de-uso": { labelPt: "Termos de Uso", labelEn: "Terms of Use", icon: FileCheck },
  versoes: { labelPt: "Histórico de Versões", labelEn: "Version History", icon: GitBranch },
  "historico-de-versoes": { labelPt: "Histórico de Versões", labelEn: "Version History", icon: GitBranch },
  changelog: { labelPt: "Changelog", labelEn: "Changelog", icon: GitBranch },
  servidor: { labelPt: "Painel do Servidor", labelEn: "Staff Panel", icon: Building2 },
  "painel-servidor": { labelPt: "Painel do Servidor", labelEn: "Staff Panel", icon: Building2 },
  "verificar-email": { labelPt: "Verificar E-mail", labelEn: "Verify Email", icon: ShieldCheck },
};

function formatSegmentTitle(segment: string): string {
  const decoded = decodeURIComponent(segment).replace(/[-_]/g, " ");
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

function mapBadgeTone(
  color?: BreadcrumbSegment["badgeColor"]
): "emerald" | "rose" | "amber" | "blue" | "slate" {
  switch (color) {
    case "green":
    case "emerald":
      return "emerald";
    case "red":
      return "rose";
    case "amber":
      return "amber";
    case "blue":
    case "purple":
      return "blue";
    default:
      return "slate";
  }
}

export const Breadcrumbs: React.FC = () => {
  const { currentUser, language, t } = useApp();
  const { pathname, searchParams, routeKey, navigate } = useRouter();

  const breadcrumbItems = useMemo(() => {
    if (pathname === "/" || pathname === "" || routeKey === "home") {
      return [];
    }

    const segments = pathname.split("/").filter(Boolean);
    const trail: BreadcrumbSegment[] = [
      {
        label: t("home", "Início"),
        path: "/",
        icon: Home,
      },
    ];

    let currentAccumulatedPath = "";

    segments.forEach((seg, index) => {
      currentAccumulatedPath += `/${seg}`;
      const isLast = index === segments.length - 1;
      const lowerSeg = seg.toLowerCase();
      const config = SEGMENT_CONFIG[lowerSeg];

      let itemLabel = config
        ? language === "en"
          ? config.labelEn
          : config.labelPt
        : formatSegmentTitle(seg);
      let itemIcon = config?.icon;
      let itemBadge = config?.badge;
      let itemBadgeColor = config?.badgeColor;

      if ((lowerSeg === "admin" || lowerSeg === "servidor") && currentUser?.role === "SERVIDOR") {
        itemLabel = t("staffPanel", "Painel do Servidor");
        itemIcon = Building2;
        itemBadge = language === "en" ? "Staff" : "Servidor";
        itemBadgeColor = "emerald";
      }

      trail.push({
        label: itemLabel,
        path: currentAccumulatedPath,
        icon: itemIcon,
        badge: itemBadge,
        badgeColor: itemBadgeColor,
        isCurrent: isLast && !searchParams.tipo,
      });
    });

    if (pathname.startsWith("/buscar") && searchParams.tipo) {
      if (searchParams.tipo === "perdido") {
        trail.push({
          label: t("catalogLostTitle", "Objetos Perdidos"),
          path: "/perdidos",
          icon: PackageSearch,
          badge: t("lostItems", "Perdidos"),
          badgeColor: "red",
          isCurrent: true,
        });
      } else if (searchParams.tipo === "encontrado") {
        trail.push({
          label: t("catalogFoundTitle", "Objetos Encontrados"),
          path: "/encontrados",
          icon: CheckCircle2,
          badge: t("foundItems", "Encontrados"),
          badgeColor: "green",
          isCurrent: true,
        });
      }
    } else if (pathname.startsWith("/cadastrar") && (searchParams.tipo || searchParams.type)) {
      const paramType = (searchParams.tipo || searchParams.type || "").toLowerCase();
      if (paramType === "perdido") {
        trail.push({
          label: language === "en" ? "Lost Item" : "Item Perdido",
          path: "/cadastrar?tipo=perdido",
          icon: PlusCircle,
          badge: t("statusLost", "Perdido"),
          badgeColor: "red",
          isCurrent: true,
        });
      } else if (paramType === "encontrado") {
        trail.push({
          label: language === "en" ? "Found Item" : "Item Encontrado",
          path: "/cadastrar?tipo=encontrado",
          icon: PlusCircle,
          badge: t("statusFound", "Encontrado"),
          badgeColor: "green",
          isCurrent: true,
        });
      }
    }

    return trail;
  }, [pathname, searchParams, routeKey, currentUser?.role, language, t]);

  if (breadcrumbItems.length <= 1) {
    return null;
  }

  const previousItem = breadcrumbItems[breadcrumbItems.length - 2];
  const backPath = previousItem ? previousItem.path : "/";

  const handleBack = () => {
    vibrateClick();
    navigate(backPath);
  };

  return (
    <nav
      aria-label="Breadcrumbs"
      className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 py-1"
    >
      {/* Breadcrumb List */}
      <ol className="flex items-center flex-wrap gap-1.5 min-w-0" role="list">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1 || item.isCurrent;

          return (
            <li key={`${item.path}-${index}`} className="flex items-center gap-1.5 min-w-0">
              {index > 0 && (
                <ChevronRight
                  className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-[#172B2A] dark:text-white truncate max-w-[200px] sm:max-w-md"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="text-slate-500 dark:text-slate-400 hover:text-[#16845B] dark:hover:text-emerald-400 transition-colors shrink-0"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* Quick Context Back Button */}
      <button
        type="button"
        onClick={handleBack}
        aria-label={t("back", "Voltar")}
        title={`${t("back", "Voltar")}: ${previousItem?.label || t("home", "Início")}`}
        className="min-h-[36px] inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#172B2A] dark:hover:text-white transition-colors shrink-0 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t("back", "Voltar")}</span>
      </button>
    </nav>
  );
};
