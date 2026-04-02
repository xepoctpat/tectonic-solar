# Deployment Guide

**Project**: Tectonic-Solar Space-Earth Monitor  
**Status**: Production-ready (MVP, Sprint 1-4 complete)  
**Stack**: Vanilla JavaScript ES modules, CDN-only dependencies, no build step  

---

## Pre-Flight Checklist

Before deploying to production, verify:

### Code Quality
- [ ] `npm run lint` or `eslint src/js/*.js` (if linter configured)
- [ ] No `console.log`, `debugger`, or `TODO` comments (or behind DEBUG flag)
- [ ] All `fetch()` calls use `fetchWithRetry()` wrapper
- [ ] No bare `import` statements (all use ES module syntax)
- [ ] `db.js` initialized before data is fetched (checked in main.js)

### Performance
- [ ] Chrome Lighthouse PWA ≥90, Performance ≥85, Accessibility ≥90
- [ ] Network waterfall: No render-blocking scripts
- [ ] Service Worker cache list complete (all static assets included)
- [ ] CSS-in-head, JS with `defer` attribute (if any external scripts)

### Browser Compatibility
- [ ] Tested in Chrome 120+, Firefox 115+, Safari 16+, Edge 120+
- [ ] Mobile responsive: 375px (iPhone), 768px (iPad), 1024px (desktop)
- [ ] Dark mode toggle works and persists
- [ ] Map tiles load on slow 3G network

### API Integration
- [ ] All APIs return valid data (test with recent earthquakes/storms)
- [ ] Fetch retry logic tested: simulate API timeout, verify exponential backoff
- [ ] Fallback demo data works when APIs down
- [ ] Rate limits respected (no more than 1 request per 5s per API)

### Data & Storage
- [ ] IndexedDB initialization in main.js before fetch calls
- [ ] 90-day pruning logic working (test: add record, wait 91 days mock time, check deleted)
- [ ] localStorage dark mode setting persists across reload
- [ ] No sensitive data in localStorage (API keys, tokens)

### Service Worker & PWA
- [ ] manifest.json JSON valid (use jsonlint)
- [ ] manifest links in index.html: `<link rel="manifest">` + `<meta name="theme-color">`
- [ ] PWA icons: 192px + 512px SVG files embedded in manifest
- [ ] Service Worker cache strategy tested offline
- [ ] Service Worker update flow working (new version prompts user)

### Security
- [ ] No inline JavaScript in HTML
- [ ] No hardcoded API keys in source
- [ ] CORS validation: all APIs support CORS (no JSONP needed)
- [ ] CSP headers (if deploying on custom server):
  ```
  Content-Security-Policy: 
    default-src 'self'; 
    script-src 'self' https://cdn.jsdelivr.net; 
    style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; 
    img-src 'self' https:; 
    manifest-src 'self';
  ```

---

## Deployment Options

### Option A: GitHub Pages (Recommended for quick setup)

**Pros**: Free, automatic HTTPS, GitHub Actions integration  
**Cons**: Static only (no backend), no custom domain features

#### Step 1: Create GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit: Sprint 1-4 MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tectonic-solar.git
git push -u origin main
```

#### Step 2: Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Source: Deploy from a branch
3. Branch: `main` / root folder
4. Save

**Result**: App live at `https://YOUR_USERNAME.github.io/tectonic-solar/`

#### Step 3: Update manifest.json

```json
{
  "start_url": "/tectonic-solar/",
  "scope": "/tectonic-solar/",
  ...
}
```

(Only needed if deploying to a subdirectory like `/tectonic-solar/`)

#### Step 4 (Optional): Add Custom Domain

1. Go to **Settings** → **Pages**
2. Custom domain: `www.tectonic-solar.com` (or your domain)
3. Add DNS record to your registrar pointing to GitHub Pages IP
4. GitHub will provision HTTPS automatically

### Option B: Netlify (Recommended for production)

**Pros**: Easier custom domain setup, better analytics, redirect rules, edge caching  
**Cons**: Free tier has usage limits (100GB/month traffic)

#### Step 1: Connect Repository

