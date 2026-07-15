import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Literata with optical-size + weight axes, upright and italic.
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
