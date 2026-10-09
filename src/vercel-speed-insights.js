import { injectSpeedInsights } from '@vercel/speed-insights';
import { sanitizeSpeedInsight } from '../lib/speed-insights-privacy.mjs';

injectSpeedInsights({ beforeSend: sanitizeSpeedInsight });
