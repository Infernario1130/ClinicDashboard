// Which greeting the Sarvam agent plays, by India time. The line is closed from
// CLOSE_HOUR to OPEN_HOUR (22:00 to 04:00); the agent hangs up after the closed line.
const CLOSE_HOUR = 22;
const OPEN_HOUR = 4;

const OPEN_GREETING =
  "नमस्ते, संगम सुपर स्पेशलिटी आई हॉस्पिटल में आपका स्वागत है। मैं पूजा बोल रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?";
const CLOSED_GREETING =
  "अभी हॉस्पिटल बंद है। कृपया सुबह चार बजे के बाद कॉल करें। धन्यवाद।";

export function lineStatus(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  const closed = hour >= CLOSE_HOUR || hour < OPEN_HOUR;
  return { line_closed: closed ? "yes" : "no", opening_line: closed ? CLOSED_GREETING : OPEN_GREETING };
}
