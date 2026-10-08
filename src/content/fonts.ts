/**
 * Carrega o Geist (empacotado na extensão) via FontFace API. Usar o buffer evita depender do font-src
 * do CSP do WhatsApp. A fonte tem nome próprio e só é usada dentro do nosso Shadow DOM.
 * Se falhar, o CSS cai para a fonte do sistema.
 */
export async function loadFonts(): Promise<void> {
  try {
    const res = await fetch(chrome.runtime.getURL('fonts/Geist-Variable.woff2'));
    const face = new FontFace('WA CRM Geist', await res.arrayBuffer(), { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
  } catch (err) {
    console.warn('[WA CRM] fonte Geist indisponível, usando a do sistema', err);
  }
}
