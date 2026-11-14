export type RankingRule = "head_to_head" | "overall" | "legacy";
export const rankingLabels: Record<RankingRule,string> = {
 head_to_head: "Body → vzájomné zápasy (minitabuľka: body, rozdiel skóre, góly) → celkový rozdiel skóre → celkové góly",
 overall: "Body → celkový rozdiel skóre → celkové góly → vzájomné zápasy (minitabuľka: body, rozdiel skóre, góly)",
 legacy: "Pôvodné pravidlá staršieho turnaja: body → rozdiel skóre → góly → názov tímu",
};
