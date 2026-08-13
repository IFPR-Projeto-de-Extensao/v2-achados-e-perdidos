import { LostFoundItem, User, UserBadge, UserReputationInfo, BadgeTier } from "../types";

/**
 * Calculates user reputation points and unlocks badges based on their campus activity
 * (items registered as found, items successfully returned, speed of resolution, etc.)
 */
export function calculateUserReputation(user?: User | null, allItems?: LostFoundItem[]): UserReputationInfo {
  if (!user || !user.id) {
    return {
      totalPoints: 0,
      level: 1,
      levelTier: "BRONZE",
      levelTitle: "Colaborador Iniciante",
      badges: [],
      itemsReturnedCount: 0,
      itemsRegisteredFoundCount: 0,
      itemsRegisteredLostCount: 0,
      progressToNextLevel: 0,
      nextLevelPoints: 100,
    };
  }

  const safeItems = Array.isArray(allItems) ? allItems : [];
  const userNameLower = (user.name || "").toLowerCase().trim();

  // Find items registered by this user
  const userItems = safeItems.filter((item) => {
    if (!item) return false;
    if (item.registeredByUserId && item.registeredByUserId === user.id) return true;
    if (userNameLower && item.registeredByName && item.registeredByName.toLowerCase().trim() === userNameLower) return true;
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
      (Boolean(userNameLower) && Boolean(item.registeredByName) && item.registeredByName.toLowerCase().trim() === userNameLower);
    const isReturner =
      (item.returnedByUserId && item.returnedByUserId === user.id) ||
      (Boolean(userNameLower) && Boolean(item.returnedByName) && item.returnedByName.toLowerCase().trim() === userNameLower);
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
      name: "Primeiro Achado",
      description: "Cadastrou seu primeiro objeto encontrado para ajudar um colega no campus.",
      iconName: "Sparkles",
      tier: "BRONZE",
      unlocked: itemsRegisteredFoundCount >= 1,
      currentCount: Math.min(itemsRegisteredFoundCount, 1),
      targetCount: 1,
      progress: Math.min(100, Math.round((itemsRegisteredFoundCount / 1) * 100)),
      requirementText: "Cadastre 1 item encontrado no campus",
      pointsReward: 20,
    },
    {
      id: "badge-campus-friend",
      name: "Amigo do Campus",
      description: "Concluiu com sucesso a primeira devolução de um objeto ao seu verdadeiro dono.",
      iconName: "HeartHandshake",
      tier: "BRONZE",
      unlocked: itemsReturnedCount >= 1,
      currentCount: Math.min(itemsReturnedCount, 1),
      targetCount: 1,
      progress: Math.min(100, Math.round((itemsReturnedCount / 1) * 100)),
      requirementText: "Devolva 1 objeto encontrado com protocolo",
      pointsReward: 50,
    },
    {
      id: "badge-academic-detective",
      name: "Detetive Acadêmico",
      description: "Cadastrou 3 ou mais objetos achados com fotos e descrições detalhadas.",
      iconName: "Search",
      tier: "PRATA",
      unlocked: itemsRegisteredFoundCount >= 3,
      currentCount: Math.min(itemsRegisteredFoundCount, 3),
      targetCount: 3,
      progress: Math.min(100, Math.round((itemsRegisteredFoundCount / 3) * 100)),
      requirementText: "Cadastre 3 itens achados no IFPR",
      pointsReward: 60,
    },
    {
      id: "badge-ifpr-guardian",
      name: "Guardião IFPR",
      description: "Realizou 3 ou mais devoluções de itens, fortalecendo a confiança no campus.",
      iconName: "ShieldCheck",
      tier: "PRATA",
      unlocked: itemsReturnedCount >= 3,
      currentCount: Math.min(itemsReturnedCount, 3),
      targetCount: 3,
      progress: Math.min(100, Math.round((itemsReturnedCount / 3) * 100)),
      requirementText: "Devolva 3 objetos aos respectivos proprietários",
      pointsReward: 150,
    },
    {
      id: "badge-exemplary-citizen",
      name: "Cidadão Exemplar",
      description: "Alcançou 5 ou mais devoluções confirmadas, tornando-se referência de honestidade.",
      iconName: "Award",
      tier: "OURO",
      unlocked: itemsReturnedCount >= 5,
      currentCount: Math.min(itemsReturnedCount, 5),
      targetCount: 5,
      progress: Math.min(100, Math.round((itemsReturnedCount / 5) * 100)),
      requirementText: "Devolva 5 objetos no Campus Ivaiporã",
      pointsReward: 250,
    },
    {
      id: "badge-community-legend",
      name: "Lenda da Comunidade",
      description: "Patamar máximo de solidariedade: 10 ou mais devoluções concluídas no IFPR!",
      iconName: "Crown",
      tier: "DIAMANTE",
      unlocked: itemsReturnedCount >= 10,
      currentCount: Math.min(itemsReturnedCount, 10),
      targetCount: 10,
      progress: Math.min(100, Math.round((itemsReturnedCount / 10) * 100)),
      requirementText: "Devolva 10 objetos com registro formal",
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
  let levelTitle = "Colaborador Solidário";
  let levelTier: BadgeTier = "BRONZE";
  let nextLevelPoints = 100;
  let prevLevelPoints = 0;

  if (calculatedPoints >= 800) {
    level = 4;
    levelTitle = "Embaixador da Honestidade";
    levelTier = "DIAMANTE";
    nextLevelPoints = 1200;
    prevLevelPoints = 800;
  } else if (calculatedPoints >= 400) {
    level = 3;
    levelTitle = "Cidadão Honorário IFPR";
    levelTier = "OURO";
    nextLevelPoints = 800;
    prevLevelPoints = 400;
  } else if (calculatedPoints >= 150) {
    level = 2;
    levelTitle = "Guardião do Campus";
    levelTier = "PRATA";
    nextLevelPoints = 400;
    prevLevelPoints = 150;
  } else {
    level = 1;
    levelTitle = "Colaborador Solidário";
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
