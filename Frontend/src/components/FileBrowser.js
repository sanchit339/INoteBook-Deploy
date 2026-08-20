import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './FileBrowser.css';
import {
  purgeWorkbenchBrowserStorage,
} from '../utils/cryptoUtils';
import {
  bootSecureChannel,
  secureInvoke,
  purgeSecureSession,
  scrubLegacyStorage,
} from '../utils/secureResource';
import { logClientEvent } from '../utils/clientLogger';

const DEFAULT_DOC_TITLE = 'Eclipse IDE';
const DEFAULT_APP_TITLE = 'Notable - Productivity Suite';

/** Map filename → icon kind for Package Explorer / editor tabs */
const getFileIconKind = (filePath = '') => {
  const base = filePath.split('/').pop() || filePath;
  const lower = base.toLowerCase();

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'docker';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'make';
  if (lower === 'readme' || lower.startsWith('readme.')) return 'md';
  if (lower === 'license' || lower.startsWith('license.')) return 'license';
  if (lower === 'package.json' || lower === 'package-lock.json') return 'npm';
  if (lower === 'tsconfig.json' || lower === 'jsconfig.json') return 'tsconfig';
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return 'git';
  if (lower === 'pom.xml' || lower === 'build.gradle' || lower === 'build.gradle.kts') return 'build';
  if (lower.endsWith('.env') || lower.startsWith('.env.')) return 'env';

  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  const map = {
    js: 'js', mjs: 'js', cjs: 'js',
    jsx: 'jsx',
    ts: 'ts',
    tsx: 'tsx',
    py: 'py', pyw: 'py',
    java: 'java',
    class: 'java',
    kt: 'kt', kts: 'kt',
    go: 'go',
    rs: 'rs',
    rb: 'rb',
    php: 'php',
    cs: 'cs',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'h', hpp: 'hpp', c: 'c',
    swift: 'swift',
    json: 'json',
    xml: 'xml', xsl: 'xml',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'scss', less: 'css',
    md: 'md', mdx: 'md', markdown: 'md',
    yml: 'yml', yaml: 'yml',
    sh: 'sh', bash: 'sh', zsh: 'sh', bat: 'sh', cmd: 'sh', ps1: 'sh',
    sql: 'sql',
    svg: 'svg', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', ico: 'image', bmp: 'image', avif: 'image', tif: 'image', tiff: 'image',
    pdf: 'pdf',
    txt: 'txt', log: 'txt',
    properties: 'props', conf: 'props', cfg: 'props', ini: 'props',
    gradle: 'build',
    toml: 'toml',
    lock: 'lock',
    vue: 'vue',
    svelte: 'svelte',
  };
  return map[ext] || 'file';
};

const SOURCE_ROOT_RE =
  /(^|\/)(src\/main\/java|src\/test\/java|src\/main\/kotlin|src\/test\/kotlin|src\/main\/scala|src\/test\/scala)$/;

const isJavaLikeFile = (name = '') =>
  /\.(java|kt|kts|scala)$/i.test(name);

const countJavaLike = (node) => {
  let n = 0;
  const walk = (cur) => {
    if (!cur) return;
    Object.entries(cur).forEach(([name, item]) => {
      if (item.type === 'file' && isJavaLikeFile(name)) n += 1;
      else if (item.type === 'folder') walk(item.children);
    });
  };
  walk(node);
  return n;
};

const looksLikePackageForest = (node) => {
  const entries = Object.entries(node || {});
  if (!entries.length) return false;
  if (entries.some(([n]) => n === 'src')) return false;
  if (countJavaLike(node) < 5) return false;
  const folders = entries.filter(([, v]) => v.type === 'folder');
  if (!folders.length) return false;
  const pkgLike = folders.filter(([n]) => /^[a-z][a-z0-9_]*$/.test(n));
  return pkgLike.length >= Math.max(1, folders.length * 0.6);
};

const isSourceRootPath = (fullPath, node) => {
  if (SOURCE_ROOT_RE.test(fullPath)) return true;
  if (fullPath === 'src' || fullPath.endsWith('/src')) {
    const kids = node?.children || {};
    if (kids.main || kids.test) return false;
    return countJavaLike(kids) >= 3;
  }
  return false;
};

/** Deterministic CVS-style label decorations (size, date, author) from blob meta. */
const fileDecorations = (item, project) => {
  if (!item) return '';
  const bits = [];
  if (item.size != null && item.size !== '') bits.push(String(item.size));
  const sha = item.sha || '';
  if (sha.length >= 8) {
    const n = Number.parseInt(sha.slice(0, 8), 16) >>> 0;
    const start = Date.UTC(2014, 0, 1);
    const span = Date.UTC(2026, 6, 1) - start;
    const d = new Date(start + (n % span));
    const day = d.getUTCDate();
    const mon = d.getUTCMonth() + 1;
    const yr = String(d.getUTCFullYear()).slice(2);
    const h = d.getUTCHours();
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = ((h + 11) % 12) + 1;
    bits.push(`${day}/${mon}/${yr}`);
    bits.push(`${hr}:${min} ${ampm}`);
    if (n % 3 === 0 && project?.owner) {
      bits.push(String(project.owner).slice(0, 12).toLowerCase());
    }
  }
  return bits.join('  ');
};

const collectFlatPackages = (children, prefix = []) => {
  const pkgs = [];
  const entries = Object.entries(children || {});
  const files = [];
  const folders = [];
  entries.forEach(([name, item]) => {
    if (item.type === 'file') files.push([name, item]);
    else folders.push([name, item]);
  });
  files.sort(([a], [b]) => a.localeCompare(b));
  folders.sort(([a], [b]) => a.localeCompare(b));
  const dotted = prefix.join('.');
  if (files.length > 0) {
    pkgs.push({
      pkgName: dotted || '(default package)',
      prefixPath: prefix.join('/'),
      files,
    });
  }
  folders.forEach(([name, folder]) => {
    pkgs.push(...collectFlatPackages(folder.children || {}, [...prefix, name]));
  });
  return pkgs;
};

const ECLIPSE_JDT_STYLE = {
  'code[class*="language-"]': {
    color: '#000000',
    background: '#ffffff',
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: '13px',
    lineHeight: '17px',
    textShadow: 'none',
  },
  'pre[class*="language-"]': {
    color: '#000000',
    background: '#ffffff',
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: '13px',
    lineHeight: '17px',
    textShadow: 'none',
  },
  comment: { color: '#3f7f5f', fontStyle: 'italic' },
  prolog: { color: '#3f7f5f', fontStyle: 'italic' },
  doctype: { color: '#3f7f5f', fontStyle: 'italic' },
  cdata: { color: '#3f7f5f', fontStyle: 'italic' },
  keyword: { color: '#7f0055', fontWeight: 'bold' },
  boolean: { color: '#7f0055', fontWeight: 'bold' },
  builtin: { color: '#7f0055', fontWeight: 'bold' },
  operator: { color: '#000000' },
  punctuation: { color: '#000000' },
  string: { color: '#2a00ff' },
  char: { color: '#2a00ff' },
  number: { color: '#000000' },
  'class-name': { color: '#000000' },
  function: { color: '#000000' },
  annotation: { color: '#9a703f', textDecoration: 'underline' },
  decorator: { color: '#9a703f', textDecoration: 'underline' },
  'attr-name': { color: '#9a703f', textDecoration: 'underline' },
  variable: { color: '#0000c0' },
  constant: { color: '#0000c0' },
  property: { color: '#000000' },
  'attr-value': { color: '#2a00ff' },
};

const buildEditorMarkers = (content = '') => {
  const lines = String(content).split('\n');
  const classNameMatch = content.match(
    /\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/
  );
  const typeName = classNameMatch ? classNameMatch[1] : '';
  return lines.map((line) => {
    const marks = [];
    if (/^\s*@\w+/.test(line)) marks.push('ann');
    if (/@Override\b/.test(line)) marks.push('override');
    if (/\b(TODO|FIXME|XXX)\b/.test(line)) marks.push('task');
    if (
      /^\s*(?:public|protected|private|static|final|abstract|synchronized|native|default|[\s])*?(?:class|interface|enum|record)\b/.test(
        line
      )
    ) {
      marks.push('fold');
    } else if (
      /^\s*(?:public|protected|private)\s+.+\(.*\)\s*\{?\s*$/.test(line) &&
      !/[=;]\s*$/.test(line)
    ) {
      marks.push('fold');
    }
    if (typeName && line.includes(typeName) && !/^\s*\/\//.test(line)) {
      marks.push('occ');
    }
    return marks;
  });
};

const parseTypeName = (content = '', filePath = '') => {
  const m = String(content).match(
    /\b(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/
  );
  if (m) return m[1];
  const base = (filePath.split('/').pop() || '').replace(/\.[^.]+$/, '');
  return base || 'Resource';
};

const extractJavadoc = (content = '') => {
  const m = String(content).match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return null;
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
};

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'tif', 'tiff',
]);

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const GITHUB_CDN_HOSTS = new Set([
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'objects.githubusercontent.com',
  'media.githubusercontent.com',
  'camo.githubusercontent.com',
  'github.com',
]);

