import fs from "fs";
import path from "path";

export function saveScreenshot(
  buffer: Buffer,
  filename: string,
  screenshotDir: string,
  publicUrl: string
): string {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `${publicUrl}/screenshots/${filename}`;
}
