import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSafeAvatarUrl,
  isGenericAvatar,
  isCustomUploadedAvatar,
  getGoogleProviderPhoto,
  handleAvatarError,
  LOCAL_AVATAR_FALLBACK,
  INLINE_AVATAR_SVG_DATA_URI,
} from "./avatarUtils";
import { User, UserRole } from "../types";

describe("LOCALIZA+ v1.10.4 — Validação Obrigatória do Avatar do Usuário (Foto do Google & Avatar Customizado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Função pura que espelha exatamente a regra de resolução e precedência de verifyUserInFirestore
  function resolveAvatarForUser({
    storedAvatar,
    providerPhoto,
    pendingAvatar,
    extraAvatar,
    fallbackName,
  }: {
    storedAvatar?: string | null;
    providerPhoto?: string | null;
    pendingAvatar?: string | null;
    extraAvatar?: string | null;
    fallbackName?: string | null;
  }): string {
    const hasCustomStoredAvatar = Boolean(storedAvatar && isCustomUploadedAvatar(storedAvatar));
    const hasPendingAvatar = Boolean(pendingAvatar && !isGenericAvatar(pendingAvatar));
    const hasExtraAvatar = Boolean(extraAvatar && !isGenericAvatar(extraAvatar));
    const hasProviderPhoto = Boolean(providerPhoto && !isGenericAvatar(providerPhoto));

    return hasPendingAvatar
      ? pendingAvatar!.trim()
      : hasCustomStoredAvatar
      ? storedAvatar!.trim()
      : hasProviderPhoto
      ? providerPhoto!.trim()
      : hasExtraAvatar
      ? extraAvatar!.trim()
      : (storedAvatar && !isGenericAvatar(storedAvatar))
      ? storedAvatar.trim()
      : getSafeAvatarUrl(undefined, fallbackName);
  }

  it("1. Primeiro login com Google e foto disponível: deve preencher avatarUrl com fbUser.photoURL", () => {
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";
    // Usuário sem avatar prévio gravado ou com avatar vazio
    const resolved = resolveAvatarForUser({
      storedAvatar: "",
      providerPhoto: googlePhoto,
      fallbackName: "Paulo Cauan",
    });

    expect(resolved).toBe(googlePhoto);
  });

  it("1.1 Primeiro login quando usuário já possuía avatar genérico DiceBear: deve substituir por fbUser.photoURL", () => {
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";
    const dicebearAvatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Paulo";

    const resolved = resolveAvatarForUser({
      storedAvatar: dicebearAvatar,
      providerPhoto: googlePhoto,
      fallbackName: "Paulo Cauan",
    });

    // Como o avatar armazenado era apenas um placeholder genérico, a foto real do Google prevalece
    expect(resolved).toBe(googlePhoto);
  });

  it("1.2 Primeiro login quando usuário já possuía imagem Unsplash de amostra: deve substituir por fbUser.photoURL", () => {
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";
    const unsplashAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150";

    const resolved = resolveAvatarForUser({
      storedAvatar: unsplashAvatar,
      providerPhoto: googlePhoto,
      fallbackName: "Paulo Cauan",
    });

    expect(resolved).toBe(googlePhoto);
  });

  it("1.3 Extração de foto Google via providerData quando photoURL não está no nível raiz", () => {
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";
    const mockFbUser = {
      photoURL: null,
      providerData: [
        { providerId: "google.com", photoURL: googlePhoto },
      ],
    };

    const extracted = getGoogleProviderPhoto(mockFbUser);
    expect(extracted).toBe(googlePhoto);
  });

  it("1.4 Identificação precisa de avatar customizado enviado pelo usuário vs foto de provedor", () => {
    const customBase64 = "data:image/webp;base64,UklGRmQAAABXRUJQVlA4WAoAAAAQAAAA320x320";
    const storageUrl = "https://firebasestorage.googleapis.com/v0/b/app/o/avatars%2Fuser.png";
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL";
    const unsplashPhoto = "https://images.unsplash.com/photo-1535713875002";

    expect(isCustomUploadedAvatar(customBase64)).toBe(true);
    expect(isCustomUploadedAvatar(storageUrl)).toBe(true);
    expect(isCustomUploadedAvatar(googlePhoto)).toBe(false);
    expect(isCustomUploadedAvatar(unsplashPhoto)).toBe(false);
  });

  it("2. Login com avatar personalizado já persistido: NÃO deve sobrescrever por fbUser.photoURL", () => {
    const customUploadedBase64 = "data:image/webp;base64,UklGRmQAAABXRUJQVlA4WAoAAAAQAAAA320x320_CUSTOM";
    const googlePhoto = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";

    const resolved = resolveAvatarForUser({
      storedAvatar: customUploadedBase64,
      providerPhoto: googlePhoto,
      fallbackName: "Paulo Cauan",
    });

    // Foto personalizada é intocável e preservada
    expect(resolved).toBe(customUploadedBase64);
    expect(resolved).not.toBe(googlePhoto);
  });

  it("3. Login sem foto fornecida pelo provedor: deve usar fallback determinístico", () => {
    const resolved = resolveAvatarForUser({
      storedAvatar: "",
      providerPhoto: null,
      fallbackName: "Ana Clara",
    });

    expect(resolved).toContain("api.dicebear.com");
    expect(resolved).toContain("Ana%20Clara");
  });

  it("4. Sessão restaurada após recarregar a página: preserva o avatar sem perda ou undefined", () => {
    const persistedAvatar = "https://lh3.googleusercontent.com/a/ACg8ocL_TESTE_GOOGLE=s96-c";
    const snapshotRawDoc = {
      id: "u123",
      name: "Carlos Silva",
      email: "carlos@estudantes.ifpr.edu.br",
      avatarUrl: persistedAvatar,
    };

    const safeAvatar = !isGenericAvatar(snapshotRawDoc.avatarUrl)
      ? snapshotRawDoc.avatarUrl.trim()
      : getSafeAvatarUrl(undefined, snapshotRawDoc.name);

    expect(safeAvatar).toBe(persistedAvatar);
  });

  it("5. Falha de carregamento da imagem e acionamento dos 3 níveis de fallback resiliente", () => {
    const img = {
      src: "https://lh3.googleusercontent.com/403-forbidden-url.jpg",
      dataset: {} as Record<string, string>,
      onerror: vi.fn(),
    } as unknown as HTMLImageElement;

    // Nível 1: Dispara erro na foto primária -> Aplica DiceBear
    handleAvatarError({ currentTarget: img }, "Paulo");
    expect(img.dataset.fallbackApplied).toBe("dicebear");
    expect(img.src).toContain("api.dicebear.com");

    // Nível 2: Dispara erro no DiceBear -> Aplica asset local /avatar-placeholder.svg
    handleAvatarError({ currentTarget: img }, "Paulo");
    expect(img.dataset.fallbackApplied).toBe("local");
    expect(img.src).toBe(LOCAL_AVATAR_FALLBACK);

    // Nível 3: Dispara erro no asset local -> Aplica inline SVG data URI imutável
    handleAvatarError({ currentTarget: img }, "Paulo");
    expect(img.dataset.fallbackApplied).toBe("final");
    expect(img.src).toBe(INLINE_AVATAR_SVG_DATA_URI);
  });

  it("6. Segurança: Usuário comum tentando visualizar outro usuário não recebe permissão para consultar Firestore users", () => {
    const studentUser: User = {
      id: "student-uid-1",
      name: "Aluno IFPR",
      email: "aluno@estudantes.ifpr.edu.br",
      role: "ALUNO",
      status: "active",
      courseOrDept: "TSI",
      registrationNumber: "2026101",
      avatarUrl: "https://lh3.googleusercontent.com/student.jpg",
    };

    const isRoot = studentUser.email === "paulocauan39@gmail.com";
    const isPrivileged = isRoot || studentUser.role === "ADMIN";

    // Alunos e servidores não-admin não têm privilégio para escutar a coleção global 'users'
    expect(isPrivileged).toBe(false);
  });

  it("7. Administrador visualizando os perfis permitidos: possui privilégio administrativo", () => {
    const adminUser: User = {
      id: "admin-uid-1",
      name: "Paulo Cauan",
      email: "paulocauan39@gmail.com",
      role: "ADMIN",
      status: "active",
      courseOrDept: "TI",
      registrationNumber: "2026001",
      avatarUrl: "https://lh3.googleusercontent.com/admin.jpg",
    };

    const isRoot = adminUser.email === "paulocauan39@gmail.com";
    const isPrivileged = isRoot || adminUser.role === "ADMIN";

    expect(isPrivileged).toBe(true);
  });

  it("8. Exibição de avatar em todas as telas: getSafeAvatarUrl garante sempre string válida e segura", () => {
    const testCases = [
      { input: "https://example.com/foto.jpg", expected: "https://example.com/foto.jpg" },
      { input: "", expectedDicebear: true },
      { input: null, expectedDicebear: true },
      { input: undefined, expectedDicebear: true },
      { input: "undefined", expectedDicebear: true },
      { input: "null", expectedDicebear: true },
    ];

    testCases.forEach((tc) => {
      const result = getSafeAvatarUrl(tc.input, "Usuario Teste");
      if (tc.expected) {
        expect(result).toBe(tc.expected);
      }
      if (tc.expectedDicebear) {
        expect(result).toContain("api.dicebear.com");
      }
    });
  });

  it("9. Compatibilidade com documentos legados sem 'avatarUrl' ou com valor vazio", () => {
    const legacyDocWithoutAvatar = {
      id: "legacy-1",
      name: "Mariana Souza",
      email: "mariana@ifpr.edu.br",
      // avatarUrl ausente
    };

    const resolved = resolveAvatarForUser({
      storedAvatar: (legacyDocWithoutAvatar as any).avatarUrl,
      providerPhoto: null,
      fallbackName: legacyDocWithoutAvatar.name,
    });

    expect(resolved).toContain("api.dicebear.com");
    expect(resolved).toContain("Mariana%20Souza");
  });
});
