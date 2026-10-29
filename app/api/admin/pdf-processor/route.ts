import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin, ensureSupabaseContentBucket } from '@/lib/supabase';

const execFileAsync = promisify(execFile);

const TMP_UPLOAD_ROOT = '/tmp/panelverse-pdf-uploads';
const TMP_PAGES_ROOT = '/tmp/panelverse-pdf-pages';
const CACHE_PAGES_ROOT = path.join(
  process.cwd(),
  'node_modules',
  '.cache',
  'panelverse-pdf-pages'
);

export interface ServerProcessedPage {
  pageNumber: number;
  name: string;
  url: string;
  sizeKb: number;
}

export interface PdfJobStatus {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  phase: string;
  fileName: string;
  completedPages: number;
  totalPages: number;
  totalSizeKb: number;
  pages: ServerProcessedPage[];
  error?: string;
  updatedAt: number;
}

// In-memory job tracker paired with disk persistence in /tmp
const activeJobs = new Map<string, PdfJobStatus>();

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `job_${Date.now()}`;
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getStatusFilePath(safeJobId: string): string {
  const dir = path.join(TMP_UPLOAD_ROOT, safeJobId);
  ensureDir(dir);
  return path.join(dir, 'status.json');
}

function saveJobStatus(state: PdfJobStatus) {
  state.updatedAt = Date.now();
  activeJobs.set(state.jobId, state);
  try {
    fs.writeFileSync(getStatusFilePath(state.jobId), JSON.stringify(state));
  } catch {
    // Ignore non-fatal status write errors
  }
}

function loadJobStatus(safeJobId: string): PdfJobStatus | null {
  const mem = activeJobs.get(safeJobId);
  if (mem) return mem;
  try {
    const statusFile = getStatusFilePath(safeJobId);
    if (fs.existsSync(statusFile)) {
      const parsed = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as PdfJobStatus;
      activeJobs.set(safeJobId, parsed);
      return parsed;
    }
  } catch {
    // Ignore parse error
  }
  return null;
}

function saveWebpPageToStorage(jobId: string, fileName: string, buffer: Buffer): string {
  const safeJob = sanitizeId(jobId);
  const tmpDir = path.join(TMP_PAGES_ROOT, safeJob);
  const cacheDir = path.join(CACHE_PAGES_ROOT, safeJob);

  ensureDir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, fileName), buffer);

  try {
    ensureDir(cacheDir);
    fs.writeFileSync(path.join(cacheDir, fileName), buffer);
  } catch {
    // Non-fatal if node_modules/.cache is read-only in some environments
  }

  // Mirror to Supabase Storage 'content' bucket in background if configured
  if (supabaseAdmin) {
    ensureSupabaseContentBucket()
      .then((ready) => {
        if (!ready || !supabaseAdmin) return;
        return supabaseAdmin.storage
          .from('content')
          .upload(`pdf-pages/${safeJob}/${fileName}`, buffer, {
            contentType: 'image/webp',
            upsert: true,
          });
      })
      .catch(() => {
        // Ignore background storage sync errors
      });
  }

  return `/api/pdf-pages/${safeJob}/${fileName}`;
}

/**
 * Converts an input image (file path or buffer) into 1 or more high-definition
 * full-width WebP panels without shrinking width due to tall Webtoon strip height.
 */
