/** A web page after extraction and normalisation. */
export interface Article {
  /** The page this came from. Always kept for attribution. */
  sourceUrl: string;
  title: string;
  /** Author line, when the page declares one. */
  byline: string | null;
  /** Publication or site name. */
  siteName: string | null;
  /** Short summary the page declares, if any. */
  excerpt: string | null;
  /** Cleaned article body as an HTML fragment. */
  html: string;
  /** Plain text, used for reading-time and diagnostics. */
  text: string;
  /** Absolute URLs of every image kept in the body. */
  images: string[];
  /** Language tag, defaults to "en". */
  lang: string;
}

/** Where a built artifact ended up on disk. */
export interface BuildResult {
  htmlPath: string;
  epubPath?: string;
  kepubPath?: string;
}