const getPathExt = (filePath = '') => {
  const base = String(filePath).split('/').pop() || '';
  const i = base.lastIndexOf('.');
  if (i < 0) return '';
  return base.slice(i + 1).toLowerCase();
};

const isImagePath = (filePath = '') => IMAGE_EXTS.has(getPathExt(filePath));

const mimeFromPath = (filePath = '') => MIME_BY_EXT[getPathExt(filePath)] || 'application/octet-stream';

const isImageEditor = (file) =>
  Boolean(file && (file.encoding === 'base64' || isImagePath(file.path)));

const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const base64ToBlobUrl = (b64, mime) => {
  const bytes = b64ToBytes(b64);
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  return URL.createObjectURL(blob);
};

const revokeBlobUrl = (url) => {
  if (url && String(url).startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      // ignore
    }
  }
};

const posixJoin = (dir, rel) => {
  const baseParts = rel.startsWith('/') ? [] : (dir ? dir.split('/') : []);
  const parts = [...baseParts];
  const trimmed = rel.replace(/\\/g, '/').replace(/^\//, '');
  for (const p of trimmed.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (parts.length) parts.pop();
      continue;
    }
    parts.push(p);
  }
  return parts.join('/');
};

const imageCacheKey = (owner, name, branch, path) =>
  `${owner}/${name}@${branch}:${path}`;

/**
 * Decide how a markdown <img src> should be loaded.
 * Repo-relative and GitHub-hosted URLs go through the encrypted proxy.
 * Other http(s) hosts are left as-is (no open proxy).
 */
const resolveMarkdownImage = (src, mdPath, project) => {
  if (!src) return null;
  const trimmed = String(src).trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return { kind: 'passthrough', src: trimmed };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let u;
    try {
      u = new URL(trimmed);
    } catch (_) {
      return { kind: 'external', src: trimmed };
    }
    const host = u.hostname.toLowerCase();
    if (host === 'raw.githubusercontent.com') {
      const parts = u.pathname.replace(/^\//, '').split('/');
      if (parts.length >= 4) {
        return {
          kind: 'repo',
          owner: parts[0],
          name: parts[1],
          branch: parts[2],
          path: parts.slice(3).join('/'),
        };
      }
    }
    if (host === 'github.com') {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|raw)\/([^/]+)\/(.+)$/);
      if (m) {
        return { kind: 'repo', owner: m[1], name: m[2], branch: m[4], path: m[5] };
      }
    }
    if (GITHUB_CDN_HOSTS.has(host) && u.protocol === 'https:') {
      return { kind: 'cdn', url: trimmed };
    }
    return { kind: 'external', src: trimmed };
  }

  if (!project) return null;
  const mdDir = (mdPath || '').split('/').slice(0, -1).join('/');
  const rel = trimmed.split('#')[0].split('?')[0];
  const path = posixJoin(rel.startsWith('/') ? '' : mdDir, rel);
  if (!path) return null;
  return {
    kind: 'repo',
    owner: project.owner,
    name: project.name || project.repo,
    branch: project.branch,
    path,
  };
};

