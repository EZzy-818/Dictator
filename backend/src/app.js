import express from 'express';
import cors from 'cors';

export function createApp(config) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      openaiConfigured: Boolean(config.openaiApiKey),
    });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
