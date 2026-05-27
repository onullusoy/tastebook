import { ValidationError } from "../errors";

interface CursorData {
  t: string;
  i: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), i: id })).toString("base64url");
}

export function decodeCursor(cursor: string): { timestamp: string; id: string } {
  try {
    const data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as CursorData;
    return { timestamp: data.t, id: data.i };
  } catch {
    throw new ValidationError("Invalid cursor format");
  }
}
