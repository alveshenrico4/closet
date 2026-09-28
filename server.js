/**
 * Closet App — servidor
 * ----------------------------------------------------------------
 * Backend simples em Express que:
 *  - recebe fotos de roupas (multipart/form-data)
 *  - remove o fundo automaticamente com @imgly/background-removal-node
 *  - guarda as peças e os looks montados em um arquivo JSON (db.json)
 *  - serve o frontend estático (pasta /public)
 *
 * Como rodar:
 *   npm install
 *   npm start
 *   abrir http://localhost:3000
 * ----------------------------------------------------------------
 */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const ORIGINALS_DIR = path.join(UPLOADS_DIR, "originals");
const PROCESSED_DIR = path.join(UPLOADS_DIR, "processed");
const DB_FILE = path.join(ROOT, "db.json");

// garante que as pastas existem
[UPLOADS_DIR, ORIGINALS_DIR, PROCESSED_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ items: [], looks: [] }, null, 2));
}

// ---------- banco de dados (arquivo JSON simples) ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ---------- upload ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB por foto
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Envie apenas arquivos de imagem."));
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(PUBLIC_DIR));

// ---------- remoção de fundo ----------
// Carregado sob demanda: se o pacote falhar (ex: sem internet para baixar o
// modelo ONNX na primeira vez), a peça é salva com a foto original mesmo
// assim, sem travar o app.
let removeBackground = null;
async function getRemoveBackground() {
  if (removeBackground) return removeBackground;
  const mod = await import("@imgly/background-removal-node");
  removeBackground = mod.removeBackground;
  return removeBackground;
}

async function processImage(buffer) {
  try {
    const removeBg = await getRemoveBackground();
    const blob = await removeBg(buffer, {
      output: { format: "image/png", quality: 0.9 }
    });
    const arrayBuffer = await blob.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), bgRemoved: true };
  } catch (err) {
    console.error("Falha ao remover fundo, usando imagem original:", err.message);
    return { buffer, bgRemoved: false };
  }
}

// ================= ROTAS: PEÇAS =================

// listar peças
app.get("/api/items", (req, res) => {
  const db = readDB();
  res.json(db.items);
});

// criar peça (upload + remoção de fundo)
app.post("/api/items", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma foto enviada." });
    }
    const id = uuid();
    const category = (req.body.category || "top").trim();
    const name = (req.body.name || "").trim();

    const originalName = `${id}.jpg`;
    fs.writeFileSync(path.join(ORIGINALS_DIR, originalName), req.file.buffer);

    const { buffer: processedBuffer, bgRemoved } = await processImage(req.file.buffer);
    const processedName = `${id}.png`;
    fs.writeFileSync(path.join(PROCESSED_DIR, processedName), processedBuffer);

    const item = {
      id,
      name,
      category,
      bgRemoved,
      imageUrl: `/uploads/processed/${processedName}`,
      originalUrl: `/uploads/originals/${originalName}`,
      createdAt: new Date().toISOString()
    };

    const db = readDB();
    db.items.push(item);
    writeDB(db);

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não foi possível processar a foto." });
  }
});

// atualizar peça (categoria / nome)
app.patch("/api/items/:id", (req, res) => {
  const db = readDB();
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Peça não encontrada." });

  if (typeof req.body.category === "string") item.category = req.body.category;
  if (typeof req.body.name === "string") item.name = req.body.name;

  writeDB(db);
  res.json(item);
});

// remover peça
app.delete("/api/items/:id", (req, res) => {
  const db = readDB();
  const idx = db.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Peça não encontrada." });

  const [removed] = db.items.splice(idx, 1);
  writeDB(db);

  [removed.imageUrl, removed.originalUrl].forEach(url => {
    if (!url) return;
    const filePath = path.join(PUBLIC_DIR, url);
    fs.unlink(filePath, () => {});
  });

  res.json({ ok: true });
});

// ================= ROTAS: LOOKS =================

app.get("/api/looks", (req, res) => {
  const db = readDB();
  res.json(db.looks);
});

app.post("/api/looks", (req, res) => {
  const { name, pieces } = req.body;
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return res.status(400).json({ error: "O look precisa ter pelo menos uma peça." });
  }
  const look = {
    id: uuid(),
    name: (name || "Look sem nome").trim(),
    pieces, // [{ itemId, x, y, w, h, z, imageUrl }]
    createdAt: new Date().toISOString()
  };
  const db = readDB();
  db.looks.push(look);
  writeDB(db);
  res.status(201).json(look);
});

app.delete("/api/looks/:id", (req, res) => {
  const db = readDB();
  const idx = db.looks.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Look não encontrado." });
  db.looks.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// fallback: qualquer outra rota GET devolve o app (SPA)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Erro interno." });
});

app.listen(PORT, () => {
  console.log(`Closet App rodando em http://localhost:${PORT}`);
});
