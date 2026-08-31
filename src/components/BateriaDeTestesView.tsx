import React from "react";
import { TestBatteryManagerView } from "./TestBatteryManagerView";

interface BateriaDeTestesViewProps {
  darkMode?: boolean;
}

/**
 * BateriaDeTestesView - Componente Oficial do Módulo de Bateria de Testes do Localiza+
 * IFPR Campus Ivaiporã.
 *
 * Responsável por gerenciar as 12 categorias operacionais, matriz de testes institucionais,
 * cálculo em tempo real de duração de execução, geração e exportação de PDF institucional via jsPDF,
 * e trilha de auditoria imutável com registro de ID de transação e objeto.
 */
export const BateriaDeTestesView: React.FC<BateriaDeTestesViewProps> = ({ darkMode }) => {
  return <TestBatteryManagerView darkMode={darkMode} />;
};

export default BateriaDeTestesView;
