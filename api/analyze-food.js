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

    if (!image.mimeType.startsWith("image/")) {
      return res.status(400).json({
        error: "ไฟล์ที่ส่งมาต้องเป็นรูปภาพ",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY",
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Image = image.buffer.toString("base64");

    const prompt = `
คุณเป็นระบบ AI วิเคราะห์อาหารจากภาพสำหรับแอป FitTrack

โปรดวิเคราะห์ "ภาพที่แนบมา" เท่านั้น
ห้ามสุ่มชื่ออาหาร
ห้ามเลือกอาหารจากฐานข้อมูลสมมติ
ห้ามเดาชื่ออาหารโดยไม่มีหลักฐานจากภาพ

งานที่ต้องทำ:
1. ระบุว่าในภาพเป็นอาหาร เครื่องดื่ม ขนม หรือสิ่งอื่น
2. ถ้าสามารถระบุเมนูได้ ให้ระบุชื่ออาหารที่ใกล้เคียงที่สุด
3. ถ้าไม่สามารถระบุได้อย่างมั่นใจ ให้ตอบว่า "ไม่สามารถระบุได้ชัดเจน"
4. ประเมินหมวดหมู่
5. ประเมินพลังงานโดยประมาณต่อ "หนึ่งหน่วยบริโภคที่เห็นในภาพ"
6. ถ้าอาหารมีหลายอย่าง ให้ระบุเป็นเมนูหลักที่เห็นชัดที่สุด
7. ห้ามสร้างข้อมูลขึ้นมาเพื่อให้มีคำตอบเสมอ

หมวดหมู่ที่อนุญาต:
- อาหารคาว
- เครื่องดื่ม
- ขนมหวาน
- ผลไม้
- อาหารว่าง
- อื่น ๆ
- ไม่สามารถระบุได้

ส่งผลลัพธ์เป็น JSON เท่านั้น:
{
  "name": "ชื่ออาหาร",
  "category": "หมวดหมู่",
  "calories": 0,
  "confidence": 0,
  "note": "คำอธิบายสั้น ๆ"
}

ข้อกำหนด:
- calories ต้องเป็นตัวเลขจำนวนเต็ม
- confidence เป็นตัวเลข 0-100
- ถ้าไม่เห็นอาหารชัดเจน ให้ calories = 0
- ถ้า confidence ต่ำกว่า 50 ให้ name = "ไม่สามารถระบุได้ชัดเจน"
`;

    // ใช้โมเดล gemini-2.5-flash หรือรุ่นล่าสุดที่รองรับ
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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

    const text = response.text;
    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "AI ส่งข้อมูลในรูปแบบที่ไม่ถูกต้อง",
      });
    }

    return res.status(200).json({
      name: result.name || "ไม่สามารถระบุได้ชัดเจน",
      category: result.category || "ไม่สามารถระบุได้",
      calories: Number.isFinite(Number(result.calories)) ? Number(result.calories) : 0,
      confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : 0,
      note: result.note || "",
    });

  } catch (error) {
    console.error("Gemini food analysis error:", error);
    return res.status(500).json({
      error: "เกิดข้อผิดพลาดในการวิเคราะห์ภาพอาหาร",
    });
  }
}