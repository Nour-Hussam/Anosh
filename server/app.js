import path from 'node:path';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';

import { config, ROOT_DIR } from './config.js';
import { attachVisitor } from './middleware/visitor.js';
import { csrfTokenHandler } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { contentSecurityPolicy, extraSecurityHeaders, securityHeaders, staticAssetHeaders } from './middleware/securityHeaders.js';
import { apiNotFound, errorHandler, pageNotFound } from './middleware/errorHandler.js';
import { attachUser } from './middleware/auth.js';
import contentRoutes from './routes/content.js';
import leadRoutes from './routes/leads.js';
import adminRoutes from './routes/admin.js';
import { getSiteSettings } from './repositories/settings.js';
import { listDestinations } from './repositories/content.js';
import { listPackages } from './repositories/packages.js';
import { hashIp } from './utils/crypto.js';
import { clientIp } from './utils/http.js';
import logger from './utils/logger.js';

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/** API responses are never cached by browsers or proxies. */
const noStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
};
const ADMIN_DIR = path.join(PUBLIC_DIR, 'admin');

/** Clean URLs -> static pages (progressive enhancement: the .html files also work). */
const PAGES = {
  '/': 'index.html',
  '/destinations': 'destinations.html',
  '/destination/:slug': 'destination.html',
  '/packages': 'packages.html',
  '/trip/:slug': 'package.html',
  '/about': 'about.html',
  '/booking': 'booking.html',
  '/contact': 'contact.html',
  '/faq': 'faq.html',
  '/privacy': 'privacy.html',
};

export function createApp() {
  const app = express();

  requestLogger(app);
  app.disable('x-powered-by');
  app.disable('etag');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.set('json spaces', 0);

  /* ------------------------------ security ----------------------------- */
  app.use(securityHeaders);
  app.use(contentSecurityPolicy);
  app.use(extraSecurityHeaders);
  app.use(compression({ level: 6, threshold: 1024 }));
  app.use(cookieParser());
  app.use(attachVisitor);

  /* ------------------------------ health ------------------------------- */
  app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()), env: config.env });
  });

  /* -------------------------------- api -------------------------------- */
  const jsonParser = express.json({ limit: '32kb', strict: true });
  const formParser = express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 });

  app.use('/api', apiLimiter, jsonParser, formParser, attachUser, noStore);
  app.get('/api/csrf-token', csrfTokenHandler);
  app.use('/api/content', contentRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', apiNotFound);

  /* ------------------------------ sitemap ------------------------------ */
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(
      [`User-agent: *`, `Allow: /`, `Disallow: /admin`, `Disallow: /api`, ``, `Sitemap: ${config.baseUrl}/sitemap.xml`].join('\n')
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const urls = [
      { loc: '/', priority: '1.0' },
      { loc: '/destinations', priority: '0.9' },
      { loc: '/packages', priority: '0.9' },
      { loc: '/about', priority: '0.7' },
      { loc: '/booking', priority: '0.8' },
      { loc: '/contact', priority: '0.8' },
      { loc: '/faq', priority: '0.6' },
      { loc: '/privacy', priority: '0.3' },
    ];
    for (const dest of listDestinations()) urls.push({ loc: `/destination/${dest.slug}`, priority: '0.8' });
    for (const pkg of listPackages({ limit: 60 }).items) urls.push({ loc: `/trip/${pkg.slug}`, priority: '0.8' });

    const body = urls
      .map((u) => `  <url><loc>${escapeXml(config.baseUrl + u.loc)}</loc><priority>${u.priority}</priority></url>`)
      .join('\n');
    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  });

  /* ------------------------------- admin ------------------------------- */
  app.use('/admin', express.static(ADMIN_DIR, {
    index: ['index.html'],
    dotfiles: 'ignore',
    fallthrough: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  }));

  /* ------------------------------- static ------------------------------ */
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      dotfiles: 'ignore',
      fallthrough: true,
      maxAge: 0,
      setHeaders: (res, filePath) => {
        if (/\.(jpg|jpeg|png|webp|avif|svg|woff2?|ttf)$/i.test(filePath)) staticAssetHeaders(null, res, () => {});
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  /* -------------------------------- pages ------------------------------ */
  for (const [route, file] of Object.entries(PAGES)) {
    const filePath = path.join(PUBLIC_DIR, file);
    app.get(route, (req, res, next) => {
      res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) next(); // missing page -> friendly 404
      });
    });
  }

  app.use(pageNotFound);
  app.use(errorHandler);

  return app;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

/** Minimal structured access log (no personal data — IPs are hashed). */
function requestLogger(app) {
  app.use((req, res, next) => {
    if (req.path === '/healthz') return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const payload = {
        method: req.method,
        path: req.originalUrl.slice(0, 200),
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
        ip: hashIp(clientIp(req)),
      };
      if (res.statusCode >= 500) logger.error('http.request', payload);
      else if (res.statusCode >= 400) logger.warn('http.request', payload);
      else logger.debug('http.request', payload);
    });
    next();
  });
}

export { PUBLIC_DIR };
