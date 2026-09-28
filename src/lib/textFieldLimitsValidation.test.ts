import { describe, it, expect } from "vitest";
import {
  ITEM_FIELD_LIMITS,
  validateItemTextFields,
  ItemTextFieldsToValidate,
} from "./utils";

describe("Auditoria e Validação de Limites de Campos de Texto (Localiza+ IFPR)", () => {
  const validBaseItem: ItemTextFieldsToValidate = {
    title: "Calculadora Científica Casio FX-82MS",
    description: "Calculadora cinza escuro com tampa protetora, encontrada sobre a bancada 3.",
    location: "Laboratório de Informática 2",
    color: "Cinza escuro",
    brand: "Casio",
    contactInfo: "Guarita Principal | (43) 99876-5432",
  };

  describe("1. Constantes e Definições de Limites", () => {
    it("deve conter os limites corretos e diferenciados conforme finalidade", () => {
      expect(ITEM_FIELD_LIMITS.TITLE).toBe(100);
      expect(ITEM_FIELD_LIMITS.DESCRIPTION).toBe(1000);
      expect(ITEM_FIELD_LIMITS.LOCATION).toBe(120);
      expect(ITEM_FIELD_LIMITS.COLOR).toBe(50);
      expect(ITEM_FIELD_LIMITS.BRAND).toBe(60);
      expect(ITEM_FIELD_LIMITS.CONTACT_INFO).toBe(150);
      expect(ITEM_FIELD_LIMITS.AI_PROMPT).toBe(500);
    });
  });

  describe("2. Título do Item (TITLE - Limite de 100 caracteres)", () => {
    it("deve aceitar título dentro do limite (< 100 caracteres)", () => {
      const result = validateItemTextFields({
        ...validBaseItem,
        title: "Garrafa Térmica Kouda Verde 750ml", // 33 caracteres
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("deve aceitar título exatamente no limite (100 caracteres)", () => {
      const exact100 = "A".repeat(100);
      expect(exact100.length).toBe(100);

      const result = validateItemTextFields({
        ...validBaseItem,
        title: exact100,
      });
      expect(result.isValid).toBe(true);
    });

    it("deve rejeitar título acima do limite (101 caracteres)", () => {
      const overLimit = "A".repeat(101);
      const result = validateItemTextFields({
        ...validBaseItem,
        title: overLimit,
      });
      expect(result.isValid).toBe(false);
      expect(result.field).toBe("title");
      expect(result.error).toContain("O título do objeto não pode ultrapassar 100 caracteres");
      expect(result.currentLength).toBe(101);
      expect(result.maxLength).toBe(100);
    });

    it("deve rejeitar título com parágrafo excessivamente longo (ex: 500 caracteres colados)", () => {
      const spamTitle = "Bolsa preta com zíper ".repeat(25); // > 500 caracteres
      const result = validateItemTextFields({
        ...validBaseItem,
        title: spamTitle,
      });
      expect(result.isValid).toBe(false);
      expect(result.field).toBe("title");
      expect(result.error).toContain("O título do objeto não pode ultrapassar 100 caracteres");
    });

    it("deve rejeitar título vazio ou contendo apenas espaços no cadastro", () => {
      const resultEmpty = validateItemTextFields({ ...validBaseItem, title: "" }, false);
      expect(resultEmpty.isValid).toBe(false);
      expect(resultEmpty.error).toBe("O título do objeto é obrigatório.");

      const resultSpaces = validateItemTextFields({ ...validBaseItem, title: "    " }, false);
      expect(resultSpaces.isValid).toBe(false);
      expect(resultSpaces.error).toBe("O título do objeto é obrigatório.");
    });
  });

  describe("3. Descrição do Item (DESCRIPTION - Limite de 1000 caracteres)", () => {
    it("deve aceitar descrição detalhada dentro do limite", () => {
      const normalDesc = "Item em bom estado com adesivo do IFPR no verso.";
      const result = validateItemTextFields({
        ...validBaseItem,
        description: normalDesc,
      });
      expect(result.isValid).toBe(true);
    });

    it("deve aceitar descrição exatamente no limite de 1000 caracteres", () => {
      const exact1000 = "D".repeat(1000);
      expect(exact1000.length).toBe(1000);

      const result = validateItemTextFields({
        ...validBaseItem,
        description: exact1000,
      });
      expect(result.isValid).toBe(true);
    });

    it("deve rejeitar descrição acima do limite (1001 caracteres)", () => {
      const over1000 = "D".repeat(1001);
      const result = validateItemTextFields({
        ...validBaseItem,
        description: over1000,
      });
      expect(result.isValid).toBe(false);
      expect(result.field).toBe("description");
      expect(result.error).toContain("A descrição do objeto não pode ultrapassar 1000 caracteres");
      expect(result.currentLength).toBe(1001);
      expect(result.maxLength).toBe(1000);
    });
  });

  describe("4. Localização (LOCATION - Limite de 120 caracteres)", () => {
    it("deve aceitar local dentro do limite de 120 caracteres", () => {
      const result = validateItemTextFields({
        ...validBaseItem,
        location: "Laboratório de Eletrotécnica / Automação - Sala 12, Bancada 3",
      });
      expect(result.isValid).toBe(true);
    });

    it("deve aceitar local exatamente com 120 caracteres", () => {
      const exact120 = "L".repeat(120);
      const result = validateItemTextFields({
        ...validBaseItem,
        location: exact120,
      });
      expect(result.isValid).toBe(true);
    });

    it("deve rejeitar local acima de 120 caracteres", () => {
      const over120 = "L".repeat(121);
      const result = validateItemTextFields({
        ...validBaseItem,
        location: over120,
      });
      expect(result.isValid).toBe(false);
      expect(result.field).toBe("location");
      expect(result.error).toContain("O local do objeto não pode ultrapassar 120 caracteres");
    });
  });

  describe("5. Cor e Marca (COLOR: 50, BRAND: 60 caracteres)", () => {
    it("deve aceitar cor dentro do limite e rejeitar acima de 50 caracteres", () => {
      const validColor = validateItemTextFields({
        ...validBaseItem,
        color: "Azul marinho com detalhes em dourado e preto", // 44 caracteres
      });
      expect(validColor.isValid).toBe(true);

      const invalidColor = validateItemTextFields({
        ...validBaseItem,
        color: "C".repeat(51),
      });
      expect(invalidColor.isValid).toBe(false);
      expect(invalidColor.field).toBe("color");
      expect(invalidColor.error).toContain("A cor do objeto não pode ultrapassar 50 caracteres");
    });

    it("deve aceitar marca dentro do limite e rejeitar acima de 60 caracteres", () => {
      const validBrand = validateItemTextFields({
        ...validBaseItem,
        brand: "Samsung Galaxy Book Pro 360",
      });
      expect(validBrand.isValid).toBe(true);

      const invalidBrand = validateItemTextFields({
        ...validBaseItem,
        brand: "B".repeat(61),
      });
      expect(invalidBrand.isValid).toBe(false);
      expect(invalidBrand.field).toBe("brand");
      expect(invalidBrand.error).toContain("A marca do objeto não pode ultrapassar 60 caracteres");
    });
  });

  describe("6. Contato e Instruções (CONTACT_INFO - Limite de 150 caracteres)", () => {
    it("deve aceitar contato dentro de 150 caracteres e rejeitar acima", () => {
      const validContact = validateItemTextFields({
        ...validBaseItem,
        contactInfo: "Guarita da Portaria Principal | Falar com servidor de plantão | WhatsApp: (43) 99876-5432",
      });
      expect(validContact.isValid).toBe(true);

      const invalidContact = validateItemTextFields({
        ...validBaseItem,
        contactInfo: "X".repeat(151),
      });
      expect(invalidContact.isValid).toBe(false);
      expect(invalidContact.field).toBe("contactInfo");
      expect(invalidContact.error).toContain("As informações de contato não podem ultrapassar 150 caracteres");
    });
  });

  describe("7. Edição de Item (Validação Parcial e Integridade)", () => {
    it("deve validar apenas os campos enviados durante uma edição parcial", () => {
      // Edição apenas do título para um valor válido
      const validEdit = validateItemTextFields({ title: "Novo Título Válido" }, true);
      expect(validEdit.isValid).toBe(true);

      // Edição do título para um valor acima do limite
      const invalidTitleEdit = validateItemTextFields({ title: "T".repeat(101) }, true);
      expect(invalidTitleEdit.isValid).toBe(false);
      expect(invalidTitleEdit.field).toBe("title");

      // Edição apenas da descrição para um valor acima do limite
      const invalidDescEdit = validateItemTextFields({ description: "D".repeat(1001) }, true);
      expect(invalidDescEdit.isValid).toBe(false);
      expect(invalidDescEdit.field).toBe("description");
    });

    it("tentativa de contornar a interface com payload manual/DevTools deve ser bloqueada na validação", () => {
      // Mesmo se o atributo HTML maxLength for removido via DevTools no navegador,
      // o objeto submetido ao processador será barrado
      const hackedPayload: ItemTextFieldsToValidate = {
        title: "Injeção de título gigante que ignora o atributo maxLength no DOM do navegador ".repeat(10),
        description: "Descrição normal",
        location: "Biblioteca",
      };

      const result = validateItemTextFields(hackedPayload, false);
      expect(result.isValid).toBe(false);
      expect(result.field).toBe("title");
      expect(result.error).toContain("100 caracteres");
    });
  });

  describe("8. Preservação de Dados Existentes", () => {
    it("dados existentes bem comportados dentro dos limites continuam 100% válidos", () => {
      const sampleExistingItems: ItemTextFieldsToValidate[] = [
        {
          title: "Chaves com Chaveiro IFPR",
          description: "Argola com 2 chaves tipo Yale e fita verde do IFPR.",
          location: "Bloco Didático - Salas 01 a 12",
          color: "Prata",
          brand: "Papaiz",
          contactInfo: "Secretaria Acadêmica",
        },
        {
          title: "Garrafa Térmica Preta 500ml",
          description: "Garrafa de inox com tampa rosqueável e alguns arranhões na base.",
          location: "Refeitório / Cantina Estudantil",
          color: "Preta",
          brand: "Kouda",
          contactInfo: "Guarita",
        },
      ];

      for (const item of sampleExistingItems) {
        const result = validateItemTextFields(item, false);
        expect(result.isValid).toBe(true);
      }
    });
  });
});
