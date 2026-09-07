/**
 * CRA dev-server proxy — forwards all /api requests to the FastAPI backend
 * so the frontend and backend share a single origin (cookies work, no CORS
 * needed). Active only in development; the production build is served by
 * nginx which has its own proxy config.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://backend:8001',
      changeOrigin: true,
    })
  );
};
