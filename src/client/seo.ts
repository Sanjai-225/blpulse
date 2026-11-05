import type { SeoMetadata } from '../shared/seo';

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function applyPageMetadata(metadata: SeoMetadata): void {
  document.title = metadata.title;
  setMeta('meta[name="description"]', 'name', 'description', metadata.description);
  setMeta('meta[name="keywords"]', 'name', 'keywords', metadata.keywords.join(', '));
  setMeta('meta[name="robots"]', 'name', 'robots', metadata.noindex ? 'noindex,follow' : 'index,follow');
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta('meta[property="og:title"]', 'property', 'og:title', metadata.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', metadata.description);
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'BL Pulse');
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', metadata.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', metadata.description);

  const configuredOrigin = document.querySelector<HTMLMetaElement>('meta[name="bl-pulse-public-origin"]')?.content;
  const origin = configuredOrigin ? configuredOrigin.replace(/\/$/, '') : '';
  const canonical = origin && !metadata.noindex ? new URL(metadata.canonicalPath, `${origin}/`).toString() : '';
  let canonicalElement = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) {
    if (!canonicalElement) {
      canonicalElement = document.createElement('link');
      canonicalElement.rel = 'canonical';
      document.head.appendChild(canonicalElement);
    }
    canonicalElement.href = canonical;
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
  } else {
    canonicalElement?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
  }

  const image = metadata.image && /^https:\/\//i.test(metadata.image)
    ? metadata.image
    : origin && metadata.image?.startsWith('/')
      ? new URL(metadata.image, `${origin}/`).toString()
      : '';
  if (image) {
    setMeta('meta[property="og:image"]', 'property', 'og:image', image);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
  } else {
    document.head.querySelector('meta[property="og:image"]')?.remove();
    document.head.querySelector('meta[name="twitter:image"]')?.remove();
  }
}
