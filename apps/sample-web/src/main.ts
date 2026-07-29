// S0.5 acceptance: a sample app consumes the PS-B design system.
// Importing @playfusion/ui registers all pf-* custom elements as a side effect;
// the tokens stylesheet provides the CSS custom properties they render against.
import '@playfusion/tokens/tokens.css';
import '@playfusion/ui';

const app = document.getElementById('app')!;
app.innerHTML = `
  <h1>PlayFusion PS-B</h1>
  <p>
    <pf-badge variant="active">Live</pf-badge>
    <pf-button variant="primary">Primary</pf-button>
  </p>
`;
