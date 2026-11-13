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
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeColor?: BreadcrumbSegment["badgeColor"];
  }
> = {
  admin: { label: "Admin", icon: ShieldCheck, badge: "Admin", badgeColor: "amber" },
  dashboard: { label: "Visão Geral", icon: LayoutDashboard },
  usuarios: { label: "Gestão de Usuários", icon: Users },
  users: { label: "Gestão de Usuários", icon: Users },
  aprovacoes: { label: "Solicitações Acadêmicas", icon: GraduationCap },
  approvals: { label: "Solicitações Acadêmicas", icon: GraduationCap },
  itens: { label: "Controle de Itens & QR", icon: PackageSearch },
  items: { label: "Controle de Itens & QR", icon: PackageSearch },
  feedbacks: { label: "Feedbacks da Comunidade", icon: MessageSquare },
  feedback: { label: "Feedback", icon: MessageSquare },
  bugs: { label: "Relatos de Bugs", icon: Bug, badge: "TI", badgeColor: "red" },
  "relatar-bug": { label: "Relatar Bug", icon: Bug, badge: "TI", badgeColor: "red" },
  documentos: { label: "Termos & Documentos", icon: FileText },
  documents: { label: "Termos & Documentos", icon: FileText },
  monitoramento: { label: "Monitoramento & Logs", icon: Activity },
  monitoring: { label: "Monitoramento & Logs", icon: Activity },
  configuracoes: { label: "Configurações Globais", icon: SlidersHorizontal },
  settings: { label: "Configurações", icon: Settings },
  buscar: { label: "Buscar Objetos", icon: PackageSearch },
  perdidos: { label: "Itens Perdidos", icon: PackageSearch, badge: "Perdidos", badgeColor: "red" },
  encontrados: { label: "Itens Encontrados", icon: CheckCircle2, badge: "Achados", badgeColor: "green" },
  cadastrar: { label: "Cadastrar Objeto", icon: PlusCircle },
  "meus-itens": { label: "Meus Registros", icon: Bookmark },
  "meus-registros": { label: "Meus Registros", icon: Bookmark },
  notificacoes: { label: "Notificações & Alertas", icon: Bell },
  perfil: { label: "Meu Perfil", icon: User },
  "analisador-ia": { label: "Analisador Visual IA", icon: Sparkles, badge: "Gemini", badgeColor: "purple" },
  ia: { label: "Inteligência Artificial", icon: Sparkles, badge: "Gemini", badgeColor: "purple" },
  suporte: { label: "Central de Suporte", icon: LifeBuoy },
  privacidade: { label: "Política de Privacidade", icon: Shield },
  termos: { label: "Termos de Uso", icon: FileCheck },
  versoes: { label: "Histórico de Versões", icon: GitBranch },
  "historico-de-versoes": { label: "Histórico de Versões", icon: GitBranch },
  changelog: { label: "Changelog", icon: GitBranch },
  servidor: { label: "Painel do Servidor", icon: Building2 },
  "painel-servidor": { label: "Painel do Servidor", icon: Building2 },
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
  const { currentUser } = useApp();
  const { pathname, searchParams, routeKey, navigate } = useRouter();

  const breadcrumbItems = useMemo(() => {
    if (pathname === "/" || pathname === "" || routeKey === "home") {
      return [];
    }

    const segments = pathname.split("/").filter(Boolean);
    const trail: BreadcrumbSegment[] = [
      {
        label: "Início",
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

      let itemLabel = config?.label || formatSegmentTitle(seg);
      let itemIcon = config?.icon;
      let itemBadge = config?.badge;
      let itemBadgeColor = config?.badgeColor;

      if ((lowerSeg === "admin" || lowerSeg === "servidor") && currentUser?.role === "SERVIDOR") {
        itemLabel = "Painel do Servidor";
        itemIcon = Building2;
        itemBadge = "Servidor";
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
          label: "Itens Perdidos",
          path: "/perdidos",
          icon: PackageSearch,
          badge: "Perdidos",
          badgeColor: "red",
          isCurrent: true,
        });
      } else if (searchParams.tipo === "encontrado") {
        trail.push({
          label: "Itens Encontrados",
          path: "/encontrados",
          icon: CheckCircle2,
          badge: "Achados",
          badgeColor: "green",
          isCurrent: true,
        });
      }
    } else if (pathname.startsWith("/cadastrar") && (searchParams.tipo || searchParams.type)) {
      const t = (searchParams.tipo || searchParams.type || "").toLowerCase();
      if (t === "perdido") {
        trail.push({
          label: "Item Perdido",
          path: "/cadastrar?tipo=perdido",
          icon: PlusCircle,
          badge: "Perdido",
          badgeColor: "red",
          isCurrent: true,
        });
      } else if (t === "encontrado") {
        trail.push({
          label: "Item Encontrado",
          path: "/cadastrar?tipo=encontrado",
          icon: PlusCircle,
          badge: "Encontrado",
          badgeColor: "green",
          isCurrent: true,
        });
      }
    }

    return trail;
  }, [pathname, searchParams, routeKey, currentUser?.role]);

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
      aria-label="Navegação estrutural e trilha de localização (Breadcrumbs)"
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
        aria-label="Voltar para a seção anterior"
        title={`Voltar para ${previousItem?.label || "Início"}`}
        className="min-h-[36px] inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-[#172B2A] dark:hover:text-white transition-colors shrink-0 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Voltar</span>
      </button>
    </nav>
  );
};
