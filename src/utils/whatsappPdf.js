import html2pdf from 'html2pdf.js';
import { whatsappApi } from '../services/api';

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
 * High-precision HTML-to-PDF engine using backend Chrome/Puppeteer API + client fallback.
 */
export async function htmlToPdfBlob(htmlContent, fileName = 'document.pdf') {
  // 1. First try ultra-fast backend Puppeteer Chrome engine
  try {
    const res = await fetch('/api/pdf/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlContent, fileName })
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 100) {
        return blob;
      }
    }
  } catch (backendErr) {
    console.warn('Backend PDF generation fallback to client-side html2pdf:', backendErr.message);
  }

  // 2. Client-side html2pdf fallback
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlContent, 'text/html');

    // Proposal (.a4-page) card = 800px → needs at least 900px window to avoid clipping
    const isProposal = !!(
      parsed.querySelector('.a4-page') ||
      parsed.querySelector('.proposal-doc, .proposal-container, .proposal-root, .proposal')
    );
    const WINDOW_WIDTH = isProposal ? 900 : 800;

    // Inject styles into document head
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-pdf-runtime-style', 'true');
    let allCss = '';
    parsed.querySelectorAll('style').forEach((s) => {
      allCss += '\n' + s.textContent;
    });
    styleEl.textContent = allCss;
    document.head.appendChild(styleEl);

    // Staging container (hidden, off-screen)
    const staging = document.createElement('div');
    staging.id = 'pdf-staging-container';
    staging.style.position = 'absolute';
    staging.style.left = '-99999px';
    staging.style.top = '0px';
    staging.style.width = `${WINDOW_WIDTH}px`;
    staging.style.zIndex = '-1';
    staging.style.background = '#ffffff';
    staging.style.margin = '0';
    staging.style.padding = '0';
    staging.style.boxSizing = 'border-box';

    if (parsed.body) {
      staging.innerHTML = parsed.body.innerHTML;
    } else {
      staging.innerHTML = htmlContent;
    }
    document.body.appendChild(staging);

    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          const targetElement = staging.querySelector('.a4-page') ||
                                staging.querySelector('.inv-container') ||
                                staging.querySelector('.statement') ||
                                staging.querySelector('.invoice') ||
                                staging.firstElementChild ||
                                staging;

          if (isProposal) {
            // Keep card width at 800px — just ensure box-sizing is correct
            targetElement.style.boxSizing = 'border-box';
          } else {
            // Force invoice/statement to fill the window width
            targetElement.style.margin = '0';
            targetElement.style.marginLeft = '0';
            targetElement.style.marginRight = '0';
            targetElement.style.width = `${WINDOW_WIDTH}px`;
            targetElement.style.maxWidth = `${WINDOW_WIDTH}px`;
            targetElement.style.boxSizing = 'border-box';
          }

          // Wait for reflow
          await new Promise((r) => setTimeout(r, 80));

          // Measure height from targetElement
          const elementHeightPx = Math.max(
            targetElement.scrollHeight,
            targetElement.offsetHeight,
            400
          );

          // Equal margins on all sides — 8mm uniform
          const CARD_WIDTH_PX = isProposal ? 800 : WINDOW_WIDTH;
          const marginMm = 8; // same on top, bottom, left, right
          const pdfWidthMm = 210;
          const printableWidthMm = pdfWidthMm - marginMm * 2; // 194mm
          const contentHeightMm = (elementHeightPx / CARD_WIDTH_PX) * printableWidthMm;
          // +marginMm*2 for top+bottom margins, equal to left+right
          const pdfHeightMm = Math.max(130, Math.ceil(contentHeightMm + marginMm * 2));

          const opt = {
            margin: [marginMm, marginMm, marginMm, marginMm],
            filename: fileName,
            image: { type: 'jpeg', quality: 0.97 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              letterRendering: true,
              logging: false,
              backgroundColor: '#ffffff',
              width: WINDOW_WIDTH,
              windowWidth: WINDOW_WIDTH,
              x: 0,
              y: 0,
              scrollX: 0,
              scrollY: 0
            },
            jsPDF: { unit: 'mm', format: [pdfWidthMm, pdfHeightMm], orientation: 'portrait' },
            pagebreak: { mode: 'avoid-all' }
          };

          const pdfBlob = await html2pdf().set(opt).from(targetElement).output('blob');
          resolve(pdfBlob);
        } catch (err) {
          console.error('PDF render error:', err);
          reject(err);
        } finally {
          staging.remove();
          styleEl.remove();
        }
      }, 50);
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
