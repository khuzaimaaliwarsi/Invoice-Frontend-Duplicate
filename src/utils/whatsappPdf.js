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
 * Guarantees 100% reliable rendering of fonts, tables, rounded borders, and instant file download.
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
    // Parse HTML content
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlContent, 'text/html');

    // Detect if this is a proposal (.a4-page) so we use wider settings
    // Proposal card is 800px — needs 900px window (50px margin each side)
    const isProposal = !!(
      parsed.querySelector('.a4-page') ||
      parsed.querySelector('.proposal-doc, .proposal-container, .proposal-root, .proposal')
    );
    const RENDER_WIDTH = isProposal ? 900 : 800;

    // Inject all stylesheet rules into document.head so html2canvas computes all styles perfectly
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-pdf-runtime-style', 'true');
    let allCss = '';
    parsed.querySelectorAll('style').forEach((s) => {
      allCss += '\n' + s.textContent;
    });
    styleEl.textContent = allCss;
    document.head.appendChild(styleEl);

    // Create a staging container directly in document.body behind current view
    const staging = document.createElement('div');
    staging.id = 'pdf-staging-container';
    staging.style.position = 'fixed';
    staging.style.left = '0px';
    staging.style.top = '0px';
    staging.style.width = `${RENDER_WIDTH}px`;
    staging.style.zIndex = '-99999';
    staging.style.opacity = '1';
    staging.style.pointerEvents = 'none';
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

    // Allow layout calculation and CSSOM attachment in next render frame
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
            // Proposal: DO NOT override width — let the 800px card stay centered in 900px staging
            targetElement.style.boxSizing = 'border-box';
          } else {
            // Invoice/Statement: force to fill RENDER_WIDTH
            targetElement.style.margin = '0';
            targetElement.style.marginLeft = '0';
            targetElement.style.marginRight = '0';
            targetElement.style.width = `${RENDER_WIDTH}px`;
            targetElement.style.maxWidth = `${RENDER_WIDTH}px`;
            targetElement.style.boxSizing = 'border-box';
          }

          // Extra wait for layout reflow after resize
          await new Promise((r) => setTimeout(r, 100));

          // Measure full scrollable height
          const elementHeightPx = Math.max(
            staging.scrollHeight,
            targetElement.scrollHeight,
            targetElement.offsetHeight,
            800
          );

          // Calculate PDF page dimensions (pixel-perfect, no A4 page breaks)
          const marginMm = isProposal ? 0 : 8;
          // Convert px to mm: 1px = 0.264583mm at 96dpi
          const pdfWidthMm  = Math.round(RENDER_WIDTH * 0.264583);
          const pdfHeightMm = Math.round(elementHeightPx * 0.264583) + (marginMm * 2) + 10;

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
              width: RENDER_WIDTH,
              windowWidth: RENDER_WIDTH,
              x: 0,
              y: 0,
              scrollX: 0,
              scrollY: 0
            },
            jsPDF: { unit: 'mm', format: [pdfWidthMm, pdfHeightMm], orientation: 'portrait' },
            pagebreak: { mode: 'avoid-all' }
          };

          // For proposals render the full staging div (includes body padding) for correct centering
          const renderTarget = isProposal ? staging : targetElement;
          const pdfBlob = await html2pdf().set(opt).from(renderTarget).output('blob');
          resolve(pdfBlob);
        } catch (err) {
          console.error('PDF render error:', err);
          reject(err);
        } finally {
          staging.remove();
          styleEl.remove();
        }
      }, 25);
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
