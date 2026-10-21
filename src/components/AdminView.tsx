import React from "react";
import { withAdminProtection } from "../hooks/useAdminGuard";
import { DashboardView } from "./DashboardView";
import { AccountManagementView } from "./AccountManagementView";
import { useRouter } from "../context/RouterContext";
import { ShieldCheck } from "lucide-react";

export { AccountManagementView };

const RawAdminView: React.FC = () => {
  return (
    <div className="animate-in fade-in duration-300">
      <DashboardView />
    </div>
  );
};

/**
 * AdminView wrapped with the 'withAdminProtection' Higher-Order Component.
 * Enforces role: 'ADMIN' authorization check from AppContext, redirecting unauthorized users to '/'.
 */
export const AdminView = withAdminProtection(RawAdminView);
export const ProtectedAdminView = AdminView;
export default AdminView;
