import React from "react";
import { PRIVACY_POLICY_DATA } from "../data/legalDocumentsData";
import { LegalDocumentLayout } from "./legal/LegalDocumentLayout";
import { useApp } from "../context/AppContext";
import { localize } from "../lib/i18n";

export const PrivacyPolicyView: React.FC = () => {
  const { language } = useApp();
  return (
    <LegalDocumentLayout
      data={PRIVACY_POLICY_DATA}
      otherDocumentPath="/termos-de-uso"
      otherDocumentLabel={localize(language, "Termos de Uso", "Terms of Use")}
      otherDocumentTab="terms_of_use"
    />
  );
};

export default PrivacyPolicyView;
