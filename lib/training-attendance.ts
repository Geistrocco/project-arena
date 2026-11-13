export type TrainingAttendance = "present" | "excused" | "unexcused" | "unconfirmed";
export function trainingAttendance(response: string | null, override: string | null): TrainingAttendance {
  if (override === "present") return "present";
  if (override === "excused") return "excused";
  if (override === "unexcused") return "unexcused";
  if (override === "absent") return response === "declined" ? "excused" : "unexcused";
  if (response === "accepted") return "present";
  if (response === "declined") return "excused";
  return "unconfirmed";
}
export function trainingReleaseDate(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(startsAt));
  const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
  const day = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday - 1);
  return day.toISOString().slice(0, 10);
}
export function trainingResponseOpen(startsAt: string, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const localDate = ["year", "month", "day"].map(name => parts.find(part => part.type === name)?.value).join("-");
  return now.getTime() < Date.parse(startsAt) && localDate >= trainingReleaseDate(startsAt);
}
