import html2pdf from 'html2pdf.js';
import { whatsappApi } from '../services/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = (reader.result || '').toString();
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Trigger immediate browser file download (.pdf) directly to Downloads folder
 */
function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

/**
 * High-precision HTML-to-PDF engine:
 * 1. Tries backend Puppeteer (with 3.5s timeout)
 * 2. Ultra-precise client-side fallback (100% equal margins, zero cut-off, single-page guarantee)
 */
export async function htmlToPdfBlob(htmlContent, fileName = 'document.pdf') {
  // 1. Try Backend Puppeteer engine (works locally and on full VPS)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const backendUrl = API_BASE_URL.replace(/\/+$/, '') + '/pdf/generate';
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlContent, fileName }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 100) {
        return blob;
      }
    }
  } catch (backendErr) {
    // Expected on Vercel/serverless environments without Chrome binary
  }

  // 2. High-Precision Client-Side Engine (Perfect for Vercel Live Deployments)
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlContent, 'text/html');

    const isProposal = !!(
      parsed.querySelector('.a4-page') ||
      parsed.querySelector('.proposal-doc, .proposal-container, .proposal-root, .proposal')
    );

    // Create an overlay staging container at (0, 0) for reliable coordinate math
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    const targetWidth = isProposal ? 800 : 780;
    container.style.width = `${targetWidth}px`;
    container.style.zIndex = '999999';
    container.style.background = '#ffffff';
    container.style.boxSizing = 'border-box';
    container.style.pointerEvents = 'none';

    const card = parsed.querySelector('.a4-page') ||
                 parsed.querySelector('.inv-container') ||
                 parsed.querySelector('.statement') ||
                 parsed.querySelector('.invoice') ||
                 parsed.body.firstElementChild;

    card.style.margin = '0';
    card.style.width = `${targetWidth}px`;
    card.style.maxWidth = `${targetWidth}px`;
    card.style.boxSizing = 'border-box';
    container.appendChild(card);
    document.body.appendChild(container);

    // Inject stylesheet
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-pdf-runtime-style', 'true');
    let allCss = '';
    parsed.querySelectorAll('style').forEach((s) => {
      allCss += '\n' + s.textContent;
    });
    styleEl.textContent = allCss;
    document.head.appendChild(styleEl);

    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          const cardH = container.scrollHeight || container.offsetHeight || 800;

          // Convert px to mm (1px = 0.264583mm at standard 96 DPI)
          const pxToMm = 0.264583;
          // Equal 20px margins on all 4 sides: Top == Bottom, Left == Right
          const padPx = 20;
          const padMm = padPx * pxToMm; // ~5.29mm
          const totalPdfWidthMm = (targetWidth + padPx * 2) * pxToMm;
          const totalPdfHeightMm = (cardH + padPx * 2) * pxToMm;

          const opt = {
            margin: [padMm, padMm, padMm, padMm], // Equal on all 4 sides
            filename: fileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
              scale: 1.8,
              useCORS: true,
              letterRendering: true,
              logging: false,
              backgroundColor: '#ffffff'
            },
            jsPDF: {
              unit: 'mm',
              format: [totalPdfWidthMm, totalPdfHeightMm],
              orientation: 'portrait'
            },
            pagebreak: { mode: 'avoid-all' }
          };

          const pdfBlob = await html2pdf().set(opt).from(card).output('blob');
          resolve(pdfBlob);
        } catch (err) {
          console.error('PDF render error:', err);
          reject(err);
        } finally {
          container.remove();
          styleEl.remove();
        }
      }, 30);
    });
  });
}

/**
 * Generate PDF Blob
 */
export async function generatePdfBlob(htmlContent, phone = '', fileName = 'document.pdf', caption = '') {
  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const clientBlob = await htmlToPdfBlob(htmlContent, cleanFileName);

  if (phone) {
    (async () => {
      try {
        const base64Data = await blobToBase64(clientBlob);
        await whatsappApi.sendDocument(phone, base64Data, cleanFileName, 'application/pdf', caption);
      } catch (err) {
        console.warn('WhatsApp background send error:', err.message);
        if (caption) {
          whatsappApi.sendText(phone, caption).catch(() => {});
        }
      }
    })();
  }

  return clientBlob;
}

/**
 * ⚡ 1-Click Instant Download directly into user's Downloads folder
 */
export async function downloadAsPdf(htmlContent, fileName) {
  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const blob = await htmlToPdfBlob(htmlContent, cleanFileName);
  triggerDownload(blob, cleanFileName);
  return { success: true };
}

/**
 * Send genuine .pdf document file to WhatsApp
 */
export async function sendPdfToWhatsApp({ phone, htmlContent, fileName, caption = '' }) {
  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  const blob = await htmlToPdfBlob(htmlContent, cleanFileName);
  const base64Data = await blobToBase64(blob);
  await whatsappApi.sendDocument(phone, base64Data, cleanFileName, 'application/pdf', caption);
  return { success: true };
}

/**
 * ⚡ 1-Click Instant: Downloads real .pdf to Downloads folder + sends real .pdf file to WhatsApp!
 */
export async function downloadAndSendWhatsApp({ htmlContent, fileName, phone, caption = '', onWhatsAppSuccess, onWhatsAppError }) {
  const cleanFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

  // 1. Generate real PDF Blob in browser
  const pdfBlob = await htmlToPdfBlob(htmlContent, cleanFileName);

  // 2. ⚡ IMMEDIATELY save .pdf file to user's device (zero lag)
  triggerDownload(pdfBlob, cleanFileName);

  // 3. Concurrently dispatch real .pdf document to WhatsApp in background
  if (phone) {
    (async () => {
      try {
        const base64Data = await blobToBase64(pdfBlob);
        await whatsappApi.sendDocument(phone, base64Data, cleanFileName, 'application/pdf', caption);
        if (onWhatsAppSuccess) onWhatsAppSuccess();
      } catch (err) {
        console.warn('WhatsApp auto-send error:', err.message);
        if (onWhatsAppError) {
          onWhatsAppError(err);
        }
        if (caption) {
          whatsappApi.sendText(phone, caption).catch(() => {});
        }
      }
    })();
  }

  return { success: true };
}