const MarkdownImg = ({ src, alt, mdPath, project, loadProxiedImage }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [status, setStatus] = useState('loading');

  const projectKey = project
    ? `${project.owner}/${project.name || project.repo}@${project.branch}`
    : '';

  useEffect(() => {
    let cancelled = false;
    const resolved = resolveMarkdownImage(src, mdPath, project);

    if (!resolved) {
      setStatus('error');
      setBlobUrl(null);
      return undefined;
    }
    if (resolved.kind === 'passthrough' || resolved.kind === 'external') {
      setBlobUrl(resolved.src);
      setStatus(resolved.kind === 'external' ? 'external' : 'done');
      return undefined;
    }

    setStatus('loading');
    loadProxiedImage(resolved)
      .then((url) => {
        if (!cancelled) {
          setBlobUrl(url);
          setStatus('done');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlobUrl(null);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src, mdPath, projectKey, loadProxiedImage, project]);

  if (status === 'loading') {
    return <span className="ecl-md-img-ph">Loading image…</span>;
  }
  if (status === 'error' || !blobUrl) {
    return <span className="ecl-md-img-ph error">{alt || 'Image unavailable'}</span>;
  }
  return <img src={blobUrl} alt={alt || ''} />;
};

const buildWorkbenchTitle = (activeEditor, activeProject) => {
  if (activeEditor?.path) {
    const name = activeEditor.path.split('/').pop();
    const project = activeProject?.fullName || 'Workspace';
    return `${name} - ${project} - Eclipse IDE`;
  }
  if (activeProject?.fullName) {
    return `${activeProject.fullName} - Eclipse IDE`;
  }
  return DEFAULT_DOC_TITLE;
};

const setFavicon = (href) => {
  if (typeof document === 'undefined') return;
  const selectors = [
    "link[rel='icon']",
    "link[rel='shortcut icon']",
  ];
  let link = document.querySelector(selectors[0]) || document.querySelector(selectors[1]);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  // bust cache so chrome picks up the new icon
  const url = href.includes('?') ? href : `${href}?v=eclipse1`;
  link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/x-icon';
  link.href = url;
};

const JdtSourceEditor = ({ content, language, cursorLine }) => {
  const markers = useMemo(() => buildEditorMarkers(content), [content]);
  const isJava = language === 'java';
  const style = isJava ? ECLIPSE_JDT_STYLE : oneLight;
  return (
    <div className={`ecl-jdt-editor ${isJava ? 'is-java' : ''}`}>
      <div className="ecl-ann-ruler" aria-hidden="true">
        {markers.map((marks, i) => (
          <div
            key={i}
            className={`ecl-ann-slot ${cursorLine === i + 1 ? 'current' : ''}`}
          >
            {marks.includes('fold') && <span className="ecl-fold-mark" />}
            {marks.includes('override') && <span className="ecl-ann-mark override" />}
            {marks.includes('ann') && !marks.includes('override') && (
              <span className="ecl-ann-mark ann" />
            )}
            {marks.includes('task') && <span className="ecl-ann-mark task" />}
            {marks.includes('occ') && <span className="ecl-ann-mark occ" />}
          </div>
        ))}
      </div>
      <div className="ecl-code-main">
        <SyntaxHighlighter
          language={language}
          style={style}
          showLineNumbers={false}
          wrapLines
          lineProps={{
            style: { display: 'block', lineHeight: '17px', minHeight: '17px' },
          }}
          customStyle={{
            margin: 0,
            padding: '0 8px 24px 6px',
            background: '#ffffff',
            fontSize: '13px',
            lineHeight: '17px',
            minHeight: '100%',
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

const MENU_ITEMS = [
  {
    label: 'File',
    items: [
      { id: 'open-project', label: 'Open Project…', shortcut: 'Ctrl+O' },
      { id: 'close-project', label: 'Close Project' },
      { id: 'divider' },
      { id: 'refresh', label: 'Refresh', shortcut: 'F5' },
      { id: 'divider' },
      { id: 'exit', label: 'Exit Workbench' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C' },
      { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A' },
    ],
  },
  {
    label: 'Navigate',
    items: [
      { id: 'goto-resource', label: 'Open Resource…', shortcut: 'Ctrl+Shift+R' },
    ],
  },
  {
    label: 'Search',
    items: [
      { id: 'search-file', label: 'Search in Resource…' },
    ],
  },
  {
    label: 'Project',
    items: [
      { id: 'open-project', label: 'Open Project…' },
      { id: 'close-project', label: 'Close Project' },
    ],
  },
  {
    label: 'Run',
    items: [
      { id: 'noop', label: 'Run As…', disabled: true },
    ],
  },
  {
    label: 'Window',
    items: [
      { id: 'show-explorer', label: 'Show View → Package Explorer' },
      { id: 'show-outline', label: 'Show View → Outline' },
      { id: 'show-bottom', label: 'Show View → Console' },
      { id: 'divider' },
      { id: 'toggle-explorer', label: 'Toggle Package Explorer' },
      { id: 'toggle-outline', label: 'Toggle Outline' },
      { id: 'toggle-bottom', label: 'Toggle Console' },
      { id: 'divider' },
      { id: 'reset-perspective', label: 'Reset Perspective' },
    ],
  },
  {
    label: 'Help',
    items: [
      { id: 'about', label: 'About Eclipse IDE' },
    ],
  },
];

const FileBrowser = () => {
  const [projects, setProjects] = useState([]);
  const [activeProjectIndex, setActiveProjectIndex] = useState(null);
  const [projectInput, setProjectInput] = useState('');
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [openEditors, setOpenEditors] = useState([]); // { path, content }
  const [activeEditorPath, setActiveEditorPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [channelReady, setChannelReady] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [explorerWidth, setExplorerWidth] = useState(320);
  const [showOutline, setShowOutline] = useState(true);
  const [outlineWidth, setOutlineWidth] = useState(240);
  const [showBottom, setShowBottom] = useState(true);
  const [bottomHeight, setBottomHeight] = useState(188);
  const [bottomTab, setBottomTab] = useState('search'); // problems | javadoc | declaration | console | search
  const [focusedPane, setFocusedPane] = useState('explorer');
  const [outlineSelection, setOutlineSelection] = useState(null);
  const [maximized, setMaximized] = useState(null); // null | explorer | editor | outline | bottom
  const [welcomeSections, setWelcomeSections] = useState({
    start: true,
    samples: true,
    help: false,
  });
  const [consoleLines, setConsoleLines] = useState([
    { t: 'info', m: 'Eclipse IDE Resource Workbench started.' },
    { t: 'info', m: 'Workspace ready.' },
  ]);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const dialogInputRef = useRef(null);
  const menuBarRef = useRef(null);
  const blobCacheRef = useRef(new Map()); // key -> { blobUrl, mime }

  const revokeAllBlobs = useCallback(() => {
    blobCacheRef.current.forEach((entry) => {
      revokeBlobUrl(entry?.blobUrl);
    });
    blobCacheRef.current.clear();
  }, []);

  const revokeProjectBlobs = useCallback((project) => {
    if (!project) return;
    const owner = project.owner;
    const name = project.name || project.repo;
    const prefix = `${owner}/${name}@`;
    Array.from(blobCacheRef.current.entries()).forEach(([key, entry]) => {
      if (key.startsWith(prefix)) {
        revokeBlobUrl(entry?.blobUrl);
        blobCacheRef.current.delete(key);
      }
    });
  }, []);

  const loadProxiedImage = useCallback(async (resolved) => {
    if (resolved.kind === 'repo') {
      const key = imageCacheKey(
        resolved.owner,
        resolved.name,
        resolved.branch,
        resolved.path
      );
      const hit = blobCacheRef.current.get(key);
      if (hit?.blobUrl) return hit.blobUrl;
      const data = await secureInvoke('image', {
        owner: resolved.owner,
        name: resolved.name,
        branch: resolved.branch,
        path: resolved.path,
      });
      if (!data?.content) throw new Error('Image unavailable');
      const mime = data.mime || mimeFromPath(resolved.path);
      const blobUrl = base64ToBlobUrl(data.content, mime);
      blobCacheRef.current.set(key, { blobUrl, mime });
      return blobUrl;
    }
    if (resolved.kind === 'cdn') {
      const key = `url:${resolved.url}`;
      const hit = blobCacheRef.current.get(key);
      if (hit?.blobUrl) return hit.blobUrl;
      const data = await secureInvoke('image', { url: resolved.url });
      if (!data?.content) throw new Error('Image unavailable');
      const mime = data.mime || 'application/octet-stream';
      const blobUrl = base64ToBlobUrl(data.content, mime);
      blobCacheRef.current.set(key, { blobUrl, mime });
      return blobUrl;
    }
    throw new Error('Image unavailable');
  }, []);

  const pushConsole = useCallback((message, t = 'info') => {
    setConsoleLines((prev) => [
      ...prev.slice(-200),
      { t, m: message, at: new Date().toLocaleTimeString() },
    ]);
  }, []);

  /** Wipe RAM state + browser storage + crypto session (tab close / leave route). */
  const wipeSession = useCallback(() => {
    revokeAllBlobs();
    setProjects([]);
    setActiveProjectIndex(null);
    setProjectInput('');
    setFileTree([]);
    setSelectedFile(null);
    setOpenEditors([]);
    setActiveEditorPath(null);
    setExpandedFolders(new Set());
    setError(null);
    setConsoleLines([]);
    setStatusMessage('Session cleared');
    purgeSecureSession();
    scrubLegacyStorage();
    purgeWorkbenchBrowserStorage();
  }, [revokeAllBlobs]);

  useEffect(() => {
    let cancelled = false;
    const initializeApp = async () => {
      try {
        // Never keep prior workspace blobs — session is RAM-only
        scrubLegacyStorage();
        purgeWorkbenchBrowserStorage();
        await bootSecureChannel();
        if (!cancelled) {
          setChannelReady(true);
          setStatusMessage('Ready');
        }
      } catch (err) {
        if (!cancelled) {
          setChannelReady(false);
          setError(err.message || 'Workbench failed to start');
          setStatusMessage('Workbench failed to start');
          pushConsole(err.message || 'Workbench failed to start', 'error');
        }
      }
    };

    initializeApp();

    const onPageHide = () => {
      wipeSession();
    };
    // pagehide fires on tab close / navigate away (more reliable than unload)
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      wipeSession();
    };
  }, [wipeSession, pushConsole]);

  // Chrome tab title + favicon while workbench is open
  useEffect(() => {
    const previousTitle = document.title;
    const previousIcon =
      document.querySelector("link[rel='icon']")?.getAttribute('href') ||
      document.querySelector("link[rel='shortcut icon']")?.getAttribute('href') ||
      '/favicon.ico';

    setFavicon(`${process.env.PUBLIC_URL || ''}/favicon.svg`);
    document.title = buildWorkbenchTitle(
      openEditors.find((ed) => ed.path === activeEditorPath) || selectedFile,
      activeProjectIndex !== null ? projects[activeProjectIndex] : null
    );

    return () => {
      document.title = previousTitle || DEFAULT_APP_TITLE;
      setFavicon(previousIcon.split('?')[0] || '/favicon.ico');
    };
    // only mount/unmount for favicon restore; title updates in next effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const activeEditor =
      openEditors.find((ed) => ed.path === activeEditorPath) || selectedFile;
    const activeProject =
      activeProjectIndex !== null ? projects[activeProjectIndex] : null;
    document.title = buildWorkbenchTitle(activeEditor, activeProject);
  }, [openEditors, activeEditorPath, selectedFile, projects, activeProjectIndex]);

  useEffect(() => {
    if (showOpenDialog && dialogInputRef.current) {
      dialogInputRef.current.focus();
    }
  }, [showOpenDialog]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setShowOpenDialog(true);
        setOpenMenu(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setShowOpenDialog(true);
        setOpenMenu(null);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        refreshActiveProject();
      }
      if (e.key === 'Escape') {
        setShowOpenDialog(false);
        setShowAbout(false);
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeProjectIndex]);

  const loadProject = async (inputOverride) => {
    const trimmedInput = (inputOverride ?? projectInput).trim();

    if (!trimmedInput || !trimmedInput.includes('/')) {
      setError('Enter path as: team/project');
      setStatusMessage('Invalid project path');
      return;
    }

    const [owner, name] = trimmedInput.split('/');
    if (!owner || !name) {
      setError('Invalid project path');
      return;
    }

    const existingIndex = projects.findIndex((p) => p.fullName === trimmedInput);
    if (existingIndex !== -1) {
      setActiveProjectIndex(existingIndex);
      setFileTree(projects[existingIndex].tree);
      setProjectInput('');
      setShowOpenDialog(false);
      setStatusMessage(`Switched to ${trimmedInput}`);
      return;
    }

    setLoading(true);
    setError(null);
    setStatusMessage('Opening project…');
    pushConsole('Opening project…');
    await logClientEvent({
      event: 'project_load_start',
      message: 'Project load requested',
      meta: {},
    });

    try {
      if (!channelReady) {
        await bootSecureChannel();
        setChannelReady(true);
      }

      const projectData = await secureInvoke('project', { owner, name });
      const treeData = await secureInvoke('tree', {
        owner,
        name,
        branch: projectData.defaultBranch,
      });

      const newProject = {
        owner,
        name,
        repo: name,
        fullName: trimmedInput,
        branch: treeData.branch,
        metadata: projectData,
        tree: treeData.tree,
      };

      const next = [...projects, newProject];
      setProjects(next);
      setActiveProjectIndex(next.length - 1);
      setFileTree(treeData.tree);
      setProjectInput('');
      setSelectedFile(null);
      setOpenEditors([]);
      setActiveEditorPath(null);
      const expand = new Set([trimmedInput]);
      (treeData.tree || []).forEach((item) => {
        const p = item.path;
        if (
          p === 'src' ||
          p === 'src/main' ||
          p === 'src/main/java' ||
          p === 'src/test' ||
          p === 'src/test/java' ||
          p === 'src/main/kotlin' ||
          p === 'src/test/kotlin'
        ) {
          expand.add(p);
        }
      });
      setExpandedFolders(expand);
      setShowOpenDialog(false);
      setShowBottom(true);
      setBottomTab('console');
      setStatusMessage(
        `Project opened · ${treeData.tree.length} resources`
      );
      pushConsole(
        `Project opened (${treeData.tree.length} resources).`
      );

      await logClientEvent({
        event: 'project_load_success',
        message: 'Project loaded',
        meta: { fileCount: treeData.tree.length },
      });
      // Intentionally NOT saved to localStorage / sessionStorage
    } catch (err) {
      await logClientEvent({
        level: 'error',
        event: 'project_load_error',
        message: err.message || 'Project load failed',
        meta: {},
      });
      setError(err.message);
      setStatusMessage(err.message);
      pushConsole(err.message, 'error');
      setShowBottom(true);
      setBottomTab('problems');
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveProject = async () => {
    if (activeProjectIndex === null || !projects[activeProjectIndex]) return;
    const { fullName, owner, name, repo } = projects[activeProjectIndex];
    const projectName = name || repo;
    setLoading(true);
    setStatusMessage(`Refreshing ${fullName}…`);
    try {
      const projectData = await secureInvoke('project', {
        owner,
        name: projectName,
      });
      const treeData = await secureInvoke('tree', {
        owner,
        name: projectName,
        branch: projectData.defaultBranch,
      });
      const next = projects.map((p, i) =>
        i === activeProjectIndex
          ? { ...p, branch: treeData.branch, metadata: projectData, tree: treeData.tree }
          : p
      );
      setProjects(next);
      setFileTree(treeData.tree);
      setStatusMessage(`Refreshed ${fullName}`);
      pushConsole('Project refreshed.');
    } catch (err) {
      setError(err.message);
      setStatusMessage(err.message);
      pushConsole(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const switchProject = (index) => {
    setActiveProjectIndex(index);
    setFileTree(projects[index].tree);
    setSelectedFile(null);
    setExpandedFolders(new Set([projects[index].fullName]));
    setStatusMessage(`Project: ${projects[index].fullName}`);
  };

  const removeProject = async (index, e) => {
    if (e) e.stopPropagation();
    const removed = projects[index];
    revokeProjectBlobs(removed);
    const next = projects.filter((_, i) => i !== index);
    setProjects(next);

    if (activeProjectIndex === index) {
      setActiveProjectIndex(next.length > 0 ? 0 : null);
      setFileTree(next.length > 0 ? next[0].tree : []);
      setSelectedFile(null);
      setOpenEditors([]);
      setActiveEditorPath(null);
    } else if (activeProjectIndex > index) {
      setActiveProjectIndex(activeProjectIndex - 1);
    }

    setStatusMessage(removed ? `Closed ${removed.fullName}` : 'Project closed');
    // Memory-only: nothing to remove from disk
  };

  const loadFile = async (filePath) => {
    if (!projects[activeProjectIndex]) return;

    const existing = openEditors.find((ed) => ed.path === filePath);
    if (existing) {
      setSelectedFile(existing);
      setActiveEditorPath(filePath);
      setStatusMessage(filePath);
      return;
    }

    const { owner, name, repo, branch } = projects[activeProjectIndex];
    const projectName = name || repo;
    setLoading(true);
    setError(null);
    setStatusMessage(`Opening ${filePath}…`);

    try {
      let fileObj;
      if (isImagePath(filePath)) {
        const key = imageCacheKey(owner, projectName, branch, filePath);
        const cached = blobCacheRef.current.get(key);
        if (cached?.blobUrl) {
          fileObj = {
            path: filePath,
            encoding: 'base64',
            mime: cached.mime || mimeFromPath(filePath),
            blobUrl: cached.blobUrl,
          };
        } else {
          const data = await secureInvoke('image', {
            owner,
            name: projectName,
            branch,
            path: filePath,
          });
          if (!data?.content) throw new Error('Image unavailable');
          const mime = data.mime || mimeFromPath(filePath);
          const blobUrl = base64ToBlobUrl(data.content, mime);
          blobCacheRef.current.set(key, { blobUrl, mime });
          fileObj = { path: filePath, encoding: 'base64', mime, blobUrl };
        }
      } else {
        const data = await secureInvoke('file', {
          owner,
          name: projectName,
          branch,
          path: filePath,
        });
        fileObj = { path: filePath, content: data.content };
      }
      setSelectedFile(fileObj);
      setActiveEditorPath(filePath);
      setOpenEditors((prev) => {
        if (prev.some((p) => p.path === filePath)) return prev;
        return [...prev, fileObj];
      });
      setCursorPos({ line: 1, col: 1 });
      setOutlineSelection(null);
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        const parts = filePath.split('/');
        let acc = '';
        parts.slice(0, -1).forEach((part) => {
          acc = acc ? `${acc}/${part}` : part;
          next.add(acc);
        });
        return next;
      });
      setStatusMessage(filePath);
      pushConsole(`Opened ${filePath}`);
      await logClientEvent({
        event: 'file_load_success',
        message: 'Resource opened',
        meta: {},
      });
    } catch (err) {
      await logClientEvent({
        level: 'error',
        event: 'file_load_error',
        message: err.message || 'Resource open failed',
        meta: {},
      });
      setError(err.message);
      setStatusMessage(err.message);
      pushConsole(err.message, 'error');
      setShowBottom(true);
      setBottomTab('problems');
    } finally {
      setLoading(false);
    }
  };

  const closeEditor = (path, e) => {
    if (e) e.stopPropagation();
    const next = openEditors.filter((ed) => ed.path !== path);
    setOpenEditors(next);
    if (activeEditorPath === path) {
      const fallback = next[next.length - 1] || null;
      setActiveEditorPath(fallback ? fallback.path : null);
      setSelectedFile(fallback);
    }
  };

  const toggleFolder = (folderPath) => {
    const next = new Set(expandedFolders);
    if (next.has(folderPath)) next.delete(folderPath);
    else next.add(folderPath);
    setExpandedFolders(next);
  };

  const buildTreeStructure = () => {
    const root = {};
    fileTree.forEach((item) => {
      const parts = item.path.split('/');
      let current = root;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          if (item.type === 'file') {
            current[part] = {
              type: 'file',
              path: item.path,
              size: item.size,
              sha: item.sha,
            };
          } else {
            current[part] = current[part] || { type: 'folder', children: {} };
          }
        } else {
          current[part] = current[part] || { type: 'folder', children: {} };
          current = current[part].children;
        }
      });
    });
    return root;
  };

  const renderFileRow = (name, item, pad, { twistieSpacer = true } = {}) => {
    const isActive = selectedFile?.path === item.path;
    const iconKind = getFileIconKind(item.path);
    const deco = fileDecorations(item, activeProject);
    return (
      <div
        key={item.path}
        className={`ecl-tree-item ecl-file ${isActive ? 'active' : ''} ${
          focusedPane === 'explorer' && isActive ? 'focused' : ''
        }`}
        style={{ paddingLeft: pad }}
        onClick={() => {
          setFocusedPane('explorer');
          loadFile(item.path);
        }}
        title={item.path}
      >
        {twistieSpacer && <span className="ecl-tree-twistie-spacer" />}
        <span
          className={`ecl-tree-icon ecl-ft ecl-ft-${iconKind}`}
          aria-hidden="true"
        />
        <span className="ecl-tree-name">{name}</span>
        {deco && <span className="ecl-tree-deco">{deco}</span>}
      </div>
    );
  };

  const renderFlatPackages = (children, parentPath, depth) => {
    const pkgs = collectFlatPackages(children, []);
    return pkgs.map((pkg) => {
      const pkgKey = parentPath ? `${parentPath}/${pkg.prefixPath}` : pkg.prefixPath;
      const isExpanded = expandedFolders.has(pkgKey);
      const pad = 8 + depth * 14;
      const containsActive = pkg.files.some(([, f]) => f.path === selectedFile?.path);
      return (
        <div key={pkgKey} className="ecl-tree-folder">
          <div
            className={`ecl-tree-item ecl-folder ecl-package ${
              containsActive && !isExpanded ? 'contains-active' : ''
            }`}
            style={{ paddingLeft: pad }}
            onClick={() => {
              setFocusedPane('explorer');
              toggleFolder(pkgKey);
            }}
            title={pkg.pkgName}
          >
            <span className={`ecl-tree-twistie ${isExpanded ? 'open' : ''}`} />
            <span className="ecl-tree-icon ecl-pkg-icon" />
            <span className="ecl-tree-name">{pkg.pkgName}</span>
          </div>
          {isExpanded &&
            pkg.files.map(([name, file]) =>
              renderFileRow(name, file, 8 + (depth + 1) * 14)
            )}
        </div>
      );
    });
  };

  const renderTree = (node, parentPath = '', depth = 0) => {
    return Object.entries(node)
      .sort(([nameA, a], [nameB, b]) => {
        if (a.type === 'folder' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'folder') return 1;
        return nameA.localeCompare(nameB);
      })
      .map(([name, item]) => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        const pad = 8 + depth * 14;

        if (item.type === 'file') {
          return renderFileRow(name, item, pad);
        }

        const isExpanded = expandedFolders.has(fullPath);
        const sourceRoot = isSourceRootPath(fullPath, item);
        return (
          <div key={fullPath} className="ecl-tree-folder">
            <div
              className={`ecl-tree-item ecl-folder ${sourceRoot ? 'ecl-src-root' : ''}`}
              style={{ paddingLeft: pad }}
              onClick={() => {
                setFocusedPane('explorer');
                toggleFolder(fullPath);
              }}
              title={fullPath}
            >
              <span className={`ecl-tree-twistie ${isExpanded ? 'open' : ''}`} />
              <span
                className={`ecl-tree-icon ${
                  sourceRoot
                    ? 'ecl-src-folder'
                    : isExpanded
                    ? 'ecl-folder-open'
                    : 'ecl-folder-closed'
                }`}
              />
              <span className="ecl-tree-name">{name}</span>
            </div>
            {isExpanded && (
              <div className="ecl-tree-children">
                {sourceRoot
                  ? renderFlatPackages(item.children, fullPath, depth + 1)
                  : renderTree(item.children, fullPath, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  };

  const getLanguage = (filePath) => {
    const ext = filePath.split('.').pop().toLowerCase();
    const langMap = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      json: 'json',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      md: 'markdown',
      sh: 'bash',
      yml: 'yaml',
      yaml: 'yaml',
      sql: 'sql',
      properties: 'properties',
      gradle: 'groovy',
    };
    return langMap[ext] || 'text';
  };

  const handleMenuAction = (id) => {
    setOpenMenu(null);
    switch (id) {
      case 'open-project':
      case 'goto-resource':
        setShowOpenDialog(true);
        break;
      case 'close-project':
        if (activeProjectIndex !== null) removeProject(activeProjectIndex);
        break;
      case 'refresh':
        refreshActiveProject();
        break;
      case 'exit':
        window.location.href = '/';
        break;
      case 'copy':
        if (selectedFile?.content) {
          navigator.clipboard?.writeText(selectedFile.content);
          setStatusMessage('Content copied to clipboard');
        }
        break;
      case 'select-all':
        setStatusMessage('Select All');
        break;
      case 'about':
        setShowAbout(true);
        break;
      case 'show-explorer':
        setShowExplorer(true);
        setMaximized(null);
        break;
      case 'show-outline':
        setShowOutline(true);
        setMaximized(null);
        break;
      case 'show-bottom':
        setShowBottom(true);
        setMaximized(null);
        setBottomTab('console');
        break;
      case 'toggle-explorer':
        setShowExplorer((v) => !v);
        break;
      case 'toggle-outline':
        setShowOutline((v) => !v);
        break;
      case 'toggle-bottom':
        setShowBottom((v) => !v);
        break;
      case 'reset-perspective':
        setShowExplorer(true);
        setShowOutline(true);
        setShowBottom(true);
        setMaximized(null);
        setExplorerWidth(320);
        setOutlineWidth(240);
        setBottomHeight(188);
        setBottomTab('search');
        setStatusMessage('Perspective reset');
        break;
      case 'search-file':
        setShowOpenDialog(true);
        break;
      default:
        break;
    }
  };

  const startResize = useCallback((e, which) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startExplorer = explorerWidth;
    const startOutline = outlineWidth;
    const startBottom = bottomHeight;
    const onMove = (ev) => {
      if (which === 'explorer') {
        setExplorerWidth(Math.min(480, Math.max(160, startExplorer + (ev.clientX - startX))));
      } else if (which === 'outline') {
        setOutlineWidth(Math.min(420, Math.max(140, startOutline - (ev.clientX - startX))));
      } else if (which === 'bottom') {
        setBottomHeight(Math.min(420, Math.max(100, startBottom - (ev.clientY - startY))));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [explorerWidth, outlineWidth, bottomHeight]);

  const buildOutlineSymbols = (file) => {
    if (!file?.content || typeof file.content !== 'string' || isImageEditor(file)) return [];
    const lines = file.content.split('\n');
    const symbols = [];
    const javaType =
      /^\s*(?:(?:public|private|protected|static|final|abstract|sealed|non-sealed)\s+)*(class|interface|enum|record)\s+([A-Za-z0-9_]+)/;
    const javaMember =
      /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|volatile|transient)\s+)+([\w.<>,\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*(\(|;|=)/;
    const jsFn =
      /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/;
    const pyFn = /^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z0-9_]+)/;
    const heading = /^\s*#+\s+(.+)$/;
    const goFn = /^\s*(?:func|type|package)\s+([A-Za-z0-9_]+)/;

    lines.forEach((line, idx) => {
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*#/.test(line) && !heading.test(line)) {
        return;
      }
      let m = line.match(javaType);
      if (m) {
        symbols.push({
          name: m[2],
          kind: m[1] === 'interface' ? 'iface' : 'type',
          detail: m[1],
          line: idx + 1,
        });
        return;
      }
      m = line.match(javaMember);
      if (m && !['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'class'].includes(m[2])) {
        const isMethod = m[3] === '(';
        symbols.push({
          name: m[2],
          kind: isMethod ? 'method' : 'field',
          line: idx + 1,
        });
        return;
      }
      m = line.match(jsFn) || line.match(pyFn) || line.match(goFn);
      if (m) {
        symbols.push({ name: m[1], kind: 'member', line: idx + 1 });
        return;
      }
      m = line.match(heading);
      if (m) {
        symbols.push({ name: m[1], kind: 'heading', line: idx + 1 });
      }
    });
    return symbols.slice(0, 240);
  };

  const toggleMaximize = (panel) => {
    setMaximized((cur) => (cur === panel ? null : panel));
  };

  const activeProject =
    activeProjectIndex !== null ? projects[activeProjectIndex] : null;
  const treeStructure = fileTree.length > 0 ? buildTreeStructure() : {};
  const activeEditor =
    openEditors.find((ed) => ed.path === activeEditorPath) || selectedFile;
  const outlineSymbols = buildOutlineSymbols(activeEditor);
  const typeName = activeEditor
    ? parseTypeName(activeEditor.content || '', activeEditor.path)
    : '';
  const javadocText =
    activeEditor && !isImageEditor(activeEditor)
      ? extractJavadoc(activeEditor.content || '')
      : null;
  const problemLines = consoleLines.filter((l) => l.t === 'error' || l.t === 'warn');
  const fileCount = fileTree.filter((t) => t.type === 'file').length;

  const isMax = (panel) => maximized === panel;
  const hideForMax = (panel) => maximized && maximized !== panel;

  const ViewChrome = ({ title, panel, onHide, children, tabs }) => (
    <div className={`ecl-view-chrome ${isMax(panel) ? 'maximized' : ''}`}>
      <div className="ecl-view-titlebar">
        <div className="ecl-view-title-tabs">
          {tabs || <span className="ecl-view-title-label">{title}</span>}
        </div>
        <div className="ecl-view-actions">
          <button
            type="button"
            className="ecl-view-act"
            title={isMax(panel) ? 'Restore' : 'Maximize'}
            onClick={() => toggleMaximize(panel)}
          >
            {isMax(panel) ? '❐' : '□'}
          </button>
          <button
            type="button"
            className="ecl-view-act"
            title="Minimize"
            onClick={onHide}
          >
            –
          </button>
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="eclipse-workbench">
      {/* Title bar strip */}
      <div className="ecl-titlebar">
        <img
          className="ecl-title-logo"
          src={`${process.env.PUBLIC_URL || ''}/eclipse-icon.png`}
          alt=""
          width={16}
          height={16}
        />
        <span className="ecl-title-text">
          {buildWorkbenchTitle(activeEditor, activeProject)}
        </span>
      </div>

      {/* Menu bar */}
      <div className="ecl-menubar" ref={menuBarRef}>
        {MENU_ITEMS.map((menu, idx) => (
          <div key={menu.label} className="ecl-menu-item-wrap">
            <button
              type="button"
              className={`ecl-menu-btn ${openMenu === idx ? 'open' : ''}`}
              onClick={() => setOpenMenu(openMenu === idx ? null : idx)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(idx);
              }}
            >
              {menu.label}
            </button>
            {openMenu === idx && (
              <div className="ecl-menu-dropdown">
                {menu.items.map((item, i) =>
                  item.id === 'divider' ? (
                    <div key={`d-${i}`} className="ecl-menu-divider" />
                  ) : (
                    <button
                      key={item.id + i}
                      type="button"
                      className={`ecl-menu-entry ${item.disabled ? 'disabled' : ''}`}
                      disabled={item.disabled}
                      onClick={() => handleMenuAction(item.id)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ecl-shortcut">{item.shortcut}</span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="ecl-toolbar">
        <button
          type="button"
          className="ecl-tool-btn"
          title="Open Project (Ctrl+O)"
          onClick={() => setShowOpenDialog(true)}
        >
          <span className="ecl-tb-icon ecl-tb-open" />
        </button>
        <button
          type="button"
          className="ecl-tool-btn"
          title="Refresh (F5)"
          onClick={refreshActiveProject}
          disabled={!activeProject || loading}
        >
          <span className="ecl-tb-icon ecl-tb-refresh" />
        </button>
        <div className="ecl-tool-sep" />
        <button
          type="button"
          className={`ecl-tool-btn ${showExplorer ? 'active' : ''}`}
          title="Toggle Package Explorer"
          onClick={() => { setShowExplorer((v) => !v); setMaximized(null); }}
        >
          <span className="ecl-tb-icon ecl-tb-explorer" />
        </button>
        <button
          type="button"
          className={`ecl-tool-btn ${showOutline ? 'active' : ''}`}
          title="Toggle Outline"
          onClick={() => { setShowOutline((v) => !v); setMaximized(null); }}
        >
          <span className="ecl-tb-icon ecl-tb-outline" />
        </button>
        <button
          type="button"
          className={`ecl-tool-btn ${showBottom ? 'active' : ''}`}
          title="Toggle Console"
          onClick={() => { setShowBottom((v) => !v); setMaximized(null); }}
        >
          <span className="ecl-tb-icon ecl-tb-console" />
        </button>
        <div className="ecl-tool-sep" />
        <div className="ecl-toolbar-path">
          {activeProject ? (
            <>
              <span className="ecl-path-label">Workspace:</span>
              <span className="ecl-path-value">{activeProject.fullName}</span>
              <span className="ecl-path-branch">[{activeProject.branch}]</span>
            </>
          ) : (
            <span className="ecl-path-label">No project open — File → Open Project…</span>
          )}
        </div>
        {loading && <span className="ecl-toolbar-busy">Working…</span>}
      </div>

      {/* Perspective tabs */}
      <div className="ecl-perspective-bar">
        <div className="ecl-perspective active">Java</div>
        <div className="ecl-perspective">Debug</div>
        <div className="ecl-perspective">Resource</div>
        <div className="ecl-perspective-spacer" />
        {projects.map((p, index) => (
          <div
            key={p.fullName}
            className={`ecl-project-chip ${activeProjectIndex === index ? 'active' : ''}`}
            onClick={() => switchProject(index)}
            title={p.fullName}
          >
            <span className="ecl-chip-icon" />
            <span className="ecl-chip-name">{p.fullName}</span>
            <button
              type="button"
              className="ecl-chip-close"
              onClick={(e) => removeProject(index, e)}
              title="Close Project"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Main body — Eclipse workbench: left | center+bottom | right */}
      <div className={`ecl-body ${maximized ? `max-${maximized}` : ''}`}>
        {/* Left fast-view strip when explorer hidden */}
        {!showExplorer && !hideForMax('explorer') && (
          <button
            type="button"
            className="ecl-fastview ecl-fastview-left"
            title="Show Package Explorer"
            onClick={() => setShowExplorer(true)}
          >
            Package Explorer
          </button>
        )}

        {/* Package Explorer */}
        {showExplorer && !hideForMax('explorer') && (
          <>
            <div
              className={`ecl-view ecl-package-explorer ${isMax('explorer') ? 'is-max' : ''}`}
              style={isMax('explorer') ? undefined : { width: explorerWidth }}
            >
              <ViewChrome
                title="Explorer"
                panel="explorer"
                onHide={() => { setShowExplorer(false); setMaximized(null); }}
                tabs={
                  <button type="button" className="ecl-view-title-tab active ecl-view-tab-with-icon">
                    <span className="ecl-tab-mini-icon ecl-tab-mini-explorer" />
                    Explorer
                  </button>
                }
              >
                <div className="ecl-view-toolbar">
                  <button
                    type="button"
                    className="ecl-mini-btn"
                    title="Collapse All"
                    onClick={() => setExpandedFolders(new Set(activeProject ? [activeProject.fullName] : []))}
                  >
                    ⊟
                  </button>
                  <button
                    type="button"
                    className="ecl-mini-btn"
                    title="Open Project"
                    onClick={() => setShowOpenDialog(true)}
                  >
                    +
                  </button>
                </div>
                <div
                  className="ecl-view-content"
                  onMouseDown={() => setFocusedPane('explorer')}
                >
                  {activeProject ? (
                    <>
                      <div
                        className="ecl-tree-item ecl-project-root"
                        style={{ paddingLeft: 8 }}
                        onClick={() => toggleFolder(activeProject.fullName)}
                      >
                        <span
                          className={`ecl-tree-twistie ${
                            expandedFolders.has(activeProject.fullName) ? 'open' : ''
                          }`}
                        />
                        <span className="ecl-tree-icon ecl-project-icon" />
                        <span className="ecl-tree-name">{activeProject.fullName}</span>
                      </div>
                      {expandedFolders.has(activeProject.fullName) &&
                        (looksLikePackageForest(treeStructure)
                          ? renderFlatPackages(treeStructure, '', 1)
                          : renderTree(treeStructure, '', 1))}
                    </>
                  ) : (
                    <div className="ecl-empty-view">
                      <p>No projects in workspace.</p>
                      <button type="button" className="ecl-link-btn" onClick={() => setShowOpenDialog(true)}>
                        Open Project…
                      </button>
                    </div>
                  )}
                </div>
              </ViewChrome>
            </div>
            {!isMax('explorer') && (
              <div
                className="ecl-sash ecl-sash-v"
                onMouseDown={(e) => startResize(e, 'explorer')}
                title="Resize"
              />
            )}
          </>
        )}

        {/* Center column: editor + bottom views */}
        {(!maximized || maximized === 'editor' || maximized === 'bottom') && (
          <div className={`ecl-center-col ${isMax('editor') || isMax('bottom') ? 'is-max' : ''}`}>
            {!hideForMax('editor') && (
              <div className={`ecl-editor-area ${isMax('editor') ? 'is-max' : ''}`}>
                <div className="ecl-view-titlebar ecl-editor-titlebar">
                  <div className="ecl-editor-tabs">
                    {openEditors.length === 0 ? (
                      <div className="ecl-editor-tab placeholder active">Welcome</div>
                    ) : (
                      openEditors.map((ed) => {
                        const iconKind = getFileIconKind(ed.path);
                        return (
                          <div
                            key={ed.path}
                            className={`ecl-editor-tab ${activeEditorPath === ed.path ? 'active' : ''}`}
                            onClick={() => {
                              setActiveEditorPath(ed.path);
                              setSelectedFile(ed);
                              setStatusMessage(ed.path);
                            }}
                            title={ed.path}
                          >
                            <span
                              className={`ecl-tab-file-icon ecl-ft ecl-ft-${iconKind}`}
                              aria-hidden="true"
                            />
                            <span className="ecl-tab-label">{ed.path.split('/').pop()}</span>
                            <button
                              type="button"
                              className="ecl-tab-close"
                              onClick={(e) => closeEditor(ed.path, e)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="ecl-view-actions">
                    <button
                      type="button"
                      className="ecl-view-act"
                      title={isMax('editor') ? 'Restore' : 'Maximize'}
                      onClick={() => toggleMaximize('editor')}
                    >
                      {isMax('editor') ? '❐' : '□'}
                    </button>
                  </div>
                </div>

                <div
                  className="ecl-editor-body"
                  onMouseDown={() => setFocusedPane('editor')}
                >
                  {error && (
                    <div className="ecl-error-banner">
                      <span>{error}</span>
                      <button type="button" onClick={() => setError(null)}>
                        ×
                      </button>
                    </div>
                  )}

                  {activeEditor ? (
                    <>
                      <div className="ecl-code-scroll">
                        {isImageEditor(activeEditor) ? (
                          <div className="ecl-image-pane">
                            {activeEditor.blobUrl ? (
                              <img
                                src={activeEditor.blobUrl}
                                alt={activeEditor.path.split('/').pop()}
                              />
                            ) : (
                              <p className="ecl-muted-note">Image unavailable</p>
                            )}
                          </div>
                        ) : activeEditor.path.toLowerCase().endsWith('.md') ? (
                          <div className="ecl-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ node, inline, className, children, ...props }) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return !inline && match ? (
                                    <SyntaxHighlighter
                                      style={oneLight}
                                      language={match[1]}
                                      PreTag="div"
                                      {...props}
                                    >
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                img({ src, alt }) {
                                  return (
                                    <MarkdownImg
                                      src={src}
                                      alt={alt}
                                      mdPath={activeEditor.path}
                                      project={activeProject}
                                      loadProxiedImage={loadProxiedImage}
                                    />
                                  );
                                },
                              }}
                            >
                              {activeEditor.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <JdtSourceEditor
                            content={activeEditor.content || ''}
                            language={getLanguage(activeEditor.path)}
                            cursorLine={cursorPos.line}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="ecl-welcome ecl-welcome-full">
                      <div className="ecl-welcome-layout">
                        <div className="ecl-welcome-header">
                          <img
                            className="ecl-welcome-logo-img"
                            src={`${process.env.PUBLIC_URL || ''}/logo192.png`}
                            alt="Eclipse IDE"
                            width={48}
                            height={48}
                          />
                          <div>
                            <h1>Eclipse IDE</h1>
                            <p className="ecl-welcome-sub">Resource Workbench — Overview</p>
                          </div>
                        </div>

                        <div className="ecl-welcome-grid">
                          <div className="ecl-welcome-panel">
                            <button
                              type="button"
                              className="ecl-welcome-section-head"
                              onClick={() =>
                                setWelcomeSections((s) => ({ ...s, start: !s.start }))
                              }
                            >
                              <span className={`ecl-tree-twistie ${welcomeSections.start ? 'open' : ''}`} />
                              Start
                            </button>
                            {welcomeSections.start && (
                              <div className="ecl-welcome-section-body">
                                <button type="button" className="ecl-welcome-link" onClick={() => setShowOpenDialog(true)}>
                                  Open Project…
                                </button>
                                <button type="button" className="ecl-welcome-link" onClick={() => setShowExplorer(true)}>
                                  Show Package Explorer
                                </button>
                                <button type="button" className="ecl-welcome-link" onClick={() => setShowOutline(true)}>
                                  Show Outline
                                </button>
                                <button type="button" className="ecl-welcome-link" onClick={() => { setShowBottom(true); setBottomTab('console'); }}>
                                  Show Console
                                </button>
                                <button type="button" className="ecl-welcome-link" onClick={() => (window.location.href = '/')}>
                                  Exit Workbench
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="ecl-welcome-panel">
                            <button
                              type="button"
                              className="ecl-welcome-section-head"
                              onClick={() =>
                                setWelcomeSections((s) => ({ ...s, samples: !s.samples }))
                              }
                            >
                              <span className={`ecl-tree-twistie ${welcomeSections.samples ? 'open' : ''}`} />
                              Workspace
                            </button>
                            {welcomeSections.samples && (
                              <div className="ecl-welcome-section-body">
                                {projects.length === 0 ? (
                                  <p className="ecl-muted-note">No projects open. Use Open Project… (Ctrl+O).</p>
                                ) : (
                                  projects.map((p, i) => (
                                    <button
                                      key={p.fullName}
                                      type="button"
                                      className="ecl-welcome-link"
                                      onClick={() => switchProject(i)}
                                    >
                                      {p.fullName}
                                    </button>
                                  ))
                                )}
                                <p className="ecl-muted-note">Path format: <code>team/project</code></p>
                              </div>
                            )}
                          </div>

                          <div className="ecl-welcome-panel">
                            <button
                              type="button"
                              className="ecl-welcome-section-head"
                              onClick={() =>
                                setWelcomeSections((s) => ({ ...s, help: !s.help }))
                              }
                            >
                              <span className={`ecl-tree-twistie ${welcomeSections.help ? 'open' : ''}`} />
                              Tips &amp; shortcuts
                            </button>
                            {welcomeSections.help && (
                              <div className="ecl-welcome-section-body">
                                <ul className="ecl-welcome-tips">
                                  <li><kbd>Ctrl</kbd>+<kbd>O</kbd> Open Project</li>
                                  <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> Open Resource</li>
                                  <li><kbd>F5</kbd> Refresh</li>
                                  <li>Use □ / – on view titles to maximize or hide</li>
                                  <li>Drag sashes between views to resize</li>
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Horizontal sash + bottom view stack */}
            {showBottom && !hideForMax('bottom') && !isMax('editor') && (
              <>
                {!isMax('bottom') && (
                  <div
                    className="ecl-sash ecl-sash-h"
                    onMouseDown={(e) => startResize(e, 'bottom')}
                    title="Resize"
                  />
                )}
                <div
                  className={`ecl-view ecl-bottom-view ${isMax('bottom') ? 'is-max' : ''}`}
                  style={isMax('bottom') ? undefined : { height: bottomHeight }}
                >
                  <ViewChrome
                    title="Console"
                    panel="bottom"
                    onHide={() => { setShowBottom(false); setMaximized(null); }}
                    tabs={
                      <>
                        {[
                          { id: 'problems', label: `Problems${problemLines.length ? ` (${problemLines.length})` : ''}`, icon: 'problems' },
                          { id: 'javadoc', label: 'Javadoc', icon: 'javadoc' },
                          { id: 'declaration', label: 'Declaration', icon: 'declaration' },
                          { id: 'search', label: 'Search', icon: 'search' },
                          { id: 'console', label: 'Console', icon: 'console' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            className={`ecl-view-title-tab ecl-view-tab-with-icon ${bottomTab === tab.id ? 'active' : ''}`}
                            onClick={() => {
                              setBottomTab(tab.id);
                              setFocusedPane('bottom');
                            }}
                          >
                            <span className={`ecl-tab-mini-icon ecl-tab-mini-${tab.icon}`} />
                            {tab.label}
                          </button>
                        ))}
                      </>
                    }
                  >
                    <div
                      className="ecl-bottom-content"
                      onMouseDown={() => setFocusedPane('bottom')}
                    >
                      {bottomTab === 'problems' && (
                        problemLines.length === 0 ? (
                          <div className="ecl-bottom-empty">0 errors, 0 warnings, 0 infos</div>
                        ) : (
                          problemLines.map((line, i) => (
                            <div key={i} className={`ecl-console-line ${line.t}`}>
                              {line.at ? `[${line.at}] ` : ''}{line.m}
                            </div>
                          ))
                        )
                      )}
                      {bottomTab === 'javadoc' && (
                        <div className="ecl-javadoc-pane">
                          {!activeEditor ? (
                            <div className="ecl-bottom-empty">Select a type to view Javadoc.</div>
                          ) : javadocText ? (
                            <pre className="ecl-javadoc-pre">{javadocText}</pre>
                          ) : (
                            <div className="ecl-bottom-empty">
                              Note: This element neither has attached source nor attached Javadoc
                              and hence no Javadoc could be found.
                            </div>
                          )}
                        </div>
                      )}
                      {bottomTab === 'declaration' && (
                        <div className="ecl-declaration-pane">
                          {!activeEditor ? (
                            <div className="ecl-bottom-empty">No declaration selected.</div>
                          ) : (
                            <pre className="ecl-declaration-pre">
                              {(activeEditor.content || '')
                                .split('\n')
                                .slice(
                                  Math.max(0, (outlineSymbols[0]?.line || 1) - 2),
                                  (outlineSymbols[0]?.line || 1) + 8
                                )
                                .join('\n') || activeEditor.path}
                            </pre>
                          )}
                        </div>
                      )}
                      {bottomTab === 'console' && (
                        consoleLines.length === 0 ? (
                          <div className="ecl-bottom-empty">Console is empty.</div>
                        ) : (
                          consoleLines.map((line, i) => (
                            <div key={i} className={`ecl-console-line ${line.t}`}>
                              {line.at ? `[${line.at}] ` : ''}{line.m}
                            </div>
                          ))
                        )
                      )}
                      {bottomTab === 'search' && (
                        !activeEditor ? (
                          <div className="ecl-bottom-empty">
                            No search results. Open a resource to see references.
                          </div>
                        ) : (
                          <div className="ecl-search-results">
                            <div className="ecl-search-header">
                              '{typeName}' - {Math.max(outlineSymbols.length, 1)} references
                              in workspace (no JRE)
                            </div>
                            <div
                              className="ecl-tree-item ecl-folder"
                              style={{ paddingLeft: 8 }}
                            >
                              <span className="ecl-tree-twistie open" />
                              <span className="ecl-tree-icon ecl-pkg-icon" />
                              <span className="ecl-tree-name">
                                {activeEditor.path.split('/').slice(0, -1).join('.') ||
                                  activeProject?.fullName ||
                                  'src'}
                                {' '}
                                <span className="ecl-tree-deco">
                                  {activeEditor.path.split('/').slice(0, -1).join('/') ||
                                    'src'}
                                </span>
                              </span>
                            </div>
                            <div
                              className={`ecl-tree-item ${
                                outlineSelection == null ? 'active focused' : ''
                              }`}
                              style={{ paddingLeft: 22 }}
                              onClick={() => {
                                setOutlineSelection(null);
                                setFocusedPane('bottom');
                              }}
                            >
                              <span className="ecl-tree-twistie open" />
                              <span className="ecl-jdt-icon ecl-jdt-c" />
                              <span className="ecl-tree-name">{typeName}</span>
                              <span className="ecl-tree-deco">
                                {fileDecorations(
                                  fileTree.find((t) => t.path === activeEditor.path) || {},
                                  activeProject
                                )}
                              </span>
                            </div>
                            {outlineSymbols
                              .filter((s) => s.kind !== 'type' && s.kind !== 'iface' && s.kind !== 'heading')
                              .slice(0, 40)
                              .map((sym, i) => (
                                <div
                                  key={`${sym.line}-${i}`}
                                  className={`ecl-tree-item ${
                                    outlineSelection === sym.line ? 'active focused' : ''
                                  }`}
                                  style={{ paddingLeft: 44 }}
                                  onClick={() => {
                                    setOutlineSelection(sym.line);
                                    setCursorPos({ line: sym.line, col: 1 });
                                    setFocusedPane('bottom');
                                    setStatusMessage(`${activeEditor.path} : ${sym.line}`);
                                  }}
                                >
                                  <span
                                    className={`ecl-jdt-icon ${
                                      sym.kind === 'field' ? 'ecl-jdt-f' : 'ecl-jdt-m'
                                    }`}
                                  />
                                  <span className="ecl-tree-name">{sym.name}</span>
                                </div>
                              ))}
                          </div>
                        )
                      )}
                    </div>
                  </ViewChrome>
                </div>
              </>
            )}

            {!showBottom && !hideForMax('bottom') && (
              <div className="ecl-bottom-trim">
                {[
                  { id: 'problems', label: 'Problems' },
                  { id: 'javadoc', label: 'Javadoc' },
                  { id: 'declaration', label: 'Declaration' },
                  { id: 'search', label: 'Search' },
                  { id: 'console', label: 'Console' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className="ecl-bottom-trim-tab"
                    onClick={() => {
                      setShowBottom(true);
                      setBottomTab(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Outline sash + view */}
        {showOutline && !hideForMax('outline') && (
          <>
            {!isMax('outline') && (
              <div
                className="ecl-sash ecl-sash-v"
                onMouseDown={(e) => startResize(e, 'outline')}
                title="Resize"
              />
            )}
            <div
              className={`ecl-view ecl-outline-view ${isMax('outline') ? 'is-max' : ''}`}
              style={isMax('outline') ? undefined : { width: outlineWidth }}
            >
              <ViewChrome
                title="Outline"
                panel="outline"
                onHide={() => { setShowOutline(false); setMaximized(null); }}
              >
                <div className="ecl-view-toolbar">
                  <button
                    type="button"
                    className="ecl-mini-btn"
                    title="Collapse All"
                    onClick={() => {}}
                  >
                    ⊟
                  </button>
                </div>
                <div
                  className="ecl-view-content ecl-outline-content"
                  onMouseDown={() => setFocusedPane('outline')}
                >
                  {!activeEditor ? (
                    <div className="ecl-empty-view">
                      <p>An outline is not available.</p>
                      <p className="ecl-muted-note">Open a resource to see its structure.</p>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`ecl-tree-item ecl-project-root ${
                          outlineSelection == null ? 'active' : ''
                        } ${focusedPane === 'outline' && outlineSelection == null ? 'focused' : ''}`}
                        style={{ paddingLeft: 8 }}
                        onClick={() => {
                          setOutlineSelection(null);
                          setFocusedPane('outline');
                        }}
                      >
                        <span className="ecl-jdt-icon ecl-jdt-c" />
                        <span className="ecl-tree-name">{typeName}</span>
                      </div>
                      {outlineSymbols.map((sym, i) => {
                        const icon =
                          sym.kind === 'type'
                            ? 'ecl-jdt-c'
                            : sym.kind === 'iface'
                            ? 'ecl-jdt-i'
                            : sym.kind === 'field'
                            ? 'ecl-jdt-f'
                            : sym.kind === 'heading'
                            ? 'ecl-jdt-h'
                            : 'ecl-jdt-m';
                        return (
                          <div
                            key={`${sym.line}-${i}`}
                            className={`ecl-tree-item ecl-file ${
                              outlineSelection === sym.line ? 'active' : ''
                            } ${
                              focusedPane === 'outline' && outlineSelection === sym.line
                                ? 'focused'
                                : ''
                            }`}
                            style={{ paddingLeft: 22 }}
                            title={`Line ${sym.line}`}
                            onClick={() => {
                              setOutlineSelection(sym.line);
                              setCursorPos({ line: sym.line, col: 1 });
                              setFocusedPane('outline');
                              setStatusMessage(`${activeEditor.path} : ${sym.line}`);
                            }}
                          >
                            <span className={`ecl-jdt-icon ${icon}`} />
                            <span className="ecl-tree-name">{sym.name}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </ViewChrome>
            </div>
          </>
        )}

        {!showOutline && !hideForMax('outline') && (
          <button
            type="button"
            className="ecl-fastview ecl-fastview-right"
            title="Show Outline"
            onClick={() => setShowOutline(true)}
          >
            Outline
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="ecl-statusbar">
        <div className="ecl-status-left">
          <span className="ecl-status-item">{statusMessage}</span>
        </div>
        <div className="ecl-status-right">
          {channelReady && (
            <span className="ecl-status-item" title="Workspace">
              Java
            </span>
          )}
          {activeProject && (
            <span className="ecl-status-item">
              {fileCount} files · {activeProject.branch}
            </span>
          )}
          {activeEditor && !isImageEditor(activeEditor) && (
            <span className="ecl-status-item">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span className="ecl-status-item">Smart Insert</span>
          <span className="ecl-status-item">UTF-8</span>
          <span className="ecl-status-item">
            {activeEditor
              ? isImageEditor(activeEditor)
                ? (activeEditor.mime || 'image').replace(/^image\//, '').toUpperCase()
                : getLanguage(activeEditor.path).toUpperCase()
              : 'Text'}
          </span>
        </div>
      </div>

      {/* Open Project dialog */}
      {showOpenDialog && (
        <div className="ecl-modal-overlay" onClick={() => setShowOpenDialog(false)}>
          <div className="ecl-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="ecl-dialog-title">
              <span>Open Project</span>
              <button type="button" className="ecl-dialog-x" onClick={() => setShowOpenDialog(false)}>
                ×
              </button>
            </div>
            <div className="ecl-dialog-body">
              <label className="ecl-field-label" htmlFor="project-path">
                Project path
              </label>
              <input
                id="project-path"
                ref={dialogInputRef}
                type="text"
                className="ecl-field-input"
                placeholder="team/project"
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') loadProject();
                }}
                disabled={loading}
              />
              <p className="ecl-field-hint">
                Enter the workspace path in the form <strong>owner/name</strong>. Resources are loaded through the application server.
              </p>
              {error && <p className="ecl-field-error">{error}</p>}
            </div>
            <div className="ecl-dialog-footer">
              <button
                type="button"
                className="ecl-dialog-btn primary"
                onClick={() => loadProject()}
                disabled={loading}
              >
                {loading ? 'Opening…' : 'Open'}
              </button>
              <button
                type="button"
                className="ecl-dialog-btn"
                onClick={() => setShowOpenDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About dialog */}
      {showAbout && (
        <div className="ecl-modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="ecl-dialog ecl-about" onClick={(e) => e.stopPropagation()}>
            <div className="ecl-dialog-title">
              <span>About Eclipse IDE</span>
              <button type="button" className="ecl-dialog-x" onClick={() => setShowAbout(false)}>
                ×
              </button>
            </div>
            <div className="ecl-dialog-body ecl-about-body">
              <img
                className="ecl-welcome-logo-img small"
                src={`${process.env.PUBLIC_URL || ''}/logo192.png`}
                alt="Eclipse IDE"
                width={40}
                height={40}
              />
              <h2>Eclipse IDE for Enterprise Java and Web Developers</h2>
              <p>Version 2024-12 (4.34.0)</p>
              <p className="ecl-muted">Resource Workbench · Local workspace client</p>
            </div>
            <div className="ecl-dialog-footer">
              <button type="button" className="ecl-dialog-btn primary" onClick={() => setShowAbout(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowser;
