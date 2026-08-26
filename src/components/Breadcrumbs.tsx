import React, { useMemo } from "react";
import { useRouter, Link } from "../context/RouterContext";
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
  AlertCircle,
  ArrowLeft,
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

// Dictionary mapping known path segments to human-friendly PT-BR labels, icons and badges
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
};

/**
 * Format any raw string segment into capitalized title if not found in dictionary
 */
function formatSegmentTitle(segment: string): string {
  const decoded = decodeURIComponent(segment).replace(/[-_]/g, " ");
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

export const Breadcrumbs: React.FC = () => {
  const { pathname, searchParams, routeKey, navigate } = useRouter();

  // Decompose the current pathname and build breadcrumb path trail
  const breadcrumbItems = useMemo(() => {
    // Return empty for root home page to keep the hero layout distraction-free
    if (pathname === "/" || pathname === "" || routeKey === "home") {
      return [];
    }

    const segments = pathname.split("/").filter(Boolean);
    const trail: BreadcrumbSegment[] = [
      {
        label: "Home",
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

      const itemLabel = config?.label || formatSegmentTitle(seg);
      const itemIcon = config?.icon;
      const itemBadge = config?.badge;
      const itemBadgeColor = config?.badgeColor;

      trail.push({
        label: itemLabel,
        path: currentAccumulatedPath,
        icon: itemIcon,
        badge: itemBadge,
        badgeColor: itemBadgeColor,
        isCurrent: isLast && !searchParams.tipo,
      });
    });

    // Support contextual search filter leaves (e.g. /buscar?tipo=perdido)
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
  }, [pathname, searchParams, routeKey]);

  if (breadcrumbItems.length <= 1) {
    return null;
  }

  // Calculate the immediate parent path for the quick back button
  const previousItem = breadcrumbItems[breadcrumbItems.length - 2];
  const backPath = previousItem ? previousItem.path : "/";

  const handleBack = () => {
    vibrateClick();
    navigate(backPath);
  };

  return (
    <nav
      aria-label="Navegação estrutural e trilha de localização (Breadcrumbs)"
      className="mb-4 flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400 bg-white/80 dark:bg-[#1A1A1A]/80 backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-xs"
    >
      {/* Breadcrumb List */}
      <ol className="flex items-center flex-wrap gap-1.5 min-w-0" role="list">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1 || item.isCurrent;
          const Icon = item.icon;

          return (
            <li key={`${item.path}-${index}`} className="flex items-center gap-1.5 shrink-0">
              {index > 0 && (
                <ChevronRight
                  className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-600 shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                <span
                  aria-current="page"
                  className="flex items-center gap-1.5 font-bold text-neutral-900 dark:text-white truncate max-w-[200px] sm:max-w-xs"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-[#00843D] dark:text-green-400 shrink-0" />}
                  <span className="truncate">{item.label}</span>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                        item.badgeColor === "red"
                          ? "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300"
                          : item.badgeColor === "green"
                          ? "bg-green-100 dark:bg-green-950/80 text-[#00843D] dark:text-green-400"
                          : item.badgeColor === "amber"
                          ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300"
                          : item.badgeColor === "purple"
                          ? "bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300"
                          : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="flex items-center gap-1.5 hover:text-[#00843D] dark:hover:text-green-400 transition-colors font-medium hover:underline underline-offset-2"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* Quick Context Back Button */}
      <button
        onClick={handleBack}
        aria-label="Voltar para a seção anterior"
        title={`Voltar para ${previousItem?.label || "Início"}`}
        className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer"
      >
        <ArrowLeft className="w-3 h-3" />
        <span>Voltar</span>
      </button>
    </nav>
  );
};
