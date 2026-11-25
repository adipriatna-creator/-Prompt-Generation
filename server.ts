import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_INSTRUCTION = `Anda adalah sistem Video to Prompt AI tingkat ahli yang memproses video multimodal (visual + audio).
Tugas utama Anda adalah membuat prompt video yang SANGAT AKURAT, PRESISI, SANGAT DETAIL, dan SEDEKAT MUNGKIN DENGAN VIDEO ASLI.

SANGAT PENTING (ATURAN KETAT):
1. SELURUH HASIL HARUS DIDOKUMENTASIKAN DAN DIJELASKAN DALAM BAHASA INDONESIA SECARA PENUH DAN TERKUNCI.
2. DILARANG MENGGUNAKAN SIMBOL FORMATTING BOLD BERUPA DUA BINTANG ("**") DI BAGIAN MANAPUN DARI TEKS HASIL. Tulis teks biasa atau huruf kapital tanpa bintik dua bintang.
3. Video Asli = Referensi Utama. JANGAN mengarang, menambah, atau mengurangi fakta.
4. Analisis trek AUDIO asli: Transkripsikan dialog kata-per-kata tanpa mengubah kata asli. Jika ada percakapan, tuliskan persis seperti di audio beserta intonasi dan karakternya. Jika tidak jelas, tulis [dialog tidak terdengar jelas].
5. Pembagian adegan harus berurutan berdasarkan TIMELINE asli (cth: 00:00-00:03, dst).

SUSUNAN OUTPUT WAJIB TERSTRUKTUR SEPERTI BERIKUT:

=== RINCIAN ANALISIS DETAIL ===
1. DESKRIPSI UTAMA VIDEO: (Ringkasan lengkap isi video dalam bahasa Indonesia)
2. DESKRIPSI KARAKTER: (Jumlah, usia, gender, bentuk wajah, kulit, rambut, pakaian, posisi)
3. DESKRIPSI LOKASI DAN LATAR BELAKANG: (Lokasi, interior/eksterior, dinding, perabotan, objek, pencahayaan)
4. DETAIL PAKAIAN DAN OBJEK: (Model pakaian, warna, bahan, aksesori, benda sekitar)
5. URUTAN ADEGAN BERDASARKAN TIMELINE: (Pembagian urutan adegan berdasarkan waktu sebenarnya dari detik awal sampai akhir)
6. DETAIL GERAKAN TUBUH: (Gerakan kepala, mata, tangan, gestur, cara berjalan, atau interaksi)
7. DETAIL EKSPRESI WAJAH: (Tersenyum, serius, terkejut, perubahan emosi)
8. DIALOG LENGKAP SETIAP KARAKTER: (Transkripsi percakapan persis sesuai audio. Format: Karakter A: "..." / Karakter B: "...")
9. DETAIL SUARA DAN MUSIK: (Efek suara, musik latar, intonasi, karakteristik suara, lingkungan)
10. DETAIL PERGERAKAN KAMERA: (Shot type, pan, tilt, zoom, static, angle, tracking)
11. PENCAHAYAAN DAN WARNA: (Sumber cahaya, bayangan, color temperature, tone warna)
12. DETAIL TEKNIS VIDEO: (Rasio aspek, estimasi resolusi, lighting style, fps)
13. INSTRUKSI KONSISTENSI KARAKTER: (Instruksi menjaga konsistensi visual untuk generator AI)
14. INSTRUKSI HASIL AKHIR VIDEO: (Petunjuk gaya rendering akhir)

=== MASTER PROMPT SIAP GENERATE ===
Di bagian ini, buat SATU PROMPT UTUH BERBENTUK NARASI PARAGRAF PANJANG, RAPI, LENGKAP, DAN MENGALIR DALAM BAHASA INDONESIA.

ATURAN STRUKTUR DAN TATAAN NARASI MASTER PROMPT:
- JANGAN gunakan format poin, daftar, tabel, atau label seperti A, B, C atau [STYLE], [CAMERA].
- JANGAN gunakan dua bintang (**) sama sekali.
- Susun narasi dalam paragraf-paragraf yang saling terhubung dengan jarak antarparagraf yang rapi:
  1. Paragraf Pembuka: Mulai dengan deskripsi jenis video, gaya visual (misal sinematik realistis), rasio aspek (misal 9:16 atau 16:9), dan gambaran umum adegan.
  2. Deskripsi Lokasi & Latar: Narasi detail mengenai gedung, ruangan, pencahayaan, dekorasi, lantai, dan latar belakang.
  3. Deskripsi Karakter & Aktivitas: Narasi detail tentang orang/karakter, pakaian, posisi, gestur, dan aktivitas mereka.
  4. Bagian Dialog (Wajib jika ada percakapan dalam audio): Berikan judul persis "DIALOG YANG DIUCAPKAN:" di baris tersendiri, diikuti baris dialog per karakter (contoh: Karakter 1: "..." / Karakter 2: "..."). Jangan mengarang dialog.
  5. Deskripsi Gerakan & Pergerakan Kamera: Narasi pergerakan kamera (zoom, pan, wide, close-up), sudut pandang, dan urutan gerakan kejadian secara runtut.
  6. Paragraf Penutup: Instruksi kualitas visual akhir, gerakan manusia natural, konsistensi karakter, detail tajam, dan kualitas HD 4K.`;

