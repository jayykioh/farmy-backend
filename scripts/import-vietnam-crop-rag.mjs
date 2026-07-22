import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFParse } from 'pdf-parse';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  await readFile(join(scriptDir, 'data', 'vietnam-crop-rag-sources.json'), 'utf8'),
);
const apiBase = (process.env.FARMY_API_URL || 'http://localhost:3000/api/v1').replace(/\/$/, '');
const adminToken = process.env.FARMY_ADMIN_JWT;
const publish = process.argv.includes('--publish');
const requestedCrop = process.argv.find((arg) => arg.startsWith('--crop='))?.split('=')[1];

if (!adminToken) {
  throw new Error('Thiếu FARMY_ADMIN_JWT. Script không lưu hoặc in token ra log.');
}

const normalizeText = (value) =>
  value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

export function splitDocument(text, maxChars = 14_000) {
  const paragraphs = normalizeText(text).split(/\n\s*\n/);
  const parts = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      parts.push(current);
      current = '';
    }
    if (paragraph.length > maxChars) {
      if (current) parts.push(current);
      current = '';
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        parts.push(paragraph.slice(offset, offset + maxChars));
      }
    } else {
      current += `${current ? '\n\n' : ''}${paragraph}`;
    }
  }
  if (current) parts.push(current);
  return parts.filter((part) => part.length >= 200);
}

async function api(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${path}: ${body?.message || 'request failed'}`);
  return body;
}

async function downloadPdf(driveId) {
  const url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Không tải được Google Drive (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
    throw new Error('Google Drive không trả về PDF; hãy kiểm tra quyền chia sẻ của file.');
  }
  return bytes;
}

const selected = manifest.sources.filter(
  (source) => !requestedCrop || source.slug === requestedCrop,
);
if (selected.length === 0) throw new Error(`Không có cây với slug "${requestedCrop}" trong manifest.`);

const importedIds = [];
for (const source of selected) {
  process.stdout.write(`\n[${source.crop}] tải và trích xuất PDF...\n`);
  const pdf = await downloadPdf(source.driveId);
  const parser = new PDFParse({ data: pdf });
  const parsed = await parser.getText();
  const parts = splitDocument(parsed.text || '');
  if (parts.length === 0) throw new Error(`PDF ${source.crop} không có text layer.`);
  const existingResponse = await api(
    `/admin/knowledge?category=${encodeURIComponent(`crop:${source.slug}`)}&limit=1000`,
  );
  const existingTitles = new Set(
    (existingResponse.data || []).map((document) => document.title),
  );

  for (let index = 0; index < parts.length; index += 1) {
    const sourceUrl = `https://drive.google.com/file/d/${source.driveId}/view`;
    const title = `${manifest.collection} – ${source.crop} – Phần ${index + 1}/${parts.length}`;
    if (existingTitles.has(title)) {
      process.stdout.write(`  bỏ qua phần ${index + 1}/${parts.length} (đã tồn tại)\n`);
      continue;
    }
    const created = await api('/admin/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        title,
        category: `crop:${source.slug}`,
        source_url: sourceUrl,
        content: `[Cây trồng: ${source.crop}]\n[Nguồn xuất bản: ${manifest.publisher}]\n\n${parts[index]}`,
      }),
    });
    const id = created.data._id;
    importedIds.push(id);
    process.stdout.write(`  tạo phần ${index + 1}/${parts.length}: ${id}\n`);
    if (publish) {
      await api(`/admin/knowledge/${id}/validate`, { method: 'POST', body: '{}' });
      await api(`/admin/knowledge/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm', note: 'Nguồn chính thức WB7; import có kiểm soát.' }),
      });
    }
  }
}

if (publish && importedIds.length > 0) {
  await api('/admin/knowledge/batch-embed', {
    method: 'POST',
    body: JSON.stringify({ ids: importedIds }),
  });
}

process.stdout.write(
  `\nHoàn tất: ${importedIds.length} phần tài liệu.${publish ? ' Đã validate, confirm và enqueue embedding.' : ' Đang chờ admin duyệt.'}\n`,
);