1. Go to [netlify.com](https://netlify.com)
2. Click "New site from Git"
3. Select GitHub, authorize, choose `tectonic-solar` repo
4. Build settings:
   - Build command: (leave empty — no build step)
   - Publish directory: `.` (root)

#### Step 2: Deploy Redirect Rules (netlify.toml)

Create `netlify.toml` in project root:

```toml
[[redirects]]
from = "/api/*"
to = "https://example-api.com/:splat"
status = 200

# Optional: cache rules
[[headers]]
[headers.values]
cache-control = "max-age=31536000"

[[headers]]
for = "*.html"
[headers.values]
cache-control = "max-age=3600"

[[headers]]
for = "manifest.json"
[headers.values]
cache-control = "max-age=3600"
```

#### Step 3: Deploy

```bash
git push  # Auto-deploys to Netlify on push
```

**Result**: App live at `https://tectonic-solar.netlify.app/` (or custom domain)

### Option C: Custom Server (Vercel, Azure, AWS, etc.)

**Pros**: Full control, custom backend if needed later  
**Cons**: Requires more configuration, may have costs

#### Vercel CLI Deploy

```bash
npm i -g vercel
vercel --prod
```

#### Docker + Cloud Run (future / optional)

Docker should be treated as a **future packaging path**, not the default way to run this repo locally.

If container support is added later, keep the architecture the same:

- **Node/Express remains the public entry point**
- the browser still talks only to Node routes
- the Python research sidecar remains **optional** and is best handled as a separate service/container when needed
- Docker should improve reproducibility, not quietly rewrite the runtime model

Minimal Node runtime container example:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
```

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/tectonic-solar
gcloud run deploy tectonic-solar --image gcr.io/PROJECT_ID/tectonic-solar --platform managed
```

If later you want containerized research mode, prefer a second optional container (or Compose service) for `python scripts/research_sidecar.py` rather than forcing every deployment to carry the Python lane.

---

## Post-Deployment

### 1. Verify Deployment

```bash
# Check homepage loads
curl -I https://YOUR_DEPLOYED_URL

# Check manifest loads
curl https://YOUR_DEPLOYED_URL/manifest.json | jq .

# Check Service Worker registered
curl https://YOUR_DEPLOYED_URL/sw.js | head -20

# Check CORS headers (API calls should work)
curl -I https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson
```

### 2. Lighthouse Audit

```bash
# Run Lighthouse CLI
npm install -g @lhci/cli@next lighthouse

lhci autorun --config-path=.lighthouserc.json
```

Create `.lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["https://YOUR_DEPLOYED_URL"],
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:pwa": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

### 3. Monitor for Errors

#### Sentry Integration (Error Tracking)

```javascript
// In main.js, add to top of file:
if (window.location.hostname !== 'localhost') {
  import('https://cdn.jsdelivr.net/npm/@sentry/tracing').then(() => {
    window.Sentry && window.Sentry.init({
      dsn: 'https://YOUR_SENTRY_KEY@sentry.io/YOUR_PROJECT_ID',
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    });
  });
}
```

#### Google Analytics

```javascript
// In index.html, add before </head>:
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID', {
    page_path: window.location.pathname,
  });
</script>
```

### 4. Set Up Status Page

Use [statuspage.io](https://statuspage.io) or [uptime.com](https://uptime.com) to monitor:
- USGS Earthquake API
- NOAA Space Weather APIs
- Open-Meteo API
- Your deployed app

### 5. Performance Monitoring

Add to `sw.js` to track response times:

```javascript
// In fetch event handler:
const start = performance.now();
fetch(event.request).then(response => {
  const duration = performance.now() - start;
  console.log(`${event.request.url}: ${duration.toFixed(0)}ms`);
  // Optional: send to analytics
  navigator.sendBeacon('/api/metrics', JSON.stringify({ url, duration }));
  return response;
});
```

---

## Continuous Deployment (CI/CD)

### GitHub Actions (Automatic Deploy to GitHub Pages)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          uploadArtifacts: true
          temporaryPublicStorage: true
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
          cname: www.tectonic-solar.com  # Optional: custom domain
```

### Netlify (Automatic Deploy on Push)

Creation `.github/workflows/netlify-deploy.yml`:

```yaml
name: Deploy to Netlify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          uploadArtifacts: true
      
      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v2
        with:
          publish-dir: './.'
          production-branch: main
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

---

## Rollback Plan

If deployment breaks:

### GitHub Pages
```bash
git revert HEAD  # Revert last commit
git push         # GitHub Pages auto-redeploys
```

### Netlify
1. Go to **Deploys** tab
2. Click on previous working deployment
3. Click "Publish deploy"

### Manual Backup
```bash
# Save working version before deployment
git tag v1.0.0-production
git push origin v1.0.0-production

# Later, checkout if needed
git checkout v1.0.0-production
git push -f origin HEAD:main  # Force redeploy
```

---

## Maintenance

### Weekly
- [ ] Check Lighthouse PWA score
- [ ] Check error logs (if using Sentry)
- [ ] Verify API endpoints accessible

### Monthly
- [ ] Review IndexedDB storage growth
- [ ] Check Service Worker cache size
- [ ] Run security audit: `npm audit`

### Quarterly
- [ ] Update CDN dependencies (Chart.js, Leaflet) to latest versions
- [ ] Review correlation research publications for accuracy
- [ ] Survey users for feature requests

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Service Worker not caching | Cache list outdated | Update cache name in `sw.js`, hard refresh (Ctrl+Shift+R) |
| Charts not rendering on dark mode | CSS variables not set | Check `.dark` class applied to `<html>` |
| IndexedDB quota exceeded | Too many records | Reduce 90-day window in `db.js`, manual cleanup |
| API timeout on slow network | Fetch timeout too short | Increase timeout in `utils.js` from 10s to 15s |
| PWA not installable | Missing manifest fields | Validate `manifest.json` with [Web App Manifest Validator](https://manifest-validator.appspot.com/) |

---

## Support

For issues or deployment questions:
1. Check [ROADMAP.md](ROADMAP.md)
2. Review [DEV-QUICK-REFERENCE.md](DEV-QUICK-REFERENCE.md)
3. Open GitHub issue with deployment details

---

**Last Updated**: March 24, 2026  
**Recommended Deployment**: GitHub Pages (simplest) or Netlify (most features)
