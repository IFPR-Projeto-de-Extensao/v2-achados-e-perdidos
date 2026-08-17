import React from "react";
import { DocumentsAdminModule } from "./documents/DocumentsAdminModule";

/**
 * Componente principal DocumentManagerView para o painel administrativo.
 * Permite listar, criar, editar (usando tags dinâmicas como {{nome}}) e excluir modelos
 * de documentos armazenados no Firestore, com preenchimento dinâmico e geração de PDF.
 */
export const DocumentManagerView: React.FC = () => {
  return (
    <div id="document-manager-view-container" className="w-full">
      <DocumentsAdminModule />
    </div>
  );
};

export default DocumentManagerView;