async function convertPageToHdWebpSlices(params: {
  source: string | Buffer;
  safeJobId: string;
  baseLabel: string;
  maxSlicesForThisPage: number;
  startPageCounter: number;
}): Promise<{ slices: ServerProcessedPage[]; totalSizeKb: number }> {
  const { source, safeJobId, baseLabel, maxSlicesForThisPage, startPageCounter } = params;
  const TARGET_MAX_WIDTH = 1280;
  const IDEAL_SLICE_HEIGHT = 3600;
  const WEBP_MAX_HEIGHT = 16000;

  const instance = sharp(source, { limitInputPixels: false });
  const meta = await instance.metadata();
  const origWidth = meta.width || 1080;
  const origHeight = meta.height || 1600;

  const targetWidth = Math.min(origWidth, TARGET_MAX_WIDTH);
  const widthScale = targetWidth / origWidth;
  const scaledHeight = Math.max(1, Math.round(origHeight * widthScale));

  let numSlices = 1;
  if (scaledHeight > 3800 && maxSlicesForThisPage > 1) {
    const idealCount = Math.ceil(scaledHeight / IDEAL_SLICE_HEIGHT);
    numSlices = Math.min(maxSlicesForThisPage, idealCount);
  }
  while (Math.ceil(scaledHeight / numSlices) > WEBP_MAX_HEIGHT) {
    numSlices++;
  }

  // Fast path: 1 slice
  if (numSlices === 1) {
    const outIdx = startPageCounter;
    const padded = String(outIdx).padStart(3, '0');
    const outWebpName = `page-${padded}.webp`;

    const webpBuffer = await sharp(source, { limitInputPixels: false })
      .resize({
        width: targetWidth,
        withoutEnlargement: true,
      })
      .webp({
        quality: 90,
        smartSubsample: true,
        effort: 2,
      })
      .toBuffer();

    const sizeKb = Math.max(1, Math.round(webpBuffer.byteLength / 1024));
    const publicUrl = saveWebpPageToStorage(safeJobId, outWebpName, webpBuffer);

    return {
      totalSizeKb: sizeKb,
      slices: [
        {
          pageNumber: outIdx,
          name: baseLabel,
          url: publicUrl,
          sizeKb,
        },
      ],
    };
  }

  // Multi-slice tall Webtoon strip: use raw pixel buffer when under 35MP for O(1) instant slicing
  const totalPixels = targetWidth * scaledHeight;
  const slices: ServerProcessedPage[] = [];
  let totalSizeKb = 0;

  if (totalPixels <= 35_000_000) {
    const { data: rawBuffer, info } = await sharp(source, { limitInputPixels: false })
      .resize({
        width: targetWidth,
        withoutEnlargement: true,
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const actualW = info.width;
    const actualH = info.height;
    const channels = info.channels;
    const rowBytes = actualW * channels;
    const sliceHeight = Math.ceil(actualH / numSlices);

    for (let s = 0; s < numSlices; s++) {
      const top = s * sliceHeight;
      if (top >= actualH) break;
      const height = Math.min(sliceHeight, actualH - top);
      if (height <= 0) break;

      const outIdx = startPageCounter + slices.length;
      const padded = String(outIdx).padStart(3, '0');
      const outWebpName = `page-${padded}.webp`;

      const byteStart = top * rowBytes;
      const byteEnd = (top + height) * rowBytes;
      const sliceRaw = rawBuffer.subarray(byteStart, byteEnd);

      const webpBuffer = await sharp(sliceRaw, {
        raw: { width: actualW, height, channels },
        limitInputPixels: false,
      })
        .webp({
          quality: 90,
          smartSubsample: true,
          effort: 2,
        })
        .toBuffer();

      const sizeKb = Math.max(1, Math.round(webpBuffer.byteLength / 1024));
      totalSizeKb += sizeKb;
      const publicUrl = saveWebpPageToStorage(safeJobId, outWebpName, webpBuffer);

      slices.push({
        pageNumber: outIdx,
        name: numSlices > 1 ? `${baseLabel} (Part ${s + 1}/${numSlices})` : baseLabel,
        url: publicUrl,
        sizeKb,
      });
    }

    return { slices, totalSizeKb };
  }

  // Fallback for ultra-tall (>35MP) single strips: extract from source before resizing width
  const origSliceHeight = Math.ceil(origHeight / numSlices);
  for (let s = 0; s < numSlices; s++) {
    const top = s * origSliceHeight;
    if (top >= origHeight) break;
    const height = Math.min(origSliceHeight, origHeight - top);
    if (height <= 0) break;

    const outIdx = startPageCounter + slices.length;
    const padded = String(outIdx).padStart(3, '0');
    const outWebpName = `page-${padded}.webp`;

    const webpBuffer = await sharp(source, { limitInputPixels: false })
      .extract({
        left: 0,
        top,
        width: origWidth,
        height,
      })
      .resize({
        width: targetWidth,
        withoutEnlargement: true,
      })
      .webp({
        quality: 90,
        smartSubsample: true,
        effort: 2,
      })
      .toBuffer();

    const sizeKb = Math.max(1, Math.round(webpBuffer.byteLength / 1024));
    totalSizeKb += sizeKb;
    const publicUrl = saveWebpPageToStorage(safeJobId, outWebpName, webpBuffer);

    slices.push({
      pageNumber: outIdx,
      name: numSlices > 1 ? `${baseLabel} (Part ${s + 1}/${numSlices})` : baseLabel,
      url: publicUrl,
      sizeKb,
    });
  }

  return { slices, totalSizeKb };
}

/**
 * Converts a Google Drive share URL or view link into a direct download URL.
 */
function normalizePdfDownloadUrl(rawUrl: string): { url: string; driveFileId?: string } {
  const trimmed = rawUrl.trim();

  const fileDMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch?.[1]) {
    const fileId = fileDMatch[1];
    return {
      url: `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      driveFileId: fileId,
    };
  }

  const idParamMatch = trimmed.match(
    /drive\.google\.com\/(?:open|uc)\?[^#]*[?&]id=([a-zA-Z0-9_-]+)/i
  );
  if (idParamMatch?.[1]) {
    const fileId = idParamMatch[1];
    return {
      url: `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      driveFileId: fileId,
    };
  }

  return { url: trimmed };
}

/**
 * Downloads a PDF from a direct URL or Google Drive link into destPdfPath.
 */
async function downloadPdfFromUrl(rawUrl: string, destPdfPath: string): Promise<string> {
  const { url, driveFileId } = normalizePdfDownloadUrl(rawUrl);

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      Accept: 'application/pdf,application/octet-stream,*/*',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Remote server returned HTTP ${response.status} when fetching PDF URL.`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let buffer = Buffer.from(await response.arrayBuffer());

  if (
    driveFileId &&
    (contentType.includes('text/html') || buffer.subarray(0, 5).toString('utf8') !== '%PDF-')
  ) {
    const html = buffer.toString('utf8');
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i);
    const confirmUrl = `https://drive.usercontent.google.com/download?id=${driveFileId}&export=download&confirm=t${
      uuidMatch?.[1] ? `&uuid=${encodeURIComponent(uuidMatch[1])}` : ''
    }`;

    const retryRes = await fetch(confirmUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      },
      redirect: 'follow',
    });

    if (retryRes.ok) {
      buffer = Buffer.from(await retryRes.arrayBuffer());
    }
  }

  const headerSlice = buffer.subarray(0, 1024).toString('latin1');
  const pdfHeaderIndex = headerSlice.indexOf('%PDF-');
  if (pdfHeaderIndex === -1) {
    throw new Error(
      'The provided URL did not return a valid PDF file. If using Google Drive, ensure link sharing is set to "Anyone with the link".'
    );
  }

  const cleanPdfBuffer = pdfHeaderIndex > 0 ? buffer.subarray(pdfHeaderIndex) : buffer;
  fs.writeFileSync(destPdfPath, cleanPdfBuffer);

  try {
    const parsedUrl = new URL(rawUrl);
    const base = path.basename(parsedUrl.pathname);
    if (base && base.toLowerCase().endsWith('.pdf')) {
      return decodeURIComponent(base);
    }
  } catch {
    // ignore URL parse error
  }
  return driveFileId ? `gdrive-${driveFileId.slice(0, 8)}.pdf` : 'remote-chapter.pdf';
}

/**
 * Counts pages in a PDF using Ghostscript fast nodisplay query.
 */
async function getPdfPageCount(pdfPath: string, maxPages: number): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/gs',
      [
        '-q',
        '-dNOSAFER',
        '-dNODISPLAY',
        '-c',
        `(${pdfPath.replace(/\\/g, '/')}) (r) file runpdfbegin pdfpagecount = quit`,
      ],
      { timeout: 15000 }
    );
    const parsed = parseInt(stdout.trim(), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(maxPages, parsed);
    }
  } catch {
    // Fallback if fast page count query fails
  }
  return maxPages;
}

/**
 * Renders a PDF file on disk into HD WebP pages in incremental batches,
 * updating PdfJobStatus after every single page so large PDFs never hit HTTP proxy timeouts.
 */
async function processPdfFileOnServer(params: {
  jobId: string;
  pdfPath: string;
  fileName: string;
  maxPages?: number;
  pdfUrl?: string;
}): Promise<PdfJobStatus> {
  const { jobId, pdfPath, fileName, pdfUrl } = params;
  const maxTotalOutputPages = Math.min(60, Math.max(1, Number(params.maxPages) || 60));
  const safeJobId = sanitizeId(jobId);
  const workDir = path.dirname(pdfPath);

  const jobState: PdfJobStatus = {
    jobId: safeJobId,
    status: 'processing',
    phase: pdfUrl
      ? 'Downloading PDF from remote link...'
      : `Inspecting "${fileName}" on server...`,
    fileName,
    completedPages: 0,
    totalPages: maxTotalOutputPages,
    totalSizeKb: 0,
    pages: [],
    updatedAt: Date.now(),
  };
  saveJobStatus(jobState);

  try {
    if (pdfUrl) {
      const downloadedName = await downloadPdfFromUrl(pdfUrl, pdfPath);
      jobState.fileName = downloadedName;
      jobState.phase = `Inspecting "${downloadedName}"...`;
      saveJobStatus(jobState);
    }

    const totalPdfPages = await getPdfPageCount(pdfPath, maxTotalOutputPages);
    jobState.totalPages = totalPdfPages;
    jobState.phase = `Rendering HD pages from "${jobState.fileName}" (0/${totalPdfPages})...`;
    saveJobStatus(jobState);

    const maxSlicesPerPdfPage = Math.max(1, Math.floor(maxTotalOutputPages / Math.max(1, totalPdfPages)));
    const cleanBaseName = jobState.fileName.replace(/\.pdf$/i, '').trim() || 'Chapter';
    const BATCH_SIZE = 8;

    for (let batchStart = 1; batchStart <= totalPdfPages; batchStart += BATCH_SIZE) {
      if (jobState.pages.length >= maxTotalOutputPages) break;
      const batchEnd = Math.min(totalPdfPages, batchStart + BATCH_SIZE - 1);

      jobState.phase = `Rendering PDF pages ${batchStart}–${batchEnd} of ${totalPdfPages}...`;
      saveJobStatus(jobState);

      const batchPrefix = `raw-${batchStart}-`;
      const rawPattern = path.join(workDir, `${batchPrefix}%03d.png`);

      await execFileAsync(
        '/usr/bin/gs',
        [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          '-dQUIET',
          '-sDEVICE=png16m',
          '-dNumRenderingThreads=2',
          '-dTextAlphaBits=4',
          '-dGraphicsAlphaBits=4',
          '-r150',
          `-dFirstPage=${batchStart}`,
          `-dLastPage=${batchEnd}`,
          `-sOutputFile=${rawPattern}`,
          pdfPath,
        ],
        { timeout: 120000, maxBuffer: 15 * 1024 * 1024 }
      );

      const batchFiles = fs
        .readdirSync(workDir)
        .filter((f) => f.startsWith(batchPrefix) && f.endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (batchFiles.length === 0 && batchStart === 1) {
        throw new Error('No pages could be extracted from the PDF file.');
      }

      for (let i = 0; i < batchFiles.length; i++) {
        if (jobState.pages.length >= maxTotalOutputPages) break;
        const rawFile = batchFiles[i];
        const rawFullPath = path.join(workDir, rawFile);
        const pdfPageNum = batchStart + i;
        const remainingBudget = maxTotalOutputPages - jobState.pages.length;
        const allowedSlices = Math.min(maxSlicesPerPdfPage, remainingBudget);

        try {
          const { slices, totalSizeKb: pageKb } = await convertPageToHdWebpSlices({
            source: rawFullPath,
            safeJobId,
            baseLabel: `${cleanBaseName} - Page ${String(pdfPageNum).padStart(2, '0')}`,
            maxSlicesForThisPage: allowedSlices,
            startPageCounter: jobState.pages.length + 1,
          });

          jobState.totalSizeKb += pageKb;
          jobState.pages.push(...slices);
          jobState.completedPages = Math.min(totalPdfPages, pdfPageNum);
          jobState.phase = `Converted HD WebP page ${jobState.completedPages}/${totalPdfPages} (${jobState.pages.length} panel${jobState.pages.length === 1 ? '' : 's'})...`;
          saveJobStatus(jobState);
        } finally {
          try {
            fs.unlinkSync(rawFullPath);
          } catch {
            // ignore cleanup error
          }
        }
      }

      if (batchFiles.length < batchEnd - batchStart + 1) {
        // Reached actual end of PDF pages
        break;
      }
    }

    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch {
      // ignore cleanup error
    }

    if (jobState.pages.length === 0) {
      throw new Error('No pages could be extracted from the PDF file.');
    }

    jobState.status = 'completed';
    jobState.completedPages = jobState.pages.length;
    jobState.totalPages = jobState.pages.length;
    jobState.phase = `Completed ${jobState.pages.length} HD WebP pages`;
    saveJobStatus(jobState);
    return jobState;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server failed to extract PDF pages.';
    jobState.status = 'failed';
    jobState.error = msg;
    jobState.phase = msg;
    saveJobStatus(jobState);
    throw err;
  }
}

function waitMs(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

export async function POST(req: NextRequest) {
  try {
    const uploadAction = req.headers.get('x-upload-action') || '';

    // 1. Chunked binary upload
    if (uploadAction === 'append-chunk') {
      const rawJobId = req.headers.get('x-job-id') || `pdf_${Date.now()}`;
      const chunkIndex = Number(req.headers.get('x-chunk-index') || '0');
      const safeJobId = sanitizeId(rawJobId);

      const jobUploadDir = path.join(TMP_UPLOAD_ROOT, safeJobId);
      ensureDir(jobUploadDir);
      const targetPdfPath = path.join(jobUploadDir, 'input.pdf');

      const arrayBuffer = await req.arrayBuffer();
      const chunkBuffer = Buffer.from(arrayBuffer);

      if (chunkIndex === 0 && fs.existsSync(targetPdfPath)) {
        fs.unlinkSync(targetPdfPath);
      }
      fs.appendFileSync(targetPdfPath, chunkBuffer);

      return NextResponse.json({
        success: true,
        jobId: safeJobId,
        chunkIndex,
        bytesWritten: chunkBuffer.byteLength,
      });
    }

    // 2. Single image file upload -> server-side HD sharp WebP conversion
    if (uploadAction === 'single-image') {
      const rawJobId = req.headers.get('x-job-id') || `img_${Date.now()}`;
      const pageIndex = Number(req.headers.get('x-page-index') || '1');
      const rawFileName = decodeURIComponent(
        req.headers.get('x-file-name') || `page-${pageIndex}.jpg`
      );
      const safeJobId = sanitizeId(rawJobId);

      const arrayBuffer = await req.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      const { slices } = await convertPageToHdWebpSlices({
        source: inputBuffer,
        safeJobId,
        baseLabel: rawFileName,
        maxSlicesForThisPage: 4,
        startPageCounter: pageIndex,
      });

      return NextResponse.json({
        success: true,
        jobId: safeJobId,
        page: slices[0],
        pages: slices,
      });
    }

    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    // 3. Direct Multipart FormData upload
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const maxPages = Number(formData.get('maxPages') || '60');

      if (!file) {
        return NextResponse.json({ error: 'No PDF file provided in FormData' }, { status: 400 });
      }

      const safeJobId = sanitizeId(`pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const jobUploadDir = path.join(TMP_UPLOAD_ROOT, safeJobId);
      ensureDir(jobUploadDir);
      const targetPdfPath = path.join(jobUploadDir, 'input.pdf');

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(targetPdfPath, fileBuffer);

      const jobPromise = processPdfFileOnServer({
        jobId: safeJobId,
        pdfPath: targetPdfPath,
        fileName: file.name || 'chapter.pdf',
        maxPages,
      });
      jobPromise.catch(() => {});

      const raceResult = await Promise.race([jobPromise, waitMs(4000)]);
      if (raceResult === 'timeout') {
        const currentStatus = loadJobStatus(safeJobId);
        return NextResponse.json({
          success: true,
          status: 'processing',
          jobId: safeJobId,
          phase: currentStatus?.phase || 'Rendering HD WebP pages...',
          completedPages: currentStatus?.completedPages || 0,
          totalPages: currentStatus?.totalPages || maxPages,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'completed',
        jobId: safeJobId,
        fileName: raceResult.fileName,
        pageCount: raceResult.pages.length,
        totalSizeKb: raceResult.totalSizeKb,
        pages: raceResult.pages,
      });
    }

    // 4. JSON actions: 'finalize_pdf', 'check_job_status', 'process_url', or 'upload_single_page'
    const body = await req.json();
    const { action, jobId, fileName, pdfUrl, maxPages, imageDataUrl, pageNumber } = body;

    if (action === 'check_job_status') {
      if (!jobId) {
        return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
      }
      const safeJobId = sanitizeId(jobId);
      const status = loadJobStatus(safeJobId);
      if (!status) {
        return NextResponse.json(
          { error: 'PDF job not found on server.', status: 'failed' },
          { status: 404 }
        );
      }

      if (status.status === 'failed') {
        return NextResponse.json(
          {
            success: false,
            status: 'failed',
            jobId: safeJobId,
            error: status.error || 'Server failed to extract PDF pages.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        status: status.status,
        jobId: safeJobId,
        phase: status.phase,
        fileName: status.fileName,
        completedPages: status.completedPages,
        totalPages: status.totalPages,
        totalSizeKb: status.totalSizeKb,
        pageCount: status.pages.length,
        pages: status.status === 'completed' ? status.pages : [],
      });
    }

    if (action === 'upload_single_page') {
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
      }
      const safeJobId = sanitizeId(jobId || `vercel_${Date.now()}`);
      const pageNum = Math.max(1, Number(pageNumber) || 1);
      const base64Part = imageDataUrl.includes(',')
        ? imageDataUrl.split(',')[1]
        : imageDataUrl;
      const inputBuffer = Buffer.from(base64Part, 'base64');

      const outFileName = `page-${String(pageNum).padStart(3, '0')}.webp`;
      const webpBuffer = await sharp(inputBuffer)
        .resize({
          width: 1280,
          withoutEnlargement: true,
        })
        .webp({
          quality: 90,
          smartSubsample: true,
          effort: 2,
        })
        .toBuffer();

      const sizeKb = Math.max(1, Math.round(webpBuffer.length / 1024));
      const finalUrl = saveWebpPageToStorage(safeJobId, outFileName, webpBuffer);

      return NextResponse.json({
        success: true,
        page: {
          pageNumber: pageNum,
          url: finalUrl,
          sizeKb,
          name: `${fileName || 'chapter.pdf'} - Page ${pageNum}`,
        },
      });
    }

    if (action === 'finalize_pdf') {
      if (!jobId) {
        return NextResponse.json({ error: 'jobId is required to finalize PDF' }, { status: 400 });
      }
      const safeJobId = sanitizeId(jobId);
      const existingStatus = loadJobStatus(safeJobId);
      if (existingStatus) {
        if (existingStatus.status === 'completed') {
          return NextResponse.json({
            success: true,
            status: 'completed',
            jobId: safeJobId,
            fileName: existingStatus.fileName,
            pageCount: existingStatus.pages.length,
            totalSizeKb: existingStatus.totalSizeKb,
            pages: existingStatus.pages,
          });
        }
        if (existingStatus.status === 'processing') {
          return NextResponse.json({
            success: true,
            status: 'processing',
            jobId: safeJobId,
            phase: existingStatus.phase,
            completedPages: existingStatus.completedPages,
            totalPages: existingStatus.totalPages,
          });
        }
      }

      const targetPdfPath = path.join(TMP_UPLOAD_ROOT, safeJobId, 'input.pdf');
      if (!fs.existsSync(targetPdfPath)) {
        return NextResponse.json(
          { error: 'Uploaded PDF chunks not found on server. Please try uploading again.' },
          { status: 404 }
        );
      }

      const jobPromise = processPdfFileOnServer({
        jobId: safeJobId,
        pdfPath: targetPdfPath,
        fileName: fileName || 'chapter.pdf',
        maxPages: Number(maxPages) || 60,
      });
      jobPromise.catch(() => {});

      const raceResult = await Promise.race([jobPromise, waitMs(4000)]);
      if (raceResult === 'timeout') {
        const currentStatus = loadJobStatus(safeJobId);
        return NextResponse.json({
          success: true,
          status: 'processing',
          jobId: safeJobId,
          phase: currentStatus?.phase || 'Rendering HD WebP panels...',
          completedPages: currentStatus?.completedPages || 0,
          totalPages: currentStatus?.totalPages || Number(maxPages) || 60,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'completed',
        jobId: safeJobId,
        fileName: raceResult.fileName,
        pageCount: raceResult.pages.length,
        totalSizeKb: raceResult.totalSizeKb,
        pages: raceResult.pages,
      });
    }

    if (action === 'process_url') {
      if (!pdfUrl || typeof pdfUrl !== 'string' || !pdfUrl.trim()) {
        return NextResponse.json(
          { error: 'Please provide a valid PDF URL or Google Drive share link.' },
          { status: 400 }
        );
      }

      const safeJobId = sanitizeId(`url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const jobUploadDir = path.join(TMP_UPLOAD_ROOT, safeJobId);
      ensureDir(jobUploadDir);
      const targetPdfPath = path.join(jobUploadDir, 'input.pdf');

      const jobPromise = processPdfFileOnServer({
        jobId: safeJobId,
        pdfPath: targetPdfPath,
        fileName: 'remote-chapter.pdf',
        maxPages: Number(maxPages) || 60,
        pdfUrl: pdfUrl.trim(),
      });
      jobPromise.catch(() => {});

      const raceResult = await Promise.race([jobPromise, waitMs(4000)]);
      if (raceResult === 'timeout') {
        const currentStatus = loadJobStatus(safeJobId);
        return NextResponse.json({
          success: true,
          status: 'processing',
          jobId: safeJobId,
          phase: currentStatus?.phase || 'Downloading & rendering PDF from link...',
          completedPages: currentStatus?.completedPages || 0,
          totalPages: currentStatus?.totalPages || Number(maxPages) || 60,
        });
      }

      return NextResponse.json({
        success: true,
        status: 'completed',
        jobId: safeJobId,
        fileName: raceResult.fileName,
        pageCount: raceResult.pages.length,
        totalSizeKb: raceResult.totalSizeKb,
        pages: raceResult.pages,
      });
    }

    return NextResponse.json({ error: 'Unsupported PDF processor action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Server PDF Processor error:', error);
    const msg =
      error instanceof Error ? error.message : 'Server failed to process the PDF file.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