const PROMPT_QUERY =
  'Analisis video ini secara menyeluruh dari awal hingga akhir, baik visual maupun audio. Hasilkan prompt video super detail sesuai instruksi dalam Bahasa Indonesia tanpa simbol bintik dua bintang (**).';

const INLINE_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 110 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = 'video/';

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum tersedia di server. Silakan periksa Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function waitForFileActive(ai: GoogleGenAI, fileName: string) {
  let fileInfo = await ai.files.get({ name: fileName });
  let attempts = 0;
  while (fileInfo.state === 'PROCESSING' && attempts < 60) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    fileInfo = await ai.files.get({ name: fileName });
    attempts++;
  }
  if (fileInfo.state === 'FAILED') {
    throw new Error('Pemrosesan file video di server AI gagal.');
  }
  if (fileInfo.state !== 'ACTIVE') {
    throw new Error('Waktu tunggu pemrosesan video habis.');
  }
  return fileInfo;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.post(
    '/api/analyze',
    express.raw({
      type: '*/*',
      limit: `${MAX_VIDEO_SIZE_BYTES}b`,
    }),
    async (req, res) => {
      let tempFilePath: string | null = null;
      let uploadedFileName: string | null = null;
      let ai: GoogleGenAI | null = null;

      try {
        const videoBuffer = req.body;
        if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
          res.status(400).json({ error: 'File video kosong atau tidak valid.' });
          return;
        }

        const rawContentType = (req.headers['content-type'] || 'video/mp4').split(';')[0].trim();
        const mimeType = rawContentType.startsWith(ALLOWED_MIME_PREFIX) ? rawContentType : 'video/mp4';

        ai = getGenAI();

        let videoPart:
          | { inlineData: { mimeType: string; data: string } }
          | { fileData: { fileUri: string; mimeType: string } };

        if (videoBuffer.length <= INLINE_SIZE_LIMIT_BYTES) {
          videoPart = {
            inlineData: {
              mimeType,
              data: videoBuffer.toString('base64'),
            },
          };
        } else {
          const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'mp4';
          tempFilePath = path.join(os.tmpdir(), `vtp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
          await fs.promises.writeFile(tempFilePath, videoBuffer);

          const uploadResult = await ai.files.upload({
            file: tempFilePath,
            config: { mimeType },
          });

          if (!uploadResult.name || !uploadResult.uri) {
            throw new Error('Gagal mengunggah video ke Gemini File API.');
          }
          uploadedFileName = uploadResult.name;

          const activeFile = await waitForFileActive(ai, uploadedFileName);
          videoPart = {
            fileData: {
              fileUri: activeFile.uri || uploadResult.uri,
              mimeType: activeFile.mimeType || mimeType,
            },
          };
        }

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [{ text: PROMPT_QUERY }, videoPart],
            },
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
          },
        });

        const textOutput = response.text;
        if (!textOutput) {
          res.status(502).json({ error: 'Gagal mengambil teks hasil analisis dari AI Gemini.' });
          return;
        }

        res.json({ text: textOutput });
      } catch (error: unknown) {
        const err = error as { message?: string; status?: number };
        console.error('Gemini Analysis Error:', error);
        const statusCode =
          typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(statusCode).json({
          error: err?.message || 'Terjadi kesalahan saat menganalisis video.',
        });
      } finally {
        if (tempFilePath) {
          fs.promises.unlink(tempFilePath).catch(() => {});
        }
        if (ai && uploadedFileName) {
          ai.files.delete({ name: uploadedFileName }).catch(() => {});
        }
      }
    }
  );

  app.use((err: { type?: string; message?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Ukuran file video terlalu besar (maksimal 100MB).' });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VIDEO TO PROMPT AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
