import '@fontsource-variable/libre-franklin/wght.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/form.css';
import './styles/plot.css';
import './styles/read.css';
import './styles/print.css';

import { enhanceFigures } from './lib/figures.js';

// Read mode: no entrance choreography; figures respond to their controls only.
enhanceFigures();
