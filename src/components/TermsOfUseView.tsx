import React from "react";
import { TERMS_OF_USE_DATA } from "../data/legalDocumentsData";
import { LegalDocumentLayout } from "./legal/LegalDocumentLayout";

export const TermsOfUseView: React.FC = () => {
  return (
    <LegalDocumentLayout
      data={TERMS_OF_USE_DATA}
      otherDocumentPath="/politica-de-privacidade"
      otherDocumentLabel="Política de Privacidade"
      otherDocumentTab="privacy_policy"
    />
  );
};

export default TermsOfUseView;
