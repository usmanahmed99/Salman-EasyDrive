export function retentionCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60_000).toISOString();
}

type PiiKeys = "response_json" | "student_name" | "student_email" | "student_phone" | "public_token_hash";

export function anonymizeStudentRecord<T extends Record<string, unknown>>(
  record: T
): Omit<T, PiiKeys> & {
  response_json: string;
  student_name: null;
  student_email: null;
  student_phone: null;
  public_token_hash: string;
} {
  return {
    ...record,
    response_json: "{}",
    student_name: null,
    student_email: null,
    student_phone: null,
    public_token_hash: "expired"
  } as Omit<T, PiiKeys> & {
    response_json: string;
    student_name: null;
    student_email: null;
    student_phone: null;
    public_token_hash: string;
  };
}
