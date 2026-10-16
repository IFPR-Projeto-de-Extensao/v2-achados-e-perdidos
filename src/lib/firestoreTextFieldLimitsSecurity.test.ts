import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ITEM_FIELD_LIMITS } from "./constants";

describe("SEC-04: Endurecimento das Regras do Firestore (Limites de Tamanho de Campos de Texto)", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  describe("1. Inspeção Estática do Arquivo firestore.rules", () => {
    it("deve declarar a função helper isValidItemTextFields", () => {
      expect(rulesContent).toContain("function isValidItemTextFields(data)");
    });

    it("deve validar o limite de title (string, max 100 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.title is string && data\.title\.size\(\) <= 100/);
    });

    it("deve validar o limite de description (string, max 1000 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.description is string && data\.description\.size\(\) <= 1000/);
    });

    it("deve validar o limite de location (string, max 120 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.location is string && data\.location\.size\(\) <= 120/);
    });

    it("deve validar o limite de color (null-safe, string, max 50 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.color == null \|\| \(data\.color is string && data\.color\.size\(\) <= 50\)/);
    });

    it("deve validar o limite de brand (null-safe, string, max 60 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.brand == null \|\| \(data\.brand is string && data\.brand\.size\(\) <= 60\)/);
    });

    it("deve validar o limite de contactInfo (null-safe, string, max 150 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.contactInfo == null \|\| \(data\.contactInfo is string && data\.contactInfo\.size\(\) <= 150\)/);
    });

    it("deve validar o limite do campo legado contact (null-safe, string, max 150 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.contact == null \|\| \(data\.contact is string && data\.contact\.size\(\) <= 150\)/);
    });

    it("deve validar o limite de aiPrompt (null-safe, string, max 500 caracteres)", () => {
      expect(rulesContent).toMatch(/data\.aiPrompt == null \|\| \(data\.aiPrompt is string && data\.aiPrompt\.size\(\) <= 500\)/);
    });

    it("deve aplicar isValidItemTextFields(incoming()) na regra de criação de /items/{itemId}", () => {
      const itemsMatch = rulesContent.match(/match \/items\/\{itemId\}[\s\S]*?allow create: if[\s\S]*?;/);
      expect(itemsMatch).not.toBeNull();
      expect(itemsMatch![0]).toContain("isValidItemTextFields(incoming())");
    });

    it("deve aplicar isValidItemTextFields(incoming()) na regra de atualização de /items/{itemId}", () => {
      const itemsMatch = rulesContent.match(/match \/items\/\{itemId\}[\s\S]*?allow update: if[\s\S]*?;/);
      expect(itemsMatch).not.toBeNull();
      expect(itemsMatch![0]).toContain("isValidItemTextFields(incoming())");
    });

    it("deve aplicar isValidItemTextFields nas coleções espelhadas found_items e lost_items", () => {
      const foundMatch = rulesContent.match(/match \/found_items\/\{itemId\}[\s\S]*?allow create: if[\s\S]*?;/);
      const lostMatch = rulesContent.match(/match \/lost_items\/\{itemId\}[\s\S]*?allow create: if[\s\S]*?;/);
      expect(foundMatch![0]).toContain("isValidItemTextFields(incoming())");
      expect(lostMatch![0]).toContain("isValidItemTextFields(incoming())");
    });
  });

  describe("2. Avaliador Simulado de Regras do Firestore (isValidItemTextFields)", () => {
    // Avaliador com semântica estrita das regras do Firestore CEL
    function evaluateIsValidItemTextFields(data: Record<string, any>): boolean {
      const checkTitle = !("title" in data) || (typeof data.title === "string" && data.title.length <= 100);
      const checkDescription = !("description" in data) || (typeof data.description === "string" && data.description.length <= 1000);
      const checkLocation = !("location" in data) || (typeof data.location === "string" && data.location.length <= 120);
      const checkColor = !("color" in data) || data.color === null || (typeof data.color === "string" && data.color.length <= 50);
      const checkBrand = !("brand" in data) || data.brand === null || (typeof data.brand === "string" && data.brand.length <= 60);
      const checkContactInfo = !("contactInfo" in data) || data.contactInfo === null || (typeof data.contactInfo === "string" && data.contactInfo.length <= 150);
      const checkContact = !("contact" in data) || data.contact === null || (typeof data.contact === "string" && data.contact.length <= 150);
      const checkAiPrompt = !("aiPrompt" in data) || data.aiPrompt === null || (typeof data.aiPrompt === "string" && data.aiPrompt.length <= 500);

      return (
        checkTitle &&
        checkDescription &&
        checkLocation &&
        checkColor &&
        checkBrand &&
        checkContactInfo &&
        checkContact &&
        checkAiPrompt
      );
    }

    const baseItem = {
      title: "Caderno Universitário 10 Matérias IFPR",
      description: "Caderno com capa dura azul encontrado no auditório.",
      location: "Auditório Central do Campus",
      color: "Azul escuro",
      brand: "Tilibra",
      contactInfo: "Secretaria Acadêmica",
    };

    it("deve aceitar payload válido com todos os campos dentro dos limites", () => {
      expect(evaluateIsValidItemTextFields(baseItem)).toBe(true);
    });

    describe("Title (limite: 100 caracteres)", () => {
      it("deve aceitar título no limite exato de 100 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, title: "A".repeat(100) })).toBe(true);
      });

      it("deve rejeitar título que ultrapassa 100 caracteres (101 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, title: "A".repeat(101) })).toBe(false);
      });

      it("deve rejeitar título do tipo número", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, title: 12345 })).toBe(false);
      });

      it("deve rejeitar título do tipo objeto ou array", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, title: { text: "malicioso" } })).toBe(false);
        expect(evaluateIsValidItemTextFields({ ...baseItem, title: ["malicioso"] })).toBe(false);
      });
    });

    describe("Description (limite: 1000 caracteres)", () => {
      it("deve aceitar descrição no limite exato de 1000 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, description: "B".repeat(1000) })).toBe(true);
      });

      it("deve rejeitar descrição que ultrapassa 1000 caracteres (1001 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, description: "B".repeat(1001) })).toBe(false);
      });

      it("deve rejeitar tentativa de esgotamento de armazenamento com texto gigante de 50.000 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, description: "X".repeat(50000) })).toBe(false);
      });

      it("deve rejeitar descrição do tipo booleano", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, description: true })).toBe(false);
      });
    });

    describe("Location (limite: 120 caracteres)", () => {
      it("deve aceitar local no limite exato de 120 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, location: "C".repeat(120) })).toBe(true);
      });

      it("deve rejeitar local que ultrapassa 120 caracteres (121 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, location: "C".repeat(121) })).toBe(false);
      });

      it("deve rejeitar local com tipo inválido", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, location: 999 })).toBe(false);
      });
    });

    describe("Color (limite: 50 caracteres)", () => {
      it("deve aceitar ausência de color (campo opcional)", () => {
        const { color, ...withoutColor } = baseItem;
        expect(evaluateIsValidItemTextFields(withoutColor)).toBe(true);
      });

      it("deve aceitar color como null", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, color: null })).toBe(true);
      });

      it("deve aceitar color com 50 caracteres exatos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, color: "D".repeat(50) })).toBe(true);
      });

      it("deve rejeitar color acima de 50 caracteres (51 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, color: "D".repeat(51) })).toBe(false);
      });

      it("deve rejeitar color com tipo inválido (ex: objeto)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, color: { rgb: "0,0,0" } })).toBe(false);
      });
    });

    describe("Brand (limite: 60 caracteres)", () => {
      it("deve aceitar ausência de brand (campo opcional)", () => {
        const { brand, ...withoutBrand } = baseItem;
        expect(evaluateIsValidItemTextFields(withoutBrand)).toBe(true);
      });

      it("deve aceitar brand como null", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, brand: null })).toBe(true);
      });

      it("deve aceitar brand com 60 caracteres exatos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, brand: "E".repeat(60) })).toBe(true);
      });

      it("deve rejeitar brand acima de 60 caracteres (61 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, brand: "E".repeat(61) })).toBe(false);
      });

      it("deve rejeitar brand com tipo inválido", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, brand: 123 })).toBe(false);
      });
    });

    describe("ContactInfo e Contact legado (limite: 150 caracteres)", () => {
      it("deve aceitar contactInfo com 150 caracteres exatos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, contactInfo: "F".repeat(150) })).toBe(true);
      });

      it("deve rejeitar contactInfo acima de 150 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, contactInfo: "F".repeat(151) })).toBe(false);
      });

      it("deve aceitar contact legado com 150 caracteres exatos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, contact: "G".repeat(150) })).toBe(true);
      });

      it("deve rejeitar contact legado acima de 150 caracteres", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, contact: "G".repeat(151) })).toBe(false);
      });

      it("deve aceitar contactInfo e contact nulos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, contactInfo: null, contact: null })).toBe(true);
      });
    });

    describe("aiPrompt (limite: 500 caracteres)", () => {
      it("deve aceitar payload sem aiPrompt (campo opcional/transiente)", () => {
        expect(evaluateIsValidItemTextFields(baseItem)).toBe(true);
      });

      it("deve aceitar aiPrompt com 500 caracteres exatos", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, aiPrompt: "H".repeat(500) })).toBe(true);
      });

      it("deve rejeitar aiPrompt acima de 500 caracteres (501 caracteres)", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, aiPrompt: "H".repeat(501) })).toBe(false);
      });

      it("deve aceitar aiPrompt como null", () => {
        expect(evaluateIsValidItemTextFields({ ...baseItem, aiPrompt: null })).toBe(true);
      });
    });

    describe("Compatibilidade com Sincronização Offline e Atualizações Parciais", () => {
      it("deve permitir atualização legítima de status sem alterar campos de texto", () => {
        const postUpdateState = {
          ...baseItem,
          status: "DEVOLVIDO",
          resolutionDate: new Date().toISOString(),
        };
        expect(evaluateIsValidItemTextFields(postUpdateState)).toBe(true);
      });

      it("deve bloquear tentativa de contornar limites durante atualização de dados", () => {
        const tamperedUpdateState = {
          ...baseItem,
          title: "Novo Título Fraudulento ".repeat(15), // > 100 caracteres
        };
        expect(evaluateIsValidItemTextFields(tamperedUpdateState)).toBe(false);
      });

      it("deve ser 100% alinhado com as constantes ITEM_FIELD_LIMITS da aplicação", () => {
        expect(ITEM_FIELD_LIMITS.TITLE).toBe(100);
        expect(ITEM_FIELD_LIMITS.DESCRIPTION).toBe(1000);
        expect(ITEM_FIELD_LIMITS.LOCATION).toBe(120);
        expect(ITEM_FIELD_LIMITS.COLOR).toBe(50);
        expect(ITEM_FIELD_LIMITS.BRAND).toBe(60);
        expect(ITEM_FIELD_LIMITS.CONTACT_INFO).toBe(150);
        expect(ITEM_FIELD_LIMITS.AI_PROMPT).toBe(500);
      });
    });
  });
});
