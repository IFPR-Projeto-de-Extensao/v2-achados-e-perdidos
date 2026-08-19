import React from "react";
import { PRIVACY_POLICY_DATA } from "../data/legalDocumentsData";
import { LegalDocumentLayout } from "./legal/LegalDocumentLayout";

export const PrivacyPolicyView: React.FC = () => {
  return (
    <LegalDocumentLayout
      data={PRIVACY_POLICY_DATA}
      otherDocumentPath="/termos-de-uso"
      otherDocumentLabel="Termos de Uso"
      otherDocumentTab="terms_of_use"
    />
  );
};
