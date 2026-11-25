import React from "react";
import { TERMS_OF_USE_DATA } from "../data/legalDocumentsData";
import { LegalDocumentLayout } from "./legal/LegalDocumentLayout";
import { useApp } from "../context/AppContext";
import { localize } from "../lib/i18n";

export const TermsOfUseView: React.FC = () => {
  const { language } = useApp();
  return (
    <LegalDocumentLayout
      data={TERMS_OF_USE_DATA}
      otherDocumentPath="/politica-de-privacidade"
      otherDocumentLabel={localize(language, "Política de Privacidade", "Privacy Policy")}
      otherDocumentTab="privacy_policy"
    />
  );
};

export default TermsOfUseView;
