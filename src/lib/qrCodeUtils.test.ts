import { describe, it, expect } from "vitest";
import { getItemPublicUrl, parseQrCodeOrUrl, findItemInList } from "./qrCodeUtils";
import { LostFoundItem } from "../types";

describe("qrCodeUtils", () => {
  const mockItemFound: LostFoundItem = {
    id: "ifpr-item-101",
    title: "Garrafa Térmica Stanley Azul",
    category: "Garrafas & Marmitas",
    type: "ENCONTRADO",
    status: "ENCONTRADO",
    description: "Garrafa azul encontrada no refeitório",
    color: "Azul",
    brand: "Stanley",
    location: "Refeitório",
    date: "2026-08-20T10:00:00Z",
    imageUrl: "https://example.com/img.jpg",
    contactInfo: "Guarita",
    registeredByUserId: "u1",
    registeredByName: "Admin",
    registeredByRole: "ADMIN",
    qrCodeId: "QR-IFPR-101-GARRAFA",
    createdAt: "2026-08-20T10:00:00Z",
  };

  const mockItemLost: LostFoundItem = {
    id: "ifpr-item-202",
    title: "Chave do Carro Fiat",
    category: "Chaves",
    type: "PERDIDO",
    status: "PERDIDO",
    description: "Chave com chaveiro do IFPR perdida perto do ginásio",
    color: "Preto",
    brand: "Fiat",
    location: "Ginásio",
    date: "2026-08-21T14:30:00Z",
    imageUrl: "https://example.com/key.jpg",
    contactInfo: "SEBAC",
    registeredByUserId: "u2",
    registeredByName: "Aluno",
    registeredByRole: "ALUNO",
    qrCodeId: "QR-IFPR-202-CHAVE",
    createdAt: "2026-08-21T14:30:00Z",
  };

  describe("getItemPublicUrl", () => {
    it("should generate a valid absolute URL for found item with itemId and qrCodeId", () => {
      const url = getItemPublicUrl(mockItemFound);
      expect(url).toContain("itemId=ifpr-item-101");
      expect(url).toContain("tab=found");
      expect(url).toContain("qr=QR-IFPR-101-GARRAFA");
    });

    it("should generate a valid absolute URL for lost item with tab=lost", () => {
      const url = getItemPublicUrl(mockItemLost);
      expect(url).toContain("itemId=ifpr-item-202");
      expect(url).toContain("tab=lost");
      expect(url).toContain("qr=QR-IFPR-202-CHAVE");
    });

    it("should return empty string for null or invalid item", () => {
      expect(getItemPublicUrl(null as any)).toBe("");
      expect(getItemPublicUrl({ id: "" })).toBe("");
    });
  });

  describe("parseQrCodeOrUrl", () => {
    it("should parse deep-link URL with itemId and tab", () => {
      const url = "https://localizamais.ifpr.edu.br/?tab=found&itemId=ifpr-item-101&qr=QR-IFPR-101-GARRAFA";
      const result = parseQrCodeOrUrl(url);
      expect(result.itemId).toBe("ifpr-item-101");
      expect(result.qrCodeId).toBe("QR-IFPR-101-GARRAFA");
      expect(result.tab).toBe("found");
    });

    it("should parse URL with ?item= parameter", () => {
      const url = "http://localhost:3000/?item=ifpr-item-101";
      const result = parseQrCodeOrUrl(url);
      expect(result.itemId).toBe("ifpr-item-101");
    });

    it("should parse path-based route /item/:id", () => {
      const url = "https://localizamais.ifpr.edu.br/item/ifpr-item-101";
      const result = parseQrCodeOrUrl(url);
      expect(result.itemId).toBe("ifpr-item-101");
    });

    it("should parse path-based route /achados/:id", () => {
      const url = "https://localizamais.ifpr.edu.br/achados/ifpr-item-202";
      const result = parseQrCodeOrUrl(url);
      expect(result.itemId).toBe("ifpr-item-202");
    });

    it("should recognize raw QR code ID (e.g. QR-IFPR-101-GARRAFA)", () => {
      const raw = "QR-IFPR-101-GARRAFA";
      const result = parseQrCodeOrUrl(raw);
      expect(result.qrCodeId).toBe("QR-IFPR-101-GARRAFA");
    });

    it("should handle empty or whitespace input safely", () => {
      const result = parseQrCodeOrUrl("   ");
      expect(result.itemId).toBeNull();
      expect(result.qrCodeId).toBeNull();
    });
  });

  describe("findItemInList", () => {
    const items = [mockItemFound, mockItemLost];

    it("should find item by exact ID", () => {
      const found = findItemInList("ifpr-item-101", items);
      expect(found).toBe(mockItemFound);
    });

    it("should find item by full URL", () => {
      const found = findItemInList("https://localizamais.ifpr.edu.br/?itemId=ifpr-item-202", items);
      expect(found).toBe(mockItemLost);
    });

    it("should find item by QR Code Tag ID", () => {
      const found = findItemInList("QR-IFPR-101-GARRAFA", items);
      expect(found).toBe(mockItemFound);
    });

    it("should find item by case-insensitive partial match", () => {
      const found = findItemInList("Stanley", items);
      expect(found).toBe(mockItemFound);
    });

    it("should return null if item does not exist", () => {
      const found = findItemInList("non-existent-id-999", items);
      expect(found).toBeNull();
    });
  });
});
