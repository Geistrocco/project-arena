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
