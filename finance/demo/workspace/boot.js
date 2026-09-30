// Primeiro script das páginas /demo: aplica tema, densidade, cor de destaque e
// estado da barra lateral antes do produto aparecer, sem piscar o tema claro.
import { applyAppearance, watchEnvironment } from './preferences.js';

applyAppearance();
watchEnvironment();
