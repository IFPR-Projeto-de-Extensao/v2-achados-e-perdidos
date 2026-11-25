import { LostFoundItem, User, UserBadge, UserReputationInfo, BadgeTier } from "../types";
import { safeToLower } from "./utils";
import type { SupportedLanguage } from "./i18n";

/**
 * Calculates user reputation points and unlocks badges based on their campus activity
 * (items registered as found, items successfully returned, speed of resolution, etc.)
 */
export function calculateUserReputation(
  user?: User | null,
  allItems?: LostFoundItem[],
  lang: SupportedLanguage = "pt"
): UserReputationInfo {
  const isEn = lang === "en";

  if (!user || !user.id) {
    return {
      totalPoints: 0,
      level: 1,
      levelTier: "BRONZE",
      levelTitle: isEn ? "Beginner Contributor" : "Colaborador Iniciante",
      badges: [],
      itemsReturnedCount: 0,
      itemsRegisteredFoundCount: 0,
      itemsRegisteredLostCount: 0,
      progressToNextLevel: 0,
      nextLevelPoints: 100,
    };
  }

  const safeItems = Array.isArray(allItems) ? allItems : [];
  const userNameLower = safeToLower(user.name);

  // Find items registered by this user
  const userItems = safeItems.filter((item) => {
    if (!item) return false;
    if (item.registeredByUserId && item.registeredByUserId === user.id) return true;
    if (userNameLower && item.registeredByName && safeToLower(item.registeredByName) === userNameLower) return true;
    return false;
  });

  const foundRegistered = userItems.filter((i) => i.type === "ENCONTRADO");
  const lostRegistered = userItems.filter((i) => i.type === "PERDIDO");

  // Items where this user was the one who registered as found and was subsequently returned (status DEVOLVIDO)
  // OR where this user was the one who performed the return
  const itemsReturnedByOrFromUser = safeItems.filter((item) => {
    if (!item || item.status !== "DEVOLVIDO") return false;
    const isRegistrar =
      (item.registeredByUserId && item.registeredByUserId === user.id) ||
      (Boolean(userNameLower) && Boolean(item.registeredByName) && safeToLower(item.registeredByName) === userNameLower);
    const isReturner =
      (item.returnedByUserId && item.returnedByUserId === user.id) ||
      (Boolean(userNameLower) && Boolean(item.returnedByName) && safeToLower(item.returnedByName) === userNameLower);
    return isRegistrar || isReturner;
  });

  const itemsReturnedCount = itemsReturnedByOrFromUser.length;
  const itemsRegisteredFoundCount = foundRegistered.length;
  const itemsRegisteredLostCount = lostRegistered.length;

  // Base points calculation:
  // - 50 points per successfully returned item
  // - 20 points per registered found item
  // - 10 points per registered lost item
  // - 15 points bonus if user has high profile completeness (phone, matricula)
  let calculatedPoints =
    itemsReturnedCount * 50 +
    itemsRegisteredFoundCount * 20 +
    itemsRegisteredLostCount * 10;

  if (user.phone && user.registrationNumber) {
    calculatedPoints += 15;
  }

  // Define badges with progression
  const badges: UserBadge[] = [
    {
      id: "badge-first-found",
      name: isEn ? "First Find" : "Primeiro Achado",
      description: isEn
        ? "Registered your first found object to help someone on campus."
        : "Cadastrou seu primeiro objeto encontrado para ajudar um colega no campus.",
      iconName: "Sparkles",
      tier: "BRONZE",
      unlocked: itemsRegisteredFoundCount >= 1,
      currentCount: Math.min(itemsRegisteredFoundCount, 1),
      targetCount: 1,
      progress: Math.min(100, Math.round((itemsRegisteredFoundCount / 1) * 100)),
      requirementText: isEn ? "Register 1 found item on campus" : "Cadastre 1 item encontrado no campus",
      pointsReward: 20,
    },
    {
      id: "badge-campus-friend",
      name: isEn ? "Campus Friend" : "Amigo do Campus",
      description: isEn
        ? "Successfully completed the first return of an object to its rightful owner."
        : "Concluiu com sucesso a primeira devolução de um objeto ao seu verdadeiro dono.",
      iconName: "HeartHandshake",
      tier: "BRONZE",
      unlocked: itemsReturnedCount >= 1,
      currentCount: Math.min(itemsReturnedCount, 1),
      targetCount: 1,
      progress: Math.min(100, Math.round((itemsReturnedCount / 1) * 100)),
      requirementText: isEn ? "Return 1 found object with a receipt" : "Devolva 1 objeto encontrado com protocolo",
      pointsReward: 50,
    },
    {
      id: "badge-academic-detective",
      name: isEn ? "Campus Detective" : "Detetive Acadêmico",
      description: isEn
        ? "Registered 3 or more found objects with detailed photos and descriptions."
        : "Cadastrou 3 ou mais objetos achados com fotos e descrições detalhadas.",
      iconName: "Search",
      tier: "PRATA",
      unlocked: itemsRegisteredFoundCount >= 3,
      currentCount: Math.min(itemsRegisteredFoundCount, 3),
      targetCount: 3,
      progress: Math.min(100, Math.round((itemsRegisteredFoundCount / 3) * 100)),
      requirementText: isEn ? "Register 3 found items at IFPR" : "Cadastre 3 itens achados no IFPR",
      pointsReward: 60,
    },
    {
      id: "badge-ifpr-guardian",
      name: isEn ? "IFPR Guardian" : "Guardião IFPR",
      description: isEn
        ? "Completed 3 or more item returns, strengthening trust across campus."
        : "Realizou 3 ou mais devoluções de itens, fortalecendo a confiança no campus.",
      iconName: "ShieldCheck",
      tier: "PRATA",
      unlocked: itemsReturnedCount >= 3,
      currentCount: Math.min(itemsReturnedCount, 3),
      targetCount: 3,
      progress: Math.min(100, Math.round((itemsReturnedCount / 3) * 100)),
      requirementText: isEn ? "Return 3 objects to their owners" : "Devolva 3 objetos aos respectivos proprietários",
      pointsReward: 150,
    },
    {
      id: "badge-exemplary-citizen",
      name: isEn ? "Exemplary Citizen" : "Cidadão Exemplar",
      description: isEn
        ? "Reached 5 or more confirmed returns, becoming a role model for integrity."
        : "Alcançou 5 ou mais devoluções confirmadas, tornando-se referência de honestidade.",
      iconName: "Award",
      tier: "OURO",
      unlocked: itemsReturnedCount >= 5,
      currentCount: Math.min(itemsReturnedCount, 5),
      targetCount: 5,
      progress: Math.min(100, Math.round((itemsReturnedCount / 5) * 100)),
      requirementText: isEn ? "Return 5 objects at Ivaiporã Campus" : "Devolva 5 objetos no Campus Ivaiporã",
      pointsReward: 250,
    },
    {
      id: "badge-community-legend",
      name: isEn ? "Community Legend" : "Lenda da Comunidade",
      description: isEn
        ? "Highest tier of solidarity: 10 or more completed returns at IFPR!"
        : "Patamar máximo de solidariedade: 10 ou mais devoluções concluídas no IFPR!",
      iconName: "Crown",
      tier: "DIAMANTE",
      unlocked: itemsReturnedCount >= 10,
      currentCount: Math.min(itemsReturnedCount, 10),
      targetCount: 10,
      progress: Math.min(100, Math.round((itemsReturnedCount / 10) * 100)),
      requirementText: isEn ? "Return 10 objects with formal records" : "Devolva 10 objetos com registro formal",
      pointsReward: 500,
    },
  ];

  // Bonus points for unlocked badges
  badges.forEach((b) => {
    if (b.unlocked) {
      calculatedPoints += b.pointsReward;
    }
  });

  // Calculate Level and Rank Title
  let level = 1;
  let levelTitle = isEn ? "Supportive Contributor" : "Colaborador Solidário";
  let levelTier: BadgeTier = "BRONZE";
  let nextLevelPoints = 100;
  let prevLevelPoints = 0;

  if (calculatedPoints >= 800) {
    level = 4;
    levelTitle = isEn ? "Integrity Ambassador" : "Embaixador da Honestidade";
    levelTier = "DIAMANTE";
    nextLevelPoints = 1200;
    prevLevelPoints = 800;
  } else if (calculatedPoints >= 400) {
    level = 3;
    levelTitle = isEn ? "IFPR Honorary Citizen" : "Cidadão Honorário IFPR";
    levelTier = "OURO";
    nextLevelPoints = 800;
    prevLevelPoints = 400;
  } else if (calculatedPoints >= 150) {
    level = 2;
    levelTitle = isEn ? "Campus Guardian" : "Guardião do Campus";
    levelTier = "PRATA";
    nextLevelPoints = 400;
    prevLevelPoints = 150;
  } else {
    level = 1;
    levelTitle = isEn ? "Supportive Contributor" : "Colaborador Solidário";
    levelTier = "BRONZE";
    nextLevelPoints = 150;
    prevLevelPoints = 0;
  }

  const range = nextLevelPoints - prevLevelPoints;
  const currentInLevel = Math.max(0, calculatedPoints - prevLevelPoints);
  const progressToNextLevel = Math.min(100, Math.round((currentInLevel / (range || 1)) * 100));

  return {
    totalPoints: calculatedPoints,
    level,
    levelTitle,
    levelTier,
    nextLevelPoints,
    progressToNextLevel,
    itemsReturnedCount,
    itemsRegisteredFoundCount,
    itemsRegisteredLostCount,
    badges,
  };
}
