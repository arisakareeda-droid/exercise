import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: false,
  },
};

function getBoundary(contentType) {
  const match = contentType.match(/boundary="?([^";]+)"?/);
  if (!match) {
    throw new Error("ไม่พบ multipart boundary");
  }
  return match[1];
}

function parseMultipartBody(buffer, boundary) {
  const body = buffer.toString("binary");
  const boundaryText = `--${boundary}`;
  const parts = body.split(boundaryText);

  for (const part of parts) {
    if (!part.includes("filename=")) {
      continue;
    }

    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      continue;
    }

    const headers = part.substring(0, headerEnd);
    const fileStart = headerEnd + 4;

    const filenameMatch = headers.match(/filename="([^"]*)"/);
    const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    const filename = filenameMatch?.[1] || "food-image";
    const mimeType = typeMatch?.[1]?.trim() || "image/jpeg";

    let fileBinary = part.substring(fileStart);
    if (fileBinary.endsWith("\r\n")) {
      fileBinary = fileBinary.slice(0, -2);
    }
    if (fileBinary.endsWith("--")) {
      fileBinary = fileBinary.slice(0, -2);
    }

    return {
      filename,
      mimeType,
      buffer: Buffer.from(fileBinary, "binary"),
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed",
    });
  }

  try {
    const contentType = req.headers["content-type"];
    if (!contentType?.includes("multipart/form-data")) {
      return res.status(400).json({
        error: "กรุณาส่งไฟล์รูปภาพ",
      });
    }

    const boundary = getBoundary(contentType);
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyBuffer = Buffer.concat(chunks);
    const image = parseMultipartBody(bodyBuffer, boundary);

    if (!image) {
      return res.status(400).json({
        error: "ไม่พบไฟล์รูปภาพ",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบหลังบ้าน",
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Image = image.buffer.toString("base64");

    const prompt = `
คุณเป็นระบบ AI วิเคราะห์อาหารจากภาพสำหรับแอป FitTrack
โปรดวิเคราะห์ภาพนี้และตอบกลับเป็น JSON เท่านั้นในรูปแบบ:
{
  "name": "ชื่ออาหาร",
  "category": "อาหารคาว/เครื่องดื่ม/ขนมหวาน/ผลไม้/อาหารว่าง/อื่น ๆ",
  "calories": 0,
  "confidence": 90,
  "note": "คำอธิบายสั้นๆ"
}
`;

    // เรียก Gemini พร้อม retry อัตโนมัติเมื่อเจอ error 503 (เซิร์ฟเวอร์คนใช้เยอะชั่วคราว)
    async function generateWithRetry(maxRetries = 3, delayMs = 1500) {
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: base64Image,
                },
              },
              {
                text: prompt,
              },
            ],
            config: {
              responseMimeType: "application/json",
            },
          });
        } catch (err) {
          lastError = err;
          const isOverloaded =
            err?.status === 503 ||
            err?.code === 503 ||
            /UNAVAILABLE|high demand/i.test(err?.message || "");

          if (isOverloaded && attempt < maxRetries) {
            // รอสักครู่ก่อนลองใหม่ (เพิ่มเวลารอขึ้นเรื่อยๆ ทุกครั้งที่ retry)
            await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    }

    const response = await generateWithRetry();

    const text = response.text;
    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "AI ส่งข้อมูลกลับมาไม่ใช่รูปแบบ JSON ที่ถูกต้อง",
      });
    }

    return res.status(200).json({
      name: result.name || "ไม่สามารถระบุได้ชัดเจน",
      category: result.category || "ไม่สามารถระบุได้",
      calories: Number(result.calories) || 0,
      confidence: Number(result.confidence) || 0,
      note: result.note || "",
    });

  } catch (error) {
    console.error("Gemini food analysis error:", error);

    const isOverloaded =
      error?.status === 503 ||
      error?.code === 503 ||
      /UNAVAILABLE|high demand/i.test(error?.message || "");

    if (isOverloaded) {
      return res.status(503).json({
        error: "ระบบ AI มีผู้ใช้งานหนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่",
      });
    }

    // ส่งข้อความ Error จริงกลับไปแสดงที่หน้าเว็บเพื่อ Debug
    return res.status(500).json({
      error: `Server Error: ${error.message || error}`,
    });
  }
}